// Full pipeline: soundtrack -> parallel chunked frame render (lossless) -> H.264/AAC master.
//   node tools/render-all.mjs [--workers 3] [--samples 12] [--only 560-680] [--crf 17]
// Chunks are cached in out/parts; --only re-renders just the chunks touching that frame range.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpegPath } from './render.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

const FRAMES = 900;
const CHUNK = 60;
const workers = Number(args.workers || 3);
const samples = String(args.samples || 12);
const partsDir = path.join(root, 'out/parts');
fs.mkdirSync(partsDir, { recursive: true });

const run = (cmd, argv, opts = {}) =>
  new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], cwd: root, ...opts });
    let err = '';
    p.stdout.on('data', () => {});
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${cmd} ${argv.join(' ')}\n${err.slice(-2000)}`))));
  });

async function main() {
  const t0 = Date.now();
  await run('node', ['tools/audio.mjs']);
  console.log('soundtrack ready');

  const chunks = [];
  for (let f = 0; f < FRAMES; f += CHUNK) chunks.push([f, Math.min(FRAMES, f + CHUNK)]);
  let todo = chunks;
  if (args['mux-only']) todo = [];
  else if (args.only) {
    const [a, c] = args.only.split('-').map(Number);
    todo = chunks.filter(([f0, f1]) => f1 > a && f0 < c);
  } else if (!args.force) {
    todo = chunks.filter(([f0, f1]) => !fs.existsSync(path.join(partsDir, `part_${f0}_${f1}.mkv`)));
  }
  console.log(`rendering ${todo.length}/${chunks.length} chunks with ${workers} workers, ${samples} samples`);

  const queue = [...todo];
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const [f0, f1] = queue.shift();
      const file = `out/parts/part_${f0}_${f1}.mkv`;
      await run('node', ['tools/render.mjs', '--video', file, '--from', String(f0), '--to', String(f1), '--samples', samples, '--lossless']);
      done++;
      console.log(`  chunk ${f0}-${f1} done (${done}/${todo.length}, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));

  const list = chunks.map(([f0, f1]) => `file '${path.join(partsDir, `part_${f0}_${f1}.mkv`)}'`).join('\n');
  fs.writeFileSync(path.join(partsDir, 'list.txt'), list);
  const out = path.join(root, args.out || 'out/claude-showreel.mp4');
  execFileSync(ffmpegPath(), [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', path.join(partsDir, 'list.txt'),
    '-i', path.join(root, 'out/soundtrack.wav'),
    '-map', '0:v', '-map', '1:a',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf || 17), '-profile:v', 'high',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-r', '60', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
    '-movflags', '+faststart', '-shortest', out,
  ]);
  // Cover art: the end card, so file browsers don't show the black first frame.
  const poster = path.join(root, 'out/poster.jpg');
  execFileSync(ffmpegPath(), ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '14.9', '-i', out, '-frames:v', '1', '-q:v', '2', poster]);
  const final = path.join(root, args.final || 'claude-showreel.mp4');
  execFileSync(ffmpegPath(), [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', out, '-i', poster,
    '-map', '0', '-map', '1', '-c', 'copy', '-disposition:v:1', 'attached_pic',
    '-metadata', 'title=Claude — Motion Reel 2026', '-metadata', 'artist=Claude',
    '-metadata', 'comment=Rendered in code: headless Chromium + WebGL, soundtrack synthesized from scratch.',
    '-movflags', '+faststart', final,
  ]);
  const mb = (fs.statSync(final).size / 1e6).toFixed(1);
  console.log(`wrote ${path.relative(root, final)} (${mb} MB) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
