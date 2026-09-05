---
name: crew-knowledge
description: >-
  Agent-only advisory skill for Firstmate crew routing, delegation-first
  decisions, context-aware microtasking, and quota-sensitive profile choice.
  Load before spawning or delegating work, choosing a crew profile, splitting
  into microtasks, recommending a primary model switch, or leaning on recorded
  local outcomes. Not a Pi extension and not a second dispatch engine.
user-invocable: false
metadata:
  internal: true
---

# crew-knowledge

Advisory workflow only. **Firstmate remains authority** for intake, `config/crew-dispatch.json`, `quota-array-dispatch`, and `bin/fm-spawn.sh`.
This skill supplies judgment aids from the knowledge pack in this repo — it does **not** register MCP tools, does **not** auto-spawn, and does **not** replace harness-adapters.

Do not paste this skill into captain chat on every turn.
Load and apply it only at the triggers below.

## When to load

Load before any of:

- spawning or delegating through `bin/fm-spawn.sh`
- choosing or overriding `{harness, model, effort}` at intake
- deciding whether to microtask / pack context / keep full-context
- parallel or quota-sensitive delegation
- recommending a primary `/model` switch
- leaning on recorded local crew outcomes

Skip only when the task is trivial **and** the profile is already fixed by standing policy with no ambiguity (explicit captain instruction naming harness/model/effort, or a single unambiguous matched dispatch rule).

## Authority boundaries

| Owner | Owns |
| --- | --- |
| Firstmate | Intake, spawn, lifecycle, approval, `crew-dispatch.json` match |
| `quota-array-dispatch` | Resolving a matched profile **array** from live quota |
| `harness-adapters` | Harness verify, model/provider discovery, effort fallback |
| `quota-axi` | Quota data only (never routes) |
| **This skill** | Task-class hints, profile candidates, delegation/microtask policy, evidence interpretation |

Never spawn through this skill. Pass concrete flags to `bin/fm-spawn.sh`.

## Procedure

### 1. Delegation-first (before project work)

Ask: can a worker do this reliably?

- **Yes → delegate immediately** (brief + spawn). Do not analyze/implement first.
- **No →** name the exception (hard rule 1, empty fleet shared material, supervision-only reads).

Allowed Firstmate work: routing, context selection, decomposition, status, merge decisions, fleet/state, brief/spawn/send, short captain communication.
Forbidden as default: project implementation, extended analysis, architecture, project tests/docs.

Details: `docs/delegation-policy.md`, tables in `knowledge/delegation.json`.

### 2. Context dependency before microtasking

Classify context need: `VERY_LOW` | `LOW` | `MEDIUM` | `HIGH` | `VERY_HIGH` (`knowledge/delegation.json`).

- Microtask only when the slice is solvable with a **complete context pack** (`knowledge/context-pack.json`, `docs/context-sufficiency.md`).
- If the worker would have to “figure it out”: enlarge the pack, scout first, or keep a full-context worker.
- Do not equate “smaller task” with “cheaper/better”.

### 3. Route advisory (profile candidates)

1. Read `knowledge/task-classes.json` and match class by task text + keywords (Firstmate still judges fit).
2. Resolve `preferredProfileIds` / `fallbackProfileIds` via `knowledge/profiles.json`.
3. Respect provider/harness facts in `knowledge/providers.json` — never infer provider from model name alone.
4. If a matched `crew-dispatch.json` rule already yields an array, load `quota-array-dispatch` and resolve there; treat this skill’s list as tie-break / rationale only.
5. Emit a short recommendation: class, ordered `{harness, model, effort}` candidates, why, confidence, and which evidence you used.

### 4. Quota balance (optional, when close)

Run `quota-axi` (default TOON; `--json` only if ambiguous) and prefer providers with headroom/runway when capability is similar.
Do not build a second quota engine.

### 5. Primary model suggestion (optional)

List authenticated session models from the active harness discovery (`harness-adapters` / Pi `/model` / CLI discovery). Recommend only among models actually available. Do not switch models yourself unless the captain asked.

### 6. Local evidence (optional)

If `knowledge/local/aggregated.json` (or raw `evidence.json`) exists, prefer measured local success/rework rates over manufacturer claims for the same task class.
Privacy: metrics only — never store prompts or code in evidence files.

Manufacturer / benchmark layers: `knowledge/manufacturers/`, `knowledge/benchmarks/` — see `knowledge/README.md` conflict hierarchy.

## Evidence hierarchy (short)

- Available now: live discovery > auth state > website
- Capabilities: official docs > website > discovery
- Quality: local evidence > external benchmarks > manufacturer claims

Mark unverifiable claims `[UNVERIFIED]`.

## Captain chat discipline

Apply silently. Explain a recommendation only when the captain asks or a non-obvious tradeoff needs a decision.

## Install

Symlink or copy this repo into a skills directory Firstmate/Pi already scans, e.g.:

```bash
ln -sfn /pfad/zu/firstmate-crew-knowledge ~/.agents/skills/crew-knowledge
# or into $FM_HOME/.agents/skills/crew-knowledge
```

Do **not** `pi install` this repo as a package — it is not a `pi-package` / extension.
