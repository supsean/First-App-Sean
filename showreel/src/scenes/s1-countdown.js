// 01 — TIMING. A modern film-leader countdown (3·2·1) that implodes into the
// orange dot, which then floods the frame on the drop.
import { W, H, CX, CY, BEAT, b, PAL, TAU, clamp, lerp, prog, fract, rgba } from '../engine/core.js';
import { E } from '../engine/ease.js';
import { bg, line, circle, ring, mono, fillLayout } from '../engine/draw.js';

export function makeCountdown({ font }) {
  const R = 318;
  const CAP = 300;
  const digits = ['3', '2', '1'];
  const SPACING = CAP * 1.45;

  return {
    start: 0,
    end: b(4),
    draw(ctx, t) {
      bg(ctx, PAL.ink);
      const tb = t / BEAT;

      // Implosion on beat 3: tiny anticipation swell, then everything collapses into the centre.
      const swell = E.outQuad(prog(t, b(3), 0.09)) * 0.05;
      const col = E.inExpo(prog(t, b(3) + 0.05, b(0.5) - 0.05));
      const S = (1 + swell) * (1 - col);
      const spin = E.inCubic(prog(t, b(3), b(0.5))) * 0.9;

      if (S > 0.001) {
        ctx.save();
        ctx.translate(CX, CY);
        ctx.rotate(spin);
        ctx.scale(S, S);

        // Crosshair
        const hx = E.outExpo(prog(t, 0.0, 0.7)) * (W * 0.62);
        const vy = E.outExpo(prog(t, 0.06, 0.7)) * (H * 0.62);
        ctx.strokeStyle = rgba(PAL.paper, 0.16);
        ctx.lineWidth = 1.5;
        line(ctx, -hx, 0, hx, 0);
        line(ctx, 0, -vy, 0, vy);

        // Sweep hand: one revolution per beat, film-leader style.
        const running = tb < 3;
        const handA = -Math.PI / 2 + TAU * fract(Math.min(tb, 2.9999));
        const drawP = E.outCubic(prog(t, 0, b(0.95)));
        if (running) {
          ctx.fillStyle = rgba(PAL.paper, 0.055);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, R, -Math.PI / 2, handA);
          ctx.closePath();
          ctx.fill();
        }

        // Rings drawn on by the first revolution.
        ctx.strokeStyle = rgba(PAL.paper, 0.55);
        ctx.lineWidth = 2;
        ring(ctx, 0, 0, R, -Math.PI / 2, -Math.PI / 2 + TAU * drawP);
        ctx.strokeStyle = rgba(PAL.paper, 0.2);
        ctx.lineWidth = 1.5;
        const drawP2 = E.outCubic(prog(t, 0.08, b(0.95)));
        ring(ctx, 0, 0, R - 46, -Math.PI / 2, -Math.PI / 2 + TAU * drawP2);

        // Tick marks with a glow trail behind the hand.
        for (let i = 0; i < 60; i++) {
          const f = i / 60;
          if (f > drawP) break;
          const a = -Math.PI / 2 + TAU * f;
          const major = i % 5 === 0;
          let behind = handA - a;
          behind = ((behind % TAU) + TAU) % TAU;
          const glow = running ? Math.exp(-behind / 0.9) : 0;
          ctx.strokeStyle = rgba(PAL.paper, 0.28 + 0.62 * glow);
          ctx.lineWidth = major ? 2 : 1.5;
          const r0 = R + 14;
          const r1 = R + (major ? 36 : 24);
          line(ctx, Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1);
        }

        if (running) {
          ctx.strokeStyle = rgba(PAL.paper, 0.7);
          ctx.lineWidth = 2;
          line(ctx, 0, 0, Math.cos(handA) * R, Math.sin(handA) * R);
        }

        // Odometer strip of digits, rolling up one slot per beat.
        let pos = -1;
        for (let k = 0; k < 3; k++) pos += E.snap(prog(t, b(k), 0.34));
        ctx.save();
        ctx.beginPath();
        ctx.rect(-CAP, -CAP * 0.72, CAP * 2, CAP * 1.44);
        ctx.clip();
        for (let k = 0; k < 3; k++) {
          const y = (k - pos) * SPACING;
          if (Math.abs(y) > SPACING) continue;
          const since = Math.max(0, t - b(k));
          const wg = lerp(260, 900, Math.exp(-since / 0.2));
          const L = font.layout(digits[k], { cap: CAP, wdth: 100, wght: wg });
          const punch = 1 + 0.07 * Math.exp(-since / 0.09);
          ctx.save();
          ctx.translate(0, y);
          ctx.scale(punch, punch);
          ctx.fillStyle = PAL.paper;
          fillLayout(ctx, L, -L.width / 2, CAP / 2);
          ctx.restore();
        }
        ctx.restore();

        // Label under the leader.
        const lp = prog(t, 0.08, 0.45);
        mono(ctx, 'PICTURE START', 0, R + 92, { size: 15, color: rgba(PAL.paper, 0.55), align: 'center', track: 4, reveal: lp });
        ctx.restore();
      }

      // The dot: appears as the leader collapses, breathes in, then floods the frame on the drop.
      const appear = E.outBackStrong(prog(t, b(3) + 0.16, 0.26));
      if (appear > 0) {
        const squeeze = 1 - 0.28 * E.inOutQuad(prog(t, b(3.5), 0.1)) + 0.28 * E.outQuad(prog(t, b(3.5) + 0.1, 0.06));
        const grow = E.inExpo(prog(t, b(3.56), b(4) - b(3.56)));
        const r = lerp(14 * appear * squeeze, Math.hypot(W, H) / 2 + 10, grow);
        ctx.fillStyle = PAL.orange;
        circle(ctx, CX, CY, r);

        // Shockwave ring when the dot lands.
        const sw = prog(t, b(3) + 0.2, 0.42);
        if (sw > 0 && sw < 1) {
          ctx.strokeStyle = rgba(PAL.orange, 0.8 * (1 - sw));
          ctx.lineWidth = 3 * (1 - sw) + 0.5;
          ring(ctx, CX, CY, 14 + E.outExpo(sw) * 160);
        }
      }
    },
  };
}
