# Beispiel: Widersprüchliche Microtask-Ergebnisse

**Szenario:** Zwei parallele read-only Microtasks analysieren dieselbe API — unterschiedliche Schlussfolgerungen.

## Setup

Task A (readonly): „List all callers of PaymentService.charge“
Task B (readonly): „Document PaymentService.charge side effects“

Beide VERY_LOW/LOW — parallel ok.

## Konflikt

| Worker | FINDING |
| --- | --- |
| A | charge() only used in checkout.ts |
| B | charge() also invoked from cron/reconcile.ts |

## Falsches Verhalten (no blind synthesis)

Firstmate mittelt: „probably checkout only“ oder merged Reports ohne Evidenz.

## Richtiges Verhalten

1. **Konflikt benennen** in Supervision-Notiz
2. **Zusätzliche Evidenz:** dritter readonly grep-Task **oder** ein Full-Context Scout-Slice mit `rg PaymentService.charge`
3. **Evidence Chain** mit CONFIDENCE und FILES aktualisieren
4. Erst dann Ship-Entscheidung

Policy: `knowledge/delegation.json` → `evidenceChain.noBlindSynthesis`.

## Optional: Structured merge

```
FINDINGS: charge() used in checkout.ts and cron/reconcile.ts
EVIDENCE: rg output attached, both workers' FILE lists reconciled
CONFIDENCE: high after third pass
RECOMMENDATION: proceed with ship task including both call sites in CONTEXT
```

## Classification

Failure if skipped: **FIRSTMATE BUG** (supervision), not worker.
