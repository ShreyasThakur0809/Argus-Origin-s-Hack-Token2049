"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

/** Small pill used sparingly for metadata, never for primary content. */
export function Pill({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "blue" | "green" | "red" | "dark" }) {
  const tones = {
    gray: "bg-surface text-muted",
    blue: "bg-blue-tint text-link",
    green: "bg-green/15 text-green-deep",
    red: "bg-red/10 text-red-deep",
    dark: "bg-label text-white",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-white shadow-[var(--shadow-card)]", className)}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-meta">{children}</p>;
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard unavailable */ }
      }}
      className={cn("inline-flex items-center gap-1 text-[12.5px] text-meta transition-colors hover:text-label", className)}
      title="Copy"
    >
      {copied ? <Check size={13} className="text-green-deep" /> : <Copy size={13} />}
      {copied ? "copied" : "copy"}
    </button>
  );
}

export function JsonBlock({ value, className, maxH = "max-h-80" }: { value: unknown; className?: string; maxH?: string }) {
  return (
    <pre className={cn("scroll-thin overflow-auto rounded-xl bg-night p-4 font-mono text-[12.5px] leading-relaxed text-white/90", maxH, className)}>
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-muted">
      <span className="h-3 w-3 animate-spin rounded-full border border-sep border-t-label" />
      {label}
    </span>
  );
}

/** Big-number stat used on dashboards and result headers. */
export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12.5px] text-meta">{label}</p>
      <p className="mt-0.5 text-[19px] font-medium tracking-[-0.01em] text-label">{value}</p>
    </div>
  );
}
