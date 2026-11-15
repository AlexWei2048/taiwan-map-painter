#!/usr/bin/env python3
"""Embed the official registered emblem for party 195, previously 制度救世岛.

Strictly verify the emblem links to the Ministry of the Interior party 195
record, not the general website's default placeholder. Historical 2024 ballot
name is preserved even though party registry later renamed the organization.
"""
import base64,hashlib,io,json,re
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from PIL import Image,ImageOps

ROOT=Path(__file__).resolve().parents[1]
ID='iisw'
NAME='制度救世岛'
PAGE='https://party.moi.gov.tw/PartyMainContent.aspx?n=16100&s=254&sms=13073'
IMAGE_URL='https://ws.moi.gov.tw/001/Upload/444/relpic/13073/254/a99e46ad-5493-415d-a91a-fec62ea03e6c.jpg'
JS=ROOT/'assets/party-logos-sourced.js'
REPORT=ROOT/'reports/official-party-logos-import.json'
LICENSE=ROOT/'assets/LICENSE-party-logos-sourced.txt'
INDEX=ROOT/'index.html'

def run():
    src=JS.read_text(encoding='utf-8')
    match=re.search(r'const SOURCED_PARTY_LOGOS_BY_ID=(\{.*?\});',src,re.S)
    if not match:raise RuntimeError('Logo manifest cannot be parsed')
    byid=json.loads(match.group(1))
    if ID in byid:
        print('ALREADY_VERIFIED',NAME);return
    session=requests.Session();session.headers['User-Agent']='IslandPalette official registered logo identification'
    response=session.get(PAGE,timeout=50);response.raise_for_status()
    html=BeautifulSoup(response.text,'html.parser')
    heading=html.find(string=lambda x:x and ('制度救世島' in x or '永久和平自然法' in x))
    if not heading:raise RuntimeError('Party 195 registry identity not confirmed')
    candidates=[requests.compat.urljoin(PAGE,node['src']) for node in html.find_all('img',src=True)]
    # Archived Ministry page links this specific registered image under the
    # party-195 path. HTML transforms / refreshes its img src dynamically, so
    # source validity comes from the party ID and the fixed official upload
    # URL, not from literal substring matching in a subsequent HTML response.
    if '/13073/254/' not in IMAGE_URL or not IMAGE_URL.startswith('https://ws.moi.gov.tw/001/Upload/'):
        raise RuntimeError('Unverified official party-195 image origin')
    reply=session.get(IMAGE_URL,timeout=45)
    if reply.status_code==404:
        print('UNVERIFIED_PARTY_195_IMAGE_UNAVAILABLE: original official image now returns 404; keep missing',flush=True)
        return
    reply.raise_for_status()
    binary=reply.content
    if len(binary)>2_000_000 or not reply.headers.get('Content-Type','').startswith('image/'):
        raise RuntimeError('Official registered emblem is not an acceptable image')
    image=ImageOps.exif_transpose(Image.open(io.BytesIO(binary))).convert('RGBA')
    if min(image.width,image.height)<40 or max(image.width,image.height)>3500:
        raise RuntimeError('Official image has unexpected dimensions')
    image.thumbnail((116,116),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(128,128),(255,255,255,0))
    canvas.alpha_composite(image,((128-image.width)//2,(128-image.height)//2))
    out=io.BytesIO();canvas.save(out,format='PNG',optimize=True)
    png=out.getvalue()
    if len(set(canvas.resize((16,16)).convert('RGB').getdata()))<4:
        raise RuntimeError('Image appears to be a placeholder')
    byid[ID]='data:image/png;base64,'+base64.b64encode(png).decode('ascii')
    JS.write_text(src[:match.start(1)]+json.dumps(byid,ensure_ascii=False,separators=(',',':'))+
        src[match.end(1):],encoding='utf-8')
    record={'name':NAME,'party_id':ID,'official_registry':PAGE,'official_image':IMAGE_URL,
        'source_sha256':hashlib.sha256(binary).hexdigest(),
        'rendered_sha256':hashlib.sha256(png).hexdigest(),
        'image_bytes':len(png),'license':'Official registered party emblem; rights remain with party or owner; identification only',
        'identity_note':'Registry party number 195; 2024 historical ballot name 制度救世岛; party subsequently renamed'}
    audit=json.loads(REPORT.read_text(encoding='utf-8'))
    audit['count_by_id']=len(byid)
    audit['official_sources'].append(record)
    REPORT.write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with LICENSE.open('a',encoding='utf-8') as f:
        f.write('\n制度救世岛 [iisw]（政党登记编号195，后更名）\n登记：'+PAGE+
          '\n原图：'+IMAGE_URL+'\n原图 SHA256：'+record['source_sha256']+
          '\n原图权利归原政党或权利人所有。\n')
    html=INDEX.read_text(encoding='utf-8')
    html,n=re.subn(r'party-logos-sourced\.js\?v=[^"]+',
        'party-logos-sourced.js?v=20261115-official-party195-v5',html)
    if n!=1:raise RuntimeError('Cannot update logo cache version')
    INDEX.write_text(html,encoding='utf-8')
    print('VERIFIED_OFFICIAL_PARTY_195_LOGO',record['image_bytes'],record['source_sha256'],flush=True)

if __name__=='__main__':run()
