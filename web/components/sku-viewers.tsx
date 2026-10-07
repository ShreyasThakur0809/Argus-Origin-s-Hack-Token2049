import type {
  AddressSnapshotData,
  BridgeActivityData,
  ChainStatusData,
  FeeMarketData,
  HolderConcentrationData,
  MarketSnapshotData,
  RawRpcData,
  TrendingData,
  TxStatusData,
  WhaleFlowData,
} from "@/lib/types";
import { formatBlockTime, truncateMiddle } from "@/lib/format";
import { JsonBlock, Pill, Stat } from "./ui";

function DataTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="scroll-thin overflow-x-auto rounded-xl bg-white ring-1 ring-sep-soft">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-sep-soft bg-surface/60">
            {head.map(h => (
              <th key={h} className="px-4 py-3 text-[12px] font-medium text-meta first:rounded-tl-xl last:rounded-tr-xl">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-sep-soft/60 last:border-0">
              {r.map((c, j) => (
                <td key={j} className="px-4 py-3 align-top font-mono text-[13px] text-label-soft">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WhaleFlowView({ data }: { data: WhaleFlowData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
        <Stat label="chain" value={data.chain} />
        <Stat label="tip" value={data.tip?.toLocaleString()} />
        <Stat label="window" value={`${data.windowBlocks} blocks`} />
        <Stat label="transfers" value={data.transferCount} />
        <Stat label="total moved" value={`${data.totalMovedNative?.toLocaleString()} ${data.symbol}`} />
      </div>
      <DataTable
        head={["amount", "from", "to", "txid", "block"]}
        rows={data.flows.map(f => [
          `${f.amountNative.toLocaleString()} ${data.symbol}`,
          f.from ? truncateMiddle(f.from, 8, 6) : "coinbase",
          f.to.map(t => truncateMiddle(t, 8, 6)).join(", ") || "-",
          truncateMiddle(f.txid, 8, 6),
          f.block ?? "-",
        ])}
      />
    </div>
  );
}

function ConcentrationBar({ label, share }: { label: string; share: number | null }) {
  const pct = share === null ? null : share * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-muted">{label}</span>
        <span className="text-[17px] font-semibold tracking-[-0.01em] text-label">{pct === null ? "n/a" : `${pct.toFixed(2)}%`}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-surface">
        {pct !== null && <div className="h-1.5 rounded-full bg-blue" style={{ width: `${Math.min(100, Math.max(1.5, pct))}%` }} />}
      </div>
    </div>
  );
}

export function HolderConcentrationView({ data }: { data: HolderConcentrationData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Stat label="chain" value={data.chain} />
        <Stat label="token" value={<span className="font-mono text-[14px]">{truncateMiddle(data.token, 8, 6)}</span>} />
        <Stat label="transfer events" value={data.transferEvents} />
        <Stat label="holders sampled" value={data.sampledHolders} />
      </div>
      <div className="grid gap-4 rounded-xl bg-surface p-4 sm:grid-cols-3">
        <ConcentrationBar label="top 5 share" share={data.concentration.top5Share} />
        <ConcentrationBar label="top 10 share" share={data.concentration.top10Share} />
        <ConcentrationBar label="top 25 share" share={data.concentration.top25Share} />
      </div>
      <DataTable
        head={["holder", "balance", "supply share"]}
        rows={data.topHolders.slice(0, 10).map(h => [
          truncateMiddle(h.address, 10, 6),
          h.balanceUnits.toLocaleString(undefined, { maximumFractionDigits: 2 }),
          h.supplyShare === null ? "n/a" : `${(h.supplyShare * 100).toFixed(3)}%`,
        ])}
      />
      <p className="text-[13px] leading-relaxed text-meta">{data.caveat}</p>
    </div>
  );
}

export function BridgeActivityView({ data }: { data: BridgeActivityData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-x-6 gap-y-4">
        <Stat label="window" value={`${data.windowBlocks.toLocaleString()} blocks`} />
        <Stat label="outbound (unique tx)" value={data.totals.outbound} />
        <Stat label="inbound (unique tx)" value={data.totals.inbound} />
      </div>
      {data.chains.map(c => (
        <div key={c.chain} className="rounded-xl bg-surface p-5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[14px] font-medium text-label">{c.chain}</p>
            {c.tip !== undefined && <span className="font-mono text-[12.5px] text-meta">tip {c.tip.toLocaleString()}</span>}
          </div>
          {c.error ? (
            <p className="mt-2 text-[13px] text-red-deep">{c.error}</p>
          ) : (
            <div className="mt-2 divide-y divide-sep-soft/70">
              {(c.bridges ?? []).map(b => (
                <div key={b.address} className="py-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="min-w-0 truncate text-[14px] font-medium text-label">{b.bridge}</p>
                    <p className="shrink-0 font-mono text-[13px] text-muted">
                      out <span className={b.outbound > 0 ? "font-semibold text-label" : undefined}>{b.outbound}</span>
                      <span className="text-meta"> · </span>in {b.inbound}
                      <span className="text-meta"> · </span>{b.totalEvents} events
                    </p>
                  </div>
                  {b.events.length > 0 && (
                    <p className="mt-1 truncate font-mono text-[12.5px] text-meta" title={b.events.map(e => `${e.label} x${e.count}`).join("  ·  ")}>
                      {b.events.slice(0, 4).map(e => `${e.label} x${e.count}`).join("  ·  ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function RawRpcView({ data }: { data: RawRpcData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-x-6 gap-y-4">
        <Stat label="chain" value={data.chain} />
        <Stat label="method" value={<span className="font-mono text-[14px]">{data.method}</span>} />
        <Stat label="upstream latency" value={`${data.latencyMs}ms`} />
      </div>
      <JsonBlock value={data.result} maxH="max-h-56" />
    </div>
  );
}

export function TxStatusView({ data }: { data: TxStatusData }) {
  const statusTone = data.status === "confirmed" ? "green" : data.status === "failed" ? "red" : "gray";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Stat label="chain" value={data.chain} />
        <Stat
          label="status"
          value={
            <span className="inline-flex items-center gap-2">
              {data.found ? <Pill tone={statusTone}>{data.status}</Pill> : <Pill tone="red">not found</Pill>}
            </span>
          }
        />
        <Stat label="confirmations" value={data.confirmations ?? "-"} />
        <Stat label="block / slot" value={(data.block ?? data.slot)?.toLocaleString() ?? "-"} />
      </div>
      {data.hint && <p className="text-[13px] leading-relaxed text-meta">{data.hint}</p>}
      <DataTable
        head={["field", "value"]}
        rows={[
          ["txid", <span className="break-all">{data.txid}</span>],
          ...(data.from ? [["from", truncateMiddle(data.from, 12, 8)]] : []),
          ...(data.to ? [["to", truncateMiddle(data.to, 12, 8)]] : []),
          ...(data.gasUsed !== null && data.gasUsed !== undefined ? [["gas used", data.gasUsed.toLocaleString()]] : []),
          ...(data.blockTime ? [["block time", formatBlockTime(data.blockTime)]] : []),
          ...(data.valueNative !== null && data.valueNative !== undefined ? [["value", `${data.valueNative} ${data.chain.toUpperCase()}`]] : []),
          ...(data.feeNative !== null && data.feeNative !== undefined ? [["fee", `${data.feeNative} ${data.chain.toUpperCase()}`]] : []),
          ...(data.feeLamports !== null && data.feeLamports !== undefined ? [["fee", `${data.feeLamports} lamports`]] : []),
        ]}
      />
    </div>
  );
}

export function FeeMarketView({ data }: { data: FeeMarketData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Stat label="chains queried" value={data.quotes.length} />
        <Stat label="cheapest EVM" value={data.cheapestEvm ?? "n/a"} />
        <Stat label="sampled" value={formatBlockTime(data.sampledAt)} />
      </div>
      <DataTable
        head={["chain", "quote", "oracle"]}
        rows={data.quotes.map(q => [
          <span className="inline-flex items-center gap-2">
            {q.chain}
            {data.cheapestEvm === q.chain && <Pill tone="green">cheapest</Pill>}
          </span>,
          q.error
            ? <span className="text-red-deep">{q.error}</span>
            : q.gasPriceGwei !== undefined
              ? `${q.gasPriceGwei.toFixed(4)} ${q.unit ?? "gwei/gas"}`
              : q.feeNativePerKb !== null && q.feeNativePerKb !== undefined
                ? `${q.feeNativePerKb} ${q.unit ?? ""}`
                : "-",
          q.oracle ?? "-",
        ])}
      />
      <p className="text-[13px] leading-relaxed text-meta">{data.note}</p>
    </div>
  );
}

const KIND_LABELS: Record<string, string> = {
  eoa: "externally owned",
  contract: "contract",
  program: "program",
  account: "account",
  blockbook: "address",
};

export function AddressSnapshotView({ data }: { data: AddressSnapshotData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Stat label="chain" value={data.chain} />
        <Stat label="type" value={<Pill tone={data.kind === "contract" || data.kind === "program" ? "dark" : "gray"}>{KIND_LABELS[data.kind] ?? data.kind}</Pill>} />
        <Stat
          label="balance"
          value={`${data.balanceNative?.toLocaleString(undefined, { maximumFractionDigits: 6 }) ?? "-"} ${data.symbol}`}
        />
        <Stat
          label="activity"
          value={data.nonce !== undefined ? `nonce ${data.nonce}` : data.txCount !== null && data.txCount !== undefined ? `${data.txCount} txs` : "-"}
        />
      </div>
      {(data.totalReceivedNative !== null && data.totalReceivedNative !== undefined) && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Stat label="total received" value={`${data.totalReceivedNative.toLocaleString()} ${data.symbol}`} />
          <Stat label="total sent" value={`${data.totalSentNative?.toLocaleString() ?? "-"} ${data.symbol}`} />
          <Stat label="unconfirmed" value={`${data.unconfirmedNative?.toLocaleString() ?? 0} ${data.symbol}`} />
        </div>
      )}
      <p className="break-all font-mono text-[13px] text-meta">{data.address}{data.owner ? ` · owner ${data.owner}` : ""}</p>
      {data.tokens && data.tokens.length > 0 && (
        <DataTable
          head={["token", "contract", "balance"]}
          rows={data.tokens.map(t => [
            `${t.name ?? ""} ${t.symbol ? `(${t.symbol})` : ""}`.trim() || "-",
            t.contract ? truncateMiddle(t.contract, 10, 6) : "-",
            t.balance ?? "-",
          ])}
        />
      )}
    </div>
  );
}

export function ChainStatusView({ data }: { data: ChainStatusData }) {
  return (
    <div className="space-y-5">
      <Stat label="checked at" value={formatBlockTime(data.checkedAt)} />
      <DataTable
        head={["chain", "tip", "last block", "age", "status"]}
        rows={data.chains.map(c => [
          c.chain,
          c.error ? <span className="text-red-deep">{c.error}</span> : (c.tip?.toLocaleString() ?? "-"),
          c.blockTime ? formatBlockTime(c.blockTime) : "-",
          c.blockAgeSec !== null && c.blockAgeSec !== undefined ? `${c.blockAgeSec}s${c.expectedBlockSec ? ` (target ${c.expectedBlockSec}s)` : ""}` : "-",
          c.error
            ? "-"
            : <Pill tone={c.status === "live" ? "green" : c.status === "lagging" ? "red" : "gray"}>{c.status ?? "?"}</Pill>,
        ])}
      />
    </div>
  );
}

function usd(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return "-";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: digits })}`;
}

function pct(n: number | null | undefined) {
  if (n === null || n === undefined) return "-";
  return <span className={n >= 0 ? "text-green-deep" : "text-red-deep"}>{`${n >= 0 ? "+" : ""}${n.toFixed(2)}%`}</span>;
}

function compactUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return usd(n, 0);
}

export function MarketSnapshotView({ data }: { data: MarketSnapshotData }) {
  return (
    <div className="space-y-5">
      <Stat label="checked at" value={formatBlockTime(data.checkedAt)} />
      <DataTable
        head={["asset", "price", "24h", "market cap", "volume 24h", "rank"]}
        rows={data.assets.map(a =>
          a.error
            ? [a.asset, <span className="text-red-deep">{a.error}</span>, "-", "-", "-", "-"]
            : [
                <span className="inline-flex items-center gap-2">
                  <span className="font-semibold text-label">{a.symbol}</span>
                  <span className="text-meta">{a.name}</span>
                </span>,
                usd(a.priceUsd, (a.priceUsd ?? 0) < 1 ? 4 : 2),
                pct(a.change24hPct),
                compactUsd(a.marketCapUsd),
                compactUsd(a.volume24hUsd),
                a.rank ? `#${a.rank}` : "-",
              ],
        )}
      />
      <p className="text-[13px] leading-relaxed text-meta">Market data via CoinGecko. Any tracked asset id works, not just node-backed chains.</p>
    </div>
  );
}

export function TrendingView({ data }: { data: TrendingData }) {
  return (
    <div className="space-y-5">
      <Stat label="checked at" value={formatBlockTime(data.checkedAt)} />
      <DataTable
        head={["rank", "asset", "price", "24h", "mcap rank"]}
        rows={data.coins.map(c => [
          `#${c.rank}`,
          <span className="inline-flex items-center gap-2">
            <span className="font-semibold text-label">{c.symbol}</span>
            <span className="text-meta">{c.name}</span>
          </span>,
          usd(c.priceUsd, (c.priceUsd ?? 0) < 1 ? 4 : 2),
          pct(c.change24hPct),
          c.marketCapRank ? `#${c.marketCapRank}` : "-",
        ])}
      />
      <p className="text-[13px] leading-relaxed text-meta">What the market is paying attention to right now, via CoinGecko trending.</p>
    </div>
  );
}
