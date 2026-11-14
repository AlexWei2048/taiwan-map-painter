import importlib.util
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "scripts" / "build_history_legislative.py"


def load_module():
    spec = importlib.util.spec_from_file_location("history_legislative_builder", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_years_cover_every_regular_election_from_1992_to_2024():
    module = load_module()
    assert module.YEARS == (1992, 1995, 1998, 2001, 2004, 2008, 2012, 2016, 2020, 2024)


def test_pre_2008_list_votes_are_derived_and_not_called_party_ballots():
    module = load_module()
    meta = module.ballot_metadata(2004, "party")
    assert meta["label"] == "不分区席次计算票"
    assert meta["is_separate_ballot"] is False
    assert "区域及原住民" in meta["note"]


def test_post_2008_party_votes_are_separate_ballots():
    module = load_module()
    meta = module.ballot_metadata(2008, "party")
    assert meta["label"] == "不分区政党票"
    assert meta["is_separate_ballot"] is True


def test_aggregate_rows_preserves_elected_marker_and_three_levels():
    module = load_module()
    rows = [
        {"縣市":"臺北市","鄉鎮市區":"士林區","村里":"仁勇里","選區":"臺北市第1選舉區","號次":"1","候選人":"甲","政黨":"中國國民黨","得票數":"10","當選註記":"＊"},
        {"縣市":"臺北市","鄉鎮市區":"士林區","村里":"義信里","選區":"臺北市第1選舉區","號次":"1","候選人":"甲","政黨":"中國國民黨","得票數":"12","當選註記":"＊"},
        {"縣市":"臺北市","鄉鎮市區":"士林區","村里":"仁勇里","選區":"臺北市第1選舉區","號次":"2","候選人":"乙","政黨":"民主進步黨","得票數":"9","當選註記":""},
    ]
    result = module.aggregate_candidate_rows(rows, "regional")
    levels = {row["level"] for row in result}
    assert levels == {"national", "county", "town", "district"}
    national = next(row for row in result if row["level"] == "national" and row["candidate"] == "甲")
    assert national["votes"] == 22
    assert national["elected"] is True


def test_snapshot_exposes_party_totals_as_a_filterable_contest():
    module = load_module()
    source = {"regional": [], "plains": [], "mountain": [], "party": [
        {"縣市":"臺北市","鄉鎮市區":"士林區","政黨":"甲黨","得票數":"20"},
        {"縣市":"金門縣","鄉鎮市區":"金城鎮","政黨":"甲黨","得票數":"3"},
        {"縣市":"臺北市","鄉鎮市區":"士林區","政黨":"乙黨","得票數":"10"},
    ]}
    snapshot = module.make_snapshot(2024, source)
    contest = next(item for item in snapshot["contests"] if item["electorate"] == "party")
    candidates = [item for item in snapshot["candidacies"] if item["contest_id"] == contest["contest_id"]]
    assert {item["party_name"]: item["votes"] for item in candidates} == {"甲党": 23, "乙党": 10}


def test_indigenous_candidates_form_one_nationwide_contest_not_one_per_county():
    module = load_module()
    source = {"regional": [], "mountain": [], "party": [], "plains": [
        {"縣市":"臺北市","鄉鎮市區":"士林區","選區":"平地原住民","號次":"1","候選人":"甲","政黨":"甲黨","得票數":"20","當選註記":"＊"},
        {"縣市":"花蓮縣","鄉鎮市區":"花蓮市","選區":"平地原住民","號次":"1","候選人":"甲","政黨":"甲黨","得票數":"30","當選註記":"＊"},
    ]}
    snapshot = module.make_snapshot(2004, source)
    contests = [item for item in snapshot["contests"] if item["electorate"] == "plains"]
    assert len(contests) == 1
    assert contests[0]["valid_votes"] == 50
    assert contests[0]["seats"] == 1

