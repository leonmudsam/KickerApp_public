// Vite-Einstieg (Phase 0): bündelt aktuell nur das Stylesheet.
// Die App-Logik läuft weiterhin als klassisches Skript (public/app.js,
// zusammengesetzt aus src/legacy/ — siehe tools/concat-legacy.mjs), damit
// das Verhalten der historischen Single-File-App exakt erhalten bleibt.
// Ab Phase 1 wächst hier die Plattform-Ebene (Auth, Home-Screen, Ligen).
import './styles/app.css';
