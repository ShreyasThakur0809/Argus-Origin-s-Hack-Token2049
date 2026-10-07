/**
 * Argus marketplace: pay-per-query on-chain intelligence for machines,
 * powered by the Query402 payment protocol.
 *
 * Every SKU is one HTTP request. Unpaid calls get a 402 with Cardano payment
 * requirements (Masumi escrow or plain address payment); the facilitator
 * verifies + settles; the handler answers with the data plus a proof
 * envelope (result hash, chain tips, latency).
 */
import "dotenv/config";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient, type RoutesConfig } from "@x402/core/server";
import { ExactCardanoScheme } from "@x402/cardano/exact/server";
import { masumiEscrowAddress, toMasumiSellerSigner, decodeCardanoTransaction } from "@x402/cardano";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import { addressFromSeed } from "@evolution-sdk/evolution/sdk/wallet/Derivation";
import { Address } from "@evolution-sdk/evolution";

import { recordActivity, readActivity } from "./activity.js";
import { SKUS, priceFor, escrowMode, type Sku } from "./catalogue.js";
import { NownodesClient, NownodesError } from "./nwn/client.js";
import { CoinGeckoClient } from "./cg/client.js";
import { knownChains, resolveChain } from "./nwn/chains.js";
import { runSku } from "./products/runSku.js";
import { ALLOWED_METHODS } from "./products/rawRpc.js";

const NETWORK = (process.env.CARDANO_NETWORK ?? "cardano:preprod") as "cardano:preprod";
const facilitatorUrl = process.env.FACILITATOR_URL ?? "http://localhost:4022";
const nwn = new NownodesClient();
const cg = new CoinGeckoClient();

const sellerMnemonic = process.env.SELLER_MNEMONIC?.trim();
if (!sellerMnemonic) {
  console.error("Set SELLER_MNEMONIC in .env (run `npm run wallet` to generate wallets)");
  process.exit(1);
}
// Default-method payments can land on any address (SELLER_ADDRESS env override);
// Masumi terms are signed by and pay out to the mnemonic-derived seller wallet.
const sellerAddress = process.env.SELLER_ADDRESS?.trim() ||
  Address.toBech32(addressFromSeed(sellerMnemonic, { networkId: 0 }).address);
const masumiSeller = toMasumiSellerSigner({ network: NETWORK, mnemonic: sellerMnemonic });

/** Cheap argument checks that run BEFORE the 402 dance: malformed requests
 * must never cost the buyer money. */
function validateSkuArgs(skuId: string, req: express.Request): string | undefined {
  const url = new URL(req.originalUrl, "http://localhost");
  try {
    switch (skuId) {
      case "whale-flow":
      case "bridge-activity":
      case "holder-concentration":
      case "fee-market":
      case "chain-status": {
        const chains = [url.searchParams.get("chain") ?? "", ...(url.searchParams.get("chains") ?? "").split(",")];
        const bad = chains.map(c => c.trim().toLowerCase()).filter(c => c && !resolveChain(c));
        if (bad.length) return `unknown chain(s): ${bad.join(", ")} — see /catalogue for supported chains`;
        if (skuId === "holder-concentration") {
          const token = url.searchParams.get("token") ?? "";
          if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return "holder-concentration requires ?token=0x... (ERC20 contract)";
        }
        break;
      }
      case "tx-status": {
        const chainId = (url.searchParams.get("chain") ?? "eth").toLowerCase();
        const chain = resolveChain(chainId);
        if (!chain) return `unknown chain '${chainId}' — see /catalogue for supported chains`;
        const txid = url.searchParams.get("txid") ?? "";
        if (chain.kind === "evm" || chain.blockbook) {
          if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(txid)) return "tx-status requires ?txid=<64-char hex hash>";
        } else if (chainId === "sol") {
          if (!/^[1-9A-HJ-NP-Za-km-z]{40,90}$/.test(txid)) return "tx-status on sol requires a base58 signature as ?txid=";
        } else {
          return `chain '${chainId}' has no transaction lookup endpoint`;
        }
        break;
      }
      case "address-snapshot": {
        const chainId = (url.searchParams.get("chain") ?? "eth").toLowerCase();
        const chain = resolveChain(chainId);
        if (!chain) return `unknown chain '${chainId}' — see /catalogue for supported chains`;
        const address = url.searchParams.get("address") ?? "";
        if (chain.kind === "evm") {
          if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return "address-snapshot requires ?address=0x... (40-hex EVM address)";
        } else if (!chain.blockbook && chainId !== "sol") {
          return `chain '${chainId}' has no address lookup endpoint`;
        } else if (!/^[\w]{20,110}$/.test(address)) {
          return "address-snapshot requires a valid ?address= for the selected chain";
        }
        break;
      }
      case "raw-rpc": {
        const chain = /\/rpc\/([a-z]+)$/.exec(req.path)?.[1] ?? "";
        if (!resolveChain(chain)?.rpc) return `chain '${chain}' unknown or has no RPC endpoint`;
        const method = (req.body as { method?: string }).method;
        if (!method || typeof method !== "string") return "body must be {\"method\": \"...\", \"params\": [...]}";
        if (!ALLOWED_METHODS.has(method)) return `method '${method}' not allowed — read-only methods only`;
        break;
      }
      case "market-snapshot": {
        const assets = (url.searchParams.get("assets") ?? "").split(",").map(a => a.trim()).filter(Boolean);
        const bad = assets.filter(a => !/^[a-zA-Z0-9-]{1,40}$/.test(a));
        if (bad.length) return `invalid asset(s): ${bad.join(", ")} — use symbols or CoinGecko ids, e.g. assets=btc,eth`;
        break;
      }
    }
  } catch (error) {
    return error instanceof Error ? error.message : "invalid request";
  }
  return undefined;
}

function paymentTxHash(req: express.Request): string | undefined {
  const header = req.get("PAYMENT-SIGNATURE");
  if (!header) return undefined;
  try {
    const payload = decodePaymentSignatureHeader(header);
    return decodeCardanoTransaction(String(payload.payload.transaction)).txHash;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  // Facilitator capability check up front: if it cannot do Masumi we degrade
  // to plain address payments rather than failing mid-demo.
  let liveEscrow = escrowMode();
  let facilitatorOk = false;
  // A hosted facilitator can still be cold-starting when we boot; keep
  // probing instead of exiting into a restart loop that outlasts its wake-up.
  const devMode = process.env.DEV_BYPASS === "1";
  const deadline = Date.now() + (devMode ? 0 : 240_000);
  let lastError: unknown;
  while (!facilitatorOk) {
    try {
      const res = await fetch(`${facilitatorUrl}/supported`, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const supported = (await res.json()) as {
        kinds: { scheme: string; network: string; x402Version?: number; extra?: Record<string, unknown> }[];
      };
      const kind = supported.kinds.find(k => k.scheme === "exact" && k.network === NETWORK);
      if (!kind) throw new Error(`facilitator does not advertise exact/${NETWORK}`);
      const methods = (kind.extra?.assetTransferMethods as string[] | undefined) ?? ["default"];
      if (liveEscrow === "masumi" && !methods.includes("masumi")) {
        console.warn("[server] facilitator lacks masumi support — falling back to direct payments");
        liveEscrow = "default";
      }
      facilitatorOk = true;
      console.log(`[server] facilitator ok — transfer methods: ${methods.join(", ")}`);
    } catch (error) {
      lastError = error;
      if (Date.now() >= deadline) break;
      console.warn(`[server] facilitator not ready at ${facilitatorUrl}: ${error instanceof Error ? error.message : error} — retrying`);
      await new Promise(r => setTimeout(r, 8_000));
    }
  }
  if (!facilitatorOk) {
    if (!devMode) {
      console.error(`[server] cannot reach facilitator at ${facilitatorUrl}: ${lastError instanceof Error ? lastError.message : lastError}`);
      process.exit(1);
    }
    console.warn(`[server] facilitator unreachable — DEV_BYPASS mode, paid routes unpaid`);
  }

  let resourceServer: x402ResourceServer | null = null;
  if (facilitatorOk) {
    resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: facilitatorUrl }));
    resourceServer.register(NETWORK, new ExactCardanoScheme({ masumi: { seller: masumiSeller } }));
    await resourceServer.initialize();
  }

  await startApp(resourceServer, liveEscrow);
}

async function startApp(resourceServer: x402ResourceServer | null, escrow: "masumi" | "default") {
  const payTo = escrow === "masumi" ? masumiEscrowAddress(NETWORK) : sellerAddress;

  const routes: RoutesConfig = {};
  for (const sku of SKUS) {
    const paths = sku.id === "raw-rpc"
      ? knownChains().filter(c => c.rpc).map(c => `/rpc/${c.id}`)
      : [sku.path];
    for (const path of paths) {
      routes[`${sku.method} ${path}`] = {
        accepts: [
          {
            scheme: "exact",
            network: NETWORK,
            payTo,
            price: priceFor(sku),
            maxTimeoutSeconds: 600,
            extra: { assetTransferMethod: escrow },
          },
        ],
        description: `${sku.title} — ${sku.description}`,
        mimeType: "application/json",
      };
    }
  }

  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  // --- free surface ------------------------------------------------------
  app.get("/health", (_req, res) => res.json({ ok: true, network: NETWORK, escrow, source: nwn.live ? "nownodes" : "fixture", sources: { nownodes: nwn.live, coingecko: cg.live } }));
  app.get("/catalogue", (_req, res) =>
    res.json({
      name: "Argus — on-chain intelligence for AI agents",
      poweredBy: "Query402",
      network: NETWORK,
      escrow,
      payTo,
      skus: SKUS.map(sku => ({ ...sku, price: priceFor(sku), assetLabel: process.env.PRICE_ASSET === "usdm" ? "tUSDM" : "tADA" })),
      chains: knownChains().map(c => ({ id: c.id, kind: c.kind, blockbook: !!c.blockbook, rpc: !!c.rpc })),
    }),
  );
  // Free read-only feed of SKU executions — powers the dashboard activity view.
  app.get("/activity", (_req, res) =>
    res.json({ entries: readActivity(100), network: NETWORK, escrow }),
  );

  // --- early validation (never charge for a malformed request) -----------
  app.use((req, res, next) => {
    const barePath = req.path.startsWith("/dev/") ? req.path.slice(4) : req.path;
    const sku =
      SKUS.find(s => s.method === req.method && s.path === barePath && s.id !== "raw-rpc") ??
      (req.method === "POST" && /^\/rpc\/[a-z]+$/.test(barePath) ? SKUS.find(s => s.id === "raw-rpc") : undefined);
    if (!sku) return next();
    const problem = validateSkuArgs(sku.id, req);
    if (problem) res.status(400).json({ error: problem });
    else next();
  });

  // --- paid handlers -----------------------------------------------------
  const paidHandler = (skuId: string) => async (req: express.Request, res: express.Response) => {
    const started = Date.now();
    const mode = req.path.startsWith("/dev/") ? "dev" : paymentTxHash(req) ? "paid" : "open";
    try {
      const result = await runSku(nwn, cg, skuId, req);
      const tx = paymentTxHash(req);
      res.json({ ...result, payment: { tx, escrow, network: NETWORK } });
      recordActivity({
        ts: new Date().toISOString(), sku: skuId, method: req.method, path: req.originalUrl,
        mode: tx ? "paid" : mode, ok: true, status: 200, latencyMs: result.proof.latencyMs,
        tx, resultHash: result.proof.resultHash, sourceMode: result.proof.sourceMode,
      });
    } catch (error) {
      const message = error instanceof NownodesError ? error.message : error instanceof Error ? error.message : "query failed";
      console.error(`[${skuId}]`, message);
      recordActivity({
        ts: new Date().toISOString(), sku: skuId, method: req.method, path: req.originalUrl,
        mode, ok: false, status: 502, latencyMs: Date.now() - started, error: message,
      });
      // Post-payment failure: with masumi escrow the buyer's funds stay locked
      // and are refunded by the contract since no result is accepted.
      res.status(502).json({ error: `upstream data source failed: ${message}`, sku: skuId });
    }
  };

  if (resourceServer) {
    app.use(paymentMiddleware(routes, resourceServer));
  } else {
    // DEV mode without facilitator: serve the paid surface unpaid.
    for (const sku of SKUS) {
      if (sku.id === "raw-rpc") app.post("/rpc/:chain", paidHandler("raw-rpc"));
      else app.get(sku.path, paidHandler(sku.id));
    }
  }

  if (resourceServer) {
    for (const sku of SKUS) {
      if (sku.id === "raw-rpc") {
        app.post("/rpc/:chain", paidHandler("raw-rpc"));
      } else {
        app.get(sku.path, paidHandler(sku.id));
      }
    }
  }

  // --- dev mirrors (localhost only, unpaid) -------------------------------
  if (process.env.DEV_BYPASS === "1") {
    for (const sku of SKUS) {
      if (sku.id === "raw-rpc") app.post("/dev/rpc/:chain", paidHandler("raw-rpc"));
      else app.get(`/dev${sku.path}`, paidHandler(sku.id));
    }
    console.log("[server] DEV_BYPASS=1 — unpaid mirrors on /dev/*");
  }

  const port = Number(process.env.PORT ?? 4021);
  app.listen(port, () => {
    console.log(`Argus marketplace on http://localhost:${port}`);
    console.log(`  network=${NETWORK} escrow=${escrow} payTo=${payTo}`);
    console.log(`  seller=${sellerAddress}`);
    for (const sku of SKUS) {
      const price = priceFor(sku);
      const label = price.asset === "lovelace" ? `${Number(price.amount) / 1e6} tADA` : `${Number(price.amount) / 1e6} tUSDM`;
      console.log(`  ${sku.method} ${sku.id === "raw-rpc" ? "/rpc/:chain" : sku.path}  ${label}  — ${sku.title}`);
    }
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
