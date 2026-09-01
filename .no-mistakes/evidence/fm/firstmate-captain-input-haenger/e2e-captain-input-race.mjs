// End-to-end evidence harness (evidence-only; NOT part of the repo).
//
// Drives the REAL, unmodified AgentSession.prototype.prompt() from the
// installed @earendil-works/pi-coding-agent against a stub `this` (same
// technique as the repo's tracked docs/verification/pi-agent-session-toctou-repro.mjs),
// but wires the REAL .pi/extensions/fm-primary-turnend-guard.ts into the
// extension-event path, and delivers whatever the extension sends back through
// pi.sendUserMessage() as a genuine new prompt() call on the same session.
//
// Result: the chat transcript the captain would actually see after the
// reported race. Run with EXT_PATH pointing at the pre-fix or post-fix
// extension to get the BEFORE / AFTER pictures.
import { pathToFileURL } from "node:url";

const SDK_PATH = process.env.SDK_PATH;
const EXT_PATH = process.env.EXT_PATH;
const LABEL = process.env.LABEL ?? "run";
const { AgentSession } = await import(pathToFileURL(SDK_PATH).href);
const promptFn = AgentSession.prototype.prompt;

const CAPTAIN_TEXT = "bitte den Stand zusammenfassen";
const WAKE_TEXT = "⁣FIRSTMATE_OP: v1 watcher: stale: 1 in-flight task, beacon 812s old - run bin/fm-wake-drain.sh";

// --- the session transcript, in Pi SessionEntry shape -----------------------
let nextEntryId = 0;
const entries = [];
const appendMessage = (message) => {
  const id = `e${++nextEntryId}`;
  entries.push({
    type: "message",
    id,
    parentId: entries.length ? entries[entries.length - 1].id : null,
    timestamp: new Date().toISOString(),
    message,
  });
  return id;
};

// --- the real extension, loaded exactly as Pi loads it ----------------------
const handlers = new Map();
const sentByExtension = [];
let deliverDepth = 0;
const pi = {
  on(event, handler) {
    if (!handlers.has(event)) handlers.set(event, []);
    handlers.get(event).push(handler);
  },
  sendMessage() {},
  async sendUserMessage(content, options) {
    const text = typeof content === "string"
      ? content
      : content.filter((p) => p.type === "text").map((p) => p.text).join("\n");
    const images = typeof content === "string" ? [] : content.filter((p) => p.type !== "text");
    sentByExtension.push({ text, images, deliverAs: options?.deliverAs });
    // Real delivery: sendUserMessage forwards to prompt() with
    // streamingBehavior "followUp" and source "extension" (agent-session.js).
    if (deliverDepth > 4) return;
    deliverDepth += 1;
    try {
      await promptFn.call(session, text, { streamingBehavior: "followUp", source: "extension" });
    } catch {
      // A rejected delivery is the extension's own concern; it handles it.
    } finally {
      deliverDepth -= 1;
    }
  },
};
const ext = await import(pathToFileURL(EXT_PATH).href);
ext.default(pi);

const ctx = { sessionManager: { getEntries: () => entries.slice() }, sessionId: "evidence-session" };
const emit = async (event, payload) => {
  for (const handler of handlers.get(event) ?? []) await handler(payload, ctx);
};

// --- stub session: faithful to agent-session.js _runAgentPrompt -------------
let concurrent = 0;
const eventLog = [];
async function fakeRunAgentPrompt(messages) {
  this._isAgentRunActive = true;
  concurrent += 1;
  const isLoser = concurrent > 1;
  try {
    if (isLoser) {
      // pi-agent-core Agent.prototype.prompt rejects before it appends anything.
      throw new Error("Agent is already processing a prompt. Use steer() or followUp() to queue messages, or wait for completion.");
    }
    for (const message of messages) appendMessage(message);
    await new Promise((r) => setTimeout(r, 40));
    const answered = messages.map((m) => JSON.stringify(m.content)).join(" ");
    const reply = answered.includes("watcher") && !answered.includes("CAPTAIN INPUT WAS LOST")
      ? "Wake abgearbeitet, Watcher wieder gesund."
      : "Stand: der Gate-Lauf ist durch, Review offen.";
    appendMessage({ role: "assistant", content: [{ type: "text", text: reply }], stopReason: "stop" });
  } finally {
    concurrent -= 1;
    this._isAgentRunActive = false;
    eventLog.push(`agent_settled(runsStillLive=${concurrent})`);
    await emit("agent_settled", { type: "agent_settled" });
  }
}

const session = {
  _isAgentRunActive: false,
  get isStreaming() { return this._isAgentRunActive; },
  _compactionAbortController: undefined,
  _pendingNextTurnMessages: [],
  _systemPromptOverride: undefined,
  _baseSystemPrompt: "base",
  promptTemplates: [],
  model: { provider: "test" },
  _modelRuntime: { hasConfiguredAuth: () => true, checkAuth: async () => "ok", isUsingOAuth: () => false },
  _extensionRunner: {
    hasHandlers: (event) => (handlers.get(event) ?? []).length > 0,
    emitInput: async (text, images, source, streamingBehavior) => {
      eventLog.push(`input(source=${source})`);
      await emit("input", { type: "input", text, images, source, streamingBehavior });
      return { action: "pass" };
    },
    emitBeforeAgentStart: async (prompt, images) => {
      eventLog.push("before_agent_start");
      // A real before_agent_start handler in this repo awaits a spawned child
      // process; this delay stands in for that genuine async gap.
      const result = await (async () => {
        const r = await (handlers.get("before_agent_start") ?? []).reduce(
          async (acc, h) => { await acc; return h({ type: "before_agent_start", prompt, images, systemPrompt: "base" }, ctx); },
          Promise.resolve(undefined),
        );
        await new Promise((r2) => setTimeout(r2, 20));
        return r;
      })();
      return result?.message ? { messages: [result.message], systemPrompt: undefined } : undefined;
    },
  },
  _findLastAssistantMessage: () => undefined,
  _checkCompaction: async () => false,
  _flushPendingBashMessages: () => {},
  _expandSkillCommand: (t) => t,
  _throwIfExtensionCommand: () => {},
  _runAgentPrompt: fakeRunAgentPrompt,
  agent: { state: { systemPrompt: "base" } },
};

// --- the reported episode ---------------------------------------------------
// A watcher wake (fm-primary-pi-watch.ts sendWake -> pi.sendUserMessage) and the
// captain's own interactive message start from idle at the same moment.
const wakeCall = promptFn.call(session, WAKE_TEXT, { streamingBehavior: "followUp", source: "extension" });
const captainCall = promptFn.call(session, CAPTAIN_TEXT, { source: "interactive" });
await Promise.allSettled([wakeCall, captainCall]);

// Idempotence probe: two further ordinary settles on the unchanged state.
const afterRace = sentByExtension.length;
await emit("agent_settled", { type: "agent_settled" });
await emit("agent_settled", { type: "agent_settled" });
const afterRepeat = sentByExtension.length;

// --- what the captain sees --------------------------------------------------
const render = (m) => {
  const content = m.content;
  const text = typeof content === "string"
    ? content
    : (Array.isArray(content) ? content : []).map((p) => p.type === "text" ? p.text : `[${p.type}:${p.name ?? ""}]`).join(" ");
  return text.replace(/⁣FIRSTMATE_OP: v1 [a-z-]+: /, "[internal op] ").replace(/\s+/g, " ").slice(0, 190);
};
console.log(`===== ${LABEL} =====`);
console.log(`extension events: ${eventLog.join(" -> ")}`);
console.log("\n--- chat transcript the captain sees ---");
for (const entry of entries) console.log(`  ${String(entry.message.role).padEnd(9)} | ${render(entry.message)}`);
const captainAnswered = entries.some((e) => e.message.role === "user" && JSON.stringify(e.message.content).includes(CAPTAIN_TEXT));
const tail = entries[entries.length - 1]?.message;
console.log("\n--- verdict ---");
console.log(`captain's message present in the conversation : ${captainAnswered}`);
console.log(`recovery follow-ups sent by the extension     : ${afterRace}`);
console.log(`extra follow-ups from 2 repeated settles      : ${afterRepeat - afterRace}`);
console.log(`final transcript tail                          : ${tail?.role}/${tail?.stopReason ?? "-"}`);
