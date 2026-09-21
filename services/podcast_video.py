"""Render a translated Podcast as a black 16:9 subtitled video.

The translation pipeline still owns transcription, translation, terminology,
and the canonical finalized SRT. This module only creates the Podcast-specific
presentation: a cover image in the left third, large subtitles in the right
two-thirds, and the original audio as the video soundtrack.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from loguru import logger

from project import (
    PODCAST_ASS_FILE_NAME,
    PODCAST_VIDEO_FILE_NAME,
)
from services.media import MediaProcessor
from services.preferences import load_preferences
from services.srt import SrtBlock, parse_srt

_PREFERENCES = load_preferences("podcast")
PODCAST_WIDTH = _PREFERENCES["width"]
PODCAST_HEIGHT = _PREFERENCES["height"]
PODCAST_COVER_WIDTH = _PREFERENCES["cover_width"]
PODCAST_DURATION_TOLERANCE_SECONDS = 2.0
PODCAST_ALTERNATE_VIDEO_FILE_NAME = "video.podcast.vfr.mp4"

_SRT_TIMECODE = re.compile(
    r"^\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*"
    r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*$"
)

PODCAST_ASS_HEADER = """[Script Info]
ScriptType: v4.00+
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,PingFang TC,60,&H00FFFFFF,&H000000FF,&H00151515,&H80000000,0,0,0,0,100,100,0,0,1,3,0,5,700,60,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def _format_ass_time(hours: str, minutes: str, seconds: str, millis: str) -> str:
    """Convert an SRT timestamp component to ASS centisecond precision."""
    return f"{int(hours)}:{minutes}:{seconds}.{int(millis) // 10:02d}"


def _srt_timecode_to_ass(timecode: str) -> tuple[str, str]:
    """Convert one SRT timecode line into an ASS start/end pair."""
    match = _SRT_TIMECODE.match(timecode)
    if not match:
        raise ValueError(f"Invalid SRT timecode: {timecode!r}")
    sh, sm, ss, sms, eh, em, es, ems = match.groups()
    return (
        _format_ass_time(sh, sm, ss, sms),
        _format_ass_time(eh, em, es, ems),
    )


def _escape_ass_text(text: str) -> str:
    """Escape subtitle text so user text cannot become an ASS override tag."""
    return (
        text.replace("\\", "＼")
        .replace("{", "｛")
        .replace("}", "｝")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\n", "\\N")
    )


def _block_to_ass_dialogue(block: SrtBlock) -> str:
    """Render one finalized SRT block as a right-panel ASS dialogue."""
    start, end = _srt_timecode_to_ass(block.timecode)
    text = _escape_ass_text(block.text)
    return f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}"


def build_podcast_ass(srt_text: str) -> str:
    """Build a Podcast-layout ASS document from finalized SRT text."""
    blocks = parse_srt(srt_text)
    if not blocks:
        raise ValueError("Cannot build Podcast ASS from an empty SRT")
    if any(not block.text.strip() for block in blocks):
        raise ValueError("Podcast ASS requires non-empty subtitle blocks")
    dialogues = [_block_to_ass_dialogue(block) for block in blocks]
    header = PODCAST_ASS_HEADER.replace("PlayResX: 1920", f"PlayResX: {PODCAST_WIDTH}")
    header = header.replace("PlayResY: 1080", f"PlayResY: {PODCAST_HEIGHT}")
    header = header.replace(
        "PingFang TC,60", f"{_PREFERENCES['font_name']},{_PREFERENCES['font_size']}"
    )
    header = header.replace(",700,60,60,1", f",{PODCAST_COVER_WIDTH + 60},60,60,1")
    return header + "\n".join(dialogues) + "\n"


def write_podcast_ass(srt_path: Path, ass_path: Path) -> Path:
    """Write the Podcast ASS beside the project subtitles without replacement."""
    expected = build_podcast_ass(srt_path.read_text(encoding="utf-8-sig"))
    ass_path.parent.mkdir(parents=True, exist_ok=True)
    if ass_path.exists():
        if ass_path.read_text(encoding="utf-8") == expected:
            return ass_path
        raise FileExistsError(
            f"refusing to replace an existing Podcast ASS: {ass_path}"
        )
    ass_path.write_text(expected, encoding="utf-8")
    return ass_path


def _ffmpeg_supports_subtitles() -> bool:
    """Return whether the installed FFmpeg exposes the libass filter."""
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-filters"],
        check=False,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
    )
    return bool(re.search(r"\bsubtitles\b", result.stdout or ""))


def _subtitle_font_path() -> Path:
    """Find a Traditional Chinese font available on this Mac."""
    candidates = (
        Path.home() / "Library/Fonts/NotoSansCJKtc-Medium.otf",
        Path("/System/Library/Fonts/STHeiti Medium.ttc"),
        Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("no Traditional Chinese subtitle font found")


def _srt_block_seconds(block: SrtBlock) -> tuple[float, float]:
    """Convert one SRT block's timecode to floating-point seconds."""
    match = _SRT_TIMECODE.match(block.timecode)
    if not match:
        raise ValueError(f"Invalid SRT timecode: {block.timecode!r}")
    sh, sm, ss, sms, eh, em, es, ems = match.groups()
    start = int(sh) * 3600 + int(sm) * 60 + int(ss) + int(sms) / 1000
    end = int(eh) * 3600 + int(em) * 60 + int(es) + int(ems) / 1000
    if end <= start:
        raise ValueError(f"SRT block has non-positive duration: {block.index}")
    return start, end


def _wrap_pillow_text(draw: object, text: str, font: object, max_width: int) -> str:
    """Wrap CJK subtitle text by measured pixels for Pillow rendering."""
    lines: list[str] = []
    for paragraph in text.replace("\r", "").split("\n"):
        if not paragraph:
            lines.append("")
            continue
        current = ""
        for character in paragraph:
            candidate = current + character
            if current and draw.textlength(candidate, font=font) > max_width:
                lines.append(current)
                current = character
            else:
                current = candidate
        lines.append(current)
    return "\n".join(lines)


def _write_text_if_missing(path: Path, text: str) -> None:
    """Write a generated text artifact without replacing an existing one."""
    if path.exists():
        if path.read_text(encoding="utf-8") != text:
            raise FileExistsError(f"refusing to replace existing artifact: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _render_podcast_with_frame_images(
    audio_source: Path,
    cover_path: Path,
    subtitle_path: Path,
    output_path: Path,
) -> None:
    """Render subtitles through Pillow when FFmpeg lacks libass support."""
    from PIL import Image, ImageDraw, ImageFont

    blocks = parse_srt(subtitle_path.read_text(encoding="utf-8-sig"))
    if not blocks:
        raise ValueError("Cannot render a Podcast video from an empty SRT")

    frame_dir = output_path.parent / ".podcast_frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    cover = Image.open(cover_path).convert("RGB")
    cover.thumbnail((PODCAST_COVER_WIDTH, PODCAST_HEIGHT), Image.Resampling.LANCZOS)
    base = Image.new("RGB", (PODCAST_WIDTH, PODCAST_HEIGHT), (0, 0, 0))
    base.paste(cover, (0, (PODCAST_HEIGHT - cover.height) // 2))
    blank_path = frame_dir / "frame_blank.jpg"
    if not blank_path.exists():
        base.save(blank_path, format="JPEG", quality=95, optimize=True)

    font = ImageFont.truetype(str(_subtitle_font_path()), _PREFERENCES["font_size"])
    text_center_x = PODCAST_COVER_WIDTH + (PODCAST_WIDTH - PODCAST_COVER_WIDTH) // 2
    max_text_width = PODCAST_WIDTH - PODCAST_COVER_WIDTH - 120
    entries: list[tuple[str, float]] = []
    cursor = 0.0
    for block in blocks:
        start, end = _srt_block_seconds(block)
        if start > cursor:
            entries.append((blank_path.name, start - cursor))
        frame_path = frame_dir / f"frame_{block.index:04d}.jpg"
        if not frame_path.exists():
            frame = base.copy()
            draw = ImageDraw.Draw(frame)
            wrapped = _wrap_pillow_text(draw, block.text, font, max_text_width)
            draw.multiline_text(
                (text_center_x, PODCAST_HEIGHT // 2),
                wrapped,
                font=font,
                fill=(255, 255, 255),
                stroke_width=3,
                stroke_fill=(21, 21, 21),
                spacing=10,
                align="center",
                anchor="mm",
            )
            frame.save(frame_path, format="JPEG", quality=95, optimize=True)
        entries.append((frame_path.name, end - start))
        cursor = end

    source_duration = MediaProcessor.get_media_duration(audio_source)
    if source_duration > cursor:
        entries.append((blank_path.name, source_duration - cursor))
    if not entries:
        raise ValueError("Podcast frame list is empty")

    concat_text = "ffconcat version 1.0\n"
    for filename, duration in entries:
        concat_text += f"file '{filename}'\nduration {duration:.6f}\n"
    concat_text += f"file '{entries[-1][0]}'\n"
    concat_path = frame_dir / "concat.ffconcat"
    _write_text_if_missing(concat_path, concat_text)

    command = [
        "ffmpeg",
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_path.resolve()),
        "-i",
        str(audio_source.resolve()),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-fps_mode",
        "vfr",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        "-y",
        str(output_path.resolve()),
    ]
    logger.warning(
        "FFmpeg has no subtitles/libass filter; rendering Podcast frames with Pillow"
    )
    result = subprocess.run(
        command,
        cwd=frame_dir,
        check=False,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
    )
    if result.returncode != 0:
        stderr_tail = "\n".join((result.stderr or "").splitlines()[-30:])
        raise subprocess.CalledProcessError(
            result.returncode,
            command,
            output=result.stdout,
            stderr=stderr_tail,
        )


def _validate_rendered_duration(
    source_path: Path,
    output_path: Path,
) -> None:
    """Ensure the rendered video did not lose a material amount of audio."""
    source_duration = MediaProcessor.get_media_duration(source_path)
    output_duration = MediaProcessor.get_media_duration(output_path)
    if source_duration - output_duration > PODCAST_DURATION_TOLERANCE_SECONDS:
        raise ValueError(
            "Podcast render is shorter than the source by "
            f"{source_duration - output_duration:.3f}s: {output_path}"
        )


def render_podcast_video(
    audio_source: Path,
    cover_path: Path,
    subtitle_path: Path,
    ass_path: Path,
    output_path: Path,
) -> Path:
    """Render a black Podcast video with cover, large subtitles, and audio.

    ``audio_source`` may be a video containing the original audio stream or a
    standalone audio file. The cover is fit inside a 640×1080 left panel and
    the right-panel ASS is burned into the final 1920×1080 MP4. Existing valid
    outputs are reused; existing invalid outputs are never overwritten.
    """
    for path, label in (
        (audio_source, "audio source"),
        (cover_path, "cover"),
        (subtitle_path, "finalized subtitle"),
    ):
        if not path.is_file():
            raise FileNotFoundError(f"{label} not found: {path}")

    write_podcast_ass(subtitle_path, ass_path)
    if output_path.exists():
        _validate_rendered_duration(audio_source, output_path)
        logger.info(f"Reusing existing Podcast video: {output_path}")
        return output_path

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not _ffmpeg_supports_subtitles():
        _render_podcast_with_frame_images(
            audio_source,
            cover_path,
            subtitle_path,
            output_path,
        )
        _validate_rendered_duration(audio_source, output_path)
        logger.success(f"Podcast layout video ready: {output_path}")
        return output_path

    filter_complex = (
        f"[0:v]scale={PODCAST_COVER_WIDTH}:{PODCAST_HEIGHT}:"
        "force_original_aspect_ratio=decrease,"
        f"pad={PODCAST_COVER_WIDTH}:{PODCAST_HEIGHT}:"
        "(ow-iw)/2:(oh-ih)/2:color=black[left];"
        f"color=c=black:s={PODCAST_WIDTH}x{PODCAST_HEIGHT}:r=30[canvas];"
        "[canvas][left]overlay=0:0[layout];"
        f"[layout]subtitles=filename={ass_path.name}[v]"
    )
    command = [
        "ffmpeg",
        "-hide_banner",
        "-nostdin",
        "-loop",
        "1",
        "-i",
        str(cover_path.resolve()),
        "-i",
        str(audio_source.resolve()),
        "-filter_complex",
        filter_complex,
        "-map",
        "[v]",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        str(output_path.resolve()),
        "-y",
    ]
    logger.info(f"Rendering Podcast layout video: {output_path}")
    result = subprocess.run(
        command,
        cwd=ass_path.parent,
        check=False,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
    )
    if result.returncode != 0:
        stderr_tail = "\n".join((result.stderr or "").splitlines()[-30:])
        raise subprocess.CalledProcessError(
            result.returncode,
            command,
            output=result.stdout,
            stderr=stderr_tail,
        )
    _validate_rendered_duration(audio_source, output_path)
    logger.success(f"Podcast layout video ready: {output_path}")
    return output_path


def _safe_title(value: str) -> str:
    """Return a filesystem-safe Traditional Chinese deliverable title."""
    title = re.sub(r'[\\/:*?"<>|]', "｜", value).strip().strip(".")
    title = re.sub(r"\s+", " ", title)
    if not title:
        raise ValueError("title must contain at least one visible character")
    return title


def _copy_if_missing_or_same(source: Path, target: Path) -> str:
    """Copy a file without replacing a different existing file."""
    if target.exists():
        if source.is_file() and os.path.samefile(source, target):
            return "existing-hard-link"
        if source.read_bytes() == target.read_bytes():
            return "existing-identical"
        raise FileExistsError(f"refusing to replace existing file: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(source, target)
        return "hard-link"
    except OSError:
        shutil.copy2(source, target)
        return "copy"


def package_podcast_project(
    project_dir: Path,
    title_zh: str,
    output_root: Path | None = None,
    video_source: Path | None = None,
) -> dict[str, str]:
    """Create an organized Podcast deliverable from a finalized project."""
    project_dir = project_dir.expanduser().resolve()
    title = _safe_title(title_zh)
    video_source = video_source or project_dir / PODCAST_VIDEO_FILE_NAME
    video_source = video_source.expanduser().resolve()
    ass_source = project_dir / PODCAST_ASS_FILE_NAME
    srt_source = project_dir / "video.cht.finalized.srt"
    cover_source = _find_cover(project_dir)
    for path in (video_source, ass_source, srt_source, cover_source):
        if not path.is_file():
            raise FileNotFoundError(f"required Podcast artifact not found: {path}")

    root = (output_root or project_dir / "成品").expanduser().resolve()
    package_dir = root / title
    subtitles_dir = package_dir / "字幕"
    subtitles_dir.mkdir(parents=True, exist_ok=True)

    video_target = package_dir / f"{title}.mp4"
    srt_target = subtitles_dir / f"{title}.繁中.srt"
    ass_target = subtitles_dir / f"{title}.繁中.ass"
    cover_target = package_dir / cover_source.name
    video_method = _copy_if_missing_or_same(video_source, video_target)
    _copy_if_missing_or_same(srt_source, srt_target)
    _copy_if_missing_or_same(ass_source, ass_target)
    _copy_if_missing_or_same(cover_source, cover_target)

    note = package_dir / "檔案說明.txt"
    note.write_text(
        "此 Podcast 已製作為黑底 16:9 影片：左側 1/3 為封面，右側 2/3 為繁體中文字幕。\n"
        "字幕已直接燒錄進影片；「字幕」資料夾另附同時間軸的 ASS 與 SRT。\n",
        encoding="utf-8",
    )
    return {
        "package_dir": str(package_dir),
        "video": str(video_target),
        "video_method": video_method,
        "subtitles_dir": str(subtitles_dir),
        "srt": str(srt_target),
        "ass": str(ass_target),
        "cover": str(cover_target),
        "note": str(note),
    }


def render_podcast_project(
    project_dir: Path,
    title_zh: str,
    output_root: Path | None = None,
) -> dict[str, str]:
    """Render and package a finalized GrillMaster Podcast project."""
    project_dir = project_dir.expanduser().resolve()
    podcast_audio_source = project_dir / "podcast_source.mp3"
    video_source = project_dir / "video.mp4"
    if podcast_audio_source.is_file():
        audio_source = podcast_audio_source
    elif video_source.is_file():
        audio_source = video_source
    else:
        audio_source = project_dir / ".asr" / "audio.ogg"
    cover_source = _find_cover(project_dir)
    subtitle_source = project_dir / "video.cht.finalized.srt"
    render_output = project_dir / PODCAST_VIDEO_FILE_NAME
    if render_output.exists():
        try:
            _validate_rendered_duration(audio_source, render_output)
        except (ValueError, OSError, subprocess.CalledProcessError):
            render_output = project_dir / PODCAST_ALTERNATE_VIDEO_FILE_NAME
            logger.warning(
                "Existing Podcast output is incomplete; preserving it and rendering "
                f"an alternate output: {render_output}"
            )
    render_podcast_video(
        audio_source=audio_source,
        cover_path=cover_source,
        subtitle_path=subtitle_source,
        ass_path=project_dir / PODCAST_ASS_FILE_NAME,
        output_path=render_output,
    )
    return package_podcast_project(
        project_dir,
        title_zh,
        output_root,
        video_source=render_output,
    )


def _find_cover(project_dir: Path) -> Path:
    """Find the original downloaded cover across yt-dlp naming variants."""
    candidates = (
        project_dir / "poster.jpg",
        project_dir / "poster.jpeg",
        project_dir / "poster.png",
        project_dir / "poster.webp",
        project_dir / "poster.cover.png",
        project_dir / "0.jpg",
        project_dir / "0.jpeg",
        project_dir / "0.png",
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"no Podcast cover found in: {project_dir}")


def main() -> None:
    """Render and package a Podcast project from the command line."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-dir", type=Path, required=True)
    parser.add_argument("--title-zh", required=True)
    parser.add_argument("--output-root", type=Path)
    args = parser.parse_args()
    result = render_podcast_project(
        args.project_dir,
        args.title_zh,
        args.output_root,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
