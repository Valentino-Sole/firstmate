# shellcheck shell=bash
# fm-capacity-lib.sh - resource-aware worker slots and compute-host routing.
#
# Source this file. bin/fm-capacity.sh is the CLI, and bin/fm-spawn.sh consults
# fm_capacity_allow_new_worker before a fresh ship or scout launch.
# docs/configuration.md "Compute hosts and worker slots" owns the optional
# config/compute-hosts.json schema. This header owns the slot formula, the
# fresh-probe contract, same-task uniqueness, and the refuse-rather-than-kill
# spawn gate.
#
# What this is not: it does not choose harness, model, or effort, and it does
# not read config/crew-dispatch.json.
#
# Slot formula (local supervisor host, integer arithmetic):
#   cpu_slots    = max(1, nproc / 3)
#   ram_slots    = max(0, (mem_avail_mb - 4096) / 3072) when mem_avail_mb is known;
#                  when RAM cannot be read, ram_slots is the ceiling (CPU and
#                  load still protect the host)
#   load_cap     = 0 when load1 >= nproc;
#                  1 when load1 >= 0.7 * nproc;
#                  otherwise the ceiling
#   slots        = min(cpu_slots, ram_slots, load_cap, 5)
# The ceiling 5 is a safety cap on the formula, not a rigid agent count.
#
# Occupancy is host-scoped, not home-scoped: the budget protects one physical
# server, so N firstmate homes on this host share one budget instead of taking
# N independent ones. The scanned set is this home, the local primary home it
# was seeded from when it is a secondmate home (.fm-secondmate-parent), and
# every locally routed secondmate registered under that primary
# (data/secondmates.md). Remote secondmates run on another machine and are not
# counted. `fm-capacity.sh slots` prints homes_scanned so the measurement is
# auditable.
#
# A slot is held by a LIVE worker, not by a metadata record: each ship/scout
# record's endpoint is classified through fm-backend.sh's agent-state contract,
# and only a confidently gone endpoint (dead or missing) frees its slot. A task
# parked on a captain hold or waiting on a merge with no running worker
# therefore stops blocking fresh dispatch, while an ambiguous or unreadable
# endpoint keeps its slot so a probe failure can never oversubscribe the host.
# Task identity is separate from that: same-task uniqueness still reads the
# metadata record, so a task never gets a second concurrent worker.
# Idle secondmates do not occupy a worker slot. A relaunch replaces one worker
# and does not consume an extra slot. The gate never interrupts another task.
#
# Host routing (recompute-heavy / host-bound work only):
#   Session pins (flags/env) merge over config/compute-hosts.json field by
#   field: pinning only the preferred host keeps the configured fallback, and
#   an unrecognised pinned kind is rejected exactly like an unrecognised kind
#   inside the config file rather than coerced to a default.
#   Probe configured preferred, then fallback, with a bounded SSH call.
#   Prefer the preferred host when it is freshly reachable and suitable.
#   Use the fallback only when the preferred is not.
#   Never assign that class of work onto the protected local supervisor
#   just because both remotes failed; route=none in that case.
#   A gpu-kind host is suitable when nvidia-smi reports util <= 90 and at
#   least 1024 MiB free. A cpu-kind host is suitable when load1 < nproc and
#   mem_avail_mb >= 2048.
#
# Freshness: every probe() call measures again. Nothing here caches a prior
# host snapshot across invocations.
#
# Overrides (tests and session pins; never inferred from a stale file):
#   FM_CAPACITY_NPROC, FM_CAPACITY_MEM_AVAIL_MB, FM_CAPACITY_LOAD1
#   FM_CAPACITY_SKIP_REMOTE=1
#   FM_CAPACITY_PREFERRED_SSH, FM_CAPACITY_PREFERRED_KIND
#   FM_CAPACITY_FALLBACK_SSH, FM_CAPACITY_FALLBACK_KIND
#   FM_CAPACITY_SSH_TIMEOUT (seconds, default 5)

_FM_CAPACITY_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=bin/fm-timeout-lib.sh
. "$_FM_CAPACITY_LIB_DIR/fm-timeout-lib.sh"
# Endpoint liveness and the local-home topology come from the surfaces that
# already own them; a caller that sourced them first keeps its own copy.
if ! declare -F fm_backend_agent_alive >/dev/null 2>&1; then
  # shellcheck source=bin/fm-backend.sh
  . "$_FM_CAPACITY_LIB_DIR/fm-backend.sh"
fi
if ! declare -F secondmate_registry_parse_line >/dev/null 2>&1; then
  # shellcheck source=bin/fm-secondmate-registry-lib.sh
  . "$_FM_CAPACITY_LIB_DIR/fm-secondmate-registry-lib.sh"
fi
if ! declare -F fm_secondmate_parent_record_parse >/dev/null 2>&1; then
  # shellcheck source=bin/fm-secondmate-parent-lib.sh
  . "$_FM_CAPACITY_LIB_DIR/fm-secondmate-parent-lib.sh"
fi

FM_CAPACITY_SLOT_CEILING=5
FM_CAPACITY_CPU_PER_SLOT=3
FM_CAPACITY_RAM_RESERVE_MB=4096
FM_CAPACITY_RAM_PER_SLOT_MB=3072
FM_CAPACITY_GPU_MIN_FREE_MB=1024
FM_CAPACITY_GPU_MAX_UTIL=90
FM_CAPACITY_CPU_MIN_MEM_MB=2048
FM_CAPACITY_CONFIG_FILE=compute-hosts.json

fm_capacity_is_uint() {
  case "${1:-}" in '' | *[!0-9]*) return 1 ;; esac
  return 0
}

fm_capacity_is_number() {
  local v=${1:-}
  case "$v" in
    '' | *[!0-9.]* | .) return 1 ;;
  esac
  case "${v#*.}" in *.*) return 1 ;; esac
  return 0
}

fm_capacity_ssh_alias_ok() {
  case "${1:-}" in
    '' | -* | *[!A-Za-z0-9._-]*) return 1 ;;
  esac
  return 0
}

fm_capacity_kind_ok() {
  case "${1:-}" in cpu | gpu) return 0 ;; esac
  return 1
}

fm_capacity_load_hundredths() {
  local v=$1
  fm_capacity_is_number "$v" || return 1
  printf '%s\n' "$v" | awk '{ printf "%d", ($1 + 0) * 100 }'
}

fm_capacity_min() {
  local a=$1 b=$2
  [ "$a" -lt "$b" ] && printf '%s\n' "$a" || printf '%s\n' "$b"
}

fm_capacity_max() {
  local a=$1 b=$2
  [ "$a" -gt "$b" ] && printf '%s\n' "$a" || printf '%s\n' "$b"
}

# Integer slot count from one local measurement triple. Unknown RAM (empty or
# non-numeric mem_avail_mb) skips the RAM axis rather than inventing a size.
fm_capacity_slots_from_local() { # <nproc> <mem_avail_mb-or-empty> <load1>
  local nproc=$1 mem=$2 load1=$3 cpu_slots ram_slots load_cap load_h nproc_h slots
  fm_capacity_is_uint "$nproc" || { printf '0\n'; return 0; }
  [ "$nproc" -gt 0 ] || { printf '0\n'; return 0; }
  cpu_slots=$((nproc / FM_CAPACITY_CPU_PER_SLOT))
  [ "$cpu_slots" -gt 0 ] || cpu_slots=1
  if fm_capacity_is_uint "$mem"; then
    if [ "$mem" -gt "$FM_CAPACITY_RAM_RESERVE_MB" ]; then
      ram_slots=$(((mem - FM_CAPACITY_RAM_RESERVE_MB) / FM_CAPACITY_RAM_PER_SLOT_MB))
    else
      ram_slots=0
    fi
  else
    ram_slots=$FM_CAPACITY_SLOT_CEILING
  fi
  load_h=$(fm_capacity_load_hundredths "$load1") || { printf '0\n'; return 0; }
  nproc_h=$((nproc * 100))
  if [ "$load_h" -ge "$nproc_h" ]; then
    load_cap=0
  elif [ "$load_h" -ge $((nproc * 70)) ]; then
    load_cap=1
  else
    load_cap=$FM_CAPACITY_SLOT_CEILING
  fi
  slots=$(fm_capacity_min "$cpu_slots" "$ram_slots")
  slots=$(fm_capacity_min "$slots" "$load_cap")
  slots=$(fm_capacity_min "$slots" "$FM_CAPACITY_SLOT_CEILING")
  [ "$slots" -ge 0 ] || slots=0
  printf '%s\n' "$slots"
}

fm_capacity_read_nproc() {
  if [ -n "${FM_CAPACITY_NPROC:-}" ]; then
    printf '%s\n' "$FM_CAPACITY_NPROC"
    return 0
  fi
  if command -v nproc >/dev/null 2>&1; then
    nproc
    return 0
  fi
  getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || printf '1\n'
}

fm_capacity_read_mem_avail_mb() {
  local kb
  if [ -n "${FM_CAPACITY_MEM_AVAIL_MB:-}" ]; then
    printf '%s\n' "$FM_CAPACITY_MEM_AVAIL_MB"
    return 0
  fi
  if [ -r /proc/meminfo ]; then
    kb=$(awk '/^MemAvailable:/ { print $2; exit }' /proc/meminfo)
    if fm_capacity_is_uint "$kb"; then
      printf '%s\n' $((kb / 1024))
      return 0
    fi
  fi
  printf '\n'
}

fm_capacity_read_load1() {
  if [ -n "${FM_CAPACITY_LOAD1:-}" ]; then
    printf '%s\n' "$FM_CAPACITY_LOAD1"
    return 0
  fi
  if [ -r /proc/loadavg ]; then
    awk '{ print $1; exit }' /proc/loadavg
    return 0
  fi
  sysctl -n vm.loadavg 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]/) { print $i; exit } }'
}

# Independent-worker records in one home: ship and scout metadata. Prints one
# task id per line. This is the task-IDENTITY view, so a record counts here
# whether or not its worker is still running; fm_capacity_live_ids applies
# liveness on top. Secondmates are persistent specialists and never occupy an
# independent worker slot.
fm_capacity_occupied_ids() { # <state-dir>
  local state=$1 file id kind
  [ -d "$state" ] || return 0
  for file in "$state"/*.meta; do
    [ -f "$file" ] && [ ! -L "$file" ] || continue
    id=$(basename "$file" .meta)
    case "$id" in '' | *[!A-Za-z0-9._-]*) continue ;; esac
    kind=$(grep -E '^kind=' "$file" 2>/dev/null | head -n 1 | cut -d= -f2-)
    case "$kind" in
      secondmate) continue ;;
      scout | ship | '') printf '%s\n' "$id" ;;
      *) continue ;;
    esac
  done
}

# Does <meta-file>'s recorded endpoint still hold a worker slot? Only an
# endpoint that fm-backend.sh reports as confidently gone (dead or missing)
# frees its slot. Ambiguous, unreadable, and unverified endpoints keep theirs,
# so a failed probe never licenses an extra worker on this host.
fm_capacity_worker_live() { # <meta-file>
  local meta=$1 backend target
  [ -f "$meta" ] && [ ! -L "$meta" ] || return 1
  declare -F fm_backend_agent_alive >/dev/null 2>&1 || return 0
  backend=$(fm_backend_of_meta "$meta")
  target=$(fm_backend_target_of_meta "$meta")
  [ -n "$target" ] || return 0
  [ "$(fm_backend_agent_alive "$backend" "$target")" != dead ]
}

# Independent workers in one home that still hold a slot.
fm_capacity_live_ids() { # <state-dir>
  local state=$1 id
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    fm_capacity_worker_live "$state/$id.meta" || continue
    printf '%s\n' "$id"
  done < <(fm_capacity_occupied_ids "$state")
}

fm_capacity_occupied_count() { # <state-dir>
  local n=0
  while IFS= read -r _; do
    n=$((n + 1))
  done < <(fm_capacity_live_ids "$1")
  printf '%s\n' "$n"
}

fm_capacity_task_occupies_slot() { # <state-dir> <task-id>
  local state=$1 want=$2 id
  while IFS= read -r id; do
    [ "$id" = "$want" ] && return 0
  done < <(fm_capacity_occupied_ids "$state")
  return 1
}

# Every local firstmate home that shares this physical host with <home-dir>:
# this home, the local primary home it was seeded from when it is a secondmate
# home, and every locally routed secondmate registered under that primary. A
# remote secondmate lives on another machine and is left out. Unparsable
# registry lines are skipped rather than trusted.
fm_capacity_host_homes() { # <home-dir>
  local home=$1 root reg line seen
  [ -n "$home" ] || return 0
  root=$home
  if fm_secondmate_parent_record_parse "$home/.fm-secondmate-parent" 2>/dev/null; then
    if [ "${FM_SECONDMATE_PARENT_ROUTE:-}" = local ] && [ -n "${FM_SECONDMATE_PARENT_HOME:-}" ]; then
      root=$FM_SECONDMATE_PARENT_HOME
    fi
  fi
  seen=$'\n'
  for line in "$home" "$root"; do
    case "$seen" in *$'\n'"$line"$'\n'*) continue ;; esac
    seen="$seen$line"$'\n'
    printf '%s\n' "$line"
  done
  reg="$root/data/secondmates.md"
  [ -f "$reg" ] && [ ! -L "$reg" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '- '*) ;; *) continue ;; esac
    secondmate_registry_parse_line "$line" || continue
    [ "$SECONDMATE_REGISTRY_REMOTE" -eq 0 ] || continue
    case "$SECONDMATE_REGISTRY_HOME" in /*) ;; *) continue ;; esac
    case "$seen" in *$'\n'"$SECONDMATE_REGISTRY_HOME"$'\n'*) continue ;; esac
    seen="$seen$SECONDMATE_REGISTRY_HOME"$'\n'
    printf '%s\n' "$SECONDMATE_REGISTRY_HOME"
  done < "$reg"
}

# Live independent workers across every local home on this host. Sets
# FM_CAPACITY_OCCUPIED and the auditable FM_CAPACITY_HOMES_SCANNED.
# shellcheck disable=SC2034
fm_capacity_measure_host_occupancy() { # <state-dir> <home-dir>
  local state=$1 home=$2 peer peer_state
  FM_CAPACITY_OCCUPIED=$(fm_capacity_occupied_count "$state")
  FM_CAPACITY_HOMES_SCANNED=1
  [ -n "$home" ] || return 0
  while IFS= read -r peer; do
    [ -n "$peer" ] || continue
    [ "$peer" != "$home" ] || continue
    peer_state="$peer/state"
    [ "$peer_state" != "$state" ] || continue
    [ -d "$peer_state" ] || continue
    FM_CAPACITY_HOMES_SCANNED=$((FM_CAPACITY_HOMES_SCANNED + 1))
    FM_CAPACITY_OCCUPIED=$((FM_CAPACITY_OCCUPIED + $(fm_capacity_occupied_count "$peer_state")))
  done < <(fm_capacity_host_homes "$home")
}

fm_capacity_host_suitable() { # <kind> <nproc> <mem_avail_mb> <load1> <gpu_free_mb> <gpu_util>
  local kind=$1 nproc=$2 mem=$3 load1=$4 gpu_free=$5 gpu_util=$6 load_h nproc_h
  fm_capacity_kind_ok "$kind" || return 1
  fm_capacity_is_uint "$nproc" || return 1
  [ "$nproc" -gt 0 ] || return 1
  load_h=$(fm_capacity_load_hundredths "$load1") || return 1
  nproc_h=$((nproc * 100))
  case "$kind" in
    gpu)
      fm_capacity_is_uint "$gpu_free" || return 1
      fm_capacity_is_uint "$gpu_util" || return 1
      [ "$gpu_free" -ge "$FM_CAPACITY_GPU_MIN_FREE_MB" ] || return 1
      [ "$gpu_util" -le "$FM_CAPACITY_GPU_MAX_UTIL" ] || return 1
      return 0
      ;;
    cpu)
      [ "$load_h" -lt "$nproc_h" ] || return 1
      fm_capacity_is_uint "$mem" || return 1
      [ "$mem" -ge "$FM_CAPACITY_CPU_MIN_MEM_MB" ] || return 1
      return 0
      ;;
  esac
  return 1
}

fm_capacity_parse_gpu_csv() { # <csv> -> sets FM_CAPACITY_GPU_FREE_MB FM_CAPACITY_GPU_UTIL
  local csv=$1 free util
  FM_CAPACITY_GPU_FREE_MB=
  FM_CAPACITY_GPU_UTIL=
  csv=$(printf '%s' "$csv" | tr -d ' \r' | head -n 1)
  [ -n "$csv" ] || return 1
  free=${csv%%,*}
  util=${csv#*,}
  util=${util%%,*}
  fm_capacity_is_uint "$free" || return 1
  fm_capacity_is_uint "$util" || return 1
  FM_CAPACITY_GPU_FREE_MB=$free
  FM_CAPACITY_GPU_UTIL=$util
  return 0
}

# Convert a Windows LoadPercentage (0-100) plus nproc into a load1 equivalent.
fm_capacity_load1_from_pct() { # <nproc> <load_pct>
  local nproc=$1 pct=$2
  fm_capacity_is_uint "$nproc" && fm_capacity_is_uint "$pct" || return 1
  awk -v n="$nproc" -v p="$pct" 'BEGIN { printf "%.2f", n * p / 100 }'
}

fm_capacity_posix_probe_cmd() {
  cat <<'CMD'
printf 'FM_CAP nproc=%s\n' "$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || printf 0)"
if [ -r /proc/meminfo ]; then awk '/^MemAvailable:/ { printf "FM_CAP mem_avail_mb=%d\n", $2/1024; exit }' /proc/meminfo; else printf 'FM_CAP mem_avail_mb=0\n'; fi
if [ -r /proc/loadavg ]; then awk '{ printf "FM_CAP load1=%s\n", $1; exit }' /proc/loadavg; else printf 'FM_CAP load1=0\n'; fi
printf 'FM_CAP gpu=%s\n' "$(nvidia-smi --query-gpu=memory.free,utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -n 1 | tr -d ' ')"
CMD
}

fm_capacity_windows_probe_cmd() {
  cat <<'CMD'
$n = [Environment]::ProcessorCount; $os = Get-CimInstance Win32_OperatingSystem; $avail = 0; if ($os -and $os.FreePhysicalMemory) { $avail = [int]($os.FreePhysicalMemory / 1024) }; $load = 0; $cpu = @(Get-CimInstance Win32_Processor); if ($cpu.Count -gt 0) { $load = [int](($cpu | Measure-Object -Property LoadPercentage -Average).Average) }; $gpu = ''; try { $gpu = (& nvidia-smi --query-gpu=memory.free,utilization.gpu --format=csv,noheader,nounits 2>$null | Select-Object -First 1) } catch {}; Write-Output ("FM_CAP nproc=" + $n); Write-Output ("FM_CAP mem_avail_mb=" + $avail); Write-Output ("FM_CAP load_pct=" + $load); Write-Output ("FM_CAP gpu=" + $gpu)
CMD
}

fm_capacity_ssh_raw() { # <host> <remote-cmd>
  local host=$1 cmd=$2 bound
  bound=$((${FM_CAPACITY_SSH_TIMEOUT:-5} + 3))
  [ "$bound" -gt 3 ] || bound=8
  fm_run_timed "$bound" ssh \
    -o BatchMode=yes \
    -o ConnectTimeout="${FM_CAPACITY_SSH_TIMEOUT:-5}" \
    -o ServerAliveInterval=2 \
    -o ServerAliveCountMax=2 \
    -o ForwardAgent=no \
    "$host" "$cmd"
}

# Parse FM_CAP lines from a probe transcript into the FM_CAPACITY_PROBE_* vars.
fm_capacity_absorb_probe_text() {
  local text=$1 line key val load_pct
  FM_CAPACITY_PROBE_NPROC=
  FM_CAPACITY_PROBE_MEM_MB=
  FM_CAPACITY_PROBE_LOAD1=
  FM_CAPACITY_PROBE_GPU_FREE=
  FM_CAPACITY_PROBE_GPU_UTIL=
  load_pct=
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      FM_CAP\ *)
        key=${line#FM_CAP }
        val=${key#*=}
        key=${key%%=*}
        case "$key" in
          nproc) FM_CAPACITY_PROBE_NPROC=$val ;;
          mem_avail_mb) FM_CAPACITY_PROBE_MEM_MB=$val ;;
          load1) FM_CAPACITY_PROBE_LOAD1=$val ;;
          load_pct) load_pct=$val ;;
          gpu) fm_capacity_parse_gpu_csv "$val" && {
            FM_CAPACITY_PROBE_GPU_FREE=$FM_CAPACITY_GPU_FREE_MB
            FM_CAPACITY_PROBE_GPU_UTIL=$FM_CAPACITY_GPU_UTIL
          } ;;
        esac
        ;;
    esac
  done <<EOF
$text
EOF
  if [ -z "$FM_CAPACITY_PROBE_LOAD1" ] && [ -n "$load_pct" ] && [ -n "$FM_CAPACITY_PROBE_NPROC" ]; then
    FM_CAPACITY_PROBE_LOAD1=$(fm_capacity_load1_from_pct "$FM_CAPACITY_PROBE_NPROC" "$load_pct" || true)
  fi
  fm_capacity_is_uint "$FM_CAPACITY_PROBE_NPROC" || return 1
  [ "$FM_CAPACITY_PROBE_NPROC" -gt 0 ] || return 1
  return 0
}

# Probe one SSH alias. Sets measurement vars when reachable. Does not cache.
fm_capacity_probe_ssh() { # <ssh-alias>
  local host=$1 out
  FM_CAPACITY_PROBE_NPROC=
  FM_CAPACITY_PROBE_MEM_MB=
  FM_CAPACITY_PROBE_LOAD1=
  FM_CAPACITY_PROBE_GPU_FREE=
  FM_CAPACITY_PROBE_GPU_UTIL=
  fm_capacity_ssh_alias_ok "$host" || return 1
  if [ "${FM_CAPACITY_SKIP_REMOTE:-}" = 1 ]; then
    return 1
  fi
  out=$(fm_capacity_ssh_raw "$host" "$(fm_capacity_posix_probe_cmd)" 2>/dev/null) || out=
  if fm_capacity_absorb_probe_text "$out"; then
    return 0
  fi
  out=$(fm_capacity_ssh_raw "$host" "$(fm_capacity_windows_probe_cmd)" 2>/dev/null) || out=
  if fm_capacity_absorb_probe_text "$out"; then
    return 0
  fi
  return 1
}

fm_capacity_config_path() { # <config-dir>
  printf '%s/%s\n' "$1" "$FM_CAPACITY_CONFIG_FILE"
}

# Load preferred/fallback from flags/env/config into FM_CAPACITY_PREF_* and
# FM_CAPACITY_FALL_*. Each session pin merges over its own config-derived
# counterpart, so pinning one host never discards the other configured one; a
# pinned kind is validated exactly like a configured kind. Returns 1 for a
# rejected pin or a present but malformed config file.
# shellcheck disable=SC2034
fm_capacity_load_hosts() { # <config-dir>
  local config_dir=$1 path ssh kind json
  local pin_pref_ssh=${FM_CAPACITY_PREFERRED_SSH:-} pin_pref_kind=${FM_CAPACITY_PREFERRED_KIND:-}
  local pin_fall_ssh=${FM_CAPACITY_FALLBACK_SSH:-} pin_fall_kind=${FM_CAPACITY_FALLBACK_KIND:-}
  local cfg_pref_ssh='' cfg_pref_kind='' cfg_fall_ssh='' cfg_fall_kind=''
  FM_CAPACITY_PREF_SSH=
  FM_CAPACITY_PREF_KIND=gpu
  FM_CAPACITY_FALL_SSH=
  FM_CAPACITY_FALL_KIND=cpu
  FM_CAPACITY_CONFIG_ERROR=
  if [ -n "$pin_pref_ssh" ]; then
    fm_capacity_ssh_alias_ok "$pin_pref_ssh" || {
      FM_CAPACITY_CONFIG_ERROR="preferred SSH alias is not a safe host token"
      return 1
    }
  fi
  if [ -n "$pin_fall_ssh" ]; then
    fm_capacity_ssh_alias_ok "$pin_fall_ssh" || {
      FM_CAPACITY_CONFIG_ERROR="fallback SSH alias is not a safe host token"
      return 1
    }
  fi
  if [ -n "$pin_pref_kind" ]; then
    fm_capacity_kind_ok "$pin_pref_kind" || {
      FM_CAPACITY_CONFIG_ERROR="preferred kind must be gpu or cpu"
      return 1
    }
  fi
  if [ -n "$pin_fall_kind" ]; then
    fm_capacity_kind_ok "$pin_fall_kind" || {
      FM_CAPACITY_CONFIG_ERROR="fallback kind must be gpu or cpu"
      return 1
    }
  fi
  path=$(fm_capacity_config_path "$config_dir")
  # Both hosts pinned leaves the file nothing to contribute; any partial pin
  # still needs its configured counterpart.
  if { [ -z "$pin_pref_ssh" ] || [ -z "$pin_fall_ssh" ]; } && [ -e "$path" ]; then
    [ -f "$path" ] && [ ! -L "$path" ] || {
      FM_CAPACITY_CONFIG_ERROR="config/compute-hosts.json must be a regular file"
      return 1
    }
    command -v jq >/dev/null 2>&1 || {
      FM_CAPACITY_CONFIG_ERROR="jq is required to read config/compute-hosts.json"
      return 1
    }
    json=$(cat "$path") || {
      FM_CAPACITY_CONFIG_ERROR="could not read config/compute-hosts.json"
      return 1
    }
    printf '%s\n' "$json" | jq -e . >/dev/null 2>&1 || {
      FM_CAPACITY_CONFIG_ERROR="config/compute-hosts.json is not valid JSON"
      return 1
    }
    ssh=$(printf '%s\n' "$json" | jq -r '.preferred.ssh // empty')
    kind=$(printf '%s\n' "$json" | jq -r '.preferred.kind // "gpu"')
    if [ -n "$ssh" ]; then
      fm_capacity_ssh_alias_ok "$ssh" || {
        FM_CAPACITY_CONFIG_ERROR="preferred.ssh is not a safe host token"
        return 1
      }
      fm_capacity_kind_ok "$kind" || {
        FM_CAPACITY_CONFIG_ERROR="preferred.kind must be gpu or cpu"
        return 1
      }
      cfg_pref_ssh=$ssh
      cfg_pref_kind=$kind
    fi
    ssh=$(printf '%s\n' "$json" | jq -r '.fallback.ssh // empty')
    kind=$(printf '%s\n' "$json" | jq -r '.fallback.kind // "cpu"')
    if [ -n "$ssh" ]; then
      fm_capacity_ssh_alias_ok "$ssh" || {
        FM_CAPACITY_CONFIG_ERROR="fallback.ssh is not a safe host token"
        return 1
      }
      fm_capacity_kind_ok "$kind" || {
        FM_CAPACITY_CONFIG_ERROR="fallback.kind must be gpu or cpu"
        return 1
      }
      cfg_fall_ssh=$ssh
      cfg_fall_kind=$kind
    fi
  fi
  FM_CAPACITY_PREF_SSH=${pin_pref_ssh:-$cfg_pref_ssh}
  FM_CAPACITY_PREF_KIND=${pin_pref_kind:-${cfg_pref_kind:-gpu}}
  FM_CAPACITY_FALL_SSH=${pin_fall_ssh:-$cfg_fall_ssh}
  FM_CAPACITY_FALL_KIND=${pin_fall_kind:-${cfg_fall_kind:-cpu}}
  return 0
}

# Fill FM_CAPACITY_ROUTE* from a freshly loaded host pair. Probes live.
# shellcheck disable=SC2034
fm_capacity_route_hosts() {
  FM_CAPACITY_ROUTE=none
  FM_CAPACITY_ROUTE_HOST=
  FM_CAPACITY_ROUTE_REASON='no configured compute host was freshly reachable and suitable'
  FM_CAPACITY_PREF_REACHABLE=no
  FM_CAPACITY_PREF_SUITABLE=no
  FM_CAPACITY_FALL_REACHABLE=no
  FM_CAPACITY_FALL_SUITABLE=no
  if [ -n "${FM_CAPACITY_PREF_SSH:-}" ]; then
    if fm_capacity_probe_ssh "$FM_CAPACITY_PREF_SSH"; then
      FM_CAPACITY_PREF_REACHABLE=yes
      if fm_capacity_host_suitable "$FM_CAPACITY_PREF_KIND" \
        "$FM_CAPACITY_PROBE_NPROC" "$FM_CAPACITY_PROBE_MEM_MB" \
        "$FM_CAPACITY_PROBE_LOAD1" "$FM_CAPACITY_PROBE_GPU_FREE" \
        "$FM_CAPACITY_PROBE_GPU_UTIL"; then
        FM_CAPACITY_PREF_SUITABLE=yes
        FM_CAPACITY_ROUTE=preferred
        FM_CAPACITY_ROUTE_HOST=$FM_CAPACITY_PREF_SSH
        FM_CAPACITY_ROUTE_REASON='preferred host is reachable and suitable'
        return 0
      fi
    fi
  fi
  if [ -n "${FM_CAPACITY_FALL_SSH:-}" ]; then
    if fm_capacity_probe_ssh "$FM_CAPACITY_FALL_SSH"; then
      FM_CAPACITY_FALL_REACHABLE=yes
      if fm_capacity_host_suitable "$FM_CAPACITY_FALL_KIND" \
        "$FM_CAPACITY_PROBE_NPROC" "$FM_CAPACITY_PROBE_MEM_MB" \
        "$FM_CAPACITY_PROBE_LOAD1" "$FM_CAPACITY_PROBE_GPU_FREE" \
        "$FM_CAPACITY_PROBE_GPU_UTIL"; then
        FM_CAPACITY_FALL_SUITABLE=yes
        FM_CAPACITY_ROUTE=fallback
        FM_CAPACITY_ROUTE_HOST=$FM_CAPACITY_FALL_SSH
        FM_CAPACITY_ROUTE_REASON='preferred host was not usable; fallback is reachable and suitable'
        return 0
      fi
    fi
  fi
  if [ -z "${FM_CAPACITY_PREF_SSH:-}" ] && [ -z "${FM_CAPACITY_FALL_SSH:-}" ]; then
    FM_CAPACITY_ROUTE_REASON='no preferred or fallback compute host is configured'
  fi
  return 0
}

# Snapshot local measurements plus occupied/free into FM_CAPACITY_* vars.
# Occupancy is host-scoped: <home-dir> anchors the local-home set and defaults
# to FM_HOME.
fm_capacity_measure_local() { # <state-dir> [home-dir]
  FM_CAPACITY_LOCAL_NPROC=$(fm_capacity_read_nproc)
  FM_CAPACITY_LOCAL_MEM_MB=$(fm_capacity_read_mem_avail_mb)
  FM_CAPACITY_LOCAL_LOAD1=$(fm_capacity_read_load1)
  fm_capacity_is_uint "$FM_CAPACITY_LOCAL_NPROC" || FM_CAPACITY_LOCAL_NPROC=1
  fm_capacity_is_number "$FM_CAPACITY_LOCAL_LOAD1" || FM_CAPACITY_LOCAL_LOAD1=0
  FM_CAPACITY_SLOTS=$(fm_capacity_slots_from_local \
    "$FM_CAPACITY_LOCAL_NPROC" "$FM_CAPACITY_LOCAL_MEM_MB" "$FM_CAPACITY_LOCAL_LOAD1")
  fm_capacity_measure_host_occupancy "$1" "${2:-${FM_HOME:-}}"
  FM_CAPACITY_FREE=$((FM_CAPACITY_SLOTS - FM_CAPACITY_OCCUPIED))
  [ "$FM_CAPACITY_FREE" -ge 0 ] || FM_CAPACITY_FREE=0
}

# Allow a fresh independent worker. Relaunch and secondmate skip the slot
# budget. Never interrupts another task. Prints nothing on allow; one error
# line on refuse.
fm_capacity_allow_new_worker() { # <state-dir> <task-id> <kind> <relaunch> [home-dir]
  local state=$1 id=$2 kind=$3 relaunch=$4 home=${5:-${FM_HOME:-}}
  [ "$relaunch" != 1 ] || return 0
  [ "$kind" != secondmate ] || return 0
  fm_capacity_measure_local "$state" "$home"
  if fm_capacity_task_occupies_slot "$state" "$id"; then
    printf 'error: capacity: task %s already has a worker; sequential replacement uses relaunch, never a second concurrent worker\n' "$id" >&2
    return 1
  fi
  if [ "$FM_CAPACITY_FREE" -ge 1 ]; then
    return 0
  fi
  if [ "$FM_CAPACITY_SLOTS" -eq 0 ]; then
    printf 'error: capacity: supervisor host is at measured capacity (slots=0 occupied=%s homes_scanned=%s nproc=%s load1=%s mem_avail_mb=%s); refusing a new independent worker rather than overloading this host\n' \
      "$FM_CAPACITY_OCCUPIED" "$FM_CAPACITY_HOMES_SCANNED" "$FM_CAPACITY_LOCAL_NPROC" "$FM_CAPACITY_LOCAL_LOAD1" "${FM_CAPACITY_LOCAL_MEM_MB:-unknown}" >&2
    return 1
  fi
  printf 'error: capacity: no free worker slot (occupied=%s slots=%s homes_scanned=%s); independent work waits until a live worker on this host finishes; running workers were left running\n' \
    "$FM_CAPACITY_OCCUPIED" "$FM_CAPACITY_SLOTS" "$FM_CAPACITY_HOMES_SCANNED" >&2
  return 1
}
