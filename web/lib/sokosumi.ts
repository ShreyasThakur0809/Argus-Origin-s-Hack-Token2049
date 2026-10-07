/**
 * Server-side bridge to Sokosumi. Two modes:
 *
 *   Hosted (direct REST): when SOKOSUMI_API_KEY is set, call the Core API
 *   with a static Bearer key + workspace slug — no CLI, no OAuth, no vault.
 *   Create the key at preprod.sokosumi.com/developer/api-keys.
 *
 *   Local (CLI): otherwise shell out to `sokosumi`, which holds operator
 *   OAuth and the Coworker runtime key in the machine's OS vault.
 *
 * Env:
 *   COWORKER_ID        required — which coworker tasks are assigned to
 *   SOKOSUMI_API_KEY   hosted mode — user API key from the Sokosumi dashboard
 *   SOKOSUMI_ORG_SLUG  optional — org workspace slug; unset = personal workspace
 *   SOKOSUMI_BIN       optional — binary name/path, default "sokosumi"
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const BIN = process.env.SOKOSUMI_BIN ?? "sokosumi";
const COWORKER_ID = process.env.COWORKER_ID?.trim();
const ORG_SLUG = process.env.SOKOSUMI_ORG_SLUG?.trim();

const CORE_API = "https://api.preprod.sokosumi.com";
const API_KEY = process.env.SOKOSUMI_API_KEY?.trim();
const DIRECT = Boolean(API_KEY);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CORE_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${API_KEY}`,
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(ORG_SLUG ? { "x-organization-slug": ORG_SLUG } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const inner = /"message":"([^"]+)"/.exec(text)?.[1];
    throw new Error(inner ?? `sokosumi api ${res.status}`);
  }
  return (await res.json()) as T;
}

function taskScope(): string[] {
  return ORG_SLUG ? ["--organization-slug", ORG_SLUG] : [];
}

async function cli<T>(args: string[]): Promise<T> {
  try {
    const { stdout } = await execFileP(BIN, ["--preprod", ...args, "--json"], {
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return JSON.parse(stdout) as T;
  } catch (error) {
    // execFile failures carry stderr AND stdout; the CLI prints Core errors
    // on either depending on the code path.
    const e = error as { stderr?: string; stdout?: string };
    const text = `${e.stderr ?? ""}\n${e.stdout ?? ""}`.trim();
    const line = text.split("\n").filter(Boolean).pop() ?? "";
    // Core errors can be double-wrapped: {"error":"… {\"message\":\"real\"} …"}
    let detail = line;
    for (let i = 0; i < 2 && detail.startsWith("{"); i++) {
      try {
        const outer = JSON.parse(detail) as { error?: string };
        if (!outer.error) break;
        detail = outer.error;
        const inner = /"message":"([^"]+)"/.exec(detail)?.[1];
        if (inner) { detail = inner; break; }
      } catch {
        const m = /"message":"([^"]+)"/.exec(detail)?.[1];
        if (m) detail = m;
        else break;
      }
    }
    if (detail) throw new Error(detail);
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new SokosumiUnavailable("sokosumi CLI is not installed on this server");
    }
    throw error;
  }
}

export class SokosumiUnavailable extends Error {}

export function coworkerConfigured(): string | undefined {
  if (!COWORKER_ID) return "COWORKER_ID is not set on this server";
  return undefined;
}

function unwrap<T extends Record<string, unknown>>(raw: unknown): T {
  const d = (raw as { data?: unknown })?.data;
  return (d && typeof d === "object" ? d : raw) as T;
}

export async function createTask(brief: string): Promise<{ id: string; raw: unknown }> {
  const err = coworkerConfigured();
  if (err) throw new SokosumiUnavailable(err);
  const name = brief.replace(/\s+/g, " ").trim().slice(0, 80) || "Argus web task";
  if (DIRECT) {
    const raw = unwrap(await api<unknown>("/v1/tasks", {
      method: "POST",
      body: JSON.stringify({ coworkerId: COWORKER_ID, description: brief, name, status: "READY" }),
    }));
    const id = String(raw.id ?? "");
    if (!id) throw new Error(`tasks create returned no id: ${JSON.stringify(raw).slice(0, 300)}`);
    return { id, raw };
  }
  const raw = await cli<Record<string, unknown>>([
    "tasks", "create",
    ...taskScope(),
    "--coworker-id", COWORKER_ID!,
    "--name", name,
    "--description", brief,
    "--status", "READY",
  ]);
  const task = (raw as { task?: Record<string, unknown> }).task ?? raw;
  const id = String(task.id ?? "");
  if (!id) throw new Error(`tasks create returned no id: ${JSON.stringify(raw).slice(0, 300)}`);
  return { id, raw: task };
}

export async function getTask(id: string): Promise<Record<string, unknown>> {
  if (DIRECT) {
    return unwrap(await api<unknown>(`/v1/tasks/${encodeURIComponent(id)}`));
  }
  const raw = await cli<Record<string, unknown>>(["tasks", "get", id, ...taskScope()]);
  return ((raw as { task?: Record<string, unknown> }).task ?? raw);
}

/** Best-effort settlement proof. In CLI mode it needs the coworker runtime
 *  key in the OS vault — only true on the machine that runs
 *  `npm run coworker`. In API-key mode the workspace key is enough. */
export async function getReceipt(id: string): Promise<Record<string, unknown> | { error: string }> {
  const err = coworkerConfigured();
  if (err) return { error: err };
  if (DIRECT) {
    try {
      return unwrap(await api<unknown>(`/v1/tasks/${encodeURIComponent(id)}/receipt`));
    } catch (error) {
      return { error: error instanceof Error ? error.message.split("\n")[0] : "receipt lookup failed" };
    }
  }
  try {
    // `runtime receipt` takes no scope flag: the task ID selects the task.
    return await cli<Record<string, unknown>>([
      "runtime", "receipt", id,
      "--coworker-id", COWORKER_ID!,
    ]);
  } catch (error) {
    return { error: error instanceof Error ? error.message.split("\n")[0] : "receipt unavailable" };
  }
}
