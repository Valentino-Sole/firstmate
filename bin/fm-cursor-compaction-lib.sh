#!/usr/bin/env bash
# Durable Cursor-compaction hold for one stop-hook follow-up.
# Sourced by the Cursor park, preCompact marker, and afterAgentResponse clearer.
# This file is sourced by scripts and has no side effects on source.
#
# Why one owner: Cursor rejects a stop-hook followup_message submit with
# "Cannot submit a prompt while compaction is in progress". The park is the
# path that actually hands Cursor that prompt. This library is the only writer
# of the two private records that keep exactly one held follow-up across that
# window and release it once after a successful compact, without looping or
# re-submitting.
#
# Records under $STATE (never touch from the primary session):
#   .cursor-compaction       a FRESH mark means compaction is active for this home
#   .cursor-compaction-held  exactly one JSON follow-up object, or absent
#
# Mutation contract:
#   mark_active   creates or refreshes .cursor-compaction (atomic replace)
#   mark_done     removes .cursor-compaction only
#   hold_once     writes .cursor-compaction-held only when it does not exist
#   peek_held     prints the held object without consuming it; fails when absent
#   drop_held     removes the held object, only after it was actually submitted
#   is_active     true when .cursor-compaction exists AND is younger than max_age
#   wait_while_active  polls until !is_active, stand-down, or wait budget
#
# The mark carries its own updated_at and EXPIRES. Cursor exiting, crashing, or
# never firing afterAgentResponse must not silence this session's follow-ups
# forever, so a mark older than the wait budget counts as no compaction at all.
# Nothing sweeps the file: every reader ages it out through is_active.
# Delivery consumes the held object only after the submit was printed, so a
# lost owner lock or a stand-down between decision and print re-parks the event
# instead of stranding it.
#
# Digest re-emission after Cursor compaction remains deferred
# (docs/sessionstart-nudge.md). These records never inject context.

fm_cursor_compaction_active_path() {  # <state>
  printf '%s\n' "$1/.cursor-compaction"
}

fm_cursor_compaction_held_path() {  # <state>
  printf '%s\n' "$1/.cursor-compaction-held"
}

# Seconds after which an unreleased mark stops counting as an active
# compaction. Defaults to the park's own wait budget (180s).
fm_cursor_compaction_max_age() {
  local max=${FM_CURSOR_COMPACTION_MAX_AGE:-${FM_CURSOR_COMPACTION_WAIT_MAX:-180}}
  case "$max" in ''|*[!0-9]*|0) max=180 ;; esac
  printf '%s\n' "$max"
}

fm_cursor_compaction_is_active() {  # <state>
  local path updated now max
  path=$(fm_cursor_compaction_active_path "$1")
  [ -f "$path" ] || return 1
  updated=$(sed -n 's/^updated_at=//p' "$path" 2>/dev/null | head -1)
  case "$updated" in ''|*[!0-9]*) return 1 ;; esac
  now=$(date +%s 2>/dev/null || true)
  case "$now" in ''|*[!0-9]*) return 1 ;; esac
  max=$(fm_cursor_compaction_max_age)
  [ "$((now - updated))" -lt "$max" ]
}

fm_cursor_compaction_mark_active() {  # <state> [session-id]
  local state=$1 session=${2:-unknown} path tmp
  [ -n "$state" ] && [ -d "$state" ] || return 1
  case "$session" in ''|*[!A-Za-z0-9._-]*) session=unknown ;; esac
  path=$(fm_cursor_compaction_active_path "$state")
  tmp="$path.tmp.$$"
  if ! printf 'session=%s\nupdated_at=%s\n' "$session" "$(date +%s)" > "$tmp" 2>/dev/null \
    || ! mv -f "$tmp" "$path" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    return 1
  fi
  return 0
}

fm_cursor_compaction_mark_done() {  # <state>
  local path
  [ -n "$1" ] || return 0
  path=$(fm_cursor_compaction_active_path "$1")
  rm -f "$path" 2>/dev/null || true
  return 0
}

# Write $2 (a follow-up JSON object) once. A second call leaves the first
# event in place so one compaction window cannot queue two submits.
fm_cursor_compaction_hold_once() {  # <state> <json>
  local state=$1 json=$2 path tmp
  [ -n "$state" ] && [ -d "$state" ] && [ -n "$json" ] || return 1
  path=$(fm_cursor_compaction_held_path "$state")
  [ -f "$path" ] && return 0
  tmp="$path.tmp.$$"
  if ! printf '%s\n' "$json" > "$tmp" 2>/dev/null \
    || ! mv -f "$tmp" "$path" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    return 1
  fi
  return 0
}

fm_cursor_compaction_peek_held() {  # <state> -> json on stdout
  local state=$1 path json
  [ -n "$state" ] || return 1
  path=$(fm_cursor_compaction_held_path "$state")
  [ -f "$path" ] || return 1
  json=$(cat "$path" 2>/dev/null || true)
  [ -n "$json" ] || return 1
  printf '%s\n' "$json"
  return 0
}

# Consume the held object. Only a caller that has already submitted it may
# call this, so a failed submit leaves the event held for the next stop.
fm_cursor_compaction_drop_held() {  # <state>
  local path
  [ -n "$1" ] || return 0
  path=$(fm_cursor_compaction_held_path "$1")
  rm -f "$path" 2>/dev/null || true
  return 0
}

# Poll until compaction is no longer marked active.
# Returns 0 when inactive, 1 when the wait budget expired or the caller
# stand-down predicate (optional function name $3) returned true.
# $2 is the poll interval seconds; $4 is the max wait seconds.
fm_cursor_compaction_wait_while_active() {  # <state> <poll> [stand-down-fn] [max-seconds]
  local state=$1 poll=${2:-2} stand_down=${3-} max=${4:-180} elapsed=0
  case "$poll" in ''|*[!0-9]*|0) poll=2 ;; esac
  case "$max" in ''|*[!0-9]*|0) max=180 ;; esac
  while fm_cursor_compaction_is_active "$state"; do
    if [ -n "$stand_down" ] && "$stand_down"; then
      return 1
    fi
    [ "$elapsed" -ge "$max" ] && return 1
    sleep "$poll"
    elapsed=$((elapsed + poll))
  done
  return 0
}
