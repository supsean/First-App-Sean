// Timeline constants and small math helpers shared by every scene.
export const W = 1920;
export const H = 1080;
export const FPS = 60;
export const BPM = 128;
export const BEAT = 60 / BPM; // 0.46875 s
export const BAR = BEAT * 4; // 1.875 s
export const DURATION = 15; // 8 bars at 128 BPM
export const CX = W / 2;
export const CY = H / 2;

// Beats -> seconds.
export const b = (beats) => beats * BEAT;

export const PAL = {
  ink: '#0d0d0f',
  paper: '#f3efe6',
  orange: '#ff4f1f',
  blue: '#2b35ff',
  lime: '#d4ff3a',
  pink: '#ffb2d4',
  grey: '#8a877f',
};

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, c, t) => a + (c - a) * t;
export const invLerp = (a, c, v) => (v - a) / (c - a);
export const remap = (v, a0, a1, b0, b1) => lerp(b0, b1, invLerp(a0, a1, v));
export const fract = (v) => v - Math.floor(v);
export const smoothstep = (a, c, v) => {
  const t = clamp((v - a) / (c - a));
  return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;

// Eased progress of a tween that starts at `start` seconds and lasts `dur` seconds.
export const prog = (t, start, dur, ease) => {
  const p = clamp((t - start) / dur);
  return ease ? ease(p) : p;
};

// Linear window: 0 before start, 1 after end.
export const win = (t, a, c) => clamp((t - a) / (c - a));

// Damped spring step response, 0 -> 1 with overshoot.
export const spring = (t, freq = 3, damp = 0.35) => {
  if (t <= 0) return 0;
  const w = TAU * freq;
  const wd = w * Math.sqrt(1 - damp * damp);
  return 1 - Math.exp(-damp * w * t) * (Math.cos(wd * t) + ((damp * w) / wd) * Math.sin(wd * t));
};

// Deterministic PRNG.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

// Smooth 1D value noise in [-1, 1].
export const noise1 = (x) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u) * 2 - 1;
};

// Hex -> [r, g, b].
export const hex = (h) => {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
export const mixHex = (a, c, t) => {
  const A = hex(a);
  const C = hex(c);
  return `rgb(${Math.round(lerp(A[0], C[0], t))},${Math.round(lerp(A[1], C[1], t))},${Math.round(lerp(A[2], C[2], t))})`;
};
export const rgba = (h, a) => {
  const [r, g, bl] = hex(h);
  return `rgba(${r},${g},${bl},${a})`;
};
