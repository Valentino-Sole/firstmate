# Pi model-provider context/cache continuity

Audience: maintainer verification.

This record contains reusable, version-scoped evidence for whether a Pi model provider retains prompt-cache continuity across ordinary conversation turns, which directly governs how fast reported context usage grows in a long-lived Pi primary session.
It exists because a reported context-percentage anomaly (readings above 100% of a 1.0M window) traced back to provider-level cache behavior rather than to Firstmate's own session-start or compaction machinery, which was independently verified intact.
Exact task chronology, branch names, temporary paths, and delivery transcripts remain in private task reports or PR evidence.

## claude-code-cli (pi-cli-mate)

Source: `github.com/Valentino-Sole/pi-cli-mate`, commit `99830b7cff7a8da74efe2163003c13dc13d84b16`.
This extension answers Pi turns from a locally logged-in Claude Code CLI subscription rather than the Anthropic API, and is installed as a Pi user package (`pi install https://github.com/Valentino-Sole/pi-cli-mate`).

`session-registry.ts`'s `runTurn()` kills any live CLI child process and starts a brand-new one for every ordinary turn (`matchContinuation` returning `"fresh"`), which is every turn except a direct tool-result continuation.
Each fresh spawn uses a new random `--session-id` and `--no-session-persistence`, so the CLI has no memory of earlier turns.
`transcript.ts`'s `renderTurn()` compensates by quoting the entire prior conversation as flattened text inside one new stdin user message; its header comment states this is a deliberate trade-off so Pi remains the sole owner of history, compaction, and rewind.
The net effect is that every ordinary turn re-processes the whole growing conversation with no prompt-cache reuse across turns.

Verified 2026-08-31 against `claude` 2.1.251, spawned with the same flags `session-registry.ts` uses (`--print --input-format stream-json --output-format stream-json --verbose --include-partial-messages --session-id <fresh-uuid> --setting-sources "" --no-session-persistence --disable-slash-commands --strict-mcp-config --mcp-config '{"mcpServers":{}}' --tools "" --permission-mode dontAsk`), on a one-line user message with a ~53 KB (52981-byte) system prompt supplied via `--system-prompt`:

```sh
printf '%s\n' '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Reply with exactly the single word: pong"}]}}' | \
  claude --print --input-format stream-json --output-format stream-json --verbose \
    --session-id "$(uuidgen)" --setting-sources "" --no-session-persistence --disable-slash-commands \
    --system-prompt "$(cat system-prompt.txt)" \
    --strict-mcp-config --mcp-config '{"mcpServers":{}}' --tools "" --permission-mode dontAsk
```

Observed `result` usage: `input_tokens: 2`, `cache_creation_input_tokens: 25938`, `cache_read_input_tokens: 0`, `output_tokens: 4`.
The real tokenizer count for this system prompt (25938) ran roughly 2x a naive chars/4 estimate (13245) for this dense, structured text, so byte-based estimates of provider-side cost understate the real total for this content shape.
`cache_read_input_tokens: 0` on a call whose `--session-id` was never reused in an earlier call is expected: nothing exists yet to read from cache.
Repeating this call with a second fresh random `--session-id` and the same system prompt reproduces the same `cache_creation_input_tokens` rather than a `cache_read_input_tokens` hit, confirming no cache persists across the process boundary this extension recreates every ordinary turn.

## xai (native Pi provider, SuperGrok subscription via OAuth)

Verified 2026-08-31 against Pi 0.84.3, model `xai/grok-4.3` (1M advertised context window), authenticated via `pi auth check --provider xai --model grok-4.3 --json` reporting `{"status":"ready","provider":"xai","authType":"oauth"}` (subscription OAuth, not an API key).
Four sequential one-word turns were sent to the same persisted session id, isolated from Firstmate's own extensions and context files:

```sh
pi --provider xai --model grok-4.3 --print --mode json \
  --no-extensions --no-skills --no-tools --no-context-files --no-themes --no-prompt-templates \
  --session-id "$SID" --session-dir "$SESSION_DIR" \
  "Reply with exactly the single word: pong1"
# repeated with the same --session-id and --session-dir for pong2, pong3, pong4
```

Observed per-turn `turn_end` usage (`input` / `cacheRead` / `cacheWrite` / `output` / `totalTokens`):

| Turn | input | cacheRead | cacheWrite | output | totalTokens |
| --- | --- | --- | --- | --- | --- |
| 1 | 483 | 128 | 0 | 78 | 689 |
| 2 | 133 | 576 | 0 | 48 | 757 |
| 3 | 73 | 704 | 0 | 36 | 813 |
| 4 | 705 | 128 | 0 | 30 | 863 |

Turns 1-3 show the expected shape of real session/cache continuity: non-cached `input` shrinks (483 -> 133 -> 73) while `cacheRead` grows (128 -> 576 -> 704), and `totalTokens` grows only incrementally per turn (689 -> 757 -> 813) rather than re-paying the full conversation each time.
Turn 4 reverted to a cold-cache shape (`input: 705`, `cacheRead: 128`) despite being sent to the same session id with no code change between calls; this was not investigated further and is recorded as an open observation rather than an explained mechanism - possibly an ephemeral cache TTL expiring during the real wall-clock gap between sequential CLI invocations, but unconfirmed.

## Auto-compact trigger diverges from the displayed percentage (Pi core)

A live main session reported auto-compaction firing while the footer showed only `4.4% / 1.0M (auto)`, with `Compaction failed: Turn prefix summarization failed: This operation was aborted` and `Auto-compact failed: Turn prefix summarization failed: This operation was aborted`.
Traced in the installed `@earendil-works/pi-coding-agent` 0.84.3 (`dist/core/agent-session.js`, `AgentSession._checkCompaction()`): the footer (`FooterComponent.render()` in `dist/modes/interactive/components/footer.js`) computes its percentage from `getContextUsage()`, which walks the message list for the last assistant message with valid usage and reports that usage's `totalTokens` against the window.
`_checkCompaction()` computes its own trigger value independently, and the two sources are not the same value in every case.
When the assistant message just checked has `assistantMessage.stopReason === "error"` or its own usage sums to zero (`calculateContextTokens(assistantMessage.usage) === 0`, e.g. a provider that returned no usage for that response), `_checkCompaction()` switches to `estimateContextTokens(this.agent.state.messages)` - a full re-estimate of the entire current message array using Pi's chars/4 heuristic - rather than the single last-known-good usage figure the footer displays.
A guard exists for exactly this divergence (`usageMsg.timestamp <= compactionEntry.timestamp` skips a stale pre-compaction usage source), but it only applies when `estimate.lastUsageIndex !== null` and a prior `compactionEntry` exists; a session with no assistant usage anywhere in the current window, or no completed compaction yet to compare against, falls straight through to the raw full-array estimate with no staleness check at all.
A response whose own `stopReason` is `"aborted"` is excluded from `_checkCompaction()` by `skipAbortedCheck` (`agent-session.js` around `_checkCompaction`'s opening lines), so the `Turn prefix summarization failed: ... aborted` messages describe the summarization request compaction itself issued being aborted (for example by a new user turn arriving mid-compaction), not the triggering assistant message.
This mechanism does not depend on which model provider is active: any provider response that completes with zero or malformed usage data routes the trigger through the full-array estimate, which can legitimately exceed the window while the footer - anchored to an earlier, real, smaller usage figure - still reads low.
Not independently reproduced end to end in this task; recorded from source tracing plus the one live observation above, for whoever verifies it further to build on rather than re-derive.

## Reading this record

`claude-code-cli` structurally cannot reuse prompt cache across ordinary Pi turns (fresh session id, no persistence, full-history requoting), so its reported context/cost grows with the full conversation size on every turn by design, not by a counting defect.
`xai`/`grok-4.3` demonstrated real cross-turn cache reuse in this test, with one unexplained cold-cache turn worth re-checking if this record is revisited.
Separately, Pi core's own auto-compact trigger can diverge from what the footer displays whenever a response completes with zero or malformed usage, which plausibly compounds with either provider's cost profile above but is not caused by either of them.
None of the three findings in this record originate in Firstmate's own tracked `.pi/extensions/` or `bin/fm-session-start.sh`; both providers' session-start digest delivery was independently verified to happen at most once per session generation, capped at 512 KiB.
