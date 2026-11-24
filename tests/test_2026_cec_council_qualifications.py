import sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from audit_2026_cec_council_qualifications import inspect,CEC_EXCLUDED_IDS,OFFICIAL_ACCEPTED
class CouncilQualificationTests(unittest.TestCase):
 def source(self):
  return {"candidates":
   ([dict(type="council",county="台北市",id="city:"+str(i)) for i in range(605)]+
    [dict(type="council",county="基隆市",id="county:"+str(i)) for i in range(887)]),
   "excluded":[dict(type="council",candidateId=cid) for cid in CEC_EXCLUDED_IDS]}
 def test_accepted_total_and_all_ten_disqualified(self):
  result=inspect(self.source())
  self.assertTrue(result["passed"]);self.assertEqual(result["included"],1492)
  self.assertEqual(result["scopes"],OFFICIAL_ACCEPTED)
 def test_disqualified_still_included_rejected(self):
  data=self.source();data["candidates"][0]["id"]=next(iter(CEC_EXCLUDED_IDS))
  self.assertFalse(inspect(data)["passed"])
 def test_missing_exclusion_is_rejected(self):
  data=self.source();data["excluded"].pop()
  self.assertFalse(inspect(data)["passed"])
 def test_court_reinstatement_requires_final_roster_evidence(self):
  from audit_2026_cec_council_qualifications import REINSTATED_ID,REINSTATED_SOURCE
  data=self.source();data["excluded"]=[x for x in data["excluded"] if x["candidateId"]!=REINSTATED_ID]
  row=dict(type="council",county="花莲县",id=REINSTATED_ID,number=3,officialFinalRoster={"sourceUrl":REINSTATED_SOURCE})
  data["candidates"].append(row);result=inspect(data)
  self.assertTrue(result["passed"]);self.assertEqual(result["included"],1493);self.assertEqual(result["reinstated"],1)
  row.pop("officialFinalRoster");self.assertFalse(inspect(data)["passed"])
if __name__=="__main__":unittest.main()
