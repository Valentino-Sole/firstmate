#!/usr/bin/env bash
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

test_pending_roundtrip
test_launch_args_include_continue_and_extensions
test_restart_refuses_non_primary_scope
test_restart_refuses_without_pi_lock
