import type { NownodesClient } from "../nwn/client.js";
import { resolveChain } from "../nwn/chains.js";

export interface ChainStatusQuery {
  chains: string[];
}

interface EvmBlock {
  number?: string;
  timestamp?: string;
}

interface BlockbookBlock {
  height?: number;
  time?: number;
}

/** Rough target block interval per chain, used to flag a stalled tip. */
const EXPECTED_BLOCK_SEC: Record<string, number> = {
  eth: 12, bsc: 3, base: 2, arb: 0.3, op: 2, matic: 2,
  trx: 3, btc: 600, ltc: 150, doge: 60, ada: 20, sol: 0.4,
};

/**
 * Chain liveness: is this network producing blocks right now? The check a
 * monitoring or transacting agent runs before trusting any other answer from
 * a chain. Reports tip, last block timestamp, age vs expected interval, and a
 * lagging flag. Per-chain errors never poison the whole answer.
 */
export async function chainStatus(nwn: NownodesClient, q: ChainStatusQuery) {
  const now = Math.floor(Date.now() / 1000);
  const chains = [];
  for (const chainId of q.chains) {
    const chain = resolveChain(chainId);
    const expected = EXPECTED_BLOCK_SEC[chainId] ?? null;
    try {
      if (!chain) throw new Error("unknown chain");
      let tip: number | null = null;
      let blockTime: number | null = null;

      if (chain.kind === "evm" && chain.rpc) {
        const block = await nwn.rpc<EvmBlock>(chain.id, "eth_getBlockByNumber", ["latest", false]);
        tip = block?.number ? Number.parseInt(block.number, 16) : await nwn.tip(chain.id);
        blockTime = block?.timestamp ? Number.parseInt(block.timestamp, 16) : null;
      } else if (chain.blockbook) {
        tip = await nwn.tip(chain.id);
        const block = await nwn.blockbook<BlockbookBlock>(chain.id, `/api/v2/block/${tip}`);
        blockTime = block.time ?? null;
      } else if (chain.id === "sol" && chain.rpc) {
        tip = await nwn.rpc<number>(chain.id, "getBlockHeight");
      } else {
        throw new Error("no status endpoint for this chain");
      }

      const blockAgeSec = blockTime !== null ? Math.max(0, now - blockTime) : null;
      const lagging = blockAgeSec !== null && expected !== null ? blockAgeSec > expected * 5 : null;
      chains.push({
        chain: chain.id,
        symbol: chain.symbol,
        tip,
        blockTime,
        blockAgeSec,
        expectedBlockSec: expected,
        status: lagging === null ? "unknown" : lagging ? "lagging" : "live",
      });
    } catch (error) {
      chains.push({
        chain: chainId,
        error: error instanceof Error ? error.message : "status check failed",
      });
    }
  }
  return { checkedAt: new Date(now * 1000).toISOString(), chains };
}

export function parseChainStatusQuery(search: URLSearchParams): ChainStatusQuery {
  const chains = (search.get("chains") ?? "eth,base,btc")
    .split(",")
    .map(c => c.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
  return { chains: chains.length ? chains : ["eth", "base", "btc"] };
}
