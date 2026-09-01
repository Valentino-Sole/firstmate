// End-to-end evidence harness (evidence-only; NOT part of the repo).
//
// The captain-visible symptom from the report: after a normal captain message a
// yellow internal bash/tool block (bin/fm-wake-drain.sh, started by a watcher
// wake) is the last thing in the chat and no reply ever follows. This drives the
// REAL .pi/extensions/fm-primary-turnend-guard.ts agent_settled handler over
// that exact transcript and prints what the captain sees next.
import { pathToFileURL } from "node:url";

const EXT_PATH = process.env.EXT_PATH;
const LABEL = process.env.LABEL ?? "run";
const MODE = process.env.MODE ?? "recovers"; // "recovers" | "keeps-hanging"

let nextEntryId = 0;
const entries = [];
const append = (message) => {
  const id = `e${++nextEntryId}`;
  entries.push({ type: "message", id, parentId: entries.length ? entries[entries.length - 1].id : null, timestamp: "t", message });
};

// The reported picture: captain message, then a watcher wake whose bash tool
// call is the last visible entry - no result, no reply.
append({ role: "user", content: "bitte den Stand zusammenfassen", timestamp: 0 });
append({ role: "user", content: "⁣FIRSTMATE_OP: v1 watcher: stale: beacon 812s old - run bin/fm-wake-drain.sh", timestamp: 0 });
append({ role: "assistant", content: [{ type: "toolCall", id: "tc1", name: "bash", input: { command: "bin/fm-wake-drain.sh" } }], timestamp: 0 });

const handlers = new Map();
const seenByCaptain = [];
const pi = {
  on(e, h) { (handlers.get(e) ?? handlers.set(e, []).get(e)).push(h); },
  sendMessage() {},
  async sendUserMessage(content, options) {
    const text = typeof content === "string" ? content : content.filter((p) => p.type === "text").map((p) => p.text).join("\n");
    seenByCaptain.push(text);
    append({ role: "user", content: text, timestamp: 0 });
    if (MODE === "recovers") {
      // The model reads the history, finishes the tool call and answers.
      append({ role: "toolResult", content: [{ type: "text", text: "wake queue drained" }], timestamp: 0 });
      append({ role: "assistant", content: [{ type: "text", text: "Wake abgearbeitet. Stand: Gate-Lauf durch, Review offen." }], stopReason: "stop", timestamp: 0 });
    }
    // "keeps-hanging": the recovery turn itself produces nothing - the budget path.
    await handlers.get("agent_settled")[0]({ type: "agent_settled" }, ctx);
  },
};
const ctx = { sessionManager: { getEntries: () => entries.slice() }, sessionId: "evidence-session" };
const ext = await import(pathToFileURL(EXT_PATH).href);
ext.default(pi);
const settled = handlers.get("agent_settled")[0];

console.log(`===== ${LABEL} =====`);
for (let i = 1; i <= 9; i += 1) {
  const before = seenByCaptain.length;
  await settled({ type: "agent_settled" }, ctx);
  const fired = seenByCaptain.length - before;
  console.log(`  settle #${i}: ${fired === 0 ? "nothing sent" : `${fired} follow-up sent`}`);
}

const short = (t) => t.replace(/⁣FIRSTMATE_OP: v1 [a-z-]+: /, "").replace(/\s+/g, " ").slice(0, 120);
console.log("\n--- what the captain sees after the hang ---");
if (seenByCaptain.length === 0) console.log("  (nothing - the session stays silent)");
for (const [i, t] of seenByCaptain.entries()) console.log(`  ${i + 1}. ${short(t)}`);
console.log("\n--- chat tail ---");
for (const e of entries.slice(-2)) {
  const c = e.message.content;
  const text = typeof c === "string" ? c : c.map((p) => p.type === "text" ? p.text : `[${p.type}:${p.name ?? ""}]`).join(" ");
  console.log(`  ${String(e.message.role).padEnd(10)} | ${text.replace(/⁣FIRSTMATE_OP: v1 [a-z-]+: /, "[internal op] ").replace(/\s+/g, " ").slice(0, 150)}`);
}
console.log(`\ntotal follow-ups over 9 settles: ${seenByCaptain.length}`);
