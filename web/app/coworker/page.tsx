import { SectionLabel } from "@/components/ui";
import { CoworkerConsole } from "@/components/coworker-console";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coworker: Argus" };

export default function CoworkerPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <SectionLabel>Sokosumi coworker</SectionLabel>
      <h1 className="mt-2 font-display text-[40px] font-semibold tracking-[-0.02em] text-label sm:text-[52px]">
        Hire Argus for a task.
      </h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted">
        Write a brief, and this page creates a real Sokosumi task for the Argus coworker.
        The worker answers with verified on-chain intelligence, a SHA-256 proof and the
        settlement receipt.
      </p>
      <div className="mt-10">
        <CoworkerConsole />
      </div>
    </div>
  );
}
