#!/usr/bin/env python3
"""Reconcile CEC elprof ballot statistics for the 2020/2024 legislative maps.

Uses original CEC elbase/elprof files mirrored without data modification at
kiang/db.cec.gov.tw. A record is published ONLY if registered >= cast,
cast == valid + invalid, AND valid matches the independently assembled
candidate/party votes for the exact ballot and geography.
"""
from __future__ import annotations
import csv
import hashlib
import io
import json
import time
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://raw.githubusercontent.com/kiang/db.cec.gov.tw/master/voteData"
YEARS = (2020, 2024)
KINDS = {"regional": "區域立委", "plains": "平地立委",
         "mountain": "山地立委", "party": "不分區政黨"}
T2S = OpenCC("t2s")


def norm(value):
    return T2S.convert(str(value or "").replace("臺", "台")).strip()


def download(url):
    for attempt in range(3):
        try:
            req = Request(url, headers={"User-Agent": "IslandPalette-CEC-Archive-Audit/1.0"})
            with urlopen(req, timeout=75) as stream:
                return stream.read()
        except Exception as err:
            if attempt == 2:
                raise RuntimeError(f"Cannot read {url}: {err}") from err
            time.sleep(3 * (attempt + 1))


def source(year, ballot, filename):
    parts = [f"{year}總統立委", KINDS[ballot], filename]
    return BASE + "/" + "/".join(quote(p, safe="") for p in parts)


def parse_csv(raw):
    # Modern CEC files use UTF-8 and sometimes carry a UTF-8 BOM.
    return list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))


def district_num(value):
    import re
    match = re.search(r"(?:第)?0*(\d+)\s*(?:選(?:舉)?區|选(?:举)?区)?$", str(value or ""))
    return str(int(match.group(1))) if match else ""


def candidate_votes(year, ballot):
    data = json.loads((ROOT / f"assets/history-legislative-{year}.json").read_text())
    totals = defaultdict(int)
    for row in data["rows"]:
        if row.get("electorate") != ballot:
            continue
        level = row.get("level")
        county = norm(row.get("county"))
        if level == "national":
            key = ("national", "", "")
        elif level == "county":
            key = ("county", county, "")
        elif level == "town":
            key = ("town", county, norm(row.get("town")))
        elif level == "district":
            key = ("district", county, district_num(row.get("district")))
        else:
            continue
        totals[key] += int(row["votes"])
    return totals


def read_names(base_rows):
    counties = {}
    towns = {}
    district_labels = {}
    for row in base_rows:
        if len(row) < 6:
            continue
        p, c, district, town, village, label = [str(x).strip() for x in row[:6]]
        if not p or c == "000":
            continue
        if town == "000" and village == "0000" and district == "00":
            counties[(p, c)] = norm(label).split(" ")[0]
        if town != "000" and village == "0000" and district == "00":
            towns[(p, c, town)] = norm(label).split(" ")[-1]
        if district != "00" and town == "000" and village == "0000":
            district_labels[(p, c, district)] = norm(label)
    return counties, towns, district_labels


def verified_profiles(year, ballot):
    # 2024 CEC source spells the source of administrative codes elbese.csv.
    base_file = "elbese.csv" if year == 2024 else "elbase.csv"
    urls = {name: source(year, ballot, filename)
            for name, filename in (("elbase", base_file), ("elprof", "elprof.csv"))}
    raw = {name: download(url) for name, url in urls.items()}
    counties, towns, district_labels = read_names(parse_csv(raw["elbase"]))
    totals = candidate_votes(year, ballot)
    seen = defaultdict(list)
    audit = Counter()

    for row in parse_csv(raw["elprof"]):
        if len(row) < 10:
            audit["malformed"] += 1
            continue
        p, c, district, town, village, poll = (s.strip() for s in row[:6])
        if poll not in ("", "0", "0000") or village not in ("0000", ""):
            continue
        try:
            valid, invalid, cast, registered = (int(row[k].strip()) for k in (6, 7, 8, 9))
        except (ValueError, IndexError):
            audit["invalid_number"] += 1
            continue
        if registered <= 0 or registered < cast or cast != valid + invalid or valid < 0 or invalid < 0:
            audit["invalid_arithmetic"] += 1
            continue

        candidates = []
        if c == "000" and p in ("00", "0"):
            candidates = [("national", "", "")]
        else:
            county = counties.get((p, c))
            if not county:
                audit["unknown_county"] += 1
                continue
            if town not in ("000", ""):
                name = towns.get((p, c, town))
                if name:
                    candidates = [("town", county, name)]
            elif district not in ("00", ""):
                # Some CEC files expose a county-level summary under a
                # district code; let validated candidate counts disambiguate.
                n = district_num(district_labels.get((p, c, district), district))
                candidates = [("district", county, n)] if n else []
            else:
                candidates = [("county", county, "")]

        record = (registered, cast, valid, invalid)
        for key in candidates:
            if key in totals and totals[key] == valid:
                seen[key].append(record)
                audit["reconciled"] += 1
            else:
                audit["mismatch_or_missing_vote_total"] += 1

    data = {"national": {}, "county": {}, "town": {}, "district": {}}
    for (scope, county, area), records in seen.items():
        unique = set(records)
        if len(unique) != 1:
            audit["ambiguous"] += 1
            continue
        record = list(next(iter(unique)))
        if scope == "national":
            data["national"] = record
        elif scope == "county":
            data["county"][county] = record
        else:
            data[scope].setdefault(county, {})[area] = record
        audit["saved_" + scope] += 1
    return data, {"source_url": urls, "source_sha256": {k: hashlib.sha256(v).hexdigest()
      for k, v in raw.items()}, "profile_matches": dict(audit),
      "note": "Valid ballots must exactly match independent site candidates for this geographic grain."}


def main():
    for year in YEARS:
        document = {"schemaVersion": 1, "year": year,
                    "source": "Central Election Commission elbase/elprof via kiang/db.cec.gov.tw",
                    "source_repo": "https://github.com/kiang/db.cec.gov.tw",
                    "ballots": {}, "audit": {}}
        for ballot in KINDS:
            record, audit = verified_profiles(year, ballot)
            document["ballots"][ballot] = record
            document["audit"][ballot] = audit
            print(year, ballot, audit["profile_matches"], flush=True)
        target = ROOT / f"assets/history-legislative-turnout-{year}.json"
        target.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n")
        print("Wrote", target.name, "bytes", target.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
