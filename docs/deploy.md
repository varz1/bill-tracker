# Deploying to Cloudflare

The app is a single Worker that serves the built React app (Workers Static Assets) and the `/api/*` routes.
Config lives in [`wrangler.jsonc`](../wrangler.jsonc).

## Manual deploy

```sh
npx wrangler login
npm run deploy
```

The `BILL_DATA` KV namespace has no id in `wrangler.jsonc`; Wrangler provisions it on the first deploy.

## Git-connected deploy (Workers Builds)

Cloudflare dashboard → Workers & Pages → Create → Import a repository.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |
| Node version | from `.nvmrc` (24) |

`package.json` pins `packageManager` to an exact npm version, which is how Workers Builds selects npm.

## Calendar sync

`wrangler.jsonc` has a Cron Trigger (`*/15 * * * *`), so the Worker also runs on a schedule. There is nothing else to set up: the calendar links live in the same KV namespace, and no secrets or extra bindings are needed. Check runs under the Worker's **Logs** (one `calendar_sync` line per sync).

Free-plan limits that matter: 10 ms of CPU per run, 50 outbound `fetch` calls and 1,000 KV calls per run, 1,000 KV writes a day. A sync only writes shifts that changed, and a cron run syncs at most 3 employers.

To try the schedule locally: `npx wrangler dev --test-scheduled`, then open `/cdn-cgi/handler/scheduled`.

## Access control

The API has no authentication. Put the Worker behind Cloudflare Access (Zero Trust) before storing real data. This matters more once a calendar is linked: its link is a secret that anyone who has it can use to read your roster. The API only ever shows it masked, but it is stored in KV.
