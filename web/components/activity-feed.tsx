"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, ExternalLink } from "lucide-react";
import type { ActivityFeed } from "@/lib/types";
import { EXPLORER_TX } from "@/lib/api";
import { timeAgo, truncateMiddle } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, Pill } from "./ui";

const GENESIS_RUN = [
  { label: "whale-flow payment", tx: "e478934469d8e6e963065b2debb77a92ae436e85ff3108da24f3f75fae3fcf75" },
  { label: "raw-rpc payment", tx: "01f071a4cc4eca6d471a5a57441457e76fc0927254d92379d59f9c247fe91df7" },
  { label: "on-chain decision", tx: "0659273cb3f7b58edb82b68a49984761b21385ebff435ba2171985b3802a6c1f" },
];

const MODE_TONE = { paid: "dark", dev: "blue", open: "gray" } as const;

export function ActivityFeed({ compact = false }: { compact?: boolean }) {
  const [feed, setFeed] = useState<ActivityFeed | null>(null);
  const [offline, setOffline] = useState(false);
  const [sessionTxs, setSessionTxs] = useState(0);
  const mounted = useRef(false);

  useEffect(() => {
    let stop = false;
    const known = new Set<string>();
    const poll = async () => {
      try {
        const res = await fetch("/api/q402/activity", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const f = (await res.json()) as ActivityFeed;
        if (stop) return;
        // First poll seeds the baseline; later polls count newly settled txs.
        const txs = f.entries.map(e => e.tx).filter((t): t is string => !!t);
        if (mounted.current) {
          const fresh = txs.filter(t => !known.has(t)).length;
          if (fresh) setSessionTxs(n => n + fresh);
        }
        txs.forEach(t => known.add(t));
        mounted.current = true;
        setFeed(f);
        setOffline(false);
      } catch {
        if (!stop) setOffline(true);
      }
    };
    poll();
    const t = setInterval(poll, 4_000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const entries = feed?.entries ?? [];
  const paidCount = entries.filter(e => e.mode === "paid").length;

  return (
    <div className={cn("space-y-12", !compact && "mt-10")}>
      {/* stats */}
      {!compact && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["requests served", entries.length],
            ["paid on-chain", paidCount],
            ["dev mirror", entries.filter(e => e.mode === "dev").length],
            ["errors", entries.filter(e => !e.ok).length],
          ].map(([k, v]) => (
            <Card key={k as string} className="p-5">
              <p className="text-[13px] text-meta">{k}</p>
              <p className="mt-1.5 text-[34px] font-semibold tracking-[-0.02em] text-label">{v}</p>
            </Card>
          ))}
        </div>
      )}

      {/* live table */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className={cn("font-display font-semibold tracking-[-0.01em] text-label", compact ? "text-[21px]" : "text-[26px]")}>Live request feed</h2>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <span className={cn("h-1.5 w-1.5 rounded-full", offline ? "bg-sep" : "bg-green")} />
            {offline ? "offline" : "live"}
          </span>
        </div>
        <Card className="mt-5 overflow-hidden">
          {entries.length === 0 ? (
            <p className="p-8 text-center text-[14.5px] text-muted">
              {offline ? "API offline. Start it with npm run server." : "No requests served yet. Run the playground or npm run agent."}
            </p>
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead>
                  <tr className="border-b border-sep-soft bg-surface/60">
                    {["when", "sku", "request", "mode", "result", "settlement", "latency"].map(h => (
                      <th key={h} className="px-4 py-3 text-[12px] font-medium uppercase tracking-[0.04em] text-meta">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={`${e.ts}-${i}`} className="border-b border-sep-soft/50 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{timeAgo(e.ts)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-label">{e.sku}</td>
                      <td className="max-w-52 truncate px-4 py-3 font-mono text-[12.5px] text-muted" title={e.path}>{e.method} {e.path}</td>
                      <td className="px-4 py-3"><Pill tone={MODE_TONE[e.mode]}>{e.mode}</Pill></td>
                      <td className="px-4 py-3">
                        {e.ok ? (
                          <span className="inline-flex items-center gap-1 text-green-deep"><CircleCheck size={12} /> {e.status}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-deep" title={e.error}><CircleAlert size={12} /> {e.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[12.5px]">
                        {e.tx ? (
                          <a href={EXPLORER_TX(e.tx, feed?.network)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                            {truncateMiddle(e.tx, 8, 6)} <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span className="text-sep">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[12.5px] text-muted">{e.latencyMs}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {sessionTxs > 0 && (
          <p className="mt-2.5 text-[13px] font-medium text-green-deep">{sessionTxs} settled payment{sessionTxs > 1 ? "s" : ""} seen this session</p>
        )}
      </div>

      {/* genesis run */}
      {!compact && (
      <div>
        <h2 className="font-display text-[26px] font-semibold tracking-[-0.01em] text-label">Reference run</h2>
        <p className="mt-1.5 text-[14.5px] text-muted">
          The verified end-to-end agent run on preprod: two paid queries and the stamped decision.
        </p>
        <div className="mt-5 space-y-2.5">
          {GENESIS_RUN.map(r => (
            <a
              key={r.tx}
              href={EXPLORER_TX(r.tx)}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between gap-4 rounded-2xl bg-white px-5 py-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
            >
              <span className="text-[15px] text-label">{r.label}</span>
              <span className="font-mono text-[12.5px] text-muted group-hover:text-link">
                {r.tx.slice(0, 16)}...{r.tx.slice(-8)}
              </span>
            </a>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
