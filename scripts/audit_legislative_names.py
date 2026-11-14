#!/usr/bin/env python3
"""Read-only candidate-name audit of the ten legislative election snapshots.

Flags are leads for manual source verification, NOT automatic name corrections.
Only contest candidacies are scanned; party-list aggregate rows are not persons.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
YEARS = (1992, 1995, 1998, 2001, 2004, 2008, 2012, 2016, 2020, 2024)
KNOWN_COMPONENTS = ("火宣", "火玄", "木宣", "金宣")
SUSPICIOUS_UNICODE = re.compile(r"[\uFFFD\uFFF0-\uFFFF\uE000-\uF8FF]")
VALID_PUNCT = set("·．.・-－—（）()'’ ")
TWO_CHAR_SURNAMES = (
    "欧阳", "司马", "诸葛", "上官", "张简", "司徒", "尉迟", "令狐",
    "夏侯", "东方", "端木", "慕容", "司空", "南宫", "公孙", "皇甫",
    "许张", "吴郭", "陈林", "林陈", "李王", "陈黄", "王陈", "黄陈",
)

def flagged(name: str) -> list[str]:
    hits = []
    if any(component in name for component in KNOWN_COMPONENTS):
        hits.append("possible-split-glyph")
    if "干" in name:
        hits.append("gan-name-verify")
    if SUSPICIOUS_UNICODE.search(name):
        hits.append("invalid-or-private-use-unicode")
    if any(unicodedata.category(c).startswith("C") for c in name):
        hits.append("control-or-surrogate")
    if any(not ("\u3400" <= c <= "\u9fff" or "\U00020000" <= c <= "\U0003134f" or c in VALID_PUNCT) for c in name):
        hits.append("nonstandard-name-character")
    if len(name) > 3 and name[:2] not in TWO_CHAR_SURNAMES and not any(c in name for c in VALID_PUNCT):
        hits.append("long-name-review")
    return hits

def main():
    summary = []
    issues = defaultdict(list)
    all_records = 0
    for year in YEARS:
        path = ROOT / f"assets/history-legislative-{year}.json"
        snapshot = json.loads(path.read_text(encoding="utf8"))
        records = [r for r in snapshot["candidacies"] if ":party:" not in r["contest_id"]]
        all_records += len(records)
        seen = set()
        for row in records:
            name = row["candidate_name"]
            key = (name, row.get("contest_id", ""), row.get("ballot_number", ""))
            if key in seen:
                continue
            seen.add(key)
            for kind in flagged(name):
                issues[kind].append({
                    "year": year, "name": name, "votes": row["votes"],
                    "district": row["contest_id"].split(":")[-1],
                    "number": row.get("ballot_number") or "",
                })
        summary.append((year, len(records), len(set(x["candidate_name"] for x in records))))
    print("# 1992—2024 立法机构民代候选人姓名异常初筛")
    print()
    print("本报告只生成复核线索；没有独立证据不得批量改写人名。")
    print()
    print("| 年份 | 候选人记录 | 不重复姓名 |")
    print("|---|---:|---:|")
    for year, count, names in summary:
        print(f"| {year} | {count} | {names} |")
    print(f"| **合计** | **{all_records}** | — |")
    print()
    for kind in ("possible-split-glyph", "gan-name-verify", "invalid-or-private-use-unicode", "control-or-surrogate", "nonstandard-name-character", "long-name-review"):
        items = issues[kind]
        print(f"## {kind}（{len(items)} 条）")
        for item in items:
            print(f"- {item['year']} {item['name']} ｜ {item['district']} ｜ {item['number']}号 ｜ {item['votes']} 票")
        if not items:
            print("- 无")
        print()
    if "--strict" in sys.argv and (issues["possible-split-glyph"] or issues["invalid-or-private-use-unicode"] or issues["control-or-surrogate"]):
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
