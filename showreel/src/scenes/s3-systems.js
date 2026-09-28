// 03 — SYSTEMS. The camera pulls out of the dot to reveal a Bauhaus tile grid
// that rotates and card-flips in waves on the beat, resolving into a pixel circle.
import { CX, CY, W, H, b, PAL, prog, lerp } from '../engine/core.js';
import { E } from '../engine/ease.js';
import { bg } from '../engine/draw.js';
import { P, T, buildTiles, drawDesign } from './grid.js';

export function makeSystems() {
  const tiles = buildTiles().filter((tl) => tl.flat);
  // Start deep enough inside the dot that the first frames are solid orange.
  const ZMAX = 100;

  const ROT = [
    { t: b(12), dir: 1, delay: (tl) => tl.dist * 0.03 },
    { t: b(12.5), dir: 1, delay: (tl) => tl.dist * 0.03 },
    { t: b(13.5), dir: -1, delay: (tl) => (tl.i + tl.j + 11) * 0.017 },
    { t: b(14.5), dir: 1, delay: (tl) => (8 - tl.i) * 0.018 },
  ];
  const FLIPS = [
    { t: b(13), delay: (tl) => (tl.i + 8) * 0.02 },
    { t: b(14), delay: (tl) => tl.dist * 0.035 },
    { t: b(15), delay: (tl) => tl.dist * 0.016 },
  ];
  const FLIP_DUR = 0.28;

  return {
    start: b(11),
    end: b(16),
    draw(ctx, t) {
      bg(ctx, PAL.ink);
      const zp = E.outQuint(prog(t, b(11), b(1.25)));
      const Z = Math.exp(Math.log(ZMAX) * (1 - zp));
      const camRot = 0.32 * (1 - zp);
      ctx.translate(CX, CY);
      ctx.rotate(camRot);
      ctx.scale(Z, Z);

      for (const tl of tiles) {
        const x = tl.i * P;
        const y = tl.j * P;
        const sx = x * Z;
        const sy = y * Z;
        const rad = T * Z * 0.75;
        if (Math.abs(sx) - rad > W * 0.75 || Math.abs(sy) - rad > H * 0.75) continue;

        let k = 0;
        let fx = 1;
        let shade = 0;
        for (let f = 0; f < FLIPS.length; f++) {
          const p = prog(t, FLIPS[f].t + FLIPS[f].delay(tl), FLIP_DUR);
          if (p >= 1) {
            k = f + 1;
            continue;
          }
          if (p > 0) {
            const e = E.inOutQuad(p);
            fx = Math.abs(Math.cos(Math.PI * e));
            k = e < 0.5 ? f : f + 1;
            shade = Math.sin(Math.PI * e);
          }
          break;
        }

        // Rotation waves; they ease out once tiles become the flat pixel floor.
        let rot = 0;
        for (const w of ROT) rot += w.dir * (Math.PI / 2) * E.outBack(prog(t, w.t + w.delay(tl), 0.42));
        const centre = tl.i === 0 && tl.j === 0;
        const pop = centre ? 1 : E.outBack(prog(t, b(11) + 0.12 + tl.dist * 0.032, 0.4));

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(T * Math.max(fx, 0.002), T);
        drawDesign(ctx, tl.designs[k], pop);
        if (shade > 0) {
          ctx.fillStyle = `rgba(13,13,15,${0.45 * shade})`;
          ctx.fillRect(-0.5, -0.5, 1, 1);
        }
        ctx.restore();
      }
    },
  };
}
