// Build-Schritt (Phase 0): fügt die Legacy-Module aus src/legacy/ in
// Dateireihenfolge zu public/app.js zusammen. Das Ergebnis läuft als EIN
// klassisches (Nicht-Modul-)Skript — exakt wie im historischen index.html:
// gleiches Hoisting, Sloppy-Mode, window-globale Funktionen für die
// Inline-onclick-Handler in den Template-Strings.
//
// Die schrittweise Umstellung einzelner Engines auf echte ES-Module passiert
// ab Phase 1: eine Datei aus src/legacy/ herauslösen, als Modul nach
// src/engine/ o. ä. verschieben und hier automatisch nicht mehr mitbündeln.
//
// Kopiert außerdem die gepinnte supabase-js-UMD aus node_modules nach
// public/vendor/ (ersetzt die frühere CDN-Abhängigkeit).
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src/legacy');

const files = readdirSync(dir).filter(f => f.endsWith('.js')).sort();
const out = files.map(f => readFileSync(join(dir, f), 'utf8')).join('');

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public/app.js'), out);

mkdirSync(join(root, 'public/vendor'), { recursive: true });
copyFileSync(
  join(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'),
  join(root, 'public/vendor/supabase.js'),
);

console.log(`public/app.js: ${files.length} Chunks, ${out.split('\n').length} Zeilen`);
