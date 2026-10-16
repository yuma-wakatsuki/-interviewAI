"""Append-only runtime metrics for duration and capacity tests."""
import json
import time
from pathlib import Path
import psutil

OUT = Path("diagnostics/metrics.jsonl")

def record(event: str, **fields: object) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    row = {"timestamp": time.time(), "event": event, "cpu_percent": psutil.cpu_percent(), "rss_bytes": psutil.Process().memory_info().rss, **fields}
    with OUT.open("a", encoding="utf-8") as f: f.write(json.dumps(row, ensure_ascii=False) + "\n")
