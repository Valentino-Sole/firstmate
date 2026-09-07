#!/usr/bin/env bash
# Regression test for the fm-spawn.sh pool-slot double-assignment guard
# (bin/fm-spawn.sh, spawn_worktree_owner and the acquisition loop around
# `treehouse get`).
#
# The worktree pool decides a slot is free from the processes it can see running
# inside it, not from firstmate's record of which task the slot was handed to.
# Observed 2026-09-03: a slot still recorded to a live but parked task was handed
# to a second spawn while five other slots sat free, so two workers would have
# been editing one copy. These tests reproduce that shape with a fake tmux whose
# pane_current_path walks a scripted sequence of slots, and assert that a slot
# another task's state/<id>.meta still claims is refused and evaded, that the
# refusal is loud when no free slot ever arrives, and that a slot no live record
# claims is still accepted without a detour.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SPAWN="$ROOT/bin/fm-spawn.sh"
TMP_ROOT=$(fm_test_tmproot fm-spawn-pool-collision)

# make_pool_fakebin <dir> builds a fake tmux whose `#{pane_current_path}` query
# walks the newline-separated path sequence in FM_FAKE_PANE_SEQUENCE, one entry
# per call, repeating the last entry forever. That is how a pane that moves from
# one pool slot to another - or stubbornly stays in one - is reproduced without
# treehouse or a real terminal.
make_pool_fakebin() {
  local dir=$1 fakebin
  fakebin=$(fm_fakebin "$dir")
  cat > "$fakebin/tmux" <<'SH'
#!/usr/bin/env bash
set -u
case "$*" in
  *"#{pane_current_path}"*)
    countfile="${FM_FAKE_PANE_COUNTFILE:?FM_FAKE_PANE_COUNTFILE unset}"
    n=0
    [ -f "$countfile" ] && n=$(cat "$countfile")
    n=$((n + 1))
    printf '%s\n' "$n" > "$countfile"
    printf '%s\n' "${FM_FAKE_PANE_SEQUENCE:-}" | sed -n "${n}p" > "$countfile.read"
    if [ -s "$countfile.read" ]; then
      cat "$countfile.read"
    else
      printf '%s\n' "${FM_FAKE_PANE_SEQUENCE:-}" | tail -n 1
    fi
    exit 0
    ;;
esac
case "${1:-}" in
  display-message) printf 'firstmate\n'; exit 0 ;;
  list-windows) exit 0 ;;
  has-session|new-session|new-window|kill-window) exit 0 ;;
  send-keys) exit 0 ;;
esac
exit 0
SH
  chmod +x "$fakebin/tmux"
  fm_fake_exit0 "$fakebin" treehouse
  printf '%s\n' "$fakebin"
}

# make_pool_case <name> <id> <slot-count> builds a home, a primary project, and
# <slot-count> real worktrees of it standing in for pool slots. Slot paths are
# exported as POOL_SLOT_1..N.
make_pool_case() {
  local name=$1 id=$2 slots=$3 i
  CASE_DIR="$TMP_ROOT/$name"
  HOME_DIR="$CASE_DIR/home"
  PROJ_DIR="$CASE_DIR/project"
  COUNTFILE="$CASE_DIR/pane-call-count"
  FAKEBIN_DIR=$(make_pool_fakebin "$CASE_DIR/fake")
  mkdir -p "$HOME_DIR/data" "$HOME_DIR/projects" "$HOME_DIR/state" "$HOME_DIR/config"
  printf 'codex\n' > "$HOME_DIR/config/crew-harness"
  fm_git_init_commit "$PROJ_DIR"
  fm_git_add_origin "$PROJ_DIR" "$PROJ_DIR.origin.git"
  POOL_SLOTS=()
  for i in $(seq 1 "$slots"); do
    git -C "$PROJ_DIR" worktree add --quiet -b "pool-$name-$i" "$CASE_DIR/slot$i"
    POOL_SLOTS+=("$CASE_DIR/slot$i")
  done
  mkdir -p "$HOME_DIR/data/$id"
  cat > "$HOME_DIR/data/$id/brief.md" <<EOF
# Task
## Captain's intent
Exercise the pool-slot double-assignment guard for $id.

## Firstmate spec
Never launch into a copy another task still holds.
EOF
  touch "$HOME_DIR/state/.last-watcher-beat"
}

# occupy_slot <task-id> <slot-path>: record <slot-path> as <task-id>'s worktree,
# the way a live, not-yet-torn-down task's state/<id>.meta does.
occupy_slot() {
  fm_write_meta "$HOME_DIR/state/$1.meta" \
    "kind=ship" "project=$PROJ_DIR" "worktree=$2" \
    "window=firstmate:fm-$1" "harness=codex" "backend=tmux"
}

# run_pool_spawn <id> <pane-sequence>: spawn <id> with the fake pane walking
# <pane-sequence>. The settle window is shortened so the refusal paths do not
# sit out the full production wait.
run_pool_spawn() {
  local id=$1 sequence=$2
  FM_ROOT_OVERRIDE='' FM_HOME="$HOME_DIR" \
    FM_STATE_OVERRIDE="$HOME_DIR/state" FM_DATA_OVERRIDE="$HOME_DIR/data" \
    FM_PROJECTS_OVERRIDE="$HOME_DIR/projects" FM_CONFIG_OVERRIDE="$HOME_DIR/config" \
    FM_SPAWN_NO_GUARD=1 TMUX="fake,1,0" \
    FM_SPAWN_POOL_SETTLE_POLLS=4 \
    FM_FAKE_PANE_SEQUENCE="$sequence" FM_FAKE_PANE_COUNTFILE="$COUNTFILE" \
    PATH="$FAKEBIN_DIR:$PATH" \
    "$SPAWN" "$id" "$PROJ_DIR" --mode no-mistakes --yolo off 2>&1
}

# The incident itself: the pool offers a slot that another live task's record
# still claims. The spawn must refuse it and take the next slot the pool offers.
test_occupied_slot_is_evaded_for_a_free_one() {
  local id=pool-evade-z1 out status
  make_pool_case pool-evade "$id" 2
  occupy_slot parked-neighbour "${POOL_SLOTS[0]}"

  # Slot 1 settles first (the wrong hand-out), then the pane moves to slot 2.
  # The two extra slot-1 reads are the pane still standing in the refused slot
  # while the second `treehouse get` runs.
  out=$(run_pool_spawn "$id" "${POOL_SLOTS[0]}
${POOL_SLOTS[0]}
${POOL_SLOTS[0]}
${POOL_SLOTS[0]}
${POOL_SLOTS[1]}
${POOL_SLOTS[1]}")
  status=$?

  expect_code 0 "$status" "spawn should succeed after evading the occupied copy"
  assert_contains "$out" "spawned $id" "spawn did not report success"
  # On a miss, the useful evidence is what the spawn could actually see: the
  # records it checks and the copy each one claims.
  case "$out" in
    *"still assign to task parked-neighbour"*) ;;
    *) fail "spawn did not report that it evaded the occupied copy; records were: $(grep -H . "$HOME_DIR"/state/*.meta 2>&1 | tr '\n' ' ')" ;;
  esac
  assert_grep "worktree=${POOL_SLOTS[1]}" "$HOME_DIR/state/$id.meta" \
    "meta did not record the free copy the spawn evaded to"
  assert_no_grep "worktree=${POOL_SLOTS[0]}" "$HOME_DIR/state/$id.meta" \
    "meta recorded the copy another task still holds"
  pass "a pool copy another live task still holds is refused and evaded"
}

# The same collision with nothing left to evade to: the pool reports itself
# exhausted and leaves the pane where it stands. That must end in a loud refusal
# naming the holder, never in a worker launched into the occupied copy.
test_no_free_slot_refuses_loudly() {
  local id=pool-exhausted-z2 out status
  make_pool_case pool-exhausted "$id" 1
  occupy_slot parked-neighbour "${POOL_SLOTS[0]}"

  out=$(run_pool_spawn "$id" "${POOL_SLOTS[0]}")
  status=$?

  expect_code 1 "$status" "spawn should refuse when no free copy is ever offered"
  assert_contains "$out" "offered no copy that is free" \
    "refusal did not name the exhausted pool as the cause"
  assert_contains "$out" "belongs to task parked-neighbour" \
    "refusal did not name the task still holding the copy"
  [ ! -f "$HOME_DIR/state/$id.meta" ] ||
    fail "a refused spawn still recorded a task"
  pass "a pool with no free copy refuses loudly instead of sharing an occupied one"
}

# Every copy the pool hands out is recorded to some other task: the attempt cap
# has to end the loop, and it has to end it with a refusal.
test_all_offered_slots_occupied_refuses_within_cap() {
  local id=pool-allbusy-z3 out status
  make_pool_case pool-allbusy "$id" 5
  occupy_slot neighbour-a "${POOL_SLOTS[0]}"
  occupy_slot neighbour-b "${POOL_SLOTS[1]}"
  occupy_slot neighbour-c "${POOL_SLOTS[2]}"
  occupy_slot neighbour-d "${POOL_SLOTS[3]}"

  out=$(run_pool_spawn "$id" "${POOL_SLOTS[0]}
${POOL_SLOTS[0]}
${POOL_SLOTS[1]}
${POOL_SLOTS[1]}
${POOL_SLOTS[2]}
${POOL_SLOTS[2]}
${POOL_SLOTS[3]}
${POOL_SLOTS[3]}
${POOL_SLOTS[4]}
${POOL_SLOTS[4]}")
  status=$?

  expect_code 1 "$status" "spawn should refuse once the attempt cap is spent"
  assert_contains "$out" "over 4 attempts" "refusal did not name the spent attempt cap"
  assert_contains "$out" "neighbour-d" "refusal did not list every refused copy"
  [ ! -f "$HOME_DIR/state/$id.meta" ] ||
    fail "a refused spawn still recorded a task"
  pass "a pool that only ever offers occupied copies refuses within the attempt cap"
}

# The guard keys on firstmate's records, not on the copy merely existing: a copy
# no live record claims is taken on the first ask, with no detour and no note.
test_unclaimed_slot_is_taken_immediately() {
  local id=pool-free-z4 out status
  make_pool_case pool-free "$id" 2
  occupy_slot parked-neighbour "${POOL_SLOTS[1]}"

  out=$(run_pool_spawn "$id" "${POOL_SLOTS[0]}
${POOL_SLOTS[0]}")
  status=$?

  expect_code 0 "$status" "spawn should take an unclaimed copy directly"
  assert_grep "worktree=${POOL_SLOTS[0]}" "$HOME_DIR/state/$id.meta" \
    "meta did not record the unclaimed copy"
  assert_not_contains "$out" "asking it for another copy" \
    "spawn evaded a copy no live record claims"
  pass "a copy no live record claims is taken on the first ask"
}

# A torn-down task's copy is free: fm-teardown.sh removes state/<id>.meta as it
# lands the backlog transition, so leftovers that are not a meta must not make a
# returned copy look occupied forever.
test_torn_down_tasks_copy_is_free() {
  local id=pool-tornodown-z5 out status
  make_pool_case pool-torndown "$id" 1
  printf 'done: landed\n' > "$HOME_DIR/state/gone-neighbour.status"

  out=$(run_pool_spawn "$id" "${POOL_SLOTS[0]}
${POOL_SLOTS[0]}")
  status=$?

  expect_code 0 "$status" "spawn should take a torn-down task's copy"
  assert_grep "worktree=${POOL_SLOTS[0]}" "$HOME_DIR/state/$id.meta" \
    "meta did not record the returned copy"
  pass "a copy whose task record teardown removed counts as free"
}

test_occupied_slot_is_evaded_for_a_free_one
test_no_free_slot_refuses_loudly
test_all_offered_slots_occupied_refuses_within_cap
test_unclaimed_slot_is_taken_immediately
test_torn_down_tasks_copy_is_free

echo "# all fm-spawn-pool-collision tests passed"
