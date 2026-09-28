// 02 — TYPOGRAPHY. MOTION slams in, breaks into a variable-width wave, an italic
// "E" punches in to make EMOTION, then "every FRAME." lands and the frame
// expands to fill the screen.
import { W, H, CX, CY, BEAT, b, PAL, TAU, clamp, lerp, prog, rgba } from '../engine/core.js';
import { E } from '../engine/ease.js';
import { bg, circle, mono, serif, fillLayout } from '../engine/draw.js';

// Pulse that rises to 1 at `peak` seconds then decays.
const pulse = (u, peak = 0.03) => (u <= 0 ? 0 : (u / peak) * Math.exp(1 - u / peak));

export function makeType({ font, cue }) {
  // Measure the serif face once so we can size it by cap height.
  const mc = document.createElement('canvas').getContext('2d');
  mc.font = serif(1000);
  const serifCap = mc.measureText('E').actualBoundingBoxAscent / 1000;

  // Part C geometry (EMOTION).
  const capC = 300;
  const LM = font.layout('MOTION', { cap: capC, wdth: 62, wght: 900 });
  const eSize = (capC * 1.2) / serifCap;
  mc.font = serif(eSize);
  const eW = mc.measureText('E').width;
  const gapC = capC * 0.04;
  const totalC = eW + gapC + LM.width;
  const finalXE = CX - totalC / 2;
  const startXM = CX - LM.width / 2;
  const eStart = b(6) - 0.12;
  const eDur = 0.5;
  const eX = (t) => lerp(-eW - 260, finalXE, E.outExpo(prog(t, eStart, eDur)));
  let tContact = b(6);
  for (let tt = eStart; tt < eStart + eDur; tt += 0.001) {
    if (eX(tt) + eW + gapC >= startXM) {
      tContact = tt;
      break;
    }
  }

  cue('eContact', tContact);

  // Part E geometry (every FRAME.).
  const capE = 230;
  const LF = font.layout('FRAME', { cap: capE, wdth: 112, wght: 900 });
  const dotR = capE * 0.108;
  const totalF = LF.width + capE * 0.07 + dotR * 2;
  const xF = CX - totalF / 2;
  const baseF = CY + capE / 2 + 34;
  const dotX = xF + LF.width + capE * 0.07 + dotR;
  const dotY = baseF - dotR;
  const box = { x: xF - 56, y: baseF - capE - 44, w: totalF + 112, h: capE + 88 };
  const everySize = 150;
  mc.font = serif(everySize);
  const everyW = mc.measureText('every').width;

  const partA = (ctx, t) => {
    bg(ctx, PAL.orange);
    const cap = 360;
    const wd = lerp(62, 71, E.outQuad(prog(t, b(4), b(1))));
    const L = font.layout('MOTION', { cap, wdth: wd, wght: 900 });
    const z = lerp(1.1, 1, E.outExpo(prog(t, b(4), 0.8)));
    ctx.translate(CX, CY);
    ctx.scale(z, z);
    ctx.translate(-CX, -CY);
    const x0 = CX - L.width / 2;
    const base = CY + cap / 2;
    ctx.fillStyle = PAL.ink;
    for (const g of L.glyphs) {
      const p = E.snap(prog(t, b(4) + g.i * 0.034, 0.62));
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 + g.x - 30, base - cap - 60, g.adv + 60, cap + 72);
      ctx.clip();
      fillLayout(ctx, { glyphs: [g] }, x0, base + (1 - p) * cap * 1.18);
      ctx.restore();
    }
  };

  const partB = (ctx, t) => {
    bg(ctx, PAL.ink);
    const cap = 176;
    const pitch = 214;
    const spread = E.snap(prog(t, b(5), 0.42)) * (1 - E.inExpo(prog(t, b(6) - 0.17, 0.17)));
    const rows = [-2, -1, 1, 2, 0];
    for (const k of rows) {
      const phase = (TAU * (t - b(5))) / b(1) - Math.abs(k) * 0.95;
      const wd = 62 + 63 * (0.5 - 0.5 * Math.cos(phase));
      const wg = k === 0 ? 900 : lerp(900, 500, Math.abs(k) / 2);
      const L = font.layout('MOTION', { cap, wdth: wd, wght: wg });
      const drift = (k % 2 === 0 ? 1 : -1) * 90 * (t - b(5));
      const y = CY + k * pitch * spread + cap / 2;
      const x = CX - L.width / 2 + (k === 0 ? 0 : drift);
      if (k === 0) {
        ctx.fillStyle = PAL.paper;
        fillLayout(ctx, L, x, y);
      } else {
        const a = Math.abs(k) === 1 ? 0.6 : 0.32;
        fillLayout(ctx, L, x, y, () => ({ stroke: rgba(PAL.paper, a * spread), lineWidth: 2 }));
      }
    }
  };

  const partC = (ctx, t) => {
    bg(ctx, PAL.ink);
    const base = CY + capC / 2;
    const xe = eX(t);
    const u = t - tContact;
    const recoil = u > 0 ? 26 * Math.exp(-u / 0.12) * Math.sin(u * 26) : 0;
    const xm = Math.max(startXM, xe + eW + gapC) + recoil;

    // MOTION with a compression ripple from the impact, then a hop wave on beat 7.
    ctx.fillStyle = PAL.paper;
    fillLayout(ctx, LM, xm, base, (g) => {
      const q = pulse(u - g.i * 0.028, 0.035);
      const hop = pulse(t - (b(7) + g.i * 0.045), 0.07);
      return { sx: 1 - 0.16 * q, sy: 1 + 0.05 * q, dy: -hop * 26, pivotY: 1 };
    });

    // The italic E.
    const rot = lerp(-0.35, 0, E.outBack(prog(t, eStart, 0.45)));
    ctx.save();
    ctx.translate(xe + eW / 2, base);
    ctx.rotate(rot);
    const sq = 1 + 0.1 * pulse(u, 0.03);
    ctx.scale(1 / sq, sq);
    ctx.font = serif(eSize);
    ctx.fillStyle = PAL.orange;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('E', 0, 0);
    ctx.restore();

    // Caption after the hit.
    const cp = prog(t, b(6.5), 0.35);
    mono(ctx, 'MOTION  +  E  =  EMOTION', CX, base + 96, { size: 16, color: rgba(PAL.paper, 0.6), align: 'center', track: 5, reveal: cp, cursor: true });
  };

  const partE = (ctx, t) => {
    // Camera dive into the period: log-space zoom around the dot while panning it to centre.
    const zp = prog(t, b(10.5), b(11) - b(10.5));
    // Zoom far enough that the dot covers the whole frame for the last couple of frames.
    const Z = Math.exp(Math.log(1100) * E.inQuart(zp));
    const pan = E.inOutCubic(zp);
    ctx.translate(lerp(dotX, CX, pan), lerp(dotY, CY, pan));
    ctx.scale(Z, Z);
    ctx.translate(-dotX, -dotY);

    // Local fill (not bg()) so the push transition can slide this frame in.
    ctx.fillStyle = PAL.paper;
    ctx.fillRect(-W, -H, W * 3, H * 3);

    ctx.fillStyle = PAL.ink;
    fillLayout(ctx, LF, xF, baseF, (g) => {
      const dt = t - (b(8) + g.i * 0.045);
      if (dt < 0) return { skip: true };
      const fall = 1 - E.outBounce(clamp(dt / 0.5));
      const rot = (1 - E.outBack(clamp(dt / 0.42))) * (g.i % 2 ? 0.25 : -0.25);
      return { dy: -fall * capE * 1.9, rot };
    });

    // The period is our dot, bouncing in last.
    const dd = t - b(8.5);
    if (dd > 0) {
      const fall = 1 - E.outBounce(clamp(dd / 0.55));
      const land = pulse(dd - 0.2, 0.03);
      const focus = pulse(t - b(10) - 0.12, 0.04);
      ctx.save();
      ctx.translate(dotX, dotY - fall * 420);
      ctx.scale(1 + 0.25 * land + 0.18 * focus, 1 - 0.2 * land + 0.18 * focus);
      ctx.fillStyle = PAL.orange;
      circle(ctx, 0, 0, dotR);
      ctx.restore();
    }

    // "every" written on in the serif italic.
    const wp = E.outCubic(prog(t, b(8.5), 0.42));
    if (wp > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(xF - 20, box.y - 200, (everyW + 60) * wp, 260);
      ctx.clip();
      ctx.font = serif(everySize);
      ctx.fillStyle = PAL.orange;
      ctx.textAlign = 'left';
      ctx.fillText('every', xF + 4, box.y - 16);
      ctx.restore();
    }

    // Corner brackets: fly in around the word, then autofocus onto the dot.
    const hs = dotR + 26;
    const pIn = (i) => E.snap(prog(t, b(9) + i * 0.035, 0.5));
    const pFocus = (i) => E.snap(prog(t, b(10) + i * 0.02, 0.4));
    const wordC = [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]];
    const dotC = [[dotX - hs, dotY - hs], [dotX + hs, dotY - hs], [dotX + hs, dotY + hs], [dotX - hs, dotY + hs]];
    const offC = [[-80, -80], [W + 80, -80], [W + 80, H + 80], [-80, H + 80]];
    const dirs = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i < 4; i++) {
      const p = pIn(i);
      if (p <= 0) continue;
      const f = pFocus(i);
      const x = lerp(lerp(offC[i][0], wordC[i][0], p), dotC[i][0], f);
      const y = lerp(lerp(offC[i][1], wordC[i][1], p), dotC[i][1], f);
      const arm = lerp(58, 20, f);
      const th = lerp(7, 4, f);
      const [sx, sy] = dirs[i];
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(x - (sx < 0 ? arm : 0), y - (sy < 0 ? th : 0), arm, th);
      ctx.fillRect(x - (sx < 0 ? th : 0), y - (sy < 0 ? arm : 0), th, arm);
    }

    // Technical labels, then the focus readout.
    const lp = prog(t, b(9.3), 0.3);
    const la = 1 - prog(t, b(10), 0.12);
    if (lp > 0 && la > 0) {
      ctx.globalAlpha = la;
      const fr = String(Math.floor(t * 60)).padStart(4, '0');
      mono(ctx, `FRAME ${fr}`, box.x, box.y + box.h + 34, { size: 15, color: rgba(PAL.ink, 0.75), track: 3, reveal: lp });
      mono(ctx, '1920×1080 · 60 FPS', box.x + box.w, box.y + box.h + 34, { size: 15, color: rgba(PAL.ink, 0.75), align: 'right', track: 3, reveal: lp });
      ctx.globalAlpha = 1;
    }
    const fp = prog(t, b(10) + 0.14, 0.2);
    if (fp > 0) {
      mono(ctx, 'FOCUS', dotX - hs, dotY - hs - 14, { size: 12, weight: 600, color: rgba(PAL.ink, 0.8), track: 3, reveal: fp });
      mono(ctx, 'f/1.4', dotX + hs, dotY + hs + 24, { size: 12, weight: 500, color: rgba(PAL.ink, 0.6), align: 'right', track: 2, reveal: fp });
    }
  };

  return {
    start: b(4),
    end: b(11) + 0.001,
    draw(ctx, t) {
      if (t < b(5)) partA(ctx, t);
      else if (t < b(6)) partB(ctx, t);
      else {
        // Vertical push from EMOTION into "every FRAME."
        const p = E.inOutQuart(prog(t, b(7.55), b(8.1) - b(7.55)));
        if (p < 1) {
          ctx.save();
          ctx.translate(0, -p * H);
          partC(ctx, t);
          ctx.restore();
        }
        if (p > 0) {
          ctx.save();
          ctx.translate(0, (1 - p) * H);
          ctx.beginPath();
          ctx.rect(0, 0, W, H);
          ctx.clip();
          partE(ctx, t);
          ctx.restore();
        }
      }
    },
  };
}
