import type { NownodesClient } from "../nwn/client.js";
import { resolveChain } from "../nwn/chains.js";
import { clampInt } from "./whaleFlow.js";

export interface FeeMarketQuery {
  chains: string[];
  /** Confirmation target in blocks for UTXO estimatefee lookups. */
  confTarget: number;
}

interface EstimateFee {
  result?: string;
}

/**
 * Cross-chain fee market: what does a transaction cost right now on each
 * chain? The query a transacting agent runs before picking an execution
 * venue. EVM chains report gasPrice in gwei; UTXO chains report the blockbook
 * estimatefee (native per kB); chains with no fee oracle get an honest error
 * entry instead of poisoning the answer.
 */
export async function feeMarket(nwn: NownodesClient, q: FeeMarketQuery) {
  const quotes = [];
  for (const chainId of q.chains) {
    const chain = resolveChain(chainId);
    try {
      if (!chain) throw new Error("unknown chain");
      if (chain.kind === "evm" && chain.rpc) {
        const hex = await nwn.rpc<string>(chain.id, "eth_gasPrice");
        const wei = BigInt(hex);
        quotes.push({
          chain: chain.id,
          symbol: chain.symbol,
          oracle: "eth_gasPrice",
          gasPriceWei: wei.toString(),
          gasPriceGwei: Number(wei) / 1e9,
          unit: "gwei/gas",
        });
      } else if (chain.blockbook) {
        const res = await nwn.blockbook<EstimateFee>(chain.id, `/api/v2/estimatefee/${q.confTarget}`);
        quotes.push({
          chain: chain.id,
          symbol: chain.symbol,
          oracle: "estimatefee",
          feeNativePerKb: res.result !== undefined ? Number(res.result) : null,
          confTargetBlocks: q.confTarget,
          unit: `${chain.symbol}/kB`,
        });
      } else {
        quotes.push({ chain: chain.id, symbol: chain.symbol, error: "no fee oracle for this chain" });
      }
    } catch (error) {
      quotes.push({
        chain: chainId,
        error: error instanceof Error ? error.message : "fee lookup failed",
      });
    }
  }

  const evmRanked = quotes
    .filter(x => typeof (x as { gasPriceGwei?: number }).gasPriceGwei === "number")
    .sort((a, b) => (a as { gasPriceGwei: number }).gasPriceGwei - (b as { gasPriceGwei: number }).gasPriceGwei);

  return {
    sampledAt: new Date().toISOString(),
    confTargetBlocks: q.confTarget,
    quotes,
    cheapestEvm: evmRanked[0]?.chain ?? null,
    note: "EVM quotes are gwei/gas and comparable to each other; UTXO quotes are native per kB and comparable only within UTXO chains.",
  };
}

export function parseFeeMarketQuery(search: URLSearchParams): FeeMarketQuery {
  const chains = (search.get("chains") ?? "eth,base,arb")
    .split(",")
    .map(c => c.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
  return {
    chains: chains.length ? chains : ["eth", "base", "arb"],
    confTarget: clampInt(search.get("confTarget"), 1, 25, 1),
  };
}
