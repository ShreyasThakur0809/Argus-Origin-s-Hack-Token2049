import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getCatalogue, tryHealth, EXPLORER_ADDR } from "@/lib/api";
import { formatPrice, truncateMiddle } from "@/lib/format";
import { Card, CopyButton, Pill, SectionLabel } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalogue: Argus" };

export default async function CataloguePage() {
  const [catalogue, health] = await Promise.all([
    getCatalogue().catch(() => null),
    tryHealth(),
  ]);

  if (!catalogue) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-24 text-center">
        <h1 className="font-display text-[40px] font-semibold tracking-[-0.02em] text-label">API offline</h1>
        <p className="mx-auto mt-4 max-w-md text-[16px] text-muted">
          The catalogue is served live by <code className="font-mono text-[14px]">GET /catalogue</code>.
          Start it with <code className="font-mono text-[14px] text-label">npm run server</code> and reload.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-5xl px-5 pb-6 pt-14">
        <SectionLabel>Live catalogue</SectionLabel>
        <h1 className="mt-2 font-display text-[40px] font-semibold tracking-[-0.02em] text-label sm:text-[52px]">
          What an agent can buy.
        </h1>
        <p className="mt-3 text-[14px] text-muted">
          {catalogue.network} · {catalogue.escrow} escrow ·{" "}
          {health?.sources
            ? [health.sources.nownodes && "nownodes", health.sources.coingecko && "coingecko"]
                .filter(Boolean)
                .join(" + ") + " live"
            : health?.source === "nownodes"
              ? "live nownodes"
              : "fixture"}{" "}
          ·{" "}
          {catalogue.skus.length} SKUs · {catalogue.chains.length} chains ·{" "}
          <a
            href={EXPLORER_ADDR(catalogue.payTo, catalogue.network)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[13px] text-link hover:underline"
          >
            payTo {truncateMiddle(catalogue.payTo, 10, 6)}
          </a>
        </p>
      </div>

      {/* SKUs */}
      <div className="mx-auto max-w-5xl space-y-4 px-5 pb-14 pt-4">
        {catalogue.skus.map(sku => (
          <Card key={sku.id} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Pill tone={sku.method === "POST" ? "dark" : "gray"}>{sku.method}</Pill>
                  <code className="font-mono text-[14px] text-label">
                    {sku.id === "raw-rpc" ? "/rpc/:chain" : sku.path}
                  </code>
                </div>
                <p className="mt-3 text-[18px] font-medium tracking-[-0.01em] text-label">{sku.title}</p>
                <p className="mt-1 max-w-2xl text-[14.5px] leading-relaxed text-muted">{sku.description}</p>
              </div>
              <div className="flex flex-col items-end gap-2.5">
                <span className="text-[21px] font-semibold tracking-[-0.01em] text-label">
                  {formatPrice(sku.price?.amount, sku.assetLabel ?? "tADA")}
                </span>
                <Link
                  href={`/playground?sku=${sku.id}`}
                  className="inline-flex items-center rounded-full bg-blue px-4 py-1.5 text-[14px] font-medium text-white transition-colors hover:bg-blue-hover"
                >
                  Run it <ChevronRight size={13} className="ml-0.5" />
                </Link>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 bg-surface px-6 py-3">
              <code className="scroll-thin overflow-x-auto whitespace-nowrap font-mono text-[12.5px] text-muted">{sku.example}</code>
              <CopyButton text={sku.example} />
            </div>
          </Card>
        ))}
      </div>

      {/* Chains */}
      <div className="bg-surface px-5 py-16">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Chain coverage</SectionLabel>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
            Every SKU is served through NOWNodes. Blockbook chains power whale flow;
            JSON-RPC chains power holder concentration, bridge activity, and raw calls.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {catalogue.chains.map(c => (
              <Card key={c.id} className="p-5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[15px] font-medium text-label">{c.id}</p>
                  <Pill>{c.kind}</Pill>
                </div>
                <div className="mt-3.5 flex gap-1.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${c.blockbook ? "bg-blue-tint text-link" : "bg-surface text-meta"}`}>blockbook</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${c.rpc ? "bg-blue-tint text-link" : "bg-surface text-meta"}`}>rpc</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
