#!/usr/bin/env python3
"""Augment 1996–2024 presidential county and town vote profiles from CEC CSV.

Candidate votes and other archive data remain unchanged. We only publish a
geographic turnout profile when official accepted ballots EXACTLY equal the
independently archived candidate-vote sum at that geographic grain.
"""
from __future__ import annotations
import csv
import hashlib
import io
import json
import time
from collections import defaultdict,Counter
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen,Request
from opencc import OpenCC
ROOT=Path(__file__).resolve().parents[1]
BASE="https://raw.githubusercontent.com/kiang/db.cec.gov.tw/master/voteData/"
FOLDERS={
 1996:"9任總統",
 2000:"2000年10任總統",
 2004:"2004   11任總統",
 2008:"2008 12任總統",
 2012:"20120114-總統及立委/總統",
 2016:"2016總統立委/總統",
 2020:"2020總統立委/總統",
 2024:"2024總統立委/總統"
}
cc=OpenCC("t2s")
def norm(s):return cc.convert(str(s or "")).replace("臺","台").strip().replace(" ","")
def field(s):return str(s or "").strip().lstrip("'").strip()
def fetch(year,filename):
 url=BASE+"/".join(quote(x,safe="") for x in FOLDERS[year].split("/"))+"/"+filename
 for attempt in range(3):
  try:
   req=Request(url,headers={"User-Agent":"IslandPalette/2.0 public election archive"})
   with urlopen(req,timeout=70) as r:raw=r.read()
   return url,raw
  except Exception:
   if attempt==2:raise
   time.sleep(3*(attempt+1))
def parse(raw):
 return list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
def stats(row):
 try:
  valid,invalid,cast,registered=[int(field(x)) for x in row[6:10]]
  if registered<cast or cast!=valid+invalid or registered<0 or valid<0 or invalid<0:return None
  return {"registered_voters":registered,"ballots_cast":cast,"valid_votes":valid,"invalid_votes":invalid}
 except (IndexError,ValueError):return None
def run(year):
 archive=ROOT/f"assets/history-president-{year}.json"
 snap=json.loads(archive.read_text(encoding="utf-8"))
 base_url,raw_base=fetch(year,"elbase.csv")
 prof_url,raw_prof=fetch(year,"elprof.csv")
 counties={};towns={}
 for r in parse(raw_base):
  if len(r)<6:continue
  p,c,d,t,v=map(field,r[:5]);name=norm(r[5])
  if not name:continue
  if d=="00" and t=="000" and v=="0000" and (p,c)!=("00","000"):
   counties[(p,c)]=name
  elif t not in ("000","") and v=="0000" and (p,c) in counties:
   towns[(p,c,d,t)]=name
 # County labels precede towns in most CEC files, but use a second pass
 # for files whose row ordering does not follow strict hierarchical order.
 for r in parse(raw_base):
  if len(r)<6:continue
  p,c,d,t,v=map(field,r[:5])
  if t not in ("000","") and v=="0000" and (p,c) in counties:
   towns[(p,c,d,t)]=norm(r[5])
 bycounty={c["county_name"]:c for c in snap["contests"]}
 town_votes=defaultdict(int)
 for row in snap.get("rows",[]):
  if row.get("level")=="town" and row.get("type")=="president":
   town_votes[(norm(row["county"]),norm(row["town"]))]+=int(row.get("votes") or 0)
 accepted_county={};accepted_towns={};audit=Counter()
 for r in parse(raw_prof):
  if len(r)<10:continue
  p,c,d,t,v,station=map(field,r[:6])
  if station not in ("","0000","0") or v not in ("","0000"):
   continue
  group=stats(r)
  if group is None:audit["bad_arithmetic"]+=1;continue
  county=counties.get((p,c))
  if not county:continue
  if t in ("000","") and d in ("00",""):
   contest=bycounty.get(county)
   if contest and int(contest["valid_votes"])==group["valid_votes"]:
    if county not in accepted_county:accepted_county[county]=group;audit["county"]+=1
    elif accepted_county[county]!=group:audit["ambiguous_county"]+=1;accepted_county.pop(county,None)
   else:audit["county_mismatch"]+=1
  elif t not in ("000",""):
   town=towns.get((p,c,d,t))
   if not town:continue
   pair=(county,town)
   if town_votes.get(pair)==group["valid_votes"] and pair not in accepted_towns:
    accepted_towns[pair]=group;audit["town"]+=1
   else:audit["town_mismatch"]+=1
 for name,group in accepted_county.items():
  contest=bycounty[name]
  for col in ("registered_voters","ballots_cast","invalid_votes"):
   if contest.get(col) is None:contest[col]=group[col]
 records=[dict(office="president",year=year,county=county,town=town,**profile)
  for (county,town),profile in sorted(accepted_towns.items())]
 existing=[p for p in snap.get("townProfiles",[]) if p.get("office")!="president"]
 snap["townProfiles"]=existing+records
 snap["provenance"]={**snap.get("provenance",{}),
  "officialCountyTownProfileSource":prof_url,
  "officialCountyTownBaseSource":base_url,
  "officialProfileChecksum":hashlib.sha256(raw_prof).hexdigest(),
  "officialProfileMethod":"CEC elprof county+town accepted votes exactly match independent candidate totals"}
 archive.write_text(json.dumps(snap,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
 print("PRESIDENTIAL_PROFILE",year,dict(audit),"COUNTY",len(accepted_county),"TOWN",len(records),flush=True)
 return {"year":year,"county_matches":len(accepted_county),"town_matches":len(records),
         "original_counties":len(snap["contests"]),"original_town_units":len(town_votes),
         "audit":dict(audit),"sources":[base_url,prof_url]}
if __name__=="__main__":
 results=[run(year) for year in FOLDERS]
 path=ROOT/"reports/presidential-official-local-turnout.json"
 path.write_text(json.dumps({"schemaVersion":1,"years":results},ensure_ascii=False,indent=2)+"\n")
 print("COMPLETE",json.dumps(results,ensure_ascii=False),flush=True)
