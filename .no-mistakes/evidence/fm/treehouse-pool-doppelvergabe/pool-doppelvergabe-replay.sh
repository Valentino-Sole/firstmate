#!/usr/bin/env bash
# Replay of the 2026-09-03 treehouse pool double-assignment, end to end.
#
# Shape of the incident: the parked, needs-decision task
# "firstmate-fork-main-upstream-sync" still holds pool copy 3
# (vs-agent-workspace-8bf1b0/3) per its state/<id>.meta. Copies 1,2,7,8,9 sit
# free. A second spawn - fm-spawn-override-reset - runs `treehouse get` and the
# pool hands it copy 3 anyway.
#
# Run once against the pre-fix fm-spawn.sh and once against the fixed one, and
# print what an operator would actually see: the spawn's own output, firstmate's
# task records afterwards, and the state of the parked task's checkout.
set -u

ROOT=$1                # firstmate worktree (source of bin/fm-spawn.sh)
SPAWN=$2               # spawn script to exercise
LABEL=$3
SCENARIO=${4:-evade}   # evade | exhausted
WORK=$(mktemp -d "${TMPDIR:-/tmp}/pool-replay.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

HOME_DIR=$WORK/home
PROJ=$WORK/vs-agent-workspace
POOL=$WORK/vs-agent-workspace-8bf1b0
PARKED=firstmate-fork-main-upstream-sync
NEWTASK=fm-spawn-override-reset

mkdir -p "$HOME_DIR"/{data,projects,state,config} "$POOL"
printf 'codex\n' > "$HOME_DIR/config/crew-harness"
touch "$HOME_DIR/state/.last-watcher-beat"

git_q() { git -c user.name='Fleet' -c user.email='fleet@example.invalid' "$@"; }

mkdir -p "$PROJ"
git -C "$PROJ" init -q
printf '# vs-agent-workspace\n' > "$PROJ/README.md"
git -C "$PROJ" add README.md
git_q -C "$PROJ" commit -qm 'initial'
git clone --quiet --bare "$PROJ" "$PROJ.origin.git"
git -C "$PROJ" remote add origin "file://$(cd "$PROJ.origin.git" && pwd)"

# The six pool copies from the incident report: 3 is occupied, the rest free.
for n in 1 2 3 7 8 9; do
  git -C "$PROJ" worktree add --quiet --detach "$POOL/$n"
done

# Copy 3 carries the parked task's branch and its committed work.
git -C "$POOL/3" checkout -q -b "fm/$PARKED"
printf 'upstream sync work, committed and parked\n' > "$POOL/3/sync-notes.md"
git -C "$POOL/3" add sync-notes.md
git_q -C "$POOL/3" commit -qm 'parked upstream sync work'
PARKED_HEAD_BEFORE=$(git -C "$POOL/3" rev-parse HEAD)

# firstmate's record: copy 3 is assigned to the parked task, which is still live.
cat > "$HOME_DIR/state/$PARKED.meta" <<EOF
kind=ship
project=$PROJ
worktree=$POOL/3
window=firstmate:fm-$PARKED
harness=codex
backend=tmux
EOF
printf 'needs-decision: warte auf Entscheidung des Captains\n' > "$HOME_DIR/state/$PARKED.status"

mkdir -p "$HOME_DIR/data/$NEWTASK"
cat > "$HOME_DIR/data/$NEWTASK/brief.md" <<'EOF'
# Task
## Captain's intent
Override-Reset nachziehen.

## Firstmate spec
Nicht in eine belegte Kopie starten.
EOF

# Fake terminal: `treehouse get` hands out copy 3 first; the pane only moves to a
# free copy (7) once this spawn refuses 3 and asks again.
FAKEBIN=$WORK/fakebin
mkdir -p "$FAKEBIN"
cat > "$FAKEBIN/tmux" <<'SH'
#!/usr/bin/env bash
set -u
case "$*" in
  *"#{pane_current_path}"*)
    c="${FM_FAKE_PANE_COUNTFILE:?}"; n=0; [ -f "$c" ] && n=$(cat "$c")
    n=$((n+1)); printf '%s\n' "$n" > "$c"
    line=$(printf '%s\n' "${FM_FAKE_PANE_SEQUENCE:-}" | sed -n "${n}p")
    [ -n "$line" ] || line=$(printf '%s\n' "${FM_FAKE_PANE_SEQUENCE:-}" | tail -n 1)
    printf '%s\n' "$line"; exit 0 ;;
esac
case "${1:-}" in display-message) printf 'firstmate\n' ;; esac
exit 0
SH
chmod +x "$FAKEBIN/tmux"
printf '#!/usr/bin/env bash\nexit 0\n' > "$FAKEBIN/treehouse"
chmod +x "$FAKEBIN/treehouse"

if [ "$SCENARIO" = exhausted ]; then
  # The pool has nothing else to give: `treehouse get` reports itself exhausted
  # and leaves the shell standing in copy 3.
  SEQ="$POOL/3"
  HANDOUT="copy 3 is the only copy the pool ever offers"
else
  SEQ="$POOL/3
$POOL/3
$POOL/3
$POOL/3
$POOL/7
$POOL/7"
  HANDOUT="treehouse hands it copy 3; copies 1,2,7,8,9 are free"
fi

echo "================================================================"
echo "  $LABEL"
echo "================================================================"
echo "pool copies:        1 2 3 7 8 9   (only copy 3 is recorded to a task)"
echo "copy 3 recorded to: $PARKED  (live, parked, needs-decision)"
echo "second spawn:       $NEWTASK  -- $HANDOUT"
echo
echo "--- what the operator sees from fm-spawn.sh -------------------"
set +e
FM_ROOT_OVERRIDE='' FM_HOME="$HOME_DIR" \
  FM_STATE_OVERRIDE="$HOME_DIR/state" FM_DATA_OVERRIDE="$HOME_DIR/data" \
  FM_PROJECTS_OVERRIDE="$HOME_DIR/projects" FM_CONFIG_OVERRIDE="$HOME_DIR/config" \
  FM_SPAWN_NO_GUARD=1 FM_GATE_REFUSE_BYPASS=1 TMUX="fake,1,0" FM_SPAWN_POOL_SETTLE_POLLS=6 \
  FM_FAKE_PANE_SEQUENCE="$SEQ" FM_FAKE_PANE_COUNTFILE="$WORK/panecount" \
  PATH="$FAKEBIN:$PATH" \
  "$SPAWN" "$NEWTASK" "$PROJ" --mode no-mistakes --yolo off 2>&1 |
  sed 's/^/  /'
rc=${PIPESTATUS[0]}
set -e
echo "  [exit status: $rc]"
echo
echo "--- firstmate's task records afterwards -----------------------"
for m in "$HOME_DIR"/state/*.meta; do
  [ -f "$m" ] || continue
  printf '  %-42s -> %s\n' "$(basename "$m")" \
    "$(sed -n 's/^worktree=//p' "$m" | sed "s#$POOL#<pool>#")"
done
echo
echo "--- the parked task's checkout (pool copy 3) ------------------"
echo "  branch now: $(git -C "$POOL/3" rev-parse --abbrev-ref HEAD 2>/dev/null)"
echo "  HEAD  now:  $(git -C "$POOL/3" log -1 --format='%h %s' 2>/dev/null)"
if [ "$(git -C "$POOL/3" rev-parse HEAD 2>/dev/null)" = "$PARKED_HEAD_BEFORE" ]; then
  echo "  its committed work: INTACT"
else
  echo "  its committed work: LOST from the checkout (was ${PARKED_HEAD_BEFORE:0:7} 'parked upstream sync work')"
fi
echo
