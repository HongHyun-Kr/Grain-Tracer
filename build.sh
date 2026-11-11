#!/bin/bash
# Builds "Grain Tracer.app" (Apple Silicon + Intel where the toolchain allows) with the Xcode Command Line Tools — no Xcode project needed.
#   xcode-select --install   # once, if swiftc is missing
#   ./build.sh               # → build/Grain Tracer.app
set -euo pipefail
cd "$(dirname "$0")"

APP="build/Grain Tracer.app"
rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"

if command -v python3 >/dev/null 2>&1; then
  echo "▸ Building index.html from src/"
  python3 tools/build_web.py
fi

echo "▸ Compiling Swift shell"
# Universal when the toolchain has both slices; recent Command Line Tools ship arm64-only Swift libraries,
# so an architecture that fails to link is skipped (GitHub Actions builds the Universal release).
BINS=()
for arch in arm64 x86_64; do
  if swiftc -O -target "$arch-apple-macos12" -o "build/GrainTracer-$arch" mac/main.swift \
       -framework Cocoa -framework WebKit -framework UniformTypeIdentifiers 2> "build/swiftc-$arch.log"; then
    BINS+=("build/GrainTracer-$arch"); echo "  $arch ✓"
  else
    echo "  $arch skipped (this toolchain cannot build it — see build/swiftc-$arch.log)"
  fi
done
if [ ${#BINS[@]} -eq 0 ]; then cat build/swiftc-arm64.log; exit 1; fi
lipo -create -output "$APP/Contents/MacOS/GrainTracer" "${BINS[@]}"
rm -f "${BINS[@]}"

echo "▸ Copying web UI and Info.plist"
cp index.html "$APP/Contents/Resources/web/index.html"
cp mac/Info.plist "$APP/Contents/Info.plist"

echo "▸ Building icon"
ICONSET="build/AppIcon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s mac/icon_1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z $d $d mac/icon_1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$ICONSET"

echo "▸ Ad-hoc signing"
codesign --force --deep --sign - "$APP" >/dev/null

echo "✓ Built: $APP"
echo "  Run:   open \"$APP\""
