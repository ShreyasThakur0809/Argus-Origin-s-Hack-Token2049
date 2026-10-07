/**
 * Decision layer: when a task brief asks for a recommendation, wrap the
 * verified SKU data in an explicit signal. The rule is transparent and
 * stated in the result — the numbers underneath carry the proof hash.
 *
 * whale-flow rule: whale-size transfers (each already ≥ threshold) inside
 * the window are treated as elevated-movement evidence.
 */
export const DECISION_INTENT =
  /\b(hedge|recommend|should i|signal|decision|buy or sell|act on)\b/i;

export interface Decision {
  signal: "HEDGE" | "NO_HEDGE" | "REVIEW";
  rationale: string;
  rule: string;
}

/** Optional CoinGecko context folded into the rationale when present. */
export interface DecisionMarket {
  symbol: string;
  priceUsd: number | null;
  change24hPct: number | null;
}

function marketSuffix(market?: DecisionMarket): string {
  if (!market || market.priceUsd === null) return "";
  const pct = market.change24hPct;
  const move = pct === null ? "" : ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% 24h)`;
  return `; market: ${market.symbol} $${market.priceUsd.toLocaleString("en-US")}${move} (coingecko)`;
}

export function decide(skuId: string, data: unknown, market?: DecisionMarket): Decision {
  if (skuId === "whale-flow") {
    const d = data as { transferCount?: number; totalMovedNative?: number; thresholdNative?: number; windowBlocks?: number; symbol?: string };
    const count = d.transferCount ?? 0;
    const rule = `whale-flow: any transfers >= ${d.thresholdNative ?? "?"} ${d.symbol ?? ""} inside the last ${d.windowBlocks ?? "?"} blocks count as elevated whale movement`;
    if (count > 0) {
      return {
        signal: "HEDGE",
        rationale: `${count} whale-size transfer(s) moved ~${d.totalMovedNative ?? "?"} ${d.symbol ?? ""} in the last ${d.windowBlocks ?? "?"} blocks${marketSuffix(market)}`,
        rule,
      };
    }
    return {
      signal: "NO_HEDGE",
      rationale: `no whale-size movement detected in the last ${d.windowBlocks ?? "?"} blocks${marketSuffix(market)}`,
      rule,
    };
  }
  return {
    signal: "REVIEW",
    rationale: `verified data attached; no decision rule implemented for this SKU${marketSuffix(market)}`,
    rule: "decision rules currently implemented for whale-flow only",
  };
}
