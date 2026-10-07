import { resolveChain, type ChainInfo } from "./chains.js";

/**
 * Thin NOWNodes client. Two transports:
 *  - blockbook REST: https://{chain}-blockbook.nownodes.io/api/v2/* with `api-key` header
 *  - JSON-RPC:       https://{chain}.nownodes.io/{api-key} POST
 *
 * With no API key the client runs in fixture mode: deterministic canned
 * responses so the whole x402 loop can be developed and demoed offline.
 */
export class NownodesError extends Error {
  constructor(
    message: string,
    readonly chain: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class NownodesClient {
  readonly live: boolean;

  constructor(private apiKey = process.env.NOWNODES_API_KEY?.trim() ?? "") {
    this.live = apiKey.length > 0;
    if (!this.live) {
      console.warn("[nownodes] NOWNODES_API_KEY not set — fixture mode (canned data)");
    }
  }

  private chain(id: string, need: "blockbook" | "rpc"): ChainInfo & { blockbook: string } {
    const info = resolveChain(id);
    if (!info) throw new NownodesError(`unknown chain '${id}'`, id);
    if (!info[need]) throw new NownodesError(`chain '${id}' has no ${need} endpoint`, id);
    return info as ChainInfo & { blockbook: string };
  }

  /** Free-tier NOWNodes rate limits are tight — retry 429/5xx with backoff. */
  private async request<T>(fn: () => Promise<T>, what: string, chainId: string): Promise<T> {
    let delay = 800;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const status = error instanceof NownodesError ? error.status : undefined;
        const retryable = status === 429 || (status !== undefined && status >= 500);
        if (!retryable || attempt === 5) throw error;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
    throw new NownodesError(`unreachable: ${what}`, chainId);
  }

  async blockbook<T = unknown>(chainId: string, path: string): Promise<T> {
    if (!this.live) return fixtureBlockbook<T>(chainId, path);
    const info = this.chain(chainId, "blockbook");
    return this.request(async () => {
      const res = await fetch(`${info.blockbook}${path}`, {
        headers: { "api-key": this.apiKey },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new NownodesError(`blockbook ${path} -> HTTP ${res.status} ${text.slice(0, 120)}`, chainId, res.status);
      }
      return (await res.json()) as T;
    }, `blockbook ${path}`, chainId);
  }

  async rpc<T = unknown>(chainId: string, method: string, params: unknown[] = []): Promise<T> {
    if (!this.live) return fixtureRpc<T>(chainId, method, params);
    const info = this.chain(chainId, "rpc");
    return this.request(async () => {
      const res = await fetch(`${info.rpc}/${this.apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new NownodesError(`rpc ${method} -> HTTP ${res.status}`, chainId, res.status);
      const body = (await res.json()) as { result?: T; error?: { message?: string } };
      if (body.error) throw new NownodesError(`rpc ${method} -> ${body.error.message ?? "rpc error"}`, chainId);
      return body.result as T;
    }, `rpc ${method}`, chainId);
  }

  /** Latest confirmed tip, from whichever transport the chain supports. */
  async tip(chainId: string): Promise<number> {
    const info = resolveChain(chainId);
    if (!info) throw new NownodesError(`unknown chain '${chainId}'`, chainId);
    if (info.blockbook) {
      const status = await this.blockbook<{ blockbook?: { bestHeight?: number }; backend?: { blocks?: number } }>(chainId, "/api/status");
      const tip = status.blockbook?.bestHeight ?? status.backend?.blocks;
      if (typeof tip === "number") return tip;
    }
    if (info.kind === "evm" && info.rpc) {
      const hex = await this.rpc<string>(chainId, "eth_blockNumber");
      return Number.parseInt(hex, 16);
    }
    throw new NownodesError(`cannot determine tip for '${chainId}'`, chainId);
  }
}

/* ------------------------------------------------------------------ */
/* Fixture mode                                                        */
/* ------------------------------------------------------------------ */

const FIXTURE_TIP = 23_500_000;

function fixtureBlockbook<T>(chainId: string, path: string): T {
  if (path === "/api/status") {
    return { blockbook: { bestHeight: FIXTURE_TIP }, backend: { blocks: FIXTURE_TIP } } as T;
  }
  const blockMatch = /\/api\/v2\/block\/(\d+)/.exec(path);
  if (blockMatch) {
    const height = Number(blockMatch[1]);
    const unit = 10n ** BigInt(resolveChain(chainId)?.decimals ?? 8);
    const v = (native: bigint) => (native * unit).toString();
    return {
      height,
      hash: `0xfixture${height.toString(16)}`,
      time: Math.floor(Date.now() / 1000) - 25,
      txCount: 3,
      txs: [
        {
          txid: `0xwhale${height}a`,
          vin: [{ addresses: ["1FixtureWhaleA"], value: v(80n), isAddress: true }],
          vout: [{ addresses: ["1FixtureDestA"], value: v(80n), isAddress: true }],
          value: v(80n),
          fees: v(0n),
          blockHeight: height,
        },
        {
          txid: `0xwhale${height}b`,
          vin: [{ addresses: ["1FixtureWhaleB"], value: v(250n), isAddress: true }],
          vout: [{ addresses: ["1FixtureDestB"], value: v(250n), isAddress: true }],
          value: v(250n),
          fees: v(0n),
          blockHeight: height,
        },
        {
          txid: `0xdust${height}`,
          vin: [{ addresses: ["1FixtureDust"], value: "1", isAddress: true }],
          vout: [{ addresses: ["1FixtureDustDest"], value: "1", isAddress: true }],
          value: "1",
          fees: "1",
          blockHeight: height,
        },
      ],
    } as T;
  }
  if (path.startsWith("/api/v2/tickers") || path.startsWith("/api/v2/fiatrates")) {
    return { rates: { usd: 2500 } } as T;
  }
  const feeMatch = /\/api\/v2\/estimatefee\/(\d+)/.exec(path);
  if (feeMatch) {
    return { result: "0.00002341" } as T;
  }
  const txMatch = /\/api\/v2\/tx\/([0-9a-fA-Fx]+)/.exec(path);
  if (txMatch) {
    const unit = 10n ** BigInt(resolveChain(chainId)?.decimals ?? 8);
    return {
      txid: txMatch[1],
      blockHeight: FIXTURE_TIP - 12,
      confirmations: 13,
      blockTime: Math.floor(Date.now() / 1000) - 130,
      value: (80n * unit).toString(),
      fees: (unit / 1000n).toString(),
      vin: [{ addresses: ["1FixtureSender"], isAddress: true }],
      vout: [{ addresses: ["1FixtureDest"], isAddress: true }],
    } as T;
  }
  const addrMatch = /\/api\/v2\/address\/(.+)/.exec(path);
  if (addrMatch) {
    return {
      address: addrMatch[1],
      balance: "42000000000",
      unconfirmedBalance: "0",
      totalReceived: "98000000000",
      totalSent: "56000000000",
      txs: 42,
      nonTokenTxs: 42,
      tokens: [],
    } as T;
  }
  throw new NownodesError(`no fixture for blockbook ${path}`, chainId);
}

function fixtureRpc<T>(chainId: string, method: string, params: unknown[]): T {
  switch (method) {
    case "eth_blockNumber":
      return `0x${FIXTURE_TIP.toString(16)}` as T;
    case "eth_chainId":
      return "0x1" as T;
    case "eth_gasPrice":
      return "0x3b9aca00" as T;
    case "net_version":
      return "1" as T;
    case "eth_getLogs": {
      // One fake Transfer log per call is enough for fixture-mode concentration.
      const filter = (params[0] ?? {}) as { address?: string };
      return [
        {
          address: filter.address ?? "0xtoken",
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "0x000000000000000000000000111111111111111111111111111111111111aaaa",
            "0x000000000000000000000000222222222222222222222222222222222222bbbb",
          ],
          data: "0x0000000000000000000000000000000000000000000000a8c0d9f5c6b7e8f9a0",
          transactionHash: "0xfixturetransfer1",
          blockNumber: `0x${FIXTURE_TIP.toString(16)}`,
        },
      ] as T;
    }
    case "eth_getTransactionReceipt": {
      const txid = String(params[0] ?? "0xfixture");
      return {
        transactionHash: txid,
        status: "0x1",
        blockNumber: `0x${(FIXTURE_TIP - 12).toString(16)}`,
        gasUsed: "0x5208",
        from: "0x111111111111111111111111111111111111aaaa",
        to: "0x222222222222222222222222222222222222bbbb",
        contractAddress: null,
      } as T;
    }
    case "eth_getBalance":
      return `0x${(42n * 10n ** 18n).toString(16)}` as T;
    case "eth_getTransactionCount":
      return "0x2a" as T;
    case "eth_getCode":
      return "0x" as T;
    case "eth_getBlockByNumber":
      return {
        number: `0x${FIXTURE_TIP.toString(16)}`,
        hash: `0xfixture${FIXTURE_TIP.toString(16)}`,
        timestamp: `0x${Math.floor(Date.now() / 1000 - 9).toString(16)}`,
        gasUsed: "0xb2d05e",
        transactions: [],
      } as T;
    case "getBlockHeight":
      return FIXTURE_TIP as T;
    case "getBalance":
      return { context: { slot: FIXTURE_TIP }, value: 4_200_000_000 } as T;
    case "getAccountInfo":
      return {
        context: { slot: FIXTURE_TIP },
        value: { executable: false, lamports: 4_200_000_000, owner: "11111111111111111111111111111111" },
      } as T;
    case "getTransaction":
      return {
        slot: FIXTURE_TIP - 40,
        blockTime: Math.floor(Date.now() / 1000) - 18,
        meta: { err: null, fee: 5000 },
        transaction: { message: { accountKeys: ["FixtureSolAcct"] }, signatures: params[0] ? [params[0]] : [] },
      } as T;
    case "eth_call": {
      const data = ((params[0] ?? {}) as { data?: string }).data ?? "";
      // balanceOf -> large balance; totalSupply -> 1e9 units; decimals -> 18
      if (data.startsWith("0x70a08231")) {
        return "0x000000000000000000000000000000000000000000000ad204d4f43000000000" as T;
      }
      if (data.startsWith("0x18160ddd")) {
        return "0x000000000000000000000000000000000000000000014d1120d7b16000000000" as T;
      }
      if (data.startsWith("0x313ce567")) {
        return "0x0000000000000000000000000000000000000000000000000000000000000012" as T;
      }
      return "0x" as T;
    }
    default:
      throw new NownodesError(`no fixture for rpc ${method}`, chainId);
  }
}
