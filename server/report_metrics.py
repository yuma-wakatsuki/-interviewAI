"""Summarize diagnostics/metrics.jsonl after a duration test."""
import json
from pathlib import Path
from statistics import mean

path = Path("diagnostics/metrics.jsonl")
rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()] if path.exists() else []
decode = [r for r in rows if r["event"] in {"partial_decode", "final_decode"}]
print(json.dumps({"events": len(rows), "decode_count": len(decode), "mean_decode_ms": round(mean([r["elapsed_ms"] for r in decode]), 1) if decode else None, "max_rss_bytes": max([r["rss_bytes"] for r in rows], default=0), "mean_cpu_percent": round(mean([r["cpu_percent"] for r in rows]), 1) if rows else None}, ensure_ascii=False, indent=2))
