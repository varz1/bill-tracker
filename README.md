# Bill Tracker

where is my money

Track recurring bills, shifts and income. Single currency, single user.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4
- **Backend:** Cloudflare Workers + [Hono](https://hono.dev)
- **Storage:** Workers KV
- **Sync:** Cron Trigger pulling a calendar (iCal) feed
- **Tooling:** Vitest, Zod, GitHub Actions

## Develop

Requires Node 24 (`.nvmrc`).

```sh
npm ci
npm run dev        # Vite + local Worker, KV simulated locally
npm run seed       # fill the running dev server with demo data (--reset replaces existing data)
npm test
npm run typecheck
```

## Deploy

```sh
npm run deploy     # vite build && wrangler deploy
```

API reference: [docs/api.md](docs/api.md).

Demo mode (a "made-up data" note and locked Settings) is on by default; turn it off in [`src/web/config.ts`](src/web/config.ts) for a real deployment.

Or connect the repo in Cloudflare (Workers Builds). Settings are in [docs/deploy.md](docs/deploy.md).
