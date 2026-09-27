// Deterministic renderer: serves src/, drives headless Chromium frame by frame,
// and pipes raw frames into ffmpeg (or writes PNG stills for review).
//
//   node tools/render.mjs --stills 1.2,4.5 --samples 8        -> out/stills/*.png
//   node tools/render.mjs --video out/reel.mp4 --samples 10   -> H.264 1080p60
//   node tools/render.mjs --video out/part.mkv --from 0 --to 300 --lossless
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    const g = execSync('npm root -g').toString().trim();
    return require(path.join(g, 'playwright'));
  }
}

export function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    return execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"').toString().trim();
  } catch {
    return 'ffmpeg';
  }
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};

export function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(root, url === '/' ? 'src/index.html' : url);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

export async function openPage(port) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-accelerated-2d-canvas'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text());
  });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/src/index.html`);
  await page.waitForFunction(() => window.ready || window.initError, null, { timeout: 60000 });
  const err = await page.evaluate(() => window.initError);
  if (err) throw new Error(err);
  return { browser, page };
}

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const key = k.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) a[key] = true;
    else {
      a[key] = next;
      i++;
    }
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  const samples = Number(args.samples || 1);
  const shutter = Number(args.shutter || 0.5);
  const server = await serve();
  const port = server.address().port;
  const { browser, page } = await openPage(port);
  const meta = await page.evaluate(() => window.meta);
  if (args.cues) {
    const cues = await page.evaluate(() => window.cues);
    fs.mkdirSync(path.dirname(path.resolve(root, args.cues)), { recursive: true });
    fs.writeFileSync(path.resolve(root, args.cues), JSON.stringify(cues, null, 2));
    console.log('cues', cues);
  }

  if (args.stills) {
    const dir = path.join(root, args.dir || 'out/stills');
    fs.mkdirSync(dir, { recursive: true });
    const times = String(args.stills).split(',').map(Number);
    for (const t of times) {
      const frame = Math.round(t * meta.FPS);
      const t0 = Date.now();
      await page.evaluate(([f, s, sh]) => window.renderFrame(f, s, sh), [frame, samples, shutter]);
      const url = await page.evaluate(() => window.pngFrame());
      const name = `f${String(frame).padStart(4, '0')}_t${t.toFixed(3)}.png`;
      fs.writeFileSync(path.join(dir, name), Buffer.from(url.split(',')[1], 'base64'));
      console.log(`${name}  ${Date.now() - t0}ms`);
    }
  }

  if (args.video) {
    const from = Number(args.from || 0);
    const to = Number(args.to || meta.frames);
    const outFile = path.resolve(root, args.video);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const ff = ffmpegPath();
    const inArgs = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${meta.W}x${meta.H}`, '-r', String(meta.FPS), '-i', '-'];
    const encArgs = args.lossless
      ? ['-vf', 'vflip', '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'bgr0']
      : [
          '-vf', 'vflip,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
          '-c:v', 'libx264', '-preset', args.preset || 'slow', '-crf', String(args.crf || 16),
          '-profile:v', 'high', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
          '-movflags', '+faststart',
        ];
    const proc = spawn(ff, [...inArgs, ...encArgs, outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => proc.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
    const t0 = Date.now();
    for (let f = from; f < to; f++) {
      await page.evaluate(([fr, s, sh]) => window.renderFrame(fr, s, sh), [f, samples, shutter]);
      const b64 = await page.evaluate(() => window.readFrame());
      const buf = Buffer.from(b64, 'base64');
      if (!proc.stdin.write(buf)) await new Promise((r) => proc.stdin.once('drain', r));
      if ((f - from) % 30 === 0) {
        const el = (Date.now() - t0) / 1000;
        const per = el / (f - from + 1);
        console.log(`frame ${f}/${to}  ${per.toFixed(3)}s/frame  eta ${Math.round(per * (to - f))}s`);
      }
    }
    proc.stdin.end();
    await done;
    console.log(`wrote ${outFile} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  await browser.close();
  server.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
