#!/usr/bin/env bash
# Behavior tests for the per-adapter semantic busy-state wiring that
# bin/fm-spawn.sh installs under the contract owned by bin/fm-busy-lib.sh.
#
# These tests run the REAL fm-spawn against a fake tmux pane and an isolated
# git worktree, then drive the generated adapter artifact (the Pi extension,
# the OpenCode plugin) in a plain Node host, so the artifact, the real
# bin/fm-busy-event.sh writer, and the real classifier are exercised together
# with no live harness session.
set -u

# shellcheck source=tests/fixtures.sh
. "$(dirname "${BASH_SOURCE[0]}")/fixtures.sh"

# shellcheck source=/dev/null
. "$ROOT/bin/fm-busy-lib.sh"

TMP_ROOT=$(fm_test_tmproot fm-busy-adapter-wiring)

make_spawn_case() {  # <name> <harness> <id>
  local name=$1 harness=$2 id=$3 case_dir home proj wt fakebin
  case_dir="$TMP_ROOT/$name"
  home="$case_dir/home"
  proj="$case_dir/project"
  wt="$case_dir/wt"
  fakebin=$(make_spawn_fakebin "$case_dir/fake" pi opencode claude codex gemini)
  fm_test_spawn_home "$home" "$harness"
  fm_git_worktree "$proj" "$wt" "wt-$name"
  fm_test_spawn_brief "$home" "$id"
  printf '%s\n' "$case_dir|$home|$proj|$wt|$fakebin"
}

run_spawn() {  # <home> <wt> <fakebin> <spawn-args...>
  # Every case here is a ship spawn, which carries an explicit delivery contract
  # (AGENTS.md section 7); these tests are about busy-state wiring, so they pass a
  # fixed valid one.
  local home=$1 wt=$2 fakebin=$3
  shift 3
  GROK_HOME="$home/grok-home" \
    fm_test_run_spawn "$home" "$wt" "$fakebin" "$@" --mode no-mistakes --yolo off
}

read_case_record() {
  # shellcheck disable=SC2034 # CASE_DIR is part of the shared record shape
  IFS='|' read -r CASE_DIR HOME_DIR PROJ_DIR WT_DIR FAKEBIN_DIR <<EOF
$1
EOF
}

classify() {  # <harness> <id> <state-dir>
  fm_busy_classify tmux fake:w "$1" "$2" "$3"
}

# drive_pi_ext <ext-path> <mode>: load the generated Pi extension in a plain
# Node host and fire one lifecycle handler. Modes: agent-start, settle-idle,
# settle-continuing, turn-end.
drive_pi_ext() {
  EXT_PATH="$1" MODE="$2" node --input-type=module 2>&1 <<'EOF'
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(process.env.EXT_PATH).href);
const handlers = {};
mod.default({ on: (name, fn) => { handlers[name] = fn; } });
const ctx = { isIdle: () => process.env.MODE !== "settle-continuing" };
switch (process.env.MODE) {
  case "agent-start": await handlers["agent_start"]({}, ctx); break;
  case "settle-idle": await handlers["agent_settled"]({}, ctx); break;
  case "settle-continuing": await handlers["agent_settled"]({}, ctx); break;
  case "settle-then-start":
    await handlers["agent_settled"]({}, ctx);
    await handlers["agent_start"]({}, ctx);
    break;
  case "turn-end": await handlers["turn_end"]({}, ctx); break;
  default: throw new Error("unknown mode " + process.env.MODE);
}
if (process.env.MODE === "turn-end") {
  await new Promise((resolve) => setTimeout(resolve, 200));
}
EOF
}

test_pi_extension_semantic_lifecycle() {
  local rec id=busy-pi-1 out state ext
  rec=$(make_spawn_case pi-lifecycle pi "$id")
  read_case_record "$rec"
  out=$(run_spawn "$HOME_DIR" "$WT_DIR" "$FAKEBIN_DIR" "$id" "$PROJ_DIR")
  expect_code 0 $? "pi spawn should succeed: $out"
  state="$HOME_DIR/state"
  ext="$state/$id.pi-ext.ts"
  assert_present "$ext" "pi spawn did not write the per-task extension"

  out=$(classify pi "$id" "$state")
  [ "$out" = "busy fm-spawn" ] || fail "seed after spawn must be 'busy fm-spawn', got '$out'"

  rm -f "$state/$id.turn-ended"
  out=$(drive_pi_ext "$ext" turn-end) || fail "turn_end drive failed: $out"
  [ -f "$state/$id.turn-ended" ] || fail "turn_end no longer touches the notification marker"
  out=$(classify pi "$id" "$state")
  [ "$out" = "busy fm-spawn" ] || fail "turn_end must stay a notification, not a state edge, got '$out'"

  out=$(drive_pi_ext "$ext" settle-idle) || fail "agent_settled drive failed: $out"
  out=$(classify pi "$id" "$state")
  [ "$out" = "idle pi-ext" ] || fail "agent_settled with isIdle must classify 'idle pi-ext', got '$out'"

  out=$(drive_pi_ext "$ext" agent-start) || fail "agent_start drive failed: $out"
  out=$(classify pi "$id" "$state")
  [ "$out" = "busy pi-ext" ] || fail "agent_start must classify 'busy pi-ext', got '$out'"

  out=$(drive_pi_ext "$ext" settle-continuing) || fail "continuing settle drive failed: $out"
  out=$(classify pi "$id" "$state")
  [ "$out" = "busy pi-ext" ] || fail "a settle while another run continues must stay busy, got '$out'"

  out=$(drive_pi_ext "$ext" settle-idle) || fail "final settle drive failed: $out"
  out=$(classify pi "$id" "$state")
  [ "$out" = "idle pi-ext" ] || fail "the final settle must classify idle, got '$out'"
  pass "pi extension reports agent_start busy, settles idle only via ctx.isIdle(), and keeps turn_end a notification"
}

test_pi_extension_serializes_settle_before_next_start() {
  local rec id=busy-pi-order out state ext
  rec=$(make_spawn_case pi-order pi "$id")
  read_case_record "$rec"
  out=$(run_spawn "$HOME_DIR" "$WT_DIR" "$FAKEBIN_DIR" "$id" "$PROJ_DIR")
  expect_code 0 $? "pi spawn should succeed: $out"
  state="$HOME_DIR/state"
  ext="$state/$id.pi-ext.ts"

  out=$(drive_pi_ext "$ext" settle-then-start) || fail "settle/start drive failed: $out"
  out=$(classify pi "$id" "$state")
  [ "$out" = "busy pi-ext" ] || fail "a fresh agent_start after agent_settled must win, got '$out'"
  pass "pi extension awaits agent_settled before the next agent_start without a test delay"
}

test_pi_extension_stale_incarnation_rejected() {
  local rec id=busy-pi-2 out state ext
  rec=$(make_spawn_case pi-stale pi "$id")
  read_case_record "$rec"
  out=$(run_spawn "$HOME_DIR" "$WT_DIR" "$FAKEBIN_DIR" "$id" "$PROJ_DIR")
  expect_code 0 $? "pi spawn should succeed: $out"
  state="$HOME_DIR/state"
  ext="$state/$id.pi-ext.ts"
  # A re-arm (a rewired incarnation) supersedes the gen embedded in the old
  # extension file: its late events must be rejected and never change state.
  "$ROOT/bin/fm-busy-event.sh" arm "$state" "$id" >/dev/null
  out=$(drive_pi_ext "$ext" settle-idle) || fail "stale settle drive failed: $out"
  out=$(classify pi "$id" "$state")
  [ "$out" = "busy fm-spawn" ] || fail "a stale extension event must not change state, got '$out'"
  pass "pi extension events from a superseded incarnation are rejected as stale"
}

# drive_oc_plugin <plugin-path> <events-json-lines...>: load the generated
# OpenCode plugin in a plain Node host and feed it one event per argument, in
# order, through the same hooks.event entry OpenCode calls.
drive_oc_plugin() {
  local plugin=$1
  shift
  # The plugin now shells out to the real fm-model-sync.sh, whose OpenCode probe
  # falls back to $HOME's own opencode.db. Pin a sandbox path so a caller that
  # does not seed a database cannot reach the developer's real one.
  PLUGIN_PATH="$plugin" OPENCODE_DB="${OPENCODE_DB:-$TMP_ROOT/absent-opencode.db}" \
    node --input-type=module - "$@" 2>&1 <<'EOF'
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(process.env.PLUGIN_PATH).href);
const hooks = await mod.FmBusyState({});
for (const arg of process.argv.slice(2)) {
  await hooks.event({ event: JSON.parse(arg) });
}
EOF
}

oc_status() {  # <sessionID> <type>
  printf '{"type":"session.status","properties":{"sessionID":"%s","status":{"type":"%s"}}}' "$1" "$2"
}

oc_idle() {  # <sessionID>
  printf '{"type":"session.idle","properties":{"sessionID":"%s"}}' "$1"
}

test_opencode_plugin_semantic_lifecycle() {
  local rec id=busy-oc-1 out state plugin
  rec=$(make_spawn_case oc-lifecycle opencode "$id")
  read_case_record "$rec"
  out=$(run_spawn "$HOME_DIR" "$WT_DIR" "$FAKEBIN_DIR" "$id" "$PROJ_DIR")
  expect_code 0 $? "opencode spawn should succeed: $out"
  state="$HOME_DIR/state"
  plugin="$WT_DIR/.opencode/plugins/fm-busy-state.js"
  assert_present "$plugin" "opencode spawn did not write the busy-state plugin"

  out=$(classify opencode "$id" "$state")
  [ "$out" = "busy fm-spawn" ] || fail "seed after spawn must be 'busy fm-spawn', got '$out'"

  out=$(drive_oc_plugin "$plugin" "$(oc_status ses_main busy)") || fail "busy drive failed: $out"
  out=$(classify opencode "$id" "$state")
  [ "$out" = "busy opencode-plugin" ] || fail "session busy must classify 'busy opencode-plugin', got '$out'"

  out=$(drive_oc_plugin "$plugin" \
    "$(oc_status ses_main busy)" \
    "$(oc_status ses_child busy)" \
    "$(oc_status ses_child idle)") || fail "child-session drive failed: $out"
  out=$(classify opencode "$id" "$state")
  [ "$out" = "busy opencode-plugin" ] || fail "a child session's idle must not clear the worker, got '$out'"

  out=$(drive_oc_plugin "$plugin" \
    "$(oc_status ses_main retry)" \
    "$(oc_status ses_main idle)") || fail "retry/idle drive failed: $out"
  out=$(classify opencode "$id" "$state")
  [ "$out" = "idle opencode-plugin" ] || fail "the latched session's idle must classify idle, got '$out'"

  rm -f "$state/$id.turn-ended"
  out=$(drive_oc_plugin "$plugin" \
    "$(oc_status ses_main busy)" \
    "$(oc_idle ses_main)") || fail "session.idle drive failed: $out"
  [ -f "$state/$id.turn-ended" ] || fail "session.idle no longer touches the notification marker"
  out=$(classify opencode "$id" "$state")
  [ "$out" = "idle opencode-plugin" ] || fail "session.idle for the latched session must classify idle, got '$out'"

  rm -f "$state/$id.turn-ended"
  out=$(drive_oc_plugin "$plugin" \
    "$(oc_status ses2 busy)" \
    "$(oc_idle ses_other)") || fail "other-session idle drive failed: $out"
  [ -f "$state/$id.turn-ended" ] || fail "the marker touch must stay a notification for every session.idle"
  out=$(classify opencode "$id" "$state")
  [ "$out" = "busy opencode-plugin" ] || fail "another session's idle must not clear the latched busy, got '$out'"
  pass "opencode plugin classifies from session.status, scoped to the latched worker session"
}

meta_value() {  # <meta> <key>
  awk -F= -v k="$2" '$1 == k { sub(/^[^=]*=/, ""); print; exit }' "$1"
}

# The plugin fires its model sync without awaiting it, so a landed value is
# observed by polling rather than by the drive call returning.
await_meta_value() {  # <meta> <key> <expected>
  local waited=0
  while [ "$(meta_value "$1" "$2")" != "$3" ] && [ "$waited" -lt 150 ]; do
    sleep 0.1
    waited=$((waited + 1))
  done
  [ "$(meta_value "$1" "$2")" = "$3" ]
}

# seed_opencode_session <db> <directory> <time-ms>: build a stand-in for
# OpenCode's own store holding one session the current run created in
# <directory>, launched with a model that has not answered anything yet.
seed_opencode_session() {
  python3 - "$1" "$2" "$3" <<'EOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute(
    """CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      directory TEXT NOT NULL,
      model TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    )"""
)
con.execute(
    """CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL
    )"""
)
stamp = int(sys.argv[3])
con.execute(
    "INSERT INTO session (id, parent_id, directory, model, time_created, time_updated) "
    "VALUES ('ses_main', NULL, ?, ?, ?, ?)",
    (sys.argv[2], '{"id":"launch-flag-model","providerID":"opencode"}', stamp, stamp),
)
con.commit()
con.close()
EOF
}

# seed_opencode_answer <db> <providerID> <modelID> <time-ms>: record one
# assistant turn, the only evidence that a model actually answered.
seed_opencode_answer() {
  python3 - "$1" "$2" "$3" "$4" <<'EOF'
import json, sqlite3, sys
con = sqlite3.connect(sys.argv[1])
stamp = int(sys.argv[4])
con.execute(
    "INSERT INTO message (id, session_id, time_created, time_updated, data) "
    "VALUES (?, 'ses_main', ?, ?, ?)",
    (f"msg_{stamp}", stamp, stamp,
     json.dumps({"role": "assistant", "providerID": sys.argv[2], "modelID": sys.argv[3]})),
)
con.commit()
con.close()
EOF
}

test_opencode_plugin_syncs_effective_model() {
  local rec id=busy-oc-model out state plugin meta db epoch
  rec=$(make_spawn_case oc-model opencode "$id")
  read_case_record "$rec"
  out=$(run_spawn "$HOME_DIR" "$WT_DIR" "$FAKEBIN_DIR" "$id" "$PROJ_DIR")
  expect_code 0 $? "opencode spawn should succeed: $out"
  state="$HOME_DIR/state"
  meta="$state/$id.meta"
  plugin="$WT_DIR/.opencode/plugins/fm-busy-state.js"
  assert_present "$plugin" "opencode spawn did not write the busy-state plugin"

  epoch=$(meta_value "$meta" spawn_epoch)
  case "$epoch" in
    ''|*[!0-9]*) fail "opencode spawn did not record a numeric spawn_epoch: '$epoch'" ;;
  esac
  db="$CASE_DIR/opencode.db"
  # OpenCode only writes its session row once the agent is up, which is after
  # the spawn-time probe has already run: the spawn must therefore still be
  # pending here, and only a plugin event may verify the model.
  [ "$(meta_value "$meta" effective_model)" = pending ] \
    || fail "spawn-time probe should leave OpenCode pending, got '$(meta_value "$meta" effective_model)'"
  seed_opencode_session "$db" "$(meta_value "$meta" worktree)" "$((epoch * 1000 + 1500))"

  seed_opencode_answer "$db" opencode nemotron-3.5-lightning-free "$((epoch * 1000 + 2000))"
  out=$(OPENCODE_DB="$db" drive_oc_plugin "$plugin" "$(oc_status ses_main busy)") \
    || fail "opencode busy drive failed: $out"
  await_meta_value "$meta" effective_model opencode/nemotron-3.5-lightning-free \
    || fail "a latched session's busy event must verify the runtime model, got '$(meta_value "$meta" effective_model)'"
  [ "$(meta_value "$meta" effective_model_source)" = opencode-session ] \
    || fail "verified OpenCode model must record source opencode-session, got '$(meta_value "$meta" effective_model_source)'"

  # A mid-flight model switch must reach the metadata at the next turn boundary.
  seed_opencode_answer "$db" opencode ling-3.0-flash-fin-free "$((epoch * 1000 + 3000))"
  rm -f "$state/$id.turn-ended"
  out=$(OPENCODE_DB="$db" drive_oc_plugin "$plugin" \
    "$(oc_status ses_main busy)" "$(oc_idle ses_main)") \
    || fail "opencode idle drive failed: $out"
  [ -f "$state/$id.turn-ended" ] || fail "session.idle must still touch the notification marker"
  await_meta_value "$meta" effective_model opencode/ling-3.0-flash-fin-free \
    || fail "a later turn boundary must re-sync a mid-flight model switch, got '$(meta_value "$meta" effective_model)'"
  pass "opencode plugin verifies the runtime model on the latched session's turn boundaries"
}

test_opencode_plugin_turnend_touch_is_not_blocked_by_model_sync() {
  local rec id=busy-oc-touch out state plugin meta db epoch lock holder waited
  rec=$(make_spawn_case oc-touch opencode "$id")
  read_case_record "$rec"
  out=$(run_spawn "$HOME_DIR" "$WT_DIR" "$FAKEBIN_DIR" "$id" "$PROJ_DIR")
  expect_code 0 $? "opencode spawn should succeed: $out"
  state="$HOME_DIR/state"
  meta="$state/$id.meta"
  plugin="$WT_DIR/.opencode/plugins/fm-busy-state.js"
  epoch=$(meta_value "$meta" spawn_epoch)
  db="$CASE_DIR/opencode.db"
  seed_opencode_session "$db" "$(meta_value "$meta" worktree)" "$((epoch * 1000 + 1500))"
  seed_opencode_answer "$db" opencode nemotron-3.5-lightning-free "$((epoch * 1000 + 2000))"

  # fm-model-sync.sh waits on the per-task meta lock with no time limit, so a
  # live holder stalls every model sync. The watcher's wake notification must
  # not be stuck behind it.
  lock=$(FM_LOCK_PATH_ONLY=1 bash -c '. "$1/bin/fm-backend.sh"; . "$1/bin/fm-wake-lib.sh"; fm_meta_lock_path "$2"' _ "$ROOT" "$meta")
  [ -n "$lock" ] || fail "could not resolve the per-task meta lock path"
  bash -c '. "$1/bin/fm-backend.sh"; . "$1/bin/fm-wake-lib.sh"; fm_lock_acquire_wait "$2"; touch "$3"; sleep 30' \
    _ "$ROOT" "$lock" "$CASE_DIR/lock-held" &
  holder=$!
  waited=0
  while [ ! -f "$CASE_DIR/lock-held" ] && [ "$waited" -lt 100 ]; do
    sleep 0.1
    waited=$((waited + 1))
  done
  [ -f "$CASE_DIR/lock-held" ] || { kill "$holder" 2>/dev/null; fail "the meta lock holder never started"; }

  rm -f "$state/$id.turn-ended"
  OPENCODE_DB="$db" drive_oc_plugin "$plugin" \
    "$(oc_status ses_main busy)" "$(oc_idle ses_main)" >/dev/null 2>&1 &
  waited=0
  while [ ! -f "$state/$id.turn-ended" ] && [ "$waited" -lt 50 ]; do
    sleep 0.1
    waited=$((waited + 1))
  done
  if [ ! -f "$state/$id.turn-ended" ]; then
    kill "$holder" 2>/dev/null
    wait "$holder" 2>/dev/null
    fail "the turn-end notification was serialized behind the model sync's meta lock wait"
  fi
  kill "$holder" 2>/dev/null
  wait "$holder" 2>/dev/null
  wait 2>/dev/null
  pass "opencode session.idle notifies the watcher without waiting on the model sync"
}

run_claude_hook() {  # <settings.json> <hook-event>
  local cmd
  cmd=$(jq -r ".hooks[\"$2\"][0].hooks[0].command" "$1")
  [ -n "$cmd" ] && [ "$cmd" != null ] || fail "no $2 hook command in $1"
  sh -c "$cmd"
}

test_claude_hooks_semantic_lifecycle() {
  local rec id=busy-cl-1 out state settings
  rec=$(make_spawn_case claude-lifecycle claude "$id")
  read_case_record "$rec"
  out=$(run_spawn "$HOME_DIR" "$WT_DIR" "$FAKEBIN_DIR" "$id" "$PROJ_DIR")
  expect_code 0 $? "claude spawn should succeed: $out"
  state="$HOME_DIR/state"
  settings="$WT_DIR/.claude/settings.local.json"
  assert_present "$settings" "claude spawn did not write hook settings"
  jq -e . "$settings" >/dev/null || fail "claude hook settings are not valid JSON"
  for ev in UserPromptSubmit Stop StopFailure SessionEnd; do
    jq -e ".hooks[\"$ev\"]" "$settings" >/dev/null || fail "claude hook settings lack $ev"
  done

  out=$(classify claude "$id" "$state")
  [ "$out" = "busy fm-spawn" ] || fail "seed after spawn must be 'busy fm-spawn', got '$out'"

  rm -f "$state/$id.turn-ended"
  run_claude_hook "$settings" Stop || fail "Stop hook command failed"
  [ -f "$state/$id.turn-ended" ] || fail "Stop no longer touches the notification marker"
  out=$(classify claude "$id" "$state")
  [ "$out" = "idle claude-hook" ] || fail "Stop must classify 'idle claude-hook', got '$out'"

  run_claude_hook "$settings" UserPromptSubmit || fail "UserPromptSubmit hook command failed"
  out=$(classify claude "$id" "$state")
  [ "$out" = "busy claude-hook" ] || fail "UserPromptSubmit must classify 'busy claude-hook', got '$out'"

  run_claude_hook "$settings" StopFailure || fail "StopFailure hook command failed"
  out=$(classify claude "$id" "$state")
  [ "$out" = "idle claude-hook" ] || fail "StopFailure must classify idle so an API error cannot strand busy, got '$out'"

  run_claude_hook "$settings" UserPromptSubmit
  run_claude_hook "$settings" SessionEnd || fail "SessionEnd hook command failed"
  out=$(classify claude "$id" "$state")
  [ "$out" = "idle claude-hook" ] || fail "SessionEnd must classify idle, got '$out'"
  pass "claude hooks open on UserPromptSubmit and close on Stop, StopFailure, and SessionEnd"
}

test_claude_hooks_stale_incarnation_harmless() {
  local rec id=busy-cl-2 out state settings
  rec=$(make_spawn_case claude-stale claude "$id")
  read_case_record "$rec"
  out=$(run_spawn "$HOME_DIR" "$WT_DIR" "$FAKEBIN_DIR" "$id" "$PROJ_DIR")
  expect_code 0 $? "claude spawn should succeed: $out"
  state="$HOME_DIR/state"
  settings="$WT_DIR/.claude/settings.local.json"
  "$ROOT/bin/fm-busy-event.sh" arm "$state" "$id" >/dev/null
  run_claude_hook "$settings" UserPromptSubmit \
    || fail "a stale-gen hook must still exit 0 so Claude's lifecycle is never broken"
  out=$(classify claude "$id" "$state")
  [ "$out" = "busy fm-spawn" ] || fail "a stale-gen hook event must not change state, got '$out'"
  pass "claude hook events from a superseded incarnation are rejected without breaking the hook"
}

test_codex_unverified_until_a_semantic_source_exists() {
  local rec id=busy-cx-1 out state
  rec=$(make_spawn_case codex-unverified codex "$id")
  read_case_record "$rec"
  out=$(run_spawn "$HOME_DIR" "$WT_DIR" "$FAKEBIN_DIR" "$id" "$PROJ_DIR")
  expect_code 0 $? "codex spawn should succeed: $out"
  state="$HOME_DIR/state"
  assert_absent "$state/$id.busy-gen" "codex must not arm a busy contract with no verified semantic source"
  assert_absent "$WT_DIR/.codex/hooks.json" "codex must not install unverified busy hooks"
  assert_contains "$out" 'spawned '"$id"' harness=codex' "codex spawn did not complete normally"
  out=$(classify codex "$id" "$state")
  [ "$out" = "unknown codex-unverified" ] || fail "codex must classify 'unknown codex-unverified', got '$out'"
  out=$(fm_busy_classify tmux fake:w codex "$id" "$state" '• Working (6s • esc to interrupt)')
  [ "$out" = "unknown codex-unverified" ] || fail "codex must not fall back to footer text, got '$out'"
  pass "codex classifies unknown until a semantic source is verified, never idle or footer-matched"
}

# Gemini's hooks are PROJECT hooks in the worktree's own .gemini/settings.json,
# and gemini's hook contract requires each command to print a JSON object on
# stdout and nothing else, so these drive the real command and check both the
# classification and that stdout stays parseable JSON.
run_gemini_hook() {  # <settings.json> <hook-event>
  local cmd
  cmd=$(jq -r ".hooks[\"$2\"][0].hooks[0].command" "$1")
  [ -n "$cmd" ] && [ "$cmd" != null ] || fail "no $2 hook command in $1"
  sh -c "$cmd"
}

test_gemini_hooks_semantic_lifecycle() {
  local rec id=busy-gm-1 out state settings
  rec=$(make_spawn_case gemini-lifecycle gemini "$id")
  read_case_record "$rec"
  out=$(run_spawn "$HOME_DIR" "$WT_DIR" "$FAKEBIN_DIR" "$id" "$PROJ_DIR")
  expect_code 0 $? "gemini spawn should succeed: $out"
  state="$HOME_DIR/state"
  settings="$state/$id.gemini-settings.json"
  assert_present "$settings" "gemini spawn did not write hook settings"
  jq -e . "$settings" >/dev/null || fail "gemini hook settings are not valid JSON"
  for ev in BeforeAgent AfterAgent SessionEnd; do
    jq -e ".hooks[\"$ev\"]" "$settings" >/dev/null || fail "gemini hook settings lack $ev"
  done
  # The worktree's own .gemini/settings.json is the PROJECT's committed file;
  # firstmate must never write it, or a project's configuration is clobbered.
  assert_absent "$WT_DIR/.gemini/settings.json" \
    "gemini spawn must not write the project's own .gemini/settings.json"

  out=$(classify gemini "$id" "$state")
  [ "$out" = "busy fm-spawn" ] || fail "seed after spawn must be 'busy fm-spawn', got '$out'"

  rm -f "$state/$id.turn-ended"
  out=$(run_gemini_hook "$settings" AfterAgent) || fail "AfterAgent hook command failed"
  printf '%s' "$out" | jq -e . >/dev/null \
    || fail "AfterAgent must print only a JSON object on stdout, got '$out'"
  [ -f "$state/$id.turn-ended" ] || fail "AfterAgent no longer touches the notification marker"
  out=$(classify gemini "$id" "$state")
  [ "$out" = "idle gemini-hook" ] || fail "AfterAgent must classify 'idle gemini-hook', got '$out'"

  out=$(run_gemini_hook "$settings" BeforeAgent) || fail "BeforeAgent hook command failed"
  printf '%s' "$out" | jq -e . >/dev/null \
    || fail "BeforeAgent must print only a JSON object on stdout, got '$out'"
  out=$(classify gemini "$id" "$state")
  [ "$out" = "busy gemini-hook" ] || fail "BeforeAgent must classify 'busy gemini-hook', got '$out'"

  # SessionEnd fires TWICE for one /quit on gemini-cli 0.58.0, so the second
  # delivery must be a harmless no-op rather than a state change or a failure.
  run_gemini_hook "$settings" SessionEnd >/dev/null || fail "SessionEnd hook command failed"
  out=$(classify gemini "$id" "$state")
  [ "$out" = "idle gemini-hook" ] || fail "SessionEnd must classify idle, got '$out'"
  run_gemini_hook "$settings" SessionEnd >/dev/null || fail "a repeated SessionEnd must still exit 0"
  out=$(classify gemini "$id" "$state")
  [ "$out" = "idle gemini-hook" ] || fail "a repeated SessionEnd must stay idle, got '$out'"
  pass "gemini hooks open on BeforeAgent and close on AfterAgent and a repeated SessionEnd"
}

test_gemini_hooks_stale_incarnation_harmless() {
  local rec id=busy-gm-2 out state settings
  rec=$(make_spawn_case gemini-stale gemini "$id")
  read_case_record "$rec"
  out=$(run_spawn "$HOME_DIR" "$WT_DIR" "$FAKEBIN_DIR" "$id" "$PROJ_DIR")
  expect_code 0 $? "gemini spawn should succeed: $out"
  state="$HOME_DIR/state"
  settings="$state/$id.gemini-settings.json"
  "$ROOT/bin/fm-busy-event.sh" arm "$state" "$id" >/dev/null
  run_gemini_hook "$settings" BeforeAgent >/dev/null \
    || fail "a stale-gen hook must still exit 0 so gemini's lifecycle is never broken"
  out=$(classify gemini "$id" "$state")
  [ "$out" = "busy fm-spawn" ] || fail "a stale-gen hook event must not change state, got '$out'"
  pass "gemini hook events from a superseded incarnation are rejected without breaking the hook"
}

test_raw_gemini_launch_has_no_semantic_wiring() {
  local rec id=busy-gm-raw out state
  rec=$(make_spawn_case gemini-raw gemini "$id")
  read_case_record "$rec"
  out=$(run_spawn "$HOME_DIR" "$WT_DIR" "$FAKEBIN_DIR" "$id" "$PROJ_DIR" 'gemini --debug')
  expect_code 0 $? "raw gemini spawn should succeed: $out"
  state="$HOME_DIR/state"
  assert_absent "$state/$id.busy-gen" "raw gemini launch must not arm a busy generation"
  assert_absent "$state/$id.gemini-settings.json" "raw gemini launch must not write hook settings"
  out=$(classify gemini "$id" "$state")
  [ "$out" = "unknown missing" ] || fail "raw gemini launch must classify unknown, got '$out'"
  pass "raw gemini launch remains unwired and classifies unknown"
}

test_gemini_is_refused_as_a_secondmate() {
  local rec id=busy-gm-3 out
  rec=$(make_spawn_case gemini-secondmate gemini "$id")
  read_case_record "$rec"
  # A secondmate spawn carries no delivery contract, so this one deliberately
  # bypasses run_spawn's ship-only --mode/--yolo arguments.
  out=$(GROK_HOME="$HOME_DIR/grok-home" \
    fm_test_run_spawn "$HOME_DIR" "$WT_DIR" "$FAKEBIN_DIR" --secondmate "$id" gemini) && {
    fail "a gemini secondmate must be refused, it has no primary supervision protocol: $out"
  }
  assert_contains "$out" 'crewmate/scout adapter only' \
    "refusing a gemini secondmate must name the crewmate/scout boundary: $out"
  pass "gemini is refused as a secondmate because it has no primary supervision protocol"
}

test_kimi_and_grok_install_no_unverified_wiring() {
  local state out
  state="$TMP_ROOT/gates/state"
  mkdir -p "$state"
  [ -z "$(fm_busy_sources_for_harness kimi)" ] \
    || fail "standalone kimi must trust no semantic source until it is verified"
  [ -z "$(fm_busy_sources_for_harness grok)" ] \
    || fail "grok must trust no semantic source while its structured path is unverified"
  out=$(fm_busy_classify tmux fake:w kimi gate-k "$state" '🌒 · thinking')
  [ "$out" = "unknown kimi-unverified" ] || fail "kimi must classify unknown, not from its spinner, got '$out'"
  out=$(fm_busy_classify tmux fake:w grok gate-g "$state" 'Ctrl+c:cancel')
  [ "$out" = "busy grok-regex" ] || fail "grok must classify through its isolated fallback, got '$out'"
  pass "kimi and grok install no unverified semantic wiring and classify through their own gates"
}

test_pi_extension_semantic_lifecycle
test_pi_extension_serializes_settle_before_next_start
test_pi_extension_stale_incarnation_rejected
test_kimi_and_grok_install_no_unverified_wiring
test_opencode_plugin_semantic_lifecycle
test_opencode_plugin_syncs_effective_model
test_opencode_plugin_turnend_touch_is_not_blocked_by_model_sync
test_claude_hooks_semantic_lifecycle
test_claude_hooks_stale_incarnation_harmless
test_gemini_hooks_semantic_lifecycle
test_gemini_hooks_stale_incarnation_harmless
test_raw_gemini_launch_has_no_semantic_wiring
test_gemini_is_refused_as_a_secondmate
test_codex_unverified_until_a_semantic_source_exists

echo "all fm-busy-adapter-wiring tests passed"
