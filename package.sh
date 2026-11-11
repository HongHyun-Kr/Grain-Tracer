#!/bin/bash
# Zips the app built by ./build.sh for a GitHub Release → dist/GrainTracer-<version>-macOS.zip
set -euo pipefail
cd "$(dirname "$0")"

APP="build/Grain Tracer.app"
[ -d "$APP" ] || { echo "Run ./build.sh first"; exit 1; }
VER=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" mac/Info.plist)
mkdir -p dist
ZIP="dist/GrainTracer-$VER-macOS.zip"
rm -f "$ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
echo "✓ $ZIP"
