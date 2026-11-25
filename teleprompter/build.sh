#!/bin/bash
# Builds Teleprompter.app next to this script.
# Needs Apple's command line tools once:  xcode-select --install
set -euo pipefail
cd "$(dirname "$0")"

APP="Teleprompter.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O -target arm64-apple-macos12 Sources/main.swift -o /tmp/tp-arm64
swiftc -O -target x86_64-apple-macos12 Sources/main.swift -o /tmp/tp-x86_64
lipo -create /tmp/tp-arm64 /tmp/tp-x86_64 -output "$APP/Contents/MacOS/Teleprompter"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Teleprompter</string>
  <key>CFBundleDisplayName</key><string>Teleprompter</string>
  <key>CFBundleIdentifier</key><string>com.sean.teleprompter</string>
  <key>CFBundleExecutable</key><string>Teleprompter</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.1</string>
  <key>CFBundleVersion</key><string>2</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSCameraUsageDescription</key><string>Teleprompter uses the camera to record your video while you read.</string>
  <key>NSMicrophoneUsageDescription</key><string>Teleprompter uses the microphone to record your voice with the video.</string>
</dict>
</plist>
PLIST

codesign --force --deep --sign - "$APP"
echo "Built $(pwd)/$APP"
