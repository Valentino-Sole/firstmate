#!/usr/bin/env bash
# fm-captain-report-timestamp.sh - canonical last line for visible captain reports.
#
# Usage:
#   fm-captain-report-timestamp.sh
#
# Prints exactly one line:
#   Zeitstempel: YYYY-MM-DD HH:MM
# using the local wall clock. Captain reports must end with this line and nothing
# may follow it.
set -eu

TZ=${TZ:-}
printf 'Zeitstempel: %s\n' "$(date '+%Y-%m-%d %H:%M')"
