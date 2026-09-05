#!/usr/bin/env bash
# tests/fm-captain-outcome-delivery-live-e2e.test.sh - live path for captain outcome delivery.
set -u

# shellcheck source=tests/wake-helpers.sh
. "$(dirname "${BASH_SOURCE[0]}")/wake-helpers.sh"

DELIVERY="$ROOT/bin/fm-captain-outcome-delivery.sh"
TIMESTAMP="$ROOT/bin/fm-captain-report-timestamp.sh"

TMP_ROOT=$(fm_test_tmproot fm-captain-outcome-delivery-live-e2e)

test_live_worker_done_without_captain_ask() {
  local dir state task report
  dir=$(make_case live-worker)
  state="$dir/state"
  task=captain-outcome-live-e2e
  report="data/$task/report.md"
  mkdir -p "$dir/$(dirname "$report")"
  printf '# Live E2E\n\nUngefaehrlicher Test-Worker.\n' > "$dir/$report"
  printf 'done: Bericht unter %s\nworking: Arbeitsverzeichnis aufgeraeumt\n' "$report" > "$state/$task.status"

  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "ingest failed"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$dir/first-present.out" || fail "first present failed"
  grep -F 'NEUE ERGEBNISSE SEIT DEM LETZTEN BERICHT' "$dir/first-present.out" >/dev/null \
    || fail "first present did not surface captain outcomes: $(cat "$dir/first-present.out")"
  grep -F "$task" "$dir/first-present.out" | grep -F "$report" >/dev/null \
    || fail "worker outcome missing from first present"

  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$dir/second-present.out" || fail "second present failed"
  if grep -F 'NEUE ERGEBNISSE SEIT DEM LETZTEN BERICHT' "$dir/second-present.out" >/dev/null; then
    fail "exactly-once live failed: second present repeated the same outcome"
  fi
  pass "live worker DONE is presented exactly once without captain asking"
}

test_unpresented_survives_compaction_presented_does_not() {
  local dir state
  dir=$(make_case compaction-live)
  state="$dir/state"
  mkdir -p "$dir/data/scout-live"
  printf '# scout\n' > "$dir/data/scout-live/report.md"
  printf 'done: Bericht unter data/scout-live/report.md\nworking: aufgeraeumt\n' > "$state/scout-live.status"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "scout ingest failed"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present >/dev/null || fail "scout present failed"

  mkdir -p "$dir/data/presented-live"
  printf '# presented\n' > "$dir/data/presented-live/report.md"
  printf 'done: Bericht unter data/presented-live/report.md\nworking: aufgeraeumt\n' > "$state/presented-live.status"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "presented ingest failed"

  # Simulate compaction/restart: new process, same disk state.
  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$dir/after-restart.out" || fail "restart present failed"
  grep -F 'presented-live' "$dir/after-restart.out" >/dev/null \
    || fail "unpresented outcome did not survive restart simulation: $(cat "$dir/after-restart.out")"
  if grep -F 'scout-live' "$dir/after-restart.out" >/dev/null; then
    fail "already-presented outcome reappeared after restart simulation"
  fi

  FM_STATE_OVERRIDE="$state" "$DELIVERY" present > "$dir/after-second.out" || fail "second present failed"
  if grep -F 'NEUE ERGEBNISSE SEIT DEM LETZTEN BERICHT' "$dir/after-second.out" >/dev/null; then
    fail "presented-live outcome was shown more than once across restart simulation"
  fi
  pass "unpresented survives compaction/restart; presented stays suppressed"
}

test_pi_before_agent_start_injects_outcomes() {
  local dir state fixture out
  dir=$(make_case pi-preflight)
  state="$dir/state"
  fixture="$dir/fixture"
  mkdir -p "$fixture/.pi/extensions/lib" "$state"
  ln -s "$ROOT/bin" "$fixture/bin"
  cp "$ROOT/.pi/extensions/fm-primary-turnend-guard.ts" "$fixture/.pi/extensions/"
  cp "$ROOT/.pi/extensions/lib/fm-operational-input.ts" "$fixture/.pi/extensions/lib/"
  cp "$ROOT/.pi/extensions/lib/fm-agents-refresh.ts" "$fixture/.pi/extensions/lib/"

  printf 'done: Bericht unter data/pi-hook/report.md\nworking: aufgeraeumt\n' > "$state/pi-hook.status"
  mkdir -p "$dir/data/pi-hook"
  printf '# pi hook\n' > "$dir/data/pi-hook/report.md"
  FM_STATE_OVERRIDE="$state" "$DELIVERY" ingest >/dev/null || fail "pi-hook ingest failed"

  out="$dir/pi-hook.out"
  (cd "$fixture" && FM_HOME="$dir" FM_STATE_OVERRIDE="$state" FM_ROOT_OVERRIDE="$fixture" \
    PI_PACKAGE_DIR="${PI_PACKAGE_DIR:-$ROOT/projects/pi/packages/coding-agent}" \
    node --input-type=module) >"$out" 2>&1 <<'JS' || fail "pi before_agent_start probe failed: $(cat "$out")"
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const handlers = new Map();
const pi = {
  on(event, handler) {
    const list = handlers.get(event) || [];
    list.push(handler);
    handlers.set(event, list);
  },
};
const mod = await import(pathToFileURL("./.pi/extensions/fm-primary-turnend-guard.ts").href);
mod.default(pi);
const preflight = handlers.get("before_agent_start") || [];
if (preflight.length < 2) throw new Error("expected session-start and captain-outcome before_agent_start handlers");
const results = [];
for (const handler of preflight) {
  const value = await handler({ prompt: "captain question" }, {});
  if (value?.message) results.push(value.message);
}
const outcome = results.find((message) => message.customType === "firstmate-captain-outcome-delivery");
if (!outcome) throw new Error("captain outcome message was not injected");
if (!outcome.content.includes("NEUE ERGEBNISSE SEIT DEM LETZTEN BERICHT")) {
  throw new Error("injected captain outcome lacked delivery section");
}
if (!outcome.content.includes("pi-hook")) {
  throw new Error("injected captain outcome lacked task id");
}
process.stdout.write("ok\n");
JS

  grep -Fx 'ok' "$out" >/dev/null || fail "pi hook probe did not succeed: $(cat "$out")"
  pass "Pi before_agent_start injects unpresented captain outcomes before visible main turns"
}

test_timestamp_footer_is_last_line_only() {
  local line trailing
  line=$("$TIMESTAMP")
  case "$line" in
    Zeitstempel:\ [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]\ [0-9][0-9]:[0-9][0-9]) ;;
    *) fail "timestamp footer has unexpected shape: $line" ;;
  esac
  trailing=$(printf '%s\nextra\n' "$line" | wc -l | tr -d ' ')
  [ "$trailing" = 2 ] || fail "timestamp helper contract broken"
  pass "captain report timestamp helper prints the required last-line footer"
}

test_live_worker_done_without_captain_ask
test_unpresented_survives_compaction_presented_does_not
test_pi_before_agent_start_injects_outcomes
test_timestamp_footer_is_last_line_only

rm -rf "$TMP_ROOT"
printf 'fm-captain-outcome-delivery-live-e2e.test.sh: all tests passed\n'
