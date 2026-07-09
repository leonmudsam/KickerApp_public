import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Der Update-Checker (§0.2, src/legacy/002-…) fetcht die index.html und
// sucht per Regex nach `const BUILD_VERSION='…'`. In der Single-File-App
// stand der String direkt im HTML; jetzt liegt er im JS-Bundle. Dieses
// Plugin injiziert den Marker als HTML-Kommentar, damit der Checker
// weiterhin ohne Codeänderung funktioniert (Single Source of Truth bleibt
// die Legacy-Datei).
function buildVersionMarker() {
  return {
    name: 'kicker-build-version-marker',
    transformIndexHtml(html) {
      const legacy = readFileSync(
        'src/legacy/002-s0.2-build-version-update-check.js', 'utf8');
      const m = legacy.match(/const BUILD_VERSION=['"]([^'"]+)['"]/);
      const marker = m ? `<!-- const BUILD_VERSION='${m[1]}' (Marker für Update-Checker, Quelle: src/legacy/002) -->` : '';
      return html.replace('</head>', `${marker}\n</head>`);
    },
  };
}

// base './' → relative Asset-Pfade, funktioniert auf GitHub Pages
// (Unterpfad /KickerApp_public/) und jedem anderen statischen Host.
export default defineConfig({
  base: './',
  plugins: [buildVersionMarker()],
});
