// Pre-computes Archivo glyph outlines across a grid of width/weight instances.
// The browser interpolates between neighbouring instances, which gives us
// continuous variable-font animation (Canvas2D alone only exposes stepped widths).
import * as fontkit from 'fontkit';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const font = fontkit.openSync(path.join(root, 'assets/fonts/Archivo-VF.ttf'));

const WDTH = [62, 75, 87.5, 100, 112.5, 125];
const WGHT = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?&-—–/\'"()+×#@%* ';
const KERN_SET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.';

const r1 = (v) => Math.round(v * 10) / 10;
const codeOf = { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' };

const glyphs = {};
for (const ch of CHARS) glyphs[ch] = { types: null, coords: [], adv: [] };
const kern = {}; // pair -> [per-instance values]

let n = 0;
for (const wd of WDTH) {
  for (const wg of WGHT) {
    const inst = font.getVariation({ wdth: wd, wght: wg });
    for (const ch of CHARS) {
      const g = inst.glyphsForString(ch)[0];
      const cmds = g.path.commands;
      const types = cmds.map((c) => codeOf[c.command]).join('');
      const entry = glyphs[ch];
      if (entry.types === null) entry.types = types;
      else if (entry.types !== types) throw new Error(`Outline structure differs for "${ch}" at ${wd}/${wg}`);
      entry.coords.push(cmds.flatMap((c) => c.args.map(r1)));
      entry.adv.push(r1(g.advanceWidth));
    }
    for (const a of KERN_SET) {
      for (const b of KERN_SET) {
        const run = inst.layout(a + b);
        const k = run.positions[0].xAdvance - inst.glyphsForString(a)[0].advanceWidth;
        const key = a + b;
        if (!kern[key]) kern[key] = [];
        kern[key].push(r1(k));
      }
    }
    n++;
  }
}
// Drop pairs that never kern.
for (const key of Object.keys(kern)) if (kern[key].every((v) => v === 0)) delete kern[key];

const out = {
  unitsPerEm: font.unitsPerEm,
  ascent: font.ascent,
  descent: font.descent,
  capHeight: font.capHeight,
  xHeight: font.xHeight,
  wdth: WDTH,
  wght: WGHT,
  glyphs,
  kern,
};
const file = path.join(root, 'src/data/archivo-glyphs.json');
writeFileSync(file, JSON.stringify(out));
console.log(`instances=${n} glyphs=${CHARS.length} kernPairs=${Object.keys(kern).length} -> ${file}`);
