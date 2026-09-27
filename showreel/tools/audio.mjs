// Soundtrack + sound design, synthesized from scratch and locked to the same
// 128 BPM grid as the picture. 8 bars of F minor = exactly 15 seconds.
//   node tools/audio.mjs  -> out/soundtrack.wav
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, TAU, S, mtof, rng, Biquad, Saw, sweepFilter, filter, reverb, pingpong, limiter, writeWav } from './dsp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cues = JSON.parse(readFileSync(path.join(root, 'src/data/cues.json'), 'utf8'));

const BPM = 128;
const BEAT = 60 / BPM;
const DUR = 15;
const N = Math.round(DUR * SR);
const b = (x) => x * BEAT;
const rand = rng(90210);
const nz = () => rand() * 2 - 1;

const bus = () => [new Float32Array(N), new Float32Array(N)];
const drums = bus();
const bass = bus();
const music = bus();
const fx = bus();
const verb = bus(); // reverb send
const echo = bus(); // delay send

// Mix a mono buffer onto a bus with equal-power pan, plus optional sends.
// Every voice gets a 3 ms tail fade so hard stops never click.
const FADE = S(0.003);
const tailGain = (i, n) => (i >= n - FADE ? (n - i) / FADE : 1);

function put(target, buf, t, gain = 1, pan = 0, { rv = 0, dl = 0 } = {}) {
  const i0 = S(t);
  const a = ((pan + 1) * Math.PI) / 4;
  const gl = Math.cos(a) * gain * Math.SQRT2;
  const gr = Math.sin(a) * gain * Math.SQRT2;
  for (let i = 0; i < buf.length; i++) {
    const j = i0 + i;
    if (j < 0) continue;
    if (j >= N) break;
    const v = buf[i] * tailGain(i, buf.length);
    target[0][j] += v * gl;
    target[1][j] += v * gr;
    if (rv) {
      verb[0][j] += v * gl * rv;
      verb[1][j] += v * gr * rv;
    }
    if (dl) {
      echo[0][j] += v * gl * dl;
      echo[1][j] += v * gr * dl;
    }
  }
}
function putStereo(target, [bl, br], t, gain = 1, { rv = 0, dl = 0 } = {}) {
  const i0 = S(t);
  for (let i = 0; i < bl.length; i++) {
    const j = i0 + i;
    if (j < 0) continue;
    if (j >= N) break;
    const g = gain * tailGain(i, bl.length);
    target[0][j] += bl[i] * g;
    target[1][j] += br[i] * g;
    if (rv) {
      verb[0][j] += bl[i] * g * rv;
      verb[1][j] += br[i] * g * rv;
    }
    if (dl) {
      echo[0][j] += bl[i] * g * dl;
      echo[1][j] += br[i] * g * dl;
    }
  }
}

// ---------- Instruments ----------

function kick(vel = 1, len = 0.46) {
  const n = S(len);
  const out = new Float32Array(n);
  let ph = 0;
  const click = new Biquad('highpass', 1800, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 46 + 170 * Math.exp(-t / 0.032) + 90 * Math.exp(-t / 0.005);
    ph += (TAU * f) / SR;
    const env = Math.min(1, t / 0.001) * Math.exp(-t / 0.17) * Math.min(1, (len - t) / 0.06);
    let s = Math.sin(ph) * env;
    s += click.process(nz()) * Math.exp(-t / 0.003) * 0.5;
    out[i] = (Math.tanh(s * 1.5) / Math.tanh(1.5)) * vel;
  }
  return out;
}

function clap(vel = 1, tone = 1400) {
  const n = S(0.4);
  const out = new Float32Array(n);
  const bp = new Biquad('bandpass', tone, 0.8);
  const hp = new Biquad('highpass', 650, 0.7);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env = 0;
    for (const o of [0, 0.0085, 0.017, 0.025]) if (t >= o) env = Math.max(env, Math.exp(-(t - o) / 0.0042));
    if (t > 0.025) env = Math.max(env, 0.6 * Math.exp(-(t - 0.025) / 0.11));
    ph += (TAU * 190) / SR;
    const body = Math.sin(ph) * Math.exp(-t / 0.035) * 0.35;
    out[i] = (hp.process(bp.process(nz())) * env * 2.4 + body) * vel;
  }
  return out;
}

const HAT_F = [205.3, 304.4, 369.6, 522.7, 540, 800];
function hat(decay = 0.03, vel = 1) {
  const n = S(decay * 7 + 0.01);
  const out = new Float32Array(n);
  const bp = new Biquad('bandpass', 10000, 0.9);
  const hp = new Biquad('highpass', 7200, 0.7);
  const ph = HAT_F.map(() => rand());
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let m = 0;
    for (let k = 0; k < 6; k++) {
      ph[k] += (HAT_F[k] * 1.3) / SR;
      m += ph[k] % 1 < 0.5 ? 1 : -1;
    }
    const s = hp.process(bp.process(m / 6 + nz() * 0.35));
    out[i] = s * Math.min(1, t / 0.0008) * Math.exp(-t / decay) * vel * 1.6;
  }
  return out;
}

function bassNote(midi, len, vel = 1) {
  const f = mtof(midi);
  const n = S(len + 0.02);
  const out = new Float32Array(n);
  const saw = new Saw();
  const lp = new Biquad('lowpass', 800, 1.1);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i % 32 === 0) lp.set('lowpass', 180 + 1400 * Math.exp(-t / 0.07), 1.1);
    ph += (TAU * f) / SR;
    const sub = Math.sin(ph);
    const mid = lp.process(saw.next(f) + saw.next(f * 1.004) * 0);
    const env = Math.min(1, t / 0.004) * Math.exp(-t / (len * 0.9)) * Math.min(1, Math.max(0, (len + 0.02 - t) / 0.02));
    out[i] = Math.tanh((sub * 0.85 + mid * 0.7) * 1.4) * env * vel;
  }
  return out;
}

// Supersaw pluck / stab, stereo.
function supersaw(notes, len, { vel = 1, c0 = 6000, c1 = 700, fdec = 0.12, attack = 0.003, release = 0.08, detune = 0.16, voices = 5, q = 0.9, curve = null } = {}) {
  const n = S(len + release);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const oscs = [];
  for (const m of notes) {
    for (let v = 0; v < voices; v++) {
      const off = voices === 1 ? 0 : (v / (voices - 1)) * 2 - 1;
      oscs.push({ f: mtof(m + off * detune), saw: new Saw(rand()), pan: off * 0.8 });
    }
  }
  const lpL = new Biquad('lowpass', c0, q);
  const lpR = new Biquad('lowpass', c0, q);
  const norm = 1 / Math.sqrt(oscs.length);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i % 32 === 0) {
      const c = curve ? curve(t) : c1 + (c0 - c1) * Math.exp(-t / fdec);
      lpL.set('lowpass', c, q);
      lpR.set('lowpass', c, q);
    }
    let l = 0;
    let r = 0;
    for (const o of oscs) {
      const s = o.saw.next(o.f);
      const a = ((o.pan + 1) * Math.PI) / 4;
      l += s * Math.cos(a);
      r += s * Math.sin(a);
    }
    const rel = t > len ? Math.max(0, 1 - (t - len) / release) : 1;
    const env = Math.min(1, t / attack) * rel;
    L[i] = lpL.process(l * norm) * env * vel;
    R[i] = lpR.process(r * norm) * env * vel;
  }
  return [L, R];
}

function sine(fFn, len, envFn, vel = 1) {
  const n = S(len);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * fFn(t)) / SR;
    out[i] = Math.sin(ph) * envFn(t) * vel;
  }
  return out;
}

const decayEnv = (d, a = 0.002) => (t) => Math.min(1, t / a) * Math.exp(-t / d);

// Noise swept through a bandpass; shape(p) is the amplitude curve over 0..1.
function whoosh(len, f0, f1, shape, { q = 1.2, type = 'bandpass', vel = 1 } = {}) {
  const n = S(len);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = nz();
  sweepFilter(out, type, (t) => f0 * Math.pow(f1 / f0, Math.min(1, t / len)), q);
  for (let i = 0; i < n; i++) out[i] *= shape(i / n) * vel;
  return out;
}

function tok(f, vel = 1, d = 0.035) {
  return sine((t) => f * (1 + 0.5 * Math.exp(-t / 0.004)), d * 6, decayEnv(d, 0.0008), vel).map(
    (v, i) => v + Math.sin((TAU * f * 2.76 * i) / SR) * Math.exp(-i / SR / (d * 0.4)) * 0.4 * vel,
  );
}

function tick(vel = 1, f = 3500) {
  const n = S(0.02);
  const out = new Float32Array(n);
  const bp = new Biquad('bandpass', f, 2.5);
  for (let i = 0; i < n; i++) out[i] = bp.process(nz()) * Math.exp(-i / SR / 0.0025) * vel * 3;
  return out;
}

function droplet(f0, f1, vel = 1, len = 0.16) {
  return sine((t) => f0 * Math.pow(f1 / f0, Math.min(1, t / 0.05)), len, (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.05), vel);
}

function impact(vel = 1, len = 2.4) {
  const n = S(len);
  const out = new Float32Array(n);
  let ph = 0;
  const hp = new Biquad('highpass', 2200, 0.7);
  const lp = new Biquad('lowpass', 9000, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * (30 + 45 * Math.exp(-t / 0.25))) / SR;
    const boom = Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t / 0.75);
    const crash = lp.process(hp.process(nz())) * Math.exp(-t / 0.5) * 0.35;
    out[i] = (Math.tanh(boom * 1.6) + crash) * vel;
  }
  return out;
}

// Rising suck (reverse swell) that cuts dead at the end.
function suck(len, vel = 1, f0 = 300, f1 = 9000) {
  const out = whoosh(len, f0, f1, (p) => Math.pow(p, 2.6), { q: 0.8, type: 'lowpass', vel });
  const tail = S(0.004);
  for (let i = 0; i < tail; i++) out[out.length - 1 - i] *= i / tail;
  return out;
}

// ---------- Arrangement ----------

const CH = {
  Fm: [56, 60, 65, 68],
  Db: [56, 61, 65, 68],
  Ab: [56, 60, 63, 68],
  Eb: [55, 58, 63, 67],
  Fin: [53, 60, 65, 68, 72, 79],
};
const ROOT = { Fm: 29, Db: 37, Ab: 32, Eb: 39 };
const BARS = [null, 'Fm', 'Db', 'Ab', 'Eb', 'Fm', 'Db']; // bars 2..7 (index = bar - 1)
const STOP = b(27.5); // the breath before the final hit

// Kicks (and the sidechain they drive).
const kicks = [];
for (let beat = 4; beat < 28; beat++) kicks.push(b(beat));
for (const t of kicks) put(drums, kick(1), t, 0.5);

// Claps on 2 and 4, bars 2..7 (bar 7 hands over to the roll).
for (let bar = 1; bar < 7; bar++) {
  for (const st of [4, 12]) {
    const t = b(bar * 4) + (st * BEAT) / 4;
    if (t >= b(26)) continue;
    put(drums, clap(1), t, 0.2, 0.05, { rv: 0.3 });
  }
}

// Hats: intro ticks building, then 16ths with open hats on the offbeats.
for (let st = 4; st < 16; st++) {
  const t = (st * BEAT) / 4;
  put(drums, hat(0.018, 1), t, 0.02 + 0.04 * (st / 16), 0.25);
}
for (let bar = 1; bar < 7; bar++) {
  for (let st = 0; st < 16; st++) {
    const t = b(bar * 4) + (st * BEAT) / 4;
    if (t >= STOP) continue;
    if (st % 4 === 2) put(drums, hat(0.13, 1), t, 0.07, -0.18);
    else put(drums, hat(0.022, 1), t, st % 2 ? 0.035 : 0.05, 0.22);
  }
}

// Snare rolls: into the drop, and the montage build.
const roll1 = [3, 3.25, 3.5, 3.625, 3.75, 3.875];
roll1.forEach((x, i) => put(drums, clap(0.5 + 0.1 * i, 1500 + i * 120), b(x), 0.14, 0, { rv: 0.3 }));
const roll2 = [26, 26.5, 26.75, 27, 27.125, 27.25, 27.375];
roll2.forEach((x, i) => put(drums, clap(0.5 + 0.08 * i, 1400 + i * 160), b(x), 0.16, 0, { rv: 0.3 }));

// Bass: offbeat eighths with a pickup, following the chords.
for (let bar = 1; bar < 7; bar++) {
  const ch = BARS[bar];
  for (const st of [2, 6, 10, 14, 15]) {
    const t = b(bar * 4) + (st * BEAT) / 4;
    if (t >= STOP) continue;
    const up = st === 15 ? 12 : 0;
    const len = st === 15 || st === 14 ? BEAT / 4 - 0.01 : BEAT / 2 - 0.02;
    put(bass, bassNote(ROOT[ch] + up, len, st === 15 ? 0.7 : 1), t, 0.3);
  }
}

// Plucks: syncopated supersaw chords.
for (let bar = 1; bar < 7; bar++) {
  const ch = BARS[bar];
  const steps = bar === 6 ? [0, 2, 4, 6, 8, 10] : [0, 3, 6, 10, 12];
  for (const st of steps) {
    const t = b(bar * 4) + (st * BEAT) / 4;
    if (t >= STOP - 0.02) continue;
    const lift = bar === 6 ? 2200 * (st / 10) : 0;
    const p = supersaw(CH[ch], 0.16, { vel: 1, c0: 5200 + lift, c1: 650 + lift * 0.4, fdec: 0.09, release: 0.12 });
    putStereo(music, p, t, 0.3, { rv: 0.25, dl: 0.22 });
  }
}

// Arp over bars 5-6: sixteenths an octave up.
for (let bar = 4; bar < 6; bar++) {
  const ch = CH[BARS[bar]];
  const seq = [0, 1, 2, 3, 2, 1, 3, 2];
  for (let st = 0; st < 16; st++) {
    const t = b(bar * 4) + (st * BEAT) / 4;
    const m = ch[seq[st % 8]] + 12;
    const p = supersaw([m], 0.07, { vel: 1, c0: 4200, c1: 900, fdec: 0.05, voices: 3, detune: 0.08, release: 0.05 });
    putStereo(music, p, t, 0.11, { rv: 0.2, dl: 0.35 });
  }
}

// Intro pad (bar 1) and final chord (bar 8).
putStereo(music, supersaw([53, 56, 60, 65], b(4) - 0.05, { vel: 1, attack: 0.5, release: 0.05, detune: 0.2, voices: 5, curve: (t) => 350 + 2600 * Math.pow(t / b(4), 2.2) }), 0, 0.2, { rv: 0.4 });
putStereo(music, supersaw(CH.Fin, 0.34, { vel: 1, c0: 7000, c1: 1100, fdec: 0.18, release: 0.25, detune: 0.18 }), b(28), 0.5, { rv: 0.6, dl: 0.25 });
putStereo(music, supersaw(CH.Fin, 1.75, { vel: 1, attack: 0.08, release: 0.2, detune: 0.22, curve: (t) => 2400 * Math.exp(-t / 0.9) + 500 }), b(28), 0.2, { rv: 0.5 });

// ---------- Sound design ----------

// 01: leader beeps, projector flutter, implosion, riser into the drop.
for (const k of [0, 1, 2]) put(fx, sine(() => 1046.5, 0.1, (t) => Math.min(1, t / 0.002) * (t < 0.075 ? 1 : Math.max(0, 1 - (t - 0.075) / 0.01))), b(k), 0.2, 0, { rv: 0.15 });
put(fx, whoosh(b(3), 800, 1800, (p) => 0.35 * (0.6 + 0.4 * Math.sin(p * b(3) * TAU * 24)) * Math.min(1, p * 8) * (1 - p * 0.5), { q: 0.6 }), 0, 0.12);
put(fx, whoosh(b(2), 300, 7000, (p) => Math.pow(p, 2.2), { q: 1.4 }), b(2), 0.26, 0, { rv: 0.3 });
put(fx, suck(b(0.9), 1, 200, 7000), b(3.1), 0.32);
put(fx, sine((t) => 180 + 900 * Math.pow(t / b(1), 2), b(1), (t) => Math.pow(t / b(1), 2)), b(3), 0.07);
put(fx, tok(1200, 1, 0.04), b(3) + 0.18, 0.3, 0, { rv: 0.2 });

// 02: the drop.
put(fx, impact(1, 2), b(4), 0.3, 0, { rv: 0.2 });
put(fx, whoosh(0.35, 3000, 600, (p) => (1 - p) * Math.min(1, p * 20)), b(5), 0.16, -0.2);
put(fx, suck(0.17, 1, 400, 5000), b(6) - 0.17, 0.12);
const eC = cues.eContact;
put(fx, whoosh(0.18, 500, 5000, (p) => Math.pow(p, 1.5)), eC - 0.16, 0.26, -0.7);
put(fx, whoosh(0.05, 900, 400, (p) => Math.exp(-p * 4), { q: 0.7, vel: 2 }), eC, 0.25, -0.3);
put(fx, clap(1, 1800), eC, 0.14, 0, { rv: 0.3 });
for (let i = 0; i < 23; i += 2) put(fx, tick(0.5, 3000 + rand() * 1500), b(6.5) + (i / 23) * 0.35, 0.1, 0.1);
[0, 1, 2, 3, 4, 5].forEach((i) => put(fx, tok(mtof([77, 80, 82, 84, 87, 89][i]), 1, 0.03), b(7) + i * 0.045 + 0.05, 0.1, -0.5 + i * 0.2, { rv: 0.2 }));
put(fx, whoosh(0.5, 300, 6000, (p) => Math.sin(Math.PI * p) ** 2), b(7.55), 0.25, 0);

// FRAME letters land (outBounce contacts), then the dot bounces in.
const bounceHits = [1 / 2.75, 2 / 2.75, 2.5 / 2.75, 1];
const bounceVol = [1, 0.35, 0.15, 0.06];
for (let i = 0; i < 5; i++) {
  bounceHits.forEach((h, k) => k < 2 && put(fx, tok(mtof([65, 68, 70, 72, 75][i]), bounceVol[k], 0.035), b(8) + i * 0.045 + 0.5 * h, 0.28, -0.6 + i * 0.25, { rv: 0.15 }));
}
bounceHits.forEach((h, k) => put(fx, droplet(900, 1500, bounceVol[k], 0.1), b(8.5) + 0.55 * h, 0.3, 0.6, { rv: 0.2 }));
put(fx, whoosh(0.42, 2000, 7000, (p) => Math.sin(Math.PI * p) * 0.8, { q: 2 }), b(8.5), 0.08, -0.4);

// Brackets snap, labels type, autofocus locks.
for (let i = 0; i < 4; i++) put(fx, tick(1, 2500 + i * 300), b(9) + i * 0.035 + 0.1, 0.35, [-0.8, 0.8, 0.8, -0.8][i]);
for (let i = 0; i < 12; i++) put(fx, tick(0.4, 4200), b(9.3) + i * 0.025, 0.06, i % 2 ? 0.6 : -0.6);
for (let i = 0; i < 4; i++) put(fx, tick(1, 3200), b(10) + i * 0.02 + 0.12, 0.3, 0.3);
for (const d of [0.14, 0.2]) put(fx, sine(() => 2350, 0.05, (t) => Math.min(1, t / 0.002) * (t < 0.035 ? 1 : 0)), b(10) + d, 0.14, 0.2);

// Dive into the dot, then pull out into the grid.
put(fx, whoosh(b(0.5), 400, 9000, (p) => Math.pow(p, 3)), b(10.5), 0.45, 0, { rv: 0.2 });
put(fx, whoosh(0.6, 7000, 250, (p) => Math.pow(1 - p, 2) * Math.min(1, p * 30)), b(11), 0.4, 0, { rv: 0.25 });
put(fx, impact(0.6, 1), b(11), 0.14);

// 03: tile pops, rotation flutters, card flips panned across the grid.
const tilesR = [];
for (let j = -3; j <= 3; j++) for (let i = -8; i <= 8; i++) tilesR.push({ i, j, d: Math.hypot(i, j) });
for (const tl of tilesR) if (rand() < 0.3) put(fx, tok(1800 + rand() * 1400, 0.4, 0.012), b(11) + 0.12 + tl.d * 0.032 + 0.1, 0.06, tl.i / 9);
const flutter = (t0, delay, dir) => {
  for (const tl of tilesR) if (rand() < 0.35) put(fx, tick(0.6, 1800 + rand() * 2500), t0 + delay(tl) + 0.08 + rand() * 0.04, 0.09, (tl.i / 9) * dir);
};
flutter(b(12), (tl) => tl.d * 0.03, 1);
flutter(b(12.5), (tl) => tl.d * 0.03, 1);
flutter(b(13.5), (tl) => (tl.i + tl.j + 11) * 0.017, 1);
flutter(b(14.5), (tl) => (8 - tl.i) * 0.018, 1);
const flap = (vel) => whoosh(0.07, 900, 3500, (p) => Math.sin(Math.PI * p), { q: 0.9, vel });
for (let c = -8; c <= 8; c++) put(fx, flap(1), b(13) + (c + 8) * 0.02 + 0.12, 0.14, c / 9);
for (const tl of tilesR) if (rand() < 0.3) put(fx, flap(0.8), b(14) + tl.d * 0.035 + 0.12, 0.08, tl.i / 9);
for (const tl of tilesR) if (rand() < 0.3) put(fx, flap(0.8), b(15) + tl.d * 0.016 + 0.12, 0.08, tl.i / 9);
[0, 7, 12].forEach((iv, k) => put(fx, sine(() => mtof(77 + iv), 0.6, decayEnv(0.25, 0.004)), b(15) + 0.3 + k * 0.02, 0.05, 0, { rv: 0.5, dl: 0.3 }));

// 04: tilt into 3D, ripples, the core hop, the whip.
put(fx, sine((t) => 40 + 50 * Math.min(1, t / 0.5), 0.9, (t) => Math.sin(Math.PI * Math.min(1, t / 0.9)) ** 2), b(16), 0.22);
put(fx, whoosh(b(1.3), 200, 2500, (p) => Math.sin(Math.PI * p) ** 2, { q: 0.7 }), b(16), 0.22, 0, { rv: 0.3 });
for (const k of [17, 18, 19]) {
  const wub = new Float32Array(S(0.5));
  const s = new Saw();
  for (let i = 0; i < wub.length; i++) wub[i] = s.next(mtof(41)) * Math.exp(-i / SR / 0.18);
  sweepFilter(wub, 'lowpass', (t) => 200 + 2400 * Math.exp(-t / 0.08), 4);
  put(fx, wub, b(k), 0.12, 0, { rv: 0.15 });
}
put(fx, sine((t) => 300 + 500 * Math.sin(Math.PI * Math.min(1, t / 0.4)), 0.45, (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.25)), b(18.5), 0.1, 0, { rv: 0.3 });
put(fx, whoosh(b(0.5), 300, 8000, (p) => Math.pow(p, 2.5), { q: 0.9 }), b(19.5), 0.45, -0.6);
put(fx, whoosh(0.4, 8000, 400, (p) => Math.pow(1 - p, 2)), b(20), 0.35, 0.6, { rv: 0.2 });

// 05: glass droplets.
put(fx, droplet(260, 900, 1, 0.2), b(20) + 0.02, 0.3, 0, { rv: 0.35 });
put(fx, droplet(380, 1200), b(20.5) + 0.05, 0.22, -0.5, { rv: 0.35 });
put(fx, droplet(420, 1300), b(20.5) + 0.08, 0.22, 0.5, { rv: 0.35 });
[[-0.6, 520], [0.6, 560], [-0.3, 640], [0.3, 700]].forEach(([p, f], i) => put(fx, droplet(f, f * 2.6), b(21) + 0.04 + i * 0.03, 0.14, p, { rv: 0.35 }));
put(fx, droplet(700, 2200, 0.8, 0.12), b(21.5) + 0.05, 0.14, 0.8, { rv: 0.3 });
put(fx, droplet(760, 2400, 0.8, 0.12), b(21.5) + 0.07, 0.14, -0.8, { rv: 0.3 });
put(fx, tick(0.8, 4000), b(21.6), 0.1, 0.4);
for (const x of [22, 22.5]) put(fx, droplet(500 + rand() * 300, 1500, 0.5), b(x) + 0.03, 0.08, rand() - 0.5, { rv: 0.4 });
put(fx, droplet(900, 220, 1, 0.3), b(23) + 0.1, 0.28, 0, { rv: 0.35 });
put(fx, suck(b(0.7), 1, 300, 6000), b(23.3), 0.22);

// 06: a sonic signature for every cut.
const cutFx = [
  () => sine((t) => 700 + 180 * Math.sin(t * TAU * 38), 0.22, decayEnv(0.08)),
  () => {
    const z = new Float32Array(S(0.2));
    const s = new Saw();
    for (let i = 0; i < z.length; i++) z[i] = s.next(1800 * Math.exp(-i / SR / 0.03) + 90) * Math.exp(-i / SR / 0.06);
    return filter(z, 'lowpass', 5000);
  },
  () => droplet(500, 1500, 1, 0.14),
  () => tick(1.4, 2800),
  () => {
    const z = new Float32Array(S(0.2));
    for (let i = 0; i < z.length; i++) {
      const t = i / SR;
      const f = [698.5, 1046.5, 1396.9, 2093][Math.min(3, Math.floor(t / 0.035))];
      z[i] = (Math.sin(TAU * f * t) > 0 ? 1 : -1) * 0.5 * Math.exp(-t / 0.08);
    }
    return filter(z, 'lowpass', 4000);
  },
  () => sine((t) => 500 * Math.pow(4, Math.min(1, t / 0.12)), 0.2, decayEnv(0.07)),
  () => {
    const z = whoosh(0.25, 6000, 12000, (p) => Math.exp(-p * 5), { q: 0.8 });
    for (let k = 0; k < 6; k++) {
      const f = 2500 + rand() * 4000;
      const d = rand() * 0.08;
      for (let i = S(d); i < z.length; i++) z[i] += Math.sin((TAU * f * (i - S(d))) / SR) * Math.exp(-(i - S(d)) / SR / 0.03) * 0.25;
    }
    return z;
  },
  () => whoosh(0.12, 400, 4000, (p) => Math.sin(Math.PI * p), { q: 1.5 }),
];
const cutAt = [24, 24.5, 25, 25.5, 26, 26.5, 27, 27.25];
const cutGain = [0.12, 0.14, 0.2, 0.26, 0.1, 0.12, 0.2, 0.2];
cutAt.forEach((x, k) => put(fx, cutFx[k](), b(x), cutGain[k], [0, -0.3, 0.2, 0.4, -0.2, 0.3, 0, 0][k], { rv: 0.2 }));
put(fx, tick(1, 2000), b(25.5) + 0.05, 0.2, 0.3);
put(fx, whoosh(b(3.5), 400, 11000, (p) => Math.pow(p, 2.4), { q: 1.1 }), b(24), 0.3, 0, { rv: 0.2 });
put(fx, sine((t) => 110 * Math.pow(2, (t / b(3.5)) * 2), b(3.5), (t) => Math.pow(t / b(3.5), 2)), b(24), 0.07);
put(fx, sine(() => 1046.5, b(0.5), (t) => 0.3 * Math.pow(t / b(0.5), 3)), b(27.5), 0.05);

// 07: the final hit, the hop, the landing, the shine.
put(fx, impact(1.1, 2.4), b(28), 0.36, 0, { rv: 0.25 });
put(fx, kick(1, 0.5), b(28), 0.45);
put(fx, whoosh(1.5, 9000, 1200, (p) => Math.exp(-p * 3.5), { q: 0.5, type: 'highpass' }), b(28), 0.18, 0, { rv: 0.4 });
put(fx, sine((t) => 420 + 700 * Math.sin(Math.PI * Math.min(1, t / 0.46)), 0.46, (t) => Math.min(1, t / 0.02) * 0.7), b(28), 0.06, 0.3);
put(fx, tok(620, 1, 0.05), b(28) + 0.46, 0.32, 0.5, { rv: 0.3 });
put(fx, whoosh(0.5, 1500, 6000, (p) => Math.sin(Math.PI * p) ** 2, { q: 1 }), b(29), 0.07, 0, { rv: 0.3 });
[80, 84, 89, 91].forEach((m, k) => put(fx, sine(() => mtof(m), 0.9, decayEnv(0.3, 0.01)), b(29.6) + k * 0.07, 0.04, -0.4 + k * 0.25, { rv: 0.6, dl: 0.3 }));
for (let i = 0; i < 38; i += 2) put(fx, tick(0.35, 3800 + rand() * 800), b(29.7) + (i / 38) * 0.6, 0.06, 0);
put(fx, droplet(650, 900, 1, 0.2), b(31), 0.12, 0.5, { rv: 0.4 });

// ---------- Mix ----------

// Sidechain pump from the kick grid.
const duck = new Float32Array(N).fill(1);
for (const t of kicks) {
  const i0 = S(t);
  for (let i = 0; i < S(0.4); i++) {
    const j = i0 + i;
    if (j >= N) break;
    const u = i / SR;
    const e = u < 0.004 ? u / 0.004 : Math.exp(-(u - 0.004) / 0.12);
    duck[j] = Math.min(duck[j], 1 - e);
  }
}
const apply = (bs, depth) => {
  for (let i = 0; i < N; i++) {
    const g = 1 - depth * (1 - duck[i]);
    bs[0][i] *= g;
    bs[1][i] *= g;
  }
};
apply(bass, 0.85);
apply(music, 0.5);

// Delay and reverb returns.
const [eL, eR] = pingpong(echo, b(0.75), 0.4, 3800);
const [vL, vR] = reverb([verb[0].map((v, i) => v + eL[i] * 0.3), verb[1].map((v, i) => v + eR[i] * 0.3)], { room: 0.86, damp: 0.35 });

// Groove bus (drums + bass + music + returns) goes "underwater" during the glass chapter.
const groove = bus();
for (let i = 0; i < N; i++) {
  groove[0][i] = drums[0][i] + bass[0][i] + music[0][i] + eL[i] * 0.5 + vL[i] * 0.7;
  groove[1][i] = drums[1][i] + bass[1][i] + music[1][i] + eR[i] * 0.5 + vR[i] * 0.7;
}
const water = (t) => {
  const down = Math.min(1, Math.max(0, (t - b(20)) / 0.12));
  const up = Math.min(1, Math.max(0, (t - b(23.25)) / (b(24) - b(23.25))));
  const lo = Math.log(620);
  const hi = Math.log(20000);
  return Math.exp(hi + (lo - hi) * down + (hi - lo) * Math.pow(up, 2.5) * (down > 0 ? 1 : 0));
};
for (const ch of [0, 1]) {
  const f = new Biquad('lowpass', 20000, 0.9);
  for (let i = S(b(19.9)); i < S(b(24.1)); i++) {
    if (i % 32 === 0) f.set('lowpass', Math.min(20000, water(i / SR)), 0.9);
    groove[ch][i] = f.process(groove[ch][i]);
  }
}

// The breath: hard stop of the groove at b27.5, reverb and fx keep the air alive.
for (let i = S(STOP); i < S(b(28)); i++) {
  const k = Math.max(0, 1 - (i - S(STOP)) / S(0.006));
  groove[0][i] *= k;
  groove[1][i] *= k;
}

const stat = (name, bs) => {
  let pk = 0;
  let ss = 0;
  for (let i = 0; i < N; i++) {
    pk = Math.max(pk, Math.abs(bs[0][i]), Math.abs(bs[1][i]));
    ss += bs[0][i] * bs[0][i] + bs[1][i] * bs[1][i];
  }
  const db = (v) => (20 * Math.log10(v + 1e-12)).toFixed(1);
  console.log(`${name.padEnd(8)} peak ${db(pk)} dB  rms ${db(Math.sqrt(ss / (2 * N)))} dB`);
};
if (process.env.STEMS) {
  mkdirSync(path.join(root, 'out/stems'), { recursive: true });
  for (const [k, v] of Object.entries({ drums, bass, music, fx, verb: [vL, vR], echo: [eL, eR] })) writeWav(path.join(root, `out/stems/${k}.wav`), v, writeFileSync);
}
if (process.env.STATS) {
  stat('drums', drums);
  stat('bass', bass);
  stat('music', music);
  stat('fx', fx);
  stat('reverb', [vL.map((v) => v * 0.7), vR.map((v) => v * 0.7)]);
  stat('echo', [eL.map((v) => v * 0.5), eR.map((v) => v * 0.5)]);
  stat('groove', groove);
}

const master = bus();
for (let i = 0; i < N; i++) {
  master[0][i] = groove[0][i] + fx[0][i];
  master[1][i] = groove[1][i] + fx[1][i];
}
// Gentle tone shaping: tame mud, add air.
for (const ch of [0, 1]) {
  filter(master[ch], 'highpass', 28, 0.7);
  filter(master[ch], 'peak', 320, 0.9, -1.5);
  filter(master[ch], 'highshelf', 9000, 0.7, 1.5);
}
// Fade the last 0.25 s so the file ends clean.
for (let i = S(DUR - 0.25); i < N; i++) {
  const k = (N - i) / S(0.25);
  master[0][i] *= k;
  master[1][i] *= k;
}

const GAIN = Number(process.env.GAIN || 1.0);
for (let i = 0; i < N; i++) {
  master[0][i] = Math.tanh(master[0][i] * GAIN * 0.9) / 0.9;
  master[1][i] = Math.tanh(master[1][i] * GAIN * 0.9) / 0.9;
}
const out = limiter(master, 0.85, 0.06, 0.003);

mkdirSync(path.join(root, 'out'), { recursive: true });
writeWav(path.join(root, 'out/soundtrack.wav'), out, writeFileSync);
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[0][i]), Math.abs(out[1][i]));
console.log(`wrote out/soundtrack.wav  ${N} samples  peak ${(20 * Math.log10(peak)).toFixed(2)} dBFS`);
