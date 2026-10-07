import type { NownodesClient } from "../nwn/client.js";
import { resolveChain } from "../nwn/chains.js";

export interface WhaleFlowQuery {
  chain: string;
  blocks: number;
  minNative: number;
  limit: number;
}

interface BlockbookTx {
  txid: string;
  vin?: { addresses?: string[]; value?: string; isAddress?: boolean }[];
  vout?: { addresses?: string[]; value?: string; isAddress?: boolean }[];
  value?: string;
  fees?: string;
  blockHeight?: number;
}

interface BlockbookBlock {
  height?: number;
  hash?: string;
  txCount?: number;
  txs?: BlockbookTx[];
}

function sumVout(tx: BlockbookTx): { total: bigint; recipients: string[] } {
  let total = 0n;
  const recipients: string[] = [];
  for (const vout of tx.vout ?? []) {
    if (vout.value) total += BigInt(vout.value);
    if (vout.addresses?.[0]) recipients.push(vout.addresses[0]);
  }
  return { total, recipients };
}

/**
 * Largest native transfers across the most recent `blocks` blocks of `chain`,
 * sourced live from NOWNodes blockbook. Works on every blockbook-backed
 * chain — including UTXO chains with no agent-facing indexers.
 */
export async function whaleFlow(nwn: NownodesClient, q: WhaleFlowQuery) {
  const chain = resolveChain(q.chain);
  if (!chain?.blockbook) throw new Error(`chain '${q.chain}' has no blockbook endpoint`);

  const tip = await nwn.tip(q.chain);
  const heights = Array.from({ length: q.blocks }, (_, i) => tip - i);
  const blocks = await Promise.all(
    heights.map(h => nwn.blockbook<BlockbookBlock>(q.chain, `/api/v2/block/${h}`)),
  );

  const minSmallest = toSmallestUnit(q.minNative, chain.decimals);

  const flows = [];
  for (const block of blocks) {
    for (const tx of block.txs ?? []) {
      const value = tx.value ? BigInt(tx.value) : sumVout(tx).total;
      if (value < minSmallest) continue;
      flows.push({
        txid: tx.txid,
        block: tx.blockHeight ?? block.height,
        from: tx.vin?.[0]?.addresses?.[0] ?? null,
        to: sumVout(tx).recipients.slice(0, 3),
        amount: value.toString(),
        amountNative: Number(value) / 10 ** chain.decimals,
      });
    }
  }
  flows.sort((a, b) => (BigInt(b.amount) > BigInt(a.amount) ? 1 : -1));
  const top = flows.slice(0, q.limit);
  const totalMoved = flows.reduce((acc, f) => acc + BigInt(f.amount), 0n);

  return {
    chain: chain.id,
    symbol: chain.symbol,
    tip,
    windowBlocks: q.blocks,
    thresholdNative: q.minNative,
    transferCount: flows.length,
    totalMoved: totalMoved.toString(),
    totalMovedNative: Number(totalMoved) / 10 ** chain.decimals,
    flows: top,
  };
}

export function parseWhaleFlowQuery(search: URLSearchParams): WhaleFlowQuery {
  const chain = search.get("chain") ?? "eth";
  const blocks = clampInt(search.get("blocks"), 1, 25, 3);
  const minNative = Math.max(0, Number(search.get("minNative") ?? "0"));
  const limit = clampInt(search.get("limit"), 1, 100, 25);
  return { chain, blocks, minNative, limit };
}

/** Convert a decimal-ish native amount to the chain's smallest unit. */
export function toSmallestUnit(native: number, decimals: number): bigint {
  const [whole, frac = ""] = native.toFixed(Math.min(decimals, 9)).split(".");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0").slice(0, decimals) || "0");
}

export function clampInt(raw: string | null, min: number, max: number, dflt: number): number {
  const n = raw === null ? dflt : Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
