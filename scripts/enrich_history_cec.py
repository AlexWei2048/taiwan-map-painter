#!/usr/bin/env python3
"""Enrich 2022 history using original CEC voteData files, with strict joins and vote checks.

Never infer a candidate's identity from name alone. Unmatched/ambiguous fields stay null.
The underlying vote counts, winner marks and geography remain unchanged.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path

from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_URL = "https://data.cec.gov.tw/%E9%81%B8%E8%88%89%E8%B3%87%E6%96%99%E5%BA%AB/votedata.zip"
SNAPSHOT = ROOT / "assets/history-2022.json"
REPORT = ROOT / "sources/history-2022-cec-enrichment-report.json"
PREFIX = "2022-111年地方公職人員選舉/"
CATEGORIES = {
    "C1/city": ("mayor", "regional"), "C1/prv": ("mayor", "regional"),
    "T1/city": ("council", "regional"), "T1/prv": ("council", "regional"),
    "T2/city": ("council", "plains"), "T2/prv": ("council", "plains"),
    "T3/city": ("council", "mountain"), "T3/prv": ("council", "mountain"),
    "D1": ("township", "regional"), "D2": ("township", "mountain"),
}
cc = OpenCC("t2s")


def norm(value):
    return re.sub(r"\s+", "", cc.convert(str(value or "").strip()))


def ballot(value):
    value = str(value or "").strip()
    return str(int(value)) if value.isdigit() else value


def source_rows(archive, category, basename):
    matches = [n for n in archive.namelist() if PREFIX in n and n.endswith("/" + category + "/" + basename)]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one {category}/{basename}, got {len(matches)}: {matches[:3]}")
    data = archive.read(matches[0]).decode("utf-8-sig")
    return [row for row in __import__("csv").reader(io.StringIO(data)) if row], matches[0]


def code_key(row):
    return tuple(str(x).strip() for x in row[:5])


def source_profiles(archive):
    profiles = collections.defaultdict(list)
    stats = {}
    source_files = []
    expected = 0
    for category, (office, electorate) in CATEGORIES.items():
        base, base_path = source_rows(archive, category, "elbase.csv")
        cand, cand_path = source_rows(archive, category, "elcand.csv")
        prof, prof_path = source_rows(archive, category, "elprof.csv")
        source_files.extend([base_path, cand_path, prof_path])
        county_names = {}
        town_names = {}
        for row in base:
            if len(row) < 6:
                continue
            a, b, election, town, village, label = row[:6]
            if a == "00":
                continue
            if election == "00" and town == "000" and village == "0000":
                county_names[(a, b)] = norm(label)
            elif election == "00" and town != "000" and village == "0000":
                town_names[(a, b, town)] = norm(label)
        for row in cand:
            if len(row) < 15:
                raise ValueError("Truncated CEC candidate row " + repr((category, row)))
            county = county_names.get((row[0], row[1]))
            if not county:
                raise ValueError("Unknown CEC county " + repr((category, row[:2])))
            gender = {"1": "男", "2": "女"}.get(row[8])
            incumbent = {"Y": True, "N": False}.get(row[13])
            if gender is None or incumbent is None:
                raise ValueError("Unexpected CEC profile codes " + repr((category, row[8], row[13])))
            town = town_names.get((row[0], row[1], row[3]), "")
            key = (office, electorate, county, norm(row[6]), ballot(row[5]))
            records = profiles[key]
            records.append({
                "gender": gender, "incumbent": incumbent, "town": town,
                "source_category": category, "geo": tuple(row[:5]),
                "raw_name": row[6],
            })
            expected += 1
        for row in prof:
            if len(row) < 10 or row[5] not in ("0000", "0"):
                continue
            loc = code_key(row)
            if office == "mayor":
                if loc[2:] != ("00", "000", "0000"):
                    continue
            elif office == "council":
                if loc[2] == "00" or loc[3:] != ("000", "0000"):
                    continue
            else:
                if loc[3] == "000" or loc[4] != "0000" or loc[2] != "00":
                    continue
            k = (category, loc[0], loc[1], loc[2], loc[3])
            vals = tuple(int(str(row[i]).replace(",", "")) for i in (6, 7, 8, 9))
            if k in stats and stats[k] != vals:
                raise ValueError("Conflicting official aggregate " + repr(k))
            stats[k] = vals
    return profiles, stats, expected, source_files


def match_profiles(snapshot, profiles):
    contests = {x["contest_id"]: x for x in snapshot["contests"]}
    matches, ambiguities, not_found = {}, [], []
    for cand in snapshot["candidacies"]:
        contest = contests[cand["contest_id"]]
        office = contest["election_id"].split("-")[1]
        key = (office, contest["electorate"], norm(contest["county_name"]),
               norm(cand["candidate_name"]), ballot(cand["ballot_number"]))
        found = profiles.get(key, [])
        if len(found) > 1 and office == "township":
            found = [x for x in found if x["town"] == norm(contest["district_name"])]
        if len(found) != 1:
            record = {"contest_id": cand["contest_id"], "name": cand["candidate_name"],
                      "ballot": cand["ballot_number"], "office": office, "matches": len(found)}
            (ambiguities if found else not_found).append(record)
            continue
        match = found[0]
        matches[cand["candidacy_id"]] = match
        if cand.get("gender") not in ("", None, match["gender"]):
            raise ValueError("Conflicting gender: " + repr(key))
        if cand.get("incumbent_at_election") not in (None, match["incumbent"]):
            raise ValueError("Conflicting incumbent: " + repr(key))
        cand["gender"] = match["gender"]
        cand["incumbent_at_election"] = match["incumbent"]
    return matches, ambiguities, not_found


def enrich_stats(snapshot, matches, stats):
    stats_updated = []
    stats_missing = []
    candidate_contests = collections.defaultdict(list)
    for cand in snapshot["candidacies"]:
        candidate_contests[cand["contest_id"]].append(cand)
    for contest in snapshot["contests"]:
        candidates = candidate_contests[contest["contest_id"]]
        found = [matches[x["candidacy_id"]] for x in candidates if x["candidacy_id"] in matches]
        keys = set()
        for record in found:
            category = record["source_category"]
            a, b, district, town, _ = record["geo"]
            office = contest["election_id"].split("-")[1]
            if office == "mayor":
                keys.add((category, a, b, "00", "000"))
            elif office == "council":
                keys.add((category, a, b, district, "000"))
            else:
                keys.add((category, a, b, "00", town))
        key = next(iter(keys)) if len(keys) == 1 else None
        official = stats.get(key) if key else None
        if official is None:
            stats_missing.append((contest["contest_id"], "no unique official aggregate", len(keys)))
            continue
        valid, invalid, cast, registered = official
        if (valid != contest["valid_votes"] or valid + invalid != cast or cast > registered):
            stats_missing.append((contest["contest_id"], "aggregate failed reconciliation",
                                  [valid, contest["valid_votes"], invalid, cast, registered]))
            continue
        if any(contest.get(k) not in (None, v) for k, v in
               (("registered_voters", registered), ("ballots_cast", cast), ("invalid_votes", invalid))):
            raise ValueError("Conflicting existing CEC tally: " + contest["contest_id"])
        contest["registered_voters"] = registered
        contest["ballots_cast"] = cast
        contest["invalid_votes"] = invalid
        stats_updated.append(contest["contest_id"])
    return stats_updated, stats_missing


def enrich_rows(snapshot):
    contests = {x["contest_id"]: x for x in snapshot["contests"]}
    lookup = collections.defaultdict(set)
    for c in snapshot["candidacies"]:
        if not c.get("gender") or not isinstance(c.get("incumbent_at_election"), bool):
            continue
        contest = contests[c["contest_id"]]
        key = (contest["election_id"].split("-")[1], contest["electorate"],
               norm(contest["county_name"]), norm(c["candidate_name"]), ballot(c["ballot_number"]))
        lookup[key].add((c["gender"], c["incumbent_at_election"]))
    filled = 0
    for row in snapshot["rows"]:
        key = (row["type"], row["electorate"], norm(row["county"]), norm(row["name"]), ballot(row["number"]))
        candidates = lookup.get(key, set())
        if len(candidates) != 1:
            continue
        gender, incumbent = next(iter(candidates))
        if row.get("gender") not in ("", None, gender) or row.get("incumbent") not in (None, incumbent):
            raise ValueError("Conflicting history row: " + repr(key))
        row["gender"] = gender
        row["incumbent"] = incumbent
        filled += 1
    return filled


def run(archive_path=None, output=SNAPSHOT, report_path=REPORT, audit_only=False):
    if archive_path:
        payload = Path(archive_path).read_bytes()
    else:
        req = urllib.request.Request(ARCHIVE_URL, headers={"User-Agent": "Island-Palette/CEC-2022-enrichment"})
        with urllib.request.urlopen(req, timeout=180) as handle:
            payload = handle.read()
    digest = hashlib.sha256(payload).hexdigest()
    with zipfile.ZipFile(io.BytesIO(payload)) as z:
        profiles, stats, official_count, files = source_profiles(z)
    snapshot = json.loads(Path(output).read_text(encoding="utf-8"))
    baseline_votes = sum(c["votes"] for c in snapshot["candidacies"])
    matches, ambiguous, missing = match_profiles(snapshot, profiles)
    updated, stats_missing = enrich_stats(snapshot, matches, stats)
    filled_rows = enrich_rows(snapshot)
    assert sum(c["votes"] for c in snapshot["candidacies"]) == baseline_votes
    totals = {
        "officialCandidateRows": official_count, "snapshotCandidacies": len(snapshot["candidacies"]),
        "matchedCandidacies": len(matches), "unmatchedCandidacies": len(missing),
        "ambiguousCandidacies": len(ambiguous), "updatedContestStats": len(updated),
        "unmatchedContestStats": len(stats_missing), "filledCandidateRows": filled_rows,
        "totalCandidateRows": len(snapshot["rows"]),
        "missingGender": sum(not c.get("gender") for c in snapshot["candidacies"]),
        "missingIncumbent": sum(c.get("incumbent_at_election") is None for c in snapshot["candidacies"]),
        "missingRegisteredVoters": sum(c["registered_voters"] is None for c in snapshot["contests"]),
    }
    provenance = {
        "source": ARCHIVE_URL, "sha256": digest,
        "downloadedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "archivePaths": files, "sourceLicense": "https://data.gov.tw/license",
    }
    report = {"schemaVersion": 1, "year": 2022, "summary": totals, "provenance": provenance,
              "unmatchedCandidates": missing[:100], "ambiguousCandidates": ambiguous[:100],
              "unmatchedContestStats": stats_missing[:100]}
    print("CEC_ENRICHMENT_REPORT", json.dumps(totals, ensure_ascii=False), flush=True)
    print("MISSING_CANDIDATES", json.dumps(missing[:12], ensure_ascii=False), flush=True)
    print("MISSING_CONTESTS", json.dumps(stats_missing[:12], ensure_ascii=False), flush=True)
    if audit_only:
        return report
    if len(matches) < 2000 or len(updated) < 300:
        raise ValueError("Insufficient verified official coverage; refusing to publish snapshot")
    if "enrichments" not in snapshot["provenance"]:
        snapshot["provenance"]["enrichments"] = []
    snapshot["provenance"]["enrichments"] = [
        item for item in snapshot["provenance"]["enrichments"]
        if item.get("source") != ARCHIVE_URL
    ] + [provenance]
    Path(output).write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--audit-only", action="store_true")
    opts = parser.parse_args()
    run(opts.archive, audit_only=opts.audit_only)
