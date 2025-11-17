import asyncio
import os
import json
import uuid
import time
import argparse
from pathlib import Path
from datetime import datetime, timezone
from browser_use import Browser
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("BROWSER_USE_API_KEY")
if not API_KEY:
    raise ValueError("Please set BROWSER_USE_API_KEY environment variable.")


def iso_utc_now_ms() -> str:
    dt = datetime.now(timezone.utc)
    dt = dt.replace(microsecond=(dt.microsecond // 1000) * 1000)
    return dt.isoformat().replace("+00:00", "Z")


def ms_since_ns(start_ns: int) -> int:
    return int((time.perf_counter_ns() - start_ns) / 1_000_000)


async def run_single_session(url: str, provider_label: str) -> dict:
    stage = "init"
    browser = None

    record = {
        "created_at": iso_utc_now_ms(),
        "id": str(uuid.uuid4()),
        "session_creation_ms": None,
        "session_connect_ms": None,
        "page_goto_ms": None,
        "session_release_ms": None,
        "provider": provider_label,
        "success": False,
        "error_stage": None,
        "error_message": None,
    }

    try:
        stage = "session_create"
        browser = Browser(use_cloud=True)
        t0 = time.perf_counter_ns()
        await browser.start()
        record["session_creation_ms"] = ms_since_ns(t0)

        stage = "page_goto"
        t2 = time.perf_counter_ns()
        await browser.navigate_to(url)
        record["page_goto_ms"] = ms_since_ns(t2)
        record["success"] = True
    except Exception as e:
        record["error_stage"] = stage
        record["error_message"] = str(e)
    finally:
        if browser is not None:
            try:
                stage = "session_release"
                t3 = time.perf_counter_ns()
                await browser.stop()
                record["session_release_ms"] = ms_since_ns(t3)
            except Exception as e:
                if record["error_stage"] is None:
                    record["error_stage"] = stage
                    record["error_message"] = str(e)

    return record


async def main():
    root_dir = Path(__file__).resolve().parents[1]

    parser = argparse.ArgumentParser(description="Browser Use bench runner")
    parser.add_argument(
        "-n",
        "--runs",
        type=int,
        default=int(os.getenv("RUNS", "1")),
        help="Number of measured runs",
    )
    parser.add_argument(
        "--warmup",
        type=int,
        default=int(os.getenv("WARMUP", "10")),
        help="Number of warmup runs (not recorded)",
    )
    parser.add_argument(
        "-u",
        "--url",
        type=str,
        default=os.getenv("URL", "https://www.google.com"),
        help="Target URL to navigate to",
    )
    parser.add_argument(
        "-o",
        "--out",
        type=str,
        default=os.getenv("OUT", str(root_dir / "results" / "browser_use.jsonl")),
        help="Path to JSONL output file",
    )
    parser.add_argument(
        "-p",
        "--provider",
        type=str,
        default=os.getenv("PROVIDER", "BROWSER_USE"),
        help='Provider label to record (default: "BROWSER_USE")',
    )

    args = parser.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    for i in range(1, args.warmup + 1):
        print(f"[WARMUP] {i}/{args.warmup}")
        try:
            await run_single_session(args.url, args.provider)
        except Exception:
            pass

    success = 0
    failure = 0
    for i in range(1, args.runs + 1):
        print(f"[RUN] {i}/{args.runs}")
        record = await run_single_session(args.url, args.provider)
        with open(out_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        print(json.dumps(record, ensure_ascii=False))
        if record.get("success"):
            success += 1
        else:
            failure += 1

    print(f"Success: {success}, Failure: {failure}")


if __name__ == "__main__":
    asyncio.run(main())
