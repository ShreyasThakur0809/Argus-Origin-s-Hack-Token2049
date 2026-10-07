# Setup — zero to running

Everything needed to run Argus locally on a fresh machine.

## Prerequisites

- Node.js 20+
- Git
- For coworker work only: `sokosumi` CLI v1.0.4+ (`npm i -g sokosumi` or per
  the Sokosumi docs)
- For deploying the site: `vercel` CLI (members of the Vercel team only)

## Clone + install

```bash
git clone https://github.com/SatyamDev803/Query402.git
cd Query402
npm install
npm --prefix web install
```

## `.env`

```bash
cp .env.example .env
npm run wallet      # prints a fresh SELLER_MNEMONIC + BUYER_MNEMONIC pair
```

Fill in:

| Var | Where to get it | Without it |
| --- | --- | --- |
| `BLOCKFROST_PROJECT_ID` | free preprod project at https://blockfrost.io | facilitator cannot settle; exits |
| `NOWNODES_API_KEY` | https://nownodes.io free tier | marketplace runs on fixture data |
| `COINGECKO_API_KEY` | https://www.coingecko.com/en/api demo tier | market SKUs run on fixture data, decisions lose market context |
| `SELLER_MNEMONIC` | `npm run wallet` | 402 terms cannot be signed |
| `BUYER_MNEMONIC` | `npm run wallet` | the demo agent cannot pay |
| Buyer tADA | https://docs.cardano.org/cardano-testnets/tools/faucet → buyer address | payments fail |

Defaults already correct in `.env.example`: `ESCROW=masumi`,
`CARDANO_NETWORK=cardano:preprod`, `PORT=4021`, `DEV_BYPASS=1` (local only).

`.env` is gitignored. Mnemonics are testnet wallets, but treat them as
secrets anyway: never paste them in chat or commit them. If one leaks,
generate a fresh pair and move the funds.

## Sokosumi (coworker side only)

```bash
sokosumi --preprod auth login     # browser OAuth, human step
```

The Coworker runtime key is a second, separate credential that lives in
the OS vault, not in `.env`. It currently exists **only on Shreyas's
machine** — see docs/COWORKER.md before touching this.

## Sanity check

```bash
npm run typecheck
scripts/dev-start.sh --local     # marketplace :4021 + web :3000
npm run facilitator              # in a second terminal → :4022
curl -s http://localhost:4021/health
# {"ok":true,"network":"cardano:preprod","escrow":"masumi","source":"nownodes"}
```

`source: fixture` means the NOWNodes key did not load — answers are
synthetic. Fix the env before demoing.

Next: run the full verification pass in docs/TESTING.md.
