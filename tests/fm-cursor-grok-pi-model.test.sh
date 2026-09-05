#!/usr/bin/env bash
# Regression for Pi cursor-grok picker ids that omit effort and hit
# "Provider finish_reason: error" unless reasoning_effort is injected.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TMP_ROOT=$(fm_test_tmproot fm-cursor-grok-pi-model)
LIB="$ROOT/.pi/extensions/lib/fm-cursor-grok-model.ts"
EXT="$ROOT/.pi/extensions/fm-cursor-grok-model.ts"

cleanup() {
  fm_test_cleanup
}
trap cleanup EXIT

test_lib_normalizes_short_cursor_grok_ids() {
  local fixture out status
  if ! command -v node >/dev/null 2>&1; then
    echo "skip: node not found for cursor-grok Pi model test"
    return 0
  fi

  fixture="$TMP_ROOT/lib"
  mkdir -p "$fixture"
  cp "$LIB" "$fixture/fm-cursor-grok-model.ts"
  cp "$EXT" "$fixture/fm-cursor-grok-model-ext.ts"

  out=$(cd "$fixture" && node --input-type=module 2>&1 <<'JS'
import {
  CURSOR_GROK_PROVIDER_ERROR,
  patchCursorGrokProviderPayload,
  resolveCursorGrokReasoningEffort,
} from "./fm-cursor-grok-model.ts";

const errorLine = "Provider finish_reason: error";
if (CURSOR_GROK_PROVIDER_ERROR !== errorLine) {
  throw new Error(`expected anchored error line ${JSON.stringify(errorLine)}`);
}

const cases = [
  ["cursor-grok-4.6-fast", "xhigh", "xhigh"],
  ["cursor-grok-4.6", "high", "high"],
  ["cursor-grok-4.5-fast", "medium", "medium"],
];

for (const [model, thinking, expected] of cases) {
  const effort = resolveCursorGrokReasoningEffort(model, thinking);
  if (effort !== expected) {
    throw new Error(`${model} + ${thinking} => ${effort}, expected ${expected}`);
  }
  const patched = patchCursorGrokProviderPayload({ model }, model, thinking);
  if (patched.reasoning_effort !== expected) {
    throw new Error(`payload patch for ${model} got ${patched.reasoning_effort}`);
  }
}

const alreadyEffort = patchCursorGrokProviderPayload(
  { model: "cursor-grok-4.6-xhigh-fast", reasoning_effort: "xhigh" },
  "cursor-grok-4.6-xhigh-fast",
  "low",
);
if (alreadyEffort.reasoning_effort !== "xhigh") {
  throw new Error("existing reasoning_effort must not be overwritten");
}

const nonGrok = patchCursorGrokProviderPayload({ model: "composer-2.5" }, "composer-2.5", "xhigh");
if ("reasoning_effort" in nonGrok) {
  throw new Error("non-grok cursor models must pass through untouched");
}

console.log("ok");
JS
); status=$?

  expect_code 0 "$status" "cursor-grok Pi model normalization script failed: $out"
  assert_contains "$out" "ok" "cursor-grok Pi model normalization did not pass"
  pass 'fm-cursor-grok-model: injects reasoning_effort for short cursor-grok picker ids (Provider finish_reason: error)'
}

test_lib_normalizes_short_cursor_grok_ids
