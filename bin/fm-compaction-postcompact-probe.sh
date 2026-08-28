#!/usr/bin/env bash
# Post-compact verification probe: read Pi session jsonl + Firstmate state and
# emit a measurement table for compact/token/injection checks.
#
# Usage: fm-compaction-postcompact-probe.sh [--session <jsonl>] [--since <iso-prefix>]
#   --session  Pi session file (default: newest vs-agent-workspace session)
#   --since    Only consider events at or after this ISO timestamp prefix
#
# Prints markdown tables to stdout. Exit 0 when analysis completes; 1 on error.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FM_HOME="${FM_HOME:-$(cd "$SCRIPT_DIR/.." && pwd)}"
STATE="${FM_STATE_OVERRIDE:-$FM_HOME/state}"

SESSION=
SINCE=

while [ $# -gt 0 ]; do
  case "$1" in
    --session) SESSION=${2:-}; shift 2 ;;
    --session=*) SESSION=${1#--session=}; shift ;;
    --since) SINCE=${2:-}; shift 2 ;;
    --since=*) SINCE=${1#--since=}; shift ;;
    -h|--help)
      sed -n '1,12p' "$0"
      exit 0
      ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

if [ -z "$SESSION" ]; then
  SESSION=$(ls -t "$HOME/.pi/agent/sessions"/*vs-agent-workspace*/*.jsonl 2>/dev/null | head -1) || true
fi
[ -n "$SESSION" ] && [ -f "$SESSION" ] || {
  printf 'error: session jsonl not found\n' >&2
  exit 1
}

python3 - "$SESSION" "$SINCE" "$STATE" <<'PY'
import json, os, sys
from datetime import datetime

session_path, since, state_dir = sys.argv[1:4]
since = since or ""

def ts_ok(ts: str) -> bool:
    return not since or ts >= since

assistant_tokens = []
injections = []
custom_msgs = []

with open(session_path, encoding="utf-8", errors="replace") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except json.JSONDecodeError:
            continue
        ts = o.get("timestamp") or ""
        if not ts_ok(ts):
            continue
        typ = o.get("type")
        if typ == "compact_boundary":
            injections.append({
                "time": ts[:19].replace("T", " "),
                "event": "compact_boundary",
                "tokens_ui": o.get("tokensBefore"),
                "bytes_injected": None,
                "detail": f"summaryTokens={o.get('summaryTokens')} fromHook={o.get('fromHook')}",
            })
        elif typ == "message":
            m = o.get("message") or {}
            role = m.get("role")
            usage = m.get("usage") or {}
            tt = usage.get("totalTokens")
            if role == "assistant" and tt is not None:
                assistant_tokens.append((ts, int(tt)))
            content = m.get("content")
            if isinstance(content, str):
                text = content
            elif content is not None:
                text = json.dumps(content)
            else:
                text = ""
            ct = m.get("customType")
            if ct or (role == "user" and text and ("COMPACT" in text or "FIRSTMATE_OP" in text)):
                injections.append({
                    "time": ts[:19].replace("T", " "),
                    "event": f"inject {role or '?'} {ct or 'user'}",
                    "tokens_ui": tt,
                    "bytes_injected": len(text.encode("utf-8")),
                    "detail": text[:100].replace("\n", " "),
                })
        elif typ == "custom_message":
            content = o.get("content") or ""
            if isinstance(content, str):
                text = content
            else:
                text = json.dumps(content)
            custom_msgs.append((ts, o.get("customType"), len(text.encode("utf-8"))))

drops = []
for i in range(1, len(assistant_tokens)):
    prev_ts, prev_tt = assistant_tokens[i - 1]
    ts, tt = assistant_tokens[i]
    if prev_tt > 100000 and tt < prev_tt * 0.5:
        drops.append((ts, prev_tt, tt))

marker = os.path.join(state_dir, ".pi-turnend-extension-loaded")
ext_line = ""
if os.path.isfile(marker):
    with open(marker, encoding="utf-8") as mf:
        lines = mf.read().splitlines()
    ext_line = " / ".join(lines[:2])

compact_note_bytes = None
try:
    import subprocess
    env = os.environ.copy()
    env.setdefault("FM_HOME", os.path.dirname(state_dir))
    out = subprocess.check_output(
        [os.path.join(os.path.dirname(state_dir), "bin", "fm-session-start.sh"),
         "--compact-note", "--source", "compact"],
        env=env,
        stderr=subprocess.DEVNULL,
        timeout=30,
    )
    compact_note_bytes = len(out)
except Exception:
    pass

probe_log = os.path.join(state_dir, ".compact-postcompact-probe.jsonl")
probe_rows = []
if os.path.isfile(probe_log):
    with open(probe_log, encoding="utf-8", errors="replace") as pf:
        for line in pf:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = row.get("time") or row.get("timestamp") or ""
            if ts_ok(ts):
                probe_rows.append(row)

print("# Post-compact probe")
print()
print(f"- Session: `{session_path}`")
print(f"- Since filter: `{since or '(none)'}`")
print(f"- Extension marker: `{ext_line or 'absent'}`")
print(f"- `--compact-note` stdout bytes (current FM_HOME): {compact_note_bytes if compact_note_bytes is not None else 'unmeasured'}")
print()

print("## Token drops (assistant totalTokens, >50% fall from >100k)")
print()
print("| Zeit (UTC) | Vorher | Nachher | UI-% nachher |")
print("| --- | ---: | ---: | ---: |")
if drops:
    for ts, before, after in drops:
        pct = after / 200000 * 100
        print(f"| {ts[:19].replace('T', ' ')} | {before:,} | {after:,} | {pct:.1f}% |")
else:
    print("| (keine im Filter) | | | |")

print()
print("## Assistant token trail (last 12 in filter)")
print()
print("| Zeit (UTC) | totalTokens | UI-% |")
print("| --- | ---: | ---: |")
for ts, tt in assistant_tokens[-12:]:
    print(f"| {ts[:19].replace('T', ' ')} | {tt:,} | {tt/200000*100:.1f}% |")

print()
print("## Injektionen / Grenzen")
print()
print("| Zeit (UTC) | Event | Bytes | Tokens | Detail |")
print("| --- | --- | ---: | ---: | --- |")
shown = injections[-20:]
if not shown:
    print("| (keine) | | | | |")
for row in shown:
    print(
        f"| {row['time']} | {row['event']} | "
        f"{row['bytes_injected'] if row['bytes_injected'] is not None else '-'} | "
        f"{row['tokens_ui'] if row['tokens_ui'] is not None else '-'} | "
        f"{row['detail'][:80]} |"
    )

if probe_rows:
    print()
    print("## Extension probe log (FM_COMPACT_POSTCOMPACT_PROBE=1)")
    print()
    print("| Zeit | delivery | raw_bytes | encoded_bytes | in_cooldown |")
    print("| --- | --- | ---: | ---: | --- |")
    for row in probe_rows[-10:]:
        print(
            f"| {(row.get('time') or '')[:19]} | {row.get('delivery','')} | "
            f"{row.get('raw_bytes','-')} | {row.get('encoded_bytes','-')} | "
            f"{row.get('in_cooldown','')} |"
        )
PY
