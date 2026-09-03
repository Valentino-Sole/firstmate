#!/usr/bin/env bash
# tests/fm-spawn-override-reset.test.sh - regression coverage for the
# FM_*_OVERRIDE reset in the launch line bin/fm-spawn.sh sends into a fresh
# pane (AGENTS.md "Layout and state": FM_ROOT_OVERRIDE, FM_HOME,
# FM_STATE_OVERRIDE, FM_DATA_OVERRIDE, FM_PROJECTS_OVERRIDE,
# FM_CONFIG_OVERRIDE).
#
# Before this fix, that reset lived only inside the `KIND = secondmate`
# branch, so an ordinary ship/scout worker's pane received no reset at all: a
# pane that inherits environment from elsewhere in the launching process tree
# (for example a secondmate context still live in that tree) could carry a
# foreign home's override values straight into the worker's own watcher and
# fm-*.sh helpers, which then looked at the wrong home. The fix hoists the
# five-variable reset out of the KIND-specific branch so it applies to every
# spawn regardless of kind, while the FM_HOME redirect (and the
# secondmate-only extras riding with it) stays secondmate-exclusive.
#
# These tests drive a REAL fm-spawn.sh ship spawn (and a real secondmate
# spawn) against a fake tmux pane that logs the literal `send-keys -l`
# payload, exactly as tests/fm-trace-context-spawn.test.sh does, and inspect
# the captured launch line.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SPAWN="$ROOT/bin/fm-spawn.sh"
TMP_ROOT=$(fm_test_tmproot fm-spawn-override-reset)
export FM_BACKEND=tmux

RESET_PREFIX='FM_ROOT_OVERRIDE= FM_STATE_OVERRIDE= FM_DATA_OVERRIDE= FM_PROJECTS_OVERRIDE= FM_CONFIG_OVERRIDE='

write_ship_brief() {  # <file> <id>
  cat > "$1" <<EOF
# Task
## Captain's intent
Exercise the override reset for $2.

## Firstmate spec
Verify the spawned process's launch line clears the FM_*_OVERRIDE variables.
EOF
}

# Fake tmux: answers the pane-path query and logs every literal `send-keys -l`
# argument (the launch command) one per line, mirroring
# tests/fm-trace-context-spawn.test.sh's fixture.
make_spawn_fakebin() {
  local dir=$1 fakebin
  fakebin=$(fm_fakebin "$dir")
  cat > "$fakebin/tmux" <<'SH'
#!/usr/bin/env bash
set -u
case "$*" in
  *"#{pane_current_path}"*) printf '%s\n' "${FM_FAKE_PANE_PATH:-}"; exit 0 ;;
esac
case "${1:-}" in
  display-message) printf 'firstmate\n'; exit 0 ;;
  list-windows) exit 0 ;;
  has-session|new-session|new-window|kill-window) exit 0 ;;
  send-keys)
    if [ -n "${FM_FAKE_LAUNCH_LOG:-}" ]; then
      shift
      skip_next=
      for a in "$@"; do
        if [ -n "$skip_next" ]; then skip_next=; continue; fi
        case "$a" in
          -t) skip_next=1; continue ;;
          -l) continue ;;
          Enter|C-m) continue ;;
          *) printf '%s\n' "$a" >> "$FM_FAKE_LAUNCH_LOG" ;;
        esac
      done
    fi
    exit 0
    ;;
esac
exit 0
SH
  chmod +x "$fakebin/tmux"
  fm_fake_exit0 "$fakebin" treehouse
  printf '%s\n' "$fakebin"
}

# A ship spawn: the launching (parent) environment carries live, non-empty
# FM_*_OVERRIDE values that correctly resolve fm-spawn.sh's own home, exactly
# as an ordinary crewmate spawn's invoking environment does. The captured
# launch line must still clear all five, proving the reset does not depend on
# KIND.
test_ship_spawn_clears_overrides_set_in_parent_env() {
  local case_dir home proj wt fakebin launchlog id out status log_line
  case_dir="$TMP_ROOT/ship"
  home="$case_dir/home"
  proj="$case_dir/project"
  wt="$case_dir/wt"
  launchlog="$case_dir/launch.log"
  fakebin=$(make_spawn_fakebin "$case_dir/fake")
  mkdir -p "$home/data" "$home/projects" "$home/state" "$home/config"
  printf 'claude\n' > "$home/config/crew-harness"
  printf '%s\n' "$$" > "$home/state/.lock"
  fm_git_worktree "$proj" "$wt" "wt-ship"
  touch "$home/state/.last-watcher-beat"
  id=ship-override-z1
  mkdir -p "$home/data/$id"
  write_ship_brief "$home/data/$id/brief.md" "$id"
  : > "$launchlog"

  # The parent env sets every override to a real, correctly-resolving value
  # (matching this test's own home fixtures) - the same shape a genuine
  # invoking firstmate process has. Nothing here is empty going in.
  out=$(env FM_ROOT_OVERRIDE="$ROOT" FM_HOME="$home" \
    FM_STATE_OVERRIDE="$home/state" FM_DATA_OVERRIDE="$home/data" \
    FM_PROJECTS_OVERRIDE="$home/projects" FM_CONFIG_OVERRIDE="$home/config" \
    FM_SPAWN_NO_GUARD=1 FM_FAKE_PANE_PATH="$wt" TMUX="fake,1,0" \
    FM_FAKE_LAUNCH_LOG="$launchlog" PATH="$fakebin:$PATH" \
    "$SPAWN" "$id" "$proj" --mode no-mistakes --yolo off 2>&1)
  status=$?
  expect_code 0 "$status" "ship spawn with parent-env overrides set should succeed"
  assert_contains "$out" "spawned $id" "ship spawn should report success"

  [ -s "$launchlog" ] || fail "ship spawn logged no launch line"
  log_line=$(cat "$launchlog")
  assert_contains "$log_line" "$RESET_PREFIX" \
    "ship spawn's launch line must clear all five FM_*_OVERRIDE variables even though the parent environment set them"
  assert_not_contains "$log_line" "FM_ROOT_OVERRIDE=$ROOT" \
    "ship spawn's launch line must not carry the parent's FM_ROOT_OVERRIDE value into the pane"
  assert_not_contains "$log_line" "FM_STATE_OVERRIDE=$home/state" \
    "ship spawn's launch line must not carry the parent's FM_STATE_OVERRIDE value into the pane"
  pass "ship spawn clears FM_*_OVERRIDE in the launch line regardless of what the parent environment set"
}

# A secondmate spawn: the same five-variable reset must still apply, AND the
# secondmate-only FM_HOME redirect (to the secondmate's own home) must still
# ride alongside it - proving the refactor split the two concerns without
# dropping either.
test_secondmate_spawn_still_clears_overrides_and_redirects_home() {
  local base prim sm sm_id fakebin launchlog out status log_line
  base="$TMP_ROOT/secondmate"
  prim="$base/primary"
  sm="$base/sm"
  mkdir -p "$prim/config" "$prim/data" "$prim/state" "$prim/projects"
  printf 'claude\n' > "$prim/config/crew-harness"
  printf '%s\n' "$$" > "$prim/state/.lock"
  touch "$prim/state/.last-watcher-beat"

  sm_id='sm-override-z1'
  mkdir -p "$sm/bin" "$sm/data"
  printf '# Firstmate\n' > "$sm/AGENTS.md"
  printf '%s\n' "$sm_id" > "$sm/.fm-secondmate-home"
  printf 'charter\n' > "$sm/data/charter.md"

  mkdir -p "$prim/data/$sm_id"
  printf 'charter brief\n' > "$prim/data/$sm_id/brief.md"
  fakebin=$(make_spawn_fakebin "$base/fake")
  launchlog="$base/launch.log"
  : > "$launchlog"

  out=$(env FM_ROOT_OVERRIDE="$ROOT" FM_HOME="$prim" \
    FM_STATE_OVERRIDE="$prim/state" FM_DATA_OVERRIDE="$prim/data" \
    FM_PROJECTS_OVERRIDE="$prim/projects" FM_CONFIG_OVERRIDE="$prim/config" \
    FM_SPAWN_NO_GUARD=1 CLAUDECODE=1 TMUX="fake,1,0" \
    FM_FAKE_LAUNCH_LOG="$launchlog" PATH="$fakebin:$PATH" \
    "$SPAWN" "$sm_id" "$sm" --secondmate 2>&1)
  status=$?
  expect_code 0 "$status" "secondmate spawn with parent-env overrides set should succeed"
  assert_contains "$out" "spawned $sm_id" "secondmate spawn should report success"

  [ -s "$launchlog" ] || fail "secondmate spawn logged no launch line"
  log_line=$(cat "$launchlog")
  assert_contains "$log_line" "$RESET_PREFIX" \
    "secondmate spawn's launch line must still clear all five FM_*_OVERRIDE variables"
  assert_contains "$log_line" "FM_HOME='$sm'" \
    "secondmate spawn's launch line must still redirect FM_HOME to the secondmate's own home"
  assert_not_contains "$log_line" "FM_HOME='$prim'" \
    "secondmate spawn's launch line must not leave FM_HOME pointed at the primary's home"
  pass "secondmate spawn keeps both the override reset and its own FM_HOME redirect"
}

test_ship_spawn_clears_overrides_set_in_parent_env
test_secondmate_spawn_still_clears_overrides_and_redirects_home

echo "# all fm-spawn-override-reset tests passed"
