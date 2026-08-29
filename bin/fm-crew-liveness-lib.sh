#!/usr/bin/env bash
# Shared helpers for cursor-grok crewmate recovery at Pi-primary session start.
# Sourced only; no side effects on source.
set -u

fm_crew_liveness_primary_harness() {
  if [ -n "${FM_CREW_LIVENESS_PRIMARY_HARNESS:-}" ]; then
    printf '%s\n' "$FM_CREW_LIVENESS_PRIMARY_HARNESS"
    return 0
  fi
  local harness
  harness=$("$FM_ROOT/bin/fm-harness.sh" 2>/dev/null) || harness=unknown
  printf '%s\n' "$harness"
}

fm_crew_liveness_is_pi_primary() {
  case "$(fm_crew_liveness_primary_harness)" in
    pi|pi-signed) return 0 ;;
    *) return 1 ;;
  esac
}

fm_crew_liveness_is_cursor_grok_crew() {  # <meta>
  local meta=$1 harness model kind
  grep -q '^kind=secondmate$' "$meta" 2>/dev/null && return 1
  kind=$(fm_meta_get "$meta" kind)
  case "${kind:-ship}" in
    ship|scout) ;;
    *) return 1 ;;
  esac
  harness=$(fm_meta_get "$meta" harness)
  [ "$harness" = cursor ] || return 1
  model=$(fm_meta_get "$meta" model)
  case "$model" in
    cursor-grok*) return 0 ;;
    *) return 1 ;;
  esac
}

fm_crew_liveness_crew_state_terminal() {  # <state-line>
  case "$1" in
    *"state: done"*|*"state: failed"*) return 0 ;;
    *) return 1 ;;
  esac
}

report_crew_relaunch() {  # <id> <cause> <where>
  printf 'BOOTSTRAP_INFO: crew %s relaunched after %s (%s)\n' "$1" "$2" "$3"
}

crew_liveness_one() {  # <meta> <id>
  local meta=$1 id=$2 window harness backend target agent_state out cause state_line
  fm_crew_liveness_is_cursor_grok_crew "$meta" || return 0
  window=$(fm_meta_get "$meta" window)
  [ -n "$window" ] || return 0
  state_line=$("${FM_CREW_LIVENESS_CREW_STATE_BIN:-$SCRIPT_DIR/fm-crew-state.sh}" "$id" 2>/dev/null) || return 0
  fm_crew_liveness_crew_state_terminal "$state_line" && return 0
  backend=$(fm_backend_of_meta "$meta")
  target=$(fm_backend_target_of_meta "$meta")
  [ -n "$target" ] || target="$window"
  agent_state=$(fm_backend_agent_state "$backend" "$target" 2>/dev/null) || agent_state=unreadable
  case "$agent_state" in
    alive)
      if [ "${FM_BOOTSTRAP_VERBOSE_FACTS:-0}" = 1 ]; then
        echo "BOOTSTRAP_INFO: crew $id already live (backend=$backend)"
      fi
      ;;
    dead|missing)
      if [ "$agent_state" = dead ]; then
        cause="confirmed agent absence on existing endpoint"
        fm_backend_kill "$backend" "$target" 2>/dev/null || true
      else
        cause="recorded endpoint confidently missing"
      fi
      if out=$(
        FM_CONTROL_POLL="${FM_CONTROL_POLL:-0.5}" \
        FM_CONTROL_EXIT_WAIT="${FM_CONTROL_EXIT_WAIT:-30}" \
        FM_CONTROL_LAUNCH_WAIT="${FM_CONTROL_LAUNCH_WAIT:-90}" \
        "${FM_CREW_LIVENESS_CONTROL_BIN:-$SCRIPT_DIR/fm-control.sh}" "$id" relaunch \
          --note "Automatisch nach Pi-Primary-Neustart oder Session-Resume wiederhergestellt." 2>&1
      ); then
        report_crew_relaunch "$id" "$cause" "backend=$backend"
      else
        echo "CREW_LIVENESS: crew $id: relaunch failed after $cause: $(first_line "$out")"
      fi
      ;;
    ambiguous)
      echo "CREW_LIVENESS: crew $id: skipped: existing endpoint has ambiguous agent process (backend=$backend)"
      ;;
    unreadable)
      echo "CREW_LIVENESS: crew $id: skipped: endpoint probe unreadable (backend=$backend)"
      ;;
    *)
      echo "CREW_LIVENESS: crew $id: skipped: agent recovery classifier unverified (backend=$backend)"
      ;;
  esac
  return 0
}

crew_liveness_sweep() {
  fm_crew_liveness_is_pi_primary || return 0
  [ -d "$STATE" ] || return 0
  local meta id
  for meta in "$STATE"/*.meta; do
    [ -f "$meta" ] || continue
    id=$(basename "$meta" .meta)
    crew_liveness_one "$meta" "$id"
  done
  return 0
}
