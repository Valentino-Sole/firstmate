#!/usr/bin/env bash
# Cursor `stop` hook adapter for a firstmate PRIMARY session: the park model.
#
# Registered in tracked .cursor/hooks.json. Cursor runs this hook SYNCHRONOUSLY
# and awaits it at every turn boundary, so one script owns both halves of Cursor
# primary supervision:
#
#   PARK      while supervision is needed, foreground bin/fm-watch-arm.sh and
#             hold the turn boundary open until the watcher closes with an
#             actionable wake, then return that wake as the follow-up. No model
#             tokens are spent while parked. The next turn end parks again, so
#             the arm/re-arm loop is hook-owned, never model-memory-owned.
#   BACKSTOP  when the park cannot establish supervision, return the shared
#             turn-end guard's repair instruction as a bounded follow-up.
#
# EXIT 2 IS A SILENT NO-OP ON CURSOR'S stop. Cursor's blocked-response mapper
# returns an empty object for the stop step (index.js @ 4823085,
# `e===r.stop ? {} : void 0`), verified live: a stop hook exiting 2 ends the turn
# normally. This adapter therefore NEVER exits 2 and NEVER writes a diagnostic
# banner to stderr expecting it to be read. Every path exits 0 and the only
# channel is at most one {"followup_message": ...} object on stdout.
# docs/turnend-guard.md:16 accepts one bounded follow-up as an equal alternative
# to blocking, which is the same primitive OpenCode's session.idle and Pi's
# agent_settled adapters use.
#
# Follow-up sources, in priority order, at most one per invocation:
#   1. a follow-up held from an earlier compaction window, once compaction is done;
#   2. an actionable watcher wake from the park;
#   3. the bounded repair instruction when supervision could not be established.
# Priority 1 is claimed BEFORE this park builds anything, never by substituting
# a stale held object for a freshly built one at submit time: the once-only
# ceiling notice and a fresh wake must reach the session as themselves, whether
# or not compaction is active when they are committed.
#
# ONE GUARDED SECTION. Every shared-state mutation and the single stdout object
# happen under the same HELD owner lock, after the same park ownership, session
# ownership and away-mode checks. That includes writing the compaction hold and
# spending repair-nag budget: the lock is never released between a check and the
# mutation it guards, and away mode (bin/fm-afk-start.sh) plus a newer stop's
# claim serialize on that same lock. A superseded park, a foreign session or away
# mode can therefore neither leave a follow-up behind nor consume the budget, and
# a nag that is held counts exactly like a nag that is printed.
#
# COMPACTION HOLD. Cursor rejects submitting a followup_message while it is
# compacting ("Cannot submit a prompt while compaction is in progress").
# preCompact marks that window; this park holds exactly one follow-up JSON
# object and submits it once after the mark clears. bin/fm-cursor-compaction-lib.sh
# owns the two records, ages an abandoned mark out of the way, and consumes the
# held object only after the submit was printed. Digest re-emit stays deferred.
#
# LOOP BOUNDING IS DOUBLE, because either bound alone is insufficient:
#   - `loop_limit` in .cursor/hooks.json is Cursor's own ceiling. Once
#     loop_count reaches it Cursor stops INVOKING this hook at all, so it is the
#     only bound that still holds if this script is broken or replaced.
#   - FM_CURSOR_TURNEND_LOOP_CEILING bounds the payload's own loop_count from
#     inside, deliberately BELOW the registered loop_limit, so firstmate's bound
#     bites first and can emit one final loud notice instead of going silently
#     dark at Cursor's ceiling.
# `loop_count` is Cursor's richer analogue of Claude/Codex `stop_hook_active`:
# verified live on 2026.08.11-e8db854 as 0 on the first stop after a real user
# message, +1 per follow-up-driven stop, and reset to 0 by the next real user
# message. A genuine wake is productive work, so it does not consume the
# separate repair budget; only consecutive unproductive repair nags do.
#
# SUPERSESSION. A captain message typed while this hook is parked is accepted
# and runs its turn immediately, and Cursor does NOT terminate the parked hook
# (verified live). Until that turn ends and the next stop claims the baton, an
# actionable close can still produce one real, durable-queue-backed follow-up
# from the sole existing park. Each invocation publishes itself as the current
# park owner in state/.cursor-park-owner, and once a newer stop has published its
# claim, an older park still running stands down without emitting. Newest stop
# wins; the arm's own singleton keeps the overlap from starting a second watcher.
#
# PI STAND-DOWN. Exit 0 without parking when PI_CODING_AGENT=true and neither
# CURSOR_AGENT nor CURSOR_INVOKED_AS is set, so a Pi host that loaded
# .cursor/hooks.json via pi-cursor-sdk does not dual-watch against
# fm_watch_arm_pi. Cursor identity keeps parking despite a leaked
# PI_CODING_AGENT. docs/turnend-guard.md owns the contract.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=bin/fm-primary-scope-lib.sh
. "$SCRIPT_DIR/fm-primary-scope-lib.sh"
# Sets FM_ROOT, FM_HOME, STATE and CONFIG from this script's own checkout,
# ignoring an inherited environment that names a foreign one: a child crew,
# scout, or secondmate session must never guard the parent primary's home.
fm_primary_scope_resolve_env "$SESSION_ROOT"
GRACE=${FM_GUARD_GRACE:-300}
WATCH="$SCRIPT_DIR/fm-watch.sh"
OWNER="$STATE/.cursor-park-owner"
OWNER_LOCK="$STATE/.cursor-park-owner.lock"
BUDGET_FILE="$STATE/.turnend-cursor-blocks"

LOOP_CEILING=${FM_CURSOR_TURNEND_LOOP_CEILING:-180}
BLOCK_BUDGET=${FM_CURSOR_TURNEND_BLOCK_BUDGET:-3}
ARM_ATTEMPTS=${FM_CURSOR_PARK_ATTEMPTS:-2}
POLL=${FM_CURSOR_PARK_POLL:-2}
LOCK_ATTEMPTS=${FM_CURSOR_LOCK_ATTEMPTS:-50}
COMPACTION_WAIT=${FM_CURSOR_COMPACTION_WAIT_MAX:-180}
case "$LOOP_CEILING" in ''|*[!0-9]*|0) LOOP_CEILING=180 ;; esac
case "$BLOCK_BUDGET" in ''|*[!0-9]*|0) BLOCK_BUDGET=3 ;; esac
case "$ARM_ATTEMPTS" in 1|2|3) : ;; *) ARM_ATTEMPTS=2 ;; esac
case "$POLL" in ''|*[!0-9]*|0) POLL=2 ;; esac
case "$LOCK_ATTEMPTS" in ''|*[!0-9]*|0) LOCK_ATTEMPTS=50 ;; esac
case "$COMPACTION_WAIT" in ''|*[!0-9]*|0) COMPACTION_WAIT=180 ;; esac

# shellcheck source=bin/fm-supervision-lib.sh
. "$SCRIPT_DIR/fm-supervision-lib.sh"
# shellcheck source=bin/fm-wake-lib.sh
. "$SCRIPT_DIR/fm-wake-lib.sh"
# shellcheck source=bin/fm-session-lock-lib.sh
. "$SCRIPT_DIR/fm-session-lock-lib.sh"
# shellcheck source=bin/fm-operational-input.sh
. "$SCRIPT_DIR/fm-operational-input.sh"
# shellcheck source=bin/fm-cursor-compaction-lib.sh
. "$SCRIPT_DIR/fm-cursor-compaction-lib.sh"

PAYLOAD=$(cat 2>/dev/null || true)
[ -n "$PAYLOAD" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

# A malformed payload is uncertainty, not a reason to park: fail open and let
# the pull guard report the problem on the next fleet command.
LOOP_COUNT=$(printf '%s' "$PAYLOAD" | jq -r '
  if type != "object" then error("payload")
  elif has("loop_count") then
    if ((.loop_count | type) == "number") then (.loop_count | floor) else error("loop_count") end
  else 0
  end
' 2>/dev/null) || exit 0
case "$LOOP_COUNT" in ''|*[!0-9]*) exit 0 ;; esac
SESSION_ID=$(printf '%s' "$PAYLOAD" | jq -r '.session_id // "unknown"' 2>/dev/null || printf 'unknown')
case "$SESSION_ID" in ''|*[!A-Za-z0-9._-]*) SESSION_ID=unknown ;; esac

fm_primary_scope_matches "$SESSION_ROOT" "$STATE" || exit 0

# Pi-host stand-down: docs/turnend-guard.md owns the PI_CODING_AGENT /
# CURSOR_AGENT / CURSOR_INVOKED_AS contract summarized in this script's header.
if [ "${PI_CODING_AGENT:-}" = "true" ] \
  && [ -z "${CURSOR_AGENT:-}" ] \
  && [ -z "${CURSOR_INVOKED_AS:-}" ]; then
  exit 0
fi

lock_acquire_bounded() {  # <lock>
  local lock=$1 attempt=0
  while [ "$attempt" -lt "$LOCK_ATTEMPTS" ]; do
    fm_lock_try_acquire "$lock" && return 0
    attempt=$((attempt + 1))
    [ "$attempt" -lt "$LOCK_ATTEMPTS" ] && sleep 0.1
  done
  return 1
}

compaction_should_stand_down() {
  ! park_still_ours && return 0
  ! current_session_still_ours && return 0
  [ -e "$STATE/.afk" ] && return 0
  return 1
}

# Enter the single guarded section: take the owner lock and re-verify that this
# park may still act. The caller releases the lock on every path out.
# Away mode and a newer stop's claim both serialize on this same lock, so
# nothing they write can interleave between this check and the caller's mutation.
guard_enter() {
  lock_acquire_bounded "$OWNER_LOCK" || return 1
  if ! park_still_ours || ! current_session_still_ours || [ -e "$STATE/.afk" ]; then
    fm_lock_release "$OWNER_LOCK"
    return 1
  fi
  return 0
}

# Apply one budget action inside the guarded section: empty, reset-budget, or
# nag:<prior>:<count> for the compare-and-set repair-budget commit.
budget_commit() {  # <budget>
  local budget=$1 prior count
  case "$budget" in
    reset-budget)
      budget_reset || return 1
      ;;
    nag:*:*)
      prior=${budget#nag:}
      count=${prior#*:}
      prior=${prior%%:*}
      budget_read
      [ "$BUDGET_COUNT" -eq "$prior" ] || return 1
      budget_write "$count" || return 1
      ;;
  esac
  return 0
}

# Commit budget and at most one stdout object in the guarded section. <held>
# marks a printed object as the held record this park owns, which is dropped
# only after the print succeeded.
# Returns 1 without acting, and without holding the lock, when this park may not
# act or its budget commit failed.
guarded_commit() {  # <budget> [print] [held]
  local budget=$1 response=${2-} from_held=${3-}
  guard_enter || return 1
  if ! budget_commit "$budget"; then
    fm_lock_release "$OWNER_LOCK"
    return 1
  fi
  if [ -n "$response" ]; then
    printf '%s\n' "$response" || true
    [ "$from_held" = held ] && fm_cursor_compaction_drop_held "$STATE"
  fi
  fm_lock_release "$OWNER_LOCK"
  return 0
}

# Park one follow-up for a later stop, inside the same guarded section and the
# same lock hold as the ownership checks. Sets HELD_ACCEPTED to held when this
# park now owns the held record, and leaves it empty when an earlier event
# already occupies the single slot.
# A repair nag is charged here, and only here, when the slot accepted it: a nag
# the slot refused is still unspent and is charged by its own print instead.
# A print-time action travels with the record for whichever stop submits it, and
# so does the session that parked it, because only that session may submit it.
# A still-deliverable event is never evicted from the slot: only a record this
# session may no longer submit is replaced, which fm_cursor_compaction_hold_once
# does on its own.
guarded_hold() {  # <response-json> <budget>
  local response=$1 budget=$2 carry= status
  HELD_ACCEPTED=
  case "$budget" in reset-budget) carry=$budget ;; esac
  guard_enter || return 1
  fm_cursor_compaction_hold_once "$STATE" "$response" "$SESSION_ID" "$carry"
  status=$?
  if [ "$status" -eq 2 ]; then
    fm_lock_release "$OWNER_LOCK"
    return 0
  fi
  if [ "$status" -ne 0 ]; then
    fm_lock_release "$OWNER_LOCK"
    return 1
  fi
  case "$budget" in
    nag:*:*)
      if ! budget_commit "$budget"; then
        fm_cursor_compaction_drop_held "$STATE"
        fm_lock_release "$OWNER_LOCK"
        return 1
      fi
      ;;
  esac
  HELD_ACCEPTED=held
  fm_lock_release "$OWNER_LOCK"
  return 0
}

# Commit one already-built follow-up JSON object to stdout, or hold it when
# compaction is active. Never prints followup_message while the active mark
# is present. A second hold in the same window keeps the first event, and this
# park then submits its own object once the window closes instead of standing in
# for the earlier one, which stays held for emit_held_if_ready.
# The held record is consumed only after its object was printed: a lost lock,
# a supersession, away mode, or a failed budget commit between the decision and
# the print leaves the event held for the next stop rather than dropping it.
# A repair nag charges its budget the moment the object is accepted, whether the
# held slot took it or this park printed it, because a held nag is delivered
# later and is still one of the bounded three. An object the slot refused and
# this park never printed stays unspent.
# A once-only object gets one more chance at the slot when the window outlasts
# the wait, so the ceiling notice is parked rather than dropped whenever the slot
# is free by then. It never evicts an event that is still deliverable: that one
# is itself owed a submit, and the single slot cannot owe two.
commit_followup() {  # <response-json> [budget] [once-only]
  local response=$1 budget=${2-} once=${3-}
  if fm_cursor_compaction_is_active "$STATE"; then
    guarded_hold "$response" "$budget" || exit 0
    fm_cursor_compaction_wait_while_active "$STATE" "$POLL" compaction_should_stand_down "$COMPACTION_WAIT" || true
    if fm_cursor_compaction_is_active "$STATE" || compaction_should_stand_down; then
      if [ -z "$HELD_ACCEPTED" ] && [ "$once" = once-only ]; then
        guarded_hold "$response" "$budget" || exit 0
      fi
      exit 0
    fi
    if [ "$HELD_ACCEPTED" = held ]; then
      case "$budget" in nag:*) budget= ;; esac
    fi
    guarded_commit "$budget" "$response" "$HELD_ACCEPTED" || exit 0
    exit 0
  fi
  guarded_commit "$budget" "$response" || exit 0
  exit 0
}

# Release a follow-up held by an earlier compaction window exactly once, before
# this park builds anything of its own. Returns when there is nothing to
# release, so an ordinary stop falls through to its own follow-up sources.
# The object and its budget action are read together, before any wait, so a
# record that ages out while this park waits still carries what it owes.
emit_held_if_ready() {
  local held budget
  held=$(fm_cursor_compaction_peek_held "$STATE" "$SESSION_ID") || return 0
  budget=$(fm_cursor_compaction_peek_held_budget "$STATE" "$SESSION_ID")
  if fm_cursor_compaction_is_active "$STATE"; then
    fm_cursor_compaction_wait_while_active "$STATE" "$POLL" compaction_should_stand_down "$COMPACTION_WAIT" || true
  fi
  fm_cursor_compaction_is_active "$STATE" && return 0
  compaction_should_stand_down && return 0
  guarded_commit "$budget" "$held" held || return 0
  exit 0
}

# Emit exactly one follow-up object and stop. jq owns the JSON escaping so an
# embedded quote, newline, or the U+2063 prefix cannot corrupt the response.
emit_followup() {  # <kind> <body> [budget] [once-only]
  local kind=$1 body=$2 budget=${3-} once=${4-} encoded response
  fm_operational_input_encode "$kind" "$body" encoded || exit 0
  response=$(jq -n --arg m "$encoded" '{followup_message:$m}' 2>/dev/null) || exit 0
  commit_followup "$response" "$budget" "$once"
}

budget_read() {
  local session count
  BUDGET_COUNT=0
  [ -f "$BUDGET_FILE" ] || return 0
  session=$(sed -n '1s/^session=//p' "$BUDGET_FILE" 2>/dev/null || true)
  count=$(sed -n '2s/^count=//p' "$BUDGET_FILE" 2>/dev/null || true)
  case "$count" in ''|*[!0-9]*) count=0 ;; esac
  [ "$session" = "$SESSION_ID" ] && BUDGET_COUNT=$count
  return 0
}

budget_write() {  # <count>
  local tmp="$BUDGET_FILE.tmp.$$" status=0
  [ ! -d "$BUDGET_FILE" ] || return 1
  printf 'session=%s\ncount=%s\n' "$SESSION_ID" "$1" > "$tmp" 2>/dev/null \
    && mv -f "$tmp" "$BUDGET_FILE" 2>/dev/null \
    || status=1
  rm -f "$tmp" 2>/dev/null || true
  return "$status"
}

budget_reset() {
  rm -f "$BUDGET_FILE" 2>/dev/null
}

budget_reset_if_ours() {
  guarded_commit reset-budget || exit 0
}

emit_repair_followup() {  # <reason> <arm-tail> <attempt>
  local reason=$1 arm_tail=$2 attempt_count=$3 prior count body encoded response
  park_still_ours || exit 0
  budget_read
  [ "$BUDGET_COUNT" -lt "$BLOCK_BUDGET" ] || exit 0
  prior=$BUDGET_COUNT
  count=$((prior + 1))

  body="TURN WOULD END BLIND - supervision is off. The hook-owned watcher park could not establish a live cycle after $attempt_count bounded attempts (nag $count of $BLOCK_BUDGET).
$arm_tail

$reason"
  fm_operational_input_encode turn-end-guard "$body" encoded || exit 0
  response=$(jq -n --arg m "$encoded" '{followup_message:$m}' 2>/dev/null) || exit 0
  commit_followup "$response" "nag:$prior:$count"
}

# --- park ownership ----------------------------------------------------------
# Last arrival wins. The short owner lock serializes publication with only the
# final ownership, away-mode, output, and repair-budget commit.
claim_park() {
  local seq tmp
  lock_acquire_bounded "$OWNER_LOCK" || return 1
  seq=$(sed -n 's/^seq=\([0-9][0-9]*\) .*/\1/p' "$OWNER" 2>/dev/null || true)
  case "$seq" in ''|*[!0-9]*) seq=0 ;; esac
  PARK_SEQ=$((seq + 1))
  tmp="$OWNER.tmp.${BASHPID:-$$}"
  if ! printf 'seq=%s pid=%s updated_at=%s\n' "$PARK_SEQ" "${BASHPID:-$$}" "$(date +%s)" > "$tmp" 2>/dev/null \
    || ! mv -f "$tmp" "$OWNER" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    fm_lock_release "$OWNER_LOCK"
    return 1
  fi
  fm_lock_release "$OWNER_LOCK"
  return 0
}

park_still_ours() {
  local seq
  seq=$(sed -n 's/^seq=\([0-9][0-9]*\) .*/\1/p' "$OWNER" 2>/dev/null || true)
  [ "$seq" = "$PARK_SEQ" ]
}

current_session_still_ours() {
  local owner
  owner=$(cat "$STATE/.lock" 2>/dev/null) || return 1
  case "$owner" in ''|*[!0-9]*) return 1 ;; esac
  [ "$owner" = "$OWNER_ID" ] || return 1
  fm_session_lock_owned_by_self "$STATE"
}

# Only the lock-owning session may arm or wake. A prior session that died
# leaving its numeric harness pid behind is the one recoverable
# case, delegated to bin/fm-lock.sh so acquisition keeps its single owner.
if ! fm_session_lock_owned_by_self "$STATE"; then
  LOCK_PID=$(cat "$STATE/.lock" 2>/dev/null || true)
  case "$LOCK_PID" in ''|*[!0-9]*) exit 0 ;; esac
  fm_harness_pid_alive "$LOCK_PID" && exit 0
  "$SCRIPT_DIR/fm-lock.sh" >/dev/null 2>&1 || exit 0
  fm_session_lock_owned_by_self "$STATE" || exit 0
fi

OWNER_ID=$(cat "$STATE/.lock" 2>/dev/null || true)
case "$OWNER_ID" in ''|*[!0-9]*) exit 0 ;; esac

PARK_SEQ=
HELD_ACCEPTED=
claim_park || exit 0

# Cursor's own loop_limit is the outer ceiling; this inner one bites first so the
# session is told once, loudly, instead of supervision going quiet unannounced.
if [ "$LOOP_COUNT" -ge "$LOOP_CEILING" ]; then
  if [ "$LOOP_COUNT" -eq "$LOOP_CEILING" ] && fm_supervision_needed "$STATE" "$GRACE"; then
    emit_followup turn-end-guard "FIRSTMATE SUPERVISION FOLLOW-UP CEILING REACHED - this session has taken $LOOP_COUNT consecutive hook-driven turns without a captain message, so automatic wake delivery stops here to bound the loop. Queued wakes stay durable: run bin/fm-wake-drain.sh, handle them, and run its exact WAKE_ACK_REQUIRED command. Supervision resumes automatically at the next turn end after the captain's next message." '' once-only
  fi
  emit_held_if_ready
  exit 0
fi

# Away mode owns the watcher and its own triage; never park and never wake.
[ -e "$STATE/.afk" ] && exit 0

emit_held_if_ready

if ! fm_supervision_needed "$STATE" "$GRACE"; then
  budget_reset_if_ours
  exit 0
fi

# X mode cadence: an opted-in home polls Relay at its generated cadence.
# shellcheck source=/dev/null
[ -f "$CONFIG/x-mode.env" ] && . "$CONFIG/x-mode.env"

# --- the park ----------------------------------------------------------------
# The arm runs as a tracked child of THIS hook process, which stays alive and
# waits on it - never a fire-and-forget shell `&`, whose child would be reaped
# the moment the hook returned, leaving no watcher at all. Polling rather than
# blocking in `wait` is what lets a superseded park stand down promptly instead
# of surfacing a duplicate wake ten minutes later.
ARM_OUT=
ARM_PID=
ACTIONABLE=0
HEALTHY=0
STAND_DOWN=0

# Never leave an arm child or its capture file behind, on any exit path.
trap '[ -n "$ARM_PID" ] && kill "$ARM_PID" 2>/dev/null; [ -n "$ARM_OUT" ] && rm -f "$ARM_OUT" 2>/dev/null; :' EXIT

attempt=0
while [ "$attempt" -lt "$ARM_ATTEMPTS" ]; do
  current_session_still_ours || exit 0
  attempt=$((attempt + 1))
  ARM_OUT=$(mktemp "$STATE/.cursor-park-output.XXXXXX") || ARM_OUT=
  if [ -n "$ARM_OUT" ]; then
    "$SCRIPT_DIR/fm-watch-arm.sh" >"$ARM_OUT" 2>&1 &
  else
    "$SCRIPT_DIR/fm-watch-arm.sh" >/dev/null 2>&1 &
  fi
  ARM_PID=$!
  while kill -0 "$ARM_PID" 2>/dev/null; do
    # Stand down for either reason: a newer stop claimed the baton, or away mode
    # started and its daemon now owns the watcher and all triage.
    if ! park_still_ours || ! current_session_still_ours || [ -e "$STATE/.afk" ]; then
      STAND_DOWN=1
      break
    fi
    sleep "$POLL"
  done
  if [ "$STAND_DOWN" -eq 1 ]; then
    kill "$ARM_PID" 2>/dev/null
    ARM_PID=
    exit 0
  fi
  wait "$ARM_PID" 2>/dev/null || true
  ARM_PID=

  # Away mode may have been entered while parked: the daemon owns triage now.
  [ -e "$STATE/.afk" ] && exit 0

  ACTIONABLE=0
  if [ -n "$ARM_OUT" ]; then
    grep -Eq '^(signal:|stale:|check:|heartbeat($|:))' "$ARM_OUT" 2>/dev/null && ACTIONABLE=1
  fi
  [ "$ACTIONABLE" -eq 1 ] && break

  # A non-actionable close is benign when another verified watcher already owns
  # this home and is still beating inside the shared grace window.
  if fm_watcher_healthy "$STATE" "$WATCH" "$GRACE" "$FM_HOME"; then
    HEALTHY=1
    break
  fi
  [ "$attempt" -lt "$ARM_ATTEMPTS" ] || break
  [ -n "$ARM_OUT" ] && rm -f "$ARM_OUT" 2>/dev/null
  ARM_OUT=
done

# The need may have vanished while parked - the fleet was torn down, or Relay
# was opted out. Nothing left to supervise, so end the turn quietly.
if ! fm_supervision_needed "$STATE" "$GRACE"; then
  budget_reset_if_ours
  exit 0
fi

if [ "$ACTIONABLE" -eq 1 ]; then
  WAKE=$(grep -E '^(signal:|stale:|check:|heartbeat)' "$ARM_OUT" 2>/dev/null | head -8)
  emit_followup watcher "firstmate watcher wake - one supervision event needs a handling turn now.
$WAKE

Run bin/fm-wake-drain.sh first, handle the wake, then run its exact WAKE_ACK_REQUIRED --ack-through command. Until that post-handling acknowledgement, interruption leaves the wake durable for idempotent re-handling. This stop hook owns watcher continuity: when the handling turn ends, the next needed cycle parks automatically - do NOT run bin/fm-watch-arm.sh after an ordinary wake." reset-budget
fi

# A verified live cycle with a fresh beacon is positive recovery even though this
# park closed without a wake of its own: the next turn end parks again.
if [ "$HEALTHY" -eq 1 ]; then
  emit_held_if_ready
  budget_reset_if_ours
  exit 0
fi

# The park could not establish supervision. Ask the SHARED predicate whether
# this turn would genuinely end blind, rather than deciding that here a second
# time: bin/fm-turnend-guard.sh owns the block decision and its banner for every
# harness, and --cursor tells it this is Cursor's own registration rather than
# the Claude-settings duplicate.
GUARD_ERR=$(mktemp "${TMPDIR:-/tmp}/fm-turnend-cursor.XXXXXX") || exit 0
printf '%s' "$PAYLOAD" | "$SCRIPT_DIR/fm-turnend-guard.sh" --cursor 2>"$GUARD_ERR"
GUARD_RC=$?
REASON=$(cat "$GUARD_ERR" 2>/dev/null || true)
rm -f "$GUARD_ERR" 2>/dev/null || true
[ "$GUARD_RC" -eq 2 ] || exit 0

# Bounded so a persistent failure nags a few times and then stops, instead of
# turning every turn end into another unproductive continuation.
[ -n "$REASON" ] || REASON='tasks in flight, no live watcher - repair missing watcher supervision according to the session-start operating block before ending the turn'
ARM_TAIL=
[ -n "$ARM_OUT" ] && ARM_TAIL=$(grep -E '^watcher:' "$ARM_OUT" 2>/dev/null | head -4)
emit_repair_followup "$REASON" "$ARM_TAIL" "$attempt"
