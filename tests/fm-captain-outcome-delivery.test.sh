#!/usr/bin/env bash
# tests/fm-captain-outcome-delivery.test.sh - persistent exactly-once captain outcome delivery.
#
# The store owns only captain-facing done:/failed: results no other path
# delivers: OPEN DECISIONS keeps decisions and blockers, the drain's outcome
# backstop presents a task's newest uncovered event, and the supervision branch
# covers what it already summarized. These cases pin that boundary from both
# sides: what is presented exactly once, and what is never presented twice.
set -u

# shellcheck source=tests/wake-helpers.sh
. "$(dirname "${BASH_SOURCE[0]}")/wake-helpers.sh"

DELIVERY="$ROOT/bin/fm-captain-outcome-delivery.sh"
DRAIN="$ROOT/bin/fm-wake-drain.sh"
BRANCH_OUTCOME="$ROOT/bin/fm-branch-outcome.sh"

TMP_ROOT=$(fm_test_tmproot fm-captain-outcome-delivery-tests)

test_buried_result_is_presented_once_via_drain() {
  local dir state out
  dir=$(make_case register-present)
  state="$dir/state"
  out="$dir/drain1.out"
  # The done: result is buried under a later routine line, so the drain's
  # latest-event backstop never surfaces it; this store must.
  printf 'done: erste Runde fertig, Bericht folgt\nworking: raeume das Arbeitsverzeichnis auf\n' > "$state/task-a.status"

  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "ingest failed"
  FM_STATE_OVERRIDE="$state" "$DRAIN" > "$out" || fail "first drain failed"
  grep -F 'NEUE ERGEBNISSE SEIT DEM LETZTEN BERICHT' "$out" >/dev/null \
    || fail "first drain did not surface the buried captain outcome: $(cat "$out")"
  grep -F 'task-a' "$out" | grep -F 'erste Runde fertig' >/dev/null \
    || fail "buried done: result was not in the captain outcome section"
  if grep -F 'STATUS OUTCOME BACKSTOP' "$out" >/dev/null; then
    fail "a buried result was mistaken for the newest event: $(cat "$out")"
  fi

  FM_STATE_OVERRIDE="$state" "$DRAIN" > "$dir/drain2.out" || fail "second drain failed"
  if grep -F 'NEUE ERGEBNISSE SEIT DEM LETZTEN BERICHT' "$dir/drain2.out" >/dev/null; then
    fail "second drain repeated the same captain outcome"
  fi
  pass "a buried captain result is presented exactly once via wake-drain"
}

test_backstop_presentation_is_not_repeated_by_the_outcome_section() {
  local dir state out old
  dir=$(make_case backstop-once)
  state="$dir/state"
  out="$dir/drain1.out"
  printf 'done: PR https://example.test/41 checks green\n' > "$state/task-pr.status"
  old=$(( $(date +%s) - 20 ))
  perl -e 'utime($ARGV[0], $ARGV[0], $ARGV[1]) or exit 1' "$old" "$state/task-pr.status" \
    || fail "could not age the newest-event fixture"

  FM_STATE_OVERRIDE="$state" "$DRAIN" > "$out" || fail "first drain failed"
  grep -F 'STATUS OUTCOME BACKSTOP' "$out" >/dev/null \
    || fail "the newest uncovered event was not presented by the backstop: $(cat "$out")"
  [ "$(grep -Fc 'checks green' "$out")" -eq 1 ] \
    || fail "the backstop's presentation was repeated by the outcome section: $(cat "$out")"
  if grep -F 'NEUE ERGEBNISSE SEIT DEM LETZTEN BERICHT' "$out" >/dev/null; then
    fail "the outcome section duplicated the backstop in the same drain: $(cat "$out")"
  fi

  FM_STATE_OVERRIDE="$state" "$DRAIN" > "$dir/drain2.out" || fail "second drain failed"
  if grep -F 'checks green' "$dir/drain2.out" >/dev/null; then
    fail "a result the backstop already presented came back on the next drain: $(cat "$dir/drain2.out")"
  fi
  pass "a result the outcome backstop presents is recorded as presented and never repeated"
}

test_decisions_and_blockers_stay_with_open_decisions() {
  local dir state out
  dir=$(make_case decisions-owned)
  state="$dir/state"
  out="$dir/drain.out"
  printf 'needs-decision [key=merge]: Merge oder warten?\n' > "$state/task-d.status"
  printf 'blocked: release credential unavailable\n' > "$state/task-b.status"

  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "ingest failed"
  [ -z "$(FM_STATE_OVERRIDE="$state" "$DELIVERY" list-unpresented)" ] \
    || fail "a decision or blocker was registered as a captain outcome"
  FM_STATE_OVERRIDE="$state" "$DRAIN" > "$out" || fail "drain failed"
  grep -F 'task-d [key=merge] needs-decision: Merge oder warten?' "$out" >/dev/null \
    || fail "the decision left OPEN DECISIONS: $(cat "$out")"
  [ "$(grep -Fc 'Merge oder warten' "$out")" -eq 1 ] \
    || fail "the decision was presented twice in one drain: $(cat "$out")"
  if grep -F 'NEUE ERGEBNISSE SEIT DEM LETZTEN BERICHT' "$out" >/dev/null; then
    fail "decisions or blockers were presented as captain outcomes: $(cat "$out")"
  fi
  pass "decisions and blockers remain owned by OPEN DECISIONS"
}

test_branch_covered_result_is_not_registered() {
  local dir state
  dir=$(make_case branch-covered)
  state="$dir/state"
  printf 'done: shipped clean\nworking: tidying up\n' > "$state/jarvis.status"
  FM_STATE_OVERRIDE="$state" "$BRANCH_OUTCOME" append \
    --task jarvis --verdict captain --summary 'shipped clean was handled' >/dev/null \
    || fail "branch append failed"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "ingest failed"
  [ -z "$(FM_STATE_OVERRIDE="$state" "$DELIVERY" list-unpresented)" ] \
    || fail "a result the supervision branch already covered was registered again"

  printf 'done: zweite Runde fertig\nworking: naechste Runde\n' >> "$state/jarvis.status"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "second ingest failed"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$dir/present2.out" || fail "present failed"
  grep -F 'zweite Runde fertig' "$dir/present2.out" >/dev/null \
    || fail "a newer uncovered result of the same task was not presented: $(cat "$dir/present2.out")"
  if grep -F 'shipped clean' "$dir/present2.out" >/dev/null; then
    fail "the branch-covered result leaked into the outcome section"
  fi
  pass "a branch-covered result is skipped while a later uncovered one of the same task is delivered"
}

test_newest_event_is_held_for_the_backstop() {
  local dir state
  dir=$(make_case newest-held)
  state="$dir/state"
  printf 'done: PR https://example.test/7 checks green\n' > "$state/task-n.status"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "ingest failed"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$dir/present1.out" || fail "present failed"
  [ ! -s "$dir/present1.out" ] \
    || fail "a task's newest event was presented by the outcome section instead of the backstop: $(cat "$dir/present1.out")"
  printf 'working: cleanup after the PR\n' >> "$state/task-n.status"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$dir/present2.out" || fail "second present failed"
  grep -F 'checks green' "$dir/present2.out" >/dev/null \
    || fail "the result was not delivered once it was buried: $(cat "$dir/present2.out")"
  pass "a task's newest event is left to the outcome backstop until a later line buries it"
}

test_presentation_is_bounded() {
  local dir state i payload out
  dir=$(make_case bounded)
  state="$dir/state"
  payload=$(printf '%0300d' 0)
  i=1
  while [ "$i" -le 30 ]; do
    printf 'done: completion-%02d %s\nworking: next\n' "$i" "$payload" > "$state/task-$i.status"
    i=$((i + 1))
  done
  out="$dir/present.out"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$out" || fail "present failed"
  grep -F 'NOCH NICHT GEZEIGT:' "$out" >/dev/null \
    || fail "an over-budget outcome section did not report what it deferred: $(cat "$out")"
  [ "$(grep -c '^[0-9]*) task-' "$out")" -lt 30 ] || fail "the outcome section was not bounded"
  [ "$(awk '{ if (length > max) max=length } END { print max + 0 }' "$out")" -le 224 ] \
    || fail "an outcome item exceeded its per-item budget"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$dir/present2.out" || fail "second present failed"
  grep -F 'NEUE ERGEBNISSE' "$dir/present2.out" >/dev/null \
    || fail "deferred outcomes were not delivered on the next presentation"
  pass "the outcome section is byte-bounded and defers the remainder to the next presentation"
}

test_unpresented_survives_restart() {
  local dir state
  dir=$(make_case restart-safe)
  state="$dir/state"
  printf 'done: Bericht unter data/scout/report.md\nworking: Arbeitsverzeichnis aufgeraeumt\n' > "$state/scout.status"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "ingest failed"
  [ -n "$(FM_STATE_OVERRIDE="$state" "$DELIVERY" list-unpresented)" ] \
    || fail "expected unpresented outcome before restart simulation"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$dir/after-restart.out" || fail "present after restart failed"
  grep -F 'data/scout/report.md' "$dir/after-restart.out" >/dev/null \
    || fail "unpresented outcome did not survive restart simulation: $(cat "$dir/after-restart.out")"
  pass "unpresented outcomes survive simulated restart from disk"
}

test_catch_up_baselines_history_once() {
  local dir state
  dir=$(make_case catch-up)
  state="$dir/state"
  printf 'done: alte Runde, laengst berichtet\nworking: weiter\n' > "$state/old.status"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" catch-up >/dev/null || fail "catch-up failed"
  [ -z "$(FM_STATE_OVERRIDE="$state" "$DELIVERY" list-unpresented)" ] \
    || fail "catch-up presented history that predates the store as new"
  printf 'done: neue Runde fertig\nworking: weiter\n' >> "$state/old.status"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" catch-up >/dev/null || fail "second catch-up failed"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$dir/present.out" || fail "present failed"
  grep -F 'neue Runde fertig' "$dir/present.out" >/dev/null \
    || fail "a result after the baseline was not delivered: $(cat "$dir/present.out")"
  if grep -F 'alte Runde' "$dir/present.out" >/dev/null; then
    fail "the baselined history was presented after all"
  fi
  pass "catch-up baselines pre-store history once and keeps delivering later results"
}

test_branch_actor_skips_present() {
  local dir state
  dir=$(make_case branch-actor)
  state="$dir/state"
  printf 'done: branch actor darf nicht praesentieren\nworking: weiter\n' > "$state/task-b.status"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "ingest failed"
  FM_STATE_OVERRIDE="$state" FM_SUPERVISION_ACTOR=branch "$DELIVERY" present > "$dir/branch-present.out" || fail "branch present failed"
  [ ! -s "$dir/branch-present.out" ] || fail "branch actor should not present captain outcomes"
  [ -n "$(FM_STATE_OVERRIDE="$state" "$DELIVERY" list-unpresented)" ] \
    || fail "branch actor should not mark outcomes presented"
  pass "branch supervision actor does not consume captain presentation"
}

test_buried_result_is_presented_once_via_drain
test_backstop_presentation_is_not_repeated_by_the_outcome_section
test_decisions_and_blockers_stay_with_open_decisions
test_branch_covered_result_is_not_registered
test_newest_event_is_held_for_the_backstop
test_presentation_is_bounded
test_unpresented_survives_restart
test_catch_up_baselines_history_once
test_branch_actor_skips_present
