# Beispiel: Scout → Ship

**Szenario:** „Warum schlägt Checkout in Production fehl?“ — Ursache unklar.

## Phase 1: Scout

```
fm-brief.sh <id> myshop --scout
fm-spawn.sh <id> myshop --scout --harness ... 
```

Deliverable: `data/<id>/report.md` — **kein PR**.

Scout Evidence Chain im Report: Felder laut `knowledge/delegation.json` → `evidenceChain.requiredFields` (Erläuterung: `docs/context-aware-microtasking.md`).

## Phase 2: Captain

Firstmate relayed Findings (§9 — outcomes not mechanics). Report empfiehlt Fix — **autorisiert Implementation nicht**.

## Phase 3: Ship

Captain: „Fix wie im Report Abschnitt 3.“

```
fm-promote.sh <id>   # preferred
# or new ship with explicit TASK referencing report sections
```

Execution Mode wechselt von SCOUT → Ship (FULL-CONTEXT or MICROTASK+PACK je nach Report).

## Ship/Scout vs Execution Mode

| | Scout/Ship (Intake) | Execution Mode |
| --- | --- | --- |
| Phase 1 | Scout deliverable | SCOUT (investigation) |
| Phase 2 | — | Captain decision |
| Phase 3 | Ship deliverable | DIRECT or FULL-CONTEXT |

Kein Widerspruch: Scout ist **was** geliefert wird; Mode ist **wie** delegiert wird.
