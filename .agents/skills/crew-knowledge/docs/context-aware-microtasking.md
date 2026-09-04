# Context-aware Microtasking

Microtasking ist eine **Optimierungsoption**, keine Standardstrategie. Große Aufgabe ≠ viele kleine Aufgaben.

## Grundsatz

Vor jeder Zerlegung:

> Ist diese Teilaufgabe mit **begrenztem, aber ausreichendem** Kontext zuverlässig lösbar?

Wenn nein: kein Microtask — mehr Kontext, Scout, Full-Context-Worker, oder ein größerer Task.

## Context Dependency

| Stufe | Typische Arbeit | Microtasking |
| --- | --- | --- |
| **VERY_LOW** | Syntax, Symbolsuche, Muster-Check | Oft sinnvoll; kurzer Kontext |
| **LOW** | Ein Modul, eine API, begrenzte Tests | Normalerweise sinnvoll |
| **MEDIUM** | Mehrere Komponenten, Architekturkontext | Nur mit gezieltem Context Pack |
| **HIGH** | Datenfluss, Auth, Queues, Migrationen, Cross-Service | Nicht blind zerlegen |
| **VERY_HIGH** | Zentrale Architektur, Security-Modelle, implizite Abhängigkeiten | Full-Context oder Scout→Ship |

Definitionen: `knowledge/delegation.json` → `contextDependency.levels`.

## Wann Microtasking **nicht** besser ist

Prefer **ein Task**, wenn:

- Context Dependency HIGH oder VERY_HIGH
- Verifikationskosten vieler Slices > ein integrierter Durchlauf
- Gemeinsamer mutable State oder strikte Reihenfolge
- Integrationsrisiko an Schnittstellen

Prefer **Microtasks**, wenn:

- VERY_LOW/LOW und klare Grenzen
- Parallele read-only Scouts
- Unabhängige Dateien mit getrennten Tests
- Hohe Parallelisierbarkeit, geringes Merge-Konfliktrisiko

## Compression ≠ Loss

| Zulässig (Compression) | Unzulässig (Loss) |
| --- | --- |
| 100 Dateien → 5 relevante + Architekturregeln + API-Verträge | Auf 2 Dateien kürzen, obwohl Entscheidung vom Globalzustand abhängt |
| Explizite OUT_OF_SCOPE im Brief | Worker soll „Rest des Repos“ selbst erraten |

## Progressive Context Expansion

1. Minimaler Context Pack im Brief
2. Worker `blocked` oder widersprüchliche Evidenz → gezielte Erweiterung (Dateien, Invarianten)
3. Erneut Context Dependency prüfen
4. Erst dann Full-Context-Worker oder Scout

Nicht sofort Full-Context, wenn ein kleiner Pack reichen könnte — aber auch nicht Microtasks ohne Pack.

## Evidence Chain (Worker → Firstmate)

Strukturierte Übergabe zwischen Agenten:

- **FINDINGS** — was gilt
- **EVIDENCE** — wie belegt (Tests, Logs, Code-Stellen)
- **FILES** / **SYMBOLS**
- **CONFIDENCE** — high / medium / low
- **OPEN_QUESTIONS**
- **RECOMMENDATION**

Keine unbelegten Behauptungen. Bei Widerspruch: **keine blinde Synthese** — Konflikt benennen, mehr Evidenz oder größerer Kontext-Task.

Firstmate erzwingt dieses Format heute **nicht** strukturell (NICHT VORHANDEN); Brief-Vorlage in `examples/` und Policy hier.

## Modell-/Harness-Wahl

Nach Modus und Dependency Brief schärfen, dann bestehenden Dispatch nutzen (Skill `crew-knowledge`, `quota-array-dispatch`, `fm-spawn`). Context Dependency VERY_LOW rechtfertigt günstigere Profile **nur** wenn Qualitätsboden (`task-classes.json` `qualityFloor`) passt.

## Bezug zu Routing-Hilfen

| Hilfe | Rolle bei Microtasking |
| --- | --- |
| Skill `crew-knowledge` | Profile-Hinweise pro Task-Klasse — **nicht** Zerlegung |
| `quota-axi` + `quota-array-dispatch` | Quota bei parallelen Microtasks / Profil-Arrays |
| `config/crew-dispatch.json` | NL-Regeln (Firstmate Authority) |

Kein paralleles Routing in diesem Repo.
