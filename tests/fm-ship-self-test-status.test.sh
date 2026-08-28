#!/usr/bin/env bash
# tests/fm-ship-self-test-status.test.sh - ship workers must report Tests N/0
# before terminal done:. fm-classify-lib.sh owns detection; fm-merge-local.sh
# refuses local-only landing without it; fm-brief.sh and fm-spawn.sh carry the
# scaffold contract.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# shellcheck source=bin/fm-classify-lib.sh
. "$ROOT/bin/fm-classify-lib.sh"

TMP_ROOT=$(fm_test_tmproot fm-ship-self-test-status)

test_status_has_self_test_report_accepts_common_shapes() {
  status_has_self_test_report 'done: ready in branch fm/x · Tests 42/0' \
    || fail "done line with middle-dot Tests N/0 was rejected"
  status_has_self_test_report 'working: tests 3/0 gelaufen' \
    || fail "lowercase tests N/0 was rejected"
  status_has_self_test_report 'done: PR https://example.com/pull/1 · Tests 10/0' \
    || fail "PR done line with Tests N/0 was rejected"
  pass "status_has_self_test_report accepts common Tests N/0 shapes"
}

test_status_has_self_test_report_rejects_missing_counts() {
  status_has_self_test_report 'done: ready in branch fm/x' && fail "bare done was accepted"
  status_has_self_test_report 'done: ready in branch fm/x · Tests ok' && fail "prose without N/0 was accepted"
  pass "status_has_self_test_report rejects lines without Tests N/0"
}

test_status_log_self_test_reported_before_done() {
  local dir="$TMP_ROOT/log-fold"
  mkdir -p "$dir"

  printf 'working: setup\n\ndone: ready in branch fm/x\n' > "$dir/missing.status"
  status_log_self_test_reported_before_done "$dir/missing.status" && fail "done without Tests N/0 was accepted"

  printf 'working: Tests 5/0\n\ndone: ready in branch fm/x\n' > "$dir/working.status"
  status_log_self_test_reported_before_done "$dir/working.status" \
    || fail "working-line Tests N/0 before done was rejected"

  printf 'done: ready in branch fm/x · Tests 5/0\n' > "$dir/done.status"
  status_log_self_test_reported_before_done "$dir/done.status" \
    || fail "Tests N/0 on the done line was rejected"
  pass "status_log_self_test_reported_before_done honors working and done lines"
}

setup_merge_fixture() {  # <home> <id>
  local home=$1 id=$2 proj="$home/proj"
  git init -q -b main "$proj"
  git -C "$proj" commit -q --allow-empty -m init
  git -C "$proj" checkout -q -b "fm/$id"
  git -C "$proj" commit -q --allow-empty -m ship
  git -C "$proj" checkout -q main
  mkdir -p "$home/state"
  printf 'project=%s\nmode=local-only\n' "$proj" > "$home/state/$id.meta"
}

test_merge_local_refuses_done_without_self_test_report() {
  local home="$TMP_ROOT/refuse-home" id=task-refuse out status
  setup_merge_fixture "$home" "$id"
  printf 'done: ready in branch fm/%s\n' "$id" > "$home/state/$id.status"
  out=$(FM_HOME="$home" FM_ROOT_OVERRIDE="$ROOT" "$ROOT/bin/fm-merge-local.sh" "$id" 2>&1)
  status=$?
  [ "$status" -ne 0 ] || fail "merge-local succeeded without Tests N/0"
  assert_contains "$out" "self-test report" "merge-local refusal lost its reason"
  pass "fm-merge-local refuses local-only landing without Tests N/0"
}

test_merge_local_lands_when_self_test_reported() {
  local home="$TMP_ROOT/land-home" id=task-land out status
  setup_merge_fixture "$home" "$id"
  printf 'done: ready in branch fm/%s · Tests 3/0\n' "$id" > "$home/state/$id.status"
  out=$(FM_HOME="$home" FM_ROOT_OVERRIDE="$ROOT" "$ROOT/bin/fm-merge-local.sh" "$id" 2>&1)
  status=$?
  expect_code 0 "$status" "merge-local with Tests N/0 failed: $out"
  assert_contains "$out" "merged fm/$id" "merge-local did not land the branch"
  pass "fm-merge-local lands when Tests N/0 precedes terminal done:"
}

test_ship_brief_scaffold_carries_self_test_contract() {
  local home="$TMP_ROOT/brief-home" brief
  mkdir -p "$home/data"
  FM_HOME="$home" "$ROOT/bin/fm-brief.sh" brief-selftest ship-proj --mode local-only >/dev/null 2>&1 \
    || fail "local-only brief scaffold failed"
  brief="$home/data/brief-selftest/brief.md"
  assert_grep '# Self-test before done' "$brief" "ship brief missing self-test section"
  assert_grep 'Tests N/0' "$brief" "ship brief missing Tests N/0 contract"
  assert_grep 'done: ready in branch fm/brief-selftest · Tests N/0' "$brief" \
    "local-only DOD did not require Tests N/0 on done"
  pass "fm-brief.sh: ship scaffolds carry the self-test contract"
}

test_status_has_self_test_report_accepts_common_shapes
test_status_has_self_test_report_rejects_missing_counts
test_status_log_self_test_reported_before_done
test_merge_local_refuses_done_without_self_test_report
test_merge_local_lands_when_self_test_reported
test_ship_brief_scaffold_carries_self_test_contract
