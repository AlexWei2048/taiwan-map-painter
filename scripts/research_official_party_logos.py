#!/usr/bin/env python3
"""Find party-specific registered emblems in official MOI party records.

Produces a candidate report only. Nothing gets imported until a download
and origin/checksum audit confirms an actual party logo (not page decoration).
"""
import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin,parse_qs,urlparse
import requests
from bs4 import BeautifulSoup
from opencc import OpenCC
ROOT=Path(__file__).resolve().parents[1]
cc=OpenCC("t2s")
def norm(s):return cc.convert(str(s or "")).replace("臺","台").strip().replace(" ","")
s=requests.Session();s.headers["User-Agent"]="Mozilla/5.0 (compatible; IslandPaletteResearch/1.0; educational election archive)"
base="https://party.moi.gov.tw/"
lookup={}
listing_diagnostics=[]
for page in range(1,21):
 url=f"https://party.moi.gov.tw/PartyMain.aspx?PageSize=20&n=16100&page={page}&sms=13073"
 try:
  r=s.get(url,timeout=20);r.raise_for_status()
  doc=BeautifulSoup(r.text,"html.parser")
  found=0
  for a in doc.find_all("a",href=True):
   href=a["href"]
   if "PartyMainContent" not in href:continue
   name=norm(a.get_text(" ",strip=True))
   if not name or len(name)>60:continue
   link=urljoin(url,href)
   if name not in lookup:lookup[name]=link;found+=1
  listing_diagnostics.append([page,r.status_code,found,len(r.content)])
  print("PAGE",page,r.status_code,found,len(r.content),flush=True)
  if page==1: print("PAGE_SAMPLE",[(a.get_text(" ",strip=True),a.get("href","")) for a in doc.find_all("a",href=True) if "PartyMainContent" in a.get("href","")][:7],flush=True)
 except Exception as err: print("PAGE_ERROR",page,str(err),flush=True)
 time.sleep(.3)
audit=json.loads((ROOT/"reports/coverage-audit.json").read_text())
presets=audit["missing_preset_logos"]
parties=[p["name"] for p in presets]+[p["name"] for p in audit["missing_archive_logos"] if p["name"] not in ("连署","无党籍及未经政党推荐")]
names=list(dict.fromkeys(parties))
found,notfound={},[]
for name in names:
 k=norm(name)
 if k in lookup:found[name]={"detail_page":lookup[k]}
 else:notfound.append(name)
print("LISTING_TOTAL",len(lookup),"NAMES_MATCHED",len(found),"UNMATCHED",len(notfound),flush=True)
for name in names:
 if name not in found:continue
 info=found[name];url=info["detail_page"]
 try:
  r=s.get(url,timeout=18);r.raise_for_status()
  doc=BeautifulSoup(r.text,"html.parser")
  imgs=[]
  for img in doc.find_all("img"):
   src=img.get("src") or img.get("data-src") or ""
   if not src:continue
   link=urljoin(url,src)
   if not re.search(r"Upload|OldFile_PARTY|Logo|logo|Emblem|party",link,re.I):continue
   if "logo" in link.lower() and "Upload" not in link and "OldFile" not in link:continue
   imgs.append({"url":link,"alt":img.get("alt",""),"width":img.get("width"),"height":img.get("height")})
  # Some official pages use remote https://ws.moi.gov.tw/001/Upload
  img_links=re.findall(r"""(?:https?:)?//[\w.]+/(?:001/)?Upload/[\w./%_-]+\.(?:png|jpe?g|gif|webp)""",r.text,re.I)
  for link in img_links:
   if link.startswith("//"):link="https:"+link
   if link not in [x["url"] for x in imgs]:imgs.append({"url":link,"alt":"","width":None,"height":None})
  info["image_candidates"]=imgs[:12]
  info["page_title"]=doc.title.get_text(" ",strip=True) if doc.title else ""
  info["page_bytes"]=len(r.content)
  print("DETAIL",name,"IMAGES",len(imgs),json.dumps(imgs[:2],ensure_ascii=False)[:700],flush=True)
 except Exception as err:info["error"]=str(err)
 time.sleep(.15)
report={"schemaVersion":1,"listing_diagnostics":listing_diagnostics,"registry_entries":len(lookup),
        "matches":found,"unmatched":notfound}
p=ROOT/"reports/official-party-logo-candidates.json"
p.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print("OFFICIAL_SUMMARY",json.dumps({"registry":len(lookup),"matched":len(found),"with_images":sum(bool(x.get("image_candidates")) for x in found.values()),"unmatched":notfound},ensure_ascii=False),flush=True)
