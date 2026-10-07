/**
 * Shared SKU execution: one SKU id + a minimal request shape in, verified
 * answer + proof envelope out. Used by the Express paid handlers in
 * server.ts and by the Sokosumi coworker worker, which runs SKUs in-process
 * without an HTTP request.
 */
import { createHash } from "node:crypto";
import type express from "express";

import type { NownodesClient } from "../nwn/client.js";
import type { CoinGeckoClient } from "../cg/client.js";
import { whaleFlow, parseWhaleFlowQuery } from "./whaleFlow.js";
import { holderConcentration, parseHolderQuery } from "./holderConcentration.js";
import { bridgeActivity, parseBridgeQuery } from "./bridgeActivity.js";
import { rawRpc } from "./rawRpc.js";
import { txStatus, parseTxStatusQuery } from "./txStatus.js";
import { feeMarket, parseFeeMarketQuery } from "./feeMarket.js";
import { addressSnapshot, parseAddressQuery } from "./addressSnapshot.js";
import { chainStatus, parseChainStatusQuery } from "./chainStatus.js";
import { marketSnapshot, parseMarketQuery } from "./marketSnapshot.js";
import { trending } from "./trending.js";

/** Which data plane serves each SKU — everything else is NOWNodes on-chain. */
const COINGECKO_SKUS = new Set(["market-snapshot", "trending"]);

/** The subset of express.Request runSku actually reads. Express requests
 * satisfy this structurally; the worker fabricates it directly. */
export type SkuRequest = Pick<express.Request, "originalUrl"> & {
  params?: Record<string, string>;
  body?: unknown;
};

export async function runSku(nwn: NownodesClient, cg: CoinGeckoClient, skuId: string, req: SkuRequest) {
  const started = Date.now();
  const url = new URL(req.originalUrl, "http://localhost");
  let data: unknown;
  switch (skuId) {
    case "whale-flow":
      data = await whaleFlow(nwn, parseWhaleFlowQuery(url.searchParams));
      break;
    case "holder-concentration":
      data = await holderConcentration(nwn, parseHolderQuery(url.searchParams));
      break;
    case "bridge-activity":
      data = await bridgeActivity(nwn, parseBridgeQuery(url.searchParams));
      break;
    case "tx-status":
      data = await txStatus(nwn, parseTxStatusQuery(url.searchParams));
      break;
    case "fee-market":
      data = await feeMarket(nwn, parseFeeMarketQuery(url.searchParams));
      break;
    case "address-snapshot":
      data = await addressSnapshot(nwn, parseAddressQuery(url.searchParams));
      break;
    case "chain-status":
      data = await chainStatus(nwn, parseChainStatusQuery(url.searchParams));
      break;
    case "market-snapshot":
      data = await marketSnapshot(cg, parseMarketQuery(url.searchParams));
      break;
    case "trending":
      data = await trending(cg);
      break;
    case "raw-rpc": {
      const chain = req.params?.chain ?? "";
      const body = (req.body ?? {}) as { method?: string; params?: unknown[] };
      data = await rawRpc(nwn, { chain, method: body.method ?? "", params: body.params ?? [] });
      break;
    }
    default:
      throw new Error(`unknown sku '${skuId}'`);
  }
  const body = JSON.stringify(data);
  // ?corrupt=1 serves a valid-looking answer with a wrong proof — buyers that
  // verify before acting reject it, and escrowed funds are never released.
  const corrupt = url.searchParams.get("corrupt") === "1";
  return {
    sku: skuId,
    data,
    proof: {
      resultHash: corrupt ? "sha256:0".padEnd(71, "0") : `sha256:${createHash("sha256").update(body).digest("hex")}`,
      generatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      source: COINGECKO_SKUS.has(skuId) ? "coingecko" : "nownodes",
      sourceMode: (COINGECKO_SKUS.has(skuId) ? cg.live : nwn.live) ? "live" : "fixture",
    },
  };
}
