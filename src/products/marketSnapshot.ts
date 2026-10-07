import { assetId, type CoinGeckoClient } from "../cg/client.js";

export interface MarketSnapshotQuery {
  /** Symbols or raw CoinGecko ids. */
  assets: string[];
}

/**
 * Market snapshot: USD price, 24h change, market cap and volume per asset.
 * Any asset CoinGecko tracks is addressable — this is the market context an
 * agent needs alongside on-chain data before acting. Per-asset errors never
 * poison the whole answer.
 */
export async function marketSnapshot(cg: CoinGeckoClient, q: MarketSnapshotQuery) {
  const ids = [...new Set(q.assets.map(assetId))];
  const rows = await cg.markets(ids);
  const byId = new Map(rows.map(r => [r.id ?? "", r]));
  const assets = ids.map(id => {
    const r = byId.get(id);
    if (!r) return { asset: id, error: "unknown asset id" };
    return {
      asset: id,
      symbol: (r.symbol ?? id).toUpperCase(),
      name: r.name ?? id,
      rank: r.market_cap_rank ?? null,
      priceUsd: r.current_price ?? null,
      change24hPct: r.price_change_percentage_24h ?? null,
      marketCapUsd: r.market_cap ?? null,
      volume24hUsd: r.total_volume ?? null,
    };
  });
  return { checkedAt: new Date().toISOString(), currency: "usd", assets };
}

export function parseMarketQuery(search: URLSearchParams): MarketSnapshotQuery {
  const assets = (search.get("assets") ?? "btc,eth,sol")
    .split(",")
    .map(a => a.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 15);
  return { assets: assets.length ? assets : ["btc", "eth", "sol"] };
}
