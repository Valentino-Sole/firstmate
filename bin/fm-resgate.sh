#!/usr/bin/env bash
# Fleet resource governance for the captain's work PC and home PC: weekly
# clock-window percentage caps, a manual override, and GPU exclusivity
# between Qwen and the JARVIS voice worker on the home PC.
# Usage:
#   fm-resgate.sh schedule <work|home>
#   fm-resgate.sh cap <work|home>
#   fm-resgate.sh override set <work|home|both>
#   fm-resgate.sh override clear <work|home|both>
#   fm-resgate.sh override status <work|home|both>
#   fm-resgate.sh gpu status
#   fm-resgate.sh gpu allow <qwen|voice>
#
# `schedule` prints the clock-window verdict alone (uncapped/capped/blocked),
# ignoring any manual override. `cap` prints the EFFECTIVE percentage (100,
# 50, or 0), folding in an active override. `override set/clear` arm or
# release the durable state/.resgate-cap-<role> marker documented in
# docs/configuration.md "Fleet resource governance"; `both` touches both
# roles. `gpu status` prints the freshly probed home-PC GPU owner; `gpu allow`
# exits 0 when <workload> may start or keep running on that GPU right now, 1
# otherwise, printing the reason either way. The script header of
# bin/fm-resgate-lib.sh owns the schedule windows, the fail-closed rules, and
# the GPU-detection signals.
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FM_ROOT="${FM_ROOT_OVERRIDE:-$(cd "$SCRIPT_DIR/.." && pwd)}"
FM_HOME="${FM_HOME:-${FM_ROOT_OVERRIDE:-$FM_ROOT}}"
STATE="${FM_STATE_OVERRIDE:-$FM_HOME/state}"

# shellcheck source=bin/fm-resgate-lib.sh
. "$SCRIPT_DIR/fm-resgate-lib.sh"

usage() {
  sed -n '2,23{s/^# \{0,1\}//;p;}' "$0"
}

die() {
  printf 'error: resgate: %s\n' "$1" >&2
  exit 1
}

roles_for() { # <work|home|both>
  case "$1" in
    work | home) printf '%s\n' "$1" ;;
    both) printf 'work\nhome\n' ;;
    *) die "role must be work, home, or both: $1" ;;
  esac
}

cmd_schedule() {
  local role=${1:-}
  fm_resgate_role_ok "$role" || die "role must be work or home: $role"
  fm_resgate_schedule_state "$role"
  printf 'state=%s\n' "$FM_RESGATE_SCHEDULE_STATE"
  printf 'reason=%s\n' "$FM_RESGATE_SCHEDULE_REASON"
}

cmd_cap() {
  local role=${1:-}
  fm_resgate_role_ok "$role" || die "role must be work or home: $role"
  fm_resgate_capacity_pct "$STATE" "$role"
  printf 'pct=%s\n' "$FM_RESGATE_PCT"
  printf 'state=%s\n' "$FM_RESGATE_STATE"
  printf 'reason=%s\n' "$FM_RESGATE_REASON"
}

cmd_override() {
  local action=${1:-} role_arg=${2:-} role roles rc=0
  case "$action" in set | clear | status) ;; *)
    die "override subcommand must be set, clear, or status: $action" ;;
  esac
  # Validated (and, on a bad role, exited) here, in this shell - never inside
  # a process-substitution subshell, whose exit status the caller cannot see.
  roles=$(roles_for "$role_arg")
  for role in $roles; do
    case "$action" in
      set)
        fm_resgate_override_set "$STATE" "$role" Kappung \
          || { printf 'error: resgate: could not arm override for %s\n' "$role" >&2; rc=1; }
        ;;
      clear)
        fm_resgate_override_clear "$STATE" "$role" \
          || { printf 'error: resgate: could not clear override for %s\n' "$role" >&2; rc=1; }
        ;;
      status)
        if fm_resgate_override_active "$STATE" "$role"; then
          printf '%s=armed\n' "$role"
        else
          printf '%s=clear\n' "$role"
        fi
        ;;
    esac
  done
  return "$rc"
}

cmd_gpu() {
  local action=${1:-} want=${2:-}
  case "$action" in
    status)
      fm_resgate_home_gpu_owner || true
      printf 'owner=%s\n' "$FM_RESGATE_GPU_OWNER"
      printf 'voice_port=%s\n' "${FM_RESGATE_GPU_VOICE:-unknown}"
      printf 'process(%s)=%s\n' "$FM_RESGATE_GPU_PROCESS_NAME" "${FM_RESGATE_GPU_PROCESS:-unknown}"
      printf 'gpu_used_mb=%s\n' "${FM_RESGATE_GPU_USED_MB:-unknown}"
      printf 'gpu_busy_threshold_mb=%s\n' "$(fm_resgate_gpu_busy_mb)"
      ;;
    allow)
      case "$want" in qwen | voice) ;; *) die "gpu allow needs qwen or voice: $want" ;; esac
      if fm_resgate_gpu_available_for "$want"; then
        printf 'allow=yes\n'
        printf 'reason=%s\n' "$FM_RESGATE_GPU_REASON"
      else
        printf 'allow=no\n'
        printf 'reason=%s\n' "$FM_RESGATE_GPU_REASON"
        return 1
      fi
      ;;
    *) die "gpu subcommand must be status or allow: $action" ;;
  esac
}

[ "$#" -ge 1 ] || { usage >&2; exit 2; }
CMD=$1
shift
case "$CMD" in
  schedule) cmd_schedule "$@" ;;
  cap) cmd_cap "$@" ;;
  override) cmd_override "$@" ;;
  gpu) cmd_gpu "$@" ;;
  -h | --help) usage ;;
  *) die "unknown command: $CMD" ;;
esac
