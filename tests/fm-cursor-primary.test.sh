#!/usr/bin/env bash
# Behavior tests for Cursor Agent CLI as a firstmate PRIMARY
# (docs/turnend-guard.md, docs/sessionstart-nudge.md,
# docs/supervision-protocols/cursor.md).
#
# Four layers, all hermetic over temp dirs with real processes and NO cursor
# installed, so CI enforces them everywhere:
#   HOST GUARD  - bin/fm-hook-host-lib.sh, and each tracked Claude-shaped hook
#                 entrypoint standing down on a Cursor-delivered payload, which
#                 is what keeps a Cursor primary from running every covered
#                 event twice.
#   PARK        - bin/fm-turnend-guard-cursor.sh, the stop-hook park: its
#                 follow-up sources, its double loop bound, its bounded repair
#                 nag, and its post-claim supersession contract.
#   SESSION     - bin/fm-sessionstart-cursor.sh, which injects the digest at
#                 sessionStart.
#
# The park runs as a child of a fake harness (a bash symlink named cursor-agent)
# whose pid holds the fixture home's session lock, so the real Cursor ancestry
# path in bin/fm-session-lock-lib.sh is exercised rather than stubbed.
# tests/fm-cursor-primary-live-e2e.test.sh is the opt-in guard against a real
# cursor-agent. Neither replaces the other.
# shellcheck disable=SC2016 # single quotes are deliberate: $FM_HOME expands inside the fake harness child
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TMP_ROOT=$(fm_test_tmproot fm-cursor-primary)
fm_git_identity fmtest fmtest@example.invalid

FAKEBIN=$(fm_fakebin "$TMP_ROOT/fakebin")
# Use a real executable whose own canonical basename is cursor-agent. A symlink
# to bash is not sufficient on Linux: /proc resolves it to bash, so the real
# Cursor ancestry classifier correctly rejects that process as an impostor.
CC_BIN=$(command -v cc 2>/dev/null || command -v gcc 2>/dev/null || true)
[ -n "$CC_BIN" ] || fail "a C compiler is required to build the fake Cursor process"
cat > "$TMP_ROOT/fake-cursor.c" <<'C'
#include <errno.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

int main(int argc, char **argv) {
  int status;
  pid_t child;
  if (argc != 3 || strcmp(argv[1], "-c") != 0) return 64;
  child = fork();
  if (child < 0) return 70;
  if (child == 0) {
    execl("/bin/bash", "bash", "-c", argv[2], (char *)0);
    _exit(127);
  }
  while (waitpid(child, &status, 0) < 0) {
    if (errno != EINTR) return 71;
  }
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return 72;
}
C
"$CC_BIN" -o "$FAKEBIN/cursor-agent" "$TMP_ROOT/fake-cursor.c" \
  || fail "could not build the fake Cursor process"
FAKE_CURSOR="$FAKEBIN/cursor-agent"

CURSOR_PAYLOAD='{"session_id":"sess-cursor","generation_id":"gen-1","loop_count":0,"status":"completed","hook_event_name":"stop","cursor_version":"2026.08.11-e8db854"}'
CLAUDE_STOP_PAYLOAD='{"session_id":"sess-claude","stop_hook_active":false}'

install_scripts() {
  local dir=$1 f
  mkdir -p "$dir/bin" "$dir/docs"
  for f in fm-turnend-guard-cursor.sh fm-turnend-guard.sh fm-sessionstart-cursor.sh \
           fm-sessionstart-run.sh fm-sessionstart-nudge.sh fm-arm-pretool-check.sh \
           fm-cd-pretool-check.sh fm-claude-stop-autoarm.sh fm-hook-host-lib.sh \
           fm-primary-scope-lib.sh fm-supervision-lib.sh fm-wake-lib.sh \
           fm-session-lock-lib.sh fm-cursor-lib.sh fm-cursor-compaction-lib.sh \
           fm-cursor-precompact.sh fm-cursor-after-agent-response.sh \
           fm-operational-input.sh \
           fm-supervision-instructions.sh fm-harness.sh fm-lock.sh \
           fm-gate-refuse-lib.sh; do
    cp "$ROOT/bin/$f" "$dir/bin/$f"
  done
  cp "$ROOT/bin/fm-arm-command-policy.mjs" "$dir/bin/fm-arm-command-policy.mjs"
  cp "$ROOT/bin/fm-cd-command-policy.mjs" "$dir/bin/fm-cd-command-policy.mjs"
  cp -R "$ROOT/docs/supervision-protocols" "$dir/docs/supervision-protocols"
  chmod +x "$dir"/bin/*.sh
}

make_primary_dir() {
  local dir=$1
  mkdir -p "$dir/state"
  git init -q "$dir"
  git -C "$dir" commit -q --allow-empty -m init
  : > "$dir/AGENTS.md"
  install_scripts "$dir"
  printf '%s\n' "$dir"
}

# One held follow-up object in the same wire form the park writes, built by the
# real operational-input encoder rather than a hand-copied prefix.
# A session of "unbounded" writes the record without its session and updated_at
# headers, i.e. an event with no owner and no lifetime at all.
hold_watcher_followup() {  # <dir> <body> [budget] [session] [age-seconds]
  local encoded session=${4:-sess-cursor}
  encoded=$(printf '%s' "$2" | "$ROOT/bin/fm-operational-input.sh" encode watcher) \
    || fail "could not encode the held follow-up fixture"
  {
    if [ "$session" != unbounded ]; then
      printf 'session=%s\n' "$session"
      printf 'updated_at=%s\n' "$(( $(date +%s) - ${5:-0} ))"
    fi
    printf 'budget=%s\n' "${3-}"
    jq -n --arg m "$encoded" '{followup_message:$m}'
  } > "$1/state/.cursor-compaction-held" \
    || fail "could not write the held follow-up fixture"
}

# The compaction mark is only active while it is fresh, so a fixture that wants
# an active window must stamp it with the current time the way preCompact does.
mark_compaction_active() {  # <dir>
  printf 'session=sess-cursor\nupdated_at=%s\n' "$(date +%s)" > "$1/state/.cursor-compaction"
}

# An arm fixture standing in for bin/fm-watch-arm.sh. Real process, real output.
write_arm_fixture() {  # <dir> <kind>
  local dir=$1 kind=$2
  case "$kind" in
    actionable)
      cat > "$dir/bin/fm-watch-arm.sh" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$$" >> "$FM_HOME/state/arm-ran"
printf 'watcher: started pid=%s (beacon fresh)\n' "$$"
printf 'stale: fixture-win needs a look\n'
exit 0
SH
      ;;
    failed)
      cat > "$dir/bin/fm-watch-arm.sh" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$$" >> "$FM_HOME/state/arm-ran"
printf 'watcher: FAILED - no live watcher with a fresh beacon\n'
exit 1
SH
      ;;
    switchable)
      # Slow until state/arm-fast appears, so a second invocation can be made
      # fast WITHOUT rewriting a script the first one is still executing.
      cat > "$dir/bin/fm-watch-arm.sh" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$$" >> "$FM_HOME/state/arm-ran"
if [ -e "$FM_HOME/state/arm-fast" ]; then
  printf 'stale: fixture-win fast\n'
  exit 0
fi
sleep 30
printf 'stale: fixture-win late\n'
exit 0
SH
      ;;
  esac
  chmod +x "$dir/bin/fm-watch-arm.sh"
}

# The park's child body: claim the home lock as this fake harness process, then
# run the adapter as its child, so the real Cursor ancestry path decides lock
# ownership on every platform. Keep the fake harness process alive: Linux
# changes the process identity when an exec reaches the adapter's shebang.
PARK_CHILD='
  printf "%s\n" "$$" > "$FM_HOME/state/.lock"
  "$FM_HOME/bin/fm-turnend-guard-cursor.sh"
'

# Run the park as a child of the fake cursor harness that holds the home lock.
# Clear PI_CODING_AGENT so a Pi host session running this suite cannot make the
# Cursor park stand down before the fixture under test is exercised.
park_payload() {  # [loop_count]
  local loop=${1:-0}
  printf '{"session_id":"sess-cursor","generation_id":"gen-%s","loop_count":%s,"status":"completed","hook_event_name":"stop","cursor_version":"2026.08.11-e8db854"}' "$loop" "$loop"
}

run_park() {  # <dir> [loop_count] [loop_ceiling]
  local dir=$1 loop=${2:-0} ceiling=${3:-} payload
  payload=$(park_payload "$loop")
  if [ -n "$ceiling" ]; then
    printf '%s' "$payload" | env -u PI_CODING_AGENT FM_HOME="$dir" FM_CURSOR_PARK_POLL=1 \
      FM_CURSOR_TURNEND_LOOP_CEILING="$ceiling" \
      FM_CURSOR_COMPACTION_WAIT_MAX="${FM_CURSOR_COMPACTION_WAIT_MAX:-180}" \
      FM_CURSOR_COMPACTION_MAX_AGE="${FM_CURSOR_COMPACTION_MAX_AGE:-180}" \
      "$FAKE_CURSOR" -c "$PARK_CHILD" 2>/dev/null
  else
    printf '%s' "$payload" | env -u PI_CODING_AGENT FM_HOME="$dir" FM_CURSOR_PARK_POLL=1 \
      FM_CURSOR_COMPACTION_WAIT_MAX="${FM_CURSOR_COMPACTION_WAIT_MAX:-180}" \
      FM_CURSOR_COMPACTION_MAX_AGE="${FM_CURSOR_COMPACTION_MAX_AGE:-180}" \
      "$FAKE_CURSOR" -c "$PARK_CHILD" 2>/dev/null
  fi
}

run_session() {  # <dir> <event> <source> [session-id]
  local dir=$1 event=$2 source=$3 session_id=${4:-sess-cursor} payload
  payload=$(printf '{"hook_event_name":"%s","session_id":"%s","cursor_version":"x"}' "$event" "$session_id")
  printf '%s' "$payload" | FM_HOME="$dir" FM_SESSION_SOURCE="$source" "$FAKE_CURSOR" -c '
    printf "%s\n" "$$" > "$FM_HOME/state/.lock"
    "$FM_HOME/bin/fm-sessionstart-cursor.sh" --source "$FM_SESSION_SOURCE"
  ' 2>/dev/null
}

followup_of() {  # <json>
  printf '%s' "$1" | jq -r '.followup_message // empty' 2>/dev/null
}

kind_of_followup() {  # <json> -> the operational kind
  local body
  body=$(followup_of "$1")
  [ -n "$body" ] || return 1
  printf '%s' "$body" | "$ROOT/bin/fm-operational-input.sh" kind
}

# --- HOST GUARD --------------------------------------------------------------

test_turnend_guard_stands_down_on_cursor_payload() {
  local dir out status
  dir=$(make_primary_dir "$TMP_ROOT/host-turnend")
  : > "$dir/state/task1.meta"
  out=$(printf '%s' "$CURSOR_PAYLOAD" | bash "$dir/bin/fm-turnend-guard.sh" 2>&1); status=$?
  expect_code 0 "$status" "a Cursor-delivered Stop payload must not block through the Claude-settings duplicate"
  [ -z "$out" ] || fail "duplicate entry produced output: $out"
  out=$(printf '%s' "$CURSOR_PAYLOAD" | bash "$dir/bin/fm-turnend-guard.sh" --cursor 2>&1); status=$?
  expect_code 2 "$status" "--cursor must let Cursor's own adapter reach the shared block decision"
  case "$out" in *'TURN WOULD END BLIND'*) ;; *) fail "expected the shared banner, got: $out" ;; esac
  pass "fm-turnend-guard: Cursor payload is inert without --cursor and blocks with it"
}

test_turnend_guard_still_blocks_for_claude_payload() {
  local dir status
  dir=$(make_primary_dir "$TMP_ROOT/host-claude")
  : > "$dir/state/task1.meta"
  printf '%s' "$CLAUDE_STOP_PAYLOAD" | bash "$dir/bin/fm-turnend-guard.sh" >/dev/null 2>&1
  status=$?
  expect_code 2 "$status" "the host guard must not disturb a genuine Claude Stop payload"
  pass "fm-turnend-guard: a non-Cursor payload keeps blocking"
}

test_autoarm_stands_down_on_cursor_payload() {
  local dir status
  dir=$(make_primary_dir "$TMP_ROOT/host-autoarm")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  printf '%s' "$CURSOR_PAYLOAD" | FM_HOME="$dir" "$FAKE_CURSOR" -c '
      printf "%s\n" "$$" > "$FM_HOME/state/.lock"
      exec "$FM_HOME/bin/fm-claude-stop-autoarm.sh"
    ' >/dev/null 2>&1
  status=$?
  expect_code 0 "$status" "the Claude auto-arm must stay inert under Cursor"
  [ ! -e "$dir/state/arm-ran" ] || fail "the Claude auto-arm armed under a Cursor payload; on Cursor it would run synchronously and hold the turn open for its multi-hour timeout"
  pass "fm-claude-stop-autoarm: inert on a Cursor-delivered payload"
}

test_sessionstart_run_stands_down_on_cursor_payload() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/host-sessionstart")
  cat > "$dir/bin/fm-session-start.sh" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$$" >> "$FM_HOME/state/digest-ran"
printf 'DIGEST BODY\n'
SH
  chmod +x "$dir/bin/fm-session-start.sh"
  out=$(printf '%s' "$CURSOR_PAYLOAD" | FM_HOME="$dir" bash "$dir/bin/fm-sessionstart-run.sh" 2>&1)
  [ -z "$out" ] || fail "the run wrapper emitted a digest for the Cursor duplicate: $out"
  [ ! -e "$dir/state/digest-ran" ] || fail "the run wrapper took the helm twice under Cursor"
  out=$(printf '{"source":"startup","session_id":"s"}' | FM_HOME="$dir" bash "$dir/bin/fm-sessionstart-run.sh" 2>&1)
  case "$out" in *'DIGEST BODY'*) ;; *) fail "a Claude-shaped payload must still run the digest, got: $out" ;; esac
  pass "fm-sessionstart-run: inert on a Cursor payload, unchanged otherwise"
}

test_pretool_guards_deduplicate_and_render_cursor_deny() {
  local dir payload out status decision
  dir=$(make_primary_dir "$TMP_ROOT/host-pretool")
  payload='{"tool_name":"Shell","tool_input":{"command":"bin/fm-watch-arm.sh &"},"cursor_version":"2026.08.11-e8db854"}'
  out=$(printf '%s' "$payload" | bash "$dir/bin/fm-arm-pretool-check.sh" 2>&1); status=$?
  expect_code 0 "$status" "the Claude-settings duplicate must allow under Cursor"
  [ -z "$out" ] || fail "duplicate pretool entry produced output: $out"

  out=$(printf '%s' "$payload" | bash "$dir/bin/fm-arm-pretool-check.sh" --cursor 2>/dev/null); status=$?
  expect_code 0 "$status" "Cursor reads the decision object, so the deny path exits 0"
  decision=$(printf '%s' "$out" | jq -r '.permission // empty' 2>/dev/null)
  [ "$decision" = deny ] || fail "expected a Cursor deny object on stdout, got: $out"
  printf '%s' "$out" | jq -e '.user_message | type == "string" and length > 0' >/dev/null 2>&1 \
    || fail "Cursor's deny object must carry a user_message reason, got: $out"
  pass "fm-arm-pretool-check: Cursor duplicate allows, --cursor denies in Cursor's own shape"
}

test_cd_guard_renders_cursor_deny() {
  local dir payload out decision
  dir=$(make_primary_dir "$TMP_ROOT/host-cd")
  payload='{"tool_name":"Shell","tool_input":{"command":"cd projects/example"},"cursor_version":"2026.08.11-e8db854"}'
  out=$(printf '%s' "$payload" | FM_HOME="$dir" bash "$dir/bin/fm-cd-pretool-check.sh" --cursor 2>/dev/null)
  decision=$(printf '%s' "$out" | jq -r '.permission // empty' 2>/dev/null)
  [ "$decision" = deny ] || fail "expected a Cursor deny object from the cd guard, got: $out"
  out=$(printf '%s' "$payload" | FM_HOME="$dir" bash "$dir/bin/fm-cd-pretool-check.sh" 2>&1)
  [ -z "$out" ] || fail "the cd guard's Claude-settings duplicate produced output under Cursor: $out"
  pass "fm-cd-pretool-check: Cursor duplicate allows, --cursor denies in Cursor's own shape"
}

# --- PARK --------------------------------------------------------------------

test_park_silent_when_nothing_in_flight() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/park-idle")
  write_arm_fixture "$dir" actionable
  out=$(run_park "$dir")
  [ -z "$out" ] || fail "the park emitted a follow-up with nothing in flight: $out"
  [ ! -e "$dir/state/arm-ran" ] || fail "the park armed with nothing to supervise"
  pass "cursor park: silent no-op when no supervision is needed"
}

test_park_delivers_actionable_wake_as_followup() {
  local dir out body
  dir=$(make_primary_dir "$TMP_ROOT/park-wake")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  out=$(run_park "$dir")
  [ -e "$dir/state/arm-ran" ] || fail "the park did not run the arm"
  [ "$(kind_of_followup "$out")" = watcher ] \
    || fail "an actionable close must arrive as a watcher-kind follow-up, got: $out"
  body=$(followup_of "$out")
  case "$body" in *'stale: fixture-win needs a look'*) ;; *) fail "the wake reason was not carried into the follow-up: $body" ;; esac
  case "$body" in *'fm-wake-drain.sh'*) ;; *) fail "the follow-up must tell the session to drain first: $body" ;; esac
  pass "cursor park: an actionable close is delivered as one watcher-kind follow-up"
}

test_park_never_exits_two() {
  local dir status
  dir=$(make_primary_dir "$TMP_ROOT/park-exit")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" failed
  run_park "$dir" >/dev/null; status=$?
  expect_code 0 "$status" "exit 2 is a silent no-op on Cursor's stop step, so the adapter must never use it"
  pass "cursor park: always exits 0, even when supervision is genuinely down"
}

test_park_repair_nag_is_bounded() {
  local dir out i kinds=0
  dir=$(make_primary_dir "$TMP_ROOT/park-nag")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" failed
  for i in 1 2 3; do
    out=$(run_park "$dir")
    [ "$(kind_of_followup "$out")" = turn-end-guard ] \
      || fail "nag $i should be a turn-end-guard follow-up, got: $out"
    kinds=$((kinds + 1))
  done
  out=$(run_park "$dir")
  [ -z "$out" ] || fail "the repair nag must stop after its budget, got a 4th: $out"
  [ "$kinds" -eq 3 ] || fail "expected exactly 3 bounded nags, saw $kinds"
  pass "cursor park: the repair nag is bounded and then goes quiet"
}

test_park_repair_nag_requires_a_persisted_budget() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/park-nag-write-failure")
  : > "$dir/state/task1.meta"
  mkdir "$dir/state/.turnend-cursor-blocks"
  write_arm_fixture "$dir" failed
  out=$(run_park "$dir")
  [ -z "$out" ] || fail "a repair nag without a persisted budget increment must fail open: $out"
  [ -z "$(find "$dir/state/.turnend-cursor-blocks" -mindepth 1 -print -quit 2>/dev/null)" ] \
    || fail "the failed budget commit left partial state"
  pass "cursor park: a repair nag is emitted only after its budget persists"
}

test_park_nag_budget_resets_after_a_real_wake() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/park-nag-reset")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" failed
  run_park "$dir" >/dev/null
  run_park "$dir" >/dev/null
  write_arm_fixture "$dir" actionable
  out=$(run_park "$dir")
  [ "$(kind_of_followup "$out")" = watcher ] || fail "expected a real wake, got: $out"
  write_arm_fixture "$dir" failed
  out=$(run_park "$dir")
  [ "$(kind_of_followup "$out")" = turn-end-guard ] \
    || fail "a productive wake must reset the nag budget, got: $out"
  pass "cursor park: a delivered wake resets the bounded repair budget"
}

test_park_loop_ceiling_warns_once_then_goes_quiet() {
  local dir out body
  dir=$(make_primary_dir "$TMP_ROOT/park-ceiling")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  out=$(run_park "$dir" 5 5)
  body=$(followup_of "$out")
  case "$body" in *'CEILING REACHED'*) ;; *) fail "at the ceiling the session must be told once, got: $out" ;; esac
  [ ! -e "$dir/state/arm-ran" ] || fail "the park must not arm at the loop ceiling"
  out=$(run_park "$dir" 6 5)
  [ -z "$out" ] || fail "above the ceiling the adapter must be silent, got: $out"
  pass "cursor park: the loop_count ceiling warns exactly once, then stops the loop"
}



test_park_stands_down_when_superseded() {
  local dir first_out first_pid marker
  dir=$(make_primary_dir "$TMP_ROOT/park-supersede")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" switchable
  marker="$dir/state/first-park-out"
  ( run_park "$dir" > "$marker" 2>/dev/null ) &
  first_pid=$!
  local waited=0
  while [ ! -s "$dir/state/.cursor-park-owner" ] || [ ! -e "$dir/state/arm-ran" ]; do
    sleep 0.2
    waited=$((waited + 1))
    [ "$waited" -lt 100 ] || fail "the first park never claimed ownership"
  done
  : > "$dir/state/arm-fast"
  run_park "$dir" >/dev/null 2>&1
  wait "$first_pid" 2>/dev/null || true
  first_out=$(cat "$marker" 2>/dev/null || true)
  [ -z "$first_out" ] || fail "the older park delivered after the newer stop claimed the baton: $first_out"
  pass "cursor park: an older park stands down after a newer stop claim"
}

test_park_serializes_supersession_with_followup_commit() {
  local dir first_pid first_out second_out waited budget_count
  dir=$(make_primary_dir "$TMP_ROOT/park-commit-race")
  : > "$dir/state/task1.meta"
  printf 'session=sess-cursor\ncount=1\n' > "$dir/state/.turnend-cursor-blocks"
  write_arm_fixture "$dir" actionable
  cat >> "$dir/bin/fm-operational-input.sh" <<'SH'
fm_operational_input_encode() {
  local kind=${1-} body=${2-} result_var=${3-}
  [ -n "$result_var" ] && fm_operational_kind_is_current "$kind" && [ -n "$body" ] || return 2
  if ( set -C; : > "$FM_HOME/state/commit-entered" ) 2>/dev/null; then
    while [ ! -e "$FM_HOME/state/commit-release" ]; do sleep 0.05; done
  fi
  printf -v "$result_var" '%s%s: %s' "$FM_OPERATIONAL_HEADER_PREFIX" "$kind" "$body"
}
SH
  ( run_park "$dir" > "$dir/state/first-out" ) &
  first_pid=$!
  waited=0
  while [ ! -e "$dir/state/commit-entered" ]; do
    sleep 0.05
    waited=$((waited + 1))
    [ "$waited" -lt 200 ] || fail "the first park never entered follow-up preparation"
  done
  write_arm_fixture "$dir" failed
  second_out=$(run_park "$dir")
  : > "$dir/state/commit-release"
  wait "$first_pid" 2>/dev/null || true
  first_out=$(cat "$dir/state/first-out" 2>/dev/null || true)
  [ -z "$first_out" ] || fail "the older park emitted after a newer stop arrived: $first_out"
  [ "$(kind_of_followup "$second_out")" = turn-end-guard ] \
    || fail "the newest park did not own the follow-up: $second_out"
  budget_count=$(sed -n '2s/^count=//p' "$dir/state/.turnend-cursor-blocks" 2>/dev/null || true)
  [ "$budget_count" = 2 ] \
    || fail "the superseded actionable park reset shared nag state: $budget_count"
  pass "cursor park: the newest stop exclusively owns a concurrent commit"
}

test_superseded_park_does_not_consume_nag_budget() {
  local dir first_pid second_out waited budget_count
  dir=$(make_primary_dir "$TMP_ROOT/park-nag-supersede")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" failed
  cat > "$dir/bin/fm-turnend-guard.sh" <<'SH'
#!/usr/bin/env bash
if ( set -C; : > "$FM_HOME/state/first-guard-entered" ) 2>/dev/null; then
  while [ ! -e "$FM_HOME/state/first-guard-release" ]; do sleep 0.05; done
fi
printf 'fixture supervision failure\n' >&2
exit 2
SH
  chmod +x "$dir/bin/fm-turnend-guard.sh"
  ( run_park "$dir" > "$dir/state/first-nag-out" ) &
  first_pid=$!
  waited=0
  while [ ! -e "$dir/state/first-guard-entered" ]; do
    sleep 0.05
    waited=$((waited + 1))
    [ "$waited" -lt 200 ] || fail "the first park never reached the guard decision"
  done
  second_out=$(run_park "$dir")
  : > "$dir/state/first-guard-release"
  wait "$first_pid" 2>/dev/null || true
  [ "$(kind_of_followup "$second_out")" = turn-end-guard ] \
    || fail "the current park did not deliver its repair nag: $second_out"
  [ ! -s "$dir/state/first-nag-out" ] \
    || fail "the superseded park delivered a stale repair nag"
  budget_count=$(sed -n '2s/^count=//p' "$dir/state/.turnend-cursor-blocks" 2>/dev/null || true)
  [ "$budget_count" = 1 ] \
    || fail "the superseded park consumed the current park's nag budget: $budget_count"
  pass "cursor park: a superseded park cannot consume repair budget"
}

test_park_inert_when_afk() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/park-afk")
  : > "$dir/state/task1.meta"
  : > "$dir/state/.afk"
  write_arm_fixture "$dir" actionable
  out=$(run_park "$dir")
  [ -z "$out" ] || fail "away mode owns supervision; the park must not wake the primary: $out"
  [ ! -e "$dir/state/arm-ran" ] || fail "the park armed while the away daemon owns the watcher"
  pass "cursor park: inert while away mode is active"
}

test_park_inert_under_pi_coding_agent() {
  local dir out payload
  dir=$(make_primary_dir "$TMP_ROOT/park-pi-host")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  payload=$(printf '{"session_id":"sess-cursor","generation_id":"gen-0","loop_count":0,"status":"completed","hook_event_name":"stop","cursor_version":"2026.08.11-e8db854"}')
  # No Cursor identity markers: Pi host alone must stand the park down.
  out=$(printf '%s' "$payload" | env -u CURSOR_AGENT -u CURSOR_INVOKED_AS \
    FM_HOME="$dir" PI_CODING_AGENT=true FM_CURSOR_PARK_POLL=1 \
    "$FAKE_CURSOR" -c "$PARK_CHILD" 2>/dev/null)
  [ -z "$out" ] || fail "Pi-hosted Cursor SDK must not park or wake: $out"
  [ ! -e "$dir/state/arm-ran" ] || fail "the park armed under PI_CODING_AGENT=true"
  pass "cursor park: inert when PI_CODING_AGENT marks a Pi host session"
}

test_park_still_parks_with_pi_leak_and_cursor_identity() {
  local dir out body payload
  dir=$(make_primary_dir "$TMP_ROOT/park-pi-leak-cursor")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  payload=$(printf '{"session_id":"sess-cursor","generation_id":"gen-0","loop_count":0,"status":"completed","hook_event_name":"stop","cursor_version":"2026.08.11-e8db854"}')
  # Hand-started cursor-agent may inherit PI_CODING_AGENT; Cursor identity wins.
  out=$(printf '%s' "$payload" | env -u CURSOR_INVOKED_AS \
    FM_HOME="$dir" PI_CODING_AGENT=true CURSOR_AGENT=1 FM_CURSOR_PARK_POLL=1 \
    "$FAKE_CURSOR" -c "$PARK_CHILD" 2>/dev/null)
  [ -e "$dir/state/arm-ran" ] || fail "CURSOR_AGENT must still park despite PI_CODING_AGENT leak"
  [ "$(kind_of_followup "$out")" = watcher ] \
    || fail "CURSOR_AGENT park must deliver the wake despite PI leak: $out"
  body=$(followup_of "$out")
  case "$body" in *'stale: fixture-win needs a look'*) ;; *) fail "CURSOR_AGENT wake reason missing: $body" ;; esac
  rm -f "$dir/state/arm-ran"
  out=$(printf '%s' "$payload" | env -u CURSOR_AGENT \
    FM_HOME="$dir" PI_CODING_AGENT=true CURSOR_INVOKED_AS=cursor-agent FM_CURSOR_PARK_POLL=1 \
    "$FAKE_CURSOR" -c "$PARK_CHILD" 2>/dev/null)
  [ -e "$dir/state/arm-ran" ] || fail "CURSOR_INVOKED_AS must still park despite PI_CODING_AGENT leak"
  [ "$(kind_of_followup "$out")" = watcher ] \
    || fail "CURSOR_INVOKED_AS park must deliver the wake despite PI leak: $out"
  pass "cursor park: parks when PI_CODING_AGENT leaks alongside Cursor identity"
}

test_park_stands_down_when_away_mode_activates_before_commit() {
  local dir park_pid out waited budget_count
  dir=$(make_primary_dir "$TMP_ROOT/park-afk-transition")
  : > "$dir/state/task1.meta"
  printf 'session=sess-cursor\ncount=1\n' > "$dir/state/.turnend-cursor-blocks"
  write_arm_fixture "$dir" actionable
  cat >> "$dir/bin/fm-operational-input.sh" <<'SH'
fm_operational_input_encode() {
  local kind=${1-} body=${2-} result_var=${3-}
  [ -n "$result_var" ] && fm_operational_kind_is_current "$kind" && [ -n "$body" ] || return 2
  : > "$FM_HOME/state/afk-commit-entered"
  while [ ! -e "$FM_HOME/state/afk-commit-release" ]; do sleep 0.05; done
  printf -v "$result_var" '%s%s: %s' "$FM_OPERATIONAL_HEADER_PREFIX" "$kind" "$body"
}
SH
  ( run_park "$dir" > "$dir/state/afk-transition-out" ) &
  park_pid=$!
  waited=0
  while [ ! -e "$dir/state/afk-commit-entered" ]; do
    sleep 0.05
    waited=$((waited + 1))
    [ "$waited" -lt 200 ] || fail "the park never reached follow-up preparation"
  done
  : > "$dir/state/.afk"
  : > "$dir/state/afk-commit-release"
  wait "$park_pid" 2>/dev/null || true
  out=$(cat "$dir/state/afk-transition-out" 2>/dev/null || true)
  [ -z "$out" ] || fail "the park emitted after away mode activated: $out"
  budget_count=$(sed -n '2s/^count=//p' "$dir/state/.turnend-cursor-blocks" 2>/dev/null || true)
  [ "$budget_count" = 1 ] || fail "the park reset nag state after away mode activated: $budget_count"
  pass "cursor park: an away-mode transition wins before follow-up commit"
}

test_park_inert_without_session_lock() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/park-nolock")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  out=$(printf '%s' "$CURSOR_PAYLOAD" | env -u PI_CODING_AGENT FM_HOME="$dir" bash "$dir/bin/fm-turnend-guard-cursor.sh" 2>/dev/null)
  [ -z "$out" ] || fail "a session that does not hold the home lock must not arm or wake: $out"
  [ ! -e "$dir/state/arm-ran" ] || fail "the park armed without owning the session lock"
  pass "cursor park: inert when this session does not hold the home lock"
}

test_park_stands_down_after_session_takeover() {
  local dir park_pid out waited budget_count
  dir=$(make_primary_dir "$TMP_ROOT/park-session-takeover")
  : > "$dir/state/task1.meta"
  printf 'session=sess-cursor\ncount=1\n' > "$dir/state/.turnend-cursor-blocks"
  write_arm_fixture "$dir" switchable
  ( run_park "$dir" > "$dir/state/takeover-out" ) &
  park_pid=$!
  waited=0
  while [ ! -e "$dir/state/arm-ran" ]; do
    sleep 0.05
    waited=$((waited + 1))
    [ "$waited" -lt 200 ] || fail "the park never began polling before takeover"
  done
  printf '%s\n' "$$" > "$dir/state/.lock"
  wait "$park_pid" 2>/dev/null || true
  out=$(cat "$dir/state/takeover-out" 2>/dev/null || true)
  [ -z "$out" ] || fail "the replaced session emitted a follow-up after takeover: $out"
  budget_count=$(sed -n '2s/^count=//p' "$dir/state/.turnend-cursor-blocks" 2>/dev/null || true)
  [ "$budget_count" = 1 ] || fail "the replaced session mutated nag state after takeover: $budget_count"
  pass "cursor park: session takeover stops polling without output or state mutation"
}

test_park_inert_in_child_worktree() {
  local base child out
  base=$(make_primary_dir "$TMP_ROOT/park-base")
  child="$TMP_ROOT/park-child"
  fm_git_worktree "$base" "$child" fm/cursor-park-child
  mkdir -p "$child/state"
  : > "$child/AGENTS.md"
  install_scripts "$child"
  : > "$child/state/task1.meta"
  write_arm_fixture "$child" actionable
  out=$(run_park "$child")
  [ -z "$out" ] || fail "a crewmate worktree must stay outside primary scope: $out"
  pass "cursor park: inert inside a child crewmate worktree"
}

# Spawned crew/scout sessions can inherit the parent primary's FM_ROOT_OVERRIDE
# and FM_HOME. The adapter must still scope to the checkout it runs from;
# otherwise it parks the child against the PARENT's state on every stop.
test_park_inert_in_child_worktree_with_inherited_primary_env() {
  local base child out
  base=$(make_primary_dir "$TMP_ROOT/park-env-leak-base")
  : > "$base/state/task1.meta"
  write_arm_fixture "$base" actionable
  child="$TMP_ROOT/park-env-leak-child"
  fm_git_worktree "$base" "$child" fm/cursor-park-env-leak-child
  mkdir -p "$child/state"
  : > "$child/AGENTS.md"
  install_scripts "$child"
  : > "$child/state/task1.meta"
  write_arm_fixture "$child" actionable
  out=$(park_payload | env -u PI_CODING_AGENT \
    FM_ROOT_OVERRIDE="$base" FM_HOME="$base" FM_CURSOR_PARK_POLL=1 \
    FM_CHILD_PARK="$child/bin/fm-turnend-guard-cursor.sh" \
    "$FAKE_CURSOR" -c '
      printf "%s\n" "$$" > "$FM_HOME/state/.lock"
      "$FM_CHILD_PARK"
    ' 2>/dev/null)
  [ -z "$out" ] \
    || fail "an inherited parent-primary FM_ROOT_OVERRIDE/FM_HOME must not park a child worktree: $out"
  [ ! -e "$base/state/arm-ran" ] \
    || fail "the child worktree armed the parent primary's watcher"
  pass "cursor park: inert in a child worktree even when FM_ROOT_OVERRIDE and FM_HOME name a parent primary"
}

test_park_ignores_malformed_payload() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/park-malformed")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  out=$(printf 'not json at all' | env -u PI_CODING_AGENT FM_HOME="$dir" bash "$dir/bin/fm-turnend-guard-cursor.sh" 2>/dev/null)
  [ -z "$out" ] || fail "a malformed payload must fail open, got: $out"
  out=$(printf '{"loop_count":"three","cursor_version":"x"}' | env -u PI_CODING_AGENT FM_HOME="$dir" bash "$dir/bin/fm-turnend-guard-cursor.sh" 2>/dev/null)
  [ -z "$out" ] || fail "a non-numeric loop_count must fail open, got: $out"
  pass "cursor park: malformed payloads fail open without arming"
}

test_precompact_marks_active_without_context() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/precompact-mark")
  out=$(printf '{"hook_event_name":"preCompact","session_id":"sess-cursor","trigger":"auto","cursor_version":"x"}' \
    | env -u PI_CODING_AGENT FM_HOME="$dir" bash "$dir/bin/fm-cursor-precompact.sh" 2>/dev/null)
  [ -z "$out" ] || fail "preCompact must stay silent and never inject context, got: $out"
  [ -f "$dir/state/.cursor-compaction" ] || fail "preCompact must mark compaction active"
  pass "cursor preCompact: marks active and prints nothing"
}

test_after_agent_response_ends_the_window() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/after-agent-clear")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  mark_compaction_active "$dir"
  printf '{"text":"done"}' \
    | env -u PI_CODING_AGENT FM_HOME="$dir" bash "$dir/bin/fm-cursor-after-agent-response.sh" 2>/dev/null
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir")
  [ "$(kind_of_followup "$out")" = watcher ] \
    || fail "after the window closed the park must submit instead of holding, got: $out"
  [ ! -e "$dir/state/.cursor-compaction-held" ] \
    || fail "a closed window must not make the park hold its follow-up"
  pass "cursor afterAgentResponse: ends the window so the park submits again"
}

# The window can outlast the park's whole wait. That park submits nothing, so no
# further turn starts until the captain types, and the stop that finally can
# deliver the event arrives long after the record's own age budget.
test_held_followup_survives_a_window_that_outlives_the_wait() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/park-window-outlives-wait")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" failed
  printf 'session=sess-cursor\ncount=3\n' > "$dir/state/.turnend-cursor-blocks"
  hold_watcher_followup "$dir" 'wake parked before a long window' '' sess-cursor 100000
  mark_compaction_active "$dir"
  out=$(FM_CURSOR_COMPACTION_MAX_AGE=60 FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir")
  [ -z "$out" ] || fail "the still-open window must not submit, got: $out"
  printf '{"text":"done"}' \
    | env -u PI_CODING_AGENT FM_HOME="$dir" bash "$dir/bin/fm-cursor-after-agent-response.sh" 2>/dev/null
  out=$(FM_CURSOR_COMPACTION_MAX_AGE=60 FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir")
  case "$(followup_of "$out")" in
    *'wake parked before a long window'*) ;;
    *) fail "the first stop after the window closed must deliver the held event, got: $out" ;;
  esac
  [ ! -e "$dir/state/.cursor-compaction-held" ] || fail "delivery must consume the held record"
  pass "cursor park: a window that outlives the wait does not expire the held event"
}

# The single slot cannot owe two submits: an event that is still deliverable is
# itself owed one, so nothing evicts it.
test_once_only_object_never_evicts_a_deliverable_event() {
  local dir out held
  dir=$(make_primary_dir "$TMP_ROOT/park-no-eviction")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  hold_watcher_followup "$dir" 'earlier window wake'
  held=$(cat "$dir/state/.cursor-compaction-held")
  mark_compaction_active "$dir"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir" 5 5)
  [ -z "$out" ] || fail "an open window must not submit, got: $out"
  [ "$(cat "$dir/state/.cursor-compaction-held")" = "$held" ] \
    || fail "a still-deliverable held event was evicted from the slot"
  rm -f "$dir/state/.cursor-compaction"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir" 6 5)
  case "$(followup_of "$out")" in
    *'earlier window wake'*) ;;
    *) fail "the event that kept the slot must still be delivered, got: $out" ;;
  esac
  pass "cursor park: a once-only object never evicts a deliverable held event"
}

# A held wake pays its budget reset even when its own age budget runs out while
# this park waits for the window to close.
test_held_wake_resets_the_budget_even_when_it_ages_out_while_waiting() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/park-held-ages-in-wait")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" failed
  printf 'session=sess-cursor\ncount=2\n' > "$dir/state/.turnend-cursor-blocks"
  hold_watcher_followup "$dir" 'wake that ages while waiting' reset-budget sess-cursor 5
  mark_compaction_active "$dir"
  ( sleep 5; rm -f "$dir/state/.cursor-compaction" ) >/dev/null 2>&1 &
  out=$(FM_CURSOR_COMPACTION_MAX_AGE=8 FM_CURSOR_COMPACTION_WAIT_MAX=60 run_park "$dir")
  case "$(followup_of "$out")" in
    *'wake that ages while waiting'*) ;;
    *) fail "the held wake must still be delivered, got: $out" ;;
  esac
  [ ! -e "$dir/state/.turnend-cursor-blocks" ] \
    || fail "the delivered wake lost its budget reset: $(cat "$dir/state/.turnend-cursor-blocks")"
  pass "cursor park: a held wake keeps its budget reset across the wait"
}

# A crewmate worktree inherits FM_ROOT_OVERRIDE from the primary that launched
# it; neither compaction hook may write the primary's records from there.
test_compaction_hooks_inert_in_child_worktree() {
  local base child
  base=$(make_primary_dir "$TMP_ROOT/compaction-base")
  child="$TMP_ROOT/compaction-child"
  fm_git_worktree "$base" "$child" fm/cursor-compaction-child
  mkdir -p "$child/state"
  : > "$child/AGENTS.md"
  install_scripts "$child"
  printf '{"hook_event_name":"preCompact","session_id":"sess-crew","trigger":"auto"}' \
    | env -u PI_CODING_AGENT FM_ROOT_OVERRIDE="$base" FM_HOME="$base" \
      bash "$child/bin/fm-cursor-precompact.sh" 2>/dev/null
  [ ! -f "$base/state/.cursor-compaction" ] \
    || fail "a child worktree marked the primary home as compacting"
  [ ! -f "$child/state/.cursor-compaction" ] \
    || fail "a child worktree must not mark itself either"
  mark_compaction_active "$base"
  printf '{"text":"done"}' \
    | env -u PI_CODING_AGENT FM_ROOT_OVERRIDE="$base" FM_HOME="$base" \
      bash "$child/bin/fm-cursor-after-agent-response.sh" 2>/dev/null
  [ -f "$base/state/.cursor-compaction" ] \
    || fail "a child worktree cleared the primary home's compaction mark"
  rm -f "$base/state/.cursor-compaction"
  pass "cursor compaction hooks: inert inside a child crewmate worktree"
}

# An abandoned mark - Cursor exited, crashed, or never fired afterAgentResponse
# - must not silence supervision forever.
test_stale_compaction_mark_does_not_hold() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/compaction-stale")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  printf 'session=sess-cursor\nupdated_at=1\n' > "$dir/state/.cursor-compaction"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir")
  [ "$(kind_of_followup "$out")" = watcher ] \
    || fail "a mark older than the wait budget must not hold the follow-up, got: $out"
  [ ! -f "$dir/state/.cursor-compaction-held" ] \
    || fail "an expired mark must not park the event in the held record"
  pass "cursor park: an expired compaction mark counts as no compaction"
}

# The held record is the durable copy of the one event: a commit that never
# printed must leave it held rather than consume it.
test_held_followup_survives_a_failed_commit() {
  local dir out held
  dir=$(make_primary_dir "$TMP_ROOT/compaction-failed-commit")
  : > "$dir/state/task1.meta"
  # The arm marks compaction active and lets a detached child clear it a few
  # seconds later, so the park provably holds first and then reaches its commit
  # with the window closed.
  cat > "$dir/bin/fm-watch-arm.sh" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$$" >> "$FM_HOME/state/arm-ran"
printf 'session=sess-cursor\nupdated_at=%s\n' "$(date +%s)" > "$FM_HOME/state/.cursor-compaction"
( sleep 6; rm -f "$FM_HOME/state/.cursor-compaction" ) >/dev/null 2>&1 &
printf 'watcher: started pid=%s (beacon fresh)\n' "$$"
printf 'stale: fixture-win needs a look\n'
exit 0
SH
  chmod +x "$dir/bin/fm-watch-arm.sh"
  # A directory cannot be removed by the budget reset, so the commit section
  # gives up after the held record was already claimed for delivery.
  mkdir "$dir/state/.turnend-cursor-blocks"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=60 run_park "$dir")
  [ -z "$out" ] || fail "a follow-up whose budget reset failed must not be submitted, got: $out"
  held=$(cat "$dir/state/.cursor-compaction-held" 2>/dev/null || true)
  [ -n "$held" ] || fail "a commit that never printed must leave the event held"
  pass "cursor park: a failed commit re-parks the held follow-up instead of stranding it"
}

test_park_holds_followup_during_compaction_then_delivers_once() {
  local dir out held held2
  dir=$(make_primary_dir "$TMP_ROOT/park-compaction-hold")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  mark_compaction_active "$dir"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir")
  [ -z "$out" ] || fail "compaction-active must not submit a follow-up, got: $out"
  [ -f "$dir/state/.cursor-compaction-held" ] || fail "the follow-up must be held exactly once"
  held=$(cat "$dir/state/.cursor-compaction-held")
  [ -n "$held" ] || fail "the held record must contain the follow-up object"
  mark_compaction_active "$dir"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir")
  [ -z "$out" ] || fail "a second stop while still compacting must not submit, got: $out"
  held2=$(cat "$dir/state/.cursor-compaction-held")
  [ "$held" = "$held2" ] || fail "a second stop must not replace or duplicate the held event"
  rm -f "$dir/state/.cursor-compaction"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir")
  [ "$(kind_of_followup "$out")" = watcher ] \
    || fail "after successful compaction the held follow-up must be delivered once, got: $out"
  [ ! -f "$dir/state/.cursor-compaction-held" ] || fail "delivery must consume the held record"
  # Supervision stays needed and the repair budget is spent, so this stop runs
  # the whole park and is silent only if nothing is left to deliver twice.
  rm -f "$dir/state/arm-ran"
  write_arm_fixture "$dir" failed
  printf 'session=sess-cursor\ncount=3\n' > "$dir/state/.turnend-cursor-blocks"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir")
  [ -n "$(cat "$dir/state/arm-ran" 2>/dev/null || true)" ] \
    || fail "the deliver-once check must exercise a park that still needs supervision"
  [ -z "$out" ] || fail "a later stop with no new event must not submit again, got: $out"
  pass "cursor park: hold once during compaction, deliver once after, never twice"
}

# The owner lock is what serializes this park against away mode
# (bin/fm-afk-start.sh takes the same lock) and against a newer stop's claim, so
# the hold must be written while the lock is still held. state/.cursor-park-owner.lock
# is the on-disk record of that hold.
test_hold_is_written_without_releasing_the_owner_lock() {
  local dir park_pid waited unlocked samples
  dir=$(make_primary_dir "$TMP_ROOT/park-hold-lock-scope")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  mark_compaction_active "$dir"
  # Widen the moment between the ownership check and the hold so the lock can be
  # observed, without changing what the adapter does in it.
  cat >> "$dir/bin/fm-cursor-compaction-lib.sh" <<'SH'
eval "fm_cursor_compaction_hold_once_real() $(declare -f fm_cursor_compaction_hold_once | sed 1d)"
fm_cursor_compaction_hold_once() {
  : > "$FM_HOME/state/hold-entered"
  sleep 3
  fm_cursor_compaction_hold_once_real "$@"
}
SH
  ( FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir" > "$dir/state/hold-lock-out" ) &
  park_pid=$!
  waited=0
  while [ ! -e "$dir/state/hold-entered" ]; do
    sleep 0.05
    waited=$((waited + 1))
    [ "$waited" -lt 400 ] || fail "the park never reached its hold"
  done
  unlocked=0
  samples=0
  while [ ! -e "$dir/state/.cursor-compaction-held" ] && [ "$samples" -lt 25 ]; do
    if [ ! -e "$dir/state/.cursor-park-owner.lock" ] && [ ! -L "$dir/state/.cursor-park-owner.lock" ]; then
      unlocked=1
    fi
    sleep 0.1
    samples=$((samples + 1))
  done
  wait "$park_pid" 2>/dev/null || true
  [ "$unlocked" -eq 0 ] \
    || fail "the owner lock was free between the ownership check and the hold"
  [ -e "$dir/state/.cursor-compaction-held" ] || fail "the park never held its follow-up"
  pass "cursor park: the hold is written without releasing the owner lock"
}

# A nag the held slot refused and this park never printed was never delivered,
# so it must not spend one of the three the budget allows.
test_refused_nag_does_not_spend_its_budget() {
  local dir out held
  dir=$(make_primary_dir "$TMP_ROOT/park-nag-refused")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" failed
  hold_watcher_followup "$dir" 'earlier window wake'
  held=$(cat "$dir/state/.cursor-compaction-held")
  mark_compaction_active "$dir"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir")
  [ -z "$out" ] || fail "a park inside an open window must not submit, got: $out"
  [ ! -e "$dir/state/.turnend-cursor-blocks" ] \
    || fail "a nag that was neither held nor printed spent budget: $(cat "$dir/state/.turnend-cursor-blocks")"
  [ "$(cat "$dir/state/.cursor-compaction-held")" = "$held" ] \
    || fail "the earlier window's event must stay untouched"
  pass "cursor park: a nag the held slot refused stays unspent"
}

# A watcher wake is productive work that clears the repair-nag budget, and it
# stays productive when the window makes a later stop deliver it.
test_held_wake_still_resets_the_nag_budget() {
  local dir out budget_count
  dir=$(make_primary_dir "$TMP_ROOT/park-held-wake-reset")
  : > "$dir/state/task1.meta"
  printf 'session=sess-cursor\ncount=2\n' > "$dir/state/.turnend-cursor-blocks"
  write_arm_fixture "$dir" actionable
  mark_compaction_active "$dir"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir")
  [ -z "$out" ] || fail "the open window must not submit the wake, got: $out"
  [ -f "$dir/state/.cursor-compaction-held" ] || fail "the wake must be held"
  budget_count=$(sed -n '2s/^count=//p' "$dir/state/.turnend-cursor-blocks" 2>/dev/null || true)
  [ "$budget_count" = 2 ] \
    || fail "a wake that was only held must not reset the budget yet: $budget_count"
  rm -f "$dir/state/.cursor-compaction" "$dir/state/arm-ran"
  write_arm_fixture "$dir" failed
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir")
  [ "$(kind_of_followup "$out")" = watcher ] \
    || fail "the held wake must be delivered by the next stop, got: $out"
  [ ! -e "$dir/state/.turnend-cursor-blocks" ] \
    || fail "the delivered wake did not reset the nag budget: $(cat "$dir/state/.turnend-cursor-blocks")"
  pass "cursor park: a wake delivered from the hold still resets the nag budget"
}

# The held slot is private to the session that parked it and expires with the
# same budget as the mark, so a follow-up built for one session can never be
# replayed into the next one and none can sit in the slot forever.
test_held_followup_is_bound_to_its_session_and_freshness() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/park-held-scope")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  hold_watcher_followup "$dir" 'unbounded wake' '' unbounded
  out=$(run_park "$dir")
  case "$(followup_of "$out")" in
    *'unbounded wake'*) fail "a held follow-up with no owner and no lifetime was delivered: $out" ;;
  esac
  [ "$(kind_of_followup "$out")" = watcher ] \
    || fail "this session's own wake must still be delivered, got: $out"
  rm -f "$dir/state/arm-ran"
  hold_watcher_followup "$dir" 'foreign session wake' '' sess-other
  out=$(run_park "$dir")
  case "$(followup_of "$out")" in
    *'foreign session wake'*) fail "another session's held follow-up was delivered: $out" ;;
  esac
  rm -f "$dir/state/arm-ran"
  hold_watcher_followup "$dir" 'expired wake' '' sess-cursor 100000
  out=$(FM_CURSOR_COMPACTION_MAX_AGE=60 run_park "$dir")
  case "$(followup_of "$out")" in
    *'expired wake'*) fail "an expired held follow-up was delivered: $out" ;;
  esac
  pass "cursor park: an unowned, foreign or expired held follow-up is never delivered"
}

# An undeliverable record must not wedge the single slot either: the next hold
# replaces it, and that fresh event is the one the session receives.
test_undeliverable_held_record_does_not_block_the_slot() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/park-held-slot-free")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  hold_watcher_followup "$dir" 'unbounded wake' '' unbounded
  mark_compaction_active "$dir"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir")
  [ -z "$out" ] || fail "the open window must not submit, got: $out"
  rm -f "$dir/state/.cursor-compaction" "$dir/state/arm-ran"
  write_arm_fixture "$dir" failed
  printf 'session=sess-cursor\ncount=3\n' > "$dir/state/.turnend-cursor-blocks"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir")
  [ "$(kind_of_followup "$out")" = watcher ] \
    || fail "the fresh event that took the slot must be delivered, got: $out"
  case "$(followup_of "$out")" in
    *'unbounded wake'*) fail "the undeliverable record was delivered after all: $out" ;;
  esac
  [ ! -e "$dir/state/.cursor-compaction-held" ] || fail "delivery must consume the held record"
  pass "cursor park: an undeliverable held record is replaced, not left blocking"
}

# The ceiling notice is the session's one warning that automatic delivery stops,
# so a free slot must park it rather than let the open window drop it.
test_ceiling_notice_is_parked_when_the_window_outlives_the_wait() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/park-ceiling-parked")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  mark_compaction_active "$dir"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir" 5 5)
  [ -z "$out" ] || fail "an open window must not submit the notice, got: $out"
  rm -f "$dir/state/.cursor-compaction"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir" 6 5)
  case "$(followup_of "$out")" in
    *'CEILING REACHED'*) ;;
    *) fail "the parked ceiling notice must be delivered, got: $out" ;;
  esac
  [ ! -e "$dir/state/.cursor-compaction-held" ] || fail "delivery must consume the held record"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir" 7 5)
  [ -z "$out" ] || fail "the ceiling notice must not be delivered twice, got: $out"
  pass "cursor park: an open window parks the ceiling notice instead of dropping it"
}

# Holding is a state mutation like any other: a park that may no longer act must
# not leave an object behind for a later stop to deliver.
test_park_holds_nothing_once_away_mode_activates() {
  local dir park_pid out waited budget_count
  dir=$(make_primary_dir "$TMP_ROOT/park-afk-hold")
  : > "$dir/state/task1.meta"
  printf 'session=sess-cursor\ncount=1\n' > "$dir/state/.turnend-cursor-blocks"
  write_arm_fixture "$dir" actionable
  mark_compaction_active "$dir"
  cat >> "$dir/bin/fm-operational-input.sh" <<'SH'
fm_operational_input_encode() {
  local kind=${1-} body=${2-} result_var=${3-}
  [ -n "$result_var" ] && fm_operational_kind_is_current "$kind" && [ -n "$body" ] || return 2
  : > "$FM_HOME/state/hold-commit-entered"
  while [ ! -e "$FM_HOME/state/hold-commit-release" ]; do sleep 0.05; done
  printf -v "$result_var" '%s%s: %s' "$FM_OPERATIONAL_HEADER_PREFIX" "$kind" "$body"
}
SH
  ( FM_CURSOR_COMPACTION_WAIT_MAX=1 run_park "$dir" > "$dir/state/hold-out" ) &
  park_pid=$!
  waited=0
  while [ ! -e "$dir/state/hold-commit-entered" ]; do
    sleep 0.05
    waited=$((waited + 1))
    [ "$waited" -lt 200 ] || fail "the park never reached follow-up preparation"
  done
  : > "$dir/state/.afk"
  : > "$dir/state/hold-commit-release"
  wait "$park_pid" 2>/dev/null || true
  out=$(cat "$dir/state/hold-out" 2>/dev/null || true)
  [ -z "$out" ] || fail "the park emitted after away mode activated: $out"
  [ ! -e "$dir/state/.cursor-compaction-held" ] \
    || fail "a park that may no longer act still held a follow-up for later delivery"
  budget_count=$(sed -n '2s/^count=//p' "$dir/state/.turnend-cursor-blocks" 2>/dev/null || true)
  [ "$budget_count" = 1 ] || fail "the park reset nag state after away mode activated: $budget_count"
  pass "cursor park: away mode before the commit leaves no held follow-up"
}

# The window closing mid-commit must deliver THIS park's object, not the one an
# earlier window already parked in the single held slot.
test_ceiling_notice_survives_an_active_compaction_window() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/park-ceiling-compacting")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  hold_watcher_followup "$dir" 'stale held wake'
  # Marking the window from inside follow-up preparation makes it provably open
  # when this park commits, and a detached child closes it a few seconds later.
  cat >> "$dir/bin/fm-operational-input.sh" <<'SH'
fm_operational_input_encode() {
  local kind=${1-} body=${2-} result_var=${3-}
  [ -n "$result_var" ] && fm_operational_kind_is_current "$kind" && [ -n "$body" ] || return 2
  printf 'session=sess-cursor\nupdated_at=%s\n' "$(date +%s)" > "$FM_HOME/state/.cursor-compaction"
  ( sleep 5; rm -f "$FM_HOME/state/.cursor-compaction" ) >/dev/null 2>&1 &
  printf -v "$result_var" '%s%s: %s' "$FM_OPERATIONAL_HEADER_PREFIX" "$kind" "$body"
}
SH
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=60 run_park "$dir" 5 5)
  case "$(followup_of "$out")" in
    *'CEILING REACHED'*) ;;
    *) fail "the ceiling notice must survive a compaction window, got: $out" ;;
  esac
  [ -f "$dir/state/.cursor-compaction-held" ] \
    || fail "the earlier window's event must stay held for its own delivery"
  pass "cursor park: a closing compaction window submits this park's own object"
}

# A nag that is held during compaction is still one of the three the budget
# allows, so it must be charged when it is accepted, not only when it prints.
test_repair_nag_charges_its_budget_when_held() {
  local dir out budget_count
  dir=$(make_primary_dir "$TMP_ROOT/park-nag-held-budget")
  : > "$dir/state/task1.meta"
  cat > "$dir/bin/fm-watch-arm.sh" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$$" >> "$FM_HOME/state/arm-ran"
printf 'session=sess-cursor\nupdated_at=%s\n' "$(date +%s)" > "$FM_HOME/state/.cursor-compaction"
( sleep 6; rm -f "$FM_HOME/state/.cursor-compaction" ) >/dev/null 2>&1 &
printf 'watcher: FAILED - no live watcher with a fresh beacon\n'
exit 1
SH
  chmod +x "$dir/bin/fm-watch-arm.sh"
  out=$(FM_CURSOR_COMPACTION_WAIT_MAX=60 run_park "$dir")
  [ "$(kind_of_followup "$out")" = turn-end-guard ] \
    || fail "the held repair nag must still be delivered once the window closes, got: $out"
  case "$(followup_of "$out")" in
    *'nag 1 of 3'*) ;;
    *) fail "the nag must number itself from the budget it charges, got: $out" ;;
  esac
  budget_count=$(sed -n '2s/^count=//p' "$dir/state/.turnend-cursor-blocks" 2>/dev/null || true)
  [ "$budget_count" = 1 ] \
    || fail "a nag held through compaction must charge the bounded budget: $budget_count"
  [ ! -e "$dir/state/.cursor-compaction-held" ] || fail "delivery must consume the held record"
  pass "cursor park: a repair nag held through compaction charges its budget once"
}

# A held event must not shadow a freshly built one: the ceiling notice is the
# session's single warning that automatic delivery stops.
test_ceiling_notice_is_not_shadowed_by_a_held_followup() {
  local dir out
  dir=$(make_primary_dir "$TMP_ROOT/park-ceiling-held")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  hold_watcher_followup "$dir" 'stale held wake'
  out=$(run_park "$dir" 5 5)
  case "$(followup_of "$out")" in
    *'CEILING REACHED'*) ;;
    *) fail "the ceiling notice must reach the session, got: $out" ;;
  esac
  [ -f "$dir/state/.cursor-compaction-held" ] \
    || fail "the held event must stay durable until it is submitted itself"
  out=$(run_park "$dir" 6 5)
  [ "$(kind_of_followup "$out")" = watcher ] \
    || fail "the still-held event must be delivered by the next silent stop, got: $out"
  [ ! -f "$dir/state/.cursor-compaction-held" ] \
    || fail "the delivered event must be consumed"
  pass "cursor park: the ceiling notice is never replaced by a held follow-up"
}

# --- SESSION -----------------------------------------------------------------

install_digest_fixture() {  # <dir>
  cat > "$1/bin/fm-session-start.sh" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FM_HOME/state/digest-args"
printf 'FIRSTMATE DIGEST "quoted" line\nsecond line\n'
SH
  chmod +x "$1/bin/fm-session-start.sh"
}

test_sessionstart_emits_additional_context() {
  local dir out ctx
  dir=$(make_primary_dir "$TMP_ROOT/session-start")
  install_digest_fixture "$dir"
  out=$(run_session "$dir" sessionStart startup)
  ctx=$(printf '%s' "$out" | jq -r '.additional_context // empty' 2>/dev/null)
  case "$ctx" in *'FIRSTMATE DIGEST "quoted" line'*) ;; *) fail "the digest must reach model context verbatim, got: $out" ;; esac
  case "$ctx" in *'second line'*) ;; *) fail "the digest was truncated at the first line: $ctx" ;; esac
  grep -q -- '--source startup' "$dir/state/digest-args" \
    || fail "the adapter must supply --source itself; Cursor's payload has no source field"
  pass "fm-sessionstart-cursor: sessionStart injects context"
}

test_sessionstart_silent_in_child_worktree() {
  local base child out
  base=$(make_primary_dir "$TMP_ROOT/session-base")
  child="$TMP_ROOT/session-child"
  fm_git_worktree "$base" "$child" fm/cursor-session-child
  mkdir -p "$child/state"
  : > "$child/AGENTS.md"
  install_scripts "$child"
  install_digest_fixture "$child"
  out=$(printf '{"hook_event_name":"sessionStart","cursor_version":"x"}' \
    | FM_HOME="$child" bash "$child/bin/fm-sessionstart-cursor.sh" --source startup 2>/dev/null)
  [ -z "$out" ] || fail "a child worktree must never take the helm: $out"
  pass "fm-sessionstart-cursor: silent inside a child crewmate worktree"
}

# --- registration ------------------------------------------------------------

test_tracked_registration_covers_the_primary_events() {
  local reg
  reg="$ROOT/.cursor/hooks.json"
  [ -f "$reg" ] || fail "firstmate must ship a tracked project-scope .cursor/hooks.json"
  jq -e '.hooks.stop and .hooks.sessionStart and .hooks.preToolUse and .hooks.preCompact and .hooks.afterAgentResponse' "$reg" >/dev/null 2>&1 \
    || fail "the registration must cover stop, sessionStart, preToolUse, preCompact, and afterAgentResponse"
  jq -e '.hooks.preCompact[0].command | test("fm-cursor-precompact")' "$reg" >/dev/null 2>&1 \
    || fail "preCompact must only mark the compaction hold, not inject context"
  jq -e '[.hooks.stop[] | select(.loop_limit != null and .loop_limit > 0)] | length == 1' "$reg" >/dev/null 2>&1 \
    || fail "the stop registration needs an explicit positive loop_limit: without it Cursor's default is unlimited"
  jq -e '[.hooks.sessionStart[]] | all(.timeout > 120)' "$reg" >/dev/null 2>&1 \
    || fail "the session-open timeout must sit above bin/fm-session-start.sh's own 120s budget"
  pass "cursor registration: covers every primary event with a bounded stop loop"
}

# The two bounds must nest, and the only honest way to prove it is to run the
# adapter at Cursor's own registered limit with its DEFAULT ceiling: firstmate's
# bound must already have stopped the loop by then, so Cursor's hard ceiling is
# never what silently ends supervision.
test_default_ceiling_bites_before_the_registered_loop_limit() {
  local dir limit out
  dir=$(make_primary_dir "$TMP_ROOT/park-nesting")
  : > "$dir/state/task1.meta"
  write_arm_fixture "$dir" actionable
  limit=$(jq -r '.hooks.stop[0].loop_limit' "$ROOT/.cursor/hooks.json")
  case "$limit" in ''|*[!0-9]*) fail "the stop registration needs a numeric loop_limit, got: $limit" ;; esac
  out=$(run_park "$dir" "$((limit - 1))")
  [ -z "$out" ] || fail "at Cursor's own limit the adapter must already be quiet from its own bound, got: $out"
  [ ! -e "$dir/state/arm-ran" ] || fail "the adapter armed past its own default ceiling"
  pass "cursor bounds nest: firstmate's default ceiling stops the loop before Cursor's loop_limit does"
}

test_turnend_guard_stands_down_on_cursor_payload
test_turnend_guard_still_blocks_for_claude_payload
test_autoarm_stands_down_on_cursor_payload
test_sessionstart_run_stands_down_on_cursor_payload
test_pretool_guards_deduplicate_and_render_cursor_deny
test_cd_guard_renders_cursor_deny
test_park_silent_when_nothing_in_flight
test_park_delivers_actionable_wake_as_followup
test_park_never_exits_two
test_park_repair_nag_is_bounded
test_park_repair_nag_requires_a_persisted_budget
test_park_nag_budget_resets_after_a_real_wake
test_park_loop_ceiling_warns_once_then_goes_quiet
test_park_stands_down_when_superseded
test_park_serializes_supersession_with_followup_commit
test_superseded_park_does_not_consume_nag_budget
test_park_inert_when_afk
test_park_inert_under_pi_coding_agent
test_park_still_parks_with_pi_leak_and_cursor_identity
test_park_stands_down_when_away_mode_activates_before_commit
test_park_inert_without_session_lock
test_park_stands_down_after_session_takeover
test_park_inert_in_child_worktree
test_park_inert_in_child_worktree_with_inherited_primary_env
test_park_ignores_malformed_payload
test_precompact_marks_active_without_context
test_after_agent_response_ends_the_window
test_held_followup_survives_a_window_that_outlives_the_wait
test_once_only_object_never_evicts_a_deliverable_event
test_held_wake_resets_the_budget_even_when_it_ages_out_while_waiting
test_compaction_hooks_inert_in_child_worktree
test_stale_compaction_mark_does_not_hold
test_held_followup_survives_a_failed_commit
test_park_holds_followup_during_compaction_then_delivers_once
test_park_holds_nothing_once_away_mode_activates
test_hold_is_written_without_releasing_the_owner_lock
test_refused_nag_does_not_spend_its_budget
test_held_wake_still_resets_the_nag_budget
test_ceiling_notice_is_not_shadowed_by_a_held_followup
test_ceiling_notice_survives_an_active_compaction_window
test_ceiling_notice_is_parked_when_the_window_outlives_the_wait
test_held_followup_is_bound_to_its_session_and_freshness
test_undeliverable_held_record_does_not_block_the_slot
test_repair_nag_charges_its_budget_when_held
test_sessionstart_emits_additional_context
test_sessionstart_silent_in_child_worktree
test_tracked_registration_covers_the_primary_events
test_default_ceiling_bites_before_the_registered_loop_limit
