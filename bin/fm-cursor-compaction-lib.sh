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
#   .cursor-compaction       a FRESH mark means compaction is active for this
#                            home; once the window closes the same record keeps
#                            an ended_at stamp instead of vanishing
#   .cursor-compaction-held  exactly one held follow-up, or absent: session,
#                            updated_at, window and budget header lines, then
#                            the JSON
#
# Mutation contract:
#   mark_active   opens a window in .cursor-compaction (atomic replace)
#   mark_done     stamps that window closed, so nothing reads it as active any
#                 more and both its identity and closing moment stay known
#   is_open       true while the mark names a window nothing has closed yet
#   window_id     the identity of the window the mark names, open or closed
#   ended_recently  true while that closing stamp is younger than the budget
#   hold_once     creates .cursor-compaction-held atomically; 0 when this call
#                 holds the event, 2 when a deliverable event is already held,
#                 1 on error. A record that is no longer deliverable is replaced.
#   held_is_deliverable  true for a fresh record parked by this same session
#   peek_held     prints the held object without consuming it; fails when it is
#                 absent or no longer deliverable
#   peek_held_budget  prints the budget action the eventual submit must carry
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
# The budget header travels with the event because the stop that finally submits
# it is usually not the stop that built it: an actionable wake still resets the
# repair-nag budget when it is delivered out of the hold. Only reset-budget is
# ever stored or honoured, so a corrupt record cannot drive a budget mutation.
# The session and updated_at headers bound the event the way the mark bounds
# itself: a follow-up built for one session is never replayed into the next one,
# and one that nothing delivered inside the wait budget expires instead of
# sitting in the slot forever. An expired or foreign record blocks nothing,
# because the next hold replaces it; again no sweeper and no daemon.
# That age is measured against the window as well as the clock. A window that
# outlasts the park's wait leaves the event parked with no stop to deliver it -
# nothing was submitted, so no further turn starts - and it must not expire for
# that reason alone. The closing stamp is what proves the wait was legitimate:
# while compaction ended less than a budget ago, a held event parked INSIDE that
# same window is still deliverable, which is exactly the stop that follows the
# window closing. The grace is tied to the window by identity, so it covers the
# one wait that was actually legitimate and nothing older: an unrelated window
# opening and closing hours later cannot revive an event that expired long
# before it. Stranding still cannot outlive one window.
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

# True while the mark names a window nothing has closed yet, however old it is.
# A closed mark keeps its identity but no updated_at, so it never reads as open.
fm_cursor_compaction_is_open() {  # <state>
  local path updated
  [ -n "$1" ] || return 1
  path=$(fm_cursor_compaction_active_path "$1")
  [ -f "$path" ] || return 1
  updated=$(sed -n 's/^updated_at=//p' "$path" 2>/dev/null | head -1)
  case "$updated" in ''|*[!0-9]*) return 1 ;; esac
  return 0
}

# The identity of the window this mark names, open or closed. A held event
# records it so the closing grace can only ever cover its own window.
fm_cursor_compaction_window_id() {  # <state>
  local path window
  [ -n "$1" ] || return 1
  path=$(fm_cursor_compaction_active_path "$1")
  [ -f "$path" ] || return 1
  window=$(sed -n 's/^window=//p' "$path" 2>/dev/null | head -1)
  case "$window" in ''|*[!0-9]*) return 1 ;; esac
  printf '%s\n' "$window"
  return 0
}

fm_cursor_compaction_is_active() {  # <state>
  local path updated now max
  fm_cursor_compaction_is_open "$1" || return 1
  path=$(fm_cursor_compaction_active_path "$1")
  updated=$(sed -n 's/^updated_at=//p' "$path" 2>/dev/null | head -1)
  now=$(date +%s 2>/dev/null || true)
  case "$now" in ''|*[!0-9]*) return 1 ;; esac
  max=$(fm_cursor_compaction_max_age)
  [ "$((now - updated))" -lt "$max" ]
}

fm_cursor_compaction_mark_active() {  # <state> [session-id]
  local state=$1 session=${2:-unknown} path tmp now
  [ -n "$state" ] && [ -d "$state" ] || return 1
  case "$session" in ''|*[!A-Za-z0-9._-]*) session=unknown ;; esac
  path=$(fm_cursor_compaction_active_path "$state")
  tmp="$path.tmp.$$"
  now=$(date +%s)
  if ! printf 'session=%s\nwindow=%s\nupdated_at=%s\n' "$session" "$now" "$now" > "$tmp" 2>/dev/null \
    || ! mv -f "$tmp" "$path" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    return 1
  fi
  return 0
}

fm_cursor_compaction_mark_done() {  # <state>
  local state=$1 path tmp session window
  [ -n "$state" ] || return 0
  fm_cursor_compaction_is_open "$state" || return 0
  path=$(fm_cursor_compaction_active_path "$state")
  session=$(sed -n 's/^session=//p' "$path" 2>/dev/null | head -1)
  case "$session" in ''|*[!A-Za-z0-9._-]*) session=unknown ;; esac
  window=$(fm_cursor_compaction_window_id "$state") || window=0
  tmp="$path.tmp.$$"
  if printf 'session=%s\nwindow=%s\nended_at=%s\n' "$session" "$window" "$(date +%s)" > "$tmp" 2>/dev/null \
    && mv -f "$tmp" "$path" 2>/dev/null; then
    return 0
  fi
  rm -f "$tmp" 2>/dev/null || true
  rm -f "$path" 2>/dev/null || true
  return 0
}

# True while the last compaction window closed less than the budget ago. A
# closed mark carries no updated_at, so it is never active again.
fm_cursor_compaction_ended_recently() {  # <state>
  local state=$1 path ended now max
  [ -n "$state" ] || return 1
  path=$(fm_cursor_compaction_active_path "$state")
  [ -f "$path" ] || return 1
  ended=$(sed -n 's/^ended_at=//p' "$path" 2>/dev/null | head -1)
  case "$ended" in ''|*[!0-9]*) return 1 ;; esac
  now=$(date +%s 2>/dev/null || true)
  case "$now" in ''|*[!0-9]*) return 1 ;; esac
  max=$(fm_cursor_compaction_max_age)
  [ "$((now - ended))" -lt "$max" ]
}

# One header field of the held record, read before the JSON object begins.
fm_cursor_compaction_held_field() {  # <path> <key> -> value on stdout
  local path=$1 key=$2 line
  while IFS= read -r line; do
    case "$line" in
      '{'*) break ;;
      "$key="*) printf '%s\n' "${line#"$key="}"; return 0 ;;
    esac
  done < "$path" 2>/dev/null
  return 1
}

# A held event may be submitted only by the session that parked it, and only
# while it is younger than the wait budget the mark uses - or while the very
# window it was parked inside closed that recently, because then this is the
# first stop that could carry it at all. An unrelated later window never
# revives it.
fm_cursor_compaction_held_is_deliverable() {  # <state> <session>
  local state=$1 session=$2 path owner updated now max window
  [ -n "$state" ] && [ -n "$session" ] || return 1
  path=$(fm_cursor_compaction_held_path "$state")
  [ -f "$path" ] || return 1
  owner=$(fm_cursor_compaction_held_field "$path" session) || return 1
  [ "$owner" = "$session" ] || return 1
  updated=$(fm_cursor_compaction_held_field "$path" updated_at) || return 1
  case "$updated" in ''|*[!0-9]*) return 1 ;; esac
  now=$(date +%s 2>/dev/null || true)
  case "$now" in ''|*[!0-9]*) return 1 ;; esac
  max=$(fm_cursor_compaction_max_age)
  [ "$((now - updated))" -lt "$max" ] && return 0
  fm_cursor_compaction_ended_recently "$state" || return 1
  window=$(fm_cursor_compaction_held_field "$path" window) || return 1
  case "$window" in ''|*[!0-9]*) return 1 ;; esac
  [ "$window" = "$(fm_cursor_compaction_window_id "$state")" ]
}

# Write $2 (a follow-up JSON object) once for session $3, carrying the budget
# action $4 that its eventual submit must apply and the identity of the window
# it is parked inside. A second call leaves a
# deliverable event in place so one compaction window cannot queue two submits;
# an expired or foreign record is replaced rather than left blocking the slot.
# The link is the create-if-absent primitive: two overlapping parks cannot
# replace each other's record, and the loser learns it did not hold this event.
# Returns 0 when this call holds $2, 2 when another event is already held.
fm_cursor_compaction_hold_once() {  # <state> <json> <session> [budget]
  local state=$1 json=$2 session=$3 budget=${4-} path tmp window
  [ -n "$state" ] && [ -d "$state" ] && [ -n "$json" ] && [ -n "$session" ] || return 1
  case "$session" in *[!A-Za-z0-9._-]*) return 1 ;; esac
  case "$budget" in reset-budget) ;; *) budget= ;; esac
  path=$(fm_cursor_compaction_held_path "$state")
  if [ -e "$path" ]; then
    fm_cursor_compaction_held_is_deliverable "$state" "$session" && return 2
    rm -f "$path" 2>/dev/null || true
    [ -e "$path" ] && return 2
  fi
  window=$(fm_cursor_compaction_window_id "$state") || window=
  tmp="$path.tmp.$$"
  if ! printf 'session=%s\nupdated_at=%s\nwindow=%s\nbudget=%s\n%s\n' \
    "$session" "$(date +%s)" "$window" "$budget" "$json" > "$tmp" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    return 1
  fi
  if ln "$tmp" "$path" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    return 0
  fi
  rm -f "$tmp" 2>/dev/null || true
  [ -e "$path" ] && return 2
  return 1
}

fm_cursor_compaction_peek_held() {  # <state> <session> -> json on stdout
  local state=$1 session=$2 path json
  fm_cursor_compaction_held_is_deliverable "$state" "$session" || return 1
  path=$(fm_cursor_compaction_held_path "$state")
  json=$(sed -n '/^{/,$p' "$path" 2>/dev/null || true)
  [ -n "$json" ] || return 1
  printf '%s\n' "$json"
  return 0
}

# The budget action the submit of this held event must apply. Prints nothing
# for a record that carries none, so the caller commits no budget at all.
fm_cursor_compaction_peek_held_budget() {  # <state> <session> -> token on stdout
  local state=$1 session=$2 path budget
  fm_cursor_compaction_held_is_deliverable "$state" "$session" || return 1
  path=$(fm_cursor_compaction_held_path "$state")
  budget=$(fm_cursor_compaction_held_field "$path" budget) || return 0
  case "$budget" in
    reset-budget) printf 'reset-budget\n' ;;
  esac
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
