# Beispiel: Full-Context Delegation

**Szenario:** Riskanter Multi-File-Refactor mit cross-cutting Types (bereits klares Ship-Ziel, kein Scout nötig).

## Intake

- **Ship**, `no-mistakes`, yolo off
- **Context Dependency:** HIGH but bounded scope in brief
- **Execution Mode:** FULL-CONTEXT DELEGATION (single worker)

## Brief-Ausschnitt

```
TASK: Replace ad-hoc Result types with shared Result<T,E> across src/ (see list).
GOAL: All listed modules compile; tests green; no behavior change except typing.
RELEVANT FILES: [attached list of 12 files]
SYSTEM CONTEXT:
  - Result defined in src/lib/result.ts (authoritative)
  - No thrown errors in domain layer — return Result
KNOWN CONSTRAINTS: No public API signature changes
EXPECTED OUTPUT: One coherent PR series on branch fm/result-unify
OUT OF SCOPE: Unlisted packages
```

## Routing

Skill `crew-knowledge` → `hard_multi_file` → strong profile via `quota-array-dispatch`.

## Warum nicht Microtask

Verification Cost: jede Slice bräuchte Integrationstests über Modulgrenzen; Merge-Konflikte an Types.

## Firstmate

Spawn once; supervise via `fm-crew-state`; no firstmate edits in worktree.
