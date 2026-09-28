// Easing library. Every move in the reel goes through one of these; nothing is linear.
const pow = Math.pow;
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;

export const E = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2),
  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - pow(-2 * t + 2, 4) / 2),
  inQuint: (t) => t * t * t * t * t,
  outQuint: (t) => 1 - pow(1 - t, 5),
  inOutQuint: (t) => (t < 0.5 ? 16 * pow(t, 5) : 1 - pow(-2 * t + 2, 5) / 2),
  inExpo: (t) => (t <= 0 ? 0 : pow(2, 10 * t - 10)),
  outExpo: (t) => (t >= 1 ? 1 : 1 - pow(2, -10 * t)),
  inOutExpo: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inCirc: (t) => 1 - Math.sqrt(1 - t * t),
  outCirc: (t) => Math.sqrt(1 - pow(t - 1, 2)),
  inBack: (t) => c3 * t * t * t - c1 * t * t,
  outBack: (t) => 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2),
  inOutBack: (t) =>
    t < 0.5
      ? (pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,
  outBackStrong: (t) => {
    const s = 3.2;
    return 1 + (s + 1) * pow(t - 1, 3) + s * pow(t - 1, 2);
  },
  outElastic: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  outBounce: (t) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  // Motion-designer favourite: very fast attack, long silky settle.
  snap: bezier(0.16, 1, 0.3, 1),
  // Anticipation into acceleration.
  whip: bezier(0.7, 0, 0.84, 0),
  // Symmetric "graph editor" S-curve with heavy ease.
  swift: bezier(0.83, 0, 0.17, 1),
};

// CSS-style cubic-bezier(x1, y1, x2, y2) solver.
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      const d = dx(t);
      if (Math.abs(e) < 1e-6) return sy(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}
