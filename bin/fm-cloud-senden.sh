#!/usr/bin/env bash
set -euo pipefail
FM_HOME="${FM_HOME:-$HOME/vs-agent-workspace}"
# shellcheck source=/dev/null
source "$FM_HOME/state/bruecke.env"
BODY="$(cat "${1:-$FM_HOME/state/cloud-bericht.md}")"
printf '%s\n' "$BODY" > "$FM_HOME/state/cloud-bericht.md"
curl -sS -H "Title: bericht" -d "$BODY" "https://ntfy.sh/${BRUECKE_BERICHT}"
echo
echo bericht gesendet
