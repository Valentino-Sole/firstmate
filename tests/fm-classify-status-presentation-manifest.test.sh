#!/usr/bin/env bash
# tests/fm-classify-status-presentation-manifest.test.sh - regressions for
# $state/.status-presentation-cursor row validation in bin/fm-classify-lib.sh.
#
# Incident: a manifest row with a column count the running reader did not
# expect made status_retire_presentation_task fail with `[ -n "$extra" ] ||
# return 1` and no other output, so bin/fm-teardown.sh exited 1 with nothing on
# stderr. Four already-finished tasks stayed stuck "in flight" because nobody
# could see why cleanup refused to run. Root cause: commit d977128 (PR #3495,
# 2026-09-02) widened this manifest from 3 to 4 TAB-separated fields
# (task, ident, offset, backstop) in the same commit that updated the reader,
# so a process still running the pre-d977128 3-field reader against a
# post-d977128 4-field row it had not yet picked up hit the silent branch.
# Firstmate's own header comment above status_presentation_cursor_offset (bin/
# fm-classify-lib.sh) is this format's one owner; these tests pin its row
# contract from the outside, through the real reader functions, never through
# the manifest's raw bytes.
#
# These tests cover the three malformed-row shapes named in the task brief -
# an unexpected extra column, a missing field, and a non-numeric offset -
# recalibrated to the CURRENT valid 4-field width (an extra column today means
# a 5th field, since 4 is the current, correct shape; see the positive control
# test below). Every case asserts BOTH halves of the fix: a stderr line naming
# the manifest path, the row's line number, and the expected format (never a
# silent `return 1`), and that nothing is deleted or rewritten - the existing
# fail-closed safety this task must not weaken.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# shellcheck source=bin/fm-classify-lib.sh
. "$ROOT/bin/fm-classify-lib.sh"

TMP_ROOT=$(fm_test_tmproot fm-classify-status-presentation-manifest-tests)

case_dir() {  # <name>
  local d="$TMP_ROOT/$1"
  mkdir -p "$d/state"
  printf '%s' "$d"
}

# A real ident for a fixture status file, exactly as the library computes it -
# used only for the positive control, since every malformed-row failure below
# triggers on format alone, before any ident comparison runs.
file_ident() {  # <status-file>
  _fm_open_decisions_file_ident "$1"
}

# Run status_retire_presentation_task in a subshell with its own STATE, the way
# bin/fm-teardown.sh does: fm-classify-lib.sh alone has no lock primitives, so
# fm-wake-lib.sh (the real caller's other sourced sibling) supplies
# fm_lock_acquire_wait/fm_lock_release. Captures stdout, stderr, and exit code
# so a test can assert on all three independently.
run_retire() {  # <state> <task> <out> <err>
  local state=$1 task=$2 out=$3 err=$4 rc=0
  FM_STATE_OVERRIDE="$state" bash -c '
    # shellcheck disable=SC1090,SC1091
    . "$1"
    # shellcheck disable=SC1090,SC1091
    . "$2"
    status_retire_presentation_task "$3" "$4"
  ' _ "$ROOT/bin/fm-wake-lib.sh" "$ROOT/bin/fm-classify-lib.sh" "$state" "$task" \
    > "$out" 2> "$err" || rc=$?
  return "$rc"
}

# --- status_presentation_cursor_offset: the three malformed-row shapes ------

test_extra_column_fails_loudly_and_names_the_row() {
  local dir state f manifest err rc=0
  dir=$(case_dir extra-column)
  state="$dir/state"
  f="$state/task-a.status"
  printf 'working: setup\n' > "$f"
  manifest="$state/.status-presentation-cursor"
  printf 'task-a\tident-a\t12\t0\tstray\n' > "$manifest"
  err="$dir/err"

  status_presentation_cursor_offset "$f" > /dev/null 2> "$err" && rc=0 || rc=$?
  [ "$rc" -eq 1 ] || fail "an unexpected extra column did not fail closed (rc=$rc)"
  grep -qF "$manifest:1:" "$err" \
    || fail "the error did not name the manifest and line number: $(cat "$err")"
  grep -qi 'extra field' "$err" \
    || fail "the error did not name the reason (extra field): $(cat "$err")"
  grep -qF 'task, ident, offset, backstop' "$err" \
    || fail "the error did not state the expected 4-field format: $(cat "$err")"
  pass "a manifest row with one column too many fails closed with a stderr line naming the manifest, line, and expected format"
}

test_missing_field_fails_loudly_and_names_the_row() {
  local dir state f manifest err rc=0
  dir=$(case_dir missing-field)
  state="$dir/state"
  f="$state/task-b.status"
  printf 'working: setup\n' > "$f"
  manifest="$state/.status-presentation-cursor"
  # Only task and ident: offset and backstop are absent, not merely empty.
  printf 'task-b\tident-b\n' > "$manifest"
  err="$dir/err"

  status_presentation_cursor_offset "$f" > /dev/null 2> "$err" && rc=0 || rc=$?
  [ "$rc" -eq 1 ] || fail "a manifest row missing its offset field did not fail closed (rc=$rc)"
  grep -qF "$manifest:1:" "$err" \
    || fail "the error did not name the manifest and line number: $(cat "$err")"
  grep -qi 'missing' "$err" \
    || fail "the error did not name the reason (missing field): $(cat "$err")"
  pass "a manifest row with a missing field fails closed with a stderr line naming the manifest, line, and expected format"
}

test_non_numeric_offset_fails_loudly_and_names_the_row() {
  local dir state f manifest err rc=0
  dir=$(case_dir non-numeric-offset)
  state="$dir/state"
  f="$state/task-c.status"
  printf 'working: setup\n' > "$f"
  manifest="$state/.status-presentation-cursor"
  printf 'task-c\tident-c\tNaN\t0\n' > "$manifest"
  err="$dir/err"

  status_presentation_cursor_offset "$f" > /dev/null 2> "$err" && rc=0 || rc=$?
  [ "$rc" -eq 1 ] || fail "a non-numeric offset did not fail closed (rc=$rc)"
  grep -qF "$manifest:1:" "$err" \
    || fail "the error did not name the manifest and line number: $(cat "$err")"
  grep -qi 'non-numeric' "$err" \
    || fail "the error did not name the reason (non-numeric offset): $(cat "$err")"
  pass "a manifest row with a non-numeric offset fails closed with a stderr line naming the manifest, line, and expected format"
}

# A malformed row on ANY task blocks every task's lookup against the same
# manifest, exactly as the reported incident affected four unrelated tasks.
test_a_malformed_row_for_another_task_still_blocks_this_lookup() {
  local dir state f manifest err rc=0
  dir=$(case_dir cross-task-blast-radius)
  state="$dir/state"
  f="$state/task-d.status"
  printf 'working: setup\n' > "$f"
  manifest="$state/.status-presentation-cursor"
  {
    printf 'task-d\tident-d\t5\t0\n'
    printf 'task-unrelated\tident-x\tNaN\t0\n'
  } > "$manifest"
  err="$dir/err"

  status_presentation_cursor_offset "$f" > /dev/null 2> "$err" && rc=0 || rc=$?
  [ "$rc" -eq 1 ] || fail "a malformed row for an unrelated task did not block this task's lookup (rc=$rc)"
  grep -qF "$manifest:2:" "$err" \
    || fail "the error did not name the offending line (2), not the well-formed one: $(cat "$err")"
  pass "one malformed row blocks every task's lookup against the shared manifest, matching the reported blast radius"
}

# Positive control: the historical incident's exact 4-field shape (task, ident,
# offset, "0") is the CURRENT valid format (commit d977128) and must keep
# parsing successfully - this fix only makes an actually malformed row loud,
# it does not narrow what counts as well-formed.
test_the_reported_four_field_row_is_valid_today() {
  local dir state f manifest ident offset err
  dir=$(case_dir reported-shape-is-valid)
  state="$dir/state"
  f="$state/task-e.status"
  printf 'working: setup\nworking: more\n' > "$f"
  ident=$(file_ident "$f") || fail "could not compute a fixture ident"
  manifest="$state/.status-presentation-cursor"
  printf 'task-e\t%s\t7\t0\n' "$ident" > "$manifest"
  err="$dir/err"

  offset=$(status_presentation_cursor_offset "$f" 2> "$err") \
    || fail "the current 4-field format was rejected: $(cat "$err")"
  [ -z "$(cat "$err")" ] || fail "a well-formed row printed an unexpected diagnostic: $(cat "$err")"
  [ "$offset" = 7 ] || fail "the offset from a well-formed row was not read through: got '$offset'"
  pass "the exact 4-field shape from the reported incident is the current valid format and stays silent"
}

# --- status_retire_presentation_task: fm-teardown.sh's own call path --------

test_teardown_retire_surfaces_the_error_and_deletes_nothing() {
  local dir state f manifest out err rc=0
  dir=$(case_dir retire-malformed-manifest)
  state="$dir/state"
  f="$state/task-f.status"
  printf 'done: ready\n' > "$f"
  manifest="$state/.status-presentation-cursor"
  printf 'task-f\tident-f\t4\t0\tstray\n' > "$manifest"
  out="$dir/out"; err="$dir/err"

  run_retire "$state" task-f "$out" "$err" && rc=0 || rc=$?
  [ "$rc" -eq 1 ] || fail "status_retire_presentation_task did not fail closed on a malformed manifest (rc=$rc)"
  grep -qF "$manifest:1:" "$err" \
    || fail "status_retire_presentation_task's caller (fm-teardown.sh's own stderr) got no diagnostic: $(cat "$err")"
  grep -qi 'extra field' "$err" \
    || fail "status_retire_presentation_task's diagnostic did not name the reason: $(cat "$err")"
  [ -f "$f" ] || fail "a malformed manifest must never cause the status file to be deleted"
  [ -f "$manifest" ] || fail "a malformed manifest must never be deleted outright"
  grep -qF 'task-f' "$manifest" \
    || fail "the malformed manifest must be left exactly as found, not silently rewritten"
  pass "fm-teardown.sh's own retire call surfaces a manifest error on stderr and leaves the status file and manifest untouched"
}

test_teardown_retire_succeeds_on_a_well_formed_manifest() {
  local dir state f manifest ident out err rc=0
  dir=$(case_dir retire-well-formed-manifest)
  state="$dir/state"
  f="$state/task-g.status"
  printf 'done: ready\n' > "$f"
  ident=$(file_ident "$f") || fail "could not compute a fixture ident"
  manifest="$state/.status-presentation-cursor"
  printf 'task-g\t%s\t4\t0\n' "$ident" > "$manifest"
  out="$dir/out"; err="$dir/err"

  run_retire "$state" task-g "$out" "$err" && rc=0 || rc=$?
  [ "$rc" -eq 0 ] || fail "retirement over a well-formed 4-field manifest failed (rc=$rc): $(cat "$err")"
  [ -z "$(cat "$err")" ] || fail "a successful retirement printed an unexpected diagnostic: $(cat "$err")"
  [ ! -e "$f" ] || fail "retirement did not remove the retired task's status file"
  pass "retirement over the current 4-field manifest format still succeeds and stays silent"
}

test_extra_column_fails_loudly_and_names_the_row
test_missing_field_fails_loudly_and_names_the_row
test_non_numeric_offset_fails_loudly_and_names_the_row
test_a_malformed_row_for_another_task_still_blocks_this_lookup
test_the_reported_four_field_row_is_valid_today
test_teardown_retire_surfaces_the_error_and_deletes_nothing
test_teardown_retire_succeeds_on_a_well_formed_manifest
