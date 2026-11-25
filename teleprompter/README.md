# Teleprompter

Minimal Mac teleprompter. Opens as a black 4:3 window at the top of your screen, right under the camera. Type or paste your script, hit play, read.

## Get the app

Option A, download: GitHub repo > Actions > "Build Teleprompter" > latest run > download "Teleprompter". Unzip, drag Teleprompter.app into Applications. First launch: right-click the app > Open (it isn't from the App Store, so macOS asks once).

Option B, build it yourself (needs `xcode-select --install` once):

```bash
bash teleprompter/build.sh
```

## Controls

- Play / pause: the play button, or ⌘ Return. Space also pauses while it's running.
- Back to top: the circular arrow, or Esc.
- Speed and text size: the gear icon. Speed is in words per minute (default 140).
- While playing, ↑ / ↓ nudges the text if you fall behind or get ahead.
- Move the window by dragging the thin strip at the top. Resize from the edges.
- Your script is saved automatically.
- The window is hidden from screen recordings and screen sharing, so it never shows up in your videos.
