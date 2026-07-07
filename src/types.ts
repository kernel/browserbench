export type ProviderName =
  | "STEEL"
  | "BROWSERBASE"
  | "ANCHORBROWSER"
  | "HYPERBROWSER"
  | "KERNEL"
  | "CLOUDFLARE";

export type MetricRecord = {
  created_at: string;
  id: string | null;
  session_creation_ms: number | null;
  session_connect_ms: number | null;
  page_goto_ms: number | null;
  session_release_ms: number | null;
  provider: ProviderName;
  success: boolean;
  error_stage: string | null;
  error_message: string | null;
};

export type ProviderSession = {
  id: string;
  cdpUrl: string;
  /** Optional HTTP headers to send on the CDP WebSocket handshake (e.g. Bearer auth). */
  headers?: Record<string, string>;
};

export interface ProviderClient {
  readonly name: ProviderName;
  create(): Promise<ProviderSession>;
  release(id: string): Promise<void>;
}
