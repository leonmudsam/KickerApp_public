/* ════════════════════════════════════════════════════════════════════════════
 *  JAVASCRIPT-INHALTSVERZEICHNIS
 *  Suche nach "[§N.M]" für direkten Sprung in eine Sektion.
 *  Alle Hauptsektionen-Banner enthalten den Anker — z. B. "// ╔ §3 STATS".
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  §0  PROLOG & SETUP
 *      [§0.1]  Supabase-Zugangsdaten
 *      [§0.2]  Build-Version & Update-Check
 *
 *  §1  STAMMDATEN
 *      [§1.1]  ICONS — SVG-Library                       ⚑ HOTSPOT: Awards/Badges
 *      [§1.2]  Saison-System (monatlich, automatisch)
 *
 *  §2  CORE ENGINE
 *      [§2.1]  Performance-Caches & Invalidierung
 *      [§2.2]  Sim-Maps (snapMap, historyByMatchId)
 *      [§2.3]  Streak-Snapshots (für "Serienbrecher" Badge)
 *      [§2.4]  Saison-Rank-Snapshots (preRank/postRank pro Match)
 *      [§2.5]  Matches-pro-Saison Cache
 *      [§2.6]  Saison-Rangliste Cache
 *      [§2.7]  Rang-System (Durchschnitts-Saison-Elo)
 *      [§2.8]  Erweitertes Elo + automatische Position
 *      [§2.9]  Positions-Klassifizierung (7 Stufen)
 *
 *  §3  DATEN & STATS
 *      [§3.1]  Datenbank-Layer (loadAll, persistRecalc, Saison-Archiv)
 *      [§3.2]  awardRankings — zentrale Award-Engine    ⚑ HOTSPOT: Awards
 *      [§3.3]  POTW/POTD Recap
 *      [§3.4]  Stats Engine (winRate, atkW/defW etc.)
 *      [§3.5]  Zentrale Elo-Engine (simulateElo)
 *      [§3.6]  Slider-basierte Berechnung (Match-Eingabe + Recalc)
 *
 *  §4  UI-INFRASTRUKTUR
 *      [§4.1]  Avatar-Farben & -Emojis
 *      [§4.2]  Award-Avatar-Helper (Hero/Mini/Li)
 *      [§4.3]  Navigation (Tabs, Filter, History-State)
 *      [§4.4]  Zeiträume (Saison/Woche/Gesamt)
 *
 *  §5  VIEWS
 *      [§5.1]  Ranking-View (Saison/Woche/Gesamt)
 *      [§5.2]  Positions-Rangliste
 *      [§5.3]  Awards-View                              ⚑ HOTSPOT: Awards
 *      [§5.4]  Teams-View
 *      [§5.5]  History-View (mit Filter)
 *      [§5.6]  Match-Eingabe-View
 *      [§5.7]  Settings-View
 *      [§5.8]  Match-Preview-Logik & Save
 *
 *  §6  SHEETS / OVERLAYS
 *      [§6.1]  Detail-Sheet-Infrastruktur (openSheet/closeSheet)
 *
 *  §7  BADGE-SYSTEM (permanente Auszeichnungen)
 *      [§7.1]  BADGES-Array (Definitionen)              ⚑ HOTSPOT
 *      [§7.2]  BADGE_RARITY + RARITY_META               ⚑ HOTSPOT
 *      [§7.3]  Count-Funktionen (countKingslayer etc.)
 *      [§7.4]  getBadgeEarnedCache (chronologischer
 *              Trigger-Cache → liefert badgesEarnedInMatch)
 *
 *  §8  SPIELER-AWARDS / PROFILE
 *      [§8.1]  playerAwards (Aggregat aus awardRankings)
 *      [§8.2]  showPlayer (Profil-Sheet)
 *      [§8.3]  showAward (Award-Detail-Sheet)
 *      [§8.4]  showPlayerAwards (Award-Sammlung-Sheet)
 *      [§8.5]  showBadgeSheet (alle Badges)
 *      [§8.6]  Spieler bearbeiten + Saison-Verlauf
 *
 *  §9  WEITERE SHEETS
 *      [§9.1]  Bilanzen-Sheet (Mitspieler-Liste)
 *      [§9.2]  Head-to-Head Profil-Sheet
 *      [§9.3]  Team-Profil-Sheet
 *      [§9.4]  Match bearbeiten
 *
 *  §10 INTERAKTION & SYSTEM
 *      [§10.1] bind() — globaler Click-Dispatcher
 *      [§10.2] Lock-System (Settings-Passwort)
 *      [§10.3] Helpers (Achievement-Toasts, Utils)
 *      [§10.4] Boot — Initialisierung
 *
 *  §11 LIGA NEWS / STORY-SYSTEM                         ⚑ HOTSPOT: News-Typen
 *      [§11.0] Konstanten, Limits & Badge-Whitelist
 *      [§11.1] Story-Generator (alle Typen) + Ambiente
 *              Fun-Facts (§11.1b) + Meilenstein-Leiter
 *      [§11.2] Story-Cache & Display-Konsolidierung
 *              (_consolidateStories, Live-Streak-Filter)
 *      [§11.3] LocalStorage (Read-State, Ring-Buffer)
 *      [§11.4] Header-Badge-Refresh + Toast-Logik
 *      [§11.5] Mini-Popup (newsPopover)
 *      [§11.6] Voller Feed mit Filter (newsFeedFull)
 *      [§11.7] Story-Detail (newsDetail) — dynamisch je Typ
 *      [§11.8] Realtime-Subscription auf `stories`
 *      [§11.9] Periodischer News-Auto-Sync
 *
 *  HINWEIS: Die physische Reihenfolge der Sektionen folgt NICHT strikt der
 *  Nummerierung (gewachsen) — z. B. liegt §11 zwischen §10.3 und §10.4, §10.1
 *  zwischen §9.1 und §9.2. Immer per "[§N.M]"-Anker springen, nicht scrollen.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  MAINTENANCE-REGELN
 * ════════════════════════════════════════════════════════════════════════════
 *  Mit ⚑ HOTSPOT markierte Stellen erfordern parallele Updates an mehreren
 *  Orten. Beim Hinzufügen eines neuen Awards oder Badges:
 *
 *    NEUES AWARD
 *      1. ICONS — neues SVG-Icon hinzufügen (falls nötig)         [§1.1]
 *      2. awardRankings — Berechnung + Hidden-Filter + Return     [§3.2]
 *      3. AW_IC — Icon-Mapping (3×! in vAwards/showAward/         [§5.3, §8.3,
 *         showPlayerAwards)                                        §8.4]
 *      4. AWARD_META — Titel + Klasse + Erklärung                 [§5.3]
 *      5. vAwards — Card im richtigen Section-Block               [§5.3]
 *      6. showAward — TEAM_AWARDS/MATCH_AWARDS-Set + switch-case  [§8.3]
 *      7. playerAwards — teamKeys/teamValFns/teamDisplayFns       [§8.1]
 *      8. showPlayer — POSITIVE_KEYS/TEAM_KEYS/NEGATIVE_KEYS      [§8.2]
 *
 *    NEUES BADGE
 *      1. ICONS — neues SVG-Icon hinzufügen                       [§1.1]
 *      2. Count-Funktion implementieren (falls aggregiert)        [§7.3]
 *      3. BADGES-Array — neues Objekt mit ic/name/desc/count      [§7.1]
 *      4. BADGE_RARITY + RARITY_META.total                        [§7.2]
 *      5. getBadgeEarnedCache — fire('badge_id') für Match-       [§7.4]
 *         Trigger (sonst kein Eintrag im Match-Review!)
 *
 *    NEUE SEKTION
 *      → Banner-Format: "// ╔ §N.M ─── NAME ────────────────"
 *      → Hier oben im Inhaltsverzeichnis MIT EINTRAGEN
 *      → Bei Hotspot ggf. ⚑ markieren
 *
 *  Inkonsistenzen sind die Regel, nicht die Ausnahme — die App ist gewachsen
 *  und nicht alle Banner haben das neue Format. Bei Aufräum-Touren Section-IDs
 *  schrittweise nachziehen.
 * ════════════════════════════════════════════════════════════════════════════ */

