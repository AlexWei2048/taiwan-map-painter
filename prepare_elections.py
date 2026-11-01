"""Build geographic council (2026) and legislative (2024) districts.

Run with the build dependencies on PYTHONPATH. Source documents are downloaded
explicitly by the maintainer; the published application has no network map API.
"""
from pathlib import Path
from collections import defaultdict, Counter
import csv, json, re, sys
from shapely.geometry import Polygon, MultiPolygon, LineString, Point
from shapely.ops import unary_union, polygonize, nearest_points
from shapely import make_valid, set_precision, union_all, difference, intersection, line_merge, maximum_inscribed_circle
from opencc import OpenCC

ROOT = Path(__file__).parent
SOURCES = Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'sources'
cc = OpenCC('t2s')
simple = lambda s: cc.convert(s).replace('臺', '台').replace('巿', '市')
data = json.loads((ROOT/'assets/map.json').read_text())
topo = json.loads((SOURCES/'villages-projected.json').read_text())
arcs = []
for arc in topo['arcs']:
    x = y = 0; out = []
    for dx,dy in arc:
        x += dx; y += dy
        out.append((x*topo['transform']['scale'][0]+topo['transform']['translate'][0],
                    y*topo['transform']['scale'][1]+topo['transform']['translate'][1]))
    arcs.append(out)

def ring(ids):
    out=[]
    for i in ids:
        a=arcs[i] if i>=0 else arcs[~i][::-1]
        out.extend(a if not out else a[1:])
    return out

def only_polygons(g):
    if g.geom_type=='Polygon': return [g]
    return [p for sub in getattr(g,'geoms',[]) for p in only_polygons(sub)]

def snap(g):
    return set_precision(union_all(only_polygons(make_valid(g)),grid_size=.01),.01)

def geometry(g):
    ps=[g['arcs']] if g['type']=='Polygon' else g['arcs']
    return snap(unary_union([Polygon(ring(p[0]),[ring(r) for r in p[1:]]) for p in ps]))

def svg_geometry(f):
    result=Polygon()
    for r in re.findall(r'M([^MZ]+)Z',f['d']):
        points=[tuple(map(float,p.split(','))) for p in r.split('L')]
        if len(points)>=3:
            result=result.symmetric_difference(make_valid(Polygon(points)))
    # Coordinates retain their original .01 grid; raise only the precision
    # model so later unions do not re-snap high-resolution electoral cuts.
    return set_precision(snap(result),.000001)

towns={(f['county'],f['name']):(f,svg_geometry(f)) for f in data['towns']}
county_land={f['name']:svg_geometry(f) for f in data['counties']}
villages=[]
for g in topo['objects']['villages']['geometries']:
    p=g['properties']
    villages.append(dict(code=p['VILLCODE'],county=simple(p['COUNTYNAME']),
                         town=simple(p['TOWNNAME']),townId=p['TOWNCODE'],name=simple(p.get('VILLNAME','')),
                         geometry=geometry(g),arcIds={a if a>=0 else ~a for ps in ([g['arcs']] if g['type']=='Polygon' else g['arcs']) for r in ps for a in r}))

def polygons(g):
    if isinstance(g,Polygon): return [g]
    return [p for sub in getattr(g,'geoms',[]) for p in polygons(sub)]

def coord(v):return f'{v:.6f}'.rstrip('0').rstrip('.') or '0'

def feature(g,code,county,number,scope):
    ps=[p for p in polygons(g) if p.area>1e-7]
    assert ps,(code,'empty')
    g=union_all(ps,grid_size=.01); anchor=max(ps,key=lambda p:p.area).representative_point()
    chunks=[]
    for p in ps:
        for r in [p.exterior,*p.interiors]:
            chunks.append('M'+'L'.join(f'{coord(x)},{coord(y)}' for x,y in r.coords)+'Z')
    return dict(id=code,county=county,name=f'第{number}选区',number=number,
                scope=scope,d=''.join(chunks),box=list(g.bounds),center=[anchor.x,anchor.y])

# CEC's current geographic council groups. Validate the three split towns at
# village level, then retain whole township geometry for every unsplit town.
rows=list(csv.DictReader((SOURCES/'council-zones.csv').open()))
vrows=list(csv.DictReader((SOURCES/'council-cunli.csv').open()))
assignment={r['village_code']:r['zone'] for r in vrows}
council_meta={r['code']:r for r in rows}
council_towns=defaultdict(list)
for r in rows:
    for town in r['areas'].split('/'):
        council_towns[(simple(r['city']),simple(town))].append(r['code'])

# Compare the split-village grouping to the official 2026 notice, independently
# of the third-party 2022-to-2026 mapping. These names are in that notice.
official_split={
 ('新竹县','竹北市','10004-01'):'尚义 崇义 新港 大义 白地 大眉 麻园 溪州 新庄 联兴 泰和 新社 新国 竹义 新仑',
 ('新竹市','东区','10018-02'):'南门 关帝 南市 福德 振兴 新兴 竹莲 南大 寺前 下竹 顶竹 光镇 高峰 柴桥 新光 湖滨 明湖',
 ('新竹市','北区','10018-03'):'客雅 中雅 育英 曲溪 西雅 南势 大鹏 西门 仁德 潜园 中央 崇礼 石坊 兴南 台溪',
}
for (county,town,zone),names in official_split.items():
    actual={v['name'].removesuffix('里') for v in villages
            if (v['county'],v['town'])==(county,town) and assignment.get(v['code'])==zone}
    assert actual==set(names.split()),(zone,actual^set(names.split()))

partition_audit=[]

def partition(mapping, selector):
    groups=defaultdict(list)
    for key,(f,land) in towns.items():
        zones=mapping.get(key,[])
        if not zones: raise ValueError(f'Unassigned township {key}')
        if len(zones)==1: groups[zones[0]].append(land);continue
        pieces=defaultdict(list);users=defaultdict(set)
        for v in villages:
            if (v['county'],v['town'])==key:
                zone=selector(v)
                assert zone in zones,(key,v['name'],zone,zones)
                pieces[zone].append(v['geometry'])
                for arc in v['arcIds']:users[arc].add(zone)
        source={zone:unary_union(ps) for zone,ps in pieces.items()}
        # The village and township snapshots have differently simplified outer
        # edges. Intersecting each village union and giving ALL leftover strips
        # to the last zone creates long, thin false electoral enclaves along
        # the township edge. Instead, cut the township ONLY on original
        # topological arcs shared by villages assigned to different zones.
        cuts=line_merge(unary_union([LineString(arcs[a]) for a,owners in users.items() if len(owners)>1]))
        segments=[cuts] if cuts.geom_type=='LineString' else list(cuts.geoms)
        degree=Counter(p for line in segments for p in [line.coords[0],line.coords[-1]])
        extended=[];connections=[];joins=[]
        for line in segments:
            pts=list(line.coords)
            for index in [0,-1]:
                point=Point(pts[index])
                # Degree-one ends terminate at the old township perimeter.
                # Join them to the displayed perimeter; interior junctions
                # must remain untouched. This adjusts only the two snapshots'
                # coastline/perimeter mismatch, never the electoral cut.
                if degree[pts[index]]==1 and land.contains(point):
                    target=nearest_points(point,land.boundary)[1]
                    connections.append(point.distance(target))
                    joins.append([list(point.coords[0]),list(target.coords[0])])
                    if index==0:pts.insert(0,tuple(target.coords[0]))
                    else:pts.append(tuple(target.coords[0]))
            extended.append(LineString(pts))
        network=union_all([land.boundary,*extended],grid_size=.000001)
        owned=defaultdict(list)
        cells=[cell for cell in polygonize(network) if land.covers(cell.representative_point())]
        for cell in cells:
            owner=max(zones,key=lambda zone:cell.intersection(source[zone]).area)
            owned[owner].append(cell)
        assert all(owned[z] for z in zones),(key,'electoral cut failed to split township')
        split={z:unary_union(owned[z]) for z in zones}
        assert land.symmetric_difference(unary_union(list(split.values()))).area<1e-6,(key,'split coverage')
        for z,g in split.items():groups[z].append(g)
        partition_audit.append({'county':key[0],'town':key[1],'townId':f['id'],'layer':'council' if mapping is council_towns else 'legislative','zones':zones,'faces':len(cells),
                                'sourceCutArcIds':[a for a,owners in users.items() if len(owners)>1],'perimeterJoins':joins,
                                'sourceCutArcs':sum(len(owners)>1 for owners in users.values()),
                                'perimeterJoinMax':round(max(connections,default=0),6)})
    return {z:make_valid(unary_union(ps)) for z,ps in groups.items()}

def repair_partitions(geoms, zone_counties):
    # Node all district and county edges together once. Every face gets exactly
    # one owner, so quantization cannot leave narrow unassigned strips.
    repaired={}
    for county in sorted(set(zone_counties.values())):
        ids=[z for z in geoms if zone_counties[z]==county]
        land=county_land[county]
        edges=unary_union([land.boundary]+[geoms[z].boundary for z in ids])
        owned=defaultdict(list)
        for cell in polygonize(edges):
            point=cell.representative_point()
            if not land.covers(point):continue
            owners=[z for z in ids if geoms[z].covers(point)]
            owner=owners[0] if len(owners)==1 else (max(owners,key=lambda z:geoms[z].intersection(cell).area) if owners else min(ids,key=lambda z:geoms[z].distance(point)))
            owned[owner].append(cell)
        for z in ids:repaired[z]=make_valid(unary_union(owned[z]))
    return repaired

council_geoms=partition(council_towns,lambda v:assignment.get(v['code']))
council_geoms=repair_partitions(council_geoms,{z:simple(r['city']) for z,r in council_meta.items()})
data['council']=[feature(council_geoms[z],z,simple(r['city']),int(z[-2:]),simple(r['areas']))
                 for z,r in council_meta.items()]
assert len(data['council'])==161

# Legislative selection is parsed from CEC's official CSV, not an old district
# geometry file. In particular, Zhongli's Ziqiang village belongs to district 6.
official=list(csv.DictReader((SOURCES/'legislative-2024.csv').open(encoding='utf-8-sig')))
leg_towns=defaultdict(list);leg_villages={};leg_meta={}
county_codes={f['name']:f['id'] for f in data['counties']}
for row in official:
    title=re.sub(r'\s','',simple(row['选举区'] if '选举区' in row else row['選舉區']))
    scope=re.sub(r'\s','',simple(row.get('選舉區範圍',row.get('选举区范围',''))))
    county=next(c for c in county_codes if title.startswith(c))
    found=re.search(r'第(\d+)',title);number=int(found[1]) if found else 1
    code=county_codes[county]+'-'+str(number).zfill(2)
    leg_meta[code]=(county,number,scope)
    if scope==county:
        for key in towns:
            if key[0]==county:leg_towns[key].append(code)
    elif '－' in scope:
        before,after=scope.split('－');parts=before.split('、')
        for town in parts[:-1]:leg_towns[(county,town)].append(code)
        town=parts[-1];leg_towns[(county,town)].append(code)
        names=re.sub(r'等\d+里$','',after).split('、')
        for name in names:
            key=(county,town,name)
            assert key not in leg_villages,(key,'duplicate')
            leg_villages[key]=code
    else:
        for town in scope.split('、'):leg_towns[(county,town)].append(code)

leg_geoms=partition(leg_towns,lambda v:leg_villages.get((v['county'],v['town'],v['name'])))
leg_geoms=repair_partitions(leg_geoms,{z:m[0] for z,m in leg_meta.items()})
data['legislative']=[feature(leg_geoms[z],z,*m) for z,m in leg_meta.items()]
assert len(data['legislative'])==73
data['electionMetadata']={
 'council':{'year':2026,'count':161,'kind':'区域议员选区',
  'source':'https://www.cec.gov.tw/central/article/63625'},
 'legislative':{'year':2024,'count':73,'kind':'区域立委选区',
  'source':'https://data.gov.tw/dataset/170247'},
 'note':'原住民议员、原住民立委及不分区立委涉及重叠选民身份或政党名单，未混入区域选区图层。'
}

# Indigenous council constituencies select an electorate by identity, while
# their spatial scope is the named county or named whole townships. Keep these
# geometries separate from regional districts because those electorates overlap.
registration=json.loads((SOURCES/'election-2026/candidates-base.json').read_text())
indigenous_source=[]
indigenous_geoms={}
data['councilIndigenous']=[]
for meta in registration['districts']:
    if meta['type']!='council' or meta['electorate']=='regional':continue
    county=meta['county'];number=meta['number']
    code=county_codes[county]+'-'+str(number).zfill(2)
    electorate={'plainsIndigenous':'plains','mountainIndigenous':'mountain'}[meta['electorate']]
    # The suffix describes voter identity, rather than a different land area.
    prefix=re.sub(r'之(?:平地|山地)原住民$','',meta['scope'])
    if prefix==county:
        keys=[key for key in towns if key[0]==county]
    else:
        names=re.split('[、及]',prefix)
        keys=[(county,name) for name in names]
        assert names and len(set(names))==len(names),(meta['id'],'invalid township scope')
        assert all(key in towns for key in keys),(meta['id'],'unknown township',keys)
    land=unary_union([towns[key][1] for key in keys])
    f=feature(land,code,county,number,meta['scope'])
    f.update(electorate=electorate,sourceElectorate=meta['electorate'],directoryId=meta['id'],
             seats=meta['seats'],womenReserved=meta['womenReserved'],womenReservedLabel=meta['womenReservedLabel'],
             womenReservedNote=meta['womenReservedNote'],townIds=[towns[key][0]['id'] for key in keys])
    data['councilIndigenous'].append(f);indigenous_geoms[code]=land
    indigenous_source.append({key:f[key] for key in ['id','directoryId','county','number','electorate','scope','seats',
                                                   'womenReserved','womenReservedLabel','womenReservedNote','townIds']})
assert len(data['councilIndigenous'])==60
assert not ({f['id'] for f in data['council']} & {f['id'] for f in data['councilIndigenous']})
for f in data['council']+data['legislative']:f['electorate']='regional'

# Both indigenous legislative constituencies have the whole country as their
# spatial scope. County views are merely clipped views of the SAME constituency
# and must retain its one ID and one vote record (not 22 invented constituencies).
legislative_indigenous_source='https://law.cec.gov.tw/LawContent.aspx?id=GL000292'
national_land=unary_union(list(county_land.values()))
data['legislativeIndigenous']=[]
for number,electorate,title in [(1,'plains','平地原住民选区'),(2,'mountain','山地原住民选区')]:
    code='00000-'+str(number).zfill(2)
    scope='全国'+('平地' if electorate=='plains' else '山地')+'原住民'
    f=feature(national_land,code,'全国',number,scope)
    f.update(name=title,electorate=electorate,seats=3,statewide=True,womenReserved=0,
             womenReservedLabel='0',womenReservedNote='',source=legislative_indigenous_source)
    f['byCounty']={}
    for county,land in county_land.items():
        part=feature(land,code,county,number,scope)
        part.update(name=title,electorate=electorate,seats=3,statewide=True,nationalCounty='全国',
                    womenReserved=0,womenReservedLabel='0',womenReservedNote='',source=legislative_indigenous_source)
        f['byCounty'][county]=part
    data['legislativeIndigenous'].append(f)
data['electionMetadata']['councilIndigenous']={
    'year':2026,'count':60,'plains':sum(f['electorate']=='plains' for f in data['councilIndigenous']),
    'mountain':sum(f['electorate']=='mountain' for f in data['councilIndigenous']),
    'kind':'原住民议员选区','source':'https://www.cec.gov.tw/central/article/63625',
    'note':'按平地、山地原住民选民身份分层，几何范围与区域选区重叠，不表示该范围的全部居民。'}
data['electionMetadata']['legislativeIndigenous']={
    'year':2024,'count':2,'seatsEach':3,'kind':'原住民立委选区','source':legislative_indigenous_source,
    'note':'平地、山地原住民分别为全国单一选区，各应选3席；县市筛选只改变查看范围，仍为同一全国选区。'}
data['electionMetadata']['note']='区域、平地原住民、山地原住民选区按选民身份分别显示；不分区立委为政党名单，不混入地理选区。'
(ROOT/'sources/indigenous-districts.json').write_text(json.dumps({
    'council':indigenous_source,'councilSource':'https://www.cec.gov.tw/central/article/63625',
    'councilLocalSource':'中選務字第1153150253號公告.pdf',
    'legislative':[{key:f[key] for key in ['id','name','electorate','scope','seats','statewide','source']} for f in data['legislativeIndigenous']],
    'legislativeSource':legislative_indigenous_source},ensure_ascii=False,indent=2))

# Village features reuse the same composite projection as the existing maps.
data['villages']=[]
for v in villages:
    f=feature(v['geometry'],v['code'],v['county'],1,v['town']+v['name'])
    f.update(name=v['name'],town=v['town'],townId=v['townId'])
    f.pop('number',None)
    data['villages'].append(f)
assert len(data['villages'])==7731

# Draw a single, noded electoral mesh. County/coast outlines are already drawn
# by the county overlay; no water holes, doubled edges or village seams belong
# in the electoral stroke layer.
def line_path(g):
    if g.is_empty:return ''
    if g.geom_type in ['LineString','LinearRing']:
        pts=list(g.coords)
        return 'M'+'L'.join(f'{coord(x)},{coord(y)}' for x,y in pts) if len(pts)>1 else ''
    return ''.join(line_path(x) for x in getattr(g,'geoms',[]))

data['districtBorders']={}
audit={}
for layer,geoms in [('council',council_geoms),('legislative',leg_geoms)]:
    meshes=[];errors=[]
    for county in sorted({f['county'] for f in data[layer]}):
        fs=[f for f in data[layer] if f['county']==county]
        shapes=[geoms[f['id']] for f in fs]
        land=county_land[county]
        covered=unary_union(shapes)
        missing=land.difference(covered).area
        extra=covered.difference(land).area
        overlap=sum(g.area for g in shapes)-covered.area
        assert max(missing,extra,abs(overlap))<.001,(layer,county,missing,extra,overlap)
        # Only an edge shared by TWO DIFFERENT constituencies can be a
        # district border. This excludes single-polygon seams and spurs.
        shared=[a.boundary.intersection(b.boundary) for i,a in enumerate(shapes) for b in shapes[i+1:] if a.intersects(b)]
        mesh=line_merge(unary_union(shared).difference(land.boundary.buffer(.015)))
        meshes.append({'county':county,'d':line_path(mesh)})
        errors.append({'county':county,'missingArea':round(missing,8),'extraArea':round(extra,8),'overlapArea':round(overlap,8)})
    data['districtBorders'][layer]=meshes
    audit[layer]=errors
# Indigenous electoral strokes are also derived from true distinct districts,
# within one identity layer only. No boundary is invented between identities.
indigenous_audit=[]
for electorate,key in [('plains','councilPlains'),('mountain','councilMountain')]:
    meshes=[]
    for county in sorted(county_land):
        fs=[f for f in data['councilIndigenous'] if f['county']==county and f['electorate']==electorate]
        shapes=[indigenous_geoms[f['id']] for f in fs]
        land=county_land[county]
        if shapes:
            cover=unary_union(shapes)
            assert cover.symmetric_difference(land).area<.001,(electorate,county,'indigenous coverage')
            assert abs(sum(g.area for g in shapes)-cover.area)<.001,(electorate,county,'indigenous overlap')
            shared=[a.boundary.intersection(b.boundary) for i,a in enumerate(shapes) for b in shapes[i+1:] if a.intersects(b)]
            mesh=line_merge(unary_union(shared))
            indigenous_audit.append({'county':county,'electorate':electorate,'districts':len(fs),'coveredArea':round(cover.area,6)})
        else:mesh=LineString()
        meshes.append({'county':county,'d':line_path(mesh)})
    data['districtBorders'][key]=meshes
for key in ['legislativePlains','legislativeMountain']:
    data['districtBorders'][key]=[]
audit['indigenous']=indigenous_audit

# Overlay meshes keep EVERY original township edge, including the coastline
# and edges coinciding with county or constituency lines. Geometric union only
# de-duplicates strokes; it never clips away a legitimate overlay boundary.
data['townBorders']={'all':[],'council':[],'legislative':[]}
for county,land in sorted(county_land.items()):
    original_edges=[]
    for f in data['towns']:
        if f['county']!=county:continue
        for ring_text in re.findall(r'M([^MZ]+)Z',f['d']):
            points=[tuple(map(float,p.split(','))) for p in ring_text.split('L')]
            if points[-1]!=points[0]:points.append(points[0])
            original_edges.append(LineString(points))
    mesh=line_merge(unary_union(original_edges))
    item={'county':county,'d':line_path(mesh)}
    for key in data['townBorders']:data['townBorders'][key].append(dict(item))

# The largest inscribed-circle center remains well inside the main component,
# including concave regions and offshore multi-polygons. Use it for leader dots.
for layer in ['counties','towns','villages','council','legislative','councilIndigenous','legislativeIndigenous']:
    for f in data[layer]:
        g=svg_geometry(f);part=max(polygons(g),key=lambda p:p.area)
        tolerance=max(.002,max(part.bounds[2]-part.bounds[0],part.bounds[3]-part.bounds[1])/500)
        circle=maximum_inscribed_circle(part,tolerance=tolerance)
        point=circle.coords[0]
        f['labelAnchor']=[round(point[0],6),round(point[1],6)]
        assert part.contains(__import__('shapely').geometry.Point(point)),(layer,f['id'],'anchor outside')
for f in data['legislativeIndigenous']:
    for county,part in f['byCounty'].items():
        part['labelAnchor']=next(c['labelAnchor'] for c in data['counties'] if c['name']==county)
audit['splitTownships']=partition_audit
(ROOT/'sources/boundary-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
data['villageMetadata']={'count':7731,'source':'https://github.com/dkaoster/taiwan-atlas','vintage':'taiwan-atlas 1.0.2 村里快照（非实时行政区划）'}
(ROOT/'assets/map.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
print({k:len(data[k]) for k in ['counties','towns','villages','council','legislative','councilIndigenous','legislativeIndigenous']})
