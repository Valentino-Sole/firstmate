# Beispiel: Einfacher Microtask (VERY_LOW)

**Szenario:** Typo in README, eine Zeile, kein Architekturkontext.

## Intake

- **Ship**, `direct-PR`, yolo off
- **Context Dependency:** VERY_LOW
- **Execution Mode:** DIRECT_DELEGATION (kein Split nötig)

## Firstmate (Orchestrator)

1. Brief mit `{TASK}` = exakte Zeile + Dateipfad
2. Skill `crew-knowledge` optional → `trivial_fix` / cheap profile
3. `fm-spawn.sh` — **kein** vorheriges Editieren durch Firstmate

## Context Pack (minimal)

```
TASK: Fix typo "recieve" → "receive" in README.md line 42.
GOAL: Correct spelling only.
RELEVANT FILES: README.md
RELEVANT SYMBOLS: n/a
DEPENDENCIES: none
KNOWN CONSTRAINTS: No other edits.
EXPECTED OUTPUT: Single-line patch, npm test if script exists (routine — no captain ask).
OUT OF SCOPE: Other files, refactors.
```

## Worker Evidence (Rückgabe)

```
FINDINGS: Typo fixed.
EVIDENCE: git diff README.md
FILES: README.md
SYMBOLS: n/a
CONFIDENCE: high
OPEN QUESTIONS: none
RECOMMENDATION: merge after review
```

## Anti-Pattern

Firstmate liest README, fixt selbst, spawnert dann „zur Kontrolle“ → Delegationsfehler.
