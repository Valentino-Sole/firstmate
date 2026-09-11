#!/usr/bin/env bash
# Probe the effective model for a task from runtime/session metadata only.
# Prints: model=<id-or-empty> source=<probe-source>
# Exits 0 when a candidate was read (even if not exact); 1 when nothing found.
#
# OpenCode evidence is a read-only query of OPENCODE_DB, or else
# ${XDG_DATA_HOME:-$HOME/.local/share}/opencode/opencode.db.
# Table session only IDENTIFIES the run's session: it matches meta worktree= to
# session.directory exactly, keeps only rows the CURRENT run could have created
# (parent_id IS NULL, so a subagent's child session can never stand in for the
# worker, and time_created at or after the run's spawn_epoch, so a previous
# run's leftover session in the same reused worktree can never be reported as
# this run's model), and takes only the uniquely newest surviving row.
# The MODEL itself comes from that session's newest assistant message in table
# message, composed providerID/modelID. session.model is deliberately not read:
# OpenCode fills it from the --model launch flag before the agent has answered
# anything, so reporting it would be requested_model laundered through the
# database rather than runtime evidence. A session that has not yet produced an
# assistant message therefore stays pending.
# It never writes that database and never treats requested_model as runtime
# evidence. Missing, unreadable, invalid, or ambiguous rows yield no candidate.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=bin/fm-backend.sh
. "$SCRIPT_DIR/fm-backend.sh"
# shellcheck source=bin/fm-model-lib.sh
. "$SCRIPT_DIR/fm-model-lib.sh"

usage() {
  cat >&2 <<'EOF'
usage: fm-model-probe.sh <state-dir> <task-id> [herdr-pane-id]
EOF
  exit 2
}

STATE=${1:-}
ID=${2:-}
PANE=${3:-}
[ -n "$STATE" ] && [ -n "$ID" ] || usage
META="$STATE/$ID.meta"
[ -f "$META" ] || { echo "error: no meta for $ID" >&2; exit 1; }

[ -z "$PANE" ] && PANE=$(fm_model_meta_get "$META" herdr_pane_id)

probe_claude_jsonl() {  # <session-id>
  local sid=$1 file model
  [ -n "$sid" ] || return 1
  file=$(find "${HOME:-/home/vsole}/.claude/projects" -name "${sid}.jsonl" 2>/dev/null | head -1)
  [ -n "$file" ] && [ -f "$file" ] || return 1
  model=$(python3 - "$file" <<'PY'
import json, sys
path = sys.argv[1]
last = ""
with open(path, "r", encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        msg = obj.get("message")
        if isinstance(msg, dict) and msg.get("role") == "assistant":
            m = msg.get("model")
            if isinstance(m, str) and m:
                last = m
        elif obj.get("type") == "assistant":
            msg = obj.get("message") or obj
            if isinstance(msg, dict):
                m = msg.get("model")
                if isinstance(m, str) and m:
                    last = m
print(last)
PY
) || return 1
  [ -n "$model" ] || return 1
  printf 'model=%s\nsource=claude-transcript\n' "$model"
  return 0
}

probe_pi_jsonl() {  # <session-path>
  local path=$1 model
  [ -n "$path" ] && [ -f "$path" ] || return 1
  model=$(python3 - "$path" <<'PY'
import json, sys
path = sys.argv[1]
last = ""
provider = ""
with open(path, "r", encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        msg = obj.get("message")
        if not isinstance(msg, dict) or msg.get("role") != "assistant":
            continue
        m = msg.get("model")
        p = msg.get("provider")
        if isinstance(p, str) and p:
            provider = p
        if isinstance(m, str) and m:
            if "/" in m:
                last = m
            elif provider and "/" not in m and "-" not in m:
                last = f"{provider}/{m}"
            else:
                last = m
print(last)
PY
) || return 1
  [ -n "$model" ] || return 1
  printf 'model=%s\nsource=pi-transcript\n' "$model"
  return 0
}

probe_herdr_agent_session() {
  local pane_json kind value
  [ -n "$PANE" ] || return 1
  command -v herdr >/dev/null 2>&1 || return 1
  pane_json=$(herdr pane get "$PANE" 2>/dev/null) || return 1
  kind=$(printf '%s' "$pane_json" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('result',{}).get('pane',{}) or {}).get('agent_session',{}).get('kind',''))" 2>/dev/null) || return 1
  value=$(printf '%s' "$pane_json" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('result',{}).get('pane',{}) or {}).get('agent_session',{}).get('value',''))" 2>/dev/null) || return 1
  [ -n "$value" ] || return 1
  case "$kind" in
    id) probe_claude_jsonl "$value" ;;
    path) probe_pi_jsonl "$value" ;;
    *) return 1 ;;
  esac
}

probe_opencode_session() {
  local harness worktree spawn_epoch db model
  harness=$(fm_model_meta_get "$META" harness)
  [ "$harness" = opencode ] || return 1
  worktree=$(fm_model_meta_get "$META" worktree)
  [ -n "$worktree" ] || return 1
  spawn_epoch=$(fm_model_meta_get "$META" spawn_epoch)
  case "$spawn_epoch" in
    ''|*[!0-9]*) return 1 ;;
  esac
  if [ -n "${OPENCODE_DB:-}" ]; then
    db=$OPENCODE_DB
  else
    db="${XDG_DATA_HOME:-${HOME:-/home/vsole}/.local/share}/opencode/opencode.db"
  fi
  [ -f "$db" ] || return 1
  [ -r "$db" ] || return 1
  model=$(python3 - "$db" "$worktree" "$spawn_epoch" <<'PY'
import json
import os
import sqlite3
import sys

db = sys.argv[1]
directory = sys.argv[2]
try:
    run_start_ms = int(sys.argv[3]) * 1000
except ValueError:
    sys.exit(1)
if not os.path.isfile(db) or not os.access(db, os.R_OK):
    sys.exit(1)
try:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=1.0)
except sqlite3.Error:
    sys.exit(1)
provider = ""
model_id = ""
try:
    sessions = con.execute(
        "SELECT id, time_updated FROM session "
        "WHERE directory = ? AND parent_id IS NULL AND time_created >= ? "
        "ORDER BY time_updated DESC",
        (directory, run_start_ms),
    ).fetchall()
    if not sessions:
        sys.exit(1)
    if len(sessions) >= 2 and sessions[0][1] == sessions[1][1]:
        sys.exit(1)
    turns = con.execute(
        "SELECT data FROM message WHERE session_id = ? "
        "ORDER BY time_created DESC, id DESC",
        (sessions[0][0],),
    )
    for (raw,) in turns:
        try:
            obj = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(obj, dict) or obj.get("role") != "assistant":
            continue
        p = obj.get("providerID")
        m = obj.get("modelID")
        if isinstance(p, str) and isinstance(m, str):
            provider = p.strip()
            model_id = m.strip()
        break
except sqlite3.Error:
    sys.exit(1)
finally:
    con.close()
if not provider or not model_id:
    sys.exit(1)
print(f"{provider}/{model_id}")
PY
) || return 1
  [ -n "$model" ] || return 1
  printf 'model=%s\nsource=opencode-session\n' "$model"
  return 0
}

if probe_herdr_agent_session; then
  exit 0
fi

if probe_opencode_session; then
  exit 0
fi

exit 1
