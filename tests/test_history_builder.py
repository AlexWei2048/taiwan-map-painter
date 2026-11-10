import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "build_history_2022.py"
SPEC = importlib.util.spec_from_file_location("history_builder", SCRIPT)
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


class HistoryBuilderTests(unittest.TestCase):
    def test_official_marker_preserves_women_priority_and_uncertain_results(self):
        self.assertEqual(builder.official_marker({"當選註記": "＊", "備註": ""}), "*")
        self.assertEqual(builder.official_marker({"當選註記": "！", "備註": ""}), "!")
        self.assertEqual(builder.official_marker({"當選註記": "？", "備註": ""}), "?")
        self.assertEqual(builder.official_marker({"當選註記": "", "備註": "婦保"}), "!")
        self.assertEqual(builder.official_marker({"當選註記": "", "備註": ""}), "")

    def test_atomic_publish_does_not_replace_valid_snapshot_when_validation_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "history.json"
            output.write_text('{"stable":true}', encoding="utf-8")
            invalid = {"schemaVersion": 2, "elections": [], "contests": [], "candidacies": [],
                       "rows": [], "provenance": {"schemaVersion": 2, "files": []}}
            with self.assertRaises(ValueError):
                builder.validate_snapshot(invalid)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8")), {"stable": True})

    def test_atomic_writer_replaces_only_after_serialization_succeeds(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "history.json"
            output.write_text('{"old":true}', encoding="utf-8")
            builder.write_snapshot_atomic({"new": True}, output)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8")), {"new": True})
            self.assertFalse(output.with_suffix(".json.tmp").exists())


if __name__ == "__main__":
    unittest.main()
