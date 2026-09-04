#!/usr/bin/env bash
# KAPITAENSREGEL - automatic safe cleanup for normal workers.
#
# Usage:
#   fm-safe-cleanup.sh classify
#   fm-safe-cleanup.sh try <task-id>
#   fm-safe-cleanup.sh sweep-once
#
# classify: list every Herdr workspace in the active session with PERMANENT,
#   AKTIV, DONE, HOLD, or UNKLAR. Never mutates.
#
# try: when eligibility checks pass, run bin/fm-teardown.sh without --force for
#   one normal worker. Permanent secondmates are never touched. Captain holds
#   remain in the backlog; only the worker endpoint and worktree are retired.
#   Never relaunches the task.
#
# sweep-once: classify every workspace, then try cleanup for every DONE and HOLD
#   row that names a task id. UNKLAR and AKTIV rows are reported only.
#
# Event callers (fm-merge-local.sh, fm-pr-merge.sh) invoke `try` after a
# confirmed landing. No polling and no name-based deletion.
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FM_ROOT="${FM_ROOT_OVERRIDE:-$(cd "$SCRIPT_DIR/.." && pwd)}"
FM_HOME="${FM_HOME:-${FM_ROOT_OVERRIDE:-$FM_ROOT}}"
STATE="${FM_STATE_OVERRIDE:-$FM_HOME/state}"
DATA="${FM_DATA_OVERRIDE:-$FM_HOME/data}"
CONFIG="${FM_CONFIG_OVERRIDE:-$FM_HOME/config}"
SECONDMATE_REG="$DATA/secondmates.md"

# shellcheck source=bin/fm-classify-lib.sh
. "$SCRIPT_DIR/fm-classify-lib.sh"
# shellcheck source=bin/fm-pr-lib.sh
. "$SCRIPT_DIR/fm-pr-lib.sh"
# shellcheck source=bin/fm-safe-cleanup-lib.sh
. "$SCRIPT_DIR/fm-safe-cleanup-lib.sh"
# shellcheck source=bin/fm-backend.sh
. "$SCRIPT_DIR/fm-backend.sh"
# shellcheck source=bin/fm-lease-lib.sh
. "$SCRIPT_DIR/fm-lease-lib.sh"

usage() {
  sed -n '2,22{s/^# \{0,1\}//;p;}' "$0"
}

die() {
  printf 'error: safe-cleanup: %s\n' "$1" >&2
  exit 2
}

CMD=${1:-}
shift || true

case "$CMD" in
  classify|try|sweep-once) ;;
  -h|--help|'') usage; exit 0 ;;
  *) die "unknown command: $CMD" ;;
esac

fm_safe_cleanup_classify_all() {
  local session list
  command -v herdr >/dev/null 2>&1 && command -v jq >/dev/null 2>&1 \
    || { die 'herdr and jq are required for classify'; }
  fm_backend_source herdr || die 'herdr backend unavailable'
  session=$(fm_backend_herdr_session)
  list=$(fm_backend_herdr_cli "$session" workspace list 2>/dev/null) || die 'workspace list failed'
  printf '%s' "$list" | jq -er '
    .result.workspaces
    | select(type == "array")
    | .[]
    | [.workspace_id, .label, (.agent_status // "")] | @tsv
  ' 2>/dev/null | while IFS=$'\t' read -r workspace label agent; do
    [ -n "$workspace" ] && [ -n "$label" ] || continue
    fm_safe_cleanup_classify_workspace \
      "$FM_HOME" "$STATE" "$DATA" "$SECONDMATE_REG" "$workspace" "$label" "$agent"
  done
}

fm_safe_cleanup_try_one() {
  local id=$1 rc=0 out
  fm_task_id_path_safe "$id" || die "invalid task id: $id"
  if ! fm_safe_cleanup_try_allowed "$FM_HOME" "$STATE" "$DATA" "$SECONDMATE_REG" "$id"; then
    printf 'FM_SAFE_CLEANUP try=%s result=skipped reason=not-eligible\n' "$id"
    return 0
  fi
  fm_lease_forbid_branch "safe cleanup (fm-safe-cleanup)" || return "$FM_LEASE_REFUSE_EXIT"
  if out=$("$SCRIPT_DIR/fm-teardown.sh" "$id" 2>&1); then
    printf '%s\n' "$out"
    printf 'FM_SAFE_CLEANUP try=%s result=teardown\n' "$id"
    return 0
  fi
  rc=$?
  printf '%s\n' "$out" >&2
  printf 'FM_SAFE_CLEANUP try=%s result=refused exit=%s\n' "$id" "$rc"
  return 0
}

case "$CMD" in
  classify)
    fm_safe_cleanup_classify_all
    ;;
  try)
    [ -n "${1:-}" ] || die 'try requires a task id'
    fm_safe_cleanup_try_one "$1"
    ;;
  sweep-once)
  {
    fm_safe_cleanup_classify_all
  } | tee /dev/stderr | awk -F' ' '
    $1 == "FM_SAFE_CLEANUP" {
      task=""; class=""
      for (i = 2; i <= NF; i++) {
        if ($i ~ /^task=/) { sub(/^task=/, "", $i); task = $i }
        if ($i ~ /^class=/) { sub(/^class=/, "", $i); class = $i }
      }
      if (task != "" && (class == "DONE" || class == "HOLD")) print task
    }
  ' | sort -u | while IFS= read -r id; do
      [ -n "$id" ] || continue
      fm_safe_cleanup_try_one "$id"
    done
    ;;
esac
