#!/usr/bin/env python3
"""Read-only 2026 official candidate/ballot audit.

Never mutates assets/election-2026.js, forecast storage, or candidate IDs.
Official CSV is a reviewed snapshot, NOT automatically scraped guesses.
"""
import argparse
import csv
import hashlib
import json
import re
import sys
import urllib.request
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "assets/election-2026.js"
REGISTRY = ROOT / "sources/election-2026/official-source-registry.json"

def load_directory(path=DATA_PATH):
    src = Path(path).read_text(encoding="utf-8").strip()
    prefix = "window.ELECTION_2026_DATA="
    if not src.startswith(prefix) or not src.endswith(";"):
        raise ValueError("Unexpected candidate-directory format")
    payload = json.loads(src[len(prefix):-1])
    if payload.get("year") not in (None, 2026):
        raise ValueError("Wrong candidate year")
    return payload

def normalize(value):
    return re.sub(r"\s+", "", str(value or "")).replace("臺", "台")

def trusted_source(url):
    try:
        parsed = urlparse(str(url or ""))
        host = parsed.hostname or ""
        return parsed.scheme == "https" and (
            host == "cec.gov.tw" or host.endswith(".cec.gov.tw") or
            host == "gov.tw" or host.endswith(".gov.tw")
        )
    except ValueError:
        return False

def analyze_directory(data):
    errors = []
    candidates = data.get("candidates") or []
    districts = data.get("districts") or []
    by_id = {}
    for candidate in candidates:
        cid = candidate.get("id")
        if not cid or cid in by_id:
            errors.append("duplicate-or-empty-candidate-id:" + str(cid))
        by_id[cid] = candidate
    for district in districts:
        ids = district.get("candidateIds") or []
        if len(ids) != len(set(ids)):
            errors.append("duplicate-district-candidate:" + district.get("id",""))
        for cid in ids:
            if cid not in by_id:
                errors.append("missing-candidate:" + str(cid))
            elif by_id[cid].get("districtId") != district.get("id"):
                errors.append("district-mismatch:" + str(cid))
        ballots = []
        for cid in ids:
            n = by_id.get(cid, {}).get("number")
            if isinstance(n, int) and not isinstance(n, bool) and n > 0:
                ballots.append(n)
        if len(ballots) != len(set(ballots)):
            errors.append("duplicate-number:" + district.get("id", ""))
    summary = {}
    for office in ("mayor", "council", "township"):
        rows = [c for c in candidates if c.get("type") == office]
        summary[office] = {
            "districts": sum(d.get("type") == office for d in districts),
            "candidates": len(rows),
            "verified_numbers": sum(isinstance(c.get("number"), int) and not isinstance(c.get("number"), bool) and c["number"] > 0 for c in rows),
            "pending_numbers": sum(not (isinstance(c.get("number"), int) and not isinstance(c.get("number"), bool) and c["number"] > 0) for c in rows),
        }
    return {"asOf": data.get("asOf"), "summary": summary, "errors": sorted(errors)}

def candidate_index(data):
    by_id = {c["id"]: c for c in data["candidates"]}
    by_name = {}
    for c in data["candidates"]:
        values = set(filter(None, (normalize(c.get("officialName")), normalize(c.get("nameOriginal")), normalize(c.get("name")), normalize(c.get("nameSimplified")))))
        for name in values:
            key = (c.get("type"), normalize(c.get("county")), c.get("districtId"), name)
            by_name.setdefault(key, set()).add(c["id"])
    return by_id, by_name

def write_official_template(data,path):
    """All 2051 roster IDs retained; no claim of official verification in blank fields."""
    districts={d["id"]:d for d in data["districts"]}
    fieldnames=["candidate_id","type","county","districtId","name","number","party","gender","eligible","source_url","source_date",
                "local_ballot_reference","local_party_reference","local_gender_reference","roster_as_of"]
    output=Path(path);output.parent.mkdir(parents=True,exist_ok=True)
    with output.open("w",encoding="utf-8-sig",newline="") as handle:
        writer=csv.DictWriter(handle,fieldnames=fieldnames)
        writer.writeheader()
        for c in sorted(data["candidates"],key=lambda item:(item["type"],item["county"],item["districtId"],item["id"])):
            writer.writerow({"candidate_id":c["id"],"type":c["type"],"county":c["county"],
                "districtId":c["districtId"],"name":c.get("nameOriginal") or c.get("name") or "",
                "number":"","party":"","gender":"","eligible":"","source_url":"","source_date":"",
                "local_ballot_reference":c.get("number") or "",
                "local_party_reference":c.get("party") or "",
                "local_gender_reference":c.get("gender") or "",
                "roster_as_of":data.get("asOf") or ""})
    return output

def parse_official_csv(path, data):
    """Expected fields: type,county,districtId,name,number,party,gender,eligible,source_url,source_date.
    Empty comparison fields mean not verified, never mean 0 or 'unknown'.
    """
    result = []
    by_id, by_name = candidate_index(data)
    known_types = {"mayor","council","township"}
    with open(path, encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise ValueError("Official roster is empty")
    required = {"type","county","districtId","name","source_url","source_date"}
    if not required.issubset(rows[0]):
        raise ValueError("Missing official CSV columns: "+",".join(sorted(required-set(rows[0]))))
    seen = set()
    for lineno, row in enumerate(rows, 2):
        source = row["source_url"].strip()
        if not trusted_source(source):
            raise ValueError("Line %d: official source must be a cec.gov.tw/gov.tw HTTPS link" % lineno)
        if row["type"] not in known_types or not row["county"].strip() or not row["districtId"].strip() or not row["name"].strip():
            raise ValueError("Line %d: missing/invalid official identity" % lineno)
        try:
            date.fromisoformat(row["source_date"].strip())
        except ValueError:
            raise ValueError("Line %d: source_date must be YYYY-MM-DD" % lineno) from None
        key = (row["type"], normalize(row["county"]), row["districtId"], normalize(row["name"]))
        if key in seen:
            raise ValueError("Repeated official candidate: "+repr(key))
        seen.add(key)
        matches = sorted(by_name.get(key, []))
        # Candidate ID is an additional guard when a sheet was generated from our template.
        # Never remap a user forecast merely because the official name was changed.
        reference_id=(row.get("candidate_id") or "").strip()
        if reference_id and (reference_id not in by_id or (matches and reference_id not in matches)):
            raise ValueError("Line %d: candidate_id does not match official district/name; review manually" % lineno)
        record = {"official": {k:row.get(k,"").strip() for k in ("type","county","districtId","name","number","party","gender","eligible","source_url","source_date")}, "candidateId": matches[0] if len(matches)==1 else None}
        if len(matches)>1:
            record["status"]="ambiguous";record["differences"]=["Multiple local candidates have the same official identity"]
        elif not matches:
            record["status"]="missing_or_changed_identity";record["differences"]=["Official candidate has no exact local district/name match"]
        else:
            candidate = by_id[matches[0]]
            diffs=[]
            if row.get("number","").strip():
                value=row["number"].strip()
                if not value.isdecimal() or int(value)<1:
                    raise ValueError("Line %d: invalid official ballot number" % lineno)
                if str(candidate.get("number") or "")!=str(int(value)):
                    diffs.append({"field":"number","local":candidate.get("number"),"official":int(value)})
            for field in ("party","gender"):
                if row.get(field,"").strip() and normalize(row[field])!=normalize(candidate.get(field)):
                    diffs.append({"field":field,"local":candidate.get(field),"official":row[field]})
            if row.get("eligible","").strip().lower() in ("no","false","ineligible","不合格","资格不符","不符資格"):
                diffs.append({"field":"eligibility","local":"listed","official":"ineligible"})
            record["status"]="difference" if diffs else "matched";record["differences"]=diffs
        result.append(record)
    counts = {status:sum(r["status"]==status for r in result) for status in ("matched","difference","missing_or_changed_identity","ambiguous")}
    return {"sourceType":"curated_official_roster","generatedAt":datetime.now(timezone.utc).isoformat(),"totals":counts,"rows":result,
        "autoApplied":False,"policy":"Manual official verification required; no roster or forecast data were changed."}

class OfficialLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_anchor=False
        self.url=""
        self.parts=[]
        self.links=[]
        self.all_text=[]
        self.ignore=0
    def handle_starttag(self,tag,attrs):
        if tag in ("script","style"):
            self.ignore+=1
        if tag=="a":
            self.in_anchor=True
            self.url=dict(attrs).get("href","")
            self.parts=[]
    def handle_data(self,data):
        if not self.ignore and data.strip():self.all_text.append(" ".join(data.split()))
        if self.in_anchor and not self.ignore:self.parts.append(data)
    def handle_endtag(self,tag):
        if tag in ("script","style"):
            self.ignore=max(0,self.ignore-1)
        if tag=="a" and self.in_anchor:
            name=" ".join(" ".join(self.parts).split())
            if re.search("候選人|候选人|抽籤|抽签|選舉公報|选举公报|資格審定|资格审定",name):
                self.links.append({"title":name[:180],"url":self.url})
            self.in_anchor=False

def monitor(registry, previous=None, fetcher=None):
    """Surface publication changes. HTTP failures are unknown, NOT 'no changes'."""
    fetcher = fetcher or fetch_html
    old = (previous or {}).get("sources",{})
    sources={}
    for entry in registry["sources"]:
        key=entry["id"]
        url=entry["url"]
        try:
            html=fetcher(url)
            parser=OfficialLinks();parser.feed(html)
            links=sorted(parser.links,key=lambda x:(x["title"],x["url"]))
            keywords=("候選人","候选人","抽籤","抽签","選舉公報","选举公报","資格","资格","115年","115 年")
            candidate_text=[line for line in parser.all_text if any(word in line for word in keywords)]
            digest=hashlib.sha256(json.dumps({"links":links,"candidateText":candidate_text},ensure_ascii=False,sort_keys=True).encode()).hexdigest()
            before=old.get(key,{}).get("digest")
            sources[key]={"status":"changed" if before and before!=digest else "unchanged" if before else "first_observation",
                "checkedAt":datetime.now(timezone.utc).isoformat(),"url":url,"digest":digest,"links":links,"candidateText":candidate_text[:120]}
        except Exception as error:
            sources[key]={"status":"fetch_failed","url":url,"error":str(error)[:240],
                "previousDigest":old.get(key,{}).get("digest")}
    return {"sources":sources,"changed":sorted(k for k,v in sources.items() if v["status"]=="changed"),
        "errors":sorted(k for k,v in sources.items() if v["status"]=="fetch_failed"),
        "automaticallyUpdatedCandidates":False}

def fetch_html(url):
    if not trusted_source(url):raise ValueError("Untrusted URL")
    req=urllib.request.Request(url,headers={"User-Agent":"IslandPalette-OfficialAudit/1.0 (research; GitHub Actions)"})
    with urllib.request.urlopen(req,timeout=22) as resp:
        if resp.status!=200:raise ValueError("HTTP "+str(resp.status))
        data=resp.read(2_000_000)
        return data.decode("utf-8","replace")

def main(argv=None):
    p=argparse.ArgumentParser()
    p.add_argument("--roster",help="Reviewed official CSV path (never auto-applied)")
    p.add_argument("--template",help="Export blank official-review CSV with candidate IDs")
    p.add_argument("--monitor",action="store_true")
    p.add_argument("--previous",help="Previous monitor JSON state; immutable baseline is not required")
    p.add_argument("--output",default="reports/official-2026-candidate-audit.json")
    args=p.parse_args(argv)
    data=load_directory()
    if args.template:
        print("Wrote blank official verification template:",write_official_template(data,args.template))
        if not args.roster and not args.monitor:return 0
    report={"local":analyze_directory(data),"generatedAt":datetime.now(timezone.utc).isoformat()}
    if args.roster:
        report["rosterAudit"]=parse_official_csv(args.roster,data)
    if args.monitor:
        previous=json.loads(Path(args.previous).read_text(encoding="utf-8")) if args.previous and Path(args.previous).exists() else None
        report["monitor"]=monitor(json.loads(REGISTRY.read_text(encoding="utf-8")),previous)
    output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"local":report["local"],"official":report.get("rosterAudit",{}).get("totals"),
        "monitorChanged":report.get("monitor",{}).get("changed"),"monitorErrors":report.get("monitor",{}).get("errors")},
        ensure_ascii=False))
    if report["local"]["errors"]:return 2
    if args.monitor and len(report["monitor"]["errors"])==len(json.loads(REGISTRY.read_text())["sources"]):return 3
    return 0

if __name__=="__main__":
    sys.exit(main())
