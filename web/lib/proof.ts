import type { Envelope } from "./types";

/** Browser-side SHA-256, mirrors the agent's verifyEnvelope() in src/agent/tradingAgent.ts. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
}

export interface ProofCheck {
  ok: boolean;
  recomputed: string;
  problems: string[];
}

/**
 * Recompute sha256(JSON.stringify(data)) and compare to proof.resultHash, plus
 * the same 300s staleness bound the demo agent enforces.
 */
export async function verifyEnvelope(env: Envelope): Promise<ProofCheck> {
  const problems: string[] = [];
  const recomputed = `sha256:${await sha256Hex(JSON.stringify(env.data))}`;
  if (recomputed !== env.proof?.resultHash) {
    problems.push(`resultHash mismatch: recomputed ${recomputed.slice(0, 24)}... but proof says ${String(env.proof?.resultHash).slice(0, 24)}...`);
  }
  const age = Date.now() - Date.parse(env.proof?.generatedAt ?? "");
  if (!Number.isFinite(age) || age > 300_000) {
    problems.push(`stale answer (${Math.round(age / 1000)}s old, limit 300s)`);
  }
  return { ok: problems.length === 0, recomputed, problems };
}

/** Decode a PAYMENT-REQUIRED header (base64 JSON). Returns null when absent. */
export function decodePaymentRequired(header: string | null): unknown | null {
  if (!header) return null;
  try {
    return JSON.parse(atob(header));
  } catch {
    return null;
  }
}
