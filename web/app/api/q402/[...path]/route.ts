import { MARKETPLACE_URL } from "@/lib/api";
import type { NextRequest } from "next/server";

/**
 * Same-origin proxy to the Argus marketplace.
 *
 * Two jobs:
 *  1. Same origin for the browser, so no CORS is needed on the Express server.
 *  2. Header sanitization: the x402 middleware serves an HTML paywall when it
 *     sees `Accept: text/html` + a Mozilla UA. We force an agent-style request
 *     (application/json, no UA) so the playground always receives the real
 *     JSON 402 with a decodable PAYMENT-REQUIRED header.
 *
 * MARKETPLACE_URL defaults to http://localhost:4021 (see web/.env.example).
 */

const REQUEST_HEADERS = ["content-type", "payment-signature", "x-payment"] as const;
const RESPONSE_HEADERS = [
  "content-type",
  "payment-required",
  "payment-response",
  "x-payment-response",
  "cache-control",
] as const;

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const target = `${MARKETPLACE_URL}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  headers.set("accept", "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
      cache: "no-store",
      // Data queries can legitimately take a while (block windows, batched calls).
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    return Response.json(
      { error: `marketplace unreachable at ${MARKETPLACE_URL}`, detail: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }

  const resHeaders = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) resHeaders.set(name, v);
  }
  resHeaders.set("cache-control", "no-store");

  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
