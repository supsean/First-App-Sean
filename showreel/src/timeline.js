// Master timeline: scene order, camera shake, HUD colour and lens FX per moment.
import { W, H, b, PAL, noise1 } from './engine/core.js';
import { makeCountdown } from './scenes/s1-countdown.js';
import { makeType } from './scenes/s2-type.js';
import { makeSystems } from './scenes/s3-systems.js';
import { makeDimension } from './scenes/s4-dimension.js';
import { makeFluid } from './scenes/s5-fluid.js';
import { makeRange, SHOTS, shotAt } from './scenes/s6-range.js';
import { makeSignature } from './scenes/s7-signature.js';
import { makeHud, CHAPTERS } from './scenes/hud.js';

// Hits that kick the camera and the lens.
const IMPACTS = [
  { t: b(4), s: 1.0 },
  { t: b(5), s: 0.35 },
  { t: b(6) + 0.03, s: 0.8 },
  { t: b(8), s: 0.45 },
  { t: b(12), s: 0.5 },
  { t: b(16), s: 0.6 },
  { t: b(20), s: 0.6 },
  ...[24, 24.5, 25, 25.5, 26, 26.5, 27, 27.25].map((x) => ({ t: b(x), s: 0.22 })),
  { t: b(28), s: 1.3 },
];

const envelope = (t, decay) => {
  let v = 0;
  for (const i of IMPACTS) if (t >= i.t) v += i.s * Math.exp(-(t - i.t) / decay);
  return v;
};

// What sits behind the HUD corners at time t: { top: [colour, alpha], bot: [colour, alpha] }.
function hudColor(t) {
  const light = [PAL.paper, 0.72];
  const dark = [PAL.ink, 0.8];
  const both = (c) => ({ top: c, bot: c });
  if (t < b(4)) return both(light);
  if (t < b(5)) return both(dark);
  if (t < b(7.8)) return both(light);
  if (t < b(11)) return both(dark);
  if (t < b(16.55)) return both(light);
  if (t < b(19.7)) return { top: light, bot: dark };
  if (t < b(24)) return both(light);
  if (t < b(28)) {
    const s = SHOTS[shotAt(t)];
    if (!s.name) return both([PAL.paper, 0.12]);
    return both(s.bg === PAL.paper ? dark : light);
  }
  const fade = 1 - Math.min(1, Math.max(0, (t - b(30.6)) / b(0.9)));
  return both([PAL.paper, 0.72 * (0.35 + 0.65 * fade)]);
}

function labelAt(t) {
  let index = 0;
  for (let i = 0; i < CHAPTERS.length; i++) if (t >= CHAPTERS[i].t) index = i;
  if (t >= b(24) && t < b(28)) {
    const k = shotAt(t);
    const s = SHOTS[k];
    const name = s.name || SHOTS[k - 1].name;
    return { index, label: name, since: s.name ? t - b(s.at) : 1, total: CHAPTERS.length, roll: 0.1 };
  }
  return { index, label: CHAPTERS[index].name, since: t - CHAPTERS[index].t, total: CHAPTERS.length, roll: 0.32 };
}

export function buildTimeline(env) {
  const scenes = [makeCountdown(env), makeType(env), makeSystems(env), makeDimension(env), makeFluid(env), makeRange(env), makeSignature(env)];
  const hud = makeHud({ colorAt: hudColor, labelAt });

  // Hard cuts (motion blur must not straddle these) and fast moments that get extra samples.
  const cuts = [b(4), b(5), b(6), b(11), b(16), b(20), ...SHOTS.map((s) => b(s.at)), b(28)];
  const FAST = [
    [0, b(3)],
    [b(3.7), b(4.25)],
    [b(5) - 0.2, b(5) + 0.4],
    [b(6) - 0.25, b(6) + 0.35],
    [b(7.5), b(8.9)],
    [b(10.4), b(11.7)],
    [b(19.4), b(20.6)],
    [b(24), b(27.5)],
    [b(28), b(28.7)],
  ];

  return {
    cuts,
    boost(t) {
      return FAST.some(([a, c]) => t >= a && t <= c) ? 2 : 1;
    },
    draw(ctx, t) {
      const sh = envelope(t, 0.16) * 9;
      const sx = noise1(t * 41 + 3.1) * sh;
      const sy = noise1(t * 37 + 11.7) * sh;
      for (const s of scenes) {
        if (t >= s.start && t < s.end) {
          ctx.save();
          ctx.translate(sx, sy);
          s.draw(ctx, t);
          ctx.restore();
        }
      }
      ctx.save();
      hud.draw(ctx, t);
      ctx.restore();
    },
    fx(t) {
      return {
        ca: 0.0011 + envelope(t, 0.1) * 0.006,
        grain: 0.03,
        vignette: 0.2,
      };
    },
  };
}
