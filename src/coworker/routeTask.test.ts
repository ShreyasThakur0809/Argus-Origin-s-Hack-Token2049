import "dotenv/config";
import { NownodesClient } from "../nwn/client.js";
import { CoinGeckoClient } from "../cg/client.js";
import { runSku } from "../products/runSku.js";
import { routeTask } from "./routeTask.js";

const cases = [
  "show me whale flow on bitcoin over the last 5 blocks",
  "what are the gas fees on ethereum and base right now",
  "is the transaction 0x5c50cf3e97e1b15e5b5d4d2d3c8e54a1e1f0e0d0c0b0a0908070605040302010 confirmed on eth",
  "who are the top holders of token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "bridge activity on base and arbitrum",
  "is solana up right now",
  '{"sku":"whale-flow","params":{"chain":"doge","blocks":2}}',
  "write me a poem about cardano",
  "what is the balance of 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 on ethereum",
  "Should I hedge BTC? Analyze on-chain activity over the last 3 blocks and give me a HEDGE or NO HEDGE recommendation",
  "should I buy or sell right now",
  "what is the price of btc and solana right now",
  "which coins are trending",
];

for (const input of cases) {
  const r = routeTask(input);
  console.log(`${(r?.skuId ?? "null").padEnd(22)} ${r?.url ?? ""} ${r?.body ? JSON.stringify(r.body) : ""}`);
}

// Execute one routed brief through the shared SKU engine (proof included).
const nwn = new NownodesClient();
const cg = new CoinGeckoClient();
const routed = routeTask("is solana up right now")!;
const result = await runSku(nwn, cg, routed.skuId, {
  originalUrl: routed.url,
  params: routed.chain ? { chain: routed.chain } : {},
  body: routed.body,
});
console.log("\nexecute sample:", JSON.stringify(result).slice(0, 600));
