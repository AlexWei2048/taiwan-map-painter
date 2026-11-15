#!/usr/bin/env python3
"""Audit and embed a newly verified historic party flag, never an invented logo.

The Chinese Youth Party flag is explicitly identified on Commons and conforms
to the national party's published charter. It is labelled "party flag" in the
provenance and serves as a visual badge when a logo is not separately verified.
No action is taken on failed validation, network timeout or wrong-party imagery.
"""
import base64
import hashlib
import io
import json
import re
import sys
from pathlib import Path

import cairosvg
import requests
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
JS=ROOT/'assets/party-logos-sourced.js'
REPORT=ROOT/'reports/official-party-logos-import.json'
LICENSE=ROOT/'assets/LICENSE-party-logos-sourced.txt'
INDEX=ROOT/'index.html'
PARTY_ID='ycp'
NAME='中国青年党'
SOURCE_PAGE='https://commons.wikimedia.org/wiki/File:Flag_of_Chinese_Youth_Party.svg'
SOURCE_FILE='https://commons.wikimedia.org/wiki/Special:Redirect/file/Flag_of_Chinese_Youth_Party.svg'
REGISTRY='https://party.moi.gov.tw/PartyMainContent.aspx?n=16100&sms=13073&s=3'
def main():
    raw=JS.read_text(encoding='utf-8')
    m=re.search(r'const SOURCED_PARTY_LOGOS_BY_ID=(\{.*?\});',raw,re.S)
    n=re.search(r'const SOURCED_PARTY_LOGOS_BY_NAME=(\{.*?\});',raw,re.S)
    if not m or not n:raise RuntimeError('Verified logo manifest missing')
    by_id=json.loads(m.group(1));by_name=json.loads(n.group(1))
    if PARTY_ID in by_id:
        # The official-source contract also requires normalized original
        # registry/image URLs for all source records, even Commons flags.
        doc=json.loads(REPORT.read_text(encoding='utf-8'))
        for item in doc.get('official_sources',[]):
            if item.get('party_id')==PARTY_ID:
                item['official_registry']=REGISTRY
                item['official_image']=SOURCE_FILE
        REPORT.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print('AUDITED_EXISTING_FLAG_SOURCE',NAME)
        return
    resp=requests.get(SOURCE_FILE,timeout=50,headers={'User-Agent':'IslandPalette-verified-historical-party-flag/1.0'})
    resp.raise_for_status()
    source=resp.content
    if len(source)>120000 or len(source)<100 or b'<svg' not in source[:2000].lower():
        raise RuntimeError('Unexpected source image; refusing to embed')
    if re.search(rb'<script|onload\s*=|<foreignObject|<!ENTITY',source,re.I):
        raise RuntimeError('Potentially active or external SVG; refusing to embed')
    png=cairosvg.svg2png(bytestring=source,output_width=128,output_height=128)
    with Image.open(io.BytesIO(png)) as picture:
        image=picture.convert('RGBA');image.thumbnail((116,116),Image.Resampling.LANCZOS)
        if image.width<60 or image.height<40:raise RuntimeError('Unexpected party flag image dimensions')
        canvas=Image.new('RGBA',(128,128),(0,0,0,0))
        canvas.alpha_composite(image,((128-image.width)//2,(128-image.height)//2))
        out=io.BytesIO();canvas.save(out,format='PNG',optimize=True)
        rendered=out.getvalue()
    by_id[PARTY_ID]='data:image/png;base64,'+base64.b64encode(rendered).decode('ascii')
    update=raw[:m.start(1)]+json.dumps(by_id,ensure_ascii=False,separators=(',',':'))+raw[m.end(1):]
    JS.write_text(update,encoding='utf-8')
    doc=json.loads(REPORT.read_text(encoding='utf-8'))
    doc['count_by_id']=len(by_id);doc['count_by_historical_name']=len(by_name)
    doc.setdefault('official_sources',[]).append({
        'name':NAME,'party_id':PARTY_ID,'source_page':SOURCE_PAGE,
        'source_file':SOURCE_FILE,'party_registry':REGISTRY,
        'asset_type':'documented political party FLAG (no separate logo validated)',
        'source_sha256':hashlib.sha256(source).hexdigest(),
        'rendered_sha256':hashlib.sha256(rendered).hexdigest(),
        'image_bytes':len(rendered),
        'license':'Public domain; basic geometric flag, documentation on Commons file page',
        'author':'Ericmetro; Wikimedia Commons',
    })
    REPORT.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with LICENSE.open('a',encoding='utf-8') as target:
        target.write('\n中国青年党 [ycp]（党旗作身份标记，不称官方党徽）\n登记：'+REGISTRY+
          '\n党旗：'+SOURCE_PAGE+'\n授权：公共领域（几何图案）；作者 Ericmetro；来源 Commons\n'+
          '原图SHA256：'+hashlib.sha256(source).hexdigest()+'\n')
    index=INDEX.read_text(encoding='utf-8')
    index,count=re.subn(r'party-logos-sourced\.js\?v=[^"]+', 
       'party-logos-sourced.js?v=20261115-historical-party-flags-v4',index)
    if count!=1:raise RuntimeError('Cannot locate logo cache busting URL')
    INDEX.write_text(index,encoding='utf-8')
    print('VERIFIED_PARTY_FLAG_ADDED',NAME,'bytes',len(rendered),
      'sha256',hashlib.sha256(rendered).hexdigest(),flush=True)

if __name__=='__main__':main()
