# Argus — Technical Overview

*Product: Argus · payment protocol: Query402*

> On-chain intelligence for AI agents. Pay per query, any chain, no account, no
> API key, no human in the loop.

TOKEN2049 Origins hackathon — tracks: **Cardano Agentic Commerce** and
**NOWNodes Multichain Infrastructure**.

---

## 1. The problem

AI agents are becoming the largest consumers of blockchain data, but every
provider today is built for humans:

- Dune, Nansen, Arkham: signup → credit card → API key → monthly subscription.
- An autonomous agent has no email, no card, and cannot agree to a ToS click.

The missing primitive is not another dataset. It is a way for a machine to buy
a single answer, trustlessly, at the moment it needs it.

## 2. The product

Argus is on-chain intelligence for AI agents:

1. An agent sends a plain HTTP request — no auth headers, no account.
2. The server responds **HTTP 402 Payment Required** with seller-signed Masumi
   escrow terms (price, deadlines, input commitment).
3. The agent's wallet builds and signs a Cardano transaction locking the
   payment into the **Masumi escrow smart contract**.
4. The request is retried with the payment payload. The facilitator verifies
   it, submits it to Cardano, and the marketplace returns the answer.
5. The answer carries a **proof envelope** (`sha256` result hash, chain tip,
   timestamp). If the hash does not verify, the agent rejects the answer and
   the escrowed funds are **automatically refunded by the contract** — the
   seller is only paid for correct answers.

Supply side is **NOWNodes**: 120+ networks served through one API surface,
including chains with no incumbent indexers for agents (BTC, Litecoin, DOGE,
Tron, etc.).

### Why Cardano

- eUTxO gives deterministic, parallel payments — no approval transactions,
  no nonce contention, no allowance attacks.
- Masumi escrow is a first-class asset transfer method in `@x402/cardano`.
- The 402 receipt *is* a signed service-level agreement: escrow deadlines,
  input commitment hash, and seller signature are all in the header.

## 3. Architecture

```
┌──────────────┐        ┌────────────────────────┐        ┌──────────────┐
│ trading agent│        │  Argus marketplace     │        │  facilitator │
│ (buyer)      │        │  (seller, Express)     │        │  (verify +   │
│              │        │                        │        │   broadcast) │
│ x402Client   │        │  /catalogue   (free)   │        │              │
│ + Cardano    │──GET──►│  /data/*      (paid)   │──HTTP──►│ /verify      │
│   signer     │◄─402───│  /rpc/:chain  (paid)   │◄────────│ /settle      │
│              │        │     │                  │        │      │       │
│ mnemonic →   │        │     ▼                  │        │      ▼       │
│ sign lock tx │        │  NOWNodes client ──────┼───────►│ Cardano      │
│              │        │  (blockbook + JSON-RPC)│        │ preprod      │
└──────────────┘        └────────────────────────┘        └──────────────┘
```

Three processes:

| Process | File | Role |
| --- | --- | --- |
| Marketplace | `src/server.ts` | Free catalogue + paid SKU routes behind `paymentMiddleware`. Emits 402 with escrow terms; serves verified answers. |
| Facilitator | `src/facilitator.ts` | Verify + settle over Blockfrost. Holds no keys and no funds — the buyer signs, the facilitator broadcasts. Advertises `default`, `masumi`, `script` transfer methods. |
| Agent | `src/agent/tradingAgent.ts` | The buyer. Holds only a mnemonic. Discovers SKUs, pays, verifies proofs, acts. |

The catalogue is the contract between the sides: `src/catalogue.ts` defines
SKU id, route, price (lovelace or tUSDM), and a machine-readable example. The
server registers one paid route per SKU; `/catalogue` exposes the same list
for free so any agent can discover offerings cold.

## 4. The payment lifecycle (x402 + Masumi)

1. **Request**: `GET /data/whale-flow?chain=btc`.
2. **402 response**: `PAYMENT-REQUIRED` header carries `accepts[]` with
   `scheme=exact`, `network=cardano:preprod`, amount, `payTo` = Masumi escrow
   contract, and `extra`:
   - `assetTransferMethod: "masumi"`
   - `inputCommitment`: SHA-256 of the request URL (binds payment to question)
   - `terms`: payment type, seller nonce, `payByTime`, `submitResultTime`,
     `unlockTime`, dispute window
   - `referenceSignature`: seller's signature over the terms
3. **Lock**: the buyer's `ExactCardanoScheme` signer builds a tx paying the
   escrow contract with a job datum. The buyer signs; it never broadcasts.
4. **Settle**: the marketplace forwards `{paymentPayload, requirements}` to
   the facilitator, which verifies and submits to preprod.
5. **Answer + proof**: the response body is a JSON envelope:

   ```json
   {
     "sku": "whale-flow",
     "data": { ... },
     "proof": {
       "resultHash": "sha256:…",
       "generatedAt": "…",
       "latencyMs": 812,
       "sourceMode": "live",
       "tips": { "btc": 918842 }
     },
     "payment": { "tx": "…", "escrow": "masumi", "network": "cardano:preprod" }
   }
   ```
6. **Verify**: the agent recomputes `sha256(JSON.stringify(data))` and compares
   to `resultHash`. Mismatch or staleness → reject. With escrow, a rejected
   answer is never paid out: funds auto-refund at `unlockTime`.

`?corrupt=1` on any SKU makes the server emit a wrong hash — the agent visibly
rejects the answer and the escrow refund beat plays out. That is the onstage
"what if the seller lies" demo.

## 5. The catalogue

| SKU | Route | Price (tADA / tUSDM) | What it answers |
| --- | --- | --- | --- |
| `raw-rpc` | `POST /rpc/:chain` | 1.0 / $0.01 | A single read-only JSON-RPC call on any NOWNodes network. The cheapest possible agent commodity: one node call, no API key. Method whitelist enforced **before** payment. |
| `tx-status` | `GET /data/tx-status` | 1.0 / $0.01 | Did my transaction land? Receipt status, block, and confirmation depth. `eth_getTransactionReceipt` + tip on EVM, blockbook tx lookup on UTXO/Tron, `getTransaction` on Solana. The settlement check every transacting agent needs. |
| `chain-status` | `GET /data/chain-status` | 1.0 / $0.01 | Chain liveness: tip height, last block timestamp, and block age vs expected interval per chain, with a lagging flag. The check a monitoring agent runs before trusting any other answer. Per-chain errors never poison the answer. |
| `fee-market` | `GET /data/fee-market` | 1.5 / $0.02 | Cost of transacting right now on each chain. `eth_gasPrice` in gwei on EVM, blockbook `estimatefee` per kB on UTXO. How an agent picks the cheapest execution venue — the step the demo agent performs by hand. |
| `address-snapshot` | `GET /data/address-snapshot` | 1.5 / $0.02 | What is this address right now? EVM: balance, nonce, and EOA-vs-contract detection via `eth_getCode`. UTXO/blockbook: lifetime totals and token balances. Solana: lamports, owner, executable flag. Counterparty and treasury checks. |
| `whale-flow` | `GET /data/whale-flow` | 1.5 / $0.02 | Largest native transfers over the last N blocks. Works on UTXO chains — BTC whale flow with no indexer needed. |
| `holder-concentration` | `GET /data/holder-concentration` | 2.5 / $0.05 | Top-5/10/25 holder share of an ERC20. Samples active receivers via `eth_getLogs`, then verifies each candidate with exact `balanceOf` + `totalSupply` calls. |
| `bridge-activity` | `GET /data/bridge-activity` | 2.5 / $0.05 | Inbound/outbound event counts on known bridge contracts (OP Stack StandardBridge, Across SpokePool, Wormhole) across several chains in one call. Direction totals dedupe by txid so paired legacy/v2 events never double-count. |
| `market-snapshot` | `GET /data/market-snapshot` | 1.0 / $0.01 | USD price, 24h change, market cap and volume per asset via CoinGecko — any tracked asset works, not just node-backed chains. The market context the coworker decision layer folds into hedge rationales. |
| `trending` | `GET /data/trending` | 1.0 / $0.01 | CoinGecko trending coins right now: rank, price, 24h move. Discovery input for surveillance agents. |

On-chain datasets degrade to fixture mode when `NOWNODES_API_KEY` is unset;
market SKUs do the same without `COINGECKO_API_KEY`, so the full marketplace
runs offline for development.

## 6. The demo agent

`npm run demo` runs the whole loop: facilitator, marketplace, then the agent.

1. **Discover** — fetches `/catalogue` (free) and `/health`.
2. **Purchase 1** — whale flow on BTC. Pays, verifies `resultHash`, derives a
   signal: `HEDGE` if one transfer dominates the window, else `HOLD`.
3. **Wait for UTXO** — on eUTxO chains the second payment spends the first
   payment's change output; the agent polls Blockfrost until it confirms.
   This is a real agentic-commerce detail most demos skip.
4. **Purchase 2** — one raw `eth_gasPrice` call on Base to pick a venue.
5. **Act** — stamps the decision (signal, reason, evidence hashes) as a real
   preprod transaction; prints explorer links for both payments and the
   decision.

### Verified live run (preprod, real settlement)

- Whale-flow payment: `6aa459b14c658ffe23ce55d56356a8aac65cb24d7531a42c57726de124803d8f`
- Raw-RPC payment: `3276a9d0a20cca5b…`
- Decision record: `ad8fac62247d311666c51fa014ec2cf7c196f933f7aee593451288d4de01afa8`
- Live data seen: 1,049 BTC whale flow in 3 blocks; 161k USDC transfers
  scanned with exact top-holder balances; Base bridge 90 outbound / 36 inbound
  in 3,000 blocks.

## 7. Design decisions worth defending

- **Broad event queries, not topic0 filters** — bridge-activity pulls all logs
  for a contract and labels signatures locally. OP Stack bridges emit both
  legacy (`ERC20BridgeInitiated`) and v2 (`ERC20DepositInitiated`) events for
  the same action; we hash-label both and dedupe direction totals by txid.
  Event-signature drift cannot silently zero the dataset.
- **Validation before payment** — bad chain, bad token, disallowed RPC method:
  all rejected 400 *before* the 402 dance, so a buyer never pays for garbage.
- **Sequential payments are the honest demo** — parallel x402 on one wallet
  fights over UTXOs. The agent serializes and waits for change confirmation;
  this is also the right production pattern for Cardano agents.
- **`acceptMempool` + confirmation bounds** — the facilitator accepts mempool
  visibility to keep settle times inside demo latency.

## 8. Honest limitations

- Escrow release/refund is by contract deadline (`submitResultTime` →
  `unlockTime` → dispute window). The lock and the validation path are
  demonstrated; the full Masumi lifecycle API (`submit-result`, early release)
  is the post-hackathon step.
- `holder-concentration` samples *active* receivers in the window — dormant
  whales are not candidates. Balances returned are exact; the caveat ships in
  the response.
- Settle latency is a Cardano block-time property (~60–90s per purchase on
  preprod). For a 60-second stage slot, demo one payment + the decision tx.
- Single-seller today. The marketplace pattern supports any seller registering
  a SKU; a `POST /catalogue/register` endpoint is the obvious v2.

## 9. Runbook

```bash
npm install
cp .env.example .env          # fill keys below
npm run demo                  # facilitator + marketplace + agent
```

| Env | Needed for | Source |
| --- | --- | --- |
| `BLOCKFROST_PROJECT_ID` | facilitator, agent, decision tx | blockfrost.io preprod project |
| `NOWNODES_API_KEY` | live data (empty = fixtures) | nownodes.io free tier |
| `BUYER_MNEMONIC` | agent wallet | `npm run wallet` |
| Buyer tADA | payments | preprod faucet → buyer address |
| `ESCROW=masumi` | escrow terms | set `default` for plain payment |
| `PRICE_ASSET=usdm` | cent-denominated pricing | tUSDM faucet |
| `DEV_BYPASS=1` | unpaid `/dev/*` mirrors | dev only — off for demos |

## 10. Where this goes

- **Multi-seller** — the catalogue is the only single-vendor piece; seller
  registration turns Argus from rail into market.
- **Labeled supply** — Dune spellbook tables (exchange labels, holder
  snapshots, RWA issuer data) plug in as premium SKUs behind the same 402.
- **Masumi lifecycle** — `submit-result` + early release completes the
  optimistic path; refunds already work pessimistically.
- **Agent-side reputation** — result hashes + payment receipts are a natural
  base layer for seller reputation an agent can itself query.
