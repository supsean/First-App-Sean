// 04 — DIMENSION. The flat pixel grid tilts into perspective and extrudes into a
// field of boxes. Ripples fire from the orange core on every kick, the camera
// orbits, then whips out sideways.
import { W, H, CX, CY, b, PAL, prog, lerp, clamp, smoothstep, hex } from '../engine/core.js';
import { E } from '../engine/ease.js';
import { bg } from '../engine/draw.js';
import { P, T, buildTiles, inCircle } from './grid.js';

const DEG = Math.PI / 180;
const F = 2000; // focal length == start distance, so frame one matches the flat grid pixel for pixel
const INK = hex(PAL.ink);

function shadeCol(rgb, k, fog) {
  const r = lerp(rgb[0] * k, INK[0], fog);
  const g = lerp(rgb[1] * k, INK[1], fog);
  const bl = lerp(rgb[2] * k, INK[2], fog);
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}

export function makeDimension() {
  const tiles = buildTiles().map((tl) => ({
    ...tl,
    core: inCircle(tl.i, tl.j),
    rgb: hex(inCircle(tl.i, tl.j) ? PAL.orange : PAL.paper),
  }));
  const KICKS = [b(17), b(18), b(19)];
  const L = (() => {
    const v = [-0.55, 0.75, 0.38];
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  })();

  const camera = (t) => {
    const tilt = E.inOutCubic(prog(t, b(16), b(1.3)));
    const el = lerp(90, 34, tilt) * DEG;
    const az = (lerp(0, 26, E.inOutCubic(prog(t, b(16), b(1.6)))) + 20 * prog(t, b(17.4), b(2.1))) * DEG;
    const D = lerp(2000, 2350, tilt);
    // Whip: truck hard to the right on the last half beat.
    const whip = E.inExpo(prog(t, b(19.5), b(0.5)));
    const tgt = [0, 60 * tilt, 0];
    const C = [tgt[0] + D * Math.cos(el) * Math.sin(az), tgt[1] + D * Math.sin(el), tgt[2] + D * Math.cos(el) * Math.cos(az)];
    const f = [tgt[0] - C[0], tgt[1] - C[1], tgt[2] - C[2]];
    const fl = Math.hypot(...f);
    f[0] /= fl;
    f[1] /= fl;
    f[2] /= fl;
    const r = [Math.cos(az), 0, -Math.sin(az)];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const shift = whip * 2300;
    C[0] += r[0] * shift;
    C[2] += r[2] * shift;
    return { C, f, r, u, whip };
  };

  const heightAt = (tl, t) => {
    const grow = E.outBack(prog(t, b(16) + 0.08 + tl.dist * 0.026, 0.6));
    let h = (tl.core ? 150 : 34) * grow;
    const x = tl.i * P;
    const z = tl.j * P;
    const r = Math.hypot(x, z);
    for (const k of KICKS) {
      const dt = t - k;
      if (dt < 0) continue;
      const front = r - 1500 * dt;
      h += 190 * Math.exp(-(front * front) / (2 * 120 * 120)) * Math.exp(-dt / 0.75) * grow;
    }
    h += 14 * Math.sin(x * 0.004 + t * 2.3) * Math.cos(z * 0.005 - t * 1.9) * grow;
    if (tl.core) {
      const hop = prog(t, b(18.5), b(0.9));
      h += 260 * Math.sin(Math.PI * E.outQuad(Math.min(hop * 1.6, 1))) * (hop < 1 ? 1 : 0);
    }
    return Math.max(h, 0.5);
  };

  return {
    start: b(16),
    end: b(20),
    draw(ctx, t) {
      bg(ctx, PAL.ink);
      const cam = camera(t);
      const { C, f, r, u } = cam;
      const proj = (x, y, z) => {
        const dx = x - C[0];
        const dy = y - C[1];
        const dz = z - C[2];
        const zc = dx * f[0] + dy * f[1] + dz * f[2];
        const xc = dx * r[0] + dy * r[1] + dz * r[2];
        const yc = dx * u[0] + dy * u[1] + dz * u[2];
        return [CX + (F * xc) / zc, CY - (F * yc) / zc, zc];
      };

      const items = [];
      for (const tl of tiles) {
        // Tiles outside the flat view grow in as the camera tilts.
        const reveal = tl.flat ? 1 : E.outCubic(prog(t, b(16.1) + tl.dist * 0.035, 0.5));
        if (reveal <= 0) continue;
        const x = tl.i * P;
        const z = tl.j * P;
        const dx = x - C[0];
        const dz = z - C[2];
        const h = heightAt(tl, t);
        const dy = h / 2 - C[1];
        const depth = Math.hypot(dx, dy, dz);
        items.push({ tl, x, z, h, depth, s: (T / 2) * reveal });
      }
      items.sort((a, c) => c.depth - a.depth);

      for (const it of items) {
        const { tl, x, z, h, s } = it;
        const fog = smoothstep(760, 2000, Math.hypot(x, z)) * 0.96;
        const pts = [
          proj(x - s, 0, z - s), proj(x + s, 0, z - s), proj(x + s, 0, z + s), proj(x - s, 0, z + s),
          proj(x - s, h, z - s), proj(x + s, h, z - s), proj(x + s, h, z + s), proj(x - s, h, z + s),
        ];
        if (pts.some((p) => p[2] < 50)) continue;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const p of pts) {
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
        }
        if (maxX < -20 || minX > W + 20 || maxY < -20 || minY > H + 20) continue;

        const faces = [
          { n: [1, 0, 0], idx: [1, 2, 6, 5], c: [x + s, h / 2, z] },
          { n: [-1, 0, 0], idx: [3, 0, 4, 7], c: [x - s, h / 2, z] },
          { n: [0, 0, 1], idx: [2, 3, 7, 6], c: [x, h / 2, z + s] },
          { n: [0, 0, -1], idx: [0, 1, 5, 4], c: [x, h / 2, z - s] },
        ];
        for (const fc of faces) {
          const vx = C[0] - fc.c[0];
          const vy = C[1] - fc.c[1];
          const vz = C[2] - fc.c[2];
          if (fc.n[0] * vx + fc.n[1] * vy + fc.n[2] * vz <= 0) continue;
          const lam = Math.max(0, fc.n[0] * L[0] + fc.n[1] * L[1] + fc.n[2] * L[2]);
          ctx.fillStyle = shadeCol(tl.rgb, 0.5 + 0.38 * lam, fog);
          ctx.beginPath();
          ctx.moveTo(pts[fc.idx[0]][0], pts[fc.idx[0]][1]);
          for (let k = 1; k < 4; k++) ctx.lineTo(pts[fc.idx[k]][0], pts[fc.idx[k]][1]);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = shadeCol(tl.rgb, 1, fog);
        ctx.beginPath();
        ctx.moveTo(pts[4][0], pts[4][1]);
        ctx.lineTo(pts[5][0], pts[5][1]);
        ctx.lineTo(pts[6][0], pts[6][1]);
        ctx.lineTo(pts[7][0], pts[7][1]);
        ctx.closePath();
        ctx.fill();
      }
    },
  };
}
