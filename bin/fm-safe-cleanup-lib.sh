#!/usr/bin/env bash
# Shared classification and eligibility helpers for bin/fm-safe-cleanup.sh.
# KAPITAENSREGEL: automatic safe teardown for normal workers after terminal
# completion, never for permanent secondmates, never with --force, never by name.
#
# Sourced only; do not execute directly.
set -u

# shellcheck disable=SC2034 # Sourcing guard, read by callers that include this lib.
FM_SAFE_CLEANUP_LIB_SOURCED=1

fm_safe_cleanup_warn() {
  printf 'warning: safe-cleanup: %s\n' "$*" >&2
}

fm_safe_cleanup_permanent_mate_ids() {  # <registry>
  local reg=$1 line id
  [ -f "$reg" ] && [ ! -L "$reg" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      -' '*) id=${line#- }; id=${id%% *} ;;
      *) continue ;;
    esac
    case "$id" in
      ''|*[!A-Za-z0-9._-]*) continue ;;
    esac
    printf '%s\n' "$id"
  done < "$reg"
}

fm_safe_cleanup_is_permanent_mate() {  # <registry> <id>
  local reg=$1 id=$2 mate
  for mate in $(fm_safe_cleanup_permanent_mate_ids "$reg"); do
    [ "$mate" = "$id" ] && return 0
  done
  return 1
}

fm_safe_cleanup_workspace_label_permanent() {  # <label>
  local label=$1
  case "$label" in
    'Firstmate Pi'|'firstmate') return 0 ;;
    2ndmate-*) return 0 ;;
  esac
  return 1
}

fm_safe_cleanup_label_token() {  # <workspace-label>
  local title=$1 prefix token rest
  case "$title" in
    '└ '*' · p:'*) ;;
    *) return 1 ;;
  esac
  token=${title##*' · p:'}
  prefix=${title%" · p:$token"}
  [ "$prefix" != "$title" ] && [ -n "${prefix#'└ '}" ] || return 1
  [ "${#token}" -eq 22 ] || return 1
  case "$token" in *[!A-Za-z0-9_-]*) return 1 ;; esac
  rest=${title#*p:}
  [ "$rest" != "$title" ] || return 1
  case "$rest" in *p:*) return 1 ;; esac
  printf '%s' "$token"
}

fm_safe_cleanup_task_from_journal_token() {  # <state> <token>
  local state=$1 token=$2 journal id found
  found=
  for journal in "$state"/*.herdr-presentation; do
    [ -f "$journal" ] && [ ! -L "$journal" ] || continue
    id=$(basename "$journal" .herdr-presentation)
    fm_task_id_creation_valid "$id" || continue
    grep -F "projection_id=$token" "$journal" >/dev/null 2>&1 || continue
    if [ -n "$found" ] && [ "$found" != "$id" ]; then
      return 1
    fi
    found=$id
  done
  [ -n "$found" ] || return 1
  printf '%s' "$found"
}

fm_safe_cleanup_task_from_workspace_label() {  # <state> <label>
  local state=$1 label=$2 token
  token=$(fm_safe_cleanup_label_token "$label") || return 1
  fm_safe_cleanup_task_from_journal_token "$state" "$token"
}

fm_safe_cleanup_meta_kind() {  # <meta>
  local meta=$1
  grep '^kind=' "$meta" 2>/dev/null | cut -d= -f2- | tail -1
}

fm_safe_cleanup_task_terminal_state() {  # <state-dir> <id>
  local state=$1 id=$2 line verb
  line=$(last_status_line "$state/$id.status")
  [ -n "$line" ] || return 1
  status_is_terminal_verb "$line" || return 1
  verb=$(status_line_verb "$line")
  [ -n "$verb" ] || return 1
  printf '%s' "$verb"
}

fm_safe_cleanup_hold_only_remaining() {  # <state-dir> <id>
  local state=$1 id=$2 line
  line=$(last_status_line "$state/$id.status")
  [ -n "$line" ] || return 1
  case "$(status_line_verb "$line")" in
    needs-decision|blocked) ;;
    *) return 1 ;;
  esac
  crew_is_provably_working "$id" && return 1
  return 0
}

fm_safe_cleanup_scout_report_secured() {  # <data> <id>
  local data=$1 id=$2
  [ -f "$data/$id/report.md" ] && [ ! -L "$data/$id/report.md" ]
}

fm_safe_cleanup_results_secured() {  # <home> <state> <data> <id> <kind> <meta>
  local home=$1 state=$2 data=$3 id=$4 kind=$5 meta=$6 verb mode pr
  verb=$(fm_safe_cleanup_task_terminal_state "$state" "$id") || return 1
  case "$verb" in
    failed) return 0 ;;
    done) ;;
    *) return 1 ;;
  esac
  kind=${kind:-ship}
  case "$kind" in
    scout)
      fm_safe_cleanup_scout_report_secured "$data" "$id" || return 1
      return 0
      ;;
    secondmate)
      return 1
      ;;
  esac
  mode=$(grep '^mode=' "$meta" 2>/dev/null | cut -d= -f2- | tail -1)
  [ -n "$mode" ] || mode=no-mistakes
  if [ "$mode" = local-only ]; then
    status_log_self_test_clean_before_done "$state/$id.status" || return 1
    return 0
  fi
  pr=$(grep '^pr=' "$meta" 2>/dev/null | cut -d= -f2- | tail -1)
  [ -n "$pr" ] || return 1
  return 0
}

# Emit one machine-readable classification line:
# FM_SAFE_CLEANUP workspace=<ws> label=<label> task=<id-or-empty> class=<CLASS> detail=<text>
fm_safe_cleanup_emit_class() {
  local workspace=$1 label=$2 task=$3 class=$4 detail=$5
  task=${task:-}
  detail=${detail:-}
  printf 'FM_SAFE_CLEANUP workspace=%s label=%s task=%s class=%s detail=%s\n' \
    "$workspace" "$label" "$task" "$class" "$detail"
}

fm_safe_cleanup_classify_task() {  # <home> <state> <data> <registry> <id> [<workspace>] [<label>]
  local home=$1 state=$2 data=$3 reg=$4 id=$5 workspace=${6:-} label=${7:-}
  local meta kind verb
  meta="$state/$id.meta"
  if fm_safe_cleanup_is_permanent_mate "$reg" "$id"; then
    fm_safe_cleanup_emit_class "$workspace" "$label" "$id" PERMANENT 'registered secondmate'
    return 0
  fi
  if [ -f "$meta" ] && [ ! -L "$meta" ]; then
    kind=$(fm_safe_cleanup_meta_kind "$meta")
    [ "$kind" = secondmate ] && {
      fm_safe_cleanup_emit_class "$workspace" "$label" "$id" PERMANENT 'kind=secondmate'
      return 0
    }
    if crew_is_provably_working "$id"; then
      fm_safe_cleanup_emit_class "$workspace" "$label" "$id" AKTIV 'provably working'
      return 0
    fi
    if fm_safe_cleanup_hold_only_remaining "$state" "$id"; then
      fm_safe_cleanup_emit_class "$workspace" "$label" "$id" HOLD 'captain decision only'
      return 0
    fi
    if fm_safe_cleanup_results_secured "$home" "$state" "$data" "$id" "$kind" "$meta"; then
      fm_safe_cleanup_emit_class "$workspace" "$label" "$id" DONE 'terminal and results secured'
      return 0
    fi
    verb=$(fm_safe_cleanup_task_terminal_state "$state" "$id") || verb=
    if [ -n "$verb" ]; then
      fm_safe_cleanup_emit_class "$workspace" "$label" "$id" UNKLAR "terminal $verb but results not secured"
      return 0
    fi
    fm_safe_cleanup_emit_class "$workspace" "$label" "$id" AKTIV 'meta present, not terminal'
    return 0
  fi
  # Meta absent: journal may still name the task for a stale projection shell.
  if [ -f "$state/$id.herdr-presentation" ]; then
    fm_safe_cleanup_emit_class "$workspace" "$label" "$id" UNKLAR 'journal without meta'
    return 0
  fi
  fm_safe_cleanup_emit_class "$workspace" "$label" "$id" UNKLAR 'no meta'
  return 0
}

fm_safe_cleanup_classify_workspace() {  # <home> <state> <data> <registry> <workspace-id> <label> [<agent-status>]
  local home=$1 state=$2 data=$3 reg=$4 workspace=$5 label=$6 agent=${7:-}
  local task=''
  if fm_safe_cleanup_workspace_label_permanent "$label"; then
    fm_safe_cleanup_emit_class "$workspace" "$label" '' PERMANENT 'permanent home workspace'
    return 0
  fi
  if task=$(fm_safe_cleanup_task_from_workspace_label "$state" "$label"); then
    fm_safe_cleanup_classify_task "$home" "$state" "$data" "$reg" "$task" "$workspace" "$label"
    return 0
  fi
  case "$agent" in
    working|busy)
      fm_safe_cleanup_emit_class "$workspace" "$label" '' AKTIV "agent_status=$agent"
      return 0
      ;;
    done)
      fm_safe_cleanup_emit_class "$workspace" "$label" '' UNKLAR 'done pane without resolvable task'
      return 0
      ;;
    blocked)
      fm_safe_cleanup_emit_class "$workspace" "$label" '' HOLD 'blocked pane without resolvable task'
      return 0
      ;;
  esac
  fm_safe_cleanup_emit_class "$workspace" "$label" '' UNKLAR 'unmapped workspace'
  return 0
}

fm_safe_cleanup_try_allowed() {  # <home> <state> <data> <registry> <id>
  local home=$1 state=$2 data=$3 reg=$4 id=$5
  local meta kind
  [ -f "$state/$id.meta" ] && [ ! -L "$state/$id.meta" ] || return 1
  if fm_safe_cleanup_is_permanent_mate "$reg" "$id"; then
    return 1
  fi
  kind=$(fm_safe_cleanup_meta_kind "$state/$id.meta")
  [ "$kind" != secondmate ] || return 1
  if crew_is_provably_working "$id"; then
    return 1
  fi
  if fm_safe_cleanup_hold_only_remaining "$state" "$id"; then
    return 0
  fi
  fm_safe_cleanup_results_secured "$home" "$state" "$data" "$id" "$kind" "$state/$id.meta"
}
