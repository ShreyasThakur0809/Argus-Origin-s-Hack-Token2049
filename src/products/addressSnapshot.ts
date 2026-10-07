import type { NownodesClient } from "../nwn/client.js";
import { resolveChain } from "../nwn/chains.js";

export interface AddressQuery {
  chain: string;
  address: string;
}

interface BlockbookToken {
  type?: string;
  name?: string;
  contract?: string;
  symbol?: string;
  balance?: string;
}

interface BlockbookAddress {
  address?: string;
  balance?: string;
  unconfirmedBalance?: string;
  totalReceived?: string;
  totalSent?: string;
  txs?: number;
  nonTokenTxs?: number;
  tokens?: BlockbookToken[];
}

interface SolBalance {
  context?: { slot?: number };
  value?: number;
}

interface SolAccountInfo {
  context?: { slot?: number };
  value?: { executable?: boolean; lamports?: number; owner?: string } | null;
}

/**
 * Address snapshot: what is this address right now? The check an agent runs
 * on its own treasury, or on a counterparty before transacting with it. EVM
 * answers include contract detection (EOA vs deployed code); blockbook chains
 * report lifetime totals and token balances where the backend exposes them.
 */
export async function addressSnapshot(nwn: NownodesClient, q: AddressQuery) {
  const chain = resolveChain(q.chain);
  if (!chain) throw new Error(`unknown chain '${q.chain}'`);
  const address = q.address.trim();
  const unit = 10 ** chain.decimals;

  if (chain.kind === "evm" && chain.rpc) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("address must be a 0x-prefixed 40-hex EVM address");
    const [balanceHex, nonceHex, code] = await Promise.all([
      nwn.rpc<string>(chain.id, "eth_getBalance", [address, "latest"]),
      nwn.rpc<string>(chain.id, "eth_getTransactionCount", [address, "latest"]),
      nwn.rpc<string>(chain.id, "eth_getCode", [address, "latest"]),
    ]);
    const balanceWei = BigInt(balanceHex);
    return {
      chain: chain.id,
      symbol: chain.symbol,
      address,
      kind: code && code !== "0x" ? "contract" : "eoa",
      balanceWei: balanceWei.toString(),
      balanceNative: Number(balanceWei) / unit,
      nonce: Number.parseInt(nonceHex, 16),
    };
  }

  if (chain.blockbook) {
    const info = await nwn.blockbook<BlockbookAddress>(chain.id, `/api/v2/address/${address}`);
    return {
      chain: chain.id,
      symbol: chain.symbol,
      address: info.address ?? address,
      kind: "blockbook",
      balanceNative: info.balance !== undefined ? Number(info.balance) / unit : null,
      unconfirmedNative: info.unconfirmedBalance !== undefined ? Number(info.unconfirmedBalance) / unit : null,
      totalReceivedNative: info.totalReceived !== undefined ? Number(info.totalReceived) / unit : null,
      totalSentNative: info.totalSent !== undefined ? Number(info.totalSent) / unit : null,
      txCount: info.txs ?? null,
      tokens: (info.tokens ?? [])
        .filter(t => t.symbol || t.name)
        .slice(0, 10)
        .map(t => ({ name: t.name ?? null, symbol: t.symbol ?? null, contract: t.contract ?? null, balance: t.balance ?? null })),
    };
  }

  if (chain.id === "sol" && chain.rpc) {
    const [bal, acct] = await Promise.all([
      nwn.rpc<SolBalance>(chain.id, "getBalance", [address]),
      nwn.rpc<SolAccountInfo>(chain.id, "getAccountInfo", [address, { encoding: "base64" }]).catch(() => null),
    ]);
    const lamports = bal.value ?? acct?.value?.lamports ?? null;
    return {
      chain: chain.id,
      symbol: chain.symbol,
      address,
      kind: acct?.value?.executable ? "program" : "account",
      owner: acct?.value?.owner ?? null,
      balanceLamports: lamports,
      balanceNative: lamports !== null ? lamports / unit : null,
    };
  }

  throw new Error(`chain '${chain.id}' has no address lookup endpoint`);
}

export function parseAddressQuery(search: URLSearchParams): AddressQuery {
  return {
    chain: search.get("chain") ?? "eth",
    address: search.get("address") ?? "",
  };
}
