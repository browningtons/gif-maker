#!/usr/bin/env python3
"""High-quality GIF maker for screen recordings using FFmpeg.

This tool uses a two-pass FFmpeg palette workflow to preserve visual quality
while keeping file sizes manageable.
"""

from __future__ import annotations

import argparse
import dataclasses
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Sequence

SUPPORTED_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".mkv",
    ".webm",
    ".avi",
    ".m4v",
}


@dataclasses.dataclass(frozen=True)
class Preset:
    fps: int
    width: int
    colors: int
    dither: str
    bayer_scale: int


PRESETS = {
    "ultra": Preset(fps=20, width=1280, colors=256, dither="sierra2_4a", bayer_scale=2),
    "balanced": Preset(fps=15, width=960, colors=256, dither="sierra2_4a", bayer_scale=2),
    "compact": Preset(fps=12, width=720, colors=128, dither="bayer", bayer_scale=3),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert a screen recording to a high-quality GIF.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("input", help="Path to the input recording file")
    parser.add_argument("-o", "--output", help="Path for the output GIF")
    parser.add_argument(
        "--preset",
        choices=sorted(PRESETS.keys()),
        default="balanced",
        help="Quality/size preset",
    )
    parser.add_argument("--fps", type=int, help="Frames per second for output GIF")
    parser.add_argument("--width", type=int, help="Output width in pixels (maintains aspect ratio)")
    parser.add_argument("--colors", type=int, help="Palette size (2-256)")
    parser.add_argument(
        "--dither",
        choices=["none", "bayer", "floyd_steinberg", "sierra2", "sierra2_4a"],
        help="Dithering algorithm used by paletteuse",
    )
    parser.add_argument(
        "--bayer-scale",
        type=int,
        choices=range(0, 6),
        metavar="0-5",
        help="Bayer dithering scale (lower = finer pattern)",
    )
    parser.add_argument("--start", help="Start time (e.g. 00:00:03.200)")
    parser.add_argument("--end", help="End time (e.g. 00:00:08.000)")
    parser.add_argument("--duration", help="Duration (e.g. 4.5 or 00:00:04.500)")
    parser.add_argument("--speed", type=float, default=1.0, help="Playback speed multiplier")
    parser.add_argument("--crop", help="Crop region as width:height:x:y")
    parser.add_argument("--loop", type=int, default=0, help="GIF loop count (0 = infinite)")
    parser.add_argument(
        "--optimize",
        action="store_true",
        help="Run gifsicle after conversion for extra compression (if installed)",
    )
    parser.add_argument(
        "--lossy",
        type=int,
        metavar="N",
        help="Use gifsicle lossy compression level N (requires --optimize)",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite output file if it already exists",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print generated commands without running them",
    )
    return parser.parse_args()


def ensure_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise SystemExit(f"Required tool '{name}' was not found in PATH.")
    return path


def resolve_settings(args: argparse.Namespace) -> Preset:
    base = PRESETS[args.preset]
    return Preset(
        fps=args.fps if args.fps is not None else base.fps,
        width=args.width if args.width is not None else base.width,
        colors=args.colors if args.colors is not None else base.colors,
        dither=args.dither if args.dither is not None else base.dither,
        bayer_scale=args.bayer_scale if args.bayer_scale is not None else base.bayer_scale,
    )


def validate_args(args: argparse.Namespace, settings: Preset) -> None:
    in_path = Path(args.input)
    if not in_path.exists() or not in_path.is_file():
        raise SystemExit(f"Input file not found: {in_path}")
    if in_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        print(
            f"Warning: extension '{in_path.suffix}' is uncommon for screen recordings. Continuing.",
            file=sys.stderr,
        )

    if args.duration and args.end:
        raise SystemExit("Use either --duration or --end, not both.")

    if settings.width <= 0:
        raise SystemExit("--width must be > 0")

    if settings.colors < 2 or settings.colors > 256:
        raise SystemExit("--colors must be between 2 and 256")

    if args.speed <= 0:
        raise SystemExit("--speed must be > 0")

    out_path = output_path(args)
    if out_path.exists() and not args.overwrite:
        raise SystemExit(
            f"Output already exists: {out_path}\n"
            "Use --overwrite to replace it."
        )


def output_path(args: argparse.Namespace) -> Path:
    if args.output:
        out = Path(args.output)
    else:
        inp = Path(args.input)
        out = inp.with_suffix(".gif")
    return out


def build_common_input_args(args: argparse.Namespace) -> list[str]:
    cmd = ["-i", args.input]
    if args.start:
        cmd.extend(["-ss", args.start])
    if args.end:
        cmd.extend(["-to", args.end])
    elif args.duration:
        cmd.extend(["-t", args.duration])
    return cmd


def build_video_filter(settings: Preset, args: argparse.Namespace) -> str:
    filters: list[str] = [f"fps={settings.fps}"]
    if args.crop:
        filters.append(f"crop={args.crop}")
    filters.append(f"scale={settings.width}:-1:flags=lanczos")
    if args.speed != 1.0:
        filters.append(f"setpts=PTS/{args.speed}")
    return ",".join(filters)


def fmt_cmd(cmd: Sequence[str]) -> str:
    return " ".join(shlex.quote(part) for part in cmd)


def run_command(cmd: Sequence[str], dry_run: bool) -> None:
    print(fmt_cmd(cmd))
    if dry_run:
        return
    subprocess.run(cmd, check=True)


def maybe_optimize_gif(
    output: Path,
    settings: Preset,
    optimize: bool,
    lossy: int | None,
    dry_run: bool,
) -> None:
    if not optimize:
        return

    gifsicle = shutil.which("gifsicle")
    if not gifsicle:
        print("gifsicle not found; skipping optimization.", file=sys.stderr)
        return

    optimize_cmd = [
        gifsicle,
        "-O3",
        f"--colors={settings.colors}",
    ]
    if lossy is not None:
        if lossy < 0:
            raise SystemExit("--lossy must be >= 0")
        optimize_cmd.append(f"--lossy={lossy}")

    optimize_cmd.extend([str(output), "-o", str(output)])
    run_command(optimize_cmd, dry_run=dry_run)


def main() -> int:
    args = parse_args()
    settings = resolve_settings(args)
    validate_args(args, settings)

    ffmpeg = ensure_tool("ffmpeg")
    out = output_path(args)
    out.parent.mkdir(parents=True, exist_ok=True)

    video_filter = build_video_filter(settings, args)
    common_input = build_common_input_args(args)

    with tempfile.NamedTemporaryFile(prefix="gif_palette_", suffix=".png", delete=False) as temp:
        palette_path = Path(temp.name)

    palette_cmd = [
        ffmpeg,
        "-y",
        *common_input,
        "-frames:v",
        "1",
        "-update",
        "1",
        "-vf",
        f"{video_filter},palettegen=max_colors={settings.colors}:stats_mode=full",
        str(palette_path),
    ]

    render_filter = (
        f"{video_filter}[x];"
        f"[x][1:v]paletteuse=dither={settings.dither}:bayer_scale={settings.bayer_scale}:diff_mode=rectangle"
    )
    render_cmd = [
        ffmpeg,
        "-y",
        *common_input,
        "-i",
        str(palette_path),
        "-lavfi",
        render_filter,
        "-loop",
        str(args.loop),
        str(out),
    ]

    try:
        run_command(palette_cmd, dry_run=args.dry_run)
        run_command(render_cmd, dry_run=args.dry_run)
        maybe_optimize_gif(
            output=out,
            settings=settings,
            optimize=args.optimize,
            lossy=args.lossy,
            dry_run=args.dry_run,
        )
    except subprocess.CalledProcessError as err:
        print(f"Conversion failed (exit code {err.returncode}).", file=sys.stderr)
        return err.returncode
    finally:
        if palette_path.exists() and not args.dry_run:
            try:
                os.remove(palette_path)
            except OSError:
                pass

    if not args.dry_run:
        size_mb = out.stat().st_size / (1024 * 1024)
        print(f"Created {out} ({size_mb:.2f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
