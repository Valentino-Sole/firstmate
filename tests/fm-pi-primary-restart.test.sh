#!/usr/bin/env bash
# shellcheck disable=SC2329,SC2034 # Test stubs override sourced backend functions and set their output globals; the library invokes and reads them indirectly.
# Portable tests for automatic Pi-primary restart helpers and refusal paths.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
# shellcheck source=/dev/null
. "$ROOT/bin/fm-session-lock-lib.sh"
# shellcheck source=/dev/null
. "$ROOT/bin/fm-wake-lib.sh"
# shellcheck source=/dev/null
. "$ROOT/bin/fm-pi-primary-restart-lib.sh"

RESTART="$ROOT/bin/fm-pi-primary-restart.sh"
TMP_ROOT=$(fm_test_tmproot fm-pi-primary-restart)

reset_restart_stubs() {
  unset -f sleep \
    fm_backend_herdr_parse_target \
    fm_backend_herdr_agent_status_raw \
    fm_backend_herdr_classify_submit_agent_status \
    fm_backend_herdr_send_key \
    fm_backend_send_text_submit
  FM_PI_RESTART_PREPARE_REASON=
  FM_PI_RESTART_SUBMIT_REASON=
  FM_PI_RESTART_SUBMIT_DETAIL=
}

test_pending_roundtrip() {
  local home="$TMP_ROOT/pending-home"
  mkdir -p "$home/state"
  fm_pi_restart_write_pending "$home/state" backend herdr target w2N:p1 lock_pid 42 reason test || fail "write pending"
  [ "$(fm_pi_restart_read_pending_field "$home/state" backend)" = herdr ] || fail "backend field"
  [ "$(fm_pi_restart_read_pending_field "$home/state" target)" = w2N:p1 ] || fail "target field"
  fm_pi_restart_clear_pending "$home/state"
  assert_absent "$(fm_pi_restart_pending_path "$home/state")" "pending cleared"
  pass "pending checkpoint roundtrip"
}

test_launch_args_include_continue_and_extensions() {
  local args
  mapfile -t args < <(fm_pi_restart_launch_args "$ROOT" pi "/tmp/session.jsonl")
  assert_contains "$(printf '%s\n' "${args[@]}")" "-c" "missing -c"
  assert_contains "$(printf '%s\n' "${args[@]}")" "--approve" "missing --approve"
  assert_contains "$(printf '%s\n' "${args[@]}")" "fm-primary-turnend-guard.ts" "missing turnend extension"
  assert_contains "$(printf '%s\n' "${args[@]}")" "fm-primary-pi-watch.ts" "missing watch extension"
  pass "launch args continue session and load both extensions"
}

test_restart_refuses_non_primary_scope() {
  local repo="$TMP_ROOT/crew-repo" home="$TMP_ROOT/crew-home" out status=0
  mkdir -p "$repo/bin" "$home/state"
  out=$(FM_HOME="$home" FM_ROOT_OVERRIDE="$repo" FM_STATE_OVERRIDE="$home/state" "$RESTART" 2>&1) || status=$?
  [ "$status" -ne 0 ] || fail "non-primary scope should refuse"
  assert_contains "$out" "not a genuine firstmate primary home" "wrong refusal text: $out"
  pass "restart refuses outside primary scope"
}

test_restart_refuses_without_pi_lock() {
  local repo="$TMP_ROOT/primary-repo" home="$TMP_ROOT/primary-home" out status=0
  mkdir -p "$repo/bin" "$home/state"
  printf 'pointer\n' >"$repo/AGENTS.md"
  git -C "$repo" init -q
  git -C "$repo" config user.email 't@example.com'
  git -C "$repo" config user.name 't'
  git -C "$repo" add AGENTS.md && git -C "$repo" commit -q -m 'init'
  out=$(FM_HOME="$home" FM_ROOT_OVERRIDE="$repo" FM_STATE_OVERRIDE="$home/state" "$RESTART" 2>&1) || status=$?
  [ "$status" -ne 0 ] || fail "missing lock should refuse"
  assert_contains "$out" "not held by a live Pi primary" "wrong refusal text: $out"
  pass "restart refuses when the lock is not held by Pi"
}

test_prepare_exit_retries_until_idle() {
  local status=0
  local interrupts=0 counter_file="$TMP_ROOT/prepare-idle.counter"
  reset_restart_stubs
  printf '0\n' >"$counter_file"
  sleep() { :; }
  fm_backend_herdr_parse_target() { FM_BACKEND_HERDR_SESSION=s; FM_BACKEND_HERDR_PANE=p; return 0; }
  fm_backend_herdr_agent_status_raw() {
    local idx
    idx=$(sed -n '1p' "$counter_file")
    case "$idx" in
      0|1) printf 'working' ;;
      *) printf 'idle' ;;
    esac
    printf '%s\n' $((idx + 1)) >"$counter_file"
  }
  fm_backend_herdr_classify_submit_agent_status() {
    case "$1" in
      idle) printf 'idle' ;;
      working|blocked) printf 'busy' ;;
      *) printf 'unknown' ;;
    esac
  }
  fm_backend_herdr_send_key() { interrupts=$((interrupts + 1)); return 0; }

  fm_pi_restart_prepare_pane_for_exit herdr s:p 3 3 || status=$?
  [ "$status" -eq 0 ] || fail "prepare should succeed when pane becomes idle"
  [ "$interrupts" -eq 1 ] || fail "expected one interrupt attempt, got $interrupts"
  [ -z "${FM_PI_RESTART_PREPARE_REASON:-}" ] || fail "unexpected prepare reason: ${FM_PI_RESTART_PREPARE_REASON:-}"
  reset_restart_stubs
  pass "prepare retries interrupt and returns on idle"
}

test_prepare_exit_fails_when_busy_persists() {
  local status=0
  local interrupts=0
  reset_restart_stubs
  sleep() { :; }
  fm_backend_herdr_parse_target() { FM_BACKEND_HERDR_SESSION=s; FM_BACKEND_HERDR_PANE=p; return 0; }
  fm_backend_herdr_agent_status_raw() { printf 'working'; }
  fm_backend_herdr_classify_submit_agent_status() {
    case "$1" in
      idle) printf 'idle' ;;
      working|blocked) printf 'busy' ;;
      *) printf 'unknown' ;;
    esac
  }
  fm_backend_herdr_send_key() { interrupts=$((interrupts + 1)); return 0; }

  fm_pi_restart_prepare_pane_for_exit herdr s:p 2 2 || status=$?
  [ "$status" -ne 0 ] || fail "prepare should fail when pane remains busy"
  [ "$interrupts" -eq 2 ] || fail "expected two interrupt attempts, got $interrupts"
  [ "${FM_PI_RESTART_PREPARE_REASON:-}" = pane-stayed-busy ] || fail "wrong prepare reason: ${FM_PI_RESTART_PREPARE_REASON:-}"
  reset_restart_stubs
  pass "prepare fails with explicit reason after busy retries"
}

test_prepare_exit_fails_when_interrupt_cannot_send() {
  local status=0
  reset_restart_stubs
  sleep() { :; }
  fm_backend_herdr_parse_target() { FM_BACKEND_HERDR_SESSION=s; FM_BACKEND_HERDR_PANE=p; return 0; }
  fm_backend_herdr_agent_status_raw() { printf 'working'; }
  fm_backend_herdr_classify_submit_agent_status() { printf 'busy'; }
  fm_backend_herdr_send_key() { return 1; }

  fm_pi_restart_prepare_pane_for_exit herdr s:p 2 2 || status=$?
  [ "$status" -ne 0 ] || fail "prepare should fail when interrupt send fails"
  [ "${FM_PI_RESTART_PREPARE_REASON:-}" = interrupt-send-failed ] || fail "wrong prepare reason: ${FM_PI_RESTART_PREPARE_REASON:-}"
  reset_restart_stubs
  pass "prepare surfaces interrupt-delivery failure reason"
}

test_submit_exit_requires_confirmed_delivery() {
  local status=0
  reset_restart_stubs
  fm_backend_send_text_submit() { printf ''; }
  fm_pi_restart_submit_exit_command herdr s:p /quit 2 0 0 || status=$?
  [ "$status" -eq 0 ] || fail "empty submit verdict should be accepted"
  [ -z "${FM_PI_RESTART_SUBMIT_REASON:-}" ] || fail "unexpected submit reason on success"

  status=0
  fm_backend_send_text_submit() { printf 'pending'; }
  fm_pi_restart_submit_exit_command herdr s:p /quit 2 0 0 || status=$?
  [ "$status" -ne 0 ] || fail "pending submit verdict must refuse blind exit"
  [ "${FM_PI_RESTART_SUBMIT_REASON:-}" = unconfirmed ] || fail "expected unconfirmed reason"
  [ "${FM_PI_RESTART_SUBMIT_DETAIL:-}" = pending ] || fail "expected pending submit detail"

  status=0
  fm_backend_send_text_submit() { printf 'send-failed'; }
  fm_pi_restart_submit_exit_command herdr s:p /quit 2 0 0 || status=$?
  [ "$status" -ne 0 ] || fail "send-failed must be surfaced"
  [ "${FM_PI_RESTART_SUBMIT_REASON:-}" = send-failed ] || fail "expected send-failed reason"
  reset_restart_stubs
  pass "submit helper accepts only confirmed exit delivery"
}

test_pending_roundtrip
test_launch_args_include_continue_and_extensions
test_restart_refuses_non_primary_scope
test_restart_refuses_without_pi_lock
test_prepare_exit_retries_until_idle
test_prepare_exit_fails_when_busy_persists
test_prepare_exit_fails_when_interrupt_cannot_send
test_submit_exit_requires_confirmed_delivery
