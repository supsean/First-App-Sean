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

## Recording

- Record (red circle, or ⌘R): the camera turns on, recording starts, a 3-2-1 countdown runs, then the text scrolls from the top. Press it again to stop.
- Videos are saved to Movies › Teleprompter as "Take <date> at <time>.mov", with sound. Click the "Saved" note to see the file in Finder.
- The camera button shows a small mirrored preview top-right, so you can frame yourself before recording. The saved video is not mirrored.
- First time you record, macOS asks for camera and microphone access. Click Allow.
- Space pauses the text while you keep recording. Scrolling stops at the end of the script but the recording keeps going until you stop it.
- The window is hidden from screen recordings and screen sharing, so it never shows up in your videos.
