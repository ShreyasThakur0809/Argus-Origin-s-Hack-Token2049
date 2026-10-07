import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { getCatalogue, tryHealth, getActivity, EXPLORER_TX } from "@/lib/api";
import { truncateMiddle } from "@/lib/format";
import { Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const [health, catalogue, activity] = await Promise.all([
    tryHealth(),
    getCatalogue().catch(() => null),
    getActivity().catch(() => null),
  ]);
  const lastTx = activity?.entries.find(e => e.tx)?.tx;

  const paths = [
    {
      href: "/playground",
      t: "Live demo",
      d: "Watch an agent buy a verified answer, end to end. Optionally switch on the dishonest-seller attack and watch the buyer refuse to pay.",
    },
    {
      href: "/how-it-works",
      t: "How it works",
      d: "The 402 offer, the Masumi escrow, the proof hash. The full story in five minutes.",
    },
    {
      href: "/catalogue",
      t: "Catalogue",
      d: `${catalogue ? `${catalogue.skus.length} paid SKUs` : "Paid SKUs"} across 120+ chains, each priced per query and settled in escrow.`,
    },
    {
      href: "/activity",
      t: "Activity",
      d: "Every settled purchase, live from Cardano preprod, each with its transaction on cardanoscan.",
    },
  ];

  return (
    <div>
      {/* ------------------------- hero: the hook ------------------------- */}
      <section className="relative -mt-24 flex min-h-dvh flex-col items-center justify-center overflow-clip px-5 py-16 text-center sm:-mt-16">
        {/* soft light beams behind the hero copy */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(110%_85%_at_50%_-10%,rgba(0,113,227,0.09),rgba(0,113,227,0.025)_45%,transparent_72%)]" />
          <div className="absolute -top-32 left-[3%] h-[620px] w-[240px] -rotate-[26deg] rounded-full bg-gradient-to-b from-blue/15 via-blue/10 to-transparent blur-3xl" />
          <div className="absolute -top-40 right-[7%] h-[660px] w-[180px] rotate-[26deg] rounded-full bg-gradient-to-b from-blue/10 to-transparent blur-3xl" />
        </div>

        <div className="relative">
          <div className="reveal">
            <span className="inline-flex items-center gap-2.5 rounded-full bg-white py-1 pl-1.5 pr-3.5 shadow-[var(--shadow-card)] ring-1 ring-sep-soft">
              <span className="rounded-full bg-blue px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-white">Live</span>
              <span className="text-[13px] font-medium text-label">
                {catalogue ? `${catalogue.skus.length} paid SKUs on Cardano preprod` : "pay-per-query on Cardano preprod"}
              </span>
            </span>
          </div>
          <h1
            className="reveal mx-auto mt-5 max-w-3xl font-display text-[46px] font-semibold leading-[1.02] tracking-[-0.025em] text-label sm:text-[76px]"
            style={{ animationDelay: "90ms" }}
          >
            Give AI agents
            <span className="block text-meta">eyes on-chain.</span>
          </h1>
          <p
            className="reveal mx-auto mt-5 max-w-xl text-[18px] leading-[1.5] text-muted"
            style={{ animationDelay: "180ms" }}
          >
            AI agents are becoming the biggest consumers of on-chain data, but every provider wants a
            signup, a credit card, and a monthly plan. Argus is on-chain intelligence built for
            agents: ask a question, pay a few cents of ADA through escrow, get a verified answer.
          </p>
          <div
            className="reveal mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-3"
            style={{ animationDelay: "270ms" }}
          >
            <Link
              href="/playground"
              className="rounded-full bg-blue px-5 py-2.5 text-[16px] font-medium text-white transition-colors hover:bg-blue-hover"
            >
              Try the live demo
            </Link>
            <Link href="/how-it-works" className="inline-flex items-center text-[16px] text-link hover:underline">
              How it works <ChevronRight size={15} />
            </Link>
          </div>

          {/* product shot: a real trace */}
          <div className="reveal mx-auto mt-14 max-w-3xl" style={{ animationDelay: "380ms" }}>
          <div className="rounded-[28px] bg-surface p-3 shadow-[var(--shadow-lift)] sm:p-5">
            <div className="rounded-[20px] bg-white p-5 text-left shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate font-mono text-[12.5px] text-label">GET /data/whale-flow?chain=btc&blocks=3</p>
                <span className="shrink-0"><Pill tone="blue">402</Pill></span>
              </div>
              <div className="mt-4 grid gap-3 border-t border-sep-soft pt-4 text-[14px] sm:grid-cols-3">
                <div>
                  <p className="text-[12px] text-meta">price</p>
                  <p className="mt-0.5 font-medium text-label">1.5 tADA</p>
                </div>
                <div>
                  <p className="text-[12px] text-meta">settlement</p>
                  <p className="mt-0.5 font-medium text-label">masumi escrow</p>
                </div>
                <div>
                  <p className="text-[12px] text-meta">proof</p>
                  <p className="mt-0.5 font-medium text-green-deep">sha256 verified</p>
                </div>
              </div>
              {lastTx && (
                <a
                  href={EXPLORER_TX(lastTx)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex items-center justify-between rounded-xl bg-surface px-3.5 py-2.5 font-mono text-[12px] text-muted transition-colors hover:text-label"
                >
                  latest settlement tx
                  <span className="inline-flex items-center gap-1">{truncateMiddle(lastTx, 12, 8)} <ArrowUpRight size={11} /></span>
                </a>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 text-[12.5px] text-muted">
            <span>{health ? "api online" : "api offline"}</span>
            <span className="text-sep">·</span>
            <span>{health?.network ?? "cardano:preprod"}</span>
            <span className="text-sep">·</span>
            <span>
              {health?.sources
                ? [health.sources.nownodes && "nownodes", health.sources.coingecko && "coingecko"]
                    .filter(Boolean)
                    .join(" + ") + " live"
                : health?.source === "nownodes"
                  ? "live nownodes data"
                  : "fixture mode"}
            </span>
          </div>
        </div>
        </div>
      </section>

      {/* --------------------------- the pages ---------------------------- */}
      <section className="bg-surface px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-4 sm:grid-cols-2">
            {paths.map(p => (
              <Link key={p.href} href={p.href} className="group">
                <div className="h-full rounded-3xl bg-white p-7 shadow-[var(--shadow-card)] transition-shadow group-hover:shadow-[var(--shadow-lift)]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[18px] font-medium tracking-[-0.01em] text-label">{p.t}</p>
                    <ChevronRight size={16} className="text-meta transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{p.d}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
