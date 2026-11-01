import json, math, urllib.request
from pathlib import Path
from opencc import OpenCC
cc=OpenCC('t2s')
base=Path(__file__).parent/'assets'

if not (base/'projected.json').exists():
 (base/'projected.json').write_bytes(urllib.request.urlopen('https://cdn.jsdelivr.net/npm/taiwan-atlas/towns-mercator-10t.json',timeout=30).read())
t=json.loads((base/'projected.json').read_text()); trans=t['transform']; arcs=[]
for arc in t['arcs']:
 x=y=0; out=[]
 for dx,dy in arc:
  x+=dx;y+=dy;out.append([x*trans['scale'][0]+trans['translate'][0],y*trans['scale'][1]+trans['translate'][1]])
 arcs.append(out)
def ring(ids):
 out=[]
 for i in ids:
  a=arcs[i] if i>=0 else list(reversed(arcs[~i]));out.extend(a if not out else a[1:])
 return out
def feature(g,kind):
 polygons=[g['arcs']] if g['type']=='Polygon' else g['arcs']; polys=[[ring(r) for r in p] for p in polygons]; pts=[xy for p in polys for r in p for xy in r]
 box=[min(x[0] for x in pts),min(x[1] for x in pts),max(x[0] for x in pts),max(x[1] for x in pts)]
 p=g['properties']; paths=['M'+'L'.join(f'{x:.2f},{y:.2f}' for x,y in r)+'Z' for pol in polys for r in pol]
 outer=max((pol[0] for pol in polys),key=lambda r:abs(sum(r[i][0]*r[(i+1)%len(r)][1]-r[(i+1)%len(r)][0]*r[i][1] for i in range(len(r)))))
 area=sum(outer[i][0]*outer[(i+1)%len(outer)][1]-outer[(i+1)%len(outer)][0]*outer[i][1] for i in range(len(outer)))
 if abs(area)>1e-9:
  cx=sum((outer[i][0]+outer[(i+1)%len(outer)][0])*(outer[i][0]*outer[(i+1)%len(outer)][1]-outer[(i+1)%len(outer)][0]*outer[i][1]) for i in range(len(outer)))/(3*area)
  cy=sum((outer[i][1]+outer[(i+1)%len(outer)][1])*(outer[i][0]*outer[(i+1)%len(outer)][1]-outer[(i+1)%len(outer)][0]*outer[i][1]) for i in range(len(outer)))/(3*area)
 else:cx=(box[0]+box[2])/2;cy=(box[1]+box[3])/2
 return dict(id=p['TOWNCODE'] if kind=='towns' else p['COUNTYCODE'],county=cc.convert(p['COUNTYNAME']),name=cc.convert(p['TOWNNAME'] if kind=='towns' else p['COUNTYNAME']),d=''.join(paths),box=box,center=[cx,cy])
data={k:[feature(g,k) for g in t['objects'][k]['geometries']] for k in ['towns','counties']}
(base/'map.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
for n in ['projected.json','taiwan-raw.json']:(base/n).unlink(missing_ok=True)
print({k:len(v) for k,v in data.items()},'bytes', (base/'map.json').stat().st_size)
