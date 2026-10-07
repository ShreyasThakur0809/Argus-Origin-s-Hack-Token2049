# Deployment — production operations

What is hosted where, how to deploy, and how to check prod health.

## Production surface

| Piece | Host | URL | Deploy mechanism |
| --- | --- | --- | --- |
| Frontend | Render `argus402` `srv-db32j2m0tbcc738gakug` | **https://argus402.onrender.com** | git-deploy from `main`, rootDir `web` |
| Marketplace | Render | https://query402-marketplace.onrender.com | git-deploy from `main` |
| Facilitator | Render | https://query402-facilitator.onrender.com | git-deploy from `main` |
| ~~Frontend (Vercel)~~ | — | — | project deleted 2026-10-07 (cleanup); Render is the only frontend host |

Treat every push to `main` as a production restart of all three Render
services — during demo windows, push deliberately.

**Frontend is hosted on Render** (`argus402` web service, `web/` rootDir,
`npm install && npm run build` / `npx next start -p $PORT`). Two
hard-won facts: env vars are baked at build (set `MARKETPLACE_URL` +
`NODE_VERSION=24` BEFORE the first build or redeploy after), and
`PUT /services/{id}/env-vars` REPLACES the whole set — always send every
key. Service rename does not change the `.onrender.com` subdomain; it is
fixed at creation, so name it right the first time.

The Vercel `web` project was deleted 2026-10-07 during account cleanup —
its claimed subdomains had already wedged (every `domains add`-claimed
`*.vercel.app` name hung at the edge while system aliases responded;
suspected account-level throttle flag after mass alias churn). If Vercel
hosting is ever needed again, redeploy fresh — or skip it and use a real
custom domain (`argus402.com` was available, ~$10-12/yr).

## Cold starts and keepalive

Render free tier sleeps after ~15 min idle; first request then takes
~50–60s. `.github/workflows/keepalive.yml` pings facilitator + marketplace
every 10 minutes (facilitator first — the marketplace's boot probe
depends on it). Scheduled runs can lag; before a demo, warm them by hand:

```bash
curl -s https://query402-facilitator.onrender.com/supported
curl -s https://query402-marketplace.onrender.com/health
```

A failed keepalive run emails the repo owner — free uptime alerting.

## Health checklist

```bash
curl -s https://query402-marketplace.onrender.com/health
# {"ok":true,"network":"cardano:preprod","escrow":"masumi","source":"nownodes"}

curl -s https://query402-marketplace.onrender.com/catalogue | head -c 120
# "name":"Argus — on-chain intelligence for AI agents", 10 SKUs

curl -s https://query402-facilitator.onrender.com/supported
# kinds[0]: network cardano:preprod, assetTransferMethods incl. masumi

curl -s -o /dev/null -w '%{http_code}\n' \
  "https://query402-marketplace.onrender.com/dev/data/chain-status?chains=eth"
# must be 404 — DEV_BYPASS is off in production

curl -s https://argus402.onrender.com/api/q402/catalogue | head -c 120
# same catalogue JSON → proves the frontend → marketplace proxy
```

## Production environment

Render services carry their own env (`BLOCKFROST_PROJECT_ID`,
`SELLER_MNEMONIC`, `NOWNODES_API_KEY`, `CARDANO_NETWORK`, `ESCROW`,
`FACILITATOR_URL` pointing at the hosted facilitator). `DEV_BYPASS` must
stay unset in prod. Rotate any value that was ever pasted outside a
secret manager.

## Failure modes seen before (context for debugging)

- Marketplace crash-loop on boot: facilitator was asleep — wake it, then
  restart the marketplace.
- Vercel alias serving a stale/old build: re-deploy + confirm the alias
  target (`vercel alias ls`, re-`set` if needed).
- Local web app calling Render unexpectedly: `web/.env.local` sets
  `MARKETPLACE_URL`; `scripts/dev-start.sh --local` overrides it to
  localhost.
