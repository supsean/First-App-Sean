// Shared tile system for SYSTEMS (flat) and DIMENSION (extruded).
import { PAL, rng } from '../engine/core.js';

export const P = 120; // pitch
export const T = 108; // tile size (gap = P - T)
export const COLS = 8; // flat view shows i in [-8, 8]
export const ROWS = 3; // flat view shows j in [-3, 3]
export const EXT = 14; // extended field for 3D: [-EXT, EXT]

const SHAPES = ['quarter', 'half', 'dot', 'tri', 'petal', 'quarter2', 'bars', 'ring'];
const COMBOS = [
  { bg: PAL.paper, fg: PAL.ink, w: 30 },
  { bg: PAL.ink, fg: PAL.paper, w: 22 },
  { bg: PAL.orange, fg: PAL.ink, w: 12 },
  { bg: PAL.ink, fg: PAL.orange, w: 10 },
  { bg: PAL.paper, fg: PAL.orange, w: 10 },
  { bg: PAL.blue, fg: PAL.paper, w: 8 },
  { bg: PAL.paper, fg: PAL.blue, w: 6 },
];

function pick(r, list) {
  const total = list.reduce((a, c) => a + c.w, 0);
  let x = r() * total;
  for (const c of list) {
    if ((x -= c.w) <= 0) return c;
  }
  return list[list.length - 1];
}

function design(r, weights) {
  const c = pick(r, COMBOS);
  let shape;
  const x = r();
  let acc = 0;
  for (let k = 0; k < SHAPES.length; k++) {
    acc += weights[k];
    if (x <= acc) {
      shape = SHAPES[k];
      break;
    }
  }
  return { bg: c.bg, fg: c.fg, shape: shape || 'quarter', rot: Math.floor(r() * 4) };
}

export const DOT_R = 0.36; // centre tile dot radius (tile units)
export const inCircle = (i, j) => i * i + j * j <= 5; // 13-tile pixel circle

export function buildTiles() {
  const r = rng(20260927);
  const tiles = [];
  for (let j = -EXT; j <= EXT; j++) {
    for (let i = -EXT; i <= EXT; i++) {
      const flat = Math.abs(i) <= COLS && Math.abs(j) <= ROWS;
      const d0 = design(r, [0.34, 0.2, 0.1, 0.12, 0.1, 0.08, 0.03, 0.03]);
      const d1 = design(r, [0.5, 0.05, 0.05, 0.05, 0.1, 0.25, 0, 0]);
      const d2 = design(r, [0.2, 0.25, 0.15, 0.15, 0.1, 0.05, 0.05, 0.05]);
      const centre = i === 0 && j === 0;
      if (centre) {
        d0.bg = PAL.ink;
        d0.fg = PAL.orange;
        d0.shape = 'dot';
        d1.bg = PAL.ink;
        d1.fg = PAL.orange;
        d1.shape = 'dot';
        d2.bg = PAL.ink;
        d2.fg = PAL.orange;
        d2.shape = 'dot';
      }
      const d3 = { bg: inCircle(i, j) ? PAL.orange : PAL.paper, fg: PAL.paper, shape: 'none', rot: 0 };
      tiles.push({ i, j, flat, dist: Math.hypot(i, j), designs: [d0, d1, d2, d3], seed: r() });
    }
  }
  return tiles;
}

// Draw a design in a unit tile centred at the origin (current transform scaled to tile size).
export function drawDesign(ctx, d, shapeScale = 1) {
  ctx.fillStyle = d.bg;
  ctx.fillRect(-0.5, -0.5, 1, 1);
  if (d.shape === 'none' || shapeScale <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-0.5, -0.5, 1, 1);
  ctx.clip();
  ctx.rotate((d.rot * Math.PI) / 2);
  if (shapeScale !== 1) ctx.scale(shapeScale, shapeScale);
  ctx.fillStyle = d.fg;
  ctx.strokeStyle = d.fg;
  ctx.beginPath();
  switch (d.shape) {
    case 'quarter':
      ctx.moveTo(-0.5, 0.5);
      ctx.arc(-0.5, 0.5, 1, -Math.PI / 2, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case 'half':
      ctx.arc(0, 0.5, 0.5, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case 'dot':
      ctx.arc(0, 0, DOT_R, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ring':
      ctx.lineWidth = 0.13;
      ctx.arc(0, 0, 0.3, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'tri':
      ctx.moveTo(-0.5, -0.5);
      ctx.lineTo(0.5, 0.5);
      ctx.lineTo(-0.5, 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'petal':
      ctx.arc(-0.5, 0.5, 1, -Math.PI / 2, 0);
      ctx.arc(0.5, -0.5, 1, Math.PI / 2, Math.PI);
      ctx.closePath();
      ctx.fill();
      break;
    case 'quarter2':
      ctx.moveTo(-0.5, -0.5);
      ctx.arc(-0.5, -0.5, 0.5, 0, Math.PI / 2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0.5, 0.5);
      ctx.arc(0.5, 0.5, 0.5, Math.PI, Math.PI * 1.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'bars':
      for (const y of [-0.33, 0, 0.33]) ctx.fillRect(-0.5, y - 0.08, 1, 0.16);
      break;
  }
  ctx.restore();
}
