#!/usr/bin/env python3
"""Official 2026 local-election result intake. Never touches saved predictions.

CEC-backed results must be transcribed into the documented stable-ID CSV.
Without a complete, source-backed post-election roster, the builder stages
reports ONLY. Publication is explicitly opt-in after 2026-11-28.
"""
from __future__ import annotations
import argparse,csv,hashlib,json,re,sys
from collections import defaultdict
from datetime import date,datetime,timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from audit_2026_official import load_directory,trusted_source

COLUMNS=["candidate_id","number","votes","elected","source_url","source_date"]
TOWN_COLS=["candidate_id","county","town","votes","source_url","source_date"]
TURNOUT_COLS=["district_id","registered_voters","ballots_cast","valid_votes","invalid_votes","source_url","source_date"]
TOWN_TURNOUT_COLS=["county","town","registered_voters","ballots_cast","valid_votes","invalid_votes","source_url","source_date"]
EXPECTED={"mayor":(22,81),"council":(221,1493),"township":(204,475)}
ELECTION_DAY=date(2026,11,28)
CERTIFICATION_DAY=date(2026,12,4)

def number(text,label,required=True):
    s=str(text if text is not None else "").strip().replace(",","")
    if not s:
        if required:raise ValueError("missing "+label)
        return None
    if not re.fullmatch(r"\d+",s):raise ValueError("invalid integer "+label)
    value=int(s)
    if value>9007199254740991:raise ValueError("unsafe integer "+label)
    return value

def official(row):
    url=str(row.get("source_url") or "").strip()
    if not trusted_source(url):raise ValueError("not an official HTTPS source: "+url)
    try:day=date.fromisoformat(str(row.get("source_date") or "").strip())
    except ValueError:raise ValueError("invalid source date") from None
    if day<ELECTION_DAY:raise ValueError("result source predates election")
    return(url,day.isoformat())

def winner(text):
    s=str(text or "").strip().lower()
    if s in ("1","true","yes","是","當選","当选","*","!"):return True
    if s in ("0","false","no","否","落選","落选","未當選","未当选"):return False
    if not s:return None
    raise ValueError("invalid official winner mark: "+s)

def read_csv(path,headers):
    with Path(path).open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        if not set(headers).issubset(reader.fieldnames or []):
            raise ValueError("required CSV fields: "+",".join(headers))
        return list(reader)

def make_template(directory,path):
    candidate={c["id"]:c for c in directory["candidates"]}
    district={d["id"]:d for d in directory["districts"]}
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("w",encoding="utf-8-sig",newline="") as f:
        names=COLUMNS+["local_number_reference","office","county","district","candidate_name"]
        w=csv.DictWriter(f,fieldnames=names);w.writeheader()
        for cid,c in sorted(candidate.items(),key=lambda item:(item[1]["type"],item[1]["districtId"],item[0])):
            d=district[c["districtId"]]
            w.writerow({"candidate_id":cid,"number":"","votes":"","elected":"","source_url":"","source_date":"",
                "local_number_reference":c.get("number") or "","office":c["type"],"county":c["county"],
                "district":d.get("name") or "","candidate_name":c.get("nameOriginal") or c.get("name")})
    return path

def prepare(directory,raw,town_raw=(),turnout_raw=(),status="provisional",town_turnout_raw=()):
    if status not in ("provisional","certified"):raise ValueError("Unsupported result status")
    cs={c["id"]:c for c in directory["candidates"]}
    ds={d["id"]:d for d in directory["districts"]}
    issues=[];warnings=[];observed={};towns=defaultdict(list);turnout={};source_set=set()
    for line,row in enumerate(raw,2):
        cid=str(row.get("candidate_id") or "").strip()
        if cid not in cs or cid in observed:
            issues.append(f"row {line}: unknown or repeated candidate ID {cid}");continue
        try:
            ballot=number(row.get("number"),"official ballot "+cid)
            if ballot==0:raise ValueError("ballot number must be positive")
            votes=number(row.get("votes"),"candidate votes "+cid)
            elected=winner(row.get("elected"))
            src=official(row)
        except ValueError as error:issues.append(f"row {line}: {error}");continue
        current=number(cs[cid].get("number"),"local ballot",False)
        if current and current!=ballot:
            issues.append(f"{cid}: official ballot {ballot} differs from local {current}; review stable-ID roster before releasing")
        observed[cid]={"number":ballot,"votes":votes,"elected":elected,"source":src}
        source_set.add(src)
    by_d=defaultdict(list)
    for cid,r in observed.items():by_d[cs[cid]["districtId"]].append((cs[cid],r))
    for did,d in ds.items():
        members=by_d.get(did,[]);known={c["id"] for c,_ in members}
        numbers=[r["number"] for _,r in members]
        if len(numbers)!=len(set(numbers)):issues.append(did+": duplicate official ballot numbers")
        if len(known)==len(d["candidateIds"]) and all(r["elected"] is not None for _,r in members):
            elected=sum(r["elected"] is True for _,r in members)
            seats=int(d.get("seats") or 1)
            if elected!=seats:issues.append(f"{did}: official winners {elected} != seats {seats}")
            reserve=int(d.get("womenReserved") or 0)
            women=sum(r["elected"] is True and c.get("gender")=="女" for c,r in members)
            if elected==seats and reserve and women<reserve:
                warnings.append(f"{did}: review women's reserved seat markers; do not infer new winners")
    for line,row in enumerate(town_raw,2):
        cid=str(row.get("candidate_id") or "").strip()
        if cid not in observed:
            issues.append(f"town row {line}: missing source candidate {cid}");continue
        c=cs[cid]
        county=str(row.get("county") or "").strip();town=str(row.get("town") or "").strip()
        if c["type"]=="township" or not town or county.replace("臺","台")!=str(c["county"]).replace("臺","台"):
            issues.append(f"town row {line}: mismatched local election geography {cid}");continue
        try:
            vote=number(row.get("votes"),"town votes "+cid)
            src=official(row)
        except ValueError as error:issues.append(f"town row {line}: {error}");continue
        if town in {x["town"] for x in towns[cid]}:issues.append(f"{cid}: repeated town "+town)
        towns[cid].append({"town":town,"votes":vote});source_set.add(src)
    for cid,items in towns.items():
        if sum(x["votes"] for x in items)!=observed[cid]["votes"]:
            issues.append(f"{cid}: town totals do not reconcile to district/county total")
    for did in {cs[cid]["districtId"] for cid in towns}:
        ids=set(ds[did]["candidateIds"])
        provided={cid for cid in towns if cs[cid]["districtId"]==did}
        if provided!=ids:issues.append(did+": incomplete candidate coverage in town breakdown")
        scopes=[{entry["town"] for entry in towns[cid]} for cid in provided]
        if scopes and any(x!=scopes[0] for x in scopes):issues.append(did+": inconsistent town sets across candidates")
    for line,row in enumerate(turnout_raw,2):
        did=str(row.get("district_id") or "").strip()
        if did not in ds or did in turnout:
            issues.append(f"turnout row {line}: unknown/duplicate district {did}");continue
        try:
            values={k:number(row.get(k),k,False) for k in TURNOUT_COLS[1:5]}
            src=official(row)
        except ValueError as error:issues.append(f"turnout row {line}: {error}");continue
        cast=values["ballots_cast"];registered=values["registered_voters"]
        valid=values["valid_votes"];invalid=values["invalid_votes"]
        if cast is not None and registered is not None and cast>registered:
            issues.append(did+": ballots_cast > registered_voters")
        if None not in (cast,valid,invalid) and valid+invalid!=cast:
            issues.append(did+": valid+invalid != ballots_cast")
        if valid is not None and len(by_d.get(did,[]))==len(ds[did]["candidateIds"]):
            if valid!=sum(r["votes"] for _,r in by_d[did]):
                issues.append(did+": candidate vote total != official valid_votes")
        turnout[did]=values;source_set.add(src)
    town_profiles=[];town_profile_keys=set()
    mayors={d["county"].replace("臺","台"):d for d in ds.values() if d["type"]=="mayor"}
    for line,row in enumerate(town_turnout_raw,2):
        county=str(row.get("county") or "").strip()
        town=str(row.get("town") or "").strip()
        canonical=county.replace("臺","台")
        d=mayors.get(canonical)
        if not d or not town:
            issues.append(f"town turnout row {line}: unknown mayor county/town");continue
        key=(canonical,town)
        if key in town_profile_keys:
            issues.append(f"town turnout row {line}: repeated mayor town profile {key}");continue
        town_profile_keys.add(key)
        try:
            values={field:number(row.get(field),field+" in "+town) for field in
                    ("registered_voters","ballots_cast","valid_votes","invalid_votes")}
            src=official(row)
        except ValueError as error:
            issues.append(f"town turnout row {line}: {error}");continue
        if values["ballots_cast"]>values["registered_voters"] or values["valid_votes"]+values["invalid_votes"]!=values["ballots_cast"]:
            issues.append(f"town turnout row {line}: invalid turnout reconciliation");continue
        candidate_ids=d["candidateIds"]
        records=[next((item for item in towns.get(cid,[]) if item["town"]==town),None) for cid in candidate_ids]
        if any(item is None for item in records):
            issues.append(f"town turnout row {line}: candidate town votes not fully sourced");continue
        if values["valid_votes"]!=sum(item["votes"] for item in records):
            issues.append(f"town turnout row {line}: valid votes differ from candidate town totals");continue
        town_profiles.append({"office":"mayor","county":canonical,"town":town,**values,
                              "source_url":src[0],"source_date":src[1]})
        source_set.add(src)
    counts={t:(sum(d["type"]==t for d in ds.values()),sum(c["type"]==t for c in cs.values())) for t in EXPECTED}
    baseline=all(counts[t]==EXPECTED[t] for t in EXPECTED)
    if not baseline:warnings.append("Candidate or district counts do not match audited 2026 baseline")
    missing=set(cs)-set(observed)
    complete=not issues and not missing and all(did in by_d for did in ds) and all(r["elected"] is not None for r in observed.values())
    if missing:warnings.append(f"Missing {len(missing)} candidate-level official results")
    if any(r["elected"] is None for r in observed.values()):
        warnings.append("Winner marks are missing: do not infer from vote rank, including women's reserved seats")
    elections=[{"election_id":"2026-"+t,"year":2026,"office":t,"term":None,
        "election_date":"2026-11-28","source_name":"中選會及地方選委會公開選舉結果",
        "source_url":"https://info.cec.gov.tw/vote2026/","boundary_version":"2026",
        "lowest_data_level":"town" if towns else "contest"} for t in EXPECTED]
    contests=[];candidacies=[];rows=[]
    for did,d in ds.items():
        members=by_d.get(did,[])
        if not members:continue
        county=d["county"];kind=d["type"];name=str(d.get("name") or county)
        shorttown=str(d.get("town") or (name[len(county):] if name.startswith(county) else name))
        level={"mayor":"county","council":"district","township":"town"}[kind]
        votes=sum(r["votes"] for _,r in members)
        info=turnout.get(did,{})
        contests.append({
            "contest_id":did,"election_id":"2026-"+kind,"county_id":str(d.get("countyId") or ("2026-county-"+hashlib.sha256(county.encode("utf-8")).hexdigest()[:12])),
            "county_name":county,"county_name_official":county,"district_id":did,
            "district_name":shorttown if kind=="township" else name,"district_name_official":name,
            "scope_names":[d["scope"]] if d.get("scope") else [],
            "seats":int(d.get("seats") or 1),"reserved_seats":int(d.get("womenReserved") or 0),
            "electorate":{"plainsIndigenous":"plains","mountainIndigenous":"mountain"}.get(d.get("electorate"),d.get("electorate") or "regional"),
            "registered_voters":info.get("registered_voters"),"ballots_cast":info.get("ballots_cast"),
            "valid_votes":info.get("valid_votes",votes if len(members)==len(d["candidateIds"]) else None),
            "invalid_votes":info.get("invalid_votes")})
        for c,r in members:
            cid=c["id"];nameCandidate=c.get("nameSimplified") or c.get("name") or c.get("nameOriginal")
            party=c.get("party") or "无党籍"
            candidacies.append({
                "candidacy_id":cid,"candidate_id":cid,"contest_id":did,"ballot_number":str(r["number"]),
                "candidate_name":nameCandidate,"candidate_name_official":c.get("nameOriginal") or c.get("name"),
                "gender":c.get("gender") or "","incumbent_at_election":True if c.get("incumbent") in ("是",True) else None,
                "party_id":None,"party_name":party,"party_name_official":party,"votes":r["votes"],
                "vote_share":round(r["votes"]/votes*100,6) if votes else 0,
                "elected_official":r["elected"] is True,"elected_mark":"*" if r["elected"] is True else ""})
            base={"type":kind,"electorate":contests[-1]["electorate"],"county":county,"district":name if kind=="council" else "",
                "number":str(r["number"]),"name":nameCandidate,"party":party,"gender":c.get("gender") or "",
                "votes":r["votes"],"elected":r["elected"] is True,"incumbent":c.get("incumbent")}
            rows.append({**base,"level":level,"town":shorttown if kind=="township" else "","candidateId":cid})
            for item in towns.get(cid,[]):
                rows.append({**base,"level":"town","town":item["town"],"votes":item["votes"],"candidateId":cid})
    digest=hashlib.sha256(json.dumps([(x,observed[x]["number"],observed[x]["votes"],observed[x]["elected"]) for x in sorted(observed)],ensure_ascii=False).encode()).hexdigest()
    snapshot={"schemaVersion":2,"year":2026,"office":"local","publicationStatus":status,"completeness":"full" if complete else "partial",
      "elections":elections,"contests":contests,"candidacies":candidacies,"rows":rows,"townProfiles":town_profiles,
      "provenance":{"sourceLinks":[{"url":u,"sourceDate":day} for u,day in sorted(source_set)],
        "recordDigest":digest,"builtAt":datetime.now(timezone.utc).isoformat(),
        "officialWinnerMarksOnly":True,"forecastsUnaffected":True}}
    report={"year":2026,"status":status,"readyToPublish":complete and baseline,"baselineMatches":baseline,
       "coveredCandidates":len(observed),"expectedCandidates":len(cs),"coveredDistricts":len(by_d),"expectedDistricts":len(ds),
       "missingCandidateIds":sorted(missing)[:100],"issues":issues,"warnings":warnings,"byOffice":counts,
       "sourceCount":len(source_set),"verifiedMayorTownProfiles":len(town_profiles),"recordDigest":digest,"published":False}
    return snapshot,report

def save(data,file):
    file=Path(file);file.parent.mkdir(parents=True,exist_ok=True)
    file.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def main(argv=None):
    p=argparse.ArgumentParser()
    p.add_argument("--template",type=Path)
    p.add_argument("--results",type=Path)
    p.add_argument("--town-votes",type=Path)
    p.add_argument("--turnout",type=Path)
    p.add_argument("--town-turnout",type=Path,help="Optional CEC verified mayor turnout at town level")
    p.add_argument("--status",choices=("provisional","certified"),default="provisional")
    p.add_argument("--report",type=Path,default=ROOT/"reports/2026-results-intake-audit.json")
    p.add_argument("--staged-output",type=Path,default=ROOT/"reports/2026-results-staged.json")
    p.add_argument("--publish",action="store_true")
    args=p.parse_args(argv)
    directory=load_directory()
    if args.template:
        print("Exported",make_template(directory,args.template))
        if not args.results:return 0
    if not args.results:p.error("Provide --results official candidate votes CSV")
    raw=read_csv(args.results,COLUMNS)
    town=read_csv(args.town_votes,TOWN_COLS) if args.town_votes else []
    turnout=read_csv(args.turnout,TURNOUT_COLS) if args.turnout else []
    town_turnout=read_csv(args.town_turnout,TOWN_TURNOUT_COLS) if args.town_turnout else []
    snapshot,report=prepare(directory,raw,town,turnout,args.status,town_turnout)
    save(report,args.report)
    if args.publish:
        if date.today()<ELECTION_DAY:raise ValueError("Result publication is forbidden before polling day")
        if args.status=="certified" and date.today()<CERTIFICATION_DAY:
            raise ValueError("Officially certified 2026 results cannot be released before December 4")
        if not report["readyToPublish"]:
            raise ValueError("Cannot publish incomplete or inconsistent data. See "+str(args.report))
        out=ROOT/"assets/history-2026.json"
        manifest=ROOT/"assets/history-2026-availability.json"
        save(snapshot,out)
        save({"schemaVersion":1,"year":2026,"status":"published",
           "resultStatus":args.status,"file":"assets/history-2026.json",
           "sha256":hashlib.sha256(out.read_bytes()).hexdigest(),
           "candidateCount":len(snapshot["candidacies"]),"districtCount":len(snapshot["contests"])},manifest)
        report["published"]=True;save(report,args.report)
        print("Published official 2026 result snapshot",out)
    else:
        save(snapshot,args.staged_output)
        print("Staged only; not published to the website")
    print(json.dumps({k:report[k] for k in ("readyToPublish","coveredCandidates","expectedCandidates","issues","warnings")},ensure_ascii=False))
    return 0 if not report["issues"] else 2

if __name__=="__main__":raise SystemExit(main())
