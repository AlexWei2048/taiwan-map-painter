#!/usr/bin/env python3
"""Reconcile the CEC 2026-10-16 city/county council candidate decisions."""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from audit_2026_official import load_directory

DIRECT_MUNICIPALITIES={"台北市","新北市","桃园市","台中市","台南市","高雄市"}
OFFICIAL_ACCEPTED={"municipality":605,"county":887}
CEC_EXCLUDED_IDS={
 "council:63000:06:015","council:65000:10:001","council:68000:01:017",
 "council:66000:13:009","council:67000:07:012",
 "council:10009:04:003","council:10010:06:008","council:10015:05:004",
 "council:09020:01:011","council:10017:03:003"
}
REINSTATED_ID="council:10015:05:004"
REINSTATED_SOURCE="https://web.cec.gov.tw/api/file/6bd6ef5c-b17d-464f-9bd9-a6c216f40dd2.pdf"
SOURCE_URL="https://web.cec.gov.tw/central/article/65212"
def inspect(directory):
    candidates=directory["candidates"]
    council=[c for c in candidates if c.get("type")=="council"]
    actual={
      "municipality":sum(c["county"] in DIRECT_MUNICIPALITIES for c in council),
      "county":sum(c["county"] not in DIRECT_MUNICIPALITIES for c in council)
    }
    included_ids={c["id"] for c in candidates}
    exclusion={e["candidateId"]:e for e in directory.get("excluded",[]) if e.get("type")=="council"}
    # Preserve the October cohort; separately reconcile the November court-ordered roster.
    restored=[c for c in council if c["id"]==REINSTATED_ID and c.get("officialFinalRoster",{}).get("sourceUrl")==REINSTATED_SOURCE and c.get("number")==3]
    effective_excluded=CEC_EXCLUDED_IDS-({REINSTATED_ID} if restored else set())
    expected=dict(OFFICIAL_ACCEPTED)
    expected["county"]+=len(restored)
    excluded_confirmed=effective_excluded & set(exclusion)
    missing=effective_excluded-set(exclusion)
    still_present=effective_excluded & included_ids
    other_exclusions=set(exclusion)-effective_excluded
    issues=[]
    if actual!=expected:issues.append("CEC council cohort counts differ")
    if missing:issues.append("CEC disqualified council IDs missing from excluded audit")
    if still_present:issues.append("CEC disqualified council IDs still shown as candidates")
    if other_exclusions:issues.append("Council exclusions not in CEC 2026-10-16 reference; review independently")
    return{"asOf":"2026-10-16","officialSource":SOURCE_URL,"scopes":actual,
      "officialScopes":expected,"octoberOfficialScopes":OFFICIAL_ACCEPTED,"reinstated":len(restored),"included":len(council),
      "CECdisqualifiedCandidates":len(excluded_confirmed),"totalCECdisqualified":10,
      "exclusionIdsMissing":sorted(missing),"disqualifiedStillListed":sorted(still_present),
      "additionalCouncilExclusions":sorted(other_exclusions),
      "passed":not issues,"issues":issues,
      "notice":"Council names per seat and each 2026-11-17 announced candidate number remain subject to separate local election commission publication"}
if __name__=="__main__":
    report=inspect(load_directory())
    out=ROOT/"reports/2026-cec-council-qualification-audit.json"
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False))
    raise SystemExit(0 if report["passed"] else 2)
