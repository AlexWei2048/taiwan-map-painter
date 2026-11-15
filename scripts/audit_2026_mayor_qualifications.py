#!/usr/bin/env python3
"""Verify all 23 CEC-approved municipal mayor names without modifying candidate IDs."""
from __future__ import annotations
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from audit_2026_official import load_directory, analyze_directory

SOURCE=ROOT/"sources/election-2026/official-mayors-20261016.json"
OUTPUT=ROOT/"reports/2026-all-mayor-qualification-audit.json"

def canon(v):
    s=unicodedata.normalize("NFKC",str(v or ""))
    return re.sub(r"[\s·‧．.]+","",s).replace("臺","台").replace("溫","温").replace("啟","啓")

def check(data,reference):
    candidates=data.get("candidates",[])
    groups=[]
    for group in reference["counties"]:
        expected={canon(n):n for n in group["names"]}
        local=[c for c in candidates if c.get("type")=="mayor" and
               canon(c.get("county"))==canon(group["county"])]
        got={}
        for candidate in local:
            keys={canon(candidate.get(k)) for k in ("nameOriginal","name","nameSimplified","officialName")}
            for key in keys:
                if key in expected:
                    got.setdefault(key,[]).append(candidate["id"])
        absent=[expected[k] for k in expected if k not in got]
        ambiguous={expected[k]:ids for k,ids in got.items() if len(ids)!=1}
        unexpected=[{"id":c.get("id"),"name":c.get("nameOriginal") or c.get("name")}
                    for c in local if c.get("id") not in {ids[0] for ids in got.values() if len(ids)==1}]
        groups.append({"county":group["county"],"source":"CEC 2026-10-16","expected":len(expected),
                       "local":len(local),"matched":len(got),"absent":absent,
                       "unexpected":unexpected,"ambiguous":ambiguous})
    issues=[g for g in groups if g["absent"] or g["unexpected"] or g["ambiguous"] or g["expected"]!=g["local"]]
    expected_total=sum(len(g["names"]) for g in reference["counties"])
    all_mayor=sum(c.get("type")=="mayor" for c in candidates)
    assert expected_total==reference["officialCount"]
    all_ok=not issues and all_mayor==reference["officialNationwideMayorTotal"]
    return {"referenceDate":reference["decisionDate"],"source":reference["sourceUrl"],
            "coverage":"已按中选会2026-10-16资格审定资料匹配全部22县市的81名县市长候选人；不代表11-12或11-17正式公告的逐人号次已全部复核",
            "areas":groups,"matched":sum(g["matched"] for g in groups),
            "totalMayors":expected_total,"nationwideMayor":all_mayor,
            "nationwideReferenceCount":reference["officialNationwideMayorTotal"],
            "passed":all_ok,"issues":issues}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--output",type=Path,default=OUTPUT)
    args=p.parse_args()
    base=json.loads(SOURCE.read_text(encoding="utf-8"))
    counties=json.loads((ROOT/"sources/election-2026/official-county-mayors-20261016.json").read_text(encoding="utf-8"))
    assert base["officialCount"]==23 and counties["officialCount"]==58
    assert len(base["counties"])+len(counties["counties"])==22
    reference={**base,"counties":base["counties"]+counties["counties"],"officialCount":81}
    report=check(load_directory(),reference)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps({"passed":report["passed"],"matched":report["matched"],
          "totalMayors":report["totalMayors"],"nationwideMayor":report["nationwideMayor"],
          "issues":report["issues"]},ensure_ascii=False))
    return 0 if report["passed"] else 2
if __name__=="__main__":raise SystemExit(main())
