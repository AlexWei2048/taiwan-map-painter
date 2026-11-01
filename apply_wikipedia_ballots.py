"""Apply this reviewed Wikipedia supplement after the October29 official audit."""
from pathlib import Path
import json,collections
root=Path(__file__).parent
review=json.loads((root/'sources/election-2026/wikipedia-20261030/comparison.json').read_text())
p=root/'assets/election-2026.js';db=json.loads(p.read_text().split('=',1)[1].rstrip(';\n'));by={c['id']:c for c in db['candidates']};previous=db['ballotNumberAudit'];before=sum(c['number']=='待补' for c in by.values());updates=[]
urls={'council':'https://zh.wikipedia.org/wiki/2026年中華民國直轄市議員及縣市議員選舉選舉區投票結果列表','township':'https://zh.wikipedia.org/wiki/2026年中華民國鄉鎮市區長選舉選舉區投票結果列表'}
for u in review['updates']:
 c=by[u['candidateId']];assert c['number']=='待补' and isinstance(u['number'],int) and u['number']>0
 evidence='用户指定2026年维基页面；'+u['area']+'；姓名：'+u['wikiName']+'；号次：'+str(u['number'])+'。'
 c.update(number=u['number'],numberSource=urls[c['type']],numberVerification='user-specified-wikipedia',numberCheckedAt='2026-10-30',numberEvidence=evidence)
 updates.append({**u,'sourceUrl':urls[c['type']],'sourceTitle':'2026年选举选举区投票结果列表（用户指定参考）','evidence':evidence,'year':2026})
for d in db['districts']:
 nums=[c['number'] for c in by.values() if c['districtId']==d['id'] and c['number']!='待补'];assert len(nums)==len(set(nums)),d['id']
pending=[]
for row in review['pending']:
 c=by[row['id']];assert c['number']=='待补';reason=row['reason']
 if c['id']=='township:10004:10004120:002':reason+='；登记姓名楊士龍，官方抽签表为楊仕龍（2号），缺少姓名更正证明'
 pending.append({'candidateId':c['id'],'type':c['type'],'county':c['county'],'district':c['district'],'name':c['nameOriginal'],'reason':reason})
assert len(pending)==sum(c['number']=='待补' for c in by.values())
for typ,summary in db['summary'].items():summary['numbered']=sum(c['type']==typ and c['number']!='待补' for c in by.values())
groups=collections.Counter((c['type'],c['county']) for c in pending)
discrepancies=[{'candidateId':'council:10007:08:008','county':'彰化县','district':'第8选举区（二林镇、大城乡、芳苑乡、竹塘乡）','registrationName':'洪健興','drawName':'洪建興','drawNumber':9,'status':'按用户指定维基精确姓名洪健興补9号，保留官方抽签用字差异记录；未声称已取得官方更正','sourceUrl':'https://web.cec.gov.tw/api/file/3fa6c5bc-efb9-4f5b-aff5-a6da35f2d8f3.pdf','page':3},{'candidateId':'township:10004:10004120:002','county':'新竹县','district':'尖石乡','registrationName':'楊士龍','drawName':'楊仕龍','drawNumber':2,'status':'维基号次栏仍空白；官方抽签姓名用字不同，维持待核','sourceUrl':'https://web.cec.gov.tw/api/file/77b4cc63-fcb1-41e9-b0cd-da5493f1dd09.pdf','page':1}]
audit={'checkedAt':'2026-10-30','pendingBefore':before,'added':len(updates),'pendingAfter':len(pending),'cumulativeAdded':previous.get('cumulativeAdded',previous['added'])+len(updates),'previousRounds':previous.get('previousRounds',[])+[{'checkedAt':previous['checkedAt'],'added':previous['added'],'pendingAfter':previous['pendingAfter']}],'groups':[{'type':t,'county':c,'count':n} for (t,c),n in groups.items()],'updates':updates,'unresolved':pending,'nameDiscrepancies':discrepancies,'sourceConflicts':review['conflicts'],'notes':['本轮仅补充用户指定页面中有明确号次且选区、姓名唯一匹配的记录。空白不按名册位置推定。已有号码与维基不一致者另行核查，官方来源优先。']}
db['ballotNumberAudit']=audit
for typ,url in urls.items():
 if not any(x['url']==url for x in db['publicSources']):db['publicSources'].append({'title':'2026'+('议员' if typ=='council' else '乡镇市区长')+'号次参考（用户指定维基页面）','url':url})
for item in json.loads((root/'sources/election-2026/wikipedia-20261030/official-conflict-check.json').read_text())['records']:
 c=next(c for c in db['candidates'] if c['type']=='township' and c['nameOriginal']==item['candidateName']);assert c['number']==item['number'];c.update(numberSource=item['sourceUrl'],numberVerification='official',numberCheckedAt='2026-10-30',numberEvidence=item['evidence'])
 for x in audit['sourceConflicts']:
  if x['candidateId']==c['id']:x.update(resolution='已核实2026官方抽签表，保留原号次；维基列表与官方不一致',sourceUrl=item['sourceUrl'],officialNumber=item['number'],evidence=item['evidence'])
 if not any(s['url']==item['sourceUrl'] for s in db['publicSources']):db['publicSources'].append({'title':item['county']+'115年乡镇市长抽签结果（官方号次优先）','url':item['sourceUrl']})
for x in audit['sourceConflicts']:
 if x['county']=='彰化县':x.update(resolution='已核实2026官方抽签表，保留原号次；维基列表与官方不一致',sourceUrl=by[x['candidateId']]['numberSource'],officialNumber=x['current'],evidence=by[x['candidateId']]['numberEvidence'])
db['asOf']='2026-10-30';p.write_text('window.ELECTION_2026_DATA='+json.dumps(db,ensure_ascii=False,separators=(',',':'))+';\n')
(root/'sources/election-2026/ballot-number-audit-20261030.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2));print('Added',len(updates),'pending',len(pending),'all council numbered',db['summary']['council']['numbered'])
