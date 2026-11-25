#!/usr/bin/env python3
"""Build local-election history from CEC originals and audit candidate returns against NCCU and Taiwan Votes."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from bs4 import BeautifulSoup

from build_history_2022 import ROOT, atomic_json, simplify

CEC = 'https://data.cec.gov.tw/選舉資料庫/votedata.zip'
NCCU = 'https://vote.nccu.edu.tw/cec/cechead.asp'
NCCU_1993 = 'https://vote.nccu.edu.tw/cec/F1993005.PDF'
TV = 'https://www.taiwanvotes.tw/download/'
COURT = 'https://jirs.judicial.gov.tw/GNNWS/NNWSS002.asp?id=456006'
TV_OFFICES = {
    '縣市長': ('mayor', 'regional'), '縣市議員': ('council', 'regional'),
    '原住民議員': ('council', 'indigenous'), '平地原住民議員': ('council', 'plains'),
    '山地原住民議員': ('council', 'mountain'),
    '鄉鎮市長': ('township', 'regional'), '原住民區長': ('township', 'mountain'),
}
CYCLES = {'1997-98': (1997, 1998), '2001-02': (2001, 2002),
          '2005-06': (2005, 2006), '2009-10': (2009, 2010)}
NCCU_OFFICES = {'L': 'mayor', 'N': 'mayor', 'M': 'council', 'O': 'council', 'P': 'township'}
DATES = {
    1993: '11-27', 1994: '12-03', 1997: '11-29', 2001: '12-01', 2005: '12-03',
    2006: '12-09', 2009: '12-05', 2010: '11-27', 2014: '11-29',
    2018: '11-24', 2022: '11-26',
}
# The certified citywide recount differs from the initial precinct-level tally.
TAIPEI_RECOUNT = {'1': 5611, '2': 577096, '3': 244342, '4': 580663, '5': 6158}

# Official result lists resolve omitted or shifted winner marks in the bulk files.
WINNER_CORRECTIONS = {
    (1998, '宜兰县', '第10选举区', '5'): ('*', 'https://web.cec.gov.tw/api/file/3917cc1e-42bc-46e3-aec6-2c9c20b9246d.pdf'),
    (1998, '宜兰县', '第10选举区', '6'): ('', 'https://web.cec.gov.tw/api/file/3917cc1e-42bc-46e3-aec6-2c9c20b9246d.pdf'),
    (2005, '台北县', '第6选举区', '23'): ('*', 'https://web.cec.gov.tw/api/file/1309a9e5-afda-4ad0-a69f-495166c1d872.pdf'),
    (2005, '嘉义县', '第4选举区', '10'): ('*', 'NCCU results and CEC certified seat total, corroborated by Jiayi council rosters'),
    (2005, '嘉义县', '第4选举区', '11'): ('*', 'NCCU results and CEC certified seat total, corroborated by Jiayi council rosters'),
    (2005, '屏东县', '第16选举区', '1'): ('*', 'NCCU results, CEC certified seat total and the next official election bulletin'),
}
SEAT_CORRECTIONS = {
    (2002, '台中市', '第6选举区'): (10, None, 'https://cdn.www.taichung.gov.tw/913381/post'),
    (2002, '金门县', '第1选举区'): (17, 4, 'https://www.kmdn.gov.tw/1117/1271/1272/107378/'),
}


def norm(value):
    return re.sub(r'\s+', '', simplify(value)).replace('臺', '台').replace('坵', '丘')


def name_key(value):
    return re.sub(r'[·．・‧•]', '', norm(value))


def party_key(value):
    value = norm(value)
    return '无党籍' if value in ('', '无') or value.startswith('无党籍') else value


def is_elected(mark):
    return mark in ('*', '!')


def marker(mark):
    return {'＊': '*', '！': '!', '？': '?'}.get(mark, mark if mark in ('*', '!', '?') else '')


def code(value):
    return int(value) if value.isdecimal() else 0


def classify(path):
    folder, _, part = path.partition('/')
    year = int(folder[:4])
    if year == 2022:
        group = part.split('/')[0]
        return {
            'C1': ('mayor', 'regional'), 'D1': ('township', 'regional'),
            'D2': ('township', 'mountain'), 'T1': ('council', 'regional'),
            'T2': ('council', 'plains'), 'T3': ('council', 'mountain'),
        }.get(group)
    if part:
        label = part
    else:
        label = re.sub(r'^\d+', '', folder)
    if '民代表' in label or '村里長' in label or '區民代表' in label or label == '里長':
        return None
    if '鄉鎮市長' in label:
        return 'township', 'regional'
    if label == '直轄市區長':
        return 'township', 'mountain'
    if '市長' in label or label == '市長':
        return 'mayor', 'regional'
    if '議員' in label or '縣市議員' in folder or '直轄市議員' in folder:
        if '山' in label:
            return 'council', 'mountain'
        if '平' in label:
            return 'council', 'plains'
        if '原住民' in label:
            return 'council', 'indigenous'
        return 'council', 'regional'
    return None


def read_table(archive, path, name):
    content = archive.read(f'{path}/{name}.csv')
    for encoding in ('utf-8-sig', 'cp950'):
        try:
            rows = [[v.strip().lstrip("'").strip() for v in row]
                    for row in csv.reader(io.StringIO(content.decode(encoding))) if row]
            if name != 'elpaty':
                for row in rows:
                    for i, width in enumerate((2, 3, 2, 3, 4)):
                        if len(row) > i and row[i].isdigit():
                            row[i] = row[i].zfill(width)
            return rows
        except UnicodeDecodeError:
            continue
    raise ValueError(f'Unrecognized encoding: {path}/{name}')


def election_date(year, county, office):
    date = DATES.get(year)
    if year in (1998, 2002):
        direct = county in ('台北市', '高雄市')
        date = ('12-05' if year == 1998 else '12-07') if direct else ('01-24' if year == 1998 else '01-26')
    if (year, county, office) == (2022, '嘉义市', 'mayor'):
        date = '12-18'
    return f'{year}-{date}'


def source_contests(archive, path, office, electorate):
    year = int(path.split('/voteData/')[1][:4])
    local = path.split('/voteData/')[1]
    base = {tuple(row[:5]): row[5] for row in read_table(archive, path, 'elbase') if len(row) >= 6}
    parties = {code(row[0]): row[1] for row in read_table(archive, path, 'elpaty') if len(row) >= 2}
    choices = defaultdict(list)
    for row in read_table(archive, path, 'elcand'):
        if len(row) >= 15 and row[5].isdigit():
            choices[tuple(row[:4])].append(row)
    tickets = defaultdict(dict)
    ticket_marks = defaultdict(dict)
    for row in read_table(archive, path, 'elctks'):
        if len(row) < 10 or not row[6].isdigit() or not row[7].isdigit():
            continue
        geo = tuple(row[:5]) + (code(row[5]),)
        number, votes = str(int(row[6])), int(row[7])
        if number in tickets[geo] and tickets[geo][number] != votes:
            raise ValueError(f'Conflicting CEC duplicate: {local} {geo} #{number}')
        tickets[geo][number] = votes
        ticket_marks[geo][number] = marker(row[9])
    profiles = {tuple(r[:5]) + (code(r[5]),): r for r in read_table(archive, path, 'elprof') if len(r) >= 10}
    by_county = defaultdict(list)
    for geo in tickets:
        by_county[geo[:2]].append(geo)
    for key, candidates in choices.items():
        county_key = key[:2]
        county = base.get((*county_key, '00', '000', '0000'))
        if not county:
            raise ValueError(f'Unnamed CEC county: {local} {key}')
        numbers = {str(int(c[5])) for c in candidates}
        region = code(key[2])
        town = (base.get((*key, '0000')) or base.get((*county_key, '00', key[3], '0000'), '')) if office == 'township' else ''
        scope = defaultdict(set)
        if office == 'council':
            for bkey, label in base.items():
                if (bkey[:2] == county_key and code(bkey[3]) and not code(bkey[4])
                        and (code(bkey[2]) == region or electorate == 'indigenous' and region == 0)):
                    scope[bkey[3]].add(label)
        geos = []
        for geo in by_county[county_key]:
            _, _, district, town_code, _, _ = geo
            if office == 'township' and town_code != key[3]:
                continue
            if office == 'council' and code(district) != region and not (region == 0 and electorate == 'indigenous'):
                continue
            if tickets[geo].keys() == numbers:
                geos.append(geo)
        aggregates = [g for g in geos if not code(g[4]) and not g[5]]
        main = [g for g in aggregates if office == 'township' or not code(g[3])]
        if len(main) > 1:
            main.sort(key=lambda g: (g[2] != key[2], -code(g[2])))
        totals = tickets[main[0]] if main else None
        detail = {}
        if office in ('mayor', 'council'):
            for g in aggregates:
                if code(g[3]):
                    detail[g[3]] = tickets[g]
        # Some archives use precinct zero in village totals; select one level
        # per township to prevent counting the same ballots twice.
        village_geos = defaultdict(list)
        for g in geos:
            if code(g[4]):
                village_geos[g[3]].append(g)
        for town_code, items in village_geos.items():
            if town_code not in detail:
                villages = {g[4] for g in items}
                village_totals = [g for g in items if not g[5]]
                selected = village_totals if {g[4] for g in village_totals} == villages else [g for g in items if g[5]]
                if selected:
                    detail[town_code] = {n: sum(tickets[g][n] for g in selected) for n in numbers}
        if totals is None and detail:
            totals = {n: sum(sub[n] for sub in detail.values()) for n in numbers}
        if totals is None:
            raise ValueError(f'No complete CEC candidate results: {local} {key} {county} {town}')
        main_geo = main[0] if main else (*key, '0000', 0)
        profile = profiles.get(main_geo)
        if office == 'mayor':
            profile = profiles.get((*county_key, '00', '000', '0000', 0)) or profile
        if office == 'council' and electorate == 'indigenous' and region == 0:
            profile = profiles.get((*key, '0000', 0)) or profile
        if office == 'township':
            profile = next((r for d in (key[2], '01', '00', '0')
                            if (r := profiles.get((*county_key, d, key[3], '0000', 0)))
                            and r[6] == str(sum(totals.values()))), profile)
        town_labels = {}
        town_profiles = {}
        for town_code in detail if office in ('mayor', 'council') else ():
            if not code(town_code):
                continue
            for district_code in dict.fromkeys((key[2], main_geo[2], '00', '01', '0')):
                town_geo = (*county_key, district_code, town_code, '0000')
                if town_geo not in base:
                    continue
                town_labels[town_code] = base[town_geo]
                town_profiles[town_code] = next((r for profile_district in (district_code, '0', '00', '01')
                    if (r := profiles.get((*county_key, profile_district, town_code, '0000', 0)))
                    and r[6] == str(sum(detail[town_code].values()))), None)
                break
        district_name = base.get((*key, '0000'), '')
        if office == 'mayor':
            district_name = county
        elif office == 'township':
            district_name = town
        elif electorate == 'indigenous':
            district_name = '原住民選區'
        else:
            district_name = f'第{region}選舉區'
        if not district_name:
            raise ValueError(f'Unnamed CEC contest: {local} {key}')
        roster = []
        for c in candidates:
            number = str(int(c[5]))
            roster.append({
                'number': number, 'name': c[6], 'party': parties.get(code(c[7]), '無黨籍'),
                'gender': {'1': '男', '2': '女'}.get(c[8], ''),
                'incumbent': {'Y': True, 'N': False}.get(c[13]),
                'mark': ticket_marks[main_geo].get(number, marker(c[14])),
                'candidate_mark': marker(c[14]), 'votes': totals[number],
            })
        yield {
            'year': year, 'office': office, 'electorate': electorate, 'county': county,
            'district': district_name, 'region': region, 'local': local,
            'date': election_date(year, norm(county), office), 'roster': roster, 'profile': profile,
            'detail': detail, 'town_labels': town_labels, 'town_profiles': town_profiles,
            'scope': sorted({label for labels in scope.values() for label in labels}),
        }


def tv_index(folder):
    index = defaultdict(list)
    for path in sorted(folder.glob('*.csv')):
        prefix, cycle, county = path.stem.split('_', 2)
        if prefix not in TV_OFFICES:
            continue
        years = CYCLES.get(cycle, (int(cycle),) if cycle.isdecimal() else ())
        if not years:
            continue
        office, electorate = TV_OFFICES[prefix]
        rows = defaultdict(lambda: {'votes': 0, 'mark': '', 'party': ''})
        with path.open(encoding='utf-8-sig', newline='') as source:
            for r in csv.DictReader(source):
                if not r['號次'].isdigit() or not r['得票數'].isdigit():
                    continue
                if office == 'township':
                    district = r['鄉鎮市區'] or r['選區']
                elif office == 'council':
                    district = r['選區']
                else:
                    district = county
                key = (norm(district), str(int(r['號次'])), r['候選人'])
                item = rows[key]
                item['votes'] += int(r['得票數'])
                item['mark'] = marker(r['當選註記']) or item['mark']
                item['party'] = r['政黨']
        for (district, number, name), item in rows.items():
            for year in years:
                index[(year, office, norm(county), number)].append({
                    **item, 'name': name, 'district': district, 'electorate': electorate})
    return index


def nccu_index(folder):
    index = defaultdict(list)
    for path in sorted(folder.iterdir()):
        match = re.match(r'^(\d{4})([LMNOP])', path.name.removeprefix('island-nccu-'))
        if not match or not path.is_file():
            continue
        year, office = int(match[1]), NCCU_OFFICES[match[2]]
        html = BeautifulSoup(path.read_bytes(), 'html.parser')
        for tr in html.select('tr'):
            r = [td.get_text(strip=True) for td in tr.find_all('td', recursive=False)]
            if len(r) != 10 or not r[2].isdigit() or not r[6].replace(',', '').isdigit():
                continue
            scope = norm(r[0])
            county = re.match(r'^.+?[县市]', scope)
            if not county:
                continue
            index[(year, office, county[0], str(int(r[2])))].append({
                'name': r[1], 'district': scope.removeprefix(county[0]), 'party': r[5],
                'gender': {'M': '男', 'F': '女'}.get(r[3], ''), 'incumbent': {'Y': True, 'N': False}.get(r[9]),
                'votes': int(r[6].replace(',', '')), 'mark': '*' if r[8].upper() in ('Y', '*', '是', '當選') else '',
                'winner_known': r[8].upper() in ('Y', 'N', '*', '是', '否', '當選'),
            })
    return index


def nccu_1993_contests(nccu, profiles_file):
    profiles = {}
    html = BeautifulSoup(profiles_file.read_bytes(), 'html.parser')
    for tr in html.select('tr'):
        row = [td.get_text(strip=True) for td in tr.find_all('td', recursive=False)]
        if len(row) != 15 or not all(row[i].isdigit() for i in (2, 3, 6, 9, 10, 11)):
            continue
        profiles[norm(row[0])] = row
    rosters = defaultdict(list)
    for (year, office, county, number), matches in nccu.items():
        if year != 1993 or office != 'mayor':
            continue
        if len(matches) != 1:
            raise ValueError(f'1993 duplicate candidate: {county}/{number}')
        roster = matches[0]
        rosters[county].append({**roster, 'number': number, 'candidate_mark': roster['mark']})
    if len(rosters) != 23 or sum(map(len, rosters.values())) != 77:
        raise ValueError('1993 source does not cover all 23 counties and 77 candidates')
    for county, roster in rosters.items():
        row = profiles[county]
        if int(row[3]) != len(roster) or int(row[6]) != sum(is_elected(p['mark']) for p in roster):
            raise ValueError(f'1993 NCCU overview disagrees with the roster for {county}')
        total = sum(p['votes'] for p in roster)
        if total != int(row[10]):
            raise ValueError(f'1993 NCCU overview disagrees with valid votes for {county}: {total} vs {row[10]}')
        names = {p['number']: p['name'] for p in roster}
        votes_name = profiles_file.parent / f'1993-town-votes-{row[0]}.html'
        regional = defaultdict(dict)
        if votes_name.is_file():
            html = BeautifulSoup(votes_name.read_bytes(), 'html.parser')
            for tr in html.select('tr'):
                r = [td.get_text(strip=True) for td in tr.find_all('td', recursive=False)]
                if len(r) != 5 or not r[2].isdigit() or not r[3].replace(',', '').isdigit():
                    continue
                number = str(int(r[2]))
                area = norm(r[0])
                if not area.startswith(county) or area == county or r[1] != names.get(number):
                    continue
                town = area.removeprefix(county)
                if number in regional[town]:
                    raise ValueError(f'Duplicate NCCU 1993 result {county} {town}/{number}')
                regional[town][number] = int(r[3].replace(',', ''))
        detail = {town: votes for town, votes in regional.items() if votes.keys() == names.keys()}
        labels = {town: town for town in detail}
        town_profiles = {}
        profile_name = profiles_file.parent / f'1993-town-profile-{row[0]}.html'
        if profile_name.is_file():
            html = BeautifulSoup(profile_name.read_bytes(), 'html.parser')
            for tr in html.select('tr'):
                r = [td.get_text(strip=True) for td in tr.find_all('td', recursive=False)]
                if len(r) != 6 or not all(r[i].isdigit() for i in (1, 2, 3, 4)):
                    continue
                town = norm(r[0]).removeprefix(county)
                if town in detail:
                    town_profiles[town] = [''] * 6 + [r[3], r[4], r[2], r[1]]
        # Wuqiu is the only missing Kinmen township profile in this archive.
        # Derive exact residual counts only from a complete six-town return,
        # with independently reconciled candidate totals and five valid profiles.
        residual_towns = set()
        kinmen_towns = {'金城镇', '金沙镇', '金湖镇', '金宁乡', '烈屿乡', '乌丘乡'}
        if county == '金门县' and set(detail) == kinmen_towns and set(town_profiles) == kinmen_towns - {'乌丘乡'}:
            official = list(map(int, (row[10], row[11], row[9], row[2])))
            other = [list(map(int, p[6:10])) for p in town_profiles.values()]
            if (sum(sum(v.values()) for v in detail.values()) == official[0]
                    and all(sum(v[n] for v in detail.values()) == next(p['votes'] for p in roster if p['number'] == n) for n in names)
                    and all(int(town_profiles[t][6]) == sum(detail[t].values()) for t in town_profiles)
                    and all(a >= 0 and b >= 0 and a+b == c and d >= c for a,b,c,d in other)):
                residual = [v - sum(p[i] for p in other) for i,v in enumerate(official)]
                a,b,c,d = residual
                if a == sum(detail['乌丘乡'].values()) and a >= 0 and b >= 0 and a+b == c and d >= c:
                    town_profiles['乌丘乡'] = [''] * 6 + list(map(str, residual))
                    residual_towns.add('乌丘乡')
        yield {'year': 1993, 'office': 'mayor', 'electorate': 'regional', 'county': row[0],
               'district': row[0], 'region': 0, 'date': '1993-11-27', 'roster': roster,
               'profile': [''] * 6 + [row[10], row[11], row[9], row[2]],
               'local': 'NCCU candidate records and election overview (attributed to CEC)',
               'scope': [], 'detail': detail, 'town_labels': labels, 'town_profiles': town_profiles, 'residual_towns': residual_towns}


def match_candidate(contest, candidate, index, source):
    key = (contest['year'], contest['office'], norm(contest['county']), candidate['number'])
    district = norm(contest['district'])
    possibles = list(index.get(key, []))
    if source == 'tv':
        possibles = [p for p in possibles if p['electorate'] == contest['electorate']]
    if contest['office'] == 'township':
        possibles = [p for p in possibles if norm(p['district']) == district]
    if contest['office'] == 'council':
        def district_number(text):
            m = re.search(r'第([\d一二三四五六七八九十]+)选', text)
            if not m:
                return None
            v = m[1]
            if v.isdigit():
                return int(v)
            digits = '一二三四五六七八九'
            left, sep, right = v.partition('十')
            return ((digits.index(left) + 1 if left else 1) * 10 + (digits.index(right) + 1 if right else 0)) if sep else digits.index(v) + 1
        same = [p for p in possibles if district_number(p['district']) == contest['region']]
        if same:
            possibles = same
    exact = [p for p in possibles if name_key(p['name']) == name_key(candidate['name'])]
    if exact:
        possibles = exact
    else:
        # A ballot number repeated in another district is not evidence.
        possibles = [p for p in possibles if abs(p['votes'] - candidate['votes']) <= 1]
    unique = {(p['name'], p['votes'], p['mark'], p['party']) for p in possibles}
    return possibles[0] if len(unique) == 1 else None


def profile_fields(row, total):
    if row and all(value.isdigit() for value in row[6:10]):
        valid, invalid, cast, registered = map(int, row[6:10])
        if valid == total and valid + invalid == cast and registered >= cast:
            return {'registered_voters': registered, 'ballots_cast': cast, 'invalid_votes': invalid}
    return {'registered_voters': None, 'ballots_cast': None, 'invalid_votes': None}


def build(contests, tv, nccu):
    snapshots = {}
    audit = {}
    for ct in contests:
        year, office, electorate = ct['year'], ct['office'], ct['electorate']
        county, district = map(norm, (ct['county'], ct['district']))
        if year not in snapshots:
            snapshots[year] = {'schemaVersion': 2, 'year': year, 'elections': [], 'contests': [],
                               'candidacies': [], 'rows': [], 'townProfiles': []}
            audit[year] = {'counts': Counter(), 'differences': [], 'sourceFolders': set()}
        s, a = snapshots[year], audit[year]
        counts = a['counts']
        a['sourceFolders'].add(ct['local'])
        eid = f'{year}-{office}'
        cid = f'{eid}:{county}:{electorate}:{district}'
        if not any(e['election_id'] == eid for e in s['elections']):
            s['elections'].append({'election_id': eid, 'year': year, 'office': office,
                                   'source_name': '政治大学选举研究中心（中选会统计）' if year==1993 else '中央选举委员会',
                                   'source_url': NCCU_1993 if year==1993 else CEC})
        recount = (year, office, county) == (2018, 'mayor', '台北市')
        if recount:
            for p in ct['roster']:
                p['initial_votes'] = p['votes']
                p['votes'] = TAIPEI_RECOUNT[p['number']]
        # In Yunlin 2005 district 3 both secondary sources reproduce the
        # four CEC township subtotals. The district summary misallocates 652
        # votes between two candidates while leaving total valid votes intact.
        yunlin = (year, county, district) == (2005, '云林县', '第3选举区') and office == 'council'
        if yunlin:
            for p in ct['roster']:
                subtotal = sum(votes[p['number']] for votes in ct['detail'].values())
                if subtotal != p['votes']:
                    p['summary_votes'] = p['votes']
                    p['votes'] = subtotal
        total = sum(p['votes'] for p in ct['roster'])
        profile = profile_fields(ct['profile'], total)
        if office == 'council':
            for p in ct['roster']:
                if correction := WINNER_CORRECTIONS.get((year, county, district, p['number'])):
                    p['archive_mark'] = p['mark']
                    p['mark'], p['winner_source'] = correction
        winners = sum(is_elected(p['mark']) for p in ct['roster'])
        seats = (int(ct['profile'][12]) if ct['profile'] and len(ct['profile']) > 12
                 and ct['profile'][12].isdigit() and int(ct['profile'][12]) >= winners else winners)
        reserved = None
        if office=='council' and (correction := SEAT_CORRECTIONS.get((year, county, district))):
            seats, reserved, source = correction
            a.setdefault('seatCorrections', []).append({
                'contest': cid, 'adoptedSeats': seats, 'reservedSeats': reserved, 'source': source,
                'cecArchiveSeats': ct['profile'][12] if ct['profile'] else None,
            })
        scope = sorted({norm(town) for town in ct['scope']} | {norm(town) for town in ct['town_labels'].values() if office == 'council'})
        s['contests'].append({
            'contest_id': cid, 'election_id': eid, 'county_id': county,
            'county_name': county, 'county_name_official': ct['county'],
            'district_id': cid, 'district_name': district, 'district_name_official': ct['district'],
            'electorate': electorate, 'election_date': ct['date'], 'valid_votes': total,
            'seats': seats if office == 'council' else 1,
            'reserved_seats': reserved if office == 'council' else 0,
            'scope_names': scope, 'district_number': ct['region'], **profile,
        })
        # Geography and the published vote sums must use the same tally version.
        detail = {k: vs for k, vs in ct['detail'].items() if k in ct['town_labels']}
        use_detail = office == 'mayor' and not recount and bool(detail) and all(
            sum(v.get(p['number'], 0) for v in detail.values()) == p['votes'] for p in ct['roster'])
        if office == 'mayor' and not use_detail:
            counts['withheld_mayor_town_contests'] += 1
        if use_detail:
            for key, votes in detail.items():
                subtotal = sum(votes.values())
                s['townProfiles'].append({'office': office, 'county': county, 'town': norm(ct['town_labels'][key]),
                                          'valid_votes': subtotal, **profile_fields(ct['town_profiles'].get(key), subtotal)})
                if key in ct.get('residual_towns', set()) and s['townProfiles'][-1]['registered_voters'] is not None:
                    s['townProfiles'][-1].update(profile_method='county_total_minus_all_other_towns', profile_source=NCCU_1993)
        for p in ct['roster']:
            sources = {name: match_candidate(ct, p, index, name) for name, index in (('tv', tv), ('nccu', nccu))}
            flags = {}
            for name, other in sources.items():
                if other is None:
                    counts[f'{name}_unmatched'] += 1
                    continue
                counts[f'{name}_matched'] += 1
                fields = {}
                if other['votes'] != p['votes']:
                    fields['votes'] = other['votes']
                if name_key(other['name']) != name_key(p['name']):
                    fields['name'] = other['name']
                if party_key(other['party']) != party_key(p['party']):
                    fields['party'] = other['party']
                if other.get('winner_known', True) and is_elected(other['mark']) != is_elected(p['mark']):
                    fields['elected'] = is_elected(other['mark'])
                if fields:
                    flags[name] = fields
            if recount:
                flags['cec_initial'] = {'votes': p['initial_votes']}
            if 'summary_votes' in p:
                flags['cec_district_summary'] = {'votes': p['summary_votes']}
            if 'archive_mark' in p:
                flags['cec_constituency_archive'] = {'mark': p['archive_mark']}
            if p['candidate_mark'] != p['mark']:
                flags['cec_candidate_file'] = {'mark': p['candidate_mark']}
            marker_source = p.get('winner_source') or (
                             'CEC township subtotals corroborated by NCCU and Taiwan Votes' if 'summary_votes' in p
                             else 'CEC constituency result, rather than candidate file' if 'cec_candidate_file' in flags
                             else 'CEC official constituency result and election profile')
            candidate_name = p['name']
            # When the original has an encoding placeholder, matching sources
            # can recover spelling once the contest, number and votes agree.
            if any(0xE000 <= ord(ch) <= 0xF8FF or ch == '\ufffd' for ch in candidate_name):
                spellings = [x['name'] for x in sources.values() if x and x['votes'] == p['votes'] and '☐' not in x['name']]
                def compatible(spelling):
                    return len(spelling) == len(candidate_name) and all(
                        a == b or 0xE000 <= ord(a) <= 0xF8FF or a == '\ufffd'
                        for a, b in zip(candidate_name, spelling))
                if spellings and len(set(spellings)) == 1 and compatible(spellings[0]):
                    candidate_name = spellings[0]
                    marker_source = 'CEC returns, spelling restored from corroborating record'
            if flags:
                a['differences'].append({'contest': cid, 'number': p['number'], 'candidate': candidate_name,
                                         'adopted': {'votes': p['votes'], 'party': p['party'], 'mark': p['mark']},
                                         'sources': flags, 'decision': COURT if recount else marker_source})
            if all(sources.values()) and not flags:
                counts['three_source_agreement'] += 1
            counts['candidates'] += 1
            winner = is_elected(p['mark'])
            name = '乾'.join(simplify(part) for part in candidate_name.split('乾'))
            s['candidacies'].append({
                'candidacy_id': f'{cid}:{p["number"]}', 'contest_id': cid, 'ballot_number': p['number'],
                'candidate_name': name, 'candidate_name_official': candidate_name,
                'gender': p['gender'], 'incumbent_at_election': p['incumbent'],
                'party_name': party_key(p['party']), 'party_name_official': p['party'],
                'votes': p['votes'], 'vote_share': round(p['votes'] * 100 / total, 6) if total else 0,
                'elected_official': winner, 'elected_mark': p['mark'],
            })
            row = {'type': office, 'electorate': electorate, 'county': county, 'name': name,
                   'district': district if office == 'council' else '', 'number': p['number'],
                   'party': party_key(p['party']), 'gender': p['gender'], 'incumbent': p['incumbent'],
                   'votes': p['votes'], 'elected': winner, 'electedMark': p['mark']}
            s['rows'].append({**row, 'level': {'mayor': 'county', 'council': 'district', 'township': 'town'}[office],
                              'town': district if office == 'township' else ''})
            if use_detail:
                for key, votes in detail.items():
                    s['rows'].append({**row, 'level': 'town', 'town': norm(ct['town_labels'][key]), 'votes': votes[p['number']]})
    return snapshots, audit


def add_taipei_mayor_tallies(snapshot, audit=None):
    evidence = json.loads((ROOT / 'sources/history-2018-taipei-mayor-original.json').read_text(encoding='utf-8'))
    county = '台北市'
    fields = ('registered_voters', 'ballots_cast', 'valid_votes', 'invalid_votes')
    contest = next(c for c in snapshot['contests'] if c['contest_id'] == '2018-mayor:台北市:regional:台北市')
    recount = evidence['recount_profiles']
    city = recount['city']
    rows = sorted((r for r in snapshot['rows'] if r['county'] == county and r['type'] == 'mayor'
                   and r['level'] == 'county'), key=lambda row: int(row['number']))
    if (len(rows) != 5 or sum(r['votes'] for r in rows) != city['valid_votes']
            or any(sum(r[k] for r in recount['districts'].values()) != city[k] for k in fields)):
        raise ValueError('2018 Taipei certified recount figures do not reconcile')
    contest.update(city)
    contest['source_url'] = 'https://web.cec.gov.tw/api/file/7bdd5702-140d-4b72-8a50-77239de96794.pdf'
    districts = evidence['districts']
    if (len(districts) != 12 or districts.keys() != recount['districts'].keys()
            or tuple(map(sum, zip(*(p['votes'] for p in districts.values())))) != (5617, 577566, 244641, 580820, 6172)):
        raise ValueError('2018 Taipei original district candidate returns do not reconcile')
    for name, original in districts.items():
        certified = recount['districts'][name]
        for profile in (original, certified):
            if (profile['valid_votes'] + profile['invalid_votes'] != profile['ballots_cast']
                    or profile['ballots_cast'] > profile['registered_voters']):
                raise ValueError(f'2018 Taipei ballot profile does not reconcile: {name}')
        if sum(original['votes']) != original['valid_votes'] or original['registered_voters'] != certified['registered_voters']:
            raise ValueError(f'2018 Taipei district votes do not reconcile: {name}')
        town = norm(name)
        snapshot['rows'].extend({**row, 'level': 'town', 'town': town, 'votes': votes,
                                 'tally_basis': 'original_opening'} for row, votes in zip(rows, original['votes']))
        snapshot['townProfiles'].append({
            'office': 'mayor', 'county': county, 'town': town, **certified,
            'tally_basis': 'certified_recount', 'profile_source': recount['source_url'],
        })
    if audit is not None:
        audit['taipeiMayorDistrictTallies'] = {
            'original_opening': {'source': evidence['source_url'], 'crosscheck': evidence['crosscheck_url'],
                                 'districts': len(districts), 'valid_votes': sum(p['valid_votes'] for p in districts.values())},
            'certified_recount': {'profile_source': recount['source_url'], 'districts': len(districts),
                                  'valid_votes': city['valid_votes'], 'candidate_breakdown_available': False},
        }


def add_chiayi_rerun(contests):
    # The CEC bulk ZIP dates to November 26; use the separately verified
    # December 18 returns already preserved in the site's official 2022 snapshot.
    archive = json.loads((ROOT / 'assets/history-2022.json').read_text())
    evidence = archive['provenance']['chiayi2022Rerun']
    row = next(c for c in archive['contests']
               if c['county_name'] == '嘉义市' and c['election_id'] == '2022-mayor')
    roster = [
        {'number': c['ballot_number'], 'name': c['candidate_name_official'],
         'party': c['party_name_official'], 'votes': c['votes'], 'gender': c['gender'],
         'incumbent': c['incumbent_at_election'], 'mark': c['elected_mark'],
         'candidate_mark': c['elected_mark']}
        for c in archive['candidacies'] if c['contest_id'] == row['contest_id']
    ]
    if len(roster) != evidence['verified_candidate_count'] or sum(c['votes'] for c in roster) != row['valid_votes']:
        raise ValueError('2022 Chiayi rerun official archive has inconsistent totals')
    contests.append({
        'year': 2022, 'office': 'mayor', 'electorate': 'regional', 'county': '嘉義市',
        'district': '嘉義市', 'region': 0, 'local': evidence['source'], 'date': evidence['date'],
        'roster': roster, 'profile': [''] * 6 + [str(row[k]) for k in
          ('valid_votes', 'invalid_votes', 'ballots_cast', 'registered_voters')],
        'scope': [], 'detail': {}, 'town_labels': {}, 'town_profiles': {},
    })


def add_1994_township(snapshot, audit):
    archive = json.loads((ROOT / 'sources/history-1994-township.json').read_text(encoding='utf-8'))
    contests, evidence, profiles = [], {}, {}
    for county in archive['counties']:
        districts = county['districts']
        normalized_county = norm(county['county'])
        totals = [sum(column) if None not in column else None for column in zip(*(d['profile'] for d in districts))]
        if (len({item['town'] for item in districts}) != county['contest_count']
                or len(districts) != county['contest_count']
                or sum(len(item['candidates']) for item in districts) != county['candidate_count']
                or totals != county['profile_totals']):
            raise ValueError(f'1994 {normalized_county} archive coverage or county totals do not reconcile')
        evidence[normalized_county] = county
        for item in districts:
            registered, cast, valid, invalid = item['profile']
            candidates = item['candidates']
            results_url = item.get('results_url', county['results_url'])
            numbers = [row[0] for row in candidates]
            if (cast != (valid + invalid if invalid is not None else None)
                    or (registered is not None and registered < (cast if cast is not None else valid))
                    or sum(row[4] for row in candidates) != valid
                    or numbers not in (list(range(1, len(candidates) + 1)), [None])
                    or sum(row[5] for row in candidates) != 1
                    or next(row[4] for row in candidates if row[5]) != max(row[4] for row in candidates)):
                raise ValueError(f'1994 {normalized_county} {item["town"]} original returns do not reconcile')
            profiles[normalized_county, norm(item['town'])] = {
                'registered_voters': registered, 'ballots_cast': cast, 'invalid_votes': invalid,
                'source_url': results_url,
                'profile_source': item.get('profile_url', county['profile_url']),
            }
            roster = [
                {'number': str(number) if number is not None else '', 'name': name,
                 'party': party if party is not None else '政黨資料缺失', 'gender': gender,
                 'votes': votes, 'mark': '*' if elected else '', 'incumbent': None,
                 'candidate_mark': '*' if elected else '', 'winner_source': results_url}
                for number, name, party, gender, votes, elected in candidates
            ]
            contests.append({
                'year': 1994, 'office': 'township', 'electorate': 'regional',
                'county': county['county'], 'district': item['town'], 'region': 0,
                'date': archive['date'], 'local': results_url, 'roster': roster,
                'profile': [''] * 6 + list(map(str, [valid, invalid, cast, registered])),
                'scope': [], 'detail': {}, 'town_labels': {}, 'town_profiles': {},
            })
    supplement = build(contests, {}, {})[0][1994]
    supplement['elections'][0].update(
        source_name='地方选举委员会原始清册、地方志、统计年报及同期报纸',
        source_url=evidence['台北县']['results_url'],
        coverage='partial',
        counties=list(evidence),
    )
    for contest in supplement['contests']:
        contest.update(profiles[contest['county_name'], contest['district_name']])
    for candidate in supplement['candidacies']:
        if candidate['party_name_official'] == '政黨資料缺失':
            candidate['party_name_official'] = None
    for key in ('elections', 'contests', 'candidacies', 'rows'):
        snapshot[key].extend(supplement[key])
    partial = archive.get('partial_counties', [])
    profile_columns = ('registered_voters', 'ballots_cast', 'valid_votes', 'invalid_votes')
    for county in partial:
        if rows := county.get('profiles'):
            if (any(not r['registered_voters'] >= r['ballots_cast'] == r['valid_votes'] + r['invalid_votes'] for r in rows)
                    or [sum(r[key] for r in rows) for key in profile_columns] != county['profile_totals']):
                raise ValueError(f'1994 {county["county"]} partial turnout does not reconcile')
        if shares := county.get('county_party_shares'):
            if (any(not 0 <= share <= 100 for _, share in shares)
                    or round(sum(share for _, share in shares), 2) != 100):
                raise ValueError(f'1994 {county["county"]} party shares do not reconcile')
        if summary := county.get('county_summary'):
            if (not summary['candidate_count'] >= summary['elected_count'] == len(county['winners'])
                    or not summary['registered_voters'] >= summary['ballots_cast'] > 0
                    or round(100 * summary['ballots_cast'] / summary['registered_voters'], 2) != summary['turnout_pct']):
                raise ValueError(f'1994 {county["county"]} candidacy or turnout summary does not reconcile')
    snapshot['partialTownshipReturns'] = partial
    audit['townshipArchives'] = {
        name: {key: source[key] for key in ('contest_count', 'candidate_count', 'profile_totals', 'results_url',
                                           'profile_url', 'profile_discrepancy') if key in source}
        for name, source in evidence.items()
    }
    for name, source in evidence.items():
        district_sources = {item['town']: item['results_url'] for item in source['districts'] if 'results_url' in item}
        if district_sources:
            audit['townshipArchives'][name]['district_results_urls'] = district_sources


def reconcile_2002_taipei_plains(snapshot):
    proof = json.loads((ROOT / 'sources/history-2002-taipei-council-11.json').read_text(encoding='utf-8'))
    contest = next(c for c in snapshot['contests'] if c['contest_id'] == proof['contestId'])
    candidates = sorted((c for c in snapshot['candidacies'] if c['contest_id'] == proof['contestId']),
                        key=lambda c: int(c['ballot_number']))
    rows = proof['rows']
    if ({norm(town) for town, _, _ in rows} != set(contest['scope_names']) or len(rows) != 29 or
            any(not p[0] >= p[1] == p[2] + p[3] or p[2] != sum(votes) for _, p, votes in rows) or
            [sum(row[2][i] for row in rows) for i in range(6)] != proof['nccuDistrictCandidateVotes'] or
            [candidate['votes'] for candidate in candidates] != proof['nccuDistrictCandidateVotes']):
        raise ValueError('2002 Taipei district 11 NCCU township and district returns do not reconcile')
    totals = [sum(row[1][i] for row in rows) for i in range(4)]
    if totals[2] != contest['valid_votes'] or [a - b for a, b in zip(totals, proof['nccuDistrictProfile'])] != [0, 1, 1, 0]:
        raise ValueError('2002 Taipei district 11 turnout differs from the verified source comparison')
    contest.update(dict(zip(proof['profileColumns'], totals)),
                   source_url=proof['sources']['nccuCandidateTowns'],
                   profile_source=proof['sources']['nccuTownProfiles'],
                   profile_method='29_township_returns_nccu')
    return {'contest_id': proof['contestId'], 'townships': len(rows), 'totals': totals, 'sources': proof['sources']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cec_zip', type=Path)
    parser.add_argument('taiwan_votes_csv', type=Path)
    parser.add_argument('nccu_pages', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'assets')
    parser.add_argument('--audit', type=Path, default=ROOT / 'sources/history-local-audit.json')
    args = parser.parse_args()
    contests = []
    with zipfile.ZipFile(args.cec_zip) as archive:
        for filename in archive.namelist():
            if '/voteData/' not in filename or not filename.endswith('/elcand.csv'):
                continue
            path = filename.removesuffix('/elcand.csv')
            local = path.split('/voteData/')[1]
            if not local.startswith(('1994直轄', '1997縣', '1998', '2001縣', '2002直轄', '2002縣',
                                     '2002鄉', '2005縣', '2005鄉', '2006直轄', '20091205', '20101127',
                                     '2014-103', '2018-107', '2022-111')):
                continue
            if info := classify(local):
                contests.extend(source_contests(archive, path, *info))
    add_chiayi_rerun(contests)
    nccu = nccu_index(args.nccu_pages)
    contests.extend(nccu_1993_contests(nccu, args.nccu_pages / 'island-nccu-1993-profile.html'))
    snapshots, audit = build(contests, tv_index(args.taiwan_votes_csv), nccu)
    if 1994 in snapshots:
        add_1994_township(snapshots[1994], audit[1994])
    if 2018 in snapshots:
        add_taipei_mayor_tallies(snapshots[2018], audit[2018])
    if 2002 in snapshots:
        proof = json.loads((ROOT / 'sources/history-2002-taichung-council-profiles.json').read_text(encoding='utf-8'))
        snapshot = snapshots[2002]
        contests_by_id = {contest['contest_id']: contest for contest in snapshot['contests']}
        for contest_id, values in proof['rows'].items():
            contest = contests_by_id[contest_id]
            registered = values['registered_voters']
            cast = values['ballots_cast']
            valid = values['valid_votes']
            invalid = values['invalid_votes']
            if not (registered >= cast == valid + invalid and contest['valid_votes'] == valid):
                raise ValueError(f'2002 {contest_id} yearbook turnout does not reconcile')
            if any(contest.get(field) not in (None, value) for field, value in values.items()):
                raise ValueError(f'2002 {contest_id} existing turnout conflicts with yearbook')
            contest.update(values, profile_source=proof['source'])
        audit[2002]['taichungCouncilYearbookProfiles'] = {'source': proof['source'], 'count': len(proof['rows'])}
        audit[2002]['taipeiDistrict11Reconciliation'] = reconcile_2002_taipei_plains(snapshot)
    # Source-backed precinct supplements; never replace conflicting votes.
    for district, slug, expected in [('盐埕区', 'yancheng', 23), ('鼓山区', 'gushan', 63), ('旗津区', 'qijin', 18), ('新兴区', 'xinxing', 42), ('前金区', 'qianjin', 22), ('苓雅区', 'lingya', 116), ('前镇区', 'qianzhen', 113), ('左营区', 'zuoying', 94), ('楠梓区', 'nanzi', 82), ('三民区', 'sanmin', 188)]:
        proof_path = ROOT / f'sources/history-2006-kaohsiung-{slug}-profile.json'
        if 2006 not in snapshots or not proof_path.is_file():
            continue
        proof = json.loads(proof_path.read_text(encoding='utf-8'))
        snapshot = snapshots[2006]
        rows = proof['rows']
        sums = [sum(row[i] for row in rows) for i in range(9)]
        targets = [p for p in snapshot['townProfiles'] if p['office'] == 'mayor' and p['county'] == '高雄市' and p['town'] == district]
        candidate_rows = [r for r in snapshot['rows'] if r['type'] == 'mayor' and r['county'] == '高雄市' and r['town'] == district and r['level'] == 'town']
        if (len(rows) != expected or any(len(row) != 9 or not all(isinstance(n, int) and n >= 0 for n in row) or sum(row[:5]) != row[5] or row[5]+row[6] != row[7] or row[7] > row[8] for row in rows)
                or sums != proof['totals'] or len(targets) != 1 or targets[0]['valid_votes'] != sums[5]
                or len(candidate_rows) != 5 or any(sum(r['votes'] for r in candidate_rows if r['name'] == name) != sums[i] for i,name in enumerate(proof['columns'][:5]))):
            raise ValueError(f'2006 {district} official precinct supplement does not reconcile')
        values = dict(registered_voters=sums[8], ballots_cast=sums[7], invalid_votes=sums[6])
        if any(targets[0].get(k) is not None and targets[0][k] != v for k,v in values.items()):
            raise ValueError(f'2006 {district} conflicting existing turnout')
        targets[0].update(values, profile_source=proof['source'], profile_method=f'sum_{expected}_official_precinct_returns')
        audit[2006].setdefault('precinctProfileSupplements', []).append({'county': '高雄市', 'town': district, 'source': proof['source'], 'precincts': expected, 'valid_votes': sums[5], **values})
    if 2006 in snapshots:
        snapshot = snapshots[2006]
        towns = [p for p in snapshot['townProfiles'] if p['county'] == '高雄市' and p['office'] == 'mayor']
        if len(towns) == 11 and all(p.get(k) is not None for p in towns for k in ('registered_voters', 'ballots_cast', 'valid_votes', 'invalid_votes')):
            city = next(c for c in snapshot['contests'] if c['county_name'] == '高雄市' and c['election_id'] == '2006-mayor')
            fields = ('registered_voters', 'ballots_cast', 'valid_votes', 'invalid_votes')
            totals = {k: sum(p[k] for p in towns) for k in fields}
            if any(totals[k] != city[k] for k in fields):
                raise ValueError('2006 Kaohsiung 11-district official turnout totals do not reconcile')
            audit[2006]['kaohsiungDistrictProfileReconciliation'] = {'complete_districts': 11, 'totals': totals, 'difference': {k: 0 for k in fields}}
    with args.cec_zip.open('rb') as source:
        source_hash = hashlib.file_digest(source, 'sha256').hexdigest()
    for year, snapshot in sorted(snapshots.items()):
        ids = [c['contest_id'] for c in snapshot['contests']]
        candidate_ids = [c['candidacy_id'] for c in snapshot['candidacies']]
        if len(ids) != len(set(ids)) or len(candidate_ids) != len(set(candidate_ids)):
            raise ValueError(f'{year}: duplicate contests or candidates')
        audit[year]['sourceFolders'] = sorted(audit[year]['sourceFolders'])
        audit[year]['counts'] = dict(audit[year]['counts'])
        if year == 1993:
            audit[year]['nccuTownProfiles'] = {
                'verifiedTownVoteRows': len(snapshot['rows']) - len(snapshot['candidacies']),
                'verifiedTownsWithTurnout': sum(p['registered_voters'] is not None for p in snapshot['townProfiles']),
                'residualProfiles': [{**{k: p[k] for k in ('county', 'town', 'registered_voters', 'ballots_cast', 'valid_votes', 'invalid_votes')},
                                      'method': 'county total minus all other five town profiles; valid votes independently matched to candidate returns',
                                      'source': NCCU_1993} for p in snapshot['townProfiles'] if p.get('profile_method') == 'county_total_minus_all_other_towns'],
            }
            audit[year]['countiesWithoutReconciledTownVotes'] = sorted(
                {c['county_name'] for c in snapshot['contests']} - {p['county'] for p in snapshot['townProfiles']})
        for contest in snapshot['contests']:
            if contest['valid_votes'] <= 0:
                raise ValueError(f'Empty official contest {contest["contest_id"]}')
        if year != 2022:
            atomic_json(snapshot, args.output / f'history-local-{year}.json')
        print(year, len(ids), len(candidate_ids), dict(audit[year]['counts']))
    atomic_json({'cec': CEC, 'cecArchiveSha256': source_hash, 'nccu': NCCU, 'nccu1993Summary': NCCU_1993,
                 'taiwanVotes': TV, 'years': audit}, args.audit, pretty=True)


if __name__ == '__main__':
    main()
