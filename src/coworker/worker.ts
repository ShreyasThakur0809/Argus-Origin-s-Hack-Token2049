/**
 * Argus as a Sokosumi Coworker: poll for READY tasks, run each against the
 * same SKU engine the marketplace serves, complete with the verified answer
 * (proof envelope included).
 *
 * Two credential planes:
 *  - `tasks` commands use SOKOSUMI_API_KEY when set (static user key from
 *    preprod.sokosumi.com/developer/api-keys), else the operator's OAuth
 *    session (sokosumi auth login — sessions get revoked, prefer the key).
 *  - `runtime start/complete` use the Coworker's runtime key, imported once
 *    via `coworkers api-key COWORKER_ID --json` then
 *    `runtime key-import --coworker-id COWORKER_ID --api-key-stdin`.
 *
 * With COWORKER_PAID=1 the worker buys each answer from the marketplace over
 * x402 (BUYER_MNEMONIC + BLOCKFROST_PROJECT_ID, COWORKER_SELLER_URL) so every
 * result carries a real on-chain payment tx. Without it the same SKU engine
 * runs locally for free.
 *
 *   COWORKER_ID=<id> npm run coworker
 *
 * Personal Workspace by default. For an organization Workspace set both
 * COWORKER_ORG_SLUG (tasks commands) and COWORKER_ORG_ID (runtime commands).
 * COWORKER_POLL_MS overrides the 15s poll interval.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import "dotenv/config";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { toClientCardanoSigner, USDM_PREPROD_ASSET } from "@x402/cardano";
import { ExactCardanoScheme } from "@x402/cardano/exact/client";
import { NownodesClient } from "../nwn/client.js";
import { CoinGeckoClient, marketContext } from "../cg/client.js";
import { resolveChain } from "../nwn/chains.js";
import { runSku } from "../products/runSku.js";
import { routeTask, catalogueSummary } from "./routeTask.js";
import { DECISION_INTENT, decide } from "./decide.js";

const sh = promisify(execFile);
const COWORKER_ID = process.env.COWORKER_ID?.trim();
const ORG_SLUG = process.env.COWORKER_ORG_SLUG?.trim();
const ORG_ID = process.env.COWORKER_ORG_ID?.trim();
const POLL_MS = Number(process.env.COWORKER_POLL_MS ?? "15000");
const STATE_FILE = ".coworker-state.json";
const RESULT_DIR = ".coworker-results";
const ACK = "Argus accepted this task and is running the intelligence engine now.";

if (!COWORKER_ID) {
  console.error("Set COWORKER_ID in .env (create one with `sokosumi --preprod coworkers register --vendor-id ID --name NAME --capability tasks --personal`)");
  process.exit(1);
}
// tasks commands take --organization-slug only; OAuth defaults to the
// personal Workspace with no flag. runtime commands take --organization-id
// or --personal.
const taskScope = ORG_SLUG ? ["--organization-slug", ORG_SLUG] : [];
const runtimeScope = ORG_ID ? ["--organization-id", ORG_ID] : ["--personal"];
const nwn = new NownodesClient();
const cg = new CoinGeckoClient();

// Paid mode: the worker behaves like any x402 buyer — wallet in
// BUYER_MNEMONIC, payment verified + escrowed by the marketplace
// (Masumi on Cardano preprod), tx hash lands in the result.
const PAID = process.env.COWORKER_PAID === "1";
const SELLER = (process.env.COWORKER_SELLER_URL ?? process.env.SELLER_URL ?? "https://query402-marketplace.onrender.com").replace(/\/$/, "");
const NETWORK = "cardano:preprod" as const;
const BF_BASE = process.env.BLOCKFROST_BASE_URL ?? "https://cardano-preprod.blockfrost.io/api/v0";
const BF_ID = process.env.BLOCKFROST_PROJECT_ID?.trim();
const MNEMONIC = process.env.BUYER_MNEMONIC?.trim();
const EXPLORER_TX = "https://preprod.cardanoscan.io/transaction";

let paidFetch: typeof fetch | null = null;
let walletAddr = "";
let lastTx: string | null = null;

async function payer(): Promise<typeof fetch> {
  if (paidFetch) return paidFetch;
  const signer = toClientCardanoSigner({
    mnemonic: MNEMONIC!,
    network: NETWORK,
    provider: { blockfrost: { baseUrl: BF_BASE, projectId: BF_ID! } },
  });
  walletAddr = signer.getAddress();
  const client = new x402Client().setSpendControls({
    allowedAssets: [
      { network: "cardano:*", asset: "lovelace" },
      { network: "cardano:*", asset: USDM_PREPROD_ASSET },
    ],
  });
  client.register("cardano:*", new ExactCardanoScheme(signer));
  paidFetch = wrapFetchWithPayment(fetch, client);
  console.log(`[worker] paid mode: buying answers from ${SELLER} (wallet ${walletAddr.slice(0, 20)}…)`);
  return paidFetch;
}

type PaidResult = Record<string, unknown> & { data?: unknown; payment?: { tx?: string; escrow?: string; network?: string; explorer?: string } };

/** Buy the answer from the live marketplace over x402. The envelope carries
 *  the real settlement tx under `payment`. Free-tier seller hiccups and UTXO
 *  mempool lag bounce payments with 402 or 5xx — retry with a fresh client
 *  (new UTXO snapshot) a couple of times before falling back. */
async function paidResult(routed: { url: string; body?: unknown }): Promise<PaidResult> {
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      console.error(`[worker] paid attempt ${attempt} bounced (${res!.status}), retrying with fresh client`);
      paidFetch = null; // rebuild signer + client: fresh UTXO snapshot
      await new Promise(r => setTimeout(r, 12_000));
    }
    const f = await payer();
    res = routed.body
      ? await f(`${SELLER}${routed.url}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(routed.body),
        })
      : await f(`${SELLER}${routed.url}`);
    if (res.ok || (res.status !== 402 && res.status < 500)) break;
  }
  if (!res!.ok) {
    const text = await res!.text().catch(() => "");
    throw new Error(`paid call HTTP ${res!.status} ${text.slice(0, 120)}`);
  }
  const env = (await res!.json()) as PaidResult;
  const settle = new x402HTTPClient(new x402Client()).getPaymentSettleResponse(h => res!.headers.get(h));
  const tx = env.payment?.tx ?? settle?.transaction;
  if (tx) {
    env.payment = { ...(env.payment ?? {}), tx, explorer: `${EXPLORER_TX}/${tx}` };
    lastTx = tx;
    console.log(`[worker] paid tx ${tx.slice(0, 16)}… on cardano:preprod`);
  }
  return env;
}

/** Consecutive payments spend the previous tx's change output — wait until
 *  it is visible to the wallet before paying again. */
async function waitForSpendable(txHash: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BF_BASE}/addresses/${walletAddr}/utxos`, { headers: { project_id: BF_ID! } });
      if (res.ok) {
        const utxos = (await res.json()) as { tx_hash: string }[];
        if (utxos.some(u => u.tx_hash === txHash)) return;
      }
    } catch { /* transient blockfrost error */ }
    await new Promise(r => setTimeout(r, 6000));
  }
}

async function cli(args: string[]): Promise<unknown> {
  const { stdout } = await sh("sokosumi", ["--preprod", ...args, "--json"], { maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(stdout.slice(stdout.search(/[[{]/)));
}

interface Task { id: string; name?: string; description?: string; status?: string; coworkerId?: string; }

function taskList(raw: unknown): Task[] {
  const list = Array.isArray(raw) ? raw
    : (raw as Record<string, unknown>).tasks ?? (raw as Record<string, unknown>).items ?? (raw as Record<string, unknown>).data;
  return Array.isArray(list) ? (list as Task[]) : [];
}

async function loadState(): Promise<{ done: string[] }> {
  try { return JSON.parse(await readFile(STATE_FILE, "utf8")); } catch { return { done: [] }; }
}
const saveState = (s: { done: string[] }) => writeFile(STATE_FILE, JSON.stringify(s));

async function execute(task: Task) {
  const brief = [task.name, task.description].filter(Boolean).join("\n");
  const routed = routeTask(brief);
  if (!routed) {
    return {
      ok: true, answeredBy: "argus-coworker", question: brief,
      note: "No catalogue SKU matches this brief. Argus answers the following per query:",
      catalogue: catalogueSummary(),
    };
  }
  try {
    let result: Record<string, unknown>;
    try {
      result = PAID && MNEMONIC && BF_ID
        ? await paidResult(routed)
        : await runSku(nwn, cg, routed.skuId, {
            originalUrl: routed.url,
            params: routed.chain ? { chain: routed.chain } : {},
            body: routed.body,
          });
    } catch (paidErr) {
      if (!PAID) throw paidErr;
      console.error(`[worker] paid fetch failed (${paidErr instanceof Error ? paidErr.message : paidErr}); running local engine`);
      result = await runSku(nwn, cg, routed.skuId, {
        originalUrl: routed.url,
        params: routed.chain ? { chain: routed.chain } : {},
        body: routed.body,
      });
    }
    // Decision briefs get market context folded into the rationale when
    // CoinGecko is live — enrichment is best-effort, never blocks the answer.
    let market;
    if (DECISION_INTENT.test(brief) && cg.live) {
      const symbol = routed.chain ? resolveChain(routed.chain)?.symbol.toLowerCase() : undefined;
      if (symbol) market = await marketContext(cg, symbol).catch(() => undefined);
    }
    const extra = DECISION_INTENT.test(brief) ? { decision: decide(routed.skuId, result.data, market), ...(market ? { market } : {}) } : {};
    return { ok: true, answeredBy: "argus-coworker", question: brief, matchedSku: routed.skuId, request: routed.url, ...extra, ...result };
  } catch (error) {
    return { ok: false, answeredBy: "argus-coworker", question: brief, matchedSku: routed.skuId, request: routed.url, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Human comments on a task (actor.type === "user"), newest last. */
async function taskComments(taskId: string): Promise<string[]> {
  try {
    const raw = await cli(["tasks", "events", taskId, ...taskScope]) as { events?: { actor?: { type?: string }; comment?: string }[] };
    return (Array.isArray(raw) ? raw : raw.events ?? [])
      .filter(e => e.actor?.type === "user" && typeof e.comment === "string")
      .map(e => e.comment as string);
  } catch {
    return [];
  }
}

async function once(done: Set<string>) {
  // A paid task leaves an unconfirmed change output; the next payment must
  // wait for it or the wallet has nothing spendable.
  if (lastTx) {
    const tx = lastTx;
    lastTx = null;
    await waitForSpendable(tx);
  }
  const raw = await cli(["tasks", "list", "--status", "READY", "--coworker-id", COWORKER_ID!, "--limit", "100", ...taskScope]);
  const ready = taskList(raw).filter(t => !done.has(t.id));
  for (const task of ready) {
    console.log(`[worker] task ${task.id}: ${task.name ?? "(untitled)"}`);
    let started: Task;
    try {
      started = await cli(["runtime", "start", task.id, "--coworker-id", COWORKER_ID!, ...runtimeScope]) as Task;
    } catch (error) {
      console.error(`[worker] start failed for ${task.id}:`, error instanceof Error ? error.message : error);
      continue; // leave for operator inspection; not marked done
    }
    // The started Task carries the authoritative input; merge in any human
    // comments so follow-ups on the task influence the answer. Fetch before
    // posting the ack (and filter it by text): `tasks comment` runs under the
    // operator's user identity, so our own ack would otherwise be read back
    // as a human comment and can hijack routing ("running" -> chain-status).
    const comments = (await taskComments(task.id)).filter(c => c.trim() !== ACK);
    // Acknowledge pickup on the task thread; cosmetic, so never fatal.
    try {
      await cli(["tasks", "comment", task.id, ...taskScope, "--comment", ACK]);
    } catch { /* comment is best-effort */ }
    const brief = [started.description ?? task.description ?? task.name, comments.length ? `Task comments:\n${comments.join("\n")}` : ""]
      .filter(Boolean).join("\n\n");
    const result = await execute({ id: task.id, description: brief });
    await mkdir(RESULT_DIR, { recursive: true });
    const file = `${RESULT_DIR}/${task.id}.json`;
    await writeFile(file, JSON.stringify(result, null, 2));
    try {
      const completed = await cli(["runtime", "complete", task.id, "--coworker-id", COWORKER_ID!, ...runtimeScope, "--result-file", file]) as { status?: string };
      // Skill contract: report completion only after a COMPLETED status.
      if (completed?.status && completed.status !== "COMPLETED") {
        console.error(`[worker] complete returned ${completed.status} for ${task.id} — inspect before retry`);
      } else {
        console.log(`[worker] completed ${task.id}${result.matchedSku ? ` via ${result.matchedSku}` : " (catalogue fallback)"}`);
        done.add(task.id);
      }
    } catch (error) {
      console.error(`[worker] complete failed for ${task.id}:`, error instanceof Error ? error.message : error);
    }
  }
}

async function main() {
  const state = await loadState();
  const done = new Set(state.done);
  console.log(`[worker] Argus coworker ${COWORKER_ID} polling every ${POLL_MS / 1000}s (${ORG_SLUG ? `org ${ORG_SLUG}` : "personal workspace"})`);
  console.log(`[worker] requires an imported runtime key (coworkers api-key → runtime key-import)`);
  for (;;) {
    try { await once(done); await saveState({ done: [...done] }); }
    catch (error) { console.error("[worker] poll failed:", error instanceof Error ? error.message : error); }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

await main();
