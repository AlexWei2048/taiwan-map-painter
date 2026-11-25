#!/usr/bin/env python3
"""Reconcile 2008–2016 CEC regional district profiles by exact valid votes.

The CECDataSet VoteRegionProfile.csv repeats DistrictName as the number of
constituencies in a county for some rows. It cannot be used as the district
number. Use independent candidate totals and candidate counts instead.

Usage: python scripts/reconcile_legacy_legislative_district_profiles.py \
    /path/to/CECDataSet/data
"""
import csv
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COUNTY_CHARS = str.maketrans('臺縣雲義蘭東門連屏蓮區選園', '台县云义兰东门连屏莲区选园')


def norm(s):
    return str(s or '').translate(COUNTY_CHARS).strip()


def district_number(s):
    m = re.search(r'第\s*0*(\d+)\s*选', norm(s))
    if not m:
        raise ValueError(f'Unrecognized district {s!r}')
    return str(int(m.group(1)))


def reconcile(year, source_root):
    folder = source_root / f'{year}_第{ {2008: "07", 2012: "08", 2016: "09"}[year]}屆區域立法委員選舉'
    source = folder / 'VoteRegionProfile.csv'
    raw = source.read_bytes()
    election = json.loads((ROOT / f'assets/history-legislative-{year}.json').read_text())
    profile_path = ROOT / f'assets/history-legislative-turnout-{year}.json'
    profile = json.loads(profile_path.read_text())
    totals = defaultdict(lambda: [0, 0])
    for row in election['rows']:
        if row.get('electorate') != 'regional' or row.get('level') != 'district':
            continue
        key = (norm(row['county']), district_number(row['district']))
        totals[key][0] += int(row['votes'])
        totals[key][1] += 1

    candidates = defaultdict(list)
    with source.open(encoding='utf-8-sig', newline='') as stream:
        for row in csv.DictReader(stream):
            if row['TownshipName'] or row['VillageName'] or int(row['PollStationNo'] or 0):
                continue
            if int(row['ElectedCounts'] or 0) != 1:
                continue
            county = norm(row['CountyCityName'])
            try:
                record = [int(row[k]) for k in ('Voters', 'BallotsCast', 'BallotsAccepted', 'BallotsRejected')]
                count = int(row['CandidateCounts'])
            except (ValueError, KeyError):
                continue
            registered, cast, valid, invalid = record
            if registered < cast or cast != valid + invalid:
                continue
            candidates[(county, valid, count)].append(record)

    districts = profile['ballots']['regional']['district']
    added = 0
    for (county, number), (votes, count) in totals.items():
        matching = candidates.get((county, votes, count), [])
        unique = {tuple(row) for row in matching}
        if len(unique) != 1:
            if county in districts and number in districts[county]:
                continue
            raise ValueError(f'{year} {county} {number}: ambiguous/missing profile {unique}')
        record = list(next(iter(unique)))
        existing = districts.get(county, {}).get(number)
        if existing is not None and existing != record:
            raise ValueError(f'{year} {county} {number}: would change existing {existing} to {record}')
        if existing is None:
            districts.setdefault(county, {})[number] = record
            added += 1
    assert sum(map(len, districts.values())) == len(totals) == 73
    for county, rows in districts.items():
        sums = [sum(record[i] for record in rows.values()) for i in range(4)]
        if sums != profile['ballots']['regional']['county'][county]:
            raise ValueError(f'{year} {county}: constituency sums differ from county profile')
    profile['audit']['regional']['district_reconciliation'] = {
        'source': 'https://github.com/MISNUK/CECDataSet/tree/master/data/' + folder.name,
        'source_sha256': hashlib.sha256(raw).hexdigest(),
        'method': 'Exact independent candidate vote sum and candidate count; unique CEC profile; county four-field sums',
        'added': added,
        'verified_districts': 73,
    }
    profile_path.write_text(json.dumps(profile, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(year, 'new districts', added, 'verified', len(totals))


if __name__ == '__main__':
    source_root = Path(sys.argv[1])
    for election_year in (2008, 2012, 2016):
        reconcile(election_year, source_root)
