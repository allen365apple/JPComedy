"""Regression: even brief lower captions must trigger subtitle avoidance."""

from pathlib import Path
import tempfile
import unittest
from services.subtitle_burnin import write_dynamic_black_box_ass


class DynamicSubtitleTests(unittest.TestCase):
    def test_partial_overlap_and_default_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            srt = root / "source.srt"
            srt.write_text(
                "1\n00:00:00,000 --> 00:00:10,000\n測試字幕\n\n2\n00:00:12,000 --> 00:00:13,000\n下一句\n",
                encoding="utf-8",
            )
            out = write_dynamic_black_box_ass(
                srt, root / "out.ass", [(9, 11)]
            ).read_text("utf-8")
            lines = [line for line in out.splitlines() if line.startswith("Dialogue:")]
            self.assertIn(",Above,", lines[0])
            self.assertIn(",Bottom,", lines[1])
            self.assertIn("Noto Sans CJK TC,117,", out)
            self.assertIn("WrapStyle: 0", out)

    def test_existing_different_file_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            srt = root / "source.srt"
            srt.write_text("1\n00:00:00,000 --> 00:00:01,000\n文字\n", encoding="utf-8")
            target = root / "out.ass"
            target.write_text("keep")
            with self.assertRaises(FileExistsError):
                write_dynamic_black_box_ass(srt, target, [])
            self.assertEqual(target.read_text(), "keep")
