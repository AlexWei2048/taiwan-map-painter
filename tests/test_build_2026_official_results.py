import sys,unittest
from pathlib import Path
from datetime import date
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from build_2026_official_results import prepare,make_template,number,winner,official
URL="https://web.cec.gov.tw/central/article/65213"
DAY="2026-11-28"
def source(c,v,e):
 return dict(candidate_id=c,number="1" if c=="a" else "2",votes=str(v),elected=e,source_url=URL,source_date=DAY)
def fixture():
 return {"candidates":[{"id":"a","nameOriginal":"甲","type":"mayor","districtId":"mayor:a","county":"台北市","party":"甲党","number":1,"gender":"女"},
          {"id":"b","nameOriginal":"乙","type":"mayor","districtId":"mayor:a","county":"台北市","party":"乙党","number":2,"gender":"男"}],
        "districts":[{"id":"mayor:a","type":"mayor","county":"台北市","name":"台北市","seats":1,
          "womenReserved":0,"candidateIds":["a","b"]}]}
class ImportTests(unittest.TestCase):
 def test_valid_official_votes_builds_concise_history_snapshot(self):
  snap,audit=prepare(fixture(),[source("a",15,"1"),source("b",10,"0")])
  self.assertEqual(audit["issues"],[])
  self.assertEqual(len(snap["contests"]),1)
  self.assertEqual(snap["contests"][0]["valid_votes"],25)
  self.assertEqual(snap["candidacies"][0]["vote_share"],60)
  self.assertEqual(sum(r["elected"] for r in snap["rows"]),1)
  self.assertFalse(audit["readyToPublish"],"Synthetic fixture must not be mistaken for complete 2051-person archive")
 def test_missing_winner_does_not_infer_from_votes(self):
  snap,audit=prepare(fixture(),[source("a",15,""),source("b",10,"0")])
  self.assertFalse(audit["readyToPublish"])
  self.assertTrue(any("winner" in s for s in audit["warnings"]))
 def test_bad_numbers_and_winner_count(self):
  bad=[source("a",15,"1"),source("b",10,"1")]
  self.assertTrue(any("winners" in x for x in prepare(fixture(),bad)[1]["issues"]))
  bad[1]["number"]="1"
  self.assertTrue(any("ballot" in x for x in prepare(fixture(),bad)[1]["issues"]))
 def test_town_results_reconcile_without_inventing_votes(self):
  raw=[source("a",15,"1"),source("b",10,"0")]
  rows=[dict(candidate_id=cid,county="台北市",town="中正区",votes=str(v),source_url=URL,source_date=DAY)
      for cid,v in (("a",15),("b",10))]
  snap,audit=prepare(fixture(),raw,rows)
  self.assertFalse(audit["issues"])
  self.assertEqual(len([r for r in snap["rows"] if r["level"]=="town"]),2)
  rows[0]["votes"]="14"
  self.assertTrue(any("reconcile" in x for x in prepare(fixture(),raw,rows)[1]["issues"]))
 def test_official_turnout_is_validated_and_blank_not_zero(self):
  raw=[source("a",15,"1"),source("b",10,"0")]
  t=[dict(district_id="mayor:a",registered_voters="30",ballots_cast="26",valid_votes="25",invalid_votes="1",source_url=URL,source_date=DAY)]
  snap,audit=prepare(fixture(),raw,turnout_raw=t)
  self.assertFalse(audit["issues"])
  self.assertEqual(snap["contests"][0]["invalid_votes"],1)
  t[0]["valid_votes"]="24"
  self.assertTrue(any("candidate vote" in x for x in prepare(fixture(),raw,turnout_raw=t)[1]["issues"]))
 def test_no_pre_election_or_non_official_sources(self):
  with self.assertRaisesRegex(ValueError,"predates"):official(dict(source_url=URL,source_date="2026-11-17"))
  with self.assertRaisesRegex(ValueError,"official"):official(dict(source_url="https://example.org",source_date=DAY))
  self.assertEqual(winner(""),None)
 def test_template_keeps_ids_but_has_no_fabricated_votes(self):
  import csv,tempfile
  with tempfile.TemporaryDirectory() as tmp:
   target=Path(tmp)/"template.csv";make_template(fixture(),target)
   rows=list(csv.DictReader(target.open(encoding="utf-8-sig")))
   self.assertEqual([r["candidate_id"] for r in rows],["a","b"])
   self.assertTrue(all(not r["votes"] and not r["elected"] and not r["number"] for r in rows))
if __name__=="__main__":unittest.main()
