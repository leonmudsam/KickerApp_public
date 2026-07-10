# Kicker Leagues

Tischkicker-Liga-Plattform (Elo · 2v2 · Awards · Badges · Liga-News):
Nutzer erstellen eigene Ligen, laden Freunde per Code/Link ein und nutzen
mehrere Ligen parallel — die Liga ist das zentrale Objekt, Accounts sind
optional, Spieler gehören zur Liga (nie zu einem Login).
Der vollständige Plan liegt in [`docs/KICKER_LEAGUES_PLAN.md`](docs/KICKER_LEAGUES_PLAN.md).

## Stand: Phase 2 (Plattform-Politur)

- **Konto (optional)**: anonymen Zugang per E-Mail sichern — OTP-Code statt
  Redirect-Links (robust als PWA/auf GitHub Pages). Login auf neuem Gerät
  über den Home-Screen; alle Mitgliedschaften hängen an derselben
  `auth.uid()` (In-Place-Upgrade).
- **Einstellungen ohne Passwort-Lock**: offen für jedes Mitglied; was wer
  ändern darf, entscheiden Rollen (Formel-Slider, Invite-Rotation,
  Beitritts-Toggle, Umbenennen: Gründer/Admin) — serverseitig via RLS.
- **Mitgliederverwaltung**: Rollen (Gründer/Admin/Mitglied), Kick,
  atomarer Gründer-Transfer (`transfer_ownership`), Austritt/Kick gibt
  geclaimte Spieler frei (Trigger).
- **Claim-Flow**: „Welcher Spieler bist du?" nach dem Beitritt + jederzeit
  in den Einstellungen; exklusiv mit Übernahme, auditiert.
- **Liga schließen** (`close_league`, nur Gründer — Guard-Trigger) und
  **Audit-Log-UI** (Gründer/Admin): Ergebnis-Korrekturen, Umbenennungen,
  Rollen-Änderungen mit Zeit + Verursacher.
- **Home-Screen v2**: mobile-first, aufklappbare Erstellen/Beitreten-
  Aktionen, Rollen-Badges auf Liga-Karten, Konto-Bereich.
- **Spieler-Onboarding**: nach dem Erstellen einer Liga öffnet sich ein
  schließbares Popup, das mehrere Spieler nacheinander anlegt und danach
  direkt in den Claim-Flow führt. Start-Elo-Standard ist 0.
- **Badge-Fix**: Elo-Schwellen (Aufsteiger/Dominator/Dynastie) sind jetzt
  relativ zum Liga-Start-Elo statt absolut.

**Dashboard-Voraussetzung für E-Mail-Codes:** In den Supabase-E-Mail-
Templates („Magic Link" und „Change Email Address") muss `{{ .Token }}`
vorkommen, damit der 6-stellige Code in der Mail steht.

## Stand: Phase 1 (Plattform-Kern)

- **Plattform-Ebene** (`src/legacy/001b-platform-…`): stiller anonymer
  Sign-in (Supabase Anonymous Auth), Home-Screen (Meine Ligen / Erstellen /
  Beitreten), Join-Links `…#join=CODE`, Share-Sheet, letzte Liga öffnet
  automatisch (Back-Chevron führt zur Übersicht).
- **Multi-Liga-Datenschicht**: alle Queries auf `league_id` gescopt,
  Elo-Parameter pro Liga in `leagues.settings` (config-Tabelle entfällt),
  Stories `(league_id, id)`-gekeyt, Soft-Deletes für Spieler/Matches.
- **IndexedDB-Cache pro Liga** mit Delta-Sync (`created_at`/`updated_at`);
  Match-Edits bumpen serverseitig `leagues.rev` → Full-Resync.
- **Realtime pro Liga** auf `stories` und `matches` (30s-Polling als
  Fallback). Liga-Wechsel per Reload → garantiert saubere Memo-Caches.
- **RLS**: Mitgliedschaft ist das einzige Tor zu Liga-Daten; RPCs
  (`create_league`, `join_league` mit Rate-Limit, `rotate_invite`,
  `leave_league`), Integritäts-Trigger, Audit-Log.
  Negativtests: `supabase/tests/rls_negative_tests.sql`.

```
index.html               Shell (Home-Container + Liga-App-Markup)
src/styles/app.css       komplettes Stylesheet
src/legacy/*.js          37 Module entlang der §-Sektionen (001b = Plattform)
src/main.js              Vite-Einstieg (bündelt aktuell nur das CSS)
tools/concat-legacy.mjs  Build-Schritt: fügt src/legacy/ in Original-
                         Reihenfolge zu public/app.js zusammen (klassisches
                         Skript → Hoisting/Globals exakt wie bisher)
tools/e2e-check.mjs      Playwright-E2E: Erstellen/Beitreten/Delta-Cache
supabase/migrations/     gesamtes Schema, RLS, RPCs, Trigger als Migrationen
supabase/tests/          RLS-Negativtest-Suite (SQL, mit Rollback)
legacy/index.html        die unveränderte Single-File-App (Referenz)
```

Die App-Logik läuft bewusst weiter als **ein** klassisches Skript: Die
Template-Strings nutzen Inline-`onclick`-Handler und modulweite Globals —
eine ES-Modul-Umstellung wäre eine Verhaltensänderung. Die schrittweise
Extraktion der Engines (Elo, Awards, Badges, Stories) in echte Module
folgt; dafür wird eine Datei aus `src/legacy/` herausgelöst und in
`tools/concat-legacy.mjs` automatisch nicht mehr mitgebündelt.

**Einmalige Dashboard-Voraussetzung:** In Supabase muss
Authentication → Sign In / Providers → **„Allow anonymous sign-ins"**
aktiviert sein, sonst scheitert der Boot mit einer Fehlermeldung.

## Entwicklung

```bash
npm install
npm run dev       # Dev-Server (führt vorher den Concat-Schritt aus)
npm run build     # Produktions-Build nach dist/
node tools/e2e-check.mjs      # E2E-Kernflow (erst `npm run build`)
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
