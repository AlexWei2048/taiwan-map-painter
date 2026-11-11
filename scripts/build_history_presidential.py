#!/usr/bin/env python3
"""Build 1996–2024 presidential election snapshots from CEC-derived county CSVs.

Each year's data is an independent JSON asset. No new asset is published until
all 188 expected source files, election totals and geography grains validate.
The original historical administrative names remain alongside simplified labels.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

import requests
from bs4 import BeautifulSoup
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
CATALOG = "https://www.taiwanvotes.tw/download/"
YEARS = (1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024)
EXPECTED_COUNTIES = {year: 25 if year <= 2008 else 22 for year in YEARS}
EXPECTED_CANDIDATES = {1996: 4, 2000: 5, 2004: 2, 2008: 2, 2012: 3, 2016: 3, 2020: 3, 2024: 3}
# Sum of candidate votes, according to official election announcements.
# In 2004, the original announcement (12,914,422) and subsequent court
# recount (12,896,791) are different; the CSV source version determines which.
OFFICIAL_VALID = {
    1996: (10766119,), 2000: (12664393,), 2004: (12914422, 12896791),
    2008: (13103963,), 2012: (13354305,), 2016: (12284970,),
    2020: (14300940,), 2024: (13947506,),
}
WINNER_NAMES = {
    1996: "李登輝", 2000: "陳水扁", 2004: "陳水扁", 2008: "馬英九",
    2012: "馬英九", 2016: "蔡英文", 2020: "蔡英文", 2024: "賴清德",
}
# Nationwide participation statistics use CEC election-summary figures.
# County/town registered-voter counts are deliberately null unless separately
# supplied from verified official turnout tables. Never apportion the national
# turnout among counties by candidate votes.
NATIONAL_STATS = {
    1996: (14313288,10883279,117160),
    2000: (15462625,12786671,122278),
    2004: (16507179,13251719,337297),
    2008: (17321622,13221609,117646),
    2012: (18086455,13452016,97711),
    2016: (18782991,12448302,163332),
    2020: (19311105,14464571,163631),
    2024: (19548531,14048310,100804),
}
CONVERTER = OpenCC("t2s")
USER_AGENT = "Island-Palette/2.0 (public election data verification)"
OFFICIAL_FIELDS = ("選舉名稱","屆期","縣市","鄉鎮市區","村里","選區","號次","候選人","政黨","得票數","當選註記")

def simplify(value: object) -> str:
    return CONVERTER.convert(str(value or "")).strip()

def source_listing(html: bytes) -> dict[int, list[tuple[str,str,str]]]:
    soup = BeautifulSoup(html.decode("utf-8-sig") if isinstance(html, bytes) else html, "html.parser")
    grouped: dict[int, list[tuple[str,str,str]]] = {year: [] for year in YEARS}
    seen: set[str] = set()
    for anchor in soup.select("a[href]"):
        url = urljoin(CATALOG, anchor["href"])
        filename = unquote(urlsplit(url).path.rsplit("/",1)[-1])
        match = re.fullmatch(r"總統_(\d{4})_(.+)\.csv",filename)
        if not match or int(match[1]) not in grouped or filename in seen:
            continue
        year, county = int(match[1]),match[2]
        grouped[year].append((url,filename,county))
        seen.add(filename)
    for year, group in grouped.items():
        if len(group)!=EXPECTED_COUNTIES[year]:
            raise ValueError(f"{year}: expected {EXPECTED_COUNTIES[year]} county CSV files, found {len(group)}")
        if len({item[2] for item in group})!=len(group):
            raise ValueError(f"{year}: duplicate county CSV")
    if len(seen)!=188:
        raise ValueError("presidential source listing is incomplete")
    return grouped

def read_csv(content: bytes, county: str) -> list[dict[str,str]]:
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    if not set(("縣市","鄉鎮市區","候選人","政黨","得票數")).issubset(reader.fieldnames or []):
        raise ValueError(f"{county}: missing necessary CSV columns: {reader.fieldnames}")
    rows = list(reader)
    if not rows:
        raise ValueError(f"{county}: empty CSV")
    for row in rows:
        if not row.get("候選人") or not row.get("縣市"):
            raise ValueError(f"{county}: unlabelled candidate or county")
        if row["縣市"].strip()!=county:
            raise ValueError(f"{county}: county differs from file label {row['縣市']}")
        raw = row.get("得票數","").replace(",","").strip()
        if not raw.isdigit():
            raise ValueError(f"{county}: non-integer vote count {raw!r}")
        row["得票數"] = str(int(raw))
    return rows

def candidate_key(row: dict[str,str]) -> tuple[str,str,str]:
    return (row.get("號次","").strip(), row["候選人"].strip(), row["政黨"].strip())

def winner_marker(row: dict[str,str]) -> str:
    mark = row.get("當選註記","")
    if "？" in mark or "?" in mark:return "?"
    if "！" in mark or "!" in mark:return "!"
    if "＊" in mark or "*" in mark:return "*"
    return ""

def make_snapshot(year: int, counties: dict[str,list[dict[str,str]]]) -> dict:
    if len(counties)!=EXPECTED_COUNTIES[year]:
        raise ValueError(f"{year}: missing county sources")
    candidate_totals = defaultdict(int)
    county_totals = defaultdict(lambda:defaultdict(int))
    town_totals = defaultdict(lambda:defaultdict(int))
    source_markers = defaultdict(set)
    candidate_towns = defaultdict(set)
    for county, rows in counties.items():
        if not rows:
            raise ValueError(f"{year} {county}: no rows")
        for row in rows:
            key=candidate_key(row)
            votes=int(row["得票數"])
            county_totals[county][key]+=votes
            town=row.get("鄉鎮市區","").strip()
            if town:
                town_totals[(county,town)][key]+=votes
                candidate_towns[county].add(town)
            source_markers[key].add(winner_marker(row))
    if len(town_totals)<300:
        raise ValueError(f"{year}: only {len(town_totals)} township areas; source too coarse or incomplete")
    for county in counties:
        if not candidate_towns[county]:
            raise ValueError(f"{year} {county}: no township rows")
        if len(county_totals[county])!=EXPECTED_CANDIDATES[year]:
            raise ValueError(f"{year} {county}: candidate list differs from the {EXPECTED_CANDIDATES[year]}-ticket election")
        for key,total in county_totals[county].items():
            candidate_totals[key]+=total
    if len(candidate_totals)!=EXPECTED_CANDIDATES[year]:
        raise ValueError(f"{year}: inconsistent nationwide candidates")
    total_valid=sum(candidate_totals.values())
    if total_valid not in OFFICIAL_VALID[year]:
        raise ValueError(f"{year}: {total_valid} candidate votes disagree with CEC {OFFICIAL_VALID[year]}")
    winner_options=[key for key in candidate_totals if WINNER_NAMES[year] in key[1]]
    if len(winner_options)!=1:
        raise ValueError(f"{year}: official presidential winner cannot be identified unambiguously")
    official_winner=winner_options[0]
    for key,marks in source_markers.items():
        if key!=official_winner and ("*" in marks or "!" in marks):
            raise ValueError(f"{year}: unofficial ticket has an elected marker")
    election_id=f"president:{year}"
    elections=[{
        "election_id":election_id, "year":year,"office":"president",
        "electorate":"regional","source_name":"中央選舉委員會",
        "boundary_version":str(year),"election_name":f"第{(year-1996)//4+9}任總統副總統選舉",
    }]
    contests,candidacies,legacy=[],[],[]
    for county in sorted(county_totals):
        county_s=simplify(county)
        county_id=f"historical:{year}:{county_s}"
        contest_id=f"{election_id}:{county_s}"
        valid=sum(county_totals[county].values())
        contests.append({
            "contest_id":contest_id,"election_id":election_id,
            "county_id":county_id,"county_name":county_s,"county_name_official":county,
            "district_name":county_s,"district_name_official":county,
            "electorate":"regional","seats":1,"valid_votes":valid,
            "registered_voters":None,"ballots_cast":None,"invalid_votes":None,
        })
        for key, votes in sorted(county_totals[county].items(),key=lambda item:(-item[1],item[0])):
            number,name,party=key
            candidacies.append({
                "candidacy_id":f"{contest_id}:{number}:{simplify(name)}",
                "contest_id":contest_id,"candidate_name":simplify(name),
                "candidate_name_official":name,"party_name":simplify(party or "無黨籍"),
                "party_name_official":party,"ballot_number":number or None,
                "votes":votes,"vote_share":round(votes/valid*100,8) if valid else 0,
                "elected_official":key==official_winner,
                "official_marker":winner_marker({"當選註記": "".join(source_markers[key])}),
                "gender":None,"incumbent_at_election":None,
            })
            legacy.append({
                "type":"president","electorate":"regional","level":"county",
                "county":county_s,"county_official":county,"town":"","town_official":"",
                "district":"","number":number,"name":simplify(name),
                "name_official":name,"party":simplify(party or "無黨籍"),
                "party_official":party,"gender":"","incumbent":None,
                "votes":votes,"elected":key==official_winner,
            })
    for (county,town),ticket_totals in sorted(town_totals.items()):
        for key,votes in ticket_totals.items():
            number,name,party=key
            legacy.append({
                "type":"president","electorate":"regional","level":"town",
                "county":simplify(county),"county_official":county,
                "town":simplify(town),"town_official":town,
                "district":"","number":number,"name":simplify(name),
                "name_official":name,"party":simplify(party or "無黨籍"),
                "party_official":party,"gender":"","incumbent":None,
                "votes":votes,"elected":key==official_winner,
            })
    registered,cast,invalid=NATIONAL_STATS[year]
    if cast-invalid!=total_valid:
        raise ValueError(f"{year}: reported nationwide turnout differs from candidate totals")
    return {
        "schemaVersion":2,"year":year,"office":"president",
        "elections":elections,"contests":contests,"candidacies":candidacies,
        "rows":legacy,"national":{
            "registered_voters":registered,"ballots_cast":cast,
            "valid_votes":total_valid,"invalid_votes":invalid,
            "winner":simplify(official_winner[1]),
            "candidate_totals":[{"number":k[0],"name":simplify(k[1]),
                                 "name_official":k[1],"party":simplify(k[2] or "無黨籍"),
                                 "votes":n,"elected":k==official_winner}
                                for k,n in sorted(candidate_totals.items(),key=lambda v:-v[1])],
        },
        "geography":{"county_count":len(counties),"town_count":len(town_totals),
                     "historical_administrative_names":True,"map_level":["county","town"]},
        "provenance":{"official_source":"中央選舉委員會（2026）選舉資料庫（含選舉區資料）",
                      "source_version":"2026-07-04+sha256:84740535b1f4",
                      "derivative":"視覺化速查選舉資料庫（taiwanvotes.tw）",
                      "license":"OGDL Taiwan v1.0; derivative CC BY 4.0"},
    }

def atomic_write(path:Path,content:bytes) -> None:
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent,prefix=".president-",delete=False) as temp:
        name=temp.name
        temp.write(content)
    os.replace(name,path)

def build(*,verify_existing:bool=False):
    targets={year:ROOT/f"assets/history-president-{year}.json" for year in YEARS}
    manifest_path=ROOT/"sources/history-presidential-manifest.json"
    if verify_existing:
        for year,path in targets.items():
            obj=json.loads(path.read_text(encoding="utf-8"))
            if obj.get("schemaVersion")!=2 or obj.get("year")!=year:
                raise ValueError(f"{year}: incompatible existing shard")
            if len(obj["contests"])!=EXPECTED_COUNTIES[year]:
                raise ValueError(f"{year}: incomplete existing county data")
            if obj["national"]["valid_votes"] not in OFFICIAL_VALID[year]:
                raise ValueError(f"{year}: existing shard fails official totals")
        json.loads(manifest_path.read_text(encoding="utf-8"))
        print("All eight presidential data shards validated")
        return
    client=requests.Session()
    client.headers["User-Agent"]=USER_AGENT
    def fetch(url:str)->bytes:
        response=client.get(url,timeout=70)
        response.raise_for_status()
        return response.content
    grouped=source_listing(fetch(CATALOG))
    output,source_manifest={},[]
    for year in YEARS:
        county_data={}
        for url,filename,county in grouped[year]:
            content=fetch(url)
            county_data[county]=read_csv(content,county)
            source_manifest.append({"year":year,"county":county,"filename":filename,
                                    "url":url,"sha256":hashlib.sha256(content).hexdigest(),
                                    "rows":len(county_data[county])})
        snapshot=make_snapshot(year,county_data)
        output[year]=(json.dumps(snapshot,ensure_ascii=False,separators=(",",":"))+"\n").encode()
        print(year,"counties",len(snapshot["contests"]),
              "towns",snapshot["geography"]["town_count"],
              "valid votes",snapshot["national"]["valid_votes"])
    assert len(source_manifest)==188
    manifest={
        "version":1,"schema_version":2,"fetched_at":datetime.now(timezone.utc).isoformat(),
        "catalog":CATALOG,"source":"Central Election Commission / taiwanvotes.tw",
        "source_version":"2026-07-04+sha256:84740535b1f4",
        "licenses":["https://data.gov.tw/license","https://creativecommons.org/licenses/by/4.0/"],
        "years":list(YEARS),"files":source_manifest,
        "shards":{str(year):hashlib.sha256(blob).hexdigest() for year,blob in output.items()},
    }
    # All parsing and validation happens before the first replace.
    for year,blob in output.items():
        atomic_write(targets[year],blob)
    atomic_write(manifest_path,(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n").encode())
    print("Published all eight year shards and a source-hash manifest")

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--verify-existing",action="store_true")
    args=parser.parse_args()
    build(verify_existing=args.verify_existing)
