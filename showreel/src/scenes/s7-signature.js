// 07 — SIGNATURE. The name grows from thin-condensed to black-expanded while the
// dot hops into place as its full stop.
import { W, H, CX, CY, b, PAL, prog, lerp, clamp, rgba } from '../engine/core.js';
import { E } from '../engine/ease.js';
import { bg, circle, mono, serif, fillLayout } from '../engine/draw.js';
import { layoutCanvasText } from '../engine/type.js';
import { DOT } from './s6-range.js';

const pulse = (u, peak = 0.03) => (u <= 0 ? 0 : (u / peak) * Math.exp(1 - u / peak));

export function makeSignature({ font }) {
  const CAP = 188;
  const NAME = 'CLAUDE';
  const mid = (NAME.length - 1) / 2;
  const T0 = b(28);
  const HOP = 0.46;
  const mc = document.createElement('canvas').getContext('2d');
  const SUB = 'Motion Designer';
  const subFont = serif(92);
  const subL = layoutCanvasText(mc, SUB, subFont, 0);

  return {
    start: b(28),
    end: 15.001,
    draw(ctx, t) {
      bg(ctx, PAL.ink);
      const push = 1 + 0.03 * E.outCubic(prog(t, T0, 15 - T0));
      ctx.translate(CX, CY);
      ctx.scale(push, push);
      ctx.translate(-CX, -CY);

      const stag = (i) => T0 + Math.abs(i - mid) * 0.034;
      const grow = (i) => E.snap(prog(t, stag(i), 0.62));
      const L = font.layout(NAME, {
        cap: CAP,
        wdth: (i) => lerp(62, 125, grow(i)),
        wght: (i) => lerp(200, 900, grow(i)),
      });
      const dotR = CAP * 0.108;
      const gap = CAP * 0.07;
      const total = L.width + gap + dotR * 2;
      const x0 = CX - total / 2;
      const base = CY + CAP / 2 - 104;

      fillLayout(ctx, L, x0, base, (g) => {
        const p = E.snap(prog(t, stag(g.i), 0.5));
        if (p <= 0) return { skip: true };
        return { sx: lerp(0.55, 1, p), sy: lerp(1.5, 1, p), dy: (1 - p) * 70, pivotY: 1, fill: PAL.paper };
      });

      // Shine sweep across the letters.
      const sp = prog(t, b(29.6), 0.7);
      if (sp > 0 && sp < 1) {
        const clip = new Path2D();
        for (const g of L.glyphs) {
          if (!g.path) continue;
          const m = new DOMMatrix().translate(x0 + g.x, base).scale(g.s, g.s);
          clip.addPath(g.path, m);
        }
        ctx.save();
        ctx.clip(clip);
        const sx = lerp(x0 - 400, x0 + total + 400, E.inOutCubic(sp));
        const gr = ctx.createLinearGradient(sx - 160, 0, sx + 160, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(0.5, 'rgba(255,255,255,0.55)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gr;
        ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix().translate(sx, base).skewXSelf(-22).translate(-sx, -base)));
        ctx.fillRect(sx - 200, base - CAP - 40, 400, CAP + 80);
        ctx.restore();
      }

      // The dot hops from centre frame into the full-stop position.
      const px = x0 + L.width + gap + dotR;
      const py = base - dotR;
      const hp = prog(t, T0, HOP);
      const hx = lerp(CX, px, E.inOutSine(hp));
      const hy = lerp(CY, py, hp) - 330 * Math.sin(Math.PI * hp);
      const land = pulse(t - T0 - HOP, 0.035);
      const beatPulse = pulse(t - b(31), 0.05) * 0.22;
      const rr = lerp(DOT * 0.78, dotR, E.outCubic(hp)) * (1 + beatPulse);
      const stretch = Math.sin(Math.PI * hp) * 0.25;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.scale((1 - stretch * 0.5) * (1 + 0.32 * land), (1 + stretch) * (1 - 0.26 * land));
      ctx.fillStyle = PAL.orange;
      circle(ctx, 0, 0, rr);
      ctx.restore();

      // Subtitle: serif italic letters rise through a mask.
      const subY = base + 134;
      const sx0 = CX - subL.width / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, subY - 90, W, 116);
      ctx.clip();
      ctx.font = subFont;
      ctx.fillStyle = rgba(PAL.paper, 0.88);
      ctx.textAlign = 'left';
      for (const g of subL.glyphs) {
        const p = E.snap(prog(t, b(29) + g.x * 0.00032, 0.55));
        if (p <= 0) continue;
        ctx.fillText(g.ch, sx0 + g.x, subY + (1 - p) * 110);
      }
      ctx.restore();

      const lp = prog(t, b(29.7), 0.6);
      mono(ctx, 'SHOWREEL 2026  ·  EMOTION IN EVERY FRAME', CX, subY + 86, { size: 15, weight: 500, color: rgba(PAL.paper, 0.5), align: 'center', track: 5, reveal: lp, cursor: true });
    },
  };
}
