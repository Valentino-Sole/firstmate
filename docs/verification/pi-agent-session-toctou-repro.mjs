// Reproduction: AgentSession.prototype.prompt() has no atomic check-and-set
// between reading `isStreaming` and committing to a new agent run inside
// _runAgentPrompt(). Two concurrent prompt() calls that are both idle at the
// moment they check isStreaming can both fall through to _runAgentPrompt(),
// which unconditionally sets _isAgentRunActive = true and invokes
// this.agent.prompt(messages) again - a genuine concurrent double-invocation.
//
// This drives the REAL, unmodified AgentSession.prototype.prompt from the
// installed @earendil-works/pi-coding-agent package against a minimal stub
// `this`, so the method under test is production code, not a reimplementation.
import { pathToFileURL } from "node:url";

const SDK_PATH = process.env.SDK_PATH;
const { AgentSession } = await import(pathToFileURL(SDK_PATH).href);
const promptFn = AgentSession.prototype.prompt;

let concurrentRunAgentPromptCalls = 0;
let maxConcurrentRunAgentPromptCalls = 0;
const events = [];

function log(label) {
  events.push(`${(performance.now()).toFixed(2)}ms ${label}`);
}

// Faithful to agent-session.js lines 747-760 (_runAgentPrompt): sets
// _isAgentRunActive = true as its very first (synchronous) statement, then
// awaits the underlying agent run.
async function fakeRunAgentPrompt(messages) {
  this._isAgentRunActive = true;
  concurrentRunAgentPromptCalls++;
  maxConcurrentRunAgentPromptCalls = Math.max(maxConcurrentRunAgentPromptCalls, concurrentRunAgentPromptCalls);
  log(`_runAgentPrompt ENTER (concurrent=${concurrentRunAgentPromptCalls}) messages=${JSON.stringify(messages).slice(0, 60)}`);
  try {
    // Simulate real inference/tool-call latency.
    await new Promise((r) => setTimeout(r, 40));
  } finally {
    concurrentRunAgentPromptCalls--;
    this._isAgentRunActive = false;
    log(`_runAgentPrompt EXIT`);
  }
}

function makeStubSession() {
  return {
    _isAgentRunActive: false,
    get isStreaming() {
      return this._isAgentRunActive;
    },
    _compactionAbortController: undefined,
    _pendingNextTurnMessages: [],
    _systemPromptOverride: undefined,
    _baseSystemPrompt: "base",
    promptTemplates: [],
    model: { provider: "test" },
    _modelRuntime: {
      hasConfiguredAuth: () => true,
      checkAuth: async () => "ok",
      isUsingOAuth: () => false,
    },
    _extensionRunner: {
      hasHandlers: () => false,
      emitInput: async () => ({ action: "pass" }),
      // A REAL before_agent_start handler in this repo
      // (.pi/extensions/fm-primary-turnend-guard.ts) awaits a spawned child
      // process here. This delay stands in for that genuine async gap - it is
      // not a contrived one - and is exactly the window a concurrently-fired
      // watcher wake (fm-primary-pi-watch.ts sendWake) races against.
      emitBeforeAgentStart: async () => {
        log("emitBeforeAgentStart (simulating a real extension awaiting a child process)");
        await new Promise((r) => setTimeout(r, 20));
        return undefined;
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
}

const session = makeStubSession();

log("captain call: prompt('real captain message') START");
const captainCall = promptFn.call(session, "real captain message", { source: "interactive" });

// Simulate fm-primary-pi-watch.ts's sendWake(): an unrelated background
// watcher-close callback calls pi.sendUserMessage(..., {deliverAs:"followUp"})
// with zero coordination with the interactive call above. sendUserMessage
// forwards to prompt() with streamingBehavior: "followUp" (agent-session.js
// sendUserMessage(), lines 1110-1138).
log("watcher wake: prompt('FIRSTMATE WATCHER WAKE...') START");
const wakeCall = promptFn.call(session, "FIRSTMATE WATCHER WAKE: stale", { streamingBehavior: "followUp", source: "extension" });

await Promise.all([captainCall, wakeCall]);

console.log(events.join("\n"));
console.log(`\nmaxConcurrentRunAgentPromptCalls = ${maxConcurrentRunAgentPromptCalls}`);
if (maxConcurrentRunAgentPromptCalls > 1) {
  console.log("REPRODUCED: two concurrent prompt() calls both reached _runAgentPrompt() concurrently.");
  process.exit(1);
} else {
  console.log("NOT REPRODUCED this run (race is timing-dependent).");
  process.exit(0);
}
