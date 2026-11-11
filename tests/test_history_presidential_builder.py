"""Offline checks for presidential result collection, national reconciliation and source safety."""
import importlib.util
from pathlib import Path
from unittest import TestCase, mock

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "build_history_presidential.py"
spec=importlib.util.spec_from_file_location("presidential_builder",MODULE_PATH)
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class PresidentialBuilderTests(TestCase):
    def test_years_and_counties_are_complete(self):
        html="<html>"+ "".join(
            f'<a href="/data/csv/總統_{year}_{i}.csv">x</a>'
            for year in builder.YEARS
            for i in range(builder.EXPECTED_COUNTIES[year])
        )+"</html>"
        listing=builder.source_listing(html.encode())
        self.assertEqual(sum(map(len,listing.values())),188)
        self.assertEqual(list(listing),list(builder.YEARS))
        with self.assertRaisesRegex(ValueError,"incomplete|expected"):
            builder.source_listing(html.replace("總統_1996_0.csv","not-a-vote.csv").encode())

    def test_reject_incomplete_and_mismatched_csv(self):
        with self.assertRaisesRegex(ValueError,"missing necessary"):
            builder.read_csv("候選人,票數\n甲,2".encode(),"臺北市")
        data="縣市,鄉鎮市區,候選人,政黨,得票數\n新北市,淡水區,甲,無,10\n"
        with self.assertRaisesRegex(ValueError,"differs"):
            builder.read_csv(data.encode(),"臺北市")
        with self.assertRaisesRegex(ValueError,"non-integer"):
            builder.read_csv(data.replace(",10",",-1").replace("新北市","臺北市").encode(),"臺北市")

    def test_country_and_town_level_votes_are_not_double_counted(self):
        fixture={}
        for i in range(2):
            county=f"測試縣{i}"
            entries=[]
            for t in range(150):
                town=f"第{t}鄉"
                for number,name,party,votes in [
                    ("1","賴清德","民主進步黨",10),
                    ("2","侯友宜","中國國民黨",6),
                    ("3","柯文哲","台灣民眾黨",2),
                ]:
                    entries.append({"縣市":county,"鄉鎮市區":town,"候選人":name,
                                    "政黨":party,"號次":number,"得票數":str(votes),
                                    "當選註記":"＊" if name=="賴清德" else ""})
            fixture[county]=entries
        with (mock.patch.dict(builder.EXPECTED_COUNTIES,{2024:2}),
              mock.patch.dict(builder.OFFICIAL_VALID,{2024:(5400,)}),
              mock.patch.dict(builder.NATIONAL_STATS,{2024:(6000,5600,200)})):
            result=builder.make_snapshot(2024,fixture)
        self.assertEqual(len(result["contests"]),2)
        self.assertEqual(len(result["candidacies"]),6)
        self.assertEqual(len([r for r in result["rows"] if r["level"]=="town"]),900)
        self.assertEqual(len([r for r in result["rows"] if r["level"]=="county"]),6)
        self.assertEqual(result["national"]["valid_votes"],5400)
        self.assertEqual(sum(r["votes"] for r in result["rows"] if r["level"]=="county"),5400)
        self.assertEqual(sum(r["votes"] for r in result["rows"] if r["level"]=="town"),5400)
        self.assertEqual(sum(r["elected_official"] for r in result["candidacies"]),2)
        self.assertEqual(len([x for x in result["national"]["candidate_totals"] if x["elected"]]),1)

    def test_does_not_infer_winner_from_local_vote_tally(self):
        self.assertEqual(builder.WINNER_NAMES[2000],"陳水扁")
        self.assertEqual(builder.winner_marker({"當選註記":"？"}),"?")
        self.assertEqual(builder.winner_marker({"當選註記":"！"}),"!")
        self.assertEqual(builder.winner_marker({"當選註記":"＊"}),"*")
