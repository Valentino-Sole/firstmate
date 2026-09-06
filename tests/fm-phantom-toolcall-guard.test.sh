#!/usr/bin/env bash
# tests/fm-phantom-toolcall-guard.test.sh - .pi/extensions/fm-phantom-toolcall-guard.ts:
# the narrow recovery for a turn that describes a tool call as plain text
# instead of making a structured tool call, then ends normally (captain
# directive, 2026-09-06, fm-reparatur-zustellung-calm-leak; technical finding
# in data/fm-reparatur-zustellung-calm-leak/befund-fortsetzungsregression.md).
#
# Every case drives the real extension file directly (no fixture copy needed:
# its only dependency, lib/fm-operational-input.ts, resolves bin/fm-operational-input.sh
# relative to its OWN real location in this repo). A minimal mock `pi` records
# handler registration and captures every prompt sent as a follow-up.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

EXT="$ROOT/.pi/extensions/fm-phantom-toolcall-guard.ts"

run_node() {  # <js-heredoc on stdin> -> stdout+stderr combined
  PLUGIN="$EXT" node --input-type=module 2>&1
}

test_bare_tool_name_triggers_exactly_one_followup() {
  local out
  out=$(run_node <<'EOF'
import { pathToFileURL } from "node:url";
const handlers = new Map();
let prompts = 0;
const pi = {
  on(event, handler) { handlers.set(event, handler); },
  async sendUserMessage(message, options) {
    prompts += 1;
    if (!message.startsWith("⁣FIRSTMATE_OP: v1 turn-end-guard: ")) throw new Error(`untyped operational prompt: ${message}`);
    if (!message.includes("only described a tool call in plain text")) throw new Error(`unexpected prompt: ${message}`);
    if (options?.deliverAs !== "followUp") throw new Error("prompt was not a follow-up");
  },
};
const mod = await import(pathToFileURL(process.env.PLUGIN).href);
mod.default(pi);
const entries = [
  { type: "message", message: { role: "user", content: "watcher wake" } },
  { type: "message", message: { role: "assistant", stopReason: "stop", content: [
    { type: "thinking", text: "" },
    { type: "text", text: "read" },
  ] } },
];
const ctx = { sessionManager: { getEntries: () => entries } };
await handlers.get("turn_end")?.({ type: "turn_end" }, ctx);
if (prompts !== 1) throw new Error(`expected exactly 1 follow-up, got ${prompts}`);
console.log("PASS");
EOF
)
  assert_contains "$out" "PASS" "a bare recognized tool name with no toolCall should trigger exactly one follow-up: $out"
  pass "fm-phantom-toolcall-guard: a bare tool name ('read') with stopReason=stop and no toolCall triggers one corrective follow-up"
}

test_bolded_tool_name_with_code_fence_triggers_followup() {
  local out
  out=$(run_node <<'EOF'
import { pathToFileURL } from "node:url";
const handlers = new Map();
let prompts = 0;
const pi = {
  on(event, handler) { handlers.set(event, handler); },
  async sendUserMessage(message, options) {
    prompts += 1;
    if (options?.deliverAs !== "followUp") throw new Error("prompt was not a follow-up");
  },
};
const mod = await import(pathToFileURL(process.env.PLUGIN).href);
mod.default(pi);
const entries = [
  { type: "message", message: { role: "assistant", stopReason: "stop", content: [
    { type: "thinking", text: "" },
    { type: "text", text: "**bash**\n\n```bash\ncd /home/vsole/vs-agent-workspace && bin/fm-wake-drain.sh\n```" },
  ] } },
];
const ctx = { sessionManager: { getEntries: () => entries } };
await handlers.get("turn_end")?.({ type: "turn_end" }, ctx);
if (prompts !== 1) throw new Error(`expected exactly 1 follow-up, got ${prompts}`);
console.log("PASS");
EOF
)
  assert_contains "$out" "PASS" "a bolded tool name with a code fence should trigger a follow-up: $out"
  pass "fm-phantom-toolcall-guard: a bolded tool-name label with a markdown code fence (the real seq 06.09. shape) triggers one corrective follow-up"
}

test_real_toolcall_never_triggers() {
  local out
  out=$(run_node <<'EOF'
import { pathToFileURL } from "node:url";
const handlers = new Map();
let prompts = 0;
const pi = {
  on(event, handler) { handlers.set(event, handler); },
  async sendUserMessage() { prompts += 1; },
};
const mod = await import(pathToFileURL(process.env.PLUGIN).href);
mod.default(pi);
const entries = [
  { type: "message", message: { role: "assistant", stopReason: "toolUse", content: [
    { type: "thinking", text: "" },
    { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
  ] } },
];
const ctx = { sessionManager: { getEntries: () => entries } };
await handlers.get("turn_end")?.({ type: "turn_end" }, ctx);
if (prompts !== 0) throw new Error(`a real toolCall must never trigger a follow-up, got ${prompts}`);
console.log("PASS");
EOF
)
  assert_contains "$out" "PASS" "an ordinary tool-calling turn must never trigger a follow-up: $out"
  pass "fm-phantom-toolcall-guard: a turn that actually made a structured toolCall never triggers (stopReason=toolUse, real toolCall block present)"
}

test_ordinary_short_answer_never_triggers() {
  local out
  out=$(run_node <<'EOF'
import { pathToFileURL } from "node:url";
const handlers = new Map();
let prompts = 0;
const pi = {
  on(event, handler) { handlers.set(event, handler); },
  async sendUserMessage() { prompts += 1; },
};
const mod = await import(pathToFileURL(process.env.PLUGIN).href);
mod.default(pi);
const cases = [
  "Captain, shipshape.",
  "Now sending the steer with the exact technical diagnosis request.",
  "bash",
];
for (const text of cases) {
  const entries = [
    { type: "message", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text }] } },
  ];
  const ctx = { sessionManager: { getEntries: () => entries } };
  await handlers.get("turn_end")?.({ type: "turn_end" }, ctx);
}
// "bash" alone IS the exact bare-tool-name shape and SHOULD trigger - so this
// case is expected to add one prompt; the first two ordinary answers must not.
if (prompts !== 1) throw new Error(`expected exactly 1 follow-up (only the bare "bash" case), got ${prompts}`);
console.log("PASS");
EOF
)
  assert_contains "$out" "PASS" "an ordinary completed answer (however short) must never be mistaken for the phantom shape: $out"
  pass "fm-phantom-toolcall-guard: a normal completed answer never triggers, even when short or mentioning a tool name in passing - never a blanket retry"
}

test_followup_never_loops_on_itself() {
  local out
  out=$(run_node <<'EOF'
import { pathToFileURL } from "node:url";
const handlers = new Map();
let prompts = 0;
const pi = {
  on(event, handler) { handlers.set(event, handler); },
  async sendUserMessage(message, options) {
    prompts += 1;
    // Simulate the corrective follow-up's OWN turn also ending phantom-shaped
    // (the worst case: the guard's nudge itself gets no real tool call back).
    const entries = [
      { type: "message", message: { role: "assistant", stopReason: "stop", content: [
        { type: "text", text: "read" },
      ] } },
    ];
    await handlers.get("turn_end")?.({ type: "turn_end" }, { sessionManager: { getEntries: () => entries } });
  },
};
const mod = await import(pathToFileURL(process.env.PLUGIN).href);
mod.default(pi);
const entries = [
  { type: "message", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "read" }] } },
];
await handlers.get("turn_end")?.({ type: "turn_end" }, { sessionManager: { getEntries: () => entries } });
if (prompts !== 1) throw new Error(`the guard's own follow-up must not re-trigger itself, got ${prompts} prompts`);
console.log("PASS");
EOF
)
  assert_contains "$out" "PASS" "the guard must never loop on its own corrective follow-up: $out"
  pass "fm-phantom-toolcall-guard: firing on the follow-up's own resulting turn is suppressed once, exactly like fm-primary-turnend-guard.ts's own loop guard"
}

test_no_entries_or_no_session_manager_is_inert() {
  local out
  out=$(run_node <<'EOF'
import { pathToFileURL } from "node:url";
const handlers = new Map();
let prompts = 0;
const pi = {
  on(event, handler) { handlers.set(event, handler); },
  async sendUserMessage() { prompts += 1; },
};
const mod = await import(pathToFileURL(process.env.PLUGIN).href);
mod.default(pi);
await handlers.get("turn_end")?.({ type: "turn_end" }, {});
await handlers.get("turn_end")?.({ type: "turn_end" }, { sessionManager: { getEntries: () => [] } });
if (prompts !== 0) throw new Error(`expected no follow-up without session data, got ${prompts}`);
console.log("PASS");
EOF
)
  assert_contains "$out" "PASS" "a missing session manager or empty entries must never throw or trigger: $out"
  pass "fm-phantom-toolcall-guard: a missing sessionManager or an empty entry list is inert, never throws"
}

test_bare_tool_name_triggers_exactly_one_followup
test_bolded_tool_name_with_code_fence_triggers_followup
test_real_toolcall_never_triggers
test_ordinary_short_answer_never_triggers
test_followup_never_loops_on_itself
test_no_entries_or_no_session_manager_is_inert
