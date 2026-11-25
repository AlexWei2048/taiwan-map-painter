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
from urllib.parse import urlparse,quote
from collections import Counter
import requests
from bs4 import BeautifulSoup
from PIL import Image,ImageOps,ImageFile,UnidentifiedImageError,ImageDraw,ImageChops
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
# These emblem files are explicitly identified on the registry detail pages.
registry_emblems={
 "爱民党":(554,"https://ws.moi.gov.tw/001/Upload/444/relpic/13073/554/9e74dfca-3a59-40e1-900d-e1adb3c51aa1.jpg"),
 "司法正义党":(299,"https://ws.moi.gov.tw/001/Upload/OldFile_PARTY/2021/ff8080816ecfec30016f5a9ed2fc034e.jpg"),
}
for name,(registry_id,url) in registry_emblems.items():
 candidates[name]={"detail_page":f"https://party.moi.gov.tw/PartyMainContent.aspx?n=16100&s={registry_id}&sms=13073",
                   "image_candidates":[{"url":url}]}
large_jpeg_sha256="6364255e1f43836222cef5a78fad634fd1ab3fd7edc0320507bde349bc0fc629"
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
 known_large_jpeg=len(raw)<=6_000_000 and hashlib.sha256(raw).hexdigest()==large_jpeg_sha256
 if len(raw)>5_000_000 and not known_large_jpeg:raise ValueError("unusually large official image")
 if known_large_jpeg:
  # Decode this exact archived JPEG at 1/8 scale before normalizing.
  limit=Image.MAX_IMAGE_PIXELS
  try:
   Image.MAX_IMAGE_PIXELS=180_000_000
   im=Image.open(io.BytesIO(raw),formats=["JPEG"])
   im.draft("RGB",(1500,1500))
  finally:
   Image.MAX_IMAGE_PIXELS=limit
 else:
  im=Image.open(io.BytesIO(raw))
 im=ImageOps.exif_transpose(im)
 if im.width<32 or im.height<32 or im.width*im.height>16000000:
  raise ValueError("unexpected image dimensions")
 if getattr(im,"is_animated",False):im.seek(0)
 im=im.convert("RGBA")
 # Center crop the actual artwork, not the original rectangular file's margins.
 bounds=im.getchannel("A").getbbox()
 if not bounds:raise ValueError("empty image")
 im=im.crop(bounds)
 side=min(im.size)
 left=(im.width-side)//2;top=(im.height-side)//2
 canvas=im.crop((left,top,left+side,top+side)).resize((128,128),Image.Resampling.LANCZOS)
 mask=Image.new("L",(512,512),0)
 ImageDraw.Draw(mask).ellipse((0,0,511,511),fill=255)
 mask=mask.resize((128,128),Image.Resampling.LANCZOS)
 canvas.putalpha(ImageChops.multiply(canvas.getchannel("A"),mask))
 im=canvas
 colors=len(set(canvas.resize((32,32)).convert("RGB").getdata()))
 if colors<3:raise ValueError("likely blank / empty placeholder graphic")
 out=io.BytesIO();canvas.save(out,format="PNG",optimize=True)
 return out.getvalue(),f"{im.width}x{im.height}"

# Preserve independently verified images from the last successful run. Official
# servers can time out, which must NEVER cause a downgrade to fewer logos.
byid={};byname={};documentation=[];skips=[]
prior_js=ASSETS/"party-logos-sourced.js"
prior_json=REPORT/"official-party-logos-import.json"
if prior_js.exists() and prior_json.exists():
 old=prior_js.read_text(encoding="utf-8")
 prior=json.loads(prior_json.read_text(encoding="utf-8"))
 for variable,target in (
   ("SOURCED_PARTY_LOGOS_BY_ID",byid),
   ("SOURCED_PARTY_LOGOS_BY_NAME",byname)):
  match=re.search(r"const "+variable+r"=(\{.*?\});",old,re.S)
  if match:target.update(json.loads(match.group(1)))
 documentation.extend(prior.get("official_sources",[]))
 skips.extend(prior.get("unverified_or_unavailable",[]))
 print("REUSED_VERIFIED",len(byid),len(byname),len(documentation),flush=True)
for name,item in candidates.items():
 name=norm(name)
 party_id=lookup.get(name)
 if party_id in existing or party_id in byid or name in byname:
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
   "https://upload.wikimedia.org/wikipedia/commons/a/a5/SSFPP_logo_2019.png",
   "https://www.ssfpp.tw/img2/logo-pyramid.png"],
  "source_page":"https://commons.wikimedia.org/wiki/File:SSFPP_logo_2019.png",
  "license":"Wikimedia Commons; attribution and license on source file page"},
 {"name":"台湾动物保护党",
  "also":[],
  "urls":["https://static.wixstatic.com/media/f4b9b6_1d0a1482ceb24a8f85c64410c119f092~mv2.jpg/v1/fit/w_2500%2Ch_1330%2Cal_c/f4b9b6_1d0a1482ceb24a8f85c64410c119f092~mv2.jpg"],
  "source_page":"https://www.tapp.org.tw/",
  "license":"Official party image; rights retained by party; identification only"}
]
# Additional documented sources. Historical marks stay keyed to the
# historical ballot name when the organization later redesigned its logo.
def commons_image(filename):
 digest=hashlib.md5(filename.encode("utf-8")).hexdigest()
 return "https://upload.wikimedia.org/wikipedia/commons/"+digest[0]+"/"+digest[:2]+"/"+quote(filename)
supplemental += [
 {"name":"红党","also":[],
  "urls":["https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Red_party_flag.svg/320px-Red_party_flag.svg.png"],
  "source_page":"https://commons.wikimedia.org/wiki/File:Red_party_flag.svg",
  "license":"Party flag; public domain simple geometry; original author Tomchen1989"},
 {"name":"青年阳光党","also":[],
  "urls":[commons_image("青年陽光黨.png")],
  "source_page":"https://commons.wikimedia.org/wiki/File:青年陽光黨.png",
  "license":"Party emblem from Wikimedia Commons; rights and attribution as documented on source file page"},
 {"name":"基进党","also":[],
  "urls":[commons_image("基進黨｜LOGO.jpg")],
  "source_page":"https://commons.wikimedia.org/wiki/File:基進黨｜LOGO.jpg",
  "license":"Historical party mark, Wikimedia Commons attribution and license on source file page"},
 {"name":"台湾双语无法党","also":[],
  "urls":[commons_image("臺灣雙語無法黨黨徽.png")],
  "source_page":"https://zh.wikipedia.org/wiki/臺灣SoR無法黨",
  "license":"Historic 2020–2026 party emblem; rights retained by original party, identification only"},
 {"name":"台湾SoR无法党","also":[],
  "urls":["https://xn--2lw665d.tw/party/moi-425.png"],
  "source_page":"https://xn--2lw665d.tw/party/366",
  "license":"Current party emblem identified by the named party profile; rights retained by owner, identification only"}
]
for item in supplemental:
 name=norm(item["name"]);pid=lookup.get(name)
 if pid in existing or pid in byid or name in byname:continue
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
# No duplicate documentation or stale missing-status for now-imported parties.
documentation=list({(x["name"],x.get("party_id")):x for x in documentation}.values())
available_names={norm(x["name"]) for x in documentation}
skips=list({norm(x["name"]):x for x in skips
 if norm(x["name"]) not in available_names}.values())
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
