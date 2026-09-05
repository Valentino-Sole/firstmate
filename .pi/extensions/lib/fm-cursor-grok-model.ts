// Normalize cursor-grok model requests in Pi before they reach pi-cursor-provider.
//
// pi-cursor-provider deduplicates Cursor Grok catalog entries to picker ids such as
// `cursor-grok-4.6` and `cursor-grok-4.6-fast`, then expects reasoning_effort on
// each request so its proxy can expand them to real ids like `cursor-grok-4.6-xhigh-fast`.
// Pi does not attach reasoning_effort for cursor-prefixed grok ids (its thinking
// selector only maps into provider effort for unprefixed families), so the proxy
// forwards the shortened id and Cursor answers with:
//   Provider finish_reason: error
//
// Live primary evidence: session 01a04d5c-02db-7f83-bc8a-c94f83d29125 on 2026-08-29,
// model cursor-grok-4.6-fast, assistant text "Error", errorMessage above.

export const CURSOR_GROK_PROVIDER_ERROR = "Provider finish_reason: error";

const CURSOR_GROK_EFFORT_LEVELS = new Set([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export type ParsedCursorGrokModelId = {
  base: string;
  effort: string;
  fast: boolean;
};

export function parseCursorGrokModelId(modelId: string): ParsedCursorGrokModelId {
  let remaining = modelId;
  let fast = false;
  if (remaining.endsWith("-fast")) {
    fast = true;
    remaining = remaining.slice(0, -5);
  }
  const lastDash = remaining.lastIndexOf("-");
  if (lastDash >= 0) {
    const suffix = remaining.slice(lastDash + 1);
    if (CURSOR_GROK_EFFORT_LEVELS.has(suffix)) {
      return {
        base: remaining.slice(0, lastDash),
        effort: suffix,
        fast,
      };
    }
  }
  return { base: remaining, effort: "", fast };
}

export function isCursorGrokModelId(modelId: string): boolean {
  return parseCursorGrokModelId(modelId).base.startsWith("cursor-grok-");
}

export function cursorGrokModelNeedsEffort(modelId: string): boolean {
  const parsed = parseCursorGrokModelId(modelId);
  return parsed.base.startsWith("cursor-grok-") && parsed.effort === "";
}

export function mapThinkingLevelToCursorEffort(thinkingLevel: string | undefined): string {
  switch ((thinkingLevel ?? "").trim().toLowerCase()) {
    case "off":
    case "minimal":
      return "low";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
      return "xhigh";
    case "max":
      return "max";
    default:
      return "high";
  }
}

export function resolveCursorGrokReasoningEffort(
  modelId: string,
  thinkingLevel: string | undefined,
): string | undefined {
  if (!cursorGrokModelNeedsEffort(modelId)) return undefined;
  return mapThinkingLevelToCursorEffort(thinkingLevel);
}

export function patchCursorGrokProviderPayload(
  payload: unknown,
  modelId: string | undefined,
  thinkingLevel: string | undefined,
): unknown {
  if (!modelId || !payload || typeof payload !== "object") return payload;
  const record = payload as Record<string, unknown>;
  const model = typeof record.model === "string" ? record.model : modelId;
  const reasoningEffort = resolveCursorGrokReasoningEffort(model, thinkingLevel);
  if (!reasoningEffort) return payload;
  if (typeof record.reasoning_effort === "string" && record.reasoning_effort.trim() !== "") {
    return payload;
  }
  return { ...record, reasoning_effort: reasoningEffort };
}
