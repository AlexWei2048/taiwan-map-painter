#!/usr/bin/env python3
"""Patch verified names throughout historical election data and SHA manifest."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORRECTIONS = ROOT / "sources/history-legislative-name-corrections.json"
MANIFEST = ROOT / "sources/history-legislative-manifest.json"

def apply():
    entries = json.loads(CORRECTIONS.read_text(encoding="utf8"))["corrections"]
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    applied = Counter()
    for year in sorted({item["year"] for item in entries}):
        path = ROOT / f"assets/history-legislative-{year}.json"
        snap = json.loads(path.read_text(encoding="utf8"))
        if snap["year"] != year:
            raise ValueError(f"Incorrect year for {path}")
        for correction in (x for x in entries if x["year"] == year):
            old, new = correction["old_name"], correction["name"]
            voter = correction["electorate"]
            number = str(correction["ballot_number"])
            candidates = [x for x in snap["candidacies"]
                if x["contest_id"].split(":")[2] == voter
                and x["candidate_name"] in (old, new)
                and str(x.get("ballot_number")) == number
                and x["votes"] == correction["votes"]]
            if len(candidates) != 1:
                raise ValueError(f"{year} {old}: expected exactly one matching candidacy, got {len(candidates)}")
            c = candidates[0]
            old_rows = [x for x in snap["rows"] if x["electorate"] == voter and x["name"] == old and str(x["number"]) == number]
            new_rows = [x for x in snap["rows"] if x["electorate"] == voter and x["name"] == new and str(x["number"]) == number]
            if c["candidate_name"] == old:
                if not old_rows or new_rows or not c["candidacy_id"].endswith(":" + old):
                    raise ValueError(f"{year} {old}: incomplete/inconsistent source identity")
                for row in old_rows:
                    row["name"] = new
                    if row.get("candidate") == old:
                        row["candidate"] = new
                c["candidate_name"] = new
                c["candidacy_id"] = c["candidacy_id"][:-len(old)] + new
                applied[year] += 1
            elif old_rows or not new_rows:
                raise ValueError(f"{year} {old}: inconsistent earlier correction")
        blob = (json.dumps(snap, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf8")
        path.write_bytes(blob)
        manifest["shards"][str(year)] = hashlib.sha256(blob).hexdigest()
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print("Source-corrected candidate identities:", dict(applied), "total:", sum(applied.values()))

if __name__ == "__main__":
    apply()
