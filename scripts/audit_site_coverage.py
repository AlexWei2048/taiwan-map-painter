#!/usr/bin/env python3
"""Reproducible coverage audit for every archived election party and official-data hole.

The inventory does not equate every raw spelling with a distinct political
party; OpenCC normalization and registered aliases are recorded separately.
It never invents emblems, candidate results or turnout denominators.
"""
from __future__ import annotations
import collections
import json
import re
from pathlib import Path
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REPORT = ROOT / "reports"
REPORT.mkdir(exist_ok=True)
cc = OpenCC("t2s")

def normalized(value):
    name=cc.convert(str(value or "")).replace("臺", "台").strip().replace("無黨籍", "无党籍")
    if name in ("无党籍及未经政党推荐", "无党籍及未經政黨推薦"):return "无党籍"
    return name

def load_json(path):
    try: return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as error: return {"__error__": str(error)}

def parties():
    content=(ASSETS/"parties.js").read_text(encoding="utf-8")
    match=re.search(r"PARTY_PRESETS\s*=\s*(\[.*?\])\s*;",content,re.S)
    assert match, "party preset format changed"
    return json.loads(match.group(1))

# Include both the original Wikimedia-style pack and source-verified party
# emblems. Regenerate this report after imports; a stale gap count would
# misleadingly suggest that newly added party images are still absent.
def logo_keys():
    content=(ASSETS/"party-logos.js").read_text(encoding="utf-8")
    return sorted(set(re.findall(r'["\x27]([\w-]+)["\x27]\s*:\s*["\x27]data:image/',content)))

def sourced_logos():
    src=ASSETS/"party-logos-sourced.js"
    if not src.exists():return set(),set()
    content=src.read_text(encoding="utf-8")
    values=[]
    for label in ("SOURCED_PARTY_LOGOS_BY_ID","SOURCED_PARTY_LOGOS_BY_NAME"):
        match=re.search(r"const "+label+r"=(\{.*?\});",content,re.S)
        values.append(set(json.loads(match.group(1))) if match else set())
    return tuple(values)

def elections():
    samples={}
    for p in sorted(ASSETS.glob("history-legislative-????.json")):
        o=load_json(p)
        if "rows" in o:samples[p.name]=o["rows"]
    for p in sorted(ASSETS.glob("history-president-????.json")):
        o=load_json(p)
        if "rows" in o:samples[p.name]=o["rows"]
    for p in sorted(ASSETS.glob("history-local-????.json")):
        o=load_json(p)
        if "rows" in o:samples[p.name]=o["rows"]
    o=load_json(ASSETS/"history-2022.json")
    if "rows" in o:samples["history-2022.json"]=o["rows"]
    if "candidacies" in o:samples["history-2022-candidacies"]=o["candidacies"]
    roster=ASSETS/"election-2026.js"
    if roster.exists():
        content=roster.read_text(encoding="utf-8")
        prefix="window.ELECTION_2026_DATA="
        if content.startswith(prefix):
            data=json.loads(content[len(prefix):].strip().rstrip(";"))
            samples["election-2026-candidates"]=data["candidates"]
    return samples

def inventory():
    presets=parties();baseline=set(logo_keys())
    official_ids,official_names=sourced_logos()
    keys=baseline|official_ids
    archive=ASSETS/"party-logos-archive.js"
    if archive.exists():keys.update(re.findall(r"SOURCED_PARTY_LOGOS_BY_ID\.([\w-]+)\s*=",archive.read_text(encoding="utf-8")))
    indexed={}
    for p in presets:
        for key in [p["name"]]+p.get("aliases",[]):
            indexed[normalized(key)]=p["id"]
    counter=collections.Counter()
    raw=collections.defaultdict(set)
    years=collections.defaultdict(set)
    votes=collections.Counter()
    for source,rows in elections().items():
        for row in rows:
            name=row.get("party",row.get("party_name",row.get("party_name_official","")))
            if not name:continue
            n=normalized(name)
            if not n:continue
            counter[n]+=1;raw[n].add(str(name));years[n].add(source)
            votes[n]+=int(row.get("votes",0) or 0)
    missing=[]
    for name,count in counter.most_common():
        pid=indexed.get(name)
        # 连署/连署参选 is an independent nomination mechanism, NOT a
        # legally registered party that could possess an official party logo.
        if name in ("连署", "連署"):continue
        if pid and pid in keys or name in official_names:continue
        missing.append({"name":name,"rows":count,"total_votes_across_grains":votes[name],
            "known_preset":pid or None,"sources":sorted(years[name]),"spellings":sorted(raw[name])})
    unused=[{"id":p["id"],"name":p["name"],"aliases":p.get("aliases",[])}
        for p in presets if p["id"] not in keys and p["id"] not in ("gray","red")]
    text_sources={}
    for p in [*ROOT.glob("*.js"),*ROOT.glob("*.html"),*ROOT.glob("*.css"),
              *ROOT.glob("tests/*.cjs")]:
        content=p.read_text(encoding="utf-8")
        occurrences=[]
        for pattern in ["暂无数据","暂无资料","暂无该","无数据","未收录","不可用","无可核实"]:
            count=content.count(pattern)
            if count:occurrences.append({"phrase":pattern,"count":count})
        if occurrences:text_sources[str(p.relative_to(ROOT))]=occurrences
    turnout={}
    for p in sorted(ASSETS.glob("history-legislative-turnout-????.json")):
        data=load_json(p);stat={}
        for ballot,regions in data.get("ballots",{}).items():
            stat[ballot]={"national":bool(regions.get("national")),
                          "county":len(regions.get("county",{})),
                          "town":sum(map(len,regions.get("town",{}).values())),
                          "district":sum(map(len,regions.get("district",{}).values()))}
        turnout[p.stem.split("-")[-1]]=stat
    return {"schemaVersion":1,
        "total_preset_parties":len(presets),
        "total_current_logo_ids":len(keys),
        "original_logo_ids":len(baseline),
        "sourced_preset_logo_ids":len(official_ids),
        "sourced_historical_logo_names":len(official_names),
        "total_party_names_in_archives":len(counter),
        "top_archive_parties":[{"name":name,"rows":count,"id":indexed.get(name),
           "has_logo":bool(indexed.get(name) in keys or name in official_names)} for name,count in counter.most_common(180)],
        "missing_preset_logos":unused,
        "missing_archive_logos":missing,
        "placeholder_code_locations":text_sources,
        "historical_legislative_turnout":turnout,
        "archives_scanned":list(elections().keys())}

def markdown(result):
    lines=[
      "# 岛屿调色盘：党徽与资料缺口可复核清单",
      "",
      "本报告是来源数据自动盘点，**不把暂时没找到的图片误认成官方党徽**。得票记录含不同层级重复汇总，因此仅以记录出现次数作为优先级，绝不能把 total_votes_across_grains 视为实际选举总票数。",
      "",
      f"- 已收录预设政党：{result['total_preset_parties']}",
      f"- 有党徽图档的标识（含无党籍标记）：{result['total_current_logo_ids']}",
      f"- 新增官方预设党徽：{result['sourced_preset_logo_ids']}",
      f"- 新增官方历史名称图档：{result['sourced_historical_logo_names']}",
      f"- 已归一化的历史党名种类：{result['total_party_names_in_archives']}",
      f"- 没有内置党徽的预设政党：{len(result['missing_preset_logos'])}",
      f"- 没有匹配到已收录党徽的历史党名：{len(result['missing_archive_logos'])}",
      "",
      "## 缺党徽的预设政党",
      "",
      "| 名称 | 内部标识 |",
      "|---|---|"]
    lines += [f"| {x['name']} | `{x['id']}` |" for x in result["missing_preset_logos"]]
    lines += ["","## 缺党徽的已出现历史党名（按出现记录数排序）","",
              "| 名称 | 数据行数 | 首个来源 |","|---|---:|---|"]
    lines += [f"| {x['name']} | {x['rows']} | {x['sources'][0] if x['sources'] else ''} |"
              for x in result["missing_archive_logos"]]
    lines += ["","## 投票人数、有效票和无效票覆盖范围","","| 年份 | 票种 | 全部地区 | 县市 | 乡镇市区 | 区域选区 |",
              "|---|---|---|---:|---:|---:|"]
    for year,ballots in result["historical_legislative_turnout"].items():
        for ballot,scopes in ballots.items():
            lines.append(f"| {year} | {ballot} | {'有' if scopes['national'] else '—'} | {scopes['county']} | {scopes['town']} | {scopes['district']} |")
    lines+=["","## 页面代码里的缺值提示","",
            "这些文字包含诚实显示不可取得数据的情况，不能单凭关键字批量替换。",""]
    for path,items in result["placeholder_code_locations"].items():
        lines.append("- `"+path+"`："+", ".join(x["phrase"]+" ×"+str(x["count"]) for x in items))
    return "\n".join(lines)+"\n"

if __name__=="__main__":
    result=inventory()
    (REPORT/"coverage-audit.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (REPORT/"coverage-audit.md").write_text(markdown(result),encoding="utf-8")
    print(json.dumps({k:result[k] for k in ('total_preset_parties','total_current_logo_ids','total_party_names_in_archives')},ensure_ascii=False))
    print("MISSING_PRESET_LOGOS",json.dumps(result["missing_preset_logos"],ensure_ascii=False))
    print("MISSING_ARCHIVE_LOGOS",json.dumps(result["missing_archive_logos"][:80],ensure_ascii=False))
    print("SOURCE_PHRASES",json.dumps(result["placeholder_code_locations"],ensure_ascii=False))
    print("TURNOUT",json.dumps(result["historical_legislative_turnout"],ensure_ascii=False))
