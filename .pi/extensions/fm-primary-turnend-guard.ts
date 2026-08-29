import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  classifyFirstmateCurrentOperationalText,
  encodeFirstmateOperationalInput,
} from "./lib/fm-operational-input.ts";

let guardFollowupActive = false;
// Auto-compact with a stale Cursor occupancy meter retriggered within ~80-160s
// (live primary 2026-08-28T06:26Z). A follow-up then becomes Compact->Resume->
// Compact. Skip the follow-up inside this window; still inject the short note.
let lastCompactContinueAt = 0;
const COMPACT_CONTINUE_COOLDOWN_MS = 180000;

type LockOwnership = "owned" | "missing" | "other";

const extensionFile = fileURLToPath(import.meta.url);
const extensionDir = dirname(extensionFile);
const root = resolve(extensionDir, "../..");
const fmHome = process.env.FM_HOME || process.env.FM_ROOT_OVERRIDE || root;
const state = process.env.FM_STATE_OVERRIDE || `${fmHome}/state`;
const marker = `${state}/.pi-turnend-extension-loaded`;
const extensionVersion = `sha256:${createHash("sha256").update(readFileSync(extensionFile)).digest("hex")}`;

function parentPid(pid: string): string {
  const result = spawnSync("ps", ["-o", "ppid=", "-p", pid], { encoding: "utf8" });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function pidAlive(pid: string): boolean {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function lockOwnership(): LockOwnership {
  let lockPid = "";
  try {
    lockPid = readFileSync(`${state}/.lock`, "utf8").trim();
  } catch {
    return "missing";
  }
  if (!/^[0-9]+$/.test(lockPid) || lockPid === "1") return "other";
  let pid = String(process.pid);
  for (let i = 0; i < 8; i += 1) {
    if (pid === lockPid) return "owned";
    pid = parentPid(pid);
    if (!pid || pid === "1") break;
  }
  return pidAlive(lockPid) ? "other" : "missing";
}

function markLoaded(): void {
  if (!existsSync(state) || lockOwnership() === "other") return;
  writeFileSync(marker, `${extensionVersion}\n${process.pid}\n`);
}

// Pi's session_start reasons are startup | reload | new | resume | fork, and a
// separate session_compact event fires after a compaction. "new" is Pi's /clear
// while reload, resume, and fork all keep prior context.
const sessionstartDeliveryBytes = 512 * 1024;

type SessionStartContext = {
  sessionManager?: {
    getHeader?: () => { timestamp?: unknown } | null | undefined;
  };
};

function restoredSessionEvidence(ctx: SessionStartContext): boolean {
  try {
    const timestamp = ctx.sessionManager?.getHeader?.()?.timestamp;
    const createdAt = typeof timestamp === "string" ? Date.parse(timestamp) : Number.NaN;
    return Number.isFinite(createdAt) && createdAt < performance.timeOrigin;
  } catch {
    return false;
  }
}

function startupRebuildSource(ctx: SessionStartContext): "resume" | "fork" | undefined {
  const args = process.argv.slice(2);
  const restored = restoredSessionEvidence(ctx);
  for (const arg of args) {
    if (arg === "--fork" || arg.startsWith("--fork=")) return "fork";
    if (
      restored && (
        arg === "-c" || arg === "--continue" ||
        arg === "-r" || arg === "--resume" ||
        arg === "--session" || arg.startsWith("--session=") ||
        arg === "--session-id" || arg.startsWith("--session-id=")
      )
    ) return "resume";
  }
  return undefined;
}
const sessionstartTruncatedMarker =
  "\n\nPI SESSION-START DELIVERY TRUNCATED - the digest exceeded 512 KiB. " +
  "Treat omitted context as unread and inspect the named files directly before acting on it.";

function runSessionstartHook(source: string): Promise<string> {
  return new Promise((resolveResult) => {
    const child = spawn(`${root}/bin/fm-sessionstart-run.sh`, ["--source", source], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const chunks: Buffer[] = [];
    let retainedBytes = 0;
    let truncated = false;
    child.stdout.on("data", (chunk: Buffer) => {
      if (retainedBytes >= sessionstartDeliveryBytes) {
        truncated = true;
        return;
      }
      const remaining = sessionstartDeliveryBytes - retainedBytes;
      const retained = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
      chunks.push(retained);
      retainedBytes += retained.length;
      if (retained.length !== chunk.length) truncated = true;
    });
    child.on("error", () => resolveResult(""));
    child.on("close", (code) => {
      if (code !== 0) {
        resolveResult("");
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      resolveResult(truncated ? `${raw}${sessionstartTruncatedMarker}` : raw);
    });
  });
}

function encodeSessionstartContent(raw: string): string {
  // Pi is the only adapter that injects a MESSAGE rather than hook stdout, so
  // whatever it injects must carry operational provenance or the Ahoy skill
  // would have to guess whether it was captain-authored. The wrapper already
  // returns an encoded nudge on a context-preserving open, so only an
  // unencoded digest needs the marker added here.
  return classifyFirstmateCurrentOperationalText(raw)
    ? raw
    : encodeFirstmateOperationalInput("session-start", raw);
}

function appendCompactProbe(record: Record<string, unknown>): void {
  if (process.env.FM_COMPACT_POSTCOMPACT_PROBE !== "1") return;
  try {
    const line = `${JSON.stringify({ time: new Date().toISOString(), ...record })}\n`;
    writeFileSync(`${state}/.compact-postcompact-probe.jsonl`, line, { flag: "a" });
  } catch {
  }
}

function injectSessionstartMessage(pi: ExtensionAPI, content: string): void {
  appendCompactProbe({
    delivery: "sendMessage",
    encoded_bytes: Buffer.byteLength(content, "utf8"),
  });
  pi.sendMessage({
    customType: "firstmate-sessionstart-nudge",
    content,
    display: false,
    details: { kind: "session-start" },
  });
}

async function injectSessionstart(pi: ExtensionAPI, source: string): Promise<void> {
  const raw = await runSessionstartHook(source);
  if (!raw) return;
  try {
    injectSessionstartMessage(pi, encodeSessionstartContent(raw));
  } catch {
  }
}

function afterCompactInProgressClears(): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, 0);
  });
}

async function startCompactContinuationTurn(pi: ExtensionAPI, content: string): Promise<void> {
  try {
    // Auto-compaction runs while _isAgentRunActive is true, so followUp is
    // queued and Pi continues the loop (hasQueuedMessages). Idle sessions
    // start a new continuation turn. Either way the in-flight assignment
    // resumes without a captain prompt.
    await pi.sendUserMessage(content, { deliverAs: "followUp" });
  } catch {
    // Manual /compact emits session_compact before it clears
    // _compactionAbortController, so the first prompt() refuses. The next
    // tick runs after that flag is cleared.
    await afterCompactInProgressClears();
    await pi.sendUserMessage(content, { deliverAs: "followUp" });
  }
}

async function injectCompactContinuation(pi: ExtensionAPI): Promise<void> {
  const raw = await runSessionstartHook("compact");
  if (!raw) return;
  let content: string;
  try {
    content = encodeSessionstartContent(raw);
  } catch {
    return;
  }
  const now = Date.now();
  const inCooldown = lastCompactContinueAt > 0
    && now - lastCompactContinueAt < COMPACT_CONTINUE_COOLDOWN_MS;
  appendCompactProbe({
    path: "session_compact",
    raw_bytes: Buffer.byteLength(raw, "utf8"),
    encoded_bytes: Buffer.byteLength(content, "utf8"),
    in_cooldown: inCooldown,
  });
  if (inCooldown) {
    try {
      injectSessionstartMessage(pi, content);
    } catch {
    }
    return;
  }
  lastCompactContinueAt = now;
  try {
    appendCompactProbe({ delivery: "followUp", encoded_bytes: Buffer.byteLength(content, "utf8") });
    await startCompactContinuationTurn(pi, content);
  } catch {
    lastCompactContinueAt = 0;
    try {
      appendCompactProbe({ delivery: "followUp_retry_as_sendMessage", encoded_bytes: Buffer.byteLength(content, "utf8") });
      injectSessionstartMessage(pi, content);
    } catch {
    }
  }
}

function runGuard(): Promise<{ code: number; stderr: string }> {
  return new Promise((resolveResult) => {
    const child = spawn(`${root}/bin/fm-turnend-guard.sh`, {
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", () => resolveResult({ code: 0, stderr: "" }));
    child.on("close", (code) => resolveResult({ code: code ?? 0, stderr }));
    child.stdin.end('{"stop_hook_active":false}');
  });
}

// PreToolUse seatbelts (bin/fm-arm-pretool-check.sh, docs/arm-pretool-check.md;
// bin/fm-cd-pretool-check.sh, docs/cd-guard.md;
// bin/fm-primary-checkout-pretool-check.sh, docs/primary-checkout-guard.md).
// extension file rather than separate ones so no extra Pi -e flag is needed at
// launch - the primary already loads this file for the turn-end guard, and
// pi.on("tool_call", ...) can block (verified 2026-07-09 against pi 0.80.5:
// returning {block: true} prevents the bash command from running). Each owner
// script owns its own decision and is inert outside the real primary checkout.
function runChecker(script: string, command: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolveResult) => {
    const child = spawn(`${root}/bin/${script}`, ["--command", command], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", () => resolveResult({ code: 0, stderr: "" }));
    child.on("close", (code) => resolveResult({ code: code ?? 0, stderr }));
  });
}

function runPretoolCheck(command: string): Promise<{ code: number; stderr: string }> {
  return runChecker("fm-arm-pretool-check.sh", command);
}

function runCdCheck(command: string): Promise<{ code: number; stderr: string }> {
  return runChecker("fm-cd-pretool-check.sh", command);
}

function runPrimaryCheckoutCheck(command: string): Promise<{ code: number; stderr: string }> {
  return runChecker("fm-primary-checkout-pretool-check.sh", command);
}

export default function (pi: ExtensionAPI) {
  pi.on?.("session_start", async (event, ctx) => {
    const reason = String((event as { reason?: unknown }).reason ?? "");
    const source = reason === "startup"
      ? startupRebuildSource(ctx) ?? "startup"
      : { new: "clear", resume: "resume", fork: "fork" }[reason];
    markLoaded();
    if (!source) return;
    await injectSessionstart(pi, source);
  });

  // After compaction the helm is still held. Inject the short continuation
  // note as a follow-up so in-flight work resumes without a captain prompt.
  // Never reprint the full session-start digest: that refill caused a compact loop.
  pi.on?.("session_compact", async () => {
    await injectCompactContinuation(pi);
  });

  pi.on("tool_call", async (event) => {
    if (event.type !== "tool_call" || event.toolName !== "bash") return {};
    const command = String((event.input as { command?: unknown })?.command ?? "");
    if (!command) return {};
    const cdResult = await runCdCheck(command);
    if (cdResult.code === 2) {
      return { block: true, reason: cdResult.stderr.trim() || "denied by the cd-guard PreToolUse seatbelt" };
    }
    const primaryCheckoutResult = await runPrimaryCheckoutCheck(command);
    if (primaryCheckoutResult.code === 2) {
      return {
        block: true,
        reason: primaryCheckoutResult.stderr.trim() || "denied by the primary-checkout PreToolUse seatbelt",
      };
    }
    const result = await runPretoolCheck(command);
    if (result.code !== 2) return {};
    return { block: true, reason: result.stderr.trim() || "denied by the watcher-arm PreToolUse seatbelt" };
  });

  pi.on("agent_settled", async () => {
    if (guardFollowupActive) {
      guardFollowupActive = false;
      return;
    }

    const result = await runGuard();
    if (result.code !== 2) return;

    guardFollowupActive = true;
    try {
      const content = encodeFirstmateOperationalInput(
        "turn-end-guard",
        "TURN WOULD END BLIND - supervision is off. " +
          "The watcher cycle is missing, failed, or unhealthy. Follow the harness recovery instruction below before ending the turn.\n\n" +
          result.stderr,
      );
      await pi.sendUserMessage(content, { deliverAs: "followUp" });
    } catch {
      guardFollowupActive = false;
    }
  });

  markLoaded();
}
