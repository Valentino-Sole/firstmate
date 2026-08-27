#!/usr/bin/env bash
# Behavior tests for resource-aware parallel dispatch: slot formula, occupied
# counting, same-task uniqueness, refuse-rather-than-kill spawn gating, and
# preferred-then-fallback host routing from fresh probes.
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
  n=$(fm_capacity_occupied_count "$home/state")
  [ "$n" = 3 ] || fail "occupied should count 2 ship + 1 scout, not the secondmate; got $n"
  pass "occupied slots are ship and scout workers, not idle secondmates"
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
  before=$(cat "$home/state/occ-1.meta" "$home/state/occ-2.meta" "$home/state/occ-3.meta" \
    "$home/state/occ-4.meta" "$home/state/occ-5.meta")
  set +e
  out=$(
    FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.4 \
      run_capacity "$home" spawn-gate --task-id extra-w6 2>&1
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
  fm_capacity_measure_local "$home/state"
  [ "$FM_CAPACITY_SLOTS" = 0 ] || fail "preload should force slots=0, got $FM_CAPACITY_SLOTS"
  set +e
  fm_capacity_allow_new_worker "$home/state" new-b2 ship 1
  rc=$?
  set -e
  expect_code 0 "$rc" "relaunch skip"
  set +e
  fm_capacity_allow_new_worker "$home/state" mate-c3 secondmate 0
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
  out=$(
    FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.4 \
      run_capacity "$home" slots
  )
  assert_contains "$out" "slots=5" "slots line"
  assert_contains "$out" "occupied=1" "occupied line"
  assert_contains "$out" "free=4" "free line"
  pass "slots command prints measured slots, occupied, and free"
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

test_spawn_refuses_at_capacity_without_launching() {
  local home out rc id=cap-new-z9
  home="$TMP_ROOT/spawn-refuse"
  setup_home "$home"
  write_ship_meta "$home" occ-a1
  write_ship_meta "$home" occ-b2
  mkdir -p "$home/data/$id"
  printf 'Delivery contract: mode=no-mistakes\n' > "$home/data/$id/brief.md"
  set +e
  out=$(
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
test_same_task_refuses_a_second_concurrent_worker
test_full_budget_refuses_without_touching_running_workers
test_free_slot_allows_a_new_independent_worker
test_relaunch_and_secondmate_skip_the_slot_budget
test_cli_slots_print_measured_budget
test_preferred_gpu_host_wins_when_freshly_suitable
test_fallback_used_when_preferred_is_unsuitable
test_no_route_when_both_hosts_are_down
test_spawn_refuses_at_capacity_without_launching
test_gpu_suitability_requires_headroom

echo "# all fm-capacity tests passed"
