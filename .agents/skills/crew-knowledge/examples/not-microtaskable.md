# Beispiel: Bewusst NICHT microtaskbar (HIGH)

**Szenario:** Auth-Flow von Session-Cookie über API-Gateway bis Worker-Queue ändern; Retry und Idempotenz betroffen.

## Intake

- **Scout** zuerst (Unsicherheit ob Cookie→JWT Migration nötig)
- **Context Dependency:** HIGH → nach Scout ggf. **FULL-CONTEXT DELEGATION** Ship
- **Execution Mode:** SCOUT → SHIP (kein Microtask-Split)

## Warum kein Microtask

| Check | Ergebnis |
| --- | --- |
| Global invariants | Session + queue ack semantics |
| API contracts | Gateway + internal RPC |
| State machines | Login → refresh → revoke |
| Security boundaries | Cookie flags, CSRF |
| Retry/failure | Idempotent enqueue |

Worker ohne SYSTEM CONTEXT würde lokal „fixen“ und Globalzustand brechen → **Context Loss**.

## Firstmate

1. Scout-Brief: reproduzierbarer Report in `data/<id>/report.md`
2. Captain autorisiert Implementation separat
3. `fm-promote.sh` oder neuer Ship mit vollem Pack — **ein** Worker, nicht 5 parallele Slices

## Compression (ok)

Scout-Report fasst 80 Dateien auf: Diagramm Datenfluss + 8 Schlüsseldateien + Invariantenliste — **kein** Loss der Security-Grenzen.

## Anti-Pattern

„Slice 1: cookie parser, Slice 2: queue consumer“ ohne shared SYSTEM CONTEXT.
