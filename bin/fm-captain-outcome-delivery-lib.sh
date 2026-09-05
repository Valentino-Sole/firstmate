#!/usr/bin/env bash
# Shared persistent captain outcome delivery: register captain-facing status
# results that no other presentation path delivers, present each exactly once
# to the captain, and survive compaction/restart.
#
# Ownership boundary. Every other captain-facing delivery path keeps its own
# durable receipt, so this store never duplicates them:
#   - needs-decision and blocked lines belong to the OPEN DECISIONS fold
#     (bin/fm-classify-lib.sh), which re-presents them on every drain while
#     they stay open; they are never registered here.
#   - a status line covered by a newer supervision-branch outcome for the same
#     task (the bounded index bin/fm-branch-outcome.sh maintains) was already
#     delivered by the branch path and is never registered here.
#   - the newest captain-facing event of a task belongs to the drain's STATUS
#     OUTCOME BACKSTOP for as long as it stays newest, including while that
#     bounded section defers it; a record whose line is still its file's last
#     event is held back here, and the drain records the backstop's
#     presentation (fm_captain_outcome_note_presented_status_line) so the same
#     line is never presented twice once it is buried.
#   - branch outcome rows and inactive-reconcile terminal outcomes reach main
#     through the branch cursor and the durable wake queue respectively.
# What remains are captain-facing done: and failed: results buried under later
# routine lines, which no bounded latest-event scan would surface again.
#
# Sourced by bin/fm-captain-outcome-delivery.sh, bin/fm-wake-drain.sh, and
# tests. No side effects on source beyond its sourced libraries.

_FM_CAPTAIN_OUTCOME_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=bin/fm-wake-lib.sh
. "$_FM_CAPTAIN_OUTCOME_LIB_DIR/fm-wake-lib.sh"
# shellcheck source=bin/fm-classify-lib.sh
. "$_FM_CAPTAIN_OUTCOME_LIB_DIR/fm-classify-lib.sh"
# shellcheck source=bin/fm-line-cap-lib.sh
. "$_FM_CAPTAIN_OUTCOME_LIB_DIR/fm-line-cap-lib.sh"

FM_CAPTAIN_OUTCOME_DELIVERY_DIR=${FM_CAPTAIN_OUTCOME_DELIVERY_DIR:-$STATE/captain-outcome-delivery}
FM_CAPTAIN_OUTCOME_LOCK=${FM_CAPTAIN_OUTCOME_LOCK:-$STATE/.captain-outcome-delivery.lock}
FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR=${FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR:-$FM_CAPTAIN_OUTCOME_DELIVERY_DIR/.ingest-status-cursors}
FM_CAPTAIN_OUTCOME_INDEX_VERSION=fm-branch-outcome-index-v1
FM_CAPTAIN_OUTCOME_INDEX_MAX_BYTES=512

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

fm_captain_outcome_status_key() { # <task> <line>
  printf 'status:%s:%s\n' "$1" "$(fm_captain_outcome_sha16 "$2")"
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

# Classify one status line as a captain outcome this store owns. Returns 1 for
# every line another presentation path already delivers (see the header).
fm_captain_outcome_classify_status() { # <task> <line>
  local task=$1 line=$2 verb key note tier='done' category=task report=''
  status_is_captain_relevant "$line" || return 1
  verb=$(status_line_verb "$line")
  note=$(status_line_note "$line")
  key=$(_fm_decision_key "$line" 2>/dev/null || printf 'default')
  # A reserved key (pending-reply-*) opened by a note outside its owner's
  # vocabulary is not a decision transition anywhere else in the fleet
  # (bin/fm-classify-lib.sh); it must not become a captain outcome here either.
  _fm_decision_key_transition_allowed "$key" "$note" || return 1
  case "$verb" in
    needs-decision|blocked)
      # The durable OPEN DECISIONS fold owns open decisions and blockers.
      return 1
      ;;
    failed)
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

_fm_captain_outcome_byte_length() { # <text>
  local LC_ALL=C
  printf '%s\n' "${#1}"
}

# Read the task's bounded branch-outcome index into
# FM_CAPTAIN_OUTCOME_COVER_ENDPOINT / FM_CAPTAIN_OUTCOME_COVER_IDENT. Absent,
# unreadable, or malformed indexes leave both empty: an unproven cover never
# suppresses a result, the same direction the drain's backstop takes.
fm_captain_outcome_load_cover() { # <task>
  local task=$1 path data version seq endpoint ident extra size
  FM_CAPTAIN_OUTCOME_COVER_ENDPOINT=
  FM_CAPTAIN_OUTCOME_COVER_IDENT=
  case "$task" in ''|*[!A-Za-z0-9._-]*) return 0 ;; esac
  path="$STATE/.$task.branch-outcome-index"
  [ -f "$path" ] && [ -r "$path" ] && [ ! -L "$path" ] || return 0
  size=$(_fm_status_file_size "$path" 2>/dev/null) || return 0
  size=${size//[[:space:]]/}
  case "$size" in ''|*[!0-9]*) return 0 ;; esac
  [ "$size" -le "$FM_CAPTAIN_OUTCOME_INDEX_MAX_BYTES" ] || return 0
  data=$(LC_ALL=C command cat "$path" 2>/dev/null) || return 0
  case "$data" in *$'\n'*) return 0 ;; esac
  IFS=$(printf '\t') read -r version seq endpoint ident extra <<EOF
$data
EOF
  [ "$version" = "$FM_CAPTAIN_OUTCOME_INDEX_VERSION" ] && [ -z "$extra" ] || return 0
  case "$seq:$endpoint" in *[!0-9:]*) return 0 ;; esac
  [ -n "$seq" ] && [ -n "$endpoint" ] && [ -n "$ident" ] || return 0
  FM_CAPTAIN_OUTCOME_COVER_ENDPOINT=$endpoint
  FM_CAPTAIN_OUTCOME_COVER_IDENT=$ident
}

# 0 when a supervision-branch outcome for this task already covers the status
# span ending at <line-endpoint> in the file identified by <ident>.
fm_captain_outcome_line_covered() { # <line-endpoint> <ident>
  [ -n "$FM_CAPTAIN_OUTCOME_COVER_ENDPOINT" ] || return 1
  [ "$FM_CAPTAIN_OUTCOME_COVER_IDENT" = "$2" ] || return 1
  [ "$FM_CAPTAIN_OUTCOME_COVER_ENDPOINT" -ge "$1" ]
}

fm_captain_outcome_ingest_status_file() { # <status-file>
  local f=$1 task offset actual_size chunk_file line key ident pos len endpoint
  [ -f "$f" ] && [ -r "$f" ] && [ ! -L "$f" ] || return 0
  mkdir -p "$FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR" || return 1
  [ ! -L "$FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR" ] || return 1
  task=$(basename "$f"); task="${task%.status}"
  offset=$(fm_captain_outcome_read_status_ingest_offset "$task")
  actual_size=$(_fm_status_file_size "$f") || return 1
  actual_size=${actual_size//[[:space:]]/}
  case "$actual_size" in ''|*[!0-9]*) return 1 ;; esac
  [ "$offset" -lt "$actual_size" ] || return 0
  ident=$(_fm_open_decisions_file_ident "$f") || return 1
  fm_captain_outcome_load_cover "$task"
  chunk_file="$FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR/.chunk.$$"
  _fm_status_read_span "$f" "$offset" "$((actual_size - offset))" > "$chunk_file" 2>/dev/null \
    || { rm -f "$chunk_file"; return 1; }
  pos=$offset
  # shellcheck disable=SC2094 # The loop only reads the chunk; the register step writes the store, never the chunk.
  while IFS= read -r line || [ -n "$line" ]; do
    len=$(_fm_captain_outcome_byte_length "$line")
    endpoint=$((pos + len))
    # A line the read stopped at a newline for is charged for that newline,
    # the same endpoint arithmetic the branch index and the backstop use.
    [ "$endpoint" -ge "$actual_size" ] || endpoint=$((endpoint + 1))
    pos=$endpoint
    case "$line" in *[![:space:]]*) ;; *) continue ;; esac
    fm_captain_outcome_line_covered "$endpoint" "$ident" && continue
    fm_captain_outcome_classify_status "$task" "$line" || continue
    key=$(fm_captain_outcome_status_key "$task" "$line")
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

fm_captain_outcome_ingest_all() {
  fm_captain_outcome_ingest_status || return 1
}

# Record that another drain section (the STATUS OUTCOME BACKSTOP) presented
# this status line, so the outcome section never shows it a second time. The
# record is created in the presented state when ingestion has not reached the
# line yet, which is the common order inside one drain. Lines this store does
# not own are ignored. Caller holds no outcome lock; this takes it.
fm_captain_outcome_note_presented_status_line() { # <task> <line>
  local task=$1 line=$2 key rc=0
  fm_captain_outcome_classify_status "$task" "$line" || return 0
  key=$(fm_captain_outcome_status_key "$task" "$line")
  fm_lock_acquire_wait "$FM_CAPTAIN_OUTCOME_LOCK"
  fm_captain_outcome_register "$key" status "$task" \
    "$FM_CAPTAIN_OUTCOME_TIER" "$FM_CAPTAIN_OUTCOME_CATEGORY" \
    "$FM_CAPTAIN_OUTCOME_SUMMARY" "$FM_CAPTAIN_OUTCOME_REPORT_PATH" "$line" || rc=1
  if [ "$rc" -eq 0 ] \
    && [ "$(fm_captain_outcome_record_field "$(fm_captain_outcome_record_path "$key")" state)" = unpresented ]; then
    fm_captain_outcome_set_state "$key" presented || rc=1
  fi
  fm_lock_release "$FM_CAPTAIN_OUTCOME_LOCK"
  return "$rc"
}

# 0 when <line> is still the last non-blank event of the task's status file.
# A missing file (the task was cleaned up) is not newest: nothing else will
# present the record, so this store does. Bounded to the file's final 64 KiB.
fm_captain_outcome_line_is_newest_event() { # <task> <line>
  local f="$STATE/$1.status" last
  [ -f "$f" ] && [ ! -L "$f" ] || return 1
  last=$(LC_ALL=C tail -c 65536 "$f" 2>/dev/null | awk 'NF { last=$0 } END { print last }') || return 1
  [ "$last" = "$2" ]
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
  local record=$1 task summary report_path line
  task=$(fm_captain_outcome_record_field "$record" task)
  summary=$(fm_captain_outcome_record_field "$record" summary)
  report_path=$(fm_captain_outcome_record_field "$record" report_path)
  line="$task: $summary"
  [ -n "$report_path" ] && line="$line (Bericht: $report_path)"
  fm_cap_line_var "$line" 220
  printf '%s\n' "$FM_LINE_CAP_LINE"
}

# Presentation is bounded like the drain's other sections: at most
# FM_CAPTAIN_OUTCOME_SECTION_BYTES of items per call, the rest stay unpresented
# for the next call and are counted on the last line.
FM_CAPTAIN_OUTCOME_SECTION_BYTES=${FM_CAPTAIN_OUTCOME_SECTION_BYTES:-4000}
fm_captain_outcome_present_section() {
  local record key tier line task source_ref bytes used=0 deferred=0
  local critical_n=0 finished_n=0 report_n=0 shown=0
  local critical='' finished='' report=''
  fm_captain_outcome_ingest_all || return 1
  for record in "$FM_CAPTAIN_OUTCOME_DELIVERY_DIR"/*.outcome; do
    [ -e "$record" ] || continue
    [ "$(fm_captain_outcome_record_field "$record" state)" = unpresented ] || continue
    if [ "$(fm_captain_outcome_record_field "$record" source)" = status ]; then
      task=$(fm_captain_outcome_record_field "$record" task)
      source_ref=$(fm_captain_outcome_record_field "$record" source_ref)
      fm_captain_outcome_line_is_newest_event "$task" "$source_ref" && continue
    fi
    tier=$(fm_captain_outcome_record_field "$record" tier)
    key=$(fm_captain_outcome_record_field "$record" key)
    line=$(fm_captain_outcome_format_line "$record")
    bytes=$(( $(_fm_captain_outcome_byte_length "$line") + 4 ))
    if [ $((used + bytes)) -gt "$FM_CAPTAIN_OUTCOME_SECTION_BYTES" ]; then
      deferred=$((deferred + 1))
      continue
    fi
    used=$((used + bytes))
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
      *)
        finished_n=$((finished_n + 1))
        finished="${finished}${finished_n}) ${line}
"
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
  if [ "$deferred" -gt 0 ]; then
    printf '\nNOCH NICHT GEZEIGT: %d weitere Ergebnisse folgen im naechsten Bericht (Umfangsgrenze).\n' "$deferred"
  fi
}

# One-time baseline: history that predates this store was delivered by the
# paths that existed then, so it is never presented as new.
fm_captain_outcome_baseline_ingest_cursors() {
  local f task actual_size
  mkdir -p "$FM_CAPTAIN_OUTCOME_INGEST_STATUS_DIR" "$FM_CAPTAIN_OUTCOME_DELIVERY_DIR" || return 1
  for f in "$STATE"/*.status; do
    [ -e "$f" ] || continue
    task=$(basename "$f"); task="${task%.status}"
    actual_size=$(_fm_status_file_size "$f") || return 1
    actual_size=${actual_size//[[:space:]]/}
    case "$actual_size" in ''|*[!0-9]*) return 1 ;; esac
    fm_captain_outcome_write_status_ingest_offset "$task" "$actual_size" || return 1
  done
}

fm_captain_outcome_catch_up() {
  if [ ! -e "$STATE/.captain-outcome-catch-up-baselined" ]; then
    fm_captain_outcome_baseline_ingest_cursors || return 1
    : > "$STATE/.captain-outcome-catch-up-baselined"
  fi
  fm_captain_outcome_ingest_all || return 1
  return 0
}
