# shellcheck shell=bash
# fm-resgate-lib.sh - weekly clock-window resource governance for the captain's
# two Windows hosts, plus GPU exclusivity between Qwen and the JARVIS voice
# worker on the home PC.
#
# Sourced, never executed. bin/fm-resgate.sh is the CLI.
#
# Two fixed roles, not a configurable host list: `work` is the Arbeits-PC
# (default SSH alias Valentino-Arbeit) and `home` is the Heim-PC, RTX 4080
# Super (default SSH alias Valentino). FM_RESGATE_WORK_SSH / FM_RESGATE_HOME_SSH
# override the alias for tests or a renamed host.
#
# Captain's policy (verbatim intent, data/captain.md 02.09.2026):
#   Arbeits-PC: Mo-Fr 19:30-10:00 and the whole weekend fully free for the
#   fleet; Mo-Fr 10:00-19:30 at most 50% of resources.
#   Heim-PC: Mo-Fr 04:00-19:00 free; Mo-Fr 19:00-04:00 and the whole weekend
#   at most 50%.
# Both windows are same-calendar-day spans, so the schedule is expressed as the
# CAPPED window for work (weekday 10:00-19:30) and the FREE window for home
# (weekday 04:00-19:00), with the opposite state as the default. That default
# is what makes the Friday-evening-through-Monday-morning free span on work,
# and the symmetric always-capped weekend on home, fall out of the two small
# per-weekday windows below without separate weekend-boundary code: nothing
# outside a weekday's stated window is ever in either list, weekday or not.
#
# Authoritative clock: this library never asks a remote host for its own
# clock. The schedule decision is computed once, here, against THIS host's
# wall clock forced into Europe/Berlin regardless of the host's configured
# default zone, and only the resulting capped/uncapped state and percentage
# travel to whichever host is being gated. A remote host's local clock can be
# wrong or drifted and must never be able to loosen or defeat the gate.
# FM_RESGATE_NOW_OVERRIDE="<dow 1-7 Mon..Sun> <HH> <MM>" replaces the `date`
# read for tests.
#
# Fail-closed discipline: every measurement this library cannot read - the
# clock, an SSH probe, a port check, a GPU query - yields the MOST restrictive
# answer, never a guess and never "permissive by default". For the schedule
# gate that is capacity_pct=0 ("blocked", stricter than the ordinary 50% cap).
# For the GPU exclusivity check that is "not available" for either workload.
#
# Manual override: state/.resgate-cap-<role> is a plain presence-based marker,
# written the same way state/.afk is (mktemp + mv, so a reader never observes
# a half-written file). Its presence forces capped state immediately,
# independent of the schedule computation. docs/configuration.md
# "Fleet resource governance" owns the exact marker paths, the "Kappung" /
# "Kappung auf" trigger words, and which host each form arms.
#
# GPU exclusivity (home PC only): JARVIS voice is detected by its gateway PORT
# (currently 7414, data/learnings.md 23.08.2026), never by process name -
# process-name detection has broken this fleet's integration before.
#
# Qwen detection does NOT use `nvidia-smi --query-compute-apps`, even though
# that looks like the stabler per-process signal on paper. Live-verified
# against the real home host: on Windows/WDDM that query lists every process
# holding an ordinary desktop GPU context - dwm.exe, explorer.exe, every open
# browser - not just genuine compute workloads, and reports `[N/A]` for their
# per-process memory, so there is no field left to filter the noise out by.
# Treating any non-empty row as "Qwen is active" would read as busy any time
# the desktop itself is on. Qwen is instead detected by a named-process check
# (`Get-Process -Name ollama`, the exact identity live-confirmed for today's
# Qwen work; a fresh probe against another engine's name is a config change,
# not a design change) corroborated by AGGREGATE GPU memory
# (`nvidia-smi --query-gpu=memory.used`) clearing FM_RESGATE_GPU_BUSY_MB
# (default 4096 MiB): live-verified idle-ish desktop baseline was ~9 GiB used
# with a loaded model and process present, comfortably clear of ordinary
# desktop compositing. The process check alone would treat an installed-but-
# idle service as "active"; the memory check alone cannot name what is using
# the card; requiring both is the more stable combination the process name
# check alone is not. All three readings (port, process, aggregate memory)
# come from one bounded SSH round trip so a slow host cannot multiply the
# timeout.
#
# Overrides (tests and session pins):
#   FM_RESGATE_WORK_SSH, FM_RESGATE_HOME_SSH
#   FM_RESGATE_NOW_OVERRIDE
#   FM_RESGATE_VOICE_PORT (default 7414)
#   FM_RESGATE_GPU_BUSY_MB (default 4096)
#   FM_RESGATE_SSH_TIMEOUT (seconds, default 5)
#   FM_RESGATE_SKIP_REMOTE=1 (never probe, always fail closed - tests only)

_FM_RESGATE_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=bin/fm-timeout-lib.sh
. "$_FM_RESGATE_LIB_DIR/fm-timeout-lib.sh"

FM_RESGATE_WORK_SSH_DEFAULT=Valentino-Arbeit
FM_RESGATE_HOME_SSH_DEFAULT=Valentino
FM_RESGATE_VOICE_PORT_DEFAULT=7414
FM_RESGATE_GPU_BUSY_MB_DEFAULT=4096
FM_RESGATE_GPU_PROCESS_NAME=ollama
FM_RESGATE_WORK_CAP_START_MIN=$((10 * 60))       # 10:00
FM_RESGATE_WORK_CAP_END_MIN=$((19 * 60 + 30))    # 19:30
FM_RESGATE_HOME_FREE_START_MIN=$((4 * 60))       # 04:00
FM_RESGATE_HOME_FREE_END_MIN=$((19 * 60))        # 19:00
FM_RESGATE_CAPPED_PCT=50
FM_RESGATE_UNCAPPED_PCT=100
FM_RESGATE_BLOCKED_PCT=0

fm_resgate_role_ok() {
  case "${1:-}" in work | home) return 0 ;; esac
  return 1
}

fm_resgate_ssh_alias() { # <role>
  case "$1" in
    work) printf '%s\n' "${FM_RESGATE_WORK_SSH:-$FM_RESGATE_WORK_SSH_DEFAULT}" ;;
    home) printf '%s\n' "${FM_RESGATE_HOME_SSH:-$FM_RESGATE_HOME_SSH_DEFAULT}" ;;
  esac
}

fm_resgate_is_uint() {
  case "${1:-}" in '' | *[!0-9]*) return 1 ;; esac
  return 0
}

# Sets FM_RESGATE_NOW_DOW (1=Monday..7=Sunday) and FM_RESGATE_NOW_MOD (minutes
# since local midnight, 0-1439), read from ONE `date` call so a rollover
# between day-of-week and time-of-day cannot be observed straddling midnight.
# Returns 1 on any unreadable or malformed clock; callers must fail closed on
# that, never fall back to a default time.
fm_resgate_now_fields() {
  local raw dow hh mm
  FM_RESGATE_NOW_DOW=
  FM_RESGATE_NOW_MOD=
  if [ -n "${FM_RESGATE_NOW_OVERRIDE:-}" ]; then
    raw=$FM_RESGATE_NOW_OVERRIDE
  else
    raw=$(TZ=Europe/Berlin date +'%u %H %M' 2>/dev/null) || return 1
  fi
  # shellcheck disable=SC2086
  set -- $raw
  [ "$#" -eq 3 ] || return 1
  dow=$1 hh=$2 mm=$3
  fm_resgate_is_uint "$dow" || return 1
  fm_resgate_is_uint "$hh" || return 1
  fm_resgate_is_uint "$mm" || return 1
  [ "$dow" -ge 1 ] && [ "$dow" -le 7 ] || return 1
  [ "$hh" -le 23 ] || return 1
  [ "$mm" -le 59 ] || return 1
  FM_RESGATE_NOW_DOW=$dow
  FM_RESGATE_NOW_MOD=$((10#$hh * 60 + 10#$mm))
  return 0
}

# Schedule state for <role> at the current moment, ignoring any manual
# override. Sets FM_RESGATE_SCHEDULE_STATE to one of:
#   uncapped  - full resources
#   capped    - the 50% window applies
#   blocked   - the authoritative clock could not be read; fail closed to 0%,
#               stricter than an ordinary capped window, because a schedule
#               decision cannot be made at all.
# and FM_RESGATE_SCHEDULE_REASON to a short human-readable reason.
fm_resgate_schedule_state() { # <role>
  local role=$1 dow mod weekday
  fm_resgate_role_ok "$role" || {
    FM_RESGATE_SCHEDULE_STATE=blocked
    FM_RESGATE_SCHEDULE_REASON="unknown role: $role"
    return 1
  }
  if ! fm_resgate_now_fields; then
    FM_RESGATE_SCHEDULE_STATE=blocked
    FM_RESGATE_SCHEDULE_REASON='authoritative clock unreadable; refusing to guess the schedule window'
    return 0
  fi
  dow=$FM_RESGATE_NOW_DOW
  mod=$FM_RESGATE_NOW_MOD
  weekday=0
  [ "$dow" -ge 1 ] && [ "$dow" -le 5 ] && weekday=1
  case "$role" in
    work)
      if [ "$weekday" -eq 1 ] \
        && [ "$mod" -ge "$FM_RESGATE_WORK_CAP_START_MIN" ] \
        && [ "$mod" -lt "$FM_RESGATE_WORK_CAP_END_MIN" ]; then
        FM_RESGATE_SCHEDULE_STATE=capped
        FM_RESGATE_SCHEDULE_REASON='Mo-Fr 10:00-19:30 on the work PC (captain working hours)'
      else
        FM_RESGATE_SCHEDULE_STATE=uncapped
        FM_RESGATE_SCHEDULE_REASON='outside Mo-Fr 10:00-19:30 on the work PC (evening, night, or weekend)'
      fi
      ;;
    home)
      if [ "$weekday" -eq 1 ] \
        && [ "$mod" -ge "$FM_RESGATE_HOME_FREE_START_MIN" ] \
        && [ "$mod" -lt "$FM_RESGATE_HOME_FREE_END_MIN" ]; then
        FM_RESGATE_SCHEDULE_STATE=uncapped
        FM_RESGATE_SCHEDULE_REASON='Mo-Fr 04:00-19:00 on the home PC'
      else
        FM_RESGATE_SCHEDULE_STATE=capped
        FM_RESGATE_SCHEDULE_REASON='outside Mo-Fr 04:00-19:00 on the home PC (evening, night, or weekend)'
      fi
      ;;
  esac
  return 0
}

# <state-dir> for the override marker files; overridable for tests exactly
# like every other script in this repo.
fm_resgate_override_path() { # <state-dir> <role>
  printf '%s/.resgate-cap-%s\n' "$1" "$2"
}

fm_resgate_override_active() { # <state-dir> <role>
  local path
  path=$(fm_resgate_override_path "$1" "$2")
  [ -e "$path" ]
}

# Arm the manual override for <role>. Atomic write (mktemp + mv), matching
# state/.afk, so a concurrent reader never observes a half-written marker.
fm_resgate_override_set() { # <state-dir> <role> [note]
  local state=$1 role=$2 note=${3:-} path pending
  fm_resgate_role_ok "$role" || return 1
  [ -d "$state" ] || mkdir -p "$state" || return 1
  path=$(fm_resgate_override_path "$state" "$role")
  pending=$(mktemp "$path.pending.XXXXXX") || return 1
  {
    printf 'armed_at=%s\n' "$(TZ=Europe/Berlin date +%Y-%m-%dT%H:%M:%S%z 2>/dev/null || printf unknown)"
    printf 'note=%s\n' "${note:-Kappung}"
  } > "$pending" && mv -f "$pending" "$path" && return 0
  rm -f "$pending" 2>/dev/null || true
  return 1
}

fm_resgate_override_clear() { # <state-dir> <role>
  local path
  fm_resgate_role_ok "$2" || return 1
  path=$(fm_resgate_override_path "$1" "$2")
  rm -f "$path" 2>/dev/null
  return 0
}

# Effective state for <role>: an active override forces "capped" immediately,
# regardless of what the schedule computation would otherwise say. Sets
# FM_RESGATE_STATE and FM_RESGATE_REASON.
# shellcheck disable=SC2034
fm_resgate_effective_state() { # <state-dir> <role>
  local state=$1 role=$2
  if fm_resgate_override_active "$state" "$role"; then
    FM_RESGATE_STATE=capped
    FM_RESGATE_REASON='manual override armed (Kappung); forced capped regardless of the clock window'
    return 0
  fi
  fm_resgate_schedule_state "$role"
  FM_RESGATE_STATE=$FM_RESGATE_SCHEDULE_STATE
  FM_RESGATE_REASON=$FM_RESGATE_SCHEDULE_REASON
  return 0
}

# Percentage of resources <role> may use right now: 100 (uncapped), 50
# (capped), or 0 (blocked - the clock or role was unreadable). Sets
# FM_RESGATE_PCT and FM_RESGATE_REASON.
# shellcheck disable=SC2034
fm_resgate_capacity_pct() { # <state-dir> <role>
  fm_resgate_effective_state "$1" "$2"
  case "$FM_RESGATE_STATE" in
    uncapped) FM_RESGATE_PCT=$FM_RESGATE_UNCAPPED_PCT ;;
    capped) FM_RESGATE_PCT=$FM_RESGATE_CAPPED_PCT ;;
    *) FM_RESGATE_PCT=$FM_RESGATE_BLOCKED_PCT ;;
  esac
  return 0
}

# Apply a percentage to a raw resource/slot count. Integer floor division;
# fails closed to 0 on a non-numeric raw count or an out-of-range percentage
# rather than passing either through unchecked.
fm_resgate_apply_pct() { # <raw-count> <pct 0-100>
  local raw=$1 pct=$2
  fm_resgate_is_uint "$raw" || { printf '0\n'; return 0; }
  fm_resgate_is_uint "$pct" || { printf '0\n'; return 0; }
  [ "$pct" -le 100 ] || { printf '0\n'; return 0; }
  printf '%s\n' $(((10#$raw * 10#$pct) / 100))
}

fm_resgate_voice_port() {
  printf '%s\n' "${FM_RESGATE_VOICE_PORT:-$FM_RESGATE_VOICE_PORT_DEFAULT}"
}

fm_resgate_ssh_raw() { # <host> <remote-cmd>
  local host=$1 cmd=$2 bound
  bound=$((${FM_RESGATE_SSH_TIMEOUT:-5} + 5))
  fm_run_timed "$bound" ssh \
    -o BatchMode=yes \
    -o ConnectTimeout="${FM_RESGATE_SSH_TIMEOUT:-5}" \
    -o ServerAliveInterval=2 \
    -o ServerAliveCountMax=2 \
    -o ForwardAgent=no \
    "$host" "$cmd"
}

fm_resgate_gpu_busy_mb() {
  printf '%s\n' "${FM_RESGATE_GPU_BUSY_MB:-$FM_RESGATE_GPU_BUSY_MB_DEFAULT}"
}

# One PowerShell round trip: the JARVIS-voice gateway port's listen state, the
# Qwen-identifying named process, and aggregate GPU memory used (see the file
# header for why aggregate memory + named process, not per-process
# compute-apps attribution). Every line is emitted unconditionally, including
# on failure (gpu_used_mb=probe-failed), so absorption can tell "this specific
# reading failed" apart from "no probe output arrived at all".
fm_resgate_home_gpu_probe_cmd() { # <port> <process-name>
  local port=$1 proc=$2 cmd
  cmd=$(cat <<'CMD'
$conn = Get-NetTCPConnection -LocalPort @PORT@ -State Listen -ErrorAction SilentlyContinue
if ($conn) { Write-Output 'FM_RESGATE voice_port=listening' } else { Write-Output 'FM_RESGATE voice_port=not-listening' }
$proc = Get-Process -Name '@PROCESS@' -ErrorAction SilentlyContinue
if ($proc) { Write-Output 'FM_RESGATE gpu_process=running' } else { Write-Output 'FM_RESGATE gpu_process=not-running' }
try {
  $used = & nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>$null
  if ($LASTEXITCODE -eq 0 -and $used) { Write-Output ('FM_RESGATE gpu_used_mb=' + ($used | Select-Object -First 1).Trim()) }
  else { Write-Output 'FM_RESGATE gpu_used_mb=probe-failed' }
} catch {
  Write-Output 'FM_RESGATE gpu_used_mb=probe-failed'
}
CMD
  )
  cmd=${cmd//@PORT@/$port}
  printf '%s\n' "${cmd//@PROCESS@/$proc}"
}

# Parses fm_resgate_home_gpu_probe_cmd's output into FM_RESGATE_GPU_VOICE,
# FM_RESGATE_GPU_PROCESS, and FM_RESGATE_GPU_USED_MB ("yes"/"no", or a MiB
# integer; empty/unset when that line never arrived or read "probe-failed" -
# both mean "unknown", never a guessed permissive value). Returns 1 when NOT
# EVEN ONE line arrived at all (SSH itself failed).
# The remote host is Windows PowerShell, whose Write-Output terminates every
# line with CRLF; `read` only strips the trailing LF, so each line keeps a
# trailing CR that would otherwise make every exact-match case pattern below
# fail silently and fall through to "unknown" - live-verified against the
# real home host, not a hypothetical.
fm_resgate_absorb_gpu_probe() { # <text>
  local text=$1 line key val seen=0
  FM_RESGATE_GPU_VOICE=
  FM_RESGATE_GPU_PROCESS=
  FM_RESGATE_GPU_USED_MB=
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    case "$line" in
      FM_RESGATE\ *)
        seen=1
        key=${line#FM_RESGATE }
        val=${key#*=}
        key=${key%%=*}
        case "$key" in
          voice_port)
            case "$val" in
              listening) FM_RESGATE_GPU_VOICE=yes ;;
              not-listening) FM_RESGATE_GPU_VOICE=no ;;
            esac
            ;;
          gpu_process)
            case "$val" in
              running) FM_RESGATE_GPU_PROCESS=yes ;;
              not-running) FM_RESGATE_GPU_PROCESS=no ;;
            esac
            ;;
          gpu_used_mb)
            fm_resgate_is_uint "$val" && FM_RESGATE_GPU_USED_MB=$val
            ;;
        esac
        ;;
    esac
  done <<EOF
$text
EOF
  [ "$seen" -eq 1 ]
}

# Which workload currently owns the home PC's GPU, from a fresh probe. Sets
# FM_RESGATE_GPU_OWNER to one of: none, qwen, voice, conflict, unknown.
# Qwen is "active" only when BOTH the named process is running AND aggregate
# GPU memory clears FM_RESGATE_GPU_BUSY_MB - see the file header for why
# either signal alone is insufficient. "unknown" fails closed and covers
# every unmeasurable case: an unreachable host, a probe that returned no
# lines at all, or any individual reading coming back unknown (a failed
# nvidia-smi call, an unparsable port or process check) - a partial reading
# is never completed with a guess. "conflict" means voice and Qwen both read
# active at once, which the policy says must never happen; it is reported,
# never silently resolved in favour of either side.
# shellcheck disable=SC2034
fm_resgate_home_gpu_owner() {
  local host out qwen_active
  FM_RESGATE_GPU_OWNER=unknown
  FM_RESGATE_GPU_VOICE=
  FM_RESGATE_GPU_PROCESS=
  FM_RESGATE_GPU_USED_MB=
  if [ "${FM_RESGATE_SKIP_REMOTE:-}" = 1 ]; then
    return 1
  fi
  host=$(fm_resgate_ssh_alias home)
  out=$(fm_resgate_ssh_raw "$host" \
    "$(fm_resgate_home_gpu_probe_cmd "$(fm_resgate_voice_port)" "$FM_RESGATE_GPU_PROCESS_NAME")" \
    2>/dev/null) || out=
  fm_resgate_absorb_gpu_probe "$out" || return 1
  case "$FM_RESGATE_GPU_VOICE" in yes | no) ;; *) return 1 ;; esac
  case "$FM_RESGATE_GPU_PROCESS" in yes | no) ;; *) return 1 ;; esac
  fm_resgate_is_uint "${FM_RESGATE_GPU_USED_MB:-}" || return 1
  qwen_active=no
  if [ "$FM_RESGATE_GPU_PROCESS" = yes ] \
    && [ "$FM_RESGATE_GPU_USED_MB" -ge "$(fm_resgate_gpu_busy_mb)" ]; then
    qwen_active=yes
  fi
  if [ "$FM_RESGATE_GPU_VOICE" = yes ] && [ "$qwen_active" = yes ]; then
    FM_RESGATE_GPU_OWNER=conflict
  elif [ "$FM_RESGATE_GPU_VOICE" = yes ]; then
    FM_RESGATE_GPU_OWNER=voice
  elif [ "$qwen_active" = yes ]; then
    FM_RESGATE_GPU_OWNER=qwen
  else
    FM_RESGATE_GPU_OWNER=none
  fi
  return 0
}

# May <workload> (qwen|voice) start or keep running on the home PC's GPU right
# now? Sets FM_RESGATE_GPU_REASON. Fails closed (returns 1) on conflict or
# unknown: an ambiguous reading must never be read as permission, and must
# never let one side quietly work around the other's reservation.
# shellcheck disable=SC2034
fm_resgate_gpu_available_for() { # <qwen|voice>
  local want=$1
  case "$want" in qwen | voice) ;; *) return 1 ;; esac
  fm_resgate_home_gpu_owner
  case "$FM_RESGATE_GPU_OWNER" in
    none)
      FM_RESGATE_GPU_REASON='GPU is free'
      return 0
      ;;
    qwen)
      if [ "$want" = qwen ]; then
        FM_RESGATE_GPU_REASON='Qwen already holds the GPU'
        return 0
      fi
      FM_RESGATE_GPU_REASON='GPU is reserved for Qwen; JARVIS voice must not start'
      return 1
      ;;
    voice)
      if [ "$want" = voice ]; then
        FM_RESGATE_GPU_REASON='JARVIS voice already holds the GPU'
        return 0
      fi
      FM_RESGATE_GPU_REASON='GPU is reserved for JARVIS voice; Qwen must not start'
      return 1
      ;;
    conflict)
      FM_RESGATE_GPU_REASON='Qwen and JARVIS voice both read active at once; refusing rather than picking a side'
      return 1
      ;;
    *)
      FM_RESGATE_GPU_REASON='GPU ownership could not be measured; refusing rather than guessing'
      return 1
      ;;
  esac
}
