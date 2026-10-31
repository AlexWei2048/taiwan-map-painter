#!/usr/bin/env python3
"""Build a verified 2022 election snapshot from the CEC-derived CSV catalog.
Credit: CEC election database (ODGL v1), taiwanvotes.tw (CC BY 4.0).
"""
import csv
import io
import json
import re
import urllib.parse
from collections import defaultdict
from pathlib import Path

import requests
from bs4 import BeautifulSoup

CATALOG = "https://www.taiwanvotes.tw/download/"
PREFIX = {
    "縣市長": ("mayor", "regional"),
    "縣市議員": ("council", "regional"),
    "平地原住民議員": ("council", "plains"),
    "山地原住民議員": ("council", "mountain"),
    "鄉鎮市長": ("township", "regional"),
    "原住民區長": ("township", "mountain"),
}
FIELDS = {
    "county": "縣市", "town": "鄉鎮市區", "village": "村里",
    "district": "選區", "number": "號次", "name": "候選人",
    "party": "政黨", "votes": "得票數", "elected": "當選註記",
}
session = requests.Session()
session.headers["User-Agent"] = "Taiwan-map-painter/2022 historical election visualization (open data research)"


def response_text(url):
    response = session.get(url, timeout=45)
    response.raise_for_status()
    response.encoding = "utf-8-sig"
    return response.text


def fetch_urls():
    html = response_text(CATALOG)
    soup = BeautifulSoup(html, "html.parser")
    files = []
    seen = set()
    for link in soup.find_all("a", href=True):
        href = urllib.parse.urljoin(CATALOG, link["href"])
        filename = urllib.parse.unquote(urllib.parse.urlparse(href).path.rsplit("/", 1)[-1])
        for prefix, (office, electorate) in PREFIX.items():
            if filename.startswith(prefix + "_2022_") and filename.endswith(".csv"):
                if filename not in seen:
                    seen.add(filename)
                    files.append((href, filename, office, electorate))
    if len(files) < 55:
        raise RuntimeError(f"Expected 2022 election CSV coverage, found only {len(files)}")
    return files


def compact(rows, office, electorate):
    # Files contain the smallest reported geographic granularity (typically villages).
    # Aggregate once per candidate and territorial scope, avoiding double-counting.
    total = defaultdict(int)
    annotations = defaultdict(bool)
    for row in rows:
        if not row or not row.get(FIELDS["county"]) or not row.get(FIELDS["name"]):
            continue
        try:
            votes = int(str(row.get(FIELDS["votes"], "")).replace(",", ""))
        except ValueError:
            continue
        base = [
            row.get("縣市", "").strip(), row.get("鄉鎮市區", "").strip(),
            row.get("選區", "").strip(), row.get("號次", "").strip(),
            row.get("候選人", "").strip(), row.get("政黨", "").strip(),
        ]
        if office == "mayor":
            levels = ["county", "town"]
        elif office == "council":
            levels = ["district", "town"]
        else:
            levels = ["town"]
        for level in levels:
            # All villages belonging to the same electoral district are summed.
            county, town, district, number, name, party = base
            key = (office, electorate, level, county,
                   "" if level in ("county", "district") else town,
                   "" if level == "county" else district,
                   number, name, party)
            total[key] += votes
            annotations[key] |= "＊" in row.get("當選註記", "") or "*" in row.get("當選註記", "")
    return [
        dict(zip(("type", "electorate", "level", "county", "town", "district",
                  "number", "name", "party"), key),
             votes=value, elected=annotations[key])
        for key, value in total.items()
    ]


def main():
    files = fetch_urls()
    rows, downloaded, failures = [], [], []
    for i, (url, filename, office, electorate) in enumerate(files, 1):
        try:
            entries = list(csv.DictReader(io.StringIO(response_text(url))))
            compacted = compact(entries, office, electorate)
            if not compacted:
                raise ValueError("No recognizable vote rows")
            rows.extend(compacted)
            downloaded.append(filename)
            print(f"{i}/{len(files)} {filename}: {len(compacted)} summaries", flush=True)
        except Exception as exc:
            failures.append(f"{filename}: {exc}")
            print("FAILED", filename, exc, flush=True)
    if failures or len(downloaded) < 55:
        raise RuntimeError("Snapshot incomplete; not publishing. " + " | ".join(failures[:12]))
    output = Path("assets/history-2022.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({
        "year": 2022, "source": "Central Election Commission election database",
        "derivedFrom": "https://www.taiwanvotes.tw/download/",
        "sourceLicense": "https://data.gov.tw/license",
        "derivedLicense": "https://creativecommons.org/licenses/by/4.0/",
        "files": len(downloaded), "rows": rows
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("Published", output, "rows", len(rows))


if __name__ == "__main__":
    main()
