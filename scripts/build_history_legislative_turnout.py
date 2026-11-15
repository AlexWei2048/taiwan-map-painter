#!/usr/bin/env python3
"""Build per-county/town/district legislative turnout from CEC-origin profiles.

Source: National University of Kaohsiung's CECDataSet reorganization of CEC
votedata.zip (https://github.com/MISNUK/CECDataSet). Profiles use direct
CEC Voters/BallotsCast/BallotsAccepted/BallotsRejected, not candidate-vote
estimates. Only records whose accepted ballots exactly equal independently
assembled election candidate votes are published. This guards district and
historical naming mismatches, and avoids duplicate aggregate rows.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import time
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import quote

import requests
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://raw.githubusercontent.com/MISNUK/CECDataSet/master/data/"
YEARS = {1995: "03", 1998: "04", 2001: "05", 2004: "06",
         2008: "07", 2012: "08", 2016: "09"}
KINDS = {
    "regional": "區域立法委員選舉",
    "plains": "平地原住民立法委員選舉",
    "mountain": "山地原住民立法委員選舉",
}
cc = OpenCC("t2s")


def simplify(value):
    return cc.convert(str(value or "")).strip()


def district_number(value):
    text = simplify(value)
    m = re.search(r"第\\s*0*(\\d+)\\s*選?舉?區?", text)
    if m:
        return str(int(m.group(1)))
    m = re.search(r"\\d+", text)
    return str(int(m.group())) if m else ""


def source_url(year, electorate):
    folder = f"{year}_第{YEARS[year]}屆{KINDS[electorate]}"
    return SOURCE + quote(folder + "/VoteRegionProfile.csv", safe="/")


def download(session, url):
    for attempt in range(3):
        try:
            response = session.get(url, timeout=65)
            response.raise_for_status()
            return response.content
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(3 + 2 * attempt)
    raise RuntimeError("unexpected fetch failure")


def candidates(year, electorate):
    snap = json.loads((ROOT / f"assets/history-legislative-{year}.json").read_text(encoding="utf-8"))
    totals = defaultdict(int)
    for row in snap["rows"]:
        if row.get("electorate") != electorate:
            continue
        level = row.get("level")
        county = simplify(row.get("county"))
        if level == "national":
            key = ("national", "", "")
        elif level == "county":
            key = ("county", county, "")
        elif level == "town":
            key = ("town", county, simplify(row.get("town")))
        elif level == "district":
            key = ("district", county, district_number(row.get("district")))
        else:
            continue
        totals[key] += int(row["votes"])
    return totals


def extract_profile(source, totals):
    valid = defaultdict(list)
    sample = []
    counts = Counter()
    for raw in csv.DictReader(io.StringIO(source.decode("utf-8-sig"))):
        county = simplify(raw.get("CountyCityName"))
        town = simplify(raw.get("TownshipName"))
        village = simplify(raw.get("VillageName"))
        if village or not county:
            continue
        try:
            poll_no = int(raw.get("PollStationNo") or "0")
            electors = int(raw["Voters"])
            cast = int(raw["BallotsCast"])
            accepted = int(raw["BallotsAccepted"])
            rejected = int(raw["BallotsRejected"])
        except (ValueError, KeyError, TypeError):
            counts["invalid_number"] += 1
            continue
        if poll_no or electors < cast or cast < 0 or accepted < 0 or rejected < 0 or cast != accepted + rejected:
            continue
        district = simplify(raw.get("DistrictName"))
        if county in ("全国", "台闽地区", "全区"):
            key = ("national", "", "")
        elif town:
            key = ("town", county, town)
        elif district and district not in ("0", "00", "-"):
            number = district_number(district)
            if not number:
                continue
            key = ("district", county, number)
        else:
            key = ("county", county, "")
        row = [electors, cast, accepted, rejected]
        valid[key].append(row)
        if len(sample) < 7:
            sample.append((key, row))
    result = {"national": {}, "county": {}, "town": {}, "district": {}}
    for key, values in valid.items():
        scope, county, area = key
        if len(values) != 1:
            counts["ambiguous"] += 1
            continue
        v = values[0]
        if key not in totals:
            counts["no_candidate_scope"] += 1
            continue
        if totals[key] != v[2]:
            counts["valid_votes_mismatch"] += 1
            continue
        if scope == "national":
            result["national"] = v
        elif scope == "county":
            result["county"][county] = v
        else:
            result[scope].setdefault(county, {})[area] = v
        counts[scope] += 1
    return result, counts, sample


def main():
    session = requests.Session()
    session.headers["User-Agent"] = "Island-Palette/2.0 election-data verification"
    for year in YEARS:
        outfile = {"schemaVersion": 1, "year": year,
                   "source": "CEC votedata.zip via MISNUK/CECDataSet",
                   "source_repo": "https://github.com/MISNUK/CECDataSet",
                   "ballots": {}, "audit": {}}
        for electorate in KINDS:
            url = source_url(year, electorate)
            source = download(session, url)
            result, counts, sample = extract_profile(source, candidates(year, electorate))
            outfile["ballots"][electorate] = result
            outfile["audit"][electorate] = {
                "source_url": url,
                "source_sha256": hashlib.sha256(source).hexdigest(),
                "profile_matches": dict(counts),
            }
            print(year, electorate, "matched:", dict(counts), "sample:", sample[:2], flush=True)
        path = ROOT / f"assets/history-legislative-turnout-{year}.json"
        path.write_text(json.dumps(outfile, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print("Wrote", path.name, path.stat().st_size, "bytes", flush=True)


if __name__ == "__main__":
    main()
