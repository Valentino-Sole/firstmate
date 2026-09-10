#!/usr/bin/env bash
# Probe the effective model for a task from runtime/session metadata only.
# Prints: model=<id-or-empty> source=<probe-source>
# Exits 0 when a candidate was read (even if not exact); 1 when nothing found.
#
# OpenCode evidence is a read-only query of OPENCODE_DB, or else
# ${XDG_DATA_HOME:-$HOME/.local/share}/opencode/opencode.db, table session.
# It matches meta worktree= to session.directory exactly, takes only the
# uniquely newest row, and composes providerID/id. It never writes that
# database and never treats requested_model as runtime evidence.
# Missing, unreadable, invalid, or ambiguous rows yield no candidate.
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
  local harness worktree db model
  harness=$(fm_model_meta_get "$META" harness)
  [ "$harness" = opencode ] || return 1
  worktree=$(fm_model_meta_get "$META" worktree)
  [ -n "$worktree" ] || return 1
  if [ -n "${OPENCODE_DB:-}" ]; then
    db=$OPENCODE_DB
  else
    db="${XDG_DATA_HOME:-${HOME:-/home/vsole}/.local/share}/opencode/opencode.db"
  fi
  [ -f "$db" ] || return 1
  [ -r "$db" ] || return 1
  model=$(python3 - "$db" "$worktree" <<'PY'
import json
import os
import sqlite3
import sys

db = sys.argv[1]
directory = sys.argv[2]
if not os.path.isfile(db) or not os.access(db, os.R_OK):
    sys.exit(1)
try:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=1.0)
except sqlite3.Error:
    sys.exit(1)
try:
    rows = con.execute(
        "SELECT model, time_updated FROM session WHERE directory = ? "
        "ORDER BY time_updated DESC",
        (directory,),
    ).fetchall()
except sqlite3.Error:
    sys.exit(1)
finally:
    con.close()
if not rows:
    sys.exit(1)
if len(rows) >= 2 and rows[0][1] == rows[1][1]:
    sys.exit(1)
raw = rows[0][0]
try:
    obj = json.loads(raw)
except (TypeError, json.JSONDecodeError):
    sys.exit(1)
if not isinstance(obj, dict):
    sys.exit(1)
provider = obj.get("providerID")
mid = obj.get("id")
if not isinstance(provider, str) or not provider.strip():
    sys.exit(1)
if not isinstance(mid, str) or not mid.strip():
    sys.exit(1)
print(f"{provider.strip()}/{mid.strip()}")
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
