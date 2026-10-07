# Security — secrets map and rules

Where every secret lives, who can spend what, and what to do when
something leaks. For the threat model behind the design see
docs/ARCHITECTURE.md ("security model in one line").

## Secret inventory

| Secret | Lives in | What it can do | Exposure severity |
| --- | --- | --- | --- |
| `BUYER_MNEMONIC` | `.env` only | **Spend** the buyer wallet's tADA | High locally — testnet funds drain instantly |
| `SELLER_MNEMONIC` | `.env`, Render env | Sign escrow terms, receive payouts | High — same wallet holds collected payments |
| `BLOCKFROST_PROJECT_ID` | `.env`, Render env | Read chain data under our quota | Low — quota abuse only |
| `NOWNODES_API_KEY` | `.env`, Render env | Query data under our quota | Low — quota abuse only |
| Sokosumi OAuth | CLI login (browser) | Act as the user account | Medium — session tokens expire |
| Coworker runtime key | **OS vault** on the machine that imported it | Execute tasks + claim settlement as the coworker | High — never in `.env`, code, tasks, or chat |

Non-secrets safe to share: all IDs (`COWORKER_ID`, `VENDOR_ID`, org IDs,
access-request ID), wallet *addresses* (not mnemonics), tx hashes,
proof hashes.

## Trust boundaries (who holds what)

- **Seller** signs terms, never touches buyer funds directly — Masumi
  escrow holds them.
- **Buyer** signs the lock tx, never broadcasts — the facilitator does.
- **Facilitator** holds **no keys and no funds**; it verifies the signed
  tx pays the right invoice and submits it.
- **Dashboard / browser** holds nothing — playground uses `/dev/*`
  mirrors; the API never exposes mnemonics.
- **Worker** holds no wallet — task auth is the runtime key in the vault.

## Rules

- Never commit `.env`, `*.local`, `.coworker-*`, `.local/` — all
  gitignored; keep it that way.
- Never paste mnemonics, API keys, or the runtime key into chat, tickets,
  or task descriptions — task briefs are semi-public surfaces.
- `DEV_BYPASS` must stay **unset in production** — it disables payment on
  paid routes. Verified: prod `/dev/*` returns 404.
- `web/.env.local` overrides `MARKETPLACE_URL` — check it before assuming
  a local run is actually local.

## If a secret leaks

1. **Mnemonic** → `npm run wallet` for a fresh pair, transfer remaining
   funds to the new address, update `.env` + Render env, update
   `SELLER_ADDRESS` if it pointed at the old key.
2. **API keys** → rotate at blockfrost.io / nownodes.io dashboards,
   update `.env` + Render env.
3. **Runtime key** → `sokosumi --preprod coworkers api-key` to rotate,
   then `runtime key-import` on each worker machine. Revoke the old one.
4. Note the rotation in `docs/CONTEXT.md` so the team knows which wallet
   is live (old tx links stay valid as historical evidence).
