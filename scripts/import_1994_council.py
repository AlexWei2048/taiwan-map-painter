#!/usr/bin/env python3
"""Extract the January 1994 county council returns from an archived HTML transcription.

Pass the saved source HTML and any JSON corrections transcribed from official
scans. The output includes only districts whose candidate votes reconcile with
the published valid-ballot total and whose marked winners reconcile with seats.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re

from lxml import html

SOURCE = 'https://zh.wikipedia.org/w/index.php?title=1994年中華民國縣市議員選舉選舉區投票結果列表&oldid=95693813'
TAIPEI = 'https://web.cec.gov.tw/tpcec/article/list/1271'
DIGITS = {c:i for i,c in enumerate('零一二三四五六七八九')}
TAIPEI_NAMES = {'樹林市':'樹林鎮','蘆洲市':'蘆洲鄉','汐止市':'汐止鎮'}


def number(value):
    if value.isdecimal():
        return int(value)
    if '十' in value:
        left, right = value.split('十')
        return (DIGITS[left] if left else 1) * 10 + DIGITS.get(right, 0)
    return DIGITS[value]


def extract_num(pattern, text):
    match = re.search(pattern, text)
    return int(match[1].replace(',', '')) if match else None


def text(node):
    return re.sub(r'\s+', ' ', node.text_content()).strip()


def extract(path, overrides):
    raw = path.read_bytes()
    tree = html.fromstring(raw)
    districts, excluded = [], {}
    for table in tree.xpath('//table[contains(@class,"wikitable")]'):
        trs = table.xpath('./tbody/tr|./tr')
        if not trs or not any('當選標記' in text(th) for th in trs[0].xpath('./th')):
            continue
        heading = table.xpath('preceding::h4[1]')
        if not heading:
            continue
        heading = text(heading[0])
        match = re.fullmatch(r'(.+?[縣市])第([一二三四五六七八九十\d]+)選舉區(?:[（(](.*)[）)])?', heading)
        if not match:
            excluded[heading] = 'unrecognized district heading'
            continue
        county, ordinal, scope = match.groups()
        district = number(ordinal)
        key = f'{county}:{district}'
        items = table.getprevious()
        stats = text(items) if items is not None and items.tag == 'ul' else ''
        seats = extract_num(r'應選出名額[：:]\s*(\d+)', stats)
        women = extract_num(r'婦女保障名額[：:]\s*(\d+)', stats)
        # The pre-1999 county-council quota had no reserved seat for 1-4 seats.
        # A missing quota label on these archived returns means zero, not unknown.
        if women is None and seats is not None and 1 <= seats <= 4:
            women = 0
        registered = extract_num(r'選舉人數[：:]\s*([\d,]+)', stats)
        cast = extract_num(r'投票數(?:[（(]投票率[）)])?[：:]\s*([\d,]+)', stats)
        valid = extract_num(r'(?<!無)有效票(?:[（(]比率[）)])?[：:]\s*([\d,]+)', stats)
        invalid = extract_num(r'無效票(?:[（(]比率[）)])?[：:]\s*([\d,]+)', stats)
        candidates = []
        for tr in trs[1:]:
            cells = tr.xpath('./td')
            if len(cells) < 7:
                continue
            ballot,name,gender,party,votes,_,mark = map(text,cells[:7])
            if not name or not ballot.isdecimal() or not votes.replace(',','').isdecimal():
                continue
            elected = bool(cells[6].xpath('.//img[contains(@src,"Elected_candidate_symbol")]')) or mark in ('當選','✓','*','＊')
            if party.startswith('未經政黨推薦'):
                party = '無黨籍'
            candidates.append([int(ballot),name,int(votes.replace(',','')),party,gender,elected])
        correction = overrides.get(key,{})
        if isinstance(correction,list):
            correction = {'candidates':correction}
        candidates = correction.get('candidates',candidates)
        female = correction.get('female_ballot_numbers')
        for row in candidates:
            if female is not None:
                row[4] = '女' if row[0] in female else '男'
            by_ballot = correction.get('by_ballot',{}).get(str(row[0]),{})
            for field,value in by_ballot.items():
                row[{'name':1,'votes':2,'party':3,'gender':4,'elected':5}[field]]=value
        if seats is None or valid is None or not candidates:
            excluded[key] = 'incomplete return'
            continue
        numbers = {r[0] for r in candidates}
        votes = sum(r[2] for r in candidates)
        elected = sum(bool(r[5]) for r in candidates)
        if len(numbers) != len(candidates) or votes != valid or elected != seats:
            excluded[key] = f'ballots {votes}/{valid}, elected {elected}/{seats}'
            continue
        if cast is not None and (invalid is None or cast != valid+invalid or registered is not None and cast > registered):
            cast = invalid = None
        kind = 'plains' if re.search(r'平地(?:山胞|原住民)',scope or '') else 'mountain' if re.search(r'山地(?:山胞|原住民)',scope or '') else 'regional'
        # Map explicit town lists. Keep splits and identity-only scopes tabular.
        geographic_scope = re.sub(r'之(?:平地|山地)(?:山胞|原住民)$','',scope or '')
        scope_names = re.split('[、，及]',geographic_scope)
        if not scope_names or not all(re.fullmatch(r'[\u3400-\u9fff]{1,8}[市鄉鎮區]', item) and '之' not in item for item in scope_names):
            scope_names = []
        if county == '臺北縣' and kind == 'regional':
            scope = '、'.join(TAIPEI_NAMES.get(item,item) for item in scope_names) if scope_names else scope
        district_return = {
            'county':county,'number':district,'electorate':kind,'scope':scope or '',
            'scope_names':scope_names,'seats':seats,'reserved_seats':women,
            'registered_voters':registered,'ballots_cast':cast,'valid_votes':valid,'invalid_votes':invalid,
            'source_url':correction.get('source_url',TAIPEI if correction and county=='臺北縣' else SOURCE),
            'candidates':candidates,
        }
        if correction.get('gender_sources'):
            district_return['gender_sources'] = correction['gender_sources']
        districts.append(district_return)
    return {'version':1,'source_url':SOURCE,'source_sha256':hashlib.sha256(raw).hexdigest(),
            'official_overview':'https://web.cec.gov.tw/central/article/18789','expected_seats':884,
            'districts':districts,'excluded':excluded}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('html',type=Path)
    parser.add_argument('--corrections',type=Path)
    parser.add_argument('--partial-returns',type=Path,default=Path(__file__).resolve().parents[1]/'sources/history-1994-kinmen-partial.json')
    parser.add_argument('--incumbency-supplement',type=Path,default=Path(__file__).resolve().parents[1]/'assets/history-local-1994-council.json')
    parser.add_argument('--audit',action='store_true')
    args=parser.parse_args()
    data=extract(args.html,json.loads(args.corrections.read_text()) if args.corrections else {})
    if args.incumbency_supplement.is_file():
        previous=json.loads(args.incumbency_supplement.read_text(encoding='utf-8'))
        old={(d['county'],d['number'],d['electorate']):d for d in previous.get('districts',[])}
        for item in data['districts']:
            prior=old.get((item['county'],item['number'],item['electorate']),{})
            candidates={str(c[0]):c for c in item['candidates']}
            previous_candidates={str(c[0]):c for c in prior.get('candidates',[])}
            for ballot,source in prior.get('gender_sources',{}).items():
                if ballot not in candidates or candidates[ballot][:3]!=previous_candidates.get(ballot,[])[:3]:
                    raise ValueError(f'Gender identity changed: {item["county"]} {item["number"]} {ballot}')
                old_gender=previous_candidates[ballot][4]
                if candidates[ballot][4] and candidates[ballot][4]!=old_gender:
                    raise ValueError(f'Gender conflict: {item["county"]} {item["number"]} {ballot}')
                if old_gender in ('男','女'):
                    candidates[ballot][4]=old_gender
                    item.setdefault('gender_sources',{})[ballot]=source
            for ballot,source in prior.get('incumbent_sources',{}).items():
                if ballot not in candidates or candidates[ballot][:3]!=previous_candidates.get(ballot,[])[:3]:
                    raise ValueError(f'Incumbency identity changed: {item["county"]} {item["number"]} {ballot}')
                item.setdefault('incumbent_sources',{})[ballot]=source
        if previous.get('incumbency_roster_audit'):
            expected=sum(len(d.get('incumbent_sources',{})) for d in previous['districts'])
            actual=sum(len(d.get('incumbent_sources',{})) for d in data['districts'])
            if actual!=expected:
                raise ValueError(f'Incumbency supplement incomplete: {actual}/{expected}')
            data['incumbency_roster_audit']=previous['incumbency_roster_audit']
    if args.audit:
        counts=Counter()
        for item in data['districts']:
            counts[item['county']]+=item['seats']
        print(json.dumps({'counties':counts,'seats':sum(counts.values()),'districts':len(data['districts']),
                          'excluded':data['excluded']},ensure_ascii=False,indent=2))
    else:
        districts = data.pop('districts')
        if args.partial_returns.is_file():
            data['partial_returns'] = [json.loads(args.partial_returns.read_text(encoding='utf-8'))]
        encode = lambda value: json.dumps(value,ensure_ascii=False,separators=(',',':'))
        print(encode(data)[:-1] + ',\n"districts":[\n' + ',\n'.join(map(encode,districts)) + '\n]}')
