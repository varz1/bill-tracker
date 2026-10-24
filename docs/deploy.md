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

## Access control

The API has no authentication. Put the Worker behind Cloudflare Access (Zero Trust) before storing real data.
