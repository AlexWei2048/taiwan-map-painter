"""Cross-language publication contract; all fabricated votes stay in a temporary directory."""
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import build_2026_official_results as B

def check_release_pair(manifest_path, result_path, today=None):
    """Check actual release assets, never generate or publish any data."""
    today = today or B.publication_day()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1 or manifest.get("year") != 2026:
        raise ValueError("Invalid 2026 availability manifest")
    if manifest.get("status") == "awaiting_results":
        if result_path.exists() or manifest.get("resultStatus") is not None or manifest.get("sha256") is not None or manifest.get("file") is not None:
            raise ValueError("Awaiting results must not contain a published result or checksum")
        return None
    if manifest.get("status") != "published" or manifest.get("resultStatus") not in ("provisional", "certified"):
        raise ValueError("Invalid official result release status")
    if manifest.get("file") != "assets/history-2026.json" or not result_path.is_file():
        raise ValueError("Published manifest requires the matching result file")
    if today < B.ELECTION_DAY or (manifest["resultStatus"] == "certified" and today < B.CERTIFICATION_DAY):
        raise ValueError("Result release predates the permitted date")
    raw = result_path.read_bytes()
    if manifest.get("sha256") != hashlib.sha256(raw).hexdigest():
        raise ValueError("Published result checksum mismatch")
    snapshot = json.loads(raw)
    if snapshot.get("publicationStatus") != manifest["resultStatus"] or snapshot.get("completeness") != "full":
        raise ValueError("Result status or completeness does not match the manifest")
    if manifest.get("candidateCount") != sum(x[1] for x in B.EXPECTED.values()) or manifest.get("districtCount") != sum(x[0] for x in B.EXPECTED.values()):
        raise ValueError("Published counts do not match the audited roster")
    provenance = snapshot.get("provenance") or {}
    links = provenance.get("sourceLinks")
    if not isinstance(links, list) or not links or provenance.get("officialWinnerMarksOnly") is not True:
        raise ValueError("Published result lacks official source provenance")
    for source in links:
        _, day = B.official({"source_url": source.get("url"), "source_date": source.get("sourceDate")})
        if date.fromisoformat(day) > today:
            raise ValueError("Published result has a future source date")
    return snapshot


class CommittedReleaseContract(unittest.TestCase):
    def test_actual_committed_release_assets(self):
        manifest = ROOT/"assets/history-2026-availability.json"
        result = ROOT/"assets/history-2026.json"
        if check_release_pair(manifest, result) is None:
            return
        # Use the same browser gate, including the byte checksum and audited roster.
        script = """
const fs=require('node:fs'),{webcrypto}=require('node:crypto');
const C=require('./history-core.js');
const raw=fs.readFileSync('assets/election-2026.js','utf8').trim();
const directory=JSON.parse(raw.slice('window.ELECTION_2026_DATA='.length,-1));
C.decodeOfficial2026(fs.readFileSync(process.argv[1]),JSON.parse(fs.readFileSync(process.argv[2],'utf8')),directory,webcrypto)
 .catch(e=>{console.error(e);process.exitCode=1});
"""
        subprocess.run(["node","-e",script,str(result),str(manifest)],cwd=ROOT,check=True)

    def test_release_pair_rejects_orphan_missing_and_changed_files(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            m, r = p/"manifest.json", p/"result.json"
            waiting = {"schemaVersion":1,"year":2026,"status":"awaiting_results"}
            B.save(waiting,m)
            self.assertIsNone(check_release_pair(m,r,date(2026,11,27)))
            B.save({},r)
            with self.assertRaisesRegex(ValueError,"Awaiting"):
                check_release_pair(m,r,date(2026,11,27))
            r.unlink()
            published = {**waiting,"status":"published","resultStatus":"provisional","file":"assets/history-2026.json",
                         "candidateCount":2049,"districtCount":447}
            B.save(published,m)
            with self.assertRaisesRegex(ValueError,"matching result file"):
                check_release_pair(m,r,date(2026,11,28))
            B.save({},r)
            with self.assertRaisesRegex(ValueError,"predates"):
                check_release_pair(m,r,date(2026,11,27))
            with self.assertRaisesRegex(ValueError,"checksum"):
                check_release_pair(m,r,date(2026,11,28))
            snapshot = {"publicationStatus":"provisional","completeness":"full",
                        "provenance":{"officialWinnerMarksOnly":True,"sourceLinks":[{"url":"https://web.cec.gov.tw/central","sourceDate":"2026-11-28"}]}}
            B.save(snapshot,r)
            published["sha256"] = hashlib.sha256(r.read_bytes()).hexdigest()
            B.save(published,m)
            self.assertEqual(check_release_pair(m,r,date(2026,11,28)),snapshot)
            snapshot["provenance"]["sourceLinks"][0]["sourceDate"]="2026-11-29"
            B.save(snapshot,r)
            published["sha256"] = hashlib.sha256(r.read_bytes()).hexdigest()
            B.save(published,m)
            with self.assertRaisesRegex(ValueError,"future source date"):
                check_release_pair(m,r,date(2026,11,28))
            snapshot["provenance"]["sourceLinks"]=[]
            B.save(snapshot,r)
            published["sha256"] = hashlib.sha256(r.read_bytes()).hexdigest()
            B.save(published,m)
            with self.assertRaisesRegex(ValueError,"source provenance"):
                check_release_pair(m,r,date(2026,11,28))


class OfficialResultContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory=B.load_directory()
        cls.raw=[{"candidate_id":c["id"],"number":str(c["number"]),"votes":"100",
                  "elected":"0","source_url":"https://web.cec.gov.tw/central",
                  "source_date":"2026-11-28"} for c in cls.directory["candidates"]]
        winners={cid for d in cls.directory["districts"] for cid in d["candidateIds"][:int(d.get("seats") or 1)]}
        for row in cls.raw:
            if row["candidate_id"] in winners:row["elected"]="1"

    def test_full_roster_python_to_browser_contract(self):
        snapshot,report=B.prepare(self.directory,self.raw)
        self.assertTrue(report["readyToPublish"],report["issues"])
        self.assertEqual(report["coveredCandidates"],2049)
        self.assertEqual(report["coveredDistricts"],447)
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/"result.json"
            B.save(snapshot,p)
            manifest={"schemaVersion":1,"year":2026,"status":"published","resultStatus":"provisional",
                      "file":"assets/history-2026.json","sha256":hashlib.sha256(p.read_bytes()).hexdigest(),
                      "candidateCount":2049,"districtCount":447}
            m=Path(directory)/"manifest.json";B.save(manifest,m)
            script="""
const fs=require('node:fs'),{webcrypto}=require('node:crypto');
const C=require('./history-core.js');
const raw=fs.readFileSync('assets/election-2026.js','utf8').trim();
const directory=JSON.parse(raw.slice('window.ELECTION_2026_DATA='.length,-1));
const manifest=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
C.decodeOfficial2026(fs.readFileSync(process.argv[1]),manifest,directory,webcrypto).then(s=>{
 if(s.candidacies.length!==2049||s.contests.length!==447)throw Error('wrong size');
}).catch(e=>{console.error(e);process.exitCode=1});
"""
            subprocess.run(["node","-e",script,str(p),str(m)],cwd=ROOT,check=True)

    def test_partial_turnout_cannot_bypass_vote_reconciliation(self):
        d=self.directory["districts"][0]
        total=len(d["candidateIds"])*100
        def turnout(**fields):
            return [{"district_id":d["id"],"source_url":"https://web.cec.gov.tw/central",
                     "source_date":"2026-11-28",**fields}]
        for fields in ({"registered_voters":total-1},{"ballots_cast":total-1},
                       {"ballots_cast":total+5,"invalid_votes":6}):
            _,report=B.prepare(self.directory,self.raw,turnout_raw=turnout(**fields))
            self.assertFalse(report["readyToPublish"])
        snapshot,report=B.prepare(self.directory,self.raw,turnout_raw=turnout(ballots_cast=total+5,invalid_votes=5))
        self.assertTrue(report["readyToPublish"],report["issues"])
        contest=next(c for c in snapshot["contests"] if c["contest_id"]==d["id"])
        self.assertEqual(contest["valid_votes"],total)

    def test_publication_guards(self):
        snapshot={"provenance":{"sourceLinks":[{"sourceDate":"2026-11-28"}]}}
        report={"readyToPublish":True}
        with self.assertRaises(ValueError):B.verify_publication(snapshot,report,"provisional",date(2026,11,27))
        with self.assertRaises(ValueError):B.verify_publication(snapshot,report,"certified",date(2026,12,3))
        B.verify_publication(snapshot,report,"provisional",date(2026,11,28))
        with self.assertRaises(ValueError):B.verify_publication(snapshot,report,"provisional",date(2026,12,4),{"status":"published","resultStatus":"certified"})
        future=copy.deepcopy(snapshot);future["provenance"]["sourceLinks"][0]["sourceDate"]="2026-12-05"
        with self.assertRaises(ValueError):B.verify_publication(future,report,"provisional",date(2026,12,4))

    def test_staging_cannot_overwrite_site_assets_or_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)
            args=SimpleNamespace(report=p/"report.json",staged_output=p/"staged.json",template=None,
                                 results=p/"input.csv",town_votes=None,turnout=None,town_turnout=None)
            B.protect_outputs(args)
            args.staged_output=ROOT/"assets/history-2026.json"
            with self.assertRaises(ValueError):B.protect_outputs(args)
            args.staged_output=args.results
            with self.assertRaises(ValueError):B.protect_outputs(args)

if __name__=="__main__":unittest.main()
