# Remote Browser Benchmark

### How fast is "Hello, browser?"

This repo measures the minimal end‑to‑end lifecycle for a remote, provider‑hosted Chrome session using the same four steps across vendors:

- Create a session (control plane)
- Connect Playwright over CDP (data plane)
- Navigate to a URL (wait for `domcontentloaded`)
- Release the session (control plane)

Providers included: `STEEL`, `KERNEL`, `BROWSERBASE`, `HYPERBROWSER`, `ANCHORBROWSER`.

## Results at a glance (from included sample results)

These summary stats were computed from the sample 5,000‑run result files under `results/` (AWS EC2 `us‑east‑1`, first page `google.com`). Use the queries above to reproduce.

### Total time (create → connect → goto → release)

|   Provider    | Avg (ms) | Median (ms) |  p95 (ms) |  p99 (ms) |
| :-----------: | -------: | ----------: | --------: | --------: |
|     STEEL     |   894.13 |      867.00 |  1,090.00 |  1,340.05 |
|    KERNEL     | 1,518.53 |    1,485.00 |  1,752.10 |  1,992.04 |
|  BROWSERBASE  | 1,676.76 |    1,669.00 |  1,873.00 |  1,981.03 |
| HYPERBROWSER  | 3,657.11 |    3,665.50 |  5,338.00 |  6,695.05 |
| ANCHORBROWSER | 8,001.29 |    7,919.00 | 11,561.00 | 13,957.14 |

### Where the time goes (stage breakdown)

|   Provider    |   Create | Connect |     Goto |  Release | Create+Release | % of Total |
| :-----------: | -------: | ------: | -------: | -------: | -------------: | ---------: |
|     STEEL     |   181.57 |  174.64 |   490.29 |    47.62 |      229.19 ms |      25.6% |
|    KERNEL     |   261.10 |  428.90 |   533.95 |   294.57 |      555.67 ms |      36.6% |
|  BROWSERBASE  |   188.18 |  517.37 |   792.27 |   178.99 |      367.17 ms |      21.9% |
| HYPERBROWSER  | 1,731.63 |  347.60 |   377.89 | 1,199.98 |    2,931.61 ms |      80.2% |
| ANCHORBROWSER | 3,796.55 |  184.29 | 1,259.66 | 2,760.79 |    6,557.34 ms |      82.0% |

Reliability (5,000 attempts/provider):

- Steel: 100% success (0 failures)
- Kernel: 100% success (0 failures)
- Browserbase: 99.96% success (2 failures)
- Hyperbrowser: 100% success (0 failures)
- AnchorBrowser: 97.34% success (133 failures)

Notes

- Most SDKs auto‑retry transient errors; success here is after retries.
- These numbers reflect the included sample data; your results will vary by region, instance class, network, and page choice.

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

- **--provider**: single name or comma‑separated list. Aliases: `bb` → browserbase, `hyper` → hyperbrowser, `anchor` → anchorbrowser. Default: `PROVIDER` env or `browserbase`.
- **--runs**: number of measured iterations per provider. Default: `RUNS` env or `5`.
- **--url**: first page to open (waits for `domcontentloaded`). Default: `URL` env or `https://google.com/`.
- **--out**: output path. Default: `OUTPUT` env or `results/{provider}.jsonl`.
- **--rate**: maximum sessions per minute (throttles to avoid overloading). Default: `RATE` env or unlimited.

Behavioral details:

- The runner performs 10 warm‑up iterations per provider that are NOT written to results.
- Kernel: if a 429/rate limit is detected during create, the runner sleeps 30s and retries.
- Browserbase: the runner throttles to ensure a ~3s floor per full cycle to avoid rate‑limit bursts.

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
