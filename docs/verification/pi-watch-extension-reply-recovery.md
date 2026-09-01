# Pi turn-settle reply recovery verification

Audience: maintainer verification.

This record supports the turn-settle reply recovery guarantee in [`watcher-continuity.md`](../watcher-continuity.md#turn-settle-reply-recovery).
Mechanism, contract, and active limits remain in that linked guide.
Task-specific chronology and the captain decision that chose detection-and-recovery over a submission-serializing mutex remain in private task evidence.

## Root-cause reproduction

Reproduced 2026-09-01 against the installed `@earendil-works/pi-coding-agent` v0.84.3 (Node v22.23.2) with `docs/verification/pi-agent-session-toctou-repro.mjs`, tracked alongside this record.
The script drives the real, unmodified `AgentSession.prototype.prompt` from the installed package against a minimal stub `this` exposing only the fields and methods that method touches, so the method under test is production code, not a reimplementation.

Command:

```sh
SDK_PATH=/home/vsole/.local/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js \
  node docs/verification/pi-agent-session-toctou-repro.mjs
```

Observed output:

```
1274.78ms captain call: prompt('real captain message') START
1275.18ms emitBeforeAgentStart (simulating a real extension awaiting a child process)
1275.38ms watcher wake: prompt('FIRSTMATE WATCHER WAKE...') START
1275.41ms emitBeforeAgentStart (simulating a real extension awaiting a child process)
1295.77ms _runAgentPrompt ENTER (concurrent=1) messages=[{"role":"user","content":[{"type":"text","text":"real capta
1295.89ms _runAgentPrompt ENTER (concurrent=2) messages=[{"role":"user","content":[{"type":"text","text":"FIRSTMATE
1336.12ms _runAgentPrompt EXIT
1336.16ms _runAgentPrompt EXIT

maxConcurrentRunAgentPromptCalls = 2
REPRODUCED: two concurrent prompt() calls both reached _runAgentPrompt() concurrently.
exit=1
```

`exit=1` is the script's own "reproduced" signal (documented at the top of the script), not a test failure.
Two `prompt()` calls - one modeling a captain's interactive message, one modeling `fm-primary-pi-watch.ts`'s `sendWake` delivering a watcher wake via `pi.sendUserMessage(..., {deliverAs: "followUp"})` - both observed `isStreaming` as false and both reached `_runAgentPrompt` concurrently, each setting `_isAgentRunActive = true` and invoking the underlying agent run against the same session state.
The `emitBeforeAgentStart` delay in the stub (20ms) models a real, not contrived, async gap: `.pi/extensions/fm-primary-turnend-guard.ts`'s own `before_agent_start` handler spawns and awaits `bin/fm-sessionstart-run.sh` on session-start-classified generations, and any `before_agent_start` extension handler doing real async work opens the same window.

## Considered and rejected: prevention at the extension layer

An earlier iteration of this fix (`fm/firstmate-captain-input-haenger`, since reverted) gated `fm-primary-pi-watch.ts`'s `sendWake` on a `before_agent_start`/`agent_settled`-tracked busy flag, deferring delivery while a turn was known to be in flight.
An automated review caught that this does not close the reproduced race: `before_agent_start` fires only after `prompt()` has already passed its `isStreaming` check (agent-session.js `prompt()`, the branch at `if (this.isStreaming) { ... return; }` runs before any extension hook in that call), so a call already past that check sees the SAME state the busy-tracking gate would only start protecting later.
The two calls in the reproduction above never see `owner.busy` as true until after both have already committed to `_runAgentPrompt` - the gate protects an already-safe mid-turn window (where Pi's own native `followUp`/`steer` queueing already works correctly) while leaving the actual idle-vs-idle race it was built for fully open.
Closing the race with certainty would require serializing every `prompt()`-triggering call - interactive and extension-sourced alike - through Pi's earliest hook (`input`, which fires before the `isStreaming` check itself) with a real mutex held until each call's outcome commits.
That was rejected as disproportionate new risk (a novel synchronization primitive with its own deadlock/regression surface) for a rare race, in favor of the detection-and-recovery mechanism this record supports.

## Regression coverage

`tests/fm-turnend-guard.test.sh`'s reply-recovery tests (`test_pi_reply_recovery_*`) exercise `.pi/extensions/fm-primary-turnend-guard.ts`'s `agent_settled` handler directly against a mocked `pi`/`ctx`, covering the dangling-tool-call and fully-unanswered detection cases (including the common shape where the same assistant message carries a text preamble beside the unresolved call), the healthy no-op case, the idempotent bounded-retry-then-notice sequence and its reset after a healthy settle, the session-start digest and flushed inline-bash exclusions, the captain-abort exclusion against a still-nudged error stop, and the latch interleaving where a settle claimed by the supervision guard must not swallow the next unanswered episode.
Run: `bash tests/fm-turnend-guard.test.sh` (or `no-mistakes`-invoked `bin/fm-test-run.sh tests/fm-turnend-guard.test.sh`).
