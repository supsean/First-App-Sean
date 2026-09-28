// Tiny offline DSP kit: oscillators, filters, envelopes, reverb, delay, limiter.
export const SR = 48000;
export const TAU = Math.PI * 2;
export const S = (sec) => Math.max(0, Math.round(sec * SR));
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

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

// RBJ biquad; call set() whenever the cutoff moves.
export class Biquad {
  constructor(type = 'lowpass', f = 1000, q = 0.707, gain = 0) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(type, f, q, gain);
  }
  set(type, f, q = 0.707, gain = 0) {
    const w = (TAU * Math.min(Math.max(f, 10), SR * 0.49)) / SR;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const alpha = sw / (2 * q);
    const A = Math.pow(10, gain / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lowpass':
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'highpass':
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'bandpass':
        b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'peak':
        b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
        break;
      case 'lowshelf': {
        const sq = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 - (A - 1) * cw + sq); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - sq);
        a0 = A + 1 + (A - 1) * cw + sq; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - sq;
        break;
      }
      case 'highshelf': {
        const sq = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 + (A - 1) * cw + sq); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - sq);
        a0 = A + 1 - (A - 1) * cw + sq; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - sq;
        break;
      }
      default:
        throw new Error('filter ' + type);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// Band-limited saw via PolyBLEP.
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
export class Saw {
  constructor(phase = 0) { this.p = phase; }
  next(freq) {
    const dt = freq / SR;
    let v = 2 * this.p - 1 - blep(this.p, dt);
    this.p += dt;
    if (this.p >= 1) this.p -= 1;
    return v;
  }
}

// Apply a filter with a time-varying cutoff (fn of seconds) to a buffer in place.
export function sweepFilter(buf, type, fFn, q = 0.707, block = 32) {
  const f = new Biquad(type, fFn(0), q);
  for (let i = 0; i < buf.length; i++) {
    if (i % block === 0) f.set(type, fFn(i / SR), q);
    buf[i] = f.process(buf[i]);
  }
  return buf;
}

export function filter(buf, type, freq, q = 0.707, gain = 0) {
  const f = new Biquad(type, freq, q, gain);
  for (let i = 0; i < buf.length; i++) buf[i] = f.process(buf[i]);
  return buf;
}

// Freeverb (stereo).
class Comb {
  constructor(n) { this.buf = new Float32Array(n); this.i = 0; this.store = 0; }
  process(x, fb, damp) {
    const y = this.buf[this.i];
    this.store = y * (1 - damp) + this.store * damp;
    this.buf[this.i] = x + this.store * fb;
    if (++this.i >= this.buf.length) this.i = 0;
    return y;
  }
}
class Allpass {
  constructor(n) { this.buf = new Float32Array(n); this.i = 0; }
  process(x) {
    const b = this.buf[this.i];
    const y = -x + b;
    this.buf[this.i] = x + b * 0.5;
    if (++this.i >= this.buf.length) this.i = 0;
    return y;
  }
}
export function reverb([inL, inR], { room = 0.84, damp = 0.3, width = 1, predelay = 0.012 } = {}) {
  const k = SR / 44100;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const apT = [556, 441, 341, 225];
  const spread = 23;
  const cl = combT.map((n) => new Comb(Math.round(n * k)));
  const cr = combT.map((n) => new Comb(Math.round((n + spread) * k)));
  const al = apT.map((n) => new Allpass(Math.round(n * k)));
  const ar = apT.map((n) => new Allpass(Math.round((n + spread) * k)));
  const n = inL.length;
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  const pd = S(predelay);
  const fb = room * 0.28 + 0.7;
  for (let i = 0; i < n; i++) {
    const j = i - pd;
    const x = j >= 0 ? (inL[j] + inR[j]) * 0.015 : 0;
    let l = 0;
    let r = 0;
    for (let c = 0; c < 8; c++) {
      l += cl[c].process(x, fb, damp);
      r += cr[c].process(x, fb, damp);
    }
    for (let a = 0; a < 4; a++) {
      l = al[a].process(l);
      r = ar[a].process(r);
    }
    const w1 = width / 2 + 0.5;
    const w2 = (1 - width) / 2;
    outL[i] = l * w1 + r * w2;
    outR[i] = r * w1 + l * w2;
  }
  return [outL, outR];
}

// Ping-pong delay with a darkening feedback path.
export function pingpong([inL, inR], time, feedback = 0.38, tone = 4500) {
  const d = S(time);
  const n = inL.length;
  const lineL = new Float32Array(n);
  const lineR = new Float32Array(n);
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  const lpL = new Biquad('lowpass', tone, 0.6);
  const lpR = new Biquad('lowpass', tone, 0.6);
  for (let i = 0; i < n; i++) {
    const dl = i >= d ? lineL[i - d] : 0;
    const dr = i >= d ? lineR[i - d] : 0;
    lineL[i] = lpL.process((inL[i] + inR[i]) * 0.5 + dr * feedback);
    lineR[i] = lpR.process(dl * feedback);
    outL[i] = dl;
    outR[i] = dr;
  }
  return [outL, outR];
}

// Look-ahead peak limiter.
export function limiter([L, R], ceiling = 0.89, release = 0.08, look = 0.003) {
  const n = L.length;
  const la = S(look);
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    need[i] = p > ceiling ? ceiling / p : 1;
  }
  // Minimum over the look-ahead window, then smooth release.
  const g = new Float32Array(n);
  let cur = 1;
  const rel = Math.exp(-1 / (release * SR));
  for (let i = 0; i < n; i++) {
    let m = 1;
    for (let j = i; j < Math.min(n, i + la); j++) if (need[j] < m) m = need[j];
    cur = m < cur ? m : m + (cur - m) * rel;
    g[i] = cur;
  }
  const oL = new Float32Array(n);
  const oR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    oL[i] = L[i] * g[i];
    oR[i] = R[i] * g[i];
  }
  return [oL, oR];
}

export function writeWav(file, [L, R], writeFileSync) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 8, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 8, 28);
  buf.writeUInt16LE(8, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) {
    buf.writeFloatLE(L[i], 44 + i * 8);
    buf.writeFloatLE(R[i], 48 + i * 8);
  }
  writeFileSync(file, buf);
}
