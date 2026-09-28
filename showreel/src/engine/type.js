// Variable-font text engine. Glyph outlines are pre-sampled on a width x weight
// grid (tools/build-glyphs.mjs) and bilinearly interpolated here, so width and
// weight can animate continuously and per letter.
import { clamp } from './core.js';

function seg(arr, v) {
  const x = clamp(v, arr[0], arr[arr.length - 1]);
  for (let i = 0; i < arr.length - 1; i++) {
    if (x <= arr[i + 1]) return [i, i + 1, (x - arr[i]) / (arr[i + 1] - arr[i])];
  }
  return [arr.length - 2, arr.length - 1, 1];
}

export class VarFont {
  constructor(data) {
    this.d = data;
    this.upm = data.unitsPerEm;
    this.capRatio = data.capHeight / data.unitsPerEm;
    this.nW = data.wght.length;
    this.cache = new Map();
  }

  // Four (instance index, weight) pairs for bilinear interpolation.
  blend(wdth, wght) {
    const [a0, a1, fa] = seg(this.d.wdth, wdth);
    const [b0, b1, fb] = seg(this.d.wght, wght);
    const n = this.nW;
    return [
      a0 * n + b0, (1 - fa) * (1 - fb),
      a0 * n + b1, (1 - fa) * fb,
      a1 * n + b0, fa * (1 - fb),
      a1 * n + b1, fa * fb,
    ];
  }

  glyph(ch) {
    return this.d.glyphs[ch] || this.d.glyphs[' '];
  }

  advance(ch, wdth, wght) {
    const g = this.glyph(ch);
    const w = this.blend(wdth, wght);
    return g.adv[w[0]] * w[1] + g.adv[w[2]] * w[3] + g.adv[w[4]] * w[5] + g.adv[w[6]] * w[7];
  }

  kern(a, c, wdth, wght) {
    const k = this.d.kern[a + c];
    if (!k) return 0;
    const w = this.blend(wdth, wght);
    return k[w[0]] * w[1] + k[w[2]] * w[3] + k[w[4]] * w[5] + k[w[6]] * w[7];
  }

  coords(ch, wdth, wght) {
    const g = this.glyph(ch);
    const w = this.blend(wdth, wght);
    const A = g.coords[w[0]];
    const B = g.coords[w[2]];
    const C = g.coords[w[4]];
    const D = g.coords[w[6]];
    const out = new Float32Array(A.length);
    for (let i = 0; i < A.length; i++) out[i] = A[i] * w[1] + B[i] * w[3] + C[i] * w[5] + D[i] * w[7];
    return out;
  }

  // Path2D in font units, y pointing down, baseline at y = 0.
  path(ch, wdth = 100, wght = 900) {
    const key = ch + '|' + wdth.toFixed(1) + '|' + wght.toFixed(0);
    let p = this.cache.get(key);
    if (p) return p;
    const types = this.glyph(ch).types;
    const c = this.coords(ch, wdth, wght);
    p = new Path2D();
    let j = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const ext = (x, y) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };
    for (let i = 0; i < types.length; i++) {
      switch (types[i]) {
        case 'M': p.moveTo(c[j], -c[j + 1]); ext(c[j], -c[j + 1]); j += 2; break;
        case 'L': p.lineTo(c[j], -c[j + 1]); ext(c[j], -c[j + 1]); j += 2; break;
        case 'Q':
          p.quadraticCurveTo(c[j], -c[j + 1], c[j + 2], -c[j + 3]);
          ext(c[j + 2], -c[j + 3]);
          j += 4;
          break;
        case 'C':
          p.bezierCurveTo(c[j], -c[j + 1], c[j + 2], -c[j + 3], c[j + 4], -c[j + 5]);
          ext(c[j + 4], -c[j + 5]);
          j += 6;
          break;
        case 'Z': p.closePath(); break;
      }
    }
    p.bbox = minX === Infinity ? { x: 0, y: 0, w: 0, h: 0 } : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    if (this.cache.size > 6000) this.cache.clear();
    this.cache.set(key, p);
    return p;
  }

  // Lay out a string. wdth / wght may be numbers or (index) => number for per-letter variation.
  // Sizes are expressed by cap height in px. Returns glyph boxes in px relative to the origin (left, baseline).
  layout(str, { cap = 200, wdth = 100, wght = 900, track = 0 } = {}) {
    const size = cap / this.capRatio;
    const s = size / this.upm;
    const out = [];
    let x = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const wd = typeof wdth === 'function' ? wdth(i) : wdth;
      const wg = typeof wght === 'function' ? wght(i) : wght;
      const adv = this.advance(ch, wd, wg) * s;
      const path = ch === ' ' ? null : this.path(ch, wd, wg);
      out.push({ ch, i, x, adv, path, s, wd, wg });
      let step = adv + track * size;
      if (i < str.length - 1) {
        const nwd = typeof wdth === 'function' ? wdth(i + 1) : wdth;
        const nwg = typeof wght === 'function' ? wght(i + 1) : wght;
        step += this.kern(ch, str[i + 1], (wd + nwd) / 2, (wg + nwg) / 2) * s;
      }
      x += step;
    }
    const last = out[out.length - 1];
    const width = last ? last.x + last.adv : 0;
    return { glyphs: out, width, cap, size, s };
  }
}

// Fill (or stroke) a glyph at a position with optional transform around its visual centre.
export function drawGlyph(ctx, g, x, y, opt = {}) {
  if (!g.path) return;
  const { sx = 1, sy = 1, rot = 0, stroke = 0, pivotY = 0.5 } = opt;
  ctx.save();
  const bb = g.path.bbox;
  const cxl = (bb.x + bb.w / 2) * g.s;
  const cyl = (bb.y + bb.h * pivotY) * g.s;
  ctx.translate(x + cxl, y + cyl);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.translate(-cxl, -cyl);
  ctx.scale(g.s, g.s);
  if (stroke > 0) {
    ctx.lineWidth = stroke / g.s;
    ctx.lineJoin = 'round';
    ctx.stroke(g.path);
  } else {
    ctx.fill(g.path);
  }
  ctx.restore();
}

// Per-character layout for regular canvas fonts (serif / mono accents).
export function layoutCanvasText(ctx, str, font, track = 0) {
  ctx.font = font;
  const out = [];
  let x = 0;
  for (let i = 0; i < str.length; i++) {
    const w = ctx.measureText(str[i]).width;
    out.push({ ch: str[i], x, w });
    x += w + track;
  }
  return { glyphs: out, width: x - track };
}
