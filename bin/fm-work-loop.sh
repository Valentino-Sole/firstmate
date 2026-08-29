#!/usr/bin/env bash
# Measure free worker slots and plan parallel backlog refill for section 7's work loop.
# Usage:
#   fm-work-loop.sh status
#   fm-work-loop.sh plan [--backlog <path>]
#
# `status` prints one machine-readable line:
#   FM_WORK_LOOP slots=<n> occupied=<n> free=<n> real=<n> min_real=<n> shortfall=<n> homes_scanned=<n>
#
# `real` counts only provably working workers (busy pane or active run-step); idle
# done-panes with a live endpoint do not count. `shortfall` is how many more real
# workers the loop should try to launch before the host slot ceiling.
#
# `plan` prints up to the plan limit dispatchable task ids, one per line, skipping
# ids that already occupy a live worker slot. Below min_real it tops up toward the
# floor; once the floor is met it fills every measured free slot. Prints nothing
# when the plan limit is 0.
#
# Slot measurement is owned by bin/fm-capacity-lib.sh; this command never spawns.
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FM_ROOT="${FM_ROOT_OVERRIDE:-$(cd "$SCRIPT_DIR/.." && pwd)}"
FM_HOME="${FM_HOME:-${FM_ROOT_OVERRIDE:-$FM_ROOT}}"
STATE="${FM_STATE_OVERRIDE:-$FM_HOME/state}"
DATA="${FM_DATA_OVERRIDE:-$FM_HOME/data}"
CONFIG="${FM_CONFIG_OVERRIDE:-$FM_HOME/config}"

# shellcheck source=bin/fm-capacity-lib.sh
. "$SCRIPT_DIR/fm-capacity-lib.sh"
# shellcheck source=bin/fm-tasks-axi-lib.sh
. "$SCRIPT_DIR/fm-tasks-axi-lib.sh"

usage() {
  sed -n '2,14{s/^# \{0,1\}//;p;}' "$0"
}

die() {
  printf 'error: work-loop: %s\n' "$1" >&2
  exit 1
}

CMD=
BACKLOG="$DATA/backlog.md"
while [ "$#" -gt 0 ]; do
  case "$1" in
    status | plan)
      [ -z "$CMD" ] || die "one command only"
      CMD=$1
      shift
      ;;
    --backlog)
      [ "$#" -ge 2 ] || die "--backlog requires a path"
      BACKLOG=$2
      shift 2
      ;;
    --backlog=*)
      BACKLOG=${1#--backlog=}
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done
[ -n "$CMD" ] || {
  usage >&2
  exit 1
}

work_loop_measure() {
  fm_capacity_measure_local "$STATE" "$FM_HOME"
  fm_capacity_measure_host_real_workers "$STATE" "$FM_HOME"
  FM_CAPACITY_SHORTFALL=$(fm_capacity_work_loop_shortfall "$FM_CAPACITY_REAL")
  FM_CAPACITY_PLAN_LIMIT=$(fm_capacity_work_loop_plan_limit \
    "$FM_CAPACITY_FREE" "$FM_CAPACITY_REAL")
}

work_loop_print_status() {
  work_loop_measure
  printf 'FM_WORK_LOOP slots=%s occupied=%s free=%s real=%s min_real=%s shortfall=%s homes_scanned=%s\n' \
    "$FM_CAPACITY_SLOTS" "$FM_CAPACITY_OCCUPIED" "$FM_CAPACITY_FREE" \
    "$FM_CAPACITY_REAL" "$FM_WORK_LOOP_MIN_REAL" "$FM_CAPACITY_SHORTFALL" \
    "$FM_CAPACITY_HOMES_SCANNED"
}

# Print one task id per line from a tasks-axi ready listing.
work_loop_emit_ready_ids() {
  local ready=$1
  printf '%s\n' "$ready" | awk '
    /^help\[/ { exit }
    /^ready\[/ { rows = 1; next }
    rows && /^[[:space:]]/ {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      split(line, a, ",")
      if (a[1] != "") print a[1]
      next
    }
    { rows = 0 }
  '
}

work_loop_ready_ids() {
  local ready err
  [ -f "$BACKLOG" ] || return 0
  if ! fm_tasks_axi_backend_available "$CONFIG"; then
    die "tasks-axi backlog backend is required for plan; got $(fm_backlog_backend_value "$CONFIG")"
  fi
  if ! ready=$(tasks-axi ready --file "$BACKLOG" 2>&1); then
    die "tasks-axi ready failed: $ready"
  fi
  work_loop_emit_ready_ids "$ready"
}

work_loop_print_plan() {
  local free=$1 id n=0
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    fm_capacity_task_occupies_slot "$STATE" "$id" && continue
    printf '%s\n' "$id"
    n=$((n + 1))
    [ "$n" -lt "$free" ] || return 0
  done < <(work_loop_ready_ids)
}

case "$CMD" in
  status)
    work_loop_print_status
    ;;
  plan)
    work_loop_measure
    [ "$FM_CAPACITY_PLAN_LIMIT" -gt 0 ] || exit 0
    work_loop_print_plan "$FM_CAPACITY_PLAN_LIMIT"
    ;;
esac
