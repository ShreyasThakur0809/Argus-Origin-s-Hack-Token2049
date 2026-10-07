import { ArrowUpRight } from "lucide-react";
import { Card, SectionLabel } from "@/components/ui";
import { ActivityFeed } from "@/components/activity-feed";
import { EXPLORER_TX } from "@/lib/api";

export const metadata = { title: "Activity: Argus" };

const RECEIPTS = [
  { label: "whale-flow payment", tx: "e478934469d8e6e963065b2debb77a92ae436e85ff3108da24f3f75fae3fcf75" },
  { label: "raw-rpc payment", tx: "01f071a4cc4eca6d471a5a57441457e76fc0927254d92379d59f9c247fe91df7" },
  { label: "on-chain decision", tx: "0659273cb3f7b58edb82b68a49984761b21385ebff435ba2171985b3802a6c1f" },
];

const AGENT_STEPS = [
  "Reads the free catalogue and picks a dataset",
  "Buys BTC whale flow, then verifies the proof hash",
  "Buys a gas quote on Base to pick an execution venue",
  "Stamps its trading decision on-chain as a real transaction",
];

export default function ActivityPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <SectionLabel>Activity</SectionLabel>
      <h1 className="mt-2 font-display text-[40px] font-semibold tracking-[-0.02em] text-label sm:text-[52px]">
        What Argus served.
      </h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted">
        Every SKU execution, paid or dev, lands here the moment it happens. Paid entries carry their
        Cardano settlement tx; each one opens on preprod cardanoscan.
      </p>

      <Card className="mt-10 p-6 sm:p-7">
        <div className="grid items-center gap-6 lg:grid-cols-[auto_1fr]">
          <div>
            <p className="text-[12.5px] font-medium text-meta">ONE COMMAND</p>
            <p className="mt-2 inline-block rounded-lg bg-night px-4 py-2.5 font-mono text-[15px] text-white">npm run demo</p>
          </div>
          <ol className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {AGENT_STEPS.map((s, i) => (
              <li key={s} className="flex gap-2.5 text-[14.5px] leading-relaxed text-muted">
                <span className="shrink-0 font-medium text-label">{i + 1}.</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <ActivityFeed />

      <div className="mt-14">
        <p className="text-[14px] font-medium text-meta">
          Real settlement, not a mock. Each receipt opens on preprod cardanoscan.
        </p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {RECEIPTS.map(r => (
            <a
              key={r.tx}
              href={EXPLORER_TX(r.tx)}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3.5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
            >
              <span className="text-[14.5px] text-label">{r.label}</span>
              <span className="inline-flex items-center gap-1 font-mono text-[12px] text-muted group-hover:text-link">
                {r.tx.slice(0, 8)}...{r.tx.slice(-6)} <ArrowUpRight size={11} />
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
