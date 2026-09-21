"""Validate remote updates and pin one glossary snapshot for each project."""

import hashlib
import json
import re
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from urllib.request import Request, urlopen

from loguru import logger

from .fixed_glossary import ACTIVE_GLOSSARY_PATH, FIXED_GLOSSARY_PATH

MAX_BYTES = 2_000_000


def validate_bytes(raw: bytes) -> dict:
    """Reject a malformed download instead of silently dropping bad entries."""
    from glossary_ui.server import validate_glossary_payload

    if len(raw) > MAX_BYTES:
        raise ValueError("詞庫檔案過大")
    return validate_glossary_payload(json.loads(raw.decode("utf-8-sig")))


def _download(url: str) -> bytes:
    request = Request(
        url, headers={"User-Agent": "JPComedy-glossary", "Cache-Control": "no-cache"}
    )
    with urlopen(request, timeout=8) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("詞庫下載超過大小上限")
    return raw


def latest_remote(repo: str, branch: str, cache_dir: Path) -> tuple[bytes, str]:
    """Resolve HEAD then download by immutable commit; keep last valid cache."""
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        raise ValueError("詞庫 repository 格式應為 owner/name")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", branch):
        raise ValueError("詞庫分支名稱不合法")
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache = cache_dir / (
        hashlib.sha256(f"{repo}/{branch}".encode()).hexdigest() + ".json"
    )
    try:
        meta = json.loads(
            _download(f"https://api.github.com/repos/{repo}/commits/{branch}")
        )
        revision = meta["sha"]
        if not re.fullmatch(r"[0-9a-f]{40}", revision):
            raise ValueError("詞庫版本不是有效 commit")
        if cache.exists():
            saved = json.loads(cache.read_text("utf-8"))
            if saved["revision"] == revision:
                raw = json.dumps(saved["data"], ensure_ascii=False).encode()
                validate_bytes(raw)
                return raw, revision
        raw = _download(
            f"https://raw.githubusercontent.com/{repo}/{revision}/glossary.json"
        )
        data = validate_bytes(raw)
        cache.write_text(
            json.dumps({"revision": revision, "data": data}, ensure_ascii=False),
            "utf-8",
        )
        return json.dumps(data, ensure_ascii=False).encode(), revision
    except (OSError, ValueError, KeyError, TypeError):
        if not cache.exists():
            raise
        saved = json.loads(cache.read_text("utf-8"))
        raw = json.dumps(saved["data"], ensure_ascii=False).encode()
        validate_bytes(raw)
        logger.warning("無法更新共享詞庫，沿用最近一次有效快取")
        return raw, saved["revision"]


def pin_glossary(
    project_dir: Path,
    *,
    repo: str = "",
    branch: str = "main",
    cache_dir: Path | None = None,
) -> Path:
    """Save source, version, checksum and data together in a resumable snapshot."""
    snapshot = project_dir / ".glossary" / "snapshot.json"
    if snapshot.exists():
        saved = json.loads(snapshot.read_text("utf-8"))
        raw = json.dumps(saved["data"], ensure_ascii=False, sort_keys=True).encode()
        if hashlib.sha256(raw).hexdigest() != saved["sha256"]:
            raise ValueError("詞庫快照校驗失敗，請檢查 snapshot.json；不會自動換版本")
        validate_bytes(raw)
        return snapshot
    legacy = (project_dir / ".pre_pass" / "pre_pass.json").exists()
    source, revision = "bundled-local", "local"
    raw = FIXED_GLOSSARY_PATH.read_bytes()
    if repo and not legacy:
        try:
            raw, revision = latest_remote(
                repo, branch, cache_dir or Path(".glossary-cache")
            )
            source = repo
        except (OSError, ValueError, KeyError, TypeError):
            logger.warning("共享詞庫暫時無法使用，這部影片固定採用本機詞庫")
    if legacy:
        logger.warning("舊影片沒有詞庫版本紀錄；固定目前本機版本，無法還原當時用詞")
    data = validate_bytes(raw)
    digest = hashlib.sha256(
        json.dumps(data, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    with snapshot.open("x", encoding="utf-8") as handle:
        json.dump(
            {
                "source": source,
                "revision": revision,
                "sha256": digest,
                "pinned_at": datetime.now(UTC).isoformat(),
                "data": data,
            },
            handle,
            ensure_ascii=False,
            indent=2,
        )
    logger.info(f"詞庫已固定：{source} / {revision[:12]}")
    return snapshot


@contextmanager
def project_glossary(project_dir: Path, *, repo: str = "", branch: str = "main"):
    """Bind a pinned glossary throughout pre-pass, checking, and finalization."""
    snapshot = pin_glossary(project_dir, repo=repo, branch=branch)
    token = ACTIVE_GLOSSARY_PATH.set(snapshot)
    try:
        yield snapshot
    finally:
        ACTIVE_GLOSSARY_PATH.reset(token)
