# Dokumentation — Delegation & Microtasking

Policy und Beispiele für Firstmate-Orchestrierung. **Ersetzt Firstmate nicht** — siehe Firstmate `AGENTS.md`. Agent-Einstieg: [`../SKILL.md`](../SKILL.md).

| Dokument | Inhalt |
| --- | --- |
| [delegation-policy.md](delegation-policy.md) | Delegate-first, erlaubte Eigenarbeit, Entscheidungsmodus |
| [context-aware-microtasking.md](context-aware-microtasking.md) | Context Dependency, wann (nicht) splitten |
| [context-sufficiency.md](context-sufficiency.md) | Context Pack, Sufficiency Gate |
| [approval-policy.md](approval-policy.md) | Legitime Freigaben, Crewmate→Captain |
| [firstmate-failure-modes.md](firstmate-failure-modes.md) | Failure-Katalog, Abweichungstabelle, Grill-Checkliste |

## Knowledge JSON

| Datei | Inhalt |
| --- | --- |
| `../knowledge/delegation.json` | Execution modes, dependency levels, evidence chain |
| `../knowledge/context-pack.json` | Pflichtfelder Context Pack |

## Beispiele & Evaluation

- [`../examples/`](../examples/) — sechs Szenarien
- [`../evaluation/delegation-cases.md`](../evaluation/delegation-cases.md) — Fälle A–H

## Routing

Profile-Hinweise kommen aus `knowledge/task-classes.json` + `knowledge/profiles.json` und dem Skill-Workflow.
Finale Auswahl: Firstmate + Skill `quota-array-dispatch` + `bin/fm-spawn.sh`. Es gibt **keine** MCP-Tools mehr.

## Evidenz-Pfade

Status- und Evidence-Spalten mit Prefix **Firstmate** verweisen auf Dateien im [kunchenguid/firstmate](https://github.com/kunchenguid/firstmate)-Checkout (bzw. `$FM_HOME`), nicht auf dieses Repo. Relative Pfade ohne Prefix (`docs/…`, `knowledge/…`, `examples/`) sind lokal hier.
