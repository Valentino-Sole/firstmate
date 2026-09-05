#!/usr/bin/env bash
# shellcheck disable=SC2030,SC2031 # Every measurement deliberately runs in its own subshell with its own host pins.
# tests/fm-capacity-cap.test.sh - the captain's hard worker cap
# (config/worker-slots-max) over the measured slot formula.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TMP_ROOT=$(fm_test_tmproot fm-capacity-cap)

cleanup() {
  fm_test_cleanup
}
trap cleanup EXIT

# Run one measurement in a subshell with a generous host so only the cap can
# lower the budget; prints "slots=<n> free=<n> occupied=<n> cap_error=<text>".
measure() {  # <home>
  (
    export FM_HOME=$1 FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=32768 FM_CAPACITY_LOAD1=0.5
    # shellcheck source=bin/fm-capacity-lib.sh
    . "$ROOT/bin/fm-capacity-lib.sh"
    fm_capacity_measure_local "$1/state" "$1"
    printf 'slots=%s free=%s occupied=%s cap_error=%s\n' \
      "$FM_CAPACITY_SLOTS" "$FM_CAPACITY_FREE" "$FM_CAPACITY_OCCUPIED" "${FM_CAPACITY_CAP_ERROR:-}"
  )
}

allow() {  # <home> <task-id>
  (
    export FM_HOME=$1 FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=32768 FM_CAPACITY_LOAD1=0.5
    # shellcheck source=bin/fm-capacity-lib.sh
    . "$ROOT/bin/fm-capacity-lib.sh"
    fm_capacity_allow_new_worker "$1/state" "$2" ship 0 "$1" 2>&1
  )
}

make_home() {  # <name>
  local home="$TMP_ROOT/$1"
  mkdir -p "$home/state" "$home/config" "$home/data"
  printf '%s\n' "$home"
}

test_cap_lowers_the_formula_budget() {
  local home out
  home=$(make_home primary-cap)
  out=$(measure "$home")
  case "$out" in slots=5\ *) ;; *) fail "a generous host without a cap did not reach the formula ceiling: $out" ;; esac
  printf '4\n' > "$home/config/worker-slots-max"
  out=$(measure "$home")
  case "$out" in slots=4\ free=4\ *) ;; *) fail "the cap did not lower the budget to 4: $out" ;; esac
  printf '  2 \n' > "$home/config/worker-slots-max"
  out=$(measure "$home")
  case "$out" in slots=2\ *) ;; *) fail "surrounding whitespace broke the cap: $out" ;; esac
  printf '9\n' > "$home/config/worker-slots-max"
  out=$(measure "$home")
  case "$out" in slots=5\ *) ;; *) fail "a cap above the formula widened the budget: $out" ;; esac
  pass "config/worker-slots-max caps the measured budget and never widens it"
}

test_secondmate_home_obeys_the_parent_cap() {
  local primary sub out
  primary=$(make_home primary-parent)
  sub=$(make_home sub-child)
  printf '3\n' > "$primary/config/worker-slots-max"
  printf '5\n' > "$sub/config/worker-slots-max"
  printf 'schema=fm-secondmate-parent.v1\nroute=local\nparent_home=%s\n' "$primary" > "$sub/.fm-secondmate-parent"
  out=$(measure "$sub")
  case "$out" in slots=3\ *) ;; *) fail "a secondmate home did not obey its parent's cap: $out" ;; esac
  pass "a secondmate home obeys the primary home's cap, not its own file"
}

test_malformed_cap_refuses_fresh_workers() {
  local home out
  home=$(make_home primary-bad)
  printf 'four\n' > "$home/config/worker-slots-max"
  out=$(measure "$home")
  case "$out" in *"cap_error=config/worker-slots-max"*) ;; *) fail "a malformed cap was not reported: $out" ;; esac
  out=$(allow "$home" fresh-task) && fail "a malformed cap admitted a fresh worker: $out"
  case "$out" in *"must hold one positive whole number"*) ;; *) fail "the refusal did not name the malformed file: $out" ;; esac
  printf '0\n' > "$home/config/worker-slots-max"
  out=$(allow "$home" fresh-task) && fail "a zero cap admitted a fresh worker: $out"
  pass "a malformed or zero cap refuses fresh workers with an actionable error"
}

test_cap_reached_names_the_cap() {
  local home out
  home=$(make_home primary-full)
  printf '1\n' > "$home/config/worker-slots-max"
  fm_write_meta "$home/state/busy-one.meta" \
    "window=firstmate:fm-busy-one" "endpoint_task_id=busy-one" "worktree=$home/wt" \
    "project=$home/proj" "harness=claude" "kind=ship" "mode=no-mistakes" "yolo=off"
  out=$(
    export FM_HOME=$home FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=32768 FM_CAPACITY_LOAD1=0.5
    # shellcheck source=bin/fm-capacity-lib.sh
    . "$ROOT/bin/fm-capacity-lib.sh"
    fm_capacity_worker_live() { return 0; }
    fm_capacity_allow_new_worker "$home/state" fresh-two ship 0 "$home" 2>&1
  ) && fail "a reached cap admitted a second worker: $out"
  case "$out" in *"worker cap is reached (occupied=1 cap=1"*) ;; *) fail "the refusal did not name the cap: $out" ;; esac
  pass "a reached cap refuses with the occupied count and the cap named"
}

test_cap_lowers_the_formula_budget
test_secondmate_home_obeys_the_parent_cap
test_malformed_cap_refuses_fresh_workers
test_cap_reached_names_the_cap
