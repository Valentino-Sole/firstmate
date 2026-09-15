#!/usr/bin/env bash
# Read-only index entrypoint for the isolated Arbeits-PC copy.
#
# Captain decision 2026-08-27 (Option A): use the index and search helpers only;
# do not merge, export, or destroy /home/vsole/uebernahme-arbeits-pc.
# See docs/klartext-uebernahme-isolation.md.
#
# The inventory is deliberately split across two homes (see LIESMICH.md):
# --search and --paths check the isolated root's own suche.sh first, then the
# migration home's protokolle copy, and use whichever is actually executable.
# A server without the migration home simply has only the first candidate.
set -u

UEBERNAHME_ROOT=${UEBERNAHME_ROOT:-/home/vsole/uebernahme-arbeits-pc}
INDEX_DIR="$UEBERNAHME_ROOT/_index"
LIESMICH="$UEBERNAHME_ROOT/LIESMICH.md"
SCOUT_REPORT_REL=data/fm-gedaechtnis-bestandsaufnahme/report.md

# The bundled search helper lives in whichever half of the deliberately
# two-way-split inventory happens to carry it (see LIESMICH.md): the isolated
# root itself on a server that has one, or the migration home's protokolle
# folder on a server that has that instead. A server may have neither.
PROTOKOLLE_SUCHE=${PROTOKOLLE_SUCHE:-/home/vsole/data/workspaces/secondmate-migration/data/uebernahme-arbeits-pc-gross/protokolle/suche.sh}

usage() {
  cat <<EOF
Usage: fm-klartext-uebernahme-index.sh [--overview|--paths|--search <term>]

Read-only helper for the isolated Arbeits-PC copy (Option A, 2026-08-27).
The tree under $UEBERNAHME_ROOT stays isolated: index and search only.

  --overview   Print the curated index overview when present.
  --paths      Print the authoritative read-only entry points.
  --search T   Run the suche.sh helper when T is non-empty. Looked up first at
               $UEBERNAHME_ROOT/suche.sh, then at $PROTOKOLLE_SUCHE.

Inventory context: $SCOUT_REPORT_REL in the firstmate home.
Full contract: docs/klartext-uebernahme-isolation.md
EOF
}

# Prints the first executable search helper across both halves of the split
# inventory, isolated root first. Returns 1 with nothing printed when neither
# location has it (expected on a server without the migration home).
find_search_helper() {
  if [ -x "$UEBERNAHME_ROOT/suche.sh" ]; then
    printf '%s\n' "$UEBERNAHME_ROOT/suche.sh"
  elif [ -x "$PROTOKOLLE_SUCHE" ]; then
    printf '%s\n' "$PROTOKOLLE_SUCHE"
  else
    return 1
  fi
}

print_paths() {
  local search_helper
  search_helper=$(find_search_helper) \
    || search_helper="missing (checked $UEBERNAHME_ROOT/suche.sh and $PROTOKOLLE_SUCHE)"
  cat <<EOF
isolated_root=$UEBERNAHME_ROOT
index_overview=$INDEX_DIR/UEBERSICHT.md
index_sessions=$INDEX_DIR/sitzungen.jsonl
index_prompts=$INDEX_DIR/prompts.tsv
liesmich=$LIESMICH
search_helper=$search_helper
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
    search_helper=$(find_search_helper) || {
      echo "missing search helper: checked $UEBERNAHME_ROOT/suche.sh and $PROTOKOLLE_SUCHE" >&2
      exit 1
    }
    exec "$search_helper" "$term"
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
