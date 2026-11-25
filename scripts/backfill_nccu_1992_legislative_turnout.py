#!/usr/bin/env python3
"""Conservatively fill 1992 legislative regional turnout from NCCU constituency tables.

Never replace existing CEC/yearbook verified profiles. Only accept a profile if
the candidate-vote total and ballot arithmetic match the archived contest.
"""
from __future__ import annotations
import argparse
import json
import re
import unicodedata
from pathlib import Path
from urllib.request import Request, urlopen
from bs4 import BeautifulSoup
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://vote.nccu.edu.tw/cec/vote421.asp?pass1=J9AA:I8888888888"
MAIN = ROOT / "assets/history-legislative-1992.json"
PROFILES = ROOT / "assets/history-legislative-turnout-1992.json"
REPORT = ROOT / "reports/nccu-1992-legislative-turnout-audit.json"
CC = OpenCC("t2s")

def norm(value):
    return re.sub(r"\s+","",CC.convert(unicodedata.normalize("NFKC",str(value))).replace("臺","台"))

def source_rows():
    r = urlopen(Request(SOURCE,headers={"User-Agent":"Mozilla/5.0 (historical election data verification)"}), timeout=45)
    soup = BeautifulSoup(r.read().decode("utf8","replace"),"html.parser")
    result = []
    for tr in soup.find_all("tr"):
        cells = [c.get_text(" ",strip=True) for c in tr.find_all(["td","th"],recursive=False)]
        if len(cells)<12 or any(not cells[i].replace(",","").isdigit() for i in (2,9,10,11)):
            continue
        record = [int(cells[i].replace(",","")) for i in (2,9,10,11)]
        result.append((norm(cells[0]),record))
    return result

def run(apply):
    election = json.loads(MAIN.read_text("utf8"))
    turnout = json.loads(PROFILES.read_text("utf8"))
    regional = turnout["ballots"]["regional"]
    contests = election["contests"]
    local = json.loads((ROOT / "assets/history-legislative-1992-local.json").read_text("utf8"))
    correction = local["ballots"].get("regional", {}).get("candidateCorrection")
    candidates = [x for x in contests if x.get("electorate")=="regional"]
    audit = turnout["audit"]["regional"]
    existing = audit["verified_constituencies"]
    by_name = {norm(c["district_name"]):c for c in candidates}
    source = source_rows()
    report = {"source_url":SOURCE,"source_rows":len(source),"candidate_contests":len(candidates),
      "unchanged_official_records":[],"inserted_constituencies":[],"errors":[],"source_conflicts":[]}
    if len(source)!=27 or len(by_name)!=27:
        raise RuntimeError(f"Expected 27 constituency records, saw source={len(source)} local={len(by_name)}")
    registered_count=0
    for key,values in source:
        contest=by_name.get(key)
        if contest is None:
            report["errors"].append({"issue":"missing_contest","key":key,"profile":values})
            continue
        county,district=contest["county_name"],contest["district_name"]
        if not (values[0]>=values[1] and values[1]==values[2]+values[3]):
            report["errors"].append({"issue":"invalid_arithmetic","district":district,"record":values})
            continue
        valid = contest["valid_votes"]
        if correction and (county, district) == (correction["county"], correction["district"]):
            valid += correction["certifiedVotes"] - correction["previousVotes"]
        if values[2]!=valid:
            report["source_conflicts"].append({"issue":"NCCU_candidate_total_mismatch","county":county,
                 "district":district,"nccu_valid_votes":values[2],"candidate_votes":valid})
            continue
        preexisting=next((x for x in existing if x["county"]==county and x["district"]==district),None)
        if preexisting:
            saved=preexisting["record"]
            if saved!=values:
                report["source_conflicts"].append({"issue":"official_profile_differs_from_NCCU",
                  "county":county,"district":district,"NCCU":values,"preserved_official":saved,
                  "official_source":preexisting.get("source_url")})
            report["unchanged_official_records"].append(district)
            registered_count+=1
            continue
        if county in ("台北市","高雄市"):
            number="1" if "第一" in district else "2" if "第二" in district else None
            if not number: raise RuntimeError(f"Cannot map city district {district}")
            current=regional["district"].setdefault(county,{}).get(number)
            if current and current!=values:
                report["source_conflicts"].append({"issue":"existing_district_differs","county":county,"number":number,"existing":current,"nccu":values})
                continue
            regional["district"][county][number]=values
        else:
            current=regional["county"].get(county)
            if current and current!=values:
                report["source_conflicts"].append({"issue":"existing_county_differs","county":county,"existing":current,"nccu":values})
                continue
            regional["county"][county]=values
        existing.append({"county":county,"district":district,"record":values,"source_url":SOURCE,
                         "source_quality":"NCCU 1992 constituency statistical summary; confirmed against candidate votes"})
        report["inserted_constituencies"].append({"county":county,"district":district,"registered_voters":values[0],
               "ballots_cast":values[1],"valid_votes":values[2],"invalid_votes":values[3]})
        registered_count+=1
    # The two city constituencies together constitute the county-level total.
    for city in ("台北市","高雄市"):
        districts=regional["district"].get(city,{})
        if len(districts)!=2:continue
        combined=[sum(d[i] for d in districts.values()) for i in range(4)]
        if regional["county"].get(city) and regional["county"][city]!=combined:
            report["source_conflicts"].append({"issue":"city_aggregate_differs","city":city,
                "saved":regional["county"][city],"derived":combined})
        elif not regional["county"].get(city):
            regional["county"][city]=combined
            report["inserted_constituencies"].append({"county":city,"district":"municipal_aggregate",
                "registered_voters":combined[0],"ballots_cast":combined[1],
                "valid_votes":combined[2],"invalid_votes":combined[3],
                "method":"sum of two separately verified NCCU constituencies"})
    report["candidate_regional_valid_votes"] = sum(c["valid_votes"] for c in candidates)
    if correction:
        report["candidate_regional_valid_votes"] += correction["certifiedVotes"] - correction["previousVotes"]
        report["candidate_correction"] = correction
    report["reconstructed_constituencies"] = registered_count
    county_profiles = regional["county"]
    national = [sum(profile[i] for profile in county_profiles.values()) for i in range(4)]
    if registered_count == len(candidates) and national[2] == report["candidate_regional_valid_votes"]:
        regional["national"] = national
        report["national_status"] = "reconciled_from_all_constituencies"
        report["national_profile"] = national
    else:
        report["national_status"] = "not_filled_due_to_candidate_total_discrepancy"
    audit["field_count"] = registered_count * 3
    audit["nccu_1992_source"]=SOURCE
    audit["nccu_reconciliation"]={"constituencies_checked":len(source),"matched":registered_count,
         "new_constituencies":len([x for x in report["inserted_constituencies"] if x.get("district")!="municipal_aggregate"]),
         "conflicts":report["source_conflicts"]}
    label = "National Chengchi University Election Study Center 1992 regional constituency summaries"
    if label not in turnout["source"]:
        turnout["source"] += "; " + label
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n","utf8")
    print("NCCU_1992_RESULT",json.dumps({k:report[k] for k in
        ("source_rows","candidate_contests","reconstructed_constituencies","national_status")},ensure_ascii=False),flush=True)
    print("NCCU_1992_ADDITIONS",len(report["inserted_constituencies"]),flush=True)
    print("NCCU_1992_CONFLICTS",json.dumps(report["source_conflicts"],ensure_ascii=False),flush=True)
    assert registered_count>=26, "Unexpectedly incomplete 1992 NCCU source"
    assert len(regional["county"])>=24, "Missing county statistics"
    assert len(regional["district"].get("高雄市",{}))==2
    if apply:PROFILES.write_text(json.dumps(turnout,ensure_ascii=False,separators=(",",":"))+"\n","utf8")
    return report

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--apply",action="store_true")
    args=parser.parse_args()
    run(args.apply)
