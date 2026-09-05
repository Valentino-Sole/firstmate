# Approval Policy

Legitime vs. illegitime Freigaben — für Firstmate, Crewmates und Gates. **Keine zweite Approval-Engine** in crew-knowledge.

> Evidenz mit Prefix **Firstmate** bezieht sich auf den [kunchenguid/firstmate](https://github.com/kunchenguid/firstmate)-Checkout (`$FM_HOME`), nicht auf lokales crew-knowledge. Siehe `docs/README.md` § Evidenz-Pfade.

## Legitim: Captain oder konfigurierte Authority

| Situation | Owner | Evidenz |
| --- | --- | --- |
| PR-Merge | Captain explizit oder `yolo` + grüne CI | Firstmate `AGENTS.md` §1 Rule 2, §7 |
| Destructive / irreversible / security-sensitive | Captain | Firstmate `AGENTS.md` §1, §7, §9 |
| Echte **ask-user** Findings (No-Mistakes) | Captain wenn `yolo` off; sonst Firstmate per `ask-user-authority` | Firstmate `AGENTS.md` §7, Firstmate `.agents/skills/ask-user-authority/SKILL.md` |
| Credentials / Login | Captain | Firstmate `AGENTS.md` §9 |
| Local-only Merge | Konfigurierte Merge-Authority | Firstmate `AGENTS.md` §7 |

## Nicht legitim (Routine)

Worker oder Firstmate sollen **nicht** stoppen und fragen:

- „Darf ich weiterlesen?“
- „Nächster Schritt ok?“
- „Datei X lesen?“
- „Tests ausführen?“
- „Autorisierten Auftrag fortsetzen?“

Autorisierte Ship/Scout-Briefs implizieren diese Schritte innerhalb des Scopes.

## Worker darf ask-user nicht selbst beantworten

Firstmate `AGENTS.md` §7: Implementation worker stoppt bei ask-user, Firstmate entscheidet oder eskaliert. Crewmate antwortet via `no-mistakes axi respond` **nur** nach Firstmate-Entscheidung mit `--resolve-key`.

## Crewmate → Captain

| Regel | Status |
| --- | --- |
| Crewmates kommunizieren nicht mit Captain | DOKUMENTIERT Hard Rule 4 |
| Status nur an Firstmate (`state/<id>.status`) | IMPLEMENTIERT Brief-Scaffold |
| Direkte Captain-Intervention im Crew-Fenster | Erwartet: Firstmate reconciliert (Firstmate `AGENTS.md` §1) |

Klassifikation bei Verstößen: siehe `docs/firstmate-failure-modes.md` § Unangemeldete Crewmate-Interaktion.

## Trust Dialogs (Harness)

Pi/Claude/Codex/Herdr Trust-Prompts: Firstmate bearbeitet nach Spawn über `harness-adapters` (Firstmate `AGENTS.md` §7 Dispatch). Das ist **kein** Captain-Approval für Routinearbeit.

| Ursache | Typ |
| --- | --- |
| Harness blockiert Tool bis Trust | HARNESS LIMITATION / EXPECTED (Firstmate handled) |
| Worker fragt Captain statt Firstmate | FIRSTMATE BUG / Brief-Verstoß |
| No-Mistakes ask-user Gate | NO-MISTAKES REQUIREMENT |

## Away Mode

`/afk`: Away mode **erweitert** Merge-, ask-user-, destructive- oder security-Authority **nicht** (Firstmate `AGENTS.md` §8).

## Knowledge vs. Firstmate

| | |
| --- | --- |
| Approval-Entscheidung | FIRSTMATE EXISTING |
| Diese Policy (was fragen, was nicht) | KNOWLEDGE / POLICY |
| Automatische Unterdrückung falscher Trust-UI | FIRSTMATE EXTENSION REQUIRED **[UNVERIFIED]** |
