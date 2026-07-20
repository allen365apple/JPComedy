import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from glossary_ui.server import (
    GlossaryValidationError,
    match_saved_glossary,
    save_glossary,
    validate_glossary_payload,
)


class ValidateGlossaryPayloadTests(unittest.TestCase):
    def test_normalizes_valid_payload_and_preserves_archive_and_note(self):
        payload = {
            "talents": [
                {
                    "group": {"jp": [" エバース ", "エバース"], "zh": " Evers "},
                    "members": [
                        {"jp": ["佐々木隆史"], "zh": "佐佐木隆史", "note": " 成員 "}
                    ],
                    "disabled": True,
                }
            ],
            "others": [
                {"jp": ["ボケ"], "zh": "裝傻", "disabled": True}
            ],
        }
        result = validate_glossary_payload(payload)
        self.assertEqual(result["talents"][0]["group"]["jp"], ["エバース"])
        self.assertEqual(result["talents"][0]["group"]["zh"], "Evers")
        self.assertEqual(result["talents"][0]["members"][0]["note"], "成員")
        self.assertTrue(result["talents"][0]["disabled"])
        self.assertTrue(result["others"][0]["disabled"])

    def test_rejects_blank_alias_and_missing_member(self):
        with self.assertRaises(GlossaryValidationError):
            validate_glossary_payload(
                {"talents": [{"group": None, "members": []}], "others": []}
            )
        with self.assertRaises(GlossaryValidationError):
            validate_glossary_payload(
                {"talents": [], "others": [{"jp": ["  "], "zh": "裝傻"}]}
            )

    def test_omits_empty_group_for_solo_talent(self):
        result = validate_glossary_payload(
            {
                "talents": [
                    {"group": None, "members": [{"jp": ["友近"], "zh": "友近"}]}
                ],
                "others": [],
            }
        )
        self.assertNotIn("group", result["talents"][0])


class SaveGlossaryTests(unittest.TestCase):
    def test_save_creates_backup_and_updates_glossary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            glossary = root / "fixed_glossary.json"
            backups = root / "backups"
            original = {"talents": [], "others": [{"jp": ["旧"], "zh": "舊"}]}
            glossary.write_text(json.dumps(original), encoding="utf-8")
            updated = {"talents": [], "others": [{"jp": ["新"], "zh": "新"}]}
            with (
                patch("glossary_ui.server.GLOSSARY_PATH", glossary),
                patch("glossary_ui.server.BACKUP_DIR", backups),
            ):
                saved, backup = save_glossary(updated)
            self.assertEqual(saved, updated)
            self.assertIsNotNone(backup)
            self.assertEqual(json.loads(backup.read_text()), original)
            self.assertEqual(json.loads(glossary.read_text()), updated)
            self.assertIn('\t\t\t"jp": ["新"]', glossary.read_text())


class MatchGlossaryTests(unittest.TestCase):
    def test_match_uses_production_filter(self):
        with tempfile.TemporaryDirectory() as directory:
            glossary = Path(directory) / "fixed_glossary.json"
            glossary.write_text(
                json.dumps(
                    {
                        "talents": [
                            {
                                "group": {"jp": ["エバース"], "zh": "Evers"},
                                "members": [{"jp": ["佐々木隆史"], "zh": "佐佐木隆史"}],
                            }
                        ],
                        "others": [],
                    }
                ),
                encoding="utf-8",
            )
            with patch("glossary_ui.server.GLOSSARY_PATH", glossary):
                with patch("glossary_ui.server.load_fixed_glossary") as loader:
                    from services.fixed_glossary import load_fixed_glossary

                    loader.return_value = load_fixed_glossary(glossary)
                    result = match_saved_glossary("次はエバースです")
            self.assertEqual(result["talents"][0]["group"]["zh"], "Evers")


if __name__ == "__main__":
    unittest.main()
