// EINMALIGES Werkzeug (Phase 0): zerlegt die historische Single-File-App
// (legacy/index.html) in Quell-Module unter src/legacy/. Die Chunks sind
// wortwörtliche Slices — keinerlei Code-Transformation. Zusammengesetzt
// werden sie von tools/concat-legacy.mjs in exakt dieser Reihenfolge.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'legacy/index.html'), 'utf8').split('\n');

// Grenzen (1-basiert, wie im Original ermittelt):
//   CSS   46..2766   (zwischen <style> und </style>)
//   JS  2830..18781  (zwischen <script> und </script>)
const css = src.slice(45, 2766).join('\n');
mkdirSync(join(root, 'src/styles'), { recursive: true });
writeFileSync(join(root, 'src/styles/app.css'), css + '\n');

const js = src.slice(2829, 18781);

// Chunk-Grenzen: jede Zeile, die mit "// ╔" beginnt, startet eine Sektion.
const bounds = [];
js.forEach((line, i) => { if (line.startsWith('// ╔')) bounds.push(i); });

function slug(markerIdx) {
  const line = js[markerIdx];
  let m = line.match(/§([\d.]+)\s*─*\s*([^─╗]*)/);
  let sec = m ? m[1].replace(/\.$/, '') : '';
  let title = m && m[2] ? m[2].trim() : '';
  if (!title) {
    // Marker ohne Titel (z. B. der große §11-News-Block): Folgezeilen absuchen
    for (let j = markerIdx + 1; j < markerIdx + 4; j++) {
      const t = (js[j] || '').match(/§?([\d.]+)?\s*─*\s*([A-ZÄÖÜ][^─╗║]*)/);
      if (t && t[2] && t[2].trim().length > 3) { title = t[2].trim(); if (!sec && t[1]) sec = t[1]; break; }
    }
  }
  const clean = (title || 'section')
    .toLowerCase()
    .replace(/[äöüß]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c]))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return { sec: sec || 'x', clean };
}

mkdirSync(join(root, 'src/legacy'), { recursive: true });
const manifest = [];
// Prelude (TOC-Kommentare) vor dem ersten Marker
const first = bounds[0];
writeFileSync(join(root, 'src/legacy/000-toc.js'), js.slice(0, first).join('\n') + '\n');
manifest.push('000-toc.js');

bounds.forEach((start, k) => {
  const end = k + 1 < bounds.length ? bounds[k + 1] : js.length;
  const { sec, clean } = slug(start);
  const name = `${String(k + 1).padStart(3, '0')}-s${sec}-${clean}.js`;
  writeFileSync(join(root, 'src/legacy', name), js.slice(start, end).join('\n') + '\n');
  manifest.push(name);
});

console.log(manifest.join('\n'));
console.log(`\n${manifest.length} Chunks, CSS ${css.split('\n').length} Zeilen`);
