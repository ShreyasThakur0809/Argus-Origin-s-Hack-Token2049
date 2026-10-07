"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Health } from "@/lib/types";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/coworker", label: "Coworker" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/catalogue", label: "Catalogue" },
  { href: "/activity", label: "Activity" },
];

function LiveStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let stop = false;
    const ping = async () => {
      try {
        const res = await fetch("/api/q402/health", { cache: "no-store" });
        if (!res.ok) throw new Error();
        if (!stop) { setHealth(await res.json()); setDown(false); }
      } catch {
        if (!stop) { setHealth(null); setDown(true); }
      }
    };
    ping();
    const t = setInterval(ping, 15_000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  return (
    <span className="hidden items-center gap-1.5 text-[13px] text-muted lg:inline-flex">
      <span className={cn("h-1.5 w-1.5 rounded-full", down ? "bg-sep" : "bg-green")} />
      {down ? "offline" : health ? health.escrow : "..."}
    </span>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      if (y < 8) setHidden(false);
      else if (y > lastY + 4 && y > 96) setHidden(true);
      else if (y < lastY - 4) setHidden(false);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-4 z-40 px-4 transition-transform duration-300",
        hidden && "-translate-y-[130%]",
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-6xl rounded-3xl border backdrop-blur-xl transition-all duration-300 sm:rounded-full",
          scrolled
            ? "border-sep-soft bg-white/80 shadow-[var(--shadow-lift)]"
            : "border-sep-soft/70 bg-white/60 shadow-[var(--shadow-card)]",
        )}
      >
        <div className="flex h-13 items-center justify-between gap-4 pl-5 pr-2.5 sm:h-14 sm:pl-6">
          <Link href="/" className="text-base font-semibold tracking-[-0.01em] text-label">
            Argus
          </Link>
          <nav className="hidden items-center gap-8 sm:flex">
            {LINKS.map(l => {
              const active = !l.href.includes("#") && pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn("text-sm transition-colors", active ? "text-label" : "text-muted hover:text-label")}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-4">
            <LiveStatus />
            <Link
              href="/playground"
              className="rounded-full bg-blue px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-blue-hover sm:px-5"
            >
              Live demo
            </Link>
          </div>
        </div>
        {/* mobile links live inside the same rounded card */}
        <nav className="scroll-thin flex gap-6 overflow-x-auto border-t border-sep-soft/50 px-5 py-2 sm:hidden">
          {LINKS.map(l => {
            const active = !l.href.includes("#") && pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn("whitespace-nowrap text-[13px]", active ? "font-medium text-label" : "text-muted")}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
