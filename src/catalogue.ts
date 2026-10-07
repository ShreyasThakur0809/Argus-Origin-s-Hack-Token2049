import { USDM_PREPROD_ASSET } from "@x402/cardano";

export interface Sku {
  id: string;
  method: "GET" | "POST";
  /** Express path used both for the route and the x402 route key. */
  path: string;
  title: string;
  description: string;
  /** Price in lovelace when PRICE_ASSET=lovelace (default). */
  lovelace: string;
  /** Price in tUSDM base units (6dp) when PRICE_ASSET=usdm. */
  usdm: string;
  example: string;
}

/**
 * The pay-per-query catalogue. Every SKU is a single HTTP request: the buyer
 * is a machine, so there is no signup, no key, no subscription.
 */
export const SKUS: Sku[] = [
  {
    id: "raw-rpc",
    method: "POST",
    path: "/rpc/eth", // per-chain routes are registered for every known chain
    title: "Raw RPC call",
    description: "A single read-only JSON-RPC call on any of 120+ NOWNodes networks, without an API key.",
    lovelace: "1000000", // 1.0 tADA
    usdm: "10000", // $0.01
    example: `POST /rpc/eth {"method":"eth_blockNumber","params":[]}`,
  },
  {
    id: "tx-status",
    method: "GET",
    path: "/data/tx-status",
    title: "Transaction status",
    description:
      "Did my transaction land? Receipt status, block, and confirmation depth on EVM, UTXO, and Solana. The settlement check every transacting agent needs.",
    lovelace: "1000000",
    usdm: "10000",
    example: "GET /data/tx-status?chain=eth&txid=0x5c50...2060",
  },
  {
    id: "chain-status",
    method: "GET",
    path: "/data/chain-status",
    title: "Chain liveness",
    description:
      "Tip height, last block timestamp, and block age vs expected interval across chains. The liveness check a monitoring agent runs before trusting anything else.",
    lovelace: "1000000",
    usdm: "10000",
    example: "GET /data/chain-status?chains=eth,base,btc",
  },
  {
    id: "fee-market",
    method: "GET",
    path: "/data/fee-market",
    title: "Cross-chain fee market",
    description:
      "What does a transaction cost right now on each chain? gasPrice in gwei on EVM, estimatefee per kB on UTXO. How an agent picks the cheapest execution venue.",
    lovelace: "1500000",
    usdm: "20000",
    example: "GET /data/fee-market?chains=eth,base,arb,btc",
  },
  {
    id: "address-snapshot",
    method: "GET",
    path: "/data/address-snapshot",
    title: "Address snapshot",
    description:
      "What is this address right now? Balance, activity, and contract detection on EVM; lifetime totals on UTXO. Counterparty and treasury checks for agents.",
    lovelace: "1500000",
    usdm: "20000",
    example: "GET /data/address-snapshot?chain=eth&address=0xd8dA...6045",
  },
  {
    id: "whale-flow",
    method: "GET",
    path: "/data/whale-flow",
    title: "Whale flow",
    description: "Largest native transfers over the most recent N blocks on any blockbook-backed chain.",
    lovelace: "1500000",
    usdm: "20000", // $0.02
    example: "GET /data/whale-flow?chain=btc&blocks=3&minNative=1",
  },
  {
    id: "holder-concentration",
    method: "GET",
    path: "/data/holder-concentration",
    title: "Holder concentration",
    description:
      "Top-holder share of an ERC20 token: recent-activity sampling via eth_getLogs, then exact balanceOf verification.",
    lovelace: "2500000",
    usdm: "50000", // $0.05
    example: "GET /data/holder-concentration?chain=eth&token=0xA0b8...eB48&blocks=10000",
  },
  {
    id: "bridge-activity",
    method: "GET",
    path: "/data/bridge-activity",
    title: "Cross-chain bridge activity",
    description:
      "Deposit/withdrawal event counts and directions across known bridge contracts on multiple chains in one call.",
    lovelace: "2500000",
    usdm: "50000",
    example: "GET /data/bridge-activity?chains=eth,base,arb&blocks=5000",
  },
  {
    id: "market-snapshot",
    method: "GET",
    path: "/data/market-snapshot",
    title: "Market snapshot",
    description:
      "USD price, 24h change, market cap and volume for any CoinGecko asset — market context for agents acting on on-chain data. Any asset id works; not limited to node-backed chains.",
    lovelace: "1000000",
    usdm: "10000",
    example: "GET /data/market-snapshot?assets=btc,eth,sol",
  },
  {
    id: "trending",
    method: "GET",
    path: "/data/trending",
    title: "Trending assets",
    description:
      "The assets the market is paying attention to right now (CoinGecko trending): rank, price, 24h move. Discovery and surveillance input for agents.",
    lovelace: "1000000",
    usdm: "10000",
    example: "GET /data/trending",
  },
];

export type PriceAsset = "lovelace" | "usdm";

export function priceFor(sku: Sku): { amount: string; asset: string } {
  const asset = (process.env.PRICE_ASSET ?? "lovelace").toLowerCase();
  if (asset === "usdm") return { amount: sku.usdm, asset: process.env.USDM_ASSET ?? USDM_PREPROD_ASSET };
  return { amount: sku.lovelace, asset: "lovelace" };
}

export function escrowMode(): "masumi" | "default" {
  return (process.env.ESCROW ?? "masumi").toLowerCase() === "masumi" ? "masumi" : "default";
}
