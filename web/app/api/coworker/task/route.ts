import type { NextRequest } from "next/server";
import { createTask, getTask, getReceipt, coworkerConfigured } from "@/lib/sokosumi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Coworker task flow, server-side only. The browser submits a brief; this
 * route creates a Sokosumi task for the Argus coworker and polls status +
 * settlement receipt. No credential ever reaches the client.
 */

function unavailable(): Response | undefined {
  const err = coworkerConfigured();
  if (!err) return undefined;
  return Response.json(
    { error: `${err}. Coworker tasks run where 'npm run coworker' lives — serve the web app there.` },
    { status: 503 },
  );
}

export async function POST(req: NextRequest) {
  const down = unavailable();
  if (down) return down;
  const { brief } = (await req.json().catch(() => ({}))) as { brief?: string };
  const trimmed = brief?.trim();
  if (!trimmed || trimmed.length < 4) {
    return Response.json({ error: "brief is required" }, { status: 400 });
  }
  if (trimmed.length > 4000) {
    return Response.json({ error: "brief too long (max 4000 chars)" }, { status: 400 });
  }
  try {
    const { id, raw } = await createTask(trimmed);
    return Response.json({ id, task: raw });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message.split("\n")[0] : "task creation failed" },
      { status: 502 },
    );
  }
}

/** The worker buys each answer from the marketplace over x402 on Cardano;
 *  that real settlement tx is the receipt worth showing. Workspace-credit
 *  tasks have no Sokosumi settlement of their own. */
function resultPaymentTx(task: Record<string, unknown>): string | undefined {
  const events = task.events;
  if (!Array.isArray(events)) return undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as { status?: string; comment?: string };
    if (e.status !== "COMPLETED" || typeof e.comment !== "string") continue;
    try {
      const r = JSON.parse(e.comment) as { payment?: { tx?: string } };
      if (typeof r.payment?.tx === "string" && r.payment.tx) return r.payment.tx;
    } catch { /* comment is not JSON */ }
  }
  return undefined;
}

export async function GET(req: NextRequest) {
  const down = unavailable();
  if (down) return down;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[\w-]{8,64}$/.test(id)) {
    return Response.json({ error: "valid task id required" }, { status: 400 });
  }
  try {
    const task = await getTask(id);
    const status = String(task.status ?? "").toUpperCase();
    let receipt = status === "COMPLETED" ? await getReceipt(id) : undefined;
    const paidTx = resultPaymentTx(task);
    if (paidTx) receipt = { settled: true, txHash: paidTx };
    return Response.json({ task, receipt });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message.split("\n")[0] : "task lookup failed" },
      { status: 502 },
    );
  }
}
