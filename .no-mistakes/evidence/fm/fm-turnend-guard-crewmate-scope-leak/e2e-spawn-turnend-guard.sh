#!/usr/bin/env bash
# End-to-end reproduction of the captain's acceptance test:
#   spawn a real crewmate out of a firstmate primary home, then run
#   bin/fm-turnend-guard.sh inside the spawned child worktree exactly the way the
#   crewmate's Stop hook does - with the parent primary's FM_ROOT_OVERRIDE and
#   FM_HOME still in the environment (the leak) - and show whether the turn ends
#   normally (no-op) or wedges with TURN WOULD END BLIND.
#
# Usage: e2e-spawn-guard.sh <firstmate-source-checkout> <label>
set -u
SRC=$1
LABEL=$2
WORK=$(mktemp -d "/tmp/fm-e2e-$LABEL-XXXXXX")
ID="crew-guard-$LABEL"
# Run entirely outside the caller's checkout: fm-spawn.sh refuses to drive a
# fleet from inside a no-mistakes gate worktree, and cwd is one here.
cd "$WORK" || exit 1

echo "=============================================================="
echo "== firstmate source: $LABEL"
echo "== commit: $(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo n/a)"
echo "=============================================================="

# --- 1. a real firstmate PRIMARY home: plain (non-worktree) clone ------------
PRIMARY="$WORK/firstmate-primary"
git -c init.defaultBranch=main clone -q "$SRC" "$PRIMARY"
mkdir -p "$PRIMARY/state" "$PRIMARY/data" "$PRIMARY/projects" "$PRIMARY/config" "$WORK/user-home"
touch "$PRIMARY/state/.last-watcher-beat"
mkdir -p "$PRIMARY/data/$ID"
cat > "$PRIMARY/data/$ID/brief.md" <<EOF
# Task
## Captain's intent
Reproduce the crewmate turn-end guard scope leak end to end.

## Firstmate spec
Delivery contract: mode=local-only
Run the turn-end guard in the spawned worktree.
EOF

# --- 2. the crewmate's isolated task worktree (a real linked git worktree,
#        the same shape `treehouse get` hands a crewmate working on firstmate) -
WT="$WORK/crew-worktree"
git -C "$PRIMARY" worktree add --quiet -b "fm/$ID" "$WT"

# --- 3. fake terminal backend: real tmux is not scriptable here, so the stub
#        answers the same queries and RECORDS the launch command verbatim ------
FAKEBIN="$WORK/fakebin"; mkdir -p "$FAKEBIN"
cat > "$FAKEBIN/tmux" <<'SH'
#!/usr/bin/env bash
set -u
case "$*" in
  *"#{pane_current_path}"*) printf '%s\n' "${FM_FAKE_PANE_PATH:-}"; exit 0 ;;
esac
case "${1:-}" in
  display-message) printf 'firstmate\n'; exit 0 ;;
  list-windows) exit 0 ;;
  has-session|new-session|new-window|kill-window|set-window-option) exit 0 ;;
  send-keys)
    prev=
    for a in "$@"; do
      [ "$prev" = "-l" ] && printf '%s\n' "$a" >> "${FM_FAKE_LAUNCH_LOG:?}"
      prev=$a
    done
    exit 0 ;;
esac
exit 0
SH
chmod +x "$FAKEBIN/tmux"
for t in treehouse gh gh-axi; do printf '#!/usr/bin/env bash\nexit 0\n' > "$FAKEBIN/$t"; chmod +x "$FAKEBIN/$t"; done
# The "crewmate harness": stands in for the agent CLI the spawn launches. It
# runs the child worktree's OWN turn-end guard the way the Stop hook does.
cat > "$FAKEBIN/fm-e2e-crew-harness" <<'SH'
#!/usr/bin/env bash
set -u
echo "[crewmate] launched by fm-spawn.sh"
echo "[crewmate] cwd            : $PWD"
echo "[crewmate] FM_ROOT_OVERRIDE=${FM_ROOT_OVERRIDE-<unset>}"
echo "[crewmate] FM_HOME         =${FM_HOME-<unset>}"
echo "[crewmate] turn ends -> Stop hook runs bin/fm-turnend-guard.sh"
out=$(printf '{"stop_hook_active":false}' | CLAUDECODE=1 bash "$PWD/bin/fm-turnend-guard.sh" 2>&1); rc=$?
echo "[crewmate] guard exit status: $rc"
if [ -n "$out" ]; then
  echo "[crewmate] guard output:"
  printf '%s\n' "$out" | sed 's/^/    | /'
else
  echo "[crewmate] guard output: <none>"
fi
if [ "$rc" -eq 0 ] && [ -z "$out" ]; then
  echo "[crewmate] RESULT: turn ended normally (guard was a NO-OP)"
else
  echo "[crewmate] RESULT: TURN WEDGED - crewmate cannot end its turn"
fi
exit "$rc"
SH
chmod +x "$FAKEBIN/fm-e2e-crew-harness"

LAUNCH_LOG="$WORK/launch.log"; : > "$LAUNCH_LOG"

# --- 4. the real spawn -------------------------------------------------------
echo
echo "--- bin/fm-spawn.sh $ID (crewmate, project = this firstmate home) -------"
FM_ROOT_OVERRIDE='' FM_HOME="$PRIMARY" HOME="$WORK/user-home" CLAUDE_CONFIG_DIR='' \
  FM_STATE_OVERRIDE="$PRIMARY/state" FM_DATA_OVERRIDE="$PRIMARY/data" \
  FM_PROJECTS_OVERRIDE="$PRIMARY/projects" FM_CONFIG_OVERRIDE="$PRIMARY/config" \
  FM_SPAWN_NO_GUARD=1 TMUX="fake,1,0" FM_FAKE_PANE_PATH="$WT" \
  FM_FAKE_LAUNCH_LOG="$LAUNCH_LOG" PATH="$FAKEBIN:$PATH" \
  env -u NO_MISTAKES_GATE bash "$PRIMARY/bin/fm-spawn.sh" "$ID" "$PRIMARY" --mode local-only --yolo off \
  'fm-e2e-crew-harness --start' 2>&1 | sed 's/^/    /'

echo
echo "--- state/$ID.meta recorded by the spawn --------------------------------"
sed 's/^/    /' "$PRIMARY/state/$ID.meta" 2>/dev/null || echo "    <missing>"

echo
echo "--- launch command tmux received ----------------------------------------"
sed 's/^/    /' "$LAUNCH_LOG"

# --- 5. the parent primary now has real in-flight work and no live watcher ---
rm -f "$PRIMARY/state/.last-watcher-beat" "$PRIMARY/state/.watcher.lock"
echo
echo "--- parent primary is now unsupervised (its own turn WOULD block) -------"
pout=$(printf '{"stop_hook_active":false}' | CLAUDECODE=1 FM_ROOT_OVERRIDE="$PRIMARY" FM_HOME="$PRIMARY" \
  env -u NO_MISTAKES_GATE bash "$PRIMARY/bin/fm-turnend-guard.sh" 2>&1); prc=$?
echo "    primary guard exit status: $prc"
printf '%s\n' "$pout" | head -3 | sed 's/^/    | /'

# --- 6. the crewmate turn: launch command executed in the child worktree with
#        the parent primary's environment INHERITED (the reported leak) -------
echo
echo "--- crewmate turn in $WT"
echo "--- (launched with the parent primary's FM_ROOT_OVERRIDE/FM_HOME inherited)"
LAUNCH_CMD=$(grep -m1 'fm-e2e-crew-harness' "$LAUNCH_LOG" || echo 'fm-e2e-crew-harness --start')
( cd "$WT" && env -u NO_MISTAKES_GATE FM_ROOT_OVERRIDE="$PRIMARY" FM_HOME="$PRIMARY" \
    FM_STATE_OVERRIDE="$PRIMARY/state" FM_CONFIG_OVERRIDE="$PRIMARY/config" \
    HOME="$WORK/user-home" PATH="$FAKEBIN:$PATH" \
    bash -c "$LAUNCH_CMD" ) 2>&1 | sed 's/^/    /'
crc=${PIPESTATUS[0]}
echo
echo "== $LABEL: crewmate turn-end guard exit status $crc"
echo

# --- 7. secondmate leg: a REAL secondmate home seeded by bin/fm-home-seed.sh,
#        then its own turn-end guard run with the parent primary's environment
#        still in place. Its home is idle; only the parent has in-flight work. --
SM="$WORK/secondmate-home"
echo "--- bin/fm-home-seed.sh sm-$LABEL (real secondmate home) -----------------"
FM_ROOT_OVERRIDE='' FM_HOME="$PRIMARY" HOME="$WORK/user-home" \
  FM_STATE_OVERRIDE="$PRIMARY/state" FM_DATA_OVERRIDE="$PRIMARY/data" \
  FM_PROJECTS_OVERRIDE="$PRIMARY/projects" FM_CONFIG_OVERRIDE="$PRIMARY/config" \
  FM_SECONDMATE_CHARTER='Own the turn-end guard scope investigation.' \
  FM_SECONDMATE_SCOPE='turn-end guard scope' PATH="$FAKEBIN:$PATH" \
  env -u NO_MISTAKES_GATE bash "$PRIMARY/bin/fm-home-seed.sh" "sm-$LABEL" "$SM" --no-projects 2>&1 \
  | sed 's/^/    /'
echo "    marker: $( [ -f "$SM/.fm-secondmate-home" ] && echo '.fm-secondmate-home present' || echo 'MISSING' )"
echo "    secondmate state dir: $(ls "$SM/state" 2>/dev/null | tr '\n' ' ')(empty = nothing in flight)"

echo
echo "--- secondmate turn end, parent primary's FM_ROOT_OVERRIDE/FM_HOME inherited"
sout=$(printf '{"stop_hook_active":false}' | CLAUDECODE=1 \
  env -u NO_MISTAKES_GATE FM_ROOT_OVERRIDE="$PRIMARY" FM_HOME="$PRIMARY" \
  FM_STATE_OVERRIDE="$PRIMARY/state" FM_CONFIG_OVERRIDE="$PRIMARY/config" \
  bash "$SM/bin/fm-turnend-guard.sh" 2>&1); src=$?
echo "    guard exit status: $src"
if [ -n "$sout" ]; then
  printf '%s\n' "$sout" | head -4 | sed 's/^/    | /'
  echo "    RESULT: TURN WEDGED by the PARENT's in-flight work"
else
  echo "    guard output: <none>"
  echo "    RESULT: turn ended normally (guard was a NO-OP on its own idle home)"
fi
echo
echo "== $LABEL: secondmate turn-end guard exit status $src"
echo
