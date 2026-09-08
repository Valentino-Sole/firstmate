#!/usr/bin/env bash
# Cursor preCompact adapter: mark compaction active so the stop park will not
# submit a followup_message while Cursor is compacting.
#
# Registered in tracked .cursor/hooks.json. This hook is observational: Cursor
# accepts only user_message and cannot inject a digest. This script therefore
# prints nothing and never tries to re-emit session-start context.
# docs/sessionstart-nudge.md still owns that deferred surface.
#
# Every path exits 0. A mark failure is fail-open: the park then behaves as
# it did before this hold existed.
#
# The root is resolved from this script's OWN tree, never from an inherited
# FM_ROOT_OVERRIDE, so a child session in a task worktree stays out of primary
# scope instead of marking or clearing the primary home's compaction record.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FM_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FM_HOME="${FM_HOME:-$FM_ROOT}"
STATE="${FM_STATE_OVERRIDE:-$FM_HOME/state}"

# shellcheck source=bin/fm-primary-scope-lib.sh
. "$SCRIPT_DIR/fm-primary-scope-lib.sh"
# shellcheck source=bin/fm-cursor-compaction-lib.sh
. "$SCRIPT_DIR/fm-cursor-compaction-lib.sh"

PAYLOAD=$(cat 2>/dev/null || true)
fm_primary_scope_matches "$FM_ROOT" "$STATE" || exit 0

SESSION_ID=unknown
if [ -n "$PAYLOAD" ] && command -v jq >/dev/null 2>&1; then
  SESSION_ID=$(printf '%s' "$PAYLOAD" | jq -r '.session_id // "unknown"' 2>/dev/null || printf 'unknown')
fi
case "$SESSION_ID" in ''|*[!A-Za-z0-9._-]*) SESSION_ID=unknown ;; esac

fm_cursor_compaction_mark_active "$STATE" "$SESSION_ID" || true
exit 0
