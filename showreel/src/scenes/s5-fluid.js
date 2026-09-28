// 05 — FLUIDITY. The dot returns as liquid glass: it undergoes mitosis on the
// beat, orbits over marquee type it refracts, then everything re-merges,
// fills with orange and condenses back into the dot.
import { W, H, CX, CY, b, PAL, TAU, prog, lerp, clamp, rgba } from '../engine/core.js';
import { E } from '../engine/ease.js';
import { bg, circle, mono, fillLayout } from '../engine/draw.js';
import { Fluid } from '../engine/fluid.js';
import { DOT } from './s6-range.js';

const pulse = (u, peak = 0.04) => (u <= 0 ? 0 : (u / peak) * Math.exp(1 - u / peak));

export function makeFluid({ font }) {
  const fluid = new Fluid(W, H);
  const back = document.createElement('canvas');
  back.width = W;
  back.height = H;
  const bctx = back.getContext('2d', { alpha: false });

  const CAP = 150;
  const GAP = 150;
  const words = ['FLUID', 'FORMS', 'FLUID', 'FORMS'];
  const layouts = words.map((w) => font.layout(w, { cap: CAP, wdth: 125, wght: 900 }));
  const rows = [
    { y: CY - 342, dir: -1, outline: true, speed: 170 },
    { y: CY - 114, dir: 1, outline: false, speed: 230 },
    { y: CY + 114, dir: -1, outline: false, speed: 200 },
    { y: CY + 342, dir: 1, outline: true, speed: 150 },
  ];

  const whipX = (t) => W * 0.95 * (1 - E.outExpo(prog(t, b(20), 0.42)));

  const drawBack = (t) => {
    const x0 = whipX(t);
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.fillStyle = PAL.blue;
    bctx.fillRect(0, 0, W, H);
    rows.forEach((row, k) => {
      const L = layouts[k];
      const unit = L.width + GAP;
      let off = (row.dir * row.speed * (t - b(20)) + k * 237) % unit;
      if (off > 0) off -= unit;
      const base = row.y + CAP / 2;
      for (let x = off - unit + x0 * (k % 2 ? 1.12 : 1); x < W + unit; x += unit) {
        if (x + L.width < -40 || x > W + 40) continue;
        if (row.outline) {
          bctx.fillStyle = PAL.paper;
          fillLayout(bctx, L, x, base, () => ({ stroke: PAL.paper, lineWidth: 3 }));
        } else {
          bctx.fillStyle = PAL.paper;
          fillLayout(bctx, L, x, base);
        }
        bctx.fillStyle = PAL.orange;
        circle(bctx, x + L.width + GAP / 2, base - 16, 16);
      }
    });
  };

  // Blob choreography. Four balls start coincident (one blob), split into two
  // groups, then into four, orbit, then merge and condense into the dot.
  const blobs = (t) => {
    const x0 = whipX(t);
    const split1 = E.inOutCubic(prog(t, b(20.5), 0.4));
    const split2 = E.inOutCubic(prog(t, b(21), 0.4));
    const merge = E.inOutCubic(prog(t, b(23), b(0.75)));
    const shrink = E.inOutQuart(prog(t, b(23.3), b(24) - b(23.3)));
    const kick = 1 + 0.07 * (pulse(t - b(20), 0.05) + pulse(t - b(21), 0.05) + pulse(t - b(22), 0.05) + pulse(t - b(23), 0.05));
    const orbit = 0.85 * (t - b(21)) * (t > b(21) ? 1 : 0) + 0.9 * E.inOutCubic(prog(t, b(21), b(1.5)));
    const R = 128 * kick;
    const out = [];
    const groups = [-1, 1];
    for (const gx of groups) {
      for (const gy of [-1, 1]) {
        const ang = Math.atan2(gy * split2 * 0.75, gx) + orbit * (1 + 0.1 * gx);
        const rad = (300 * split1 + 70 * split2 * gy * gx) * (1 - merge);
        const wob = 26 * Math.sin(t * 5.1 + gx * 2 + gy) * split2 * (1 - merge);
        out.push({
          x: CX + x0 + Math.cos(ang) * (rad + wob),
          y: CY + Math.sin(ang) * (rad + wob) * 0.8 + gy * 150 * split2 * (1 - merge) * 0.5,
          r: R * (1 - shrink) + (DOT / 2) * shrink,
        });
      }
    }
    // Two satellites flick out of the pack and fall back in.
    const sat = prog(t, b(21.5), b(1.6));
    if (sat > 0 && sat < 1) {
      const s = Math.sin(Math.PI * sat);
      for (const k of [0, 1]) {
        const a = -orbit * 1.6 + k * Math.PI + 0.6;
        out.push({ x: CX + x0 + Math.cos(a) * 380 * s, y: CY + Math.sin(a) * 300 * s, r: 44 * s * (1 - merge) });
      }
    }
    return out;
  };

  return {
    start: b(20),
    end: b(24),
    draw(ctx, t) {
      drawBack(t);
      const fill = E.inOutCubic(prog(t, b(23.2), b(0.7)));
      const flat = E.inOutCubic(prog(t, b(23.55), b(0.4)));
      const out = fluid.render(back, blobs(t), { fill, fillCol: [1, 0.31, 0.12], refract: 118, flat, shadow: 1 - flat });
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(out, 0, 0);
      ctx.restore();

      // Annotation callout tracking the pack.
      const cp = prog(t, b(21.6), 0.3) * (1 - prog(t, b(22.9), 0.15));
      if (cp > 0) {
        const bl = blobs(t)[1];
        const ax = bl.x + bl.r * 0.7;
        const ay = bl.y - bl.r * 0.7;
        const lx = ax + 110;
        const ly = ay - 90;
        ctx.strokeStyle = rgba(PAL.paper, 0.85 * cp);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(lx, ly);
        ctx.lineTo(lx + 160 * cp, ly);
        ctx.stroke();
        ctx.fillStyle = rgba(PAL.paper, cp);
        circle(ctx, ax, ay, 4);
        mono(ctx, 'IOR 1.33', lx + 4, ly - 12, { size: 13, weight: 600, color: rgba(PAL.paper, 0.9), track: 3, reveal: cp });
        mono(ctx, 'REFRACTION', lx + 4, ly + 22, { size: 13, weight: 400, color: rgba(PAL.paper, 0.7), track: 3, reveal: cp });
      }
    },
  };
}
