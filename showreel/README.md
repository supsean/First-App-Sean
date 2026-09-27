# Claude, Motion Reel 2026

A 15-second motion design showreel built entirely in code. Every frame is drawn in headless Chromium, and the soundtrack is synthesized from scratch on the same 128 BPM grid, so picture and sound are locked to the sample.

**Watch:** [`claude-showreel.mp4`](claude-showreel.mp4) (1920×1080, 60 fps, stereo)

## The idea

One orange dot threads the whole piece. It starts as the centre of a film-leader countdown and ends as the full stop in the name. Seven chapters, eight bars.

1. **Timing** (0:00). A modern film-leader countdown with variable-weight numerals that implodes into the dot, which floods the frame on the drop.
2. **Typography** (0:01.9). MOTION slams in, breaks into a variable-width wave, and an italic E punches in to make EMOTION. Then "every FRAME." lands letter by letter, the brackets autofocus onto the full stop, and the camera dives into it.
3. **Systems** (0:05.2). The camera pulls out of the dot into a Bauhaus tile grid that rotates and card-flips in waves, resolving into a pixel circle.
4. **Dimension** (0:07.5). The grid tilts into perspective and extrudes into a field of boxes. Ripples fire from the orange core on every kick, then a whip pan.
5. **Fluidity** (0:09.4). The dot returns as liquid glass: mitosis on the beat, refraction and dispersion over moving type, then it condenses back into the dot.
6. **Range** (0:11.3). A match-cut montage. The dot never moves while the world around it changes on every eighth note, followed by half a beat of silence.
7. **Signature** (0:13.1). The name grows from thin-condensed to black-expanded while the dot hops into place as its full stop.

## Craft notes

- **Real motion blur.** 12 to 24 sub-frames per frame, accumulated in linear light on the GPU. The shutter is clipped at hard cuts so cuts stay clean.
- **Variable-font animation.** Archivo's width and weight axes are pre-sampled with fontkit and interpolated per letter, which Canvas alone can't do.
- **Liquid glass.** A custom WebGL metaball shader with refraction, chromatic dispersion, a fresnel rim, specular highlights and contact shadows.
- **3D without a 3D engine.** The box field is projected and depth-sorted by hand, with fog and a key light.
- **Lens pass.** Chromatic aberration that pulses on hits, camera shake, grain and vignette.
- **Sound design.** Kick, clap, 808-style hats, bass, supersaw plucks, risers, and around 60 sync points: letter landings, bracket snaps, the autofocus beep, tile flips panned across the stereo field, glass droplets, an underwater filter for the fluid chapter, and half a beat of near-silence before the final hit.

## Render it yourself

Needs Node 18+, Playwright with Chromium, and an ffmpeg build with libx264.

```sh
cd showreel
npm install
npm install --no-save playwright && npx playwright install chromium
pip install imageio-ffmpeg        # or point FFMPEG at your own ffmpeg
npm run render                    # about 15 minutes on 4 cores
npm run stills -- 2.9,13.8        # quick PNG stills at given times, into out/stills
```

The pipeline: `tools/audio.mjs` writes the soundtrack, `tools/render.mjs` drives Chromium frame by frame, and `tools/render-all.mjs` renders chunks in parallel and encodes the final H.264/AAC file. Scene code lives in `src/scenes`, one file per chapter.

Fonts: Archivo, Instrument Serif and JetBrains Mono, all under the SIL Open Font License (see `assets/fonts`).
