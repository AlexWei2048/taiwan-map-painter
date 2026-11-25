#!/usr/bin/env python3
"""Backfill historical candidate profiles from verified NCCU vote3.asp rows.

Matching requires election year, office, county, exact name, ballot number and
vote count. Never replace a conflicting certified result without review.
"""
import argparse,collections,json,re,time,unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request,urlopen
from bs4 import BeautifulSoup
from opencc import OpenCC

ROOT=Path(__file__).resolve().parents[1]
BASE="https://vote.nccu.edu.tw/cec/"
CC=OpenCC('t2s')
YEARS={'F':[1993,1997,2001,2005,2009,2014,2018],
'DM':[1994,1998,2002,2006,2010,2014,2018],
'G':[1998,2002,2005,2009,2014,2018],
'EM':[1994,1998,2002,2006,2010,2014,2018],
'H':[1998,2002,2005,2009,2014,2018]}
OFFICE={'F':'mayor','DM':'mayor','G':'council','EM':'council','H':'township'}
_cache={}
def norm(s):
    return re.sub(r'\s+','',CC.convert(unicodedata.normalize('NFKC',str(s or ''))).replace('臺','台')).replace('．','·')
def fetch(url):
    if url in _cache: return _cache[url]
    for attempt in range(3):
        try:
            request=Request(url,headers={'User-Agent':'Mozilla/5.0 (historical election archive research)'})
            with urlopen(request,timeout=28) as f: b=f.read()
            d=BeautifulSoup(b.decode('utf-8',errors='replace'),'lxml')
            _cache[url]=d;time.sleep(.08);return d
        except Exception as exc:
            if attempt==2: raise
            time.sleep(1+attempt)
def page_urls(year,cat):
    top=BASE+f'ceclist.asp?y={year}&t={cat}'
    d=fetch(top)
    links=[urljoin(top,a.get('href')) for a in d.select('a[href]') if 'vote413.asp' in a.get('href','').lower()]
    if not links: return []
    d=fetch(links[0])
    return list(dict.fromkeys(urljoin(links[0],a.get('href')) for a in d.select('a[href]') if 'vote3.asp' in a.get('href','').lower()))
def extract(url):
    result=[]
    for tr in fetch(url).find_all('tr'):
        a=[td.get_text(' ',strip=True) for td in tr.find_all(['td','th'],recursive=False)]
        if len(a)<10 or not a[2].strip().isdigit() or not a[6].replace(',','').strip().isdigit():continue
        district=norm(a[0]);m=re.search(r'县|市',district)
        if not m:continue
        birth=int(a[4]) if a[4].strip().isdigit() else 0
        result.append(dict(county=district[:m.end()],district=district[m.end():],name=norm(a[1]),
          ballot_number=int(a[2]),votes=int(a[6].replace(',','')),
          gender={'M':'男','F':'女'}.get(a[3].strip().upper()),
          birth_year=birth if 1900<=birth<=2010 else None,
          incumbent={'Y':True,'N':False}.get(a[9].strip().upper()),
          elected={'Y':True,'N':False}.get(a[8].strip().upper()),
          party=norm(a[5]),source=url))
    return result
def key(office,county,name,votes,number):
    return (office,norm(county),norm(name),votes,int(number or 0))
def safe_extract(url):
    try:return (extract(url),None)
    except Exception as exc:return ([],str(exc))

def main():
    arg=argparse.ArgumentParser()
    arg.add_argument('--years',nargs='+',type=int,default=[1998,2002,2005,2009,2014,2018])
    arg.add_argument('--apply',action='store_true')
    arg.add_argument('--limit',type=int,default=0,help='maximum NCCU county pages per election for a probe')
    opts=arg.parse_args()
    snapshots={}
    indexes={}
    for year in opts.years:
        p=ROOT/f'assets/history-local-{year}.json'
        if not p.exists():continue
        s=json.loads(p.read_text(encoding='utf-8'))
        em={e['election_id']:e for e in s['elections']}
        dm={d['contest_id']:d for d in s['contests']}
        index=collections.defaultdict(list)
        for c in s['candidacies']:
            d=dm.get(c['contest_id'])
            if not d:continue
            office=em.get(d['election_id'],{}).get('office')
            if office not in ('mayor','council','township'):continue
            index[key(office,d['county_name'],c['candidate_name'],c.get('votes'),c.get('ballot_number'))].append((c,d))
        snapshots[year]=s;indexes[year]=index
    totals=collections.Counter()
    problems=[]
    updates=[]
    changed_years=set()
    summary=[]
    for cat,year_list in YEARS.items():
        for year in year_list:
            if year not in snapshots:continue
            try: urls=page_urls(year,cat)
            except Exception as e:
                problems.append({'year':year,'category':cat,'issue':'archive_error','error':str(e)})
                continue
            print(f'NCCU {year} {cat}: {len(urls)} pages',flush=True)
            rec_count=0; match_count=0
            chosen=urls[:opts.limit] if opts.limit else urls
            with ThreadPoolExecutor(max_workers=4) as pool:
              for url,(records,err) in zip(chosen,pool.map(safe_extract,chosen)):
                if err:
                    problems.append({'year':year,'category':cat,'issue':'page_error','url':url,'error':err})
                    continue
                totals['pages_checked']+=1
                for x in records:
                    rec_count+=1;totals['nccu_candidates_checked']+=1
                    found=indexes[year].get(key(OFFICE[cat],x['county'],x['name'],x['votes'],x['ballot_number']),[])
                    if len(found)!=1:
                        totals['unmatched']+=1
                        if len(problems)<500: problems.append({'year':year,'category':cat,'issue':'unmatched','candidate':x['name'],'county':x['county'],'votes':x['votes'],'number':x['ballot_number'],'matches':len(found),'url':url})
                        continue
                    candidate,district=found[0]
                    if OFFICE[cat]=='township' and x['district'] and norm(district['district_name'])!=x['district']:
                        totals['town_mismatch']+=1
                        if len(problems)<500:problems.append({'year':year,'category':cat,'issue':'town_mismatch','name':x['name'],'source':x['district'],'current':district['district_name'],'url':url})
                        continue
                    match_count+=1;totals['matched']+=1
                    fields={}
                    for f,nf in [('incumbent_at_election','incumbent'),('gender','gender')]:
                        if x[nf] is None:continue
                        if candidate.get(f) is None or (f=='gender' and candidate.get(f) not in ('男','女')):
                            fields[f]=x[nf]
                        elif candidate[f]!=x[nf]:
                            totals[f+'_conflicts']+=1
                            if len(problems)<500:problems.append({'year':year,'category':cat,'issue':f+'_conflict','name':x['name'],'current':candidate[f],'nccu':x[nf],'url':url})
                    if x['elected'] is not None and candidate.get('elected_official')!=x['elected']:
                        totals['elected_conflicts']+=1
                        if len(problems)<500: problems.append({'year':year,'category':cat,'issue':'elected_conflict','name':x['name'],'current':candidate.get('elected_official'),'nccu':x['elected'],'url':url})
                    if x['birth_year'] and not candidate.get('birth_year'):
                        fields['birth_year']=x['birth_year']
                    if fields:
                        totals['enriched_candidates']+=1
                        totals.update(f'field_{k}' for k in fields)
                        updates.append({'year':year,'office':OFFICE[cat],'county':x['county'],'district':x['district'],
                          'name':x['name'],'ballot_number':x['ballot_number'],'votes':x['votes'],'fields':fields,'source':url})
                        if opts.apply:
                            candidate.update(fields)
                            changed_years.add(year)
            summary.append({'year':year,'category':cat,'pages':len(urls),'source_candidates':rec_count,'matched':match_count})
    if opts.apply:
        for year,s in snapshots.items():
            if year not in changed_years: continue
            (ROOT/f'assets/history-local-{year}.json').write_text(json.dumps(s,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    report={'source_index':BASE+'ceclist.asp','apply':opts.apply,'summary':dict(totals),
      'elections':summary,'updated_records':updates,'issues':problems}
    path=ROOT/'reports/nccu-candidate-reconciliation.json'
    path.write_text(json.dumps(report,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    print('SUMMARY',json.dumps(dict(totals),ensure_ascii=False),flush=True)
    print('ISSUE_SAMPLES',json.dumps(problems[:20],ensure_ascii=False),flush=True)

if __name__=='__main__':main()
