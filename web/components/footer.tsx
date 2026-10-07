import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-sep-soft bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted">
          Argus · pay per query, any chain, no account · powered by Query402
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted">
          <Link className="transition-colors hover:text-label" href="/how-it-works">How it works</Link>
          <Link className="transition-colors hover:text-label" href="/playground">Playground</Link>
          <Link className="transition-colors hover:text-label" href="/catalogue">Catalogue</Link>
          <Link className="transition-colors hover:text-label" href="/lifecycle">Lifecycle</Link>
          <Link className="transition-colors hover:text-label" href="/activity">Activity</Link>
          <a className="transition-colors hover:text-label" href="https://developers.cardano.org/x402" target="_blank" rel="noreferrer">x402</a>
          <a className="transition-colors hover:text-label" href="https://masumi.network" target="_blank" rel="noreferrer">Masumi</a>
          <a className="transition-colors hover:text-label" href="https://nownodes.io" target="_blank" rel="noreferrer">NOWNodes</a>
          <a className="transition-colors hover:text-label" href="https://preprod.cardanoscan.io" target="_blank" rel="noreferrer">Cardano preprod</a>
        </div>
      </div>
    </footer>
  );
}
