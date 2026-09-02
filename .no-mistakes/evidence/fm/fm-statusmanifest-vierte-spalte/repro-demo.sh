#!/usr/bin/env bash
# End-to-end demonstration: what an operator sees when bin/fm-teardown.sh cleans
# up a finished task whose $state/.status-presentation-cursor manifest is
# malformed. Drives the REAL bin/fm-teardown.sh through the repo's own teardown
# sandbox harness (tests/fm-teardown.test.sh helpers), never the library alone.
set -u
. /tmp/fm-ev/harness.sh

# Which tree's bin/ is under test (fixed worktree vs. base-commit copy).
if [ -n "${DEMO_ROOT:-}" ]; then
  ROOT=$DEMO_ROOT
  TEARDOWN="$ROOT/bin/fm-teardown.sh"
fi

scenario() {  # <name> <manifest-content-printf-fmt>
  local name=$1 manifest_line=$2 case_dir rc=0
  case_dir=$(make_case "$name")
  write_meta "$case_dir" local-only ship
  wt_commit "$case_dir" "fix the thing"
  add_fork_with_pushed_branch "$case_dir"
  # A finished, landed task whose fleet manifest carries the offending row plus
  # one healthy row for an unrelated task that must survive untouched.
  printf 'task-other\tident-other\t7\t3\n' >  "$case_dir/state/.status-presentation-cursor"
  printf '%b' "$manifest_line"             >> "$case_dir/state/.status-presentation-cursor"

  if [ -n "${POST_SETUP:-}" ]; then eval "$POST_SETUP"; fi

  echo "############################################################"
  echo "# scenario: $name"
  echo "# tree under test: $ROOT"
  echo "# state/.status-presentation-cursor before teardown:"
  ls -l "$case_dir/state/.status-presentation-cursor" | sed 's/^/#   /'
  cat -A "$case_dir/state/.status-presentation-cursor" 2>&1 | sed 's/^/#   /'
  echo "# \$ fm-teardown.sh task-x1"
  set +e
  run_teardown "$case_dir" > "$case_dir/stdout" 2> "$case_dir/stderr"
  rc=$?
  set -e
  echo "--- exit code: $rc"
  echo "--- stderr:"
  if [ -s "$case_dir/stderr" ]; then sed 's/^/    /' "$case_dir/stderr"; else echo "    (empty)"; fi
  echo "--- state/.status-presentation-cursor after teardown:"
  ls -l "$case_dir/state/.status-presentation-cursor" | sed 's/^/    /'
  cat -A "$case_dir/state/.status-presentation-cursor" 2>&1 | sed 's/^/    /'
  echo "--- task state files still present (nothing deleted on refusal):"
  ls "$case_dir/state" | sed 's/^/    /'
  echo
}

scenario "$1" "$2"
