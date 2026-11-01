"""Verify serialized election polygons, not just pre-export GEOS objects."""
import json,re
from pathlib import Path
from shapely.geometry import Polygon
from shapely import make_valid,unary_union
p=Path(__file__).parent;data=json.loads((p/'assets/map.json').read_text())
def geom(f):
 g=Polygon()
 for ring in re.findall(r'M([^MZ]+)Z',f['d']):
  points=[tuple(map(float,q.split(','))) for q in ring.split('L')]
  if len(points)>=3:g=g.symmetric_difference(make_valid(Polygon(points)))
 return g
counties={f['name']:geom(f) for f in data['counties']}
for level,count in [('council',161),('legislative',73)]:
 assert len(data[level])==count
 for county,land in counties.items():
  gs=[geom(f) for f in data[level] if f['county']==county];cover=unary_union(gs)
  assert cover.symmetric_difference(land).area<.001,(level,county,'coverage')
  assert abs(sum(g.area for g in gs)-cover.area)<.001,(level,county,'overlap')
 assert len(data['districtBorders'][level])==22
villages=data['villages'];assert len(villages)==7731 and len({f['id'] for f in villages})==7731
assert all(re.fullmatch(r'\d{11}',f['id']) and f['name'] and f['townId'] for f in villages)
print('Serialized council/legislative geometry: 44 county coverage and overlap checks passed; 7,731 unique village IDs passed.')
from shapely.geometry import Point,LineString

def lines(d):
 return unary_union([LineString([tuple(map(float,p.split(','))) for p in r.split('L')]) for r in re.findall(r'M([^MZ]+)',d) if 'L' in r])
for level in ['council','legislative']:
 for item in data['districtBorders'][level]:
  gs=[geom(f) for f in data[level] if f['county']==item['county']]
  shared=unary_union([a.boundary.intersection(b.boundary) for i,a in enumerate(gs) for b in gs[i+1:] if a.intersects(b)])
  mesh=lines(item['d']);land=counties[item['county']]
  assert mesh.difference(shared.buffer(.025)).length<.001,(level,item['county'],'unsupported residual stroke')
  expected=shared.difference(land.boundary.buffer(.02))
  assert expected.difference(mesh.buffer(.025)).length<.001,(level,item['county'],'missing real district edge')
for layer in ['counties','towns','villages','council','legislative']:
 for f in data[layer]:
  g=geom(f);point=Point(f['labelAnchor'])
  assert g.contains(point),(layer,f['id'],'leader outside')
  assert point.distance(g.boundary)>.0001,(layer,f['id'],'leader touches boundary')
assert all(len(data['townBorders'][key])==22 for key in ['all','council','legislative'])
print('All district strokes supported by shared district edges; no missing edges. All 8,355 interior anchors valid; township meshes present for 22 counties.')

# Regression for false enclaves caused by assigning the mismatch between old
# township and village perimeters to the final electoral district. Certify the
# electoral strokes INSIDE every split township against original topology arcs
# shared by differently assigned village groups, plus explicit end joins.
# Unlike a shared-polygon-edge test, this fails for the former thin enclaves:
# those edges are shared in the output but have no source electoral cut.
audit=json.loads((p/'sources/boundary-audit.json').read_text())
topology=json.loads((p/'sources/villages-projected.json').read_text())
source_arcs=[]
for arc in topology['arcs']:
 x=y=0;points=[]
 for dx,dy in arc:
  x+=dx;y+=dy
  points.append((x*topology['transform']['scale'][0]+topology['transform']['translate'][0],
                 y*topology['transform']['scale'][1]+topology['transform']['translate'][1]))
 source_arcs.append(points)
towns_by_id={f['id']:geom(f) for f in data['towns']}
for split in audit['splitTownships']:
 town=towns_by_id[split['townId']]
 expected=unary_union([LineString(source_arcs[a]) for a in split['sourceCutArcIds']]+
                      [LineString(join) for join in split['perimeterJoins']])
 item=next(item for item in data['districtBorders'][split['layer']] if item['county']==split['county'])
 actual=lines(item['d']).intersection(town.buffer(-.00001))
 residual=actual.difference(expected.buffer(.0001)).length
 assert residual<.001,(split['layer'],split['county'],split['town'],'false internal electoral cut',residual)
 # Each actual district share intersects its original source cut, rather than
 # being a detached strip around an unrelated village/township perimeter.
 assert split['faces']>=len(split['zones'])
print(f"All {len(audit['splitTownships'])} split-township electoral cuts match original shared village topology; no perimeter-sliver edges.")

# Indigenous council boundaries are whole-township scopes from the 2026
# announcement, with overlapping identity electorates kept in separate layers.
indigenous=data['councilIndigenous']
assert len(indigenous)==60 and len({f['id'] for f in indigenous})==60
assert not ({f['id'] for f in indigenous}&{f['id'] for f in data['council']})
meta=json.loads((p/'sources/indigenous-districts.json').read_text())
assert len(meta['council'])==60
metadata={r['id']:r for r in meta['council']}
for f in indigenous:
 m=metadata[f['id']]
 assert f['directoryId']==m['directoryId'] and f['scope']==m['scope'] and f['seats']==m['seats']
 expected=unary_union([towns_by_id[tid] for tid in f['townIds']])
 assert geom(f).symmetric_difference(expected).area<.001,('indigenous scope',f['id'])
 assert geom(f).contains(Point(f['labelAnchor'])),('indigenous anchor',f['id'])
for electorate,key in [('plains','councilPlains'),('mountain','councilMountain')]:
 for county,land in counties.items():
  fs=[f for f in indigenous if f['county']==county and f['electorate']==electorate]
  gs=[geom(f) for f in fs]
  item=next(item for item in data['districtBorders'][key] if item['county']==county)
  mesh=lines(item['d'])
  if gs:
   cover=unary_union(gs)
   assert cover.symmetric_difference(land).area<.001,(electorate,county,'coverage')
   assert abs(sum(g.area for g in gs)-cover.area)<.001,(electorate,county,'overlap')
   shared=unary_union([a.boundary.intersection(b.boundary) for i,a in enumerate(gs) for b in gs[i+1:] if a.intersects(b)])
   assert mesh.difference(shared.buffer(.00002)).length<.001,(electorate,county,'false stroke')
   assert shared.difference(mesh.buffer(.00002)).length<.001,(electorate,county,'missing stroke')
  else:assert mesh.is_empty

# Nationwide indigenous legislative constituencies keep one identity/record
# while county filtering displays a crop rather than fabricating local seats.
leg_indigenous=data['legislativeIndigenous']
assert len(leg_indigenous)==2
assert {f['id'] for f in leg_indigenous}=={'00000-01','00000-02'}
assert {f['electorate'] for f in leg_indigenous}=={'plains','mountain'}
national=unary_union(list(counties.values()))
for f in leg_indigenous:
 assert f['statewide'] is True and f['seats']==3
 assert geom(f).symmetric_difference(national).area<.001,('national scope',f['id'])
 assert geom(f).contains(Point(f['labelAnchor'])),('national anchor',f['id'])
 assert set(f['byCounty'])==set(counties)
 for county,part in f['byCounty'].items():
  assert part['id']==f['id'] and part['seats']==3 and part['statewide'] is True
  assert geom(part).symmetric_difference(counties[county]).area<.001,(f['id'],county,'crop')
  assert geom(part).contains(Point(part['labelAnchor'])),(f['id'],county,'crop anchor')

# A requested overlay must retain original full boundaries, including edges
# that coincide with county/constituency lines or lie on the coastline.
for item in data['townBorders']['all']:
 county=item['county']
 original_edges=[]
 for f in data['towns']:
  if f['county']!=county:continue
  for ring_text in re.findall(r'M([^MZ]+)Z',f['d']):
   points=[tuple(map(float,q.split(','))) for q in ring_text.split('L')]
   if points[-1]!=points[0]:points.append(points[0])
   original_edges.append(LineString(points))
 expected=unary_union(original_edges)
 actual=lines(item['d'])
 assert expected.difference(actual.buffer(.00002)).length<.001,(county,'clipped township overlay')
 assert actual.difference(expected.buffer(.00002)).length<.001,(county,'invented township overlay')
 for key in ['council','legislative']:
  other=next(edge for edge in data['townBorders'][key] if edge['county']==county)
  assert other['d']==item['d'],(key,county,'overlay differs')
print('60 indigenous council scopes and 2 nationwide 3-seat legislative constituencies passed; 44 county crops and all original township overlay lines retained.')
