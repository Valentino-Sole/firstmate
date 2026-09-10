#!/usr/bin/env bash
# Unit tests for requested vs effective model metadata and Herdr display strings.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# shellcheck source=/dev/null
. "$ROOT/bin/fm-backend.sh"
# shellcheck source=/dev/null
. "$ROOT/bin/fm-model-lib.sh"

TMP_ROOT=$(fm_test_tmproot fm-model-display)
STATE="$TMP_ROOT/state"
mkdir -p "$STATE"

write_meta() {
  cat > "$STATE/t1.meta" <<'EOF'
harness=claude
model=sonnet
requested_model=sonnet
effective_model=pending
effective_model_source=spawn-config
effort=high
herdr_pane_id=w9Y:p2
backend=herdr
EOF
}

test_exact_model_detection() {
  fm_model_id_is_exact claude-sonnet-5 || fail "claude-sonnet-5 should be exact"
  fm_model_id_is_exact sonnet && fail "sonnet alias must not count as exact"
  fm_model_id_is_exact cursor-grok-4.6-high || fail "cursor model id should be exact"
  pass "exact model detection rejects aliases and accepts API ids"
}

test_record_effective_and_history() {
  write_meta
  fm_model_record_effective "$STATE" t1 "$STATE/t1.meta" claude-sonnet-5 claude-transcript || fail "record effective"
  [ "$(fm_model_effective "$STATE/t1.meta")" = claude-sonnet-5 ] || fail "effective not stored"
  fm_model_record_effective "$STATE" t1 "$STATE/t1.meta" claude-opus-4 claude-transcript fallback || fail "record fallback"
  grep -q 'fallback' "$STATE/t1.model-history" || fail "history missing fallback tag"
  pass "effective model updates append model history on change"
}

test_display_compact_alias_mismatch() {
  write_meta
  fm_model_record_effective "$STATE" t1 "$STATE/t1.meta" claude-opus-4 claude-transcript fallback
  out=$(fm_model_display_compact "$STATE/t1.meta")
  printf '%s\n' "$out" | grep -q 'requested: sonnet' || fail "display should show requested mismatch: $out"
  pass "display compact marks alias requested vs exact effective mismatch"
}

test_display_compact_exact_mismatch() {
  write_meta
  fm_model_meta_upsert "$STATE/t1.meta" requested_model claude-sonnet-5
  fm_model_record_effective "$STATE" t1 "$STATE/t1.meta" claude-opus-4 claude-transcript fallback
  out=$(fm_model_display_compact "$STATE/t1.meta")
  printf '%s\n' "$out" | grep -q 'requested: claude-sonnet-5' || fail "display should show exact requested mismatch: $out"
  pass "display compact marks exact requested/effective mismatch"
}

test_alias_runtime_becomes_unknown() {
  write_meta
  fm_model_record_effective "$STATE" t1 "$STATE/t1.meta" sonnet claude-transcript
  [ "$(fm_model_effective "$STATE/t1.meta")" = UNKNOWN ] || fail "alias-only runtime must become UNKNOWN"
  pass "alias-only runtime evidence is stored as UNKNOWN"
}

test_relaunch_preserves_verified_effective() {
  write_meta
  fm_model_record_effective "$STATE" t1 "$STATE/t1.meta" claude-sonnet-5 claude-transcript
  IFS=$'\t' read -r eff src < <(fm_model_relaunch_effective "$STATE/t1.meta")
  [ "$eff" = claude-sonnet-5 ] || fail "relaunch should preserve verified effective: $eff"
  [ "$src" = claude-transcript ] || fail "relaunch should preserve source: $src"
  pass "relaunch keeps verified effective model and source"
}

test_relaunch_pending_stays_probeable() {
  write_meta
  IFS=$'\t' read -r eff src < <(fm_model_relaunch_effective "$STATE/t1.meta")
  [ "$eff" = pending ] || fail "pending effective should stay pending on relaunch: $eff"
  [ "$src" = spawn-config ] || fail "pending relaunch source should be spawn-config: $src"
  pass "relaunch leaves pending effective probeable"
}

test_source_label_distinguishes_grok_providers() {
  write_meta
  fm_model_meta_upsert "$STATE/t1.meta" harness cursor
  fm_model_record_effective "$STATE" t1 "$STATE/t1.meta" cursor-grok-4.6-high cursor-transcript
  out=$(fm_model_display_compact "$STATE/t1.meta")
  printf '%s\n' "$out" | grep -q '^Cursor · Grok · cursor-grok-4.6-high' \
    || fail "Cursor-hosted Grok must display as Cursor · Grok: $out"

  write_meta
  fm_model_meta_upsert "$STATE/t1.meta" harness pi
  fm_model_record_effective "$STATE" t1 "$STATE/t1.meta" xai/grok-4.6 pi-transcript
  out=$(fm_model_display_compact "$STATE/t1.meta")
  printf '%s\n' "$out" | grep -q '^xAI · Grok · xai/grok-4.6' \
    || fail "direct xAI Grok must display as xAI · Grok, not conflated with Cursor: $out"

  write_meta
  fm_model_record_effective "$STATE" t1 "$STATE/t1.meta" claude-sonnet-5 claude-transcript
  out=$(fm_model_display_compact "$STATE/t1.meta")
  printf '%s\n' "$out" | grep -q '^Anthropic · Claude · claude-sonnet-5' \
    || fail "direct Claude must display as Anthropic · Claude: $out"
  pass "display distinguishes Cursor Grok, direct xAI Grok, and Anthropic Claude sources"
}

test_sync_reprobes_after_exact_effective() {
  local fakebin fakehome sid session_dir meta
  fakebin=$(fm_fakebin "$TMP_ROOT/reprobe")
  fakehome="$TMP_ROOT/reprobe/home"
  sid=abc123
  session_dir="$fakehome/.claude/projects/reprobe-test"
  mkdir -p "$session_dir"
  meta="$STATE/t2.meta"
  cat > "$meta" <<EOF
harness=claude
model=sonnet
requested_model=sonnet
effective_model=claude-sonnet-5
effective_model_source=claude-transcript
effort=high
herdr_pane_id=fakepane
backend=herdr
EOF

  cat > "$fakebin/herdr" <<SH
#!/usr/bin/env bash
if [ "\$1" = pane ] && [ "\$2" = get ]; then
  printf '{"result":{"pane":{"agent_session":{"kind":"id","value":"$sid"}}}}\n'
  exit 0
fi
exit 0
SH
  chmod +x "$fakebin/herdr"

  printf '%s\n' '{"type":"assistant","message":{"role":"assistant","model":"claude-opus-4"}}' \
    > "$session_dir/$sid.jsonl"

  [ "$(fm_model_effective "$meta")" = claude-sonnet-5 ] \
    || fail "fixture should start already-exact before reprobe: $(fm_model_effective "$meta")"

  HOME="$fakehome" PATH="$fakebin:$PATH" "$ROOT/bin/fm-model-sync.sh" "$STATE" t2 --probe-only >/dev/null \
    || fail "sync probe-only failed"

  [ "$(fm_model_effective "$meta")" = claude-opus-4 ] \
    || fail "sync must re-probe and update an already-exact effective model: $(fm_model_effective "$meta")"
  grep -q 'claude-opus-4' "$STATE/t2.model-history" \
    || fail "model change after an exact effective model must still append history"
  pass "fm-model-sync.sh re-probes and updates a session that changed models after its first exact reading"
}

test_sync_serializes_concurrent_probes() {
  local fakebin fakehome sid session_dir meta pid pids=()
  fakebin=$(fm_fakebin "$TMP_ROOT/concurrent")
  fakehome="$TMP_ROOT/concurrent/home"
  sid=race1
  session_dir="$fakehome/.claude/projects/race-test"
  mkdir -p "$session_dir"
  meta="$STATE/t3.meta"
  cat > "$meta" <<EOF
harness=claude
model=sonnet
requested_model=sonnet
effective_model=pending
effective_model_source=spawn-config
effort=high
herdr_pane_id=fakepane
backend=herdr
EOF

  cat > "$fakebin/herdr" <<SH
#!/usr/bin/env bash
if [ "\$1" = pane ] && [ "\$2" = get ]; then
  printf '{"result":{"pane":{"agent_session":{"kind":"id","value":"$sid"}}}}\n'
  exit 0
fi
exit 0
SH
  chmod +x "$fakebin/herdr"
  printf '%s\n' '{"type":"assistant","message":{"role":"assistant","model":"claude-sonnet-5"}}' \
    > "$session_dir/$sid.jsonl"

  for _ in 1 2 3 4 5; do
    (HOME="$fakehome" PATH="$fakebin:$PATH" "$ROOT/bin/fm-model-sync.sh" "$STATE" t3 --probe-only >/dev/null 2>&1) &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do wait "$pid"; done

  [ "$(fm_model_effective "$meta")" = claude-sonnet-5 ] \
    || fail "concurrent probes should still converge on the verified model: $(fm_model_effective "$meta")"
  [ "$(awk -F= '{print $1}' "$meta" | sort | uniq -d | wc -l)" -eq 0 ] \
    || fail "concurrent unlocked writers must not duplicate meta keys"
  [ "$(grep -c 'claude-sonnet-5' "$STATE/t3.model-history" 2>/dev/null || echo 0)" -le 1 ] \
    || fail "concurrent probes must not duplicate the same history transition"
  pass "concurrent fm-model-sync.sh probes serialize instead of corrupting the meta file"
}

test_sync_probe_live_worker() {
  local live_meta=/home/vsole/vs-agent-workspace/state/checklisten-maat-einrichten.meta
  [ -f "$live_meta" ] || { pass "live worker probe skipped (no checklisten-maat meta)"; return 0; }
  out=$("$ROOT/bin/fm-model-sync.sh" /home/vsole/vs-agent-workspace/state checklisten-maat-einrichten --probe-only) || fail "live sync probe failed"
  printf '%s\n' "$out" | grep -q '^Requested Model: sonnet$' || fail "live requested missing: $out"
  printf '%s\n' "$out" | grep -q '^Effective Model: claude-sonnet-5$' || fail "live effective not verified: $out"
  pass "live sonnet worker verifies effective model claude-sonnet-5"
}

# OpenCode stores session timestamps as epoch MILLISECONDS, and the probe binds
# them to the task's spawn_epoch (epoch seconds). These fixtures use a fixed run
# start so "before" and "after" the current run are unambiguous.
OC_RUN_EPOCH=1789000000
OC_RUN_MS=$((OC_RUN_EPOCH * 1000))

write_opencode_meta() {  # <id> <worktree> [spawn-epoch]
  local id=$1 worktree=$2 epoch=${3:-$OC_RUN_EPOCH}
  cat > "$STATE/$id.meta" <<EOF
harness=opencode
model=sonnet
requested_model=sonnet
effective_model=pending
effective_model_source=spawn-config
effort=high
worktree=$worktree
spawn_epoch=$epoch
herdr_pane_id=fakepane
backend=herdr
EOF
}

# Mirrors OpenCode's own session table for the columns the probe reads.
write_opencode_db() {
  python3 - "$1" <<'PY'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute(
    """CREATE TABLE session (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      directory TEXT NOT NULL,
      model TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    )"""
)
con.commit()
con.close()
PY
}

insert_opencode_session() {  # <db> <id> <directory> <model-json> <time_updated> [time_created] [parent_id]
  python3 - "$1" "$2" "$3" "$4" "$5" "${6:-$5}" "${7:-}" <<'PY'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute(
    "INSERT INTO session (id, parent_id, directory, model, time_created, time_updated) "
    "VALUES (?, ?, ?, ?, ?, ?)",
    (sys.argv[2], sys.argv[7] or None, sys.argv[3], sys.argv[4],
     int(sys.argv[6]), int(sys.argv[5])),
)
con.commit()
con.close()
PY
}

run_opencode_probe() {  # <task-id> <db>
  local id=$1 db=$2 fakebin fakehome
  fakebin=$(fm_fakebin "$TMP_ROOT/oc-$id")
  fakehome="$TMP_ROOT/oc-$id/home"
  mkdir -p "$fakehome"
  cat > "$fakebin/herdr" <<'SH'
#!/usr/bin/env bash
exit 1
SH
  chmod +x "$fakebin/herdr"
  HOME="$fakehome" PATH="$fakebin:$PATH" OPENCODE_DB="$db" \
    "$ROOT/bin/fm-model-sync.sh" "$STATE" "$id" --probe-only
}

test_opencode_probe_unique_hit() {
  local id=oc-hit wt db
  wt="$TMP_ROOT/wt-hit"
  db="$TMP_ROOT/oc-hit.db"
  mkdir -p "$wt"
  write_opencode_db "$db"
  insert_opencode_session "$db" ses_old "$wt/other" \
    '{"id":"old-model","providerID":"opencode"}' $((OC_RUN_MS + 100))
  insert_opencode_session "$db" ses_hit "$wt" \
    '{"id":"nemotron-3.5-lightning-free","providerID":"opencode","variant":"default"}' $((OC_RUN_MS + 200))
  write_opencode_meta "$id" "$wt"
  run_opencode_probe "$id" "$db" >/dev/null || fail "opencode unique hit probe failed"
  [ "$(fm_model_effective "$STATE/$id.meta")" = opencode/nemotron-3.5-lightning-free ] \
    || fail "unique OpenCode session should record providerID/id, not requested_model: $(fm_model_effective "$STATE/$id.meta")"
  [ "$(fm_model_effective_source "$STATE/$id.meta")" = opencode-session ] \
    || fail "unique OpenCode session source should be opencode-session: $(fm_model_effective_source "$STATE/$id.meta")"
  pass "OpenCode probe records providerID/id from a unique matching session"
}

test_opencode_probe_multiple_sessions() {
  local newer_id=oc-multi-newer tie_id=oc-multi-tie wt db
  wt="$TMP_ROOT/wt-multi"
  db="$TMP_ROOT/oc-multi.db"
  mkdir -p "$wt"
  write_opencode_db "$db"
  insert_opencode_session "$db" ses_old "$wt" \
    '{"id":"older-model","providerID":"opencode"}' $((OC_RUN_MS + 100))
  insert_opencode_session "$db" ses_new "$wt" \
    '{"id":"newer-model","providerID":"opencode"}' $((OC_RUN_MS + 300))
  write_opencode_meta "$newer_id" "$wt"
  run_opencode_probe "$newer_id" "$db" >/dev/null || fail "opencode uniquely-newest probe failed"
  [ "$(fm_model_effective "$STATE/$newer_id.meta")" = opencode/newer-model ] \
    || fail "uniquely newest OpenCode session should win: $(fm_model_effective "$STATE/$newer_id.meta")"

  db="$TMP_ROOT/oc-multi-tie.db"
  write_opencode_db "$db"
  insert_opencode_session "$db" ses_a "$wt" \
    '{"id":"alpha-model","providerID":"opencode"}' $((OC_RUN_MS + 200))
  insert_opencode_session "$db" ses_b "$wt" \
    '{"id":"beta-model","providerID":"opencode"}' $((OC_RUN_MS + 200))
  write_opencode_meta "$tie_id" "$wt"
  run_opencode_probe "$tie_id" "$db" >/dev/null || true
  [ "$(fm_model_effective "$STATE/$tie_id.meta")" = pending ] \
    || fail "tied OpenCode sessions must stay pending, not requested_model: $(fm_model_effective "$STATE/$tie_id.meta")"
  pass "OpenCode probe keeps a unique newest session and stays pending on a timestamp tie"
}

test_opencode_probe_missing_db() {
  local id=oc-missing wt db
  wt="$TMP_ROOT/wt-missing"
  db="$TMP_ROOT/no-such-opencode.db"
  mkdir -p "$wt"
  write_opencode_meta "$id" "$wt"
  run_opencode_probe "$id" "$db" >/dev/null || true
  [ "$(fm_model_effective "$STATE/$id.meta")" = pending ] \
    || fail "missing OpenCode db must leave effective pending: $(fm_model_effective "$STATE/$id.meta")"
  pass "OpenCode probe stays pending when the session database is missing"
}

test_opencode_probe_invalid_json() {
  local id=oc-json wt db
  wt="$TMP_ROOT/wt-json"
  db="$TMP_ROOT/oc-json.db"
  mkdir -p "$wt"
  write_opencode_db "$db"
  insert_opencode_session "$db" ses_bad "$wt" '{"id":"broken"' $((OC_RUN_MS + 200))
  write_opencode_meta "$id" "$wt"
  run_opencode_probe "$id" "$db" >/dev/null || true
  [ "$(fm_model_effective "$STATE/$id.meta")" = pending ] \
    || fail "invalid OpenCode model JSON must stay pending: $(fm_model_effective "$STATE/$id.meta")"
  pass "OpenCode probe stays pending on invalid session model JSON"
}

test_opencode_probe_previous_run_session() {
  local id=oc-stale wt db
  wt="$TMP_ROOT/wt-stale"
  db="$TMP_ROOT/oc-stale.db"
  mkdir -p "$wt"
  write_opencode_db "$db"
  # A relaunch reuses the worktree, so the previous run's session row is still
  # the newest row for this directory until the new agent creates its own.
  insert_opencode_session "$db" ses_prev "$wt" \
    '{"id":"previous-run-model","providerID":"opencode"}' \
    $((OC_RUN_MS - 1000)) $((OC_RUN_MS - 5000))
  write_opencode_meta "$id" "$wt"
  run_opencode_probe "$id" "$db" >/dev/null || true
  [ "$(fm_model_effective "$STATE/$id.meta")" = pending ] \
    || fail "a previous run's session must not be reported as this run's model: $(fm_model_effective "$STATE/$id.meta")"
  [ ! -s "$(fm_model_history_file "$STATE" "$id")" ] \
    || fail "a previous run's session must not enter the model history"

  insert_opencode_session "$db" ses_current "$wt" \
    '{"id":"current-run-model","providerID":"opencode"}' \
    $((OC_RUN_MS + 2000)) $((OC_RUN_MS + 1000))
  run_opencode_probe "$id" "$db" >/dev/null || fail "current-run opencode probe failed"
  [ "$(fm_model_effective "$STATE/$id.meta")" = opencode/current-run-model ] \
    || fail "the session this run created should win: $(fm_model_effective "$STATE/$id.meta")"
  pass "OpenCode probe ignores a previous run's session and reports the current run's"
}

test_opencode_probe_child_session() {
  local id=oc-child wt db
  wt="$TMP_ROOT/wt-child"
  db="$TMP_ROOT/oc-child.db"
  mkdir -p "$wt"
  write_opencode_db "$db"
  # A subagent's child session inherits the parent's directory and can be the
  # newest row while the worker's own session is still the one that matters.
  insert_opencode_session "$db" ses_worker "$wt" \
    '{"id":"worker-model","providerID":"opencode"}' \
    $((OC_RUN_MS + 1000)) $((OC_RUN_MS + 500))
  insert_opencode_session "$db" ses_sub "$wt" \
    '{"id":"subagent-model","providerID":"opencode"}' \
    $((OC_RUN_MS + 9000)) $((OC_RUN_MS + 8000)) ses_worker
  write_opencode_meta "$id" "$wt"
  run_opencode_probe "$id" "$db" >/dev/null || fail "child-session opencode probe failed"
  [ "$(fm_model_effective "$STATE/$id.meta")" = opencode/worker-model ] \
    || fail "a subagent child session must not stand in for the worker: $(fm_model_effective "$STATE/$id.meta")"
  pass "OpenCode probe reports the worker session, not a newer subagent child session"
}

test_opencode_probe_foreign_directory() {
  local id=oc-foreign wt db
  wt="$TMP_ROOT/wt-foreign"
  db="$TMP_ROOT/oc-foreign.db"
  mkdir -p "$wt" "$TMP_ROOT/wt-other"
  write_opencode_db "$db"
  insert_opencode_session "$db" ses_other "$TMP_ROOT/wt-other" \
    '{"id":"other-model","providerID":"opencode"}' $((OC_RUN_MS + 400))
  write_opencode_meta "$id" "$wt"
  run_opencode_probe "$id" "$db" >/dev/null || true
  [ "$(fm_model_effective "$STATE/$id.meta")" = pending ] \
    || fail "foreign-directory OpenCode session must stay pending: $(fm_model_effective "$STATE/$id.meta")"
  pass "OpenCode probe stays pending when the only session is in another directory"
}

test_exact_model_detection
test_record_effective_and_history
test_display_compact_alias_mismatch
test_display_compact_exact_mismatch
test_alias_runtime_becomes_unknown
test_relaunch_preserves_verified_effective
test_relaunch_pending_stays_probeable
test_source_label_distinguishes_grok_providers
test_sync_reprobes_after_exact_effective
test_sync_serializes_concurrent_probes
test_sync_probe_live_worker
test_opencode_probe_unique_hit
test_opencode_probe_multiple_sessions
test_opencode_probe_missing_db
test_opencode_probe_invalid_json
test_opencode_probe_foreign_directory
test_opencode_probe_previous_run_session
test_opencode_probe_child_session
