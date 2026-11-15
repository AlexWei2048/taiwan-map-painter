"""Official 2026 audit: identity, source validation, and non-mutation tests."""
import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("audit_2026_official",ROOT/"scripts/audit_2026_official.py")
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

def fixture():
    return {
      "year":2026,"asOf":"2026-10-29",
      "candidates":[
        {"id":"mayor:01:1","districtId":"mayor:01","county":"台北市","type":"mayor",
         "nameOriginal":"甲君","name":"甲君","number":1,"party":"中国国民党","gender":"男"},
        {"id":"mayor:01:2","districtId":"mayor:01","county":"台北市","type":"mayor",
         "nameOriginal":"乙君","name":"乙君","number":"待补","party":"民主进步党","gender":"女"}
      ],
      "districts":[{"id":"mayor:01","type":"mayor","candidateIds":["mayor:01:1","mayor:01:2"]}]
    }

class OfficialAuditTests(unittest.TestCase):
    def test_local_directory_and_numbers(self):
        check=audit.analyze_directory(fixture())
        self.assertEqual(check["errors"],[])
        self.assertEqual(check["summary"]["mayor"]["pending_numbers"],1)
        data=fixture()
        data["candidates"][1]["number"]=1
        self.assertIn("duplicate-number:mayor:01",audit.analyze_directory(data)["errors"])

    def test_official_roster_diffs_only_confident_exact_matches(self):
        data=fixture()
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/"official.csv"
            with p.open("w",encoding="utf-8",newline="") as h:
                w=csv.DictWriter(h,fieldnames=["type","county","districtId","name","number","party","gender","eligible","source_url","source_date"])
                w.writeheader()
                common=dict(type="mayor",county="台北市",districtId="mayor:01",
                    source_url="https://web.cec.gov.tw/central/article/65212",source_date="2026-10-16")
                w.writerow(dict(common,name="甲君",number="1",party="中国国民党",gender="男",eligible="yes"))
                w.writerow(dict(common,name="乙君",number="2",party="民主进步党",gender="女",eligible="yes"))
                w.writerow(dict(common,name="丙君",number="3",party="",gender="",eligible="yes"))
            before=json.dumps(data,sort_keys=True,ensure_ascii=False)
            report=audit.parse_official_csv(p,data)
            self.assertEqual(report["totals"],dict(matched=1,difference=1,missing_or_changed_identity=1,ambiguous=0))
            self.assertEqual(report["rows"][1]["differences"][0]["field"],"number")
            self.assertFalse(report["autoApplied"])
            self.assertEqual(json.dumps(data,sort_keys=True,ensure_ascii=False),before)

    def test_untrusted_sources_are_rejected(self):
        self.assertTrue(audit.trusted_source("https://web.cec.gov.tw/central/article/65212"))
        self.assertFalse(audit.trusted_source("https://cec.gov.tw.evil.example/"))
        self.assertFalse(audit.trusted_source("http://web.cec.gov.tw/central"))
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/"off.csv"
            p.write_text("type,county,districtId,name,source_url,source_date\n"
                "mayor,台北市,mayor:01,甲君,https://example.com/roster,2026-11-12\n",encoding="utf-8")
            with self.assertRaisesRegex(ValueError,"official source"):
                audit.parse_official_csv(p,fixture())

    def test_publication_change_and_fetch_failure(self):
        registry={"sources":[{"id":"official","url":"https://web.cec.gov.tw/central"}]}
        old=audit.monitor(registry,fetcher=lambda _: '<a href="/foo">候選人公告甲</a><p>115年資格完成</p>')
        recent=audit.monitor(registry,old,fetcher=lambda _: '<a href="/foo">候選人公告乙</a><p>115年資格完成</p>')
        self.assertEqual(recent["changed"],["official"])
        self.assertEqual(audit.monitor(registry,old,fetcher=lambda _: (_ for _ in ()).throw(OSError("offline")))["errors"],["official"])
        self.assertFalse(recent["automaticallyUpdatedCandidates"])

if __name__=="__main__":
    unittest.main()
