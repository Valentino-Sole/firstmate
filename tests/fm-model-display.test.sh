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

test_sync_probe_live_worker() {
  local live_meta=/home/vsole/vs-agent-workspace/state/checklisten-maat-einrichten.meta
  [ -f "$live_meta" ] || { pass "live worker probe skipped (no checklisten-maat meta)"; return 0; }
  out=$("$ROOT/bin/fm-model-sync.sh" /home/vsole/vs-agent-workspace/state checklisten-maat-einrichten --probe-only) || fail "live sync probe failed"
  printf '%s\n' "$out" | grep -q '^Requested Model: sonnet$' || fail "live requested missing: $out"
  printf '%s\n' "$out" | grep -q '^Effective Model: claude-sonnet-5$' || fail "live effective not verified: $out"
  pass "live sonnet worker verifies effective model claude-sonnet-5"
}

test_exact_model_detection
test_record_effective_and_history
test_display_compact_alias_mismatch
test_display_compact_exact_mismatch
test_alias_runtime_becomes_unknown
test_relaunch_preserves_verified_effective
test_relaunch_pending_stays_probeable
test_sync_probe_live_worker
