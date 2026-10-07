import type { NownodesClient } from "../nwn/client.js";
import { resolveChain } from "../nwn/chains.js";

export interface TxStatusQuery {
  chain: string;
  txid: string;
}

interface EvmReceipt {
  status?: string;
  blockNumber?: string;
  gasUsed?: string;
  from?: string;
  to?: string;
}

interface BlockbookTx {
  txid?: string;
  blockHeight?: number;
  confirmations?: number;
  blockTime?: number;
  value?: string;
  fees?: string;
}

interface SolTx {
  slot?: number;
  blockTime?: number | null;
  meta?: { err?: unknown; fee?: number } | null;
}

const TXID_HEX = /^(?:0x)?[0-9a-fA-F]{64}$/;
const TXID_BASE58 = /^[1-9A-HJ-NP-Za-km-z]{40,90}$/;

/**
 * Settlement confirmation: "did my transaction land, and how deep is it?"
 * The single most universal need of any agent that transacts. EVM chains use
 * the receipt + tip for confirmations; blockbook and Solana report their own.
 */
export async function txStatus(nwn: NownodesClient, q: TxStatusQuery) {
  const chain = resolveChain(q.chain);
  if (!chain) throw new Error(`unknown chain '${q.chain}'`);
  const txid = q.txid.trim();

  if (chain.kind === "evm" && chain.rpc) {
    if (!TXID_HEX.test(txid)) throw new Error("txid must be a 64-char hex hash (0x prefix optional)");
    const with0x = txid.startsWith("0x") ? txid : `0x${txid}`;
    const [receipt, tip] = await Promise.all([
      nwn.rpc<EvmReceipt | null>(chain.id, "eth_getTransactionReceipt", [with0x]),
      nwn.tip(chain.id),
    ]);
    if (!receipt) {
      return { chain: chain.id, txid: with0x, found: false, tip, hint: "pending, dropped, or wrong chain" };
    }
    const block = receipt.blockNumber ? Number.parseInt(receipt.blockNumber, 16) : null;
    return {
      chain: chain.id,
      txid: with0x,
      found: true,
      status: receipt.status === "0x1" ? "confirmed" : "failed",
      block,
      confirmations: block === null ? 0 : tip - block + 1,
      gasUsed: receipt.gasUsed ? Number.parseInt(receipt.gasUsed, 16) : null,
      from: receipt.from ?? null,
      to: receipt.to ?? null,
      tip,
    };
  }

  if (chain.blockbook) {
    if (!TXID_HEX.test(txid)) throw new Error("txid must be a 64-char hex hash (0x prefix optional)");
    const bare = txid.replace(/^0x/i, "");
    const tx = await nwn.blockbook<BlockbookTx>(chain.id, `/api/v2/tx/${bare}`);
    const unit = 10 ** chain.decimals;
    return {
      chain: chain.id,
      txid: tx.txid ?? bare,
      found: true,
      status: (tx.confirmations ?? 0) > 0 ? "confirmed" : "mempool",
      block: tx.blockHeight ?? null,
      confirmations: tx.confirmations ?? 0,
      blockTime: tx.blockTime ?? null,
      valueNative: tx.value !== undefined ? Number(tx.value) / unit : null,
      feeNative: tx.fees !== undefined ? Number(tx.fees) / unit : null,
    };
  }

  if (chain.id === "sol" && chain.rpc) {
    if (!TXID_BASE58.test(txid)) throw new Error("sol txid must be a base58 signature");
    const tx = await nwn.rpc<SolTx | null>(chain.id, "getTransaction", [
      txid,
      { encoding: "json", maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx) return { chain: chain.id, txid, found: false, hint: "pending or expired" };
    return {
      chain: chain.id,
      txid,
      found: true,
      status: tx.meta?.err == null ? "confirmed" : "failed",
      slot: tx.slot ?? null,
      blockTime: tx.blockTime ?? null,
      feeLamports: tx.meta?.fee ?? null,
    };
  }

  throw new Error(`chain '${chain.id}' has no transaction lookup endpoint`);
}

export function parseTxStatusQuery(search: URLSearchParams): TxStatusQuery {
  return {
    chain: search.get("chain") ?? "eth",
    txid: search.get("txid") ?? "",
  };
}
