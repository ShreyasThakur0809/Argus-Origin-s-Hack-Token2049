/**
 * One-command demo: spins up the facilitator (if needed) and the marketplace,
 * then runs the trading agent through a full pay-verify-act loop.
 */
import { spawn, type ChildProcess } from "node:child_process";
import "dotenv/config";

const SERVER_PORT = Number(process.env.PORT ?? 4021);
const FACILITATOR_PORT = Number(process.env.FACILITATOR_PORT ?? 4022);
const children: ChildProcess[] = [];

async function waitFor(url: string, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

function run(script: string, name: string) {
  const child = spawn("npx", ["tsx", script], { stdio: ["ignore", "inherit", "inherit"] });
  child.on("exit", code => {
    if (code && code !== 0) console.error(`[demo] ${name} exited with ${code}`);
  });
  children.push(child);
  return child;
}

async function isUp(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

const cleanup = () => children.forEach(c => c.kill("SIGTERM"));
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", cleanup);

// Facilitator first (server probes it at startup). Skip if one is already up.
if (await isUp(`http://localhost:${FACILITATOR_PORT}/health`)) {
  console.log(`[demo] facilitator already running on :${FACILITATOR_PORT}`);
} else {
  console.log("[demo] starting facilitator…");
  run("src/facilitator.ts", "facilitator");
  if (!(await waitFor(`http://localhost:${FACILITATOR_PORT}/health`))) {
    console.error("[demo] facilitator did not start — is BLOCKFROST_PROJECT_ID set?");
    cleanup();
    process.exit(1);
  }
}

console.log("[demo] starting marketplace…");
run("src/server.ts", "server");
if (!(await waitFor(`http://localhost:${SERVER_PORT}/health`, 30_000))) {
  console.error("[demo] server did not start");
  cleanup();
  process.exit(1);
}

console.log("[demo] running trading agent…\n");
const agent = run("src/agent/tradingAgent.ts", "agent");
const code: number = await new Promise(resolve => agent.on("close", resolve));
cleanup();
process.exit(code ?? 1);
