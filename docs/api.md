# API

All bodies are JSON. Money is an integer in minor units (cents). Dates are `YYYY-MM-DD`.
Schemas live in [`src/shared/schemas.ts`](../src/shared/schemas.ts) and are shared with the frontend.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ ok: true }` |
| GET / POST | `/api/bills` | list → `{ items }`; create → `201 { item }` |
| GET / PATCH / DELETE | `/api/bills/:id` | PATCH takes any subset of the create fields |
| GET / POST | `/api/shifts` | created shifts are always `source: "manual"` |
| GET / PATCH / DELETE | `/api/shifts/:id` | |
| GET / POST | `/api/income` | one record per payslip |
| GET / PATCH / DELETE | `/api/income/:id` | |
| GET / PATCH | `/api/settings` | `currency`, `locale`, `timeZone`, `weekStartsOn` |

Errors: `400 { error: "invalid_body", issues }` (Zod issues with field paths), `404 { error: "not_found" }`.

## KV layout

| Key | Value |
|---|---|
| `settings` | one settings object |
| `bill:<id>` · `shift:<id>` · `income:<id>` | one record each; ids are ULIDs, so listing is oldest-first |

Listing does `kv.list({ prefix })`, then bulk `kv.get` in groups of 100 keys.
