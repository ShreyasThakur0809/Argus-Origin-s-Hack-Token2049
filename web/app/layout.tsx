import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Argus: on-chain intelligence for AI agents",
  description:
    "Give AI agents eyes on-chain. Agents pay per query in ADA via x402 with Masumi escrow on Cardano. No account, no API key, no human in the loop. Powered by Query402.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          data-* attributes on <body> before hydration. */}
      <body className="min-h-screen flex flex-col" suppressHydrationWarning>
        <Nav />
        <main className="min-h-[calc(100dvh-4.5rem)] flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
