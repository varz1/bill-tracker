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
- Averages only use weeks that are fully paid, so shifts still waiting on a payslip don't drag them down. A fortnightly payslip counts in its second week.

**General**
- One currency, chosen in Settings. Amounts are stored as whole cents and never converted.
- Demo mode shows a "made-up data" note and locks Settings.
- Planned: sync shifts from a calendar (iCal) feed on a schedule.

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
Turn off demo mode for a real deployment in [`src/web/config.ts`](src/web/config.ts).

## Docs

- [API reference](docs/api.md)
- [Deploying to Cloudflare](docs/deploy.md)
