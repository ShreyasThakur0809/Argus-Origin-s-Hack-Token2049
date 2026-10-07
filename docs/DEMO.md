# Demo — pitch runbook

The story, the on-stage sequence, and the recovery moves when live infra
misbehaves. For verification commands see docs/TESTING.md.

## The story (30 seconds)

> AI agents can reason and they can pay — but they are blind on-chain.
> Dune, Nansen, Arkham: all built for humans with logins and credit
> cards. Argus is the specialist coworker an agent hires when it needs
> on-chain intelligence. It pays per query with x402 + Masumi escrow on
> Cardano, gets a cryptographically verified answer, and acts on it.

```
RAW ON-CHAIN DATA → ARGUS INTELLIGENCE → VERIFIED ANSWER → AGENT DECISION
```

Tagline: **Argus — give AI agents eyes on-chain.**

Do not pitch "we built an agent marketplace" and do not make x402 the
innovation — it is plumbing. The differentiation: decision-ready answers
(HEDGE / NO_HEDGE), verification instead of trust, one coworker that
does one job very well.

## The sequence (~4 minutes)

1. **Catalogue** — playground or terminal shows 10 SKUs, `escrow=masumi`,
   `source=nownodes`. "Any agent can discover this cold."
2. **The paid request** — `npm run demo` (or `SELLER_URL=<prod> npm run
   agent` against hosted). Narrate each beat: 402 → agent signs → escrow
   locks → answer + proof hash → agent re-verifies the hash itself.
3. **The decision** — the agent stamps `HEDGE` + evidence (proof hash,
   payment tx) in a real preprod transaction. Open the cardanoscan link.
   "The receipt is on-chain forever."
4. **The trust demo** — `?corrupt=1` (localhost, or the playground
   toggle): server returns a valid-looking answer with a wrong proof
   hash; the buyer recomputes, refuses, escrowed funds are never
   released. "An API can lie to your agent. Argus cannot get away with
   it."
5. **The coworker beat** — create a Sokosumi task in the TOKEN2049
   workspace: "Should I hedge BTC? … HEDGE or NO HEDGE" → worker picks
   it up → task goes COMPLETED with verified data + proof hash +
   explicit `decision.signal` posted on the task thread. Two ways to
   show it: the Sokosumi Tasks UI + the worker terminal, or the local
   `/coworker` page served on the worker machine (the hosted Vercel site
   does not run tasks — credentials never leave the worker machine).
   Workspace tasks settle in credits, so the escrow/payment story lives
   in beats 2–4; the coworker beat proves the same engine runs behind
   Sokosumi's agent marketplace.

Timing: each settlement takes ~60–90s of block time. For a tight slot
run one purchase + the decision tx, not two purchases.

## Before you walk on stage

- [ ] Warm Render: `curl /health` + `/supported` (60s cold start
      otherwise) — keepalive pings every 10 min but can lag
- [ ] `source: nownodes` in `/health` — never demo on fixture data
- [ ] Buyer wallet has tADA; seller can receive
- [ ] `npm run coworker` running on the machine with the runtime key
- [ ] One task already COMPLETED with a verified result (backup evidence
      if a live task stalls)
- [ ] Port :4021 free before `npm run demo` (it spawns its own server)
- [ ] Cardanoscan open in a tab, ready to paste tx hashes

## Recovery moves

| If | Do |
| --- | --- |
| Render cold start mid-demo | Talk through the sequence diagram in docs/ARCHITECTURE.md while it wakes (~50s) |
| Live payment hangs | Fall back to the recorded receipts in docs/TESTING.md §3/§8 — real preprod txs, verifiable by judges |
| Settlement too slow | `ACCEPT_MEMPOOL=1` on the facilitator settles on mempool visibility (~2s) |
| Sokosumi task not picked up | Wrong workspace scope or keyless machine — create the task `--personal` on the runtime-key machine |
| Everything dies | Screenshots + tx hashes in docs/CONTEXT.md are already-verified proof of a working system |

## Judge Q&A ammunition

- *"Why Cardano?"* eUTxO = deterministic parallel payments, no approvals
  or nonce contention; Masumi escrow is first-class in `@x402/cardano`;
  the 402 receipt is a signed SLA.
- *"Why NOWNodes?"* 120+ networks behind one API — including BTC/DOGE/
  Tron where no incumbent agent index exists.
- *"What if the seller lies?"* The proof hash is recomputed
  client-side; escrowed funds auto-refund at the deadline. We demoed it.
- *"What about stale answers?"* Envelope carries chain tips +
  `generatedAt`; staleness is a rejection condition.
- *"Scaling?"* Single seller today; the catalogue is already a
  machine-readable contract — seller registration is the v2.
