import Link from "next/link";
import { ShieldCheck, ShieldX } from "lucide-react";
import { Card, JsonBlock, SectionLabel } from "@/components/ui";

export const metadata = { title: "How it works: Argus" };

const HOW = [
  {
    t: "The agent asks",
    d: "One plain HTTP request, like GET /data/whale-flow?chain=btc. No account, no API key, no auth headers.",
  },
  {
    t: "Escrow locks the payment",
    d: "Argus replies HTTP 402 with seller-signed terms: price, deadlines, the contract address. The agent's wallet locks the payment in the Masumi smart contract on Cardano, not in the seller's pocket.",
  },
  {
    t: "A verified answer",
    d: "The data returns with a SHA-256 proof hash that the agent checks before acting. A wrong or late answer means the contract refunds the payment automatically.",
  },
];

export default function HowItWorks() {
  return (
    <div>
      {/* ----------------------- 01 the problem --------------------------- */}
      <div className="px-5 pb-12 pt-14">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>01 · The problem</SectionLabel>
          <h1 className="mt-2 max-w-xl font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-label sm:text-[52px]">
            Data providers ask agents to be human first.
          </h1>
        </div>
      </div>
      <section className="bg-surface px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-7">
              <p className="text-[14px] font-semibold text-muted">Dune, Nansen, Arkham today</p>
              <ul className="mt-4 space-y-3 text-[16px] text-muted">
                {["Create an account", "Verify email, accept ToS", "Add a credit card", "Copy an API key", "Pay monthly for one answer"].map(s => (
                  <li key={s} className="flex items-center gap-3">
                    <span className="h-px w-5 bg-sep" /> {s}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[16px] font-medium text-label">An agent has no email, no card, no cursor.</p>
            </Card>
            <div className="rounded-2xl bg-night p-7 text-white shadow-[var(--shadow-card)]">
              <p className="text-[14px] font-semibold text-white/60">Argus</p>
              <ul className="mt-4 space-y-3 text-[16px] text-white/80">
                {["Send one HTTP request", "Receive 402 with signed escrow terms", "Lock a few cents in the Masumi contract", "Get the answer with a proof hash", "Bad answer? The contract refunds it"].map(s => (
                  <li key={s} className="flex items-center gap-3">
                    <span className="h-px w-5 bg-white/30" /> {s}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[16px] font-medium text-white">The 402 response is a signed service agreement.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------- 02 how it works -------------------------- */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>02 · The flow</SectionLabel>
          <h2 className="mt-2 font-display text-[32px] font-semibold tracking-[-0.02em] text-label sm:text-[40px]">
            One request. Paid, settled, verified on Cardano.
          </h2>
          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-3">
            {HOW.map((s, i) => (
              <div key={s.t}>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-[14px] font-semibold text-label">
                  {i + 1}
                </span>
                <p className="mt-3.5 text-[16px] font-medium text-label">{s.t}</p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-muted">{s.d}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-[14.5px] text-muted">
            <Link href="/lifecycle" className="text-link hover:underline">The full 7-step walkthrough</Link>
            {" "}fills in with your own payload after you run the playground.
          </p>
        </div>
      </section>

      {/* ----------------------- 03 the guarantee ------------------------- */}
      <section className="bg-surface px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>03 · The guarantee</SectionLabel>
          <h2 className="mt-2 max-w-xl font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-label sm:text-[40px]">
            A wrong answer is never paid for.
          </h2>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted">
            Every answer carries a SHA-256 proof hash. The buyer recomputes it locally before acting.
            Match: the escrow releases to the seller. Mismatch: the answer is rejected and the locked
            funds refund automatically at the contract deadline. No chargebacks, no support tickets.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <Card className="p-6">
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={18} className="text-green-deep" />
                <p className="text-[16px] font-semibold text-label">Honest seller</p>
              </div>
              <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
                The proof hash matches the answer. The agent accepts the data, the Masumi contract
                releases the escrowed payment.
              </p>
            </Card>
            <Card className="p-6 ring-1 ring-red/20">
              <div className="flex items-center gap-2.5">
                <ShieldX size={18} className="text-red-deep" />
                <p className="text-[16px] font-semibold text-label">Dishonest seller</p>
              </div>
              <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
                The hash does not match. The agent rejects the answer, the payment is never released,
                and the contract refunds the buyer at unlockTime.
              </p>
            </Card>
          </div>
          <div className="mt-8">
            <Link
              href="/playground?corrupt=1"
              className="inline-flex items-center rounded-full bg-blue px-5 py-2.5 text-[16px] font-medium text-white transition-colors hover:bg-blue-hover"
            >
              Try the dishonest-seller demo
            </Link>
            <p className="mt-3 text-[13.5px] text-muted">
              Opens the playground with the attack already switched on. Run it and watch the buyer refuse to pay.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------- why cardano ---------------------------- */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Why Cardano</SectionLabel>
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            {[
              { t: "Escrow, not trust", d: "Funds lock in the Masumi smart contract, never in a seller wallet. Release needs an accepted result; expiry means refund." },
              { t: "The 402 is a signed agreement", d: "Price, deadlines, an input commitment and the seller signature all travel inside the 402 response itself." },
              { t: "Built for machines", d: "Cardano's eUTxO model gives deterministic payments: no token approvals, no nonce contention, no allowance attacks." },
            ].map(c => (
              <div key={c.t}>
                <p className="text-[18px] font-medium tracking-[-0.01em] text-label">{c.t}</p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------- who uses it --------------------------- */}
      <section className="bg-surface px-5 py-20">
        <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
          <div>
            <SectionLabel>Who uses it</SectionLabel>
            <h2 className="mt-2 font-display text-[32px] font-semibold tracking-[-0.02em] text-label sm:text-[40px]">
              Built for anyone running agents.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-muted">
              Trading bots, compliance monitors, research agents: any program with a Cardano wallet
              can discover the catalogue and pay at the moment of need. Nothing to provision,
              the prices and escrow terms are machine-readable.
            </p>
            <p className="mt-3 text-[16px] leading-relaxed text-muted">
              On the other side, any data provider can list a SKU behind the same escrow and proof
              pattern. Multi-seller registration is the roadmap.
            </p>
          </div>
          <JsonBlock
            value={`# free discovery\nGET /catalogue\n\n# buy an answer\nGET /data/whale-flow?chain=btc\n-> 402 + signed escrow terms\n-> retry with a signed payment\n-> 200 + data + proof hash`}
          />
        </div>
      </section>
    </div>
  );
}
