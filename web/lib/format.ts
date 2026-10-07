/** Display helpers shared across pages. */

export function truncateMiddle(s: string, head = 10, tail = 6): string {
  if (!s) return "";
  return s.length <= head + tail + 3 ? s : `${s.slice(0, head)}...${s.slice(-tail)}`;
}

/** lovelace or tUSDM base units (both 6dp) -> human amount. */
export function baseUnitsToNumber(amount: string | undefined): number {
  const n = Number(amount ?? "0");
  return Number.isFinite(n) ? n / 1e6 : 0;
}

export function formatPrice(amount: string | undefined, label: string): string {
  const n = baseUnitsToNumber(amount);
  return `${Number.isInteger(n) ? n.toString() : n.toFixed(2)} ${label}`;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString(undefined, { hour12: false });
}

export function formatBlockTime(isoOrSec: string | number): string {
  const d = typeof isoOrSec === "number" ? new Date(isoOrSec * 1000) : new Date(isoOrSec);
  return Number.isNaN(d.getTime()) ? String(isoOrSec) : d.toLocaleString();
}
