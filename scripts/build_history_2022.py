#!/usr/bin/env python3
"""Build an atomic, versioned 2022 election snapshot."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import tempfile
import urllib.parse
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
CATALOG = "https://www.taiwanvotes.tw/download/"
OUTPUT = ROOT / "assets/history-2022.json"
MANIFEST = ROOT / "sources/history-2022-manifest.json"
PREFIX = {
    "縣市長": ("mayor", "regional"),
    "縣市議員": ("council", "regional"),
    "平地原住民議員": ("council", "plains"),
    "山地原住民議員": ("council", "mountain"),
    "鄉鎮市長": ("township", "regional"),
    "原住民區長": ("township", "mountain"),
}
OFFICE_LEVEL = {"mayor": "county", "council": "district", "township": "town"}
CONVERTER = OpenCC("t2s")
session = requests.Session()
session.headers["User-Agent"] = "Island-Palette/2022-history (public election data research)"


def simplify(value: Any) -> str:
    return CONVERTER.convert(str(value or "")).strip()


def response_bytes(url: str) -> bytes:
    response = session.get(url, timeout=60)
    response.raise_for_status()
    return response.content


def fetch_urls() -> list[tuple[str, str, str, str]]:
    soup = BeautifulSoup(response_bytes(CATALOG), "html.parser")
    files, seen = [], set()
    for link in soup.find_all("a", href=True):
        href = urllib.parse.urljoin(CATALOG, link["href"])
        filename = urllib.parse.unquote(urllib.parse.urlparse(href).path.rsplit("/", 1)[-1])
        for prefix, (office, electorate) in PREFIX.items():
            if filename.startswith(prefix + "_2022_") and filename.endswith(".csv") and filename not in seen:
                seen.add(filename)
                files.append((href, filename, office, electorate))
    if len(files) < 55:
        raise RuntimeError(f"Expected at least 55 2022 election CSV files, found {len(files)}")
    return files


def official_marker(row: dict[str, str]) -> str:
    mark = str(row.get("當選註記", ""))
    if "？" in mark or "?" in mark:
        return "?"
    if "！" in mark or "!" in mark or "婦保" in str(row.get("備註", "")):
        return "!"
    if "＊" in mark or "*" in mark:
        return "*"
    return ""


def compact(rows: list[dict[str, str]], office: str, electorate: str) -> list[dict[str, Any]]:
    total: defaultdict[tuple, int] = defaultdict(int)
    markers: dict[tuple, str] = {}
    rank = {"": 0, "*": 1, "!": 2, "?": 3}
    for row in rows:
        if not row or not row.get("縣市") or not row.get("候選人"):
            continue
        try:
            votes = int(str(row.get("得票數", "")).replace(",", ""))
        except ValueError:
            continue
        base = (
            row.get("縣市", "").strip(), row.get("鄉鎮市區", "").strip(),
            row.get("選區", "").strip(), row.get("號次", "").strip(),
            row.get("候選人", "").strip(), row.get("政黨", "").strip(),
            row.get("性別", "").strip(),
        )
        levels = ["county", "town"] if office == "mayor" else ["district", "town"] if office == "council" else ["town"]
        for level in levels:
            county, town, district, number, name, party, gender = base
            key = (
                office, electorate, level, county,
                "" if level in ("county", "district") else town,
                "" if level == "county" else district,
                number, name, party, gender,
            )
            total[key] += votes
            marker = official_marker(row)
            if rank[marker] > rank.get(markers.get(key, ""), 0):
                markers[key] = marker
    fields = ("type", "electorate", "level", "county", "town", "district", "number", "name", "party", "gender")
    return [
        dict(zip(fields, key), votes=votes, elected=markers.get(key, "") in ("*", "!"),
             electedMark=markers.get(key, ""))
        for key, votes in total.items()
    ]


def geography_indexes() -> tuple[dict[str, str], dict[tuple[str, str], str]]:
    data = json.loads((ROOT / "assets/map-base.json").read_text(encoding="utf-8"))
    counties = {simplify(item["name"]): item["id"] for item in data["counties"]}
    towns = {(simplify(item["county"]), simplify(item["name"])): item["id"] for item in data["towns"]}
    return counties, towns


def district_indexes() -> dict[tuple[str, str, str], dict[str, Any]]:
    raw = json.loads((ROOT / "assets/history-council-districts-2022.json").read_text(encoding="utf-8"))
    return {
        (simplify(item["county"]), item["electorate"], str(item["number"])): item
        for item in raw["rows"]
    }


def district_number(value: str) -> str:
    match = re.search(r"第\s*0*(\d+)\s*(?:選|选)(?:舉|举)?(?:區|区)", value or "")
    return str(int(match.group(1))) if match else ""


def stable_hash(*parts: Any) -> str:
    return hashlib.sha256("|".join(map(str, parts)).encode("utf-8")).hexdigest()[:20]


def entity_model(rows: list[dict[str, Any]], provenance: dict[str, Any]) -> dict[str, Any]:
    county_ids, town_ids = geography_indexes()
    districts = district_indexes()
    elections = [
        {
            "election_id": f"2022-{office}", "year": 2022, "office": office,
            "term": None, "election_date": "2022-11-26",
            "source_name": "台湾地区选举事务主管机构公开资料",
            "source_url": "https://db.cec.gov.tw/",
            "boundary_version": "2022", "lowest_data_level": "village",
        }
        for office in ("mayor", "council", "township")
    ]
    contest_map: dict[tuple, dict[str, Any]] = {}
    candidacies = []
    primary = [r for r in rows if r["level"] == OFFICE_LEVEL[r["type"]]]
    for row in primary:
        county = simplify(row["county"])
        town = simplify(row["town"])
        number = district_number(row["district"])
        county_id = county_ids.get(county) or "county-" + stable_hash(county)
        if row["type"] == "mayor":
            contest_key = ("mayor", county_id)
            contest_id = f"2022-mayor:{county_id}"
            district_id, district_name, seats, reserved = county_id, county, 1, 0
        elif row["type"] == "council":
            meta = districts.get((county, row["electorate"], number), {})
            raw_id = meta.get("id") or f"{county}:{row['electorate']}:{row['district']}"
            contest_key = ("council", raw_id)
            contest_id = "2022-council:" + stable_hash(raw_id)
            district_id = raw_id
            district_name = simplify(meta.get("name") or row["district"])
            seats = int(meta.get("seats") or 0)
            reserved = int(meta.get("womenReserved") or 0)
        else:
            town_id = town_ids.get((county, town)) or "town-" + stable_hash(county, town)
            contest_key = ("township", row["electorate"], town_id)
            contest_id = f"2022-township:{row['electorate']}:{town_id}"
            district_id, district_name, seats, reserved = town_id, town, 1, 0
        if contest_key not in contest_map:
            contest_map[contest_key] = {
                "contest_id": contest_id, "election_id": f"2022-{row['type']}",
                "county_id": county_id, "county_name": county,
                "county_name_official": row["county"], "district_id": district_id,
                "district_name": district_name,
                "district_name_official": row["district"] or row["town"] or row["county"],
                "scope_names": [], "seats": seats, "reserved_seats": reserved,
                "electorate": row["electorate"], "registered_voters": None,
                "ballots_cast": None, "valid_votes": None, "invalid_votes": None,
            }
        mark = row.get("electedMark", "")
        candidacies.append({
            "candidacy_id": "cand-" + stable_hash(contest_id, row["number"], row["name"]),
            "candidate_id": None, "contest_id": contest_id,
            "ballot_number": str(row["number"]), "candidate_name": simplify(row["name"]),
            "candidate_name_official": row["name"], "gender": simplify(row["gender"]),
            "incumbent_at_election": None, "party_id": None,
            "party_name": simplify(row["party"] or "無黨籍"),
            "party_name_official": row["party"] or "無黨籍",
            "votes": int(row["votes"]), "vote_share": None,
            "elected_official": mark in ("*", "!"), "elected_mark": mark,
        })
    by_contest: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in candidacies:
        by_contest[item["contest_id"]].append(item)
    for contest in contest_map.values():
        total = sum(item["votes"] for item in by_contest[contest["contest_id"]])
        contest["valid_votes"] = total
        for item in by_contest[contest["contest_id"]]:
            item["vote_share"] = round(item["votes"] / total * 100, 6) if total else 0.0
    return {
        "schemaVersion": 2, "year": 2022,
        "elections": elections, "contests": list(contest_map.values()),
        "candidacies": candidacies, "rows": rows, "provenance": provenance,
    }


def validate_snapshot(snapshot: dict[str, Any]) -> None:
    if snapshot.get("schemaVersion") != 2:
        raise ValueError("History schema version must be 2")
    if len(snapshot.get("elections", [])) != 3:
        raise ValueError("Expected three 2022 election groups")
    if len(snapshot.get("provenance", {}).get("files", [])) < 55:
        raise ValueError("Source coverage is incomplete")
    contests = {c["contest_id"]: c for c in snapshot.get("contests", [])}
    if len(contests) < 300 or len(snapshot.get("candidacies", [])) < 2000:
        raise ValueError("Entity snapshot is incomplete")
    for item in snapshot["candidacies"]:
        if item["contest_id"] not in contests:
            raise ValueError(f"Unknown contest for {item['candidacy_id']}")
        if item["elected_mark"] not in ("", "*", "!", "?"):
            raise ValueError("Unknown official winner marker")
    for contest_id, contest in contests.items():
        total = sum(c["votes"] for c in snapshot["candidacies"] if c["contest_id"] == contest_id)
        if contest["valid_votes"] != total:
            raise ValueError(f"Vote reconciliation failed for {contest_id}")


def atomic_json(value: dict[str, Any], output: Path, *, pretty: bool = False) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(prefix=output.name + ".", suffix=".tmp", dir=output.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2 if pretty else None,
                      separators=None if pretty else (",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, output)
    except BaseException:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def write_snapshot_atomic(snapshot: dict[str, Any], output: Path) -> None:
    atomic_json(snapshot, output)


def write_manifest_atomic(manifest: dict[str, Any], output: Path) -> None:
    atomic_json(manifest, output, pretty=True)


def build_snapshot() -> tuple[dict[str, Any], dict[str, Any]]:
    all_rows, source_files = [], []
    files = fetch_urls()
    for index, (url, filename, office, electorate) in enumerate(files, 1):
        payload = response_bytes(url)
        entries = list(csv.DictReader(io.StringIO(payload.decode("utf-8-sig"))))
        rows = compact(entries, office, electorate)
        if not rows:
            raise ValueError(f"No recognizable vote rows in {filename}")
        all_rows.extend(rows)
        source_files.append({
            "filename": filename, "url": url,
            "sha256": hashlib.sha256(payload).hexdigest(),
            "office": office, "electorate": electorate,
        })
        print(f"{index}/{len(files)} {filename}: {len(rows)} summaries", flush=True)
    manifest = {
        "schemaVersion": 2, "year": 2022,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "catalog": CATALOG, "files": source_files,
        "sourceLicense": "https://data.gov.tw/license",
        "derivedLicense": "https://creativecommons.org/licenses/by/4.0/",
    }
    snapshot = entity_model(all_rows, manifest)
    validate_snapshot(snapshot)
    return snapshot, manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-existing", action="store_true")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    args = parser.parse_args()
    if args.verify_existing:
        validate_snapshot(json.loads(args.output.read_text(encoding="utf-8")))
        print(f"Verified {args.output}")
        return
    snapshot, manifest = build_snapshot()
    write_snapshot_atomic(snapshot, args.output)
    write_manifest_atomic(manifest, args.manifest)
    print(f"Published {args.output}: {len(snapshot['contests'])} contests, {len(snapshot['candidacies'])} candidacies")


if __name__ == "__main__":
    main()
