/**
 * NOWNodes chain registry. Hostnames verified against live DNS/HTTP probes
 * (401/422 = host exists, needs the API key). Override any entry with env:
 * NOWNODES_BLOCKBOOK_URL_ETH / NOWNODES_RPC_URL_ETH.
 */
export type ChainKind = "evm" | "utxo" | "other";

export interface ChainInfo {
  id: string;
  label: string;
  kind: ChainKind;
  blockbook?: string;
  rpc?: string;
  /** Smallest-unit to native divisor for display. */
  decimals: number;
  symbol: string;
}

const REGISTRY: Record<string, ChainInfo> = {
  eth: { id: "eth", label: "Ethereum", kind: "evm", blockbook: "https://eth-blockbook.nownodes.io", rpc: "https://eth.nownodes.io", decimals: 18, symbol: "ETH" },
  bsc: { id: "bsc", label: "BNB Smart Chain", kind: "evm", blockbook: "https://bsc-blockbook.nownodes.io", rpc: "https://bsc.nownodes.io", decimals: 18, symbol: "BNB" },
  base: { id: "base", label: "Base", kind: "evm", blockbook: "https://base-blockbook.nownodes.io", rpc: "https://base.nownodes.io", decimals: 18, symbol: "ETH" },
  arb: { id: "arb", label: "Arbitrum", kind: "evm", blockbook: "https://arb-blockbook.nownodes.io", rpc: "https://arbitrum.nownodes.io", decimals: 18, symbol: "ETH" },
  op: { id: "op", label: "Optimism", kind: "evm", rpc: "https://optimism.nownodes.io", decimals: 18, symbol: "ETH" },
  matic: { id: "matic", label: "Polygon", kind: "evm", blockbook: "https://maticbook.nownodes.io", rpc: "https://matic.nownodes.io", decimals: 18, symbol: "POL" },
  trx: { id: "trx", label: "Tron", kind: "other", blockbook: "https://trx-blockbook.nownodes.io", decimals: 6, symbol: "TRX" },
  btc: { id: "btc", label: "Bitcoin", kind: "utxo", blockbook: "https://btcbook.nownodes.io", decimals: 8, symbol: "BTC" },
  ltc: { id: "ltc", label: "Litecoin", kind: "utxo", blockbook: "https://ltcbook.nownodes.io", decimals: 8, symbol: "LTC" },
  doge: { id: "doge", label: "Dogecoin", kind: "utxo", blockbook: "https://dogebook.nownodes.io", decimals: 8, symbol: "DOGE" },
  ada: { id: "ada", label: "Cardano", kind: "other", rpc: "https://ada.nownodes.io", decimals: 6, symbol: "ADA" },
  sol: { id: "sol", label: "Solana", kind: "other", rpc: "https://sol.nownodes.io", decimals: 9, symbol: "SOL" },
};

export function resolveChain(name: string): ChainInfo | undefined {
  const id = name.toLowerCase().trim();
  const base = REGISTRY[id];
  if (!base) return undefined;
  const bb = process.env[`NOWNODES_BLOCKBOOK_URL_${id.toUpperCase()}`];
  const rpc = process.env[`NOWNODES_RPC_URL_${id.toUpperCase()}`];
  return { ...base, blockbook: bb ?? base.blockbook, rpc: rpc ?? base.rpc };
}

export function knownChains(): ChainInfo[] {
  return Object.values(REGISTRY);
}
