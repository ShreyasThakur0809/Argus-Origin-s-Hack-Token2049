/**
 * Append-only JSONL activity log. Every SKU execution (paid, dev mirror, or
 * unpaid bypass) is recorded so the /activity endpoint and the web dashboard
 * can show a real feed of what the marketplace served, settled, and proved.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ActivityEntry {
  ts: string;
  sku: string;
  method: string;
  /** originalUrl — includes query string. */
  path: string;
  /** paid = carried a payment signature; dev = /dev/* mirror; open = served without payment. */
  mode: "paid" | "dev" | "open";
  ok: boolean;
  status: number;
  latencyMs: number;
  /** Settlement tx hash when the request carried a verifiable payment. */
  tx?: string;
  resultHash?: string;
  sourceMode?: string;
  error?: string;
}

const LOG_PATH = process.env.ACTIVITY_LOG?.trim() || join(process.cwd(), "activity.jsonl");

/** Never throw: logging must not break a paid response. */
export function recordActivity(entry: ActivityEntry): void {
  try {
    appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    console.warn("[activity] log write failed:", error instanceof Error ? error.message : error);
  }
}

/** Newest-first, capped. Returns [] when no log exists yet. */
export function readActivity(limit = 100): ActivityEntry[] {
  try {
    if (!existsSync(LOG_PATH)) return [];
    const lines = readFileSync(LOG_PATH, "utf8").split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map(line => {
        try {
          return JSON.parse(line) as ActivityEntry;
        } catch {
          return undefined;
        }
      })
      .filter((e): e is ActivityEntry => e !== undefined);
  } catch {
    return [];
  }
}
