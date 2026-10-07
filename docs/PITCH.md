# Pitch — submission package

Everything the TOKEN2049 portal asks for, in one place. Tracks: **Cardano
Agentic Commerce** + **NOWNodes Multichain Infrastructure**.

## Submission checklist

| Portal item | What to submit | Status |
| --- | --- | --- |
| GitHub repository | `https://github.com/SatyamDev803/Query402` — must be public or judge-invited | ready |
| Project link | `https://argus402.onrender.com` (live) + API: `https://query402-marketplace.onrender.com/catalogue` | live |
| Presentation slides | `.ppt` or `.keynote` on Google Drive — **no Google Slides/Gamma/Vercel links**; embed the demo video inside the deck; locked at submission | to build |
| Demo video | max **3 min** screen recording, no external video links | to record |
| Project write-up | the text below — paste into the portal's Write field | ready |

Stage rules: no live demos on stage, keep slides visual, deck is locked at
the deadline — record the video first, then build the deck around it.

## Project write-up (paste-ready)

**The problem.** AI agents are becoming the largest consumers of blockchain
data, but every provider — Dune, Nansen, Arkham — is built for humans:
accounts, API keys, credit cards, monthly subscriptions. An autonomous agent
has none of these. The missing primitive is not another dataset; it is a way
for a machine to buy a single verified answer, trustlessly, at the moment it
needs it.

**The product.** Argus is an on-chain intelligence coworker for AI agents:
give AI agents eyes on-chain. One engine sits behind two surfaces. The HTTP
marketplace lets any agent pay per query over x402 with Masumi escrow on
Cardano Preprod — no account, no API key. The same engine runs as a Sokosumi
Coworker that takes a natural-language brief ("Should I hedge BTC?") and
returns a decision-ready answer (HEDGE / NO_HEDGE) with evidence, not raw
tables. Every answer carries a sha-256 proof envelope the buyer recomputes;
on mismatch the agent refuses payment and the escrowed funds auto-refund.
The seller is only paid for correct, verified answers.

**Technical approach.** Node.js + TypeScript. Express marketplace with a
machine-readable catalogue of 10 intelligence SKUs (whale flow, holder
concentration, bridge activity, fee market, tx/chain status, address
snapshot, raw RPC) across 120+ NOWNodes networks plus CoinGecko market data
(market snapshot, trending) covering thousands of assets — including BTC,
DOGE and Tron where no incumbent agent index exists. Payments use `@x402/cardano`:
a 402 response carries seller-signed Masumi escrow terms (price, deadlines,
input commitment); the buyer's signer locks funds in the Plutus escrow
contract; a keyless facilitator verifies and submits on preprod via
Blockfrost. Verified decisions are stamped on-chain as metadata receipts
(CIP-20 label 674). The Sokosumi worker (`sokosumi` CLI runtime) polls READY
tasks, routes briefs to SKUs, and completes with the proof envelope;
Masumi escrow settles the payout. Frontend: Next.js dashboard with a live
playground and activity feed.

**Deployment & scale.** Live today: dashboard, marketplace, and facilitator
all on Render, real preprod settlements on cardanoscan. Scaling path:
seller registration turns the single-vendor catalogue into a market;
additional data providers (Dune, others) plug in as labeled premium SKUs;
the full Masumi lifecycle API (submit-result, early release) completes the
optimistic path; proof hashes + payment receipts become an agent-queryable
seller reputation layer.

## Deck outline (8 slides, visual, punchy)

1. **Title** — ARGUS. Give AI agents eyes on-chain. Team + tracks.
2. **Problem** — agents can reason and pay but are blind on-chain; every
   data provider assumes a human.
3. **Product** — the funnel: raw on-chain data → Argus intelligence →
   verified answer → agent decision.
4. **Demo still** — screenshot of the paid flow ending in `HEDGE` +
   cardanoscan receipt.
5. **How it works** — one diagram: 402 → escrow → verify → act → refund
   if the proof fails.
6. **Why it wins** — verification instead of trust; decisions instead of
   data; agent-native rails underneath, not the headline.
7. **Tracks fit** — Cardano Agentic Commerce (x402 + Masumi escrow +
   Sokosumi coworker) and NOWNodes multichain supply.
8. **What's next** — multi-seller catalogue, lifecycle API, reputation.

## Video script (≤3 min, screen record — no live stage demo allowed)

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Title card / site | "Agents can think and pay, but they're blind on-chain. Argus fixes that." |
| 0:20 | `/catalogue` (prod) | 10 SKUs, live NOWNodes + CoinGecko data, Masumi escrow — discoverable by any agent, no signup |
| 0:40 | `npm run demo` terminal | Agent gets a 402, signs, locks escrow, gets the answer + proof hash — pause on `paid, tx …` |
| 1:20 | `✓ proof verified` + decision tx | Buyer re-verifies the hash itself, stamps `HEDGE` on-chain — open cardanoscan |
| 1:50 | `corrupt=1` run or playground toggle | Dishonest answer → hash mismatch → payment refused, escrow refunds itself |
| 2:20 | Sokosumi task → COMPLETED + `decision.signal` | Same engine as a coworker: brief in, verified decision out, proof hash on the thread |
| 2:50 | Site hero / closing frame | "Argus — give AI agents eyes on-chain." |

Record at 1080p+, terminal font large. If the coworker leg isn't approved
in time, cut 2:20–2:50 and use the second production paid run as the
close instead.

## Evidence to cite (real, verifiable)

- Local paid run: whale-flow `1ea10e55926bce60…`, decision `dc20f0da…`
- Production paid run: whale-flow `75697862af2413a4…`, decision `d2427a24…`
- All on `https://preprod.cardanoscan.io` — judges can verify on-chain
- Coworker: Argus `01a11316-5890-709f-b2e0-aa9ff35e84a2`, TOKEN2049
  access request `01a11341-8e06-7010-920b-b428087e2903`
