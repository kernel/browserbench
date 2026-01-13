import fs from "node:fs";
import { chromium, type Browser } from "playwright-core";
import type { MetricRecord, ProviderClient } from "./types.js";
import { isoUtcNow, nowNs, msSince } from "./utils/time.js";

export async function runSingleSession(
  provider: ProviderClient,
  url: string
): Promise<MetricRecord> {
  let browser: Browser | null = null;
  let session: { id: string } | null = null;
  let stage = "init";

  const result: MetricRecord = {
    created_at: isoUtcNow(),
    id: null,
    session_creation_ms: null,
    session_connect_ms: null,
    page_goto_ms: null,
    session_release_ms: null,
    provider: provider.name,
    success: false,
    error_stage: null,
    error_message: null,
  };

  try {
    stage = "session_create";
    let id: string;
    let cdpUrl: string;

    if (provider.name === "KERNEL") {
      while (true) {
        try {
          const t0 = nowNs();
          const created = await provider.create();
          ({ id, cdpUrl } = created);
          result.id = id;
          session = { id };
          result.session_creation_ms = msSince(t0);
          console.error(
            `[Session created] provider=${provider.name} id=${id} ${result.session_creation_ms}ms`
          );
          break;
        } catch (e: any) {
          const status = e?.status ?? e?.statusCode ?? e?.response?.status;
          const message = e instanceof Error ? e.message : `${e}`;
          const isRateLimit =
            status === 429 || /rate|limit|429|too many/i.test(message || "");
          if (isRateLimit) {
            console.error(
              `[RATE_LIMIT] provider=KERNEL message="${message}" → retry in 30s`
            );
            await new Promise((r) => setTimeout(r, 30_000));
            continue;
          }
          throw e;
        }
      }
    } else {
      const t0 = nowNs();
      const created = await provider.create();
      ({ id, cdpUrl } = created);
      result.id = id;
      session = { id };
      result.session_creation_ms = msSince(t0);
      console.error(
        `[Session created] provider=${provider.name} id=${id} ${result.session_creation_ms}ms`
      );
    }

    stage = "connect_over_cdp";
    const t1 = nowNs();
    browser = await chromium.connectOverCDP(cdpUrl);
    result.session_connect_ms = msSince(t1);
    console.error(`[Browser connected] ${result.session_connect_ms}ms`);

    stage = "page_goto";
    const t2 = nowNs();
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded" });
    result.page_goto_ms = msSince(t2);
    console.error(`[Page visited] ${result.page_goto_ms}ms`);

    result.success = true;
  } catch (e: any) {
    const message = e instanceof Error ? e.stack || e.message : `${e}`;
    result.error_stage = stage;
    result.error_message = message;
    console.error(`[ERROR] stage=${stage} id=${result.id} ${message}`);
  } finally {
    if (session?.id) {
      try {
        stage = "session_release";
        const t3 = nowNs();
        await provider.release(session.id);
        result.session_release_ms = msSince(t3);
        console.error(`[Session released] ${result.session_release_ms}ms`);
      } catch (e: any) {
        console.error(
          `[SESSION_RELEASE_ERROR] id=${session.id} ${e?.message || e}`
        );
      }
    }

    // Avoid rate limit for Browserbase
    if (provider.name === "BROWSERBASE") {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.max(
            3000 -
              ((result.session_creation_ms ?? 0) +
                (result.session_connect_ms ?? 0) +
                (result.page_goto_ms ?? 0) +
                (result.session_release_ms ?? 0))
          ),
          0
        )
      );
    }
  }

  return result;
}

const WARMUP_RUNS = 10;

export async function runLoop(
  provider: ProviderClient,
  { runs, url, out, rate }: { runs: number; url: string; out: string; rate?: number }
) {
  const minIntervalMs = rate ? (60 / rate) * 1000 : 0; // minimum ms between sessions
  
  if (rate) {
    console.error(`[RATE_LIMIT] Throttling to ${rate} sessions/min (${(minIntervalMs / 1000).toFixed(1)}s interval)`);
  }

  for (let i = 1; i <= WARMUP_RUNS; i++) {
    const start = Date.now();
    console.error(`[WARMUP] ${i}/${WARMUP_RUNS}`);
    await runSingleSession(provider, url);
    await throttle(start, minIntervalMs);
  }

  let success = 0;
  let failure = 0;

  for (let i = 1; i <= runs; i++) {
    const start = Date.now();
    console.error(`[RUN] ${i}/${runs}`);
    const record = await runSingleSession(provider, url);
    fs.appendFileSync(out, JSON.stringify(record) + "\n", {
      encoding: "utf-8",
    });
    if (record.success) success++;
    else failure++;
    await throttle(start, minIntervalMs);
  }
  console.error(`Success: ${success}, Failure: ${failure}`);
}

async function throttle(startTime: number, minIntervalMs: number): Promise<void> {
  if (minIntervalMs <= 0) return;
  const elapsed = Date.now() - startTime;
  const remaining = minIntervalMs - elapsed;
  if (remaining > 0) {
    await new Promise((r) => setTimeout(r, remaining));
  }
}
