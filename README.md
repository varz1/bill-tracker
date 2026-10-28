# Bill Tracker

Track recurring bills, shifts and income in one place. Single currency, single user.

## Features

**Bills**
- Weekly, fortnightly, monthly, quarterly or yearly bills, optionally with a fixed number of payments (loans, instalment plans).
- Total cost per week, fortnight, month and year. Bills that are fully paid off are left out.
- A 30-day timeline of what was due and what's coming. Tick a due date to mark it paid early.
- Each bill shows its next due date, its last payment, and how much is left on fixed-term ones.
- Month-end dates stay put: a bill due on the 31st falls on the last day of shorter months.

**Income**
- Design for Casual and Part-time Worker
- Keep one record per employer (name, colour, full-time, part-time or casual). Open an employer to add its payslips (gross, tax, net, super) and shifts (date, paid hours, optional start and end times).
- The Income page combines every employer: charts of gross pay by week, split by employer, and paid hours by week.
- Stats: total gross, net and tax, average net per week, average hours per week, average hourly rate (gross ÷ paid hours).
- **Calendar sync:** link an employer to a public iCal feed (any calendar app's subscription link, `https://` or `webcal://`) and its shifts follow your roster, with nothing to type.
  - Paid hours are the event's length minus the unpaid meal break. Pick the rule for your industry (retail, hospitality, fast food, restaurants, cleaning, clerks, pharmacy, aged care, children's services, security, storage, health, building) and a 30, 45 or 60 minute break. The rules come from the Fair Work awards as at 1 July 2026, so check your own contract.
  - Times use the time zone the calendar names, falling back to the one in Settings.
  - It syncs in the background every 15 minutes or so, when you open the employer, and on "Sync now". If the calendar can't be read, or comes back empty, nothing is deleted.
  - Calendar shifts are read-only; change them in the calendar. Shifts you enter yourself are never touched. Unlinking either keeps the calendar's shifts as your own or deletes them.
  - Shifts that have already happened are never deleted by a sync, even if the calendar stops listing them.
  - Repeating events aren't supported yet and are skipped.
- Averages only use weeks that are fully paid, so shifts still waiting on a payslip don't drag them down. A fortnightly payslip counts in its second week.

**General**
- One currency, chosen in Settings. Amounts are stored as whole cents and never converted.
- Demo mode (the `DEMO` variable in `wrangler.jsonc`) shows a "made-up data" note and locks Settings. Calendar sync stays open to visitors, but only a few calendars can be linked at a time and each is removed after a day.
- An employer can be deleted together with its shifts, payslips and calendar link, after a confirmation that says how many.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Recharts
- **Backend:** Cloudflare Workers + [Hono](https://hono.dev)
- **Storage:** Workers KV, one key per record
- **Tooling:** Zod, Vitest, GitHub Actions

## Develop

Requires Node 24 (`.nvmrc`).

```sh
npm ci
npm run dev        # Vite + local Worker, KV simulated locally
npm run seed       # fill the dev server with demo data (--reset replaces existing data)
npm test
npm run typecheck
```

## Deploy

```sh
npm run deploy     # vite build && wrangler deploy
```

Or connect the repo in Cloudflare (Workers Builds); settings are in [docs/deploy.md](docs/deploy.md).
For a real deployment set `"DEMO": "false"` in [`wrangler.jsonc`](wrangler.jsonc); that is the only switch (see [docs/deploy.md](docs/deploy.md)).

## Docs

- [API reference](docs/api.md)
- [Deploying to Cloudflare](docs/deploy.md), including the calendar sync schedule and limits
