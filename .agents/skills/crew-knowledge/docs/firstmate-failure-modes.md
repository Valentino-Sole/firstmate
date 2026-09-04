# Firstmate Failure Modes

Bekannte Fehlverhalten und Lücken — mit Firstmate-Evidenz. Keine Vermutungen als Fakten; unbelegt = **[UNVERIFIED]**.

Enthält: Delegations-Eigenarbeit, Captain-Chat-Rauschen, Approval, Crewmate→Captain, Abweichungstabelle.

> Evidenz mit Prefix **Firstmate** bezieht sich auf den [kunchenguid/firstmate](https://github.com/kunchenguid/firstmate)-Checkout (`$FM_HOME`), nicht auf lokales crew-knowledge `AGENTS.md`/`docs/`. Relative Pfade ohne Prefix sind lokal hier. Siehe `docs/README.md` § Evidenz-Pfade.

---

## 1. Delegation: unnötige Eigenarbeit

### Problem

Firstmate erledigt projektbezogene Arbeit selbst, obwohl ein Worker verfügbar ist.

### Current Behaviour

- Regel existiert: Firstmate `AGENTS.md` §1 delegiert Coding/Investigation/Planning an Crewmates.
- Primary-Guard blockiert Harness-Delegationstools (Firstmate `docs/subagent-guard.md`).
- **Kein** erzwungener „delegate-first“-Check vor Read/Edit in `projects/`.

### Expected Behaviour

Jede Aufgabe: delegierbar → sofort Brief + `fm-spawn`, ohne Voranalyse durch Firstmate.

### Root Cause (belegt + plausibel)

| Ursache | Evidenz / Klassifikation |
| --- | --- |
| Prompt-Konflikt: „hilf dem Captain“ vs. Delegation | DOKUMENTIERT Widerspruchspotential in Firstmate `AGENTS.md` §1 vs. §9 Hilfsbereitschaft |
| Fehlender Delegations-Check vor Tool-Use | NICHT VORHANDEN in Firstmate-Code |
| Vorarbeit vor `fm-spawn` (Repo lesen, Plan schreiben) | FEHLERHAFT vs. Policy; häufiges Agent-Verhalten **[UNVERIFIED quantitativ]** |
| Wiedereinstieg nach Worker-Ergebnis (selbst fixen) | DOKUMENTIERT verboten außer Supervision; Praxis **[UNVERIFIED]** |
| Hard Rule 1 Ausnahme zu breit interpretiert | FEHLERHAFT wenn Scope inferiert wird |

### Impact

Captain sieht Firstmate-Token statt Worker-Output; langsamer Fleet-Durchsatz; Supervision blindet.

### Proposed Fix

| Fix | Owner |
| --- | --- |
| Knowledge: `docs/delegation-policy.md`, Brief-Beispiele | crew-knowledge ✓ |
| Pre-Tool Gate: project path → require spawn or explicit exception | FIRSTMATE EXTENSION REQUIRED |
| Session-Start Nudge: „delegate-first“ | FIRSTMATE EXTENSION OPTIONAL |

---

## 2. Captain Chat Noise

### Problem

Captain sieht Systemevents, Watcher, Status, Heartbeats, Tool-Output, Crew-Lifecycle.

### Current Behaviour

| Mechanismus | Status |
| --- | --- |
| „Interne Mechanik nicht captain-facing“ | DOKUMENTIERT Firstmate `AGENTS.md` §8–§9 |
| Status-Dateien append-only, nicht verbatim relay | DOKUMENTIERT Firstmate `AGENTS.md` §9 |
| Watcher absorbiert benign wakes | IMPLEMENTIERT Firstmate `docs/architecture.md` |
| Away-Mode batched digest | IMPLEMENTIERT Firstmate `AGENTS.md` §8 |
| „Captain, shipshape.“ für no-op | DOKUMENTIERT Firstmate `AGENTS.md` §9 |

### Expected Behaviour

Captain Chat = Auftrag + echte Rückfrage + echter Blocker + relevantes Ergebnis (PR-URL, Findings, Entscheidung).

### Root Cause bei Verstößen

| Ursache | Klassifikation |
| --- | --- |
| Firstmate paraphrasiert nicht (verbatim Status) | FIRSTMATE BUG |
| Harness zeigt Tool-Output im Primary-Chat | HARNESS LIMITATION |
| Herdr/Pi Lifecycle-Meldungen sichtbar | HERDR/HARNESS LIMITATION |
| Worker schreibt captain-facing Prosa in Status | Brief-Verstoß / FIRSTMATE BUG (steer) |

### Proposed Fix

- Transport/Harness-Ursache: nicht nur Prompt verschärfen — aggregieren oder intern halten.
- Knowledge: Übersetzungsregeln in Firstmate `AGENTS.md` §9 bleiben authoritative; crew-knowledge verweist.

---

## 3. Manuelle Freigaben an falscher Stelle

Siehe `docs/approval-policy.md`.

### Current Behaviour

No-Mistakes ask-user ist IMPLEMENTIERT; Authority in Firstmate `.agents/skills/ask-user-authority/SKILL.md`.

### Failure Pattern

Worker oder Firstmate fragt Captain für Routine-Fortsetzung → **illegitim**.

### Proposed Fix

Brief-Scaffold: „Do not ask captain for routine continuation“ (Ship-Brief Pattern in `examples/`).

---

## 4. Unangemeldete Crewmate-Interaktion

| Fall | Typische Klassifikation |
| --- | --- |
| Crewmate wartet auf Captain-Eingabe | FIRSTMATE BUG (Brief) / HARNESS Trust |
| Crewmate fordert illegitime Freigabe | Brief-Verstoß |
| Unterbricht Kontrollfluss | FIRSTMATE BUG / HARNESS |
| Delegiert Firstmate-Entscheidung an Captain | Brief-Verstoß; ask-user nur via Firstmate |
| Wartet auf Tool/Trust-Prompt | HARNESS LIMITATION; Firstmate `harness-adapters` |

Hard Rule 4: Crewmates **never** address captain — IMPLEMENTIERT als Regel; Durchsetzung im Worker-Brief.

---

## 5. Fehlende / falsche Delegation

| Muster | Erwartung |
| --- | --- |
| Kein Spawn trotz Ship-Intent | Delegationsfehler |
| Scout statt Ship ohne Unsicherheit | Falsche Intake-Klassifikation (Firstmate `AGENTS.md` §7) |
| Parallel Scout + Ship ohne Autorisierung | Verboten (Firstmate `AGENTS.md` §7) |
| Falscher Execution Mode (Microtask ohne Pack) | Knowledge-Fix + Brief |

---

## 6. Kontext: zu groß / zu klein

| Failure | Beschreibung |
| --- | --- |
| Übertragung ganzer Repos | Context Loss-Risiko umgekehrt: Noise; komprimiere gezielt |
| Microtask ohne SYSTEM CONTEXT | Worker rät falsch → `docs/context-sufficiency.md` |
| „Klein = billig = besser“ | Policy `microtaskNotAlwaysBetter` |

---

## 7. Firstmate-Abweichungen (Teil 20)

| Verhalten | Status | Evidenz |
| --- | --- | --- |
| Delegate-first vor Primary-Tool-Use auf `projects/` | NICHT VORHANDEN | Kein Gate in Firstmate; Policy in `docs/delegation-policy.md`, `knowledge/delegation.json` |
| Context-Dependency-Modell (VERY_LOW…VERY_HIGH) vor Split | NICHT VORHANDEN | Kein Firstmate-Classifier; Policy in `docs/context-aware-microtasking.md`, `knowledge/delegation.json` |
| Context Pack / Brief-Schema bei Microtasks | TEILWEISE | Brief-Tools Firstmate `bin/fm-brief.sh`; Schema nicht erzwungen — `knowledge/context-pack.json`, `examples/` |
| Evidence Chain in Scout-Reports | TEILWEISE | Struktur optional in Praxis; Felder in `knowledge/delegation.json` `evidenceChain`, `docs/context-aware-microtasking.md` |
| Captain-Chat ohne Noise (§9) | DOKUMENTIERT | Firstmate `AGENTS.md` §9; Katalog `docs/firstmate-failure-modes.md` §2 |
| ask-user Authority (Worker beantwortet nicht selbst) | IMPLEMENTIERT | Firstmate `AGENTS.md` §7, `docs/approval-policy.md`, Firstmate `.agents/skills/ask-user-authority/SKILL.md` |
| Primary nutzt keine Harness-Delegationstools | IMPLEMENTIERT | Firstmate `bin/fm-subagent-pretool-check.sh`, Firstmate `docs/subagent-guard.md` |
| Ein Router: `quota-array-dispatch` (kein Parallel-Router in crew-knowledge) | IMPLEMENTIERT | Firstmate `config/crew-dispatch.json`, `knowledge/delegation.json` ownership |
| Ship/Scout Intake getrennt von Execution Mode | DOKUMENTIERT | `docs/delegation-policy.md` Tabelle Ship/Scout vs Mode; `knowledge/delegation.json` `executionModes` |
| Supervision via `fm-crew-state` | IMPLEMENTIERT | Firstmate `bin/fm-crew-state.sh` |
| Keine blinde Synthese bei Konflikt zweier Microtasks | TEILWEISE | Policy `evidenceChain.noBlindSynthesis` in `knowledge/delegation.json`; kein Merge-Gate in Firstmate |

---

## Grill-Checkliste (Captain)

| Frage | Antwort |
| --- | --- |
| Weniger Eigenarbeit? | Policy + Brief-Beispiele; Code-Gate fehlt noch |
| Kontextbewusstes Microtasking? | Ja, JSON + docs |
| Context-Loss-Risiko adressiert? | compressionVsLoss + sufficiency |
| Zweite Routing/Approval-Engine? | Nein — nur Policy |
| Duplikate zu Firstmate? | Ship/Scout vs Execution Mode getrennt dokumentiert |
| Firstmate-Flaschenhals? | direct delegation für Simple Cases |
| Konflikterkennung? | evidenceChain, noBlindSynthesis |
| Crewmate→Captain? | Hard Rule 4 + failure §4 |
| Chat-Noise? | failure §2 + Firstmate `AGENTS.md` §9 pointer |
| Ship/Scout-Widersprüche? | Tabelle delegation-policy |
| Behauptete Fähigkeiten code-belegt? | Status-Spalten mit Pfaden |
