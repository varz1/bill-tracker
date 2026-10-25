# API

All bodies are JSON. Money is an integer in minor units (cents). Dates are `YYYY-MM-DD`.
Schemas live in [`src/shared/schemas.ts`](../src/shared/schemas.ts) and are shared with the frontend.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ ok: true }` |
| GET / POST | `/api/bills` | list → `{ items }`; create → `201 { item }` |
| GET / PATCH / DELETE | `/api/bills/:id` | PATCH takes any subset of the create fields |
| GET / POST | `/api/employers` | name (unique, ignoring case), contract, sync, colour (optional on create: a free palette colour is picked) |
| GET / PATCH / DELETE | `/api/employers/:id` | delete returns 409 while the employer still has shifts or payslips |
| GET / POST | `/api/shifts` | needs an existing `employerId`; created shifts are always `source: "manual"` |
| GET / PATCH / DELETE | `/api/shifts/:id` | |
| GET / POST | `/api/income` | one record per payslip, needs an existing `employerId` |
| GET / PATCH / DELETE | `/api/income/:id` | |
| GET / PATCH | `/api/settings` | `currency`, `weekStartsOn` |

Errors: `400 { error: "invalid_body", issues }` (Zod issues with field paths), `404 { error: "not_found" }`.

## KV layout

| Key | Value |
|---|---|
| `settings` | one settings object |
| `bill:<id>` · `employer:<id>` · `shift:<id>` · `income:<id>` | one record each; ids are ULIDs, so listing is oldest-first |

Listing does `kv.list({ prefix })`, then bulk `kv.get` in groups of 100 keys.
