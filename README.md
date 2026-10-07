# Argus — on-chain intelligence for AI agents

**Give AI agents eyes on-chain.**

*Powered by the Query402 payment protocol.*

**Pay per query. Any chain. No account, no API key, no human in the loop.**

AI agents are becoming the largest consumers of blockchain data, but every
provider today (Dune, Nansen, Arkham) is built for humans: signup → API keys →
monthly subscriptions. An autonomous agent can do none of that.

Argus is on-chain intelligence for AI agents. An agent asks a
question, receives HTTP 402, pays a few cents on Cardano via **x402** (funds
locked in the **Masumi escrow** smart contract — refunded automatically if the
answer fails validation), and gets a verified cross-chain answer. Supply side
is **NOWNodes**: 120+ networks, including chains with no incumbent indexers
for agents.

Tracks: **Cardano Agentic Commerce** · **NOWNodes Multichain Infrastructure**

```
agent ── GET /data/whale-flow?chain=btc ────────────► marketplace
agent ◄── 402 + seller-signed Masumi escrow terms ─── marketplace
agent    builds + signs lock tx (escrow address, job datum, deadlines)
agent ── GET + PAYMENT-SIGNATURE ───────────────────► marketplace ──► facilitator ──► Cardano preprod
agent ◄── 200 + verified answer + proof envelope ─── marketplace
                                                     funds sit in escrow; released on result,
                                                     auto-refunded on failure
```

## The catalogue

| SKU | Route | Default price | What it answers |
| --- | --- | --- | --- |
| `raw-rpc` | `POST /rpc/:chain` | 1.0 tADA | One read-only JSON-RPC call on any NOWNodes network — the cheapest way for an agent to buy a node call with no key. |
| `tx-status` | `GET /data/tx-status` | 1.0 tADA | Receipt status, block, and confirmation depth (`?chain=eth&txid=0x…`). EVM, UTXO, and Solana. |
| `chain-status` | `GET /data/chain-status` | 1.0 tADA | Tip height, last block time, and block age vs expected interval (`?chains=eth,base,btc`). |
| `fee-market` | `GET /data/fee-market` | 1.5 tADA | Cost of transacting right now per chain: `eth_gasPrice` on EVM, `estimatefee` on UTXO (`?chains=eth,base,arb,btc`). |
| `address-snapshot` | `GET /data/address-snapshot` | 1.5 tADA | Balance, activity, and contract detection on EVM; lifetime totals on UTXO (`?chain=eth&address=0x…`). |
| `whale-flow` | `GET /data/whale-flow` | 1.5 tADA | Largest native transfers over the last N blocks (`?chain=btc&blocks=3&minNative=1`). Works on UTXO chains too. |
| `holder-concentration` | `GET /data/holder-concentration` | 2.5 tADA | Top-holder share of an ERC20: `eth_getLogs` sampling → exact `balanceOf` verification (`?token=0x…`). |
| `bridge-activity` | `GET /data/bridge-activity` | 2.5 tADA | Deposit/withdrawal event counts across known bridge contracts on several chains (`?chains=eth,base,arb`). |
| `market-snapshot` | `GET /data/market-snapshot` | 1.0 tADA | USD price, 24h move, market cap, volume per asset via CoinGecko — any tracked asset, not just node-backed chains (`?assets=btc,eth,sol`). |
| `trending` | `GET /data/trending` | 1.0 tADA | CoinGecko trending coins right now: rank, price, 24h move. |

`GET /catalogue` (free) returns the same list for machine discovery.

Every paid answer carries a proof envelope: `sha256` of the payload, chain
tips, generation time, and the settlement tx hash. Agents verify the hash
before acting; with Masumi escrow a rejected answer means the payment is
never released.

## The demo agent

`src/agent/tradingAgent.ts` is the onstage demo: a trading agent with nothing
but a Cardano mnemonic.

1. Fetches the free catalogue.
2. **Buys** whale flow on BTC, verifies the proof hash, derives a signal.
3. **Buys** a raw `eth_gasPrice` call on Base to pick the execution venue.
4. **Acts**: stamps its decision as a real preprod transaction (explorer link
   printed), with the payment tx and result hash as evidence.

## Sokosumi coworker

The same SKU engine also runs as a hireable **Sokosumi Coworker** on Cardano
preprod — Masumi's task lifecycle instead of HTTP: a workspace assigns a READY
task, the worker executes it against NOWNodes, and the completed answer lands
back on the task with the same `{sku, data, proof}` envelope. Sokosumi funds
the escrow from the buyer's credits; payout settles in tUSDM after the dispute
window.

```bash
sokosumi --preprod auth login        # one-time, browser OAuth
bash scripts/sokosumi-setup.sh       # vendor → coworker → connect → runtime key
npm run coworker                     # polls READY tasks, answers them
```

Task briefs can be structured (`{"sku":"whale-flow","params":{"chain":"btc"}}`)
or free text — "show me whale flow on bitcoin" routes to the same engine.

## Run it

Prereqs: Node 20+.

```bash
npm install
npm run wallet          # prints SELLER_MNEMONIC + BUYER_MNEMONIC → .env
```

Then fill `.env`:

| Var | Where from |
| --- | --- |
| `BLOCKFROST_PROJECT_ID` | free preprod project at https://blockfrost.io |
| `NOWNODES_API_KEY` | https://nownodes.io (empty = fixture mode for offline dev) |
| Buyer tADA | https://docs.cardano.org/cardano-testnets/tools/faucet — fund the BUYER address |

```bash
npm run demo            # facilitator + marketplace + agent, one command
```

Or in three terminals: `npm run facilitator`, `npm run server`, `npm run agent`.

### Knobs

| Env | Effect |
| --- | --- |
| `ESCROW=masumi\|default` | Masumi escrow (auto-refund) vs plain address payment |
| `PRICE_ASSET=usdm` | Price SKUs in test USDM (needs tUSDM from https://tusdm.moneta.global) |
| `DEV_BYPASS=1` | Unpaid `/dev/*` mirrors + server runs without a facilitator |
| `RECORD_DECISION=0` | Skip the agent's on-chain decision tx |
| `?corrupt=1` on any SKU | Server emits a wrong proof hash — the agent rejects the answer; escrowed funds are never released (auto-refund beat for the demo) |

## Layout

```
scripts/wallet.ts            wallet generator (seller + buyer)
src/facilitator.ts           local x402 facilitator (verify/settle via Blockfrost)
src/facilitatorStub.ts       offline stub — emits real 402 requirements w/o keys
src/server.ts                marketplace: free catalogue, paid SKUs, proof envelope
src/catalogue.ts             SKU registry + pricing
src/nwn/client.ts            NOWNodes blockbook/RPC client (+ fixture mode)
src/nwn/chains.ts            chain registry (verified hostnames)
src/products/                the SKU implementations + shared runSku engine
src/coworker/                Sokosumi coworker: task router + runtime worker
src/agent/tradingAgent.ts    the paying agent
src/demo.ts                  one-command orchestrator
scripts/sokosumi-setup.sh    guided coworker registration on preprod
docs/                        team docs — see docs/README.md for the map
```

## Honest scope notes

- Escrowed funds are **released/refunded by the Masumi contract on its
  deadlines** (submitResultTime → unlockTime → dispute window). This build
  demonstrates the lock and the validation path; wiring the full Masumi
  lifecycle API (`submit-result`, early release) is the post-hackathon step.
- `holder-concentration` samples the most *active* receivers in the window —
  dormant whales outside it aren't candidates. Balances are exact.
- Fixture mode (`NOWNODES_API_KEY` unset) exists for offline dev; the onstage
  demo should run live.
