# API — agent integration reference

The Argus marketplace speaks HTTP + x402. No accounts, no API keys:
unpaid calls get a `402 Payment Required` with signed escrow terms; a
Cardano wallet signs; the answer returns with a proof envelope.

| Base URL | Notes |
| --- | --- |
| `http://localhost:4021` | local stack (`scripts/dev-start.sh --local`) |
| `https://query402-marketplace.onrender.com` | production (Render free tier, ~60s cold start) |
| `https://argus402.onrender.com/api/q402/*` | browser proxy to production — same paths |

## Free endpoints

| Route | Returns |
| --- | --- |
| `GET /health` | `{ok, network, escrow, source}` — `source` is `nownodes` (live) or `fixture` (synthetic) |
| `GET /catalogue` | `{name, poweredBy, network, escrow, payTo, skus[], chains[]}` — machine-readable discovery with prices and examples |
| `GET /activity` | `{entries[100]}` — recent SKU executions incl. mode (`paid`/`dev`), status, `resultHash`, `tx` |

## Paid endpoints (the catalogue)

All SKUs return the same envelope. Prices shown in tADA (lovelace in
`price.amount`); `PRICE_ASSET=usdm` switches to tUSDM.

| SKU | Route | Params | tADA |
| --- | --- | --- | --- |
| `raw-rpc` | `POST /rpc/:chain` | body `{"method","params"}`; read-only method whitelist enforced | 1.0 |
| `tx-status` | `GET /data/tx-status` | `chain` (def `eth`), `txid` (64-hex; base58 on `sol`) | 1.0 |
| `chain-status` | `GET /data/chain-status` | `chains` csv (def `eth,base,btc`) | 1.0 |
| `fee-market` | `GET /data/fee-market` | `chains` csv (def `eth,base,arb`), `confTarget` 1-25 | 1.5 |
| `address-snapshot` | `GET /data/address-snapshot` | `chain` (def `eth`), `address` (0x40-hex on EVM) | 1.5 |
| `whale-flow` | `GET /data/whale-flow` | `chain` (def `eth`), `blocks` 1-25 (def 3), `minNative`, `limit` 1-100 | 1.5 |
| `holder-concentration` | `GET /data/holder-concentration` | `chain` (def `eth`), `token` (ERC20 addr, required), `blocks` 100-100k, `sample` 5-64 | 2.5 |
| `bridge-activity` | `GET /data/bridge-activity` | `chains` csv (def `eth,base`), `blocks` 100-50k | 2.5 |
| `market-snapshot` | `GET /data/market-snapshot` | `assets` csv of symbols or CoinGecko ids (def `btc,eth,sol`, max 15) | 1.0 |
| `trending` | `GET /data/trending` | none | 1.0 |

`market-snapshot` and `trending` are served from CoinGecko
(`proof.source: "coingecko"`), everything else from NOWNodes
(`proof.source: "nownodes"`). Any CoinGecko asset id is valid for
`assets` — market data is not limited to node-backed chains.

Supported `chain` ids are listed in `/catalogue` (`chains[]` with `kind`,
`blockbook`, `rpc` capabilities). `raw-rpc` registers one route per chain
with an RPC endpoint (`/rpc/eth`, `/rpc/base`, …).

## The 402 exchange

```text
1. GET /data/whale-flow?chain=btc&blocks=3
   ← 402, header PAYMENT-REQUIRED: base64 JSON
     accepts[]: { scheme: "exact", network: "cardano:preprod",
                  price, payTo: <masumi escrow address>,
                  extra: { assetTransferMethod: "masumi", terms: {...deadlines,
                           inputCommitment}, referenceSignature } }
2. Buyer builds+signs a Cardano tx locking `price` into the escrow contract
   (job datum: buyer, seller, result hash slot, deadlines).
3. Retry same request with header PAYMENT-SIGNATURE: <signed payload>.
   Server forwards to the facilitator → verify → settle → submits on-chain.
4. ← 200, body = envelope below, header PAYMENT-RESPONSE carries the tx hash.
```

Easiest buyer path: `@x402/cardano` + `toClientCardanoSigner` +
`wrapFetchWithPayment` — see `src/agent/tradingAgent.ts` for a working
client. Buyers sign; the facilitator broadcasts.

## Response envelope

```json
{
  "sku": "whale-flow",
  "data": { "…": "SKU payload" },
  "proof": {
    "resultHash": "sha256:…",
    "generatedAt": "ISO8601",
    "latencyMs": 812,
    "source": "nownodes",
    "sourceMode": "live"
  },
  "payment": { "tx": "<settlement tx hash>", "escrow": "masumi", "network": "cardano:preprod" }
}
```

**Client-side verification (do this, always):**

```ts
import { createHash } from "crypto";
const ok = `sha256:${createHash("sha256").update(JSON.stringify(env.data)).digest("hex")}`
           === env.proof.resultHash;
```

`false` → reject the answer. Under `masumi` escrow the locked funds are
never released — the contract refunds them at `unlockTime`. That's the
trust model: the seller cannot be paid for a wrong answer.

## Errors

| Code | Meaning |
| --- | --- |
| `400` | Bad params — returned **before** payment is ever requested (`{"error": "…"}`) |
| `402` | Payment required — normal part of the dance, not a failure |
| `502` | Upstream data source failed post-payment — escrowed funds stay locked and refund by deadline |

## Dev-only surface

`DEV_BYPASS=1` (local `.env` default) mounts unpaid `/dev/*` mirrors and
lets the server run without a facilitator. `?corrupt=1` on any SKU makes
the server emit a wrong `resultHash` — the rejection demo. Neither
exists in production (`/dev/*` → 404).
