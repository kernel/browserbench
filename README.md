# Remote Browser Benchmark

### How fast is "Hello, browser?"

This repo measures the minimal end‑to‑end lifecycle for a remote, provider‑hosted Chrome session using the same four steps across vendors:

- Create a session (control plane)
- Connect Playwright over CDP (data plane)
- Navigate to a URL (wait for `domcontentloaded`)
- Release the session (control plane)

Providers included: `STEEL`, `KERNEL`, `BROWSERBASE`, `HYPERBROWSER`, `ANCHORBROWSER`, `CLOUDFLARE`.

## Results at a glance (from included sample results)

These summary stats were computed from the sample 5,000‑run result files under `results/` (AWS EC2 `us‑east‑1`, first page `google.com`). Use the queries above to reproduce.

### Total time (create → connect → goto → release)

|   Provider    | Avg (ms) | Median (ms) |  p95 (ms) |  p99 (ms) |
| :-----------: | -------: | ----------: | --------: | --------: |
|    KERNEL     |   793.84 |      776.00 |  1,006.00 |  1,105.00 |
|     STEEL     |   894.13 |      867.00 |  1,090.00 |  1,340.05 |
|  CLOUDFLARE   | 1,753.45 |    1,602.00 |  2,789.60 |  4,491.44 |
|  BROWSERBASE  | 2,966.87 |    2,888.00 |  3,886.00 |  4,309.12 |
| HYPERBROWSER  | 3,657.11 |    3,665.50 |  5,338.00 |  6,695.05 |
| ANCHORBROWSER | 8,001.29 |    7,919.00 | 11,561.00 | 13,957.14 |

### Where the time goes (stage breakdown)

|   Provider    |   Create | Connect |     Goto |  Release | Create+Release | % of Total |
| :-----------: | -------: | ------: | -------: | -------: | -------------: | ---------: |
|    KERNEL     |    36.64 |  288.30 |   434.15 |    34.77 |       71.41 ms |       9.0% |
|     STEEL     |   181.57 |  174.64 |   490.29 |    47.62 |      229.19 ms |      25.6% |
|  CLOUDFLARE   |     0.00 | 1044.64 |   671.34 |    37.46 |       37.46 ms |       2.1% |
|  BROWSERBASE  |   212.83 | 1794.42 |   745.08 |   214.55 |      427.38 ms |      14.4% |
| HYPERBROWSER  | 1,731.63 |  347.60 |   377.89 | 1,199.98 |    2,931.61 ms |      80.2% |
| ANCHORBROWSER | 3,796.55 |  184.29 | 1,259.66 | 2,760.79 |    6,557.34 ms |      82.0% |

Reliability (5,000 attempts/provider):

- Kernel: 100% success (0 failures)
- Steel: 100% success (0 failures)
- Cloudflare: 99.38% success (31 failures)
- Browserbase: 100% success (0 failures)
- Hyperbrowser: 100% success (0 failures)
- AnchorBrowser: 97.34% success (133 failures)

Notes

- Most SDKs auto‑retry transient errors; success here is after retries.
- These numbers reflect the included sample data; your results will vary by region, instance class, network, and page choice.
- Cloudflare was paced at `--rate 10` (≈10 sessions/min); the other providers ran unthrottled. On a Workers Paid plan the CDP endpoint enforces a token‑bucket limit (roughly a ~110‑session burst, then ~12/min sustained refill), so an unthrottled 5,000‑run pass would start returning `429 Rate limit exceeded` after ~110 sessions and pollute the results. Cloudflare's 31 failures were all transient CDP‑connect errors (28× `503 Service Unavailable`, 3× connect timeout), scattered with at most 2 in a row — not rate‑limit errors.

## Quickstart

1. Requirements

- Node.js ≥ 18

2. Install

```bash
git clone https://github.com/steel-dev/browserbench
cd browserbench
npm install
```

3. Configure environment (create a `.env` or export in your shell)

```bash
# Steel
STEEL_API_KEY=...

# Browserbase
BROWSERBASE_API_KEY=...
BROWSERBASE_PROJECT_ID=...

# Kernel
KERNEL_API_KEY=...

# Hyperbrowser
HYPERBROWSER_API_KEY=...

# Anchorbrowser
ANCHORBROWSER_API_KEY=...

# Cloudflare Browser Run
CF_ACCOUNT_ID=...
CF_API_TOKEN=...
```

4. Run

- Build once and run the compiled CLI:

```bash
npm run build
npm run bench -- --provider steel --runs 5000 --url https://google.com/
```

- Or run directly with TSX during development:

```bash
npm run dev -- --provider steel --runs 20
```

- Multiple providers (runs sequentially, separate result files):

```bash
npm run build
npm run bench -- --provider steel,kernel,browserbase,hyperbrowser,anchorbrowser --runs 5000
```

## CLI options

- **--provider**: single name or comma‑separated list. Aliases: `bb` → browserbase, `hyper` → hyperbrowser, `anchor` → anchorbrowser, `cf` → cloudflare. Default: `PROVIDER` env or `browserbase`.
- **--runs**: number of measured iterations per provider. Default: `RUNS` env or `5`.
- **--url**: first page to open (waits for `domcontentloaded`). Default: `URL` env or `https://google.com/`.
- **--out**: output path. Default: `OUTPUT` env or `results/{provider}.jsonl`.
- **--rate**: maximum sessions per minute (throttles to avoid overloading). Default: `RATE` env or unlimited.

Behavioral details:

- The runner performs 10 warm‑up iterations per provider that are NOT written to results.
- Kernel: if a 429/rate limit is detected during create, the runner sleeps 30s and retries.
- Browserbase: the runner throttles to ensure a ~3s floor per full cycle to avoid rate‑limit bursts.
- Cloudflare Browser Run: there is no separate control‑plane create or release call — connecting to the CDP WebSocket acquires a session and closing the browser releases it. So `session_creation_ms` is effectively 0 (just endpoint URL construction), the real acquisition cost is measured in `session_connect_ms`, and `session_release_ms` covers `browser.close()`. Workers Free plan accounts are capped at 10 minutes of browser use per day; bursts of rapid sessions will start returning `429 Rate limit exceeded` until the next UTC day. Workers Paid plan accounts are not day‑capped but still enforce a token‑bucket limit on session acquisition (roughly a ~110‑session burst, then ~12/min sustained refill), so an unthrottled long run will 429 after ~110 sessions. Use `--rate` to throttle either way; the sample Cloudflare data was collected at `--rate 10`.

## What gets measured

Each measured iteration records the following timings (milliseconds):

- `session_creation_ms`: Provider control plane latency to create a session
- `session_connect_ms`: Playwright `chromium.connectOverCDP` handshake to the provider
- `page_goto_ms`: `page.goto(url, { waitUntil: "domcontentloaded" })`
- `session_release_ms`: Provider control plane latency to release the session

Additional fields: `created_at` (ISO UTC), `id` (session id when available), `provider`, `success`, `error_stage`, `error_message`.

Output format is JSON Lines (one object per line). Example:

```json
{
  "created_at": "2025-11-06T00:00:00.000Z",
  "id": "abc123",
  "session_creation_ms": 181,
  "session_connect_ms": 174,
  "page_goto_ms": 490,
  "session_release_ms": 48,
  "provider": "STEEL",
  "success": true,
  "error_stage": null,
  "error_message": null
}
```

Files are appended to on every run. Delete or move an existing `results/*.jsonl` file if you want to start fresh.

## Analyzing results with DuckDB

You can query the raw JSONL files directly without importing:

```bash
# Quick averages per provider
duckdb -c ".read queries/simple.sql"

# Full breakdown (avg/median/p95/p99/stddev per stage + total)
duckdb -c ".read queries/full.sql"
```

Or open an interactive shell and run the scripts:

```bash
duckdb rb.db
.read queries/full.sql
```

The SQL reads `results/*.jsonl` with `format='newline_delimited'` and uses `try_cast` to coerce numbers safely.

## Reproducing the methodology

- Playwright `chromium.connectOverCDP` is used against each provider’s CDP endpoint.
- No provider‑specific performance tuning or non‑default settings were applied.
- Only the first navigation (`domcontentloaded`) is measured; real agents do more work.
- Ten warm‑up iterations are run prior to measurement to reduce cold effects.

## Troubleshooting

- Ensure API keys and required IDs (e.g., `BROWSERBASE_PROJECT_ID`) are set.
- Delete or rename old `results/*.jsonl` if you are re‑running the same provider to avoid mixing runs.
- If you hit vendor rate limits, the runner will back off (Kernel) or self‑throttle (Browserbase); long runs may take time.

## License

MIT
