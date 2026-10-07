import type { CoinGeckoClient } from "../cg/client.js";

/**
 * Trending assets: what the market is searching and buying attention on right
 * now. Discovery input for surveillance and trading agents.
 */
export async function trending(cg: CoinGeckoClient) {
  const raw = await cg.trending();
  const coins = (raw.coins ?? []).slice(0, 10).map((c, i) => {
    const item = c.item ?? {};
    return {
      rank: i + 1,
      id: item.id ?? null,
      name: item.name ?? null,
      symbol: (item.symbol ?? "").toUpperCase() || null,
      marketCapRank: item.market_cap_rank ?? null,
      priceUsd: item.data?.price ?? null,
      change24hPct: item.data?.price_change_percentage_24h?.usd ?? null,
    };
  });
  return { checkedAt: new Date().toISOString(), currency: "usd", coins };
}
