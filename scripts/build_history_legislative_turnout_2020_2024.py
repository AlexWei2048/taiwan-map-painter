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
    district_towns = {}
    district_labels = {}
    for row in base_rows:
        if len(row) < 6:
            continue
        p, c, district, town, village, label = [str(x).strip() for x in row[:6]]
        if not p or p == "00" and c == "000":
            continue
        if town == "000" and village == "0000" and district == "00":
            counties[(p, c)] = norm(label).split(" ")[0]
        if town != "000" and village == "0000":
            if district == "00":
                towns[(p, c, town)] = norm(label).split(" ")[-1]
            else:
                district_towns[(p, c, district, town)] = norm(label).split(" ")[-1]
        if district != "00" and town == "000" and village == "0000":
            district_labels[(p, c, district)] = norm(label)
    return counties, towns, district_labels, district_towns


def verified_profiles(year, ballot):
    # 2024 CEC source spells the source of administrative codes elbese.csv.
    base_file = "elbese.csv" if year == 2024 and ballot == "regional" else "elbase.csv"
    urls = {name: source(year, ballot, filename)
            for name, filename in (("elbase", base_file), ("elprof", "elprof.csv"))}
    raw = {name: download(url) for name, url in urls.items()}
    counties, towns, district_labels, district_towns = read_names(parse_csv(raw["elbase"]))
    totals = candidate_votes(year, ballot)
    seen = defaultdict(list)
    audit = Counter()
    town_portions = {}

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
                if ballot == "regional" and district not in ("00", ""):
                    # The modern regional files partition administrative towns
                    # by electoral constituency. Sum only disjoint subtotal
                    # records (village=0000, poll=0000) before verification.
                    code = (p, c, district, town)
                    name = district_towns.get(code)
                    if village != "0000" or poll != "0000" or not name:
                        raise ValueError(f"{year}: unexpected regional town subtotal {row}")
                    if code in town_portions:
                        raise ValueError(f"{year}: duplicate regional town subtotal {code}")
                    town_portions[code] = ((county, name), (registered, cast, valid, invalid))
                    continue
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

    if ballot == "regional":
        if set(town_portions) != set(district_towns) or len(town_portions) != 380:
            raise ValueError(f"{year}: incomplete regional district-town subtotals")
        combined = defaultdict(lambda: [0, 0, 0, 0])
        for (county, name), record in town_portions.values():
            key = ("town", county, name)
            combined[key] = [a + b for a, b in zip(combined[key], record)]
        expected = {k for k in totals if k[0] == "town"}
        if set(combined) != expected or len(combined) != 368:
            raise ValueError(f"{year}: incomplete regional town coverage")
        for key, record in combined.items():
            if record[2] != totals[key]:
                raise ValueError(f"{year}: regional town candidate vote mismatch {key}")
            if key in seen:
                raise ValueError(f"{year}: overlapping regional town subtotal {key}")
            seen[key].append(tuple(record))
            audit["reconciled"] += 1
        audit["district_town_portions"] = len(town_portions)

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
    if ballot == "regional":
        if set(data["town"]) != set(data["county"]) or len(data["county"]) != 22:
            raise ValueError(f"{year}: incomplete regional county coverage")
        for county, rows in data["town"].items():
            subtotal = [sum(record[i] for record in rows.values()) for i in range(4)]
            if subtotal != data["county"][county]:
                raise ValueError(f"{year}: regional county reconciliation failed {county}")
        if sum(len(v) for v in data["town"].values()) != 368:
            raise ValueError(f"{year}: incomplete regional town output")
    return data, {"source_url": urls, "source_sha256": {k: hashlib.sha256(v).hexdigest()
      for k, v in raw.items()}, "profile_matches": dict(audit),
      "note": "Valid ballots must exactly match independent site candidates for this geographic grain."}


def main():
    for year in YEARS:
        document = {"schemaVersion": 1, "year": year,
                    "source": "Central Election Commission elbase/elprof via kiang/db.cec.gov.tw",
                    "source_repo": "https://github.com/kiang/db.cec.gov.tw",
                    "ballots": {}, "audit": {}}
        target = ROOT / f"assets/history-legislative-turnout-{year}.json"
        existing = json.loads(target.read_text(encoding="utf-8")) if target.is_file() else None
        for ballot in KINDS:
            # Preserve previously curated non-regional profiles (including
            # archive corrections and zero-voter entries). This repair only
            # rebuilds regional legislative turnout on an existing snapshot.
            if existing is not None and ballot != "regional" and ballot in existing["ballots"]:
                document["ballots"][ballot] = existing["ballots"][ballot]
                document["audit"][ballot] = existing.get("audit", {}).get(ballot, {})
                print(year, ballot, "preserved existing verified profiles", flush=True)
                continue
            record, audit = verified_profiles(year, ballot)
            document["ballots"][ballot] = record
            document["audit"][ballot] = audit
            print(year, ballot, audit["profile_matches"], flush=True)
        if existing is not None:
            # Do not silently overwrite any previously verified profile.
            for ballot, profiles in existing["ballots"].items():
                for scope, old_records in profiles.items():
                    new_records = document["ballots"][ballot][scope]
                    if scope == "national":
                        if old_records and old_records != new_records:
                            raise ValueError(f"{year} {ballot}: national profile changed")
                    elif scope == "county":
                        if any(new_records.get(k) != v for k, v in old_records.items()):
                            raise ValueError(f"{year} {ballot}: existing county profile changed")
                    else:
                        for county, rows in old_records.items():
                            if any(new_records.get(county, {}).get(k) != v for k, v in rows.items()):
                                raise ValueError(f"{year} {ballot}: existing {scope} profile changed")
            for ballot, audit in existing.get("audit", {}).items():
                if "townReconciliation" in audit:
                    document["audit"][ballot]["townReconciliation"] = audit["townReconciliation"]
        target.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n")
        print("Wrote", target.name, "bytes", target.stat().st_size, flush=True)


if __name__ == "__main__":
    main()
