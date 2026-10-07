import { SectionLabel } from "@/components/ui";
import { LifecycleBoard } from "@/components/lifecycle";

export const metadata = { title: "Payment lifecycle: Argus" };

export default function LifecyclePage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <SectionLabel>Payment lifecycle</SectionLabel>
      <h1 className="mt-2 font-display text-[40px] font-semibold tracking-[-0.02em] text-label sm:text-[52px]">
        One query, end to end.
      </h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted">
        This is what happens when an agent buys a single answer. Run a query in the playground first
        and the panels below fill in with your real payload, your escrow terms, and your proof hash.
      </p>
      <LifecycleBoard />
    </div>
  );
}
