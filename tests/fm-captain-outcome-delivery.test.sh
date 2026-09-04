#!/usr/bin/env bash
# tests/fm-captain-outcome-delivery.test.sh - persistent exactly-once captain outcome delivery.
set -u

# shellcheck source=tests/wake-helpers.sh
. "$(dirname "${BASH_SOURCE[0]}")/wake-helpers.sh"

DELIVERY="$ROOT/bin/fm-captain-outcome-delivery.sh"
DRAIN="$ROOT/bin/fm-wake-drain.sh"
BRANCH_OUTCOME="$ROOT/bin/fm-branch-outcome.sh"

TMP_ROOT=$(fm_test_tmproot fm-captain-outcome-delivery-tests)

test_register_and_present_once() {
  local dir state out
  dir=$(make_case register-present)
  state="$dir/state"
  out="$dir/drain1.out"
  printf 'needs-decision [key=merge]: Merge oder warten?\n' > "$state/task-a.status"

  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "ingest failed"
  FM_STATE_OVERRIDE="$state" "$DRAIN" > "$out" || fail "first drain failed"
  grep -F 'NEUE ERGEBNISSE SEIT DEM LETZTEN BERICHT' "$out" >/dev/null \
    || fail "first drain did not surface captain outcomes: $(cat "$out")"
  grep -F 'task-a' "$out" | grep -F 'Merge oder warten' >/dev/null \
    || fail "needs-decision was not in captain outcome section"

  FM_STATE_OVERRIDE="$state" "$DRAIN" > "$dir/drain2.out" || fail "second drain failed"
  if grep -F 'NEUE ERGEBNISSE SEIT DEM LETZTEN BERICHT' "$dir/drain2.out" >/dev/null; then
    fail "second drain repeated the same captain outcome"
  fi
  pass "captain outcome is presented exactly once via wake-drain"
}

test_same_task_new_outcome_is_separate() {
  local dir state
  dir=$(make_case task-new-round)
  state="$dir/state"
  printf 'done: erste Runde fertig\n' > "$state/jarvis.status"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "ingest round 1 failed"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present >/dev/null || fail "present round 1 failed"

  printf 'needs-decision [key=reparatur]: neue Reparaturrunde abnahmebereit\n' >> "$state/jarvis.status"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "ingest round 2 failed"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$dir/present2.out" || fail "present round 2 failed"
  grep -F 'neue Reparaturrunde abnahmebereit' "$dir/present2.out" >/dev/null \
    || fail "second outcome of same task was not registered separately: $(cat "$dir/present2.out")"
  pass "a later outcome of the same task is a separate captain delivery"
}

test_unpresented_survives_restart() {
  local dir state
  dir=$(make_case restart-safe)
  state="$dir/state"
  printf 'done: Bericht unter data/scout/report.md\n' > "$state/scout.status"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "ingest failed"
  [ -n "$(FM_STATE_OVERRIDE="$state" "$DELIVERY" list-unpresented)" ] \
    || fail "expected unpresented outcome before restart simulation"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$dir/after-restart.out" || fail "present after restart failed"
  grep -F 'data/scout/report.md' "$dir/after-restart.out" >/dev/null \
    || fail "unpresented outcome did not survive restart simulation: $(cat "$dir/after-restart.out")"
  pass "unpresented outcomes survive simulated restart from disk"
}

test_branch_outcome_ingest_and_catch_up() {
  local dir state seq
  dir=$(make_case branch-catchup)
  state="$dir/state"
  mkdir -p "$state"
  FM_STATE_OVERRIDE="$state" "$BRANCH_OUTCOME" append \
    --task jarvis --verdict captain --summary 'Abnahme erforderlich: Branch bereit' \
    > "$dir/seq.txt" || fail "branch append failed"
  seq=$(cat "$dir/seq.txt")
  printf '%s\n' "$seq" > "$state/.branch-outcomes-cursor"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "branch ingest failed"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" catch-up >/dev/null || fail "catch-up failed"
  if [ -n "$(FM_STATE_OVERRIDE="$state" "$DELIVERY" list-unpresented)" ]; then
    fail "catch-up should mark already-consumed branch outcomes as presented"
  fi
  FM_STATE_OVERRIDE="$state" "$BRANCH_OUTCOME" append \
    --task jarvis --verdict captain --summary 'Zweite Runde: neuer Fix fertig' \
    > "$dir/seq2.txt" || fail "second branch append failed"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "second ingest failed"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$dir/new-branch.out" || fail "present new branch failed"
  grep -F 'Zweite Runde: neuer Fix fertig' "$dir/new-branch.out" >/dev/null \
    || fail "new branch outcome was not presented after catch-up: $(cat "$dir/new-branch.out")"
  pass "catch-up suppresses old branch outcomes but not new ones"
}

test_branch_actor_skips_present() {
  local dir state out
  dir=$(make_case branch-actor)
  state="$dir/state"
  printf 'needs-decision [key=x]: branch actor darf nicht praesentieren\n' > "$state/task-b.status"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "ingest failed"
  FM_STATE_OVERRIDE="$state" FM_SUPERVISION_ACTOR=branch "$DELIVERY" present > "$dir/branch-present.out" || fail "branch present failed"
  [ ! -s "$dir/branch-present.out" ] || fail "branch actor should not present captain outcomes"
  [ -n "$(FM_STATE_OVERRIDE="$state" "$DELIVERY" list-unpresented)" ] \
    || fail "branch actor should not mark outcomes presented"
  pass "branch supervision actor does not consume captain presentation"
}

test_register_and_present_once
test_same_task_new_outcome_is_separate
test_unpresented_survives_restart
test_branch_outcome_ingest_and_catch_up
test_branch_actor_skips_present

rm -rf "$TMP_ROOT"
printf 'fm-captain-outcome-delivery.test.sh: all tests passed\n'
