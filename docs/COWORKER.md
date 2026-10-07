# Coworker — Sokosumi operations

How the Argus coworker is registered, who can run it, and how tasks
become paid settlements. For task routing internals see
docs/ARCHITECTURE.md; for verification steps see docs/TESTING.md §6.

## Registered identity (do not re-register)

| Thing | Value |
| --- | --- |
| Coworker | Argus, `01a11316-5890-709f-b2e0-aa9ff35e84a2` |
| Vendor | Argus, `01a11316-1069-76fd-a0a9-eb1507ea7a21` |
| Argus org | `argus-9a7fvl` (`01a1130d-58db-729b-8c9a-e542dd42a346`), owner: Shreyas |
| TOKEN2049 org | `token2049-origins-hackathon-2026-nws2r7` (`01a109d1-32a9-71a3-a0e3-658b2a7987cd`), member |
| Access request to TOKEN2049 | `01a11341-8e06-7010-920b-b428087e2903` — **PENDING admin approval** |
| Owner account | shreyas.thakur@brownricecapital.com |

## Two credential planes — the part everyone trips on

| Commands | Credential | Where it lives |
| --- | --- | --- |
| `tasks`, `coworkers`, `workspaces`, `vendors` | Operator OAuth (`sokosumi --preprod auth login`) | whoever is logged in |
| `runtime start/complete/receipt` | Coworker runtime key | OS vault of the machine that ran `register --create-api-key` or `runtime key-import` — currently **Shreyas's laptop only** |

The runtime key must never go in `.env`, source, chat, or a task. To put
it on another machine: pipe `coworkers api-key` into `runtime key-import
--api-key-stdin` (see `scripts/sokosumi-setup.sh` phase 4).

## Running the worker

```bash
npm run coworker     # polls READY tasks for COWORKER_ID (15s default)
```

Expected first line: `Argus coworker 01a11316-… polling every Ns
(personal workspace)` — 15s by default, 5s with this repo's `.env`
(`COWORKER_POLL_MS=5000`). If it prints "runtime key must be imported
first", that machine has no key.

The worker loop: `tasks list --status READY` → `runtime start` (its
response is the authoritative task brief) → route + run the shared SKU
engine → `runtime complete --result-file` with `{sku, data, proof,
decision?}` → dedupe in `.coworker-state.json`, results in
`.coworker-results/` (both gitignored).

## Creating and verifying a task

Personal workspace works without any approval:

```bash
sokosumi --preprod tasks create --personal \
  --coworker-id 01a11316-5890-709f-b2e0-aa9ff35e84a2 \
  --description "Should I hedge BTC? Analyze on-chain activity over the last 3 blocks and give me a HEDGE or NO HEDGE recommendation" \
  --status READY --json
```

The hedge phrasing exercises the decision layer: the result carries a
`decision` object (`signal: HEDGE|NO_HEDGE`, `rationale`, `rule`) on top
of the verified data + proof hash.

Receipt — verify the run and, for paid tasks, the payment:

```bash
sokosumi --preprod runtime receipt <TASK_ID> \
  --coworker-id 01a11316-5890-709f-b2e0-aa9ff35e84a2 --json
```

`runtime receipt` takes no scope flags; the task ID selects it.
`settled: true` + `txHash` appear only when the task carried a Masumi
payment job — check `tasks jobs <TASK_ID>`: an empty `jobs` array means
the task ran on workspace credits (TOKEN2049 tasks do), no escrow
exists, and `settled` stays `false` forever. That is expected, not a
failure. For a paid job, poll until `onChainState: Withdrawn`; the CLI
reports `settled` only once the escrow released funds on-chain.

## TOKEN2049 workspace approval

Connecting a coworker to an org workspace creates a PENDING access
request that a workspace owner approves manually. Argus is **GRANTED**
(access request `01a11341-8e06-7010-920b-b428087e2903`, approved by
Sandro 2026-10-07): Argus is usable in the TOKEN2049 workspace and tasks
created there are funded by the workspace's credit pool. Org-scoped
tasks need `COWORKER_ORG_ID` + `COWORKER_ORG_SLUG` in `.env` (both set
on Satyam's machine to the TOKEN2049 org).

## Machine ownership (final plan)

Satyam's laptop builds and hosts everything; Shreyas mirrors the code to
GitHub. For coworker ops on Satyam's machine:

1. **Join the TOKEN2049 workspace** — the coworker is only usable in
   workspaces it is connected to (personal tasks under Satyam's account
   return "Coworker is not usable in this workspace"). Join via
   https://preprod.sokosumi.com/join/9Ycw8wzmzXB2WEKa-umzUJX6_GEFiVdu,
   then set `SOKOSUMI_ORG_SLUG=token2049-origins-hackathon-2026-nws2r7`.
2. **Runtime key handoff** — on Shreyas's machine:
   `sokosumi --preprod coworkers api-key 01a11316-5890-709f-b2e0-aa9ff35e84a2 --json`;
   send the key over a secure channel (not chat/issues); on Satyam's:
   `sokosumi --preprod runtime key-import --coworker-id 01a11316-5890-709f-b2e0-aa9ff35e84a2 --api-key-stdin`.
   Then `npm run coworker` and receipt verification work locally.

## Web flow (`/coworker` page)

The dashboard can create and watch tasks itself. `web/lib/sokosumi.ts`
shells the CLI server-side: `POST /api/coworker/task {brief}` → `tasks
create`; `GET /api/coworker/task?id=…` → `tasks get` (+ `runtime receipt`
once COMPLETED). No credential reaches the browser.

Must run on the machine that has CLI auth and (for receipts) the runtime
key. Web env: `COWORKER_ID` (required), `SOKOSUMI_ORG_SLUG` (org tasks;
unset = personal). On Vercel or a machine without the CLI the page returns
a clean 503 — the hosted site stays marketplace-only; present the coworker
leg from the local app or the Sokosumi UI.

## Troubleshooting

- `auth` failures → `sokosumi --preprod auth login` (tokens expire)
- Worker prints key warning → wrong machine; see credential planes above
- Task created but never picked up → wrong workspace scope (personal vs
  org env vars) or the coworker ID does not match the task assignment
- `register` vs `connect`: `register --personal` is the one-time
  developer path, already done. `connect` attaches to workspaces and is
  re-runnable. Never `register` a second Argus.
