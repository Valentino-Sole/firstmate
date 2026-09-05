#!/usr/bin/env bash
# Fully automatic Pi-primary restart for a genuine firstmate primary home.
#
# Saves a restart checkpoint, exits the live Pi primary cleanly, relaunches it
# in the same backend pane with session continuation, and leaves the Pi
# extensions to reclaim the session lock, run session-start, and auto-arm the
# watcher on the replacement session's first cycle.
#
# Crewmate and scout worktrees stay untouched; only the lock-owning Pi primary
# pane is stopped and replaced.
#
# Usage: fm-pi-primary-restart.sh [--dry-run] [--reason <text>]
#
# Exit codes:
#   0  restart completed (or --dry-run plan printed)
#   1  refused or failed before completion
#   2  provider login/MFA required (needs-decision)
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FM_ROOT="${FM_ROOT_OVERRIDE:-$(cd "$SCRIPT_DIR/.." && pwd)}"
FM_HOME="${FM_HOME:-${FM_ROOT_OVERRIDE:-$FM_ROOT}}"
STATE="${FM_STATE_OVERRIDE:-$FM_HOME/state}"

DRY_RUN=0
REASON=

usage() {
  cat <<'EOF' >&2
usage: fm-pi-primary-restart.sh [--dry-run] [--reason <text>]
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --reason)
      REASON=${2:-}
      shift 2
      ;;
    --reason=*) REASON=${1#--reason=}; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 1 ;;
  esac
done

# shellcheck source=bin/fm-gate-refuse-lib.sh
. "$SCRIPT_DIR/fm-gate-refuse-lib.sh"
# shellcheck source=bin/fm-primary-scope-lib.sh
. "$SCRIPT_DIR/fm-primary-scope-lib.sh"
# shellcheck source=bin/fm-session-lock-lib.sh
. "$SCRIPT_DIR/fm-session-lock-lib.sh"
# shellcheck source=bin/fm-wake-lib.sh
. "$SCRIPT_DIR/fm-wake-lib.sh"
# shellcheck source=bin/fm-backend.sh
. "$SCRIPT_DIR/fm-backend.sh"
# shellcheck source=bin/fm-control-lib.sh
. "$SCRIPT_DIR/fm-control-lib.sh"
# shellcheck source=bin/fm-pi-primary-restart-lib.sh
. "$SCRIPT_DIR/fm-pi-primary-restart-lib.sh"

fm_is_gate_agent "$FM_ROOT" && {
  echo "error: no-mistakes gate agents cannot restart a primary" >&2
  exit "$FM_GATE_REFUSE_EXIT"
}

fm_primary_scope_matches "$FM_ROOT" "$STATE" || {
  echo "error: not a genuine firstmate primary home" >&2
  exit 1
}

[ -e "$STATE/.afk" ] && {
  echo "error: away mode owns supervision; exit /afk before restarting the primary" >&2
  exit 1
}

HARNESS=$(fm_pi_restart_lock_harness "$STATE") || {
  echo "error: session lock is missing or not held by a live Pi primary" >&2
  exit 1
}

LOCK_PID=$(sed -n '1p' "$STATE/.lock" 2>/dev/null)
PI_BIN=$(fm_pi_restart_resolve_pi_bin "$HARNESS") || {
  echo "error: could not resolve executable for harness $HARNESS" >&2
  exit 1
}

if ! fm_pi_restart_auth_ready "$PI_BIN"; then
  echo "needs-decision: Pi provider authentication is not ready; captain login/MFA required before an automatic restart" >&2
  exit "$FM_PI_RESTART_NEEDS_DECISION_EXIT"
fi

BACKEND=$(fm_backend_detect) || BACKEND=tmux

if [ "$DRY_RUN" -eq 1 ]; then
  mapfile -t LAUNCH_ARGS < <(fm_pi_restart_launch_args "$FM_ROOT" "$HARNESS" "")
  printf 'dry-run: backend=%s lock_pid=%s harness=%s\n' "$BACKEND" "$LOCK_PID" "$HARNESS"
  printf 'dry-run: launch=%s %q' "$PI_BIN" "${LAUNCH_ARGS[@]}"
  printf '\n'
  exit 0
fi

case "$BACKEND" in
  herdr|tmux) ;;
  *)
    echo "error: automatic Pi-primary restart is only verified on herdr and tmux backends (got $BACKEND)" >&2
    exit 1
    ;;
esac

TARGET=
HERDR_TARGET=
SESSION_ARG=
HERDR_SESSION=
if [ "$BACKEND" = herdr ]; then
  # shellcheck source=bin/backends/herdr.sh
  . "$SCRIPT_DIR/backends/herdr.sh"
  HERDR_SESSION=$(fm_backend_herdr_session)
  TARGET=$(fm_pi_restart_find_herdr_pane_for_pid "$HERDR_SESSION" "$LOCK_PID") || {
    echo "error: could not locate the Pi-primary herdr pane for lock pid $LOCK_PID" >&2
    exit 1
  }
  HERDR_TARGET="${HERDR_SESSION}:${TARGET}"
  SESSION_ARG=$(fm_pi_restart_herdr_session_file "$HERDR_SESSION" "$TARGET" || true)
elif [ "$BACKEND" = tmux ]; then
  if [ -n "${TMUX_PANE:-}" ]; then
    TARGET=$TMUX_PANE
  else
    echo "error: tmux backend restart requires TMUX_PANE in the invoking environment" >&2
    exit 1
  fi
fi

mapfile -t LAUNCH_ARGS < <(fm_pi_restart_launch_args "$FM_ROOT" "$HARNESS" "$SESSION_ARG")

if [ "$BACKEND" = herdr ]; then
  fm_pi_restart_prepare_pane_for_exit "$BACKEND" "$HERDR_TARGET" || {
    case "${FM_PI_RESTART_PREPARE_REASON:-}" in
      interrupt-send-failed)
        echo "error: failed to deliver interrupt to the Pi-primary pane; refusing blind exit delivery" >&2
        ;;
      pane-stayed-busy)
        echo "error: Pi-primary pane stayed busy after interrupt retries; cannot deliver exit safely" >&2
        ;;
      *)
        echo "error: Pi-primary pane did not become exit-ready after interrupt retries" >&2
        ;;
    esac
    exit 1
  }
fi

fm_pi_restart_write_pending "$STATE" \
  backend "$BACKEND" \
  target "$TARGET" \
  lock_pid "$LOCK_PID" \
  harness "$HARNESS" \
  pi_bin "$PI_BIN" \
  reason "${REASON:-automatic}" \
  started "$(date -u +%Y-%m-%dT%H:%M:%SZ)" || {
  echo "error: could not write restart checkpoint" >&2
  exit 1
}

EXIT_CMD=$(fm_control_exit_command "$HARNESS")
fm_pi_restart_submit_exit_command "$BACKEND" "${HERDR_TARGET:-$TARGET}" "$EXIT_CMD" 5 0.5 1.2 || {
  fm_pi_restart_clear_pending "$STATE"
  case "${FM_PI_RESTART_SUBMIT_REASON:-}" in
    send-failed)
      echo "error: exit command was not accepted by the Pi-primary pane" >&2
      ;;
    unconfirmed)
      echo "error: exit command delivery remained unconfirmed (${FM_PI_RESTART_SUBMIT_DETAIL:-unknown}); refusing blind restart" >&2
      ;;
    *)
      echo "error: could not deliver $EXIT_CMD to the Pi-primary pane" >&2
      ;;
  esac
  exit 1
}
case "${FM_PI_RESTART_SUBMIT_REASON:-}" in
  '')
    ;;
  *)
    fm_pi_restart_clear_pending "$STATE"
    echo "error: internal submit state mismatch while delivering $EXIT_CMD" >&2
    exit 1
    ;;
esac

fm_pi_restart_wait_pid_dead "$LOCK_PID" 45 || {
  fm_pi_restart_clear_pending "$STATE"
  echo "error: Pi primary pid $LOCK_PID did not exit after $EXIT_CMD" >&2
  exit 1
}

if [ "$BACKEND" = herdr ]; then
  if ! command -v herdr >/dev/null 2>&1; then
    fm_pi_restart_clear_pending "$STATE"
    echo "error: herdr CLI is required to relaunch the Pi primary" >&2
    exit 1
  fi
  if ! herdr --session "$HERDR_SESSION" agent start firstmate-primary \
    --kind pi \
    --pane "$TARGET" \
    --timeout 120000 \
    -- "${LAUNCH_ARGS[@]}"; then
    fm_pi_restart_clear_pending "$STATE"
    echo "error: herdr could not relaunch Pi in pane $TARGET" >&2
    exit 1
  fi
else
  LAUNCH_LINE="cd $(printf '%q' "$FM_ROOT") && exec $(printf '%q ' "$PI_BIN" "${LAUNCH_ARGS[@]}")"
  SUBMIT=$(fm_backend_send_text_submit "$BACKEND" "$TARGET" "$LAUNCH_LINE" 1 0.2 0.5 "pi-primary-restart-launch") || {
    fm_pi_restart_clear_pending "$STATE"
    echo "error: could not submit the Pi relaunch command" >&2
    exit 1
  }
  case "$SUBMIT" in
    send-failed)
      fm_pi_restart_clear_pending "$STATE"
      echo "error: Pi relaunch command was not accepted" >&2
      exit 1
      ;;
  esac
fi

NEW_PID=$(fm_pi_restart_wait_lock_replaced "$STATE" "$LOCK_PID" 120) || {
  fm_pi_restart_clear_pending "$STATE"
  echo "error: replacement Pi primary did not acquire the session lock within 120s" >&2
  exit 1
}

i=0
while [ "$i" -lt 30 ]; do
  if fm_pi_restart_extensions_loaded "$STATE" "$FM_ROOT"; then
    printf 'restart: complete pid=%s backend=%s target=%s\n' "$NEW_PID" "$BACKEND" "$TARGET"
    exit 0
  fi
  sleep 1
  i=$((i + 1))
done

fm_pi_restart_clear_pending "$STATE"
echo "error: replacement Pi primary pid $NEW_PID did not load both required extensions" >&2
exit 1
