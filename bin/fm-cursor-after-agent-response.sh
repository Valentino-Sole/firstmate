#!/usr/bin/env bash
# Cursor afterAgentResponse adapter: clear the compaction-active mark after a
# successful assistant boundary so a held stop-hook follow-up can be submitted
# exactly once.
#
# Registered in tracked .cursor/hooks.json. Cursor documents no output fields
# for this step, so this script prints nothing.
# Clearing the mark is the only mutation; it does not emit a follow-up.
#
# The root is resolved from this script's OWN tree, never from an inherited
# FM_ROOT_OVERRIDE, so a child session in a task worktree stays out of primary
# scope instead of marking or clearing the primary home's compaction record.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FM_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FM_HOME="${FM_HOME:-$FM_ROOT}"
STATE="${FM_STATE_OVERRIDE:-$FM_HOME/state}"

# This step runs after every assistant response and removing that record is the
# only mutation, so leave the primary's hot path before the scope check's git
# calls and the library sources when there is nothing to clear.
[ -f "$STATE/.cursor-compaction" ] || exit 0

# shellcheck source=bin/fm-primary-scope-lib.sh
. "$SCRIPT_DIR/fm-primary-scope-lib.sh"
# shellcheck source=bin/fm-cursor-compaction-lib.sh
. "$SCRIPT_DIR/fm-cursor-compaction-lib.sh"

fm_primary_scope_matches "$FM_ROOT" "$STATE" || exit 0
fm_cursor_compaction_mark_done "$STATE"
exit 0
