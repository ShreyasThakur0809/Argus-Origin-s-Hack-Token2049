import { getCatalogue } from "@/lib/api";
import { SectionLabel } from "@/components/ui";
import { Playground } from "@/components/playground";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live demo: Argus" };

export default async function PlaygroundPage({ searchParams }: { searchParams: Promise<{ sku?: string; corrupt?: string }> }) {
  const [{ sku, corrupt }, catalogue] = await Promise.all([
    searchParams,
    getCatalogue().catch(() => null),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <SectionLabel>Live demo</SectionLabel>
      <h1 className="mt-2 font-display text-[40px] font-semibold tracking-[-0.02em] text-label sm:text-[52px]">
        Watch a machine buy an answer.
      </h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted">
        Every run hits the real paid route first, so you see the exact HTTP 402 and signed escrow
        terms an agent receives. The answer then loads and your browser verifies the proof hash,
        the same check the autonomous agent runs before it acts. Switch on the dishonest seller to
        see a bad answer rejected and the payment refunded.
      </p>
      <div className="mt-10">
        <Playground catalogue={catalogue} initialSku={sku} initialCorrupt={corrupt === "1"} />
      </div>
    </div>
  );
}
