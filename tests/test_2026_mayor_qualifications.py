import sys,unittest,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from audit_2026_mayor_qualifications import check,canon
class TestMayorNames(unittest.TestCase):
 def setUp(self):
  self.ref={"decisionDate":"2026-10-16","sourceUrl":"https://web.cec.gov.tw/central/article/65213",
     "officialCount":2,"officialNationwideMayorTotal":2,"counties":[{"county":"台北市","names":["蔣萬安","郭璽"]}]}
  self.data={"candidates":[{"type":"mayor","county":"台北市","nameOriginal":"蔣萬安","id":"a"},
      {"type":"mayor","county":"台北市","nameOriginal":"郭璽","id":"b"}]}
 def test_matches_official_name_and_count(self):
  self.assertTrue(check(self.data,self.ref)["passed"])
  self.assertEqual(canon("臺北市"),"台北市")
 def test_rejects_missing_duplicate_or_wrong_count(self):
  self.data["candidates"][1]["nameOriginal"]="未知人士"
  self.assertFalse(check(self.data,self.ref)["passed"])
  self.data["candidates"][1]["nameOriginal"]="蔣萬安"
  self.assertFalse(check(self.data,self.ref)["passed"])
 def test_source_has_all_23_official_names(self):
  source=json.loads((ROOT/"sources/election-2026/official-mayors-20261016.json").read_text())
  self.assertEqual([len(c["names"]) for c in source["counties"]],[6,3,2,3,4,5])
  self.assertEqual(len({n for c in source["counties"] for n in c["names"]}),23)
  counties=json.loads((ROOT/"sources/election-2026/official-county-mayors-20261016.json").read_text())
  self.assertEqual(len(counties["counties"]),16)
  self.assertEqual(sum(len(c["names"]) for c in counties["counties"]),58)
  self.assertEqual(source["officialCount"]+counties["officialCount"],81)
if __name__=="__main__":unittest.main()
