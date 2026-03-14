from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

from app.stories.slides import SlideData

TEMPLATES_DIR = Path(__file__).parent / "templates"

TEMPLATE_MAP = {
    "cover": TEMPLATES_DIR / "slide-cover.html",
    "activity": TEMPLATES_DIR / "slide-activity.html",
    "summary": TEMPLATES_DIR / "slide-summary.html",
}

CHROMIUM_BIN = os.getenv("CHROMIUM_BIN", "chromium")


def render_slide_png(slide: SlideData, output_path: Path) -> None:
    """
    Render a SlideData object to a 1080x1920 PNG using headless Chromium.

    Args:
        slide: The slide data to render.
        output_path: Destination path for the PNG file.
    """
    template_path = TEMPLATE_MAP[slide.slide_type.value]
    data = _slide_to_dict(slide)

    # Write a temporary HTML file with __DATA__ injected
    with tempfile.NamedTemporaryFile(
        suffix=".html", mode="w", encoding="utf-8", delete=False
    ) as f:
        html = template_path.read_text(encoding="utf-8")
        # Inject data before </head>
        injection = f"<script>window.__DATA__ = {json.dumps(data, ensure_ascii=False)};</script>"
        html = html.replace("</head>", f"{injection}\n</head>", 1)
        f.write(html)
        tmp_html = f.name

    try:
        result = subprocess.run(
            [
                CHROMIUM_BIN,
                "--headless=new",
                "--no-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                f"--window-size=1080,1920",
                f"--screenshot={output_path}",
                f"file://{tmp_html}",
            ],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"Chromium failed (exit {result.returncode}): "
                f"{result.stderr.decode('utf-8', errors='replace')[:500]}"
            )
    finally:
        Path(tmp_html).unlink(missing_ok=True)


def _slide_to_dict(slide: SlideData) -> dict:
    return {
        "slide_type": slide.slide_type.value,
        "day_number": slide.day_number,
        "day_date": slide.day_date,
        "day_city": slide.day_city,
        "day_caption": slide.day_caption,
        "total_activities": slide.total_activities,
        "total_photos": slide.total_photos,
        "activity_title": slide.activity_title,
        "activity_location": slide.activity_location,
        "activity_time": slide.activity_time,
        "photo_urls": slide.photo_urls,
        "photo_captions": slide.photo_captions,
        "activity_titles": slide.activity_titles,
    }
