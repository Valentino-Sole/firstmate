#!/usr/bin/env bash
# Read-only index entrypoint for the isolated Arbeits-PC copy.
#
# Captain decision 2026-08-27 (Option A): use the index and search helpers only;
# do not merge, export, or destroy /home/vsole/uebernahme-arbeits-pc.
# See docs/klartext-uebernahme-isolation.md.
set -u

UEBERNAHME_ROOT=/home/vsole/uebernahme-arbeits-pc
INDEX_DIR="$UEBERNAHME_ROOT/_index"
LIESMICH="$UEBERNAHME_ROOT/LIESMICH.md"
SCOUT_REPORT_REL=data/fm-gedaechtnis-bestandsaufnahme/report.md

usage() {
  cat <<EOF
Usage: fm-klartext-uebernahme-index.sh [--overview|--paths|--search <term>]

Read-only helper for the isolated Arbeits-PC copy (Option A, 2026-08-27).
The tree under $UEBERNAHME_ROOT stays isolated: index and search only.

  --overview   Print the curated index overview when present.
  --paths      Print the authoritative read-only entry points.
  --search T   Run the bundled suche.sh helper when T is non-empty.

Inventory context: $SCOUT_REPORT_REL in the firstmate home.
Full contract: docs/klartext-uebernahme-isolation.md
EOF
}

print_paths() {
  cat <<EOF
isolated_root=$UEBERNAHME_ROOT
index_overview=$INDEX_DIR/UEBERSICHT.md
index_sessions=$INDEX_DIR/sitzungen.jsonl
index_prompts=$INDEX_DIR/prompts.tsv
liesmich=$LIESMICH
search_helper=$UEBERNAHME_ROOT/suche.sh
scout_report=$SCOUT_REPORT_REL
EOF
}

case "${1:-}" in
  --overview)
    if [ -f "$INDEX_DIR/UEBERSICHT.md" ]; then
      cat "$INDEX_DIR/UEBERSICHT.md"
      exit 0
    fi
    echo "missing: $INDEX_DIR/UEBERSICHT.md" >&2
    exit 1
    ;;
  --paths)
    print_paths
    exit 0
    ;;
  --search)
    term=${2:-}
    if [ -z "$term" ]; then
      echo "error: --search requires a non-empty term" >&2
      usage >&2
      exit 2
    fi
    if [ ! -x "$UEBERNAHME_ROOT/suche.sh" ]; then
      echo "missing search helper: $UEBERNAHME_ROOT/suche.sh" >&2
      exit 1
    fi
    exec "$UEBERNAHME_ROOT/suche.sh" "$term"
    ;;
  -h|--help|"")
    usage
    exit 0
    ;;
  *)
    echo "error: unknown argument: $1" >&2
    usage >&2
    exit 2
    ;;
esac
