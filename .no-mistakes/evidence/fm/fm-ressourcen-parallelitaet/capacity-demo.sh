#!/usr/bin/env bash
# End-to-end walkthrough of the captain's compute policy through the real
# bin/fm-capacity.sh CLI. Only the outside world is simulated: `ssh` answers
# for the two remote hosts, `tmux` answers which worker panes are live, and the
# documented FM_CAPACITY_* overrides stand in for this host's /proc readings.
set -u
ROOT=${1:?repo root}
DEMO_ROOT=$(mktemp -d /tmp/fm-capacity-demo.XXXXXX)
trap 'rm -rf "$DEMO_ROOT"' EXIT

HOME_DIR="$DEMO_ROOT/hetzner-home"
FAKEBIN="$DEMO_ROOT/bin"
mkdir -p "$HOME_DIR"/{state,config,data,projects/demo} "$FAKEBIN" "$DEMO_ROOT"/{ssh,tmux}

cat > "$FAKEBIN/ssh" <<'SH'
#!/usr/bin/env bash
set -u
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) shift 2 ;;
    -*) shift ;;
    *) break ;;
  esac
done
host=${1:-}
if [ -f "$FM_FAKE_SSH_DIR/$host" ]; then cat "$FM_FAKE_SSH_DIR/$host"; exit 0; fi
printf 'ssh: connect to host %s port 22: No route to host\n' "$host" >&2
exit 255
SH
cat > "$FAKEBIN/tmux" <<'SH'
#!/usr/bin/env bash
set -u
cmd=${1:-}; shift || true
session=; fmt=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -p) shift ;;
    -t) session=${2%%:*}; shift 2 ;;
    -F) shift 2 ;;
    *) fmt=$1; shift ;;
  esac
done
case "$cmd" in
  list-windows)
    [ -f "$FM_FAKE_TMUX_DIR/$session" ] && { cat "$FM_FAKE_TMUX_DIR/$session"; exit 0; }
    printf "can't find session: %s\n" "$session" >&2; exit 1 ;;
  display-message) [ "$fmt" = '#{pane_current_command}' ] && printf 'claude\n'; exit 0 ;;
esac
exit 1
SH
chmod +x "$FAKEBIN/ssh" "$FAKEBIN/tmux"

printf '%s\n' '{"preferred":{"ssh":"Valentino","kind":"gpu"},"fallback":{"ssh":"Valentino-Arbeit","kind":"cpu"}}' \
  > "$HOME_DIR/config/compute-hosts.json"

worker() { # <id> - a ship worker record
  printf 'window=firstmate:fm-%s\nendpoint_task_id=%s\nkind=ship\nharness=echo\n' "$1" "$1" \
    > "$HOME_DIR/state/$1.meta"
}
live() { : > "$DEMO_ROOT/tmux/firstmate"; for i in "$@"; do printf 'fm-%s\n' "$i" >> "$DEMO_ROOT/tmux/firstmate"; done; }

heim_pc() { cat > "$DEMO_ROOT/ssh/Valentino"; }
heim_pc_off() { rm -f "$DEMO_ROOT/ssh/Valentino"; }
arbeits_pc() { cat > "$DEMO_ROOT/ssh/Valentino-Arbeit"; }

cap() { # <cmd...> - run the real CLI as the firstmate would
  printf '\n$ fm-capacity.sh %s\n' "$*"
  PATH="$FAKEBIN:$PATH" \
  FM_FAKE_SSH_DIR="$DEMO_ROOT/ssh" FM_FAKE_TMUX_DIR="$DEMO_ROOT/tmux" \
  FM_HOME="$HOME_DIR" FM_ROOT_OVERRIDE="" FM_STATE_OVERRIDE="" FM_CONFIG_OVERRIDE="" \
  FM_CAPACITY_NPROC="$SUP_NPROC" FM_CAPACITY_MEM_AVAIL_MB="$SUP_MEM" FM_CAPACITY_LOAD1="$SUP_LOAD" \
  FM_CAPACITY_SKIP_REMOTE="$SKIP_REMOTE" \
    "$ROOT/bin/fm-capacity.sh" "$@" 2>&1
  printf '[exit %s]\n' "$?"
}
scene() { printf '\n\n==================================================================\n%s\n==================================================================\n' "$*"; }

# The Hetzner supervisor as measured right now: 16 vCPU, ~13 GiB available, quiet.
SUP_NPROC=16; SUP_MEM=13312; SUP_LOAD=2.0; SKIP_REMOTE=1

scene 'SZENE 1 - Hetzner-Server allein, keine Worker: was traegt der Host?'
echo 'Vorgabe: der Hetzner-Server allein hoechstens drei Dauer-Worker.'
cap slots

scene 'SZENE 2 - Drei Dauer-Worker laufen: der vierte wird abgewiesen'
worker jarvis-zentrale-kapazitaet; worker fm-ressourcen; worker backlog-pflege
live jarvis-zentrale-kapazitaet fm-ressourcen backlog-pflege
cap slots
echo
echo '-> ein vierter unabhaengiger Worker will starten:'
cap spawn-gate --task-id neue-aufgabe
echo '-> und dieselbe Aufgabe ein zweites Mal (Beweis je Worker: eine Task-ID, ein Worker):'
cap spawn-gate --task-id jarvis-zentrale-kapazitaet
echo
echo '-> die drei laufenden Worker wurden nicht angefasst:'
cat "$DEMO_ROOT/tmux/firstmate"

scene 'SZENE 3 - Freitag 21:00, Heim-PC (RTX 4080 Super) ist erreichbar'
SKIP_REMOTE=
heim_pc <<'OUT'
FM_CAP nproc=24
FM_CAP mem_avail_mb=32000
FM_CAP gpu=15360,7
FM_CAP load_pct=11
FM_CAP load_pct=14
FM_CAP load_pct=9
OUT
arbeits_pc <<'OUT'
FM_CAP nproc=16
FM_CAP mem_avail_mb=16000
FM_CAP load1=1.0
FM_CAP gpu=
OUT
echo 'Erreichbarkeit UND Last werden frisch geprueft, nichts wird zwischengespeichert.'
cap route
echo
echo '-> zusammen also: 3 lokale Dauer-Worker + rechenlastige Arbeit auf dem Heim-PC.'

scene 'SZENE 4 - kurzer Lastausschlag auf dem Heim-PC kippt die Praeferenz nicht'
heim_pc <<'OUT'
FM_CAP nproc=24
FM_CAP mem_avail_mb=32000
FM_CAP gpu=15360,7
FM_CAP load_pct=12
FM_CAP load_pct=8
FM_CAP load_pct=100
OUT
cap route

scene 'SZENE 5 - der Kapitaen spielt: Heim-PC dauerhaft am Anschlag -> Arbeits-PC'
heim_pc <<'OUT'
FM_CAP nproc=24
FM_CAP mem_avail_mb=32000
FM_CAP gpu=15360,7
FM_CAP load_pct=100
FM_CAP load_pct=100
FM_CAP load_pct=99
OUT
cap route

scene 'SZENE 6 - Heim-PC ist aus: Rueckfall auf den Arbeits-PC'
heim_pc_off
cap route

scene 'SZENE 7 - Heim-PC aus UND Kapitaen sitzt am Arbeits-PC: kein Ausweichen auf den Server'
arbeits_pc <<'OUT'
FM_CAP nproc=16
FM_CAP mem_avail_mb=1200
FM_CAP load1=15.0
FM_CAP gpu=
OUT
cap route
echo
echo '-> route=none: rechenlastige Arbeit wird NICHT auf den Hetzner-Server geschoben.'
echo '   Es bleibt beim gemessenen lokalen Budget von hoechstens drei Workern.'

scene 'SZENE 8 - der Server kann seine eigene Last nicht lesen: fail closed'
SUP_LOAD=unavailable; SKIP_REMOTE=1
cap slots
cap spawn-gate --task-id neue-aufgabe
echo '-> die gescheiterte Messung bleibt sichtbar (load1=unavailable), nicht ein erfundenes 0.'
echo '   Kein Start auf einem ungemessenen Host.'

scene 'SZENE 9 - der echte Spawn-Befehl: der vierte Worker startet gar nicht erst'
SUP_LOAD=2.0
mkdir -p "$HOME_DIR/data/neue-aufgabe"
printf 'Delivery contract: mode=no-mistakes\n' > "$HOME_DIR/data/neue-aufgabe/brief.md"
echo '(FM_GATE_REFUSE_BYPASS=1 wie in der Testbibliothek: nur die "kein Spawn aus einem no-mistakes-Gate"-Sperre'
echo ' wird umgangen, damit der Kapazitaets-Gate ueberhaupt erreicht wird.)'
printf '\n$ fm-spawn.sh neue-aufgabe projects/demo --mode no-mistakes --yolo off\n'
PATH="$FAKEBIN:$PATH" FM_FAKE_TMUX_DIR="$DEMO_ROOT/tmux" \
FM_HOME="$HOME_DIR" FM_ROOT_OVERRIDE="" \
FM_CAPACITY_NPROC="$SUP_NPROC" FM_CAPACITY_MEM_AVAIL_MB="$SUP_MEM" FM_CAPACITY_LOAD1="$SUP_LOAD" \
FM_SPAWN_NO_GUARD=1 FM_BACKEND=tmux FM_GATE_REFUSE_BYPASS=1 \
  "$ROOT/bin/fm-spawn.sh" neue-aufgabe projects/demo --mode no-mistakes --yolo off 2>&1
printf '[exit %s]\n' "$?"
echo
echo '-> die drei laufenden Worker laufen weiter, es wurde keiner angefasst:'
cat "$DEMO_ROOT/tmux/firstmate"
