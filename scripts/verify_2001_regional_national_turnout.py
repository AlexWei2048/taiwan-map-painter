#!/usr/bin/env python3
"""Try to close the 2001 regional-legislator NATIONAL turnout gap with original CEC elprof.

Reject if no unique national profile or independent candidate valid-vote
reconciliation; never sum partial counties or relabel generic election turnout
as regional ballot turnout.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[1]
SNAP=ROOT/'assets/history-legislative-2001.json'
TARGET=ROOT/'assets/history-legislative-turnout-2001.json'
SOURCE='https://raw.githubusercontent.com/kiang/db.cec.gov.tw/master/voteData/'+quote('5屆立委/區域/elprof.csv',safe='/')

def run():
    rows=json.loads(SNAP.read_text(encoding='utf-8'))['rows']
    direct=sum(int(row.get('votes') or 0) for row in rows
               if row.get('level')=='national' and row.get('electorate')=='regional')
    county_rows=[row for row in rows if row.get('level')=='county' and row.get('electorate')=='regional']
    by_county={row.get('county') for row in county_rows}
    county_valid=sum(int(row.get('votes') or 0) for row in county_rows)
    print('SITE_CANDIDATE_VOTES',{'national':direct,'county_valid':county_valid,
      'county_names':len(by_county),'county_rows':len(county_rows)},flush=True)
    with urlopen(Request(SOURCE,headers={'User-Agent':'IslandPalette source backed historical turnout'}),timeout=100) as response:
        raw=response.read()
    source_sha=hashlib.sha256(raw).hexdigest()
    profiles=[]
    for row in csv.reader(io.StringIO(raw.decode('utf-8-sig'))):
        if len(row)<10:continue
        code=[x.strip() for x in row[:6]]
        # Election archive national summary is exactly the all-zero region,
        # town, village and polling-station combination.
        if not all(x and set(x)=={'0'} for x in code):continue
        try:valid,invalid,cast,registered=map(int,row[6:10])
        except ValueError:continue
        if registered>=cast>0 and cast==valid+invalid and valid>0:
            profiles.append([registered,cast,valid,invalid])
    print('CEC_NATIONAL_PROFILES',profiles,'sha256',source_sha,flush=True)
    unique={tuple(p) for p in profiles}
    if len(unique)!=1:
        print('NO_UPDATE unique profile required',flush=True)
        return
    values=list(next(iter(unique)))
    matched=values[2]==direct and direct>0
    if not matched and len(by_county)>=25 and county_valid==values[2]:
        matched=True
    if not matched:
        print('NO_UPDATE official valid ballots do not reconcile with complete candidate votes',flush=True)
        return
    doc=json.loads(TARGET.read_text(encoding='utf-8'))
    assert doc['year']==2001 and doc['schemaVersion']==1
    prior=doc['ballots']['regional'].get('national')
    if prior and prior!=values:raise RuntimeError('Conflicting existing official turnout')
    doc['ballots']['regional']['national']=values
    doc.setdefault('audit',{}).setdefault('regional',{})['national_source']={
       'url':SOURCE,'sha256':source_sha,
       'method':'original all-zero national official elprof row; exact candidate-valid-vote reconciliation',
       'valid_votes_reconciled':values[2]}
    TARGET.write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print('VERIFIED_2001_NATIONAL_REGIONAL_TURNOUT',values,flush=True)

if __name__=='__main__':run()
