#!/usr/bin/env bash
# tests/fm-pi-summary-reap.test.sh - bin/fm-pi-summary-reap.sh: the
# marker-only, exact-PID, hard-timeout reap of Pi's own hung internal
# "claude.exe --print" summarization children (captain directive, 2026-09-06,
# fm-reparatur-zustellung-calm-leak, Paket C).
#
# Every case below drives the real script against real, test-spawned
# processes so `ps`/`kill` behave exactly as they do in production, but the
# script's own directory scan is redirected (FM_PI_SUMMARY_REAP_PROC_DIR) to a
# small fixture directory holding only this test's own entries - so a run
# here can never see, let alone touch, any unrelated real process on the
# host. Every fixture "process" is a real child this test spawns and owns.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

REAP_SRC="$ROOT/bin/fm-pi-summary-reap.sh"
TMP_ROOT=$(fm_test_tmproot fm-pi-summary-reap)

MARKER="context summarization assistant"

# Run the script from a per-test .check.sh-suffixed copy, never from its
# tracked repo path directly: the script's own log path is derived from
# argv0 (matching its state/<id>.check.sh deployment shape), so invoking the
# tracked file directly would otherwise leave a stray log next to the source.
reap_bin_for() {  # <case-dir> -> echoes the runnable copy's path
  local dir=$1 dest="$1/fm-pi-summary-reap.check.sh"
  cp "$REAP_SRC" "$dest"
  printf '%s' "$dest"
}

# Spawn a real background process whose /proc/<pid>/cmdline this test controls
# by writing a fixture entry for it (never the process's real argv, which
# stays an innocuous sleep loop either way). <resists_term> = 1 makes it trap
# and ignore SIGTERM, so the hard-timeout escalation path is exercised.
spawn_fixture_process() {  # <resists_term> -> echoes pid
  local resists=$1
  if [ "$resists" = 1 ]; then
    bash -c 'trap "" TERM; while :; do sleep 9999 & wait $!; done' >/dev/null 2>&1 &
  else
    bash -c 'while :; do sleep 9999 & wait $!; done' >/dev/null 2>&1 &
  fi
  disown "$!" 2>/dev/null || true
  printf '%s' "$!"
}

# <fixture-dir> <pid> <arg>...  - write a fake /proc/<pid>/cmdline entry, NUL-
# separated exactly like the kernel's, so the script's own parsing is
# exercised unchanged.
write_fixture_cmdline() {
  local dir=$1 pid=$2
  shift 2
  mkdir -p "$dir/$pid"
  printf '%s\0' "$@" > "$dir/$pid/cmdline"
}

still_alive() { kill -0 "$1" 2>/dev/null; }

reap_all_fixture_pids() {  # <pid>...
  local pid
  for pid in "$@"; do
    kill -KILL "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}

test_marker_matched_process_is_reaped_on_sigterm() {
  local fakeproc pid err rc reap
  fakeproc="$TMP_ROOT/proc-reaped"; mkdir -p "$fakeproc"
  reap=$(reap_bin_for "$fakeproc")
  pid=$(spawn_fixture_process 0)
  write_fixture_cmdline "$fakeproc" "$pid" claude.exe --print --input-format stream-json "$MARKER"
  still_alive "$pid" || fail "fixture process did not start"

  err="$TMP_ROOT/reaped.err"
  FM_PI_SUMMARY_REAP_PROC_DIR="$fakeproc" FM_PI_SUMMARY_REAP_MIN_AGE=0 FM_PI_SUMMARY_REAP_KILL_GRACE=1 \
    bash "$reap" >/dev/null 2>"$err"; rc=$?
  [ "$rc" -eq 0 ] || fail "reap script exited $rc: $(cat "$err")"
  [ -s "$err" ] && fail "an ordinary reaped-on-first-signal sweep must stay silent: $(cat "$err")"
  sleep 0.3
  ! still_alive "$pid" || { kill -KILL "$pid" 2>/dev/null; fail "a marker-matched, aged candidate was not reaped"; }
  pass "fm-pi-summary-reap: a marker-matched candidate is reaped on the first signal, silently"
}

test_non_matching_process_is_never_touched() {
  local fakeproc pid err rc reap
  fakeproc="$TMP_ROOT/proc-decoy"; mkdir -p "$fakeproc"
  reap=$(reap_bin_for "$fakeproc")
  pid=$(spawn_fixture_process 0)
  # An ordinary crewmate invocation: claude.exe, even --print, but no
  # summarization marker anywhere in argv.
  write_fixture_cmdline "$fakeproc" "$pid" claude.exe --print --input-format stream-json --model sonnet
  still_alive "$pid" || fail "fixture process did not start"

  err="$TMP_ROOT/decoy.err"
  FM_PI_SUMMARY_REAP_PROC_DIR="$fakeproc" FM_PI_SUMMARY_REAP_MIN_AGE=0 FM_PI_SUMMARY_REAP_KILL_GRACE=1 \
    bash "$reap" >/dev/null 2>"$err"; rc=$?
  [ "$rc" -eq 0 ] || fail "reap script exited $rc: $(cat "$err")"
  sleep 0.3
  still_alive "$pid" || fail "an ordinary worker without the summarization marker must never be touched"
  reap_all_fixture_pids "$pid"
  pass "fm-pi-summary-reap: a claude.exe --print process without the marker is never a candidate"
}

test_survivor_is_escalated_to_sigkill_within_hard_timeout() {
  local fakeproc pid err rc start elapsed reap
  fakeproc="$TMP_ROOT/proc-survivor"; mkdir -p "$fakeproc"
  reap=$(reap_bin_for "$fakeproc")
  pid=$(spawn_fixture_process 1)
  write_fixture_cmdline "$fakeproc" "$pid" claude.exe --print --input-format stream-json "$MARKER"
  still_alive "$pid" || fail "fixture process did not start"

  err="$TMP_ROOT/survivor.err"
  start=$(date +%s)
  FM_PI_SUMMARY_REAP_PROC_DIR="$fakeproc" FM_PI_SUMMARY_REAP_MIN_AGE=0 FM_PI_SUMMARY_REAP_KILL_GRACE=1 \
    bash "$reap" >/dev/null 2>"$err"; rc=$?
  elapsed=$(( $(date +%s) - start ))
  [ "$rc" -eq 0 ] || fail "reap script exited $rc: $(cat "$err")"
  [ -s "$err" ] && fail "a survivor cleaned up by the SIGKILL escalation must not itself be reported as a wake: $(cat "$err")"
  [ "$elapsed" -le 10 ] || fail "the hard timeout took $elapsed s - the escalation must be bounded, not open-ended"
  sleep 0.3
  ! still_alive "$pid" || { kill -KILL "$pid" 2>/dev/null; fail "a SIGTERM-resistant candidate was not escalated to SIGKILL within the hard timeout"; }
  pass "fm-pi-summary-reap: a candidate that ignores SIGTERM is escalated to SIGKILL within the bounded hard timeout"
}

test_log_records_the_sweep() {
  local fakeproc pid log reap
  fakeproc="$TMP_ROOT/proc-logged"; mkdir -p "$fakeproc"
  reap=$(reap_bin_for "$fakeproc")
  pid=$(spawn_fixture_process 0)
  write_fixture_cmdline "$fakeproc" "$pid" claude.exe --print "$MARKER"
  log="$fakeproc/fm-pi-summary-reap.log"
  FM_PI_SUMMARY_REAP_PROC_DIR="$fakeproc" FM_PI_SUMMARY_REAP_MIN_AGE=0 FM_PI_SUMMARY_REAP_KILL_GRACE=1 \
    bash "$reap" >/dev/null 2>&1
  [ -f "$log" ] || fail "the sweep did not write its private log at $log"
  assert_contains "$(cat "$log")" "signalled=1" "the log should record exactly one signalled candidate"
  pass "fm-pi-summary-reap: a sweep that reaps something logs it privately"
}

test_never_kills_by_pattern_or_process_group() {
  # Structural invariant: every signal in the script targets one exact PID
  # captured from its own scan, never a name pattern or a process group.
  if grep -Eq '\bpkill\b|\bkillall\b|kill[[:space:]]+-[A-Za-z]*[[:space:]]*--[[:space:]]*-[0-9]|kill[[:space:]]+-- -' "$REAP_SRC"; then
    fail "fm-pi-summary-reap.sh must never signal by name pattern or process group"
  fi
  # Searching the script's literal source text for "$pid", not expanding it.
  # shellcheck disable=SC2016
  if ! grep -Eq 'kill(-KILL)? "\$pid"|kill -KILL "\$pid"|kill -0 "\$pid"' "$REAP_SRC"; then
    fail "fm-pi-summary-reap.sh should signal only through an individually-captured \$pid"
  fi
  pass "fm-pi-summary-reap: every signal targets one exact captured PID, never a pattern or process group"
}

test_marker_matched_process_is_reaped_on_sigterm
test_non_matching_process_is_never_touched
test_survivor_is_escalated_to_sigkill_within_hard_timeout
test_log_records_the_sweep
test_never_kills_by_pattern_or_process_group
