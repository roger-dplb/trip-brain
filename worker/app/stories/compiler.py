from __future__ import annotations

import subprocess
import zipfile
from pathlib import Path


def compile_video(png_paths: list[Path], output_path: Path, hold_seconds: int = 5) -> None:
    """
    Compile a list of PNG slides into an MP4 video.

    Each slide is shown for `hold_seconds` seconds.
    Output codec: libx264, pixel format: yuv420p (Instagram-compatible).
    Resolution: 1080x1920.

    Args:
        png_paths: Ordered list of PNG slide paths.
        output_path: Destination .mp4 path.
        hold_seconds: How many seconds each slide is displayed.
    """
    if not png_paths:
        raise ValueError("No PNG slides to compile into video")

    # Write a concat file listing each image with its duration
    concat_file = output_path.parent / "concat.txt"
    with open(concat_file, "w", encoding="utf-8") as f:
        for png_path in png_paths:
            f.write(f"file '{png_path.resolve()}'\n")
            f.write(f"duration {hold_seconds}\n")
        # FFmpeg needs the last file listed twice to avoid cutting it short
        f.write(f"file '{png_paths[-1].resolve()}'\n")

    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(concat_file),
            "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,"
                   "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,"
                   "fps=30",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "23",
            "-an",
            str(output_path),
        ],
        capture_output=True,
        timeout=300,
    )

    concat_file.unlink(missing_ok=True)

    if result.returncode != 0:
        raise RuntimeError(
            f"FFmpeg failed (exit {result.returncode}): "
            f"{result.stderr.decode('utf-8', errors='replace')[-1000:]}"
        )


def create_zip(png_paths: list[Path], output_path: Path) -> None:
    """
    Bundle all PNG slides into a single ZIP archive.

    Args:
        png_paths: Ordered list of PNG slide paths.
        output_path: Destination .zip path.
    """
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, png_path in enumerate(png_paths):
            arcname = f"slide_{i:04d}.png"
            zf.write(png_path, arcname)
