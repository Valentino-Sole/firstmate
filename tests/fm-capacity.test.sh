#!/usr/bin/env bash
# Behavior tests for resource-aware parallel dispatch: slot formula, live
# host-scoped occupancy, same-task uniqueness, refuse-rather-than-kill spawn
# gating, and preferred-then-fallback host routing from fresh probes.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# shellcheck source=bin/fm-capacity-lib.sh
. "$ROOT/bin/fm-capacity-lib.sh"

SCRIPT="$ROOT/bin/fm-capacity.sh"
SPAWN="$ROOT/bin/fm-spawn.sh"
TMP_ROOT=$(fm_test_tmproot fm-capacity)

setup_home() {
  local dir=$1
  mkdir -p "$dir/state" "$dir/config" "$dir/data" "$dir/projects/demo"
}

run_capacity() {
  local home=$1
  shift
  FM_HOME="$home" FM_ROOT_OVERRIDE="" \
    FM_STATE_OVERRIDE="" FM_CONFIG_OVERRIDE="" \
    "$SCRIPT" "$@"
}

write_ship_meta() {
  local home=$1 id=$2
  fm_write_meta "$home/state/$id.meta" \
    "window=firstmate:fm-$id" \
    "endpoint_task_id=$id" \
    "kind=ship" \
    "harness=echo"
}

# A tmux stand-in whose session window list is the fixture: a task whose window
# is listed has a live agent pane, a task whose window is absent is an
# authoritatively gone endpoint. That is exactly the distinction the capacity
# budget must draw between a running worker and a parked record.
make_fake_tmux() {
  local fakebin=$1
  cat > "$fakebin/tmux" <<'SH'
#!/usr/bin/env bash
set -u
cmd=${1:-}
shift || true
session=; fmt=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -p) shift ;;
    -t) session=${2%%:*}; shift 2 ;;
    -F) shift 2 ;;
    *) fmt=$1; shift ;;
  esac
done
dir=${FM_FAKE_TMUX_DIR:-}
case "$cmd" in
  list-windows)
    if [ -n "$dir" ] && [ -f "$dir/$session" ]; then
      cat "$dir/$session"
      exit 0
    fi
    printf "can't find session: %s\n" "$session" >&2
    exit 1
    ;;
  display-message)
    [ "$fmt" = '#{pane_current_command}' ] && printf 'claude\n'
    exit 0
    ;;
esac
exit 1
SH
  chmod +x "$fakebin/tmux"
}

# Declare which task windows are live in the fake tmux session for <home>.
set_live_windows() {
  local home=$1
  shift
  local id
  mkdir -p "$home/tmux"
  : > "$home/tmux/firstmate"
  for id in "$@"; do
    printf 'fm-%s\n' "$id" >> "$home/tmux/firstmate"
  done
}

# Run <home>'s capacity CLI with the fake tmux answering endpoint liveness.
run_capacity_live() {
  local home=$1
  shift
  local fakebin
  fakebin=$(fm_fakebin "$home")
  make_fake_tmux "$fakebin"
  PATH="$fakebin:$PATH" FM_FAKE_TMUX_DIR="$home/tmux" \
    run_capacity "$home" "$@"
}

make_fake_ssh() {
  local fakebin=$1
  cat > "$fakebin/ssh" <<'SH'
#!/usr/bin/env bash
set -u
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) shift 2 ;;
    -*) shift ;;
    *) break ;;
  esac
done
host=${1:-}
shift || true
dir=${FM_FAKE_SSH_DIR:-}
if [ -n "$dir" ] && [ -f "$dir/$host" ]; then
  cat "$dir/$host"
  exit 0
fi
exit 255
SH
  chmod +x "$fakebin/ssh"
}

test_slots_allow_five_on_healthy_supervisor() {
  local got
  got=$(fm_capacity_slots_from_local 16 24576 0.4)
  [ "$got" = 5 ] || fail "healthy 16-CPU/24GiB host should yield 5 slots, got $got"
  pass "healthy supervisor measurements yield five worker slots"
}

test_slots_drop_to_zero_when_load_saturates() {
  local got
  got=$(fm_capacity_slots_from_local 16 24576 16)
  [ "$got" = 0 ] || fail "load1==nproc should yield 0 slots, got $got"
  pass "saturated load yields zero new slots"
}

test_slots_drop_when_ram_is_tight() {
  local got
  got=$(fm_capacity_slots_from_local 16 4096 0.4)
  [ "$got" = 0 ] || fail "mem at the reserve floor should yield 0 slots, got $got"
  got=$(fm_capacity_slots_from_local 16 7168 0.4)
  [ "$got" = 1 ] || fail "one RAM slot of headroom should yield 1, got $got"
  pass "RAM axis cuts slots without a hardcoded agent count"
}

test_slots_small_host_keeps_one_when_healthy() {
  local got
  got=$(fm_capacity_slots_from_local 2 24576 0.2)
  [ "$got" = 1 ] || fail "healthy 2-CPU host should keep 1 slot, got $got"
  pass "small healthy hosts keep a single slot rather than a rigid zero"
}

test_slots_high_but_not_full_load_caps_at_one() {
  local got
  got=$(fm_capacity_slots_from_local 16 24576 11.2)
  [ "$got" = 1 ] || fail "70 percent load should cap at 1 slot, got $got"
  pass "elevated load caps new parallelism at one"
}

test_occupied_counts_ship_and_scout_not_secondmates() {
  local home n
  home="$TMP_ROOT/occupied"
  setup_home "$home"
  write_ship_meta "$home" ship-a1
  write_ship_meta "$home" ship-b2
  fm_write_meta "$home/state/scout-c3.meta" kind=scout window=firstmate:fm-scout-c3
  fm_write_secondmate_meta "$home/state/jarvis.meta" "$home/jarvis-home"
  set_live_windows "$home" ship-a1 ship-b2 scout-c3 jarvis
  n=$(run_capacity_live "$home" slots | sed -n 's/^occupied=//p')
  [ "$n" = 3 ] || fail "occupied should count 2 ship + 1 scout, not the secondmate; got $n"
  pass "occupied slots are live ship and scout workers, not idle secondmates"
}

test_parked_task_without_a_live_worker_frees_its_slot() {
  local home out rc i
  home="$TMP_ROOT/parked"
  setup_home "$home"
  for i in 1 2 3 4 5; do
    write_ship_meta "$home" "occ-$i"
  done
  # occ-1 and occ-2 still run; the other three are parked records whose panes
  # are gone (captain hold, merge wait, exited pane).
  set_live_windows "$home" occ-1 occ-2
  out=$(
    FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.4 \
      run_capacity_live "$home" slots
  )
  assert_contains "$out" "occupied=2" "only live workers hold slots"
  assert_contains "$out" "free=3" "parked records must not consume the budget"
  set +e
  FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.4 \
    run_capacity_live "$home" spawn-gate --task-id fresh-x7 >/dev/null 2>&1
  rc=$?
  set -e
  expect_code 0 "$rc" "spawn-gate with parked records only"
  [ -f "$home/state/occ-5.meta" ] || fail "a parked record must survive as a durable record"
  pass "parked tasks with no running worker do not block fresh dispatch"
}

test_live_workers_in_a_local_secondmate_home_share_the_host_budget() {
  local home mate out rc i
  home="$TMP_ROOT/host-budget"
  mate="$TMP_ROOT/host-budget/jarvis-home"
  setup_home "$home"
  setup_home "$mate"
  printf -- '- jarvis - platform work (home: %s; scope: platform work; projects: alpha; added 2026-08-27)\n' \
    "$mate" > "$home/data/secondmates.md"
  printf 'schema=fm-secondmate-parent.v1\nroute=local\nparent_home=%s\n' "$home" \
    > "$mate/.fm-secondmate-parent"
  write_ship_meta "$home" prim-a1
  for i in 1 2 3 4; do
    write_ship_meta "$mate" "mate-$i"
  done
  set_live_windows "$home" prim-a1 mate-1 mate-2 mate-3 mate-4
  cp -R "$home/tmux" "$mate/tmux"
  set +e
  out=$(
    FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.4 \
      run_capacity_live "$home" spawn-gate --task-id extra-p6 2>&1
  )
  rc=$?
  set -e
  expect_code 1 "$rc" "host-wide budget from the primary home"
  assert_contains "$out" "occupied=5" "the primary home must see the secondmate home's live workers"
  assert_contains "$out" "homes_scanned=2" "the measurement must name how many homes it counted"
  set +e
  out=$(
    FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.4 \
      run_capacity_live "$mate" spawn-gate --task-id extra-m6 2>&1
  )
  rc=$?
  set -e
  expect_code 1 "$rc" "host-wide budget from the secondmate home"
  assert_contains "$out" "occupied=5" "a secondmate home must not take a second independent budget"
  pass "local firstmate homes share one measured budget for this host"
}

test_same_task_refuses_a_second_concurrent_worker() {
  local home out rc
  home="$TMP_ROOT/same-task"
  setup_home "$home"
  write_ship_meta "$home" live-task-a1
  set +e
  out=$(run_capacity "$home" spawn-gate --task-id live-task-a1 2>&1)
  rc=$?
  set -e
  expect_code 1 "$rc" "same-task spawn-gate"
  assert_contains "$out" "already has a worker" "same-task refuse must name the duplicate worker"
  pass "spawn-gate refuses a second worker on the same task"
}

test_full_budget_refuses_without_touching_running_workers() {
  local home before after out rc i
  home="$TMP_ROOT/full-budget"
  setup_home "$home"
  for i in 1 2 3 4 5; do
    write_ship_meta "$home" "occ-$i"
  done
  set_live_windows "$home" occ-1 occ-2 occ-3 occ-4 occ-5
  before=$(cat "$home/state/occ-1.meta" "$home/state/occ-2.meta" "$home/state/occ-3.meta" \
    "$home/state/occ-4.meta" "$home/state/occ-5.meta")
  set +e
  out=$(
    FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.4 \
      run_capacity_live "$home" spawn-gate --task-id extra-w6 2>&1
  )
  rc=$?
  set -e
  expect_code 1 "$rc" "full-budget spawn-gate"
  assert_contains "$out" "no free worker slot" "full budget must refuse a new independent worker"
  assert_contains "$out" "left running" "refuse path must leave running workers running"
  after=$(cat "$home/state/occ-1.meta" "$home/state/occ-2.meta" "$home/state/occ-3.meta" \
    "$home/state/occ-4.meta" "$home/state/occ-5.meta")
  [ "$before" = "$after" ] || fail "occupied worker records changed during a capacity refuse"
  pass "full slot budget refuses a new worker and leaves running workers untouched"
}

test_free_slot_allows_a_new_independent_worker() {
  local home rc
  home="$TMP_ROOT/free-slot"
  setup_home "$home"
  write_ship_meta "$home" occ-a1
  write_ship_meta "$home" occ-b2
  set +e
  FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.4 \
    run_capacity "$home" spawn-gate --task-id extra-c3 >/dev/null 2>&1
  rc=$?
  set -e
  expect_code 0 "$rc" "free-slot spawn-gate"
  pass "a new independent worker is allowed while free slots remain"
}

test_relaunch_and_secondmate_skip_the_slot_budget() {
  local home rc
  home="$TMP_ROOT/skip-kinds"
  setup_home "$home"
  write_ship_meta "$home" occ-a1
  FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=4096 FM_CAPACITY_LOAD1=16
  fm_capacity_measure_local "$home/state" "$home"
  [ "$FM_CAPACITY_SLOTS" = 0 ] || fail "preload should force slots=0, got $FM_CAPACITY_SLOTS"
  set +e
  fm_capacity_allow_new_worker "$home/state" new-b2 ship 1 "$home"
  rc=$?
  set -e
  expect_code 0 "$rc" "relaunch skip"
  set +e
  fm_capacity_allow_new_worker "$home/state" mate-c3 secondmate 0 "$home"
  rc=$?
  set -e
  expect_code 0 "$rc" "secondmate skip"
  pass "relaunch and secondmate spawns skip the independent-worker slot budget"
}

test_cli_slots_print_measured_budget() {
  local home out
  home="$TMP_ROOT/cli-slots"
  setup_home "$home"
  write_ship_meta "$home" occ-a1
  set_live_windows "$home" occ-a1
  out=$(
    FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.4 \
      run_capacity_live "$home" slots
  )
  assert_contains "$out" "slots=5" "slots line"
  assert_contains "$out" "occupied=1" "occupied line"
  assert_contains "$out" "free=4" "free line"
  assert_contains "$out" "homes_scanned=1" "homes scanned line"
  pass "slots command prints measured slots, live occupancy, free, and homes scanned"
}

test_preferred_gpu_host_wins_when_freshly_suitable() {
  local home fakebin out
  home="$TMP_ROOT/route-pref"
  setup_home "$home"
  fakebin=$(fm_fakebin "$home")
  make_fake_ssh "$fakebin"
  mkdir -p "$home/ssh"
  cat > "$home/ssh/Valentino" <<'OUT'
FM_CAP nproc=24
FM_CAP mem_avail_mb=32000
FM_CAP load1=2.0
FM_CAP gpu=8192,10
OUT
  cat > "$home/ssh/Valentino-Arbeit" <<'OUT'
FM_CAP nproc=16
FM_CAP mem_avail_mb=16000
FM_CAP load1=1.0
FM_CAP gpu=
OUT
  printf '%s\n' '{"preferred":{"ssh":"Valentino","kind":"gpu"},"fallback":{"ssh":"Valentino-Arbeit","kind":"cpu"}}' \
    > "$home/config/compute-hosts.json"
  out=$(
    PATH="$fakebin:$PATH" FM_CAPACITY_SKIP_REMOTE='' \
      FM_FAKE_SSH_DIR="$home/ssh" \
      run_capacity "$home" route
  )
  assert_contains "$out" "route=preferred" "preferred route"
  assert_contains "$out" "route_host=Valentino" "preferred host"
  assert_contains "$out" "preferred_reachable=yes" "preferred reachable"
  assert_contains "$out" "preferred_suitable=yes" "preferred suitable"
  pass "reachable suitable Heim-PC GPU host is preferred"
}

test_fallback_used_when_preferred_is_unsuitable() {
  local home fakebin out
  home="$TMP_ROOT/route-fall"
  setup_home "$home"
  fakebin=$(fm_fakebin "$home")
  make_fake_ssh "$fakebin"
  mkdir -p "$home/ssh"
  cat > "$home/ssh/Valentino" <<'OUT'
FM_CAP nproc=24
FM_CAP mem_avail_mb=32000
FM_CAP load1=2.0
FM_CAP gpu=512,95
OUT
  cat > "$home/ssh/Valentino-Arbeit" <<'OUT'
FM_CAP nproc=16
FM_CAP mem_avail_mb=16000
FM_CAP load1=1.0
FM_CAP gpu=
OUT
  printf '%s\n' '{"preferred":{"ssh":"Valentino","kind":"gpu"},"fallback":{"ssh":"Valentino-Arbeit","kind":"cpu"}}' \
    > "$home/config/compute-hosts.json"
  out=$(
    PATH="$fakebin:$PATH" FM_CAPACITY_SKIP_REMOTE='' \
      FM_FAKE_SSH_DIR="$home/ssh" \
      run_capacity "$home" route
  )
  assert_contains "$out" "route=fallback" "fallback route"
  assert_contains "$out" "route_host=Valentino-Arbeit" "fallback host"
  assert_contains "$out" "preferred_reachable=yes" "preferred still reachable"
  assert_contains "$out" "preferred_suitable=no" "preferred unsuitable GPU"
  pass "Arbeits-PC is the fallback when the Heim-PC GPU is not suitable"
}

test_no_route_when_both_hosts_are_down() {
  local home fakebin out
  home="$TMP_ROOT/route-none"
  setup_home "$home"
  fakebin=$(fm_fakebin "$home")
  make_fake_ssh "$fakebin"
  mkdir -p "$home/ssh"
  printf '%s\n' '{"preferred":{"ssh":"Valentino","kind":"gpu"},"fallback":{"ssh":"Valentino-Arbeit","kind":"cpu"}}' \
    > "$home/config/compute-hosts.json"
  out=$(
    PATH="$fakebin:$PATH" FM_CAPACITY_SKIP_REMOTE='' \
      FM_FAKE_SSH_DIR="$home/ssh" \
      run_capacity "$home" route
  )
  assert_contains "$out" "route=none" "no route onto the supervisor"
  assert_not_contains "$out" "route_host=Valentino" "must not claim a down preferred host"
  pass "host-bound work is not piled onto the supervisor when both remotes fail"
}

test_preferred_pin_keeps_the_configured_fallback() {
  local home fakebin out
  home="$TMP_ROOT/route-pin-merge"
  setup_home "$home"
  fakebin=$(fm_fakebin "$home")
  make_fake_ssh "$fakebin"
  mkdir -p "$home/ssh"
  # Heim-PC is down; only the configured Arbeits-PC answers.
  cat > "$home/ssh/Valentino-Arbeit" <<'OUT'
FM_CAP nproc=16
FM_CAP mem_avail_mb=16000
FM_CAP load1=1.0
FM_CAP gpu=
OUT
  printf '%s\n' '{"preferred":{"ssh":"Valentino","kind":"gpu"},"fallback":{"ssh":"Valentino-Arbeit","kind":"cpu"}}' \
    > "$home/config/compute-hosts.json"
  out=$(
    PATH="$fakebin:$PATH" FM_CAPACITY_SKIP_REMOTE='' \
      FM_FAKE_SSH_DIR="$home/ssh" \
      run_capacity "$home" route --preferred Valentino
  )
  assert_contains "$out" "route=fallback" "a preferred-only pin must keep the configured fallback"
  assert_contains "$out" "route_host=Valentino-Arbeit" "fallback host survives the pin"
  assert_contains "$out" "fallback_ssh=Valentino-Arbeit" "the configured fallback is still loaded"
  pass "pinning only the preferred host preserves the configured Arbeits-PC fallback"
}

test_invalid_pinned_kind_is_rejected() {
  local home out rc
  home="$TMP_ROOT/route-bad-kind"
  setup_home "$home"
  set +e
  out=$(run_capacity "$home" route --preferred Valentino-Arbeit --preferred-kind CPU 2>&1)
  rc=$?
  set -e
  expect_code 1 "$rc" "invalid pinned kind"
  assert_contains "$out" "must be gpu or cpu" "an unknown pinned kind must be reported, not coerced"
  assert_not_contains "$out" "preferred_suitable" "a rejected pin must not produce a routing verdict"
  pass "an unknown pinned host kind is rejected instead of silently coerced"
}

test_spawn_refuses_at_capacity_without_launching() {
  local home fakebin out rc id=cap-new-z9
  home="$TMP_ROOT/spawn-refuse"
  setup_home "$home"
  write_ship_meta "$home" occ-a1
  write_ship_meta "$home" occ-b2
  fakebin=$(fm_fakebin "$home")
  make_fake_tmux "$fakebin"
  set_live_windows "$home" occ-a1 occ-b2
  mkdir -p "$home/data/$id"
  printf 'Delivery contract: mode=no-mistakes\n' > "$home/data/$id/brief.md"
  set +e
  out=$(
    PATH="$fakebin:$PATH" FM_FAKE_TMUX_DIR="$home/tmux" \
      FM_CAPACITY_NPROC=6 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.2 \
      FM_HOME="$home" FM_ROOT_OVERRIDE="" \
      FM_SPAWN_NO_GUARD=1 FM_BACKEND=tmux \
      "$SPAWN" "$id" projects/demo --mode no-mistakes --yolo off 2>&1
  )
  rc=$?
  set -e
  expect_code 1 "$rc" "spawn at capacity"
  assert_contains "$out" "error: capacity:" "spawn must refuse through the capacity gate"
  assert_not_contains "$out" "spawned $id" "spawn must not report a launch"
  pass "fm-spawn refuses a new independent worker when no slot remains"
}

test_gpu_suitability_requires_headroom() {
  fm_capacity_host_suitable gpu 24 32000 2.0 8192 10 \
    || fail "healthy GPU host should be suitable"
  fm_capacity_host_suitable gpu 24 32000 2.0 512 10 \
    && fail "low VRAM should be unsuitable"
  fm_capacity_host_suitable gpu 24 32000 2.0 8192 95 \
    && fail "high GPU util should be unsuitable"
  fm_capacity_host_suitable cpu 16 16000 1.0 "" "" \
    || fail "healthy CPU host should be suitable"
  fm_capacity_host_suitable cpu 16 16000 16.0 0 0 \
    && fail "saturated CPU host should be unsuitable"
  pass "gpu and cpu suitability follow measured headroom"
}

test_slots_allow_five_on_healthy_supervisor
test_slots_drop_to_zero_when_load_saturates
test_slots_drop_when_ram_is_tight
test_slots_small_host_keeps_one_when_healthy
test_slots_high_but_not_full_load_caps_at_one
test_occupied_counts_ship_and_scout_not_secondmates
test_parked_task_without_a_live_worker_frees_its_slot
test_live_workers_in_a_local_secondmate_home_share_the_host_budget
test_same_task_refuses_a_second_concurrent_worker
test_full_budget_refuses_without_touching_running_workers
test_free_slot_allows_a_new_independent_worker
test_relaunch_and_secondmate_skip_the_slot_budget
test_cli_slots_print_measured_budget
test_preferred_gpu_host_wins_when_freshly_suitable
test_fallback_used_when_preferred_is_unsuitable
test_no_route_when_both_hosts_are_down
test_preferred_pin_keeps_the_configured_fallback
test_invalid_pinned_kind_is_rejected
test_spawn_refuses_at_capacity_without_launching
test_gpu_suitability_requires_headroom

echo "# all fm-capacity tests passed"
