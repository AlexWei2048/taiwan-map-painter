#!/usr/bin/env python3
"""Embed documented 2022 Taiwan Workers Party historical flag by exact name.

This is NOT the different Labour Party (劳动党). Wikimedia Commons identifies
the source flag specifically as 台灣工黨, author AAAAA143222, CC BY-SA 4.0.
"""
import base64,hashlib,io,json,re
from pathlib import Path
import requests,cairosvg
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
NAME='台湾工党'
SOURCE_PAGE='https://commons.wikimedia.org/wiki/File:台灣工黨黨旗.svg'
ORIGINAL='https://commons.wikimedia.org/wiki/Special:Redirect/file/台灣工黨黨旗.svg'
JS=ROOT/'assets/party-logos-sourced.js'
REPORT=ROOT/'reports/official-party-logos-import.json'
LICENSE=ROOT/'assets/LICENSE-party-logos-sourced.txt'
INDEX=ROOT/'index.html'
def run():
    source=JS.read_text(encoding='utf-8')
    mt=re.search(r'const SOURCED_PARTY_LOGOS_BY_NAME=(\{.*?\});',source,re.S)
    if not mt:raise RuntimeError('Missing logo name map')
    data=json.loads(mt.group(1))
    if NAME in data:
        print('ALREADY_COVERED',NAME,flush=True)
        return
    resp=requests.get(ORIGINAL,timeout=50,headers={'User-Agent':'IslandPalette election archive party identity audit'})
    resp.raise_for_status()
    raw=resp.content
    if len(raw)>150000 or len(raw)<250 or b'<svg' not in raw[:2500].lower():
        raise ValueError('Party-specific Commons SVG validation failed')
    if re.search(rb'<script|onload\s*=|<foreignObject|<!ENTITY',raw,re.I):
        raise ValueError('Potentially active Commons SVG')
    converted=cairosvg.svg2png(bytestring=raw,output_width=128,output_height=128)
    with Image.open(io.BytesIO(converted)) as pic:
        pic=pic.convert('RGBA')
        pic.thumbnail((116,116),Image.Resampling.LANCZOS)
        if min(pic.size)<65:raise ValueError('Unexpected flag dimensions')
        image=Image.new('RGBA',(128,128),(0,0,0,0))
        image.alpha_composite(pic,((128-pic.width)//2,(128-pic.height)//2))
        io_png=io.BytesIO();image.save(io_png,format='PNG',optimize=True)
        png=io_png.getvalue()
    data[NAME]='data:image/png;base64,'+base64.b64encode(png).decode('ascii')
    JS.write_text(source[:mt.start(1)]+json.dumps(data,ensure_ascii=False,separators=(',',':'))+
      source[mt.end(1):],encoding='utf-8')
    report=json.loads(REPORT.read_text(encoding='utf-8'))
    report['count_by_historical_name']=len(data)
    report['official_sources'].append({
        'name':NAME,'party_id':None,'official_registry':SOURCE_PAGE,
        'official_image':ORIGINAL,'source_page':SOURCE_PAGE,'source_file':ORIGINAL,
        'asset_type':'historic party flag, NOT a separately registered party emblem',
        'source_sha256':hashlib.sha256(raw).hexdigest(),
        'rendered_sha256':hashlib.sha256(png).hexdigest(),
        'image_bytes':len(png),
        'license':'Wikimedia Commons CC BY-SA 4.0; attribution and share-alike requirements apply',
        'author':'AAAAA143222','source_note':'Specific historical Taiwan Workers Party; not Labour Party'})
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with LICENSE.open('a',encoding='utf-8') as f:
        f.write('\n台湾工党 [历史名称，党旗替代标识]（切勿混为劳动党）\n来源：'+SOURCE_PAGE+
          '\n作者：AAAAA143222\n授权：CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/\n'+
          '来源 SHA256：'+hashlib.sha256(raw).hexdigest()+'\n')
    html=INDEX.read_text(encoding='utf-8')
    html,n=re.subn(r'party-logos-sourced\.js\?v=[^"]+',
      'party-logos-sourced.js?v=20261115-history-workers-party-v6',html)
    if n!=1:raise RuntimeError('Logo cache control missing')
    INDEX.write_text(html,encoding='utf-8')
    print('EMBEDDED_VERIFIED_TAIWAN_WORKERS_PARTY_FLAG',len(png),flush=True)
if __name__=='__main__':run()
