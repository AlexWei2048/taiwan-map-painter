#!/usr/bin/env python3
"""Build compact 1992–2024 legislative history shards.

1995 onward uses the source-indexed CEC derivative CSVs published by
taiwanvotes.tw. 1992 candidate totals come from NCCU's CEC archive because
the modern CEC export starts at 1995. Source rows are aggregated to the
smallest map grains the site can render; village rows are not republished.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
INDEX_URL = "https://www.taiwanvotes.tw/data/csv/index.json"
CSV_BASE = "https://www.taiwanvotes.tw/data/csv/"
NCCU_BASE = "https://vote.nccu.edu.tw/cec/"
YEARS = (1992, 1995, 1998, 2001, 2004, 2008, 2012, 2016, 2020, 2024)
SOURCE_TYPES = {
    "regional": "區域立委",
    "plains": "平地原住民立委",
    "mountain": "山地原住民立委",
    "party": "立委不分區政黨票",
}
NCCU_CODES = {"regional": "I", "plains": "J", "mountain": "K"}
CONVERTER = OpenCC("t2s")
USER_AGENT = "Island-Palette/2.0 (public election data verification)"


def simplify(value: object) -> str:
    return CONVERTER.convert(str(value or "")).strip()


def normalize_party(value: object) -> str:
    party = simplify(value)
    return "无党籍" if not party or "无党籍及未经政党推荐" in party else party


def ballot_metadata(year: int, electorate: str) -> dict:
    if electorate != "party":
        labels = {"regional": "区域民代", "plains": "平地少数民族民代", "mountain": "山地少数民族民代"}
        return {"label": labels[electorate], "is_separate_ballot": True, "note": "候选人票"}
    if year >= 2008:
        return {"label": "不分区政党票", "is_separate_ballot": True, "note": "单一选区两票制的独立政党选票"}
    return {
        "label": "不分区席次计算票",
        "is_separate_ballot": False,
        "note": "并非独立政党票；依各党区域及原住民候选人票汇总，用于不分区席次计算",
    }


def elected(mark: object) -> bool:
    text = str(mark or "").strip().upper()
    return text in {"Y", "*", "＊", "!", "！", "◎"} or "當選" in text or "当选" in text


def _candidate_key(row: dict, electorate: str) -> tuple:
    district = str(row.get("選區", "")).strip() if electorate == "regional" else electorate
    return district, str(row.get("號次", "")).strip(), str(row.get("候選人", "")).strip(), str(row.get("政黨", "")).strip()


def aggregate_candidate_rows(rows: list[dict], electorate: str) -> list[dict]:
    buckets: dict[tuple, dict] = {}
    for source in rows:
        votes = int(str(source.get("得票數", "0")).replace(",", "") or 0)
        county = simplify(source.get("縣市"))
        town = simplify(source.get("鄉鎮市區"))
        district = simplify(source.get("選區")) or ("平地少数民族" if electorate == "plains" else "山地少数民族" if electorate == "mountain" else county)
        number = str(source.get("號次", "")).strip()
        candidate = simplify(source.get("候選人"))
        party = normalize_party(source.get("政黨"))
        is_elected = elected(source.get("當選註記"))
        if not candidate:
            continue
        scopes = [("national", "", ""), ("county", county, "")]
        if town:
            scopes.append(("town", county, town))
        scopes.append(("district", county if electorate == "regional" else "全部地区（含金门、马祖）", district))
        identity = _candidate_key(source, electorate)
        for level, scoped_county, area in scopes:
            key = (level, scoped_county, area, identity)
            if key not in buckets:
                buckets[key] = {
                    "type": "legislative", "electorate": electorate, "level": level,
                    "county": scoped_county, "town": area if level == "town" else "",
                    "district": area if level == "district" else district,
                    "number": number, "name": candidate, "candidate": candidate, "party": party,
                    "votes": 0, "elected": is_elected,
                }
            buckets[key]["votes"] += votes
            buckets[key]["elected"] = buckets[key]["elected"] or is_elected
    return list(buckets.values())


def aggregate_party_rows(rows: list[dict], *, derived: bool) -> list[dict]:
    buckets = defaultdict(int)
    for source in rows:
        votes = int(str(source.get("得票數", "0")).replace(",", "") or 0)
        county, town = simplify(source.get("縣市")), simplify(source.get("鄉鎮市區"))
        party = normalize_party(source.get("政黨"))
        scopes = [("national", "", "")]
        if county:
            scopes.append(("county", county, ""))
        if county and town:
            scopes.append(("town", county, town))
        for level, scoped_county, area in scopes:
            buckets[(level, scoped_county, area, party)] += votes
    return [{
        "type": "legislative", "electorate": "party", "level": level,
        "county": county, "town": area if level == "town" else "", "district": "全国不分区",
        "number": "", "name": party, "party": party, "votes": votes,
        "elected": False, "derived": derived,
    } for (level, county, area, party), votes in buckets.items()]


def read_csv(content: bytes) -> list[dict]:
    return list(csv.DictReader(io.StringIO(content.decode("utf-8-sig"))))


def fetch_1992(session: requests.Session, electorate: str) -> list[dict]:
    code = NCCU_CODES[electorate]
    url = NCCU_BASE + "vote3.asp?pass1=J9AA:" + code + "8888888888iii(("
    response = session.get(url, timeout=90)
    response.raise_for_status()
    soup = BeautifulSoup(response.content, "html.parser")
    output = []
    for tr in soup.select("tr"):
        cells = [cell.get_text(" ", strip=True) for cell in tr.select("td")]
        if len(cells) != 10 or not re.fullmatch(r"\d+", cells[6].replace(",", "")):
            continue
        district, name, number, gender, birth, party, votes, share, won, incumbent = cells
        county = re.sub(r"第.+選區$", "", district)
        output.append({
            "縣市": county, "鄉鎮市區": "", "村里": "", "選區": district,
            "號次": number, "候選人": name, "政黨": party, "得票數": votes,
            "當選註記": won, "性別": gender, "出生年次": birth, "現任": incumbent,
        })
    if not output:
        raise ValueError(f"1992 {electorate}: NCCU returned no candidate rows")
    return output


def contests_and_candidacies(year: int, rows: list[dict]) -> tuple[list[dict], list[dict]]:
    district_rows = [row for row in rows if row["level"] == "district" and row["electorate"] != "party"]
    groups = defaultdict(list)
    for row in district_rows:
        groups[(row["electorate"], row["county"], row["district"])].append(row)
    contests, candidacies = [], []
    for (electorate, county, district), items in sorted(groups.items()):
        contest_id = f"legislative:{year}:{electorate}:{county}:{district}"
        winners = sum(1 for item in items if item["elected"])
        valid = sum(item["votes"] for item in items)
        contests.append({
            "contest_id": contest_id, "election_id": f"legislative:{year}:{electorate}",
            "county_id": f"historical:{year}:{county}", "county_name": county,
            "district_name": district, "electorate": electorate,
            "seats": winners or (1 if year >= 2008 and electorate == "regional" else None),
            "valid_votes": valid, "registered_voters": None, "ballots_cast": None, "invalid_votes": None,
        })
        for item in items:
            candidacies.append({
                "candidacy_id": f"{contest_id}:{item['number']}:{item['name']}",
                "contest_id": contest_id, "candidate_name": item["name"], "party_name": item["party"],
                "ballot_number": item["number"] or None, "votes": item["votes"],
                "vote_share": round(item["votes"] / valid * 100, 8) if valid else 0,
                "elected_official": item["elected"], "gender": item.get("gender"),
                "incumbent_at_election": item.get("incumbent"),
            })
    party_rows = [row for row in rows if row["level"] == "national" and row["electorate"] == "party"]
    if party_rows:
        contest_id = f"legislative:{year}:party:national"
        valid = sum(item["votes"] for item in party_rows)
        contests.append({
            "contest_id": contest_id, "election_id": f"legislative:{year}:party",
            "county_id": "national", "county_name": "全部地区（含金门、马祖）",
            "district_name": "全国不分区", "electorate": "party", "seats": None,
            "valid_votes": valid, "registered_voters": None, "ballots_cast": None, "invalid_votes": None,
        })
        for index, item in enumerate(sorted(party_rows, key=lambda row: -row["votes"]), 1):
            candidacies.append({
                "candidacy_id": f"{contest_id}:{index}:{item['party']}", "contest_id": contest_id,
                "candidate_name": item["party"], "party_name": item["party"], "ballot_number": None,
                "votes": item["votes"], "vote_share": round(item["votes"] / valid * 100, 8) if valid else 0,
                "elected_official": False, "gender": None, "incumbent_at_election": None,
            })
    return contests, candidacies


def make_snapshot(year: int, source_rows: dict[str, list[dict]]) -> dict:
    rows = []
    for electorate in ("regional", "plains", "mountain"):
        rows.extend(aggregate_candidate_rows(source_rows.get(electorate, []), electorate))
    if year >= 2008:
        rows.extend(aggregate_party_rows(source_rows.get("party", []), derived=False))
    else:
        derived = []
        for electorate in ("regional", "plains", "mountain"):
            for item in source_rows.get(electorate, []):
                derived.append({**item, "政黨": item.get("政黨", "")})
        rows.extend(aggregate_party_rows(derived, derived=True))
    contests, candidacies = contests_and_candidacies(year, rows)
    elections = [{
        "election_id": f"legislative:{year}:{electorate}", "year": year,
        "office": "legislative", "electorate": electorate,
        "source_name": "中央选举机构 / 政治大学选举研究数据库" if year == 1992 else "中央选举机构 / Taiwan Votes",
        "boundary_version": str(year), "election_name": f"{year}年立法机构民代选举",
        **ballot_metadata(year, electorate),
    } for electorate in ("regional", "plains", "mountain", "party")]
    return {
        "schemaVersion": 2, "year": year, "office": "legislative",
        "elections": elections, "contests": contests, "candidacies": candidacies, "rows": rows,
        "geography": {
            "map_levels": ["district"] if year == 1992 else ["district", "county", "town"],
            "historical_administrative_names": True,
        },
        "provenance": {
            "official_source": "中央选举机构公开选举资料",
            "derivative": "政治大学选举研究数据库" if year == 1992 else "Taiwan Votes Data Explorer (taiwanvotes.tw)",
            "source_version": "NCCU CEC archive" if year == 1992 else "2026-07-04+sha256:84740535b1f4",
            "license": "official public record" if year == 1992 else "OGDL Taiwan v1.0; derivative CC BY 4.0",
        },
    }


def build(*, verify_existing: bool = False) -> None:
    targets = {year: ROOT / f"assets/history-legislative-{year}.json" for year in YEARS}
    if verify_existing:
        for year, path in targets.items():
            obj = json.loads(path.read_text(encoding="utf-8"))
            if obj.get("schemaVersion") != 2 or obj.get("year") != year or obj.get("office") != "legislative":
                raise ValueError(f"{year}: incompatible legislative shard")
            if not obj.get("contests") or not obj.get("rows"):
                raise ValueError(f"{year}: empty legislative shard")
        print("All ten legislative data shards validated")
        return
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    index_response = session.get(INDEX_URL, timeout=90)
    index_response.raise_for_status()
    catalog = index_response.json()
    files = catalog["files"]
    manifest_files, shard_hashes = [], {}
    for year in YEARS:
        source_rows: dict[str, list[dict]] = {}
        for electorate in ("regional", "plains", "mountain"):
            if year == 1992:
                source_rows[electorate] = fetch_1992(session, electorate)
                continue
            matches = [item for item in files if item.get("type") == SOURCE_TYPES[electorate] and item.get("year") == year and str(item.get("term")) == str(year)]
            if not matches:
                raise ValueError(f"{year} {electorate}: no source CSV files")
            combined = []
            for item in matches:
                url = CSV_BASE + quote(item["file"])
                response = session.get(url, timeout=90)
                response.raise_for_status()
                parsed = read_csv(response.content)
                combined.extend(parsed)
                manifest_files.append({"year": year, "electorate": electorate, "file": item["file"], "url": url, "rows": len(parsed), "sha256": hashlib.sha256(response.content).hexdigest()})
            source_rows[electorate] = combined
        if year >= 2008:
            matches = [item for item in files if item.get("type") == SOURCE_TYPES["party"] and item.get("year") == year and str(item.get("term")) == str(year)]
            combined = []
            for item in matches:
                url = CSV_BASE + quote(item["file"])
                response = session.get(url, timeout=90)
                response.raise_for_status()
                parsed = read_csv(response.content)
                combined.extend(parsed)
                manifest_files.append({"year": year, "electorate": "party", "file": item["file"], "url": url, "rows": len(parsed), "sha256": hashlib.sha256(response.content).hexdigest()})
            source_rows["party"] = combined
        snapshot = make_snapshot(year, source_rows)
        blob = (json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
        targets[year].write_bytes(blob)
        shard_hashes[str(year)] = hashlib.sha256(blob).hexdigest()
        print(year, len(snapshot["contests"]), "contests", len(snapshot["rows"]), "rows")
    manifest = {
        "version": 1, "schema_version": 2, "built_at": datetime.now(timezone.utc).isoformat(),
        "source_index": INDEX_URL, "source_version": catalog.get("sourceVersion"),
        "source_sha256": catalog.get("sourceSha256"), "files": manifest_files,
        "shards": shard_hashes,
    }
    (ROOT / "sources/history-legislative-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-existing", action="store_true")
    args = parser.parse_args()
    build(verify_existing=args.verify_existing)
