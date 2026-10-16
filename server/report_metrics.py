"""Summarize runtime metrics, optionally from a specific test start time."""
import argparse
import json
from pathlib import Path
from statistics import mean

PATH = Path("diagnostics/metrics.jsonl")


def summarize(since: float | None = None) -> dict[str, object]:
    rows = [json.loads(line) for line in PATH.read_text(encoding="utf-8").splitlines()] if PATH.exists() else []
    if since is not None:
        rows = [row for row in rows if float(row["timestamp"]) >= since]
    decode = [row for row in rows if row["event"] in {"partial_decode", "final_decode"}]
    return {
        "events": len(rows),
        "decode_count": len(decode),
        "mean_decode_ms": round(mean([row["elapsed_ms"] for row in decode]), 1) if decode else None,
        "max_rss_bytes": max([row["rss_bytes"] for row in rows], default=0),
        "mean_cpu_percent": round(mean([row["cpu_percent"] for row in rows]), 1) if rows else None,
        "since_epoch": since,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--since", type=float, help="Unix epoch at the beginning of one test")
    args = parser.parse_args()
    print(json.dumps(summarize(args.since), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
