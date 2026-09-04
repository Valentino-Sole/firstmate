# Knowledge pack

Datengetriebene Tabellen für den **crew-knowledge** Skill. Routing- und Policy-Updates gehören hierher.

## Basis-Knowledge

| Datei | Inhalt |
| --- | --- |
| `task-classes.json` | Task-Klassen (trivial → scout), Keywords, bevorzugte Profile |
| `providers.json` | Provider-Rollen (Claude, Codex, Cursor, Grok, Kimi), Harness- und Model-Muster |
| `profiles.json` | Konkrete `{harness, model, effort}`-Profile |
| `delegation.json` | Context Dependency, Execution Modes, Evidence Chain (Policy, kein Spawn) |
| `context-pack.json` | Pflichtfelder für Microtask Context Packs |

Delegation/Microtasking-Doku: [`docs/README.md`](../docs/README.md). Skill-Einstieg: [`../SKILL.md`](../SKILL.md).

## Optionale Ebenen

### A. Hersteller-Fakten (`manufacturers/`)

Offizielle Docs / Claims — Format siehe bestehende Einträge oder `.gitkeep` Platzhalter.

### B. Externe Benchmarks (`benchmarks/`)

Artificial Analysis, Coding-Benchmarks usw. — nur mit Source/Datum/Confidence.

### C. Lokale Crew-Evidenz (`local/`)

Optional aus no-mistakes Outcomes (Metriken only: Task-Klasse, Harness, Provider, Modell, Effort, Duration, Success, Tests, CI, Rework). **Keine** Code-Inhalte, **keine** Prompts.

## Source-Konflikt-Hierarchie

- „Was ist verfügbar?“: Live Discovery > Auth State > Manufacturer Website
- „Was kann es?“: Official Docs > Website > Discovery
- „Wie gut?“: Local Evidence > External Benchmarks > Manufacturer Claims

## Maintaining

Firstmate bleibt urteilsfähig: diese Tabellen sind Vorschläge, kein Ersatz für `quota-array-dispatch` oder `fm-spawn`.
JSON prüfen: `../scripts/validate-knowledge.sh`.
