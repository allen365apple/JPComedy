"""Beginner-friendly setup, dependency checks, and interactive translation."""

import argparse
import os
import shutil
import subprocess
from getpass import getpass
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def setup() -> None:
    """Create a local configuration without replacing an existing one."""
    target = ROOT / ".env"
    if target.exists():
        print("已有 .env，保留原設定。請用文字編輯器開啟它調整。")
        return
    key = getpass("貼上 ElevenLabs API Key（輸入不會顯示）：").strip()
    if not key or any(c in key for c in "\r\n\"' "):
        raise ValueError("API Key 不可空白或包含空白、換行、引號")
    model = input("Codex 可用模型名稱 [gpt-5.6-sol]：").strip() or "gpt-5.6-sol"
    if any(
        c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._"
        for c in model
    ):
        raise ValueError("模型名稱格式不正確")
    text = (ROOT / ".env.example").read_text("utf-8")
    text = text.replace("ELEVENLABS_API_KEY=\n", f"ELEVENLABS_API_KEY={key}\n").replace(
        "gpt-5.6-sol", model
    )
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(text)
    print("設定完成。金鑰只存在你電腦的 .env。")


def doctor() -> bool:
    """Check dependencies without running paid transcription or translation."""
    ready = True
    for name in ("ffmpeg", "ffprobe", "codex"):
        found = shutil.which(name)
        print(f"{'✓' if found else '✗'} {name} {'已找到' if found else '尚未安裝'}")
        ready = ready and bool(found)
        if found and name in ("ffmpeg", "ffprobe"):
            result = subprocess.run(
                [found, "-version"], capture_output=True, check=False
            )
            if result.returncode:
                print(f"✗ {name} 無法啟動，請依 README 設定 ffmpeg-full 的 PATH")
                ready = False
    if shutil.which("ffmpeg"):
        filters = subprocess.run(
            ["ffmpeg", "-hide_banner", "-filters"],
            capture_output=True,
            text=True,
            check=False,
        )
        print(
            "字幕燒錄："
            + ("支援" if "subtitles" in filters.stdout else "需要含 libass 的 FFmpeg")
        )
    from settings import settings

    if not settings.elevenlabs_api_key:
        print("✗ 請先執行 --setup 設定 ElevenLabs 金鑰")
        ready = False
    if shutil.which("codex"):
        result = subprocess.run(
            ["codex", "login", "status"], capture_output=True, check=False
        )
        if result.returncode:
            print("✗ 請先執行 codex login 登入")
            ready = False
    return ready


def translate(source: str | None) -> None:
    """Confirm service charges before submitting a video through the pipeline."""
    if not doctor():
        raise ValueError("請依 README 完成安裝／登入後再試")
    source = source or input("貼上影片網址，或本機影片完整路徑：").strip()
    if not source:
        raise ValueError("請提供影片")
    hint = input("節目、人物或其他翻譯提示（可直接按 Enter）：").strip()
    print(
        "語音辨識使用 ElevenLabs，會依你的帳號方案計費／扣額度；翻譯會使用 Codex 額度。"
    )
    print("費率請先確認：https://elevenlabs.io/pricing/api")
    if input("確定開始？輸入 YES：").strip() != "YES":
        print("已取消。")
        return
    from project import Project
    from workflow import submit_project

    submit_project(source, hint or None, enable_refine=True, enable_glossary_check=True)
    project = Project.from_source_str(source)
    print(f"字幕完成：{project.finalized_srt_path.resolve()}")
    if input("要再燒成黑底中文字幕影片嗎？[y/N]：").strip().lower() == "y":
        from services.subtitle_burnin import render_project

        ranges = input("日文字卡避讓時段 JSON 路徑（空白＝維持下方）：").strip()
        print(render_project(project.project_path, Path(ranges) if ranges else None))


def main() -> None:
    """Run local onboarding or the interactive translation launcher."""
    os.chdir(ROOT)
    parser = argparse.ArgumentParser(description="JPComedy：日本搞笑影片翻譯")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--setup", action="store_true")
    group.add_argument("--check", action="store_true")
    parser.add_argument("source", nargs="?")
    args = parser.parse_args()
    try:
        if args.setup:
            setup()
        elif args.check:
            if not doctor():
                raise SystemExit(1)
        else:
            translate(args.source)
    except (ValueError, OSError) as exc:
        print(f"無法繼續：{exc}")
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
