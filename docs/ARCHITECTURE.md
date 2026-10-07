# Argus — Technical Deep Dive

*Product: Argus · payment protocol: Query402*

How the whole system fits together: components, secrets, the 10 SKUs, and the
full request-to-settlement path.

## What this project is

Argus is on-chain intelligence for AI agents, priced per query.
A seller operates an Express server that sells blockchain data, 10 products
("SKUs"): eight on-chain datasets fetched live from NOWNodes plus two
market-data SKUs from CoinGecko, priced per query in ADA on Cardano
preprod. A buyer agent hits a URL, receives an HTTP 402 with cryptographically
signed payment terms, signs a Cardano transaction, and the response arrives
with a sha-256 proof envelope it can verify. No human in the loop.

### Components

| Component | File | Port | Role |
|---|---|---|---|
| Marketplace | `src/server.ts` | :4021 | Sells data. Free routes, paid routes, `/dev/*` unpaid mirrors |
| Facilitator | `src/facilitator.ts` | :4022 | Verifies/settles Cardano payments via Blockfrost. Holds no keys or funds |
| Buyer agent | `src/agent/tradingAgent.ts` | — | Demo customer: discovers, pays, verifies, acts, checks refund path, stamps decision on-chain |
| Dashboard | `web/` (Next.js) | :3000 | Human-facing UI: catalogue, playground, activity feed. Reads marketplace state, never pays |
| Orchestrator | `src/demo.ts` | — | Spawns facilitator, marketplace, agent; exits with the agent's code |
| Sokosumi worker | `src/coworker/worker.ts` | — | Runs the same SKU engine as a Sokosumi Coworker: polls READY tasks, executes, completes with the proof envelope |

## `.env`, variable by variable

All values are loaded via `dotenv/config` by whichever process reads them.
`.env` is gitignored. The buyer mnemonic is the crown jewel: it can drain the
testnet wallet if exposed.

| Variable | Used by | What it does |
|---|---|---|
| `BLOCKFROST_PROJECT_ID` | `src/facilitator.ts` | API key for Blockfrost, the facilitator's only way to read Cardano (inspect submitted txs, confirm status, read network params). Required; facilitator exits without it. |
| `BLOCKFROST_BASE_URL` | `src/facilitator.ts` | Defaults to the preprod Blockfrost API. Override for a self-hosted or different-network endpoint. |
| `CARDANO_NETWORK` | facilitator + server | e.g. `cardano:preprod`. Must match between the payment requirements the server issues and what the facilitator accepts. A mainnet tx won't settle a preprod invoice. |
| `FACILITATOR_URL` | `src/server.ts` | Where the marketplace sends `/verify` and `/settle` calls, e.g. `http://localhost:4022`. |
| `FACILITATOR_PORT` / `FACILITATOR_HOST` | `src/facilitator.ts` | Its own listen port (4022). Host override lets it bind non-localhost. |
| `SELLER_MNEMONIC` | `src/server.ts` only | 24-word Cardano phrase. Derives the seller's Ed25519 key, used for exactly one thing: signing the escrow terms inside every 402 response (`signTerms` in `src/terms.ts`). That's what makes "the seller attested these terms" verifiable. Never funds anything. |
| `SELLER_ADDRESS` | `src/server.ts` | Optional override for the `payTo` payout address. If unset, derived from `SELLER_MNEMONIC`. Exists so terms can be signed by one wallet while payouts land at another (e.g. a cold address). |
| `BUYER_MNEMONIC` | `src/agent/` only | The agent's hot wallet. `toClientCardanoSigner` derives its signing key to build and sign payment transactions. The only mnemonic that moves money, and it must be funded. |
| `ESCROW` | `src/server.ts` | `default` (direct payment to `SELLER_ADDRESS`) or `masumi` (locks funds in the Masumi Plutus escrow script with a datum carrying buyer, seller, result hash, deadlines, giving an automatic refund path). |
| `PRICE_ASSET` / `USDM_ASSET` | `src/server.ts` | Payment denomination: lovelace for tADA, or the USDM policy+asset-id pair for dollar-priced SKUs. Catalogue currently priced in tADA. |
| `NOWNODES_API_KEY` | `src/nwn/client.ts` | Upstream data source key, injected as the `api-key` header on every NOWNodes request. Without it, products fall back to fixture mode. |
| `NOWNODES_BLOCKBOOK_URL_*` / `NOWNODES_RPC_URL_*` | `src/nwn/chains.ts` | Per-chain endpoint overrides, e.g. `NOWNODES_RPC_URL_ETH`. Only needed if NOWNodes changes URL shapes. |
| `COINGECKO_API_KEY` | `src/cg/client.ts` | CoinGecko demo-tier key, sent as `x-cg-demo-api-key`. Powers `market-snapshot`, `trending`, and market context inside coworker decisions. Without it those SKUs serve fixture data. |
| `PORT` | `src/server.ts` | Marketplace listen port, 4021. |
| `DEV_BYPASS` | `src/server.ts` | When set, skips payment verification on paid routes and enables the `/dev/*` mirror routes. This is what makes the playground free to click. |
| `ACCEPT_MEMPOOL` | `src/facilitator.ts` | When set, settle succeeds once the tx is seen in mempool rather than requiring on-chain confirmation. Cuts demo settlement from ~20s+ to ~2s. |
| `RECORD_DECISION` | `src/agent/tradingAgent.ts` | When set, the agent stamps its final decision (HEDGE/HOLD plus proof hash) into a Cardano tx's metadata (label 674) and prints the explorer link. The on-chain audit trail. |
| `CONFIRMATION_TIMEOUT_MS` | `src/agent/tradingAgent.ts` | How long the agent waits for the decision tx to confirm before giving up (still prints the hash). |
| `ACTIVITY_LOG` | `src/activity.ts` | Optional path override for `activity.jsonl`, the append-only feed behind the dashboard's Activity page. |
| `MARKETPLACE_URL` | `web/` (its own `.env`) | Only env the Next.js app needs. Server components fetch it directly; browser calls go through the `/api/q402/*` same-origin proxy so the marketplace origin is never exposed client-side. |
| `COWORKER_ID` | `src/coworker/worker.ts` | Sokosumi Coworker id from `coworkers register --personal`. Required to run the worker. |
| `COWORKER_ORG_SLUG` / `COWORKER_ORG_ID` | `src/coworker/worker.ts` | Organization Workspace targeting: slug for `tasks` commands, id for `runtime` commands. Both unset → personal Workspace. |
| `COWORKER_POLL_MS` | `src/coworker/worker.ts` | Task poll interval, default 15000. |

**Security model in one line:** seller mnemonic signs, buyer mnemonic pays,
facilitator has zero keys, dashboard has zero keys, and the Sokosumi worker
holds no wallet at all — task auth is the Coworker runtime key in the OS vault.

## Sokosumi coworker

Argus is also a Sokosumi Coworker: the same SKU engine, driven through the
Masumi task lifecycle instead of HTTP.

- `src/products/runSku.ts` — the dispatch+proof layer shared by `server.ts`
  and the worker. Takes a minimal request (`originalUrl`, optional
  `params`/`body`) so tasks run in-process without an HTTP hop.
- `src/coworker/routeTask.ts` — maps a task brief to a SKU. Structured input
  (`{"sku":"whale-flow","params":{...}}`) or free text ("gas on ethereum and
  base"). Extracts chains, txids, addresses, block counts; returns null when
  unmappable or a required arg is missing — the worker then answers with the
  catalogue summary rather than guessing.
- `src/coworker/decide.ts` — decision layer: when a brief asks for a
  recommendation, derives `HEDGE` / `NO_HEDGE` / `REVIEW` from the
  verified SKU data with the rule and evidence attached.
- `src/coworker/worker.ts` — `npm run coworker`. Loop: `tasks list` → READY
  tasks for this coworker → `runtime start` → `runSku` → `runtime complete
  --result-file` with `{sku, data, proof, decision?}`. Dedupe state in
  `.coworker-state.json`, result files in `.coworker-results/` (gitignored).
- Two credential planes: `tasks` commands use operator OAuth
  (`sokosumi --preprod auth login`); `runtime` commands use the Coworker's
  stored key (`coworkers api-key` → `runtime key-import`).
- Setup is scripted: `bash scripts/sokosumi-setup.sh` inspects each step
  (vendor → register → connect → workspace approval → key import → worker)
  and stops wherever a human or admin action is needed.
- `runtime receipt TASK_ID` proves settlement (Masumi escrow on preprod,
  tUSDM payout after the dispute window).

## The 10 SKUs and how to demo each one

Two ways to demo any SKU; always show both:

```bash
# 1. The PAID route → HTTP 402 + signed escrow terms (the product being sold)
curl -i "http://localhost:4021/data/tx-status?chain=eth&tx=0x..." | head -30

# 2. The /dev mirror → real live answer, unpaid (what the playground uses)
curl -s "http://localhost:4021/dev/data/tx-status?chain=eth&tx=0x..." | jq
```

In the browser: `localhost:3000/playground`, pick a SKU, "Send as an agent
would". The judge sees the real 402 terms, the live answer, and the browser
recomputing the sha-256 proof.

| SKU | What it answers | Judge demo |
|---|---|---|
| `raw-rpc` (1.0 tADA) | "Give me any one JSON-RPC call, raw." The dumb pipe; proves the rail isn't limited to curated endpoints. | Playground preset `eth_blockNumber` on eth. Simplest possible demo, raw passthrough. |
| `tx-status` (1.0) | "Did my transaction land?" Receipt status, confirmations, block. | Preset "first-ever ETH tx" (block 46147). Great story: the agent checks whether its own payment settled. Try `chain=btc` for a UTXO txid. |
| `chain-status` (1.0) | "Is this chain alive?" Tip, last block age vs expected interval, `live`/`lagging` flag. | `?chains=eth,base,btc`: one call, three chains, flag column. What a monitoring agent polls. |
| `fee-market` (1.5) | "Where's it cheapest to transact?" Gas across EVMs plus sat/vB on UTXO, ranked. | `?chains=eth,base,arb`: the ranked table. Best narrative SKU: the agent prices execution before choosing a venue, just like our demo agent. |
| `address-snapshot` (1.5) | "What is this address?" Balance, nonce/activity, contract-vs-EOA detection. | Preset `vitalik.eth` then the USDC contract: shows the `isContract` flag differ. Solana wallet preset shows the non-EVM path. |
| `whale-flow` (1.5) | "Who's moving size?" Largest recent native transfers with labels. | `?chain=eth`: biggest transfers across recent blocks. The signal product a trading agent buys. |
| `holder-concentration` (2.5) | "Is this token a rug? Who holds it?" Top-holder sampling plus exact balances. | Most expensive SKU, takes `contract`. The due-diligence beat before an agent deploys capital. |
| `bridge-activity` (2.5) | "What's flowing cross-chain?" Bridge event aggregation per chain. | `?chains=eth,poly,arb`: per-chain rows with error entries where an endpoint is absent. Shows honest partial-failure design. |
| `market-snapshot` (1.0) | "What's the market doing?" USD price, 24h move, market cap, volume per asset (CoinGecko). | `?assets=btc,eth,sol`: works for thousands of assets, not just node-backed chains — and it's the context folded into hedge decisions. |
| `trending` (1.0) | "What's the market watching?" CoinGecko trending coins: rank, price, 24h move. | `GET /data/trending`: no params, one call — the discovery input a surveillance agent polls. |

### The money demos

- **Full paid loop**: `npm run demo` in a terminal. Agent discovers, pays tADA,
  verifies proof, decides HEDGE/HOLD, stamps the decision tx on-chain with a
  cardanoscan link. ~30s with `ACCEPT_MEMPOOL`.
- **The refund hook**: `?corrupt=1` on a paid route (or the playground's
  corrupt toggle). Server hashes a different result than it returns, proof
  mismatch, agent flags it. Under Masumi escrow the buyer reclaims funds at
  the deadline without seller cooperation. That's the "no trust required"
  close.

## End to end: request to settlement

```
Agent/Playground                Marketplace :4021          Facilitator :4022       Cardano
      │                              │                          │                    │
      │  GET /data/fee-market        │                          │                    │
      │─────────────────────────────►│  validate params (400 if bad, BEFORE payment) │
      │                              │  build terms → signTerms(SELLER_MNEMONIC)      │
      │  402 + PAYMENT-REQUIRED      │     {payTo|escrow, deadlines, seller sig}      │
      │  header (base64 JSON)        │                          │                    │
      │◄─────────────────────────────│                          │                    │
      │                              │                          │                    │
      │  wrapFetchWithPayment:       │                          │                    │
      │  decode terms, build tx to   │                          │                    │
      │  Masumi script w/ datum,     │                          │                    │
      │  sign w/ BUYER_MNEMONIC      │                          │                    │
      │                              │                          │                    │
      │  retry same GET              │                          │                    │
      │  + PAYMENT-SIGNATURE header  │                          │                    │
      │─────────────────────────────►│  → /verify (facilitator  │                    │
      │                              │    checks tx pays the    │                    │
      │                              │    right invoice) ──────►│                    │
      │                              │  → /settle (submit tx) ─►│──► submit ────────►│
      │                              │     returns tx hash      │    mempool/chain   │
      │                              │                          │                    │
      │  200 + answer +              │  product fn: NOWNodes    │                    │
      │  PAYMENT-RESPONSE (tx hash)  │  calls → shape result →  │                    │
      │  + proof {sha256(result)}    │  hash result, log to     │                    │
      │◄─────────────────────────────│  activity.jsonl          │                    │
      │                              │                          │                    │
      │  agent: sha256(result) ==    │                          │                    │
      │  proof.hash? → act           │                          │                    │
      │  → optional metadata tx ─────┼──────────────────────────┼───────────────────►│
      │    (label 674, decision)     │                          │                    │
```

### Key invariants

1. **Validate before invoicing.** Malformed params get a 400, never a paid
   402. Agents don't pay to be told their request was bad.
2. **Terms are signed before payment.** The seller commits to price, escrow
   address, and deadlines with its key before seeing money. It can't reprice
   after you pay.
3. **Masumi escrow** means money locks in a Plutus script, not the seller's
   address. The datum carries buyer, seller, result hash, deadlines. Seller
   claims on delivery; buyer auto-refunds at deadline. That's the fraud
   protection.
4. **Proof hash is recomputed client-side.** The agent doesn't trust the
   envelope; it re-hashes the body. Mismatch means flag for refund.
5. **The facilitator is trustless plumbing.** It can't steal: it only verifies
   that the buyer's already-signed tx pays the right invoice and broadcasts
   it.
6. **The browser never pays.** `/dev/*` mirrors exist because a demo UI can't
   (and shouldn't) hold a mnemonic. Playground equals the real protocol minus
   settlement, plus live data.

One-liner: **HTTP 402 as the checkout, Cardano as the cash register, a hash as
the receipt.**
