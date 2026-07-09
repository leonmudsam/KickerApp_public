# Kicker Leagues — Plattform-Plan (Public Multi-Liga-Version)

## Kontext

Die bestehende private Kicker-App (eine 18.785-Zeilen-`index.html`, Vanilla JS + Supabase + Web-Crypto) soll zur öffentlichen Plattform **„Kicker Leagues"** werden: Nutzer erstellen eigene Ligen, laden Freunde per Code/Link ein und nutzen mehrere Ligen parallel — Vorbild Splid, nicht Discord. Die **Liga ist das zentrale Objekt**, Accounts sind optional, Spieler gehören zur Liga (nie zu einem Login). Die bestehende In-Liga-App (Rangliste, 2v2-Matches mit Positionen, ~45 Awards, ~46 Badges, Auto-News, Recaps, Monats-Saisons, Elo-Engine mit 18 Tuning-Parametern) bleibt erhalten und bekommt eine Plattform-Ebene davor. **Dieser Plan ist reine Planung — es wird noch nichts implementiert.**

**Bereits getroffene Entscheidungen (mit Leon abgestimmt):**
- Tech-Stack: **Vite + Vanilla-JS/TS-Module** (kein Framework-Rewrite; Engines werden möglichst 1:1 extrahiert)
- Match-Format: **nur 2v2 in v1**, Datenmodell zukunftsoffen (Format-Feld, später nullable a2/b2 für 1v1)
- Migration der alten privaten Liga: **später entscheiden** — als optionaler Schritt nach v1-Launch eingeplant
- Sprache: **Deutsch only in v1**, Texte werden bei der Modularisierung zentral ausgelagert (billige i18n-Vorbereitung)

**Analyse-Befunde als Grundlage:**
- Aktuelles Schema (im neuen Projekt `ffpvdqebpbzdyaisovnm` bereits vorhanden, leer): `players`, `matches` (a1/a2/b1/b2 + atk/def-Positionen, `deltas` JSONB, `exp_a`), `seasons` (`YYYY-MM`, Champion, Top-3-JSONB, bestes Duo), `stories` (deterministische IDs für Dedupe, `expires_at`), `config` (1 Zeile, 18 Elo-Parameter). RLS überall aktiviert, aber **null Policies** → Sicherheitsmodell wird komplett neu aufgebaut.
- Heute: kein Auth (anon-Key im HTML, jeder kann alles schreiben), Settings-Sperre ist nur clientseitiges SHA-256 (kosmetisch). Jeder Start lädt die komplette Match-Historie und berechnet alles clientseitig (mit starker Memoization). Stories-Dedupe via Upsert `ON CONFLICT DO NOTHING` auf deterministische IDs. Batched Writes (25er-Chunks). Realtime nur auf `stories`, sonst 30s-Polling.
- Supabase-Projekt liegt in **eu-west-1 (EU)** → DSGVO-Anforderung an die Region ist erfüllt.

---

## 1. Zielarchitektur (Zusammenfassung)

```
┌─ Statische Web-App (Vite, Vanilla TS/JS, kein Framework) ────────┐
│  Plattform-Ebene: Home, Liga erstellen/beitreten, Switcher       │
│  Liga-App: bestehende 5-Tab-UI + Engines (Elo/Awards/Badges/     │
│  Stories/Seasons) — erhalten, bekommen liga-gescopte Daten       │
│  Lokaler Cache: IndexedDB pro Liga, Delta-Sync                   │
└──────────────────────┬───────────────────────────────────────────┘
                       │ supabase-js (anon-Key + Anonymous-Auth-JWT)
┌─ Supabase (Projekt ffpvdqebpbzdyaisovnm, eu-west-1) ─────────────┐
│  Postgres + RLS (jede Liga-Tabelle hat league_id)                │
│  Auth: Anonymous Sign-ins → per linkIdentity() zu E-Mail         │
│  RPCs (SECURITY DEFINER): create_league, join_league,            │
│        rotate_invite, leave_league                               │
│  Trigger: Owner-Membership, Spieler-Cap, Same-League-FK-Check,   │
│        Audit-Log, rev-Bump bei Edit/Delete                       │
│  Realtime: postgres_changes gefiltert per league_id              │
│  Edge Functions: NUR Payment-Webhooks (ab Phase 3)               │
└──────────────────────────────────────────────────────────────────┘
Hosting: statisch (GitHub Pages oder Cloudflare Pages)
Später: Capacitor-Wrapper iOS/Android + RevenueCat für IAP
```

**Kernhaltung:** Die Plattform-Ebene ist dünn. Die Engines arbeiten heute schon auf In-Memory-Arrays — Multi-Liga ist primär ein **Datenschicht-Thema** (die richtigen Arrays der richtigen Liga laden), kein Engine-Rewrite. `league_id` wird durch Fetch/Write/Cache-Schicht und Story-IDs gefädelt; die Engines bleiben ~95 % unangetastet.

**Bewertung der Architektur-Optionen:**

| Option | Urteil |
|---|---|
| Single-File-PWA weiterführen | Nein — mit Plattform-Ebene, Auth, Payments nicht mehr wartbar |
| **Modulare Web-App mit Vite (vanilla)** | **Ja — Phase 0.** Kein Framework; React/Svelte-Rewrite gefährdet Engines & Design ohne Nutzernutzen |
| **Web zuerst, später Capacitor** | **Ja — der Weg.** Capacitor wrappt denselben Vite-Build, löst iOS-Storage-Eviction (nativer Storage) und liefert die IAP-Oberfläche |
| Native Apps | Nein, auf unbestimmte Zeit — Einzelentwickler, zwei zusätzliche Codebasen, kein Mehrwert |

Zusätzlich in Phase 0/1: echtes PWA-Manifest + minimaler Service Worker (nur Asset-Caching, keine Daten) — „Zum Homescreen hinzufügen" reduziert das iOS-Eviction-Risiko deutlich.

## 2. Produktmodell (Free/Premium)

**Prinzip:** Einmalzahlung **pro Liga** (typisch vom Gründer bezahlt, ~5–8 €), schaltet die Liga für alle Mitglieder dauerhaft frei.

**Harte Nebenbedingung:** Die Engines brauchen die **volle Match-Historie** für den Replay (Badges, Career-Elo, Saison-Neuberechnung). „Begrenzte Historie" als *Daten*-Limit würde Free-Ligen fachlich kaputt machen. Deshalb: **Free-Limits sind Feature-Gates + Spieler-Cap — niemals Daten-Beschneidung.**

| | Free | Premium (einmalig, pro Liga) |
|---|---|---|
| Spieler | max. **10** (serverseitig erzwungen) | unbegrenzt |
| Match-Eintrag, Live-Elo-Preview, Editieren | ✅ voll | ✅ |
| Rangliste + Positionen | ✅ voll | ✅ |
| Saisons mit Monatsreset + Basis-Archiv (Champion) | ✅ | ✅ volles Podium/Duo-Archiv |
| Verlauf | aktuelle Saison | volle Historie + Filter |
| Spielerprofil | Basis (Elo, W/L) | Sparkline, Form, H2H, Nemesis |
| Awards (~45) | Teaser: Top 3 sichtbar, Rest gesperrte Preview | ✅ alle |
| Badges (~46) | gesperrte Previews mit Fortschritts-Hinweis | ✅ |
| News-Feed / Stories | ❌ (Tab zeigt gesperrte Preview) | ✅ |
| Saison-Recap (Fullscreen) | ❌ | ✅ |
| Elo-Graphen / erweiterte Stats | ❌ | ✅ |
| Exporte (CSV/JSON), Liga-Branding | ❌ | ✅ |

Begründung: Free ist **ehrlich nutzbar** (Kernloop Rangliste + Matches + Saisons läuft für 4–8 Freunde für immer). Premium verkauft die *Delight*-Schicht (Awards/Badges/News/Recaps) — genau das, was die App einzigartig macht; gesperrte Previews sind die Upsell-Fläche. Der 10-Spieler-Cap ist das eine **serverseitig harte** Limit und der natürliche Kauf-Trigger („unsere Büro-Liga wächst").

**Ehrlicher Hinweis zur Durchsetzung:** Awards/Badges/News sind reine Funktionen über Matchdaten, die Free-Mitglieder ohnehin lesen dürfen → deren Gating ist prinzipbedingt clientseitig/kosmetisch. Akzeptiert: die serverharten Punkte (Spieler-Cap per Trigger, Entitlement nur per Service-Role schreibbar) schützen den Kaufanreiz; niemand shippt einen gehackten Client an seine Freundesgruppe. Die Architektur wird dafür nicht verbogen (keine serverseitige Award-Berechnung).

**Store-Policy (Preisabwicklung konzeptionell):**
- iOS: digitale Güter **müssen** IAP anbieten (Guideline 3.1.1). Pro-Liga-Kauf = **Consumable IAP** („League Premium Unlock"), wird per Webhook serverseitig einer konkreten Liga zugeordnet. Consumables sind mehrfach kaufbar (eine pro Liga). Restore-Problematik entfällt, weil das Entitlement an der *Liga* hängt, nicht am Apple-Account.
- Web-gekauftes Premium darf in der iOS-App sichtbar/nutzbar sein (Guideline 3.1.3(b), Spotify-Modell), solange die App nicht auf den Web-Kauf verlinkt/steuert. Also: **Stripe im Web zuerst (Phase 3), IAP mit dem Capacitor-Wrapper (Phase 4)** — beide schreiben dieselbe `league_entitlements`-Zeile.
- Review-Risiko: Consumable, das Nicht-Zahler mitfreischaltet, ist ungewöhnlich, aber mit Präzedenz (Splid selbst verkauft pro Gruppe). Fallback siehe Risiken.
- Keine aggressive Paywall: Gesperrte Features zeigen schöne Previews (geblurrte Award-Karten, Beispiel-Recap) + klaren Upgrade-Screen in den Liga-Einstellungen.

## 3. Nutzerfluss

- **Erster Start:** App lädt → `signInAnonymously()` stumm im Hintergrund (echte `auth.uid()`, keine UI) → Home: „Liga erstellen" / „Liga beitreten (Code)" + leere „Meine Ligen". Null Formulare, null E-Mail.
- **Liga erstellen:** Name + (v1: Start-Elo, Monatsreset j/n) → RPC `create_league` → Liga + Owner-Membership + erster Invite-Code → direkt in der Liga, Prompt: Spieler anlegen + optional „Wer bist du?" (Claim). **Erstes Match < 60 Sekunden nach App-Start.**
- **Einladen:** Share-Sheet mit Link `https://…/join/#KL7GX29QMD` + Klartext-Code.
- **Beitreten:** Link öffnen → (neues Gerät: anonymer Sign-in) → RPC `join_league(code)` → Membership → in der Liga, optional Spieler-Claim („Welcher Spieler bist du?" — Liste ungeclaimter Spieler + „nur zuschauen").
- **Gerätewechsel / Recovery:** Kerninvariante — **alle Spieldaten hängen an `players`/`league_id`, nie an `user_id`**. Neues Gerät = neuer anonymer User = Re-Join per Code (10 Sekunden), Spieler neu claimen. **Es geht nie etwas verloren.** Verloren geht höchstens die Mitgliedschaftsliste des Geräts — trivial wiederherstellbar.
- **Account verbinden (Phase 2):** Einstellungen → „Zugang sichern" → `linkIdentity()`/E-Mail-OTP upgraded den anonymen User **in place** (gleiche `auth.uid()`, alle Mitgliedschaften bleiben). Danach: E-Mail-Login auf jedem Gerät → alle Ligen da. Wording: „Backup", nicht „Registrierung".
- **Liga-Switcher:** v1 = Home-Screen ist der Switcher (letzte Liga öffnet automatisch, Back-Chevron im Header führt zu „Meine Ligen"; `lastLeagueId` in localStorage). In-App-Dropdown-Switcher später.

## 4. Datenmodell (Supabase)

**Bewertung der ursprünglich angedachten Tabellenliste:**

| Vorgeschlagen | Urteil |
|---|---|
| leagues, league_members, league_invites, players, matches, seasons, league_entitlements | ✅ kommen |
| user_profiles | ❌ v1 — es gibt keine User-Daten (Namen hängen an players); erst ab Phase 2+, falls nötig |
| device_access_tokens | ❌ — Anonymous Auth ersetzt das vollständig (echte auth.uid() statt Eigenbau-Token) |
| match_participants | ❌ v1 — alle Engines indexieren `a1..b2` direkt; Generalisierung erst wenn 1v1 real kommt (dann: nullable a2/b2, kein Participants-Table) |
| awards, player_awards | ❌ — Awards/Badges sind deterministische, billige Funktionen der Historie; Persistierung schafft nur ein Invalidierungsproblem (Match-Edit → stale Rows) |
| league_news | ❌ — `stories` IST der News-Feed, eine Tabelle |
| recaps, season_archives | ❌ separat — Archivdaten leben wie heute auf `seasons` (Champion, top_elo, Duo) |
| cached_stats | ❌ v1 — späterer Pfad: `season_player_stats`-Snapshots (siehe §10) |
| audit_log, join_attempts | ✅ neu dazu |

**Schema v1:**

```
leagues
  id uuid PK, name text NOT NULL, created_by uuid → auth.users
  settings jsonb DEFAULT '{}'      -- 18 Elo-Params + startElo, monthlyReset, format:'2v2'
  join_enabled bool DEFAULT true
  rev bigint DEFAULT 0             -- Bump bei Match-Edit/Delete → Cache-Invalidierung
  deleted_at timestamptz           -- Soft-Delete / „Liga schließen"
  created_at timestamptz

league_members
  league_id uuid → leagues, user_id uuid → auth.users
  role text CHECK IN ('owner','admin','member')
  joined_at timestamptz
  PK (league_id, user_id); INDEX (user_id)        -- „Meine Ligen"

league_invites
  id uuid PK, league_id uuid → leagues
  code text UNIQUE                 -- 10 Zeichen Crockford-Base32 ≈ 50 Bit
  created_by uuid, revoked_at timestamptz, expires_at timestamptz, use_count int
  PARTIAL UNIQUE INDEX (league_id) WHERE revoked_at IS NULL   -- ein aktiver Code

players
  id uuid PK, league_id uuid NOT NULL → leagues
  name text, elo real, atk real, hidden bool, avatar_id text   -- wie heute
  claimed_by uuid → auth.users     -- „das bin ich", nullable
  deleted_at timestamptz, created_at timestamptz
  UNIQUE (league_id, name); INDEX (league_id)

matches                            -- 2v2-Shape bleibt denormalisiert
  id uuid PK, league_id uuid NOT NULL → leagues
  a1,a2,b1,b2 uuid → players       -- Trigger: alle 4 aus derselben Liga, distinct
  a1_pos..b2_pos, score_a, score_b, winner, deltas jsonb, exp_a   -- wie heute
  created_by uuid                  -- Audit: wer hat eingetragen
  deleted_at timestamptz, updated_at, created_at
  INDEX (league_id, created_at) [partial WHERE deleted_at IS NULL]  -- DER heiße Index

seasons
  league_id uuid → leagues, id text ('YYYY-MM')
  label, start_date, end_date, player_id, team_p1, team_p2, top_elo jsonb, created_at
  PK (league_id, id)

stories
  league_id uuid → leagues, story_key text   -- heutige deterministische ID
  type, category, icon, title, description, data_ref jsonb,
  priority, event_at, created_at, expires_at
  PK (league_id, story_key)        -- Dedupe-Upsert funktioniert pro Liga
  INDEX (league_id, event_at DESC)

league_entitlements
  league_id uuid PK → leagues
  tier text DEFAULT 'premium', source text ('stripe'|'app_store'|'play'|'grant')
  external_ref text, raw jsonb, purchased_at timestamptz
  -- Schreiben AUSSCHLIESSLICH Service-Role (Webhook / manueller Grant)

audit_log
  id bigint PK, league_id, actor uuid, action, entity, entity_id, payload jsonb, created_at
  INDEX (league_id, created_at DESC)

join_attempts
  user_id uuid, attempted_at timestamptz, code_prefix text
  INDEX (user_id, attempted_at)
```

Die alte globale `config`-Tabelle **entfällt** — die 18 Elo-Parameter wandern in `leagues.settings` (JSONB); der Client merged gespeicherte Werte über Code-Defaults (neue Parameter brauchen keine Migration — heutiges `cfg_overrides`-Muster, nur in der DB).

## 5. RLS- & Sicherheitskonzept

**Helper (SECURITY DEFINER, STABLE, search_path gepinnt** — umgeht RLS auf `league_members`, verhindert Policy-Rekursion):
`is_member(league_id)`, `member_role(league_id)`.

**Policy-Matrix:**

| Tabelle | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| leagues | is_member | ❌ (nur RPC) | owner/admin (name, settings, join_enabled); Soft-Delete durch owner | ❌ nie |
| league_members | is_member | ❌ (nur RPC) | Rollen: nur owner | selbst (Austritt) oder owner/admin |
| league_invites | Mitglieder sehen den aktiven Code (Teilen soll einfach sein) | ❌ (RPC rotate_invite) | ❌ | ❌ |
| players | is_member | is_member **+ Spieler-Cap-Trigger** | is_member; `claimed_by` nur auf eigene auth.uid() setzbar (WITH CHECK) | ❌ (Soft-Delete via UPDATE, admin) |
| matches | is_member | is_member + WITH CHECK created_by=auth.uid() + Same-League-Trigger | is_member (jedes Mitglied darf korrigieren — Freundesgruppen-Ethos; auditiert) | ❌ hart; Soft-Delete = UPDATE deleted_at, auditiert |
| seasons | is_member | is_member (idempotenter Rollover-Upsert) | is_member | ❌ |
| stories | is_member | is_member (WITH CHECK league_id) | ❌ | admin (Cleanup) |
| league_entitlements | is_member | ❌/❌/❌ — **nur Service-Role** | | |
| audit_log | owner/admin | nur via Trigger | ❌ | ❌ |

**Damit gilt:** Manipulierte API-Calls ohne Mitgliedschaft liefern für jede Liga-Tabelle leere Ergebnisse; fremde Matches/Spieler/Awards/News sind nicht abrufbar.

**Invite-Sicherheit:**
- `join_league(code)` als SECURITY-DEFINER-RPC: Code normalisieren → Invite gültig (nicht revoked/expired) + `join_enabled` + Liga nicht gelöscht → Rate-Limit (≤10 Versuche/Stunde/User via `join_attempts`) → Membership einfügen. **Keine SELECT-Policy auf `leagues` per Code** → Enumeration über PostgREST unmöglich; einzige Probe-Fläche ist die RPC (limitiert, uniformer Fehler „ungültiger Code").
- 10 Zeichen Base32 ≈ 50 Bit: praktisch unerratbar; Rate-Limit ist Defense-in-Depth. Code im Klartext speichern (muss anzeigbar sein).
- Rotation: `rotate_invite(league_id)` (admin) — alter Link stirbt sofort. `join_enabled=false` schließt Beitritte komplett.
- `create_league` mit Per-User-Cap (z. B. 10 Ligen) als Spam-Schutz.

**Premium-Durchsetzung:** (a) Spieler-Cap als BEFORE-INSERT-Trigger auf `players` (zählt nicht-gelöschte Spieler vs. Entitlement) — das eine serverharte Limit; (b) Entitlement-Zeile nur Service-Role-schreibbar; (c) Rest client-gegated (akzeptiert, s. §2).

**Audit-Log:** AFTER-UPDATE/Soft-Delete-Trigger auf matches (Score-Änderung, Delete), players (Rename, Delete, Claim), leagues (Settings), league_members (Rollen, Rauswurf). Payload = Alt/Neu-Diff. Zweck: Streitschlichtung („wer hat den Score geändert?") + Missbrauchs-Forensik. v1 nur Tabelle, UI später.

**Soft-Deletes:** `deleted_at` auf leagues/players/matches. Gelöschte Matches: Client filtert beim Fetch; Delete bumpt `leagues.rev` → gecachte Clients machen Full-Resync. Soft-gelöschte Spieler bleiben von historischen Matches referenzierbar (deshalb keine harten Deletes). Liga schließen = deleted_at → verschwindet von Home-Screens, Joins blockiert, Daten bleiben (DSGVO-Purge-Job später).

**Grenzen von anon/public-Zugriff & Edge Functions:** Mit Anonymous Auth trägt jeder Request ein echtes JWT → RLS + RPCs decken **alle** v1-Bedürfnisse ab (Join, Create, Rotate, Caps, Audit). Edge Functions sind nur nötig, wo ein **Secret oder Dritt-Verifikation** im Spiel ist: **Stripe-/RevenueCat-Payment-Webhooks** — sonst nichts. Recalc, Invites, Rollover bleiben RPC/Client. Rate-Limits: Supabase hat keine Per-Endpoint-PostgREST-Limits → App-Level-Limits leben in den RPCs (Attempt-Tabellen); Auth-seitig greift das eingebaute IP-Limit auf anonyme Sign-ups (~30/h/IP, optional Captcha).

## 6. Zugriff ohne Account (Anonymous Auth)

**Entscheidung:** Supabase **Anonymous Sign-ins** statt Eigenbau-Device-Tokens. Gründe: echte `auth.uid()` → ein einheitliches RLS-Set für anonyme und E-Mail-User; In-Place-Upgrade via `linkIdentity()` gratis; Session-Refresh automatisch; kein selbstgebautes Token-Sicherheitsschema. Eigenbau-Tokens würden mit auth.uid()-RLS gar nicht funktionieren (bräuchten Custom-JWT-Minting) — strikt schlechter.

- **Lifecycle:** erster Start → `signInAnonymously()` → Refresh-Token persistiert (Web: localStorage; Capacitor später: nativer Storage, evictionssicher).
- **Verlust-Szenarien:** Browserdaten gelöscht / iOS-ITP-Eviction (7 Tage Nichtnutzung, nicht installierte PWA) → anonymer User weg. Recovery = Re-Join per Invite-Code + Re-Claim. **Kein Datenverlust möglich** (Spieldaten hängen an players). UX muss das langweilig-einfach machen: „Liga beitreten" immer einen Tap entfernt, Codes standardmäßig langlebig.
- **Multi-Device ohne Account:** jedes Gerät joint separat per Code; Claim ist **exklusiv pro Spieler** (eine `claimed_by`-Spalte), zweites Gerät übernimmt den Claim (auditiert). Der saubere Multi-Device-Weg ist Account-Link — genau dorthin nudged die UI.
- **Hygiene:** Cleanup-Job (später) löscht anonyme User ohne Membership und älter 30 Tage; **nie** anonyme User mit Mitgliedschaften.

**Saubere Trennung der vier Konzepte:**
| Konzept | Objekt | Lebensdauer |
|---|---|---|
| Liga-Mitgliedschaft | `league_members`-Zeile | bis Austritt/Rauswurf |
| Gerätezugriff | anonyme Auth-Session | bis Storage-Verlust (wiederherstellbar per Code) |
| Spielerprofil | `players`-Zeile | für immer (Historie) |
| optionaler Account | E-Mail-Identity am selben auth.uid() | dauerhaft, gerätunabhängig |

## 7. Optionale Accounts

- Upgrade in place: `updateUser({email})` + OTP oder `linkIdentity('apple'|'google')` — gleiche `auth.uid()`, null Datenmigration.
- Danach: Login auf jedem Gerät stellt alle Ligen wieder her; Eviction-Risiko weg; später E-Mail-Benachrichtigungen; ggf. Voraussetzung für Ownership-Transfer/Liga-Löschung.
- Was sich NICHT ändert: Spieler gehören weiter der Liga; ein Account ist nie Parent von Spieldaten. Cross-Liga-Profile (falls je) = Read-Time-Join über `players.claimed_by`.
- Bekannte Kante: User linkt E-Mail, die schon existiert → Supabase lehnt ab; UX bietet „stattdessen einloggen" + danach Re-Join per Code. Selten, dokumentieren.
- Apple-Review: Bietet der Capacitor-Wrapper Google-Login, ist Sign in with Apple Pflicht (4.8). Anonymous-first heißt: v1-Wrapper kann komplett ohne Social-Login shippen.

## 8. Multi-Liga (Client)

- **Home-Screen** = neue Einstiegsroute: Liga-Karten (Name, Mitglieder, dein Spieler, letzte Aktivität), Erstellen, Beitreten, Account/Einstellungen. Auto-Forward zur letzten Liga mit Back-Chevron (Splid-Verhalten).
- **League-Context-Objekt:** `{ id, settings, entitlement, players[], matches[], seasons[], stories[] }` wird beim Öffnen gebaut und speist die bestehenden Engines. Die heutigen Globals (`players`, `matches`, Memo-Caches) werden Felder dieses Contexts; Liga-Wechsel = Teardown + Neuaufbau. **Wichtigster Refactor-Punkt: alle Memo-Caches beim Wechsel resetten** — die heutige Memoization nimmt einen Datensatz pro App-Lebenszeit an (Bug-Quelle Nr. 1, siehe Risiken).
- **Cache-Isolation:** IndexedDB pro Liga: `{matches, players, seasons, lastSyncedAt, rev}`. Öffnen → sofort aus Cache rendern → Delta-Fetch `created_at > lastSyncedAt` → wenn Server-`rev` ≠ Cache-`rev` (Edit/Delete passiert), Full-Refetch. Das löst das „4 Full-Scans pro Start"-Problem billiger als jedes Server-Aggregat.
- **Realtime-Scoping:** ein Channel pro geöffneter Liga, `postgres_changes` mit Filter `league_id=eq.{id}` auf `stories` (optional `matches`, ersetzt das 30s-Polling). Respektiert RLS. Nur die aktive Liga subscribed.
- Story-Generierung, Fun-Fact-Seeds, Saison-Rollover laufen pro geöffneter Liga wie heute; deterministische IDs sind jetzt `(league_id, story_key)` → Cross-Liga-Kollisionen konstruktionsbedingt unmöglich.

**Liga-Einstellungen — v1 vs. später (kritisch gefiltert):**
- **v1 (bei Erstellung):** Name, Start-Elo, monatlicher Saisonreset j/n. Mehr nicht — jede weitere Option ist Onboarding-Friction.
- **v1 (nachträglich, owner/admin):** Elo-Formel-Parameter (heutiges Settings-Panel, jetzt pro Liga), Invite-Rotation, join_enabled, Liga schließen.
- **Später:** max. Spielerzahl (ergibt sich aus Free/Premium, kein Setting), Match-Format (erst mit 1v1), Feature-Toggles Awards/News/Recaps an/aus (fraglicher Nutzen — warum sollte man Delight abschalten? nur bauen, wenn Nutzer es verlangen), öffentliche Beitrittsmöglichkeit (**bewusst gestrichen** — Haupt-Missbrauchsfläche, niemand hat nach Discovery gefragt; Beitritt nur per Code/Link), Teams erlauben (Duos sind implizit, kein Setting nötig).

## 9. Premium pro Liga (Abwicklung)

- **Source of Truth:** `league_entitlements`, nur Service-Role schreibt.
- **Phase 3 (Web):** Stripe Checkout (One-Time, `client_reference_id = league_id`) → Stripe-Webhook → Edge Function verifiziert Signatur → Upsert Entitlement. Upgrade-Screen in Liga-Einstellungen + auf jeder Locked-Preview.
- **Phase 4 (Stores):** **RevenueCat** über StoreKit2/Play Billing — eine Webhook-Integration, Receipt-Validierung inklusive, Consumable „League Unlock"; `league_id` als Subscriber-Attribut beim Kauf. Empfehlung RevenueCat statt Direkt-Integration: eigene Receipt-Validierung ist Wochen Arbeit + Dauerpflege für einen Einzelentwickler; RevenueCat ist bis 2.500 $ Monatsumsatz kostenlos.
- **Refunds:** Webhook downgraded/löscht die Zeile; Spieler-Cap-Trigger blockiert dann *neue* Spieler über 10, löscht aber nie bestehende.
- **Kein Frontend-only-Unlock:** Client liest Entitlement nur zum UI-Gating; die Zeile selbst ist unerreichbar für Clients.

## 10. Performance- & Caching-Strategie

Pragmatismus-Anker: eine hyperaktive Liga ≈ 3–5k Matches ≈ 1–2 MB. Client-Replay davon = zweistellige Millisekunden. **Kein Stats-Server in v1.**

- **Bleibt client-berechnet (v1):** Elo-Replay, Tabellen, alle Awards, alle Badges, Career-Elo, H2H, Recaps, Story-Generierung — unverändert (inkl. bestehender Memoization, Single-Pass-Aggregatoren, Batch-Writes).
- **Neu in v1:** (1) liga-gescopte Queries — der „Full-Scan" ist jetzt ein Full-*League*-Scan, inhärent begrenzt; (2) IndexedDB + Delta-Sync → Steady-State-Start lädt ~0–20 neue Zeilen statt allem; (3) `leagues.rev`-Invalidierung für Edits/Deletes; (4) UI-Pagination im Verlauf-Tab (Render-Windowing — Engines konsumieren weiter das volle gecachte Array).
- **Indizes:** `matches(league_id, created_at)`, `league_members(user_id)`, `players(league_id)`, `stories(league_id, event_at)`, `audit_log(league_id, created_at)` — mehr braucht v1 nicht.
- **Klarer Später-Pfad** (wenn eine Liga >10k Matches hat oder Kaltstart schmerzt): `season_player_stats(league_id, season_id, player_id, games, wins, elo_end, …)`-Snapshots beim Saison-Rollover (client-geschrieben, idempotent — gleiches Vertrauensmodell wie heutige Saison-Archive). Kaltstart lädt dann Snapshots + aktuelle Saison; Badge-Replay tiefer Historie wird Lazy-Load. **Einzige v1-Vorkehrung:** Datenschicht so bauen, dass „Matches vor Saison X" ein separater Fetch ist.
- **Live vs. gecacht:** Live berechnet werden darf alles Saison-lokale (aktuelle Tabelle, Preview, Form); über `seasons`(+später Snapshots) gecacht wird alles Saison-übergreifende (Archive, Career-Elo-Basis, Podien).

## 11. Migrationsstrategie

**(a) Code: Single-File → Vite-Module.** Die §-Sektions-Disziplin der Datei macht die Extraktion mechanisch:

```
src/
  main.ts                 Boot: Auth, Route (Home vs. Liga), Liga öffnen
  platform/               auth.ts, homeScreen.ts, joinFlow.ts, leagueSettings.ts, entitlements.ts
  data/                   supabaseClient.ts, leagueRepo.ts (Fetch/Write pro Tabelle),
                          cache.ts (IndexedDB + Delta-Sync), realtime.ts
  engine/                 elo.ts, awards.ts, badges.ts, stories.ts, seasons.ts, stats.ts
                          (pure Funktionen über {players, matches, settings} — 1:1 extrahiert)
  ui/                     tabs/ (rangliste, positionen, awards, teams, verlauf),
                          matchBuilder.ts, sheets.ts, toast.ts, icons.ts, charts.ts
  text/                   zentrale deutsche Texte/Templates (i18n-Vorbereitung)
  styles/                 tokens.css + app.css (aus den §C-Sektionen)
```

Extraktionsregel: **Engines wandern wortwörtlich**; nur ihre Inputs ändern sich (Arrays aus dem League-Context, Config aus `league.settings`, Story-IDs bekommen Liga-Scope in der Write-Schicht, nicht in den Generatoren). Phase 0 shippt diesen Refactor **gegen die alte Single-Tenant-DB mit pixelidentischem Verhalten** — das Sicherheitsnetz für alles Weitere.

**(b) Daten: alte private Liga → erste Liga im neuen Schema.** *(Entscheidung bewusst offen — optionaler Schritt nach v1-Launch.)* Wenn ja: einmaliges SQL-Skript (Service-Role): `leagues`-Zeile (Settings = alte `config` als JSONB) → `players`+league_id → `matches`+league_id → `seasons` auf `(league_id, id)` → `stories` auf `(league_id, story_key)`; `deltas` etc. unverändert kopieren. Mitgliedschaften entstehen durch normales Joinen per Code (heute existieren ja keine User). Verifikation: berechnete Tabellen alt vs. neu diffen. Benötigt dann wieder Zugriff auf die alte DB (Projekt `aravpsynckgzradserxs`) oder einen Export.

**(c) Schema-Migrationen:** `supabase/migrations/*.sql` im Repo ab Tag 1 — das neue Projekt hat zwar Schema, aber keine Policies; **alles als Migrationsdateien neu aufsetzen** statt Dashboard-Klicks. Lokale Entwicklung via `supabase start`, Deploy via `supabase db push`/CI. Nie wieder Schema im Dashboard editieren.

## 12. Risiken & offene Entscheidungen (ehrlich)

1. **iOS-Eviction anonymer Sessions** (Safari ITP, 7 Tage, nicht-installierte PWA): real, aber verlustfrei (Recovery = Re-Join). Mitigation in Reihenfolge: Install-Nudge, Account-Link-Nudge nach N Sessions, Capacitor als finaler Fix. Für v1-Web akzeptieren.
2. **Store-Review-Risiko** des Consumables, das Nicht-Zahler mitfreischaltet: moderat, Präzedenz existiert (Splid). Fallback: Reframing als persönlicher „Gründer-Pass". Entscheidung erst in Phase 4 nötig.
3. **Einzelentwickler-Wartungslast:** Das Design konzentriert Logik bewusst im Client (eine Sprache, ein Deploy) und hält Postgres bei ~6 Policy-Sets, ~4 RPCs, ~5 Triggern, 1 Edge Function. Keine Server-Aggregate/Queues/Backend-Frameworks, bis eine Metrik es erzwingt.
4. **Spam-Ligen durch anonyme Erstellung:** Per-User-Cap, Auth-IP-Limits + Captcha-Option, **kein öffentliches Liga-Verzeichnis in v1**, Stale-League-Cleanup später.
5. **MAU-Kosten anonymer User:** nur aktive zählen; Orphan-Cleanup. Gering.
6. **DSGVO:** Auch als Hobby-Public-App nötig: Datenschutzerklärung + **Impressum** (deutscher Markt!), EU-Region ✅ (eu-west-1 bestätigt), Datenminimierung schon gut (nur Spielernamen, E-Mail erst bei Opt-in). Löschpfade: Liga-Soft-Delete → späterer Purge; User-Löschung → Memberships/Claims weg, Spielerzeilen bleiben als Liga-Spieldaten (in der Erklärung dokumentieren; Pseudonymisierung auf Wunsch). Export-Feature deckt Portabilität nebenbei ab.
7. **Multi-Writer-Saison-Rollover** (zwei Mitglieder öffnen die App am Monatswechsel): deterministische Keys + Upsert-do-nothing (heutiges Stories-Muster) auch auf `seasons` anwenden. Klein, braucht einen Test.
8. **Versteckte Single-League-Annahmen der Engines** (globale Memo-Caches, Modul-State): wahrscheinlichste Bug-Quelle der ganzen Migration (stale Caches nach Liga-Wechsel). Explizites Teardown + „Liga-Wechsel"-Testcheckliste einplanen.

## 13. Umsetzungsphasen (jede shippbar)

- **Phase 0 — Extraktion (kein Verhaltensänderung):** Vite-Scaffold, index.html in Module zerlegen (§11a), Texte zentralisieren, PWA-Manifest + Asset-SW, statisches Hosting — **gegen die alte DB**, an die bestehende Freundesgruppe shippen, Pixel-/Stat-Parität verifizieren.
- **Phase 1 — Plattform-Kern (das echte v1):** neues Schema + RLS + RPCs + Trigger als Migrations; Anonymous Auth; Home-Screen, Create/Join/Invite/Share; League-Context + IndexedDB-Delta-Cache; Stories neu gekeyt. Liga-Settings bei Erstellung: **nur Name, Start-Elo, Monatsreset**. Alles free/unlimitiert — noch keine Entitlements-UI.
- **Phase 2 — Plattform-Politur:** Account-Linking (E-Mail-OTP), Invite-Rotation + join_enabled-UI, Rollen/Mitgliederverwaltung, Soft-Deletes + Audit-Log-Oberfläche, Claim-Flow-Politur, Liga schließen, „Welcher Spieler bist du"-Onboarding, Per-Liga-Realtime statt Polling.
- **Phase 3 — Monetarisierung (Web):** `league_entitlements`, Stripe Checkout + Webhook-Edge-Function, Spieler-Cap-Trigger, Locked-Previews + Upgrade-Screens, Free/Premium-Gates nach §2.
- **Phase 4 — Stores:** Capacitor-Wrapper, RevenueCat-Consumable-IAP → gleiche Entitlement-Pipeline, nativer Session-Storage, ggf. Sign in with Apple.
- **Phase 5+ (nur bei Bedarf):** season_player_stats-Snapshots / Lazy-Historie, Match-Formate (nullable a2/b2), In-App-Liga-Switcher, Feature-Toggles, Exporte/Branding, Notifications. **Optional jederzeit ab Phase 1:** Migration der alten privaten Liga (§11b) — Entscheidung offen.

**v1-Scope-Empfehlung:** v1 = Phase 0+1. Bewusst NICHT in v1: Payments, E-Mail-Accounts, Rollen-UI, Feature-Toggles, Public Discovery, Match-Formate, Server-Aggregate. So kommt das Splid-artige Produkt am schnellsten zu echten Nutzern, während das Schema (league_id überall, Entitlement-Shape, settings-JSONB) bereits jede spätere Phase ohne Migrationsschmerz trägt.

## 14. Vor Implementierung zu klärende Fragen

1. Match-Edit/Delete-Rechte: jedes Mitglied (empfohlen, auditiert) oder nur Ersteller+Admin? Später Per-Liga-Setting?
2. Spieler-Claim: exklusiv mit Übernahme (empfohlen) oder mehrere Geräte pro Spieler?
3. Invite-Code-Sichtbarkeit: jedes Mitglied darf teilen (empfohlen, Splid-artig) oder nur Admins?
4. Premium-Preis (~5–8 € einmalig?) und: bekommt die bestehende Freundes-Liga ein Gratis-Entitlement (`source='grant'`)?
5. Free-Spieler-Cap: 10 (empfohlen) vs. 8 vs. 12 — gegen realistische Büro-Liga-Größen prüfen.
6. ~~Supabase-Region EU~~ ✅ geklärt: eu-west-1.
7. ~~Sprache~~ ✅ geklärt: Deutsch only, Texte werden in Phase 0 zentralisiert.
8. Sync in v1: 30s-Polling behalten (billigster Start) oder Matches-Realtime schon in Phase 1?
9. Hosting/Domain: GitHub Pages kann keine SPA-Rewrites für `/join/…`-Deep-Links → Hash-basierte Join-Links (`/#join=CODE`) oder Cloudflare Pages. Eigene Domain gewünscht?
10. Saison-Rollover-Autorität: Client jedes Mitglieds (idempotente Upserts, empfohlen) vs. pg_cron-Server-Job.
11. Migration der alten Liga: nach v1-Launch entscheiden (Zugriff auf alte DB oder Export nötig).

## Verifikation (wenn später implementiert wird)

- **Phase 0:** Alte App und modularisierte App parallel gegen dieselbe DB laufen lassen; berechnete Tabellen, Award-Ränge, Badge-Zählungen und Story-IDs diffen (Stat-Parität), UI visuell vergleichen.
- **Phase 1:** RLS-Negativtests als SQL-Suite: mit zweitem anonymen User (Nicht-Mitglied) jede Tabelle lesen/schreiben → muss leer/verweigert sein; Join mit falschem Code → Rate-Limit greift; Spieler-Cap-Trigger bei Spieler 11 in Free-Liga → Fehler. Supabase Advisors (security + performance) nach jeder Migration laufen lassen.
- **Liga-Wechsel-Checkliste:** zwei Ligen anlegen, wechseln, prüfen dass keine Stats/Stories/Caches der anderen Liga durchsickern.
- **E2E-Kernflow:** frisches Gerät → Liga erstellen → 2 Spieler → Match eintragen → Invite-Link auf zweitem Browser-Profil öffnen → beitreten → gleiche Tabelle sehen.

## Kritische Dateien

- `index.html` — Quelle der Phase-0-Extraktion (§-Sektionen, Engines, Datenschicht)
- `supabase/migrations/` — neu; gesamtes Schema, RLS, RPCs, Trigger aus §4–5
- `src/data/leagueRepo.ts` + `cache.ts` — neu; hier passiert league_id-Threading + Delta-Sync
- `src/platform/auth.ts` + `joinFlow.ts` — neu; Anonymous-Auth-Lifecycle, Join/Create-RPCs, Recovery-UX
- `src/engine/` — neu; wortwörtliches Extraktionsziel für Elo/Awards/Badges/Stories/Seasons
