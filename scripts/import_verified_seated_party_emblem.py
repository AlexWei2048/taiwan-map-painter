#!/usr/bin/env python3
"""Import ONLY the Ministry-registered Chinese National Zhi Gong Party emblem.

Historical council winner 2018 金门县：蔡春生. Never use the unrelated China Zhi
Gong Party (PRC), Hongmen Zhi Gong Party, or a fabricated graphic.
"""
from __future__ import annotations
import base64
import hashlib
import io
import json
import re
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "assets/party-logos-sourced.js"
REPORT = ROOT / "reports/official-party-logos-import.json"
LICENSE = ROOT / "assets/LICENSE-party-logos-sourced.txt"
INDEX = ROOT / "index.html"
NAME = "中华民族致公党"
NAME_TRAD = "中華民族致公黨"
PAGE = "https://party.moi.gov.tw/PartyMainContent.aspx?n=16100&s=157&sms=13073"
IMAGE_URL = "https://ws.moi.gov.tw/001/Upload/OldFile_PARTY/2021/ff8080816b88b9f5016bd0204db2045e.jpg"

def import_exact():
    text = JS.read_text(encoding="utf-8")
    match_id = re.search(r"const SOURCED_PARTY_LOGOS_BY_ID=(\{.*?\});",text,re.S)
    match = re.search(r"const SOURCED_PARTY_LOGOS_BY_NAME=(\{.*?\});",text,re.S)
    if not match or not match_id:
        raise RuntimeError("No verified logo asset dictionary")
    by_id = json.loads(match_id.group(1))
    by_name = json.loads(match.group(1))
    manifest = json.loads(REPORT.read_text(encoding="utf-8"))
    if NAME in by_name:
        if not any(item.get("name")==NAME and item.get("official_image")==IMAGE_URL for item in manifest["official_sources"]):
            raise RuntimeError("Preexisting emblem missing origin proof; refusing to overwrite")
        print("ALREADY_IMPORTED",NAME)
        return False
    session = requests.Session()
    session.headers.update({"User-Agent":"IslandPalette verified historical party emblem research/1.0"})
    page = session.get(PAGE,timeout=40);page.raise_for_status()
    soup = BeautifulSoup(page.content,"html.parser")
    if NAME_TRAD not in soup.get_text(" ",strip=True):
        raise RuntimeError("Official party registration does not identify intended historical party")
    found = [urljoin(PAGE,img.get("src","")) for img in soup.find_all("img") if img.get("src")]
    if IMAGE_URL not in found:
        raise RuntimeError("Official image URL not linked on matching party 98 registry page")
    if not IMAGE_URL.startswith("https://ws.moi.gov.tw/001/Upload/OldFile_PARTY/"):
        raise RuntimeError("Unexpected unverified image domain or path")
    response=session.get(IMAGE_URL,timeout=45);response.raise_for_status()
    image_bytes=response.content
    if not response.headers.get("Content-Type","").lower().startswith("image/") or not 1000<=len(image_bytes)<=3_000_000:
        raise RuntimeError("Unexpected official image file")
    original=ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGBA")
    if not 80<=min(original.size) or max(original.size)>4500:
        raise RuntimeError("Unexpected emblem dimensions")
    # Center-crop the registry image, remove white margins, fit 128px circular logo.
    art=original.convert("RGB")
    from PIL import ImageChops
    white=Image.new("RGB",art.size,(255,255,255))
    box=ImageChops.difference(art,white).convert("L").point(lambda c:255 if c>28 else 0).getbbox()
    if box:
        original=original.crop(box)
    side=min(original.size)
    x=(original.width-side)//2;y=(original.height-side)//2
    picture=original.crop((x,y,x+side,y+side)).resize((128,128),Image.Resampling.LANCZOS)
    if len(set(picture.resize((20,20)).convert("RGB").getdata()))<15:
        raise RuntimeError("Official image suspiciously uniform; possible placeholder")
    mask=Image.new("L",(512,512));ImageDraw.Draw(mask).ellipse((0,0,511,511),fill=255)
    mask=mask.resize((128,128),Image.Resampling.LANCZOS)
    picture.putalpha(ImageChops.multiply(picture.getchannel("A"),mask))
    out=io.BytesIO();picture.save(out,format="PNG",optimize=True);png=out.getvalue()
    by_name[NAME]="data:image/png;base64,"+base64.b64encode(png).decode("ascii")
    JS.write_text(text[:match.start(1)]+json.dumps(by_name,ensure_ascii=False,separators=(",",":"))+
        text[match.end(1):],encoding="utf-8")
    record={"name":NAME,"official_registry":PAGE,"official_image":IMAGE_URL,
        "asset_type":"official registered emblem, as of 2018 party rename",
        "source_sha256":hashlib.sha256(image_bytes).hexdigest(),
        "rendered_sha256":hashlib.sha256(png).hexdigest(),
        "image_bytes":len(png),
        "license":"Registered party mark, identity-only use; rights remain with party/owner",
        "identity_note":"This is the Taiwanese registered 中華民族致公黨, not the PRC 中國致公黨, not the separate 中國洪門致公黨."}
    manifest["official_sources"].append(record)
    manifest["count_by_id"]=len(by_id)
    manifest["count_by_historical_name"]=len(by_name)
    REPORT.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    with LICENSE.open("a",encoding="utf-8") as f:
        f.write("\n中华民族致公党（历史2018年金门县议员当选政党，非大陆中国致公党）\n"+
            "官方登记："+PAGE+"\n官方党徽："+IMAGE_URL+"\n原图 SHA256："+record["source_sha256"]+
            "\n权益归对应政党或权利人所有，仅用于身份识别。\n")
    html=INDEX.read_text(encoding="utf-8")
    html,n=re.subn(r"party-logos-sourced\.js\?v=[^\"]+",
        "party-logos-sourced.js?v=20261127-verified-seated-zhigong-v1",html)
    if n!=1:raise RuntimeError("Unable to update party logo bundle cache")
    INDEX.write_text(html,encoding="utf-8")
    print("IMPORTED_OFFICIAL_ELECTED_PARTY_EMBLEM",NAME,record["rendered_sha256"])
    return True

if __name__=="__main__":import_exact()
