// fm-phantom-toolcall-guard.ts - recovers one narrow, specific stalled-turn
// shape and nothing else.
//
// Diagnosed 2026-09-06 (fm-reparatur-zustellung-calm-leak, technical finding
// in data/fm-reparatur-zustellung-calm-leak/befund-fortsetzungsregression.md):
// a turn occasionally ends with stopReason "stop" whose only content is a
// thinking block (empty text is normal here - Calm's own display:"omitted"
// default) plus a text block that reads as an ABANDONED tool-call
// announcement - a bare recognized tool name ("read"), or a bolded tool name
// followed by a markdown code fence ("**bash**\n```\n<command>\n```") - with
// NO toolCall content block at all. Whether the underlying cause is the
// model itself or something upstream of this repo remains an open question
// (see the finding doc); this guard reacts to the OBSERVABLE symptom only,
// regardless of cause. Measured: ~76% of observed cases immediately follow an
// internally-injected follow-up message (a watcher wake, a supervision-branch
// processing request or merge note) rather than a real captain message, but
// the check itself does not depend on that - it only inspects the shape of
// the completed turn.
//
// Deliberately narrow, per captain instruction (2026-09-06):
//   - NEVER executes the recognized text as a real command. The follow-up
//     only asks the SAME model, in its own next turn, to actually call the
//     tool it described - the model still decides what runs, exactly like
//     any other turn.
//   - NEVER retries an ordinary completed turn. The check fires only for
//     this one exact content shape (no toolCall block at all, and text that
//     matches nothing but a bare known tool name or a bolded-tool-name code
//     fence); any real answer - however short - never matches it.
//   - Fires the corrective follow-up at MOST ONCE per stalled turn, via the
//     same "guard already active" flag shape fm-primary-turnend-guard.ts
//     uses for its own agent_settled follow-up, so a repeat of the same
//     failure on the nudge's own reply cannot loop.
//
// `turn_end` (not `agent_settled`) is the event that carries `ctx.sessionManager`
// with the just-persisted entries (see fm-branch-supervision.ts's own
// `currentMainSession = ctx.sessionManager` on the same event), which this
// guard needs to inspect the completed turn's actual content blocks.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { encodeFirstmateOperationalInput } from "./lib/fm-operational-input.ts";

const KNOWN_TOOL_NAMES = ["read", "bash", "edit", "write", "grep", "find", "ls"];

type ContentBlock = { type?: string; text?: string };
type AssistantMessageLike = { role?: string; stopReason?: string; content?: unknown };
type SessionEntryLike = { type?: string; message?: AssistantMessageLike };
type SessionManagerLike = { getEntries(): SessionEntryLike[] };

// A phantom tool-call announcement, and nothing else: either the ENTIRE
// trimmed text is one recognized tool name with no other characters, or it
// starts with that name bolded on its own line and the text also contains a
// code fence (the command it never actually ran). Anything else - including
// a normal answer that happens to be short, or one that merely mentions a
// tool name in passing - does not match.
function isPhantomToolAnnouncement(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (KNOWN_TOOL_NAMES.includes(trimmed)) return true;
  const boldMatch = trimmed.match(/^\*\*(\w+)\*\*\s*\n/);
  if (boldMatch && KNOWN_TOOL_NAMES.includes(boldMatch[1]) && trimmed.includes("```")) return true;
  return false;
}

function lastAssistantEntry(entries: SessionEntryLike[]): SessionEntryLike | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type === "message" && entry.message?.role === "assistant") return entry;
  }
  return undefined;
}

// True only for the exact narrow shape: stopReason "stop", every content
// block is "thinking" or "text" (never "toolCall"), and the joined text
// reads as an abandoned tool-call announcement per isPhantomToolAnnouncement.
function isPhantomStalledTurn(message: AssistantMessageLike | undefined): boolean {
  if (!message || message.stopReason !== "stop") return false;
  const blocks = Array.isArray(message.content) ? (message.content as ContentBlock[]) : undefined;
  if (!blocks || blocks.length === 0) return false;
  if (!blocks.every((b) => b.type === "thinking" || b.type === "text")) return false;
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  return isPhantomToolAnnouncement(text);
}

export default function (pi: ExtensionAPI) {
  let followupActive = false;

  pi.on?.("turn_end", async (_event, ctx) => {
    if (followupActive) {
      followupActive = false;
      return;
    }
    const sessionManager = (ctx as { sessionManager?: SessionManagerLike } | undefined)?.sessionManager;
    if (!sessionManager) return;
    const entry = lastAssistantEntry(sessionManager.getEntries());
    if (!isPhantomStalledTurn(entry?.message)) return;

    followupActive = true;
    try {
      const content = encodeFirstmateOperationalInput(
        "turn-end-guard",
        "Your previous turn only described a tool call in plain text (no structured tool call was made), " +
          "so nothing actually ran. If you still intend that action, call the tool itself now instead of describing it.",
      );
      await pi.sendUserMessage(content, { deliverAs: "followUp" });
    } catch {
      followupActive = false;
    }
  });
}
