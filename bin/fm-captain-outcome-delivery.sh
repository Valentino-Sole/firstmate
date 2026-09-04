#!/usr/bin/env bash
# fm-captain-outcome-delivery.sh - persistent exactly-once captain outcome delivery.
#
# Registers relevant fleet results from existing durable sources, presents each
# outcome to the captain at most once on main supervision turns, and keeps
# UNPRESENTED/PRESENTED/ACKNOWLEDGED state across compaction and restart.
#
# Usage:
#   fm-captain-outcome-delivery.sh ingest
#   fm-captain-outcome-delivery.sh present
#   fm-captain-outcome-delivery.sh catch-up
#   fm-captain-outcome-delivery.sh list-unpresented
#   fm-captain-outcome-delivery.sh acknowledge --key <outcome-key>
#   fm-captain-outcome-delivery.sh mark-presented --key <outcome-key>
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=bin/fm-captain-outcome-delivery-lib.sh
. "$SCRIPT_DIR/fm-captain-outcome-delivery-lib.sh"

usage() {
  echo "usage: fm-captain-outcome-delivery.sh ingest | present | catch-up | list-unpresented | acknowledge --key <key> | mark-presented --key <key>" >&2
  exit 2
}

CMD=${1:-}
shift 2>/dev/null || true

case "$CMD" in
  ingest)
    [ "$#" -eq 0 ] || usage
    fm_lock_acquire_wait "$FM_CAPTAIN_OUTCOME_LOCK"
    fm_captain_outcome_ingest_all
    rc=$?
    fm_lock_release "$FM_CAPTAIN_OUTCOME_LOCK"
    exit "$rc"
    ;;
  present)
    [ "$#" -eq 0 ] || usage
    fm_captain_outcome_actor_is_main || exit 0
    fm_lock_acquire_wait "$FM_CAPTAIN_OUTCOME_LOCK"
    fm_captain_outcome_present_section
    rc=$?
    fm_lock_release "$FM_CAPTAIN_OUTCOME_LOCK"
    exit "$rc"
    ;;
  catch-up)
    [ "$#" -eq 0 ] || usage
    fm_lock_acquire_wait "$FM_CAPTAIN_OUTCOME_LOCK"
    fm_captain_outcome_catch_up
    rc=$?
    fm_lock_release "$FM_CAPTAIN_OUTCOME_LOCK"
    exit "$rc"
    ;;
  list-unpresented)
    [ "$#" -eq 0 ] || usage
    fm_lock_acquire_wait "$FM_CAPTAIN_OUTCOME_LOCK"
    fm_captain_outcome_list_unpresented
    rc=$?
    fm_lock_release "$FM_CAPTAIN_OUTCOME_LOCK"
    exit "$rc"
    ;;
  acknowledge)
    [ "${1:-}" = --key ] || usage
    KEY=${2:-}
    [ -n "$KEY" ] && [ "$#" -eq 2 ] || usage
    fm_lock_acquire_wait "$FM_CAPTAIN_OUTCOME_LOCK"
    fm_captain_outcome_set_state "$KEY" acknowledged
    rc=$?
    fm_lock_release "$FM_CAPTAIN_OUTCOME_LOCK"
    exit "$rc"
    ;;
  mark-presented)
    [ "${1:-}" = --key ] || usage
    KEY=${2:-}
    [ -n "$KEY" ] && [ "$#" -eq 2 ] || usage
    fm_lock_acquire_wait "$FM_CAPTAIN_OUTCOME_LOCK"
    fm_captain_outcome_set_state "$KEY" presented
    rc=$?
    fm_lock_release "$FM_CAPTAIN_OUTCOME_LOCK"
    exit "$rc"
    ;;
  *) usage ;;
esac
