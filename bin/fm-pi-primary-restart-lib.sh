#!/usr/bin/env bash
# Shared helpers for bin/fm-pi-primary-restart.sh.
# Sourced only; no side effects on source.
set -u

FM_PI_RESTART_PENDING_NAME='.pi-primary-restart-pending'
FM_PI_RESTART_NEEDS_DECISION_EXIT=2
FM_PI_RESTART_INTERRUPT_ATTEMPTS_DEFAULT=3
FM_PI_RESTART_INTERRUPT_WAIT_SECONDS_DEFAULT=15
FM_PI_RESTART_PREPARE_REASON=
FM_PI_RESTART_SUBMIT_REASON=
FM_PI_RESTART_SUBMIT_DETAIL=

fm_pi_restart_pending_path() {  # <state-dir>
  printf '%s/%s' "$1" "$FM_PI_RESTART_PENDING_NAME"
}

fm_pi_restart_lock_harness() {  # <state-dir>
  local state=$1 lock_pid
  lock_pid=$(sed -n '1p' "$state/.lock" 2>/dev/null) || return 1
  case "$lock_pid" in
    ''|*[!0-9]*) return 1 ;;
  esac
  fm_harness_pid_alive "$lock_pid" || return 1
  local comm args
  comm=$(ps -o comm= -p "$lock_pid" 2>/dev/null) || return 1
  args=$(ps -o args= -p "$lock_pid" 2>/dev/null) || return 1
  fm_harness_process_matches "$comm" "$args" || return 1
  case "$comm" in
    pi-signed) printf 'pi-signed\n' ;;
    pi|*pi*) printf 'pi\n' ;;
    *) return 1 ;;
  esac
}

fm_pi_restart_write_pending() {  # <state-dir> <field> <value> ...
  local state=$1 path
  shift
  path=$(fm_pi_restart_pending_path "$state")
  : >"$path" || return 1
  while [ $# -ge 2 ]; do
    printf '%s=%s\n' "$1" "$2" >>"$path" || return 1
    shift 2
  done
}

fm_pi_restart_read_pending_field() {  # <state-dir> <field>
  local state=$1 field=$2 path
  path=$(fm_pi_restart_pending_path "$state")
  sed -n "s/^${field}=//p" "$path" 2>/dev/null | head -1
}

fm_pi_restart_clear_pending() {  # <state-dir>
  rm -f "$(fm_pi_restart_pending_path "$1")" 2>/dev/null || true
}

fm_pi_restart_resolve_pi_bin() {  # <harness>
  local harness=$1 candidate
  candidate=$(type -P -- "$harness" 2>/dev/null) || return 1
  [ -x "$candidate" ] || return 1
  case "$candidate" in
    /*) printf '%s\n' "$candidate" ;;
    *)
      local dir
      dir=$(cd "$(dirname "$candidate")" 2>/dev/null && pwd -P) || return 1
      printf '%s/%s\n' "$dir" "$(basename "$candidate")"
      ;;
  esac
}

fm_pi_restart_extension_paths() {  # <root>
  local root=$1
  printf '%s\n' \
    "$root/.pi/extensions/fm-primary-turnend-guard.ts" \
    "$root/.pi/extensions/fm-primary-pi-watch.ts"
}

fm_pi_restart_launch_args() {  # <root> <harness> <session-arg>
  local root=$1 session_arg=${3:-} turnend watch
  turnend="$root/.pi/extensions/fm-primary-turnend-guard.ts"
  watch="$root/.pi/extensions/fm-primary-pi-watch.ts"
  printf '%s\n' '-c'
  printf '%s\n' '--approve'
  if [ -n "$session_arg" ]; then
    case "$session_arg" in
      --session-id*|--session=*) printf '%s\n' "$session_arg" ;;
      --session) printf '%s\n' '--session'
         printf '%s\n' "$session_arg" ;;
      *) printf '%s\n' '--session'
         printf '%s\n' "$session_arg" ;;
    esac
  fi
  printf '%s\n' '-e' "$turnend" '-e' "$watch"
}

fm_pi_restart_auth_ready() {  # <pi-bin> [provider]
  local pi_bin=$1 provider=${2:-}
  local out status=0
  if [ -n "$provider" ]; then
    out=$("$pi_bin" auth check --provider "$provider" 2>&1) || status=$?
  else
    out=$("$pi_bin" auth check --model openai-codex/gpt-5.6-sol 2>&1) || status=$?
    if [ "$status" -ne 0 ]; then
      out=$("$pi_bin" auth check 2>&1) || status=$?
    fi
  fi
  case "$out" in
    ready*) return 0 ;;
    *login*|*Login*|*MFA*|*mfa*|*authenticate*|*Authenticate*|*OAuth*|*oauth*)
      printf '%s\n' "$out"
      return 1
      ;;
  esac
  [ "$status" -eq 0 ]
}

fm_pi_restart_find_herdr_pane_for_pid() {  # <session> <pid>
  local session=$1 pid=$2 panes pane info match
  command -v jq >/dev/null 2>&1 || return 1
  panes=$(fm_backend_herdr_cli "$session" pane list 2>/dev/null) || return 1
  while IFS= read -r pane; do
    [ -n "$pane" ] || continue
    info=$(fm_backend_herdr_cli "$session" pane process-info --pane "$pane" 2>/dev/null) || continue
    match=$(printf '%s' "$info" | jq -r --arg pid "$pid" '
      .result.process_info.foreground_processes[]?
      | select((.pid | tostring) == $pid) | .pid
    ' 2>/dev/null | head -1)
    [ -n "$match" ] || continue
    printf '%s\n' "$pane"
    return 0
  done < <(printf '%s' "$panes" | jq -r '.result.panes[]?.pane_id // empty' 2>/dev/null)
  return 1
}

fm_pi_restart_herdr_session_file() {  # <session> <pane>
  local session=$1 pane=$2 list
  command -v jq >/dev/null 2>&1 || return 1
  list=$(fm_backend_herdr_cli "$session" pane list 2>/dev/null) || return 1
  printf '%s' "$list" | jq -r --arg pane "$pane" '
    .result.panes[]
    | select(.pane_id == $pane)
    | .agent_session.value // empty
  ' 2>/dev/null | head -1
}

fm_pi_restart_wait_pid_dead() {  # <pid> <timeout-seconds>
  local pid=$1 timeout=${2:-30} i=0
  while [ "$i" -lt "$timeout" ]; do
    fm_harness_pid_alive "$pid" || return 0
    sleep 1
    i=$((i + 1))
  done
  return 1
}

fm_pi_restart_wait_lock_replaced() {  # <state-dir> <old-pid> <timeout-seconds>
  local state=$1 old=$2 timeout=${3:-60} lock_pid i=0
  while [ "$i" -lt "$timeout" ]; do
    lock_pid=$(sed -n '1p' "$state/.lock" 2>/dev/null) || lock_pid=
    if [ -n "$lock_pid" ] && [ "$lock_pid" != "$old" ] && fm_harness_pid_alive "$lock_pid"; then
      printf '%s\n' "$lock_pid"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

fm_pi_restart_prepare_pane_for_exit() {  # <backend> <target> [interrupt-attempts] [wait-seconds]
  local backend=$1 target=$2
  local attempts=${3:-$FM_PI_RESTART_INTERRUPT_ATTEMPTS_DEFAULT}
  local wait_s=${4:-$FM_PI_RESTART_INTERRUPT_WAIT_SECONDS_DEFAULT}
  local session raw state attempt elapsed
  FM_PI_RESTART_PREPARE_REASON=
  [ "$backend" = herdr ] || return 0
  command -v jq >/dev/null 2>&1 || return 0
  fm_backend_herdr_parse_target "$target" || return 0
  session=$FM_BACKEND_HERDR_SESSION
  raw=$(fm_backend_herdr_agent_status_raw "$session" "$FM_BACKEND_HERDR_PANE")
  state=$(fm_backend_herdr_classify_submit_agent_status "$raw")
  [ "$state" = busy ] || return 0

  attempt=1
  while [ "$attempt" -le "$attempts" ]; do
    fm_backend_herdr_send_key "$target" C-c || {
      FM_PI_RESTART_PREPARE_REASON='interrupt-send-failed'
      return 1
    }
    elapsed=0
    while [ "$elapsed" -lt "$wait_s" ]; do
      raw=$(fm_backend_herdr_agent_status_raw "$session" "$FM_BACKEND_HERDR_PANE")
      state=$(fm_backend_herdr_classify_submit_agent_status "$raw")
      [ "$state" = idle ] && return 0
      sleep 1
      elapsed=$((elapsed + 1))
    done
    attempt=$((attempt + 1))
  done

  FM_PI_RESTART_PREPARE_REASON='pane-stayed-busy'
  return 1
}

fm_pi_restart_submit_exit_command() {  # <backend> <target> <exit-cmd> [retries] [enter-sleep] [settle]
  local backend=$1 target=$2 exit_cmd=$3
  local retries=${4:-5} enter_sleep=${5:-0.5} settle=${6:-1.2}
  local submit
  FM_PI_RESTART_SUBMIT_REASON=
  FM_PI_RESTART_SUBMIT_DETAIL=

  submit=$(fm_backend_send_text_submit "$backend" "$target" "$exit_cmd" "$retries" "$enter_sleep" "$settle" "pi-primary-restart") || {
    FM_PI_RESTART_SUBMIT_REASON='submit-call-failed'
    return 1
  }
  case "$submit" in
    '') return 0 ;;
    send-failed)
      FM_PI_RESTART_SUBMIT_REASON='send-failed'
      return 1
      ;;
    *)
      FM_PI_RESTART_SUBMIT_REASON='unconfirmed'
      FM_PI_RESTART_SUBMIT_DETAIL="$submit"
      return 1
      ;;
  esac
  return 0
}

fm_pi_restart_extensions_loaded() {  # <state-dir> <root>
  local state=$1 root=$2 watch turnend
  watch="$state/.pi-watch-extension-loaded"
  turnend="$state/.pi-turnend-extension-loaded"
  fm_pi_extension_loaded "$watch" "$(fm_pi_extension_version "$root/.pi/extensions/fm-primary-pi-watch.ts")" "$state/.lock" \
    && fm_pi_extension_loaded "$turnend" "$(fm_pi_extension_version "$root/.pi/extensions/fm-primary-turnend-guard.ts")" "$state/.lock"
}
