"""Serve the local, dependency-free fixed-glossary management interface."""

from __future__ import annotations

import argparse
import errno
import json
import mimetypes
import re
import shutil
import threading
import webbrowser
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from services.fixed_glossary import filter_fixed_glossary, load_fixed_glossary


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = Path(__file__).resolve().parent / "static"
GLOSSARY_PATH = PROJECT_ROOT / "services/fixed_glossary/fixed_glossary.json"
BACKUP_DIR = PROJECT_ROOT / "services/fixed_glossary/backups"
_SAVE_LOCK = threading.Lock()
_JP_ARRAY_PATTERN = re.compile(
    r'("jp": )\[\n((?:[ \t]+"(?:\\.|[^"\\])*",?\n)+)[ \t]+\]'
)


class GlossaryValidationError(ValueError):
    """Raised when browser-submitted glossary data is incomplete or malformed."""


def _format_glossary_json(payload: dict[str, Any]) -> str:
    """Render canonical JSON while keeping short Japanese alias lists readable."""
    rendered = json.dumps(payload, ensure_ascii=False, indent="\t")

    def compact_aliases(match: re.Match[str]) -> str:
        aliases = [line.strip().rstrip(",") for line in match.group(2).splitlines()]
        return f'{match.group(1)}[{", ".join(aliases)}]'

    return _JP_ARRAY_PATTERN.sub(compact_aliases, rendered) + "\n"


def _clean_text(value: Any, label: str, *, max_length: int = 500) -> str:
    """Validate and trim a required text field."""
    if not isinstance(value, str) or not value.strip():
        raise GlossaryValidationError(f"{label}不能留白")
    cleaned = value.strip()
    if len(cleaned) > max_length:
        raise GlossaryValidationError(f"{label}太長了（最多 {max_length} 個字）")
    return cleaned


def _clean_mapping(value: Any, label: str) -> dict[str, Any]:
    """Normalize one Japanese-alias to Traditional-Chinese mapping."""
    if not isinstance(value, dict):
        raise GlossaryValidationError(f"{label}的格式不正確")
    aliases = value.get("jp")
    if not isinstance(aliases, list) or not aliases:
        raise GlossaryValidationError(f"{label}至少需要一個日文名稱或別名")
    clean_aliases: list[str] = []
    for index, alias in enumerate(aliases, start=1):
        cleaned = _clean_text(alias, f"{label}的第 {index} 個日文名稱")
        if cleaned not in clean_aliases:
            clean_aliases.append(cleaned)
    result: dict[str, Any] = {
        "jp": clean_aliases,
        "zh": _clean_text(value.get("zh"), f"{label}的繁中譯名"),
    }
    note = value.get("note", "")
    if note:
        result["note"] = _clean_text(note, f"{label}的備註", max_length=1000)
    if value.get("disabled") is True:
        result["disabled"] = True
    return result


def validate_glossary_payload(value: Any) -> dict[str, list[dict[str, Any]]]:
    """Validate browser data and return the canonical persisted JSON shape."""
    if not isinstance(value, dict):
        raise GlossaryValidationError("詞庫資料格式不正確")
    talents = value.get("talents")
    others = value.get("others")
    if not isinstance(talents, list) or not isinstance(others, list):
        raise GlossaryValidationError("詞庫必須包含藝人與術語兩個分類")

    clean_talents: list[dict[str, Any]] = []
    for index, unit in enumerate(talents, start=1):
        label = f"第 {index} 組藝人"
        if not isinstance(unit, dict):
            raise GlossaryValidationError(f"{label}的格式不正確")
        group = unit.get("group")
        members = unit.get("members")
        if group is not None:
            group = _clean_mapping(group, f"{label}的組合名稱")
        if not isinstance(members, list) or not members:
            raise GlossaryValidationError(f"{label}至少需要一位成員")
        clean_unit: dict[str, Any] = {}
        if group is not None:
            clean_unit["group"] = group
        clean_unit["members"] = [
            _clean_mapping(member, f"{label}的第 {member_index} 位成員")
            for member_index, member in enumerate(members, start=1)
        ]
        if unit.get("disabled") is True:
            clean_unit["disabled"] = True
        clean_talents.append(clean_unit)

    clean_others = [
        _clean_mapping(entry, f"第 {index} 個節目或術語")
        for index, entry in enumerate(others, start=1)
    ]
    return {"talents": clean_talents, "others": clean_others}


def save_glossary(payload: Any) -> tuple[dict[str, Any], Path | None]:
    """Validate, back up, and persist the glossary without deleting old data."""
    clean_payload = validate_glossary_payload(payload)
    backup_path: Path | None = None
    with _SAVE_LOCK:
        if GLOSSARY_PATH.exists():
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
            backup_path = BACKUP_DIR / f"fixed_glossary-{stamp}.json"
            shutil.copy2(GLOSSARY_PATH, backup_path)
        GLOSSARY_PATH.write_text(
            _format_glossary_json(clean_payload),
            encoding="utf-8",
        )
    return clean_payload, backup_path


def _mapping_to_json(entry: tuple[list[str], str]) -> dict[str, Any]:
    """Convert a runtime glossary tuple into a JSON response object."""
    aliases, zh = entry
    return {"jp": aliases, "zh": zh}


def match_saved_glossary(text: str) -> dict[str, list[dict[str, Any]]]:
    """Run the real pipeline matcher against user-provided Japanese text."""
    matched = filter_fixed_glossary(load_fixed_glossary(), text)
    talents: list[dict[str, Any]] = []
    for unit in matched.talents:
        talents.append(
            {
                "group": _mapping_to_json(unit.group) if unit.group else None,
                "members": [_mapping_to_json(member) for member in unit.members],
            }
        )
    return {
        "talents": talents,
        "others": [_mapping_to_json(entry) for entry in matched.others],
    }


class GlossaryRequestHandler(BaseHTTPRequestHandler):
    """HTTP handler for static UI files and the small local JSON API."""

    server_version = "GrillMasterGlossary/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        """Keep terminal logs concise while retaining useful request visibility."""
        print(f"[詞庫介面] {self.address_string()} - {format % args}")

    def _send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path) -> None:
        if not path.is_file() or STATIC_DIR not in path.parents:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        body = path.read_bytes()
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> Any:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 5_000_000:
            raise GlossaryValidationError("送出的資料大小不正確")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise GlossaryValidationError("無法讀取送出的資料") from exc

    def do_GET(self) -> None:
        """Return glossary data, server status, or static interface assets."""
        parsed = urlparse(self.path)
        if parsed.path == "/api/glossary":
            try:
                data = json.loads(GLOSSARY_PATH.read_text(encoding="utf-8"))
                self._send_json({"ok": True, "data": data})
            except Exception as exc:
                self._send_json(
                    {"ok": False, "message": f"讀取詞庫失敗：{exc}"},
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                )
            return
        if parsed.path == "/api/health":
            self._send_json({"ok": True, "glossary": str(GLOSSARY_PATH)})
            return

        relative = "index.html" if parsed.path == "/" else unquote(parsed.path.lstrip("/"))
        candidate = (STATIC_DIR / relative).resolve()
        self._send_file(candidate)

    def do_POST(self) -> None:
        """Save glossary changes or test text with the production matcher."""
        try:
            payload = self._read_json()
            if self.path == "/api/glossary/save":
                clean, backup = save_glossary(payload)
                self._send_json(
                    {
                        "ok": True,
                        "data": clean,
                        "backup": str(backup) if backup else None,
                        "message": "已儲存，之後的翻譯會直接使用這份詞庫。",
                    }
                )
                return
            if self.path == "/api/glossary/match":
                text = _clean_text(payload.get("text"), "測試文字", max_length=20_000)
                self._send_json({"ok": True, "matches": match_saved_glossary(text)})
                return
            self._send_json(
                {"ok": False, "message": "找不到這個操作"},
                HTTPStatus.NOT_FOUND,
            )
        except GlossaryValidationError as exc:
            self._send_json(
                {"ok": False, "message": str(exc)}, HTTPStatus.BAD_REQUEST
            )
        except Exception as exc:
            self._send_json(
                {"ok": False, "message": f"操作失敗：{exc}"},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )


class GlossaryHTTPServer(ThreadingHTTPServer):
    """Local HTTP server that can be restarted immediately after closing."""

    allow_reuse_address = True


def run_server(host: str = "127.0.0.1", port: int = 8765, *, open_browser: bool = True) -> None:
    """Start the local glossary server and optionally open its browser page."""
    url = f"http://{host}:{port}"
    try:
        server = GlossaryHTTPServer((host, port), GlossaryRequestHandler)
    except OSError as exc:
        if exc.errno != errno.EADDRINUSE:
            raise
        print("\n漫才詞庫管理介面已經開著了。")
        print(f"正在替你打開：{url}\n")
        if open_browser:
            webbrowser.open(url)
        return
    print("\n漫才詞庫管理介面已啟動")
    print(f"請打開：{url}")
    print("關閉這個終端機視窗即可停止介面。\n")
    if open_browser:
        threading.Timer(0.5, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n詞庫介面已停止。")
    finally:
        server.server_close()


def main() -> None:
    """CLI entry point for launching the beginner-friendly local UI."""
    parser = argparse.ArgumentParser(description="啟動 GrillMaster 漫才詞庫管理介面")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8765, type=int)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    run_server(args.host, args.port, open_browser=not args.no_browser)


if __name__ == "__main__":
    main()
