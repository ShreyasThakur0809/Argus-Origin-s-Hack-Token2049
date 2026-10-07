/**
 * Contracts mirrored from src/server.ts + src/catalogue.ts + src/activity.ts.
 * Keep in sync: the proxy is transport-agnostic, these types are the contract.
 */

export interface Health {
  ok: boolean;
  network: string;
  escrow: "masumi" | "default";
  source: string;
  sources?: { nownodes: boolean; coingecko: boolean };
}

export interface Sku {
  id: string;
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
  lovelace: string;
  usdm: string;
  example: string;
  /** Injected by /catalogue: { amount, asset } where asset is "lovelace" or the USDM policy id. */
  price: { amount: string; asset: string };
  assetLabel: "tADA" | "tUSDM";
}

export interface ChainInfo {
  id: string;
  kind: "evm" | "utxo" | "other";
  blockbook: boolean;
  rpc: boolean;
}

export interface Catalogue {
  name: string;
  network: string;
  escrow: "masumi" | "default";
  payTo: string;
  skus: Sku[];
  chains: ChainInfo[];
}

/** The answer envelope every paid route returns. */
export interface Envelope<T = unknown> {
  sku: string;
  data: T;
  proof: {
    resultHash: string;
    generatedAt: string;
    latencyMs: number;
    source: string;
    sourceMode: "live" | "fixture";
  };
  payment?: { tx?: string; escrow: string; network: string };
}

/** Decoded PAYMENT-REQUIRED header (x402 v2). Fields rendered defensively. */
export interface PaymentRequirements {
  scheme: string;
  network: string;
  amount?: string;
  maxAmountRequired?: string;
  asset?: string;
  payTo?: string;
  resource?: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface PaymentRequired {
  x402Version?: number;
  error?: string;
  accepts?: PaymentRequirements[];
  [k: string]: unknown;
}

export interface ActivityEntry {
  ts: string;
  sku: string;
  method: string;
  path: string;
  mode: "paid" | "dev" | "open";
  ok: boolean;
  status: number;
  latencyMs: number;
  tx?: string;
  resultHash?: string;
  sourceMode?: string;
  error?: string;
}

export interface ActivityFeed {
  entries: ActivityEntry[];
  network: string;
  escrow: string;
}

/* ---- Per-SKU data shapes (from src/products/*) ---- */

export interface WhaleFlowData {
  chain: string;
  symbol: string;
  tip: number;
  windowBlocks: number;
  thresholdNative: number;
  transferCount: number;
  totalMoved: string;
  totalMovedNative: number;
  flows: {
    txid: string;
    block?: number;
    from: string | null;
    to: string[];
    amount: string;
    amountNative: number;
  }[];
}

export interface HolderConcentrationData {
  chain: string;
  token: string;
  tip: number;
  windowBlocks: number;
  transferEvents: number;
  sampledHolders: number;
  method: string;
  tokenDecimals: number;
  totalSupply: string;
  concentration: { top5Share: number | null; top10Share: number | null; top25Share: number | null };
  topHolders: {
    address: string;
    balance: string;
    balanceUnits: number;
    supplyShare: number | null;
  }[];
  caveat: string;
}

export interface BridgeActivityData {
  windowBlocks: number;
  chains: {
    chain: string;
    tip?: number;
    windowBlocks?: number;
    error?: string;
    bridges?: {
      bridge: string;
      address: string;
      totalEvents: number;
      outbound: number;
      inbound: number;
      events: { label: string; direction: string; count: number; txids: string[] }[];
    }[];
  }[];
  totals: { outbound: number; inbound: number };
}

export interface RawRpcData {
  chain: string;
  method: string;
  latencyMs: number;
  result: unknown;
}

export interface TxStatusData {
  chain: string;
  txid: string;
  found: boolean;
  status?: string;
  block?: number | null;
  confirmations?: number;
  gasUsed?: number | null;
  from?: string | null;
  to?: string | null;
  tip?: number;
  hint?: string;
  blockTime?: number | null;
  valueNative?: number | null;
  feeNative?: number | null;
  slot?: number | null;
  feeLamports?: number | null;
}

export interface FeeMarketData {
  sampledAt: string;
  confTargetBlocks: number;
  quotes: {
    chain: string;
    symbol?: string;
    oracle?: string;
    gasPriceWei?: string;
    gasPriceGwei?: number;
    feeNativePerKb?: number | null;
    confTargetBlocks?: number;
    unit?: string;
    error?: string;
  }[];
  cheapestEvm: string | null;
  note: string;
}

export interface AddressSnapshotData {
  chain: string;
  symbol: string;
  address: string;
  kind: string;
  balanceWei?: string;
  balanceNative?: number | null;
  nonce?: number;
  unconfirmedNative?: number | null;
  totalReceivedNative?: number | null;
  totalSentNative?: number | null;
  txCount?: number | null;
  tokens?: { name: string | null; symbol: string | null; contract: string | null; balance: string | null }[];
  owner?: string | null;
  balanceLamports?: number | null;
}

export interface ChainStatusData {
  checkedAt: string;
  chains: {
    chain: string;
    symbol?: string;
    tip?: number | null;
    blockTime?: number | null;
    blockAgeSec?: number | null;
    expectedBlockSec?: number | null;
    status?: "live" | "lagging" | "unknown";
    error?: string;
  }[];
}

export interface MarketSnapshotData {
  checkedAt: string;
  currency: string;
  assets: {
    asset: string;
    symbol?: string;
    name?: string;
    rank?: number | null;
    priceUsd?: number | null;
    change24hPct?: number | null;
    marketCapUsd?: number | null;
    volume24hUsd?: number | null;
    error?: string;
  }[];
}

export interface TrendingData {
  checkedAt: string;
  currency: string;
  coins: {
    rank: number;
    id: string | null;
    name: string | null;
    symbol: string | null;
    marketCapRank: number | null;
    priceUsd: number | null;
    change24hPct: number | null;
  }[];
}
