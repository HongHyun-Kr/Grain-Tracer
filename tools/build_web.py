#!/usr/bin/env python3
"""Builds index.html (one self-contained file) from src/ and vendor/.
   python3 tools/build_web.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
read = lambda p: (ROOT / p).read_text(encoding="utf-8")
script = lambda body: f"<script>\n{body.rstrip()}\n</script>\n"

html = (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + read("src/ui.html").rstrip() + "\n"
    + script(read("vendor/pako_inflate.min.js"))   # TIFF deflate (MIT)
    + script(read("vendor/UTIF.js"))               # TIFF decoder (MIT)
    + script(read("src/gbcore.js"))                # boundary detection and grain metrics
    + script(read("src/app.js"))                   # UI, statistics, plots, export
    + script(read("src/help.js"))                  # "?" help pop-ups (EN / KO)
    + "</html>\n"
)
(ROOT / "index.html").write_text(html, encoding="utf-8")
print(f"index.html  {len(html.encode('utf-8')) / 1024:.0f} KB")
