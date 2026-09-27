// Screen-space HUD: studio slate details that frame the whole reel.
import { W, H, BEAT, b, PAL, prog, rgba, lerp } from '../engine/core.js';
import { E } from '../engine/ease.js';
import { mono } from '../engine/draw.js';

export const CHAPTERS = [
  { t: 0, name: 'TIMING' },
  { t: b(4), name: 'TYPOGRAPHY' },
  { t: b(11), name: 'SYSTEMS' },
  { t: b(16), name: 'DIMENSION' },
  { t: b(20), name: 'FLUIDITY' },
  { t: b(24), name: 'RANGE' },
  { t: b(28), name: 'SIGNATURE' },
];

const pad = (n, l = 2) => String(n).padStart(l, '0');

export function makeHud({ colorAt, labelAt }) {
  const M = 48;
  const TOP = 60;
  const BOT = H - 46;
  return {
    draw(ctx, t) {
      const { top, bot } = colorAt(t);
      ctx.save();
      const rv = (d) => prog(t, 0.12 + d, 0.5);
      const cTop = rgba(top[0], top[1]);
      const c = rgba(bot[0], bot[1]);

      mono(ctx, 'CLAUDE', M, TOP, { size: 15, weight: 700, color: cTop, track: 3, reveal: rv(0) });
      mono(ctx, '/ MOTION DESIGN', M + 88, TOP, { size: 15, weight: 400, color: cTop, track: 3, reveal: rv(0.08) });
      mono(ctx, 'SHOWREEL ’26', W - M, TOP, { size: 15, weight: 500, color: cTop, align: 'right', track: 3, reveal: rv(0.04) });

      const f = Math.floor(t * 60 + 1e-6);
      const tc = `${pad(0)}:${pad(0)}:${pad(Math.floor(f / 60))}:${pad(f % 60)}`;
      mono(ctx, tc, M, BOT, { size: 15, weight: 500, color: c, track: 3, reveal: rv(0.1) });

      // Chapter slot: labels roll up like an odometer when they change.
      const { index, label, since, total, roll } = labelAt(t);
      const slotP = E.snap(prog(since, 0, roll));
      const prev = labelAt(t - since - 1e-4);
      ctx.save();
      ctx.beginPath();
      ctx.rect(W - 700, BOT - 20, 700 - M + 2, 28);
      ctx.clip();
      const txt = (l, i) => `${pad(i + 1)} / ${pad(total)}   ${l}`;
      const reveal = rv(0.14);
      if (since < roll && t > 0.5) {
        mono(ctx, txt(prev.label, prev.index), W - M, BOT - slotP * 26, { size: 15, weight: 500, color: c, align: 'right', track: 3 });
      }
      mono(ctx, txt(label, index), W - M, BOT + (t > 0.5 ? (1 - slotP) * 26 : 0), { size: 15, weight: 500, color: c, align: 'right', track: 3, reveal });
      ctx.restore();

      // Beat indicator dot.
      const beatPhase = (t % BEAT) / BEAT;
      const pulse = Math.exp(-beatPhase * 5);
      ctx.font = '500 15px "JetBrains Mono"';
      ctx.letterSpacing = '3px';
      const wLab = ctx.measureText(txt(label, index)).width;
      ctx.letterSpacing = '0px';
      if (reveal >= 1) {
        ctx.fillStyle = PAL.orange;
        ctx.beginPath();
        ctx.arc(W - M - wLab - 16, BOT - 5, 3.2 + 1.6 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}
