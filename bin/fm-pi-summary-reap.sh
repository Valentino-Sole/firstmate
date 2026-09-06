#!/usr/bin/env bash
# fm-pi-summary-reap.sh - reap Pi's own hung internal summarization child
# processes with a hard timeout, never touching an ordinary worker.
#
# Captain-authorized emergency mitigation (2026-09-03, home-local
# state/fm-pi-summary-reap.check.sh, kept until the real fix lands upstream as
# pi-cli-mate's own task fm-pi-summary-child-leak - session-registry.ts, NOT
# this repo). This is that mitigation promoted to a reviewed, tracked
# implementation, plus the one gap the hand-authored original left open: a
# signalled survivor was only logged as an anomaly, never actually cleaned up.
# This adds a bounded hard timeout after the first signal, then reaps any
# survivor with a second, final signal - still one exact PID at a time.
#
# What it targets, and only this: a "claude.exe --print" invocation whose full
# argv also carries pi's own "context summarization assistant" system-prompt
# marker. Pi's summarization call path apparently never closes stdin on that
# child, so it waits forever for a follow-up message that never comes, holding
# its RSS. That marker is the ONLY identifying characteristic this script acts
# on; an ordinary crewmate, secondmate, or scout `claude` invocation carries no
# such marker and is never a candidate, regardless of its own age or memory
# use. A candidate is chosen only when its own live age (read fresh per PID
# from the kernel, never cached) is at least MIN_AGE, so a summarization call
# still legitimately in flight is left alone.
#
# NEVER by name pattern, process group, or session leader: every signal here
# targets one already-identified PID directly (kill "$pid"), read from
# /proc/<pid>/cmdline moments before. A normal worker is never a candidate in
# the first place, so it can never be reaped by this script under any
# circumstance.
#
# Two-stage hard timeout: SIGTERM every candidate, wait up to KILL_GRACE_SECS
# for the kernel to actually reap each one (checked directly, not assumed),
# then SIGKILL, individually, any pid that is still alive. A pid that survives
# BOTH signals is the only case this script ever wakes the captain for, since
# that would mean a process in an uninterruptible state or a defunct child
# nobody is reaping, either of which is worth a look.
#
# Stays silent (no wake) on an ordinary sweep, including one that finds
# nothing to do or reaps every candidate cleanly on the first signal; that is
# routine. It logs every sweep with a reap privately (state/fm-pi-summary-reap.log)
# for later inspection.
#
# Adoption (this script only ships the reviewed implementation; it is never
# self-installing and never installs or registers itself, per the captain's
# standing "no automatic activation" boundary on this task):
#   cp bin/fm-pi-summary-reap.sh "$STATE/fm-pi-summary-reap.check.sh"
#   chmod 700 "$STATE/fm-pi-summary-reap.check.sh"
#   bin/fm-check-register.sh fm-pi-summary-reap
# Retire with bin/fm-check-unregister.sh fm-pi-summary-reap.
#
# Tunables (env, all optional):
#   FM_PI_SUMMARY_REAP_MIN_AGE     default 600; seconds a candidate must have
#                                  been alive before it is touched at all
#   FM_PI_SUMMARY_REAP_KILL_GRACE  default 5; seconds to wait after SIGTERM
#                                  before escalating a survivor to SIGKILL
#   FM_PI_SUMMARY_REAP_PROC_DIR    default /proc; override for tests
set -u
LC_ALL=C
export LC_ALL

MARKER="context summarization assistant"

PROC_DIR=${FM_PI_SUMMARY_REAP_PROC_DIR:-/proc}

MIN_AGE=${FM_PI_SUMMARY_REAP_MIN_AGE:-600}
case "$MIN_AGE" in ''|*[!0-9]*) MIN_AGE=600 ;; esac

KILL_GRACE=${FM_PI_SUMMARY_REAP_KILL_GRACE:-5}
case "$KILL_GRACE" in ''|*[!0-9]*) KILL_GRACE=5 ;; esac

LOG="${0%.sh}.log"
case "$0" in
  *.check.sh) LOG="${0%.check.sh}.log" ;;
esac
LOG_MAX_LINES=500

candidate_pids=""

for pid_dir in "$PROC_DIR"/[0-9]*; do
  pid=${pid_dir#"$PROC_DIR"/}
  cmdline_file="$pid_dir/cmdline"
  [ -r "$cmdline_file" ] || continue
  cmd=$(tr '\0' ' ' < "$cmdline_file" 2>/dev/null) || continue
  case "$cmd" in
    *claude.exe*--print*"$MARKER"*) ;;
    *) continue ;;
  esac

  etimes=$(ps -o etimes= -p "$pid" 2>/dev/null | tr -d ' ')
  case "$etimes" in
    ''|*[!0-9]*) continue ;;
  esac
  [ "$etimes" -ge "$MIN_AGE" ] || continue

  candidate_pids="$candidate_pids $pid"
done

[ -n "$candidate_pids" ] || exit 0

signalled_pids=""
signalled_mb=0
for pid in $candidate_pids; do
  rss=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ')
  case "$rss" in
    ''|*[!0-9]*) rss=0 ;;
  esac
  kill "$pid" 2>/dev/null || continue
  signalled_pids="$signalled_pids $pid"
  signalled_mb=$((signalled_mb + rss / 1024))
done

[ -n "$signalled_pids" ] || exit 0

sleep "$KILL_GRACE"

survivor_pids=""
for pid in $signalled_pids; do
  kill -0 "$pid" 2>/dev/null || continue
  survivor_pids="$survivor_pids $pid"
done

killed_pids=""
still_alive_pids=""
if [ -n "$survivor_pids" ]; then
  for pid in $survivor_pids; do
    if kill -KILL "$pid" 2>/dev/null; then
      killed_pids="$killed_pids $pid"
    fi
  done
  sleep 1
  for pid in $survivor_pids; do
    kill -0 "$pid" 2>/dev/null || continue
    still_alive_pids="$still_alive_pids $pid"
  done
fi

{
  printf '%s signalled=%s approx_mb=%d term-only-pids:%s escalated-pids:%s still-alive-pids:%s\n' \
    "$(date -Is 2>/dev/null || date)" \
    "$(printf '%s\n' "$signalled_pids" | wc -w)" \
    "$signalled_mb" \
    "$signalled_pids" \
    "${killed_pids:-none}" \
    "${still_alive_pids:-none}"
} >> "$LOG" 2>/dev/null

if [ -s "$LOG" ]; then
  tail -n "$LOG_MAX_LINES" "$LOG" > "$LOG.tmp" 2>/dev/null && mv -f "$LOG.tmp" "$LOG" 2>/dev/null
fi

if [ -n "$still_alive_pids" ]; then
  printf 'pi-summary-reap: %d process(es) survived both SIGTERM and SIGKILL, pid(s):%s\n' \
    "$(printf '%s\n' "$still_alive_pids" | wc -w)" "$still_alive_pids"
fi

exit 0
