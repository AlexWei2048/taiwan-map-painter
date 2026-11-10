#!/usr/bin/env python3
"""Enrich the published 2022 snapshot with CEC's exact votedata.zip (elcand/elprof/elbase).

Never guess a join: require county, candidate name, ballot number, election type and
where necessary the district or township to agree. Preserve authoritative original
vote totals. This script enriches only fields absent in the existing snapshot.
"""
from __future__ import annotations
import argparse, collections, csv, hashlib, io, json, re, urllib.request, zipfile
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from opencc import OpenCC
from scripts.build_history_2022 import validate_snapshot, write_snapshot_atomic

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'assets/history-2022.json'
URL='https://data.cec.gov.tw/%E9%81%B8%E8%88%89%E8%B3%87%E6%96%99%E5%BA%AB/votedata.zip'
CC=OpenCC('t2s')
FILES={'C1/city':('mayor','regional'),'C1/prv':('mayor','regional'),
       'T1/city':('council','regional'),'T1/prv':('council','regional'),
       'T2/city':('council','plains'),'T2/prv':('council','plains'),
       'T3/city':('council','mountain'),'T3/prv':('council','mountain'),
       'D1':('township','regional'),'D2':('township','mountain')}
def norm(text):
    return re.sub(r'\s+','',CC.convert(str(text or '')).replace('．','·').replace('・','·').replace('•','·')).strip()
def key(row):
    return tuple(row[:5])
def intcol(value):
    try:return int(value)
    except (ValueError,TypeError):return None
def district_number(value):
    m=re.search(r'第\s*0*(\d+)\s*选(?:举)?区',CC.convert(str(value or '')))
    return str(int(m.group(1))) if m else ''
def download():
    req=urllib.request.Request(URL,headers={'User-Agent':'IslandPalette/CEC-validation'})
    with urllib.request.urlopen(req,timeout=150) as stream: payload=stream.read()
    print('CEC archive bytes',len(payload),flush=True)
    return payload
def load_sources(archive):
    tables={}
    for info in archive.infolist():
        path=info.filename.split('/2022-111',1)
        if len(path)!=2:continue
        suffix=path[1].split('/',1)[-1]
        group='/'.join(suffix.split('/')[:-1])
        name=suffix.rsplit('/',1)[-1]
        if group not in FILES or name not in ('elcand.csv','elbase.csv','elprof.csv'):continue
        with archive.open(info) as fh:
            records=list(csv.reader(io.StringIO(fh.read().decode('utf-8-sig'))))
        tables[(group,name)]=records
    for group in FILES:
        if any((group,n) not in tables for n in ('elcand.csv','elbase.csv','elprof.csv')):
            raise RuntimeError('Incomplete CEC tables '+group)
    return tables

def enrich(snapshot,tables,checksum):
    contests={c['contest_id']:c for c in snapshot['contests']}
    by_name=collections.defaultdict(list)
    for c in snapshot['candidacies']:
        ct=contests[c['contest_id']]
        by_name[(ct['election_id'].split('-')[-1],norm(ct['county_name']),norm(c['candidate_name']),str(int(c['ballot_number'])) if str(c['ballot_number']).isdigit() else c['ballot_number'])].append((c,ct))
    matched=set(); contest_profiles=collections.defaultdict(list)
    tally=collections.Counter()
    profiles_lookup={}
    for group,(office,electorate) in FILES.items():
        base=tables[(group,'elbase.csv')]
        county_names={}
        region_names={}
        town_names={}
        for row in base:
            if len(row)<6:continue
            p,city,region,town,village,name=row[:6]
            if region=='00' and town=='000' and village=='0000':
                county_names[(p,city)]=norm(name)
            if region!='00' and town=='000' and village=='0000':
                region_names[(p,city,region)]=norm(name)
            if town!='000' and village=='0000':
                town_names[(p,city,region,town)]=norm(name)
        profiles={}
        for row in tables[(group,'elprof.csv')]:
            if len(row)<11:continue
            # elprof first six columns: province/city/constituency/town/village/precinct
            if row[4]!='0000' or row[5]!='0000':continue
            profiles[(row[0],row[1],row[2],row[3])]=row
        for row in tables[(group,'elcand.csv')]:
            if len(row)<16:continue
            p,city,region,town,village,number,name=row[:7]
            county=county_names.get((p,city))
            if not county:continue
            candidate_key=(office,county,norm(name),str(int(number)) if number.isdigit() else number)
            possibilities=[(cand,ct) for cand,ct in by_name.get(candidate_key,[]) if ct['electorate']==electorate]
            if len(possibilities)>1:
                if office=='council':
                    official_district=district_number(region_names.get((p,city,region),''))
                    possibilities=[(c,ct) for c,ct in possibilities if district_number(ct['district_name'])==official_district and official_district]
                elif office=='township':
                    official_town=town_names.get((p,city,region,town),'')
                    possibilities=[(c,ct) for c,ct in possibilities if norm(ct['district_name'])==official_town and official_town]
            if len(possibilities)!=1:
                tally['ambiguous_or_unmatched_candidate']+=1
                continue
            cand,ct=possibilities[0]
            if cand['candidacy_id'] in matched:
                tally['duplicate_official_candidate']+=1
                continue
            gender={'1':'男','2':'女'}.get(row[8])
            incumbent={'Y':True,'N':False}.get(row[13])
            if gender:
                if cand.get('gender') and cand['gender']!=gender:tally['gender_conflict']+=1
                elif not cand.get('gender'):cand['gender']=gender;tally['gender_filled']+=1
            if incumbent is not None and cand.get('incumbent_at_election') is None:
                cand['incumbent_at_election']=incumbent;tally['incumbent_filled']+=1
            matched.add(cand['candidacy_id'])
            prof_key=(p,city,region if office!='mayor' else '00',town if office=='township' else '000')
            # C1 mayors use '00' constituency, D1 township uses '00' constituency / town code.
            profile=profiles.get(prof_key)
            if profile:
                contest_profiles[ct['contest_id']].append((tuple(prof_key),profile,group))
            else:tally['candidate_without_profile']+=1
    for cid,values in contest_profiles.items():
        # A contest's matched official candidates must resolve to ONE profile.
        selections={v[0]:v[1] for v in values}
        if len(selections)!=1:
            tally['contests_ambiguous_profile']+=1
            continue
        profile=next(iter(selections.values()))
        valid,invalid,cast,registered=[intcol(profile[i]) for i in (6,7,8,9)]
        ct=contests[cid]
        if any(value is None for value in (valid,invalid,cast,registered)):
            tally['profile_missing_values']+=1;continue
        if valid!=ct['valid_votes'] or valid+invalid!=cast or registered<cast:
            tally['profile_reconciliation_failure']+=1;continue
        for name,value in [('registered_voters',registered),('ballots_cast',cast),('invalid_votes',invalid)]:
            if ct[name] is None:ct[name]=value;tally[name+'_filled']+=1
            elif ct[name]!=value:tally['conflict_'+name]+=1
    tally['matched_candidates']=len(matched)
    tally['total_candidates']=len(snapshot['candidacies'])
    tally['contests_with_profile']=len(contest_profiles)
    tally['total_contests']=len(snapshot['contests'])
    snapshot.setdefault('provenance',{})['cecArchiveEnrichment']={
        'source':URL,'sha256':checksum,
        'fields':['gender','incumbent_at_election','registered_voters','ballots_cast','invalid_votes'],
        'method':'unique county+candidate+ballot+office+electorate with constituency/town disambiguation; elprof vote reconciliation',
        'statistics':dict(tally)}
    return tally

def complete_chiayi_rerun(snapshot,tally):
    """Official Chiayi City Election Commission 2022-12-18 rerun (not in 11/26 CEC ZIP)."""
    c=next(c for c in snapshot['contests'] if c['election_id']=='2022-mayor' and c['county_name']=='嘉义市')
    # Exact numbers, genders and vote counts from official county election commission.
    official={1:('黄敏惠','女',59874,True),
              2:('李俊俋','男',32790,False),
              3:('陈泰山','男',246,False),
              4:('黄宏成台湾阿成世界伟人财神总统','男',535,False),
              5:('郑凯升','男',368,False)}
    candidates=[x for x in snapshot['candidacies'] if x['contest_id']==c['contest_id']]
    if len(candidates)!=5 or {int(x['ballot_number']) for x in candidates}!=set(official):
        raise RuntimeError('Chiayi rerun candidate roster does not match official results')
    for x in candidates:
        name,gender,votes,incumbent=official[int(x['ballot_number'])]
        if norm(x['candidate_name'])!=norm(name) or x['votes']!=votes:
            raise RuntimeError('Chiayi official roster/votes mismatch '+x['candidate_name'])
        if not x.get('gender'):x['gender']=gender;tally['gender_filled']+=1
        if x.get('incumbent_at_election') is None:x['incumbent_at_election']=incumbent;tally['incumbent_filled']+=1
    if c['valid_votes']!=93813 or 93813+375!=94188:
        raise RuntimeError('Chiayi rerun official ballots do not reconcile')
    for field,value in [('registered_voters',214130),('ballots_cast',94188),('invalid_votes',375)]:
        if c.get(field) is None:c[field]=value;tally[field+'_filled']+=1
        elif c[field]!=value:raise RuntimeError('Chiayi rerun field mismatch '+field)
    c['election_date']='2022-12-18'
    snapshot['provenance']['chiayi2022Rerun']={
       'source':'https://web.cec.gov.tw/cyec/article/37711',
       'candidateDetails':'https://db.cec.gov.tw/ElecTable/Election/ElecTickets?areaCode=00&cityCode=000&dataLevel=C&dataType=tickets&deptCode=000&legisId=00&liCode=0000&prvCode=00&subjectId=C2&themeId=1275d73551f2c0caf202e803b1766057&typeId=ELC',
       'date':'2022-12-18','verified_candidate_count':5}
    tally['official_chiayi_rerun']=5

def propagate_official_candidate_fields(snapshot,tally):
    """Populate all geography-level display rows, not just normalized candidate entities."""
    contests={c['contest_id']:c for c in snapshot['contests']}
    by_candidate=collections.defaultdict(list)
    for cand in snapshot['candidacies']:
        ct=contests[cand['contest_id']]
        group=ct['election_id'].split('-')[-1]
        key=(group,norm(ct['county_name']),norm(cand['candidate_name']),
             str(int(cand['ballot_number'])) if str(cand['ballot_number']).isdigit() else cand['ballot_number'],
             ct['electorate'])
        by_candidate[key].append((cand,ct))
    for row in snapshot['rows']:
        key=(row['type'],norm(row['county']),norm(row['name']),
             str(int(row['number'])) if str(row['number']).isdigit() else row['number'],
             row['electorate'])
        matches=by_candidate.get(key,[])
        if len(matches)>1:
            matches=[(c,ct) for c,ct in matches if row['type']=='mayor' or
                (row['type']=='council' and district_number(ct['district_name'])==district_number(row['district']) and district_number(row['district'])) or
                (row['type']=='township' and norm(ct['district_name'])==norm(row['town']))]
        if len(matches)!=1:
            tally['display_rows_unmatched']+=1
            continue
        cand,_=matches[0]
        if cand.get('gender') and not row.get('gender'):row['gender']=cand['gender'];tally['display_gender_filled']+=1
        if cand.get('incumbent_at_election') is not None and row.get('incumbent') is None:
            row['incumbent']=cand['incumbent_at_election'];tally['display_incumbent_filled']+=1

def show_unmatched_source_names(tables):
    targets=[('mayor','5','江'),('township','1','严'),('township','1','蓝'),('council','17','陈'),('council','10','欧')]
    for office,ballot,surname in targets:
        found=[]
        for group,(o,e) in FILES.items():
            if o!=office:continue
            for row in tables[(group,'elcand.csv')]:
                if len(row)>14 and row[5]==ballot and norm(row[6]).startswith(surname):
                    found.append((group,row[0],row[1],row[2],row[3],row[6],row[8],row[13]))
        print('UNMATCHED_CEC_SOURCE',office,ballot,surname,json.dumps(found[:15],ensure_ascii=False),flush=True)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--write',action='store_true')
    args=parser.parse_args()
    snapshot=json.loads(OUTPUT.read_text(encoding='utf-8'))
    payload=download()
    tables=load_sources(zipfile.ZipFile(io.BytesIO(payload)))
    tally=enrich(snapshot,tables,hashlib.sha256(payload).hexdigest())
    complete_chiayi_rerun(snapshot,tally)
    propagate_official_candidate_fields(snapshot,tally)
    show_unmatched_source_names(tables)
    remaining=[(contests['contest_id'],c['candidate_name'],c['ballot_number']) for c in snapshot['candidacies'] if c.get('incumbent_at_election') is None for contests in [next(k for k in snapshot['contests'] if k['contest_id']==c['contest_id'])]]
    missing_profiles=[(c['contest_id'],c['county_name'],c['district_name'],c['electorate']) for c in snapshot['contests'] if c.get('registered_voters') is None]
    print('REMAINING_CANDIDATES',json.dumps(remaining,ensure_ascii=False),flush=True)
    print('REMAINING_PROFILES',json.dumps(missing_profiles,ensure_ascii=False),flush=True)

    validate_snapshot(snapshot)
    print('AUDIT',json.dumps(tally,ensure_ascii=False,sort_keys=True),flush=True)
    if args.write:
        # Require sizable coverage before replacing the trusted published snapshot.
        if tally['matched_candidates']<1500 or tally['registered_voters_filled']<100:
            raise RuntimeError('Coverage too low; refusing to replace history snapshot')
        write_snapshot_atomic(snapshot,OUTPUT)
        print('PUBLISHED',OUTPUT,flush=True)
if __name__=='__main__': main()
