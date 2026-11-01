"""Build the static 2026 directory from audited registration and public updates.

No votes or predictions are synthesized. Unknown ballot numbers remain 待补.
"""
from pathlib import Path
import json,re
from collections import Counter
ROOT=Path(__file__).parent
S=ROOT/'sources'/'election-2026'
def read(name):return json.loads((S/name).read_text())
def build():
 data=read('candidates-base.json');numbers=read('number-overrides.json');review=read('eligibility-review.json')
 byid={c['id']:c for c in data['candidates']}
 for item in numbers['matchedCandidates']:
  c=byid[item['candidateId']]
  assert item['year']==2026 and c['districtId']==item['districtId']
  if item['number'] is not None:
   assert isinstance(item['number'],int) and item['number']>0
   c.update(number=item['number'],numberSource=item['sourceUrl'],numberVerification=item['verification'],numberCheckedAt=item['checkedAt'])
 excluded=[];excluded_ids=set()
 for e in review['exclusions']:
  matched=[c for c in data['candidates'] if c['type']==e['type'] and c['county']==e['county'] and (c['nameOriginal']==e['name'] or c['name']==e['name'] or c.get('nameSimplified')==e['name']) and (not e.get('districtId') or c['districtId']==e['districtId'])]
  assert len(matched)==1,('ambiguous exclusion',e,matched)
  c=matched[0];assert c['id'] not in excluded_ids;excluded_ids.add(c['id'])
  excluded.append(dict(candidateId=c['id'],districtId=c['districtId'],name=c.get('nameSimplified',c['name']),county=c['county'],type=c['type'],reason=e['reason'],status=e.get('status','不符合资格'),url=e['url'],checkedAt=review['checkedAt']))
 data['candidates']=[c for c in data['candidates'] if c['id'] not in excluded_ids]
 for c in data['candidates']:
  if c['type'] in ['mayor','council']:c['eligibility']='已核对中选会2026-10-16审定'
  else:c['eligibility']='登记资料；地方核查进度见县市说明'
 for d in data['districts']:
  d['candidateIds']=[i for i in d['candidateIds'] if i not in excluded_ids]
  d['candidateCount']=len(d['candidateIds']);d['includedCount']=d['candidateCount'];d['excludedCount']=d['registeredCount']-d['includedCount']
  if d['type']=='council':
   parts=d['id'].split(':');d['mapRegionId']=parts[1]+'-'+parts[2];d['mapLayer']='council'
  assert d['excludedCount']==sum(e['districtId']==d['id'] for e in excluded)
 data['excluded']=excluded;data['asOf']=review['checkedAt'];data['status']='registrationWithPublicEligibilityAndBallotUpdates'
 data['qualificationCoverage']=review.get('countyCoverage',[])
 data['reviewNote']=review.get('reviewNote','资格剔除依据公开审定与合格候选人抽签公告。号次采自 Taiwan Votes 的 2026 年页面，逐人对应选区；未公开或不能确定者标为“待补”。')
 data['publicSources']=[{'title':'2026 县市长选举 · 县市排列参考','url':'https://zh.wikipedia.org/wiki/2026年中華民國直轄市長及縣市長選舉'}, {'title':'中选会 2026 县市长与议员候选人资格审定','url':'https://web.cec.gov.tw/central/article/65212'}, {'title':'中选会 2026 议员选区划分公告','url':'https://www.cec.gov.tw/central/article/63625'}, {'title':'Taiwan Votes · 2026 候选人号次参考','url':'https://www.taiwanvotes.tw/'}]
 if numbers.get('officialNumberAudit'):data['publicSources'].append({'title':'台北市选委会 2026 候选人号次册（103条另行核对）','url':numbers['officialNumberAudit']['articleUrl']})
 for e in excluded:
  if e['url'] not in {s['url'] for s in data['publicSources']}:data['publicSources'].append({'title':e['county']+'候选人资格或抽签资料', 'url':e['url']})
 data['summary']={t:{'districts':sum(d['type']==t for d in data['districts']),'registered':sum(d['registeredCount'] for d in data['districts'] if d['type']==t),'included':sum(c['type']==t for c in data['candidates']),'numbered':sum(c['type']==t and isinstance(c['number'],int) for c in data['candidates'])} for t in ['mayor','council','township']}
 # Every original record is either included or explicitly excluded, exactly once.
 assert len(byid)==len(data['candidates'])+len(excluded)==2064
 assert sum(len(d['candidateIds']) for d in data['districts'])==len(data['candidates'])
 for d in data['districts']:
  ns=[byid[i]['number'] for i in d['candidateIds'] if isinstance(byid[i]['number'],int)]
  assert len(ns)==len(set(ns)),('duplicate ballot number',d['id'],ns)
 (ROOT/'assets/election-2026.js').write_text('window.ELECTION_2026_DATA='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';')
 (S/'directory-build-summary.json').write_text(json.dumps({'asOf':data['asOf'],'summary':data['summary'],'excluded':excluded},ensure_ascii=False,indent=2))
 print(json.dumps(data['summary'],ensure_ascii=False));print('Excluded:',len(excluded),'Included:',len(data['candidates']))
if __name__=='__main__':build()
