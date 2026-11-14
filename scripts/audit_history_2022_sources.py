#!/usr/bin/env python3
"""Reproducible, read-only audit of 2022 Island Palette election snapshot.
Run in CI with network access; never alter published totals during reconnaissance.
"""
import collections
import csv
import io
import json
import re
import urllib.request
import urllib.parse
from pathlib import Path
from bs4 import BeautifulSoup
from opencc import OpenCC
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.enrich_history_2022_cec import download, load_sources, FILES, norm

ROOT=Path(__file__).resolve().parents[1]
SNAP=json.loads((ROOT/'assets/history-2022.json').read_text(encoding='utf-8'))
def printj(label,obj): print(label,json.dumps(obj,ensure_ascii=False,sort_keys=True),flush=True)

def internal():
    rows=SNAP['rows']; contests=SNAP['contests']; cands=SNAP['candidacies']
    counts=collections.Counter((r['type'],r['level'],r['electorate']) for r in rows)
    printj('INTERNAL_COUNTS',{'rows':len(rows),'contests':len(contests),'candidacies':len(cands),'groups':[(list(k),n) for k,n in sorted(counts.items())]})
    printj('INTERNAL_MISSING',{'candidateGender':sum(not x.get('gender') for x in cands),'candidateIncumbent':sum(x.get('incumbent_at_election') is None for x in cands),'contestVoter':sum(x.get('registered_voters') is None for x in contests),'townRowName':sum(r['level']=='town' and not r['town'] for r in rows)})
    by_key=collections.defaultdict(list); primary=collections.defaultdict(list)
    for r in rows:
        if r['type'] not in ('mayor','council'): continue
        stem=(r['type'],r['electorate'],r['county'],'' if r['type']=='mayor' else r['district'],r['number'],r['name'])
        if r['level']=='town':by_key[stem].append(r)
        elif r['level']==('county' if r['type']=='mayor' else 'district'):primary[stem].append(r)
    inconsistent=[]
    for k,pr in primary.items():
        total=sum(r['votes'] for r in by_key.get(k,[]))
        if len(pr)!=1 or total!=pr[0]['votes']:
            inconsistent.append({'key':k,'primary':pr[0]['votes'] if pr else None,'townSum':total,'townCount':len(by_key.get(k,[]))})
    orphan=[k for k in by_key if k not in primary]
    printj('INTERNAL_TOWN_RECON',{'mismatchCount':len(inconsistent),'orphanCount':len(orphan),'mismatchExamples':inconsistent[:15],'orphanExamples':orphan[:8]})
    mapdata=json.loads((ROOT/'assets/map-base.json').read_text(encoding='utf-8'))
    town_pairs={(norm(t['county']),norm(t['name'])) for t in mapdata['towns']}
    unmatched=collections.Counter((norm(r['county']),norm(r['town'])) for r in rows if r['level']=='town' and r['town'] and (norm(r['county']),norm(r['town'])) not in town_pairs)
    printj('TOWN_GEOMETRY_MISMATCH',{'count':len(unmatched),'examples':unmatched.most_common(30)})
    return unmatched,inconsistent

def official():
    from zipfile import ZipFile
    import hashlib
    archive=download()
    tables=load_sources(ZipFile(io.BytesIO(archive)))
    printj('CEC_ARCHIVE',{'sha256':hashlib.sha256(archive).hexdigest(),'tables':len(tables)})
    for group in ['C1/city','C1/prv','T1/city','D1','D2']:
        names=['elcand.csv','elbase.csv','elprof.csv']
        for name in names:
            data=tables.get((group,name),[])
            x=data[:2]
            town_rows=[r for r in data if len(r)>=6 and r[3]!='000' and r[4]=='0000']
            printj('CEC_PROBE',{'group':group,'table':name,'rows':len(data),'first':x,'townRows':len(town_rows),'townSample':town_rows[:2]})
    return tables


def compare_cec_towns(tables):
    """Compare sums of individual candidate town votes to official CEC elprof tables.
    Match exact county, electorate, contest number and township. Never use list position."""
    from scripts.enrich_history_2022_cec import district_number
    groups=collections.defaultdict(int)
    for row in SNAP['rows']:
        if row['level']!='town': continue
        district=district_number(row.get('district','')) if row['type']=='council' else ''
        k=(row['type'],row['electorate'],norm(row['county']),norm(row['town']),district)
        groups[k]+=int(row['votes'])
    cec_profiles={}
    collision=[]
    for folder,(office,electorate) in FILES.items():
        base=tables[(folder,'elbase.csv')]
        counties={}; towns={}; districts={}
        for row in base:
            if len(row)<6:continue
            p,city,region,town,village,name=row[:6]
            if region=='00' and town=='000' and village=='0000':counties[(p,city)]=norm(name)
            if region!='00' and town=='000' and village=='0000':districts[(p,city,region)]=district_number(name)
            if town!='000' and village=='0000':towns[(p,city,region,town)]=norm(name)
        for row in tables[(folder,'elprof.csv')]:
            if len(row)<10 or row[3]=='000' or row[4]!='0000' or row[5]!='0000':continue
            p,city,region,town=row[:4]
            county=counties.get((p,city))
            tname=towns.get((p,city,region,town))
            if not county or not tname:continue
            district=districts.get((p,city,region),'') if office=='council' else ''
            if office=='council' and not district:continue
            k=(office,electorate,county,tname,district)
            value=tuple(int(x) for x in row[6:10])
            if k in cec_profiles and cec_profiles[k]!=value:
                collision.append([k,cec_profiles[k],value])
            cec_profiles[k]=value
    missing=[]; extra=[]; mismatched=[]; confirmed=0
    for k,reported in groups.items():
        official=cec_profiles.get(k)
        if official is None:missing.append([k,reported]);continue
        valid,invalid,cast,registered=official
        if reported!=valid or valid+invalid!=cast or registered<cast:
            mismatched.append({'key':k,'siteVotes':reported,'cecValid':valid,'cecInvalid':invalid,'cecCast':cast,'cecRegistered':registered})
        else:confirmed+=1
    for k,prof in cec_profiles.items():
        if k not in groups:extra.append([k,prof[0]])
    printj('CEC_TOWN_COMPARE',{'siteGroups':len(groups),'officialGroups':len(cec_profiles),'exactMatched':confirmed,'mismatches':len(mismatched),'missingOfficial':len(missing),'extraOfficial':len(extra),'collisions':len(collision),'mismatchExamples':mismatched[:25],'missingExamples':missing[:15],'extraExamples':extra[:15],'collisionExamples':collision[:5]})
    return groups,cec_profiles,mismatched

def nccu_deep():
    for family in ('H','F','DM','EM','G'):
        url='https://vote.nccu.edu.tw/cec/ceclist.asp?t='+family
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30) as fh:data=fh.read()
            soup=BeautifulSoup(data,'html.parser')
            trs=[tr for tr in soup.find_all('tr') if '2022' in tr.get_text(' ',strip=True)]
            summary=[]
            for tr in trs:
                links=[urllib.parse.urljoin(url,a.get('href','')) for a in tr.select('a[href]')]
                summary.append({'text':tr.get_text(' ',strip=True)[:180],'links':links})
            printj('NCCU_2022_LINKS',{'family':family,'bytes':len(data),'rows':summary[:9]})
        except Exception as e:printj('NCCU_2022_FETCH_ERROR',{'family':family,'error':str(e)})

def nccu():
    url='https://vote.nccu.edu.tw/cec/cechead.asp'
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30) as fh: data=fh.read()
        soup=BeautifulSoup(data.decode('big5',errors='replace'),'html.parser')
        anchors=[(a.get_text(' ',strip=True),urllib.parse.urljoin(url,a.get('href',''))) for a in soup.select('a[href]')]
        printj('NCCU_PROBE',{'bytes':len(data),'title':soup.title.get_text(strip=True) if soup.title else None,'anchors':len(anchors),'examples':anchors[:20],'pdf2022':[x for x in anchors if '2022' in x[0] or '2022' in x[1]][:30]})
    except Exception as e:printj('NCCU_FETCH_ERROR',{'error':str(e)})

def taiwanvotes():
    files=SNAP['provenance']['files']
    sample=[next(f for f in files if f['office']==office and city in f['filename']) for office,city in [('mayor','臺北市'),('council','新竹縣'),('township','新竹縣')]]
    for f in sample:
        try:
            with urllib.request.urlopen(urllib.request.Request(f['url'],headers={'User-Agent':'Mozilla/5.0'}),timeout=40) as fh:data=fh.read()
            records=list(csv.DictReader(io.StringIO(data.decode('utf-8-sig'))))
            import hashlib
            printj('TAIWANVOTES_PROBE',{'filename':f['filename'],'shaMatch':hashlib.sha256(data).hexdigest()==f['sha256'],'rows':len(records),'header':list(records[0]) if records else [],'first':records[:2]})
        except Exception as e:printj('TAIWANVOTES_ERROR',{'filename':f['filename'],'error':str(e)})

if __name__=='__main__':
    internal()
    nccu()
    taiwanvotes()
    tables=official()
    compare_cec_towns(tables)
    nccu_deep()
