/**
 * Offline stub facilitator: advertises exact/cardano:preprod with all three
 * assetTransferMethods so the resource server emits real 402 requirements
 * (including seller-signed Masumi terms) without a Blockfrost key. /verify
 * and /settle always fail — this exists to test the 402 emission path only.
 */
import express from "express";

const NETWORK = (process.env.CARDANO_NETWORK ?? "cardano:preprod") as "cardano:preprod";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/supported", (_req, res) => {
  res.json({
    kinds: [
      {
        scheme: "exact",
        network: NETWORK,
        x402Version: 2,
        extra: {
          assetTransferMethods: ["default", "masumi"],
          l1Confirmations: { minimum: 0, maximum: 20 },
        },
      },
    ],
  });
});
app.get("/health", (_req, res) => res.json({ status: "ok", network: NETWORK, stub: true }));
app.post("/verify", (_req, res) => res.json({ isValid: false, invalidReason: "stub_facilitator" }));
app.post("/settle", (_req, res) => res.json({ success: false, errorReason: "stub_facilitator", network: NETWORK }));

const port = Number(process.env.FACILITATOR_PORT ?? 4022);
app.listen(port, "127.0.0.1", () => console.log(`STUB facilitator on http://localhost:${port} (402 emission only)`));
