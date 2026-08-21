#!/usr/bin/env python3
"""Fetch the full HTS (Harmonized Tariff Schedule) from the USITC REST API -> data/hts_full.json.

Source: hts.usitc.gov/reststop/exportList — US Government data, public domain.
Transport: curl subprocess (uses the system CA store, no certifi dependency — works behind corporate proxies).
Politeness: 1 req/s, neutral UA, one retry on network errors.

Run:    python3 scripts/fetch_hts.py
Output: data/hts_full.json  {"fetched_at": ..., "rows": [...]}
        data/hts_meta.json  per-chapter stats (for cross-checking updates)
"""
import json
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UA = "research-script/1.0"
BASE = "https://hts.usitc.gov/reststop/exportList"

# Chapters 01-97 (77 is reserved/empty), 98 (special), 99 (IEEPA/301 additional duties)
CHAPTERS = [c for c in range(1, 100) if c != 77]


def fetch_chapter(ch: int) -> list[dict]:
    url = f"{BASE}?from={ch:02d}01&to={ch:02d}99&format=JSON&styles=false"
    for attempt in (1, 2):
        r = subprocess.run(["curl", "-s", "--fail", "--max-time", "120", "-A", UA, url],
                           capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.strip():
            try:
                rows = json.loads(r.stdout)
                return rows if isinstance(rows, list) else []
            except json.JSONDecodeError:
                pass
        if attempt == 1:
            time.sleep(3)
    print(f"  FAILED chapter {ch:02d} (2 attempts)", flush=True)
    return []


def main() -> None:
    DATA.mkdir(exist_ok=True)
    all_rows: list[dict] = []
    per_chapter: dict[str, int] = {}
    failed: list[int] = []
    for ch in CHAPTERS:
        rows = fetch_chapter(ch)
        if not rows:
            failed.append(ch)
        per_chapter[f"{ch:02d}"] = len(rows)
        all_rows.extend(rows)
        if ch % 10 == 0:
            print(f"  ...chapter {ch:02d}: {len(all_rows)} rows so far", flush=True)
        time.sleep(1)

    # NEVER overwrite the dataset when chapters are missing — a chapter lost to a
    # network error would silently vanish. Fail hard and keep the old snapshot
    # (rotation only happens once the fetch is complete).
    if failed:
        print(f"UPDATE ABORTED: {len(failed)} chapter(s) failed {failed} — keeping the previous snapshot", flush=True)
        sys.exit(1)
    cur = DATA / "hts_full.json"
    if cur.exists():
        cur.replace(DATA / "hts_full.prev.json")  # diff baseline for watch_tariff_changes
    (DATA / "hts_full.json").write_text(
        json.dumps({"fetched_at": date.today().isoformat(), "source": BASE,
                    "license": "US Government public domain", "rows": all_rows},
                   ensure_ascii=False))
    (DATA / "hts_meta.json").write_text(json.dumps(
        {"fetched_at": date.today().isoformat(), "total": len(all_rows),
         "per_chapter": per_chapter}, indent=2))
    empty = [c for c, n in per_chapter.items() if n == 0 and c != "77"]
    print(f"DONE: {len(all_rows)} rows. Unexpectedly empty chapters: {empty or 'none'}", flush=True)
    if len(all_rows) < 20000:
        print("WARNING: fewer than 20k rows — verify before using", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
