/**
 * Route a Sokosumi task brief to a catalogue SKU.
 *
 * Two input styles:
 *  - Structured: a JSON body like {"sku":"whale-flow","params":{"chain":"btc"}}
 *  - Free text: "show me whale flow on bitcoin over the last 5 blocks"
 *
 * Returns a fabricated request shape for runSku, or null when the brief does
 * not map to a SKU (or a required argument like a token/txid/address is
 * missing) — the worker answers with the catalogue instead of inventing data.
 */
import { SKUS } from "../catalogue.js";
import { resolveChain } from "../nwn/chains.js";
import { DECISION_INTENT } from "./decide.js";

export interface Routed {
  skuId: string;
  /** GET path incl. query string, or POST path for raw-rpc. */
  url: string;
  chain?: string;
  body?: { method: string; params: unknown[] };
}

const CHAIN_WORDS: [string, string][] = [
  ["bitcoin", "btc"], ["litecoin", "ltc"], ["dogecoin", "doge"],
  ["ethereum", "eth"], ["arbitrum", "arb"], ["optimism", "op"],
  ["polygon", "matic"], ["binance", "bsc"], ["bnb", "bsc"],
  ["solana", "sol"], ["cardano", "ada"], ["tron", "trx"],
  ["btc", "btc"], ["ltc", "ltc"], ["doge", "doge"], ["eth", "eth"],
  ["base", "base"], ["arb", "arb"], ["matic", "matic"],
  ["bsc", "bsc"], ["sol", "sol"], ["ada", "ada"], ["trx", "trx"],
];

function chainsIn(text: string): string[] {
  const out: string[] = [];
  for (const [word, id] of CHAIN_WORDS) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text) && resolveChain(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

const firstChain = (text: string, fallback: string) => chainsIn(text)[0] ?? fallback;
const number = (text: string, re: RegExp, fallback: number) => {
  const m = text.match(re);
  return m ? Number(m[1]) : fallback;
};

const EVM_ADDR = /0x[0-9a-fA-F]{40}/;
const TXID = /(?:0x)?[0-9a-fA-F]{64}/;

function qs(params: Record<string, string | number>) {
  return Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

/** Structured input: {"sku":"...","params":{...}} anywhere in the brief. */
function fromJson(text: string): Routed | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { sku?: string; params?: Record<string, string | number | unknown[]> };
    if (!j.sku || !SKUS.some(s => s.id === j.sku)) return null;
    const params = j.params ?? {};
    if (j.sku === "raw-rpc") {
      const chain = String(params.chain ?? "eth");
      return { skuId: "raw-rpc", url: `/rpc/${chain}`, chain, body: { method: String(params.method ?? "eth_blockNumber"), params: (params.params as unknown[]) ?? [] } };
    }
    const sku = SKUS.find(s => s.id === j.sku)!;
    const scalar: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(params))
      if (typeof v === "string" || typeof v === "number") scalar[k] = v;
    return { skuId: sku.id, url: `${sku.path}?${qs(scalar)}` };
  } catch {
    return null;
  }
}

export function routeTask(brief: string): Routed | null {
  const structured = fromJson(brief);
  if (structured) return structured;
  const t = brief.toLowerCase();

  if (/\bwhale|largest? (transfer|transaction)|big (move|transfer)\b/.test(t)) {
    const chain = firstChain(t, "btc");
    return { skuId: "whale-flow", url: `/data/whale-flow?${qs({ chain, blocks: number(t, /(\d+)\s*blocks?/, 3), minNative: number(t, /min(?:imum)?\s*(?:of\s*)?(\d+(?:\.\d+)?)/, 1) })}`, chain };
  }

  if (/\bholder|concentration|top holders?|who owns\b/.test(t)) {
    const token = brief.match(EVM_ADDR)?.[0];
    if (!token) return null; // cannot guess a token contract
    return { skuId: "holder-concentration", url: `/data/holder-concentration?${qs({ chain: firstChain(t, "eth"), token, blocks: number(t, /(\d+)\s*blocks?/, 10000) })}` };
  }

  if (/\bbridge|deposit(s)? (in|to)|withdraw(al)?s?\b/.test(t)) {
    const chains = chainsIn(t);
    return { skuId: "bridge-activity", url: `/data/bridge-activity?${qs({ chains: (chains.length ? chains : ["eth", "base", "arb"]).join(","), blocks: number(t, /(\d+)\s*blocks?/, 5000) })}` };
  }

  if (/\bgas|fee|cost of|cheap(est)?|how much to (send|transact)\b/.test(t)) {
    const chains = chainsIn(t);
    return { skuId: "fee-market", url: `/data/fee-market?${qs({ chains: (chains.length ? chains : ["eth", "base", "arb", "btc"]).join(",") })}` };
  }

  if (/\bbalance|snapshot|wallet|address|portfolio|holdings?\b/.test(t)) {
    const address = brief.match(EVM_ADDR)?.[0] ?? brief.match(/\bbc1[a-z0-9]{20,}\b/i)?.[0];
    if (!address) return null;
    return { skuId: "address-snapshot", url: `/data/address-snapshot?${qs({ chain: firstChain(t, "eth"), address })}` };
  }

  if (/\btx(status)?|transaction|confirm(ed|ation)?|landed|receipt|settled\b/.test(t)) {
    const txid = brief.match(TXID)?.[0];
    if (!txid) return null;
    return { skuId: "tx-status", url: `/data/tx-status?${qs({ chain: firstChain(t, "eth"), txid })}` };
  }

  // Market-data SKUs (CoinGecko plane) — checked before chain-status because
  // "price"/"trending" briefs should never become liveness checks.
  if (/\btrending|hot (coins?|tokens?|assets?)|popular|what('s| is) moving|market attention\b/.test(t))
    return { skuId: "trending", url: "/data/trending" };

  if (/\bprice|market cap|mcap|worth|how much (is|are)|market (data|snapshot|context|value)\b/.test(t)) {
    const chains = chainsIn(t);
    return { skuId: "market-snapshot", url: `/data/market-snapshot?${qs({ assets: (chains.length ? chains : ["btc", "eth"]).join(",") })}` };
  }

  if (/\b(live|alive|liveness|status|healthy|health|height|tip|down|up|reachable|running)\b/.test(t)) {
    const chains = chainsIn(t);
    return { skuId: "chain-status", url: `/data/chain-status?${qs({ chains: (chains.length ? chains : ["eth", "base", "btc"]).join(",") })}` };
  }

  const rpcMethod = brief.match(/\beth_[a-zA-Z]+\b/)?.[0];
  if (/\brpc|call|method\b/.test(t) || rpcMethod)
    return { skuId: "raw-rpc", url: `/rpc/${firstChain(t, "eth")}`, chain: firstChain(t, "eth"), body: { method: rpcMethod ?? "eth_blockNumber", params: [] } };

  // Decision briefs ("should I hedge BTC") route to the flagship intelligence
  // SKU when a chain is named; decide.ts wraps the verified data in a signal.
  if (DECISION_INTENT.test(t)) {
    const chains = chainsIn(t);
    if (!chains.length) return null; // a decision still needs a subject chain
    return { skuId: "whale-flow", url: `/data/whale-flow?${qs({ chain: chains[0], blocks: number(t, /(\d+)\s*blocks?/, 3), minNative: number(t, /min(?:imum)?\s*(?:of\s*)?(\d+(?:\.\d+)?)/, 1) })}`, chain: chains[0] };
  }

  return null;
}

/** The fallback answer when a brief does not map to a SKU. */
export function catalogueSummary() {
  return SKUS.map(s => ({ sku: s.id, method: s.method, path: s.path, answers: s.title, example: s.example }));
}
