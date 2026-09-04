# Delegationsrichtlinie

Operationalisiert Firstmates bestehende Orchestrator-Rolle (Firstmate `AGENTS.md` §1, §7). **Kein Ersatz** für Firstmate `fm-spawn`, `quota-array-dispatch` oder `config/crew-dispatch.json`.

> Evidenz mit Prefix **Firstmate** bezieht sich auf den [kunchenguid/firstmate](https://github.com/kunchenguid/firstmate)-Checkout (`$FM_HOME`), nicht auf lokales crew-knowledge `AGENTS.md`/`docs/`. Siehe `docs/README.md` § Evidenz-Pfade.

## Status Firstmate (Code-Evidenz)

| Verhalten | Status | Evidenz |
| --- | --- | --- |
| Firstmate delegiert projektbezogene Arbeit grundsätzlich | DOKUMENTIERT | Firstmate `AGENTS.md` §1: „Outside hard rule 1 … you do not do project-specific work yourself“ |
| Spawn nur über `fm-spawn.sh` | IMPLEMENTIERT | Firstmate `bin/fm-spawn.sh`, Firstmate `AGENTS.md` §7 |
| Primary darf Harness-Delegationstools nicht nutzen | IMPLEMENTIERT | Firstmate `bin/fm-subagent-pretool-check.sh`, Firstmate `docs/subagent-guard.md` |
| Automatischer Delegations-Check vor jeder Primary-Aktion | NICHT VORHANDEN | Kein Gate in Firstmate vor Tool-Use auf `projects/` **[UNVERIFIED: nur negativ durch Codeabsence]** |
| Kontext-Dependency-Klassifikation | NICHT VORHANDEN | Kein Firstmate-Modul; Policy in `knowledge/delegation.json` |

## Harte Delegationsregel

Für **jede** eingehende Aufgabe zuerst:

> Kann ein Worker das zuverlässig erledigen?  
> **Ja → sofort delegieren** (Brief, optional Skill `crew-knowledge` für Profile, `fm-spawn`).  
> **Nein →** Ausnahme benennen und dokumentieren.

Nicht: erst selbst analysieren, planen, Dateien lesen, dann „irgendwann“ spawnen.

### Zulässige Firstmate-Eigenarbeit

- Routing, Kontextauswahl, Zerlegung, Abhängigkeiten
- Statusauswertung (`fm-crew-state.sh`), Ergebnisbewertung, Eskalation
- Zusammenführung von Worker-Ergebnissen
- Fleet-/State-Verwaltung, Brief/Spawn/Send/Control
- Kurze captain-relevante Kommunikation (Firstmate `AGENTS.md` §9 Etikette)

### Unzulässig als Normalfall

- Projektspezifische Implementierung, ausführliche Analyse, Bug-Recherche, Architekturarbeit, Tests/Doku im Projekt
- Das ist ein **Delegationsfehler**, nicht Effizienz

Ausnahmen (Firstmate bestehend): Hard Rule 1 captain-approved project operation; leere Fleet + shared tracked material; reine Supervision-Reads.

## Kein Firstmate-Flaschenhals

Diese Policy soll **nicht** jede Kleinigkeit durch Firstmate-Kopf laufen lassen.

- Einfache, klar begrenzte Aufgaben: **direkt delegieren**, ohne Microtask-Zerlegung
- Microtasking nur bei plausibem Vorteil (Parallelität, isolierte Verifikation)
- Skill `crew-knowledge` + `quota-axi` sind **optional** vor Spawn, kein Pflicht-Audit pro Slice

## Ship vs. Scout vs. Ausführungsmodus

| Konzept | Owner | Bedeutung |
| --- | --- | --- |
| **Ship / Scout** | Firstmate Intake (Firstmate `AGENTS.md` §7) | Deliverable-Typ: Code/PR vs. `data/<id>/report.md` |
| **Execution Mode** | `knowledge/delegation.json` | **Wie** delegiert wird: direct, microtask, context pack, full-context, scout→ship |

Scout→Ship ist kein Duplikat: Scout ist Intake-Klassifikation; „SCOUT_THEN_SHIP“ ist ein Ausführungsmodus bei hoher Unsicherheit.

## Modellwahl

Weiterhin **nur** über bestehenden Firstmate-Dispatch:

1. Firstmate `config/crew-dispatch.json` / `crew_apply_dispatch` (optional)
2. Firstmate `quota-array-dispatch` bei Profil-Arrays
3. Konkrete Flags an Firstmate `bin/fm-spawn.sh`

Zusätzliche **Knowledge-Faktoren** (kein paralleles Routing): Context Dependency, Task Complexity, Change Risk, Required Reasoning, Repository Knowledge, Output Requirements. Sie informieren Brief-Inhalt und Moduswahl, nicht einen zweiten Router.

## Entscheidungsmodell

```
INPUT
  → Task Complexity
  → Context Dependency (VERY_LOW … VERY_HIGH)
  → Change Risk
  → Parallelizability
  → Expected Verification Cost
  → Microtask Benefit
  → EXECUTION MODE
```

Modi: `DIRECT_DELEGATION` | `MICROTASK` | `MICROTASK + CONTEXT PACK` | `FULL-CONTEXT DELEGATION` | `SCOUT → SHIP`

Maschinenlesbar: `knowledge/delegation.json`.

## Ownership-Markierung

| Bereich | Markierung |
| --- | --- |
| Spawn, Send, Control, Quota, Merge | FIRSTMATE EXISTING |
| Context Pack, Dependency Check, Failure-Katalog | KNOWLEDGE / POLICY |
| Automatischer Delegations-Gate, Evidence-Enforcement | FIRSTMATE EXTENSION REQUIRED |
