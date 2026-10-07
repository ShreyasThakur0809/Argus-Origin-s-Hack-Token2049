# Argus end-to-end testing guide

How to verify the whole product: local stack, the paid x402/Masumi flow,
the verification and rejection path, the Sokosumi coworker, and the
hosted production deployment.

Argus is one intelligence engine behind two surfaces:

- **Marketplace/API**: `src/server.ts` + `src/facilitator.ts`. Agents pay
  per query over x402 with Masumi escrow on Cardano Preprod.
- **Coworker**: `src/coworker/worker.ts`. Sokosumi tasks route to the same
  SKU engine and return verified answers plus a proof hash.

Every check below lists the command and the expected evidence. Do not
report a check as passed without seeing the expected output.

## 0. Prerequisites

```bash
npm install
npm --prefix web install
```

`.env` must contain (see `.env.example`):

| Var | Needed for |
| --- | --- |
| `BLOCKFROST_PROJECT_ID` | paying and settling on preprod |
| `NOWNODES_API_KEY` | live chain data (empty = fixture mode) |
| `SELLER_MNEMONIC` + `SELLER_ADDRESS` | marketplace seller wallet |
| `BUYER_MNEMONIC` | the paying demo agent (needs tADA) |
| `COWORKER_ID` / `VENDOR_ID` | coworker worker only |

Buyer tADA: https://docs.cardano.org/cardano-testnets/tools/faucet

Coworker tests additionally need the runtime key imported in the local
Sokosumi CLI vault (`runtime key-import`) and `sokosumi --preprod auth
login`. The key currently lives on Shreyas's machine.

## 1. Local stack

Two ways up. Never run both at once: `demo.ts` spawns its own
marketplace on :4021 and will crash with `EADDRINUSE` if one is already
running.

**Option A — the one-command paid demo** (spins up facilitator +
marketplace + paying agent itself):

```bash
npm run demo
```

**Option B — the browsable stack** (facilitator + marketplace + Next.js
site, backend on localhost, not Render):

```bash
npm run facilitator        # terminal 1 → :4022
scripts/dev-start.sh --local   # terminal 2 → :4021 + :3000
```

Stop with `scripts/dev-stop.sh` (plus Ctrl-C on the facilitator).

## 2. Local health checks

```bash
curl -s http://localhost:4021/health
curl -s http://localhost:4022/supported
curl -s http://localhost:4021/catalogue
```

Expected:

- `/health` → `{"ok":true,"network":"cardano:preprod","escrow":"masumi","source":"nownodes"}`
- `/supported` → a `kinds` entry with `"network":"cardano:preprod"` and
  `"assetTransferMethods"` containing `"masumi"`
- `/catalogue` → `"name":"Argus — on-chain intelligence for AI agents"`,
  `poweredBy: "Query402"`, 10 SKUs

If `source` says `fixture`, `NOWNODES_API_KEY` is missing and the data is
synthetic. Fine for UI work, not fine for a live demo claim.

Web routes (all should return 200 in under a second):

```bash
for p in / /catalogue /activity /lifecycle /how-it-works /playground; do
  printf '%-14s -> %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000$p)"
done
```

## 3. The paid demo (the money shot)

With port :4021 free:

```bash
npm run demo
```

Expected output, in order:

1. Catalogue discovery — 10 SKUs, `escrow=masumi`, `source=nownodes`
2. `Purchase 1: whale flow` — request 402s, agent pays, `→ 200` with a
   `paid, tx …` hash, then `✓ proof verified (resultHash sha256:…)`
   plus the whale summary
3. `Purchase 2: raw rpc` — same flow for `eth_gasPrice` on Base
4. `Act: HEDGE` — decision JSON with `signal`, `reason`, `evidence`
   (proof hash + payment tx), then `✓ decision recorded on-chain` with a
   preprod.cardanoscan.io link
5. `Receipts` — cardanoscan link for the payment tx

Runtime is 3 to 4 minutes; each purchase waits on-chain confirmation.

Verified reference run (2026-10-06): whale-flow `1ea10e55926bce60…`,
rpc/base `79a732a752752d63…`, decision `dc20f0da8737762025…`.

## 4. Dishonest-seller / rejection path

Proves the buyer does not pay for a bad answer. Requires the local
marketplace running with `DEV_BYPASS=1` (the default local `.env`).

```bash
curl -s "http://localhost:4021/dev/data/whale-flow?chain=btc&blocks=1&minNative=100&corrupt=1" \
  | python3 -m json.tool | grep -A2 resultHash
```

Expected: `resultHash` is `sha256:0000…000` — a well-formed but wrong
proof. Any buyer recomputing `sha256(JSON.stringify(data))` gets a
different value and refuses payment; under Masumi the escrowed funds are
never released. In the playground UI this renders as the red
"verification failed / payment refused" state.

Note: `corrupt=1` and `/dev/*` exist only locally. `/dev/*` correctly
returns 404 in production.

## 5. Decision routing checks

```bash
npx tsx src/coworker/routeTask.test.ts
```

This is a live script (real NOWNodes calls), not a unit suite. Key rows
to confirm in the output:

- `Should I hedge BTC? … last 3 blocks … HEDGE or NO HEDGE` → routes to
  `whale-flow?chain=btc&blocks=3` and the result carries a `decision`
  object with `signal: HEDGE|NO_HEDGE`, `rationale`, `rule`
- `should I buy or sell right now` → **no route** (catalogue fallback).
  The router must not invent a chain

```bash
npm run typecheck     # tsc --noEmit, should print nothing
```

## 6. Coworker path (run on the machine holding the runtime key)

```bash
npm run coworker     # leave running; polls every 15s by default
```

Expected on startup: `Argus coworker 01a11316-… polling every 15s`
(this repo's `.env` sets `COWORKER_POLL_MS=5000` → "every 5s").
If it prints `runtime key must be imported first`, that machine lacks
the key — import it or run elsewhere; do not put the key in `.env`.

Create a task (personal workspace works without TOKEN2049 approval):

```bash
sokosumi --preprod tasks create --personal \
  --coworker-id 01a11316-5890-709f-b2e0-aa9ff35e84a2 \
  --description "Should I hedge BTC? Analyze on-chain activity over the last 3 blocks and give me a HEDGE or NO HEDGE recommendation" \
  --status READY --json
```

Watch the worker pick it up and complete it, then verify:

```bash
sokosumi --preprod tasks get <TASK_ID> \
  --organization-slug token2049-origins-hackathon-2026-nws2r7 --json
sokosumi --preprod runtime receipt <TASK_ID> \
  --coworker-id 01a11316-5890-709f-b2e0-aa9ff35e84a2 --json
```

Pass condition for workspace tasks: status `COMPLETED` and the result
comment carries `ok: true`, `proof.resultHash`, `matchedSku`, and for
hedge briefs `decision.signal` (`HEDGE`/`NO_HEDGE`). Workspace tasks run
on the org's credit pool (`tasks jobs` → empty `jobs`), so the receipt's
`settled` stays `false` — expected. `settled: true` + `txHash` is the
pass condition only for tasks carrying a Masumi payment job; the
marketplace paid flow in §3/§8 is where escrow settlement is proven.

Web variant: on the same machine, `http://localhost:3000/coworker` →
submit a brief → watch status → result JSON + receipt. On a machine
without CLI auth/runtime key the page must return a clean 503.

## 7. Production smoke (read-only, safe)

Free-tier Render sleeps; allow ~60s before concluding anything is down.

```bash
curl -s https://query402-marketplace.onrender.com/health
curl -s https://query402-marketplace.onrender.com/catalogue
curl -s https://query402-facilitator.onrender.com/supported
curl -s -o /dev/null -w '%{http_code}\n' "https://query402-marketplace.onrender.com/dev/data/chain-status?chains=eth"
```

Expected: same JSON shapes as local; `/dev/*` → **404** (unpaid mirrors
must not exist in prod).

Frontend (public alias):

```bash
for p in / /catalogue /activity /lifecycle /how-it-works /playground; do
  printf '%-14s -> %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://argus402.onrender.com$p)"
done
curl -s https://argus402.onrender.com/api/q402/catalogue | head -c 200
```

Expected: all 200, home `<title>` reads `Argus: on-chain intelligence
for AI agents`, and the proxy returns the same catalogue JSON (proving
Vercel → Render wiring).

## 8. Production paid flow (spends buyer tADA, writes on-chain)

The same agent can buy from the hosted marketplace:

```bash
SELLER_URL=https://query402-marketplace.onrender.com npm run agent
```

Expected: identical stages to section 3, URLs pointing at Render, and
three preprod transactions (payment ×2, decision ×1). Reference run
2026-10-06: whale-flow `75697862af2413a4…`, rpc/base
`eb43fdd07239f5cd…`, decision `d2427a247c90da43…`.

This is the only check that proves paid production settlement — a 200
on `/health` proves liveness, not payment.

## 9. Pitch-readiness checklist

| Claim | Proven by |
| --- | --- |
| Local stack works | §2 all green |
| Local paid x402/Masumi flow | §3 full run |
| Verification rejects bad results | §4 mismatch → refuse |
| Decision layer returns HEDGE/NO_HEDGE | §5 routing rows |
| Hosted frontend works | §7 routes + title |
| Hosted backend works | §7 health/catalogue/supported |
| Paid **production** settlement | §8 three tx hashes |
| Coworker executes tasks | §6 task COMPLETED + result proof/decision |
| Coworker payment settled | only for paid Masumi jobs; workspace-credit tasks show `settled: false` by design |
| TOKEN2049 workspace approval | access request `01a11341-…` → GRANTED |

## Troubleshooting

- **`EADDRINUSE :::4021`** — a marketplace is already running; either
  keep it and skip `npm run demo`, or `scripts/dev-stop.sh` first.
- **Render request hangs ~50s** — cold start, not a failure. Retry.
- **`whoami` / task commands fail auth** — `sokosumi --preprod auth login`.
- **Worker says runtime key missing** — expected everywhere except the
  machine that ran `runtime key-import`.
- **Vercel deployment URL redirects to login** — deployment protection;
  use the public Render-hosted frontend `argus402.onrender.com` (the
  Vercel claimed subdomains are wedged, see docs/DEPLOYMENT.md).
- **`source: fixture` in health** — `NOWNODES_API_KEY` unset; answers are
  synthetic. Do not demo decision outputs off fixture data.
