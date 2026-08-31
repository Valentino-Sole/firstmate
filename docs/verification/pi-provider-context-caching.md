# Pi model-provider context/cache continuity

Audience: maintainer verification.

This record contains reusable, version-scoped evidence for whether a Pi model provider retains prompt-cache continuity across ordinary conversation turns, which directly governs how fast reported context usage grows in a long-lived Pi primary session.
It exists because a reported context-percentage anomaly (readings above 100% of a 1.0M window, and auto-compaction firing at a single-digit displayed percentage) traced back to provider-level cache behavior and a reproduced Pi-core trigger/display divergence, rather than to Firstmate's own session-start or compaction machinery, which was independently verified intact.
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

Two further live reports matched this same shape: auto-compaction firing while the footer showed `7% / 1.0M`, and a footer reading of `6.6% / 1.0M` immediately followed by `150.2% / 1.0M` after one ordinary action.
Reproduced directly against the installed package's own exported functions on 2026-08-31 (`calculateContextTokens`, `estimateContextTokens`, `shouldCompact`, `DEFAULT_COMPACTION_SETTINGS` from `dist/core/compaction/compaction.js`; `getLatestCompactionEntry` from `dist/core/session-manager.js`), no reimplementation:

```js
// Footer path: last assistant message with real, nonzero usage.
// Trigger path (agent-session.js Case 3): the just-checked message's own
// usage when nonzero, otherwise estimateContextTokens() over the WHOLE
// current message array.
const messages = [
  { role: "assistant", timestamp: 1000, stopReason: "stop",
    usage: { input: 66000, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 66000 } }, // real, 6.6% of 1.0M
  { role: "user", timestamp: 1001, content: [{ type: "text", text: "x".repeat(5_600_000) }] }, // one action's quoted history/tool output
  { role: "assistant", timestamp: 1002, stopReason: "error",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 } }, // the failed/zero-usage response
];
```

Result, both values computed by Pi's own code against the identical `messages` array:

```json
{
  "footer_shown": { "tokens": 66000, "percent": "6.6%" },
  "trigger_reads": { "tokens": 1466000, "percent": "146.6%" },
  "same_source": false,
  "auto_compact_fires": true
}
```

This reproduces the reported shape directly: the footer stays anchored to the last real usage (6.6%, matching the report almost exactly) while the trigger - reading a different source - computes a different, much larger figure (146.6%, in the same range as the reported 150.2%) from the same message array, and does cross the auto-compact threshold.
No value is added to itself anywhere in this path; `same_source: false` is a single full re-estimate replacing the footer's figure outright, not an accumulation on top of it, so this is a wrong-source read, not a double-counted or sticky counter in the trigger computation itself.
Whether a *stale* value can persist is a separate, narrower question this reproduction also answers directly: `shouldCompact()` takes no state between calls, so nothing is cached or carried forward by the trigger computation itself.
What can persist is the *condition*: if compaction fails (or the provider keeps returning zero/malformed usage on retry) the message array is untouched, so the very next check re-derives the same inflated estimate from the same still-present content and can re-trigger immediately - the observed back-to-back "Compaction failed" then "Auto-compact failed" pattern is consistent with this, though the exact retry sequence that produced those two specific lines was not captured live and is not claimed as separately proven here.
The `spawn claude ENOENT` fix above removes one concrete, now-eliminated way to produce the triggering zero-usage response, but the Pi-core divergence itself is unrelated to any one provider and remains reachable by any other cause of a zero/malformed-usage response; it is Pi-core code this task has no path to patch.

A further live report of auto-compaction firing with no active worker or heavy turn in progress does not need a new mechanism: `agent-session.js` carries exactly one persistent flag across the compaction paths, `_overflowRecoveryAttempted` (grepped across the whole file), and it scopes only the separate overflow-recovery case (Case 1/2, a response that itself hit the model's context limit), resetting per turn; the threshold path this section reproduces (Case 3) reads no instance field at all; `shouldCompact()` takes only the arguments it is called with.
So a light or trivial turn can still trigger this: the divergence depends only on whether *that turn's own* response has zero or malformed usage, and on how much untouched content already sits in the message array from earlier - not on how much work the triggering turn itself did.
This specific incident's exact transcript (what the triggering response was, and why it had no usable usage) was not available to trace further here.

## `spawn claude ENOENT` and the spawning process's PATH

A live session reported a `spawn claude ENOENT` error, the standard Node.js message when `child_process.spawn()` cannot resolve a bare command name against `PATH`.
`claude-code-cli`'s `constants.ts` (`claudeBinary()`) returns `process.env.PI_CLAUDE_BIN ?? "claude"`: a bare command name, resolved by the OS against whatever `PATH` the enclosing Pi Node process inherited at its own launch, unless the operator sets `PI_CLAUDE_BIN`, which Firstmate does not.
`session-registry.ts`'s `spawn(claudeBinary(), args, { stdio: [...] })` (the same call site described above under `claude-code-cli`) passes no explicit `env`, so every nested `claude` spawn for the whole life of that Pi process shares the same inherited `PATH`; the failure mode is per-process, not per-turn, so once it happens once with a given `PATH` it will keep happening on that process's every subsequent turn until the process is replaced.
`~/.bashrc` on this host adds `~/.local/bin` (where `claude` is installed) to `PATH` only past its standard Debian non-interactive-shell guard (`case $- in *i*) ;; *) return;; esac`), so any process chain that reaches a bash invocation without an interactive flag set skips that `PATH` addition entirely.

Firstmate's own automatic Pi-primary restart (`bin/fm-pi-primary-restart.sh`, `bin/fm-pi-primary-restart-lib.sh`) already treats bare-command `PATH` resolution as unsafe for relaunching Pi itself: `fm_pi_restart_resolve_pi_bin()` resolves the harness binary to an absolute, symlink-resolved path (`type -P` plus `cd "$(dirname ...)" && pwd -P`) specifically so the relaunch does not depend on `PATH` at spawn time, and the tmux-backend relaunch path types the launch command into the pane's existing interactive shell rather than starting a fresh one.
The herdr-backend relaunch path instead hands the launch to `herdr agent start ... -- "${LAUNCH_ARGS[@]}"`, a third-party spawn path whose own environment construction for the new agent process was not traced here; whether it replicates a full interactive-shell `PATH` (with `~/.local/bin`) or a narrower one is the open question for reproducing this failure on demand.
No equivalent absolute-path resolution exists for `claude-code-cli`'s own nested spawn: `claudeBinary()` never applies the pattern `fm_pi_restart_resolve_pi_bin()` already uses one call away in the same fleet.

Connection to the full-history-replay finding above: these are two independent root causes, not one.
A `PATH`-related `ENOENT` is an environment/robustness problem in how the nested `claude` process is found; the lack of cross-turn cache reuse is a session-continuity design trade-off in how much is resent once that process is found and started.
They compound through the Pi-core mechanism recorded in the section above: a spawn that fails outright produces an assistant message with `stopReason: "error"` and no usage, which is exactly the condition that routes Pi's auto-compact trigger through the full-array estimate rather than the footer's own figure.
Because `claude-code-cli` never keeps a session alive across ordinary turns (see above), a `PATH` failure on any turn has no prior live session to fall back to, so it surfaces immediately as that whole turn's outcome rather than being absorbed into an already-open connection.
Not independently reproduced beyond the fix below confirming the failure mode is real; the herdr `agent start` environment and the exact process chain leading to a bash invocation without an interactive flag remain open questions for whoever verifies this further.

### Fix

Landed on `fix/context-usage-accounting` (commit `30c0891`, local to this task's `pi-cli-mate` clone, not pushed or merged pending captain approval): `constants.ts` gained `resolveClaudeBinary()`, checking `PI_CLAUDE_BIN`, then a real `PATH` search, then `~/.local/bin/claude` (the native installer's well-known location), resolving symlinks to an absolute path.
`session-registry.ts`'s `spawnFreshTurn()` calls it before spawning and fails that one turn immediately with a clear, actionable message when nothing resolves, instead of attempting a spawn that ENOENTs asynchronously; `preflight.ts`'s auth check gets the same up-front diagnosis.
Verified against the real installed CLI: resolves via `PATH` normally, via the well-known fallback when `PATH` lacks `~/.local/bin` (the reported failure shape, reproduced by clearing `PATH` to `/usr/bin:/bin`), and with a clear error naming both `PATH` and `PI_CLAUDE_BIN` when nothing exists anywhere.
Full suite after the fix: 78/78 (70 pre-existing plus 8 new, including a regression test that a session-registry turn with an unresolvable binary fails within milliseconds with a non-ENOENT message rather than spawning).
This closes one concrete, now-eliminated way to produce a zero-usage response; it does not touch the Pi-core trigger/display divergence itself, which remains reachable by any other cause of a zero- or malformed-usage response.

## Reading this record

`claude-code-cli` structurally cannot reuse prompt cache across ordinary Pi turns (fresh session id, no persistence, full-history requoting), so its reported context/cost grows with the full conversation size on every turn by design, not by a counting defect.
`xai`/`grok-4.3` demonstrated real cross-turn cache reuse in this test, with one unexplained cold-cache turn worth re-checking if this record is revisited.
Separately, Pi core's own auto-compact trigger reads a different value than the footer whenever the most recently checked response completes with zero or malformed usage - reproduced directly against Pi's own exported compaction functions, matching both a `7%`-displayed auto-compact firing and a `6.6%` -> `150.2%` jump after one action - and this is not caused by either provider, though either provider's cost profile can supply the large trailing content that makes the divergence large.
A `PATH`-dependent `spawn claude ENOENT` in `claude-code-cli`'s nested spawn was a third, independent finding, and one concrete way to produce the zero-usage response that trips the divergence above; it is now fixed (see above), leaving the Pi-core divergence itself as the sole open, unpatched mechanism.
None of the four findings in this record originate in Firstmate's own tracked `.pi/extensions/` or `bin/fm-session-start.sh`; both providers' session-start digest delivery was independently verified to happen at most once per session generation, capped at 512 KiB.
