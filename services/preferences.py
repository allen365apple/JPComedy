"""Portable presentation defaults with optional untracked local overrides."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_preferences(section: str) -> dict:
    """Load committed defaults, then override one section from a local file."""
    result = json.loads((ROOT / "preferences.json").read_text("utf-8"))[section]
    local = ROOT / "preferences.local.json"
    if local.exists():
        result.update(json.loads(local.read_text("utf-8")).get(section, {}))
    return result
