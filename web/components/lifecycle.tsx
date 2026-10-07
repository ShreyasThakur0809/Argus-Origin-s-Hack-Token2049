"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck, ShieldX } from "lucide-react";
import type { Envelope, PaymentRequired } from "@/lib/types";
import type { ProofCheck } from "@/lib/proof";
import { baseUnitsToNumber, formatBlockTime, timeAgo, truncateMiddle } from "@/lib/format";
import { EXPLORER_TX } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Card, JsonBlock, Pill } from "./ui";

interface StoredRun {
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
}

const LAST_RUN_KEY = "q402:lastRun";

function Step({
  n, title, desc, children, live, last,
}: {
  n: number;
  title: string;
  desc: string;
  children?: React.ReactNode;
  live?: boolean;
  last?: boolean;
}) {
  return (
    <div className="relative grid gap-5 sm:grid-cols-[260px_1fr] sm:gap-10">
      <div className="flex gap-4">
        <div className="flex flex-col items-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-[13px] font-semibold text-label">
            {n}
          </span>
          {!last && <span className="mt-2 w-px flex-1 bg-sep-soft" />}
        </div>
        <div className="pb-10">
          <p className="text-[16px] font-medium tracking-[-0.01em] text-label">{title}</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{desc}</p>
          {live && <span className="mt-2.5 inline-flex"><Pill tone="green">your run</Pill></span>}
        </div>
      </div>
      <div className="pb-10">{children}</div>
    </div>
  );
}

function KV({ k, v, mono = true }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-y-0.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-baseline sm:gap-x-5 sm:gap-y-0">
      <span className="text-[13px] text-meta">{k}</span>
      <span className={cn("truncate text-[13.5px] text-label", mono && "font-mono")}>{v}</span>
    </div>
  );
}

export function LifecycleBoard() {
  const [run, setRun] = useState<StoredRun | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_RUN_KEY);
      if (raw) setRun(JSON.parse(raw) as StoredRun);
    } catch { /* no stored run */ }
  }, []);

  const accept = run?.paymentRequired?.accepts?.[0];
  const extra = (accept?.extra ?? {}) as Record<string, unknown>;
  const terms = (extra.terms ?? {}) as Record<string, unknown>;
  const commitment = (extra.inputCommitment ?? {}) as { digest?: string };
  const tx = run?.answer?.payment?.tx;

  // Deadline values are epoch-ms strings in the real payload.
  const asTime = (v: unknown): string => {
    const n = Number(v);
    return Number.isFinite(n) && n > 1e9 ? formatBlockTime(n < 1e12 ? n : n / 1000) : String(v);
  };

  return (
    <div className="mt-12">
      {!run ? (
        <div className="mb-10 flex items-center justify-between gap-4 rounded-2xl bg-surface p-5">
          <p className="text-[14.5px] text-muted">
            No playground run yet. The steps below show annotated examples.
          </p>
          <Link href="/playground" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-blue-hover">
            Run one <ArrowRight size={13} />
          </Link>
        </div>
      ) : (
        <p className="mb-10 text-[13px] text-muted">
          Hydrated from your playground run · <span className="font-mono">{run.skuId}</span> · {timeAgo(run.ranAt)}
        </p>
      )}

      {/* 1 ------------------------------------------------------------ */}
      <Step
        n={1}
        title="The agent asks"
        desc="A plain HTTP request. No account, no API key, no auth headers: the request itself is the identity."
        live={!!run}
      >
        <Card className="p-5">
          <code className="font-mono text-[13.5px] text-label">
            {run ? `${run.method} ${run.url}` : "GET /data/whale-flow?chain=btc&blocks=3&minNative=0.1"}
          </code>
          {run?.body != null && <JsonBlock value={run.body} maxH="max-h-24" className="mt-2" />}
        </Card>
      </Step>

      {/* 2 ------------------------------------------------------------ */}
      <Step
        n={2}
        title="402 answers with a signed SLA"
        desc="Argus replies HTTP 402. Inside the PAYMENT-REQUIRED header: price, the escrow contract address, an input commitment binding payment to this question, deadline schedule, and the seller's signature over all of it."
        live={!!run?.paymentRequired}
      >
        <Card className="p-5">
          {accept ? (
            <div className="space-y-1.5">
              <KV k="scheme / network" v={`${accept.scheme} · ${accept.network}`} />
              <KV k="price" v={`${baseUnitsToNumber(accept.amount ?? accept.maxAmountRequired)} ${(accept.asset ?? "lovelace") === "lovelace" ? "tADA" : "tUSDM"}`} />
              <KV k="payTo" v={truncateMiddle(String(accept.payTo ?? ""), 16, 10)} />
              {commitment.digest && <KV k="inputCommitment" v={truncateMiddle(commitment.digest, 18, 10)} />}
              {["payByTime", "submitResultTime", "unlockTime", "externalDisputeUnlockTime"].filter(k => k in terms).map(k => (
                <KV key={k} k={k} v={asTime(terms[k])} />
              ))}
              {extra.referenceSignature != null && <KV k="referenceSignature" v={truncateMiddle(String(extra.referenceSignature), 16, 12)} />}
            </div>
          ) : (
            <div className="space-y-1.5 opacity-60">
              <KV k="scheme / network" v="exact · cardano:preprod" />
              <KV k="price" v="1.5 tADA" />
              <KV k="payTo" v="addr_test1...masumi-escrow..." />
              <KV k="inputCommitment" v="sha256:<question>" />
              <KV k="terms" v="payBy · submitResult · unlock · dispute" />
              <KV k="referenceSignature" v="seller ed25519 sig" />
            </div>
          )}
        </Card>
      </Step>

      {/* 3 ------------------------------------------------------------ */}
      <Step
        n={3}
        title="The wallet locks funds in escrow"
        desc="The buyer's Cardano signer builds a transaction paying the Masumi contract with a job datum. The agent signs it locally and never broadcasts it itself. Keys never leave the agent process."
      >
        <Card className="p-5">
          <p className="text-[14px] leading-relaxed text-muted">
            eUTxO detail most demos skip: the next payment spends this payment's change output, so an agent
            serializes purchases and waits for confirmation before spending again. Deterministic, no nonce
            contention, no token approvals.
          </p>
        </Card>
      </Step>

      {/* 4 ------------------------------------------------------------ */}
      <Step
        n={4}
        title="Retry with payment attached"
        desc="The identical request goes back out, now carrying the signed transaction in the PAYMENT-SIGNATURE header."
      >
        <Card className="p-5">
          <div className="space-y-1.5">
            <KV k="request" v={run ? `${run.method} ${run.url}` : "GET /data/whale-flow?..."} />
            <KV k="header" v="PAYMENT-SIGNATURE: <signed tx, base64>" />
          </div>
        </Card>
      </Step>

      {/* 5 ------------------------------------------------------------ */}
      <Step
        n={5}
        title="Facilitator verifies, then settles"
        desc="Argus forwards the payment to the facilitator, which validates the signature and submits to Cardano preprod. Funds sit in the escrow contract, not with the seller."
        live={!!tx}
      >
        <Card className="p-5">
          {tx ? (
            <a href={EXPLORER_TX(tx)} target="_blank" rel="noreferrer" className="group flex items-center justify-between gap-3">
              <span className="font-mono text-[13px] text-label">{truncateMiddle(tx, 18, 12)}</span>
              <span className="text-[13px] text-link group-hover:underline">cardanoscan ↗</span>
            </a>
          ) : (
            <p className="font-mono text-[12.5px] leading-relaxed text-muted">
              verified run receipts: <span className="text-label">e4789344...fae3fcf75</span> (whale flow),{" "}
              <span className="text-label">01f071a4...fe91df7</span> (raw rpc)
            </p>
          )}
        </Card>
      </Step>

      {/* 6 ------------------------------------------------------------ */}
      <Step
        n={6}
        title="Answer arrives with a proof"
        desc="The data comes back inside a proof envelope: sha256 of the exact answer, generation time, upstream latency, and which source served it."
        live={!!run?.answer}
      >
        <Card className="p-5">
          {run?.answer ? (
            <div className="space-y-1.5">
              <KV k="sku" v={run.answer.sku} />
              <KV k="resultHash" v={truncateMiddle(run.answer.proof.resultHash, 22, 12)} />
              <KV k="generatedAt" v={run.answer.proof.generatedAt} />
              <KV k="latency" v={`${run.answer.proof.latencyMs}ms`} />
              <KV k="source" v={run.answer.proof.sourceMode === "live" ? `${run.answer.proof.source} live` : "fixture"} />
            </div>
          ) : (
            <div className="space-y-1.5 opacity-60">
              <KV k="sku" v="whale-flow" />
              <KV k="resultHash" v="sha256:9f2c..." />
              <KV k="proof" v="{ generatedAt, latencyMs, sourceMode }" />
            </div>
          )}
        </Card>
      </Step>

      {/* 7 ------------------------------------------------------------ */}
      <Step
        n={7}
        title="Verify, or the contract refunds"
        desc="The agent recomputes sha256 over the answer and compares it to the proof. Match: act on the data. Mismatch or staleness: reject it, and the escrowed payment auto-refunds at unlockTime. The seller is only paid for correct answers."
        live={!!run?.verify}
        last
      >
        <Card className={cn("p-5", run?.verify && !run.verify.ok && "ring-1 ring-red/25")}>
          {run?.verify ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {run.verify.ok ? (
                  <><ShieldCheck size={16} className="text-green-deep" /><span className="text-[14px] font-medium text-green-deep">hash verified, answer accepted</span></>
                ) : (
                  <><ShieldX size={16} className="text-red-deep" /><span className="text-[14px] font-medium text-red-deep">hash mismatch, answer rejected, funds refund</span></>
                )}
              </div>
              <KV k="expected" v={truncateMiddle(run.verify.recomputed, 22, 12)} />
              <KV k="received" v={truncateMiddle(run.answer?.proof.resultHash ?? "", 22, 12)} />
            </div>
          ) : (
            <p className="text-[14px] leading-relaxed text-muted">
              Try it in the <Link href="/playground" className="text-link hover:underline">playground</Link>:
              tick "corrupt the answer" and the served hash will not match. Your browser becomes the rejecting buyer.
            </p>
          )}
        </Card>
      </Step>
    </div>
  );
}
