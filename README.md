# Kicker Liga → Kicker Leagues

Tischkicker-Liga-App (Elo · 2v2 · Awards · Badges · Liga-News) auf dem Weg
zur öffentlichen Multi-Liga-Plattform **Kicker Leagues**.
Der vollständige Plan liegt in [`docs/KICKER_LEAGUES_PLAN.md`](docs/KICKER_LEAGUES_PLAN.md).

## Stand: Phase 0 (Modularisierung, keine Verhaltensänderung)

Die historische Single-File-App (`legacy/index.html`, ~18.800 Zeilen) ist in
ein Vite-Projekt zerlegt — **verlustfrei und pixelidentisch verifiziert**:

```
index.html            schlanke Shell (Body 1:1 aus dem Original)
src/styles/app.css    komplettes Stylesheet (Original-CSS, unverändert)
src/legacy/*.js       36 Module entlang der §-Sektionen des Originals
src/main.js           Vite-Einstieg (bündelt aktuell nur das CSS)
tools/concat-legacy.mjs  Build-Schritt: fügt src/legacy/ in Original-
                         Reihenfolge zu public/app.js zusammen (klassisches
                         Skript → Hoisting/Globals exakt wie bisher)
tools/parity-check.mjs   Playwright-Paritätstest Original vs. Build
supabase/migrations/     DB-Migrationen (Phase-0-Policies, temporär)
legacy/index.html        das unveränderte Original (Referenz)
```

Die App-Logik läuft bewusst weiter als **ein** klassisches Skript: Die
Template-Strings nutzen Inline-`onclick`-Handler und modulweite Globals —
eine ES-Modul-Umstellung wäre eine Verhaltensänderung. Die schrittweise
Extraktion der Engines (Elo, Awards, Badges, Stories) in echte Module
passiert ab Phase 1; dafür wird eine Datei aus `src/legacy/` herausgelöst
und in `tools/concat-legacy.mjs` automatisch nicht mehr mitgebündelt.

## Entwicklung

```bash
npm install
npm run dev       # Dev-Server (führt vorher den Concat-Schritt aus)
npm run build     # Produktions-Build nach dist/
node tools/parity-check.mjs   # Paritätstest (erst `npm run build`)
```

supabase-js wird lokal gebündelt (`public/vendor/`, aus node_modules
kopiert) statt vom CDN geladen — die Version ist damit gepinnt.

## Deploy

GitHub Actions (`.github/workflows/deploy-pages.yml`) baut bei jedem Push
mit Vite und deployt `dist/` nach GitHub Pages — der rohe Branch ist
**keine** lauffähige App (der Concat-Schritt erzeugt `public/app.js` erst
beim Build). In den Repo-Settings muss Pages → Source auf
**„GitHub Actions"** stehen.
`BUILD_VERSION` in `src/legacy/002-s0.2-….js` bei jedem Deploy bumpen —
der Update-Checker liest den Marker, den Vite in die `index.html` injiziert.
