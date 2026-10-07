import type { ActivityFeed, Catalogue, Health } from "./types";

/**
 * Server components call the marketplace directly at MARKETPLACE_URL.
 * Client components call the same-origin proxy at /api/q402/* so the app works
 * without CORS and without exposing the marketplace origin to the browser.
 */
export const MARKETPLACE_URL = process.env.MARKETPLACE_URL ?? "http://localhost:4021";

const base = () => (typeof window === "undefined" ? MARKETPLACE_URL : "/api/q402");

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const getHealth = () => apiGet<Health>("/health");
export const getCatalogue = () => apiGet<Catalogue>("/catalogue");
export const getActivity = () => apiGet<ActivityFeed>("/activity");

/** Non-throwing health probe for status pills. */
export async function tryHealth(): Promise<Health | null> {
  try {
    return await getHealth();
  } catch {
    return null;
  }
}

export const EXPLORER_TX = (tx: string, network = "cardano:preprod") =>
  `${network === "cardano:preprod" ? "https://preprod.cardanoscan.io" : "https://cardanoscan.io"}/transaction/${tx}`;

export const EXPLORER_ADDR = (addr: string, network = "cardano:preprod") =>
  `${network === "cardano:preprod" ? "https://preprod.cardanoscan.io" : "https://cardanoscan.io"}/address/${addr}`;
