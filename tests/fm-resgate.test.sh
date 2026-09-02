#!/usr/bin/env bash
# fm-resgate-lib.sh / fm-resgate.sh - weekly clock-window resource governance,
# the manual override marker, and home-PC GPU exclusivity between Qwen and
# JARVIS voice.
#
# Covers: the captain's exact schedule windows and their boundaries (including
# the Friday-evening-through-Monday-morning free span on the work PC and the
# always-capped weekend on the home PC, both of which fall out of the same
# small per-weekday window rather than separate weekend-boundary code); the
# fail-closed clock, role, and GPU-probe paths; the override marker's atomic
# set/clear/status roundtrip and its precedence over the clock; and the GPU
# owner/availability decision, including the real CRLF line-ending bug found
# while live-testing this suite against the actual home host (Windows
# PowerShell terminates every line with CRLF; a naive `read -r` loop leaves
# the trailing CR on the last field and silently breaks every exact-match
# case pattern).
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
# shellcheck source=bin/fm-resgate-lib.sh
. "$ROOT/bin/fm-resgate-lib.sh"

CLI="$ROOT/bin/fm-resgate.sh"

# --- role validation ---------------------------------------------------------

test_role_ok() {
  fm_resgate_role_ok work || fail "work must be a valid role"
  fm_resgate_role_ok home || fail "home must be a valid role"
  fm_resgate_role_ok both && fail "both must not be a valid single role"
  fm_resgate_role_ok '' && fail "empty must not be a valid role"
  pass "fm_resgate_role_ok accepts only work and home"
}

# --- clock parsing ------------------------------------------------------------

test_now_fields_from_override() {
  FM_RESGATE_NOW_OVERRIDE="3 14 05" fm_resgate_now_fields \
    || fail "a well-formed override must parse"
  # Re-run in this shell so the globals are visible to the assertion below.
  # shellcheck disable=SC2030,SC2031
  ( FM_RESGATE_NOW_OVERRIDE="3 14 05"; fm_resgate_now_fields
    [ "$FM_RESGATE_NOW_DOW" = 3 ] || exit 1
    [ "$FM_RESGATE_NOW_MOD" = "$((14 * 60 + 5))" ] || exit 1
  ) || fail "override dow/mod must parse to Wednesday 14:05"
  pass "fm_resgate_now_fields parses a well-formed override"
}

test_now_fields_rejects_malformed_override() {
  FM_RESGATE_NOW_OVERRIDE="not a clock reading" fm_resgate_now_fields \
    && fail "a malformed override must not parse"
  FM_RESGATE_NOW_OVERRIDE="8 14 05" fm_resgate_now_fields \
    && fail "a day-of-week of 8 must not parse"
  FM_RESGATE_NOW_OVERRIDE="3 24 05" fm_resgate_now_fields \
    && fail "an hour of 24 must not parse"
  FM_RESGATE_NOW_OVERRIDE="3 14 60" fm_resgate_now_fields \
    && fail "a minute of 60 must not parse"
  pass "fm_resgate_now_fields rejects malformed clock readings"
}

test_now_fields_handles_leading_zero_hours() {
  # 08 and 09 are invalid octal literals; a naive $((hh*60+mm)) would abort.
  # shellcheck disable=SC2030,SC2031
  ( FM_RESGATE_NOW_OVERRIDE="1 08 09"; fm_resgate_now_fields
    [ "$FM_RESGATE_NOW_MOD" = "$((8 * 60 + 9))" ]
  ) || fail "leading-zero hour/minute fields must not be read as octal"
  pass "fm_resgate_now_fields treats leading-zero HH/MM as decimal"
}

# --- schedule state: work PC --------------------------------------------------

test_work_capped_within_window() {
  FM_RESGATE_NOW_OVERRIDE="3 14 00" fm_resgate_schedule_state work
  [ "$FM_RESGATE_SCHEDULE_STATE" = capped ] \
    || fail "work PC must be capped Wednesday 14:00 (inside 10:00-19:30)"
  pass "work PC is capped mid-window on a weekday"
}

test_work_capped_at_start_boundary() {
  FM_RESGATE_NOW_OVERRIDE="1 10 00" fm_resgate_schedule_state work
  [ "$FM_RESGATE_SCHEDULE_STATE" = capped ] \
    || fail "work PC must be capped starting exactly at 10:00"
  FM_RESGATE_NOW_OVERRIDE="1 09 59" fm_resgate_schedule_state work
  [ "$FM_RESGATE_SCHEDULE_STATE" = uncapped ] \
    || fail "work PC must still be uncapped at 09:59"
  pass "work PC's capped window starts exactly at 10:00, inclusive"
}

test_work_uncapped_at_end_boundary() {
  FM_RESGATE_NOW_OVERRIDE="1 19 30" fm_resgate_schedule_state work
  [ "$FM_RESGATE_SCHEDULE_STATE" = uncapped ] \
    || fail "work PC must be uncapped again exactly at 19:30"
  FM_RESGATE_NOW_OVERRIDE="1 19 29" fm_resgate_schedule_state work
  [ "$FM_RESGATE_SCHEDULE_STATE" = capped ] \
    || fail "work PC must still be capped at 19:29"
  pass "work PC's capped window ends exactly at 19:30, exclusive"
}

test_work_free_through_weekend_span() {
  local case
  for case in "5 19 30" "5 23 59" "6 00 00" "6 12 00" "7 23 59" "1 00 00" "1 09 59"; do
    FM_RESGATE_NOW_OVERRIDE="$case" fm_resgate_schedule_state work
    [ "$FM_RESGATE_SCHEDULE_STATE" = uncapped ] \
      || fail "work PC must be uncapped throughout Fri 19:30 - Mon 10:00 (failed at '$case')"
  done
  pass "work PC stays uncapped continuously from Friday 19:30 through Monday 10:00"
}

# --- schedule state: home PC ---------------------------------------------------

test_home_free_within_window() {
  FM_RESGATE_NOW_OVERRIDE="3 10 00" fm_resgate_schedule_state home
  [ "$FM_RESGATE_SCHEDULE_STATE" = uncapped ] \
    || fail "home PC must be free Wednesday 10:00 (inside 04:00-19:00)"
  pass "home PC is free mid-window on a weekday"
}

test_home_free_starts_at_boundary() {
  FM_RESGATE_NOW_OVERRIDE="1 04 00" fm_resgate_schedule_state home
  [ "$FM_RESGATE_SCHEDULE_STATE" = uncapped ] \
    || fail "home PC must be free starting exactly at 04:00"
  FM_RESGATE_NOW_OVERRIDE="1 03 59" fm_resgate_schedule_state home
  [ "$FM_RESGATE_SCHEDULE_STATE" = capped ] \
    || fail "home PC must still be capped at 03:59"
  pass "home PC's free window starts exactly at 04:00, inclusive"
}

test_home_free_ends_at_boundary() {
  FM_RESGATE_NOW_OVERRIDE="1 19 00" fm_resgate_schedule_state home
  [ "$FM_RESGATE_SCHEDULE_STATE" = capped ] \
    || fail "home PC must be capped again exactly at 19:00"
  FM_RESGATE_NOW_OVERRIDE="1 18 59" fm_resgate_schedule_state home
  [ "$FM_RESGATE_SCHEDULE_STATE" = uncapped ] \
    || fail "home PC must still be free at 18:59"
  pass "home PC's free window ends exactly at 19:00, exclusive"
}

test_home_capped_all_weekend() {
  local case
  for case in "5 19 00" "5 23 59" "6 00 00" "6 12 00" "7 23 59" "1 00 00" "1 03 59"; do
    FM_RESGATE_NOW_OVERRIDE="$case" fm_resgate_schedule_state home
    [ "$FM_RESGATE_SCHEDULE_STATE" = capped ] \
      || fail "home PC must be capped throughout Fri 19:00 - Mon 04:00 (failed at '$case')"
  done
  pass "home PC stays capped continuously across the whole weekend"
}

# --- fail-closed clock ---------------------------------------------------------

test_schedule_blocked_on_unreadable_clock() {
  FM_RESGATE_NOW_OVERRIDE="garbage" fm_resgate_schedule_state work
  [ "$FM_RESGATE_SCHEDULE_STATE" = blocked ] \
    || fail "an unreadable clock must yield 'blocked', not a guessed state"
  pass "schedule state fails closed to 'blocked' on an unreadable clock"
}

test_capacity_pct_zero_on_unreadable_clock() {
  local state
  state=$(fm_test_tmproot resgate-pct-blocked)
  FM_RESGATE_NOW_OVERRIDE="garbage" fm_resgate_capacity_pct "$state" work
  [ "$FM_RESGATE_PCT" = 0 ] \
    || fail "an unreadable clock must yield 0%, stricter than the ordinary 50% cap"
  pass "capacity_pct fails closed to 0% on an unreadable clock"
}

# --- manual override -----------------------------------------------------------

test_override_set_active_clear_roundtrip() {
  local state
  state=$(fm_test_tmproot resgate-override)
  fm_resgate_override_active "$state" work \
    && fail "override must start inactive"
  fm_resgate_override_set "$state" work note \
    || fail "override_set must succeed"
  fm_resgate_override_active "$state" work \
    || fail "override must read active immediately after being set"
  fm_resgate_override_active "$state" home \
    && fail "setting work's override must not arm home's"
  [ -f "$(fm_resgate_override_path "$state" work)" ] \
    || fail "the marker file itself must exist on disk"
  fm_resgate_override_clear "$state" work
  fm_resgate_override_active "$state" work \
    && fail "override must read inactive immediately after being cleared"
  pass "override marker set/active/clear roundtrips per role, atomically"
}

test_override_forces_capped_regardless_of_schedule() {
  local state
  state=$(fm_test_tmproot resgate-override-forces)
  fm_resgate_override_set "$state" work Kappung || fail "override_set must succeed"
  # Saturday noon would ordinarily be fully free on the work PC.
  FM_RESGATE_NOW_OVERRIDE="6 12 00" fm_resgate_capacity_pct "$state" work
  [ "$FM_RESGATE_PCT" = 50 ] \
    || fail "an armed override must force 50% even during an otherwise-free window"
  [ "$FM_RESGATE_STATE" = capped ] || fail "an armed override must report state=capped"
  pass "an armed override forces capped state independent of the clock window"
}

# --- percentage arithmetic ------------------------------------------------------

test_apply_pct_arithmetic() {
  [ "$(fm_resgate_apply_pct 10 100)" = 10 ] || fail "100% of 10 must be 10"
  [ "$(fm_resgate_apply_pct 10 50)" = 5 ] || fail "50% of 10 must be 5"
  [ "$(fm_resgate_apply_pct 3 50)" = 1 ] || fail "50% of 3 must floor to 1"
  [ "$(fm_resgate_apply_pct 10 0)" = 0 ] || fail "0% of anything must be 0"
  pass "fm_resgate_apply_pct halves (and floors) correctly"
}

test_apply_pct_fails_closed_on_bad_input() {
  [ "$(fm_resgate_apply_pct abc 50)" = 0 ] || fail "a non-numeric raw count must yield 0"
  [ "$(fm_resgate_apply_pct 10 150)" = 0 ] || fail "a percentage over 100 must yield 0, not overshoot"
  [ "$(fm_resgate_apply_pct '' 50)" = 0 ] || fail "an empty raw count must yield 0"
  pass "fm_resgate_apply_pct fails closed on non-numeric or out-of-range input"
}

# --- GPU exclusivity: mocked SSH -----------------------------------------------
#
# The fake `ssh` prints exactly the FM_RESGATE lines a real probe would, with
# real Windows CRLF line endings, so absorption is exercised the same way the
# live host exercises it.

fake_ssh_returning() { # <fakebin-dir> <literal-output-with-\r\n>
  local fakebin=$1 output=$2
  cat > "$fakebin/ssh" <<SH
#!/usr/bin/env bash
printf '%b' '$output'
SH
  chmod +x "$fakebin/ssh"
}

fake_ssh_unreachable() { # <fakebin-dir>
  cat > "$1/ssh" <<'SH'
#!/usr/bin/env bash
exit 255
SH
  chmod +x "$1/ssh"
}

test_gpu_owner_qwen_when_process_and_memory_both_active() {
  local tmp fakebin out
  tmp=$(fm_test_tmproot resgate-gpu-qwen)
  fakebin=$(fm_fakebin "$tmp")
  out='FM_RESGATE voice_port=not-listening\r\nFM_RESGATE gpu_process=running\r\nFM_RESGATE gpu_used_mb=9046\r\n'
  fake_ssh_returning "$fakebin" "$out"
  # shellcheck disable=SC2030,SC2031
  ( PATH="$fakebin:$PATH"
    . "$ROOT/bin/fm-resgate-lib.sh"
    fm_resgate_home_gpu_owner
    [ "$FM_RESGATE_GPU_OWNER" = qwen ]
  ) || fail "process running + memory above threshold must read owner=qwen"
  pass "GPU owner is qwen when both the named process and aggregate memory are active"
}

test_gpu_owner_none_when_process_running_but_memory_idle() {
  local tmp fakebin out
  tmp=$(fm_test_tmproot resgate-gpu-idle-process)
  fakebin=$(fm_fakebin "$tmp")
  # A background service can be installed and running with no model loaded;
  # the process check alone must not be read as "Qwen is active".
  out='FM_RESGATE voice_port=not-listening\r\nFM_RESGATE gpu_process=running\r\nFM_RESGATE gpu_used_mb=512\r\n'
  fake_ssh_returning "$fakebin" "$out"
  # shellcheck disable=SC2030,SC2031
  ( PATH="$fakebin:$PATH"
    . "$ROOT/bin/fm-resgate-lib.sh"
    fm_resgate_home_gpu_owner
    [ "$FM_RESGATE_GPU_OWNER" = none ]
  ) || fail "an idle-but-running process below the memory threshold must read owner=none"
  pass "GPU owner is none when the process is running but aggregate memory stays below threshold"
}

test_gpu_owner_voice_when_port_listening() {
  local tmp fakebin out
  tmp=$(fm_test_tmproot resgate-gpu-voice)
  fakebin=$(fm_fakebin "$tmp")
  out='FM_RESGATE voice_port=listening\r\nFM_RESGATE gpu_process=not-running\r\nFM_RESGATE gpu_used_mb=1800\r\n'
  fake_ssh_returning "$fakebin" "$out"
  # shellcheck disable=SC2030,SC2031
  ( PATH="$fakebin:$PATH"
    . "$ROOT/bin/fm-resgate-lib.sh"
    fm_resgate_home_gpu_owner
    [ "$FM_RESGATE_GPU_OWNER" = voice ]
  ) || fail "a listening voice port must read owner=voice"
  pass "GPU owner is voice when the gateway port is listening"
}

test_gpu_owner_conflict_when_both_active() {
  local tmp fakebin out
  tmp=$(fm_test_tmproot resgate-gpu-conflict)
  fakebin=$(fm_fakebin "$tmp")
  out='FM_RESGATE voice_port=listening\r\nFM_RESGATE gpu_process=running\r\nFM_RESGATE gpu_used_mb=9046\r\n'
  fake_ssh_returning "$fakebin" "$out"
  # shellcheck disable=SC2030,SC2031
  ( PATH="$fakebin:$PATH"
    . "$ROOT/bin/fm-resgate-lib.sh"
    fm_resgate_home_gpu_owner
    [ "$FM_RESGATE_GPU_OWNER" = conflict ]
  ) || fail "both signals active at once must read owner=conflict, never pick a side"
  pass "GPU owner is conflict when voice and Qwen both read active, never silently resolved"
}

test_gpu_available_for_blocks_the_other_side() {
  local tmp fakebin out
  tmp=$(fm_test_tmproot resgate-gpu-exclusive)
  fakebin=$(fm_fakebin "$tmp")
  out='FM_RESGATE voice_port=not-listening\r\nFM_RESGATE gpu_process=running\r\nFM_RESGATE gpu_used_mb=9046\r\n'
  fake_ssh_returning "$fakebin" "$out"
  # shellcheck disable=SC2030,SC2031
  ( PATH="$fakebin:$PATH"
    . "$ROOT/bin/fm-resgate-lib.sh"
    fm_resgate_gpu_available_for qwen || exit 1
    fm_resgate_gpu_available_for voice && exit 1
    exit 0
  ) || fail "GPU reserved for Qwen must allow qwen and refuse voice"
  pass "gpu_available_for enforces exclusivity: the reserved side is allowed, the other refused"
}

test_gpu_owner_unknown_on_crlf_lines_still_parses_correctly() {
  # Regression for the exact bug found live-testing against the real host:
  # Windows CRLF line endings left a trailing \r on the last field of each
  # line, breaking every exact-match case pattern silently.
  local tmp fakebin out
  tmp=$(fm_test_tmproot resgate-gpu-crlf)
  fakebin=$(fm_fakebin "$tmp")
  out='FM_RESGATE voice_port=not-listening\r\nFM_RESGATE gpu_process=not-running\r\nFM_RESGATE gpu_used_mb=1200\r\n'
  fake_ssh_returning "$fakebin" "$out"
  # shellcheck disable=SC2030,SC2031
  ( PATH="$fakebin:$PATH"
    . "$ROOT/bin/fm-resgate-lib.sh"
    fm_resgate_home_gpu_owner
    [ "$FM_RESGATE_GPU_VOICE" = no ] || exit 1
    [ "$FM_RESGATE_GPU_PROCESS" = no ] || exit 1
    [ "$FM_RESGATE_GPU_USED_MB" = 1200 ] || exit 1
    [ "$FM_RESGATE_GPU_OWNER" = none ] || exit 1
  ) || fail "CRLF-terminated probe lines must still parse to their exact values, not fall through to unknown"
  pass "GPU probe parsing survives real Windows CRLF line endings"
}

test_gpu_owner_unknown_on_probe_failure_field() {
  local tmp fakebin out
  tmp=$(fm_test_tmproot resgate-gpu-probefail)
  fakebin=$(fm_fakebin "$tmp")
  out='FM_RESGATE voice_port=not-listening\r\nFM_RESGATE gpu_process=running\r\nFM_RESGATE gpu_used_mb=probe-failed\r\n'
  fake_ssh_returning "$fakebin" "$out"
  # shellcheck disable=SC2030,SC2031
  ( PATH="$fakebin:$PATH"
    . "$ROOT/bin/fm-resgate-lib.sh"
    fm_resgate_home_gpu_owner && exit 1
    [ "$FM_RESGATE_GPU_OWNER" = unknown ] || exit 1
    fm_resgate_gpu_available_for qwen && exit 1
    fm_resgate_gpu_available_for voice && exit 1
    exit 0
  ) || fail "a failed individual reading (nvidia-smi failure) must fail closed to unknown for BOTH workloads"
  pass "a single failed probe field fails the whole GPU reading closed, never a partial guess"
}

test_gpu_owner_unknown_when_ssh_unreachable() {
  local tmp fakebin
  tmp=$(fm_test_tmproot resgate-gpu-unreachable)
  fakebin=$(fm_fakebin "$tmp")
  fake_ssh_unreachable "$fakebin"
  # shellcheck disable=SC2030,SC2031
  ( PATH="$fakebin:$PATH"
    . "$ROOT/bin/fm-resgate-lib.sh"
    fm_resgate_home_gpu_owner && exit 1
    [ "$FM_RESGATE_GPU_OWNER" = unknown ] || exit 1
    exit 0
  ) || fail "an unreachable home host must fail closed to unknown, never permissive"
  pass "GPU owner fails closed to unknown when the home host is unreachable"
}

test_gpu_skip_remote_never_probes() {
  # shellcheck disable=SC2030,SC2031
  ( FM_RESGATE_SKIP_REMOTE=1
    fm_resgate_home_gpu_owner && exit 1
    [ "$FM_RESGATE_GPU_OWNER" = unknown ] || exit 1
    exit 0
  ) || fail "FM_RESGATE_SKIP_REMOTE=1 must fail closed without attempting a probe"
  pass "FM_RESGATE_SKIP_REMOTE=1 fails closed without probing"
}

# --- CLI (public interface) -----------------------------------------------------

test_cli_schedule_and_cap() {
  local out
  out=$(FM_RESGATE_NOW_OVERRIDE="3 14 00" "$CLI" schedule work) \
    || fail "CLI schedule must exit 0"
  case "$out" in *state=capped*) ;; *) fail "CLI schedule must print state=capped: $out" ;; esac
  out=$(FM_STATE_OVERRIDE="$(fm_test_tmproot resgate-cli-cap)" \
    FM_RESGATE_NOW_OVERRIDE="3 14 00" "$CLI" cap work) \
    || fail "CLI cap must exit 0"
  case "$out" in *pct=50*) ;; *) fail "CLI cap must print pct=50: $out" ;; esac
  pass "CLI schedule/cap commands print the expected verdict"
}

test_cli_override_both_arms_and_clears_two_files() {
  local state
  state=$(fm_test_tmproot resgate-cli-override-both)
  FM_STATE_OVERRIDE="$state" "$CLI" override set both \
    || fail "CLI override set both must exit 0"
  [ -e "$state/.resgate-cap-work" ] || fail "override set both must arm the work marker"
  [ -e "$state/.resgate-cap-home" ] || fail "override set both must arm the home marker"
  FM_STATE_OVERRIDE="$state" "$CLI" override clear both \
    || fail "CLI override clear both must exit 0"
  [ -e "$state/.resgate-cap-work" ] && fail "override clear both must remove the work marker"
  [ -e "$state/.resgate-cap-home" ] && fail "override clear both must remove the home marker"
  pass "CLI override set/clear both arms and releases the markers for both roles"
}

test_cli_gpu_allow_exit_codes() {
  local tmp fakebin out
  tmp=$(fm_test_tmproot resgate-cli-gpu)
  fakebin=$(fm_fakebin "$tmp")
  out='FM_RESGATE voice_port=not-listening\r\nFM_RESGATE gpu_process=running\r\nFM_RESGATE gpu_used_mb=9046\r\n'
  fake_ssh_returning "$fakebin" "$out"
  # shellcheck disable=SC2031
  PATH="$fakebin:$PATH" "$CLI" gpu allow qwen \
    || fail "CLI gpu allow qwen must exit 0 when Qwen holds the GPU"
  # shellcheck disable=SC2031
  PATH="$fakebin:$PATH" "$CLI" gpu allow voice \
    && fail "CLI gpu allow voice must exit non-zero when Qwen holds the GPU"
  pass "CLI gpu allow exit codes reflect the exclusivity decision"
}

test_role_ok
test_now_fields_from_override
test_now_fields_rejects_malformed_override
test_now_fields_handles_leading_zero_hours
test_work_capped_within_window
test_work_capped_at_start_boundary
test_work_uncapped_at_end_boundary
test_work_free_through_weekend_span
test_home_free_within_window
test_home_free_starts_at_boundary
test_home_free_ends_at_boundary
test_home_capped_all_weekend
test_schedule_blocked_on_unreadable_clock
test_capacity_pct_zero_on_unreadable_clock
test_override_set_active_clear_roundtrip
test_override_forces_capped_regardless_of_schedule
test_apply_pct_arithmetic
test_apply_pct_fails_closed_on_bad_input
test_gpu_owner_qwen_when_process_and_memory_both_active
test_gpu_owner_none_when_process_running_but_memory_idle
test_gpu_owner_voice_when_port_listening
test_gpu_owner_conflict_when_both_active
test_gpu_available_for_blocks_the_other_side
test_gpu_owner_unknown_on_crlf_lines_still_parses_correctly
test_gpu_owner_unknown_on_probe_failure_field
test_gpu_owner_unknown_when_ssh_unreachable
test_gpu_skip_remote_never_probes
test_cli_schedule_and_cap
test_cli_override_both_arms_and_clears_two_files
test_cli_gpu_allow_exit_codes
