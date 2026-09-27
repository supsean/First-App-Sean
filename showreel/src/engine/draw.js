// Canvas helpers shared by the scenes.
import { W, H, TAU, clamp } from './core.js';

// Full-frame fill that ignores the current camera transform.
export function bg(ctx, color) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

export function circle(ctx, x, y, r) {
  if (r <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

export function ring(ctx, x, y, r, a0 = 0, a1 = TAU) {
  if (r <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, r, a0, a1);
  ctx.stroke();
}

export function clipRect(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Monospace label with tracking and an optional typewriter reveal (0..1).
export function mono(ctx, str, x, y, { size = 15, weight = 500, color = '#fff', align = 'left', track = 2, reveal = 1, cursor = false, baseline = 'alphabetic' } = {}) {
  const n = Math.floor(clamp(reveal) * str.length + 1e-6);
  const s = str.slice(0, n);
  ctx.font = `${weight} ${size}px "JetBrains Mono"`;
  ctx.letterSpacing = `${track}px`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  if (cursor && reveal > 0 && reveal < 1) {
    const full = ctx.measureText(str).width;
    const wv = ctx.measureText(s).width;
    const cx = align === 'left' ? x + wv : align === 'right' ? x - full + wv : x - full / 2 + wv;
    ctx.fillRect(cx + 2, y - size * 0.8, size * 0.55, size);
  }
  ctx.letterSpacing = '0px';
  return ctx.measureText(str).width;
}

// Font string for the serif accent face.
export const serif = (px, italic = true) => `${italic ? 'italic ' : ''}400 ${px}px "Instrument Serif"`;

// Draws a Path2D-based glyph layout; `each(g)` may return per-letter overrides.
export function fillLayout(ctx, L, x0, y0, each) {
  for (const g of L.glyphs) {
    if (!g.path) continue;
    const o = each ? each(g) : null;
    if (o && o.skip) continue;
    ctx.save();
    const bb = g.path.bbox;
    const px = x0 + g.x + (o?.dx || 0);
    const py = y0 + (o?.dy || 0);
    const cxl = (bb.x + bb.w / 2) * g.s;
    const cyl = (bb.y + bb.h * (o?.pivotY ?? 0.5)) * g.s;
    ctx.translate(px + cxl, py + cyl);
    if (o?.rot) ctx.rotate(o.rot);
    if (o?.sx !== undefined || o?.sy !== undefined) ctx.scale(o.sx ?? 1, o.sy ?? 1);
    ctx.translate(-cxl, -cyl);
    ctx.scale(g.s, g.s);
    if (o?.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    if (o?.fill) ctx.fillStyle = o.fill;
    if (o?.stroke) {
      ctx.strokeStyle = o.stroke;
      ctx.lineWidth = (o.lineWidth || 2) / g.s;
      ctx.lineJoin = 'round';
      ctx.stroke(g.path);
    } else {
      ctx.fill(g.path);
    }
    ctx.restore();
  }
}
