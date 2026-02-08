/**
 * Convex client wrapper — always uses a real ConvexClient.
 *
 * For local dev, run `npm run dev` which starts both Vite and
 * `convex dev --local` (a local Convex backend, no cloud needed).
 *
 * Usage:
 *   import { getConvexClient } from "./convexClient.ts";
 *   const client = getConvexClient();
 *   client.query(...);
 *   client.mutation(...);
 */
import { ConvexClient } from "convex/browser";

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _client: ConvexClient | null = null;

/**
 * Initialise the Convex client. Must be called once at startup.
 * The VITE_CONVEX_URL env var is set automatically by `convex dev`.
 */
export function initConvexClient(): ConvexClient {
  if (_client) return _client;

  const url = import.meta.env.VITE_CONVEX_URL as string;
  if (!url) {
    throw new Error(
      "VITE_CONVEX_URL is not set. Run `npm run dev` to start Convex + Vite together."
    );
  }

  _client = new ConvexClient(url);
  return _client;
}

/** Get the already-initialised client. Throws if initConvexClient hasn't been called. */
export function getConvexClient(): ConvexClient {
  if (!_client) throw new Error("Call initConvexClient() first");
  return _client;
}
