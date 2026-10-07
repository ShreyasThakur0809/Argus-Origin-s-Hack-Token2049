# Contributing

Working agreements for the Argus team. Agent-facing notes live in
`AGENTS.md`; this file is for humans.

## Layout

- `src/` — marketplace, facilitator, agent, SKU engine, coworker
- `web/` — Next.js dashboard (deploys separately, `vercel deploy --prod`)
- `scripts/` — `dev-start.sh` / `dev-stop.sh` / `sokosumi-setup.sh` /
  `wallet.ts`
- `docs/` — all project documentation; see `docs/README.md` for the map.
  New docs go there, not at root.

## Naming

**Argus** is the product (UI, pitch, coworker). **Query402** is the
payment protocol/infra underneath. Never reintroduce Query402 as the
product name in user-facing copy.

## Git flow

- Small conventional commits (`feat:`, `fix:`, `docs:`), one concern per
  commit.
- `docs/CONTEXT.md` is the session handoff — update it with what changed
  and what's open before ending a work session.
- **Push deliberately**: any push to `main` restarts the Render services
  and can change production. No pushes during a live demo window.
- Verify before pushing: `npm run typecheck`, plus the relevant section
  of `docs/TESTING.md` for whatever you touched.

## Secrets

See `docs/SECURITY.md` for the full map. The short version: `.env`
stays local, the coworker runtime key stays in the OS vault, and nothing
with a mnemonic or key goes into chat, commits, or task descriptions.
