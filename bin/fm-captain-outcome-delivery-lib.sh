#!/usr/bin/env bash
# Shared persistent captain outcome delivery: register relevant fleet results,
# present each exactly once to the captain, and survive compaction/restart.
#
# Sourced by bin/fm-captain-outcome-delivery.sh and tests. No side effects on
# source beyond its sourced libraries.

_FM_CAPTAIN_OUTCOME_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=bin/fm-wake-lib.sh
. "$_FM_CAPTAIN_OUTCOME_LIB_DIR/fm-wake-lib.sh"
# shellcheck source=bin/fm-classify-lib.sh
. "$_FM_CAPTAIN_OUTCOME_LIB_DIR/fm-classify-lib.sh"
# shellcheck source=bin/fm-line-cap-lib.sh
. "$_FM_CAPTAIN_OUTCOME_LIB_DIR/fm-line-cap-lib.sh"

FM_CAPTAIN_OUTCOME_DELIVERY_DIR=${FM_CAPTAIN_OUTCOME_DELIVERY_DIR:-$STATE/captain-outcome-delivery}
FM_CAPTAIN_OUTCOME_LOCK=${FM_CAPTAIN_OUTCOME_LOCK:-$STATE/.captain-outcome-delivery.lock}
FM_CAPTAIN_OUTCOME_INGEST_BRANCH_CURSOR=${FM_CAPTAIN_OUTCOME_INGEST_BRANCH_CURSOR:-$STATE/.captain-outcome-ingest-branch}
FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR=${FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR:-$FM_CAPTAIN_OUTCOME_DELIVERY_DIR/.ingest-status-cursors}
FM_CAPTAIN_OUTCOME_BRANCH_STORE=${FM_CAPTAIN_OUTCOME_BRANCH_STORE:-$STATE/branch-outcomes.jsonl}
FM_CAPTAIN_OUTCOME_BRANCH_READ_CURSOR=${FM_CAPTAIN_OUTCOME_BRANCH_READ_CURSOR:-$STATE/.branch-outcomes-cursor}

fm_captain_outcome_actor_is_main() {
  case "${FM_SUPERVISION_ACTOR:-main}" in
    main|'') return 0 ;;
    *) return 1 ;;
  esac
}

fm_captain_outcome_key_safe() { # <key>
  printf '%s' "$1" | LC_ALL=C tr ':/.@+' '_____' | cut -c1-180
}

fm_captain_outcome_record_path() { # <key>
  printf '%s/%s.outcome\n' "$FM_CAPTAIN_OUTCOME_DELIVERY_DIR" "$(fm_captain_outcome_key_safe "$1")"
}

fm_captain_outcome_record_field() { # <record> <field>
  local record=$1 field=$2
  [ -f "$record" ] && [ ! -L "$record" ] || return 1
  grep "^${field}=" "$record" 2>/dev/null | tail -1 | cut -d= -f2- || true
}

fm_captain_outcome_record_set_field() { # <record> <field> <value>
  local record=$1 field=$2 value=$3 tmp line
  [ -f "$record" ] && [ ! -L "$record" ] || return 1
  tmp=$(mktemp "$FM_CAPTAIN_OUTCOME_DELIVERY_DIR/.record.XXXXXX") || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in "${field}="*) continue ;; esac
    printf '%s\n' "$line" >> "$tmp" || { rm -f "$tmp"; return 1; }
  done < "$record"
  printf '%s=%s\n' "$field" "$value" >> "$tmp" || { rm -f "$tmp"; return 1; }
  chmod 600 "$tmp" 2>/dev/null || true
  mv -f "$tmp" "$record"
}

fm_captain_outcome_sha16() { # <text>
  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$1" | shasum -a 256 | awk '{print substr($1, 1, 16)}'
  elif command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | awk '{print substr($1, 1, 16)}'
  else
    printf '%s' "$1" | cksum | awk '{printf "%08x%08x", $1, $2}'
  fi
}

fm_captain_outcome_clean_summary() {
  printf '%s' "$1" | tr '\t\r\n' '   ' | cut -c1-1200
}

fm_captain_outcome_detect_report_path() { # <task> <line>
  local task=$1 line=$2 path
  path=$(printf '%s' "$line" | sed -n 's/.*\(data\/[^[:space:]]\+\/report\.md\).*/\1/p' | head -1)
  if [ -n "$path" ]; then
    printf '%s\n' "$path"
    return 0
  fi
  path=$(printf '%s' "$line" | sed -n 's/.*\(data\/[^[:space:]]\+\/plan\.md\).*/\1/p' | head -1)
  if [ -n "$path" ]; then
    printf '%s\n' "$path"
    return 0
  fi
  if [ -f "data/$task/report.md" ]; then
    printf 'data/%s/report.md\n' "$task"
    return 0
  fi
  if [ -f "data/$task/plan.md" ]; then
    printf 'data/%s/plan.md\n' "$task"
    return 0
  fi
  return 1
}

fm_captain_outcome_classify_status() { # <task> <line>
  local task=$1 line=$2 verb key note tier='done' category=task report=''
  verb=$(status_line_verb "$line")
  note=$(status_line_note "$line")
  key=$(_fm_decision_key "$line" 2>/dev/null || printf 'default')
  # A reserved key (pending-reply-*) opened by a note outside its owner's
  # vocabulary is not a decision transition anywhere else in the fleet
  # (bin/fm-classify-lib.sh); it must not become a captain outcome here either.
  _fm_decision_key_transition_allowed "$key" "$note" || return 1
  case "$verb" in
    needs-decision)
      tier=critical
      category=decision
      ;;
    blocked|failed)
      tier=critical
      category=blocker
      ;;
    done)
      if printf '%s' "$line" | grep -qiE 'abnahme|merge|deploy|PR #|pull request|sicherheit|datenverlust|verfaelsch|produktion.*defekt|defekt.*produktion'; then
        tier=critical
        category=abnahme
      elif report=$(fm_captain_outcome_detect_report_path "$task" "$line" 2>/dev/null); then
        tier=report
        category=report
      else
        tier='done'
        category=task
      fi
      ;;
    *)
      status_is_captain_relevant "$line" || return 1
      tier='done'
      category=task
      ;;
  esac
  FM_CAPTAIN_OUTCOME_TIER=$tier
  FM_CAPTAIN_OUTCOME_CATEGORY=$category
  FM_CAPTAIN_OUTCOME_SUMMARY=$(fm_captain_outcome_clean_summary "$note")
  FM_CAPTAIN_OUTCOME_REPORT_PATH=${report:-}
  return 0
}

fm_captain_outcome_classify_branch() { # <verdict> <summary> <silent>
  local verdict=$1 summary=$2 silent=$3
  FM_CAPTAIN_OUTCOME_REPORT_PATH=
  FM_CAPTAIN_OUTCOME_SUMMARY=$(fm_captain_outcome_clean_summary "$summary")
  case "$verdict" in
    captain)
      FM_CAPTAIN_OUTCOME_TIER=critical
      FM_CAPTAIN_OUTCOME_CATEGORY=branch
      ;;
    *)
      [ "$silent" = true ] && return 1
      if printf '%s' "$summary" | grep -qiE 'abnahme|merge|deploy|PR #|needs-decision|blocker|sicherheit|datenverlust|verfaelsch'; then
        FM_CAPTAIN_OUTCOME_TIER=critical
        FM_CAPTAIN_OUTCOME_CATEGORY=branch
      elif printf '%s' "$summary" | grep -qiE 'report\.md|plan\.md|bericht'; then
        FM_CAPTAIN_OUTCOME_TIER=report
        FM_CAPTAIN_OUTCOME_CATEGORY=report
      else
        FM_CAPTAIN_OUTCOME_TIER=routine
        FM_CAPTAIN_OUTCOME_CATEGORY=branch
      fi
      ;;
  esac
  return 0
}

fm_captain_outcome_register() { # <key> <source> <task> <tier> <category> <summary> [report_path] [source_ref]
  local key=$1 source=$2 task=$3 tier=$4 category=$5 summary=$6 report_path=${7:-} source_ref=${8:-} record
  [ -n "$key" ] && [ -n "$source" ] && [ -n "$task" ] && [ -n "$tier" ] && [ -n "$summary" ] || return 1
  mkdir -p "$FM_CAPTAIN_OUTCOME_DELIVERY_DIR" "$FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR" || return 1
  [ ! -L "$FM_CAPTAIN_OUTCOME_DELIVERY_DIR" ] || return 1
  record=$(fm_captain_outcome_record_path "$key")
  if [ -f "$record" ]; then
    return 0
  fi
  {
    printf 'schema=fm-captain-outcome.v1\n'
    printf 'key=%s\n' "$key"
    printf 'source=%s\n' "$source"
    printf 'task=%s\n' "$task"
    printf 'tier=%s\n' "$tier"
    printf 'category=%s\n' "$category"
    printf 'summary=%s\n' "$(fm_captain_outcome_clean_summary "$summary")"
    printf 'report_path=%s\n' "$report_path"
    printf 'source_ref=%s\n' "$source_ref"
    printf 'registered_epoch=%s\n' "$(date +%s)"
    printf 'state=unpresented\n'
    printf 'presented_epoch=\n'
    printf 'acknowledged_epoch=\n'
  } > "$record.$$" || return 1
  chmod 600 "$record.$$" 2>/dev/null || true
  mv -f "$record.$$" "$record"
}

fm_captain_outcome_set_state() { # <key> <state>
  local key=$1 state=$2 record now
  record=$(fm_captain_outcome_record_path "$key")
  [ -f "$record" ] || return 1
  now=$(date +%s)
  fm_captain_outcome_record_set_field "$record" state "$state" || return 1
  case "$state" in
    presented)
      fm_captain_outcome_record_set_field "$record" presented_epoch "$now" || return 1
      ;;
    acknowledged)
      fm_captain_outcome_record_set_field "$record" acknowledged_epoch "$now" || return 1
      ;;
  esac
}

fm_captain_outcome_read_branch_cursor() {
  local value
  value=$(head -n 1 "$FM_CAPTAIN_OUTCOME_BRANCH_READ_CURSOR" 2>/dev/null | tr -cd '0-9' || true)
  printf '%s\n' "${value:-0}"
}

fm_captain_outcome_read_ingest_branch_cursor() {
  local value
  value=$(head -n 1 "$FM_CAPTAIN_OUTCOME_INGEST_BRANCH_CURSOR" 2>/dev/null | tr -cd '0-9' || true)
  printf '%s\n' "${value:-0}"
}

fm_captain_outcome_write_ingest_branch_cursor() { # <seq>
  local seq=$1 tmp
  tmp=$(mktemp "$STATE/.captain-outcome-ingest-branch.XXXXXX") || return 1
  printf '%s\n' "$seq" > "$tmp"
  mv -f "$tmp" "$FM_CAPTAIN_OUTCOME_INGEST_BRANCH_CURSOR"
}

fm_captain_outcome_status_ingest_cursor_path() { # <task>
  printf '%s/%s\n' "$FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR" "$(fm_captain_outcome_key_safe "$1")"
}

fm_captain_outcome_read_status_ingest_offset() { # <task>
  local task=$1 path value
  path=$(fm_captain_outcome_status_ingest_cursor_path "$task")
  value=$(head -n 1 "$path" 2>/dev/null | tr -cd '0-9' || true)
  printf '%s\n' "${value:-0}"
}

fm_captain_outcome_write_status_ingest_offset() { # <task> <offset>
  local task=$1 offset=$2 path tmp
  mkdir -p "$FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR" || return 1
  path=$(fm_captain_outcome_status_ingest_cursor_path "$task")
  tmp=$(mktemp "$FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR/.cursor.XXXXXX") || return 1
  printf '%s\n' "$offset" > "$tmp"
  mv -f "$tmp" "$path"
}

fm_captain_outcome_branch_last_seq() {
  local value
  [ -s "$FM_CAPTAIN_OUTCOME_BRANCH_STORE" ] || { printf '0\n'; return 0; }
  value=$(tail -n 1 "$FM_CAPTAIN_OUTCOME_BRANCH_STORE" | jq -er 'select((.seq | type) == "number") | .seq' 2>/dev/null) || return 1
  printf '%s\n' "$value"
}

fm_captain_outcome_ingest_branch() {
  local cursor seq line task verdict summary silent last=0
  [ -s "$FM_CAPTAIN_OUTCOME_BRANCH_STORE" ] || return 0
  cursor=$(fm_captain_outcome_read_ingest_branch_cursor)
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    seq=$(printf '%s' "$line" | jq -er '.seq // empty' 2>/dev/null) || continue
    task=$(printf '%s' "$line" | jq -er '.task // empty' 2>/dev/null) || continue
    verdict=$(printf '%s' "$line" | jq -er '.verdict // empty' 2>/dev/null) || continue
    summary=$(printf '%s' "$line" | jq -er '.summary // empty' 2>/dev/null) || continue
    silent=$(printf '%s' "$line" | jq -er '.silent // false' 2>/dev/null) || silent=false
    fm_captain_outcome_classify_branch "$verdict" "$summary" "$silent" || { last=$seq; continue; }
    fm_captain_outcome_register "branch:seq:$seq" branch-outcome "$task" \
      "$FM_CAPTAIN_OUTCOME_TIER" "$FM_CAPTAIN_OUTCOME_CATEGORY" \
      "$FM_CAPTAIN_OUTCOME_SUMMARY" "$FM_CAPTAIN_OUTCOME_REPORT_PATH" "$seq" || return 1
    last=$seq
  done < <(jq -c --argjson cursor "$cursor" 'select((.seq // 0) > $cursor)' "$FM_CAPTAIN_OUTCOME_BRANCH_STORE" 2>/dev/null || true)
  if [ "$last" -gt "$cursor" ]; then
    fm_captain_outcome_write_ingest_branch_cursor "$last"
  fi
  return 0
}

fm_captain_outcome_ingest_status_file() { # <status-file>
  local f=$1 task offset size actual_size chunk_file line key
  [ -f "$f" ] && [ -r "$f" ] && [ ! -L "$f" ] || return 0
  mkdir -p "$FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR" || return 1
  [ ! -L "$FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR" ] || return 1
  task=$(basename "$f"); task="${task%.status}"
  offset=$(fm_captain_outcome_read_status_ingest_offset "$task")
  actual_size=$(_fm_status_file_size "$f") || return 1
  actual_size=${actual_size//[[:space:]]/}
  case "$actual_size" in ''|*[!0-9]*) return 1 ;; esac
  [ "$offset" -lt "$actual_size" ] || return 0
  chunk_file="$FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR/.chunk.$$"
  _fm_status_read_span "$f" "$offset" "$((actual_size - offset))" > "$chunk_file" 2>/dev/null \
    || { rm -f "$chunk_file"; return 1; }
  # shellcheck disable=SC2094 # The loop only reads the chunk; the register step writes the store, never the chunk.
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in *[![:space:]]*) ;; *) continue ;; esac
    fm_captain_outcome_classify_status "$task" "$line" || continue
    key="status:${task}:$(fm_captain_outcome_sha16 "$line")"
    fm_captain_outcome_register "$key" status "$task" \
      "$FM_CAPTAIN_OUTCOME_TIER" "$FM_CAPTAIN_OUTCOME_CATEGORY" \
      "$FM_CAPTAIN_OUTCOME_SUMMARY" "$FM_CAPTAIN_OUTCOME_REPORT_PATH" "$line" || {
      rm -f "$chunk_file"
      return 1
    }
  done < "$chunk_file"
  rm -f "$chunk_file"
  fm_captain_outcome_write_status_ingest_offset "$task" "$actual_size"
}

fm_captain_outcome_ingest_status() {
  local f
  for f in "$STATE"/*.status; do
    [ -e "$f" ] || continue
    fm_captain_outcome_ingest_status_file "$f" || return 1
  done
}

fm_captain_outcome_ingest_terminal() {
  local dir=$STATE/terminal-outcomes record fingerprint task state summary key
  [ -d "$dir" ] && [ ! -L "$dir" ] || return 0
  for record in "$dir"/*.pending; do
    [ -e "$record" ] || continue
    fingerprint=$(fm_captain_outcome_record_field "$record" fingerprint)
    task=$(fm_captain_outcome_record_field "$record" task_id)
    state=$(fm_captain_outcome_record_field "$record" state)
    [ -n "$fingerprint" ] && [ -n "$task" ] || continue
    case "$state" in done|failed) ;; *) continue ;; esac
    summary="Terminaler Zustand $state fuer $task (inactive reconcile)"
    key="terminal:$fingerprint"
    fm_captain_outcome_register "$key" terminal-outcome "$task" 'done' task "$summary" '' "$fingerprint" || return 1
  done
}

fm_captain_outcome_ingest_all() {
  fm_captain_outcome_ingest_branch || return 1
  fm_captain_outcome_ingest_status || return 1
  fm_captain_outcome_ingest_terminal || return 1
}

fm_captain_outcome_list_unpresented() {
  local record
  for record in "$FM_CAPTAIN_OUTCOME_DELIVERY_DIR"/*.outcome; do
    [ -e "$record" ] || continue
    [ "$(fm_captain_outcome_record_field "$record" state)" = unpresented ] || continue
    cat "$record"
    printf -- '---\n'
  done
}

fm_captain_outcome_format_line() { # <record>
  local record=$1 task tier summary report_path line
  task=$(fm_captain_outcome_record_field "$record" task)
  tier=$(fm_captain_outcome_record_field "$record" tier)
  summary=$(fm_captain_outcome_record_field "$record" summary)
  report_path=$(fm_captain_outcome_record_field "$record" report_path)
  line="$task: $summary"
  [ -n "$report_path" ] && line="$line (Bericht: $report_path)"
  fm_cap_line_var "$line" 220
  printf '%s\n' "$FM_LINE_CAP_LINE"
}

fm_captain_outcome_present_section() {
  local record key tier line
  local critical_n=0 finished_n=0 report_n=0 routine_n=0 shown=0
  local critical='' finished='' report=''
  fm_captain_outcome_ingest_all || return 1
  for record in "$FM_CAPTAIN_OUTCOME_DELIVERY_DIR"/*.outcome; do
    [ -e "$record" ] || continue
    [ "$(fm_captain_outcome_record_field "$record" state)" = unpresented ] || continue
    tier=$(fm_captain_outcome_record_field "$record" tier)
    key=$(fm_captain_outcome_record_field "$record" key)
    line=$(fm_captain_outcome_format_line "$record")
    case "$tier" in
      critical)
        critical_n=$((critical_n + 1))
        critical="${critical}${critical_n}) ${line}
"
        ;;
      report)
        report_n=$((report_n + 1))
        report="${report}${report_n}) ${line}
"
        ;;
      done)
        finished_n=$((finished_n + 1))
        finished="${finished}${finished_n}) ${line}
"
        ;;
      *)
        routine_n=$((routine_n + 1))
        ;;
    esac
    fm_captain_outcome_set_state "$key" presented || return 1
    shown=$((shown + 1))
  done
  [ "$shown" -gt 0 ] || return 0
  printf 'NEUE ERGEBNISSE SEIT DEM LETZTEN BERICHT\n'
  printf 'NEUE OUTCOMES: %s\n' "$shown"
  if [ "$critical_n" -gt 0 ]; then
    printf '\nKRITISCH / CAPTAIN:\n%s' "$critical"
  fi
  if [ "$finished_n" -gt 0 ]; then
    printf '\nFERTIG:\n%s' "$finished"
  fi
  if [ "$report_n" -gt 0 ]; then
    printf '\nBERICHTE:\n%s' "$report"
  fi
  if [ "$routine_n" -gt 0 ]; then
    printf '\nROUTINE:\n%d weitere erledigt, keine Entscheidung noetig.\n' "$routine_n"
  fi
}

fm_captain_outcome_baseline_ingest_cursors() {
  local f task actual_size last=0
  mkdir -p "$FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR" "$FM_CAPTAIN_OUTCOME_DELIVERY_DIR" || return 1
  for f in "$STATE"/*.status; do
    [ -e "$f" ] || continue
    task=$(basename "$f"); task="${task%.status}"
    actual_size=$(_fm_status_file_size "$f") || return 1
    actual_size=${actual_size//[[:space:]]/}
    case "$actual_size" in ''|*[!0-9]*) return 1 ;; esac
    fm_captain_outcome_write_status_ingest_offset "$task" "$actual_size" || return 1
  done
  last=$(fm_captain_outcome_branch_last_seq) || return 1
  fm_captain_outcome_write_ingest_branch_cursor "$last"
}

fm_captain_outcome_catch_up() {
  local record key source_ref branch_cursor seq
  if [ ! -e "$STATE/.captain-outcome-catch-up-baselined" ]; then
    fm_captain_outcome_baseline_ingest_cursors || return 1
    : > "$STATE/.captain-outcome-catch-up-baselined"
  fi
  fm_captain_outcome_ingest_all || return 1
  branch_cursor=$(fm_captain_outcome_read_branch_cursor)
  for record in "$FM_CAPTAIN_OUTCOME_DELIVERY_DIR"/*.outcome; do
    [ -e "$record" ] || continue
    [ "$(fm_captain_outcome_record_field "$record" state)" = unpresented ] || continue
    key=$(fm_captain_outcome_record_field "$record" key)
    case "$key" in
      branch:seq:*)
        seq=${key##branch:seq:}
        case "$seq" in ''|*[!0-9]*) continue ;; esac
        [ "$seq" -le "$branch_cursor" ] || continue
        fm_captain_outcome_set_state "$key" presented || return 1
        ;;
    esac
  done
  return 0
}
