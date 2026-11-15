#!/usr/bin/env python3
"""Fill the final two missing 2022 mayoral local ballot profiles from CEC's rerun.

Chiayi City's December 18 mayoral rerun is NOT the November 26 local election.
Only verified per-station G/C/A/B values are aggregated. Candidate vote totals
must equal the distinct site historical-town returns, never inferred.
"""
from __future__ import annotations
import collections,csv,hashlib,io,json,time
from pathlib import Path
from urllib.request import Request,urlopen
from opencc import OpenCC
ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/"assets/history-2022.json"
SOURCE="https://raw.githubusercontent.com/kiang/db.cec.gov.tw/master/voteData/2022%E5%B9%B4_%E5%98%89%E7%BE%A9%E5%B8%82%E9%95%B7%E9%87%8D%E8%A1%8C%E9%81%B8%E8%88%89/prof.csv"
OFFICIAL="https://web.cec.gov.tw/cyec/article/37711"
cc=OpenCC("t2s")
def norm(s):return cc.convert(str(s or "")).replace("臺","台").strip()
for i in range(3):
 try:
  req=Request(SOURCE,headers={"User-Agent":"IslandPalette/2.0 archived election verification"})
  with urlopen(req,timeout=70) as source:raw=source.read()
  break
 except Exception:
  if i==2:raise
  time.sleep((i+1)*3)
rows=list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
assert len(rows)==194 and len(rows[0])==16,(len(rows),len(rows[0]))
stats=collections.defaultdict(lambda:{"stations":set(),"registered_voters":0,"ballots_cast":0,"valid_votes":0,"invalid_votes":0,"candidates":[0]*5})
for row in rows[1:]:
 assert len(row)==16,(len(row),row[:4])
 area=norm(row[0]);assert area in ("东区","西区")
 o=stats[area]
 station=int(row[2]);assert station not in o["stations"]
 o["stations"].add(station)
 for i in range(5):o["candidates"][i]+=int(row[3+i])
 v,b,c,g=map(int,(row[8],row[9],row[10],row[14]))
 assert v==sum(map(int,row[3:8])) and c==v+b and g>=c
 o["valid_votes"]+=v;o["invalid_votes"]+=b
 o["ballots_cast"]+=c;o["registered_voters"]+=g
assert {town:len(o["stations"]) for town,o in stats.items()}=={"东区":91,"西区":102}
totals={field:sum(x[field] for x in stats.values()) for field in ("registered_voters","ballots_cast","valid_votes","invalid_votes")}
assert totals=={"registered_voters":214130,"ballots_cast":94188,"valid_votes":93813,"invalid_votes":375},totals
snapshot=json.loads(PATH.read_text(encoding="utf-8"))
votemap=collections.defaultdict(int)
for row in snapshot.get("rows",[]):
 if row.get("type")=="mayor" and row.get("level")=="town" and norm(row.get("county"))=="嘉义市":
  votemap[norm(row.get("town"))]+=int(row.get("votes") or 0)
assert set(votemap)==set(stats),("missing source wards",votemap)
assert all(votemap[town]==record["valid_votes"] for town,record in stats.items()),(votemap,stats)
contests=[c for c in snapshot["contests"] if c.get("county_name")=="嘉义市" and c.get("election_id")=="2022-mayor"]
assert len(contests)==1 and int(contests[0]["valid_votes"])==93813,contests
profile=[dict(office="mayor",county="嘉义市",town=town,
 **{k:record[k] for k in ("registered_voters","ballots_cast","valid_votes","invalid_votes")})
 for town,record in sorted(stats.items())]
previous=snapshot.get("townProfiles",[])
assert not any(p.get("office")=="mayor" and p.get("county")=="嘉义市" for p in previous),"rerun already imported"
snapshot["townProfiles"]=previous+profile
snapshot["provenance"]={**snapshot.get("provenance",{}),
 "chiayiRerunTownTurnoutSource":SOURCE,
 "chiayiRerunTownTurnoutRelease":OFFICIAL,
 "chiayiRerunTownTurnoutSHA256":hashlib.sha256(raw).hexdigest(),
 "chiayiRerunTownTurnoutAudit":"193 distinct stations, both district candidate votes verified, all four city election statistics reconcile"}
PATH.write_text(json.dumps(snapshot,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
report={"source":SOURCE,"release":OFFICIAL,"sha256":hashlib.sha256(raw).hexdigest(),
 "whole_city":totals,
 "wards":{town:{k:v for k,v in record.items() if k!="stations"} for town,record in stats.items()}}
(ROOT/"reports/2022-chiayi-mayor-rerun-turnout.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("2022_CHIAYI_RERUN",json.dumps(report,ensure_ascii=False),flush=True)
