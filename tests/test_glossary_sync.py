"""Pinning, invalid remote data and offline fallback regression tests."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from services.fixed_glossary import load_fixed_glossary
from services.fixed_glossary.sync import latest_remote, pin_glossary, project_glossary

DATA = {"talents": [], "others": [{"jp": ["漫才"], "zh": "漫才"}]}


class GlossarySyncTests(unittest.TestCase):
    def test_workflow_binds_snapshot_for_all_stages(self):
        from types import SimpleNamespace
        from workflow.api import _process_project_impl, WorkflowOptions

        with tempfile.TemporaryDirectory() as directory:
            project = SimpleNamespace(project_path=Path(directory))

            def observe(*args):
                self.assertEqual(load_fixed_glossary().others[0][1], "漫才")

            with (
                patch("workflow.api.Project.from_source_str", return_value=project),
                patch("workflow.api._process_project_pinned", side_effect=observe),
                patch("workflow.api.settings.glossary_remote_repo", "test/glossary"),
                patch(
                    "services.fixed_glossary.sync.latest_remote",
                    return_value=(json.dumps(DATA).encode(), "a" * 40),
                ),
            ):
                _process_project_impl("demo", WorkflowOptions())
            self.assertTrue((project.project_path / ".glossary/snapshot.json").exists())

    def test_pinned_revision_is_reused_even_when_remote_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch(
                "services.fixed_glossary.sync.latest_remote",
                return_value=(json.dumps(DATA).encode(), "a" * 40),
            ) as remote:
                with project_glossary(root, repo="test/glossary"):
                    self.assertEqual(load_fixed_glossary().others[0][1], "漫才")
                with project_glossary(root, repo="test/glossary"):
                    self.assertEqual(load_fixed_glossary().others[0][1], "漫才")
                self.assertEqual(remote.call_count, 1)

    def test_tampered_snapshot_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            snapshot = pin_glossary(Path(directory))
            value = json.loads(snapshot.read_text())
            value["data"]["others"].append({"jp": ["BAD"], "zh": "錯"})
            snapshot.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, "校驗失敗"):
                pin_glossary(Path(directory))

    def test_invalid_update_preserves_cached_version(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            with patch(
                "services.fixed_glossary.sync._download",
                side_effect=[
                    json.dumps({"sha": "a" * 40}).encode(),
                    json.dumps(DATA).encode(),
                ],
            ):
                latest_remote("test/glossary", "main", cache)
            with patch(
                "services.fixed_glossary.sync._download",
                side_effect=[json.dumps({"sha": "b" * 40}).encode(), b'{"oops":true}'],
            ):
                raw, rev = latest_remote("test/glossary", "main", cache)
            self.assertEqual(rev, "a" * 40)
            self.assertEqual(json.loads(raw), DATA)

    def test_legacy_prepass_does_not_silently_adopt_remote(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".pre_pass").mkdir()
            (root / ".pre_pass/pre_pass.json").write_text("{}")
            with patch("services.fixed_glossary.sync.latest_remote") as remote:
                pin_glossary(root, repo="test/glossary")
                remote.assert_not_called()
