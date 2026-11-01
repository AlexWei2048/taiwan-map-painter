"""Normalize bundled original emblems to self-contained transparent 128px PNGs."""
from pathlib import Path
import json,io,base64
from PIL import Image
import cairosvg
root=Path(__file__).parent
records=json.loads((root/'sources/party-logos/manifest.json').read_text());logos={}
for r in records:
 p=root/r['original'];raw=p.read_bytes()
 if p.suffix=='.svg':raw=cairosvg.svg2png(bytestring=raw,output_width=256)
 img=Image.open(io.BytesIO(raw)).convert('RGBA');img.thumbnail((112,112),Image.Resampling.LANCZOS)
 canvas=Image.new('RGBA',(128,128));canvas.alpha_composite(img,((128-img.width)//2,(128-img.height)//2));buf=io.BytesIO();canvas.save(buf,format='PNG',optimize=True)
 logos[r['id']]='data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()
# The user-supplied independent-candidate symbol is a local, versioned asset.
# Keep it bundled as a data URI so standalone SVG exports preserve the logo.
independent=root/'assets/independent-emblem.png'
if independent.exists():
 logos['gray']='data:image/png;base64,'+base64.b64encode(independent.read_bytes()).decode()
(root/'assets/party-logos.js').write_text('const PARTY_LOGOS='+json.dumps(logos,separators=(',',':'))+';\n')
print(len(logos),'embedded emblems')
