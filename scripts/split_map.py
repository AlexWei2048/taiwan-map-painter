"""Build lazy map shards from the versioned full geometry, preserving order."""
from pathlib import Path
import json
import math
import argparse

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output-dir', default=str(ROOT / 'assets'))
args = parser.parse_args()
ASSETS = Path(args.output_dir)
ASSETS.mkdir(parents=True, exist_ok=True)
full = json.loads((ROOT / 'assets/map.json').read_text())
write = lambda name, value: (ASSETS / name).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))
base = dict(full)
for name in ['council', 'councilIndigenous', 'legislative', 'legislativeIndigenous', 'villages']:
    base[name] = []
base['districtBorders'] = {}
base['townBorders'] = {'all': []}
write('map-base.json', base)
write('map-council.json', {key: full[key] for key in ['council', 'councilIndigenous']})
write('map-legislative.json', {key: full[key] for key in ['legislative', 'legislativeIndigenous']})
write('map-district-borders.json', full['districtBorders'])
write('map-town-borders.json', full['townBorders']['all'])
size = math.ceil(len(full['villages']) / 5)
for part in range(5):
    write(f'map-villages-{part+1}.json', full['villages'][part*size:(part+1)*size])
print('Built map shards without changing geometry or feature order')
