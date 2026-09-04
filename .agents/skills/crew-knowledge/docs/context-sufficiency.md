# Context Sufficiency

Ein Microtask darf erst delegiert werden, wenn der **Context Pack** ausreicht. Worker dürfen nicht „irgendwie herausfinden“ müssen.

Schema: `knowledge/context-pack.json`.

## Pflichtfelder

| Feld | Inhalt |
| --- | --- |
| **TASK** | Konkrete Aktion für diesen Worker |
| **GOAL** | Akzeptiertes Ergebnis |
| **RELEVANT FILES** | Lesen/Ändern — leer nur bei VERY_LOW lokal |
| **RELEVANT SYMBOLS** | APIs, Typen, Routen, Config-Keys |
| **DEPENDENCIES** | Upstream/Downstream, Services, Daten |
| **KNOWN CONSTRAINTS** | Invarianten, Konventionen, Verträge |
| **EXPECTED OUTPUT** | Patch, Report-Abschnitt, Testliste, … |
| **OUT OF SCOPE** | Explizite Ausschlüsse |

## Bedingt: SYSTEM CONTEXT

Wenn Context Dependency **MEDIUM+** oder implizite Konventionen relevant:

- Architektur-Zusammenfassung
- State Machines, Event-Flüsse
- Auth-/Security-Grenzen
- Retry/Failure-Verhalten
- Externe Abhängigkeiten

## Sufficiency Gate

Frage vor Spawn:

> Könnte ein Worker das ohne versteckten Globalzustand erledigen?

| Antwort | Aktion |
| --- | --- |
| Ja | Microtask oder Direct Delegation |
| Nein | Pack erweitern, Scout, Full-Context, oder Zerlegung verwerfen |

## Context Dependency Check (vor Zerlegung)

Prüfliste (aus `context-pack.json`):

1. Globale Invarianten
2. API-/Datenmodell-Verträge
3. State Machines / Events
4. Nebenläufigkeit
5. Security Boundaries
6. Retry / Failure / externe Deps
7. Implizite Projektkonventionen

Was könnte ein Worker **ohne** Gesamtverständnis falsch entscheiden? → in **KNOWN CONSTRAINTS** oder **SYSTEM CONTEXT** aufnehmen.

## Integration in Firstmate-Briefs

Firstmate `bin/fm-brief.sh` ersetzt `{TASK}` mit Auftragstext — **Firstmate** muss Context-Pack-Felder im Brief-Body ergänzen, wenn Microtasks geplant sind.

> Evidenz mit Prefix **Firstmate** bezieht sich auf den [kunchenguid/firstmate](https://github.com/kunchenguid/firstmate)-Checkout (`$FM_HOME`). Siehe `docs/README.md` § Evidenz-Pfade.

Status Firstmate:

| Mechanismus | Status |
| --- | --- |
| Brief-Scaffold mit `{TASK}` | IMPLEMENTIERT (Firstmate `bin/fm-brief.sh`) |
| Validiertes Context-Pack-Schema | NICHT VORHANDEN (Policy in crew-knowledge) |
| Automatische Pack-Generierung | NICHT VORHANDEN |

## Beispiele

Siehe `examples/microtask-with-context-pack.md` und `examples/not-microtaskable.md`.
