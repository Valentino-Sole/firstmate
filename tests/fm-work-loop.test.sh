#!/usr/bin/env bash
# tests/fm-work-loop.test.sh - parallel slot refill planning for section 7's work loop.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# shellcheck source=bin/fm-capacity-lib.sh
. "$ROOT/bin/fm-capacity-lib.sh"

SCRIPT="$ROOT/bin/fm-work-loop.sh"
TMP_ROOT=$(fm_test_tmproot fm-work-loop)

setup_home() {
  local home=$1
  mkdir -p "$home/state" "$home/config" "$home/data" "$home/projects/demo"
  printf '%s\n' '- [ ] alpha-one - Alpha one (repo: demo) (kind: ship)' > "$home/data/backlog.md"
}

write_ship_meta() {
  local home=$1 id=$2
  fm_write_meta "$home/state/$id.meta" \
    "window=firstmate:fm-$id" \
    "endpoint_task_id=$id" \
    "kind=ship" \
    "harness=echo"
}

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

run_work_loop() {
  local home=$1
  shift
  local fakebin
  fakebin=$(fm_fakebin "$home")
  make_fake_tmux "$fakebin"
  PATH="$fakebin:${PATH:-/usr/bin:/bin}" FM_FAKE_TMUX_DIR="$home/tmux" \
    FM_HOME="$home" FM_ROOT_OVERRIDE="$ROOT" \
    FM_STATE_OVERRIDE="$home/state" FM_CONFIG_OVERRIDE="$home/config" \
    FM_DATA_OVERRIDE="$home/data" \
  "$SCRIPT" "$@"
}

add_compatible_tasks_axi() {
  local home=$1
  mkdir -p "$home/bin"
  cat > "$home/bin/tasks-axi" <<'SH'
#!/usr/bin/env bash
set -u
case "${1:-}" in
  --version) printf '0.2.4\n'; exit 0 ;;
  update)
    [ "${2:-}" = --help ] && { printf 'usage: tasks-axi update <id> [--archive-body]\n'; exit 0; }
    ;;
  mv)
    [ "${2:-}" = --help ] && { printf 'usage: tasks-axi mv <dest> [<id>...]\n'; exit 0; }
    ;;
  ready)
  shift
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --file) shift 2 ;;
      *) shift ;;
    esac
  done
  printf 'count: 3\n'
  printf 'ready[3]{id,state,kind,repo,title}:\n'
  printf '  alpha-one,queued,ship,demo,Alpha one\n'
  printf '  alpha-two,queued,ship,demo,Alpha two\n'
  printf '  alpha-three,queued,ship,demo,Alpha three\n'
  printf 'ready_public_followups: 0 delivery-ready obligations\n'
  exit 0
  ;;
esac
exit 1
SH
  chmod +x "$home/bin/tasks-axi"
}

test_status_reports_measured_slots() {
  local home out
  home="$TMP_ROOT/status"
  setup_home "$home"
  out=$(FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.4 \
    run_work_loop "$home" status)
  assert_contains "$out" 'FM_WORK_LOOP slots=5 occupied=0 free=5 homes_scanned=1' \
    "status did not report measured free slots: $out"
  pass "fm-work-loop status reports measured slot budget"
}

test_plan_fills_up_to_free_slots() {
  local home out n
  home="$TMP_ROOT/plan-fill"
  setup_home "$home"
  add_compatible_tasks_axi "$home"
  out=$(FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.4 \
    PATH="$home/bin:$PATH" run_work_loop "$home" plan)
  n=$(printf '%s\n' "$out" | sed '/^$/d' | wc -l)
  [ "$n" -eq 3 ] || fail "expected 3 planned spawns with 5 free slots, got $n: $out"
  pass "fm-work-loop plan lists every dispatchable id up to the free budget"
}

test_plan_skips_tasks_that_already_occupy_slots() {
  local home out
  home="$TMP_ROOT/plan-skip"
  setup_home "$home"
  add_compatible_tasks_axi "$home"
  write_ship_meta "$home" alpha-one
  set_live_windows "$home" alpha-one
  out=$(FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.4 \
    PATH="$home/bin:$PATH" run_work_loop "$home" plan)
  assert_not_contains "$out" 'alpha-one' "plan should skip a task that already holds a live slot"
  assert_contains "$out" 'alpha-two' "plan should still offer other dispatchable tasks"
  pass "fm-work-loop plan skips ids that already occupy a live worker slot"
}

test_plan_prints_nothing_when_no_free_slots() {
  local home out rc
  home="$TMP_ROOT/plan-full"
  setup_home "$home"
  add_compatible_tasks_axi "$home"
  write_ship_meta "$home" live-a
  write_ship_meta "$home" live-b
  write_ship_meta "$home" live-c
  write_ship_meta "$home" live-d
  write_ship_meta "$home" live-e
  set_live_windows "$home" live-a live-b live-c live-d live-e
  out=$(FM_CAPACITY_NPROC=16 FM_CAPACITY_MEM_AVAIL_MB=24576 FM_CAPACITY_LOAD1=0.4 \
    PATH="$home/bin:$PATH" run_work_loop "$home" plan)
  [ -z "$out" ] || fail "plan should be silent when free=0, got: $out"
  pass "fm-work-loop plan stays silent when every slot is occupied"
}

test_status_reports_measured_slots
test_plan_fills_up_to_free_slots
test_plan_skips_tasks_that_already_occupy_slots
test_plan_prints_nothing_when_no_free_slots
