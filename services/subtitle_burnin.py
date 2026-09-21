"""Render opaque-background Traditional Chinese subtitles into a video."""

from __future__ import annotations

import json
import re
import subprocess
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from loguru import logger

from services.preferences import load_preferences
from services.srt import parse_srt

_SRT_TIMECODE = re.compile(
    r"^\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*"
    r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*$"
)


@dataclass(frozen=True)
class SubtitleEvent:
    """One timed subtitle event used by the frame renderer."""

    start: float
    end: float
    text: str


BLACK_BOX_ASS_HEADER = """[Script Info]
ScriptType: v4.00+
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans CJK TC,60,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,3,10,0,8,120,120,135,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def _timecode_seconds(timecode: str) -> tuple[float, float]:
    """Convert one SRT timecode line to start/end seconds."""
    match = _SRT_TIMECODE.match(timecode)
    if not match:
        raise ValueError(f"Invalid SRT timecode: {timecode!r}")
    sh, sm, ss, sms, eh, em, es, ems = match.groups()
    start = int(sh) * 3600 + int(sm) * 60 + int(ss) + int(sms) / 1000
    end = int(eh) * 3600 + int(em) * 60 + int(es) + int(ems) / 1000
    if end <= start:
        raise ValueError(f"Subtitle has non-positive duration: {timecode!r}")
    return start, end


def _load_events(subtitle_file: Path) -> list[SubtitleEvent]:
    """Read finalized SRT blocks as validated timed events."""
    blocks = parse_srt(subtitle_file.read_text(encoding="utf-8-sig"))
    if not blocks:
        raise ValueError(f"No subtitles found in {subtitle_file}")
    return [
        SubtitleEvent(*_timecode_seconds(block.timecode), block.text.strip())
        for block in blocks
        if block.text.strip()
    ]


def _ass_time(seconds: float) -> str:
    """Format seconds as ASS time with centisecond precision."""
    centiseconds = max(0, round(seconds * 100))
    hours, centiseconds = divmod(centiseconds, 360000)
    minutes, centiseconds = divmod(centiseconds, 6000)
    secs, centiseconds = divmod(centiseconds, 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{centiseconds:02d}"


def _escape_ass_text(text: str) -> str:
    """Escape subtitle text before inserting it into an ASS dialogue."""
    return (
        text.replace("\\", "＼")
        .replace("{", "｛")
        .replace("}", "｝")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\n", "\\N")
    )


def write_black_box_ass(subtitle_file: Path, ass_file: Path) -> Path:
    """Create a top-positioned opaque-black ASS subtitle file."""
    blocks = parse_srt(subtitle_file.read_text(encoding="utf-8-sig"))
    if not blocks:
        raise ValueError(f"No subtitles found in {subtitle_file}")
    dialogues: list[str] = []
    for block in blocks:
        start, end = _timecode_seconds(block.timecode)
        text = _escape_ass_text(block.text.strip())
        if not text:
            continue
        dialogues.append(
            f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Default,,0,0,0,,{text}"
        )
    content = BLACK_BOX_ASS_HEADER + "\n".join(dialogues) + "\n"
    if ass_file.exists():
        if ass_file.read_text(encoding="utf-8") == content:
            return ass_file
        raise FileExistsError(f"Refusing to replace existing ASS: {ass_file}")
    ass_file.parent.mkdir(parents=True, exist_ok=True)
    ass_file.write_text(content, encoding="utf-8")
    return ass_file


def write_dynamic_black_box_ass(
    subtitle_file: Path,
    ass_file: Path,
    above_ranges: Sequence[tuple[float, float]],
    *,
    font_size: int | None = None,
    above_margin_v: int | None = None,
    bottom_margin_v: int | None = None,
) -> Path:
    """Create a larger ASS subtitle track with per-event vertical placement.

    Events that overlap ``above_ranges`` are placed just above
    the programme's large lower-third captions. All other events remain at the
    normal bottom position. Both styles use an opaque black box and regular
    Traditional Chinese font weight.
    """
    events = _load_events(subtitle_file)
    preferences = load_preferences("subtitle")
    font_size = font_size if font_size is not None else preferences["font_size"]
    above_margin_v = (
        above_margin_v if above_margin_v is not None else preferences["above_margin_v"]
    )
    bottom_margin_v = (
        bottom_margin_v
        if bottom_margin_v is not None
        else preferences["bottom_margin_v"]
    )
    font_name = preferences["font_name"]
    if any(c in font_name for c in ",\r\n"):
        raise ValueError("Invalid ASS font name")
    if font_size < 1:
        raise ValueError("font_size must be positive")
    normalized_ranges = tuple(
        (float(start), float(end))
        for start, end in above_ranges
        if float(end) > float(start)
    )
    header = f"""[Script Info]
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Bottom,{font_name},{font_size},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,3,10,0,2,90,90,{bottom_margin_v},1
Style: Above,{font_name},{font_size},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,3,10,0,2,90,90,{above_margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    dialogues: list[str] = []
    for event in events:
        style = "Bottom"
        if any(
            start < event.end and end > event.start for start, end in normalized_ranges
        ):
            style = "Above"
        dialogues.append(
            f"Dialogue: 0,{_ass_time(event.start)},{_ass_time(event.end)},"
            f"{style},,0,0,0,,{_escape_ass_text(event.text)}"
        )
    content = header + "\n".join(dialogues) + "\n"
    if ass_file.exists():
        if ass_file.read_text(encoding="utf-8") == content:
            return ass_file
        raise FileExistsError(f"Refusing to replace existing ASS: {ass_file}")
    ass_file.parent.mkdir(parents=True, exist_ok=True)
    ass_file.write_text(content, encoding="utf-8")
    return ass_file


def _font_path() -> Path:
    """Find a Traditional Chinese font available on this Mac."""
    candidates = (
        Path.home() / "Library/Fonts/NotoSansCJKtc-Medium.otf",
        Path("/System/Library/Fonts/STHeiti Medium.ttc"),
        Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("No Traditional Chinese subtitle font found")


def _probe_video(video_file: Path) -> tuple[int, int, str]:
    """Return video width, height, and frame rate from FFprobe."""
    command = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,avg_frame_rate",
        "-of",
        "json",
        str(video_file),
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    streams = json.loads(result.stdout).get("streams", [])
    if not streams:
        raise ValueError(f"No video stream found in {video_file}")
    stream = streams[0]
    width = int(stream["width"])
    height = int(stream["height"])
    frame_rate = stream.get("avg_frame_rate") or "30/1"
    if frame_rate == "0/0":
        frame_rate = "30/1"
    return width, height, frame_rate


def _wrap_text(draw: object, text: str, font: object, max_width: int) -> str:
    """Wrap CJK text to a measured maximum width."""
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


def _subtitle_layout(
    draw: object,
    text: str,
    font: object,
    width: int,
    height: int,
) -> tuple[str, int, int, int, int]:
    """Measure one subtitle once so it can be reused for every video frame."""
    max_width = width - 120
    wrapped = _wrap_text(draw, text, font, max_width)
    bbox = draw.multiline_textbbox(
        (0, 0),
        wrapped,
        font=font,
        spacing=6,
        align="center",
        stroke_width=1,
    )
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    box_width = min(width - 36, text_width + 56)
    box_height = text_height + 30
    center_x = width // 2
    center_y = max(108, int(height * 0.18))
    return wrapped, box_width, box_height, center_x, center_y


def _subtitle_frame(
    frame: object,
    text: str,
    font: object,
    layouts: dict[str, tuple[str, int, int, int, int]],
) -> object:
    """Draw a solid-black subtitle box directly onto one RGB frame."""
    from PIL import ImageDraw

    image = frame.copy()
    draw = ImageDraw.Draw(image)
    if text not in layouts:
        layouts[text] = _subtitle_layout(
            draw,
            text,
            font,
            image.width,
            image.height,
        )
    wrapped, box_width, box_height, center_x, center_y = layouts[text]
    left = center_x - box_width // 2
    top = center_y - box_height // 2
    right = left + box_width
    bottom = top + box_height
    draw.rectangle((left, top, right, bottom), fill=(0, 0, 0, 255))
    draw.multiline_text(
        (center_x, center_y),
        wrapped,
        font=font,
        fill=(255, 255, 255),
        stroke_width=0,
        spacing=6,
        align="center",
        anchor="mm",
    )
    return image


def burn_in_subtitles_with_black_box(
    video_file: Path,
    subtitle_file: Path,
    output_file: Path,
) -> Path:
    """Stream-render opaque black-box subtitles without replacing source media."""
    from PIL import ImageFont

    if output_file.exists():
        raise FileExistsError(f"Refusing to replace existing video: {output_file}")
    events = _load_events(subtitle_file)
    width, height, frame_rate = _probe_video(video_file)
    font_size = max(32, round(width * 44 / 1280))
    font = ImageFont.truetype(str(_font_path()), font_size)
    frame_bytes = width * height * 3

    decoder_command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-i",
        str(video_file),
        "-map",
        "0:v:0",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "pipe:1",
    ]
    encoder_command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{width}x{height}",
        "-framerate",
        frame_rate,
        "-i",
        "pipe:0",
        "-i",
        str(video_file),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        "-shortest",
        "-movflags",
        "+faststart",
        "-y",
        str(output_file),
    ]

    output_file.parent.mkdir(parents=True, exist_ok=True)
    decoder = subprocess.Popen(
        decoder_command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    encoder = subprocess.Popen(
        encoder_command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    event_index = 0
    frame_index = 0
    layouts: dict[str, tuple[str, int, int, int, int]] = {}
    logger.info(
        f"Burning black-box subtitles into {video_file.name} -> {output_file.name}"
    )

    try:
        assert decoder.stdout is not None
        assert encoder.stdin is not None
        while True:
            raw = decoder.stdout.read(frame_bytes)
            if not raw:
                break
            if len(raw) != frame_bytes:
                raise RuntimeError("FFmpeg returned a partial raw video frame")
            from PIL import Image

            frame = Image.frombuffer("RGB", (width, height), raw, "raw", "RGB")
            timestamp = frame_index / _frame_rate_value(frame_rate)
            while event_index < len(events) and events[event_index].end <= timestamp:
                event_index += 1
            active_text = None
            if (
                event_index < len(events)
                and events[event_index].start <= timestamp < events[event_index].end
            ):
                active_text = events[event_index].text
            if active_text is None:
                encoder.stdin.write(raw)
            else:
                frame = _subtitle_frame(frame, active_text, font, layouts)
                encoder.stdin.write(frame.tobytes())
            frame_index += 1
            if frame_index % 900 == 0:
                logger.info(f"Rendered subtitle frames: {frame_index}")
        encoder.stdin.close()
        decoder_return = decoder.wait()
        encoder_return = encoder.wait()
        if decoder_return != 0 or encoder_return != 0:
            decoder_error = decoder.stderr.read().decode(errors="replace")
            encoder_error = encoder.stderr.read().decode(errors="replace")
            raise subprocess.CalledProcessError(
                encoder_return or decoder_return,
                encoder_command,
                stderr=(decoder_error + "\n" + encoder_error).strip(),
            )
    except Exception:
        if encoder.stdin is not None:
            encoder.stdin.close()
        decoder.kill()
        encoder.kill()
        decoder.wait()
        encoder.wait()
        raise

    logger.success(
        f"Embedded subtitle video ready: {output_file} ({frame_index} frames)"
    )
    return output_file


def _frame_rate_value(frame_rate: str) -> float:
    """Convert an FFprobe rational frame rate to a positive float."""
    numerator, denominator = frame_rate.split("/", 1)
    value = float(numerator) / float(denominator)
    return value if value > 0 else 30.0


def render_project(
    project_dir: Path,
    ranges_file: Path | None = None,
    preview_second: float | None = None,
) -> Path:
    """Render the saved profile through libass, using optional caption ranges."""
    from uuid import uuid4

    from services.media import MediaProcessor

    project_dir = project_dir.expanduser().resolve()
    video = project_dir / "video.mp4"
    srt = project_dir / "video.cht.finalized.srt"
    ranges = json.loads(ranges_file.read_text("utf-8")) if ranges_file else []
    if isinstance(ranges, dict):
        ranges = ranges["ranges"]
    ranges = [
        (item["start"], item["end"]) if isinstance(item, dict) else tuple(item[:2])
        for item in ranges
    ]
    # A safe basename avoids FFmpeg interpreting '=', ':', or quotes in paths.
    run_dir = project_dir / ".burnin" / uuid4().hex
    run_dir.mkdir(parents=True)
    ass = write_dynamic_black_box_ass(srt, run_dir / "subtitles.ass", ranges)
    output = run_dir / (
        "preview.png" if preview_second is not None else "video.cht.blackbox.mp4"
    )
    command = [
        "ffmpeg",
        "-nostdin",
        "-n",
        "-v",
        "error",
        "-i",
        str(video),
        "-vf",
        "subtitles=filename=subtitles.ass",
    ]
    if preview_second is not None:
        command += ["-ss", str(preview_second), "-frames:v", "1"]
    else:
        command += [
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
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
            "-movflags",
            "+faststart",
        ]
    subprocess.run(command + [str(output)], cwd=ass.parent, check=True)
    if (
        preview_second is None
        and abs(
            MediaProcessor.get_media_duration(video)
            - MediaProcessor.get_media_duration(output)
        )
        > 2
    ):
        raise ValueError("輸出影片長度不符，請檢查；來源影片已保留")
    return output


def main() -> None:
    """Expose profile-based burn-in and screenshot previews as a local CLI."""
    import argparse

    parser = argparse.ArgumentParser(description="套用黑底大字字幕；原始影片保持不變")
    parser.add_argument("project_dir", type=Path)
    parser.add_argument(
        "--ranges", type=Path, help="日文字卡時段 JSON：[[開始秒, 結束秒], ...]"
    )
    parser.add_argument("--preview", type=float, help="只產生指定秒數的截圖")
    args = parser.parse_args()
    print(render_project(args.project_dir, args.ranges, args.preview))


if __name__ == "__main__":
    main()
