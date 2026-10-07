# Context

Session handoff file. Updated at the end of each working session, committed,
and pushed to main (pre-authorized for this file only).

Last updated: 2026-10-07

## What this is

**Argus** — on-chain intelligence for AI agents. Pay-per-query data: HTTP 402
via x402, Masumi escrow on Cardano preprod, NOWNodes supply across 120+
chains. TOKEN2049 Origins hackathon, tracks: Cardano Agentic Commerce +
NOWNodes Multichain Infrastructure.

Naming (FINAL, decided 2026-10-07): product brand is **Argus**; **Query402**
remains the payment-protocol/technical name ("powered by Query402" appears in
footer, layout meta, README, /catalogue `poweredBy`). Repo name, package
names, Render service names, and the `/api/q402` proxy path stay query402 —
infra unchanged. Sokosumi vendor/coworker register as "Argus" / slug `argus`
(fallbacks: argus-intel, argus402).

## Deployments

| Piece | Host | URL | Notes |
| --- | --- | --- | --- |
| Web (Next.js, `web/`) | **Render `argus402`** `srv-db32j2m0tbcc738gakug` (canonical) | **https://argus402.onrender.com** | Git-deploys from `main`, rootDir `web`. Env vars are baked at build time — set MARKETPLACE_URL/NODE_VERSION before first build. Vercel copy still exists but its claimed domains are wedged (see below). |
| Marketplace (`npm run server`) | Render `query402-marketplace` `srv-db0l0mjncjis739vs950` | https://query402-marketplace.onrender.com | Free tier, sleeps after ~15min idle. Auto-deploys on push to main. |
| Facilitator (`npm run facilitator`) | Render `query402-facilitator` `srv-db0l03m0tbcc738a70u0` | https://query402-facilitator.onrender.com | Free tier, sleeps. Marketplace exits if it cannot reach this at boot. Auto-deploys on push to main. |

Both Render services redeploy on ANY push to main — a docs-only commit
restarts the paid API. Keep pushes deliberate during demo windows.

Tooling: `render` CLI authed (`render logs -r <srv-id>`, `render restart <srv-id>`),
`vercel` CLI authed inside `web/` (`vercel ls`, `vercel curl <path>` bypasses SSO).

## Open work / pending decisions

- **Positioning (decided + shipped 2026-10-06)**: the line is
  "on-chain intelligence for AI agents". "Dune" stays only in competitive
  framing (the problem section), never the headline. "Marketplace" is
  demoted to the internal name for the server process; UI strings say
  "Argus" or "api". Renamed to Argus 2026-10-07 (see top). Shipped in
  `edeec1c`, live at https://argus402.vercel.app (Vercel deploys are
  CLI/manual — `vercel deploy --prod` from `web/`; no git integration).
- **src/server.ts fix shipped in `db45bf6`**: facilitator `/supported` probe
  retries every 8s for up to 4min before `exit(1)` (previously one 5s shot
  → crash loop when the free-tier facilitator was asleep). Render deploy
  `dep-db1vc3ek1f9s738h6ffg` live 2026-10-05 19:11 UTC.
- **Catalogue `name` shipped in `4e7ad43`**: `/catalogue` returns
  "Query402 — on-chain intelligence for AI agents". Deploy
  `dep-db20hmfavr4c73a48300` live, verified.
- **Cold-start fragility**: both Render services sleep; first request after
  idle takes ~40-60s and can outlast the web proxy's patience. Options:
  keepalive ping every ~10min (GitHub Action or cron-job.org hitting
  `/health` + `/supported`), or paid instance.
- **Stray file** `web/-w` in tree, safe to delete.
- **Not yet exercised against prod**: the dishonest-seller refund path
  (`?corrupt=1` → wrong proof hash → agent rejects → escrow auto-refunds).
  Runnable from the playground toggle; costs one payment cycle.

## Demo reliability

- `.github/workflows/keepalive.yml` (uncommitted): pings facilitator
  `/supported` then marketplace `/health` every 10 min via scheduled GitHub
  Action so free-tier Render never sleeps during demo windows. GH cron is
  best-effort/laggy — acceptable, a late ping still resets the idle timer.
  A failed run emails as a free uptime alert. Repo: SatyamDev803/Query402.

## Sokosumi coworker integration (in progress, uncommitted)

Track guidance (Token Origin team): the strongest Cardano Agentic Commerce
result is a useful agent live on https://preprod.sokosumi.com/ (Masumi
standard, Cardano preprod). Query402 is being registered as a Sokosumi
Coworker that answers tasks with the existing SKU engine.

Built so far (`tsc --noEmit` clean):

- `src/products/runSku.ts` — SKU dispatch + proof envelope extracted from
  `src/server.ts` into a shared module taking `SkuRequest`
  (`originalUrl` + optional `params`/`body`). `server.ts` imports it;
  behaviour unchanged.
- `src/coworker/routeTask.ts` — maps a task brief to a SKU. Accepts
  structured input (`{"sku":"whale-flow","params":{...}}`) or free text
  ("whale flow on bitcoin", "gas on ethereum and base"). Extracts chains,
  txids, addresses, block counts; returns null when unmappable or when a
  required arg (token/txid/address) is missing — worker then answers with
  the catalogue summary instead of guessing.
- `src/coworker/worker.ts` — `npm run coworker`, needs `COWORKER_ID` in
  `.env`. Loop: `tasks list` (operator OAuth) → READY tasks →
  `runtime start` → `runSku` in-process → `runtime complete
  --result-file` (JSON answer incl. sku/data/proof). Dedupe state in
  `.coworker-state.json`, results in `.coworker-results/` (both gitignored).
- `src/coworker/routeTask.test.ts` — runnable tsx smoke file: 9 briefs
  route correctly; live execute sample verified (chain-status sol, real
  NOWNodes tip + proof hash).
- `scripts/sokosumi-setup.sh` — guided, inspect-first registration chain
  (auth → vendor → provision → connect/approval → workspaces check →
  runtime key-import → worker env → smoke task + receipt). Safe to re-run.
- `.env.example` gained COWORKER_ID / COWORKER_ORG_SLUG / COWORKER_ORG_ID /
  COWORKER_POLL_MS. README + ARCHITECTURE document the coworker.
- Masumi docs confirm: Sokosumi listing settles in USDM/tUSDM
  (preprod PAYMENT_UNIT = policy 16a55b2a…2ddde + asset 0014df10745553444d);
  public marketplace listing is a Tally form (tally.so/r/nPLBaV) requiring
  a MIP-003-compliant API — the coworker path is separate and needs no
  public endpoint.

## Web restructure (uncommitted)

Site is page-wise now, not one long scroll:

- `/` hero + product shot + paths grid only.
- `/how-it-works` (new): problem → flow → guarantee → why Cardano → who
  uses it. First band kept off bg-surface so the translucent navbar reads
  clean; dark comparison card is a real div (not Card) because `cn()` is a
  naive join — a `bg-white`+`bg-night` conflict rendered white-on-white
  invisible content. Same latent class-conflict risk exists wherever
  Card gets a bg-* override.
- `/activity` absorbed the live-section content (demo card + receipts).
- Nav links are real routes; footer gained How it works + Playground.
- Verified: all six routes 200 on localhost:3000, web typecheck clean.

CLI facts learned (`sokosumi` v1.0.4, `npm i -g @masumi_network/sokosumi`):

- `tasks` commands take `--organization-slug` for orgs or NO flag for the
  personal workspace (OAuth default). `--personal` is rejected on
  `tasks list` — verified against the CLI error AND the official reference
  worker (masumi-network/demo-agent-token2049, branch
  feat/token2049-event-guide, cloned at /tmp/demo-agent-token2049).
- Reference-worker alignment applied: `tasks list --status READY
  --coworker-id ID --limit 100` (server-side filter), authoritative input
  comes from the `runtime start` RESPONSE (`started.description`), and
  human comments (`tasks events`, `actor.type === "user"`) merge into the
  brief so follow-ups affect the answer.
- `coworkers register --vendor-id X --name Y --capability tasks --personal`
  is the developer path; `provision` is platform-admin under another Vendor.
- Vendor creation requires an organization workspace — join via
  https://preprod.sokosumi.com/join/9Ycw8wzmzXB2WEKa-umzUJX6_GEFiVdu first.
- Workspace access is manually approved by organizers (Sandro, @scio_st)
  via the access-request ID. Confirmed working end-to-end: participant
  "ShillCheck" registered + completed a paid Task settlement on preprod.
- Coworker chat is a bonus feature (register a chat path); default is
  task-only. Comments merged into briefs cover the lightweight follow-up
  case already.
- Full-agent path (separate from coworker) needs an MPS payment node
  (PostgreSQL + seeded wallets, Web3CardanoV2) — not required for the
  coworker submission; Sokosumi funds escrow from buyer credits.
- `runtime start/complete/run/receipt` take `--coworker-id` plus
  `--personal` or `--organization-id`, and use the Coworker's stored
  runtime key — NOT developer creds.
- Setup chain: `vendors create` → `coworkers register --vendor-id ID
  --name NAME --capability tasks --personal` (or `coworkers connect
  COWORKER_ID --vendor-id ID --workspace-id ORG_ID` for an org workspace;
  PENDING until a workspace admin approves) → `coworkers api-key
  COWORKER_ID --json` → `runtime key-import --coworker-id ID
  --api-key-stdin` → `workspaces check ORG_ID` → test:
  `tasks create ... --status READY`.
- `runtime receipt TASK_ID` (no scope flags) reports Masumi settlement;
  `settled: true` + `txHash` only for tasks carrying a paid Masumi job.
  Workspace-credit tasks (`tasks jobs` → `jobs: []`) never settle —
  pass condition there is COMPLETED + `proof.resultHash` +
  `decision.signal`.
- CLI v1.0.4 bundles official skills (`sokosumi skills path`); the
  `sokosumi` skill was used to verify: `coworkers list --scope owned`,
  `workspaces list --personal`, `register --create-api-key`,
  `coworkers connect --personal` for grant recheck, "repeat connect after
  approval, never register", personal smoke test needs no org approval,
  `tasks comment TASK_ID --comment` for thread replies, and "report
  completion only after COMPLETED" (worker now checks before dedupe-marking).
- `scripts/dev-start.sh` / `scripts/dev-stop.sh`: nohup'd `npm run web:dev`
  with `.local/` pid+log, port wait, and a BACKGROUND warm-up ping to both
  Render services — first `/` measured 54.6s cold (Render sleep), which is
  exactly why the warm-up exists. `.local/` is gitignored.

UPDATE 2026-10-07 (Shreyas side): Argus coworker is REGISTERED on his
account (org argus-9a7fvl owner, TOKEN2049 org member). TOKEN2049 connect
ran: access request 01a11341-8e06-7010-920b-b428087e2903 = PENDING, waiting
on Sandro/@scio_st. TOKEN2049 org: id 01a109d1-32a9-71a3-a0e3-658b2a7987cd,
slug token2049-origins-hackathon-2026-nws2r7 (59,450 credits). Smoke task
01a11317-…0433 READY; run `npm run coworker` on HIS machine, then
`runtime receipt` before sending the approval message. New tagline:
"Give AI agents eyes on-chain." Decision layer added (decide.ts): briefs
asking hedge/recommend/should-I route to whale-flow and get an explicit
HEDGE/NO_HEDGE signal with the rule stated alongside the proof hash.

Auth DONE 2026-10-07 as satyam17102003@gmail.com (platformRole: user).
This account owns NO vendors/coworkers and belongs to NO org workspaces —
the Argus coworker already registered (COWORKER_ID
01a11316-5890-709f-b2e0-aa9ff35e84a2, VENDOR_ID
01a11316-1069-76fd-a0a9-eb1507ea7a21, org argus-9a7fvl) lives under
Shreyas's account; his machine holds the runtime key. IDs are in .env
(org vars commented pending ownership verification). Canonical repo:
SatyamDev803/Query402 (full coworker stack pushed 9d31592); Shreyas's
Argus-Origin-s-Hack-Token2049 repo is a squashed stale snapshot — treat
ours as canonical. Note: teammate pasted live .env (mnemonics+keys) into
chat — testnet only, rotate via `npm run wallet` if strict.

For this machine to run a coworker, Satyam must join an org workspace
first (vendor creation requires one): join link in browser, then
`vendors create --name Argus --slug <slug>` (argus may be taken globally;
fallbacks argus-intel/argus402), then `coworkers register --personal`
→ api-key | key-import → `npm run coworker`. Personal workspace exists
(hasPersonalWorkspace: true). OR Shreyas runs the worker on his machine
with his registered coworker. `tasks list` JSON shape is assumed
defensively in `taskList()` — verify against real output once authed.

## Naming / positioning (DECIDED: Argus)

- Repositioned story: not "data marketplace" — "verified on-chain
  intelligence for AI agents; economic settlement layer (x402 + Masumi)
  underneath; providers like NOWNodes/Dune become suppliers." Competitive
  edge vs a Dune-style rival = proof-hash verification + escrow refunds +
  Sokosumi coworker + already-live E2E, not data depth.
- FINAL NAME: **Argus** (hundred-eyed watchman). Picked 2026-10-07 after
  user asked A–G. Query402 stays as protocol/infra name; "powered by
  Query402" in footer/meta/README/`/catalogue` poweredBy. Note: a
  hackathon participant named their coworker "Atlas" — Argus stays clear.
- Cardano Dev Skills installed: clone at
  ~/Desktop/Workspaces/Personal/cardano-dev-skills, `.agents/skills`
  symlinked (gitignored), v3 context block in AGENTS.md + CLAUDE.md.
  Bundled masumi docs dir is empty — sokosumi CLI is the authority.
  x402 spec docs are bundled for reference.

## 2026-10-06 incident notes (for context)

Render alert "server failure, exited status 1": marketplace crash-looped
because the facilitator was asleep at boot. Woke facilitator, `render
restart` on marketplace → healthy (`escrow: masumi`, `source: nownodes`).
Separately, `web-mu-pied-31.vercel.app` hung server-side (stale edge
routing); fixed by `vercel alias rm` + `vercel alias set` re-pointing it at
the current deployment.

## 2026-10-06 E2E validation (pitch-readiness pass)

Localhost, all green:

- facilitator :4022 `supported` -> cardano:preprod, methods
  `default, masumi, script`.
- marketplace :4021 `health` -> `escrow: masumi`, `source: nownodes`.
- web :3000 all six routes 200 (/ /catalogue /activity /lifecycle
  /how-it-works /playground).
- `npm run demo` full paid loop on preprod: whale-flow paid
  (tx 1ea10e55926bce60…, proof verified, 3,750 BTC/10 transfers),
  rpc/base paid (tx 79a732a752752d63…), decision `HEDGE` stamped
  on-chain (tx dc20f0da8737762025…).
- Dishonest-seller path: `/dev/data/whale-flow?corrupt=1` returns
  `sha256:000…`; buyer recompute mismatches -> payment refused.
- Gotcha: `demo.ts` spawns its own :4021; free the port before running
  it next to `dev-start.sh --local`.

Production, all green:

- `query402-marketplace.onrender.com/health` 200 in ~1s, masumi +
  nownodes. `/catalogue` shows `Argus` name, 8 SKUs.
- `query402-facilitator.onrender.com/supported` -> masumi on
  cardano:preprod. `/dev/*` correctly 404 (DEV_BYPASS off in prod).
- Vercel alias `web-mu-pied-31.vercel.app` was serving the pre-rename
  Query402 build; redeployed with `vercel deploy --prod`
  (deployment `web-bnse39ctt`). Alias now serves `Argus` title +
  tagline; all six routes 200; `/api/q402/catalogue` proxies to Render.
- Paid production settlement proven this session:
  `SELLER_URL=https://query402-marketplace.onrender.com npm run agent`
  bought whale-flow (tx 75697862af2413a4…, proof verified, 3,657 BTC)
  and rpc/base (tx eb43fdd07239f5cd…); decision `HEDGE` on-chain
  (tx d2427a247c90da43…).

Worker smoke on this machine: `npm run coworker` starts and reports
"runtime key must be imported first" — expected; the key lives on
Shreyas's machine. Uncommitted: tradingAgent banner QUERY402 -> ARGUS.

## 2026-10-07 plan change + coworker web flow

- Argus coworker access to TOKEN2049 workspace: **GRANTED**.
- New plan: Satyam's laptop builds + hosts end to end; Shreyas mirrors
  code to GitHub. Hosted demo only (no local run on stage).
- New feature: `/coworker` page + `POST|GET /api/coworker/task` shell
  the sokosumi CLI server-side (web/lib/sokosumi.ts). No credential in
  the browser; 503s cleanly where the CLI/key are absent (incl. Vercel).
- Env for web coworker: `COWORKER_ID`, `SOKOSUMI_ORG_SLUG`.
- CLI facts learned: task commands scope orgs via `--organization-slug`;
  `runtime receipt` takes NO scope flag (task id selects the task).
- For coworker ops on Satyam's machine: join TOKEN2049 via the join link
  + import the runtime key (handoff steps in docs/COWORKER.md).

## 2026-10-07 coworker leg LIVE on Satyam's machine

- Satyam joined TOKEN2049 (member), preprod auth valid, org-scoped
  task create/list verified. `.env` `COWORKER_ORG_*` now points at the
  TOKEN2049 org (old argus-9a7fvl values kept as comments).
- Runtime key handoff DONE: `coworkers api-key` minted
  `coworker_…` on Shreyas's machine (owner acct brownricecapital —
  the `shreyas.thakur.work` gmail is a member account only, and a
  user-level API key from Developer > API keys is NOT the runtime key).
  `runtime key-import` stores in the OS vault. That token passed through
  chat: rotate post-demo alongside the wallets.
- First real task `01a1157c-fcd1-71a8-aba1-01a4c6ac0458` picked up and
  COMPLETED — but exposed a routing bug (fixed, uncommitted): the
  worker's ack comment posts under the operator's USER identity, so
  `taskComments` read it back into the brief and the word "running"
  matched the chain-status regex before DECISION_INTENT — hedge brief
  answered via chain-status + REVIEW. Fix in worker.ts: fetch comments
  before posting the ack and filter the ack text.
- Settlement semantics learned: workspace-credit tasks never touch
  Masumi escrow (`tasks jobs` → `[]`, `blockchainIdentifier: null`),
  `settled: false` is permanent and correct. `settled: true` needs a
  paid Masumi job. Docs updated (COWORKER/TESTING/DEMO/PITCH).
- Retest pending: create a fresh hedge task → expect `via whale-flow`
  + decision.signal HEDGE|NO_HEDGE in the result.

## 2026-10-07 CoinGecko second source (uncommitted)

- `src/cg/client.ts`: CoinGecko demo-tier client (`x-cg-demo-api-key`,
  fixture mode without key) — the market-data plane alongside NOWNodes'
  on-chain plane. Symbol→id map + raw-id passthrough means any CoinGecko
  asset works, not just node-backed chains.
- Two new SKUs (10 total): `market-snapshot` (`?assets=`, 1.0 tADA) and
  `trending` (1.0 tADA). proof.source is "coingecko" for them; health
  now reports `sources: {nownodes, coingecko}`.
- `runSku(nwn, cg, skuId, req)` signature changed — server.ts, worker.ts,
  routeTask.test.ts updated.
- Decision enrichment: hedge briefs fold CoinGecko market context into
  the rationale ("market: BTC $83,945 (-2.4% 24h)") and the result gains
  a `market` field; whale-flow routes now carry `chain` for that lookup.
- routeTask gains trending + price/market rules ahead of chain-status.
- Verified live: snapshot for btc,sol + unknown-asset graceful error,
  trending, enriched HEDGE rationale. Typecheck clean.
- Docs updated: ARCHITECTURE/API/PROJECT/README tables, SETUP env row,
  TESTING/DEMO/PITCH counts 8→10, API envelope now shows real proof
  fields (source, no `tips`).

## 2026-10-07 CoinGecko E2E + frontend integration + hosting

- **Frontend**: playground now drives `market-snapshot` (asset presets:
  majors/defi/memes/raw CG ids) and `trending`; new viewers in
  `sku-viewers.tsx`; `MarketSnapshotData`/`TrendingData`/`Health.sources`
  types; all "nownodes live" pills now render `proof.source` so CoinGecko
  answers label correctly; landing/catalogue badges list live sources.
- **E2E verified locally**: marketplace on :4025 → 10 SKUs,
  `sources.{nownodes,coingecko}:true`; live snapshot (symbols + raw id
  `quantus`), live trending, 400 pre-payment on malformed assets;
  `npm run demo` full paid loop green (whale-flow tx a3ce945d…, raw-rpc
  tx 39f26140…, CIP-20 decision tx 51467099…); coworker task
  `01a115a8-d7b1-…c26b` completed `via whale-flow` with
  `signal: HEDGE` and `market:` enrichment — ack-routing fix holds.
- **Deploys**: `vercel deploy --prod` → `web-fd4zinhfw` live; first
  attempt failed "Not authorized" (dir unlinked — `vercel link --project
  web` fixed) then "No Next.js detected" (stale build cache — `--force`
  fixed). `vercel link` **rewrites `web/.env.local`** (prepends
  VERCEL_OIDC_TOKEN) — re-add COWORKER_ID/SOKOSUMI_ORG_SLUG if clobbered.
- **Domains**: claimed on the `web` project — `argus402.vercel.app`
  (canonical), `query402.vercel.app`, `argus-eyes.vercel.app`
  (`argus.`/`argus-intel.` were taken). Docs now reference argus402.
- **Render env incident**: `PUT /services/{id}/env-vars` REPLACES the
  whole set — wiped marketplace vars on first call; restored all 7 from
  local `.env` (SELLER_MNEMONIC/SELLER_ADDRESS/NOWNODES_API_KEY/
  COINGECKO_API_KEY/CARDANO_NETWORK/ESCROW/FACILITATOR_URL). Service
  restarted healthy; if prod had dashboard-only extras they are gone.
  Lesson: PATCH not PUT, or send the full set every time.
- **Prod verified after push** (deploy `5c0e4636` live on Render):
  `/health` → `sources.{nownodes,coingecko}:true`; `/catalogue` 10 SKUs;
  `/data/trending` unpaid → 402 with full masumi payment-required header;
  `argus402.vercel.app/api/q402/catalogue` → 10 SKUs through the proxy;
  Playwright pass: landing badge "10 paid SKUs" + both sources, playground
  selects market-snapshot (assets field + majors/defi/memes/cg-id presets)
  and trending, /coworker renders. Prod paid call on new SKUs NOT run
  (identical x402 path proven by demo txs + prod whale-flow earlier).

## 2026-10-07 Vercel domain wedge → frontend moved to Render

- User wanted a cleaner URL than `web-mu-pied-31.vercel.app`; bare
  `argus.vercel.app` is taken globally. Claimed argus402/query402/
  argus-eyes/useargus/argusagent/argus-network on the `web` project,
  then cleaned extras per user request (`alias rm`).
- **After the churn every claimed `*.vercel.app` name blackholes** — TLS
  + HTTP/2 connect fine, GET sent, zero bytes back, forever. System
  aliases and deployment URLs respond instantly (SSO). Fresh claims hang
  identically → account-level wedge (throttle/abuse flag from 7 claims +
  6 removals in ~1h is the leading theory). rm+set fix, redeploy, both
  edge IPs, HTTP/1.1 — all tried. Vercel status all-green.
- **Migration**: created Render web service `argus402` (rootDir `web`,
  build `npm install && npm run build`, start `npx next start -p $PORT`,
  env `MARKETPLACE_URL` + `NODE_VERSION=24`) → live at
  **https://argus402.onrender.com**, proxy verified (10 SKUs).
- Gotchas recorded for next time: Render service-create ignores envVars
  in payload (PUT separately + redeploy — Turbopack inlines env at
  BUILD); `PUT env-vars` replaces the whole set; service rename does NOT
  move the subdomain (delete + recreate to get the name you want);
  bare `argus` is taken on both Vercel and Render.
- Vercel project deleted later same day during account cleanup (user
  requested: keep only `fomo`; Nexa/kuvaka-lead-scorer/apidev also
  deleted on Render). Render `argus402` is now the sole frontend host.
  `argus402.com` was buyable (~$10-12/yr) if a real domain is wanted.

## Hosted coworker console (2026-10-07)

- `/coworker` on argus402.onrender.com CREATES real Sokosumi tasks via
  `lib/sokosumi.ts` direct-REST mode: all calls go to
  api.preprod.sokosumi.com/v1/tasks{,/receipt} with a static Bearer.
- Auth = SOKOSUMI_API_KEY env var, a USER API key minted at
  preprod.sokosumi.com/developer/api-keys ("Argus Test" key, Oct 7).
  Static, never rotates, no session to revoke — the earlier OAuth
  refresh-token chain died repeatedly ("session not found") and was
  abandoned. Verified live: POST tasks 201, GET task 200, receipt 200
  (receipt no longer needs the coworker runtime key in direct mode).
- Required headers: `authorization: Bearer <key>` +
  `x-organization-slug: token2049-origins-hackathon-2026-nws2r7` — GETs
  without the slug return 403 "Workspace is missing".
- Dead vars removed from Render: SOKOSUMI_REFRESH_TOKEN,
  SOKOSUMI_COWORKER_KEY, RENDER_API_KEY, RENDER_SERVICE_ID.
- Render bulk PUT env-vars 400'd ("invalid JSON") on this date — per-key
  PUT /env-vars/{key} works; use that.
- Worker still runs on laptop (`npm run coworker`) — hosted tasks sit
  READY until it polls. Same SOKOSUMI_API_KEY now lives in root .env;
  the CLI reads it natively so worker polls no longer need OAuth at all.
- **Paid mode (COWORKER_PAID=1)**: the worker buys each answer from the
  live marketplace over x402 (BUYER_MNEMONIC wallet, Masumi escrow), so
  results carry `payment.tx`; the task route then returns
  `receipt:{settled:true,txHash}` and the page renders "payment settled"
  + a cardanoscan link. Verified live: task 01a116d3 → tx 82138b39….
  Retries (3 attempts, fresh client, 402+5xx) handle UTXO mempool lag
  and free-tier hiccups; falls back to local engine unpaid. Buyer wallet
  ~1.9k tADA; each paid call takes 60-120s.
- Playground `/dev/*` mirror needed DEV_BYPASS=1 on the marketplace —
  set on Render and deployed (env changes need a real deploy, not a
  restart). Note: /dev answers are publicly unpaid while flag is on.
- Nav order: Coworker, How it works, Catalogue, Activity.

## Verify

- `npm run typecheck` at root; `npm run web:build` for the site.
- Backend health: `curl https://query402-marketplace.onrender.com/health`
  and `curl https://query402-facilitator.onrender.com/supported` — allow
  ~60s for free-tier cold start before concluding down.
- End-to-end: `cd web && vercel curl /api/q402/health` should return the
  marketplace health JSON.
- Full E2E against prod: `SELLER_URL=https://query402-marketplace.onrender.com npm run agent`.
  Verified green 2026-10-05: agent discovered 8 SKUs, bought whale-flow
  (tx 489d8f5ec3a52927…, proof verified) and eth_gasPrice on Base
  (tx b129c1f390f1a027…), stamped decision on preprod
  (tx 6621f81927027004…). Activity feed shows both as paid.
