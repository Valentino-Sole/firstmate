# Beispiel: Microtask + Context Pack (MEDIUM)

**Szenario:** Neuer REST-Endpoint in bestehendem Modul; Auth-Middleware und Validierung müssen konsistent bleiben.

## Intake

- **Ship**, `no-mistakes`
- **Context Dependency:** MEDIUM
- **Execution Mode:** MICROTASK + CONTEXT PACK (max. 2 parallele Slices nur wenn Tests getrennt)

## Context Pack (im Brief)

```
TASK: Add POST /api/widgets handler in src/routes/widgets.ts
GOAL: Create widget with same auth + validation pattern as GET /api/widgets
RELEVANT FILES:
  - src/routes/widgets.ts
  - src/middleware/auth.ts
  - src/schemas/widget.ts
RELEVANT SYMBOLS: requireAuth, widgetCreateSchema, WidgetService.create
DEPENDENCIES: WidgetService, Postgres pool from src/db.ts
KNOWN CONSTRAINTS:
  - All routes use requireAuth (see auth.ts)
  - Zod schemas in src/schemas/
  - Errors: 401 unauthenticated, 400 validation
EXPECTED OUTPUT: Handler + unit test in tests/widgets.test.ts
OUT OF SCOPE: Admin UI, migration (separate task)
SYSTEM CONTEXT:
  - Express app mounts routes in src/app.ts under /api
  - No direct DB in route handlers — use WidgetService
```

## Routing

Skill `crew-knowledge` → `standard_ship`; Mode bleibt Firstmate + `quota-array-dispatch`.

## Progressive Expansion

Wenn Worker `blocked: missing WidgetService.create signature`:

1. Firstmate steuert Datei `src/services/widget.ts` in Pack (fm-send)
2. Re-evaluate — nicht sofort Full-Context unless zweiter Block

## Anti-Pattern

Microtask nur „add POST handler“ ohne auth/schema → Worker erfindet falsches Pattern.
