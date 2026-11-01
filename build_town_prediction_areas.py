from pathlib import Path
import json,csv,re
from collections import defaultdict
from shapely.geometry import Polygon
from shapely import make_valid,union_all,set_precision
from opencc import OpenCC
root=Path(__file__).parent; data=json.loads((root/'assets/map.json').read_text()); raw=(root/'assets/election-2026.js').read_text(); db=json.loads(raw[raw.index('=')+1:].rstrip(';\n')); cc=OpenCC('t2s')
simple=lambda s:cc.convert(s).replace('臺','台').replace('巿','市')
def polygons(g):
 if g.geom_type=='Polygon':return [g]
 return [p for part in getattr(g,'geoms',[]) for p in polygons(part)]
def geometry(f):
 g=Polygon()
 for ring in re.findall(r'M([^MZ]+)Z',f['d']):
  points=[tuple(map(float,p.split(','))) for p in ring.split('L')]
  if len(points)>=3:g=g.symmetric_difference(make_valid(Polygon(points)))
 return set_precision(union_all(polygons(g)),.000001)
towns={f['id']:f for f in data['towns']};townNames={(f['county'],f['name']):f for f in data['towns']};geo={i:geometry(f) for i,f in towns.items()}
regional=defaultdict(list)
for r in csv.DictReader((root/'sources/council-zones.csv').open()):
 for town in r['areas'].split('/'):
  regional[r['code']].append(townNames[(simple(r['city']),simple(town))]['id'])
membership=defaultdict(list)
for districtId,townIds in regional.items():
 for townId in townIds:membership[townId].append(districtId)
mapRows={f['id']:f for f in data['council']+data['councilIndigenous']};result={};audit=[]
for d in [d for d in db['districts'] if d['type']=='council']:
 f=mapRows[d['mapRegionId']]; ids=f.get('townIds') or regional[f['id']];parts=[];dg=geometry(f)
 for townId in ids:
  t=towns[townId]; split=f.get('electorate','regional')=='regional' and len(membership[townId])>1
  clipped=make_valid(dg.intersection(geo[townId])) if split else geo[townId];ps=[p for p in polygons(clipped) if p.area>1e-7]
  assert ps,(d['id'],townId,'empty official member');g=union_all(ps);anchor=max(ps,key=lambda x:x.area).representative_point();fmt=lambda n:f'{n:.6f}'.rstrip('0').rstrip('.') or '0'
  path=''.join('M'+'L'.join(f'{fmt(x)},{fmt(y)}' for x,y in ring.coords)+'Z' for p in ps for ring in [p.exterior,*p.interiors]) if split else t['d']
  partial=split
  if split:assert g.difference(dg).area<1e-6,(d['id'],townId,'split leaks')
  parts.append(dict(id=townId+'-'+str(d['number']).zfill(2),townId=townId,county=t['county'],name=t['name'],parentDistrictId=d['id'],number=d['number'],electorate=f.get('electorate','regional'),scope=t['name']+('（本选区部分）' if partial else ''),partial=partial,d=path,box=list(g.bounds),center=[anchor.x,anchor.y],labelAnchor=[anchor.x,anchor.y]))
  audit.append(dict(districtId=d['id'],townId=townId,partial=partial,area=g.area))
 coverage=union_all([geometry(x) for x in parts]);delta=coverage.symmetric_difference(dg).area
 # Whole towns retain the original administrative coastline, which was simplified independently from the pre-existing district outline.
 assert len(parts)==len(set(ids)),(d['id'],'duplicate township')
 result[d['id']]=parts
(root/'town-areas.js').write_text('window.TOWN_PREDICTION_AREAS='+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n')
(root/'sources/town-prediction-area-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
print('Town prediction areas:',len(result),'districts;',len(audit),'parts;',sum(x['partial'] for x in audit),'partial township parts')
