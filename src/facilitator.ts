/**
 * Local x402 facilitator for Cardano preprod. Holds no keys and no funds:
 * it verifies payer-signed transactions and broadcasts them. In production
 * point FACILITATOR_URL at a hosted facilitator instead.
 */
import "dotenv/config";
import express from "express";
import { x402Facilitator } from "@x402/core/facilitator";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { toFacilitatorCardanoSigner } from "@x402/cardano";
import { ExactCardanoScheme } from "@x402/cardano/exact/facilitator";

const projectId = process.env.BLOCKFROST_PROJECT_ID;
if (!projectId) {
  console.error("Set BLOCKFROST_PROJECT_ID in .env (free preprod id: https://blockfrost.io)");
  process.exit(1);
}

const NETWORK = (process.env.CARDANO_NETWORK ?? "cardano:preprod") as "cardano:preprod";
const blockfrostBaseUrl =
  process.env.BLOCKFROST_BASE_URL ?? "https://cardano-preprod.blockfrost.io/api/v0";
const confirmationTimeoutMs = Number(process.env.CONFIRMATION_TIMEOUT_MS ?? 75_000);
const acceptMempool = process.env.ACCEPT_MEMPOOL === "true";

const signer = toFacilitatorCardanoSigner({
  network: NETWORK,
  provider: { blockfrost: { baseUrl: blockfrostBaseUrl, projectId } },
  awaitConfirmation: false,
});

const facilitator = new x402Facilitator();
facilitator.register(NETWORK, new ExactCardanoScheme(signer, { acceptMempool, confirmationTimeoutMs }));

const app = express();
app.use(express.json({ limit: "2mb" }));

app.post("/verify", async (req, res) => {
  const { paymentPayload, paymentRequirements } = req.body as {
    paymentPayload?: PaymentPayload;
    paymentRequirements?: PaymentRequirements;
  };
  if (!paymentPayload || !paymentRequirements) {
    res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
    return;
  }
  try {
    const response = await facilitator.verify(paymentPayload, paymentRequirements);
    if (!response.isValid) {
      console.warn(`[verify] rejected: ${response.invalidReason} ${response.invalidMessage ?? ""}`);
    }
    res.json(response);
  } catch (error) {
    console.error("[verify]", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/settle", async (req, res) => {
  const { paymentPayload, paymentRequirements } = req.body as {
    paymentPayload?: PaymentPayload;
    paymentRequirements?: PaymentRequirements;
  };
  if (!paymentPayload || !paymentRequirements) {
    res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
    return;
  }
  try {
    const response = await facilitator.settle(paymentPayload, paymentRequirements);
    console.log(`[settle] success=${response.success} tx=${response.transaction ?? "-"} ${JSON.stringify(response.errorReason ?? "")}`);
    res.json(response);
  } catch (error) {
    console.error("[settle]", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.get("/supported", (_req, res) => res.json(facilitator.getSupported()));
app.get("/health", (_req, res) => res.json({ status: "ok", network: NETWORK, confirmationTimeoutMs, acceptMempool }));

const port = Number(process.env.FACILITATOR_PORT ?? 4022);
const host = process.env.FACILITATOR_HOST ?? "127.0.0.1";
app.listen(port, host, () => {
  console.log(`Cardano facilitator on http://${host}:${port} (${NETWORK})`);
});
