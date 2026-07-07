import crypto from "node:crypto";
import type { ProviderClient, ProviderSession } from "../types.js";
import { requireEnv } from "../utils/env.js";

// Cloudflare Browser Run has no separate control-plane create/release API.
// Connecting to the WebSocket endpoint acquires a browser session, and closing
// the browser releases it. So `create()` just builds the endpoint URL (effectively
// free), and the real session-acquisition cost shows up in `session_connect_ms`
// (the connectOverCDP handshake). `release()` is a no-op here; the runner closes
// the browser and times that as `session_release_ms`.
export class CloudflareProvider implements ProviderClient {
  readonly name = "CLOUDFLARE";

  async create(): Promise<ProviderSession> {
    const accountId = requireEnv("CF_ACCOUNT_ID");
    const apiToken = requireEnv("CF_API_TOKEN");
    const keepAlive = Number(process.env.CF_KEEP_ALIVE_MS || "600000");

    const cdpUrl = `wss://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/devtools/browser?keep_alive=${keepAlive}`;
    return {
      // Cloudflare does not expose a session id on the WS endpoint; generate a
      // stable pseudo-id so individual runs are distinguishable in results.
      id: crypto.randomUUID(),
      cdpUrl,
      headers: { Authorization: `Bearer ${apiToken}` },
    };
  }

  async release(): Promise<void> {
    // No control-plane release endpoint. The runner closes the browser, which
    // tears down the session server-side.
  }
}
