import type { NownodesClient } from "../nwn/client.js";
import { resolveChain } from "../nwn/chains.js";

/**
 * Cheapest SKU in the catalogue: a single JSON-RPC call on any NOWNodes
 * network, no API key, no account. Read-only method whitelist — the service
 * must never become a relay for state-changing calls on a paid rail.
 */
export const ALLOWED_METHODS = new Set([
  "eth_blockNumber", "eth_chainId", "eth_call", "eth_getLogs", "eth_getBalance",
  "eth_getCode", "eth_getTransactionByHash", "eth_getBlockByNumber",
  "eth_getBlockByHash", "eth_getTransactionReceipt", "eth_estimateGas",
  "eth_gasPrice", "eth_getStorageAt", "eth_getTransactionCount", "eth_syncing",
  "net_version", "net_listening", "web3_clientVersion",
  // Solana reads (sol.nownodes.io)
  "getHealth", "getSlot", "getBlockHeight", "getBalance", "getAccountInfo",
  "getLatestBlockhash", "getTransaction",
]);

export interface RawRpcQuery {
  chain: string;
  method: string;
  params: unknown[];
}

export async function rawRpc(nwn: NownodesClient, q: RawRpcQuery) {
  const chain = resolveChain(q.chain);
  if (!chain?.rpc) throw new Error(`chain '${q.chain}' has no JSON-RPC endpoint`);
  if (!ALLOWED_METHODS.has(q.method)) {
    throw new Error(`method '${q.method}' not allowed — read-only methods only`);
  }
  const started = Date.now();
  const result = await nwn.rpc(q.chain, q.method, q.params);
  return {
    chain: chain.id,
    method: q.method,
    latencyMs: Date.now() - started,
    result,
  };
}
