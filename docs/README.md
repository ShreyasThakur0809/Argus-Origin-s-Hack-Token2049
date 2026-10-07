# Argus docs

Each doc covers one job. Read the row that matches what you are doing.

| Doc | Purpose | Read it when |
| --- | --- | --- |
| [SETUP.md](SETUP.md) | Zero-to-running environment setup | First clone, new machine, missing keys |
| [PROJECT.md](PROJECT.md) | Product + technical overview | Understanding what Argus is and why |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Internals: components, env vars, request→settlement flow, SKU deep dive | Modifying code, debugging the payment path |
| [TESTING.md](TESTING.md) | End-to-end verification runbook | Validating a change, pre-demo rehearsal |
| [COWORKER.md](COWORKER.md) | Sokosumi operations: IDs, worker, tasks, receipts, workspace approval | Running or debugging the coworker side |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Render + Vercel production ops | Deploying, checking prod health, cold starts |
| [DEMO.md](DEMO.md) | Pitch script + demo sequence | Presenting to judges |
| [PITCH.md](PITCH.md) | Submission package: checklist, write-up, deck outline, video script | Filling the hackathon portal |
| [API.md](API.md) | Marketplace integration reference: routes, params, 402 headers, envelope, verification | Integrating as an agent buyer |
| [SECURITY.md](SECURITY.md) | Secrets map, trust boundaries, rotation playbook | Handling credentials, responding to a leak |
| [CONTEXT.md](CONTEXT.md) | Session handoff: current state, open items | Picking up mid-project |

Root files that stay at root: `README.md` (repo entry point),
`AGENTS.md` / `CLAUDE.md` (agent tooling reads them at root),
`package.json`, `tsconfig.json`, `.env.example`.
