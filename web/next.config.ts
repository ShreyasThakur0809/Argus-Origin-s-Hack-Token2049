import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This web/ folder lives inside the Query402 repo which has its own
  // lockfile at the root: pin the Turbopack root so resolution stays here.
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
  // Next dev auto-writes AGENTS.md/CLAUDE.md boilerplate into the repo.
  agentRules: false,
  // The Devin browser preview proxies localhost:3000 via 127.0.0.1; without
  // this, dev-mode page JS is refused cross-origin and the UI never hydrates.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
