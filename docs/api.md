# API

All bodies are JSON. Money is an integer in minor units (cents). Dates are `YYYY-MM-DD`.
Schemas live in [`src/shared/schemas.ts`](../src/shared/schemas.ts) and are shared with the frontend.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/config` | `{ config: { demo, settingsLocked, calendarTtlMs } }`, how this deployment is set up (the `DEMO` variable) |
| GET / POST | `/api/bills` | list → `{ items }`; create → `201 { item }` |
| GET / PATCH / DELETE | `/api/bills/:id` | PATCH takes any subset of the create fields |
| GET / POST | `/api/employers` | name (unique, ignoring case), contract, sync, colour (optional on create: a free palette colour is picked) |
| GET / PATCH / DELETE | `/api/employers/:id` | delete returns 409 while the employer still has shifts or payslips |
| GET / POST | `/api/shifts` | needs an existing `employerId`; created shifts are always `source: "manual"` |
| GET / PATCH / DELETE | `/api/shifts/:id` | |
| GET / POST | `/api/income` | one record per payslip, needs an existing `employerId` |
| GET / PATCH / DELETE | `/api/income/:id` | |
| GET / PUT / DELETE | `/api/employers/:id/calendar` | the employer's calendar link; see [Calendar sync](#calendar-sync) |
| POST | `/api/employers/:id/sync` | start a sync now; `202` at once, the result shows in the calendar status |
| GET / PATCH | `/api/settings` | `currency`, `weekStartsOn`, `timeZone` (IANA name; default `Australia/Sydney`) |

Employers also take `breakRule` and `breakMinutes` (see below). `sync` follows the calendar link: it is `calendar` exactly while a link exists, and `PATCH` can't change that (`400 no_calendar`, `409 calendar_linked`).

Errors: `400 { error: "invalid_body", issues }` (Zod issues with field paths), `404 { error: "not_found" }`.

## KV layout

| Key | Value |
|---|---|
| `settings` | one settings object |
| `bill:<id>` · `employer:<id>` · `shift:<id>` · `income:<id>` | one record each; ids are ULIDs, so listing is oldest-first. Calendar shifts use a stable `cal-…` id instead |
| `calsrc:<employerId>` | the employer's calendar link (a secret) and optional title filter |
| `calstate:<employerId>` | how the last syncs went, plus fingerprints used to skip unchanged work |

Listing does `kv.list({ prefix })`, then bulk `kv.get` in groups of 100 keys.

## Calendar sync

An employer can take its shifts from an iCalendar feed (any public `https://` or `webcal://` link, such as an Apple, Google or Outlook roster). Shifts that come from the calendar have `source: "calendar"`; the calendar is their only source of truth.

| Call | Behaviour |
|---|---|
| `PUT /api/employers/:id/calendar` `{ url, match? }` | links the calendar and starts a first sync in the background (`202`). `match` keeps only events whose title contains it. `400 invalid_url` for anything but a public https link; `409 too_many_calendars` past the limit below; `429 too_soon` within 30 seconds of the last sync |
| `GET /api/employers/:id/calendar` | `{ calendar: { linked, url, syncing, expiresAt?, lastSuccessAt, lastError, zone, result } }`. `url` is masked; the real link is never returned. `expiresAt` is only set on a public demo |
| `DELETE /api/employers/:id/calendar?shifts=keep\|delete` | unlinks. `keep` turns the calendar shifts into manual ones; `delete` removes them. The choice is required (`400`), and a running sync blocks it (`409 sync_running`) |
| `POST /api/employers/:id/sync` | `202`; `409 no_calendar` if there is no link; `429 too_soon` within 30 seconds of the last sync |

Calendar shifts can't be edited or deleted one by one: `PATCH` and `DELETE` on them return `403 { error: "calendar_managed" }`. Manual shifts are never touched by a sync, even on the same day. `DELETE /api/employers/:id` is refused while the employer is linked (`409 calendar_linked`) or has shifts or payslips (`409 employer_in_use`). `DELETE /api/employers/:id?cascade=all` deletes the employer together with its calendar link, calendar shifts, own shifts and payslips (`409 sync_running` while a sync is running, and then nothing is changed).

**What a sync does.** It reads every event in the calendar, past and future, turns each into a shift (paid hours = length minus the unpaid break below), and creates, updates or deletes only that employer's calendar shifts. A shift that has already happened is never deleted (it can still be corrected) even if the calendar stops listing it. If the calendar can't be read, or comes back empty while shifts exist, nothing is deleted and `lastError` says why (`timeout`, `network`, `http_<status>`, `not_a_calendar`, `too_large`, `bad_redirect`, `too_many_redirects`, `empty_calendar`, `interrupted`). `interrupted` means a run was stopped before it finished. Repeating events (`RRULE`) are not expanded; they are counted in `result.recurring`.

Redirects are followed by hand, at most 3, and each one has to be a public https link again. A calendar shift's id is `cal-<employer>-<event>`, so one employer's can be listed on their own. Unlinking with `keep` leaves those ids on the kept shifts; if the calendar is linked again, a kept shift is left as it is and not overwritten.

**Public demo.** With `DEMO` set to `"true"` (see `wrangler.jsonc`) the API stays open but a calendar can't cost much: at most 3 employers can be linked at once (20 otherwise), and a link is removed after a day together with the shifts it brought in. `PATCH /api/settings` returns `403 settings_locked`. `GET /api/config` returns `{ config: { demo, settingsLocked, calendarTtlMs } }`, which is what the page reads. Shifts the visitor entered, and the employer, stay. Anyone can read the data of a public demo, so the form tells visitors to use a test calendar.

**When.** A Cron Trigger runs every 15 minutes and syncs up to 3 linked employers that are due (last success over 45 minutes ago, last attempt over 10 minutes ago), longest-waiting first.

**Time zone.** Dates and times use the zone the calendar names (`X-WR-TIMEZONE`), else the zone most of its events use, else `settings.timeZone`. The one used is reported in `zone`.

**Unpaid breaks.** An employer's `breakRule` decides how much of an event is unpaid; `breakMinutes` (30, 45 or 60) is the length of one break. Default `none`.

| `breakRule` | Takes one break | Takes a second |
|---|---|---|
| `none` | never | never |
| `over5` | event longer than 5 h | |
| `over5_twice10` | longer than 5 h | 10 h or more |
| `atLeast5` | 5 h or more | |
| `over6` | longer than 6 h | |
| `over4_5` | longer than 4.5 h | |

Those come from the break clauses of the Fair Work modern awards as at 1 July 2026 (retail: `over5_twice10`; hospitality: `over6`; fast food and restaurants: `atLeast5`; cleaning: `over4_5`; clerks, pharmacy, aged care, children's services, security, storage, health professionals and building: `over5`). Shiftworkers' breaks are often paid, and an enterprise agreement can differ: check your own contract.
