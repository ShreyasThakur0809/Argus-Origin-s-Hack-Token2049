"use client";

import { useMemo, useState } from "react";
import { ArrowDown, CircleAlert, Play, ShieldCheck, ShieldX } from "lucide-react";
import type { Catalogue, Envelope, PaymentRequired, Sku } from "@/lib/types";
import { decodePaymentRequired, verifyEnvelope, type ProofCheck } from "@/lib/proof";
import { baseUnitsToNumber, formatBlockTime, truncateMiddle } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CopyButton, JsonBlock, Pill, SectionLabel, Spinner } from "./ui";
import {
  AddressSnapshotView,
  BridgeActivityView,
  ChainStatusView,
  FeeMarketView,
  HolderConcentrationView,
  MarketSnapshotView,
  RawRpcView,
  TrendingView,
  TxStatusView,
  WhaleFlowView,
} from "./sku-viewers";

const RPC_METHODS = [
  "eth_blockNumber", "eth_chainId", "eth_call", "eth_getLogs", "eth_getBalance",
  "eth_getCode", "eth_getTransactionByHash", "eth_getBlockByNumber", "eth_getBlockByHash",
  "eth_getTransactionReceipt", "eth_estimateGas", "eth_gasPrice", "eth_getStorageAt",
  "eth_getTransactionCount", "eth_syncing", "net_version", "net_listening", "web3_clientVersion",
  "getHealth", "getSlot", "getBlockHeight", "getBalance", "getAccountInfo", "getLatestBlockhash", "getTransaction",
];

const BRIDGE_CHAINS = ["eth", "base", "arb", "op", "matic"];

const TOKEN_PRESETS = [
  { label: "USDC · eth", value: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { label: "WETH · eth", value: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  { label: "USDT · eth", value: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  { label: "UNI · eth", value: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" },
];

const TX_PRESETS = [
  { label: "first ETH tx · eth", chain: "eth", value: "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060" },
  { label: "genesis coinbase · btc", chain: "btc", value: "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b" },
];

const ADDRESS_PRESETS = [
  { label: "vitalik.eth · eth", chain: "eth", value: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  { label: "USDC contract · eth", chain: "eth", value: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { label: "Binance hot · eth", chain: "eth", value: "0x28C6c06298d514Db089934071355E5743bf21d60" },
];

const ASSET_PRESETS = [
  { label: "majors", value: "btc,eth,sol,ada" },
  { label: "defi", value: "uni,link,avax" },
  { label: "memes", value: "doge,shib,pepe,bonk" },
  { label: "any coingecko id", value: "bitcoin,quantus" },
];

interface Run {
  ranAt: string;
  skuId: string;
  method: string;
  url: string;
  body?: unknown;
  paidStatus?: number;
  paymentRequired?: PaymentRequired | null;
  answer?: Envelope;
  verify?: ProofCheck;
  corrupt: boolean;
  error?: string;
}

const LAST_RUN_KEY = "q402:lastRun";

/* ------------------------------ form bits ------------------------------ */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-meta">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[12.5px] text-meta/80">{hint}</p>}
    </label>
  );
}

function NumInput({ value, onChange, min, max }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={e => onChange(Number(e.target.value))}
      className="field"
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="field">
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/* --------------------------- decoded 402 card --------------------------- */

/** One invoice-style row: fixed-width muted label, value directly beside it. */
function TermRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-y-0.5 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-baseline sm:gap-x-5 sm:gap-y-0">
      <span className="text-[13px] text-meta">{k}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function TermsCard({ pr }: { pr: PaymentRequired }) {
  const accept = pr.accepts?.[0];
  const extra = (accept?.extra ?? {}) as Record<string, unknown>;
  const terms = (extra.terms ?? {}) as Record<string, unknown>;
  const commitment = (extra.inputCommitment ?? {}) as { algorithm?: string; digest?: string; parts?: { content?: { url?: string } }[] };
  const isMasumi = extra.assetTransferMethod === "masumi";
  const amount = accept?.amount ?? accept?.maxAmountRequired;
  const isLovelace = (accept?.asset ?? "lovelace") === "lovelace";

  // Deadline fields arrive as epoch-milliseconds in string form.
  const asTime = (v: unknown): string => {
    const n = Number(v);
    return Number.isFinite(n) && n > 1e9 ? formatBlockTime(n < 1e12 ? n : n / 1000) : String(v ?? "");
  };

  const DEADLINE_LABELS: Record<string, string> = {
    payByTime: "pay by",
    submitResultTime: "result due",
    unlockTime: "refund unlocks",
    externalDisputeUnlockTime: "external dispute until",
  };
  const deadlineKeys = Object.keys(DEADLINE_LABELS).filter(k => k in terms);
  const identityKeys = ["paymentType", "sellerAddress", "sellerNonce", "inputHash"].filter(k => k in terms);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="blue">scheme: {accept?.scheme ?? "?"}</Pill>
        <Pill tone="blue">{accept?.network ?? "?"}</Pill>
        {isMasumi ? <Pill tone="dark">masumi escrow</Pill> : <Pill>direct payment</Pill>}
      </div>

      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <div>
          <p className="text-[13px] text-meta">price</p>
          <p className="mt-1 text-[26px] font-semibold tracking-[-0.01em] text-label">
            {baseUnitsToNumber(amount)} {isLovelace ? "tADA" : "tUSDM"}
          </p>
        </div>
        <div>
          <p className="text-[13px] text-meta">pay to</p>
          <p className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[13.5px] text-label">
            <span className="truncate">{truncateMiddle(String(accept?.payTo ?? ""), 16, 10)}</span>
            {accept?.payTo && <CopyButton text={String(accept.payTo)} />}
          </p>
          <p className="mt-1 text-[13px] text-meta">{isMasumi ? "the Masumi escrow contract, not a seller wallet" : "seller address"}</p>
        </div>
      </div>

      {commitment.digest && (
        <TermRow k={`input commitment${commitment.algorithm ? ` (${commitment.algorithm})` : ""}`}>
          <span className="flex min-w-0 items-center gap-2 font-mono text-[13px] text-label">
            <span className="truncate">{truncateMiddle(commitment.digest, 22, 14)}</span>
            <CopyButton text={commitment.digest} />
          </span>
        </TermRow>
      )}
      {commitment.parts?.[0]?.content?.url && (
        <TermRow k="binds payment to">
          <span className="break-all font-mono text-[13px] leading-relaxed text-muted">
            {commitment.parts[0].content.url}
          </span>
        </TermRow>
      )}

      {deadlineKeys.length > 0 && (
        <div className="rounded-xl bg-surface p-4">
          <p className="text-[13px] font-medium text-muted">Escrow deadlines</p>
          <div className="mt-3 space-y-2">
            {deadlineKeys.map(k => (
              <div key={k} className="grid grid-cols-1 gap-y-0.5 sm:grid-cols-[150px_1fr] sm:items-baseline sm:gap-x-4 sm:gap-y-0">
                <span className="text-[13.5px] text-muted">{DEADLINE_LABELS[k]}</span>
                <span className="font-mono text-[13.5px] text-label">{asTime(terms[k])}</span>
              </div>
            ))}
          </div>
          <p className="mt-3.5 text-[13.5px] leading-relaxed text-meta">
            Miss the result deadline and the contract refunds the buyer. No chargebacks, no support tickets.
          </p>
        </div>
      )}

      {identityKeys.length > 0 && (
        <div className="space-y-2">
          {identityKeys.map(k => (
            <TermRow key={k} k={k}>
              <span className="block truncate font-mono text-[13px] text-muted">{truncateMiddle(String(terms[k]), 24, 12)}</span>
            </TermRow>
          ))}
        </div>
      )}

      {extra.referenceSignature != null && (
        <TermRow k="seller signature">
          <span className="block truncate font-mono text-[13px] text-muted">{truncateMiddle(String(extra.referenceSignature), 24, 14)}</span>
        </TermRow>
      )}

      <details className="group">
        <summary className="cursor-pointer text-[13px] text-link group-open:mb-2">Raw PAYMENT-REQUIRED payload</summary>
        <JsonBlock value={pr} maxH="max-h-56" />
      </details>
    </div>
  );
}

/* ------------------------------ proof card ------------------------------ */

function ProofRow({ k, tone = "plain", children }: { k: string; tone?: "plain" | "green" | "red"; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-y-0.5 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-baseline sm:gap-x-5 sm:gap-y-0">
      <span className="text-[13px] text-meta">{k}</span>
      <span className={cn("block truncate font-mono text-[13px]", tone === "green" ? "text-green-deep" : tone === "red" ? "text-red-deep" : "text-label")}>
        {children}
      </span>
    </div>
  );
}

function ProofCard({ env, verify, corrupt }: { env: Envelope; verify?: ProofCheck; corrupt: boolean }) {
  const failed = verify && !verify.ok;
  return (
    <div className={cn("rounded-xl p-5", failed ? "bg-red/5 ring-1 ring-red/20" : "bg-surface")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-meta">proof envelope</p>
        {!verify && <Spinner label="verifying" />}
        {verify?.ok && (
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-green-deep">
            <ShieldCheck size={15} /> verified locally
          </span>
        )}
        {failed && (
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-red-deep">
            <ShieldX size={15} /> rejected
          </span>
        )}
      </div>
      <div className="mt-4 space-y-2">
        <ProofRow k="resultHash">{truncateMiddle(env.proof.resultHash, 24, 12)}</ProofRow>
        {verify && (
          <ProofRow k="recomputed" tone={verify.ok ? "green" : "red"}>{truncateMiddle(verify.recomputed, 24, 12)}</ProofRow>
        )}
        <ProofRow k="generatedAt">{env.proof.generatedAt}</ProofRow>
        <ProofRow k="latency · source">
          {env.proof.latencyMs}ms · {env.proof.sourceMode === "live" ? `${env.proof.source} live` : "fixture"}
        </ProofRow>
        {env.payment?.tx && <ProofRow k="settlement tx">{truncateMiddle(env.payment.tx, 18, 12)}</ProofRow>}
      </div>
      {failed && (
        <div className="mt-4 rounded-lg bg-white p-4 ring-1 ring-red/20">
          <p className="text-[14px] font-medium text-red-deep">Answer rejected by the buyer.</p>
          <ul className="mt-1.5 list-inside list-disc text-[13px] text-red-deep/90">
            {verify!.problems.map(p => <li key={p}>{p}</li>)}
          </ul>
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
            With Masumi escrow this payment is never released. The contract refunds the locked funds at unlockTime.
            {corrupt && " You are watching the corrupt=1 demo."}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- main ------------------------------- */

export function Playground({ catalogue, initialSku, initialCorrupt = false }: { catalogue: Catalogue | null; initialSku?: string; initialCorrupt?: boolean }) {
  const skus = catalogue?.skus ?? [];
  const chains = catalogue?.chains ?? [];
  const [skuId, setSkuId] = useState(initialSku && skus.some(s => s.id === initialSku) ? initialSku : "whale-flow");

  // per-SKU form state
  const [chain, setChain] = useState("btc");
  const [blocks, setBlocks] = useState(3);
  const [minNative, setMinNative] = useState(0.1);
  const [limit, setLimit] = useState(10);
  const [hChain, setHChain] = useState("eth");
  const [token, setToken] = useState(TOKEN_PRESETS[0].value);
  const [hBlocks, setHBlocks] = useState(10_000);
  const [sample, setSample] = useState(32);
  const [bChains, setBChains] = useState<string[]>(["eth", "base"]);
  const [bBlocks, setBBlocks] = useState(5_000);
  const [tChain, setTChain] = useState("eth");
  const [txid, setTxid] = useState(TX_PRESETS[0].value);
  const [fChains, setFChains] = useState<string[]>(["eth", "base", "arb"]);
  const [confTarget, setConfTarget] = useState(1);
  const [aChain, setAChain] = useState("eth");
  const [address, setAddress] = useState(ADDRESS_PRESETS[0].value);
  const [sChains, setSChains] = useState<string[]>(["eth", "base", "btc"]);
  const [rChain, setRChain] = useState("base");
  const [method, setMethod] = useState("eth_gasPrice");
  const [params, setParams] = useState("[]");
  const [assets, setAssets] = useState(ASSET_PRESETS[0].value);
  const [corrupt, setCorrupt] = useState(initialCorrupt);

  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [builderCollapsed, setBuilderCollapsed] = useState(false);

  const sku: Sku | undefined = skus.find(s => s.id === skuId);
  const chainOpts = useMemo(() => {
    const pick = (pred: (c: { blockbook: boolean; rpc: boolean; kind: string }) => boolean, ids?: string[]) =>
      chains.filter(c => pred(c) && (!ids || ids.includes(c.id))).map(c => ({ value: c.id, label: c.id }));
    return {
      blockbook: pick(c => c.blockbook),
      rpc: pick(c => c.rpc),
      evm: pick(c => c.rpc && c.kind === "evm"),
      bridge: pick(() => true, BRIDGE_CHAINS),
      any: pick(() => true),
    };
  }, [chains]);

  function buildRequest(): { method: string; url: string; body?: unknown } {
    switch (skuId) {
      case "whale-flow":
        return { method: "GET", url: `/data/whale-flow?chain=${chain}&blocks=${blocks}&minNative=${minNative}&limit=${limit}` };
      case "holder-concentration":
        return { method: "GET", url: `/data/holder-concentration?chain=${hChain}&token=${token}&blocks=${hBlocks}&sample=${sample}` };
      case "bridge-activity":
        return { method: "GET", url: `/data/bridge-activity?chains=${bChains.join(",")}&blocks=${bBlocks}` };
      case "tx-status":
        return { method: "GET", url: `/data/tx-status?chain=${tChain}&txid=${txid}` };
      case "fee-market":
        return { method: "GET", url: `/data/fee-market?chains=${fChains.join(",")}&confTarget=${confTarget}` };
      case "address-snapshot":
        return { method: "GET", url: `/data/address-snapshot?chain=${aChain}&address=${address}` };
      case "chain-status":
        return { method: "GET", url: `/data/chain-status?chains=${sChains.join(",")}` };
      case "raw-rpc": {
        let parsed: unknown[] = [];
        try { parsed = JSON.parse(params || "[]"); } catch { /* validation shows below */ }
        return { method: "POST", url: `/rpc/${rChain}`, body: { method, params: Array.isArray(parsed) ? parsed : [] } };
      }
      case "market-snapshot":
        return { method: "GET", url: `/data/market-snapshot?assets=${encodeURIComponent(assets)}` };
      case "trending":
        return { method: "GET", url: "/data/trending" };
      default:
        return { method: "GET", url: "/" };
    }
  }

  async function callApi(method: string, url: string, body?: unknown) {
    return fetch(`/api/q402${url}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  }

  async function execute() {
    setRunning(true);
    const req = buildRequest();
    const next: Run = {
      ranAt: new Date().toISOString(), skuId, method: req.method, url: req.url, body: req.body, corrupt,
    };
    setRun(next);
    try {
      // 1. The real route: expect a 402 with signed escrow terms.
      const paid = await callApi(req.method, req.url, req.body);
      next.paidStatus = paid.status;
      if (paid.status === 402) {
        next.paymentRequired = (decodePaymentRequired(paid.headers.get("payment-required")) as PaymentRequired | null) ?? null;
        setRun({ ...next });
      }

      // 2. The answer: dev mirror when the real route is behind payment;
      //    reuse the paid response when the server is in DEV_BYPASS open mode.
      if (paid.status === 200 && !corrupt) {
        next.answer = (await paid.json()) as Envelope;
      } else {
        const [devPath, devQuery = ""] = req.url.split("?");
        const qs = [devQuery, corrupt ? "corrupt=1" : ""].filter(Boolean).join("&");
        const res = await callApi(req.method, `/dev${devPath}${qs ? `?${qs}` : ""}`, req.body);
        if (res.status === 200) {
          next.answer = (await res.json()) as Envelope;
        } else if (res.status === 404 && paid.status === 200) {
          // No dev mirror (DEV_BYPASS off): fall back to the paid response.
          next.answer = (await paid.json()) as Envelope;
        } else {
          const text = await res.text();
          next.error = res.status === 400
            ? `rejected before payment: ${text.slice(0, 160)}`
            : `demo fetch failed: HTTP ${res.status} ${text.slice(0, 160)}`;
        }
      }

      // 3. Verify the proof envelope client-side, same check the agent runs.
      if (next.answer) {
        next.verify = await verifyEnvelope(next.answer);
      }
      if (!next.answer && !next.error && paid.status >= 400 && paid.status !== 402) {
        const text = await paid.clone().text().catch(() => "");
        next.error = `api returned HTTP ${paid.status} ${text.slice(0, 160)}`;
      }
    } catch (error) {
      next.error = error instanceof Error ? error.message : String(error);
    }
    setRun({ ...next });
    try { localStorage.setItem(LAST_RUN_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    setBuilderCollapsed(true);
    setRunning(false);
  }

  const devUrl = (() => {
    if (!run) return "";
    const [p, q = ""] = run.url.split("?");
    return `/dev${p}${q ? `?${q}` : ""}`;
  })();

  return (
    <div className="mx-auto max-w-4xl">
      {/* ---------------------------- builder ---------------------------- */}
      {run && builderCollapsed ? (
        <button
          type="button"
          onClick={() => setBuilderCollapsed(false)}
          className="sticky top-24 z-30 flex w-full items-center gap-3 rounded-2xl bg-white/90 px-5 py-3.5 text-left shadow-[var(--shadow-card)] ring-1 ring-sep-soft backdrop-blur-xl"
        >
          <Play size={14} className="shrink-0 text-blue" />
          <span className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-label">
            {run.method} {run.url}{run.corrupt ? `${run.url.includes("?") ? "&" : "?"}corrupt=1` : ""}
          </span>
          <span className="shrink-0 text-[13px] font-medium text-link">edit request</span>
        </button>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)]">
          {/* sku picker */}
          <div className="grid grid-cols-2 gap-1 border-b border-sep-soft bg-surface/60 p-1.5 sm:grid-cols-4">
            {skus.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSkuId(s.id)}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-left transition-all",
                  skuId === s.id ? "bg-white shadow-[var(--shadow-card)]" : "hover:bg-white/60",
                )}
              >
                <p className="text-[14px] font-medium text-label">{s.id}</p>
                <p className="mt-0.5 font-mono text-[12.5px] text-meta">
                  {s.price ? `${baseUnitsToNumber(s.price.amount)} ${s.assetLabel}` : ""}
                </p>
              </button>
            ))}
          </div>

          <div className="p-5 sm:p-6">
            {skuId === "whale-flow" && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Chain" hint="blockbook only">
                  <Select value={chain} onChange={setChain} options={chainOpts.blockbook.length ? chainOpts.blockbook : [{ value: "btc", label: "btc" }]} />
                </Field>
                <Field label="Blocks"><NumInput value={blocks} onChange={setBlocks} min={1} max={25} /></Field>
                <Field label="Min native"><NumInput value={minNative} onChange={setMinNative} min={0} /></Field>
                <Field label="Limit"><NumInput value={limit} onChange={setLimit} min={1} max={100} /></Field>
              </div>
            )}

            {skuId === "holder-concentration" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Field label="Chain" hint="evm + rpc">
                    <Select value={hChain} onChange={setHChain} options={chainOpts.evm.length ? chainOpts.evm : [{ value: "eth", label: "eth" }]} />
                  </Field>
                  <Field label="Sample"><NumInput value={sample} onChange={setSample} min={5} max={64} /></Field>
                  <Field label="Blocks"><NumInput value={hBlocks} onChange={setHBlocks} min={100} max={100000} /></Field>
                </div>
                <Field label="Token contract" hint="ERC20 address">
                  <input className="field font-mono" value={token} onChange={e => setToken(e.target.value)} spellCheck={false} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {TOKEN_PRESETS.map(p => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setToken(p.value)}
                        className={cn("rounded-full px-3.5 py-1.5 text-[13px] transition-colors", token === p.value ? "bg-blue-tint text-link" : "bg-surface text-muted hover:text-label")}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            )}

            {skuId === "bridge-activity" && (
              <div className="space-y-4">
                <Field label="Chains" hint="chains with tracked bridge contracts, max 5">
                  <div className="flex flex-wrap gap-1.5">
                    {BRIDGE_CHAINS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setBChains(cs => (cs.includes(c) ? cs.filter(x => x !== c) : cs.length < 5 ? [...cs, c] : cs))}
                        className={cn("rounded-full px-3.5 py-1.5 text-[13px] transition-colors", bChains.includes(c) ? "bg-blue-tint text-link" : "bg-surface text-muted hover:text-label")}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="sm:max-w-[200px]"><Field label="Blocks"><NumInput value={bBlocks} onChange={setBBlocks} min={100} max={50000} /></Field></div>
              </div>
            )}

            {skuId === "tx-status" && (
              <div className="space-y-4">
                <Field label="Chain">
                  <Select value={tChain} onChange={setTChain} options={chainOpts.any.length ? chainOpts.any : [{ value: "eth", label: "eth" }]} />
                </Field>
                <Field label="Transaction hash" hint="64-char hex on EVM and UTXO chains, base58 signature on sol">
                  <input className="field font-mono" value={txid} onChange={e => setTxid(e.target.value)} spellCheck={false} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {TX_PRESETS.map(p => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => { setTChain(p.chain); setTxid(p.value); }}
                        className={cn("rounded-full px-3.5 py-1.5 text-[13px] transition-colors", txid === p.value ? "bg-blue-tint text-link" : "bg-surface text-muted hover:text-label")}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            )}

            {skuId === "fee-market" && (
              <div className="space-y-4">
                <Field label="Chains" hint="compare the cost of transacting right now, max 8">
                  <div className="flex flex-wrap gap-1.5">
                    {chains.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setFChains(cs => (cs.includes(c.id) ? cs.filter(x => x !== c.id) : cs.length < 8 ? [...cs, c.id] : cs))}
                        className={cn("rounded-full px-3.5 py-1.5 text-[13px] transition-colors", fChains.includes(c.id) ? "bg-blue-tint text-link" : "bg-surface text-muted hover:text-label")}
                      >
                        {c.id}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="sm:max-w-[240px]">
                  <Field label="Confirmation target" hint="blocks, used for UTXO estimatefee">
                    <NumInput value={confTarget} onChange={setConfTarget} min={1} max={25} />
                  </Field>
                </div>
              </div>
            )}

            {skuId === "address-snapshot" && (
              <div className="space-y-4">
                <Field label="Chain">
                  <Select value={aChain} onChange={setAChain} options={chainOpts.any.length ? chainOpts.any : [{ value: "eth", label: "eth" }]} />
                </Field>
                <Field label="Address" hint="0x address on EVM, native address elsewhere">
                  <input className="field font-mono" value={address} onChange={e => setAddress(e.target.value)} spellCheck={false} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ADDRESS_PRESETS.map(p => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => { setAChain(p.chain); setAddress(p.value); }}
                        className={cn("rounded-full px-3.5 py-1.5 text-[13px] transition-colors", address === p.value ? "bg-blue-tint text-link" : "bg-surface text-muted hover:text-label")}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            )}

            {skuId === "chain-status" && (
              <div className="space-y-4">
                <Field label="Chains" hint="liveness check across chains, max 8">
                  <div className="flex flex-wrap gap-1.5">
                    {chains.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSChains(cs => (cs.includes(c.id) ? cs.filter(x => x !== c.id) : cs.length < 8 ? [...cs, c.id] : cs))}
                        className={cn("rounded-full px-3.5 py-1.5 text-[13px] transition-colors", sChains.includes(c.id) ? "bg-blue-tint text-link" : "bg-surface text-muted hover:text-label")}
                      >
                        {c.id}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            )}

            {skuId === "raw-rpc" && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Chain"><Select value={rChain} onChange={setRChain} options={chainOpts.rpc.length ? chainOpts.rpc : [{ value: "base", label: "base" }]} /></Field>
                  <Field label="Method"><Select value={method} onChange={setMethod} options={RPC_METHODS.map(m => ({ value: m, label: m }))} /></Field>
                </div>
                <Field label="Params" hint='JSON array, e.g. ["latest", false]'>
                  <textarea className="field h-16 resize-y font-mono" value={params} onChange={e => setParams(e.target.value)} spellCheck={false} />
                </Field>
              </div>
            )}

            {skuId === "market-snapshot" && (
              <div className="space-y-4">
                <Field label="Assets" hint="symbols or CoinGecko ids, comma separated — any tracked asset, not just node-backed chains">
                  <input className="field font-mono" value={assets} onChange={e => setAssets(e.target.value)} spellCheck={false} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ASSET_PRESETS.map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setAssets(p.value)}
                        className={cn("rounded-full px-3.5 py-1.5 text-[13px] transition-colors", assets === p.value ? "bg-blue-tint text-link" : "bg-surface text-muted hover:text-label")}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            )}

            {skuId === "trending" && (
              <p className="text-[13px] leading-relaxed text-meta">
                No parameters — returns the CoinGecko trending list right now: rank, price, 24h move.
              </p>
            )}
          </div>

          {/* actions */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-sep-soft px-5 py-4 sm:px-6">
            <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors", corrupt ? "bg-red/5 text-red-deep ring-1 ring-red/25" : "bg-surface text-muted hover:text-label")}>
              <input type="checkbox" checked={corrupt} onChange={e => setCorrupt(e.target.checked)} className="h-4 w-4 accent-blue" />
              Simulate a dishonest seller
            </label>
            {corrupt && <span className="text-[12.5px] text-red-deep/80">serves a wrong proof hash; the buyer refuses to pay</span>}
            <div className="ml-auto flex items-center gap-3">
              {!catalogue && <span className="text-[13px] font-medium text-red-deep">api offline</span>}
              <button
                type="button"
                onClick={execute}
                disabled={running || !catalogue}
                className="flex items-center gap-2 rounded-full bg-blue px-6 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-blue-hover disabled:opacity-50"
              >
                {running ? <Spinner label="running" /> : <><Play size={15} /> Send as an agent would</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------- trace ------------------------------ */}
      <div className="mt-8 min-w-0">
        {!run && (
          <div className="flex h-full min-h-72 items-center justify-center rounded-3xl bg-surface text-center">
            <div>
              <p className="font-display text-[26px] font-semibold tracking-[-0.01em] text-muted">Nothing sent yet</p>
              <p className="mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-muted">
                Build a request above and send it. Below you'll see exactly what an agent sees:
                the 402, the escrow terms, the answer, the proof.
              </p>
            </div>
          </div>
        )}

        {run && (
          <div className="space-y-0">
            {/* step 1: request */}
            <TraceStep n={1} title="Request">
              <div className="flex items-center justify-between gap-3">
                <code className="scroll-thin overflow-x-auto whitespace-nowrap font-mono text-[13px] text-label">
                  {run.method} {run.url}{run.corrupt ? `${run.url.includes("?") ? "&" : "?"}corrupt=1` : ""}
                </code>
                <CopyButton text={`${run.method} ${run.url}${run.body ? ` ${JSON.stringify(run.body)}` : ""}`} />
              </div>
              {run.body != null && <JsonBlock value={run.body} maxH="max-h-24" className="mt-2" />}
            </TraceStep>

            {/* step 2: the 402 */}
            <TraceArrow />
            <TraceStep
              n={2}
              title={run.paidStatus === undefined ? "Awaiting response" : run.paidStatus === 402 ? "402 payment required" : run.paidStatus === 200 ? "Served without payment" : `HTTP ${run.paidStatus}`}
              accent={run.paidStatus === 402 ? "blue" : run.paidStatus !== undefined && run.paidStatus >= 400 ? "red" : "none"}
            >
              {run.paidStatus === 402 && run.paymentRequired ? (
                <TermsCard pr={run.paymentRequired} />
              ) : run.paidStatus === 402 ? (
                <p className="text-[14px] text-muted">402 received but the PAYMENT-REQUIRED header was not decodable.</p>
              ) : run.paidStatus === 200 ? (
                <p className="text-[14px] leading-relaxed text-muted">
                  The API answered without a 402: it is running in DEV_BYPASS open mode (facilitator offline).
                  With the facilitator up, this exact request returns escrow terms instead.
                </p>
              ) : run.paidStatus !== undefined ? (
                <p className="text-[14px] leading-relaxed text-muted">
                  HTTP {run.paidStatus} before any payment. Argument validation runs before the 402 dance,
                  so a malformed request never costs the buyer anything.
                </p>
              ) : (
                <Spinner label="requesting" />
              )}
            </TraceStep>

            {/* step 3: answer + proof */}
            <TraceArrow />
            <TraceStep n={3} title="Answer + proof">
              {!run.answer && !run.error && <Spinner label="fetching answer" />}
              {run.error && (
                <div className="flex items-start gap-2 text-[14px] text-red-deep">
                  <CircleAlert size={16} className="mt-0.5 shrink-0" />
                  <span>{run.error}</span>
                </div>
              )}
              {run.answer && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="dark">{run.answer.sku}</Pill>
                    <Pill tone={run.answer.proof.sourceMode === "live" ? "green" : "gray"}>
                      {run.answer.proof.sourceMode === "live" ? `${run.answer.proof.source} live` : "fixture"}
                    </Pill>
                    <span className="font-mono text-[12.5px] text-meta">via {devUrl}</span>
                  </div>
                  <ProofCard env={run.answer} verify={run.verify} corrupt={run.corrupt} />
                  <div>
                    <SectionLabel>Data</SectionLabel>
                    <div className="mt-3">
                      <SkuDataView env={run.answer} />
                    </div>
                  </div>
                  <details className="group">
                    <summary className="cursor-pointer text-[13.5px] text-link group-open:mb-2">Full envelope</summary>
                    <JsonBlock value={run.answer} maxH="max-h-72" />
                  </details>
                </div>
              )}
            </TraceStep>

            {/* verdict */}
            {run.verify && (
              <>
                <TraceArrow />
                <div className={cn("rounded-2xl bg-white p-5 shadow-[var(--shadow-card)] ring-1", run.verify.ok ? "ring-green/30" : "ring-red/30")}>
                  <div className="flex items-center gap-2.5">
                    {run.verify.ok ? (
                      <ShieldCheck size={18} className="text-green-deep" />
                    ) : (
                      <ShieldX size={18} className="text-red-deep" />
                    )}
                    <p className={cn("text-[16px] font-semibold", run.verify.ok ? "text-green-deep" : "text-red-deep")}>
                      {run.verify.ok ? "Answer verified. The seller gets paid." : "Answer rejected. The buyer does not pay."}
                    </p>
                  </div>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                    {run.verify.ok
                      ? "The recomputed hash matches the proof. In the live loop, the escrow releases the locked funds to the seller."
                      : "The served hash does not match the answer. The locked funds stay in the Masumi contract and refund automatically at unlockTime. No chargeback needed."}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TraceStep({ n, title, children, accent = "none" }: { n: number; title: string; children: React.ReactNode; accent?: "none" | "blue" | "red" }) {
  return (
    <div className={cn("rounded-2xl bg-white shadow-[var(--shadow-card)]", accent === "blue" && "ring-1 ring-blue/30", accent === "red" && "ring-1 ring-red/30")}>
      <div className="flex items-center gap-3 border-b border-sep-soft px-6 py-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[13px] font-semibold text-muted">{n}</span>
        <span className="text-[14px] font-medium text-label">{title}</span>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function TraceArrow() {
  return (
    <div className="flex justify-center py-1.5">
      <ArrowDown size={14} className="text-sep" />
    </div>
  );
}

function SkuDataView({ env }: { env: Envelope }) {
  switch (env.sku) {
    case "whale-flow":
      return <WhaleFlowView data={env.data as never} />;
    case "holder-concentration":
      return <HolderConcentrationView data={env.data as never} />;
    case "bridge-activity":
      return <BridgeActivityView data={env.data as never} />;
    case "tx-status":
      return <TxStatusView data={env.data as never} />;
    case "fee-market":
      return <FeeMarketView data={env.data as never} />;
    case "address-snapshot":
      return <AddressSnapshotView data={env.data as never} />;
    case "chain-status":
      return <ChainStatusView data={env.data as never} />;
    case "raw-rpc":
      return <RawRpcView data={env.data as never} />;
    case "market-snapshot":
      return <MarketSnapshotView data={env.data as never} />;
    case "trending":
      return <TrendingView data={env.data as never} />;
    default:
      return <JsonBlock value={env.data} />;
  }
}
