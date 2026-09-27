// 06 — RANGE. A match-cut montage: the orange dot never moves while the world
// around it changes on every eighth note. Then a half-beat of silence.
import { W, H, CX, CY, b, PAL, TAU, prog, lerp, clamp, rng, rgba, noise1 } from '../engine/core.js';
import { E } from '../engine/ease.js';
import { bg, circle, ring, line, mono, serif, fillLayout } from '../engine/draw.js';

export const DOT = 26;

export const SHOTS = [
  { at: 24.0, name: 'ORBIT', bg: PAL.paper },
  { at: 24.5, name: 'RADIAL', bg: PAL.ink },
  { at: 25.0, name: 'LETTERFORM', bg: PAL.blue },
  { at: 25.5, name: 'INTERFACE', bg: PAL.paper },
  { at: 26.0, name: 'WIREFRAME', bg: PAL.ink },
  { at: 26.5, name: 'DATA', bg: PAL.paper },
  { at: 27.0, name: 'PARTICLES', bg: PAL.blue },
  { at: 27.25, name: 'OP-ART', bg: PAL.ink },
  { at: 27.5, name: '', bg: PAL.ink },
];

export function shotAt(t) {
  let k = -1;
  for (let i = 0; i < SHOTS.length; i++) if (t >= b(SHOTS[i].at)) k = i;
  return k;
}

// Icosahedron.
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];
const ICO_E = [];
for (let i = 0; i < 12; i++) {
  for (let j = i + 1; j < 12; j++) {
    const d = Math.hypot(ICO_V[i][0] - ICO_V[j][0], ICO_V[i][1] - ICO_V[j][1], ICO_V[i][2] - ICO_V[j][2]);
    if (Math.abs(d - 2) < 1e-6) ICO_E.push([i, j]);
  }
}

export function makeRange({ font }) {
  const uiFont = font;
  const r = rng(424242);
  const parts = Array.from({ length: 110 }, () => ({
    a: r() * TAU,
    v: 2200 + r() * 5200,
    s: 5 + r() * 12,
    spin: (r() - 0.5) * 30,
    kind: Math.floor(r() * 3),
    col: [PAL.paper, PAL.paper, PAL.orange, PAL.lime, PAL.ink][Math.floor(r() * 5)],
  }));
  const chart = Array.from({ length: 13 }, (_, i) => {
    const x = CX + (i - 6) * 150;
    const y = i === 6 ? CY : CY + 40 + Math.sin(i * 1.7) * 110 + (6 - i) * 22 + (i > 6 ? (i - 6) * -38 : 0);
    return [x, y];
  });

  const shots = [
    // ORBIT
    (ctx, t, u) => {
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(-0.32);
      for (let k = 0; k < 5; k++) {
        const rx = 120 + k * 105;
        const ry = rx * 0.42;
        ctx.strokeStyle = rgba(PAL.ink, 0.45);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
        ctx.stroke();
        const a = k * 1.9 + (t - b(24)) * (7.5 - k * 1.1);
        ctx.fillStyle = PAL.ink;
        circle(ctx, Math.cos(a) * rx, Math.sin(a) * ry, 7 + k * 2.2);
      }
      ctx.restore();
    },
    // RADIAL
    (ctx, t, u) => {
      const n = 64;
      ctx.strokeStyle = PAL.paper;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + (t - b(24.5)) * 2.6;
        const len = 180 + 420 * (0.5 + 0.5 * Math.sin(k * 2.3 + t * 21)) * E.outExpo(clamp(u / 0.12));
        const r0 = 64;
        line(ctx, CX + Math.cos(a) * r0, CY + Math.sin(a) * r0, CX + Math.cos(a) * (r0 + len), CY + Math.sin(a) * (r0 + len));
      }
      ctx.lineCap = 'butt';
    },
    // LETTERFORM: "hi" with the dot as the tittle.
    (ctx, t, u) => {
      const size = 560;
      ctx.font = serif(size, false);
      const hW = ctx.measureText('h').width;
      const m = ctx.measureText('ı');
      const iW = m.width;
      const stemTop = m.actualBoundingBoxAscent;
      const rise = (1 - E.outExpo(clamp(u / 0.2))) * 160;
      const xI = CX - iW / 2;
      const base = CY + DOT + 22 + stemTop + rise;
      ctx.fillStyle = PAL.paper;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('h', xI - hW - 6, base);
      ctx.fillText('ı', xI, base);
    },
    // INTERFACE: a settings card whose toggle knob is the dot; a cursor switches it on.
    (ctx, t, u) => {
      const on = E.snap(clamp((u - 0.05) / 0.16));
      const tw = 132;
      const th = 74;
      const travel = tw - th;
      const trackX = CX - lerp(-travel / 2, travel / 2, on);
      const enter = E.outExpo(clamp(u / 0.12));
      const cw = 860;
      const ch = 190;
      const cardR = trackX + tw / 2 + 52;
      const cardX = cardR - cw;
      const cardY = CY - ch / 2 + (1 - enter) * 40;
      ctx.save();
      ctx.shadowColor = 'rgba(13,13,15,0.16)';
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 18;
      ctx.fillStyle = '#fdfcf8';
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cw, ch, 30);
      ctx.fill();
      ctx.restore();
      const L = uiFont.layout('Motion', { cap: 38, wdth: 100, wght: 700 });
      ctx.fillStyle = PAL.ink;
      fillLayout(ctx, L, cardX + 60, cardY + ch / 2 + 2);
      mono(ctx, 'MAKE EVERY FRAME MOVE', cardX + 62, cardY + ch / 2 + 42, { size: 15, weight: 500, color: rgba(PAL.ink, 0.45), track: 3 });
      ctx.fillStyle = on > 0.5 ? PAL.ink : '#d9d4c9';
      ctx.beginPath();
      ctx.roundRect(trackX - tw / 2, CY - th / 2, tw, th, th / 2);
      ctx.fill();
      const rp = clamp((u - 0.05) / 0.2);
      if (rp > 0 && rp < 1) {
        ctx.strokeStyle = rgba(PAL.orange, 0.6 * (1 - rp));
        ctx.lineWidth = 3;
        ring(ctx, CX, CY, DOT + 8 + rp * 140);
      }
      const cp = E.outExpo(clamp(u / 0.07));
      const press = u > 0.045 && u < 0.1 ? 0.88 : 1;
      const cx = lerp(CX + 300, CX + 6, cp);
      const cy = lerp(CY + 240, CY + 8, cp);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(press * 1.7, press * 1.7);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 34);
      ctx.lineTo(9, 26);
      ctx.lineTo(15, 40);
      ctx.lineTo(21, 37);
      ctx.lineTo(15, 24);
      ctx.lineTo(27, 24);
      ctx.closePath();
      ctx.fillStyle = PAL.ink;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    },
    // WIREFRAME
    (ctx, t, u) => {
      const a1 = (t - b(26)) * 3.4 + 0.4;
      const a2 = (t - b(26)) * 2.1 + 0.9;
      const S = 190;
      const pts = ICO_V.map(([x, y, z]) => {
        let X = x * Math.cos(a1) - z * Math.sin(a1);
        let Z = x * Math.sin(a1) + z * Math.cos(a1);
        let Y = y * Math.cos(a2) - Z * Math.sin(a2);
        Z = y * Math.sin(a2) + Z * Math.cos(a2);
        const p = 4 / (4 + Z * 0.35);
        return [CX + X * S * p, CY + Y * S * p, Z];
      });
      ctx.lineWidth = 2;
      for (const [i, j] of ICO_E) {
        const z = (pts[i][2] + pts[j][2]) / 2;
        ctx.strokeStyle = rgba(PAL.paper, 0.3 + 0.55 * (1 - (z + PHI) / (2 * PHI)));
        line(ctx, pts[i][0], pts[i][1], pts[j][0], pts[j][1]);
      }
      ctx.fillStyle = PAL.paper;
      for (const p of pts) circle(ctx, p[0], p[1], 5);
    },
    // DATA
    (ctx, t, u) => {
      ctx.strokeStyle = rgba(PAL.ink, 0.13);
      ctx.lineWidth = 1.5;
      for (let y = CY - 360; y <= CY + 360; y += 90) line(ctx, 0, y, W, y);
      const dp = E.outExpo(clamp(u / 0.18));
      const xEnd = lerp(-40, W + 40, dp);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, xEnd, H);
      ctx.clip();
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      chart.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.fillStyle = PAL.ink;
      chart.forEach(([x, y], i) => i !== 6 && circle(ctx, x, y, 7));
      ctx.restore();
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = rgba(PAL.ink, 0.5);
      ctx.lineWidth = 1.5;
      line(ctx, CX, CY + 40, CX, CY + 380);
      ctx.setLineDash([]);
      mono(ctx, '+128%', CX + 40, CY - 34, { size: 30, weight: 700, color: PAL.ink, track: 2, reveal: clamp(u / 0.1) });
    },
    // PARTICLES
    (ctx, t, u) => {
      const tt = u;
      for (const p of parts) {
        const d = (p.v * (1 - Math.exp(-tt * 9))) / 9;
        const x = CX + Math.cos(p.a) * (DOT + 10 + d);
        const y = CY + Math.sin(p.a) * (DOT + 10 + d) + 900 * tt * tt;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.spin * tt + p.a);
        ctx.fillStyle = p.col;
        if (p.kind === 0) ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
        else if (p.kind === 1) circle(ctx, 0, 0, p.s / 2);
        else {
          ctx.fillRect(-p.s, -p.s / 5, p.s * 2, (p.s * 2) / 5);
        }
        ctx.restore();
      }
    },
    // OP-ART
    (ctx, t, u) => {
      const zoom = (t - b(27.25)) * 520;
      for (let k = 22; k >= 0; k--) {
        const rr = k * 46 + (zoom % 92);
        ctx.fillStyle = k % 2 ? PAL.paper : PAL.ink;
        circle(ctx, CX + Math.sin(k * 0.4 + t * 9) * k * 1.6, CY, rr);
      }
    },
    // SILENCE
    () => {},
  ];

  return {
    start: b(24),
    end: b(28),
    draw(ctx, t) {
      const k = shotAt(t);
      const s = SHOTS[k];
      const u = t - b(s.at);
      bg(ctx, s.bg);
      const punch = k < 8 ? lerp(1.14, 1, E.outExpo(clamp(u / 0.14))) : 1;
      ctx.save();
      ctx.translate(CX, CY);
      ctx.scale(punch, punch);
      ctx.translate(-CX, -CY);
      shots[k](ctx, t, u);
      ctx.restore();

      // The constant: the dot. In the silence it charges up.
      let r = DOT;
      let ox = 0;
      let oy = 0;
      if (k === 8) {
        const q = prog(t, b(27.5), b(0.5));
        ox = noise1(t * 90) * 2.5 * q;
        oy = noise1(t * 97 + 5) * 2.5 * q;
        r = DOT * (1 - 0.22 * E.inQuad(prog(t, b(27.8), b(0.2))));
      }
      if (k === 3) r = DOT * (u > 0.045 && u < 0.1 ? 0.9 : 1);
      ctx.fillStyle = PAL.orange;
      circle(ctx, CX + ox, CY + oy, r);
    },
  };
}
