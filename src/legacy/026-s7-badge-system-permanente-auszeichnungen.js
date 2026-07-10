// ╔═══ §7 ─── BADGE-SYSTEM (permanente Auszeichnungen) ─────────────────╗
//     ⚑ HOTSPOT — neue Badges benötigen Updates an MEHREREN Stellen.
//
//     Architektur:
//       BADGES[]              — Definitionen [§7.1]
//       BADGE_RARITY{}        — Klassen-Map  [§7.2]
//       RARITY_META{}         — Anzeige-Map  [§7.2]
//       count*-Funktionen     — Aggregat-Counter (für Profil) [§7.3]
//       getBadgeEarnedCache() — Match-Trigger fire() [§7.4]
//
//     Pro Match werden im Cache-Walk inkrementelle States pro Spieler
//     geführt; fire('badge_id') schreibt einen Eintrag. Ohne fire() taucht
//     das Badge NICHT im Match-Review/Achievement-Toast auf — nur im Profil.
// ╚═════════════════════════════════════════════════════════════════════════╝
// Badges sind dauerhafte Achievements, die ein Spieler einmal freischaltet und für immer behält.
// Berechnet clientseitig aus der Match-Historie — kein DB-Umbau nötig.
// Reihenfolge im Array = Anzeige-Reihenfolge im Badge-Sheet (Grid mit 2 Spalten).
// Paare unten: jede Zeile hier = eine Zeile im 2-Spalten-Grid (links/rechts).
// ⚑ HOTSPOT — BADGES-Array. Neue Badges brauchen:
//   - Eintrag hier (mit ic/name/desc/count)
//   - Eintrag in BADGE_RARITY (§7.2) — sonst kein Rarity-Bucket!
//   - ggf. fire('badge_id') in getBadgeEarnedCache (§7.4) — sonst kein
//     Match-Trigger / kein Achievement-Toast / keine Chip im Match-Review
//   - RARITY_META.<rarity>.total +1 setzen
const BADGES=[
  // ══ EINMALIGE BADGES (Karriere-Meilensteine) ══
  // Zeile 1 — Debütant, Stammgast
  {id:'first_match',ic:'egg',name:'Debütant',desc:'Match gespielt',
    multi:true,count:(id,ms)=>countGames(id,ms)>=1?1:0},
  {id:'games25',ic:'controller',name:'Stammgast',desc:'25 Matches gespielt',
    multi:true,count:(id,ms)=>countGames(id,ms)>=25?1:0},
  // Zeile 2 — Legende, Allrounder
  {id:'games150',ic:'diamond',name:'Legende',desc:'150 Matches gespielt',
    multi:true,count:(id,ms)=>countGames(id,ms)>=150?1:0},
  {id:'allrounder',ic:'refresh',name:'Allrounder',desc:'20+ Siege auf jeder Position',
    multi:true,count:(id,ms)=>{const s=playerStats(id,ms);return(s.atkW>=20&&s.defW>=20)?1:0;}},
  // Zeile 3 — Abwehrchef, Mittelstürmer
  {id:'def50',ic:'shieldStar',name:'Abwehrchef',desc:'50 Spiele als Abwehrspieler',
    multi:true,count:(id,ms)=>{const s=playerStats(id,ms);return s.defG>=50?1:0;}},
  {id:'atk50',ic:'bolt2',name:'Mittelstürmer',desc:'50 Spiele als Stürmer',
    multi:true,count:(id,ms)=>{const s=playerStats(id,ms);return s.atkG>=50?1:0;}},
  // Zeile 4 — Aufsteiger, Dominator
  // Schwellen sind RELATIV zum Liga-Start-Elo (Ligen starten z. B. bei 1000 —
  // absolute Werte würden die Badges sofort verschenken)
  {id:'climber_100',ic:'climb',name:'Aufsteiger',desc:'+100 Elo über Saison-Start erreicht',
    multi:false,count:(id,ms)=>seasonPeakFor(id)-cfg.start_elo>=100?1:0},
  {id:'dominator_400',ic:'dominator',name:'Dominator',desc:'+400 Elo über Saison-Start erreicht',
    multi:false,count:(id,ms)=>seasonPeakFor(id)-cfg.start_elo>=400?1:0},
  // Zeile 5 — Dynastie, Vize-Meister
  {id:'dynasty_600',ic:'temple',name:'Dynastie',desc:'+600 Elo über Saison-Start erreicht',
    multi:false,count:(id,ms)=>seasonPeakFor(id)-cfg.start_elo>=600?1:0},

    // ══ MEHRFACH-BADGES — gruppiert nach Thema ══
//Reihenfolge überarbeitet / Möglciherweise Abweichung von Namen in //
  {id:'upset_king',ic:'tornado',name:'Upset-König',desc:'Als Underdog gewonnen (<35% Chance)',
    multi:true,count:(id,ms)=>ms.filter(m=>matchOf(id,m)&&won(id,m)&&myExp(id,m)<0.35).length},
  // Zeile 6 — Frühschicht, Unschlagbar (Tages-Patterns)
  {id:'early_bird',ic:'sunrise',name:'Frühschicht',desc:'Erstes Match des Tages gewonnen',
    multi:true,count:(id,ms)=>countEarlyBirdDays(id,ms)},
  {id:'unbeatable',ic:'crownPlus',name:'Unschlagbar',desc:'Ganzer Tag ohne Niederlage (min. 3 Spiele)',
    multi:true,count:(id,ms)=>countUnbeatableDays(id,ms)},
  // Zeile 7 — Comeback-Tag, Revanchist (Wiedergutmachung)
  {id:'comeback_day',ic:'comeback',name:'Comeback-Tag',desc:'Tag mit Niederlage gestartet und mit Sieg beendet (min. 3 Matches an dem Tag)',
    multi:true,count:(id,ms)=>countComebackDays(id,ms)},
  {id:'revanchist',ic:'rematch',name:'Revanchist',desc:'Nach Niederlage gegen ein Team direkt im nächsten Match wieder auf dasselbe Team getroffen und gewonnen',
    multi:true,count:(id,ms)=>countRevenge(id,ms)},
  // Zeile 8 — Klares Ding, Krimi-Reihe (Tordifferenz-Pattern)
  {id:'clear_win',ic:'thumbsUp',name:'Klares Ding',desc:'Sieg mit Tordifferenz ≥ 7',
    multi:true,count:(id,ms)=>countClearWins(id,ms)},
  {id:'krimi',ic:'thriller',name:'Krimi-Reihe',desc:'5 Spiele in Folge mit Tordifferenz ≤ 2 (Sieg oder Niederlage)',
    multi:true,count:(id,ms)=>countKrimiStreaks(id,ms)},
  // Zeile 9 — Wiederholungstäter, Losing Streak
  {id:'repeat_score',ic:'duplicate',name:'Wiederholungstäter',desc:'3 Siege in Folge mit identischem Endstand',
    multi:true,count:(id,ms)=>countRepeatScoreStreaks(id,ms)},
  {id:'losing5',ic:'trendCrash',name:'Losing Streak',desc:'5 Niederlagen in Folge',
    multi:true,count:(id,ms)=>countLossStreakOccurrences(id,ms,5)},
  // Zeile 10 — Absoluter Verlierer, Absoluter Sieger
  {id:'perfect_loss',ic:'dizzy',name:'Absoluter Verlierer',desc:'0:10 Niederlage',
    multi:true,count:(id,ms)=>ms.filter(m=>matchOf(id,m)&&!won(id,m)&&shutout(id,m,0,10)).length},
  {id:'perfect_win',ic:'hundred',name:'Absoluter Sieger',desc:'10:0 Sieg',
    multi:true,count:(id,ms)=>ms.filter(m=>matchOf(id,m)&&won(id,m)&&shutout(id,m,10,0)).length},
  // Zeile 11 — Nerven aus Stahl,  Zittersieg (Score-Spezial)
   {id:'nerves_of_steel',ic:'nerves',name:'Nerven aus Stahl',desc:'3 Zittersiege (10:9) in Folge',
    multi:true,count:(id,ms)=>countNailBiterStreaks(id,ms,3)},
  {id:'nail_biter',ic:'pinch',name:'Zittersieg',desc:'10:9 Sieg',
    multi:true,count:(id,ms)=>ms.filter(m=>matchOf(id,m)&&won(id,m)&&goalsFor(id,m)===10&&goalsAgainst(id,m)===9).length},
  // Zeile 12 — 5er Serie, 10er Serie
  {id:'streak5',ic:'flame',name:'5er Serie',desc:'5 Siege in Folge',
    multi:true,count:(id,ms)=>countStreakOccurrences(id,ms,5)},
  {id:'streak10',ic:'flameDouble',name:'10er Serie',desc:'10 Siege in Folge',
    multi:true,count:(id,ms)=>countStreakOccurrences(id,ms,10)},
  // Zeile 13 — 15er Serie, 30er Serie
  {id:'streak15',ic:'flameTriple',name:'15er Serie',desc:'15 Siege in Folge',
    multi:true,count:(id,ms)=>countStreakOccurrences(id,ms,15)},
  {id:'streak20',ic:'crownFlame',name:'20er Serie',desc:'20 Siege in Folge',
    multi:true,count:(id,ms)=>countStreakOccurrences(id,ms,20)},
  // Zeile 14 — Mauer, Carry
  {id:'wall_badge',ic:'brick',name:'Mauer',desc:'Sieg mit max. 2 Gegentoren als Verteidiger',
    multi:true,count:(id,ms)=>ms.filter(m=>{if(!matchOf(id,m)||!won(id,m))return false;
      const pos=id===m.a1?m.a1_pos:id===m.a2?m.a2_pos:id===m.b1?m.b1_pos:m.b2_pos;
      return pos==='def'&&goalsAgainst(id,m)<=2;}).length},
  {id:'carry',ic:'weightSmall',name:'Carry',desc:'Sieg mit dem schwächsten Spieler im Match als Mate',
    multi:true,count:(id,ms)=>countCarries(id,ms)},
  // Zeile 15 — Upset-König, Königsklasse (Sieg gegen Stärkere)
  {id:'vice_champion',ic:'medal2',name:'Vize-Meister',desc:'Saison auf Platz 2 beendet',
    multi:true,count:(id,ms)=>countViceChampion(id)},
 /* {id:'koenigsklasse',ic:'kingClass',name:'Königsklasse',desc:'Sieg gegen mindestens einen Gegner aus den Top 3 der Saison-Endrangliste',
    multi:true,count:(id,ms)=>countTopThreeWins(id,ms)},
  // Zeile 16 — Pflichtaufgabe, Award-Sammler
  {id:'pflichtaufgabe',ic:'clipboard',name:'Pflichtaufgabe',desc:'Sieg gegen mindestens einen Gegner aus den Bottom 3 der Saison-Endrangliste (ab 6 Saison-Teilnehmern)',
    multi:true,count:(id,ms)=>countBottomThreeWins(id,ms)}, */
  {id:'award_collector',ic:'medalTrio',name:'Award-Sammler',desc:'In einer Saison min. 5 Tagessieger und 2 Wochensieger',
    multi:true,count:(id,ms)=>countAwardCollector(id)},
  // Zeile 17 — POTW, POTD (Perioden-Auszeichnungen, ganz am Ende)
  {id:'potw',ic:'weekly',name:'Player of the Week',desc:'Höchste Quote in einer Kalenderwoche (min. 5 Siege)',
    multi:true,count:(id,ms)=>countPeriodWins(id,ms,'week')},
  {id:'potd',ic:'trophyDay',name:'Player of the Day',desc:'Meiste Siege an einem Tag (min. 3)',
    multi:true,count:(id,ms)=>countDayWins(id,ms)},
  // ── NEUE BADGES v4 ──
  // Thronfäller: Sieg gegen den Top-1 der laufenden Saison-Rangliste (Stand vor dem Match)
  {id:'kingslayer',ic:'kingFall',name:'Thronfäller',desc:'Sieg gegen den Top-1 Spieler der Saison-Rangliste (Stand zum Zeitpunkt des Matches)',
    multi:true,count:(id,ms)=>countKingslayer(id,ms)},
  // Überholmanöver: Sieg gegen einen Spieler, der dadurch in der Saison-Rangliste überholt wurde
  {id:'overtake',ic:'overtake',name:'Überholmanöver',desc:'Spieler im Match besiegt und ihn dadurch in der Saison-Rangliste überholt',
    multi:true,count:(id,ms)=>countOvertake(id,ms)},
  // ── NEUE BADGES v5 ──
  // Pflichterfüller: Sieg gegen mindestens einen Gegner aus den Bottom-2 der
  // Saison-Rangliste (Stand vor dem Match). Erst ab 5 Spielern in der Saison sinnvoll.
  {id:'duty_done',ic:'trophyCheck',name:'Pflichterfüller',desc:'Sieg gegen mind. einen Gegner aus den Bottom-2 der Saison-Rangliste (Stand zum Zeitpunkt des Matches)',
    multi:true,count:(id,ms)=>countBottomTwoMatchWins(id,ms)},
  // Serienbrecher: Direktsieg, der eine laufende Siegesserie (≥4) eines Gegners beendet hat.
  {id:'streak_breaker',ic:'flameBreak',name:'Serienbrecher',desc:'Siegesserie eines Gegners (mind. 4 in Folge) durch direkten Sieg gestoppt',
    multi:true,count:(id,ms)=>countStreakBreaker(id,ms)},
  // ── NEUE NEGATIV-BADGES v6 ──
  // Schwarzer Tag: ein Tag mit mind. 3 absolvierten Spielen, alle verloren.
  {id:'black_day',ic:'blackDay',name:'Schwarzer Tag',desc:'Tag mit mind. 3 Spielen, alle verloren',
    multi:true,count:(id,ms)=>countBlackDays(id,ms)},
  // Krimi-Versager: 3 knappe Niederlagen (Tordifferenz ≤ 2) in Folge.
  {id:'krimi_loser',ic:'dramaTear',name:'Krimi-Versager',desc:'3 knappe Niederlagen (Tordifferenz ≤ 2) in Folge',
    multi:true,count:(id,ms)=>countCloseLossStreaks(id,ms,3)},
  // ── NEUE LEGENDARY-BADGES v7 ──
  // Untouchable: 3 Saisons in Folge unter den Top-3 abgeschlossen.
  {id:'untouchable',ic:'shieldStar',name:'Untouchable',desc:'3 Saisons in Folge unter den Top-3 abgeschlossen',
    multi:true,count:(id,ms)=>countUntouchable(id)},
  // Mr. Perfect: 3× 10:0-Sieg in einer einzigen Saison.
  {id:'mr_perfect',ic:'tripleCup',name:'Mr. Perfect',desc:'3× 10:0-Sieg in einer Saison',
    multi:true,count:(id,ms)=>countMrPerfect(id)},
  // Allwetter: an 5 verschiedenen Wochentagen Player-of-the-Day geworden.
  {id:'allwetter',ic:'weatherMix',name:'Allwetter',desc:'An 5 verschiedenen Wochentagen Player-of-the-Day geworden',
    multi:true,count:(id,ms)=>countAllwetter(id)},
  // Tag der Götter: 3 eigene Spieltage in Folge als POTD gewonnen.
  {id:'godly_streak',ic:'godRay',name:'Tag der Götter',desc:'An 3 Spieltagen in Folge Player-of-the-Day geworden (nur mitgespielte Tage)',
    multi:true,count:(id,ms)=>countGodlyStreak(id)},
  // ── NEUE NEGATIV-BADGES v8 ──
  // Bittere Pille: 9:10-Niederlage (Pendant zu nail_biter / 10:9-Sieg).
  {id:'bitter_loss',ic:'heartBroken',name:'Bittere Pille',desc:'9:10 Niederlage',
    multi:true,count:(id,ms)=>ms.filter(m=>matchOf(id,m)&&!won(id,m)&&goalsFor(id,m)===9&&goalsAgainst(id,m)===10).length},
  // Mr. Disaster: 3× 0:10-Niederlage in einer Saison (Pendant zu mr_perfect).
  {id:'mr_disaster',ic:'tripleCrash',name:'Mr. Disaster',desc:'3× 0:10-Niederlage in einer Saison',
    multi:true,count:(id,ms)=>countMrDisaster(id)},
  // Zusammenbruch: Tag mit Sieg gestartet, mit Niederlage beendet, min. 3 Matches (Pendant zu comeback_day).
  {id:'crash_day',ic:'crashDay',name:'Zusammenbruch',desc:'Tag mit Sieg gestartet und mit Niederlage beendet (min. 3 Matches an dem Tag)',
    multi:true,count:(id,ms)=>countCrashDays(id,ms)},
  // Angstgegner: 5× in Folge gegen denselben Gegner-Spieler verloren (egal in welcher Konstellation).
  {id:'nemesis',ic:'ghost',name:'Angstgegner',desc:'5× in Folge gegen denselben Gegner verloren',
    multi:true,count:(id,ms)=>countNemesis(id,ms)},
];

// ════════════════════════════════════════════════════════════════════
// BADGE-RARITY-SYSTEM — vier Stufen + Negative eigenständig
// ════════════════════════════════════════════════════════════════════
// Neue Klassifizierung (v8): kalibriert auf reale Achievement-Häufigkeit:
//   • LEGENDARY (10) — extrem selten, Karriere-Highlight
//   • RARE      (14) — schwer, brauchen Skill/Konstanz
//   • COMMON    (14) — bei aktivem Spiel oft erreicht
//   • NEGATIVE  (8)  — "Schande", eigenständig (rot, abgesetzt)
// Jeder Bucket hat eine GERADE Anzahl, damit das 2-Spalten-Grid im Sheet
// sauber aufgeht. Total = 46 Badges (= BADGES-Array-Länge).
// Reihenfolge innerhalb jeder Gruppe folgt der thematischen BADGES-Reihenfolge.
// ════════════════════════════════════════════════════════════════════
// ⚑ HOTSPOT — BADGE_RARITY: ordnet jeder Badge-ID eine Rarity-Klasse zu.
// MUSS alle IDs aus BADGES (§7.1) abdecken — fehlt eine, fliegt die Badge
// aus der UI (kein Bucket, kein Icon-Wrapper).
const BADGE_RARITY = {
  // LEGENDARY (6)
  dynasty_600:     'legendary', // Dynastie (600 Elo)
  dominator_400:   'legendary', // Dominator (400 Elo) — hochgestuft von Rare
  award_collector: 'legendary', // Award-Sammler (5 POTD + 2 POTW) — hochgestuft von Rare
  perfect_win:     'legendary', // Absoluter Sieger (10:0) — hochgestuft von Common
  streak15:        'legendary', // 15er Serie
  streak20:        'legendary', // 20er Serie (vorher streak30)
  // RARE (14)
  games150:        'rare',      // Legende (150 Matches) — herabgestuft von Legendary
  allrounder:      'rare',      // Allrounder
  wall_badge:      'rare',      // Mauer — hochgestuft von Common
  upset_king:      'rare',      // Upset-König
  unbeatable:      'rare',      // Unschlagbar
  krimi:           'rare',      // Krimi-Reihe
  repeat_score:    'rare',      // Wiederholungstäter
  nerves_of_steel: 'rare',      // Nerven aus Stahl
  streak10:        'rare',      // 10er Serie
  vice_champion:   'rare',      // Vize-Meister
  clear_win:       'rare',      // Klares Ding — hochgestuft von Common
  streak5:         'rare',      // 5er Serie — hochgestuft von Common
  potw:            'rare',      // Player of the Week
  potd:            'rare',      // Player of the Day — hochgestuft von Common
  // COMMON (12)
  first_match:     'common',    // Debütant
  games25:         'common',    // Stammgast
  atk50:           'common',    // Mittelstürmer
  def50:           'common',    // Abwehrchef — herabgestuft von Rare
  climber_100:     'common',    // Aufsteiger
  early_bird:      'common',    // Frühschicht
  comeback_day:    'common',    // Comeback-Tag
  revanchist:      'common',    // Revanchist
  nail_biter:      'common',    // Zittersieg
  carry:           'common',    // Carry
  // ── NEUE BADGES v4 ──
  kingslayer:      'common',    // Thronfäller — Sieg gegen Top-1
  overtake:        'common',    // Überholmanöver — Spieler in Rangliste überholt
  // ── NEUE BADGES v5 ──
  duty_done:       'common',    // Pflichterfüller — Sieg gegen Bottom-3 zum Match-Zeitpunkt
  streak_breaker:  'common',    // Serienbrecher — Streak ≥4 eines Gegners gestoppt
  // ── NEUE NEGATIV-BADGES v6 ──
  black_day:       'negative',  // Schwarzer Tag — Tag mit ≥3 Spielen, alle verloren
  krimi_loser:     'negative',  // Krimi-Versager — 3 knappe Niederlagen in Folge
  // ── NEUE LEGENDARY-BADGES v7 ──
  untouchable:     'legendary', // Untouchable — 3 Saisons in Folge Top-3
  mr_perfect:      'legendary', // Mr. Perfect — 3× 10:0 in einer Saison
  allwetter:       'legendary', // Allwetter — POTD an 5 verschiedenen Wochentagen
  godly_streak:    'legendary', // Tag der Götter — 3 eigene POTD-Spieltage in Folge
  // NEGATIVE (8)
  losing5:         'negative',  // Losing Streak
  perfect_loss:    'negative',  // Absoluter Verlierer
  // ── v8 Erweiterungen ──
  bitter_loss:     'negative',  // Bittere Pille — 9:10-Niederlage (Pendant zu nail_biter)
  mr_disaster:     'negative',  // Mr. Disaster — 3× 0:10 in einer Saison (Pendant zu mr_perfect)
  crash_day:       'negative',  // Zusammenbruch — Tag mit Sieg gestartet, mit Niederlage beendet (Pendant zu comeback_day)
  nemesis:         'negative',  // Angstgegner — 5× in Folge gegen denselben Spieler verloren
};

const RARITY_META = {
  legendary: {label:'Legendary', color:'var(--gold)',   total:10},
  rare:      {label:'Rare',      color:'var(--purple)', total:14},
  common:    {label:'Common',    color:'var(--acid)',   total:14},
  negative:  {label:'Schande',   color:'var(--red)',    total:8},
};
const RARITY_ORDER = ['legendary','rare','common','negative'];

// Liefert die Rarity eines Badges (Default: common falls jemand neu hinzukommt
// und vergisst BADGE_RARITY zu erweitern — verhindert undefined-Bugs).
function rarityOf(badgeId){ return BADGE_RARITY[badgeId] || 'common'; }

// ─── §7.3 Count-Funktionen für die neuen Badges ──────────────────────
// Saison-Peak-Elo eines Spielers: höchster jemals erreichter Saison-Elo,
// überlebt Saison-Resets (kommt direkt aus dem globalen Sim-Cache).
function seasonPeakFor(id){
  const pk=getGlobalSim().peakElo||{};
  return pk[id]!==undefined ? pk[id] : cfg.start_elo;
}

// Anzahl abgeschlossener Saisons, in denen der Spieler auf Platz 2 endete.
// Nutzt die archivierten seasons (top_elo enthält die Top-3 als JSON-Array).
function countViceChampion(id){
  if(!seasons||!seasons.length) return 0;
  const curId=currentSeason().id;
  let c=0;
  seasons.forEach(s=>{
    if(s.id===curId) return; // laufende Saison zählt nicht
    let top=s.top_elo;
    if(typeof top==='string'){ try{ top=JSON.parse(top); }catch(e){ top=[]; } }
    if(Array.isArray(top) && top[1] && top[1].id===id) c++;
  });
  return c;
}

// Tage, an denen der Spieler beim chronologisch ersten Match des Tages
// dabei war und es gewonnen hat. Max. 1 pro Tag (durch die Logik garantiert).
function countEarlyBirdDays(id,ms){
  const byDay={};
  ms.forEach(m=>{
    const day=mdayKey(m);
    if(!byDay[day]||mts(m)<mts(byDay[day])) byDay[day]=m;
  });
  let c=0;
  Object.values(byDay).forEach(first=>{
    if(matchOf(id,first)&&won(id,first)) c++;
  });
  return c;
}

// Wie oft eine Serie von n aufeinanderfolgenden 10:n-Siegen erreicht wurde.
// Nach Erreichen Serie zurücksetzen (analog zu countStreakOccurrences).
// Unterbrochen wird die Serie durch jede Niederlage UND durch jeden Sieg ohne 10:9.
function countNailBiterStreaks(id,ms,n){
  // Zählt wie oft n Zittersiege in Folge erreicht wurden — nur knappe Partien (9:10/10:9)
  // werden überhaupt betrachtet. Klare Siege oder klare Niederlagen sind irrelevant
  // und werden übersprungen, ohne die Serie zu unterbrechen. Nur eine knappe Niederlage
  // (9:10) bricht die Serie.
  const ordered=[...ms].filter(m=>matchOf(id,m))
    .sort((a,b)=>mts(a)-mts(b));
  let cur=0,count=0;
  ordered.forEach(m=>{
    const gf=goalsFor(id,m), ga=goalsAgainst(id,m);
    const isClose=(gf===10&&ga===9)||(gf===9&&ga===10);
    if(!isClose) return; // nicht-knappe Partien ignorieren
    if(won(id,m)){
      cur++;
      if(cur>=n){count++;cur=0;}
    } else {
      cur=0; // knappe Niederlage bricht die Serie
    }
  });
  return count;
}

// Hilfsfunktion: Badge → SVG-Icon-HTML (mit Fallback auf Emoji)
function badgeIc(b, size){
  size = size || 'inherit';
  if(!b) return '';
  const key = b.ic || null;
  if(key && ICONS[key]) {
    return `<span class="ic svg-ic" style="font-size:${size}"><svg viewBox="0 0 24 24">${ICONS[key]}</svg></span>`;
  }
  return '';
}

// Badge-Hilfsfunktionen
function matchOf(id,m){return [m.a1,m.a2,m.b1,m.b2].includes(id);}
function won(id,m){const onA=(id===m.a1||id===m.a2);return (onA&&m.winner==='A')||(!onA&&m.winner==='B');}
function goalsFor(id,m){return (id===m.a1||id===m.a2)?m.score_a:m.score_b;}
function goalsAgainst(id,m){return (id===m.a1||id===m.a2)?m.score_b:m.score_a;}
function shutout(id,m,myG,theirG){return goalsFor(id,m)===myG&&goalsAgainst(id,m)===theirG;}
function myExp(id,m){const onA=(id===m.a1||id===m.a2);return onA?(m.exp_a||0.5):(1-(m.exp_a||0.5));}
function countGames(id,ms){return ms.filter(m=>matchOf(id,m)).length;}
function countWins(id,ms){return ms.filter(m=>matchOf(id,m)&&won(id,m)).length;}

// v9.15 PERF: countPeriodWins/countDayWins wurden PRO SPIELER aufgerufen,
// rechneten aber jedes Mal die komplette spielerUNabhängige Perioden-Sieger-
// Aggregation neu (O(Spieler × Matches)). Jetzt: EINE Aggregation pro
// Match-Array — als {pid → Titel-Anzahl}-Map an der Array-IDENTITÄT memoisiert
// (WeakMap). Die Aufrufer mappen über dasselbe gecachte Array → ab dem zweiten
// Spieler nur noch ein Lookup. Frische Arrays (nach invalidateCache/loadAll)
// invalidieren die Memo automatisch, curKey im Slot-Key fängt Tages-/Wochen-
// Rollover innerhalb einer Session ab. Logik & Tiebreaks unverändert.
const _winnerCountsMemo = new WeakMap(); // msArray → { '<kind>_<curKey>': {pid: count} }
function _winnerCountsOf(allMs, kind){
  const now=new Date();
  let curKey;
  if(kind==='week')       curKey=now.getFullYear()+'-W'+isoWeek(now);
  else if(kind==='month') curKey=now.getFullYear()+'-'+now.getMonth();
  else                    curKey=''; // day: kein Ausschluss des laufenden Tages (wie bisher)
  let slot=_winnerCountsMemo.get(allMs);
  if(!slot){ slot={}; _winnerCountsMemo.set(allMs, slot); }
  const slotKey=kind+'_'+curKey;
  if(slot[slotKey]) return slot[slotKey];

  // Buckets bilden (Woche / Monat / Tag)
  const buckets={};
  allMs.forEach(m=>{
    let key;
    if(kind==='week'){
      const d=new Date(m.created_at);
      key=d.getFullYear()+'-W'+isoWeek(d);
    } else if(kind==='month'){
      const d=new Date(m.created_at);
      key=d.getFullYear()+'-'+d.getMonth();
    } else {
      key=mdayKey(m);
    }
    if(!buckets[key])buckets[key]=[];
    buckets[key].push(m);
  });

  const counts={};
  Object.entries(buckets).forEach(([key,ms])=>{
    if(kind!=='day' && key===curKey)return; // laufende Woche/Monat noch offen
    if(ms.length<2)return;                  // min. 2 Spiele im Zeitraum
    const winsById={}, gamesById={}, eloById={};
    ms.forEach(m=>[m.a1,m.a2,m.b1,m.b2].forEach(pid=>{
      if(!winsById[pid])winsById[pid]=0;
      if(!gamesById[pid])gamesById[pid]=0;
      if(!eloById[pid])eloById[pid]=0;
      gamesById[pid]++;
      const onA=(pid===m.a1||pid===m.a2);
      if((onA&&m.winner==='A')||(!onA&&m.winner==='B'))winsById[pid]++;
      eloById[pid] += (m.deltas && m.deltas[pid]) || 0;
    }));
    let winner=null;
    if(kind==='day'){
      const maxW=Math.max(...Object.values(winsById));
      if(maxW<3)return;
      // Tiebreak: bei gleichen max-Siegen gewinnt höchstes eloDelta
      const candidates=Object.keys(winsById).filter(pid=>winsById[pid]===maxW);
      candidates.sort((a,b)=>eloById[b]-eloById[a]);
      winner=candidates[0];
    } else {
      const minW=kind==='week'?5:10;
      // ⚠ Tiebreak-Konsistenz zum Pop-Up (showPotwRecap):
      // 1. Höchste Siegrate, dann 2. mehr absolute Siege, dann 3. höheres Elo-Delta.
      // Nur DIESER Spieler bekommt das Badge — analog zum Pop-Up "mainPotwPlayerId".
      const qual=Object.keys(winsById).filter(pid=>winsById[pid]>=minW);
      if(!qual.length)return;
      qual.sort((a,b)=>{
        const wrA=winsById[a]/(gamesById[a]||1);
        const wrB=winsById[b]/(gamesById[b]||1);
        if(Math.abs(wrA-wrB)>0.001) return wrB-wrA;
        if(winsById[a]!==winsById[b]) return winsById[b]-winsById[a];
        return eloById[b]-eloById[a];
      });
      winner=qual[0];
    }
    if(winner!=null) counts[winner]=(counts[winner]||0)+1;
  });
  slot[slotKey]=counts;
  return counts;
}
// Zählt in wie vielen abgeschlossenen Wochen/Monaten der Spieler die meisten Siege hatte
function countPeriodWins(id,allMs,periodType){
  return _winnerCountsOf(allMs, periodType==='week'?'week':'month')[id]||0;
}
// Player of the Day: zählt Tage an denen dieser Spieler den POTD-Titel
// erringen würde (analog zur Recap-Pop-Up-Logik in showPotdRecap).
// ⚠ Tiebreak-Konsistenz: Bei gleichem Maximum von Tagessiegen gewinnt
// das höhere Elo-Delta des Tages — exakt wie das Pop-Up sortiert. Nur DIESER
// Spieler bekommt das Badge (vorher: alle Spieler mit max wins → mehrfach).
function countDayWins(id,allMs){
  return _winnerCountsOf(allMs,'day')[id]||0;
}

// ─── Krimi-Reihe: 5 Spiele in Folge mit Tordifferenz ≤ 2 (Sieg ODER Niederlage) ───
// Sobald 5 erreicht, wird die Serie zurückgesetzt → mehrfach erreichbar.
function countKrimiStreaks(id,ms){
  const ordered=[...ms].filter(m=>matchOf(id,m))
    .sort((a,b)=>mts(a)-mts(b));
  let cur=0,count=0;
  ordered.forEach(m=>{
    const diff=Math.abs(m.score_a-m.score_b);
    if(diff<=2){
      cur++;
      if(cur>=5){count++; cur=0;}
    } else {
      cur=0;
    }
  });
  return count;
}

// ─── Klares Ding: Sieg mit Tordifferenz ≥ 7 ───
function countClearWins(id,ms){
  return ms.filter(m=>matchOf(id,m)&&won(id,m)
    &&Math.abs(m.score_a-m.score_b)>=7).length;
}

// ─── Wiederholungstäter: 3 Siege in Folge mit identischem Endstand ───
// Niederlagen oder Siege mit anderem Score brechen die Serie.
function countRepeatScoreStreaks(id,ms){
  const ordered=[...ms].filter(m=>matchOf(id,m))
    .sort((a,b)=>mts(a)-mts(b));
  let lastScore=null,cur=0,count=0;
  ordered.forEach(m=>{
    if(!won(id,m)){cur=0; lastScore=null; return;}
    const score=goalsFor(id,m)+':'+goalsAgainst(id,m);
    if(score===lastScore){
      cur++;
      if(cur>=3){count++; cur=0; lastScore=null;}
    } else {
      cur=1; lastScore=score;
    }
  });
  return count;
}

// ─── Comeback-Tag: Tag mit Niederlage gestartet, mit Sieg beendet, min. 3 Matches ───
function countComebackDays(id,ms){
  const mine=ms.filter(m=>matchOf(id,m))
    .sort((a,b)=>mts(a)-mts(b));
  const byDay={};
  mine.forEach(m=>{
    const d=mdayKey(m);
    if(!byDay[d]) byDay[d]=[];
    byDay[d].push(m);
  });
  let count=0;
  Object.values(byDay).forEach(dayMs=>{
    if(dayMs.length<3) return;
    const first=dayMs[0], last=dayMs[dayMs.length-1];
    if(!won(id,first) && won(id,last)) count++;
  });
  return count;
}

// ─── Revanchist: nach Niederlage gegen Team X im direkt folgenden Match Sieg gegen X ───
// Strikt: das unmittelbar nächste Match muss gegen das gleiche Gegner-Team sein.
function countRevenge(id,ms){
  const mine=ms.filter(m=>matchOf(id,m))
    .sort((a,b)=>mts(a)-mts(b));
  const oppKey=(m)=>{
    const onA=(id===m.a1||id===m.a2);
    return (onA?[m.b1,m.b2]:[m.a1,m.a2]).slice().sort().join('|');
  };
  let count=0;
  for(let i=0;i<mine.length-1;i++){
    if(won(id,mine[i])) continue; // M_i muss Niederlage sein
    if(!won(id,mine[i+1])) continue; // M_{i+1} muss Sieg sein
    if(oppKey(mine[i])===oppKey(mine[i+1])) count++;
  }
  return count;
}

// ─── Königsklasse: Sieg gegen mind. 1 Gegner aus den Top 3 der Saison-Endrangliste ───
function countTopThreeWins(id,ms){
  const rk=getSeasonRankingsCache();
  return ms.filter(m=>{
    if(!matchOf(id,m)||!won(id,m)) return false;
    const r=rk[seasonOf(m.created_at).id];
    if(!r||!r.top3.size) return false;
    const onA=(id===m.a1||id===m.a2);
    const opps=onA?[m.b1,m.b2]:[m.a1,m.a2];
    return opps.some(oId=>r.top3.has(oId));
  }).length;
}

// ─── Pflichtaufgabe: Sieg gegen mind. 1 Gegner aus den Bottom 3 der Saison-Endrangliste ───
function countBottomThreeWins(id,ms){
  const rk=getSeasonRankingsCache();
  return ms.filter(m=>{
    if(!matchOf(id,m)||!won(id,m)) return false;
    const r=rk[seasonOf(m.created_at).id];
    if(!r||!r.bottom3.size) return false;
    const onA=(id===m.a1||id===m.a2);
    const opps=onA?[m.b1,m.b2]:[m.a1,m.a2];
    return opps.some(oId=>r.bottom3.has(oId));
  }).length;
}

// ─── Thronfäller: Sieg gegen den Top-1 der laufenden Saison-Rangliste ───
// Top-1 = der Spieler mit dem höchsten Saison-Elo zum Zeitpunkt VOR dem Match
// (aus getRankSnapshots, das den live-Stand pro Match aus den Sim-Deltas
// aufbaut). Pflicht: Top-1 darf nicht der Spieler selbst sein und muss im
// gegnerischen Team stehen. Hidden-Spieler werden NICHT ausgeschlossen,
// weil der Match selbst stattfand — die Rangliste-Logik basiert auf realem
// Elo-Stand, nicht auf Visibility.
function countKingslayer(id,ms){
  const snaps = getRankSnapshots();
  let count = 0;
  for(let i=0; i<ms.length; i++){
    const m = ms[i];
    if(!matchOf(id,m) || !won(id,m)) continue;
    const snap = snaps[m.id]; if(!snap) continue;
    // Wer war Top-1 in der Saison-Rangliste VOR dem Match?
    let top1 = null;
    for(const pid in snap.preRank){
      if(snap.preRank[pid] === 1){ top1 = pid; break; }
    }
    if(!top1 || top1 === id) continue;
    // War Top-1 ein direkter Gegner?
    const onA = (id===m.a1||id===m.a2);
    const opps = onA ? [m.b1,m.b2] : [m.a1,m.a2];
    if(opps.includes(top1)) count++;
  }
  return count;
}

// ─── Überholmanöver: Sieg gegen einen Spieler, der dadurch in der ───
// ─── Saison-Rangliste überholt wurde ─────────────────────────────────
// Pro überholtem Gegner zählt 1× (also wenn man im 2v2 beide Gegner
// überholt, zählt das als 2 Treffer für dieses Match).
// Bedingungen pro Gegner Y:
//   • X war vor Match unter Y in der Rangliste (rank_X > rank_Y)
//   • X ist nach Match über Y (rank_X < rank_Y)
//   • → +1 für X
function countOvertake(id,ms){
  const snaps = getRankSnapshots();
  let count = 0;
  for(let i=0; i<ms.length; i++){
    const m = ms[i];
    if(!matchOf(id,m) || !won(id,m)) continue;
    const snap = snaps[m.id]; if(!snap) continue;
    const preX = snap.preRank[id], postX = snap.postRank[id];
    if(!preX || !postX) continue; // X muss schon einen Rang gehabt haben
    const onA = (id===m.a1||id===m.a2);
    const opps = onA ? [m.b1,m.b2] : [m.a1,m.a2];
    for(const opId of opps){
      const preY = snap.preRank[opId], postY = snap.postRank[opId];
      if(!preY || !postY) continue;
      // X war unter Y (höherer Rangzahl = schlechter), jetzt drüber
      if(preX > preY && postX < postY) count++;
    }
  }
  return count;
}

// ─── Award-Sammler: in einer Saison min. 5 POTD UND min. 2 POTW Auszeichnungen ───
// Pro qualifizierter Saison vergeben (mehrfach über Karriere).
function countAwardCollector(id){
  const bySeason=getMatchesBySeason();
  let count=0;
  Object.values(bySeason).forEach(seasonMs=>{
    const potd=countDayWins(id,seasonMs);
    if(potd<5) return; // billiger Vorab-Filter
    const potw=countPeriodWins(id,seasonMs,'week');
    if(potw>=2) count++;
  });
  return count;
}

// ═══ LEGENDARY-BADGES v7 ════════════════════════════════════════════════════
// Saison-/Karriere-aggregierte Counter. Werden in computeBadges() pro Profil
// lazy berechnet — kein Match-Trigger, weil sie nicht an einen Einzelmatch
// gebunden sind (analog award_collector / potd / potw).
// ═══════════════════════════════════════════════════════════════════════════

// Untouchable: 3 Saisons IN FOLGE Top-3 abgeschlossen.
// "In Folge" bezieht sich auf chronologische Reihenfolge ABGESCHLOSSENER
// Saisons. Die laufende Saison wird ausgeschlossen. Sids haben das Format
// "YYYY-MM" und sind damit lexikographisch chronologisch sortierbar.
// Counter steigt um 1 pro überlappungsfreier Drei-Saisons-Strecke (also bei
// 6 Saisons in Folge in Top-3 → counter = 2). Implementation analog zu
// countStreakOccurrences (separate Serien).
function countUntouchable(id){
  const rk = getSeasonRankingsCache();
  const curId = currentSeason().id;
  const sids = Object.keys(rk).filter(s => s !== curId).sort();
  let cur = 0, count = 0;
  for(const sid of sids){
    if(rk[sid] && rk[sid].top3 && rk[sid].top3.has(id)){
      cur++;
      if(cur >= 3){ count++; cur = 0; }  // separate Drei-Strecken
    } else {
      cur = 0;
    }
  }
  return count;
}

// Mr. Perfect: 3× 10:0-Sieg in EINER Saison.
// Counter = Anzahl Saisons, in denen der Spieler ≥3 Mal 10:0 gewonnen hat.
// Auch die laufende Saison wird gezählt (zur Toast-Konsistenz mit dem
// Match-Trigger weiter unten in getBadgeEarnedCache).
function countMrPerfect(id){
  const bySeason = getMatchesBySeason();
  let count = 0;
  Object.values(bySeason).forEach(seasonMs => {
    let perfect = 0;
    for(const m of seasonMs){
      if(!matchOf(id,m) || !won(id,m)) continue;
      const gf = goalsFor(id,m), ga = goalsAgainst(id,m);
      if(gf === 10 && ga === 0) perfect++;
      if(perfect >= 3) break; // billiger Early-Exit
    }
    if(perfect >= 3) count++;
  });
  return count;
}

// Allwetter: an mind. 5 verschiedenen Wochentagen je mind. 1× POTD geworden.
// Karriere-Stat — sobald 5 erreicht, bleibt das Badge dauerhaft erreicht.
// Counter ist deshalb max. 1 (entweder erreicht oder nicht).
function countAllwetter(id){
  // POTD-Logik 1:1 aus countDayWins. Statt eines Counters: Wochentage sammeln.
  const byDay = {};
  matches.forEach(m => {
    const day = mdayKey(m);
    if(!byDay[day]) byDay[day] = { ms: [], jsDate: new Date(m.created_at) };
    byDay[day].ms.push(m);
  });
  const today = new Date().toISOString().slice(0,10);
  const weekdays = new Set();
  Object.entries(byDay).forEach(([day, info]) => {
    if(day === today) return;       // laufender Tag (noch nicht abgeschlossen)
    if(info.ms.length < 2) return;  // POTD benötigt min. 2 Spiele am Tag
    const winsById = {};
    info.ms.forEach(m => [m.a1,m.a2,m.b1,m.b2].forEach(pid => {
      if(!winsById[pid]) winsById[pid] = 0;
      const onA = (pid===m.a1||pid===m.a2);
      if((onA && m.winner==='A') || (!onA && m.winner==='B')) winsById[pid]++;
    }));
    const maxW = Math.max(...Object.values(winsById));
    if(maxW < 3) return;
    if((winsById[id]||0) === maxW){
      weekdays.add(info.jsDate.getDay()); // 0=Sonntag, 1=Montag, …, 6=Samstag
    }
  });
  return weekdays.size >= 5 ? 1 : 0;
}

// Tag der Götter: 3 aufeinanderfolgende EIGENE Spieltage als POTD gewonnen.
// "Eigene Spieltage" = Tage, an denen der Spieler beteiligt war. Tage, an
// denen die Liga ohne ihn spielte, BRECHEN die Serie NICHT — sie werden
// übersprungen. Karriere-aggregiert (separate Drei-Strecken zählen einzeln).
function countGodlyStreak(id){
  // Einmalig nach Tag gruppieren (über alle Matches, nicht nur die des Spielers).
  const byDay = {};
  matches.forEach(m => {
    const day = mdayKey(m);
    if(!byDay[day]) byDay[day] = [];
    byDay[day].push(m);
  });
  const today = new Date().toISOString().slice(0,10);
  const sortedDays = Object.keys(byDay).filter(d => d !== today).sort();
  let cur = 0, count = 0;
  for(const day of sortedDays){
    const dayMs = byDay[day];
    const involved = dayMs.some(m => [m.a1,m.a2,m.b1,m.b2].includes(id));
    if(!involved) continue;             // Tag ohne Spieler → SKIP (kein Reset)
    if(dayMs.length < 2){ cur = 0; continue; }
    const winsById = {};
    dayMs.forEach(m => [m.a1,m.a2,m.b1,m.b2].forEach(pid => {
      if(!winsById[pid]) winsById[pid] = 0;
      const onA = (pid===m.a1||pid===m.a2);
      if((onA && m.winner==='A') || (!onA && m.winner==='B')) winsById[pid]++;
    }));
    const maxW = Math.max(...Object.values(winsById));
    if(maxW < 3){ cur = 0; continue; }
    if((winsById[id]||0) === maxW){
      cur++;
      if(cur >= 3){ count++; cur = 0; } // separate Drei-Strecken zählen
    } else {
      cur = 0;
    }
  }
  return count;
}

function longestPlayerStreak(id,ms){
  const ordered=[...ms].filter(m=>matchOf(id,m)).sort((a,b)=>mts(a)-mts(b));
  let cur=0,best=0;
  ordered.forEach(m=>{if(won(id,m)){cur++;if(cur>best)best=cur;}else cur=0;});
  return best;
}
// Erweiterte Variante: liefert auch das Datum des Match, das die längste
// Siegesserie abgeschlossen hat (also den Peak-Match). Bei mehreren Serien
// mit demselben Maximum wird die NEUESTE genommen — analog zum Verhalten
// im Awards-Tab (jüngere Leistungen sind salient).
function longestPlayerStreakInfo(id,ms){
  const ordered=[...ms].filter(m=>matchOf(id,m)).sort((a,b)=>mts(a)-mts(b));
  let cur=0,best=0,peakMatch=null;
  ordered.forEach(m=>{
    if(won(id,m)){
      cur++;
      if(cur>=best){ best=cur; peakMatch=m; } // ≥ → neueste gleichlange Serie gewinnt
    } else {
      cur=0;
    }
  });
  return {best, peakDate: peakMatch ? peakMatch.created_at : null};
}
// Zählt wie oft eine Siegesserie der Länge >= n erreicht wurde (separate Serien)
function countStreakOccurrences(id,ms,n){
  const ordered=[...ms].filter(m=>matchOf(id,m)).sort((a,b)=>mts(a)-mts(b));
  let cur=0,count=0,awarded=false;
  ordered.forEach(m=>{
    if(won(id,m)){cur++;if(cur>=n&&!awarded){count++;awarded=true;}}
    else {cur=0;awarded=false;}
  });
  return count;
}
// Zählt wie oft eine Niederlagenserie >= n erreicht wurde
function countLossStreakOccurrences(id,ms,n){
  const ordered=[...ms].filter(m=>matchOf(id,m)).sort((a,b)=>mts(a)-mts(b));
  let cur=0,count=0,awarded=false;
  ordered.forEach(m=>{if(!won(id,m)){cur++;if(cur>=n&&!awarded){count++;awarded=true;}}else{cur=0;awarded=false;}});
  return count;
}
// Carry: Sieg wenn dein Mate der schwächste der 4 Spieler im Match war
// Nutzt globalen Elo-History-Cache für historische Elo-Stände
function countCarries(id,ms){
  const snapMap=getSnapMap();
  return ms.filter(m=>{
    if(!matchOf(id,m)||!won(id,m))return false;
    const snap=snapMap[m.id]; if(!snap)return false;
    const allFour=[m.a1,m.a2,m.b1,m.b2];
    if(allFour.some(x=>snap[x]===undefined))return false;
    const weakest=allFour.reduce((a,b)=>(snap[a] ?? cfg.start_elo)<=(snap[b] ?? cfg.start_elo)?a:b);
    const onA=(id===m.a1||id===m.a2);
    const mate=onA?(id===m.a1?m.a2:m.a1):(id===m.b1?m.b2:m.b1);
    return mate===weakest;
  }).length;
}
// Zählt Tage an denen der Spieler min. 3 Spiele hatte und keines verloren hat
function countUnbeatableDays(id,ms){
  const mine=ms.filter(m=>matchOf(id,m));
  const byDay={};
  mine.forEach(m=>{const d=mdayKey(m);
    if(!byDay[d])byDay[d]={games:0,losses:0}; byDay[d].games++; if(!won(id,m))byDay[d].losses++;});
  return Object.values(byDay).filter(d=>d.games>=3&&d.losses===0).length;
}
// ─── Pflichterfüller: Sieg gegen mind. 1 Gegner aus Bottom-2 der ─────
// ─── Saison-Rangliste zum Zeitpunkt des Matches ──────────────────────
// Unterschied zur bestehenden countBottomThreeWins-Funktion (Saison-END-
// Rangliste): hier wird der live-Stand der Saison-Rangliste VOR dem Match
// verwendet (getRankSnapshots → preRank). Bottom-2 = die letzten zwei Plätze.
// Erst sinnvoll ab 5 Spielern in der Rangliste — sonst überlappt Top und
// Bottom (und der Award würde trivial fallen). Hidden-Spieler werden NICHT
// ausgeschlossen, weil das Match stattfand und der Rangzeitpunkt real ist.
function countBottomTwoMatchWins(id,ms){
  const snaps = getRankSnapshots();
  let count = 0;
  for(let i=0; i<ms.length; i++){
    const m = ms[i];
    if(!matchOf(id,m) || !won(id,m)) continue;
    const snap = snaps[m.id]; if(!snap || !snap.preRank) continue;
    const ranks = snap.preRank;
    const N = Object.keys(ranks).length;
    if(N < 5) continue; // Bottom-2 ist erst ab 5 Spielern in der Rangliste sinnvoll
    const onA = (id===m.a1||id===m.a2);
    const opps = onA ? [m.b1,m.b2] : [m.a1,m.a2];
    // Mind. ein Gegner mit Rang im Bottom-2 (rank >= N-1)
    const hit = opps.some(oId => ranks[oId] && ranks[oId] >= N-1);
    if(hit) count++;
  }
  return count;
}

// ─── Serienbrecher: Sieg, der eine laufende Siegesserie (≥4) eines ───
// ─── Gegners gestoppt hat ────────────────────────────────────────────
// Nutzt getStreakSnapshots, das pro Match den live-Streak-Stand aller
// 4 Spieler liefert. Ein Sieg zählt pro Match nur EINMAL — auch wenn beide
// Gegner gerade eine 4er+ Serie laufen hatten (kommt praktisch kaum vor,
// vermeidet aber doppelte Belohnung).
function countStreakBreaker(id,ms){
  const snaps = getStreakSnapshots();
  let count = 0;
  for(let i=0; i<ms.length; i++){
    const m = ms[i];
    if(!matchOf(id,m) || !won(id,m)) continue;
    const snap = snaps[m.id]; if(!snap) continue;
    const onA = (id===m.a1||id===m.a2);
    const opps = onA ? [m.b1,m.b2] : [m.a1,m.a2];
    if(opps.some(oId => (snap[oId]||0) >= 4)) count++;
  }
  return count;
}

// ─── Schwarzer Tag: Tag mit mind. 3 Spielen, alle verloren ───────────
// Gruppiert die Matches eines Spielers nach Datum (YYYY-MM-DD) und zählt,
// an wie vielen Tagen mind. 3 Matches stattfanden, die ALLE verloren wurden.
function countBlackDays(id,ms){
  const byDay={}; // day → {g, l}
  for(let i=0; i<ms.length; i++){
    const m=ms[i];
    if(!matchOf(id,m)) continue;
    const day=mdayKey(m);
    if(!byDay[day]) byDay[day]={g:0, l:0};
    byDay[day].g++;
    if(!won(id,m)) byDay[day].l++;
  }
  let count=0;
  for(const day in byDay){
    const d=byDay[day];
    if(d.g >= 3 && d.l === d.g) count++;
  }
  return count;
}

// ─── Krimi-Versager: n knappe Niederlagen (Tordiff. ≤ 2) in Folge ────
// Spiegel zu countLossStreakOccurrences, aber gefiltert auf "knappe" Niederlagen.
// Ein Sieg ODER eine deutliche Niederlage (>2 Tore Diff) bricht die Serie.
function countCloseLossStreaks(id,ms,n){
  const ordered=[...ms].filter(m=>matchOf(id,m))
    .sort((a,b)=>mts(a)-mts(b));
  let cur=0, count=0, awarded=false;
  ordered.forEach(m=>{
    const isLoss = !won(id,m);
    const diff = Math.abs(m.score_a - m.score_b);
    if(isLoss && diff <= 2){
      cur++;
      if(cur>=n && !awarded){ count++; awarded=true; }
    } else {
      cur=0; awarded=false;
    }
  });
  return count;
}

// ─── Mr. Disaster: 3× 0:10-Niederlage in einer Saison ────────────────
// Spiegel zu countMrPerfect (3× 10:0-Sieg). Pro Saison getrennt zählen;
// sobald 3 erreicht → Saison qualifiziert, count++.
function countMrDisaster(id){
  const bySeason = getMatchesBySeason();
  let count = 0;
  Object.values(bySeason).forEach(seasonMs => {
    let disasters = 0;
    for(const m of seasonMs){
      if(!matchOf(id,m) || won(id,m)) continue;
      if(goalsFor(id,m) === 0 && goalsAgainst(id,m) === 10) disasters++;
      if(disasters >= 3) break; // billiger Early-Exit
    }
    if(disasters >= 3) count++;
  });
  return count;
}

// ─── Zusammenbruch: Tag mit Sieg gestartet, mit Niederlage beendet, ──
// ─── min. 3 Matches ──────────────────────────────────────────────────
// Spiegel zu countComebackDays. Strikt: erstes Match Sieg, letztes Niederlage,
// ≥3 Matches an dem Tag. Pro Tag max. 1 Eintrag (siehe Match-Trigger).
function countCrashDays(id,ms){
  const mine=ms.filter(m=>matchOf(id,m))
    .sort((a,b)=>mts(a)-mts(b));
  const byDay={};
  mine.forEach(m=>{
    const d=mdayKey(m);
    if(!byDay[d]) byDay[d]=[];
    byDay[d].push(m);
  });
  let count=0;
  Object.values(byDay).forEach(dayMs=>{
    if(dayMs.length<3) return;
    const first=dayMs[0], last=dayMs[dayMs.length-1];
    if(won(id,first) && !won(id,last)) count++;
  });
  return count;
}

// ─── Angstgegner: 5× in Folge gegen denselben Gegner-SPIELER verloren ─
// Jeder Gegner wird einzeln getrackt (Mate-Wechsel egal). Bei Sieg gegen
// einen Gegner → dessen Counter wird zurückgesetzt; bei Niederlage gegen
// ihn → Counter +1. Erreicht der Counter 5 → +1 zum Gesamt-Count, danach
// muss erst ein Sieg gegen diesen Gegner kommen, bevor erneut gezählt wird.
// Konsistent zum Match-Trigger: pro Match max. 1 Eintrag, selbst wenn
// beide Gegner gleichzeitig die Schwelle erreichen (selten).
function countNemesis(id,ms){
  const mine=ms.filter(m=>matchOf(id,m))
    .sort((a,b)=>mts(a)-mts(b));
  const vsStreak={};  // opponentId → aktueller Niederlagen-Streak
  const fired={};     // opponentId → schon gefeuert (wartet auf Reset durch Sieg)
  let count=0;
  mine.forEach(m=>{
    const onA=(id===m.a1||id===m.a2);
    const w=(onA && m.winner==='A')||(!onA && m.winner==='B');
    const opps=onA?[m.b1,m.b2]:[m.a1,m.a2];
    if(w){
      opps.forEach(oId=>{ vsStreak[oId]=0; fired[oId]=false; });
    } else {
      let firedThisMatch=false;
      opps.forEach(oId=>{
        vsStreak[oId]=(vsStreak[oId]||0)+1;
        if(vsStreak[oId]>=5 && !fired[oId]){
          fired[oId]=true;
          if(!firedThisMatch){ count++; firedThisMatch=true; }
        }
      });
    }
  });
  return count;
}

function getCachedBadges(id){
  const key='badges_'+id+'_'+matches.length+'_'+_cache.version;
  if(!_cache._badges) _cache._badges={};
  if(_cache._badges[key]) return _cache._badges[key];
  const r=computeBadges(id);
  _cache._badges[key]=r;
  return r;
}

// Berechnet alle freigeschalteten Badges für einen Spieler (mit Anzahl für multi-Badges)
function computeBadges(id){
  const result=[];
  BADGES.forEach(b=>{
    const c=b.count(id,matches);
    if(c>0) result.push({id:b.id,em:b.em,ic:b.ic,name:b.name,desc:b.desc,count:c});
  });
  return result;
}

// Ermittelt welche Badges durch ein bestimmtes Match NEU freigeschaltet / erneut erreicht wurden
function getBadgeEarnedCache(){
  const key='badgeEarned_'+matches.length+'_'+_cache.version;
  if(_cache._badgeEarnedKey===key) return _cache._badgeEarnedMap;

  const map={};
  const ordered=[...matches].sort((a,b)=>mts(a)-mts(b));

  // Globale Sim für Carry (historische Elo-Stände vor jedem Match) — gecached
  const snapMap=getSnapMap();
  // History-Map für eloAfter-Lookup (Saison-Peak-Tracking pro Match)
  const histById=getHistoryByMatchId();
  // Rangliste-Snapshots pro Match (für Thronfäller + Überholmanöver + Pflichterfüller)
  const rankSnaps=getRankSnapshots();
  // Siegesserien-Snapshots pro Match (für Serienbrecher — Streak des Gegners VOR dem Match)
  const streakSnaps=getStreakSnapshots();
  // Tages-Tracker (global, nicht per-player): welcher Tag hatte schon sein erstes Match?
  const firstOfDaySeen={};

  // Inkrementeller State pro Spieler
  const st={};
  players.forEach(p=>{
    st[p.id]={
      games:0, wins:0,
      atkG:0, atkW:0,
      defG:0, defW:0,
      curStreak:0, curLoss:0,
      // Streak-Awards: werden zurückgesetzt wenn Serie bricht
      sa5:false, sa10:false, sa15:false, sa20:false,
      // Loss-Streak-Award: wird zurückgesetzt wenn Sieg kommt
      la5:false,
      // Tages-Tracker für Unbeatable
      days:{}, // "YYYY-MM-DD" → { g, l }
      // ── Neue Badges ──
      // Saison-Peak-Elo (überlebt Saison-Reset, einmalige Schwellen-Badges)
      peakElo: cfg.start_elo,
      climbed: false, dominated: false, dynastic: false,
      // 10:9-Serien-Counter (resettet bei Nicht-10:9 oder Niederlage)
      nailStreak: 0,
      // Krimi-Reihe: aufeinanderfolgende Spiele mit Tordifferenz ≤ 2
      krimiCur: 0,
      // ── NEUE NEGATIV-BADGES v6 ──
      // Krimi-Versager: aufeinanderfolgende knappe Niederlagen (Diff ≤ 2)
      krimiLossCur: 0, krimiLossFired: false,
      // Schwarzer Tag: pro Tag merken, ob schon gefeuert wurde
      blackDayFired: {},   // "YYYY-MM-DD" → true (schon gefeuert für diesen Tag)
      // ── NEUE LEGENDARY-BADGES v7 ──
      // Mr. Perfect: pro Saison 10:0-Siege zählen + bei ≥3 einmalig feuern
      mrPerfectPerSeason: {}, // sid → Anzahl 10:0-Siege in dieser Saison
      mrPerfectFired: {},     // sid → true (schon gefeuert)
      // ── NEUE NEGATIV-BADGES v8 ──
      // Mr. Disaster: pro Saison 0:10-Niederlagen zählen + bei ≥3 einmalig feuern
      // (Spiegel zu mrPerfect — Saison-Reset implizit durch sid-Wechsel)
      mrDisasterPerSeason: {},
      mrDisasterFired: {},
      // Zusammenbruch: pro Tag merken, ob schon gefeuert wurde
      crashFired: {},         // "YYYY-MM-DD" → true
      // Angstgegner: pro Gegner-Spieler aktueller Niederlagen-Streak + Fired-Flag
      // Reset des Counters bei Sieg gegen denselben Gegner; Fired-Flag wird
      // ebenfalls zurückgesetzt, sobald wieder ein Sieg gegen X gelingt.
      nemesisVs: {},          // oppId → Streak
      nemesisFired: {},       // oppId → schon gefeuert (wartet auf Reset)
      // Wiederholungstäter: letzter Sieg-Score und aktueller Counter
      lastWinScore: null, wtCur: 0,
      // Comeback-Tag: erstes Match-Ergebnis pro Tag + Trigger-Flag
      firstResOfDay: {},   // "YYYY-MM-DD" → 'W' | 'L'
      comebackFired: {},   // "YYYY-MM-DD" → true (schon gefeuert)
      // ⚠ Unbeatable-Tracking: Match-ID pro Tag, an dem unbeatable gefeuert wurde
      // — wird bei einer Niederlage am selben Tag rückwirkend gelöscht (Bug-Fix).
      unbeatableMatchIdByDay: {},
      // Revanchist: letztes verlorenes Gegner-Team (sortierter String "p1|p2")
      lastLossOpp: null,
    };
  });

  ordered.forEach(m=>{
    const earned=[];
    const ids=[m.a1,m.a2,m.b1,m.b2];
    const day=mdayKey(m);
    // Ist dies das erste Match dieses Tages? (Global, eine Frage pro Match)
    const isFirstOfDay = !firstOfDaySeen[day];
    if(isFirstOfDay) firstOfDaySeen[day]=true;
    // Saison-Peak-Tracking nutzt die Sim-History (Elo-Stand nach diesem Match)
    const hist=histById.get(m.id);
    const eloAfter=(hist&&hist.eloAfter)||{};

    ids.forEach(id=>{
      if(!st[id]) return;
      const s=st[id];
      const onA=(id===m.a1||id===m.a2);
      const w=(onA&&m.winner==='A')||(!onA&&m.winner==='B');
      const gf=onA?m.score_a:m.score_b;
      const ga=onA?m.score_b:m.score_a;
      const pos=id===m.a1?m.a1_pos:id===m.a2?m.a2_pos:id===m.b1?m.b1_pos:m.b2_pos;
      const myExp=onA?(m.exp_a||0.5):(1-(m.exp_a||0.5));

      // Werte VOR diesem Match sichern (für Schwellen-Checks)
      const pg=s.games, pAtkW=s.atkW, pDefW=s.defW, pAtkG=s.atkG, pDefG=s.defG;
      const prevAllrounder=pAtkW>=20&&pDefW>=20;

      // ── State updaten ──
      s.games++;
      if(w) s.wins++;
      if(pos==='atk'){s.atkG++;if(w)s.atkW++;}
      else            {s.defG++;if(w)s.defW++;}

      if(w){
        s.curStreak=s.curStreak>0?s.curStreak+1:1;
        s.curLoss=0;
        s.la5=false;
      } else {
        s.curLoss=s.curLoss>0?s.curLoss+1:1;
        s.curStreak=0;
        s.sa5=false; s.sa10=false; s.sa15=false; s.sa20=false;
      }

      if(!s.days[day]) s.days[day]={g:0,l:0};
      s.days[day].g++;
      if(!w){
        s.days[day].l++;
        // ⚠ Bug-Fix: wenn heute schon unbeatable gefeuert wurde (3 saubere Siege),
        // ist es durch diese Niederlage hinfällig — Eintrag aus dem map des
        // ursprünglichen Match-Buckets entfernen, damit das Match-Review es
        // nicht mehr anzeigt. Toast war bereits geflogen (irreversibel), aber
        // visuell verschwindet das Badge konsistent.
        const ubMid = s.unbeatableMatchIdByDay[day];
        if(ubMid){
          const arr = map[ubMid];
          if(arr){
            const idx = arr.findIndex(e => e.playerId === id && e.badge.id === 'unbeatable');
            if(idx >= 0) arr.splice(idx, 1);
          }
          s.unbeatableMatchIdByDay[day] = null;
        }
      }

      // ── Helper ──
      const fire=(bid, meta)=>{
        const b=BADGES.find(x=>x.id===bid);
        if(b) earned.push(meta ? {playerId:id,badge:b,meta} : {playerId:id,badge:b});
      };

      // ── Einfache Schwellen-Badges ──
      if(pg===0)                                    fire('first_match');
      if(pg<25   && s.games>=25)                    fire('games25');
      if(pg<150  && s.games>=150)                   fire('games150');
      if(!prevAllrounder && s.atkW>=20 && s.defW>=20) fire('allrounder');
      if(pDefG<50 && s.defG>=50)                    fire('def50');
      if(pAtkG<50 && s.atkG>=50)                    fire('atk50');

      // ── Match-Ergebnis-Badges ──
      if(w  && gf===10 && ga===0)                   fire('perfect_win');
      if(!w && gf===0  && ga===10)                  fire('perfect_loss');
      if(w  && gf===10 && ga===9)                   fire('nail_biter');
      if(!w && gf===9  && ga===10)                  fire('bitter_loss');
      if(w  && pos==='def' && ga<=2)                fire('wall_badge');
      if(w  && myExp<0.35)                          fire('upset_king');

      // ── Mr. Perfect: 3× 10:0-Sieg in DERSELBEN Saison ──
      // Saison-IDs per seasonOf() bestimmen (sid-Format YYYY-MM). Counter pro
      // Saison; einmal gefeuert wird kein weiterer Toast für die selbe Saison
      // ausgelöst — aber der count() sieht alle qualifizierten Saisons.
      if(w && gf===10 && ga===0){
        const sid = seasonOf(m.created_at).id;
        s.mrPerfectPerSeason[sid] = (s.mrPerfectPerSeason[sid]||0) + 1;
        if(s.mrPerfectPerSeason[sid] >= 3 && !s.mrPerfectFired[sid]){
          s.mrPerfectFired[sid] = true;
          fire('mr_perfect');
        }
      }

      // ── Mr. Disaster: 3× 0:10-Niederlage in DERSELBEN Saison ──
      // Spiegel zu mr_perfect. Counter ist saison-lokal (sid-Format YYYY-MM)
      // → automatischer Reset bei Saisonwechsel ohne expliziten Reset-Pfad.
      if(!w && gf===0 && ga===10){
        const sid = seasonOf(m.created_at).id;
        s.mrDisasterPerSeason[sid] = (s.mrDisasterPerSeason[sid]||0) + 1;
        if(s.mrDisasterPerSeason[sid] >= 3 && !s.mrDisasterFired[sid]){
          s.mrDisasterFired[sid] = true;
          fire('mr_disaster');
        }
      }

      // ── Streak-Badges (nur wenn Schwelle NEU in dieser Serie) ──
      if(w && s.curStreak>=5  && !s.sa5)  { s.sa5=true;  fire('streak5');  }
      if(w && s.curStreak>=10 && !s.sa10) { s.sa10=true; fire('streak10'); }
      if(w && s.curStreak>=15 && !s.sa15) { s.sa15=true; fire('streak15'); }
      if(w && s.curStreak>=20 && !s.sa20) { s.sa20=true; fire('streak20'); }

      // ── Loss-Streak-Badge ──
      if(!w && s.curLoss>=5 && !s.la5)   { s.la5=true;  fire('losing5');  }

      // ── Carry ──
      const snap=snapMap[m.id];
      if(w && snap){
        const allFour=[m.a1,m.a2,m.b1,m.b2];
        if(allFour.every(x=>snap[x]!==undefined)){
          const weakest=allFour.reduce((a,b)=>
            (snap[a]??cfg.start_elo)<=(snap[b]??cfg.start_elo)?a:b);
          const mate=onA?(id===m.a1?m.a2:m.a1):(id===m.b1?m.b2:m.b1);
          if(mate===weakest) fire('carry');
        }
      }

      // ── Unbeatable Day ──
      // Feuert genau wenn der 3. saubere Sieg an einem Tag erreicht wird.
      // Match-ID wird gemerkt — bei späterer Niederlage am selben Tag
      // wird das Badge oben revoked (siehe Day-Tracking).
      const d=s.days[day];
      if(d.g===3 && d.l===0){
        fire('unbeatable');
        s.unbeatableMatchIdByDay[day] = m.id;
      }

      // ── Frühschicht: Sieg im chronologisch ersten Match des Tages ──
      // isFirstOfDay ist für ALLE 4 Spieler dieses Matches identisch true,
      // garantiert max. 1 Trigger pro Spieler+Tag (mehr als 1 erstes Match gibt's nicht).
      if(isFirstOfDay && w) fire('early_bird');

      // ── Nerven aus Stahl: 3 Zittersiege in Folge — nur knappe Partien zählen ──
      // Nicht-knappe Partien (klare Siege/Niederlagen) sind irrelevant und ändern die
      // Serie nicht. Nur eine knappe Niederlage (9:10) bricht die Serie.
      // Bei Erreichen wird der Counter zurückgesetzt → mehrfach erreichbar.
      const isClose=(gf===10&&ga===9)||(gf===9&&ga===10);
      if(isClose){
        if(w){
          s.nailStreak++;
          if(s.nailStreak>=3){ fire('nerves_of_steel'); s.nailStreak=0; }
        } else {
          s.nailStreak=0;
        }
      }
      // sonst: nicht-knappe Partie → nailStreak bleibt unverändert

      // ── Saison-Peak-Schwellen (einmalige Unlocks) ──
      // Nutzt den Elo-Stand nach diesem Match aus der zentralen Sim-History.
      // Über Saison-Resets hinweg gilt der höchste je erreichte Wert — wir tracken
      // hier den lokalen Spieler-Peak in s.peakElo und feuern bei Schwellen-Überschreitung.
      const myEloAfter=eloAfter[id];
      if(myEloAfter!==undefined && myEloAfter>s.peakElo){
        s.peakElo=myEloAfter;
        // Schwellen relativ zum Liga-Start-Elo (siehe Badge-Definitionen)
        const peakGain=s.peakElo-cfg.start_elo;
        if(!s.climbed   && peakGain>=100){ s.climbed=true;   fire('climber_100');   }
        if(!s.dominated && peakGain>=400){ s.dominated=true; fire('dominator_400'); }
        if(!s.dynastic  && peakGain>=600){ s.dynastic=true;  fire('dynasty_600');   }
      }

      // ── Klares Ding: Sieg mit Tordifferenz ≥ 7 ──
      const goalDiff=Math.abs(gf-ga);
      if(w && goalDiff>=7) fire('clear_win');

      // ── Krimi-Reihe: 5 Spiele in Folge mit Tordifferenz ≤ 2 ──
      // Egal ob Sieg oder Niederlage; sobald 5 erreicht → Counter-Reset.
      if(goalDiff<=2){
        s.krimiCur++;
        if(s.krimiCur>=5){ fire('krimi'); s.krimiCur=0; }
      } else {
        s.krimiCur=0;
      }

      // ── NEUE NEGATIV-BADGES v6 ──
      // ── Krimi-Versager: 3 knappe Niederlagen (Diff ≤ 2) in Folge ──
      // Sieg ODER deutliche Niederlage (Diff > 2) bricht die Serie. Feuert beim
      // Erreichen der 3, dann erst wieder nach Reset (krimiLossFired-Flag).
      if(!w && goalDiff<=2){
        s.krimiLossCur++;
        if(s.krimiLossCur>=3 && !s.krimiLossFired){
          fire('krimi_loser');
          s.krimiLossFired=true;
        }
      } else {
        s.krimiLossCur=0;
        s.krimiLossFired=false;
      }

      // ── Schwarzer Tag: Tag mit mind. 3 Spielen, alle verloren ──
      // s.days[day] wurde bereits oben aktualisiert (g/l). Wir prüfen nach dem
      // Update: g>=3 und l===g → alle verloren. Pro Tag nur EIN Toast — über
      // blackDayFired-Tag-Set. Trigger nur bei Niederlage (sonst kann's eh nicht
      // sein) — und feuert beim Übergang von 2 auf 3 Niederlagen (oder höher,
      // falls vorher schon entgangen).
      if(!w && s.days[day] && s.days[day].g >= 3 && s.days[day].l === s.days[day].g
         && !s.blackDayFired[day]){
        fire('black_day');
        s.blackDayFired[day] = true;
      }

      // ── Wiederholungstäter: 3 Siege in Folge mit identischem Endstand ──
      // Niederlagen oder Siege mit anderem Score brechen die Serie.
      if(w){
        const score=gf+':'+ga;
        if(score===s.lastWinScore){
          s.wtCur++;
          if(s.wtCur>=3){ fire('repeat_score'); s.wtCur=0; s.lastWinScore=null; }
        } else {
          s.wtCur=1; s.lastWinScore=score;
        }
      } else {
        s.wtCur=0; s.lastWinScore=null;
      }

      // ── Comeback-Tag: Tag mit Niederlage gestartet, mit Sieg beendet, min. 3 Matches ──
      // Erstes Match des Tages für diesen Spieler? → Ergebnis als Tag-Start merken.
      if(s.days[day].g===1){
        s.firstResOfDay[day] = w ? 'W' : 'L';
      }
      // Aktueller Sieg + Tag startete mit Niederlage + min. 3 Matches + noch nicht gefeuert
      if(w && s.days[day].g>=3 && s.firstResOfDay[day]==='L' && !s.comebackFired[day]){
        s.comebackFired[day]=true;
        fire('comeback_day');
      }

      // ── Zusammenbruch: Tag mit Sieg gestartet, mit Niederlage beendet, min. 3 Matches ──
      // Spiegel zu comeback_day. firstResOfDay wird oben bereits gesetzt (erstes
      // Match-Ergebnis pro Tag). Triggert beim Übergang ≥3 Matches, wenn der
      // aktuelle (letzte) Trigger eine Niederlage ist.
      if(!w && s.days[day].g>=3 && s.firstResOfDay[day]==='W' && !s.crashFired[day]){
        s.crashFired[day]=true;
        fire('crash_day');
      }

      // ── Angstgegner: 5× in Folge gegen denselben Gegner-SPIELER verloren ──
      // Pro Gegner-Spieler aus diesem Match: bei Niederlage Counter +1, bei
      // Sieg Reset. Max. 1 fire pro Match (analog streak_breaker), auch wenn
      // beide Gegner gleichzeitig die Schwelle erreichen sollten.
      const oppPair = onA?[m.b1,m.b2]:[m.a1,m.a2];
      if(w){
        oppPair.forEach(oId=>{ s.nemesisVs[oId]=0; s.nemesisFired[oId]=false; });
      } else {
        let nemFired=false;
        oppPair.forEach(oId=>{
          s.nemesisVs[oId] = (s.nemesisVs[oId]||0) + 1;
          if(s.nemesisVs[oId]>=5 && !s.nemesisFired[oId]){
            s.nemesisFired[oId]=true;
            // oId = der Gegner-Spieler, gegen den zum 5. Mal in Folge verloren
            // wurde → als Meta mitgeben, damit die News den Angstgegner benennt.
            if(!nemFired){ fire('nemesis', {oppId: oId}); nemFired=true; }
          }
        });
      }

      // ── Revanchist: Sieg gegen das Team, gegen das man im direkt vorigen Match verloren hat ──
      // Strikt: das unmittelbar nächste Match nach einer Niederlage muss gegen X sein.
      const currentOpp=(onA?[m.b1,m.b2]:[m.a1,m.a2]).slice().sort().join('|');
      if(s.lastLossOpp){
        if(currentOpp===s.lastLossOpp && w){
          fire('revanchist');
        }
        // Egal ob Revanche gelang oder nicht: Counter resetten (nicht mehr "direkt nächstes Match")
        s.lastLossOpp=null;
      }
      // Wenn aktuelles Match Niederlage: setze lastLossOpp für nächstes Match
      if(!w) s.lastLossOpp=currentOpp;

      // ── Königsklasse / Pflichtaufgabe: Sieg gegen Top-3 / Bottom-3 der Saison-Endrangliste ──
      // Cache ist nach erstem Aufruf für alle weiteren Matches verfügbar.
      if(w){
        const rk=getSeasonRankingsCache();
        const r=rk[seasonOf(m.created_at).id];
        if(r){
          const opps=onA?[m.b1,m.b2]:[m.a1,m.a2];
          if(r.top3.size && opps.some(oId=>r.top3.has(oId))) fire('koenigsklasse');
          if(r.bottom3.size && opps.some(oId=>r.bottom3.has(oId))) fire('pflichtaufgabe');
        }
      }

      // ── Thronfäller: Sieg gegen den Top-1 der Saison-Rangliste (Stand vor Match) ──
      // ── Überholmanöver: Sieg gegen Gegner, der dadurch in der Rangliste überholt wurde ──
      // ── Pflichterfüller: Sieg gegen mind. einen Bottom-2-Gegner (preRank-Stand vor Match) ──
      // Alle drei nutzen rankSnaps (preRank/postRank pro Match aus globalSim-Deltas).
      // Match-Trigger feuert je Badge maximal 1× pro Spieler pro Match — auch wenn
      // 2 Gegner überholt werden, gibts nur 1 Toast/Eintrag im Match-Review.
      // Der Counter (countOvertake) zählt die tatsächlichen 2 Überholungen für
      // das Profil-Aggregat — die beiden Pfade sind absichtlich getrennt.
      if(w){
        const rs=rankSnaps[m.id];
        if(rs && rs.preRank && rs.postRank){
          const opps=onA?[m.b1,m.b2]:[m.a1,m.a2];
          // Thronfäller: Wer war Top-1 in der Saison vor dem Match?
          let top1=null;
          for(const pid in rs.preRank){
            if(rs.preRank[pid]===1){ top1=pid; break; }
          }
          if(top1 && top1!==id && opps.includes(top1)) fire('kingslayer');
          // Überholmanöver: Hat X mindestens einen Gegner überholt?
          const preX=rs.preRank[id], postX=rs.postRank[id];
          if(preX && postX){
            const overtook=opps.some(oId=>{
              const preY=rs.preRank[oId], postY=rs.postRank[oId];
              return preY && postY && preX>preY && postX<postY;
            });
            if(overtook) fire('overtake');
          }
          // Pflichterfüller: Bottom-2-Gegner (rank >= N-1), ab 5 Spielern in der Saison
          const N = Object.keys(rs.preRank).length;
          if(N >= 5){
            const hit = opps.some(oId => rs.preRank[oId] && rs.preRank[oId] >= N-1);
            if(hit) fire('duty_done');
          }
        }
      }

      // ── Serienbrecher: Sieg, der eine Siegesserie (≥4) eines Gegners beendet hat ──
      // Nutzt den globalen streakSnaps-Cache (Stand der Streaks VOR dem Match) —
      // damit ist die Logik konsistent mit countStreakBreaker im Profil und unabhängig
      // davon, in welcher Reihenfolge die 4 Spieler im inneren Loop verarbeitet werden.
      if(w){
        const ss=streakSnaps[m.id];
        if(ss){
          const opps=onA?[m.b1,m.b2]:[m.a1,m.a2];
          if(opps.some(oId=>(ss[oId]||0)>=4)) fire('streak_breaker');
        }
      }

      // potw / potd / award_collector: erfordern Vergleich aller Spieler am Periodenende →
      // zu komplex für inkrementell, werden in computeBadges() lazy berechnet
      // vice_champion: Saison-End-Event, nicht an ein einzelnes Match gebunden →
      // wird ebenfalls in computeBadges() aus dem seasons-Archiv ermittelt
      // untouchable / allwetter / godly_streak: Saison-/Karriere-aggregiert →
      // ebenfalls nur via count-Funktion (kein Live-Trigger, kein Toast).
    });

    map[m.id]=earned;
  });

  _cache._badgeEarnedKey=key;
  _cache._badgeEarnedMap=map;
  return map;
}

function badgesEarnedInMatch(matchId){
  return getBadgeEarnedCache()[matchId]||[];
}

// Ermittelt alle Awards, die ein Spieler aktuell hält (Platz 1–3)
function playerAwards(id){
  // Cache pro Spieler — wird beim Profil-Öffnen UND von showPlayerAwards aufgerufen.
  // Key bindet an matches.length + cache.version → invalidiert automatisch bei
  // neuem Match oder Sim-Reset.
  const _pawKey = 'paw_'+id+'_'+matches.length+'_'+_cache.version;
  if(!_cache._playerAwards) _cache._playerAwards = {};
  if(_cache._playerAwards[_pawKey]) return _cache._playerAwards[_pawKey];
  const R=awardRankings('all');
  const found=[];

  // Hilfsfunktion: Rang eines Spielers in einem Array berechnen
  // berücksichtigt geteilte Plätze
  const getRank=(arr,valFn,checkFn)=>{
    if(!arr||!arr.length) return -1;
    const topVal=valFn(arr[0]);
    let rank=1;
    for(let i=0;i<Math.min(arr.length,10);i++){
      const val=valFn(arr[i]);
      if(i>0 && val!==valFn(arr[i-1])) rank=i+1;
      if(rank>3) break;
      if(checkFn(arr[i])) return rank-1; // 0-basiert für Kompatibilität
    }
    return -1;
  };

  // Einzel-Awards
  const singleKeys={
    wins:R.winsList, streaks:R.streaks, scorer:R.scorer, wall:R.wall,
    perfect:R.perfect, grinder:R.grinder, worstWr:R.worstWr,
    worstAtk:R.worstAtk, worstDef:R.worstDef,
    clutch:R.clutchList, carryKing:R.carryList,
    onFire:R.onFire, coldStreak:R.coldStreak, lossStreaks:R.lossStreaks,
    solo:R.soloList, formtief:R.formtief, showmaster:R.showmasterList,
    ice:R.iceList, peakElo:R.peakEloList,
    weekKing:R.weekKingList, dayKing:R.dayKingList,
    // ── NEUE AWARDS v3 ──
    plusMinus:R.plusMinusList, underdog:R.underdogList, pechvogel:R.pechvogelList,
    // ── NEUE NEGATIV-AWARDS v6 ──
    favoriteLoser:R.favoriteLoserList
  };
  const singleValFns={
    wins:x=>x.v, streaks:x=>x.v, scorer:x=>Math.round(x.avg*10),
    wall:x=>-Math.round(x.v/x.g*10), // weniger = besser → negieren
    perfect:x=>Math.round(x.wr*100), grinder:x=>x.v,
    worstWr:x=>-Math.round(x.wr*100), // weniger = "besser" für Schandtafel → negieren
    worstAtk:x=>-Math.round(x.v/x.g*10),
    worstDef:x=>Math.round(x.v/x.g*10),
    clutch:x=>Math.round(x.wr*100),
    carryKing:x=>x.v, onFire:x=>x.v, coldStreak:x=>x.v,
    lossStreaks:x=>x.v, solo:x=>Math.round(x.wr*100),
    formtief:x=>Math.round(x.drop), showmaster:x=>x.v, ice:x=>x.v,
    peakElo:x=>x.v,
    weekKing:x=>x.v, dayKing:x=>x.v,
    // ── NEUE AWARDS v3 ──
    plusMinus:x=>Math.round(x.v*10), // höchster Tor-Saldo gewinnt
    underdog:x=>x.v,                  // meiste Underdog-Siege gewinnt
    pechvogel:x=>Math.round(x.pct*1000),  // höchstes Pct an knappen Niederlagen = Top-1
    // ── NEUE NEGATIV-AWARDS v6 ──
    favoriteLoser:x=>Math.round(x.v*1000) // rate-basiert (v = Quote)
  };

  // Display-Werte für die Trophäen-Anzeige im Spieler-Awards-Sheet.
  // Format ist konsistent mit den Card-Aufrufen in vAwards (Awards-Tab).
  const singleDisplayFns={
    wins:x=>x.v, streaks:x=>x.v+'er', scorer:x=>x.avg.toFixed(1),
    wall:x=>(x.v/x.g).toFixed(1), perfect:x=>Math.round(x.wr*100)+'%', grinder:x=>x.v,
    worstWr:x=>Math.round(x.wr*100)+'%',
    worstAtk:x=>(x.v/x.g).toFixed(1), worstDef:x=>(x.v/x.g).toFixed(1),
    clutch:x=>Math.round(x.wr*100)+'%',
    carryKing:x=>x.v, onFire:x=>x.v+'er', coldStreak:x=>x.v+'er',
    lossStreaks:x=>x.v+'er', solo:x=>Math.round(x.wr*100)+'%',
    formtief:x=>'-'+Math.round(x.drop), showmaster:x=>x.v, ice:x=>x.v,
    peakElo:x=>x.v, weekKing:x=>x.v, dayKing:x=>x.v,
    plusMinus:x=>(x.v>=0?'+':'')+x.v.toFixed(1), underdog:x=>x.v,
    pechvogel:x=>Math.round(x.pct*100)+'%',
    // ── NEUE NEGATIV-AWARDS v6 ──
    favoriteLoser:x=>Math.round(x.v*100)+'%'
  };

  Object.entries(singleKeys).forEach(([key,arr])=>{
    if(!arr||!arr.length) return;
    const valFn=singleValFns[key]||(x=>x.v);
    const rank=getRank(arr,valFn,x=>x.id===id);
    if(rank>=0 && rank<=2){
      const entry=arr.find(x=>x.id===id);
      const dispFn=singleDisplayFns[key]||(x=>x.v);
      found.push({key,rank,val:entry?String(dispFn(entry)):''});
    }
  });

  // Team-Awards (2 Spieler)
  const teamKeys={
    mvt:R.mvt, bestDuo:R.bestDuo, worstTeam:R.worstTeam,
    endgegner:R.endgegner,
    zirkus:R.zirkusList, baustelle:R.baustelleList,
    // ── NEUE TEAM-AWARDS v4 ──
    unstoppable:R.unstoppableList, concreteWall:R.concreteWallList,
    luckyCharm:R.luckyCharmList, giantSlayer:R.giantSlayerList,
    favoritenschreck:R.favoritenschreckList,
    // ── NEUE NEGATIV-AWARDS v6 ──
    cheesePlatter:R.cheesePlatterList
  };
  const teamValFns={
    mvt:x=>Math.round(x.v), bestDuo:x=>x.g,
    worstTeam:x=>-Math.round(x.w/x.g*100),
    endgegner:x=>Math.round(x.pct*1000),       // rate-basiert
    zirkus:x=>Math.round(x.pct*1000),          // rate-basiert
    baustelle:x=>x.best,
    // ── NEUE TEAM-AWARDS v4 ──
    unstoppable:x=>x.v,
    concreteWall:x=>-Math.round(x.v*100),      // niedriger = besser → negieren
    luckyCharm:x=>Math.round(x.v*1000),        // rate-basiert (v = Quote)
    giantSlayer:x=>Math.round(x.v*1000),       // rate-basiert (v = Quote)
    favoritenschreck:x=>x.v,
    // ── NEUE NEGATIV-AWARDS v6 ──
    cheesePlatter:x=>Math.round(x.v*100)       // höher = schlechter, direkt sortieren
  };
  const teamDisplayFns={
    mvt:x=>(x.v>=0?'+':'')+Math.round(x.v), bestDuo:x=>x.g+' Sp.',
    worstTeam:x=>Math.round(x.w/x.g*100)+'%',
    endgegner:x=>Math.round(x.pct*100)+'%',
    zirkus:x=>Math.round(x.pct*100)+'%',
    baustelle:x=>x.best+'er',
    // ── NEUE TEAM-AWARDS v4 ──
    unstoppable:x=>x.v+'er',
    concreteWall:x=>x.v.toFixed(2),
    luckyCharm:x=>Math.round(x.v*100)+'%',
    giantSlayer:x=>Math.round(x.v*100)+'%',
    favoritenschreck:x=>x.v+' Elo',
    // ── NEUE NEGATIV-AWARDS v6 ──
    cheesePlatter:x=>x.v.toFixed(2)
  };
  Object.entries(teamKeys).forEach(([key,arr])=>{
    if(!arr||!arr.length) return;
    const valFn=teamValFns[key]||(x=>x.v);
    const rank=getRank(arr,valFn,x=>x.ids&&x.ids.includes(id));
    if(rank>=0 && rank<=2){
      const entry=arr.find(x=>x.ids&&x.ids.includes(id));
      const partner=entry?entry.ids.find(x=>x!==id):null;
      const dispFn=teamDisplayFns[key]||(x=>x.v);
      found.push({key,rank,partner,val:entry?String(dispFn(entry)):''});
    }
  });

  // Rivalry-Award (4 Spieler) — alle 4 erhalten den Award.
  // Partner-Anzeige: das jeweils andere Team ("vs X & Y")
  if(R.rivalryList && R.rivalryList.length){
    const rArr = R.rivalryList;
    const valFn = x => Math.round(x.pct*1000); // rate-basiert
    const rank = getRank(rArr, valFn, x => [...x.idsA, ...x.idsB].includes(id));
    if(rank>=0 && rank<=2){
      const entry = rArr.find(x => [...x.idsA, ...x.idsB].includes(id));
      if(entry){
        const onA = entry.idsA.includes(id);
        const opponentIds = onA ? entry.idsB : entry.idsA;
        const partnerLabel = pname(opponentIds[0])+' & '+pname(opponentIds[1]);
        // partner=null signalisiert dem Renderer "Spezial-Label statt Avatar-Plaque"
        found.push({key:'rivalry', rank, partner:null, partnerLabel:'vs '+partnerLabel, val:Math.round(entry.pct*100)+'%'});
      }
    }
  }

  // Match-Awards
  // ⚠ BUG-FIX: Match-Awards (upset/biggest) gelten NUR für das Gewinner-Team.
  // Vorher hat .includes(id) ALLE 4 Spieler des Matches erkannt — auch die
  // Verlierer haben "Größte Überraschung" als positiven Award bekommen.
  // Konsistent mit vAwards()/_addColl und showAward(), die jeweils die
  // Avatare des Gewinner-Teams (m.winner) zeigen.
  const matchKeys={upset:R.upsets, biggest:R.biggest};
  const matchValFns={upset:x=>Math.round(x.sp*100), biggest:x=>x.diff};
  const matchDisplayFns={upset:x=>Math.round(x.sp*100)+'%', biggest:x=>x.diff+' Tore'};
  const winnerIds = x => x.m.winner === 'A' ? [x.m.a1, x.m.a2] : [x.m.b1, x.m.b2];
  Object.entries(matchKeys).forEach(([key,arr])=>{
    if(!arr||!arr.length) return;
    const valFn=matchValFns[key];
    const rank=getRank(arr,valFn,x=>winnerIds(x).includes(id));
    if(rank>=0 && rank<=2){
      const entry=arr.find(x=>winnerIds(x).includes(id));
      const dispFn=matchDisplayFns[key];
      found.push({key,rank,val:entry?String(dispFn(entry)):''});
    }
  });

  _cache._playerAwards[_pawKey] = found;
  return found;
}

function showPlayer(id){
  const p=pmap()[id];if(!p)return;
  _sheetSetReopen(()=>showPlayer(id));
  const allStats = allPlayerStats(); // Hole den globalen Cache einmal
  const s = allStats[id] || playerStats(id); // Nutze Cache, Fallback für versteckte Spieler
  const {best,worst}=bestWorstMate(id, s); // Übergebe 's'
  const {nemesis:nem,favorite:fav}=nemesis(id, s); // Übergebe 's'
  const wr=Math.round(s.wr*100);
  const atkWr=s.atkWr!==null?Math.round(s.atkWr*100):null;
  const defWr=s.defWr!==null?Math.round(s.defWr*100):null;
  // Saison-Platzierung: nur Spieler mit Spielen IN DIESER SAISON werden gerankt.
  // Wer 0 Saison-Spiele hat, bekommt keinen #-Badge.
  // Sortierung: Saison-Elo (gSim.elo enthält nach Saison-Reset die aktuelle Saison-Elo).
  const gSim=getGlobalSim();
  const rankedSeason=activePlayers()
    .filter(x=>(gSim.playedSeason[x.id]||0)>0)
    .sort((a,b)=>(gSim.elo[b.id]??cfg.start_elo)-(gSim.elo[a.id]??cfg.start_elo));
  const rank=rankedSeason.findIndex(x=>x.id===id)+1;
  const streak=s.curStreak;
  const autoAtk=atkStrength(id);
  const atkPct=Math.round(autoAtk*100);
  const defPct=100-atkPct;
  const _streakInfo=longestPlayerStreakInfo(id,matches);
  const longestStr=_streakInfo.best;
  // Peak-Datum als kompakter "Monat Jahr"-String (dezent), z.B. "Mai 2026"
  const longestPeakLabel = _streakInfo.peakDate
    ? new Date(_streakInfo.peakDate).toLocaleDateString('de-DE',{month:'long',year:'numeric'})
    : '';
  // Letzte 15 Spiele (chronologisch alt→neu) für die "Aktuelle Serie"-Card.
  // Ergänzt den bisherigen "letzte 5"-Form-Trail oben, der in der Header-Sektion bleibt.
  const _last15 = matches.filter(m=>[m.a1,m.a2,m.b1,m.b2].includes(id))
    .sort((a,b)=>mts(b)-mts(a))
    .slice(0,15).reverse();
  const last15DotsHtml = _last15.map(m=>{
    const onA=(id===m.a1||id===m.a2);
    const w=(onA&&m.winner==='A')||(!onA&&m.winner==='B');
    return `<i class="${w?'':'l'}"></i>`;
  }).join('');

  // Form: letzte 5 Matches
  const formMs=matches.filter(m=>[m.a1,m.a2,m.b1,m.b2].includes(id))
    .sort((a,b)=>mts(b)-mts(a)).slice(0,5).reverse();
  const formHtml=formMs.map(m=>{const onA=(id===m.a1||id===m.a2);
    const w=(onA&&m.winner==='A')||(!onA&&m.winner==='B');
    return `<div class="pd ${w?'w':'l'}"></div>`;}).join('');

  // Elo-Sparkline für die aktuelle Saison (zeigt Saison-Verlauf)
  let sparkHtml='';
  {
    const seasonMs=matchesInSeason().filter(m=>[m.a1,m.a2,m.b1,m.b2].includes(id))
      .sort((a,b)=>mts(a)-mts(b));
    if(seasonMs.length>=2){
      // FIX: Spark-Trace aus der echten Sim-History bauen, NICHT aus m.deltas (DB).
      // m.deltas kann durch Algo-Tweaks vs. live-Sim divergieren → Anzeige zeigt 222 Elo,
      // Spark zeigt aber +221 weil die Summe der DB-Deltas leicht abweicht.
      // Mit sim.history.eloAfter[id] endet die Linie exakt auf dem angezeigten Elo-Wert.
      const histById = getHistoryByMatchId();
      let eloTrace = cfg.start_elo;
      const series = [eloTrace];
      for(const m of seasonMs){
        const h = histById.get(m.id);
        if(h && h.eloAfter && h.eloAfter[id] !== undefined){
          eloTrace = h.eloAfter[id];
        } else {
          // Fallback (z.B. Match liegt außerhalb der Sim wegen versteckter Spieler):
          // DB-Delta verwenden, damit die Linie weiterläuft
          eloTrace += (m.deltas||{})[id] || 0;
        }
        series.push(eloTrace);
      }
      const minE=Math.min(...series), maxE=Math.max(...series);
      const range=Math.max(20, maxE-minE); // mind. 20 Elo-Range für Sichtbarkeit
      const W=300, H=42, pad=4;
      const usableH=H-2*pad;
      const points=series.map((e,i)=>{
        const x=(i/(series.length-1))*W;
        const y=pad+(1-(e-minE)/range)*usableH;
        return [x,y];
      });
      const linePath='M'+points.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' L');
      const fillPath=linePath+` L${W},${H} L0,${H} Z`;
      const last=points[points.length-1];
      // Konsistenz mit der Elo-Anzeige: gerundete Endsumme minus gerundeter Start
      const net=Math.round(series[series.length-1])-Math.round(series[0]);
      const netCls=net>=0?'pos':'neg';
      const netTxt=(net>=0?'+':'')+net;
      const lineCol=net>=0?'var(--acid)':'var(--red)';
      const gradId='ppspark-'+id;
      sparkHtml=`
        <div class="pp-spark">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
            <defs>
              <linearGradient id="${esc(gradId)}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="${lineCol}" stop-opacity=".35"/>
                <stop offset="100%" stop-color="${lineCol}" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path d="${fillPath}" fill="url(#${esc(gradId)})"/>
            <path d="${linePath}" fill="none" stroke="${lineCol}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.5" fill="${lineCol}"/>
          </svg>
        </div>
        <div class="pp-spark-foot">
          <span>Elo · ${esc(seasonLabel(currentSeason().id))}</span>
          <span class="delta ${netCls}">${netTxt}</span>
        </div>`;
    }
  }

  const streakBadge = streakInline(streak);
  const _posCls = posClassify(autoAtk);
  const posIcon = svgI(_posCls.icon);
  const posLabel = _posCls.label;

  // ── Peak-Elo (Saison + Allzeit) für die Trinity-Box ──
  // Peak Saison: höchster Stand in der LAUFENDEN Saison — aus History rekonstruiert
  // Peak Allzeit: höchster je erreichter Saison-Elo (saison-übergreifend, aus globalSim)
  // Zusätzlich: Saison-Label des Allzeit-Peaks als Sub-Text ("Mai 2026")
  let peakSeason = null, peakAlltime = null, peakAlltimeSeason = '';
  {
    const histByMatch = getHistoryByMatchId();
    // Peak Saison: über alle Saison-Matches des Spielers in chronologischer Reihenfolge
    const seasonMsForPeak = matchesInSeason()
      .filter(m=>[m.a1,m.a2,m.b1,m.b2].includes(id))
      .sort((a,b)=>mts(a)-mts(b));
    if(seasonMsForPeak.length){
      let v = cfg.start_elo, mx = v;
      for(const m of seasonMsForPeak){
        const h = histByMatch.get(m.id);
        if(h && h.eloAfter && h.eloAfter[id]!==undefined) v = h.eloAfter[id];
        else v += (m.deltas||{})[id] || 0;
        if(v > mx) mx = v;
      }
      peakSeason = Math.round(mx);
    }
    // Peak Allzeit: bevorzugt aus globalSim.peakElo, sonst über alle Matches scannen
    const peakV = gSim.peakElo ? gSim.peakElo[id] : undefined;
    if(peakV !== undefined){
      peakAlltime = Math.round(peakV);
      // Saison-Label des Peak-Matches finden (höchster eloAfter[id] über alle Matches).
      // Einmaliger O(n)-Scan beim Öffnen des Profils — getHistoryByMatchId ist gecached.
      let bestMatch = null, bestVal = -Infinity;
      for(const m of matches){
        if(![m.a1,m.a2,m.b1,m.b2].includes(id)) continue;
        const h = histByMatch.get(m.id);
        if(!h || !h.eloAfter || h.eloAfter[id] === undefined) continue;
        if(h.eloAfter[id] > bestVal){
          bestVal = h.eloAfter[id];
          bestMatch = m;
        }
      }
      if(bestMatch){
        const sn = seasonOf(bestMatch.created_at);
        peakAlltimeSeason = sn.label;
      }
    }
  }

  // Awards: NUR Platz 1
  const awards=playerAwards(id).filter(a=>a.rank===0);
  const awardCount=awards.length;

  // Awards-Kategorisierung: jede Award gehört zu GENAU EINER Kategorie (exklusiv).
  // Aufteilung in 3 thematische Cluster für klare Übersicht.
  // Positive: rein individuelle Leistung + (positive) Rollen-Awards (Torjäger, Abwehr, Eiskalt).
  // Team:     alle Awards, die ein DUO/Team ausmachen (mvt, bestDuo, endgegner, neue Team-Awards
  //           inkl. Erzfeinde/Rivalry).
  // Negative: Schandtafel + negative Rollen-Awards (Zahnloser Stürmer, Löchrigste Abwehr).
  const POSITIVE_KEYS = new Set([
    'wins','perfect','clutch','carryKing','solo',
    'grinder','showmaster','onFire','streaks','peakElo',
    'weekKing','dayKing',
    // Rollen-Awards (positiv)
    'scorer','wall','ice',
    // ── NEUE AWARDS v3 ──
    'plusMinus','underdog'
  ]);
  const TEAM_KEYS = new Set([
    'mvt','bestDuo','endgegner',
    // Match-Awards sind Team-Leistungen — Sieg/Coup eines konkreten Duos.
    'upset','biggest',
    // ── NEUE TEAM-AWARDS v4 ──
    'unstoppable','concreteWall','luckyCharm','giantSlayer','rivalry'
  ]);
  const NEGATIVE_KEYS = new Set([
    'worstWr','coldStreak','lossStreaks','formtief','worstTeam','zirkus','baustelle',
    'worstAtk','worstDef',
    // ── NEUE AWARDS v3 ──
    'pechvogel',
    // ── NEUE TEAM-AWARDS v4 ──
    'favoritenschreck',
    // ── NEUE NEGATIV-AWARDS v6 ──
    'cheesePlatter','favoriteLoser'
  ]);

  const cnt = (set) => awards.filter(a => set.has(a.key)).length;
  const awCats = [
    {ic:'star',      nm:'Positive<br>Awards', n: cnt(POSITIVE_KEYS)},
    {ic:'handshake', nm:'Team<br>Awards',     n: cnt(TEAM_KEYS)},
    {ic:'skull',     nm:'Negative<br>Awards', n: cnt(NEGATIVE_KEYS)},
  ];

  const badges=getCachedBadges(id);
  const badgeTotal=badges.reduce((sum,b)=>sum+b.count,0);

  const sa = playerSeasonAwards(id);
  const seasonHistory = computeSeasonHistory(id, 5);
  // Saison-Trend: vergleicht jüngste mit älteren Platzierungen
  const seasonTrend = (() => {
    if(!seasonHistory || seasonHistory.length < 2) return null;
    const places = seasonHistory.map(h => h.place).filter(p => p > 0);
    if(places.length < 2) return null;
    const half = Math.ceil(places.length / 2);
    const recent = places.slice(0, half);
    const older = places.slice(half);
    if(!older.length) return null;
    const recentAvg = recent.reduce((a,b)=>a+b, 0) / recent.length;
    const olderAvg  = older.reduce((a,b)=>a+b, 0) / older.length;
    if(recentAvg < olderAvg - 0.5) return {arrow:'↗', cls:'', text:'Form steigend'};
    if(recentAvg > olderAvg + 0.5) return {arrow:'↘', cls:'neg', text:'Form fallend'};
    const avg = places.reduce((a,b)=>a+b, 0) / places.length;
    if(avg <= 3) return {arrow:'→', cls:'', text:'stabil top 3'};
    if(avg <= 5) return {arrow:'→', cls:'neutral', text:'stabil top 5'};
    return {arrow:'→', cls:'neutral', text:'Ø Platz '+Math.round(avg)};
  })();

  const rInfo = getPlayerRank(id);
  const tierClass = rInfo ? ('pp-tier-' + rInfo.label.toLowerCase()
    .replace('ä','a').replace('ö','o').replace('ü','u')) : '';

  // Perzentil-Berechnung
  let percentileTxt = '', percentilePct = 0;
  if(rInfo){
    const avgs = getSeasonAvgElos();
    const ranked = players.filter(pp=>!pp.hidden && avgs[pp.id]!==null)
      .sort((a,b)=>avgs[b.id]-avgs[a.id]);
    const idx = ranked.findIndex(x=>x.id===id);
    if(idx>=0){
      const pct = ((idx+1)/ranked.length)*100;
      percentileTxt = 'Top ' + Math.ceil(pct) + '%';
      percentilePct = pct;
    }
  }

  // Avatar
  const avInner = avatarInnerHtml(p);
  const hasEmoji = !!(p.avatar_id && avatarEmoji(p.avatar_id));
  const avBg = hasEmoji ? '' : `style="background:${avColor(id)}"`;
  const avClass = hasEmoji ? 'pp-av-inner icon-av' : 'pp-av-inner';

  // Eine Karte pro Auszeichnung (chronologisch, neueste zuerst)
  // Wenn ein Spieler in einer Saison sowohl Player als auch Team-Champion war,
  // bekommt er beide Karten separat.
  const trophies = [];
  sa.forEach(s=>{
    if(s.player_id===id){
      trophies.push({type:'player', label:s.label||'', date:s.id||s.start_date||''});
    }
    if(s.team_p1===id||s.team_p2===id){
      const mate = s.team_p1===id ? s.team_p2 : s.team_p1;
      trophies.push({type:'team', label:s.label||'', date:s.id||s.start_date||'', mate});
    }
  });
  // Sortierung: neueste zuerst (Saison-ID ist 'YYYY-MM', String-Sort = chronologisch)
  trophies.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const trophyHtml = `
    <div class="pp-trophies">
      ${trophies.map(t=>{
        if(t.type==='player') return `
        <div class="pp-tr">
          <span class="ic svg-ic">${svgI('trophy')}</span>
          <div class="ti">Player of<br>the Season</div>
          <div class="su">${esc(t.label)}</div>
        </div>`;
        const teamAttr = t.mate ? ` data-team="${esc([id,t.mate].sort().join('|'))}"` : '';
        return `
        <div class="pp-tr team"${teamAttr}>
          <span class="ic svg-ic">${svgI('handshake')}</span>
          <div class="ti">Team of<br>the Season</div>
          <div class="su">${esc(t.label)}</div>
        </div>`;
      }).join('')}
    </div>`;

  const seasonRailHtml = seasonHistory.length ? `
    <div class="pp-seasons" id="ppSeasonsRail">
      ${seasonHistory.map(sn=>{
        const cls = sn.place===1?'gold':sn.place===2?'silver':sn.place===3?'bronze':'';
        const medal = sn.place>=1&&sn.place<=3 ? medalB(sn.place-1) : '';
        const eloCls = sn.eloDelta>=0?'pos':'neg';
        const eloTxt = (sn.eloDelta>=0?'+':'')+sn.eloDelta;
        return `<div class="pp-sn ${cls}">
          <div class="mo">${esc(sn.label)}</div>
          <div class="pl"><span class="n big">${sn.place||'–'}.</span></div>
          <div class="el ${eloCls}">${eloTxt}</div>
          <div class="rc">${sn.wins}–${sn.losses}</div>
        </div>`;
      }).join('')}
    </div>` : '';

  // Karriere-Rang als Hero-Card: prominenter Tier-Name + Ø Saison-Elo + Journey-Bar.
  // Die Tier-Farbvariablen (--pp-tier-1/2/glow) werden vom Parent-Element (pp-sec.{tier})
  // vererbt — daher färben sich Icon, Label, Glow, Strahl automatisch nach Tier.
  const _activeIdxRaw = rInfo ? RANKS.findIndex(rank => rank.label === rInfo.label) : -1;
  const _activeIdx = _activeIdxRaw >= 0 ? (RANKS.length - 1 - _activeIdxRaw) : -1;
  const _ranksReversed = RANKS.slice().reverse();
  const _journeyTier = rInfo
    ? ('pp-tier-'+rInfo.label.toLowerCase().replace('ä','a').replace('ö','o').replace('ü','u'))
    : '';
  const _fillPct = _activeIdx >= 0 ? _activeIdx * 25 : 0;
  const _tierIcon = rInfo && rInfo.icon ? ICONS[rInfo.icon] : ICONS.chartBar;

const rankProgHtml = rInfo ? `
  <div class="pp-rank-card ${_journeyTier}" id="ppRanksBtn" style="cursor:pointer">
    <div class="pp-rank-hero">
      <div class="pp-rank-tier-block">
        <div class="pp-rank-icon">
          <svg viewBox="0 0 24 24">${_tierIcon||''}</svg>
        </div>
        <div class="pp-rank-tier-text">
          <div class="pp-rank-label">${esc(rInfo.label)}</div>
          <div class="pp-rank-sub">${percentileTxt||'—'}</div>
        </div>
      </div>
      <div class="pp-rank-elo-block">
        <div class="pp-rank-elo">${rInfo.avg}</div>
        <div class="pp-rank-elo-lbl">Ø Saison-Elo</div>
      </div>
    </div>
    <div class="pp-ranks-journey">
      <div class="pp-rj-track"></div>
      <div class="pp-rj-fill-track"><div class="pp-rj-fill" style="width:${_fillPct}%"></div></div>
      <div class="pp-rj-tiers">
        ${_ranksReversed.map((r, i) => {
          const state = _activeIdx < 0 ? '' : (i < _activeIdx ? 'done' : (i === _activeIdx ? 'active' : ''));
          return `<div class="pp-rj-tier ${state}">
            <div class="pp-rj-dot"></div>
            <div class="pp-rj-lbl">${esc(r.label)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>` : `
  <div class="pp-rank-card" id="ppRanksBtn" style="cursor:pointer">
    <div class="pp-rank-empty">Noch keine Saison-Daten</div>
  </div>`;

  openSheet(`
    <header class="pp-header ${tierClass}">
      <button class="pp-edit-btn" id="ppEditBtn" title="Profil bearbeiten">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
      </button>
      <div class="pp-av-wrap">
        ${rInfo && rInfo.label==='Legende' ? `<span class="pp-crown">${svgI('crown')}</span>` : ''}
        <div class="pp-av-ring">
          <div class="${avClass}" ${avBg}>${avInner}</div>
        </div>
        ${rank>0?`<span class="pp-rank-pos">#${rank}</span>`:''}
      </div>
      <h1 class="pp-name">${esc(p.name)}${streakBadge?` ${streakBadge}`:''}</h1>

      <div class="pp-pills">
        ${rInfo?`<span class="pp-pill tier">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[rInfo.icon]||''}</svg>
          ${esc(rInfo.label)}
        </span>`:''}
        <span class="pp-pill">${posIcon}${esc(posLabel)}</span>
      </div>

      ${(()=>{
        // ── SIGNATURE: Peak-Elo-Trinity ──
        // Drei zusammenhängende Werte: Aktuell (acid) | Peak Saison | Peak Allzeit (tier-getönt)
        const games=gSim.playedSeason[id]||0;
        const curElo = games>0 ? Math.round(gSim.elo[id]) : '—';
        const ps = peakSeason !== null ? peakSeason : '—';
        const pa = peakAlltime !== null ? peakAlltime : '—';
        const paSub = peakAlltimeSeason ? esc(peakAlltimeSeason) : 'saison-übergreifend';
        return `<div class="pp-elo-trinity">
          <div class="pp-et-col now">
            <div class="label">Aktuell</div>
            <div class="val">${curElo}</div>
            <div class="sub">Saison</div>
          </div>
          <div class="pp-et-col peak">
            <div class="label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS['peak']||''}</svg> Peak</div>
            <div class="val">${ps}</div>
            <div class="sub">diese Saison</div>
          </div>
          <div class="pp-et-col alltime">
            <div class="label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS['star']||''}</svg> Allzeit</div>
            <div class="val">${pa}</div>
            <div class="sub">${paSub}</div>
          </div>
        </div>`;
      })()}

      ${(sparkHtml || formHtml) ? `<div class="pp-spark-row">
        ${sparkHtml}
        ${formHtml?`<div class="pp-form">${formHtml}</div>`:''}
      </div>` : ''}
    </header>

    <div class="pp-sec" style="animation-delay:.3s">
      ${(()=>{
        // Rollen-Performance: zwei Donut-Diagramme (orange = Sturm, blau = Abwehr).
        // Ring zeigt die Win-Rate visuell, Zahl in der Mitte konkret. Subtext zeigt
        // Tor/Gegentor-Schnitt — passt zu den Awards Torjäger / Eiserne Abwehr
        // und zum Positionen-Tab. Werte kommen aus playerStats: s.atkGoals und
        // s.defConceded (positions-spezifisch akkumuliert).
        const tot = s.atkG + s.defG;
        if(tot === 0){
          return `<div class="pp-pos-combined">
            <div class="head"><div class="t">Rollen-Performance</div></div>
            <div class="pp-roles-empty">Keine Spiele</div>
          </div>`;
        }
        const donut = (cls, lbl, icon, wr, w, g, valLbl, valNum, color) => {
          if(g === 0) return `
            <div class="pp-rd ${cls}">
              <div class="pp-rd-ring" style="background:var(--surface3)">
                <div class="pp-rd-inner"><div class="pp-rd-wr" style="color:var(--muted)">–</div></div>
              </div>
              <div class="pp-rd-lbl"><span class="ic">${svgI(icon)}</span>${lbl}</div>
              <div class="pp-rd-empty">noch keine Spiele</div>
            </div>`;
          return `
            <div class="pp-rd ${cls}">
              <div class="pp-rd-ring" style="background:conic-gradient(${color} ${wr}%, var(--surface3) 0)">
                <div class="pp-rd-inner"><div class="pp-rd-wr">${wr}<small>%</small></div></div>
              </div>
              <div class="pp-rd-lbl"><span class="ic">${svgI(icon)}</span>${lbl}</div>
              <div class="pp-rd-meta"><b>${w}</b>/<b>${g}</b> Spiele<br>Ø <b>${valNum}</b> ${valLbl}</div>
            </div>`;
        };
        const atkAvg = s.atkG ? (s.atkGoals/s.atkG).toFixed(1) : '–';
        const defAvg = s.defG ? (s.defConceded/s.defG).toFixed(1) : '–';
        return `<div class="pp-pos-combined">
          <div class="head"><div class="t">Rollen-Performance</div></div>
          <div class="pp-roles-donuts">
            ${donut('atk','Sturm','bolt',atkWr,s.atkW,s.atkG,'Tore/Sp.',atkAvg,'var(--orange)')}
            ${donut('def','Abwehr','shield',defWr,s.defW,s.defG,'Gegentore/Sp.',defAvg,'var(--blue)')}
          </div>
        </div>`;
      })()}
    </div>

    <div class="pp-sec" style="animation-delay:.35s">
      <div class="pp-sec-title">
        <div class="l"><span class="ic svg-ic">${svgI('chartBar')}</span><h4>Gesamt-Stats</h4></div>
        <div class="m">${s.games} Spiele</div>
      </div>
      <div class="pp-kpi">
        <div class="pp-k"><div class="v">${s.wins}</div><div class="l">Siege</div></div>
        <div class="pp-k f"><div class="v">${wr}%</div><div class="l">Siegrate</div></div>
        <div class="pp-k ${s.gd>=0?'pos':'neg'}"><div class="v">${s.gd>=0?'+':''}${s.gd}</div><div class="l">Tordiff</div></div>
      </div>
    </div>

    <div class="pp-sec" style="animation-delay:.4s">
      <div class="pp-sec-title">
        <div class="l"><span class="ic svg-ic">${svgI('flame')}</span><h4>Siegesserien</h4></div>
      </div>
      <div class="pp-streaks">
        <div class="pp-st">
          <div class="l">Aktuelle Serie</div>
          <div class="v ${streak===0?'empty':''}">${streak>0?streak+' Siege':streak<0?(-streak)+' Niederlagen':'–'}</div>
          ${_last15.length?`<div class="dots mixed">${last15DotsHtml}</div>`:''}
        </div>
        <div class="pp-st">
          <div class="l">Längste Serie</div>
          <div class="v ${longestStr<2?'empty':''}">${longestStr>=2?longestStr+' Siege':'–'}</div>
          ${longestStr>=2&&longestPeakLabel?`<div class="pp-st-sub">${esc(longestPeakLabel)}</div>`:''}
        </div>
      </div>
    </div>

    ${badgeTotal?(()=>{
      // ─── Auszeichnungen-Card (Variante 4): Strip seltenster Achievements + Tier-Bar ───
      // Strip: max 8 freigeschaltete Badges, sortiert nach Rarität (Legendary→Common),
      // innerhalb jeder Gruppe in BADGES-Reihenfolge. Mini-Icons bekommen Tier-Border.
      // Dünne Bar darunter zeigt segmentiert den Gesamt-Fortschritt nach Tier.
      const _STRIP_MAX = 8;
      const _byRarity = {legendary:[], rare:[], common:[], negative:[]};
      badges.forEach(b => { const r = rarityOf(b.id); if(_byRarity[r]) _byRarity[r].push(b); });
      const _strip = [];
      RARITY_ORDER.forEach(r => _byRarity[r].forEach(b => _strip.push({b, r})));
      const _visible = _strip.slice(0, _STRIP_MAX);
      const _rest = Math.max(0, _strip.length - _visible.length);
      const _stripHtml = _visible.map(({b,r}) => {
        const ic = ICONS[b.ic] ? `<svg viewBox="0 0 24 24">${ICONS[b.ic]}</svg>` : '';
        return `<div class="pp-bmini ${r}">${ic}</div>`;
      }).join('') + (_rest ? `<span class="pp-bcard-rest">+${_rest}</span>` : '');
      // Bar-Segmente: ein Stück pro Tier-Count, Rest dunkel
      const _seg = (r) => _byRarity[r].length;
      const _have = _seg('legendary')+_seg('rare')+_seg('common')+_seg('negative');
      const _missing = BADGES.length - _have;
      const _barHtml = `
        <div class="pp-bcard-bar">
          ${_seg('legendary')?`<div class="seg legendary" style="flex:${_seg('legendary')}"></div>`:''}
          ${_seg('rare')?`<div class="seg rare" style="flex:${_seg('rare')}"></div>`:''}
          ${_seg('common')?`<div class="seg common" style="flex:${_seg('common')}"></div>`:''}
          ${_seg('negative')?`<div class="seg negative" style="flex:${_seg('negative')}"></div>`:''}
          ${_missing?`<div class="seg" style="flex:${_missing};background:var(--surface3);opacity:.5"></div>`:''}
        </div>`;
      return `
    <div class="pp-sec" style="animation-delay:.425s">
      <div class="pp-sec-title">
        <div class="l">${svgI('star')}<h4>Auszeichnungen</h4></div>
        <div class="m">${_have} / ${BADGES.length}</div>
      </div>
      <div class="pp-bcard" id="ppBadgesBtn">
        <div class="pp-bcard-row">
          <div class="pp-bcard-strip">${_stripHtml}</div>
          <span class="pp-bcard-chev">
            <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
          </span>
        </div>
        ${_barHtml}
      </div>
    </div>`;
    })():''}
    
    ${sa.length?`
    <div class="pp-sec" style="animation-delay:.435s">
      <div class="pp-sec-title">
        <div class="l">${svgI('trophy')}<h4>Liga Titel</h4></div>
        <div class="m">${(()=>{let n=0;sa.forEach(s=>{if(s.player_id===id)n++;if(s.team_p1===id||s.team_p2===id)n++;});return n;})()} Titel</div>
      </div>
      ${trophyHtml}
    </div>`:''}
    
    <div class="pp-sec" style="animation-delay:.45s">
      <div class="pp-sec-title">
        <div class="l"><span class="ic svg-ic">${svgI('users')}</span><h4>Beziehungen</h4></div>
      </div>
      <div class="pp-rel-grid">
  
        ${(()=>{
          // Hilfsfunktion: Mate-/Gegner-Avatar (34 px)
          const relAv=(pid)=>{
            const pp=pmap()[pid];
            if(!pp) return `<div class="av empty">?</div>`;
            const em=pp.avatar_id?avatarEmoji(pp.avatar_id):null;
            if(em) return `<div class="av" style="background:var(--surface3);color:inherit">${em}</div>`;
            return `<div class="av" style="background:${avColor(pid)}">${esc(initials(pp.name))}</div>`;
          };
          // Eine Karte mit Avatar links + Info rechts
          const card=(cls, attr, icKey, label, name, wr, w, g)=>{
            const empty = !name;
            return `<div class="pp-r-rich ${cls}"${attr}>
              ${empty?`<div class="av empty">–</div>`:relAv(name.id)}
              <div class="info">
                <div class="l">${svgI(icKey)}${label}</div>
                <div class="name">${empty?'–':esc(name.label)}</div>
                <div class="stat">${empty?'':`<span class="v">${Math.round(wr*100)}%</span> <span class="g">(${Math.round(wr*g)}/${g})</span>`}</div>
              </div>
            </div>`;
          };
          // Bester Mate
          const bestAttr  = best?` data-team="${esc([id,best.mid].sort().join('|'))}"`:'';
          const bestCard  = best
            ? card('good', bestAttr, 'handshake', 'Bester Mate', {id:best.mid,label:pname(best.mid)}, best.wr, Math.round(best.wr*best.g), best.g)
            : card('good', '', 'handshake', 'Bester Mate', null);
          // Schlechtester Mate (nur wenn ≠ Bester)
          const worstAttr = worst&&best&&worst.mid!==best.mid?` data-team="${esc([id,worst.mid].sort().join('|'))}"`:'';
          const worstCard = worst&&best&&worst.mid!==best.mid
            ? card('bad', worstAttr, 'chartDown', 'Schlecht. Mate', {id:worst.mid,label:pname(worst.mid)}, worst.wr, Math.round(worst.wr*worst.g), worst.g)
            : card('bad', '', 'chartDown', 'Schlecht. Mate', null);
          // Lieblingsgegner → klickbar zum Gegnerprofil
          const favAttr  = fav?` data-detail="${esc(fav.oid)}"`:'';
          const favCard  = fav
            ? card('fav', favAttr, 'target', 'Lieblingsgegner', {id:fav.oid,label:pname(fav.oid)}, fav.wr, Math.round(fav.wr*fav.g), fav.g)
            : card('fav', '', 'target', 'Lieblingsgegner', null);
          // Angstgegner (nur wenn ≠ Liebling)
          const nemAttr  = nem&&fav&&nem.oid!==fav.oid?` data-detail="${esc(nem.oid)}"`:'';
          const nemCard  = nem&&fav&&nem.oid!==fav.oid
            ? card('nem', nemAttr, 'crown', 'Angstgegner', {id:nem.oid,label:pname(nem.oid)}, nem.wr, Math.round(nem.wr*nem.g), nem.g)
            : card('nem', '', 'crown', 'Angstgegner', null);
          return bestCard + worstCard + favCard + nemCard;
        })()}
      </div>
    </div>

    ${(()=>{
      // ─── BILANZEN-CARD (kompakt): Strip aus Mitspieler-Avataren + Chevron ───
      // Komplette Card ist klickbar (id=ppH2HBtn → showPlayerH2HList). Die
      // Mini-Avatare zeigen die TOP-Mitspieler nach gemeinsamer Häufigkeit;
      // im Sheet erscheint die volle, scrollbare Liste mit T/G-Bilanz pro Zeile.
      const h2hList = playerH2HList(id, 3);
      if(h2hList.length < 2) return '';
      const pmL = pmap();
      // 5 Mini-Avatare im Strip; bei mehr Mitspielern zusätzlich "+N" Chip.
      const STRIP_MAX = 5;
      const stripItems = h2hList.slice(0, STRIP_MAX).map(x=>{
        const pp = pmL[x.oid]; if(!pp) return '';
        const em = pp.avatar_id ? avatarEmoji(pp.avatar_id) : null;
        if(em) return `<div style="width:26px;height:26px;border-radius:50%;background:var(--surface3);display:grid;place-items:center;font-size:14px;border:1.5px solid var(--surface);flex-shrink:0">${em}</div>`;
        return `<div style="width:26px;height:26px;border-radius:50%;background:${avColor(pp.id)};display:grid;place-items:center;font-size:9px;font-family:'Archivo Black',sans-serif;color:#0a0c0b;border:1.5px solid var(--surface);flex-shrink:0">${esc(initials(pp.name))}</div>`;
      }).join('');
      const overflow = h2hList.length > STRIP_MAX
        ? `<div style="height:26px;display:grid;place-items:center;padding:0 8px;border-radius:13px;background:var(--surface3);font-size:10px;font-weight:700;color:var(--ink2);font-family:'Sometype Mono',monospace;flex-shrink:0">+${h2hList.length-STRIP_MAX}</div>`
        : '';
      return `
    <div class="pp-sec" style="animation-delay:.5s">
      <div class="pp-badges-card" id="ppH2HBtn">
        <div class="pp-badges-strip" style="align-items:center">
          ${stripItems}${overflow}
        </div>
        <span class="chev">
          <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
        </span>
      </div>
    </div>`;
    })()}



    ${awardCount?`
    <div class="pp-sec" style="animation-delay:.65s">
      <div class="pp-sec-title">
        <div class="l">${svgI('medal')}<h4>Awards</h4></div>
        <div class="m">${awardCount} erreicht</div>
      </div>
      <div class="pp-awards" id="ppAwardsGrid">
        ${awCats.map(c=>`
          <div class="pp-aw ${c.n===0?'empty':''}">
            <span class="ic svg-ic">${svgI(c.ic)}</span>
            <div class="nm">${c.nm}</div>
            <div class="num">${c.n}</div>
          </div>`).join('')}
      </div>
    </div>`:''}

    ${seasonHistory.length?`
    <div class="pp-sec" style="animation-delay:.7s">
      <div class="pp-sec-title">
        <div class="l">${svgI('calendar')}<h4>Saisonverlauf <span style="color:var(--muted);font-weight:500;letter-spacing:.02em;text-transform:none">(letzte ${seasonHistory.length})</span></h4></div>
        <div class="m">${seasonTrend ? `<span class="trend ${seasonTrend.cls}">${seasonTrend.arrow} ${esc(seasonTrend.text)}</span>` : seasonHistory.length+' Saisons'}</div>
      </div>
      ${seasonRailHtml}
    </div>`:''}

    <div class="pp-sec ${tierClass}" style="animation-delay:.75s">
      <div class="pp-sec-title">
        <div class="l">${svgI('chartBar')}<h4>Karriere-Rang</h4></div>
      </div>
      ${rankProgHtml}
    </div>

    <div class="pp-sec" style="animation-delay:.8s">
      <div class="pp-sec-title">
        <div class="l">${svgI('target')}<h4>Positions-Profil</h4></div>
        <div class="m">${posLabel}</div>
      </div>
      <div class="pp-posprof" style="--atk:${atkPct}%">
        <div class="pph">
          <span class="lf">${svgI('bolt')}Sturm</span>
          <span><span class="pct">${atkPct}%</span> / <span class="pct">${defPct}%</span></span>
          <span class="rt">Abwehr${svgI('shield')}</span>
        </div>
        <div class="pp-slider">
          <div class="pp-fill" style="width:${atkPct}%"></div>
          <span class="pp-thumb" style="left:${atkPct}%"></span>
        </div>
        <div class="ppf">Eingestuft als <span class="lab" style="display:inline-flex;align-items:center;gap:4px">${posIcon}${posLabel}</span></div>
      </div>
    </div>

    <div class="pp-del">
      <button id="delPlayer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/>
        </svg>
        Spieler löschen
      </button>
    </div>
  `);

  // Click-Handler
  const eb=document.getElementById('ppEditBtn');
  if(eb) eb.onclick=()=>{ sheetNav(()=>showEditPlayer(id)); };
  const ag=document.getElementById('ppAwardsGrid');
  if(ag) ag.onclick=()=>{ sheetNav(()=>showPlayerAwards(id,awards)); };
  const bb=document.getElementById('ppBadgesBtn');
  if(bb) bb.onclick=()=>{ sheetNav(()=>showPlayerBadges(id)); };
  const h2hb=document.getElementById('ppH2HBtn');
  if(h2hb) h2hb.onclick=()=>{ sheetNav(()=>showPlayerH2HList(id)); };
  const sr=document.getElementById('ppSeasonsRail');
  if(sr) sr.onclick=()=>{ sheetNav(()=>showPlayerSeasons(id)); };
  const rk=document.getElementById('ppRanksBtn');
  if(rk) rk.onclick=()=>{ sheetNav(()=>showRangSystem()); };
  const tp=document.getElementById('ppTrPlayer');
  if(tp) tp.onclick=()=>{ sheetNav(()=>showPlayerSeasons(id)); };
  const tt=document.getElementById('ppTrTeam');
  if(tt) tt.onclick=()=>{ sheetNav(()=>showPlayerSeasons(id)); };
  document.querySelectorAll('.pp-trophies .pp-tr').forEach(el=>{
    el.onclick=()=>{ sheetNav(()=>showPlayerSeasons(id)); };
  });
  // Mate-Karten öffnen das Team-Profil (Spieler + Mate)
  document.querySelectorAll('[data-team]').forEach(el=>{
    el.onclick=()=>{
      const [a,b]=el.dataset.team.split('|');
      if(!a||!b) return;
      sheetNav(()=>showTeam(a,b));
    };
  });
  // Bilanzen-Zeilen öffnen das H2H-Sheet (Reihenfolge bewahren — Profil-Spieler zuerst)
  document.querySelectorAll('[data-h2h]').forEach(el=>{
    el.onclick=()=>{
      const [a,b]=el.dataset.h2h.split('|');
      if(!a||!b) return;
      sheetNav(()=>showH2H(a,b));
    };
  });
  // Lieblings-/Angstgegner-Karten öffnen das Gegner-Profil
  document.querySelectorAll('.pp-r-rich[data-detail]').forEach(el=>{
    el.onclick=()=>{
      const oid=el.dataset.detail;
      if(!oid) return;
      sheetNav(()=>showPlayer(oid));
    };
  });

  // Delete-Handler – identisch zur Original-Logik
  const dp=document.getElementById('delPlayer');
  if(dp) dp.onclick=async()=>{
    const inMatches=matches.some(m=>[m.a1,m.a2,m.b1,m.b2].includes(id));
    if(inMatches){
      _pushCurrentSheet(); // Spielerprofil stapeln → „Zurück" möglich
      openSheet(`
        <h3>Spieler entfernen</h3>
        <div class="sheet-sub">${esc(p.name)} · ${gamesPlayed(id)} Matches</div>
        <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px">
          <button class="btn ghost" id="hidePlayerBtn" style="text-align:left;padding:16px">
            <div style="font-weight:700">Aus Rangliste ausblenden</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px;font-weight:400">
              Spieler verschwindet aus der Rangliste.<br>
              Matches, Awards & Badges bleiben vollständig erhalten.
            </div>
          </button>
          <button class="btn ghost" id="deletePlayerBtn" style="text-align:left;padding:16px;color:var(--red);border-color:rgba(240,86,106,.3)">
            <div style="font-weight:700">Komplett löschen</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px;font-weight:400">
              Spieler wird gelöscht. Matches bleiben aber<br>
              Namen erscheinen als "?" in der Historie.
            </div>
          </button>
          <button class="btn ghost sm" id="cancelDelBtn">Abbrechen</button>
        </div>
      `);
      document.getElementById('hidePlayerBtn').onclick=async()=>{
        await sb.from('players').update({hidden:true}).eq('id',id);
        closeSheet(true); toast(esc(p.name)+' ausgeblendet'); await loadAll();
      };
      document.getElementById('deletePlayerBtn').onclick=async()=>{
        if(!confirm('Wirklich komplett löschen? Namen erscheinen dann als "?" in allen Matches.')) return;
        // PHASE 1: Soft-Delete — Historie referenziert Spieler weiterhin,
        // RLS erlaubt kein hartes DELETE (Plan §5)
        await sb.from('players').update({deleted_at:new Date().toISOString()}).eq('id',id);
        closeSheet(true); toast('Gelöscht'); await loadAll();
      };
      document.getElementById('cancelDelBtn').onclick=()=>{
        closeSheet(); // zurück zum Spielerprofil (Stack-Pop)
      };
    } else {
      if(!confirm(`Spieler "${p.name}" löschen?`)) return;
      await sb.from('players').update({deleted_at:new Date().toISOString()}).eq('id',id);
      closeSheet(true); toast('Gelöscht'); await loadAll();
    }
  };
}

// ─── Spieler bearbeiten: Spitzname + Avatar wählen ───
function showEditPlayer(id){
  const p=pmap()[id]; if(!p) return;
  _sheetSetReopen(()=>showEditPlayer(id));
  let selectedAvatar = p.avatar_id || null;

  const avPickerHtml = `
    <div class="av-picker" id="avPicker">
      <div class="av-opt initials ${!selectedAvatar?'selected':''}" data-av="">
        <span class="em">${initials(p.name)}</span>
      </div>
      ${AVATAR_OPTIONS.map(o=>`
        <div class="av-opt ${selectedAvatar===o.id?'selected':''}" data-av="${o.id}">
          <span class="em">${o.em}</span>
        </div>`).join('')}
    </div>`;

  openSheet(`
    <h3>Profil bearbeiten</h3>
    <div class="sheet-sub">${esc(p.name)}</div>

    <div class="field-label">Profilbild</div>
    ${avPickerHtml}

    <div class="btn-row" style="margin-top:20px">
      <button class="btn ghost" id="editCancel">Abbrechen</button>
      <button class="btn" id="editSave">Speichern</button>
    </div>
  `);

  const picker = document.getElementById('avPicker');
  if(picker){
    picker.querySelectorAll('.av-opt').forEach(el=>{
      el.onclick=()=>{
        picker.querySelectorAll('.av-opt').forEach(x=>x.classList.remove('selected'));
        el.classList.add('selected');
        selectedAvatar = el.dataset.av || null;
      };
    });
  }

  document.getElementById('editCancel').onclick=()=>{
    closeSheet(); // zurück zum Spielerprofil (Stack-Pop)
  };

  document.getElementById('editSave').onclick=async()=>{
    const updates = { avatar_id: selectedAvatar || null };
    // Lokales Update sofort
    p.avatar_id = updates.avatar_id;
    // DB-Update versuchen
    const {error} = await sb.from('players').update(updates).eq('id',id);
    if(error){
      // Spalte existiert evtl. nicht in DB – lokaler Fallback via localStorage
      console.warn('DB-Update fehlgeschlagen, localStorage-Fallback:', error.message);
      try{
        localStorage.setItem('playerEdit_'+id, JSON.stringify(updates));
        toast('Gespeichert (lokal)','ok');
      }catch(e){
        toast('Lokal gespeichert');
      }
    } else {
      toast('Gespeichert','ok');
    }
    closeSheet(); // zurück zum Spielerprofil (Stack-Pop, zeigt aktualisiertes Avatar)
  };
}

// ─── Saison-Verlauf berechnen (letzte N) ───
function computeSeasonHistory(playerId, limit){
  const allSeasonIds = [...allPastSeasons(), currentSeason().id];
  const last = allSeasonIds.slice(-limit);
  return last.map(sid=>{
    const sMatches = matchesInSeason(sid).filter(m=>[m.a1,m.a2,m.b1,m.b2].includes(playerId));
    if(!sMatches.length) return null;
    let w=0, l=0;
    sMatches.forEach(m=>{
      const onA=(playerId===m.a1||playerId===m.a2);
      const won=(onA&&m.winner==='A')||(!onA&&m.winner==='B');
      if(won) w++; else l++;
    });
    const gSim = getGlobalSim();
    const snapshot = gSim.seasonEndElos[sid] || {};
    const seasonPlayedMap = gSim.seasonPlayed[sid] || {};
    const startElo = cfg.start_elo;
    const endElo = snapshot[playerId] ?? startElo;
    const eloDelta = Math.round(endElo - startElo);
    const playersInSeason = players.filter(pp=>!pp.hidden);
    const seasonRanking = playersInSeason.map(pp=>({
      id:pp.id, e: (snapshot[pp.id] ?? startElo), g: (seasonPlayedMap[pp.id]||0)
    })).filter(x=>x.g>0).sort((a,b)=>b.e-a.e);
    const place = seasonRanking.findIndex(x=>x.id===playerId)+1;
    return {
      id:sid, label:seasonLabel(sid),
      wins:w, losses:l, eloDelta,
      place: place>0?place:null,
    };
  }).filter(Boolean).reverse();
}

// Awards-Sheet für einen Spieler: listet alle gehaltenen Awards auf, jeweils anklickbar
function showRangSystem(){
  _sheetSetReopen(()=>showRangSystem());
  const avgs=getSeasonAvgElos();
  const ranked=players.filter(p=>!p.hidden&&avgs[p.id]!==null)
    .sort((a,b)=>avgs[b.id]-avgs[a.id]);
  const rows=RANKS.map((r,i)=>{
    const prev=RANKS[i-1];
    const fromPct=prev?Math.round(prev.pct*100):0;
    const toPct=Math.round(r.pct*100);
    const label=i===0?'Top '+toPct+'%':fromPct+'% – '+toPct+'%';
    const inRank=ranked.filter((_,idx)=>{
      const pct=(idx+1)/ranked.length;
      const prevR=RANKS[i-1];
      return pct<=(r.pct+0.001)&&(!prevR||pct>(prevR.pct+0.001));
    });
    return `<div style="background:var(--surface);border:1px solid var(--line);
      border-radius:var(--r-sm);padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${inRank.length?'8px':'0'}">
        <span style="font-weight:700;color:${r.color};display:inline-flex;align-items:center;gap:6px">
          <span class="ic svg-ic" style="font-size:14px;color:${r.color}"><svg viewBox="0 0 24 24">${ICONS[r.icon]||''}</svg></span>${r.label}
        </span>
        <span style="font-size:11px;color:var(--muted)">${label} der Spieler</span>
      </div>
      ${inRank.length?`<div style="display:flex;flex-direction:column;gap:4px">
        ${inRank.map(p=>`<div style="display:flex;justify-content:space-between;
          align-items:center;font-size:12px;padding:4px 0;border-top:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px">
            ${avHtml(p,'width:24px;height:24px;border-radius:7px;font-size:9px')}
            <span>${esc(p.name)}</span>
          </div>
          <span style="font-family:'Sometype Mono',monospace;font-size:11px;color:${r.color}">
            Ø ${avgs[p.id]}
          </span>
        </div>`).join('')}
      </div>`:''}    </div>`;
  }).join('');
  openSheet(`
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
      <span class="emoji svg-ic" style="width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:var(--surface2);color:var(--ink2)"><svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round">${ICONS['crown']||''}</svg></span>
      <div><h3>Rang-System</h3><div class="sheet-sub">Basiert auf Ø Saison-Elo</div></div>
    </div>
    ${rows}
  `);
}
function showPlayerAwards(playerId, awards){
  const p=pmap()[playerId]; if(!p)return;
  _sheetSetReopen(()=>showPlayerAwards(playerId, awards));
  // Mapping wie in vAwards/AW_IC für konsistente Icons
  // ⚑ HOTSPOT — Spiegel von AW_IC aus §5.3 (vAwards). Bei neuen Awards HIER
  //  und in den anderen 2 AW_IC-Definitionen gleichzeitig erweitern.
  const AW_IC = {
    wins:'trophyStar',     onFire:'flame',       perfect:'star',          streaks:'flameTriple',
    showmaster:'award',    mvt:'handshake',      bestDuo:'duo',           scorer:'ball',
    wall:'shieldCheck',    ice:'snowflake',      endgegner:'skull',       clutch:'target',
    carryKing:'weight',    solo:'lonewolf',      upset:'surprise',        biggest:'explosion',
    grinder:'gamepad',     worstWr:'ghost',      coldStreak:'iceCube',    lossStreaks:'trendCrash',
    formtief:'meltDown',   worstAtk:'blockedShot',worstDef:'hole',        worstTeam:'brokenHeart',
    zirkus:'circus',       baustelle:'cone',     peakElo:'peak',
    weekKing:'weekKing',   dayKing:'dayKing',
    plusMinus:'plusMinus', underdog:'underdog',  pechvogel:'rainCloud',
    // ── NEUE TEAM-AWARDS v4 ──
    unstoppable:'unstoppable', concreteWall:'concreteWall', luckyCharm:'clover',
    giantSlayer:'giantSlayer', favoritenschreck:'devilMask', rivalry:'crossedSwords',
    // ── NEUE NEGATIV-AWARDS v6 ──
    cheesePlatter:'cheese', favoriteLoser:'crownFallen'
  };
  const ic = key => `<svg viewBox="0 0 24 24">${ICONS[AW_IC[key]||'trophy']||''}</svg>`;

  // Award-Trophäe für das Sheet: gleiche Optik wie im Awards-Tab.
  // Plakette: bei Team-Awards zeigen wir den Partner-NAMEN als reinen Text
  // (kein Profilbild) — konsistent zum Wunsch des Users und sauber für den
  // 4-Spieler-Award "Erzfeinde" (a.partnerLabel statt a.partner).
  const trophy = (a) => {
    const m = AWARD_META[a.key]; if(!m) return '';
    const valDisplay = a.val ? esc(a.val) : '#1';
    let plaqueContent;
    if(a.partnerLabel){
      // Rivalry / 4-Spieler: keine Partner-Plaque, sondern Beschriftung "vs X & Y"
      plaqueContent = `<span class="aw-trophy-plaque-name" style="font-size:10px">${esc(a.partnerLabel)}</span>`;
    } else if(a.partner){
      // Team-Award (2 Spieler): Partner-Name ohne Avatar/Initial-Bubble
      plaqueContent = `<span class="aw-trophy-plaque-name" style="font-size:10.5px">mit ${esc(pname(a.partner))}</span>`;
    } else {
      plaqueContent = `<span class="aw-trophy-plaque-name" style="color:var(--muted);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase">Top-1</span>`;
    }
    return `<div class="aw-trophy ${m.cls}" data-paward2="${esc(a.key)}">
      <div class="aw-trophy-cup">${ic(a.key)}<div class="aw-trophy-cup-base"></div></div>
      <div class="aw-trophy-lbl">${esc(m.title)}</div>
      <div class="aw-trophy-val">${valDisplay}</div>
      <div class="aw-trophy-plaque">${plaqueContent}</div>
    </div>`;
  };

  const body = awards.length
    ? `<div class="aw-vitrine" style="margin-top:16px">${awards.map(trophy).join('')}</div>`
    : `<div class="empty" style="margin-top:24px;text-align:center;color:var(--muted)">
        <div class="ee svg-ic" style="color:var(--faint);margin-bottom:6px">${svgI('trophy')}</div>
        Noch keine Top-1-Auszeichnungen
       </div>`;

  openSheet(`
    <div style="display:flex;align-items:center;gap:14px">
      ${avHtml(p,"width:48px;height:48px;border-radius:14px;font-size:18px")}
      <div>
        <h3>Awards</h3>
        <div class="sheet-sub">${esc(p.name)} · ${awards.length} Top-1-Auszeichnung${awards.length===1?'':'en'}</div>
      </div>
    </div>
    ${body}
    <button class="btn ghost sm" id="backToPlayer" style="margin-top:14px;width:100%">← Zurück zum Profil</button>
  `);
  document.querySelectorAll('[data-paward2]').forEach(el=>el.onclick=()=>{
    sheetNav(()=>showAward(el.dataset.paward2));
  });
  const back=document.getElementById('backToPlayer');
  if(back) back.onclick=()=>closeSheet();
}

// Badges-Sheet: zeigt alle Badges (freigeschaltet vs. gesperrt)
function showPlayerBadges(playerId){
  const p = pmap()[playerId]; if(!p) return;
  _sheetSetReopen(()=>showPlayerBadges(playerId));
  const earned = getCachedBadges(playerId);
  const earnedIds = new Map(earned.map(b => [b.id, b.count]));
  // ONCE_ONLY: Badges, die man nur einmal erreicht (keine Wiederholung als ×N)
  // — werden in der Sortierung VOR den mehrfach-erreichbaren angezeigt.
  const ONCE_ONLY = new Set(['first_match','games25','games150','allrounder','def50','atk50',
    'climber_100','dominator_400','dynasty_600','allwetter']);

  // ─── Aggregation pro Tier ───
  // Pro Rarity: BADGES-Array in Reihenfolge durchgehen, in Buckets sortieren.
  // Innerhalb des Buckets: ZUERST einmalig erreichbare ("Freigeschaltet"-Style),
  // DANACH mehrfach erreichbare (×N-Counter) — sortiert nur die ANZEIGE, keine
  // neue Kategorie. Stabil: relative Reihenfolge im BADGES-Array bleibt erhalten.
  const buckets = {legendary:[], rare:[], common:[], negative:[]};
  BADGES.forEach(b => {
    const r = rarityOf(b.id);
    if(buckets[r]) buckets[r].push(b);
  });
  Object.keys(buckets).forEach(r => {
    buckets[r].sort((a,b) => {
      const aOnce = ONCE_ONLY.has(a.id) ? 0 : 1;
      const bOnce = ONCE_ONLY.has(b.id) ? 0 : 1;
      return aOnce - bOnce; // stabile Sort: nur Once-vs-Multi neu ordnen
    });
  });
  const have = (r) => buckets[r].filter(b => earnedIds.has(b.id)).length;
  const haveTotal = have('legendary')+have('rare')+have('common')+have('negative');
  const trigCount = earned.reduce((s,b)=>s+b.count,0);

  // ─── Tier-Counter-Bar (oben im Sheet) ───
  const pill = (r) => {
    const meta = RARITY_META[r];
    const h = have(r);
    const dim = h===0 ? 'dim' : '';
    return `<span class="tc-pill ${r} ${dim}"><span class="dot"></span><span class="n">${h} / ${meta.total}</span></span>`;
  };
  const counterHtml = `
    <div class="bsh-counter">
      ${pill('legendary')}
      ${pill('rare')}
      ${pill('common')}
      <span class="tc-sep"></span>
      ${pill('negative')}
    </div>`;

  // ─── Card-Renderer (eine Badge → eine Card) ───
  const renderCard = (b, r) => {
    const cnt = earnedIds.get(b.id) || 0;
    const unlocked = cnt > 0;
    const isRepeatable = !ONCE_ONLY.has(b.id);
    if(!unlocked){
      // Locked: neutral grau, Lock-Icon zentral, winziger Tier-Dot oben links
      return `<div class="bsh-card locked ${r}" data-bid="${esc(b.id)}">
        <span class="tier-dot"></span>
        <div class="bsh-card-ic">${svgI('lock')}</div>
        <div class="bsh-card-name">${esc(b.name)}</div>
        <div class="bsh-card-desc">${esc(b.desc)}</div>
      </div>`;
    }
    // Unlocked: Tier-Farbe + Akzent-Strich oben (per CSS)
    const meta = isRepeatable
      ? `<div class="bsh-card-count">×${cnt}</div>`
      : `<div class="bsh-card-once">Freigeschaltet</div>`;
    return `<div class="bsh-card unlocked ${r}" data-bid="${esc(b.id)}">
      <div class="bsh-card-ic">${badgeIc(b,'30px')}</div>
      <div class="bsh-card-name">${esc(b.name)}</div>
      <div class="bsh-card-desc">${esc(b.desc)}</div>
      ${meta}
    </div>`;
  };

  // Positive Tiers (Legendary → Rare → Common) zusammengefasst in einem Grid
  const positiveCards = ['legendary','rare','common']
    .flatMap(r => buckets[r].map(b => renderCard(b, r)))
    .join('');

  // Negative-Block separat mit Schande-Trennlinie
  const negativeCards = buckets.negative.map(b => renderCard(b, 'negative')).join('');
  const negativeBlock = negativeCards ? `
    <div class="bsh-neg-divider">
      <div class="bsh-neg-divider-line"></div>
      <div class="bsh-neg-divider-label"><span class="dot"></span>Schande</div>
      <div class="bsh-neg-divider-line"></div>
    </div>
    <div class="bsh-grid">${negativeCards}</div>` : '';

  openSheet(`
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
      ${avHtml(p,"width:48px;height:48px;border-radius:14px;font-size:18px")}
      <div>
        <h3>Auszeichnungen</h3>
        <div class="sheet-sub">${esc(p.name)} · <b style="color:var(--acid)">${haveTotal}</b> von ${BADGES.length} · ${trigCount}× ausgelöst</div>
      </div>
    </div>
    ${counterHtml}
    <div class="bsh-grid">${positiveCards}</div>
    ${negativeBlock}
    <button class="btn ghost sm" id="backToPlayer2" style="margin-top:18px">← Zurück zum Profil</button>
  `);
  const back = document.getElementById('backToPlayer2');
  if(back) back.onclick = () => closeSheet();
  // Badge-Card-Click → öffnet Detail-Popover ÜBER dem Sheet (Sheet bleibt offen!)
  document.querySelectorAll('.bsh-card[data-bid]').forEach(el => {
    el.onclick = () => showBadgePopover(el.dataset.bid, playerId);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BADGE-DETAIL-POPOVER
// ═══════════════════════════════════════════════════════════════════════════
// Layer ÜBER dem Auszeichnungen-Sheet (z-index 120+ > Sheet 100/101).
// Zwei Modi:
//   • Erreicht  → zeigt die Matches, in denen das Badge ausgelöst wurde
//                 (aus getBadgeEarnedCache). Jeder Match-Eintrag ist klickbar:
//                 schließt Popover UND Sheet, öffnet das Match-Detail.
//   • Locked    → zeigt Fortschritt für die wichtigsten quantifizierbaren
//                 Badges (Spiele, Streaks, Elo-Schwellen, Positions-Spiele).
//                 Für saison-/karriere-aggregierte Badges (POTD, POTW,
//                 award_collector, untouchable etc.) gibt's einen knappen
//                 "Noch nicht erreicht"-Hinweis statt Balken.
//
// Schließen: Backdrop-Click, ✕ Button, ESC. KEIN closeSheet — das darunter
// liegende Auszeichnungen-Sheet bleibt scrollbar und sucht-fähig.
// ═══════════════════════════════════════════════════════════════════════════

// Helper: Matches, in denen das Badge für DIESEN Spieler gefeuert wurde.
// Nutzt den globalen Badge-Earned-Cache (chronologischer Walk in §7.4).
// Für saison-/karriere-aggregierte Badges (kein fire-Trigger) ist die Liste
// leer — wir zeigen dann den count ohne Match-Liste.
function _badgeFireMatches(playerId, badgeId){
  const map = getBadgeEarnedCache();
  const hits = [];
  for(const mid in map){
    if(map[mid].some(e => e.playerId === playerId && e.badge.id === badgeId)){
      const mObj = matches.find(m => m.id === mid);
      if(mObj) hits.push(mObj);
    }
  }
  return hits.sort((a,b) => mts(b)-mts(a));
}

// Helper: Fortschritt für quantifizierbare Locked-Badges. Returnt
// {cur, tgt, label} oder null wenn kein einfacher Fortschritt definierbar ist.
function _badgeProgress(badgeId, playerId){
  const playerMs = matches.filter(m => matchOf(playerId, m));
  switch(badgeId){
    case 'first_match':
      return {cur: Math.min(playerMs.length, 1), tgt: 1, label: 'Spiele'};
    case 'games25':
      return {cur: Math.min(playerMs.length, 25), tgt: 25, label: 'Spiele'};
    case 'games150':
      return {cur: Math.min(playerMs.length, 150), tgt: 150, label: 'Spiele'};
    case 'def50': {
      const def = playerMs.filter(m => {
        const slot=m.a1===playerId?'a1':m.a2===playerId?'a2':m.b1===playerId?'b1':'b2';
        return m[slot+'_pos']==='def';
      }).length;
      return {cur: Math.min(def, 50), tgt: 50, label: 'Abwehr-Spiele'};
    }
    case 'atk50': {
      const atk = playerMs.filter(m => {
        const slot=m.a1===playerId?'a1':m.a2===playerId?'a2':m.b1===playerId?'b1':'b2';
        return m[slot+'_pos']==='atk';
      }).length;
      return {cur: Math.min(atk, 50), tgt: 50, label: 'Sturm-Spiele'};
    }
    case 'streak5':
    case 'streak10':
    case 'streak15':
    case 'streak20': {
      const best = longestPlayerStreak(playerId, matches);
      const tgts = {streak5:5, streak10:10, streak15:15, streak20:20};
      const tgt = tgts[badgeId];
      return {cur: Math.min(best, tgt), tgt, label: 'längste Serie'};
    }
    case 'climber_100':
    case 'dominator_400':
    case 'dynasty_600': {
      // Peak-Saison-Elo aus globalSim — überlebt Saison-Reset (= jemals erreicht).
      // start_elo abziehen, damit "0/100" intuitiv ist (nicht "1000/1100").
      const sim = getGlobalSim();
      const peakSaisonElo = sim.peakElo && sim.peakElo[playerId] != null
        ? Math.round(sim.peakElo[playerId] - cfg.start_elo)
        : 0;
      const tgts = {climber_100:100, dominator_400:400, dynasty_600:600};
      const tgt = tgts[badgeId];
      return {cur: Math.max(0, Math.min(peakSaisonElo, tgt)), tgt, label: 'Saison-Elo über Start'};
    }
    case 'allrounder': {
      // 20 Siege als Sturm UND 20 als Abwehr — wir zeigen den kleineren Wert
      const stats = playerStats(playerId);
      const atkW = stats.atkW || 0, defW = stats.defW || 0;
      const cur = Math.min(atkW, defW, 20);
      return {cur, tgt: 20, label: 'min. Sturm- & Abwehr-Siege'};
    }
    case 'mr_disaster': {
      // Aktuelle Saison: wie viele 0:10-Niederlagen hat der Spieler bereits?
      // Spiegel zu mr_perfect-Fortschritt (würde gleich aussehen).
      const sid = currentSeason().id;
      const seasonMs = matchesInSeason(sid);
      const disasters = seasonMs.filter(m => matchOf(playerId,m) && !won(playerId,m)
        && goalsFor(playerId,m)===0 && goalsAgainst(playerId,m)===10).length;
      return {cur: Math.min(disasters, 3), tgt: 3, label: '0:10 in aktueller Saison'};
    }
    // nemesis: siehe _badgeStreakState — dort als „Aktueller Lauf" (locked + unlocked).
  }
  return null;
}

// Aktueller (laufender) Zähler für Kontext-/Serien-Badges, der sich je nach
// Spielverlauf wieder zurücksetzt (z. B. „Zittersiege in Folge"). Anders als
// _badgeProgress (kumulativer Rekord/Bestwert) zeigt das den LEBENDEN Stand
// bis zum letzten Match — also wie nah der Spieler an der nächsten Auslösung ist.
// Reused die Loop-Logik der jeweiligen count*-Funktion, gibt aber den End-Wert
// des laufenden Zählers zurück statt der Anzahl der Auslösungen.
// Läuft nur beim Öffnen des Badge-Popovers (Klick) → keine Render-Hotpath-Kosten.
// Rückgabe: {cur, tgt, label, hint} · für Wochentag-Badges {weekdays:Set, tgt,
// label, kind:'weekday'} · sonst null (Badge hat keinen resettbaren Zähler).
function _badgeStreakState(badgeId, playerId){
  if(badgeId === 'award_collector'){
    // Reset pro Saison: laufender Stand der AKTUELLEN Saison (5 Tagessiege UND
    // 2 Wochensiege nötig). Wiederverwendung von countDayWins/countPeriodWins auf
    // den (bereits gecachten) Saison-Matches — beide schließen den laufenden Tag
    // bzw. die laufende Woche aus, zählen also nur abgeschlossene Perioden.
    const sid = currentSeason().id;
    const key = 'awColl_'+playerId+'_'+sid+'_'+matches.length+'_'+_cache.version;
    if(!_cache._awColl) _cache._awColl = {};
    let res = _cache._awColl[key];
    if(!res){
      const seasonMs = matchesInSeason(sid);
      res = { potd: countDayWins(playerId, seasonMs), potw: countPeriodWins(playerId, seasonMs, 'week') };
      _cache._awColl[key] = res;
    }
    return {
      kind:'dual',
      metrics:[
        {cur:res.potd, tgt:5, label:'Tagessiege'},
        {cur:res.potw, tgt:2, label:'Wochensiege'}
      ],
      hint:'Zählt nur die laufende Saison — beide Ziele nötig, Reset zu Saisonbeginn.'
    };
  }
  if(badgeId === 'allwetter'){
    // Wochentage, an denen bereits Player-of-the-Day — 1:1 aus countAllwetter,
    // aber wir behalten das Set (statt nur size≥5) für die Chip-Anzeige.
    const byDay = {};
    matches.forEach(m => {
      const day = mdayKey(m);
      if(!byDay[day]) byDay[day] = { ms: [], jsDate: new Date(m.created_at) };
      byDay[day].ms.push(m);
    });
    const today = new Date().toISOString().slice(0,10);
    const weekdays = new Set();
    Object.entries(byDay).forEach(([day, info]) => {
      if(day === today) return;       // laufender Tag zählt nicht
      if(info.ms.length < 2) return;  // POTD braucht min. 2 Spiele am Tag
      const winsById = {};
      info.ms.forEach(m => [m.a1,m.a2,m.b1,m.b2].forEach(pid => {
        if(!winsById[pid]) winsById[pid] = 0;
        const onA = (pid===m.a1||pid===m.a2);
        if((onA && m.winner==='A') || (!onA && m.winner==='B')) winsById[pid]++;
      }));
      const maxW = Math.max(...Object.values(winsById));
      if(maxW < 3) return;
      if((winsById[playerId]||0) === maxW) weekdays.add(info.jsDate.getDay());
    });
    return {weekdays, tgt:5, label:'Wochentage als Tagessieger', kind:'weekday'};
  }

  // Alle übrigen Fälle laufen chronologisch durch die Matches des Spielers.
  const ordered = matches.filter(m => matchOf(playerId,m))
    .sort((a,b) => mts(a)-mts(b));

  switch(badgeId){
    case 'nerves_of_steel': {
      // Zittersiege (10:9) in Folge — nicht-knappe Partien überspringen die Serie
      // ohne sie zu brechen; nur eine knappe Niederlage (9:10) setzt zurück.
      let cur = 0;
      ordered.forEach(m => {
        const gf=goalsFor(playerId,m), ga=goalsAgainst(playerId,m);
        const isClose=(gf===10&&ga===9)||(gf===9&&ga===10);
        if(!isClose) return;
        cur = won(playerId,m) ? cur+1 : 0;
      });
      return {cur, tgt:3, label:'Zittersiege in Folge', hint:'Setzt bei knapper Niederlage (9:10) zurück'};
    }
    case 'krimi': {
      // Partien mit Tordifferenz ≤ 2 in Folge — ein klares Ergebnis bricht die Serie.
      let cur = 0;
      ordered.forEach(m => {
        cur = Math.abs(m.score_a-m.score_b) <= 2 ? cur+1 : 0;
      });
      return {cur, tgt:5, label:'Krimis in Folge (Tordiff ≤ 2)', hint:'Setzt bei klarem Ergebnis (Tordiff > 2) zurück'};
    }
    case 'repeat_score': {
      // Siege mit identischem Endstand in Folge — Niederlage oder anderer Score bricht.
      let lastScore=null, cur=0;
      ordered.forEach(m => {
        if(!won(playerId,m)){cur=0;lastScore=null;return;}
        const score=goalsFor(playerId,m)+':'+goalsAgainst(playerId,m);
        if(score===lastScore) cur++; else {cur=1;lastScore=score;}
      });
      return {cur, tgt:3, label:'Siege mit gleichem Endstand in Folge', hint:'Setzt bei Niederlage oder anderem Ergebnis zurück'};
    }
    case 'losing5': {
      let cur=0;
      ordered.forEach(m => { cur = won(playerId,m) ? 0 : cur+1; });
      return {cur, tgt:5, label:'Niederlagen in Folge', hint:'Setzt bei einem Sieg zurück'};
    }
    case 'streak5': case 'streak10': case 'streak15': case 'streak20': {
      const tgts={streak5:5,streak10:10,streak15:15,streak20:20};
      let cur=0;
      ordered.forEach(m => { cur = won(playerId,m) ? cur+1 : 0; });
      return {cur, tgt:tgts[badgeId], label:'Siege in Folge', hint:'Setzt bei einer Niederlage zurück'};
    }
    case 'nemesis': {
      // Aktueller Niederlagen-Streak gegen denselben Gegner (max. über alle Gegner).
      const vs = {};
      ordered.forEach(m => {
        const onA = (playerId===m.a1||playerId===m.a2);
        const w = (onA && m.winner==='A') || (!onA && m.winner==='B');
        const opps = onA ? [m.b1,m.b2] : [m.a1,m.a2];
        if(w) opps.forEach(o => { vs[o] = 0; });
        else  opps.forEach(o => { vs[o] = (vs[o]||0) + 1; });
      });
      const cur = Object.values(vs).reduce((a,b) => a>b?a:b, 0);
      return {cur, tgt:5, label:'Niederlagen gg. denselben Gegner in Folge', hint:'Setzt bei einem Sieg gegen diesen Gegner zurück'};
    }
  }
  return null;
}

// Rendert den „Aktueller Lauf"-Abschnitt für ein Kontext-/Serien-Badge.
// Gibt '' zurück, wenn das Badge keinen resettbaren Zähler hat.
const _WEEKDAY_ABBR = ['Mo','Di','Mi','Do','Fr','Sa','So']; // Index = (getDay()+6)%7
function _badgeStreakSectionHtml(badgeId, playerId, rarity){
  const st = _badgeStreakState(badgeId, playerId);
  if(!st) return '';
  if(st.kind === 'dual'){
    // Zwei parallele Ziele (z. B. Award-Sammler: Tagessiege + Wochensiege).
    const bars = st.metrics.map(mt => {
      const done = mt.cur >= mt.tgt;
      const pct = Math.round(Math.min(mt.cur / mt.tgt, 1) * 100);
      return `
      <div class="bp-prog">
        <div class="bp-prog-bar"><div class="bp-prog-fill ${rarity}" style="width:${pct}%"></div></div>
        <div class="bp-prog-label">
          <span>${mt.cur} / ${mt.tgt} <span class="bp-prog-target">${esc(mt.label)}</span></span>
          <span>${done?'✓':pct+'%'}</span>
        </div>
      </div>`;
    }).join('');
    return `
      <div class="bp-section">Aktuelle Saison</div>
      ${bars}
      <div class="bp-run-hint">${esc(st.hint)}</div>`;
  }
  if(st.kind === 'weekday'){
    const have = st.weekdays.size;
    const chips = _WEEKDAY_ABBR.map((abbr, i) => {
      // i = (getDay()+6)%7 → 0=Mo … 6=So; zurückrechnen auf getDay()
      const jsDay = (i + 1) % 7;
      const on = st.weekdays.has(jsDay);
      return `<div class="bp-wd ${on?'on':''}">${abbr}</div>`;
    }).join('');
    return `
      <div class="bp-section">Wochentage gesammelt</div>
      <div class="bp-weekdays">${chips}</div>
      <div class="bp-run-label"><span>${have} / ${st.tgt} <span class="bp-prog-target">${esc(st.label)}</span></span></div>`;
  }
  const cur = st.cur || 0;
  const pct = Math.round(Math.min(cur / st.tgt, 1) * 100);
  return `
    <div class="bp-section">Aktueller Lauf</div>
    <div class="bp-prog">
      <div class="bp-prog-bar"><div class="bp-prog-fill ${rarity}" style="width:${pct}%"></div></div>
      <div class="bp-prog-label">
        <span>${cur} / ${st.tgt} <span class="bp-prog-target">${esc(st.label)}</span></span>
        <span>${pct}%</span>
      </div>
    </div>
    <div class="bp-run-hint">${esc(st.hint)}</div>`;
}

function showBadgePopover(badgeId, playerId){
  const b = BADGES.find(x => x.id === badgeId); if(!b) return;
  const r = rarityOf(b.id);
  const rarityLabel = (RARITY_META[r] && RARITY_META[r].label) || '';
  const earned = getCachedBadges(playerId);
  const cnt = (earned.find(e => e.id === badgeId)||{}).count || 0;
  const unlocked = cnt > 0;
  const ONCE_ONLY = new Set(['first_match','games25','games150','allrounder','def50','atk50',
    'climber_100','dominator_400','dynasty_600','allwetter']);
  const isRepeatable = !ONCE_ONLY.has(b.id);

  // ─── Body je nach Modus ───
  let bodyHtml;
  if(unlocked){
    // Match-Liste (für fire-basierte Badges)
    const hits = _badgeFireMatches(playerId, badgeId);
    if(hits.length){
      const maxShow = 8;
      const shown = hits.slice(0, maxShow);
      const rowsHtml = shown.map(m => {
        const date = new Date(m.created_at);
        const dateStr = date.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'});
        const onA = (playerId===m.a1||playerId===m.a2);
        const myGf = onA?m.score_a:m.score_b;
        const myGa = onA?m.score_b:m.score_a;
        const won = (onA&&m.winner==='A')||(!onA&&m.winner==='B');
        const col = won ? 'var(--acid)' : 'var(--red)';
        return `<div class="bp-match" data-mid="${esc(m.id)}">
          <div class="bp-match-date">${dateStr}</div>
          <div class="bp-match-score" style="color:${col}">${myGf} : ${myGa}</div>
          <div class="bp-match-arr">›</div>
        </div>`;
      }).join('');
      const moreHint = hits.length > maxShow
        ? `<div class="bp-more">+ ${hits.length - maxShow} weitere</div>` : '';
      bodyHtml = `
        <div class="bp-section">Ausgelöst in ${hits.length} ${hits.length===1?'Match':'Matches'}</div>
        ${rowsHtml}${moreHint}`;
    } else {
      // Saison-/Karriere-aggregierte Badges ohne fire-Trigger.
      // Wir zeigen einen kurzen Hinweis statt einer Liste.
      bodyHtml = `
        <div class="bp-section">Status</div>
        <div class="bp-locked-hint">
          Diese Auszeichnung wird über Saison-/Karriere-Daten ermittelt und
          ist nicht an ein einzelnes Match gebunden.
          ${isRepeatable
            ? `<br><br><span class="bp-locked-em">${cnt}×</span> bisher erreicht.`
            : `<br><br><span class="bp-locked-em">Freigeschaltet.</span>`}
        </div>`;
    }
  } else {
    // Locked — Fortschritt oder Hinweis
    const prog = _badgeProgress(badgeId, playerId);
    if(prog){
      const pct = Math.round(prog.cur / prog.tgt * 100);
      bodyHtml = `
        <div class="bp-section">Fortschritt</div>
        <div class="bp-prog">
          <div class="bp-prog-bar"><div class="bp-prog-fill ${r}" style="width:${Math.min(pct,100)}%"></div></div>
          <div class="bp-prog-label">
            <span>${prog.cur} / ${prog.tgt} <span class="bp-prog-target">${esc(prog.label)}</span></span>
            <span>${pct}%</span>
          </div>
        </div>`;
    } else {
      // Kein Fortschritt definierbar — knapper Hinweis
      bodyHtml = `
        <div class="bp-section">Status</div>
        <div class="bp-locked-hint">
          Noch <span class="bp-locked-em">nicht erreicht</span>.<br>
          Erfüll die Voraussetzung im nächsten Spiel oder über die Saison hinweg.
        </div>`;
    }
  }

  // Kontext-/Serien-Badges: laufender Zähler (resettet je nach Spielverlauf).
  // Erscheint zusätzlich zur Match-Liste/zum Fortschritt — sowohl locked als
  // auch unlocked, damit man sieht, wie nah man an der nächsten Auslösung ist.
  bodyHtml += _badgeStreakSectionHtml(badgeId, playerId, r);

  // Status-Pill rechts oben in der Card (×N oder "Freigeschaltet")
  const statusHtml = unlocked
    ? (isRepeatable
        ? `<div class="bp-status"><div class="bp-status-count" style="color:${{legendary:'var(--gold)',rare:'var(--purple)',common:'var(--acid)',negative:'var(--red)'}[r]||'var(--ink)'}">×${cnt}</div><div class="bp-status-label">erreicht</div></div>`
        : `<div class="bp-status"><div class="bp-status-count" style="color:${{legendary:'var(--gold)',rare:'var(--purple)',common:'var(--acid)',negative:'var(--red)'}[r]||'var(--ink)'}">✓</div><div class="bp-status-label">freigeschaltet</div></div>`)
    : '';

  const bp = document.getElementById('bp');
  const bpBg = document.getElementById('bpBg');
  bp.innerHTML = `
    <div class="bp-head">
      <div class="bp-ic ${unlocked?r:'locked'}">${unlocked ? badgeIc(b, '24px') : svgI('lock')}</div>
      <div style="flex:1;min-width:0">
        <div class="bp-title">${esc(b.name)}</div>
        <div class="bp-desc">${esc(b.desc)}</div>
        <div class="bp-rarity">${esc(rarityLabel)}</div>
      </div>
      ${statusHtml}
    </div>
    ${bodyHtml}
    <button class="bp-close" id="bpCloseBtn">Schließen</button>
  `;
  bpBg.classList.add('show');
  bp.scrollTop = 0;
  // Match-Click: schließt POPOVER und SHEET, öffnet Match-Detail
  bp.querySelectorAll('.bp-match[data-mid]').forEach(el => {
    el.onclick = () => {
      const mid = el.dataset.mid;
      closeBadgePopover();
      sheetNav(() => showMatchDetail(mid)); // Match-Detail über das aktuelle Sheet stapeln
    };
  });
  document.getElementById('bpCloseBtn').onclick = closeBadgePopover;
}

function closeBadgePopover(){
  const bpBg = document.getElementById('bpBg');
  if(bpBg) bpBg.classList.remove('show');
}

