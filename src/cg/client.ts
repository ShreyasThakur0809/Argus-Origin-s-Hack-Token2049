/**
 * Thin CoinGecko demo-tier client: https://api.coingecko.com/api/v3 with the
 * `x-cg-demo-api-key` header. With no API key the client runs in fixture mode
 * (deterministic canned data) so the offline demo loop still works.
 *
 * CoinGecko is the market-data plane: prices, market caps, 24h moves,
 * trending — for thousands of assets, not just node-backed chains. NOWNodes
 * remains the on-chain plane (blocks, txs, addresses).
 */
export class CoingeckoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Common symbols -> CoinGecko ids. Anything unmapped is passed through
 * verbatim, so agents may supply raw CoinGecko ids (the "no chain list"
 * property: every asset CoinGecko tracks is addressable). */
export const ASSET_IDS: Record<string, string> = {
  btc: "bitcoin", eth: "ethereum", sol: "solana", ada: "cardano",
  xrp: "ripple", doge: "dogecoin", ltc: "litecoin", trx: "tron",
  bnb: "binancecoin", pol: "polygon-ecosystem-token", matic: "polygon-ecosystem-token",
  link: "chainlink", avax: "avalanche-2", dot: "polkadot", near: "near",
  sui: "sui", uni: "uniswap", arb: "arbitrum", op: "optimism",
  atom: "cosmos", apt: "aptos", fil: "filecoin", inj: "injective-protocol",
  hbar: "hedera-hashgraph", sei: "sei-network", tao: "bittensor",
  render: "render-token", usdt: "tether", usdc: "usd-coin",
  shib: "shiba-inu", pepe: "pepe", wif: "dogwifcoin", bonk: "bonk",
};

export function assetId(token: string): string {
  const t = token.toLowerCase().trim();
  return ASSET_IDS[t] ?? t;
}

export interface CgMarketRow {
  id?: string;
  symbol?: string;
  name?: string;
  market_cap_rank?: number;
  current_price?: number;
  price_change_percentage_24h?: number;
  market_cap?: number;
  total_volume?: number;
}

export interface CgTrending {
  coins?: { item?: { id?: string; name?: string; symbol?: string; market_cap_rank?: number; data?: { price?: number; price_change_percentage_24h?: { usd?: number } } } }[];
}

export class CoinGeckoClient {
  readonly live: boolean;

  constructor(private apiKey = process.env.COINGECKO_API_KEY?.trim() ?? "") {
    this.live = apiKey.length > 0;
    if (!this.live) {
      console.warn("[coingecko] COINGECKO_API_KEY not set — fixture mode (canned data)");
    }
  }

  /** Demo tier is ~30 req/min — retry 429/5xx with short backoff. */
  private async get<T>(path: string): Promise<T> {
    if (!this.live) return fixture<T>(path);
    let delay = 800;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(`https://api.coingecko.com/api/v3${path}`, {
        headers: { "x-cg-demo-api-key": this.apiKey },
        signal: AbortSignal.timeout(15_000),
      }).catch((e: unknown) => { throw new CoingeckoError(`coingecko ${path} -> ${e instanceof Error ? e.message : "fetch failed"}`); });
      if (res.ok) return (await res.json()) as T;
      if ((res.status !== 429 && res.status < 500) || attempt === 3) {
        throw new CoingeckoError(`coingecko ${path} -> HTTP ${res.status}`, res.status);
      }
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
    throw new CoingeckoError(`unreachable: ${path}`);
  }

  /** Market rows for CoinGecko asset ids, USD quoted. */
  async markets(ids: string[]): Promise<CgMarketRow[]> {
    if (!ids.length) return [];
    return this.get<CgMarketRow[]>(`/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(","))}&price_change_percentage=24h`);
  }

  async trending(): Promise<CgTrending> {
    return this.get<CgTrending>("/search/trending");
  }
}

/** Compact market context for one asset — used to enrich decision results. */
export interface MarketCtx {
  asset: string;
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24hPct: number | null;
  marketCapUsd: number | null;
  source: "coingecko";
}

export async function marketContext(cg: CoinGeckoClient, token: string): Promise<MarketCtx | undefined> {
  const id = assetId(token);
  const rows = await cg.markets([id]);
  const r = rows.find(x => x.id === id);
  if (!r) return undefined;
  return {
    asset: id,
    symbol: (r.symbol ?? token).toUpperCase(),
    name: r.name ?? id,
    priceUsd: r.current_price ?? null,
    change24hPct: r.price_change_percentage_24h ?? null,
    marketCapUsd: r.market_cap ?? null,
    source: "coingecko",
  };
}

/* ------------------------------------------------------------------ */
/* Fixture mode                                                        */
/* ------------------------------------------------------------------ */

function fixture<T>(path: string): T {
  if (path.startsWith("/coins/markets")) {
    const ids = new URL(`http://x${path}`).searchParams.get("ids")?.split(",") ?? [];
    const canned: Record<string, CgMarketRow> = {
      bitcoin: { id: "bitcoin", symbol: "btc", name: "Bitcoin", market_cap_rank: 1, current_price: 84000, price_change_percentage_24h: -2.4, market_cap: 1_680_000_000_000, total_volume: 34_000_000_000 },
      ethereum: { id: "ethereum", symbol: "eth", name: "Ethereum", market_cap_rank: 2, current_price: 2600, price_change_percentage_24h: -3.9, market_cap: 318_000_000_000, total_volume: 16_000_000_000 },
      solana: { id: "solana", symbol: "sol", name: "Solana", market_cap_rank: 6, current_price: 190, price_change_percentage_24h: 1.2, market_cap: 90_000_000_000, total_volume: 4_000_000_000 },
      cardano: { id: "cardano", symbol: "ada", name: "Cardano", market_cap_rank: 9, current_price: 0.62, price_change_percentage_24h: 0.8, market_cap: 22_000_000_000, total_volume: 600_000_000 },
    };
    return ids.filter(id => canned[id]).map(id => canned[id]) as T;
  }
  if (path === "/search/trending") {
    return {
      coins: [
        { item: { id: "bitcoin", name: "Bitcoin", symbol: "BTC", market_cap_rank: 1, data: { price: 84000, price_change_percentage_24h: { usd: -2.4 } } } },
        { item: { id: "solana", name: "Solana", symbol: "SOL", market_cap_rank: 6, data: { price: 190, price_change_percentage_24h: { usd: 1.2 } } } },
      ],
    } as T;
  }
  throw new CoingeckoError(`no fixture for coingecko ${path}`);
}
