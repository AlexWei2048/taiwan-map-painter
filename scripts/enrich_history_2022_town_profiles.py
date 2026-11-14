#!/usr/bin/env python3
"""Add *verified* 2022 mayoral township turnout from official CEC profiles.

All candidate votes remain unchanged. Join by county AND township text, verify
against existing candidate tallies, and reject conflicting/partial sources.
The December 18 Chiayi City rerun is not in the original CEC archive: keep its
two ward-level turnout records missing instead of borrowing November totals.
"""
from __future__ import annotations
import argparse
import collections
import hashlib
import io
import json
import sys
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from scripts.build_history_2022 import validate_snapshot, write_snapshot_atomic
from scripts.enrich_history_2022_cec import download, load_sources, norm, URL

PATH=ROOT/'assets/history-2022.json'
MAYOR_GROUPS=('C1/city','C1/prv')

def official_profiles(tables):
    result={}
    for group in MAYOR_GROUPS:
        counties={}; towns={}
        for row in tables[(group,'elbase.csv')]:
            if len(row)<6: continue
            province,city,district,town,village,name=row[:6]
            if district=='00' and town=='000' and village=='0000':
                counties[(province,city)]=norm(name)
            if town!='000' and village=='0000':
                towns[(province,city,district,town)]=norm(name)
        for row in tables[(group,'elprof.csv')]:
            if len(row)<10 or row[2]!='00' or row[3]=='000' or row[4]!='0000' or row[5]!='0000':
                continue
            province,city,district,town=row[:4]
            county=counties.get((province,city))
            town_name=towns.get((province,city,district,town))
            if not county or not town_name:raise ValueError(f'Unresolved official locality {group}: {row[:6]}')
            try: valid,invalid,cast,registered=map(int,row[6:10])
            except ValueError as e:raise ValueError(f'Invalid official election stats {group}: {row[:10]}') from e
            if valid<0 or invalid<0 or cast!=valid+invalid or registered<cast:
                raise ValueError(f'Inconsistent official ballot profile {group}: {row[:10]}')
            key=(county,town_name)
            if key in result:raise ValueError(f'Duplicate mayoral town {key}')
            result[key]=dict(office='mayor',county=county,town=town_name,
                registered_voters=registered,ballots_cast=cast,
                valid_votes=valid,invalid_votes=invalid)
    return result

def site_town_vote_groups(snapshot):
    groups=collections.defaultdict(int)
    for row in snapshot['rows']:
        if row['type']=='mayor' and row['level']=='town':
            if not row['town']:raise ValueError(f'Unnamed town result {row}')
            groups[(norm(row['county']),norm(row['town']))]+=int(row['votes'])
    return groups

def verify(snapshot,entries,full=True):
    groups=site_town_vote_groups(snapshot)
    keys={(item['county'],item['town']) for item in entries}
    if len(keys)!=len(entries):raise ValueError('Duplicate townProfiles keys')
    county_contests={norm(c['county_name']):c for c in snapshot['contests'] if c['election_id']=='2022-mayor'}
    assert len(county_contests)==22,'Expected 22 county mayor contests'
    by_county=collections.defaultdict(lambda:collections.Counter())
    for entry in entries:
        key=(entry['county'],entry['town'])
        if key not in groups:raise ValueError(f'Official town missing site candidate votes: {key}')
        if groups[key]!=entry['valid_votes']:raise ValueError(f'Official town vote mismatch: {key}: {groups[key]} versus {entry["valid_votes"]}')
        if entry['valid_votes']+entry['invalid_votes']!=entry['ballots_cast'] or entry['ballots_cast']>entry['registered_voters']:
            raise ValueError(f'Official turnout inconsistency: {key}')
        by_county[entry['county']].update({k:entry[k] for k in []})
        for field in ('valid_votes','invalid_votes','ballots_cast','registered_voters'):
            by_county[entry['county']][field]+=entry[field]
    missing=sorted(set(groups)-keys)
    chiayi=[('嘉义市','东区'),('嘉义市','西区')]
    if missing!=chiayi:raise ValueError(f'Unmatched official mayoral town groups; expected only Chiayi rerun: {missing}')
    for county,counter in by_county.items():
        contest=county_contests.get(county)
        if not contest:raise ValueError(f'Officially unknown county: {county}')
        for field in ('valid_votes','invalid_votes','ballots_cast','registered_voters'):
            if counter[field]!=contest[field]:
                raise ValueError(f'County {county} {field} sum conflict: {counter[field]} vs {contest[field]}')
    chiayi_contest=county_contests['嘉义市']
    if sum(groups[k] for k in chiayi)!=chiayi_contest['valid_votes']:
        raise ValueError('Chiayi rerun ward votes do not add to official citywide total')
    if full and len(entries)!=366:raise ValueError(f'Expected 366 CEC mayor town profiles, got {len(entries)}')
    return {'completeTownProfiles':len(entries),'chiayi2022RerunWardsWithoutTurnout':len(missing),
            'coveredMayoralCounties':len(by_county),'verifiedTownValidVoteGroups':len(entries),
            'unverifiedWards':[{'county':k[0],'town':k[1],'valid_votes':groups[k]} for k in missing]}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--write',action='store_true')
    parser.add_argument('--verify-existing',action='store_true')
    args=parser.parse_args()
    snapshot=json.loads(PATH.read_text(encoding='utf-8'))
    validate_snapshot(snapshot)
    if args.verify_existing:
        stats=verify(snapshot,snapshot.get('townProfiles',[]))
        print('VERIFIED_MAYOR_TOWN_TURNOUT',json.dumps(stats,ensure_ascii=False))
        return
    payload=download()
    sha=hashlib.sha256(payload).hexdigest()
    saved=snapshot['provenance']['cecArchiveEnrichment']['sha256']
    if sha!=saved:raise ValueError(f'CEC archive changed: expected {saved}, got {sha}. Reaudit before publishing')
    entries=official_profiles(load_sources(zipfile.ZipFile(io.BytesIO(payload))))
    profiles=[entries[k] for k in sorted(entries)]
    stats=verify(snapshot,profiles)
    snapshot['townProfiles']=profiles
    snapshot['provenance']['cecTownProfiles']={'source':URL,'sha256':sha,
      'scope':'2022 mayor, township/ward level; excluding separate Chiayi City rerun',
      'method':'CEC elbase town-code to canonical locality; official elprof precinct=0000, village=0000; exact verified candidate vote and county reconciliation',
      'statistics':stats}
    print('VERIFIED_MAYOR_TOWN_TURNOUT',json.dumps(stats,ensure_ascii=False),flush=True)
    if args.write:
        write_snapshot_atomic(snapshot,PATH)
        print('UPDATED_SNAPSHOT',str(PATH),flush=True)
    else:print('DRY_RUN (pass --write to publish)')

if __name__=='__main__':main()
