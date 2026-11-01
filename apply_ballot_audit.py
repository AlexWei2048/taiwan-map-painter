"""Apply reviewed 2026 ballot patches, never infer numbers from missing slots."""
from pathlib import Path
import json,sys,collections
root=Path(__file__).parent
p=root/'assets/election-2026.js';raw=p.read_text();db=json.loads(raw[raw.index('{'):].rstrip(';\n'));by={c['id']:c for c in db['candidates']};before=sum(c['number']=='待补' for c in by.values())
reviews=[json.loads(Path(n).read_text()) for n in sys.argv[1:]];updates=[u for r in reviews for u in r['updates']];assert len({u['candidateId'] for u in updates})==len(updates)
for u in updates:
 c=by[u['candidateId']];assert c['number']=='待补' and u['year']==2026 and isinstance(u['number'],int) and u['number']>0 and u['sourceUrl'].startswith('https://') and u['evidence']
 c.update(number=u['number'],numberSource=u['sourceUrl'],numberVerification='official' if any(s in u['sourceUrl'] for s in ['cec.gov.tw','gov.tw']) else 'dated-news',numberCheckedAt='2026-10-29',numberEvidence=u['evidence'])
for d in db['districts']:
 nums=[c['number'] for c in by.values() if c['districtId']==d['id'] and c['number']!='待补'];assert len(nums)==len(set(nums)),d['id']
for typ,summary in db['summary'].items():summary['numbered']=sum(c['type']==typ and c['number']!='待补' for c in by.values())
reasons={u['candidateId'] if isinstance(u,dict) else u:u if isinstance(u,dict) else {} for r in reviews for u in r['unresolved']};reasons['council:10007:08:008']={'reason':'登记姓名洪健興，官方抽签表为洪建興（9号）；缺乏姓名更正证明，暂不赋号'};reasons['township:10004:10004120:002']={'reason':'登记姓名楊士龍，官方抽签表为楊仕龍（2号）；缺乏姓名更正证明，暂不赋号'};pending=[]
for c in by.values():
 if c['number']=='待补':pending.append({'candidateId':c['id'],'type':c['type'],'county':c['county'],'district':c['district'],'name':c['nameOriginal'],'reason':reasons.get(c['id'],{}).get('reason','尚未找到可逐人确认的2026年号次资料'),'details':reasons.get(c['id'],{})})
groups=collections.Counter((c['type'],c['county']) for c in pending)
audit={'checkedAt':'2026-10-29','pendingBefore':before,'added':len(updates),'pendingAfter':len(pending),'groups':[{'type':t,'county':c,'count':n} for (t,c),n in groups.items()],'updates':updates,'unresolved':pending,'notes':[n for r in reviews for n in r.get('notes',[])]}
db['ballotNumberAudit']=audit
for r in reviews:
 for source in r['sources']:
  if source['url'] not in {u['sourceUrl'] for u in updates}:continue
  if not any(x['url']==source['url'] for x in db['publicSources']):db['publicSources'].append({'title':source['title'],'url':source['url']})
p.write_text('window.ELECTION_2026_DATA='+json.dumps(db,ensure_ascii=False,separators=(',',':'))+';\n')
a=root/'sources/election-2026';a.mkdir(exist_ok=True);(a/'ballot-number-audit-20261029.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2));print(json.dumps({'added':len(updates),'pending':len(pending),'groups':audit['groups']},ensure_ascii=False))
