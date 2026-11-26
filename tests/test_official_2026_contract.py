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
