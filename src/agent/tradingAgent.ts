/**
 * The buyer: an autonomous trading agent with a Cardano wallet and no
 * accounts anywhere. It pays per query via x402, verifies the answer's
 * proof, turns it into a signal, and stamps its decision on-chain.
 */
import { createHash } from "node:crypto";
import "dotenv/config";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { toClientCardanoSigner, USDM_PREPROD_ASSET } from "@x402/cardano";
import { ExactCardanoScheme } from "@x402/cardano/exact/client";

const NETWORK = (process.env.CARDANO_NETWORK ?? "cardano:preprod") as "cardano:preprod";
const SERVER = process.env.SELLER_URL ?? "http://localhost:4021";
const blockfrostBaseUrl = process.env.BLOCKFROST_BASE_URL ?? "https://cardano-preprod.blockfrost.io/api/v0";

const mnemonic = process.env.BUYER_MNEMONIC?.trim();
const projectId = process.env.BLOCKFROST_PROJECT_ID?.trim();
if (!mnemonic || !projectId) {
  console.error("Set BUYER_MNEMONIC and BLOCKFROST_PROJECT_ID in .env (see .env.example)");
  process.exit(1);
}

const EXPLORER = NETWORK === "cardano:preprod" ? "https://preprod.cardanoscan.io/transaction" : "https://cardanoscan.io/transaction";

function step(n: number, text: string) {
  console.log(`\n\x1b[1m[${n}] ${text}\x1b[0m`);
}

interface Envelope {
  sku: string;
  data: any;
  proof: { resultHash: string; generatedAt: string; latencyMs: number; sourceMode?: string };
  payment?: { tx?: string; escrow: string; network: string };
}

/** Recompute the proof hash — the buyer verifies the answer before acting. */
function verifyEnvelope(env: Envelope): string[] {
  const problems: string[] = [];
  const recomputed = `sha256:${createHash("sha256").update(JSON.stringify(env.data)).digest("hex")}`;
  if (recomputed !== env.proof?.resultHash) problems.push(`resultHash mismatch (${recomputed} != ${env.proof?.resultHash})`);
  const age = Date.now() - Date.parse(env.proof?.generatedAt ?? "");
  // Preprod settlement can legitimately take 1-2 blocks before the response lands.
  if (!Number.isFinite(age) || age > 300_000) problems.push(`stale answer (${Math.round(age / 1000)}s old)`);
  return problems;
}

async function paidGet(fetchP: typeof fetch, path: string, label: string): Promise<{ env: Envelope; tx?: string }> {
  const url = `${SERVER}${path}`;
  console.log(`  GET ${url}`);
  const started = Date.now();
  const res = await fetchP(url);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (res.status === 402) {
    throw new Error(`payment rejected for ${label} (402 returned after payment attempt)`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${label} failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const env = (await res.json()) as Envelope;
  const settle = new x402HTTPClient(new x402Client()).getPaymentSettleResponse(h => res.headers.get(h));
  const tx = env.payment?.tx ?? settle?.transaction;
  console.log(`  → 200 in ${secs}s${tx ? ` — paid, tx ${tx.slice(0, 16)}…` : ""}`);
  return { env, tx };
}

async function paidPost(fetchP: typeof fetch, path: string, body: unknown, label: string): Promise<{ env: Envelope; tx?: string }> {
  const url = `${SERVER}${path}`;
  console.log(`  POST ${url} ${JSON.stringify(body)}`);
  const started = Date.now();
  const res = await fetchP(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const env = (await res.json()) as Envelope;
  const settle = new x402HTTPClient(new x402Client()).getPaymentSettleResponse(h => res.headers.get(h));
  const tx = env.payment?.tx ?? settle?.transaction;
  console.log(`  → 200 in ${secs}s${tx ? ` — paid, tx ${tx.slice(0, 16)}…` : ""}`);
  return { env, tx };
}

/** Wait until the wallet has a spendable UTXO produced by txHash (the payment's change output). */
async function waitForSpendable(addr: string, txHash: string | undefined, timeoutMs = 180_000) {
  process.stdout.write("  waiting for payment tx to confirm");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${blockfrostBaseUrl}/addresses/${addr}/utxos`, { headers: { project_id: projectId! } });
      if (res.ok) {
        const utxos = (await res.json()) as { tx_hash: string }[];
        const ready = txHash ? utxos.some(u => u.tx_hash === txHash) : utxos.length > 0;
        if (ready) {
          console.log(" ✓");
          return;
        }
      }
    } catch { /* transient blockfrost error */ }
    process.stdout.write(".");
    await new Promise(r => setTimeout(r, 8000));
  }
  throw new Error("timed out waiting for spendable UTXOs");
}

async function main() {
  console.log("┌─────────────────────────────────────────────────────┐");
  console.log("│  ARGUS — autonomous agent buying on-chain intel      │");
  console.log("│  pay-per-query on Cardano, no account, no API key   │");
  console.log("└─────────────────────────────────────────────────────┘");

  const signer = toClientCardanoSigner({
    mnemonic: mnemonic!,
    network: NETWORK,
    provider: { blockfrost: { baseUrl: blockfrostBaseUrl, projectId: projectId! } },
  });
  const client = new x402Client().setSpendControls({
    allowedAssets: [
      { network: "cardano:*", asset: "lovelace" },
      { network: "cardano:*", asset: USDM_PREPROD_ASSET },
    ],
  });
  client.register("cardano:*", new ExactCardanoScheme(signer));
  const fetchP = wrapFetchWithPayment(fetch, client);
  console.log(`  agent wallet: ${signer.getAddress()}`);

  step(0, "Discovery — fetch the free catalogue");
  const cat = (await (await fetch(`${SERVER}/catalogue`)).json()) as {
    skus: { id: string; example: string }[];
    escrow: string;
  };
  const health = (await (await fetch(`${SERVER}/health`)).json()) as { source: string };
  console.log(`  ${cat.skus.length} SKUs · escrow=${cat.escrow} · source=${health.source}`);
  for (const s of cat.skus) console.log(`   - ${s.id.padEnd(22)} ${s.example}`);

  const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      console.warn(`  payment attempt failed (${error instanceof Error ? error.message : error}), retrying in 30s`);
      await new Promise(r => setTimeout(r, 30_000));
      return fn();
    }
  };

  step(1, "Purchase 1: whale flow (BTC — a chain with no incumbent agent index)");
  const { env: whale, tx: whaleTx } = await withRetry(() => paidGet(fetchP, "/data/whale-flow?chain=btc&blocks=3&minNative=0.1&limit=10", "whale-flow"));

  const problems = verifyEnvelope(whale);
  if (problems.length) {
    console.log(`  ✗ ANSWER REJECTED: ${problems.join("; ")}`);
    console.log("  With Masumi escrow this payment is never released — the contract refunds it automatically.");
    return;
  }
  console.log(`  ✓ proof verified (resultHash ${whale.proof.resultHash.slice(0, 24)}…)`);
  const flows = whale.data.flows as { txid: string; amountNative: number; to: string[] }[];
  const top = flows[0];
  const totalNative = whale.data.totalMovedNative as number;
  console.log(`  ${flows.length} whale transfers, ${totalNative.toLocaleString()} ${whale.data.symbol} moved in ${whale.data.windowBlocks} blocks`);
  if (top) console.log(`  largest: ${top.amountNative.toLocaleString()} ${whale.data.symbol} → ${top.to[0]?.slice(0, 18)}…`);

  // Rule-based signal: a dominant whale transfer (top >> threshold) means
  // informed size is moving => hedge; calm tape => hold.
  const dominant = top ? top.amountNative > whale.data.thresholdNative * 20 : false;
  const signal = dominant
    ? { action: "HEDGE", reason: `largest transfer ${top!.amountNative.toFixed(2)} ${whale.data.symbol} >> ${whale.data.thresholdNative} ${whale.data.symbol} threshold` }
    : { action: "HOLD", reason: "no dominant whale transfer in window" };

  // The next payment spends the change output of whaleTx — wait for it to land.
  await waitForSpendable(signer.getAddress(), whaleTx);

  step(2, `Purchase 2: raw RPC on Base — pick the execution venue (${signal.action})`);
  const { env: gas, tx: gasTx } = await withRetry(() => paidPost(fetchP, "/rpc/base", { method: "eth_gasPrice", params: [] }, "raw-rpc gasPrice"));
  const gwei = Number(BigInt((gas.data as any).result)) / 1e9;
  console.log(`  base gasPrice = ${gwei.toFixed(3)} gwei (${gas.data.latencyMs}ms upstream)`);
  const venue = gwei < 50 ? "base" : "ethereum-mainnet";

  // The decision tx spends the change output of the second payment.
  await waitForSpendable(signer.getAddress(), gasTx);

  step(3, `Act: ${signal.action} via ${venue} — record the decision on Cardano`);
  const decision = {
    agent: "argus-trading-agent/0.1",
    signal: signal.action,
    reason: signal.reason,
    venue,
    evidence: { whaleFlowHash: whale.proof.resultHash, paymentTx: whaleTx },
    decidedAt: new Date().toISOString(),
  };
  const decisionJson = JSON.stringify(decision);
  console.log(`  decision: ${decisionJson}`);

  if (process.env.RECORD_DECISION !== "0") {
    try {
      // Self-payment of ~1.5 tADA submitted to preprod — the tx is the
      // timestamped, on-chain record of this agent's decision.
      const { transaction } = await signer.buildAndSignPaymentTransaction({
        network: NETWORK,
        payTo: signer.getAddress(),
        asset: "lovelace",
        amount: "1500000",
        maxTimeoutSeconds: 300,
      });
      const res = await fetch(`${blockfrostBaseUrl}/tx/submit`, {
        method: "POST",
        headers: { "project_id": projectId!, "content-type": "application/cbor" },
        body: Buffer.from(transaction, "base64"),
      });
      if (!res.ok) throw new Error(`blockfrost submit HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      const txHash = (await res.json()) as string;
      console.log(`  ✓ decision recorded on-chain: ${EXPLORER}/${txHash}`);
    } catch (error) {
      console.warn(`  ⚠ decision record failed (demo continues): ${error instanceof Error ? error.message : error}`);
    }
  }

  step(4, "Receipts");
  if (whaleTx) console.log(`  whale-flow payment: ${EXPLORER}/${whaleTx}`);
  console.log("  done — agent paid, verified, decided, and settled on-chain.");
}

main().catch(error => {
  console.error(`\nagent failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
