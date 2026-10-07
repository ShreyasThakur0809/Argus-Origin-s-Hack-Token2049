import { keccak_256 } from "@noble/hashes/sha3";
import type { NownodesClient } from "../nwn/client.js";
import { resolveChain } from "../nwn/chains.js";
import { clampInt } from "./whaleFlow.js";

export interface HolderQuery {
  chain: string;
  token: string;
  blocks: number;
  sample: number;
}

const TRANSFER_TOPIC = `0x${Buffer.from(keccak_256(new TextEncoder().encode("Transfer(address,address,uint256)"))).toString("hex")}`;
const BALANCE_OF = "0x70a08231"; // balanceOf(address)
const TOTAL_SUPPLY = "0x18160ddd"; // totalSupply()
const DECIMALS = "0x313ce567"; // decimals()

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  blockNumber: string;
}

function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40).toLowerCase()}`;
}

function encodeCall(selector: string, address?: string): string {
  return selector + (address ? address.slice(2).toLowerCase().padStart(64, "0") : "");
}

/**
 * Token holder concentration on EVM chains. Two-stage pipeline over NOWNodes
 * RPC: eth_getLogs finds the most active holders in the window, then exact
 * balanceOf calls give verified on-chain balances for the concentration math.
 */
export async function holderConcentration(nwn: NownodesClient, q: HolderQuery) {
  const chain = resolveChain(q.chain);
  if (!chain?.rpc || chain.kind !== "evm") {
    throw new Error(`holder-concentration needs an EVM chain with RPC; got '${q.chain}'`);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(q.token)) throw new Error("token must be a 0x contract address");

  const tip = await nwn.tip(q.chain);
  const from = Math.max(0, tip - q.blocks);

  // Stage 1: recent Transfer events -> candidate holders ranked by flow volume.
  const moved = new Map<string, bigint>();
  const CHUNK = 2_000;
  let logCount = 0;
  for (let start = from; start <= tip; start += CHUNK) {
    const end = Math.min(tip, start + CHUNK - 1);
    const logs = await nwn.rpc<RpcLog[]>(q.chain, "eth_getLogs", [
      { address: q.token, topics: [TRANSFER_TOPIC], fromBlock: `0x${start.toString(16)}`, toBlock: `0x${end.toString(16)}` },
    ]);
    logCount += logs.length;
    for (const log of logs) {
      if (log.topics.length < 3) continue;
      const to = topicToAddress(log.topics[2]);
      if (to === "0x0000000000000000000000000000000000000000") continue; // mints/burns
      const value = log.data && log.data !== "0x" ? BigInt(log.data) : 0n;
      moved.set(to, (moved.get(to) ?? 0n) + value);
    }
  }

  const candidates = [...moved.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1)).slice(0, q.sample);

  // Stage 2: exact balances + supply for the candidates (batched to stay
  // under free-tier rate limits).
  const totalSupplyHex = await nwn.rpc<string>(q.chain, "eth_call", [{ to: q.token, data: TOTAL_SUPPLY }, "latest"]);
  const decimalsHex = await nwn.rpc<string>(q.chain, "eth_call", [{ to: q.token, data: DECIMALS }, "latest"]);
  const totalSupply = totalSupplyHex && totalSupplyHex !== "0x" ? BigInt(totalSupplyHex) : 0n;
  const decimals = decimalsHex && decimalsHex !== "0x" ? Number(BigInt(decimalsHex)) : 18;

  const holders: { address: string; balance: string; windowVolume: string }[] = [];
  const BATCH = 4;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = await Promise.all(
      candidates.slice(i, i + BATCH).map(async ([address, windowVolume]) => {
        const balHex = await nwn.rpc<string>(q.chain, "eth_call", [
          { to: q.token, data: encodeCall(BALANCE_OF, address) },
          "latest",
        ]);
        const balance = balHex && balHex !== "0x" ? BigInt(balHex) : 0n;
        return { address, balance: balance.toString(), windowVolume: windowVolume.toString() };
      }),
    );
    holders.push(...batch);
  }
  holders.sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));

  const share = (n: number) => {
    const sum = holders.slice(0, n).reduce((acc, h) => acc + BigInt(h.balance), 0n);
    return totalSupply > 0n ? Number((sum * 1_000_000n) / totalSupply) / 1_000_000 : null;
  };

  return {
    chain: chain.id,
    token: q.token,
    tip,
    windowBlocks: q.blocks,
    transferEvents: logCount,
    sampledHolders: holders.length,
    method: "recent-activity sampling + exact balanceOf",
    tokenDecimals: decimals,
    totalSupply: totalSupply.toString(),
    concentration: {
      top5Share: share(5),
      top10Share: share(10),
      top25Share: share(25),
    },
    topHolders: holders.slice(0, 25).map(h => ({
      address: h.address,
      balance: h.balance,
      balanceUnits: Number(BigInt(h.balance)) / 10 ** decimals,
      supplyShare: totalSupply > 0n ? Number((BigInt(h.balance) * 1_000_000n) / totalSupply) / 1_000_000 : null,
    })),
    caveat:
      "Holder candidates are the most active receivers in the window; balances are exact on-chain balanceOf reads. Dormant whales not active in the window are not sampled.",
  };
}

export function parseHolderQuery(search: URLSearchParams): HolderQuery {
  return {
    chain: search.get("chain") ?? "eth",
    token: search.get("token") ?? "",
    blocks: clampInt(search.get("blocks"), 100, 100_000, 10_000),
    sample: clampInt(search.get("sample"), 5, 64, 32),
  };
}
