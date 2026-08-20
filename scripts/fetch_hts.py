#!/usr/bin/env python3
"""Tải toàn bộ HTS (Harmonized Tariff Schedule) từ USITC REST API -> data/hts_full.json.

Nguồn: hts.usitc.gov/reststop/exportList — dữ liệu chính phủ Mỹ, public domain.
Transport: curl subprocess (dùng CA hệ thống, không phụ thuộc certifi — chạy được sau corporate proxy).
Lịch sự: 1 req/s, UA trung tính, retry 1 lần khi lỗi mạng.

Chạy: python3 scripts/fetch_hts.py
Output: data/hts_full.json  {"fetched_at": ..., "rows": [...]}
        data/hts_meta.json  thống kê theo chương (đối chiếu khi cập nhật)
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

# Chương 01-97 (77 để trống - reserved), 98 (special), 99 (thuế bổ sung IEEPA/301)
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
    print(f"  LOI chuong {ch:02d} (2 lan)", flush=True)
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
            print(f"  ...chuong {ch:02d}: cong don {len(all_rows)} dong", flush=True)
        time.sleep(1)

    # Review agy 18/08: TUYỆT ĐỐI không ghi đè DB khi thiếu chương — chương lỗi mạng
    # sẽ "bốc hơi" lặng lẽ. Fail cứng, giữ nguyên bản cũ (rotation chỉ làm sau khi đủ).
    if failed:
        print(f"HUY CAP NHAT: {len(failed)} chuong loi {failed} — giu nguyen ban cu", flush=True)
        sys.exit(1)
    cur = DATA / "hts_full.json"
    if cur.exists():
        cur.replace(DATA / "hts_full.prev.json")  # mốc diff cho watch_tariff_changes
    (DATA / "hts_full.json").write_text(
        json.dumps({"fetched_at": date.today().isoformat(), "source": BASE,
                    "license": "US Government public domain", "rows": all_rows},
                   ensure_ascii=False))
    (DATA / "hts_meta.json").write_text(json.dumps(
        {"fetched_at": date.today().isoformat(), "total": len(all_rows),
         "per_chapter": per_chapter}, indent=2))
    empty = [c for c, n in per_chapter.items() if n == 0 and c != "77"]
    print(f"XONG: {len(all_rows)} dong. Chuong rong bat thuong: {empty or 'khong'}", flush=True)
    if len(all_rows) < 20000:
        print("CANH BAO: it hon 20k dong — kiem tra lai truoc khi dung", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
