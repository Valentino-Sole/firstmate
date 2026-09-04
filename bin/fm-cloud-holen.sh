#!/usr/bin/env bash
set -euo pipefail
source "$HOME/vs-agent-workspace/state/bruecke.env"
DEST="$HOME/vs-agent-workspace/state/cloud-kick.md"
export DEST
while true; do
curl -sS "https://ntfy.sh/${BRUECKE_KICK}/json?poll=1&since=all" | python3 -c 'import json,os,sys
dest=os.environ["DEST"]; body=None
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    try: o=json.loads(line)
    except: continue
    if o.get("event")=="message" and o.get("message"): body=o["message"]
if body:
    open(dest,"w").write(body if body.endswith("\n") else body+"\n")
    print("kick ok")'
sleep 5
done
