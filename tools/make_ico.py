#!/usr/bin/env python3
"""mac/icon_1024.png → win/icon.ico (16–256 px), so the Windows app uses the same icon as the macOS app.
   python3 tools/make_ico.py      (needs Pillow: pip install pillow)
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
src = Image.open(ROOT / "mac" / "icon_1024.png").convert("RGBA")
src.save(ROOT / "win" / "icon.ico", sizes=[(s, s) for s in (16, 20, 24, 32, 40, 48, 64, 128, 256)])
print("win/icon.ico")
