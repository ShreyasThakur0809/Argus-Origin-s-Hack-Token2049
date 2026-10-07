import { keccak_256 } from "@noble/hashes/sha3";
import type { NownodesClient } from "../nwn/client.js";
import { resolveChain } from "../nwn/chains.js";
import { clampInt } from "./whaleFlow.js";

export interface BridgeQuery {
  chains: string[];
  blocks: number;
}

interface RpcLog {
  address: string;
  topics: string[];
  transactionHash: string;
  blockNumber: string;
}

/** Known bridge contracts per chain. Logs are fetched by address only, so an
 * upstream event-signature change can never empty the result. */
const BRIDGES: Record<string, { name: string; address: string }[]> = {
  eth: [
    { name: "Base L1 Standard Bridge", address: "0x3154Cf16ccdb4C6d922629664174b904d80F2C35" },
    { name: "Optimism L1 Standard Bridge", address: "0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1" },
    { name: "Across SpokePool", address: "0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5" },
    { name: "Wormhole Core", address: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B" },
  ],
  base: [
    { name: "L2 Standard Bridge", address: "0x4200000000000000000000000000000000000010" },
    { name: "Across SpokePool", address: "0x09aea4b2242abC8bb4BB78D537A67a245A12bE64" },
    { name: "Wormhole Core", address: "0xbebdb6C8ddC678FfA9f8748f85C815C556Dd8ac6" },
  ],
  arb: [{ name: "Across SpokePool", address: "0xe35e9842fceaca96570b734083f4a58e8f7c5f2a" }],
  op: [
    { name: "L2 Standard Bridge", address: "0x4200000000000000000000000000000000000010" },
    { name: "Across SpokePool", address: "0x6f26Bf09B1C792e3228e5467807a900A503c0281" },
  ],
  matic: [{ name: "Across SpokePool", address: "0x9295ee1d8C5b022Be115A2C3ad30A6F7C4E5976D" }],
};

const EVENT_SIGNATURES: Record<string, string> = {
  // OP Stack legacy + v2 pairs (same tx emits both — totals dedupe by txid)
  "ETHBridgeInitiated(address,address,uint256,bytes)": "outbound",
  "ERC20BridgeInitiated(address,address,address,address,uint256,bytes)": "outbound",
  "ETHDepositInitiated(address,address,uint256,bytes)": "outbound",
  "ERC20DepositInitiated(address,address,address,address,uint256,bytes)": "outbound",
  "ETHWithdrawalInitiated(address,address,uint256,bytes)": "outbound",
  "ERC20WithdrawalInitiated(address,address,address,address,uint256,bytes)": "outbound",
  "WithdrawalInitiated(address,address,address,uint256,bytes)": "outbound",
  "DepositInitiated(address,address,address,uint256,bytes)": "outbound",
  // Across v2/v3 SpokePool
  "FundsDeposited(bytes32,bytes32,uint256,uint256,uint256,uint256,uint32,uint32,uint32,bytes32,bytes32,bytes32,bytes)": "outbound",
  "TokensBridged(uint256,uint256,uint32,bytes32,address)": "outbound",
  "LogMessagePublished(address,uint64,uint32,bytes,uint8)": "outbound",
  "ETHBridgeFinalized(address,address,uint256,bytes)": "inbound",
  "ERC20BridgeFinalized(address,address,address,address,uint256,bytes)": "inbound",
  "ETHDepositFinalized(address,address,uint256,bytes)": "inbound",
  "ERC20DepositFinalized(address,address,address,address,uint256,bytes)": "inbound",
  "ETHWithdrawalFinalized(address,address,uint256,bytes)": "inbound",
  "ERC20WithdrawalFinalized(address,address,address,address,uint256,bytes)": "inbound",
  "WithdrawalFinalized(address,address,uint256,bytes)": "inbound",
  "DepositFinalized(address,address,address,uint256,bytes)": "inbound",
  "FilledRelay(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256,uint32,uint32,bytes32,bytes32,bytes32,bytes32,bytes32,(bytes32,bytes32,uint256,uint8))": "inbound",
  "ExecutedRelayerRefundRoot(uint256,uint256,uint256[],uint32,uint32,address,address[],bool,address)": "ops",
  "RelayedRootBundle(uint32,bytes32,bytes32)": "ops",
  // L2StandardBridge six-param variants
  "DepositFinalized(address,address,address,address,uint256,bytes)": "inbound",
  "WithdrawalInitiated(address,address,address,address,uint256,bytes)": "outbound",
  "Transfer(address,address,uint256)": "transfer",
};

const TOPIC_LABELS = new Map<string, { label: string; direction: string }>();
for (const [sig, direction] of Object.entries(EVENT_SIGNATURES)) {
  const label = sig.slice(0, sig.indexOf("("));
  const topic = `0x${Buffer.from(keccak_256(new TextEncoder().encode(sig))).toString("hex")}`;
  TOPIC_LABELS.set(topic, { label, direction });
}

/**
 * Cross-chain bridge activity: every event emitted by known bridge contracts
 * on each requested chain over the window, grouped by event type and
 * direction. Agent-facing answer for "where is liquidity moving".
 */
export async function bridgeActivity(nwn: NownodesClient, q: BridgeQuery) {
  const perChain = [];
  for (const chainId of q.chains) {
    const chain = resolveChain(chainId);
    const bridges = BRIDGES[chainId];
    if (!chain?.rpc || chain.kind !== "evm" || !bridges?.length) {
      perChain.push({ chain: chainId, error: "unsupported or non-EVM chain" });
      continue;
    }
    const tip = await nwn.tip(chainId);
    const from = Math.max(0, tip - q.blocks);
    const CHUNK = 2_000;

    const entries = [];
    for (const bridge of bridges) {
      const events = new Map<string, { label: string; direction: string; count: number; txids: string[] }>();
      const txidsByDirection = new Map<string, Set<string>>();
      for (let start = from; start <= tip; start += CHUNK) {
        const end = Math.min(tip, start + CHUNK - 1);
        let logs: RpcLog[];
        try {
          logs = await nwn.rpc<RpcLog[]>(chainId, "eth_getLogs", [
            { address: bridge.address, fromBlock: `0x${start.toString(16)}`, toBlock: `0x${end.toString(16)}` },
          ]);
        } catch (error) {
          events.set("error", { label: "rpc_error", direction: "unknown", count: 0, txids: [] });
          break;
        }
        for (const log of logs) {
          const topic0 = log.topics[0] ?? "0x";
          const known = TOPIC_LABELS.get(topic0);
          const label = known?.label ?? `unknown_${topic0.slice(0, 10)}`;
          const direction = known?.direction ?? "unknown";
          const bucket = events.get(topic0) ?? { label, direction, count: 0, txids: [] };
          bucket.count += 1;
          if (bucket.txids.length < 3 && !bucket.txids.includes(log.transactionHash)) {
            bucket.txids.push(log.transactionHash);
          }
          events.set(topic0, bucket);
          const dirSet = txidsByDirection.get(direction) ?? new Set<string>();
          dirSet.add(log.transactionHash);
          txidsByDirection.set(direction, dirSet);
        }
      }
      const list = [...events.values()];
      // Direction totals dedupe by txid: OP-stack bridges emit a legacy and a
      // v2 event for the same action, so event counts would double-count.
      const uniqueTxByDirection = (dir: string) =>
        new Set(
          [...txidsByDirection.get(dir) ?? []],
        ).size;
      entries.push({
        bridge: bridge.name,
        address: bridge.address,
        totalEvents: list.reduce((a, e) => a + e.count, 0),
        outbound: uniqueTxByDirection("outbound"),
        inbound: uniqueTxByDirection("inbound"),
        events: list.sort((a, b) => b.count - a.count),
      });
    }
    perChain.push({ chain: chainId, tip, windowBlocks: q.blocks, bridges: entries });
  }
  return {
    windowBlocks: q.blocks,
    chains: perChain,
    totals: {
      outbound: perChain.flatMap(c => c.bridges ?? []).reduce((a, b) => a + b.outbound, 0),
      inbound: perChain.flatMap(c => c.bridges ?? []).reduce((a, b) => a + b.inbound, 0),
    },
  };
}

export function parseBridgeQuery(search: URLSearchParams): BridgeQuery {
  const chains = (search.get("chains") ?? "eth,base")
    .split(",")
    .map(c => c.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
  return { chains: chains.length ? chains : ["eth", "base"], blocks: clampInt(search.get("blocks"), 100, 50_000, 5_000) };
}
