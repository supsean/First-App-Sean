// Frame dispatcher. renderFrame(n) draws `samples` sub-frames spread across the
// shutter interval and averages them on the GPU before the lens pass.
import { W, H, FPS, DURATION, clamp } from './engine/core.js';
import { Post } from './engine/post.js';
import { VarFont } from './engine/type.js';
import { buildTimeline } from './timeline.js';

const out = document.getElementById('out');
const post = new Post(out);
const layer = document.createElement('canvas');
layer.width = W;
layer.height = H;
const ctx = layer.getContext('2d', { alpha: false });

async function init() {
  await Promise.all([
    document.fonts.load('italic 100px "Instrument Serif"'),
    document.fonts.load('100px "Instrument Serif"'),
    document.fonts.load('400 100px "JetBrains Mono"'),
    document.fonts.load('600 100px "JetBrains Mono"'),
  ]);
  const data = await (await fetch('data/archivo-glyphs.json')).json();
  const font = new VarFont(data);
  // Scenes publish computed event times here so the soundtrack can sync to them.
  const cues = {};
  const tl = buildTimeline({ font, W, H, cue: (k, v) => (cues[k] = v) });
  window.cues = cues;

  const drawAt = (t) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    tl.draw(ctx, t);
  };

  const pixels = new Uint8Array(W * H * 4);

  // Sub-frames are spread across the shutter interval, but never across a hard cut:
  // the interval is clipped to whichever side of the cut the frame belongs to.
  window.renderFrame = (frame, samples = 1, shutter = 0.5) => {
    const T = frame / FPS;
    let lo = T - shutter / 2 / FPS;
    let hi = T + shutter / 2 / FPS;
    for (const c of tl.cuts) {
      if (c > lo && c <= hi) {
        if (c <= T) lo = c;
        else hi = c - 1e-6;
      }
    }
    const K = samples === 1 ? 1 : Math.max(1, Math.round(samples * tl.boost(T)));
    post.begin();
    for (let k = 0; k < K; k++) {
      const t = K === 1 ? T : lo + ((k + 0.5) / K) * (hi - lo);
      drawAt(clamp(t, 0, DURATION - 1e-4));
      post.add(layer, 1 / K);
    }
    post.finish(frame, tl.fx(T));
    return K;
  };

  // Raw RGBA (bottom-up) as base64 for the Node side.
  window.readFrame = () => {
    post.read(pixels);
    if (pixels.toBase64) return pixels.toBase64();
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < pixels.length; i += CH) s += String.fromCharCode.apply(null, pixels.subarray(i, i + CH));
    return btoa(s);
  };

  window.pngFrame = () => out.toDataURL('image/png');
  window.meta = { W, H, FPS, DURATION, frames: Math.round(DURATION * FPS) };
  window.ready = true;
}

init().catch((e) => {
  window.initError = String(e && e.stack ? e.stack : e);
  console.error(e);
});
