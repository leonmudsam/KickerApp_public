// ╔═══ §1.1 ─── ICON LIBRARY (SVG line-icons) ──────────────────────────╗
//     ⚑ HOTSPOT — Wer hier ein Icon hinzufügt, sollte es ggf. auch im
//     AW_IC-Mapping (§5.3, §8.3, §8.4) und/oder im BADGES-Array (§7.1)
//     referenzieren.
//     Konvention: Path-Strings ohne viewBox/svg-Wrapper. Wrapper kommt
//     von svgI() / ic() Helper-Funktionen.
// ╚═════════════════════════════════════════════════════════════════════════╝
// ⚑ HOTSPOT — ICONS-Library (SVG-Paths). Wer hier ergänzt, sollte das Icon
// dann auch verwenden — sonst tote Definition. Konventionen:
//   - 24x24 viewBox (vom Wrapper svgI/ic gesetzt, hier NICHT setzen)
//   - stroke-basiert; Wrapper setzt stroke="currentColor", fill="none"
//   - Keine viewBox/svg-Tags hier — nur die Path-/Circle-/Polygon-Strings.
const ICONS = {
  // Trophäen / Rang
  trophy:    `<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM5 9a2 2 0 01-2-2V5h4M19 9a2 2 0 002-2V5h-4"/>`,
  crown:     `<path d="M2 8l4 6 6-9 6 9 4-6v11a1 1 0 01-1 1H3a1 1 0 01-1-1z"/>`,
  star:      `<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>`,
  medal:     `<circle cx="12" cy="15" r="6"/><path d="M9 9L7 3h10l-2 6"/>`,
  // Sport / Performance
  ball:      `<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>`,
  target:    `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>`,
  flame:     `<path d="M12 2s5 5 5 10a5 5 0 01-10 0c0-2 1-3 1-3s.5 2 2 2c-1-3 2-4 2-9z"/>`,
  bolt:      `<polygon points="13,2 4,14 11,14 9,22 20,10 13,10"/>`,
  shield:    `<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z"/>`,
  // Trends / Stats
  chartUp:   `<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>`,
  chartDown: `<path d="M3 7l6 6 4-4 8 8"/><path d="M14 17h7v-7"/>`,
  chartBar:  `<path d="M3 3v18h18M7 14v4M12 9v9M17 5v13"/>`,
  // Soziale Symbole
  handshake: `<circle cx="6" cy="10" r="3"/><circle cx="18" cy="10" r="3"/><path d="M9 10h6"/><path d="M3 20a4 4 0 014-4h2M21 20a4 4 0 00-4-4h-2"/>`,
  swords:    `<path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M9.5 17.5L21 6V3h-3L6.5 14.5"/><path d="M11 19l-6-6"/><path d="M8 16l-4 4"/><path d="M5 21l-2-2"/>`,
  users:     `<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20v-1a6 6 0 0112 0v1M15 20v-1a5 5 0 015-1"/>`,
  user:      `<circle cx="12" cy="8" r="4"/><path d="M5 21v-1a7 7 0 0114 0v1"/>`,
  // Status
  check:     `<polyline points="4,12 10,18 20,6"/>`,
  // Spezielle Awards
  hundred:   `<path d="M4 7v10M4 7l-1.5 1.5"/><circle cx="11" cy="12" r="3.5"/><circle cx="19" cy="12" r="3.5"/>`,
  cycle:     `<path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5"/>`,
  // Empty-States
  calendar:  `<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>`,
  search:    `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>`,
  scroll:    `<path d="M8 3h10a2 2 0 012 2v14a2 2 0 01-2 2H8M8 3a2 2 0 00-2 2v3M8 3v18M6 8H4a1 1 0 00-1 1v8a2 2 0 002 2h11"/>`,
  rocket:    `<path d="M5 13l4 4M4.5 13.5l-1.4 4.2 4.2-1.4M14 4l6 6-9 9-3 1 1-3 5-5"/>`,
  edit:      `<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4z"/>`,
  trendUp:   `<polyline points="3,17 9,11 13,15 21,7"/><polyline points="14,7 21,7 21,14"/>`,
  trendDown: `<polyline points="3,7 9,13 13,9 21,17"/><polyline points="14,17 21,17 21,10"/>`,
  // Badge-spezifisch
  egg:       `<path d="M12 3c-3.5 0-6 5-6 10a6 6 0 0012 0c0-5-2.5-10-6-10z"/>`,
  controller:`<rect x="2" y="8" width="20" height="10" rx="5"/><path d="M7 13h2M8 12v2M16 12h.01M14 14h.01"/>`,
  diamond:   `<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M11 3l-2 6 3 12 3-12-2-6M2 9h20"/>`,
  pinch:     `<path d="M2 12h4l2-5 3 10 3-7 2 4 2-2h4"/>`,
  brick:     `<rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="10" width="18" height="5" rx="1"/><rect x="3" y="16" width="18" height="5" rx="1"/>`,
  tornado:   `<path d="M3 5h18M5 10h14M7 15h10M10 20h4"/>`,
  lock:      `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>`,
  dizzy:     `<circle cx="12" cy="12" r="9"/><path d="M8 9l2 2M10 9l-2 2M14 9l2 2M16 9l-2 2M8 16s1-2 4-2 4 2 4 2"/>`,
  meltFace:  `<circle cx="12" cy="11" r="8"/><path d="M9 10h.01M15 10h.01M8 16s1 2 4 2 4-2 4-2M6 19c0 2 2 3 6 3s6-1 6-3"/>`,
  // ─── Erweiterungen: einzigartiges Symbol je Award/Badge ───
  // Awards
  trophyStar:    `<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM5 9a2 2 0 01-2-2V5h4M19 9a2 2 0 002-2V5h-4"/><circle cx="12" cy="7" r="1.2"/>`, // Award „Meiste Siege": Trophy mit Punkt
  award:         `<circle cx="12" cy="9" r="5"/><path d="M8.5 13l-2.5 8 6-3 6 3-2.5-8"/>`, // Showmaster: Award-Rosette
  duo:           `<circle cx="9" cy="9" r="3"/><circle cx="15" cy="9" r="3"/><path d="M3 19a6 6 0 016-6M21 19a6 6 0 00-6-6"/><path d="M9 18l3 2 3-2"/>`, // Unzertrennlich (Duo)
  shieldCheck:   `<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z"/><polyline points="8.5,12 11,14.5 15.5,10"/>`, // Eiserne Abwehr
  snowflake:     `<path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19M9 4l3 2 3-2M9 20l3-2 3 2M4 9l2 3-2 3M20 9l-2 3 2 3"/>`, // Eiskalt (Ice)
  skull:         `<path d="M12 2a8 8 0 00-8 8v4l2 2v4h2v-2h2v2h4v-2h2v2h2v-4l2-2v-4a8 8 0 00-8-8z"/><circle cx="9" cy="11" r="1.2"/><circle cx="15" cy="11" r="1.2"/><path d="M11 16h2"/>`, // Endgegner & WorstWr
  weight:        `<path d="M3 10v4M21 10v4M6 7v10M18 7v10M6 12h12"/>`, // Carry-King
  lonewolf:      `<circle cx="12" cy="9" r="4"/><path d="M4 21v-2a5 5 0 015-5h6a5 5 0 015 5v2"/><path d="M9 7l-1-2M15 7l1-2"/>`, // Einzelkämpfer (User mit Ohren)
  surprise:      `<path d="M12 3l3 6 6 1-4.5 4 1 6L12 17l-5.5 3 1-6L3 10l6-1z"/><circle cx="12" cy="12" r="1.2"/>`, // Upset (Stern mit Punkt)
  explosion:     `<path d="M12 2l2 5 5-1-3 4 4 3-5 1 1 5-4-3-3 4-1-5-5-1 3-4-4-3 5-1z"/>`, // Höchster Sieg
  gamepad:       `<rect x="2" y="7" width="20" height="12" rx="4"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M6 10v2M5 11h2"/>`, // Vielspieler
  // Negativ-Awards (jeder eigen)
  ghost:         `<path d="M12 2a8 8 0 00-8 8v11l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2V10a8 8 0 00-8-8z"/><circle cx="9.5" cy="10" r="1.1"/><circle cx="14.5" cy="10" r="1.1"/>`, // Schlechtester Spieler
  iceCube:       `<path d="M8 3h8l-1 8-3 10-3-10z"/><path d="M9 8h6M10 13h4"/><circle cx="6" cy="6" r="1"/><circle cx="18" cy="9" r="1"/><circle cx="7" cy="14" r=".8"/>`, // Eiskalt erwischt: Eiszapfen + Kälte-Punkte
  trendCrash:    `<path d="M3 5l5 5 4-4 9 9"/><polyline points="14,15 21,15 21,8"/>`, // Längste Niederlagenserie
  meltDown:      `<circle cx="12" cy="10" r="6"/><path d="M6 16c0 3 2 5 6 5s6-2 6-5M9 9h.01M15 9h.01M9 13s1 1 3 1 3-1 3-1"/>`, // Formtief
  blockedShot:   `<circle cx="12" cy="12" r="9"/><line x1="6" y1="6" x2="18" y2="18"/>`, // Zahnloser Stürmer
  hole:          `<ellipse cx="12" cy="16" rx="9" ry="3"/><path d="M3 16C3 10 6 4 12 4s9 6 9 12"/>`, // Löchrigste Abwehr
  circus:        `<path d="M3 7L12 3l9 4M5 7v13h14V7M12 7v13M8 10h8M8 14h8M8 18h8"/>`, // Zirkus
  brokenHeart:   `<path d="M12 21s-7-4-9-9c-1.5-4 2-8 5-8 2 0 3 1 4 3 1-2 2-3 4-3 3 0 6.5 4 5 8-2 5-9 9-9 9z"/><path d="M12 7l-2 4 3 2-2 4"/>`, // Schlechtestes Team
  cone:          `<path d="M12 3l-7 16h14z"/><path d="M7 9h10M6 13h12M5 17h14"/>`, // Baustelle
  // Badges (zusätzlich)
  stopwatch:     `<circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 2h6M12 5V2"/>`, // Stammgast (Zeit) — alternativ falls Controller doppelt
  refresh:       `<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z"/><polygon points="13,8 9,14 12,14 11,18 15,12 12,12"/>`, // Allrounder: Shield mit Bolt drin
  bolt2:         `<polygon points="13,2 4,14 11,14 9,22 20,10 13,10"/><circle cx="13" cy="14" r="1.5"/>`, // Mittelstürmer (Bolt+Punkt)
  shieldStar:    `<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z"/><polygon points="12,8 13,11 16,11 13.5,13 14.5,16 12,14 9.5,16 10.5,13 8,11 11,11"/>`, // Abwehrchef
  flameDouble:   `<path d="M7 3s3 3 3 6a3 3 0 11-6 0c0-1.2.6-1.8.6-1.8s.3 1.2 1.2 1.2c-.6-1.8 1.2-2.4 1.2-5.4z"/><path d="M17 3s3 3 3 6a3 3 0 11-6 0c0-1.2.6-1.8.6-1.8s.3 1.2 1.2 1.2c-.6-1.8 1.2-2.4 1.2-5.4z"/>`, // 10er Serie
  flameTriple:   `<path d="M5 6s2 2 2 4a2 2 0 11-4 0c0-.8.4-1.2.4-1.2s.2.8.8.8c-.4-1.2.8-1.6.8-3.6z"/><path d="M12 3s3 3 3 6a3 3 0 11-6 0c0-1.2.6-1.8.6-1.8s.3 1.2 1.2 1.2c-.6-1.8 1.2-2.4 1.2-5.4z"/><path d="M19 6s2 2 2 4a2 2 0 11-4 0c0-.8.4-1.2.4-1.2s.2.8.8.8c-.4-1.2.8-1.6.8-3.6z"/>`, // 15er Serie
  crownFlame:    `<path d="M2 8l4 6 6-9 6 9 4-6v8H2z"/><path d="M12 17s2 2 2 4a2 2 0 01-4 0c0-1 .5-1.5.5-1.5"/>`, // 30er Serie (Crown+Flame)
  weightSmall:   `<path d="M4 10v4M20 10v4M7 7v10M17 7v10M7 12h10"/>`, // Carry Badge
  crownPlus:     `<path d="M2 8l4 6 6-9 6 9 4-6v11H2z"/><path d="M9 16h6M12 13v6"/>`, // Unschlagbar
  weekly:        `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/><circle cx="12" cy="14" r="2"/>`, // Player of the Week
  trophyDay:     `<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM5 9a2 2 0 01-2-2V5h4M19 9a2 2 0 002-2V5h-4"/><path d="M12 11l1 2-2 1 1 2"/>`, // Player of the Day (Trophy mit Blitz)
  // Niederlagen-Tropfen (1/2/3) für Loss-Streaks
  drop:          `<path d="M12 3s5 6 5 11a5 5 0 01-10 0c0-5 5-11 5-11z"/>`,
  dropDouble:    `<path d="M7 3s3 4 3 7.5a3 3 0 11-6 0c0-3.5 3-7.5 3-7.5z"/><path d="M17 3s3 4 3 7.5a3 3 0 11-6 0c0-3.5 3-7.5 3-7.5z"/>`,
  dropTriple:    `<path d="M5 6s2 3 2 5a2 2 0 11-4 0c0-2 2-5 2-5z"/><path d="M12 3s3 4 3 7.5a3 3 0 11-6 0c0-3.5 3-7.5 3-7.5z"/><path d="M19 6s2 3 2 5a2 2 0 11-4 0c0-2 2-5 2-5z"/>`,
  info:          `<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16v.5"/>`,
  // Peak Elo: zwei Berggipfel mit Stern oben am höchsten
  peak:          `<path d="M3 20h18M5 20l5-10 3 6 2-3 4 7"/><polygon points="10,4 11,6 13,6.2 11.6,7.5 12,9.5 10,8.5 8,9.5 8.4,7.5 7,6.2 9,6"/>`,
  // ─── Neue Badge-Icons (keine Dopplung zu bestehenden) ───
  // Vize-Meister: Medaille mit nach-oben-Pfeil (so nah am Gold, aber nicht ganz)
  medal2:        `<circle cx="12" cy="14" r="6"/><path d="M9 8L7 3h10l-2 5"/><polyline points="10,15 12,12 14,15"/>`,
  // Aufsteiger: Bergprofil mit Aufwärts-Pfeil oben rechts
  climb:         `<path d="M3 20h18M3 20l5-8 4 4 5-7 4 4"/><polyline points="15,7 19,3 21,7"/><path d="M19 3v6"/>`,
  // Dominator: 5-zackige große Krone mit Stein in der Mitte
  dominator:     `<path d="M2 7l3 5 4-7 3 7 4-7 3 7 3-5v13H2z"/><circle cx="12" cy="15" r="1.6"/>`,
  // Dynastie: antiker Tempel — Dach, Architrav, vier Säulen, Stufe
  temple:        `<path d="M3 21h18M2 18h20M5 18L12 4l7 14M6 18v-7M10 18v-7M14 18v-7M18 18v-7"/>`,
  // Frühschicht: aufgehende Sonne mit Strahlen über Horizont
  sunrise:       `<circle cx="12" cy="17" r="4"/><path d="M2 21h20M12 11V8M5.6 14.4L4 12.8M18.4 14.4L20 12.8M3 18h2M19 18h2M9 6l3-3 3 3"/>`,
  // Nerven aus Stahl: Herz mit EKG-Linie quer durch
  nerves:        `<path d="M12 21s-7-4-9-9c-1.5-4 2-8 5-8 2 0 3 1 4 3 1-2 2-3 4-3 3 0 6.5 4 5 8-2 5-9 9-9 9z"/><polyline points="4,13 8,13 10,10 12,16 14,11 16,13 20,13"/>`,
  // Award: Meiste POTW-Auszeichnungen (Kalender mit Krone) — saison-/all-time Sammler-Award
  weekKing:      `<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13h18M8 7v4M16 7v4"/><polygon points="5,7 8,3 12,6 16,3 19,7" fill="none" stroke-linejoin="round"/>`,
  // Award: Meiste POTD-Auszeichnungen (Trophäe mit Krone) — saison-/all-time Sammler-Award
  dayKing:       `<path d="M8 21h8M12 17v4M7 8h10v4a5 5 0 01-10 0zM5 11a2 2 0 01-2-2V7h4M19 11a2 2 0 002-2V7h-4"/><polygon points="5,5 8,2 12,4 16,2 19,5" fill="none" stroke-linejoin="round"/>`,
  // ── NEUE AWARDS v3 ──
  // Plus-Minus (Saldofürst): klassisches ± Symbol in Kreis — Plus oben, Minus unten
  plusMinus:     `<circle cx="12" cy="12" r="9"/><path d="M12 7v4M10 9h4"/><path d="M10 16h4"/>`,
  // Underdog-Held (David): Aufwärtspfeil mit Krone darüber — Außenseiter mit Königskrönung
  underdog:      `<path d="M12 21v-9"/><path d="M8 16l4-4 4 4"/><path d="M7 8l5-3 5 3v2H7z"/>`,
  // Pechvogel: Regenwolke mit drei schräg fallenden Tropfen
  rainCloud:     `<path d="M6 14a4 4 0 010-8 5 5 0 019 0 4 4 0 010 8z"/><path d="M9 17l-1 3M13 17l-1 3M17 17l-1 3"/>`,
  // ── NEUE TEAM-AWARDS v4 ──
  // Unaufhaltsam: Loderndes Feuer mit Aufwärts-Pfeil — Team-Siegesserie
  unstoppable:   `<path d="M12 3s5 5 5 10a5 5 0 01-10 0c0-2 1-3 1-3s.5 2 2 2c-1-3 2-4 2-9z"/><polyline points="10,15 12,12 14,15"/>`,
  // Betonmauer: Massive Backstein-Wand mit Schild-Andeutung — defensiv-stärkstes Team
  concreteWall:  `<rect x="3" y="3" width="18" height="6" rx="1"/><rect x="3" y="9" width="18" height="6" rx="1"/><rect x="3" y="15" width="18" height="6" rx="1"/><path d="M8 3v6M16 3v6M5 9v6M12 9v6M19 9v6M8 15v6M16 15v6"/>`,
  // Glückspilze: Vierblättriges Kleeblatt — Glück bei knappen Siegen
  clover:        `<path d="M12 12s-3-1-3-4 3-3 3 0c0-3 3-3 3 0s-3 4-3 4z"/><path d="M12 12s-1 3-4 3-3-3 0-3c-3 0-3-3 0-3s4 3 4 3z"/><path d="M12 12s3 1 3 4-3 3-3 0c0 3-3 3-3 0s3-4 3-4z"/><path d="M12 12s1-3 4-3 3 3 0 3c3 0 3 3 0 3s-4-3-4-3z"/><path d="M12 16v5"/>`,
  // Giant Slayer: Schwert kreuzt sich mit Krone — Underdog-Sieg gegen Favoriten als Team
  giantSlayer:   `<path d="M5 19l8-8M5 19l3 0M5 19l0-3M13 11l6-6M13 11l3 0M13 11l0-3"/><polygon points="9,4 12,2 15,4 14,7 10,7" fill="none" stroke-linejoin="round"/>`,
  // Favoritenschreck: Teufelsmaske mit Hörnern — Schock-Sieg gegen weit stärkere Gegner
  devilMask:     `<path d="M5 8l2-4 3 2M19 8l-2-4-3 2"/><path d="M4 11a8 8 0 0116 0v4a8 8 0 01-16 0z"/><circle cx="9" cy="13" r="1.3"/><circle cx="15" cy="13" r="1.3"/><path d="M9 18c1 .8 2 1 3 1s2-.2 3-1"/>`,
  // Erzfeinde: Zwei gekreuzte Schwerter — Team-Rivalität
  crossedSwords: `<path d="M3 3l9 9M3 8V3h5M14.5 14.5L21 21M16 21h5v-5"/><path d="M21 3l-9 9M21 8V3h-5M9.5 14.5L3 21M8 21H3v-5"/>`,
  // ── NEUE BADGES v5 ──
  // Pflichterfüller: Trophäe mit Häkchen unten — Sieg gegen Bottom-3 zum Match-Zeitpunkt
  trophyCheck:   `<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM5 9a2 2 0 01-2-2V5h4M19 9a2 2 0 002-2V5h-4"/><polyline points="9,11 11,13 15,8"/>`,
  // Serienbrecher: brennende Flamme von horizontaler Linie durchgestrichen — Streak gestoppt
  flameBreak:    `<path d="M12 2s5 5 5 10a5 5 0 01-10 0c0-2 1-3 1-3s.5 2 2 2c-1-3 2-4 2-9z"/><line x1="3" y1="13" x2="21" y2="13" stroke-width="2.5" stroke-linecap="round"/>`,
  // ── NEUE NEGATIV-AWARDS/BADGES v6 ──
  // Käseteller: Kreis mit drei "Löchern" — symbolisiert löchrige Defensive
  cheese:        `<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1.3"/><circle cx="15" cy="11" r="1.7"/><circle cx="10" cy="15" r="1.4"/><circle cx="15.5" cy="15.5" r="0.9"/>`,
  // Favoriten-Versager: gestürzte Krone (Zacken nach unten)
  crownFallen:   `<path d="M2 16l4-6 6 9 6-9 4 6v0a1 1 0 01-1 1H3a1 1 0 01-1-1z"/><line x1="3" y1="20" x2="21" y2="20"/>`,
  // Schwarzer Tag: dichte Regenwolke mit Strichen (kompakter als rainCloud)
  blackDay:      `<path d="M6 14a4 4 0 010-8 5 5 0 019 0 4 4 0 010 8z" fill="currentColor" fill-opacity="0.25"/><path d="M6 14a4 4 0 010-8 5 5 0 019 0 4 4 0 010 8z"/><line x1="8" y1="18" x2="7" y2="21"/><line x1="12" y1="18" x2="11" y2="21"/><line x1="16" y1="18" x2="15" y2="21"/>`,
  // Krimi-Versager: Theatermaske mit Träne — Drama mit Pech-Note
  dramaTear:     `<path d="M12 3c4 0 7 3 7 7v3c0 4-3 7-7 7s-7-3-7-7v-3c0-4 3-7 7-7z"/><circle cx="9.5" cy="11" r="0.9"/><circle cx="14.5" cy="11" r="0.9"/><path d="M9 15.5c1 1 2 1.3 3 1.3s2-.3 3-1.3"/><path d="M15 12.5l0.6 2.5"/>`,
  // ── NEUE LEGENDARY-BADGES v7 ──
  // Untouchable: Schild mit innerem Stern — unangefochten an der Spitze
  shieldStar:    `<path d="M12 2l8 4v6c0 5-4 8-8 10-4-2-8-5-8-10V6z"/><polygon points="12,7.5 13.5,11 17,11.3 14.3,13.6 15.1,17 12,15.1 8.9,17 9.7,13.6 7,11.3 10.5,11"/>`,
  // Mr. Perfect: drei kleine Pokale nebeneinander — dreifach perfekt in einer Saison
  tripleCup:     `<path d="M3 4h4v3a2 2 0 01-4 0zM10 4h4v3a2 2 0 01-4 0zM17 4h4v3a2 2 0 01-4 0z"/><line x1="5" y1="7" x2="5" y2="10"/><line x1="12" y1="7" x2="12" y2="10"/><line x1="19" y1="7" x2="19" y2="10"/><line x1="3" y1="10" x2="7" y2="10"/><line x1="10" y1="10" x2="14" y2="10"/><line x1="17" y1="10" x2="21" y2="10"/><line x1="4" y1="20" x2="20" y2="20"/><path d="M5 14l-1 6M19 14l1 6M12 14v6"/>`,
  // Allwetter: Sonne + Wolke + Regen kombiniert — alle Wochentage abgedeckt
  weatherMix:    `<circle cx="7" cy="7" r="2.5"/><line x1="7" y1="2.5" x2="7" y2="3.5"/><line x1="2.5" y1="7" x2="3.5" y2="7"/><line x1="4" y1="4" x2="4.5" y2="4.5"/><line x1="10" y1="4" x2="9.5" y2="4.5"/><path d="M14 14a3.5 3.5 0 010-7 4.5 4.5 0 014.5 3.5 2.5 2.5 0 010 5h-4.5z"/><line x1="10" y1="18" x2="9" y2="21"/><line x1="14" y1="18" x2="13" y2="21"/><line x1="18" y1="18" x2="17" y2="21"/>`,
  // Tag der Götter: Sonne mit Stern im Zentrum + Strahlen — göttliche Dominanz
  godRay:        `<circle cx="12" cy="13" r="3.5"/><polygon points="12,10.5 12.8,12.5 12,14.5 11.2,12.5" fill="currentColor" fill-opacity="0.6"/><line x1="12" y1="3" x2="12" y2="5.5"/><line x1="21" y1="13" x2="18.5" y2="13"/><line x1="3" y1="13" x2="5.5" y2="13"/><line x1="18.5" y1="6.5" x2="16.7" y2="8.3"/><line x1="5.5" y1="6.5" x2="7.3" y2="8.3"/><line x1="18.5" y1="19.5" x2="16.7" y2="17.7"/><line x1="5.5" y1="19.5" x2="7.3" y2="17.7"/>`,
  // ── NEUE BADGES v4 ──
  // Thronfäller: Krone mit "X" durchgestrichen — Sieg gegen den Top-1 Spieler der Saison
  kingFall:      `<path d="M5 9l3-3 4 2 4-2 3 3v9H5z"/><path d="M8 13l8 4M16 13l-8 4"/>`,
  // Überholmanöver: Klassisches Swap-Pfeile-Symbol — versetzte horizontale Pfeile in entgegengesetzte Richtung
  overtake:      `<path d="M3 7h13"/><path d="M12 3l4 4-4 4"/><path d="M21 17H8"/><path d="M12 13l-4 4 4 4"/>`,
  // ── Neue Badge-Icons ──
  // Krimi-Reihe: zackige Achterbahn-Linie (viele knappe, dramatische Spiele)
  thriller:      `<polyline points="3 18 6 8 9 16 12 10 15 17 18 8 21 14"/>`,
  // Klares Ding: Daumen hoch (eindeutiger, deutlicher Sieg)
  thumbsUp:      `<rect x="3" y="11" width="4" height="10" rx="1"/><path d="M7 11l3-5c.2-.5.7-.7 1.2-.7 1.1 0 1.8 1 1.5 2L12 10h4.5c1 0 1.7.7 1.5 1.7l-1.3 5c-.2.8-.9 1.3-1.7 1.3H7z"/>`,
  // Wiederholungstäter: zwei überlappende Karten (Duplikat-Score)
  duplicate:     `<rect x="4" y="4" width="13" height="13" rx="2"/><rect x="8" y="8" width="13" height="13" rx="2"/>`,
  // Comeback-Tag: V-Kurve mit Endpunkt oben (Talsohle → Wiederaufstieg)
  comeback:      `<polyline points="3 4 9 19 21 4"/><circle cx="21" cy="4" r="1.5"/>`,
  // Revanchist: zwei gegenläufige Refresh-Bögen (Rück-Match gewonnen)
  rematch:       `<polyline points="4 4 4 10 10 10"/><path d="M4 10a8 8 0 0114-3"/><polyline points="20 20 20 14 14 14"/><path d="M20 14a8 8 0 01-14 3"/>`,
  // Königsklasse: Krone mit drei Edelsteinen darunter (Top-3 der Liga)
  kingClass:     `<polygon points="3,9 6,5 9,9 12,5 15,9 18,5 21,9 21,17 3,17" fill="none" stroke-linejoin="round"/><circle cx="7" cy="14" r="1.3"/><circle cx="12" cy="14" r="1.3"/><circle cx="17" cy="14" r="1.3"/>`,
  // Pflichtaufgabe: Klemmbrett mit Häkchen (Pflicht erfüllt)
  clipboard:     `<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><polyline points="9 13 11 15 15 11"/>`,
  // Award-Sammler: drei Medaillen mit Bändern (Sammlung von Auszeichnungen)
  medalTrio:     `<circle cx="7" cy="15" r="3.5"/><circle cx="12" cy="10" r="3.5"/><circle cx="17" cy="15" r="3.5"/><path d="M6 12l-1-3M11 7l-1-3M16 12l1-3M18 7l-1-3M13 7l-1-3M8 12l-1-3"/>`,
  // ── NEUE NEGATIV-BADGES v8 ──
  // Mr. Disaster: drei umgekehrte Pokale (Stiel nach oben) — verlorene/gestürzte Trophäen
  tripleCrash:   `<path d="M3 20h4v-3a2 2 0 00-4 0zM10 20h4v-3a2 2 0 00-4 0zM17 20h4v-3a2 2 0 00-4 0z"/><line x1="5" y1="17" x2="5" y2="14"/><line x1="12" y1="17" x2="12" y2="14"/><line x1="19" y1="17" x2="19" y2="14"/><line x1="4" y1="4" x2="20" y2="4"/><line x1="5" y1="14" x2="4" y2="4"/><line x1="19" y1="14" x2="20" y2="4"/><line x1="12" y1="14" x2="12" y2="4"/>`,
  // Zusammenbruch: invertierte V-Kurve (Höhenflug → Absturz) mit Crash-Punkt unten rechts
  crashDay:      `<polyline points="3 19 12 4 21 19"/><circle cx="21" cy="19" r="1.5"/>`,
  // Bittere Pille / Tragische Niederlage: zerbrochenes Herz mit Zickzack-Bruch
  heartBroken:   `<path d="M12 21s-7-4.5-7-11a4 4 0 017-3 4 4 0 017 3c0 6.5-7 11-7 11z"/><polyline points="10 8 12 12 10 15 13 11"/>`,
  // Angstgegner / Nemesis: klassischer Geist (welliger Unterrand, zwei Augen) — bedrohliche Präsenz
  ghost:         `<path d="M5 10a7 7 0 0114 0v10l-2.3-1.7L14 20l-2-1.7L10 20l-2.3-1.7L5 20z"/><circle cx="10" cy="11" r="1.2"/><circle cx="14" cy="11" r="1.2"/>`,
  // ── NEWS / STORY SYSTEM v9 ──
  // Newspaper (Header-Button + leere News-Liste)
  newspaper:     `<rect x="3" y="4" width="15" height="16" rx="2"/><line x1="18" y1="8" x2="21" y2="8"/><path d="M18 8v9a2 2 0 002 2 1 1 0 001-1V8"/><line x1="6" y1="8" x2="14" y2="8"/><line x1="6" y1="11" x2="14" y2="11"/><line x1="6" y1="14" x2="11" y2="14"/>`,
  // Clock (Quiet-Week, Prime-Time)
  clock:         `<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>`,
  // Sort (News-Feed „Neueste zuerst")
  sort:          `<path d="M3 6h12M3 12h8M3 18h5"/><path d="M17 9l3-3 3 3M20 6v12"/>`,
};
function svgI(name, opts){
  const o = opts || {};
  const cls = o.cls ? ' '+o.cls : '';
  const path = ICONS[name] || '';
  return `<span class="ic svg-ic${cls}"><svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg></span>`;
}
// Medaillen-Badge (1/2/3) statt 🥇🥈🥉
function medalB(i){
  if(i<0||i>2) return '';
  return `<span class="medal-b m${i+1}">${i+1}</span>`;
}
// Streak-Badge: 1/2/3 Flammen je nach Stärke (ab 3 / 5 / 7) — alle in Standard-Farbe
function streakBadge(cs){
  if(cs<3) return '';
  if(cs<=-3) return ''; // Niederlagen über streakInline
  const flames = cs>=7 ? 'flameTriple' : cs>=5 ? 'flameDouble' : 'flame';
  return `<span class="streak-badge" title="${cs}er Siegesserie">${svgI(flames)}</span>`;
}
// Inline-Variante neben Namen: dasselbe Schema, plus Niederlagen-Variante mit Tropfen
function streakInline(cs){
  if(cs>=3){
    const flames = cs>=7 ? 'flameTriple' : cs>=5 ? 'flameDouble' : 'flame';
    return `<span class="streak-badge" title="${cs}er Siegesserie">${svgI(flames)}</span>`;
  }
  if(cs<=-3){
    const drops = cs<=-7 ? 'dropTriple' : cs<=-5 ? 'dropDouble' : 'drop';
    return `<span class="streak-badge fire" title="${-cs}er Niederlagenserie">${svgI(drops)}</span>`;
  }
  return '';
}

// Zentrale Match-Filterung für Awards
function matchesForAwards(){
  if(awPeriod==='season'){
    const sid=awSeasonId||currentSeason().id;
    return matchesInSeason(sid);
  }
  if(awPeriod==='week' && awWeekStart){
    const start=new Date(awWeekStart); start.setHours(0,0,0,0);
    const end=new Date(start); end.setDate(end.getDate()+7);
    return matches.filter(m=>{
      const d=new Date(m.created_at);
      return d>=start && d<end;
    });
  }
  return matchesInPeriod(awPeriod);
}
function awPeriodLabel(){
  if(awPeriod==='season') return seasonLabel(awSeasonId||currentSeason().id);
  if(awPeriod==='week'){
    if(awWeekStart){
      const start=new Date(awWeekStart); start.setHours(0,0,0,0);
      const end=new Date(start); end.setDate(end.getDate()+6);
      return 'KW '+isoWeek(start)+' · '+start.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})+'–'+end.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});
    }
    return periodLabel('week');
  }
  return 'Gesamte Liga';
}
// Alle verfügbaren Saisons (vergangene + aktuelle), neueste zuerst
function availableSeasons(){
  const past=allPastSeasons().reverse(); // neueste zuerst
  const cur=currentSeason().id;
  return [cur,...past];
}

