#!/usr/bin/env python3
"""Read-only 1996–2024 presidential history audit: official CEC vs stored shards.

Verify county and town candidate sums, official national totals, and report
candidate/town data availability in the original CEC election archive.
No winner or ballot data are modified by this script.
"""
import collections
import io
import json
import re
import sys
import zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from scripts.build_history_presidential import YEARS,OFFICIAL_VALID,EXPECTED_COUNTIES,EXPECTED_CANDIDATES,simplify
from scripts.enrich_history_2022_cec import download

def stats():
    report=[]
    for year in YEARS:
        snapshot=json.loads((ROOT/f'assets/history-president-{year}.json').read_text(encoding='utf-8'))
        towns=collections.defaultdict(int)
        counties=collections.defaultdict(int)
        candidate_counts=collections.Counter()
        for row in snapshot['rows']:
            if row['type']!='president':continue
            key=(row['county'],row['number'],row['name'])
            if row['level']=='town':
                towns[(row['county'],row['number'],row['name'])]+=int(row['votes'])
            if row['level']=='county':
                counties[key]+=int(row['votes'])
                candidate_counts[(row['county'],row['number'])]+=1
        mismatches=[(key,v,towns.get(key)) for key,v in counties.items() if towns.get(key)!=v]
        official_sum=sum(counties.values())
        values={'year':year,'country_count':len({k[0] for k in counties}), 'candidate_count':len({k[2] for k in counties}),
            'county_candidate_rows':len(counties),'town_candidate_rows':len([r for r in snapshot['rows'] if r['level']=='town']),
            'unique_towns':len({(r['county'],r['town']) for r in snapshot['rows'] if r['level']=='town'}),'town_vs_county_mismatches':len(mismatches),
            'mismatchExamples':mismatches[:4],'total_valid':official_sum,'officialAccepted':OFFICIAL_VALID[year],
            'counties_expected':EXPECTED_COUNTIES[year],'tickets_expected':EXPECTED_CANDIDATES[year]}
        report.append(values)
        print('PRESIDENTIAL_RECON',json.dumps(values,ensure_ascii=False),flush=True)
        if mismatches or official_sum not in OFFICIAL_VALID[year] or values['country_count']!=EXPECTED_COUNTIES[year] or values['candidate_count']!=EXPECTED_CANDIDATES[year]:
            raise ValueError(f'{year} township/county presidential totals invalid: {values}')
    return report

def cec_probe():
    blob=download()
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        names=[p for p in z.namelist() if p.lower().endswith('/elctks.csv')]
        probe=collections.defaultdict(list)
        for path in names:
            rest=path.split('/voteData/',1)[-1]
            year=re.search(r'(1996|2000|2004|2008|2012|2016|2020|2024)',rest)
            if not year:continue
            probe[int(year.group())].append(path)
        print('CEC_PRESIDENTIAL_ARCHIVE',json.dumps({k:[x.split('/voteData/',1)[-1] for x in v[:14]] for k,v in sorted(probe.items())},ensure_ascii=False),flush=True)
        for year,files in sorted(probe.items()):
            for path in files[:2]:
                decoded=z.read(path).decode('utf-8-sig',errors='replace').splitlines()[:3]
                print('CEC_PRESIDENTIAL_FILE_SAMPLE',json.dumps({'year':year,'path':path,'sample':decoded},ensure_ascii=False),flush=True)

if __name__=='__main__':
    stats()
    cec_probe()
