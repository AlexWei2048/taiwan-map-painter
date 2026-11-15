#!/usr/bin/env python3
"""Import VERIFIED party-registered emblems from the ministry's party records.

Input is audited per-party official pages. Never use default.png or site icons.
Images are resized to 128px transparent PNG data URIs so the site's offline
SVG/PNG export remains independent of remote CORS or image availability.
The image data and documented originals retain owners' licensing.
"""
from __future__ import annotations
import base64
import hashlib
import io
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse
from collections import Counter
import requests
from bs4 import BeautifulSoup
from PIL import Image,ImageOps,ImageFile,UnidentifiedImageError
from opencc import OpenCC

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/"assets";REPORT=ROOT/"reports"
cc=OpenCC("t2s")
Image.MAX_IMAGE_PIXELS=20000000
ImageFile.LOAD_TRUNCATED_IMAGES=False
def norm(s):return cc.convert(str(s or "")).replace("臺","台").strip()
def read_presets():
 t=(ASSETS/"parties.js").read_text()
 return json.loads(re.search(r"PARTY_PRESETS\s*=\s*(\[.*?\])\s*;",t,re.S).group(1))
presets=read_presets()
lookup={}
for p in presets:
 for x in [p["name"]]+p.get("aliases",[]):
  lookup[norm(x)]=p["id"]
existing=set(re.findall(r'"([\w-]+)":"data:image', (ASSETS/"party-logos.js").read_text()))
candidates=json.loads((REPORT/"official-party-logo-candidates.json").read_text())["matches"]
audit=json.loads((REPORT/"coverage-audit.json").read_text())
# The registry currently shows a longer name with legal-status parenthetical,
# hence this party was not an exact-string match in the archived index.
extra={"中华统一促进党":"https://party.moi.gov.tw/PartyMainContent.aspx?n=16100&s=172&sms=13073"}
session=requests.Session()
session.headers["User-Agent"]="Mozilla/5.0 (compatible; IslandPalette/1.0; historical educational election archive)"
for name,url in extra.items():
 try:
  response=session.get(url,timeout=24);response.raise_for_status()
  html=BeautifulSoup(response.text,"html.parser")
  imgs=[]
  for tag in html.find_all("img",src=True):
   from urllib.parse import urljoin
   im=urljoin(url,tag["src"])
   if im.startswith("https://ws.moi.gov.tw/001/Upload/"):
    imgs.append({"url":im,"alt":tag.get("alt","")})
  if imgs:candidates[name]={"detail_page":url,"image_candidates":imgs}
 except requests.RequestException as err:print("MANUAL_LOOKUP_FAIL",name,str(err),flush=True)

def decode_image(raw):
 if len(raw)>5_000_000:raise ValueError("unusually large official image")
 im=Image.open(io.BytesIO(raw));im=ImageOps.exif_transpose(im)
 if im.width<32 or im.height<32 or im.width*im.height>16000000:
  raise ValueError("unexpected image dimensions")
 if getattr(im,"is_animated",False):im.seek(0)
 im=im.convert("RGBA")
 # Do not crop away text from the officially registered emblem.
 im.thumbnail((116,116),Image.Resampling.LANCZOS)
 canvas=Image.new("RGBA",(128,128),(255,255,255,0))
 canvas.alpha_composite(im,((128-im.width)//2,(128-im.height)//2))
 colors=len(set(canvas.resize((32,32)).convert("RGB").getdata()))
 if colors<3:raise ValueError("likely blank / empty placeholder graphic")
 out=io.BytesIO();canvas.save(out,format="PNG",optimize=True)
 return out.getvalue(),f"{im.width}x{im.height}"

byid={};byname={};documentation=[];skips=[]
for name,item in candidates.items():
 name=norm(name)
 party_id=lookup.get(name)
 if party_id in existing:
  continue
 imgs=[img for img in item.get("image_candidates",[])
       if img["url"].startswith("https://ws.moi.gov.tw/001/Upload/")
       and not any(x in img["url"].lower() for x in ("default.png","egov.png","/images/"))]
 if not imgs:
  skips.append({"name":name,"reason":"ministry has no uploaded emblem image"})
  continue
 src=imgs[0]["url"]
 try:
  response=session.get(src,timeout=35);response.raise_for_status()
  if "image" not in response.headers.get("Content-Type",""):
   raise ValueError("not an image content-type")
  binary,size=decode_image(response.content)
  uri="data:image/png;base64,"+base64.b64encode(binary).decode("ascii")
  if party_id:
   byid[party_id]=uri
  else:
   byname[name]=uri
  documentation.append({"name":name,"party_id":party_id,"official_registry":item["detail_page"],
     "official_image":src,"source_sha256":hashlib.sha256(response.content).hexdigest(),
     "rendered_sha256":hashlib.sha256(binary).hexdigest(),"image_bytes":len(binary),
     "size_after_fit":size,"license":"Official registered party emblem; rights remain with the party or owner; identification only"})
  print("IMPORTED",name,party_id or "historical",len(binary),src,flush=True)
 except Exception as err:
  skips.append({"name":name,"reason":str(err),"source":src})
  print("SKIP",name,str(err),flush=True)
 time.sleep(.12)
# Two directly documented party-specific emblems were missed by the
# registrar importer: an official party website and a Wikimedia Commons
# attribution page identifying the exact archived party.
supplemental=[
 {"name":"台澎国际法法理建国党",
  "also":["台澎党"],
  "urls":[
   # Wikimedia Commons: File:SSFPP logo 2019.png (author JusticeForce)
   "https://upload.wikimedia.org/wikipedia/commons/1/1b/SSFPP_logo_2019.png",
   "https://www.ssfpp.tw/img2/logo-pyramid.png"],
  "source_page":"https://commons.wikimedia.org/wiki/File:SSFPP_logo_2019.png",
  "license":"Wikimedia Commons; attribution and license on source file page"},
 {"name":"台湾动物保护党",
  "also":[],
  "urls":["https://static.wixstatic.com/media/f4b9b6_1d0a1482ceb24a8f85c64410c119f092~mv2.jpg/v1/fit/w_2500%2Ch_1330%2Cal_c/f4b9b6_1d0a1482ceb24a8f85c64410c119f092~mv2.jpg"],
  "source_page":"https://www.tapp.org.tw/",
  "license":"Official party image; rights retained by party; identification only"}
]
for item in supplemental:
 name=norm(item["name"]);pid=lookup.get(name)
 if pid in existing or pid in byid:continue
 raw=None;last_error=None;chosen=None
 for url in item["urls"]:
  try:
   response=session.get(url,timeout=35);response.raise_for_status()
   if "image" not in response.headers.get("Content-Type",""):
    raise ValueError("non-image response")
   binary,size=decode_image(response.content)
   raw=response.content;chosen=url;break
  except Exception as err:
   last_error=str(err)
 if raw is None:
  skips.append({"name":name,"reason":"official/commons source unavailable: "+str(last_error)})
  continue
 uri="data:image/png;base64,"+base64.b64encode(binary).decode("ascii")
 if pid:byid[pid]=uri
 else:byname[name]=uri
 for alias in item["also"]:byname[norm(alias)]=uri
 documentation.append({"name":name,"party_id":pid,
  "official_registry":item["source_page"],"official_image":chosen,
  "source_sha256":hashlib.sha256(raw).hexdigest(),
  "rendered_sha256":hashlib.sha256(binary).hexdigest(),
  "image_bytes":len(binary),"size_after_fit":size,"license":item["license"],
  "source_alternative":item["urls"]})
 print("IMPORTED_SUPPLEMENT",name,pid or "historical",len(binary),chosen,flush=True)
# Only add images with a party match backed by the registrar or a party-owned
# source / precisely identified Commons file; no speculative reuse.
render="/* Official party-logo images, with sources in reports/official-party-logos-import.json.\n"
render+=" * Rights remain with the image owners. No placeholders, no hotlinks. */\n"
render+="const SOURCED_PARTY_LOGOS_BY_ID="+json.dumps(byid,ensure_ascii=False,separators=(",",":"))+";\n"
render+="const SOURCED_PARTY_LOGOS_BY_NAME="+json.dumps(byname,ensure_ascii=False,separators=(",",":"))+";\n"
(ASSETS/"party-logos-sourced.js").write_text(render)
output={"schemaVersion":1,"count_by_id":len(byid),"count_by_historical_name":len(byname),
 "official_sources":documentation,"unverified_or_unavailable":skips}
(REPORT/"official-party-logos-import.json").write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n")
license_note=["官方登记党徽的来源与授权说明","",
 "党徽仅用于对应政党身份识别，权利归原党或权利人所有，并不受网站 MIT 授权涵盖。原图均来自政党资讯网登记页面及所属公开原始档案。",""]
for x in documentation:
 license_note.append(f"{x['name']} [{x['party_id'] or '历史名称'}]\n登记：{x['official_registry']}\n原图：{x['official_image']}\n来源SHA256：{x['source_sha256']}\n")
(ASSETS/"LICENSE-party-logos-sourced.txt").write_text("\n".join(license_note))
print("IMPORT_SUMMARY",json.dumps({"byId":len(byid),"byHistoricalName":len(byname),"skipped":len(skips),
 "missingPresetsAfter":[p["name"] for p in presets if p["id"] not in existing and p["id"] not in byid and p["id"] not in ("red","gray")]},ensure_ascii=False),flush=True)
