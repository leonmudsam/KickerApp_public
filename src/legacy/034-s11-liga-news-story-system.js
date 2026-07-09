// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  §11  LIGA NEWS / STORY-SYSTEM                                        ║
// ║  ───────────────────────────────────────────────────────────────────  ║
// ║  Erzeugt redaktionelle "Schlagzeilen" aus bestehenden Liga-Daten.     ║
// ║  KEINE neuen Berechnungen — nur Interpretation existierender Caches.  ║
// ║                                                                       ║
// ║   §11.1  Story-Generator (alle Typen)                                 ║
// ║   §11.2  Cache (versionsgebunden an matches.length + _cache.version)  ║
// ║   §11.3  LocalStorage (Read-State, Ring-Buffer max 200)               ║
// ║   §11.4  Header-Badge-Refresh                                         ║
// ║   §11.5  Mini-Popup (newsPopover)                                     ║
// ║   §11.6  Voller Feed mit Filter (newsFeedFull)                        ║
// ║   §11.7  Story-Detail (newsDetail) — dynamisch je Typ                 ║
// ╚═══════════════════════════════════════════════════════════════════════╝

// ─── §11.0 — Konstanten ──────────────────────────────────────────────
// News-Debug-Flag (v8.4): hält console-Logs des News-Systems aus der
// Produktiv-Konsole heraus. Standard: aus. Zur Laufzeit aktivierbar über
// DevTools — KEIN Reload nötig:  window.NEWS_DEBUG = true
// Alle News-Logs laufen über `if(NEWS_DEBUG || window.NEWS_DEBUG) console…`.
const NEWS_DEBUG = false;

// Kategorien (Filter-Pills + CSS-Klassen über `nv-cat-${cat}`).
// label = Anzeige im Filter; descLabel = im Detail- und Story-Header.
const NEWS_CATEGORIES = {
  // v9: „Breaking" ist KEIN eigener Generator-Typ, sondern eine ANZEIGE-Kategorie.
  // _isBreaking() promotet die ultra-seltenen, liga-relevanten Ereignisse
  // (neuer Spitzenreiter, Platz-1-Duell, legendäres Badge, Saison-Klimax)
  // display-seitig hierher — wirkt auf bestehende UND neue persistierte Rows.
  breaking:   {label:'Breaking',    descLabel:'Breaking News',    ic:'bolt'},
  highlight:  {label:'Highlights',  descLabel:'Highlight',        ic:'crown'},
  season:     {label:'Saison',      descLabel:'Saison',           ic:'rocket'},
  badge:      {label:'Awards',      descLabel:'Badge & Awards',   ic:'medalTrio'},
  fun:        {label:'Fun Facts',   descLabel:'Fun Fact',         ic:'thriller'},
  rivalry:    {label:'Rivalität',   descLabel:'Rivalität',        ic:'crossedSwords'},
  team:       {label:'Teams',       descLabel:'Team',             ic:'users'},
  comeback:   {label:'Comebacks',   descLabel:'Comeback',         ic:'comeback'},
  personal:   {label:'Persönlich',  descLabel:'Persönlich',       ic:'trendUp'},
  history:    {label:'Historie',    descLabel:'Historie',         ic:'calendar'},
  misfortune: {label:'Pechvogel',   descLabel:'Pechvogel',        ic:'dramaTear'},
};

// LocalStorage-Keys (versioniert für künftige Migrations)
const NEWS_LS_SEEN  = 'eso_news_seen_v1';
const NEWS_LS_TOAST = 'eso_news_toast_v1';  // v8.1: zeitstempel + count des letzten Toasts
const NEWS_LS_MAX_SEEN = 200; // Ring-Buffer-Limit
const NEWS_TOAST_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h zwischen identischen Toast-Counts

// Generator-Limits — Schutz gegen zu viele Stories pro Typ
const NEWS_LIMITS = {
  // v9.4: bewusst kleiner → weniger News-Flut direkt nach Matches.
  topForm: 2,       // max Spieler "in Top-Form" gleichzeitig
  lossStreak: 2,
  jubilee: 3,
  badgeUnlocked: 6, // letzte N freigeschalteten Badges
  rivalry: 2,
  total: 50,        // harte Obergrenze des Feeds (nach Prio-Filter)
};

// Ambiente Fun-Fact-Stories (v8.5, v9.5) — Fun Facts / persönliche Nuggets,
// damit der Feed auch ohne neue Matches lebt.
//   RHYTHMUS (v9.7): TÄGLICH zwei Fun Facts — um 10:00 (Vormittag) und um
//                    19:00 (Feierabend). Früher (v9.6) nur abends einer.
//                    _isAmbientDay ist immer true → jeder Tag hat die Slots.
//   AMBIENT_SLOTS  = die Slot-Stunden; je Slot erscheint eine eigene Story,
//                    jeweils erst ab dieser Uhrzeit.
//   Anti-Spam:     IDs sind tages+stunden-deterministisch (`ambient_<datum>_<stunde>`)
//                  → ON CONFLICT DO NOTHING → keine Doppel über Geräte/Syncs.
//                  Die beiden Slots eines Tages zeigen nie denselben Typ.
//   Auswahl:       tages-seeded gezogen (Pseudo-Zufall, überall identisch) plus
//                  COOLDOWN: zuletzt (letzte AMBIENT_COOLDOWN_DAYS Tage)
//                  verwendete Fun-Fact-Typen werden gesperrt → Rotation statt
//                  vorhersehbarer Reihenfolge, keine schnellen Wiederholungen.
const AMBIENT_SLOTS = [10, 19];
// Cooldown-Fenster (Tage): so lange wird ein bereits gezeigter Fun-Fact-Typ
// nicht erneut gewählt. Bei 2 Fun Facts / Tag sperrt das die letzten ~14 Typen
// (der Pool hat 18) → genug Rotation, keine schnellen Wiederholungen.
const AMBIENT_COOLDOWN_DAYS = 7;
// v9.14: Spieler-Cooldown (Tage). Der Typ-Cooldown verhindert nur gleiche
// TYPEN — bei einem dominanten Spieler zeigen aber viele VERSCHIEDENE
// Superlative (Sturm-Chef, Elo-Leader, Torschützenkönig …) auf denselben Kopf,
// sodass tagelang derselbe Name erscheint. Ein zuletzt gefeierter Spieler wird
// darum für dieses Fenster gemieden (Notnagel-Pass erlaubt ihn nur, wenn sonst
// kein Template Daten liefert) → echte Namens-Rotation.
const AMBIENT_PLAYER_COOLDOWN_DAYS = 2;
// Auto-Sync-Intervall, damit neue Slots ohne Reload auftauchen (ms).
const NEWS_AUTOSYNC_MS = 10 * 60 * 1000;

// ─── §11.0b — Badge-Whitelist (v8.1) ─────────────────────────────────
// Nur seltene & besondere Badges erzeugen News. Common-Badges sind in der
// Liga zu häufig und würden den Feed verstopfen ("Achievement-Spam").
// Negative: nur die wirklich krassen (perfect_loss, mr_disaster, nemesis),
// nicht die alltäglichen wie bitter_loss/krimi_loser.
//
// PFLEGEHINWEIS: bei neuen Badges (§7.1) hier ergänzen, wenn sie als News
// auftauchen sollen. Default: nicht-newsworthy (bewusste Entscheidung).
const NEWS_BADGE_WHITELIST = new Set([
  // Legendary — alle 10 sind News-würdig
  'dynasty_600','dominator_400','award_collector','perfect_win','streak15','streak20',
  'untouchable','mr_perfect','allwetter','godly_streak',
  // Rare — kuratierte Auswahl: nur die mit besonderer Story
  'wall_badge','upset_king','unbeatable','streak10','vice_champion','potw','krimi',
  'games150', // "Legende" (150 Matches) — Karriere-Meilenstein, v8.6 ergänzt
  // Negative — nur die seltenen, "krassen" Niederlagen
  'mr_disaster','nemesis','perfect_loss',
  // v9.5: explizit als News gewünscht (negativ, aber „immer newsworthy")
  'krimi_loser', // Krimi-Versager — 3 knappe Niederlagen in Folge
  'losing5',     // Losing Streak — 5 Niederlagen in Folge
  // Hinweis: Die gewünschten POSITIVEN Auszeichnungen (Nerven aus Stahl,
  // Wiederholungstäter, Krimi-Reihe, 10er Serie) sind bereits 'rare' und
  // laufen daher ohnehin über die generische Badge-News-Regel unten.
]);

// ─── §11.1 — Story-Generator ─────────────────────────────────────────
// v9.4: All-Time-Ligarekorde für Breaking News (Elo-Höchststand & längste
// Siegesserie), plus der Zeitpunkt (Match), an dem der aktuelle Rekord
// aufgestellt wurde. Ein O(N_matches)-Lauf, gecacht per matches.length+version.
//   • Elo: aus globalSim.history (season-isoliertes eloAfter) — der höchste je
//     erreichte Wert und das Match, das ihn zuletzt neu setzte.
//   • Serie: eigener Karriere-Walk (kein Saison-Reset — „jemals").
function _allTimeRecords(){
  const key = 'allTimeRec_'+matches.length+'_'+_cache.version;
  if(_cache._allTimeRecKey === key) return _cache._allTimeRec;
  const startElo = cfg.start_elo ?? 0;
  let eloRec = null;    // {val, pid, matchId}
  let streakRec = null; // {val, pid, matchId}
  try {
    const sim = getGlobalSim();
    let runMax = startElo;
    for(const h of (sim.history || [])){
      const after = h.eloAfter;
      if(!after) continue;
      for(const pid in after){
        if(after[pid] > runMax + 1e-6){
          runMax = after[pid];
          eloRec = { val: Math.round(after[pid]), pid, matchId: h.matchId };
        }
      }
    }
  } catch(e){}
  try {
    const cur = {};
    let maxStreak = 0;
    for(const m of matches){
      const aWon = m.winner === 'A';
      const sides = [[m.a1, m.a2, aWon], [m.b1, m.b2, !aWon]];
      for(const [x, y, won] of sides){
        for(const id of [x, y]){
          if(!id) continue;
          cur[id] = won ? (cur[id] || 0) + 1 : 0;
          if(cur[id] > maxStreak){ maxStreak = cur[id]; streakRec = { val: cur[id], pid: id, matchId: m.id }; }
        }
      }
    }
  } catch(e){}
  // Zeitstempel des Rekord-Matches nachtragen.
  const mm = {};
  for(const m of matches) mm[m.id] = m;
  if(eloRec && mm[eloRec.matchId]) eloRec.when = mm[eloRec.matchId].created_at;
  if(streakRec && mm[streakRec.matchId]) streakRec.when = mm[streakRec.matchId].created_at;
  const result = { eloRec, streakRec };
  _cache._allTimeRecKey = key;
  _cache._allTimeRec = result;
  return result;
}

// ─── §11.0c — Unbegrenzte Meilenstein-Leiter (v9.5) ──────────────────
// Ersetzt feste Schwellen-Arrays (…, 500, 1000 → ENDE) durch eine Leiter
// nach dem 1–2.5–5 ×10^k-Muster: 10, 25, 50, 100, 250, 500, 1000, 2500,
// 5000, 10000, 25000, 50000, … So laufen Meilensteine bei hohen Zahlen
// sinnvoll weiter, statt an einer Obergrenze zu enden.
//   `_ladderCrossing(before, after, min)` = die höchste Leiter-Marke, die
//   zwischen `before` (exkl.) und `after` (inkl.) NEU überschritten wurde,
//   sonst null. So feuert eine Meilenstein-News genau auf dem Match, das die
//   Marke reißt — idempotent (ID enthält die Marke) und ohne Verlaufs-Backfill.
function _ladderCrossing(before, after, min){
  min = min || 1;
  if(!Number.isFinite(after) || after < min) return null;
  let hit = null, p = 1;
  while(p <= after){
    for(const r of [1, 2.5, 5]){
      const v = r * p;
      if(Number.isInteger(v) && v >= min && v > before && v <= after){
        if(hit === null || v > hit) hit = v;
      }
    }
    p *= 10;
  }
  return hit;
}

// Ambient-Tag (v9.6): Fun Facts erscheinen TÄGLICH (um 19:00). Früher (v9.5)
// nur alle 2 Tage über einen geraden Epoch-Tagesindex — jetzt ist jeder Tag ein
// Ambient-Tag, damit jeden Abend genau 1 Fun Fact kommt. Die Story-ID bleibt
// tages-deterministisch (`ambient_<datum>_19`) → geräteübergreifend identisch.
function _isAmbientDay(d){
  return true;
}

// ─── §11.0d — Persönliche Elo-Meilensteine (v9.5) ────────────────────
// Allzeit-Höchst-Elo eines Spielers überschreitet eine runde 100er-Marke
// (ab Start-Elo + 200, danach unbegrenzt: 1200, 1300, 1400, …). Ein
// O(N)-Walk über die (saison-isolierte) Elo-Historie, gecacht per
// matches.length + _cache.version. Liefert pro (Spieler, Marke) das Match,
// das die Marke erstmals riss — der Generator filtert danach auf „kürzlich".
function _eloMilestones(){
  const key = 'eloMile_'+matches.length+'_'+_cache.version;
  if(_cache._eloMileKey === key) return _cache._eloMile;
  const startElo = cfg.start_elo ?? 1000;
  const floor0 = startElo + 200;          // erste Marke
  const markOf = v => { const m = Math.floor(v/100)*100; return m >= floor0 ? m : null; };
  const out = [];
  try {
    const sim = getGlobalSim();
    const mm = {};
    for(const m of matches) mm[m.id] = m;
    const runMax = {};    // pid → laufendes Allzeit-Peak
    const firedFor = {};  // pid → höchste bereits erfasste Marke
    for(const h of (sim.history || [])){
      const after = h.eloAfter;
      if(!after) continue;
      for(const pid in after){
        const v = after[pid];
        if(v <= (runMax[pid] ?? startElo)) continue;
        runMax[pid] = v;
        const mark = markOf(v);
        if(mark != null && mark > (firedFor[pid] || 0)){
          firedFor[pid] = mark;
          out.push({ pid, mark, matchId: h.matchId, when: mm[h.matchId] ? mm[h.matchId].created_at : null, val: Math.round(v) });
        }
      }
    }
  } catch(e){}
  _cache._eloMileKey = key;
  _cache._eloMile = out;
  return out;
}

// Iteriert genau einmal über bestehende Caches. Gibt ein Array von
// Story-Objekten {id, cat, ic, title, desc, when, prio, dataRef} zurück.
// Performance: O(N_matches) — dominante Kosten durch top-form-Filterung,
// die aber auf die letzten 10 Matches pro Spieler eingeschränkt ist.
function _buildStories(){
  const stories = [];
  const now = new Date();
  const pm = pmap();
  const nameOf = pid => (pm[pid] && pm[pid].name) || '?';
  const sortedMatches = [...matches].sort((a,b)=>mts(b)-mts(a)); // neueste zuerst

  // ── ISO-Wochen-Helper (v8.3) ──
  // Liefert "2026-W26" als stabile Pro-Woche-Kennung. Vermeidet, dass
  // "Ruhige Woche"-Stories täglich neu erzeugt werden. ISO-Wochen starten
  // Montag → eine Woche ergibt EINE Story, nicht sieben.
  const isoWeek = (d) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
    return t.getUTCFullYear() + '-W' + String(weekNum).padStart(2, '0');
  };
  const todayKey = now.toISOString().slice(0,10);
  const weekKey  = isoWeek(now);

  // ── Abgeschlossene Zeiträume (v9.5) ──
  // Superlativ-Stories ("größter Elo-Gewinner/-Verlierer", "höchster Sieg",
  // "Krimi", "Upset" … der Woche/des Tages) dürfen sich NUR auf einen bereits
  // ABGESCHLOSSENEN Zeitraum beziehen. Sonst ist die Aussage nicht belastbar —
  // mitten am Tag/in der Woche kann sich der „Gewinner" noch ändern. Wir
  // rechnen deshalb auf „gestern" (voller Kalendertag) bzw. die „vergangene
  // Woche" (letzte abgeschlossene ISO-Woche, Mo–So).
  const _dayMs = 86400000;
  const _startOfToday     = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const _startOfYesterday = _startOfToday - _dayMs;
  const _weekStartOf = (ts) => { const x = new Date(ts); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x.getTime(); };
  const _thisWeekStart = _weekStartOf(now.getTime());
  const _prevWeekStart = _thisWeekStart - 7*_dayMs;
  const _yesterdayKey  = new Date(_startOfYesterday).toISOString().slice(0,10);
  const _lastWeekKey   = isoWeek(new Date(_prevWeekStart));

  // ── Memoization (v8.4) ──
  // _buildStories ist teuer (~67ms @1k×12 Spieler, ~244ms @10k×20). Solange
  // sich weder Match-Zahl noch _cache.version noch ISO-Woche noch Tag ändern,
  // liefert der Generator dasselbe Ergebnis → Cache zurückgeben, Generator
  // KOMPLETT überspringen. Bei Match-Insert ändert sich matches.length, bei
  // Recalc/Config _cache.version → Key bricht automatisch.
  // Explizite Invalidierung zusätzlich über invalidateCache(['news']) in §3.
  // Slot-Signatur (v8.5): wie viele Ambient-Slots heute schon "offen" sind.
  // Steigt über den Tag (z.B. 0→1 um 12:00, 1→2 um 19:00) und bricht so den
  // Memo-Key, sobald ein neuer Slot fällig wird — auch ohne neues Match.
  // v9.7: zwei Fun-Fact-Slots (10:00 & 19:00) sind täglich offen. Die Signatur
  // zählt, wie viele Slots heute schon fällig sind (0→1 um 10:00, 1→2 um 19:00)
  // und bricht den Memo-Key, sobald ein neuer Slot fällig wird — ohne neues Match.
  const _ambientSlotSig = _isAmbientDay(now) ? AMBIENT_SLOTS.filter(h => now.getHours() >= h).length : 0;
  // Morgen-Slot (07:00): POTW/POTD-Stories dürfen erst AB 07:00 erscheinen (nicht
  // schon nachts um 00:xx). Die Signatur kippt 0→1 um 07:00 und bricht dann den
  // Memo-Key, damit die Story ohne neues Match / ohne Reload auftaucht — analog
  // zum 19:00-Slot.
  const _morningSlotSig = now.getHours() >= 7 ? 1 : 0;
  const _buildStoriesKey = matches.length + '_' + _cache.version + '_' + weekKey + '_' + todayKey + '_' + _ambientSlotSig + '_' + _morningSlotSig;
  if(_cache._buildStoriesKey === _buildStoriesKey && Array.isArray(_cache._buildStoriesResult)){
    return _cache._buildStoriesResult;
  }

  // ── Helper-Refs einmalig (v8.4) ──
  // getHistoryByMatchId() und getRankSnapshots() sind bereits gecached, aber
  // jeder Aufruf prüft den Cache-Key neu. Einmal pro Generator-Lauf
  // referenzieren spart wiederholten Lookup-Overhead — mehrere Story-Typen
  // (elo_swing_week, elo_swing_day, upset_match, Führungswechsel) brauchen sie.
  const histMap = getHistoryByMatchId();
  const snaps   = getRankSnapshots();

  // ── Pre-Group: matches pro Spieler ──
  // O(N) statt O(N × N_players) für jeden späteren filter()-Aufruf.
  // matches ist asc-sortiert (loadAll) → byPlayer[pid] ist ebenfalls asc.
  // Bei 100k Matches × 50 Spielern: ~400k push-ops vs ~50M filter-ops.
  const byPlayer = {};
  matches.forEach(m => {
    const ids = [m.a1, m.a2, m.b1, m.b2];
    for(let i=0; i<4; i++){
      const pid = ids[i];
      if(!byPlayer[pid]) byPlayer[pid] = [];
      byPlayer[pid].push(m);
    }
  });

  // ── 1. Saison-Endspurt ──
  // Letzte 7 Tage einer Saison + min. 2 Spieler im Saison-Top mit kleinem Abstand.
  try {
    const daysLeft = seasonDaysLeft();
    if(daysLeft > 0 && daysLeft <= 7){
      const sid = currentSeason().id;
      const sim = getGlobalSim();
      const endElos = sim.elo || {};
      const playedMap = (sim.seasonPlayed && sim.seasonPlayed[sid]) || {};
      const rankList = Object.keys(endElos)
        .filter(pid => pm[pid] && !pm[pid].hidden && (playedMap[pid]||0) > 0)
        .map(pid => ({pid, elo: Math.round(endElos[pid])}))
        .sort((a,b)=>b.elo-a.elo);
      if(rankList.length >= 2){
        const gap = rankList[0].elo - rankList[1].elo;
        stories.push({
          id: 'season_endspurt_'+sid,
          cat: 'highlight',
          ic: 'rocket',
          title: `Noch ${daysLeft} ${daysLeft===1?'Tag':'Tage'}!`,
          desc: gap <= 50
            ? `Die Top 2 trennen nur ${gap} Elo. Das wird knapp.`
            : `Saison-Endspurt: ${nameOf(rankList[0].pid)} führt mit ${gap} Elo Vorsprung.`,
          when: now,
          prio: gap <= 15 ? 10 : (gap <= 50 ? 9 : 7),
          dataRef: {type:'season_endgame', sid, leader:rankList[0], second:rankList[1], daysLeft, gap}
        });
      }
    }
  } catch(e){ /* defensiv */ }

  // ── 2. Saisonstart ──
  // Aktuelle Saison startete in den letzten 3 Tagen.
  try {
    const sStart = seasonStart();
    const ageDays = Math.floor((now - sStart) / 86400000);
    if(ageDays >= 0 && ageDays <= 3){
      stories.push({
        id: 'season_start_'+currentSeason().id,
        cat: 'season',
        ic: 'rocket',
        title: ageDays === 0 ? 'Neue Saison ist gestartet!' : `Saison läuft seit ${ageDays} ${ageDays===1?'Tag':'Tagen'}`,
        desc: `${currentSeason().label} — alle Elo-Stände wurden zurückgesetzt. Die Jagd beginnt von vorn.`,
        when: sStart,
        prio: ageDays === 0 ? 8 : 5,
        dataRef: {type:'season_start', sid: currentSeason().id}
      });
    }
  } catch(e){}

  // ── 3. Führungswechsel ──
  // Vergleicht aktuellen Top-1 der Saison mit dem Top-1 vor 10 Matches.
  try {
    const sid = currentSeason().id;
    const seasonMs = matchesInSeason(sid);
    if(seasonMs.length >= 4){
      // Aktueller Top-1
      const sim = getGlobalSim();
      const endElos = sim.elo || {};
      const playedMap = (sim.seasonPlayed && sim.seasonPlayed[sid]) || {};
      const cur = Object.keys(endElos)
        .filter(pid => pm[pid] && !pm[pid].hidden && (playedMap[pid]||0) > 0)
        .map(pid => ({pid, elo: Math.round(endElos[pid])}))
        .sort((a,b)=>b.elo-a.elo);
      // Letztes Match → preRank des letzten Matches (= "Stand vor dem letzten Spiel")
      // Top-1 davor: aus preRank des letzten Matches der Saison
      const lastSeasonMatch = [...seasonMs].sort((a,b)=>mts(b)-mts(a))[0];
      const snap = lastSeasonMatch && snaps[lastSeasonMatch.id];
      if(cur.length && snap && snap.preRank){
        let prevTop = null;
        for(const pid in snap.preRank){
          if(snap.preRank[pid] === 1){ prevTop = pid; break; }
        }
        if(prevTop && prevTop !== cur[0].pid && pm[prevTop] && pm[cur[0].pid]){
          stories.push({
            id: 'lead_change_'+sid+'_'+lastSeasonMatch.id,
            cat: 'highlight',
            ic: 'kingClass',
            title: `Neuer Spitzenreiter: ${nameOf(cur[0].pid)}`,
            desc: `Nach dem letzten Spiel ist ${nameOf(cur[0].pid)} neuer Spitzenreiter — vor ${nameOf(prevTop)}.`,
            when: new Date(lastSeasonMatch.created_at),
            prio: 10,
            dataRef: {type:'lead_change', newLeader: cur[0].pid, prevLeader: prevTop, matchId: lastSeasonMatch.id}
          });
        }
      }
    }
  } catch(e){}

  // ── 3b. Team-News: gemeinsame Siegesserie eines Duos (v9.1, v9.5) ──
  // Match-getriggert (when = Match-Zeit) → erscheint direkt „nach Spielen".
  // Nur bei Meilenstein-Serienlängen, damit es nicht nach jedem Sieg spammt.
  // v9.5: erst ab 5 gemeinsamen Siegen (vorher 3) — 3 war zu schnell erreicht.
  // Ein Pass über alle Matches (matches ist asc-sortiert) → O(N).
  try {
    const TEAM_STREAK_MS = new Set([5,7,10,15,20]);
    const tstate = {}; // teamKey → {cur, ids, lastT}
    for(const m of matches){
      const sides = [[m.a1,m.a2,m.winner==='A'],[m.b1,m.b2,m.winner==='B']];
      for(const [x,y,won] of sides){
        if(!x || !y) continue;
        const ids = [x,y].sort(), k = ids.join('|');
        if(!tstate[k]) tstate[k] = {cur:0, ids};
        tstate[k].cur = won ? tstate[k].cur + 1 : 0;
        tstate[k].lastT = new Date(m.created_at);
      }
    }
    const teamCands = Object.values(tstate).filter(t =>
      TEAM_STREAK_MS.has(t.cur) &&
      pm[t.ids[0]] && pm[t.ids[1]] && !pm[t.ids[0]].hidden && !pm[t.ids[1]].hidden);
    teamCands.sort((a,b) => b.cur - a.cur || b.lastT - a.lastT);
    teamCands.slice(0, 3).forEach(t => {
      stories.push({
        id: 'team_streak_'+t.ids.join('_')+'_'+t.cur,
        cat: 'team',
        ic: 'unstoppable',
        title: `${nameOf(t.ids[0])} & ${nameOf(t.ids[1])} sind als Team nicht zu stoppen`,
        desc: `${t.cur} gemeinsame Siege in Folge — dieses Duo harmoniert gerade perfekt.`,
        when: t.lastT,
        prio: t.cur >= 7 ? 9 : 8,
        dataRef: {type:'team_streak', a:t.ids[0], b:t.ids[1], streak:t.cur}
      });
    });
  } catch(e){}

  // ── 3c. Team-News: gemeinsame Niederlagenserie eines Duos (v9.5) ──
  // Pendant zu 3b, aber ab 3 gemeinsamen Niederlagen in Folge. Gleiche
  // Mechanik (Match-getriggert, Meilenstein-Serienlängen, O(N)).
  try {
    const TEAM_LOSS_MS = new Set([3,5,7,10]);
    const lstate = {}; // teamKey → {cur, ids, lastT}
    for(const m of matches){
      const sides = [[m.a1,m.a2,m.winner==='A'],[m.b1,m.b2,m.winner==='B']];
      for(const [x,y,won] of sides){
        if(!x || !y) continue;
        const ids = [x,y].sort(), k = ids.join('|');
        if(!lstate[k]) lstate[k] = {cur:0, ids};
        lstate[k].cur = won ? 0 : lstate[k].cur + 1;
        lstate[k].lastT = new Date(m.created_at);
      }
    }
    const lossCands = Object.values(lstate).filter(t =>
      TEAM_LOSS_MS.has(t.cur) &&
      pm[t.ids[0]] && pm[t.ids[1]] && !pm[t.ids[0]].hidden && !pm[t.ids[1]].hidden);
    lossCands.sort((a,b) => b.cur - a.cur || b.lastT - a.lastT);
    lossCands.slice(0, 3).forEach(t => {
      stories.push({
        id: 'team_loss_streak_'+t.ids.join('_')+'_'+t.cur,
        cat: 'team',
        ic: 'trendCrash',
        title: `${nameOf(t.ids[0])} & ${nameOf(t.ids[1])} kommen als Team nicht in Tritt`,
        desc: `${t.cur} gemeinsame Niederlagen in Folge — dieses Duo braucht dringend einen Befreiungsschlag.`,
        when: t.lastT,
        prio: t.cur >= 7 ? 7 : 6,
        dataRef: {type:'team_loss_streak', a:t.ids[0], b:t.ids[1], streak:t.cur}
      });
    });
  } catch(e){}

  // ── 4. Top-Form (≥8/10 letzte Spiele) ──
  // Iteriert über aktive Spieler, schaut letzte 10 Matches → Win-Rate.
  // O(N_players × min(10, matches_per_player)) — sehr günstig.
  try {
    const candidates = [];
    activePlayers().forEach(p => {
      // byPlayer ist asc-sortiert (=ältestes first). Letzte 10 = slice(-10), für Recency desc reversen.
      const arr = byPlayer[p.id] || [];
      if(arr.length < 10) return;
      const last10 = arr.slice(-10);
      const wins = last10.filter(m => won(p.id, m)).length;
      if(wins >= 9){ // v8.8: 8→9 — nur noch echte Top-Form (9-10/10) ist News
        candidates.push({pid: p.id, wins, when: new Date(last10[last10.length-1].created_at)});
      }
    });
    candidates.sort((a,b) => b.wins - a.wins || b.when - a.when);
    candidates.slice(0, NEWS_LIMITS.topForm).forEach(c => {
      stories.push({
        id: 'top_form_'+c.pid+'_'+c.when.toISOString().slice(0,10),
        cat: 'highlight',
        ic: 'flame',
        title: `${nameOf(c.pid)} in Top-Form`,
        desc: `${c.wins} Siege aus den letzten 10 Spielen. Aktuell kaum zu stoppen.`,
        when: c.when,
        prio: c.wins === 10 ? 8 : (c.wins === 9 ? 7 : 6),
        dataRef: {type:'top_form', pid: c.pid, wins: c.wins}
      });
    });
  } catch(e){}

  // ── 5. Niederlagenserie (≥5 in Folge, aktuell laufend) ──
  // Nur Spieler, deren JÜNGSTES Match Niederlage war + Serie ≥ 5.
  try {
    const candidates = [];
    activePlayers().forEach(p => {
      // byPlayer asc → von hinten iterieren = neueste zuerst. Frühzeitig brechen.
      const arr = byPlayer[p.id] || [];
      if(!arr.length) return;
      let streak = 0;
      for(let i = arr.length - 1; i >= 0; i--){
        if(won(p.id, arr[i])) break;
        streak++;
        if(streak > 12) break; // Schutz
      }
      if(streak >= 5){
        candidates.push({pid: p.id, streak, when: new Date(arr[arr.length-1].created_at)});
      }
    });
    candidates.sort((a,b) => b.streak - a.streak);
    candidates.slice(0, NEWS_LIMITS.lossStreak).forEach(c => {
      stories.push({
        id: 'loss_streak_'+c.pid+'_'+c.when.toISOString().slice(0,10),
        cat: 'misfortune',
        ic: c.streak >= 7 ? 'dropTriple' : 'dropDouble',
        title: `${nameOf(c.pid)} im Pleiten-Modus`,
        desc: `${c.streak} Niederlagen in Folge. Der Knoten muss platzen.`,
        when: c.when,
        prio: c.streak >= 8 ? 6 : 4,
        dataRef: {type:'loss_streak', pid: c.pid, streak: c.streak}
      });
    });
  } catch(e){}

  // ── 6. Badge freigeschaltet (letzte 7 Tage) ──
  // Tap-Quelle: getBadgeEarnedCache. Wir zeigen die NEUSTEN N freigeschalteten,
  // Dubletten pro Spieler+Badge dedupliziert.
  try {
    const cutoff = now.getTime() - 7*86400000;
    const bMap = getBadgeEarnedCache();
    const events = [];
    for(const mid in bMap){
      const arr = bMap[mid];
      if(!arr || !arr.length) continue;
      const matchObj = matches.find(m => m.id === mid);
      if(!matchObj) continue;
      const t = mts(matchObj);
      if(t < cutoff) continue;
      arr.forEach(e => events.push({...e, when: new Date(matchObj.created_at), matchId: mid}));
    }
    // Pro (Spieler, Badge-ID): nur das jüngste Event
    const dedupe = {};
    events.forEach(ev => {
      const k = ev.playerId+'|'+ev.badge.id;
      if(!dedupe[k] || dedupe[k].when < ev.when) dedupe[k] = ev;
    });
    // v9.5: Whitelist-Filter ZUERST, dann limitieren. Vorher wurde erst auf die
    // 6 jüngsten Events geschnitten und danach gefiltert — häufige Common-Badges
    // konnten so news-würdige (rare/negative) Badges aus dem Budget verdrängen.
    // Jetzt zählt das Limit nur echte News, damit gewünschte Auszeichnungen
    // (Nerven aus Stahl, 10er Serie, Losing Streak …) zuverlässig erscheinen.
    // v8.1: nur seltene/besondere Badges erzeugen News (Common wäre Spam).
    // v8.7: ALLE goldenen (legendary) und lilanen (rare) Badges sind News-würdig;
    // zusätzlich die explizit gewhitelisteten Specials (seltene negative Badges).
    const _rarRank = {legendary:4, rare:3, negative:2, common:1};
    const whitelisted = Object.values(dedupe)
      .filter(ev => {
        if(!pm[ev.playerId]) return false;
        const rar = (typeof rarityOf === 'function') ? rarityOf(ev.badge.id) : 'common';
        return rar === 'legendary' || rar === 'rare' || NEWS_BADGE_WHITELIST.has(ev.badge.id);
      });
    // v9.7: pro Match nur EIN Badge als News. Mehrere Badges aus demselben Spiel
    // (z.B. „Klares Ding" + „Mauer") sagen im Grunde dasselbe über dieses eine
    // Match aus → wir behalten nur das prominenteste (höchste Rarity, dann
    // jüngstes) und vermeiden so fast identische Doppel-News.
    const _perMatch = {};
    whitelisted.forEach(ev => {
      const mid = ev.matchId;
      const r = _rarRank[(typeof rarityOf === 'function') ? rarityOf(ev.badge.id) : 'common'] || 1;
      const cur = _perMatch[mid];
      if(!cur || r > cur._r || (r === cur._r && ev.when > cur.when)){ ev._r = r; _perMatch[mid] = ev; }
    });
    const list = Object.values(_perMatch)
      .sort((a,b) => b.when - a.when)
      .slice(0, NEWS_LIMITS.badgeUnlocked);
    list.forEach(ev => {
      const rar = (typeof rarityOf === 'function') ? rarityOf(ev.badge.id) : 'common';
      // Legendary erzwingt Top-Prio (Bucket >=9 im Final-Sort), damit echte
      // Achievements zuverlässig ganz oben im Feed landen.
      // v9.1: Badges bewusst niedriger priorisiert (außer legendär), damit bei
      // gleichem Zeitstempel Team-News/Fun Facts nach Spielen auch mal oben stehen.
      const rarPrio = {legendary:10, rare:5, common:3, negative:4}[rar] || 3;
      // v9.7: Angstgegner-News benennt den Gegner (aus fire()-Meta durchgereicht).
      const _nemOpp = (ev.badge.id === 'nemesis' && ev.meta && ev.meta.oppId) ? ev.meta.oppId : null;
      const _bdesc = _nemOpp
        ? `Angstgegner ${nameOf(_nemOpp)}: 5 Pleiten in Folge gegen denselben Gegner.`
        : (ev.badge.desc || 'Neues Badge freigeschaltet.');
      stories.push({
        id: 'badge_'+ev.playerId+'_'+ev.badge.id+'_'+ev.matchId,
        cat: 'badge',
        ic: ev.badge.ic || 'trophy',
        title: `${nameOf(ev.playerId)}: ${ev.badge.name}`,
        desc: _bdesc,
        when: ev.when,
        prio: rarPrio,
        dataRef: {type:'badge_unlocked', playerId: ev.playerId, badgeId: ev.badge.id, badgeName: ev.badge.name, matchId: ev.matchId, rarity: rar, nemesisOppId: _nemOpp || undefined}
      });
    });
  } catch(e){}

  // ── 7. Rivalität (≥50 H2H-Duelle) ──
  // H2H = wie oft 2 Spieler in irgendeinem Match GEGENEINANDER waren (egal welcher Mate).
  // Iteriere matches 1×, baue Counter-Map auf.
  try {
    const pairCnt = {}; // "minId|maxId" → {n, lastDate}
    matches.forEach(m => {
      const A = [m.a1, m.a2], B = [m.b1, m.b2];
      A.forEach(a => B.forEach(b => {
        if(a === b) return;
        const k = a < b ? a+'|'+b : b+'|'+a;
        if(!pairCnt[k]) pairCnt[k] = {n:0, last:m.created_at};
        pairCnt[k].n++;
        if(m.created_at > pairCnt[k].last) pairCnt[k].last = m.created_at;
      }));
    });
    const ranked = Object.entries(pairCnt)
      .filter(([k,v]) => v.n >= 50)
      .map(([k,v]) => {
        const [a,b] = k.split('|');
        return {a, b, n: v.n, when: new Date(v.last)};
      })
      .filter(r => pm[r.a] && pm[r.b] && !pm[r.a].hidden && !pm[r.b].hidden)
      .sort((a,b) => b.n - a.n)
      .slice(0, NEWS_LIMITS.rivalry);
    ranked.forEach(r => {
      const tier = r.n >= 200 ? 'legendäre' : r.n >= 100 ? 'große' : 'wachsende';
      stories.push({
        id: 'rivalry_'+r.a+'_'+r.b,
        cat: 'rivalry',
        ic: 'crossedSwords',
        title: `${r.n} Duelle: ${nameOf(r.a)} vs ${nameOf(r.b)}`,
        desc: `Eine ${tier} Rivalität — die Liga liebt's.`,
        when: r.when,
        prio: r.n >= 200 ? 7 : r.n >= 100 ? 5 : 3,
        dataRef: {type:'rivalry', a: r.a, b: r.b, n: r.n}
      });
    });
  } catch(e){}

  // ── 8. Jubiläum (Spiele-Meilensteine, unbegrenzte Leiter ab 10) ──
  // Trigger NUR wenn das jüngste Match dieses Spielers genau die Schwelle reißt.
  // → keine Wiederholung in späteren Generator-Läufen (ID enthält Match-ID).
  try {
    const candidates = [];
    activePlayers().forEach(p => {
      // byPlayer ist bereits asc-sortiert (matches asc → push behält Reihenfolge).
      // Keine zusätzliche Filterung/Sortierung nötig.
      const arr = byPlayer[p.id] || [];
      const total = arr.length;
      if(!total) return;
      // v9.5: unbegrenzte Leiter (10, 25, 50, 100, 250, 500, 1000, 2500 …).
      // Spiele wachsen um genau 1 pro Match → das jüngste Match reißt die Marke.
      const mark = _ladderCrossing(total - 1, total, 10);
      if(mark){
        const last = arr[arr.length-1];
        candidates.push({pid: p.id, total: mark, when: new Date(last.created_at), matchId: last.id});
      }
    });
    candidates.sort((a,b) => b.when - a.when).slice(0, NEWS_LIMITS.jubilee).forEach(c => {
      stories.push({
        id: 'jubilee_'+c.pid+'_'+c.total,
        cat: 'history',
        ic: 'calendar',
        title: `${nameOf(c.pid)} feiert ${c.total}. Spiel`,
        desc: `Ein Karriere-Meilenstein. Glückwunsch.`,
        when: c.when,
        prio: c.total >= 1000 ? 9 : c.total >= 250 ? 6 : 4,
        dataRef: {type:'jubilee', pid: c.pid, total: c.total, matchId: c.matchId}
      });
    });
  } catch(e){}

  // ── 9. Stille Woche (Aktivitäts-Fun-Fact) ──
  // Vergleicht Spielzahl letzte 7 Tage mit Schnitt der vorangegangenen 4 Wochen.
  try {
    const wk = 7 * 86400000;
    const tsNow = now.getTime();
    const lastWeek = matches.filter(m => {
      const t = mts(m);
      return t > tsNow - wk && t <= tsNow;
    }).length;
    const prev4w = matches.filter(m => {
      const t = mts(m);
      return t > tsNow - 5*wk && t <= tsNow - wk;
    }).length;
    const avg = prev4w / 4;
    if(avg >= 20 && lastWeek <= avg * 0.5){
      stories.push({
        id: 'quiet_week_'+weekKey,
        cat: 'fun',
        ic: 'clock',
        title: 'Ruhige Woche',
        desc: `Nur ${lastWeek} Spiele in den letzten 7 Tagen. Normal wären ${Math.round(avg)}.`,
        when: now,
        prio: 2,
        dataRef: {type:'quiet_week', lastWeek, avg: Math.round(avg)}
      });
    }
  } catch(e){}

  // ── 10. Saisonende-Recap (Saison gerade zu Ende) ──
  // Wenn aktuelle Saison weniger als 2 Tage alt ist UND es eine archivierte
  // Vorgängersaison gibt → kurzer Verweis auf den Champion.
  try {
    const sStart = seasonStart();
    const ageDays = (now - sStart) / 86400000;
    if(ageDays <= 2 && seasons && seasons.length){
      // v9-Fix: NUR die unmittelbar vorige Saison (Vormonat der aktuellen)
      // recap'en. Vorher wurde blind „die höchste vorhandene id" genommen —
      // war das seasons-Array noch nicht voll synchronisiert (die gerade
      // beendete Saison fehlte), wählte das die VORLETZTE Saison und
      // persistierte eine dauerhaft falsche „Saison-Champion"-Story mit
      // when = aktueller Saisonstart, die als Breaking-Hero konkurrierte.
      // Jetzt matchen wir exakt den erwarteten Vormonat; fehlt er → nichts.
      const _prevSeasonId = (curId) => {
        const mm = /^(\d{4})-(\d{2})$/.exec(String(curId||''));
        if(!mm) return null;
        let yy = +mm[1], mo = +mm[2] - 1;
        if(mo < 1){ mo = 12; yy--; }
        return yy + '-' + String(mo).padStart(2,'0');
      };
      const prevId = _prevSeasonId(currentSeason().id);
      const lastArchived = prevId ? seasons.find(s => s.id === prevId) : null;
      if(lastArchived){
        const topElo = (typeof lastArchived.top_elo === 'string')
          ? JSON.parse(lastArchived.top_elo || '[]')
          : (lastArchived.top_elo || []);
        if(topElo.length && topElo[0] && topElo[0].id && pm[topElo[0].id]){
          stories.push({
            id: 'season_recap_'+lastArchived.id,
            cat: 'season',
            ic: 'crown',
            title: `${nameOf(topElo[0].id)} ist Saison-Champion`,
            desc: `Die Saison ${lastArchived.id} ist abgeschlossen — ${nameOf(topElo[0].id)} mit ${topElo[0].elo} Elo an der Spitze.`,
            when: sStart,
            prio: 9,
            dataRef: {type:'season_recap', sid: lastArchived.id, championId: topElo[0].id, championElo: topElo[0].elo, topElo}
          });
        }
      }
    }
  } catch(e){}

  // ── 11. Persönliche Sieg-Milestones (unbegrenzte Leiter ab 100) ──
  // Nutzt byPlayer + bestehendes won(). Trigger nur, wenn das JÜNGSTE Match
  // (ein Sieg) eine Leiter-Marke reißt → stabil & einmalig (ID enthält Marke).
  try {
    activePlayers().forEach(p => {
      const arr = byPlayer[p.id] || [];
      if(!arr.length) return;
      let wins = 0;
      for(let i = 0; i < arr.length; i++) if(won(p.id, arr[i])) wins++;
      const last = arr[arr.length-1];
      const lastWon = won(p.id, last);
      // v9.5: 100, 250, 500, 1000, 2500, 5000, … statt fixem Ende bei 1000.
      const mark = _ladderCrossing(wins - (lastWon ? 1 : 0), wins, 100);
      if(mark){
        stories.push({
          id: 'milestone_wins_'+p.id+'_'+mark,
          cat: 'personal',
          ic: 'trophy',
          title: `${nameOf(p.id)}: ${mark}. Sieg!`,
          desc: `Karriere-Meilenstein — ${mark} Siege stehen jetzt zu Buche.`,
          when: new Date(last.created_at),
          prio: mark >= 500 ? 9 : mark >= 250 ? 7 : 5,
          dataRef: {type:'milestone_wins', pid: p.id, milestone: mark+'. Sieg', matchId: last.id}
        });
      }
    });
  } catch(e){}

  // ── 12. Elo-Anstieg der VERGANGENEN Woche (größter Aufsteiger) ──
  // v9.5: abgeschlossene ISO-Woche statt rollende 7 Tage — der „größte
  // Anstieg" steht erst fest, wenn die Woche vorbei ist (belastbar/final).
  try {
    const gains = {};
    for(let i = 0; i < matches.length; i++){
      const m = matches[i];
      const t = mts(m);
      if(t < _prevWeekStart || t >= _thisWeekStart) continue;
      const hist = histMap.get(m.id);
      if(!hist || !hist.deltas) continue;
      for(const pid in hist.deltas){
        gains[pid] = (gains[pid] || 0) + hist.deltas[pid];
      }
    }
    let topPid = null, topGain = 0;
    for(const pid in gains){
      if(!pm[pid] || pm[pid].hidden) continue;
      if(gains[pid] > topGain){ topGain = gains[pid]; topPid = pid; }
    }
    if(topPid && topGain >= 50){
      const delta = Math.round(topGain);
      stories.push({
        id: 'elo_swing_week_'+topPid+'_'+_lastWeekKey,
        cat: 'personal',
        ic: 'trendUp',
        title: `${nameOf(topPid)} im Aufwind`,
        desc: `+${delta} Elo in der vergangenen Woche — größter Anstieg.`,
        when: new Date(_thisWeekStart),
        prio: 7,
        dataRef: {type:'elo_swing', pid: topPid, delta, period: 'Vergangene Woche'}
      });
    }
  } catch(e){}

  // ── 13. Härtester Elo-Verlust von GESTERN (Pechvogel) ──
  // v9.5: voller Kalendertag „gestern" statt rollende 24 h — nur ein
  // abgeschlossener Tag liefert einen endgültigen „größten Verlust".
  try {
    const losses = {};
    for(let i = 0; i < matches.length; i++){
      const m = matches[i];
      const t = mts(m);
      if(t < _startOfYesterday || t >= _startOfToday) continue;
      const hist = histMap.get(m.id);
      if(!hist || !hist.deltas) continue;
      for(const pid in hist.deltas){
        losses[pid] = (losses[pid] || 0) + hist.deltas[pid];
      }
    }
    let worstPid = null, worstDelta = 0;
    for(const pid in losses){
      if(!pm[pid] || pm[pid].hidden) continue;
      if(losses[pid] < worstDelta){ worstDelta = losses[pid]; worstPid = pid; }
    }
    if(worstPid && worstDelta <= -25){ // v8.8: -20→-25 — nur echte Pech-Tage
      const delta = Math.round(worstDelta);
      stories.push({
        id: 'elo_swing_day_'+worstPid+'_'+_yesterdayKey,
        cat: 'misfortune',
        ic: 'dropDouble',
        title: `${nameOf(worstPid)} mit hartem Tag`,
        desc: `${delta} Elo — der größte Verlust von gestern.`,
        when: new Date(_startOfToday),
        prio: 5,
        dataRef: {type:'elo_swing', pid: worstPid, delta, period: 'Gestern'}
      });
    }
  } catch(e){}

  // ── 14. Größter Kantersieg der VERGANGENEN Woche ──
  // v9.5: abgeschlossene Woche — der „höchste Sieg" steht erst nach Wochenende
  // fest. Tordifferenz ≥ 8, Story verweist aufs Match.
  try {
    let biggest = null;
    for(let i = 0; i < matches.length; i++){
      const m = matches[i];
      const t = mts(m);
      if(t < _prevWeekStart || t >= _thisWeekStart) continue;
      const diff = Math.abs((m.score_a||0) - (m.score_b||0));
      if(!biggest || diff > biggest.diff){
        biggest = {m, diff, t};
      }
    }
    if(biggest && biggest.diff >= 8){
      stories.push({
        id: 'biggest_blowout_'+biggest.m.id,
        cat: 'highlight',
        ic: 'thriller',
        title: `Kantersieg: ${biggest.m.score_a}:${biggest.m.score_b}`,
        desc: `${biggest.diff} Tore Unterschied — der höchste Sieg der vergangenen Woche.`,
        when: new Date(_thisWeekStart),
        prio: biggest.diff >= 10 ? 8 : 6,
        dataRef: {type:'biggest_blowout', matchId: biggest.m.id, diff: biggest.diff}
      });
    }
  } catch(e){}

  // ── 15. Vor genau einem Jahr (Anniversary) ──
  // Match suchen, dessen created_at ±1 Tag um (now - 365d) liegt.
  // Nimm das Match mit der geringsten Abweichung.
  try {
    const year = 365 * 86400000;
    const tsNow = now.getTime();
    const targetTs = tsNow - year;
    const tolerance = 86400000;
    let ann = null;
    for(let i = 0; i < matches.length; i++){
      const m = matches[i];
      const t = mts(m);
      const diff = Math.abs(t - targetTs);
      if(diff <= tolerance){
        if(!ann || diff < ann.diff) ann = {m, diff};
      }
    }
    if(ann){
      const m = ann.m;
      const dt = new Date(m.created_at);
      const dStr = dt.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
      stories.push({
        id: 'anniversary_'+m.id,
        cat: 'history',
        ic: 'calendar',
        title: 'Vor genau einem Jahr',
        desc: `Erinnerst du dich? ${m.score_a}:${m.score_b} am ${dStr}.`,
        when: now,
        prio: 4,
        dataRef: {type:'anniversary', matchId: m.id, dateLabel: dStr}
      });
    }
  } catch(e){}

  // ── 16. Upset der Woche (Underdog schlägt Top-Spieler) ──
  // Sucht in der vergangenen Woche das Match mit dem größten preRank-Vorteil
  // des Verlierers (= Sieger war schwächer rangiert). Nutzt getRankSnapshots.
  // v9.5: abgeschlossene Woche — der „größte Upset" ist erst nach Wochenende final.
  try {
    let bestUpset = null;
    for(let i = 0; i < matches.length; i++){
      const m = matches[i];
      const t = mts(m);
      if(t < _prevWeekStart || t >= _thisWeekStart) continue;
      const snap = snaps[m.id];
      if(!snap || !snap.preRank) continue;
      const winners = m.winner === 'A' ? [m.a1, m.a2] : [m.b1, m.b2];
      const losers  = m.winner === 'A' ? [m.b1, m.b2] : [m.a1, m.a2];
      // beste preRank der Sieger (niedrigste Zahl = besser)
      // beste preRank der Verlierer
      const winnerBest = Math.min(...winners.map(p => snap.preRank[p] || 99));
      const loserBest  = Math.min(...losers.map(p  => snap.preRank[p] || 99));
      // Upset: Sieger waren SCHLECHTER (höhere Zahl) als Verlierer
      const gap = winnerBest - loserBest;
      if(gap >= 3 && (!bestUpset || gap > bestUpset.gap)){
        bestUpset = {m, gap, t, winners, losers, winnerBest, loserBest};
      }
    }
    if(bestUpset){
      const m = bestUpset.m;
      stories.push({
        id: 'upset_match_'+m.id,
        cat: 'highlight',
        ic: 'thriller',
        title: 'Upset der Woche!',
        desc: `${bestUpset.winners.map(nameOf).join(' & ')} als Außenseiter: Platz ${bestUpset.winnerBest} schlägt Platz ${bestUpset.loserBest}.`,
        when: new Date(_thisWeekStart),
        prio: bestUpset.gap >= 5 ? 8 : 6,
        dataRef: {type:'upset_match', matchId: m.id, gap: bestUpset.gap,
                  winnerRank: bestUpset.winnerBest, loserRank: bestUpset.loserBest}
      });
    }
  } catch(e){}

  // ── 16b. Gipfeltreffen: Platz 1 bezwingt Platz 2 (v8.8, v9.3) ──
  // Sucht in den letzten 7 Tagen das JÜNGSTE Match, in dem das Team des
  // Pre-Rank-#1 gegen das Team des #2 antrat und der #1 gewann.
  // v9.3: Am SAISONANFANG unterdrückt — dann haben erst wenige Spieler gespielt
  // und die Ränge sind instabil; ein „Gipfeltreffen" wirkt verfrüht. Solange
  // bleibt der Champion der Vorsaison (season_recap) im Breaking-Rampenlicht.
  try {
    const _clashSeasonAge = (now - seasonStart()) / 86400000;
    const _clashSeasonMs  = matchesInSeason(currentSeason().id);
    const _clashPlayers   = new Set();
    _clashSeasonMs.forEach(m => [m.a1,m.a2,m.b1,m.b2].forEach(id => _clashPlayers.add(id)));
    const _seasonMature   = _clashSeasonAge >= 8 && _clashSeasonMs.length >= 12 && _clashPlayers.size >= 5;
    if(_seasonMature){
      const wk = 7 * 86400000;
      const tsNow = now.getTime();
      let best = null;
      for(let i = matches.length - 1; i >= 0; i--){
        const m = matches[i];
        const t = mts(m);
        if(t > tsNow) continue;
        if(t < tsNow - wk) break; // matches asc → ab hier nur noch älter
        const snap = snaps[m.id];
        if(!snap || !snap.preRank) continue;
        const winners = m.winner === 'A' ? [m.a1, m.a2] : [m.b1, m.b2];
        const losers  = m.winner === 'A' ? [m.b1, m.b2] : [m.a1, m.a2];
        const winnerBest = Math.min(...winners.map(p => snap.preRank[p] || 99));
        const loserBest  = Math.min(...losers.map(p  => snap.preRank[p] || 99));
        if(winnerBest === 1 && loserBest === 2){
          const p1 = winners.find(p => (snap.preRank[p]||99) === 1); // Platz-1-Spieler (Sieger-Team)
          const p2 = losers.find(p  => (snap.preRank[p]||99) === 2); // Platz-2-Spieler (Verlierer-Team)
          if(p1 && p2 && pm[p1] && pm[p2] && !pm[p1].hidden && !pm[p2].hidden){
            best = {m, t, winners, losers, p1, p2}; break;
          }
        }
      }
      if(best){
        const m = best.m;
        stories.push({
          id: 'top_clash_'+m.id,
          cat: 'highlight',
          ic: 'kingClass',
          title: `Gipfeltreffen: ${nameOf(best.p1)} bezwingt ${nameOf(best.p2)}`,
          desc: `Tabellenführer ${nameOf(best.p1)} setzt sich im direkten Duell gegen Verfolger ${nameOf(best.p2)} durch und baut den Vorsprung an der Spitze aus.`,
          when: new Date(best.t),
          prio: 9,
          dataRef: {type:'top_clash', matchId: m.id, winners: best.winners, losers: best.losers, p1: best.p1, p2: best.p2}
        });
      }
    }
  } catch(e){}

  // ── 16c. Breaking: All-Time-Rekorde & Giant Slayer (v9.4) ──
  try {
    const rec = _allTimeRecords();
    const RECENT = 14 * 86400000;
    const nowTs = now.getTime();
    const startElo = cfg.start_elo ?? 0;
    const mature = matches.length >= 30; // erst bei genug Liga-Historie

    // Neuer Elo-Rekord: höchster je erreichter Elo-Stand der Liga
    if(mature && rec.eloRec && rec.eloRec.when){
      const pid = rec.eloRec.pid;
      if((nowTs - new Date(rec.eloRec.when).getTime()) < RECENT && pm[pid] && !pm[pid].hidden && rec.eloRec.val >= startElo + 40){
        stories.push({
          id: 'elo_record_'+rec.eloRec.matchId,
          cat: 'highlight', ic: 'peak',
          title: `Neuer Elo-Rekord: ${nameOf(pid)}`,
          desc: `${nameOf(pid)} schraubt die Bestmarke auf ${rec.eloRec.val} Elo — so hoch stand in der Liga noch nie jemand.`,
          when: new Date(rec.eloRec.when), prio: 10,
          dataRef: {type:'elo_record', pid, elo: rec.eloRec.val, matchId: rec.eloRec.matchId}
        });
      }
    }

    // Längste Siegesserie aller Zeiten
    if(mature && rec.streakRec && rec.streakRec.when && rec.streakRec.val >= 6){
      const pid = rec.streakRec.pid;
      if((nowTs - new Date(rec.streakRec.when).getTime()) < RECENT && pm[pid] && !pm[pid].hidden){
        stories.push({
          id: 'streak_record_'+rec.streakRec.matchId,
          cat: 'highlight', ic: 'crownFlame',
          title: `Serien-Rekord: ${nameOf(pid)}`,
          desc: `${rec.streakRec.val} Siege am Stück — die längste Siegesserie, die die Liga je gesehen hat.`,
          when: new Date(rec.streakRec.when), prio: 10,
          dataRef: {type:'streak_record', pid, streak: rec.streakRec.val, matchId: rec.streakRec.matchId}
        });
      }
    }

    // Giant Slayer: ein Team gewinnt mit unter 20% Siegchance (letzte 7 Tage,
    // das extremste Match). Suppress-Regel gegen Upset-Doppel siehe Consolidation.
    {
      const wk = 7 * 86400000;
      let gs = null;
      for(let i = matches.length - 1; i >= 0; i--){
        const m = matches[i];
        const t = mts(m);
        if(t > nowTs) continue;
        if(t < nowTs - wk) break;
        const expA = (m.exp_a == null) ? 0.5 : m.exp_a;
        const winnerChance = m.winner === 'A' ? expA : (1 - expA);
        if(winnerChance < 0.20){
          const winners = m.winner === 'A' ? [m.a1, m.a2] : [m.b1, m.b2];
          const losers  = m.winner === 'A' ? [m.b1, m.b2] : [m.a1, m.a2];
          if(winners.every(p => pm[p] && !pm[p].hidden) && (!gs || winnerChance < gs.chance)){
            gs = { m, chance: winnerChance, winners, losers };
          }
        }
      }
      if(gs){
        const wNames = gs.winners.map(nameOf).join(' & ');
        const lNames = gs.losers.map(nameOf).join(' & ');
        const pct = Math.max(1, Math.round(gs.chance * 100));
        stories.push({
          id: 'giant_slayer_'+gs.m.id,
          cat: 'highlight', ic: 'giantSlayer',
          title: `Giant Slayer: ${wNames}`,
          desc: `Nur ${pct}% Siegchance — und trotzdem gewonnen: ${wNames} zwingen ${lNames} in einer echten Sensation in die Knie.`,
          when: new Date(gs.m.created_at), prio: 10,
          dataRef: {type:'giant_slayer', matchId: gs.m.id, winners: gs.winners, losers: gs.losers, chance: gs.chance}
        });
      }
    }
  } catch(e){}

  // ── 17. Serienkiller (Match beendete ≥4er Sieges-Streak des Gegners) ──
  // Nutzt getStreakSnapshots — pro Match {pid: streak_VOR_match}. v9.7: Schwelle
  // von 6 auf 4 gesenkt; zusätzlich merken wir uns das Sieger-Team (wer die
  // Serie gestoppt hat), damit die News zeigt, welches Team welchen Spieler
  // gebremst hat.
  // v9.8: Serien ≥7 werden IMMER als eigene News getriggert (jede einzelne).
  // Für kleinere Unterbrechungen (4–6) bleibt es bei der EINEN prominentesten,
  // damit der Feed bei vielen 4er-Serien nicht zuspammt.
  try {
    const wk = 14 * 86400000;
    const tsNow = now.getTime();
    const streakSnaps = (typeof getStreakSnapshots === 'function') ? getStreakSnapshots() : {};
    const kills = [];
    for(let i = 0; i < matches.length; i++){
      const m = matches[i];
      const t = mts(m);
      if(t < tsNow - wk || t > tsNow) continue;
      const snap = streakSnaps[m.id];
      if(!snap) continue;
      const losers  = m.winner === 'A' ? [m.b1, m.b2] : [m.a1, m.a2];
      const winners = m.winner === 'A' ? [m.a1, m.a2] : [m.b1, m.b2];
      // Höchste laufende Streak unter den Verlierern VOR diesem Match
      let maxLoserStreak = 0, victimPid = null;
      losers.forEach(pid => {
        const s = snap[pid] || 0;
        if(s > maxLoserStreak){ maxLoserStreak = s; victimPid = pid; }
      });
      if(maxLoserStreak >= 4){
        kills.push({m, streak: maxLoserStreak, victimPid, winners, t});
      }
    }
    // ≥7 immer (alle), 4–6 nur die prominenteste (falls es keine ≥7 gab bzw.
    // zusätzlich als „ruhige-Phase"-Fallback, wenn gar keine große Serie fiel).
    const big = kills.filter(k => k.streak >= 7);
    const small = kills.filter(k => k.streak < 7).sort((a, b) => b.streak - a.streak || b.t - a.t);
    const chosen = big.slice();
    if(!big.length && small.length) chosen.push(small[0]);
    chosen.forEach(kill => {
      const m = kill.m;
      const breakerIds = (kill.winners || []).filter(Boolean);
      const breakerNames = breakerIds.map(nameOf).join(' & ');
      stories.push({
        id: 'streak_killer_'+m.id,
        cat: 'highlight',
        ic: 'crossedSwords',
        title: 'Siegesserie beendet!',
        desc: `${breakerNames} stoppen ${nameOf(kill.victimPid)}: Die ${kill.streak}er-Serie ist gerissen.`,
        when: new Date(kill.t),
        prio: kill.streak >= 10 ? 9 : 7,
        dataRef: {type:'streak_killer', matchId: m.id, streak: kill.streak, victimPid: kill.victimPid, breakerIds}
      });
    });
  } catch(e){}

  // ── 18. Krimi der VERGANGENEN Woche (knappstes Match, Tordifferenz = 1) ──
  // v9.5: abgeschlossene Woche — der „knappste Sieg" ist erst final, wenn die
  // Woche vorbei ist.
  try {
    let thriller = null;
    for(let i = 0; i < matches.length; i++){
      const m = matches[i];
      const t = mts(m);
      if(t < _prevWeekStart || t >= _thisWeekStart) continue;
      const diff = Math.abs((m.score_a||0) - (m.score_b||0));
      // Nur 1-Tor-Krimis ab Score ≥ 8 (anders sind 1:0 oder 2:1 wenig spannend)
      if(diff !== 1) continue;
      const totalScore = (m.score_a||0) + (m.score_b||0);
      if(totalScore < 17) continue;
      if(!thriller || totalScore > thriller.totalScore){
        thriller = {m, totalScore, t};
      }
    }
    if(thriller){
      const m = thriller.m;
      stories.push({
        id: 'thriller_'+m.id,
        cat: 'highlight',
        ic: 'thriller',
        title: `Krimi: ${m.score_a}:${m.score_b}`,
        desc: `Entscheidung erst im letzten Tor — knappster Sieg der vergangenen Woche.`,
        when: new Date(_thisWeekStart),
        prio: 7,
        dataRef: {type:'thriller_match', matchId: m.id, diff: 1, total: thriller.totalScore}
      });
    }
  } catch(e){}

  // ── 19. Rivalitäts-Meilenstein (50/100/200/500 H2H-Duelle ERREICHT) ──
  // Im Gegensatz zu Story 7 (Rivalry) triggert das nur, wenn das jüngste
  // Match der Paarung gerade eine Schwelle riss → "100. Aufeinandertreffen!".
  try {
    const pairThresholds = [50, 100, 200, 500];
    const pairCnt = {};
    matches.forEach(m => {
      const A = [m.a1, m.a2], B = [m.b1, m.b2];
      A.forEach(a => B.forEach(b => {
        if(a === b) return;
        const k = a < b ? a+'|'+b : b+'|'+a;
        if(!pairCnt[k]) pairCnt[k] = {n:0, lastId:null, lastTs:0};
        pairCnt[k].n++;
        const ts = mts(m);
        if(ts > pairCnt[k].lastTs){ pairCnt[k].lastTs = ts; pairCnt[k].lastId = m.id; }
      }));
    });
    Object.entries(pairCnt).forEach(([k, v]) => {
      if(!pairThresholds.includes(v.n)) return;
      const [a, b] = k.split('|');
      if(!pm[a] || !pm[b] || pm[a].hidden || pm[b].hidden) return;
      stories.push({
        id: 'rivalry_milestone_'+k+'_'+v.n,
        cat: 'rivalry',
        ic: 'crossedSwords',
        title: `${v.n}. Duell: ${nameOf(a)} vs ${nameOf(b)}`,
        desc: `Historisches ${v.n}. Aufeinandertreffen — die Rivalität wächst.`,
        when: new Date(v.lastTs),
        prio: v.n >= 200 ? 9 : v.n >= 100 ? 8 : 6,
        dataRef: {type:'rivalry_milestone', a, b, n: v.n, matchId: v.lastId}
      });
    });
  } catch(e){}

  // ── 20. Tor-Meilensteine (unbegrenzte Leiter ab 500 Karriere-Tore) ──
  try {
    activePlayers().forEach(p => {
      const arr = byPlayer[p.id] || [];
      if(!arr.length) return;
      let goals = 0;
      for(let i = 0; i < arr.length; i++){
        const m = arr[i];
        const onA = (p.id===m.a1||p.id===m.a2);
        goals += onA ? (m.score_a||0) : (m.score_b||0);
      }
      // v9.5: das jüngste Match liefert die letzten Tore → prüfen, ob damit eine
      // Leiter-Marke gerissen wurde (500, 1000, 2500, 5000, 10000, …).
      const last = arr[arr.length-1];
      const lastGoals = (p.id===last.a1||p.id===last.a2) ? (last.score_a||0) : (last.score_b||0);
      const mark = _ladderCrossing(goals - lastGoals, goals, 500);
      if(mark){
        stories.push({
          id: 'milestone_goals_'+p.id+'_'+mark,
          cat: 'personal',
          ic: 'target',
          title: `${nameOf(p.id)}: ${mark}. Tor`,
          desc: `Karriere-Meilenstein — ${goals} Tore stehen jetzt zu Buche.`,
          when: new Date(last.created_at),
          prio: mark >= 1000 ? 8 : 6,
          dataRef: {type:'milestone_goals', pid: p.id, milestone: mark+'. Tor', matchId: last.id}
        });
      }
    });
  } catch(e){}

  // ── 20b. Persönliche Elo-Meilensteine (unbegrenzt, v9.5) ──
  // Allzeit-Höchst-Elo überschreitet eine runde 100er-Marke (ab Start-Elo+200).
  // Nur „frische" Marken (Rekord-Match ≤ 14 Tage alt) werden zur News — sonst
  // würde beim ersten Lauf die gesamte Historie nachträglich einfließen.
  try {
    const RECENT = 14 * _dayMs;
    const nowTs = now.getTime();
    _eloMilestones().forEach(e => {
      if(!e.when || !pm[e.pid] || pm[e.pid].hidden) return;
      if(nowTs - new Date(e.when).getTime() > RECENT) return;
      stories.push({
        id: 'milestone_elo_'+e.pid+'_'+e.mark,
        cat: 'personal',
        ic: 'peak',
        title: `${nameOf(e.pid)} knackt ${e.mark} Elo`,
        desc: `Persönlicher Höchststand — erstmals über die ${e.mark}-Elo-Marke.`,
        when: new Date(e.when),
        prio: e.mark >= (cfg.start_elo ?? 1000) + 500 ? 8 : 6,
        dataRef: {type:'milestone_elo', pid: e.pid, milestone: e.mark+' Elo', mark: e.mark, matchId: e.matchId}
      });
    });
  } catch(e){}

  // ── 21. Aktive Sieges-Streak (≥5 in Folge, läuft noch) ──
  // Pendant zu loss_streak. Spieler dessen jüngstes Match Sieg war und
  // davor noch ≥4 weitere Siege.
  try {
    const candidates = [];
    activePlayers().forEach(p => {
      const arr = byPlayer[p.id] || [];
      if(!arr.length) return;
      let streak = 0;
      for(let i = arr.length - 1; i >= 0; i--){
        if(!won(p.id, arr[i])) break;
        streak++;
        if(streak > 20) break;
      }
      if(streak >= 5){
        candidates.push({pid: p.id, streak, when: new Date(arr[arr.length-1].created_at)});
      }
    });
    candidates.sort((a,b) => b.streak - a.streak);
    candidates.slice(0, 3).forEach(c => {
      stories.push({
        id: 'win_streak_'+c.pid+'_'+c.when.toISOString().slice(0,10),
        cat: 'highlight',
        ic: 'flame',
        title: `${nameOf(c.pid)} ungeschlagen`,
        desc: `${c.streak} Siege in Folge — aktuelle heißeste Form der Liga.`,
        when: c.when,
        prio: c.streak >= 10 ? 9 : c.streak >= 7 ? 7 : 6,
        dataRef: {type:'win_streak', pid: c.pid, streak: c.streak}
      });
    });
  } catch(e){}

  // ── 22. Längste Pause (kein Spielbetrieb in den letzten X Tagen) ──
  // Story zeigt sich erst, wenn die aktuelle "Stille" ≥3 Tage andauert.
  try {
    if(matches.length){
      const lastMatchTs = new Date(matches[matches.length-1].created_at).getTime();
      const sinceLastDays = Math.floor((now.getTime() - lastMatchTs) / 86400000);
      if(sinceLastDays >= 3){
        stories.push({
          // Pro Pause genau 1 Story (lastMatchId bleibt stabil bis zum
          // nächsten Match) — kein täglicher Spam mehr.
          id: 'dry_spell_'+matches[matches.length-1].id,
          cat: 'fun',
          ic: 'clock',
          title: `${sinceLastDays} Tage ohne Spiel`,
          desc: `Längste Pause seit Langem — Zeit für ein Match?`,
          when: now,
          prio: 3,
          dataRef: {type:'dry_spell', daysSince: sinceLastDays, lastMatchId: matches[matches.length-1].id}
        });
      }
    }
  } catch(e){}

  // ── Spieler der Woche (POTW) der Vorwoche (v8.7) ──
  // Persistente News zu Wochenbeginn (Mo früh), analog zum POTW-Recap-Sheet.
  // Deterministische ID pro Woche → kein Doppel, Cross-Device-stabil.
  try {
    if(typeof _potwLastWeekRange === 'function' && typeof _potwKeyOf === 'function'){
      const range = _potwLastWeekRange();
      const wm = matches.filter(m => { const d = new Date(m.created_at); return d >= range.start && d <= range.end; });
      const res = _newsPeriodWinner(wm, 5);
      if(res){
        const wk = _potwKeyOf(range.start);
        const rep = new Date(range.start); rep.setDate(rep.getDate() + 7); rep.setHours(7, 0, 0, 0);
        // v9.6: Trigger erst AB 07:00 des Folge-Montags — nicht schon nachts um
        // 00:xx (sonst „für 07:00 eingetragen, obwohl noch nicht 07:00"). Der
        // Memo-Key kippt um 07:00 (_morningSlotSig), daher taucht sie dann auf.
        if(now.getTime() >= rep.getTime()){
          const names = res.winners.map(w => nameOf(w.id));
          const titleNames = names.length > 1 ? names.slice(0, -1).join(', ') + ' & ' + names[names.length-1] : names[0];
          const main = res.main;
          stories.push({
            id: 'potw_' + wk,
            cat: 'season',
            ic: 'weekKing',
            title: names.length > 1 ? `${titleNames}: Spieler der Woche` : `${titleNames} ist Spieler der Woche`,
            desc: `Beste Bilanz der Vorwoche: ${main.wins} Siege bei ${Math.round(main.wr*100)}% Siegquote.`,
            when: rep,
            prio: 8,
            dataRef: {type:'potw', weekKey: wk, playerId: main.id, playerIds: res.winners.map(w => w.id), wins: main.wins, wr: main.wr}
          });
        }
      }
    }
  } catch(e){}

  // ── Spieler des Tages (POTD) des letzten Spieltags (v8.7) ──
  // Persistente News am Folgetag (früh), analog zum POTD-Recap-Sheet.
  try {
    if(typeof _potdLastDayData === 'function'){
      const data = _potdLastDayData(); // {dayKey, dayMatches} | null
      if(data){
        const res = _newsPeriodWinner(data.dayMatches, 3);
        if(res){
          const rep = new Date(data.dayKey + 'T00:00:00'); rep.setDate(rep.getDate() + 1); rep.setHours(7, 0, 0, 0);
          // v9.6: Trigger erst AB 07:00 des Folgetags — nicht schon nachts um
          // 00:xx. Der Memo-Key kippt um 07:00 (_morningSlotSig) → erscheint dann.
          if(now.getTime() >= rep.getTime()){
            const main = res.main;
            const names = res.winners.map(w => nameOf(w.id));
            const titleNames = names.length > 1 ? names.slice(0, -1).join(', ') + ' & ' + names[names.length-1] : names[0];
            const p = data.dayKey.split('-');
            const dLabel = p[2] + '.' + p[1] + '.';
            stories.push({
              id: 'potd_' + data.dayKey,
              cat: 'highlight',
              ic: 'dayKing',
              title: names.length > 1 ? `${titleNames}: Spieler des Tages` : `${titleNames} ist Spieler des Tages`,
              desc: `Bester Spieler am ${dLabel}: ${main.wins} Siege bei ${Math.round(main.wr*100)}% Siegquote.`,
              when: rep,
              prio: 7,
              dataRef: {type:'potd', dayKey: data.dayKey, playerId: main.id, playerIds: res.winners.map(w => w.id), wins: main.wins, wr: main.wr}
            });
          }
        }
      }
    }
  } catch(e){}

  // Hinweis (v8.6): Die Konsolidierung gegen Match-Event-Spam (mehrere fast
  // identische Karten pro Match) passiert bewusst NICHT hier im Generator,
  // sondern beim Anzeigen (_consolidateStories, §11.2) — siehe Begründung dort.

  // ── Ambiente Tages-Stories (v8.5) ──
  // Zeitlich verteilte Fun Facts / Nuggets, damit der Feed auch ohne neue
  // Matches lebt. Tages-deterministisch → kein Cross-Device-Spam.
  try {
    const amb = _buildAmbientStories(now, pm, nameOf);
    for(const a of amb) stories.push(a);
  } catch(e){ if(NEWS_DEBUG || window.NEWS_DEBUG) console.warn('[news] ambient build failed', e); }

  // ── Final-Sort + Limit ──
  // v8.2: PURE Chronologie (User-Wunsch). Neueste Story zuerst, älteste
  // zuletzt — in ALLEN Views (Mini-Popup, Feed, Filter) konsistent.
  // Wichtige Stories landen ohnehin oben, weil ihre `when`-Werte meist
  // "jetzt" sind (saison_endspurt, anniversary, elo_swing*). Bei gleichem
  // Timestamp dient Prio als deterministischer Tiebreaker.
  stories.sort((a,b) => {
    const dt = b.when - a.when;
    if(dt !== 0) return dt;
    return b.prio - a.prio;
  });

  // ── Anti-Spam: Per-Player-Limit (v8.1) ──
  // Verhindert, dass ein einzelner Spieler den Feed dominiert. Nach dem
  // Sort sind die wichtigsten Stories pro Spieler bereits zuerst — wir nehmen
  // also die ersten N und kappen den Rest. Stories ohne Spieler-Bezug
  // (saison_endgame, season_recap, quiet_week, biggest_blowout, anniversary)
  // sind nicht limitiert.
  const PER_PLAYER_LIMIT = 3;
  const perPlayer = {};
  const deduped = [];
  for(const s of stories){
    const d = s.dataRef || {};
    const pid = d.pid || d.playerId || d.newLeader || null;
    if(!pid){
      deduped.push(s);
      continue;
    }
    if(!perPlayer[pid]) perPlayer[pid] = 0;
    if(perPlayer[pid] >= PER_PLAYER_LIMIT) continue;
    perPlayer[pid]++;
    deduped.push(s);
  }
  // Ergebnis memoisieren (v8.4) — siehe Memoization-Guard oben.
  const _result = deduped.slice(0, NEWS_LIMITS.total);
  _cache._buildStoriesKey = _buildStoriesKey;
  _cache._buildStoriesResult = _result;
  return _result;
}

// Gewinner einer Periode (POTW/POTD) — gleiche Regel wie die Recap-Sheets
// (showPotwRecap/showPotdRecap): min. N Siege, höchste Siegquote, Tiebreak
// mehr Siege → mehr Elo-Delta. Geteilter Sieg bei identischer Siegquote.
// Liefert {winners:[…], main} oder null. (v8.7)
function _newsPeriodWinner(rangeMatches, minWins){
  if(!Array.isArray(rangeMatches) || !rangeMatches.length) return null;
  const ps = {};
  for(const m of rangeMatches){
    const aWon = m.winner === 'A';
    [m.a1, m.a2, m.b1, m.b2].forEach(id => {
      if(!ps[id]) ps[id] = {wins:0, losses:0, eloDelta:0};
      const onA = (m.a1 === id || m.a2 === id);
      const won = (onA && aWon) || (!onA && !aWon);
      ps[id].eloDelta += (m.deltas && m.deltas[id]) || 0;
      if(won) ps[id].wins++; else ps[id].losses++;
    });
  }
  const pm = pmap();
  const cand = Object.entries(ps)
    .filter(([id, s]) => s.wins >= minWins && pm[id] && !pm[id].hidden)
    .map(([id, s]) => { const g = s.wins + s.losses; return {id, wins: s.wins, losses: s.losses, eloDelta: s.eloDelta, wr: g ? s.wins/g : 0}; })
    .sort((a, b) => { if(b.wr !== a.wr) return b.wr - a.wr; if(b.wins !== a.wins) return b.wins - a.wins; return b.eloDelta - a.eloDelta; });
  if(!cand.length) return null;
  const topWr = cand[0].wr;
  return { winners: cand.filter(c => Math.abs(c.wr - topWr) < 0.001), main: cand[0] };
}

// ─── §11.1b — Ambiente Fun-Fact-Stories (v8.5, v9.5) ─────────────────
// Erzeugt Fun Facts / persönliche Nuggets / Rivalitäten / Historie, damit der
// Feed auch OHNE neue Matches lebendig wirkt.
//
// KERNPRINZIP (kein Spam, Cross-Device-konsistent):
//   - RHYTHMUS (v9.7): zwei Fun Facts pro TAG, um 10:00 und 19:00. _isAmbientDay
//     ist immer true; ein Slot entsteht erst ab seiner Uhrzeit.
//   - Story-ID ist tages+stunden-deterministisch: `ambient_<datum>_<stunde>`.
//     → ON CONFLICT DO NOTHING beim Upload: der erste Insert gewinnt den
//       Timestamp, alle Geräte sehen exakt dieselbe Story.
//   - Welchen Fun Fact der Slot zeigt, entscheidet ein aus dem Datum geseedeter
//     Pseudo-Zufall (mulberry32) — „random" fürs Gefühl, aber überall identisch.
//   - COOLDOWN: Fun-Fact-Typen, die in den letzten AMBIENT_COOLDOWN_DAYS Tagen
//     schon liefen, werden gesperrt → Rotation statt vorhersehbarer Reihenfolge,
//     keine schnellen Wiederholungen. Ist alles gesperrt, wird die Sperre gelöst.
//   - Die Inhalte stammen aus echten Daten (allPlayerStats, H2H-Map, Scores) —
//     nichts wird erfunden. Liefert ein Template kein Ergebnis (zu wenig Daten),
//     wird deterministisch das nächste genommen.
function _buildAmbientStories(now, pm, nameOf){
  const out = [];
  if(!Array.isArray(AMBIENT_SLOTS) || !AMBIENT_SLOTS.length) return out;
  // v9.7: täglich, mehrere Slots (10:00 & 19:00). _isAmbientDay ist immer true.
  if(!_isAmbientDay(now)) return out;

  const dateKey = now.toISOString().slice(0,10);

  const templates = _ambientTemplatePool(now, pm, nameOf);
  if(!templates.length) return out;

  // Bereits persistierte Ambient-Stories: (a) heutige eines Slots → nicht neu
  // ableiten (Daten-Drift-Schutz, kommt ohnehin aus dem DB-Cache); (b) die der
  // letzten COOLDOWN-Tage → deren Fun-Fact-Typ vorübergehend sperren.
  const known = (Array.isArray(_cache._stories) ? _cache._stories : [])
    .filter(s => s && typeof s.id === 'string' && s.id.indexOf('ambient_') === 0);

  // v9.11: Cooldown ist jetzt PRO Typ. Standard = AMBIENT_COOLDOWN_DAYS; ein
  // Template darf ihn via `cooldown` verkürzen (z.B. fun_random_stat, dessen
  // Inhalt bei jedem Lauf variiert → darf früher wiederkommen).
  const cooldownDaysOf = {};
  for(const t of templates) cooldownDaysOf[t.key] = t.cooldown || AMBIENT_COOLDOWN_DAYS;
  const cooldownKeys = new Set();
  const _cdDayMs = 86400000;
  for(const s of known){
    const md = /^ambient_(\d{4}-\d{2}-\d{2})_/.exec(s.id);
    if(!md) continue;
    const sub = s.dataRef && s.dataRef.sub;
    if(!sub) continue;
    const cdMs = (cooldownDaysOf[sub] || AMBIENT_COOLDOWN_DAYS) * _cdDayMs;
    const ts = new Date(md[1] + 'T00:00:00').getTime();
    if(now.getTime() - ts <= cdMs) cooldownKeys.add(sub);
  }

  // Fällige Slots aufsteigend abarbeiten. Innerhalb desselben Tages darf ein
  // bereits gewählter (oder schon persistierter) Typ nicht erneut kommen, damit
  // 10:00 und 19:00 nie denselben Fun Fact zeigen.
  const usedToday = new Set();
  // v9.10: Weiche Same-Player-Sperre. Viele Templates sind „Wer führt bei Stat
  // X?"-Superlative und zeigen bei einem dominanten Spieler ALLE auf denselben
  // Kopf → zwei Tages-Slots feiern sonst zweimal den Platzhirsch. usedPids
  // sammelt die Spieler der schon vergebenen Slots; spätere Slots meiden diese
  // (nur als Notnagel, Pass 2, wird ein Spieler wiederverwendet). Rein
  // deterministisch (Slot-Reihenfolge + geseedete Auswahl) → cross-device gleich.
  const usedPids = new Set();
  const pidsOf = dr => !dr ? [] : (Array.isArray(dr.ambientPids) ? dr.ambientPids : (dr.ambientPid ? [dr.ambientPid] : []));
  // v9.14: Cross-Day-Same-Player-Sperre. Spieler, die in den letzten
  // AMBIENT_PLAYER_COOLDOWN_DAYS Tagen schon in einer Ambient-Story gefeiert
  // wurden, werden gemieden — sonst monopolisiert ein dominanter Kopf über
  // verschiedene Typen hinweg mehrere Tage. Aus den PERSISTIERTEN `known`-Rows
  // abgeleitet → deterministisch und cross-device identisch. Enthält auch
  // heutige (schon abgelegte) Slots, ergänzt also die tages-lokale usedPids.
  const recentPids = new Set();
  const playerCdMs = AMBIENT_PLAYER_COOLDOWN_DAYS * _cdDayMs;
  for(const s of known){
    const md = /^ambient_(\d{4}-\d{2}-\d{2})_/.exec(s.id);
    if(!md) continue;
    const ts = new Date(md[1] + 'T00:00:00').getTime();
    if(now.getTime() - ts > playerCdMs) continue;
    for(const pid of pidsOf(s.dataRef)) recentPids.add(pid);
  }
  const slots = AMBIENT_SLOTS.slice().sort((a, b) => a - b);
  for(const slotHour of slots){
    if(now.getHours() < slotHour) continue;
    const todayId = 'ambient_' + dateKey + '_' + slotHour;
    const existing = known.find(s => s.id === todayId);
    if(existing){
      // Slot ist schon persistiert → dessen Typ + Spieler für die restlichen
      // Slots sperren (Same-Player-Sperre gilt auch gegen persistierte Slots).
      const sub = existing.dataRef && existing.dataRef.sub;
      if(sub) usedToday.add(sub);
      for(const pid of pidsOf(existing.dataRef)) usedPids.add(pid);
      continue;
    }

    const rng = _ambientRng(_ambientHash(dateKey + '_' + slotHour));
    // Templates in geseedeter Reihenfolge prüfen; erstes passende mit Ergebnis
    // gewinnt → variiert pro Slot/Tag, bleibt aber deterministisch.
    // v9.11: GEWICHTETE Reihenfolge — ein Template mit `weight` > 1 kommt
    // `weight`-fach in den Lostopf und landet dadurch statistisch früher, wird
    // also bei gleicher Eignung öfter gewählt (mehr „Mischung", kein Monopol).
    const bag = [];
    templates.forEach((t, i) => { const w = Math.max(1, t.weight || 1); for(let k = 0; k < w; k++) bag.push(i); });
    const seenIdx = new Set();
    const order = [];
    for(const i of _ambientShuffle(bag, rng)){ if(!seenIdx.has(i)){ seenIdx.add(i); order.push(i); } }
    let chosen = null, chosenKey = null;
    // Pass 0: Typ-Cooldown + heute-schon-genutzter Typ + Same-Player (heute UND
    //         letzte Tage) meiden → ideal frisch.
    // Pass 1: Typ-Cooldown gelockert, Same-Player (heute + letzte Tage) bleibt
    //         gesperrt → Namens-Rotation hat Vorrang vor Typ-Frische.
    // Pass 2: Notnagel — auch Same-Player erlaubt (falls nur der Platzhirsch
    //         überhaupt Templates befüllt), Typ-Sperre des Tages bleibt.
    for(let pass = 0; pass < 3 && !chosen; pass++){
      for(const idx of order){
        const t = templates[idx];
        if(usedToday.has(t.key)) continue;
        if(pass === 0 && cooldownKeys.has(t.key)) continue;
        let res = null;
        try { res = t.make(rng); } catch(e){ res = null; }
        if(!res) continue;
        if(pass < 2){
          const pids = pidsOf(res.dataRef);
          // Sowohl heute schon gefeierte (usedPids) als auch in den letzten
          // AMBIENT_PLAYER_COOLDOWN_DAYS Tagen gefeierte (recentPids) Köpfe meiden.
          if(pids.length && pids.some(p => usedPids.has(p) || recentPids.has(p))) continue;
        }
        chosen = res; chosenKey = t.key; break;
      }
    }
    if(!chosen) continue;
    usedToday.add(chosenKey);
    for(const pid of pidsOf(chosen.dataRef)) usedPids.add(pid);

    const when = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slotHour, 0, 0, 0);
    out.push({
      id:    todayId,
      cat:   chosen.cat,
      ic:    chosen.ic,
      title: chosen.title,
      desc:  chosen.desc,
      when,
      // Niedrige Prio + KEIN limitierender dataRef.pid (nur ambientPid/-Pids),
      // damit ambiente Stories nicht vom Per-Player-Limit geschluckt werden.
      prio:  chosen.prio || 4,
      dataRef: Object.assign({type:'ambient', sub: chosenKey}, chosen.dataRef || {})
    });
  }
  return out;
}

// FNV-1a-Hash → 32-bit Seed (deterministisch, schnell).
function _ambientHash(str){
  let h = 2166136261 >>> 0;
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// mulberry32 PRNG → reproduzierbare Pseudo-Zufallszahlen [0,1).
function _ambientRng(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Fisher-Yates mit geseedetem rng (verändert das Original nicht).
function _ambientShuffle(arr, rng){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// Template-Pool: jede make()-Funktion liefert {cat, ic, title, desc, prio?,
// dataRef?} aus ECHTEN Daten — oder null, wenn die Datenlage nicht reicht.
// Icons sind bewusst auf die in NEWS_CATEGORIES bekannten beschränkt.
function _ambientTemplatePool(now, pm, nameOf){
  const stats = (typeof allPlayerStats === 'function') ? (allPlayerStats() || {}) : {};
  const activePids = Object.keys(pm).filter(pid => pm[pid] && !pm[pid].hidden);
  const withStats = activePids.filter(pid => stats[pid] && stats[pid].games > 0);
  const T = [];

  // ── v9.13: Zeitbasierte "Form"-Aggregation der letzten 14 Tage ──
  // EINMALIG (lazy + memoisiert) über nur die jüngsten Matches. `matches` ist
  // aufsteigend nach created_at sortiert → wir laufen von hinten und brechen ab,
  // sobald ein Match älter als das Fenster ist (O(Fenster) statt O(alle)).
  // Positionen (atk/def), enge Spiele (Tordiff ≤ 2) und 1-Tor-Siege werden
  // gleich mitgezählt, damit ALLE Form-Templates diese eine Schleife teilen —
  // pro Pool-Aufbau wird sie höchstens einmal ausgeführt.
  const RECENT_DAYS = 14;
  let _recentMemo;
  const recentAgg = () => {
    if(_recentMemo) return _recentMemo;
    const cutoff = now.getTime() - RECENT_DAYS * 86400000;
    const agg = {};
    let count = 0;
    for(let i = matches.length - 1; i >= 0; i--){
      const m = matches[i];
      if(mts(m) < cutoff) break; // asc-sortiert → alles davor ist älter
      count++;
      const diff = Math.abs((m.score_a||0) - (m.score_b||0));
      const aWon = m.winner === 'A';
      const seats = [[m.a1, m.a1_pos, true], [m.a2, m.a2_pos, true], [m.b1, m.b1_pos, false], [m.b2, m.b2_pos, false]];
      for(const [id, pos, onA] of seats){
        if(!id || !pm[id] || pm[id].hidden) continue;
        const won = onA ? aWon : !aWon;
        const gf = onA ? (m.score_a||0) : (m.score_b||0);
        const ga = onA ? (m.score_b||0) : (m.score_a||0);
        let a = agg[id];
        if(!a) a = agg[id] = { g:0, w:0, aG:0, aGoals:0, aW:0, dG:0, dGa:0, cg:0, cw:0, c1w:0 };
        a.g++; if(won) a.w++;
        if(pos === 'atk'){ a.aG++; a.aGoals += gf; if(won) a.aW++; }
        else if(pos === 'def'){ a.dG++; a.dGa += ga; }
        if(diff <= 2){ a.cg++; if(won) a.cw++; }
        if(won && diff === 1) a.c1w++;
      }
    }
    _recentMemo = { agg, count };
    return _recentMemo;
  };
  // Deterministischer "Bester nach Metrik"-Picker (Gleichstand → kleinere pid).
  const _formPick = (elig, metric) => {
    let best = null;
    for(const pid of elig){
      const v = metric(pid);
      if(v == null) continue;
      if(!best || v > best.v || (v === best.v && pid < best.pid)) best = { pid, v };
    }
    return best;
  };

  // ── Fun Fact: Tore insgesamt ──
  T.push({ key:'fun_goals', make: () => {
    if(matches.length < 5) return null;
    let g = 0; for(const m of matches) g += (m.score_a||0) + (m.score_b||0);
    return { cat:'fun', ic:'thriller', prio:3,
      title:'Tor-Bilanz der Liga',
      desc:`Insgesamt fielen ${g} Tore in ${matches.length} Spielen — Ø ${(g/matches.length).toFixed(1)} pro Match.` };
  }});

  // ── Fun Fact: aktivster Wochentag ──
  T.push({ key:'fun_weekday', make: () => {
    if(matches.length < 8) return null;
    const wd = [0,0,0,0,0,0,0];
    for(const m of matches){ wd[new Date(m.created_at).getDay()]++; }
    let bi = 0; for(let i = 1; i < 7; i++) if(wd[i] > wd[bi]) bi = i;
    if(!wd[bi]) return null;
    const names = ['sonntags','montags','dienstags','mittwochs','donnerstags','freitags','samstags'];
    return { cat:'fun', ic:'calendar', prio:3,
      title:'Kicker-Tag der Liga',
      desc:`Am häufigsten wird ${names[bi]} gekickt — ${wd[bi]} Spiele bisher.` };
  }});

  // ── Fun Fact: Liga in Zahlen ──
  T.push({ key:'fun_numbers', make: () => {
    if(matches.length < 3) return null;
    return { cat:'fun', ic:'users', prio:2,
      title:'Liga in Zahlen',
      desc:`${matches.length} Duelle, ${activePids.length} aktive Spieler — und es werden mehr.` };
  }});

  // ── Persönlich: Siegquoten-Führer (min. 5 Spiele) ──
  T.push({ key:'personal_wr', make: () => {
    const elig = withStats.filter(pid => stats[pid].games >= 5);
    if(!elig.length) return null;
    elig.sort((a,b) => stats[b].wr - stats[a].wr);
    const pid = elig[0], st = stats[pid];
    return { cat:'personal', ic:'crown', prio:4,
      title:`${nameOf(pid)} an der Spitze`,
      desc:`Beste Siegquote der Liga: ${Math.round(st.wr*100)}% aus ${st.games} Spielen.`,
      dataRef:{ ambientPid: pid } };
  }});

  // ── Persönlich: Vielspieler ──
  T.push({ key:'personal_grinder', make: () => {
    if(!withStats.length) return null;
    const pid = withStats.slice().sort((a,b) => stats[b].games - stats[a].games)[0];
    if(stats[pid].games < 10) return null;
    return { cat:'personal', ic:'medalTrio', prio:3,
      title:`${nameOf(pid)} ist Dauergast`,
      desc:`Niemand spielt mehr: ${stats[pid].games} Partien auf dem Konto.`,
      dataRef:{ ambientPid: pid } };
  }});

  // ── Persönlich: heißeste aktuelle Serie ──
  T.push({ key:'personal_streak', make: () => {
    if(!withStats.length) return null;
    const pid = withStats.slice().sort((a,b) => (stats[b].curStreak||0) - (stats[a].curStreak||0))[0];
    const cs = stats[pid].curStreak || 0;
    if(cs < 3) return null;
    return { cat:'personal', ic:'trendUp', prio:5,
      title:`${nameOf(pid)} läuft heiß`,
      desc:`${cs} Siege in Folge — aktuell die heißeste Serie der Liga.`,
      dataRef:{ ambientPid: pid } };
  }});

  // ── Persönlich: Torjäger (Ø Tore/Spiel, min. 5) ──
  T.push({ key:'personal_scorer', make: () => {
    const elig = withStats.filter(pid => stats[pid].games >= 5);
    if(!elig.length) return null;
    elig.sort((a,b) => (stats[b].gf/stats[b].games) - (stats[a].gf/stats[a].games));
    const pid = elig[0], avg = stats[pid].gf / stats[pid].games;
    if(avg <= 0) return null;
    return { cat:'personal', ic:'thriller', prio:3,
      title:`${nameOf(pid)} trifft am laufenden Band`,
      desc:`Ø ${avg.toFixed(1)} Tore pro Spiel — Bestwert der Liga.`,
      dataRef:{ ambientPid: pid } };
  }});

  // ── Rivalität: meistgespieltes Duell ──
  T.push({ key:'rivalry_most', make: () => {
    const map = (typeof _ensureH2HMap === 'function') ? _ensureH2HMap() : null;
    if(!map || !map.size) return null;
    let best = null;
    for(const [k, e] of map){
      const [pa, pb] = k.split('|');
      if(!pm[pa] || !pm[pb] || pm[pa].hidden || pm[pb].hidden) continue;
      const wa = e.wins[pa]||0, wb = e.wins[pb]||0, total = wa + wb;
      if(total < 3) continue;
      if(!best || total > best.total) best = { pa, pb, total, wa, wb };
    }
    if(!best) return null;
    return { cat:'rivalry', ic:'crossedSwords', prio:4,
      title:`Duell der Liga: ${nameOf(best.pa)} vs ${nameOf(best.pb)}`,
      desc:`${best.total} direkte Duelle — Siege: ${nameOf(best.pa)} ${best.wa}, ${nameOf(best.pb)} ${best.wb}.`,
      dataRef:{ ambientPids:[best.pa, best.pb] } };
  }});

  // ── Rivalität: engste Bilanz (min. 4) ──
  T.push({ key:'rivalry_close', make: () => {
    const map = (typeof _ensureH2HMap === 'function') ? _ensureH2HMap() : null;
    if(!map || !map.size) return null;
    let best = null;
    for(const [k, e] of map){
      const [pa, pb] = k.split('|');
      if(!pm[pa] || !pm[pb] || pm[pa].hidden || pm[pb].hidden) continue;
      const wa = e.wins[pa]||0, wb = e.wins[pb]||0, total = wa + wb;
      if(total < 4) continue;
      const diff = Math.abs(wa - wb);
      if(!best || diff < best.diff || (diff === best.diff && total > best.total)) best = { pa, pb, wa, wb, total, diff };
    }
    if(!best) return null;
    return { cat:'rivalry', ic:'crossedSwords', prio:4,
      title:`Kopf-an-Kopf: ${nameOf(best.pa)} & ${nameOf(best.pb)}`,
      desc:`${best.total} direkte Duelle, ${best.diff === 0 ? 'absolut ausgeglichen' : 'nur ' + best.diff + ' Sieg' + (best.diff === 1 ? '' : 'e') + ' Unterschied'}: ${nameOf(best.pa)} ${best.wa} – ${best.wb} ${nameOf(best.pb)}.`,
      dataRef:{ ambientPids:[best.pa, best.pb] } };
  }});

  // ── Historie: Liga-Alter ──
  T.push({ key:'history_age', make: () => {
    if(!matches.length) return null;
    const first = new Date(matches[0].created_at); // matches ist asc-sortiert (loadAll)
    const days = Math.floor((now - first) / 86400000);
    if(days < 14) return null;
    const dd = String(first.getDate()).padStart(2,'0');
    const mm = String(first.getMonth()+1).padStart(2,'0');
    return { cat:'history', ic:'calendar', prio:2,
      title:'Die Liga lebt',
      desc:`Seit ${days} Tagen wird gekickt — das erste Match war am ${dd}.${mm}.${first.getFullYear()}.` };
  }});

  // ── Fun Fact: Torschützenkönig (meiste Karriere-Tore, v8.8) ──
  T.push({ key:'fun_top_scorer', make: () => {
    const elig = withStats.filter(pid => stats[pid].games >= 5 && stats[pid].gf > 0);
    if(!elig.length) return null;
    const pid = elig.slice().sort((a,b) => stats[b].gf - stats[a].gf)[0];
    return { cat:'personal', ic:'thriller', prio:3,
      title:`${nameOf(pid)} ist Torschützenkönig`,
      desc:`${stats[pid].gf} Tore insgesamt — kein Spieler hat mehr erzielt.`,
      dataRef:{ ambientPid: pid } };
  }});

  // ── Fun Fact: aktueller Spitzenreiter (Elo-#1, v8.8) ──
  T.push({ key:'fun_leader', make: () => {
    if(typeof getGlobalSim !== 'function') return null;
    const elo = (getGlobalSim() || {}).elo || {};
    const ranked = activePids
      .filter(pid => elo[pid] != null && stats[pid] && stats[pid].games >= 3)
      .sort((a,b) => elo[b] - elo[a]);
    if(ranked.length < 2) return null;
    const lead = Math.round(elo[ranked[0]] - elo[ranked[1]]);
    return { cat:'personal', ic:'crown', prio:4,
      title:`${nameOf(ranked[0])} thront an der Spitze`,
      desc:`${Math.round(elo[ranked[0]])} Elo — ${lead} Punkte vor ${nameOf(ranked[1])}.`,
      dataRef:{ ambientPid: ranked[0] } };
  }});

  // ── Fun Fact: höchster Sieg aller Zeiten (v8.8) ──
  T.push({ key:'fun_biggest_win', make: () => {
    if(matches.length < 5) return null;
    let best = null;
    for(const m of matches){
      const hi = Math.max(m.score_a||0, m.score_b||0), lo = Math.min(m.score_a||0, m.score_b||0);
      const diff = hi - lo;
      if(!best || diff > best.diff) best = {diff, hi, lo, m};
    }
    if(!best || best.diff < 6) return null;
    const dt = new Date(best.m.created_at);
    return { cat:'fun', ic:'thriller', prio:3,
      title:'Klarste Klatsche der Liga',
      desc:`Höchster Sieg aller Zeiten: ${best.hi}:${best.lo} am ${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.` };
  }});

  // ── Fun Fact: aktivster Spieltag (v8.8) ──
  T.push({ key:'fun_busiest_day', make: () => {
    if(matches.length < 8) return null;
    const byDay = {};
    for(const m of matches){
      const d = new Date(m.created_at);
      const dk = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      byDay[dk] = (byDay[dk] || 0) + 1;
    }
    let bk = null, bn = 0;
    for(const dk in byDay){ if(byDay[dk] > bn){ bn = byDay[dk]; bk = dk; } }
    if(bn < 5) return null;
    const p = bk.split('-');
    return { cat:'fun', ic:'calendar', prio:2,
      title:'Rekord-Spieltag',
      desc:`Meiste Spiele an einem Tag: ${bn} Partien am ${p[2]}.${p[1]}.${p[0]}.` };
  }});

  // ══ Neue lebendige Fun Facts (v9.1) ══
  const _gsim = () => (typeof getGlobalSim === 'function') ? (getGlobalSim() || {}) : {};

  // ── Fun Fact: Random Top-1 eines Awards/Rankings ──
  T.push({ key:'fun_award_leader', make: (rng) => {
    const career = _gsim().careerElo || {};
    const elig = withStats.filter(pid => stats[pid].games >= 5);
    if(elig.length < 2) return null;
    const cats = [
      { noun:'Meiste Siege',         ic:'trophy',  val: pid => stats[pid].wins,                 fmt: v => v+' Siege' },
      { noun:'Bestes Torverhältnis', ic:'chartUp', val: pid => stats[pid].gf - stats[pid].ga,   fmt: v => (v>0?'+':'')+v+' Tordifferenz' },
      { noun:'Meiste Tore',          ic:'ball',    val: pid => stats[pid].gf,                    fmt: v => v+' Tore' },
      { noun:'Höchste Karriere-Elo', ic:'crown',   val: pid => Math.round(career[pid]||0),       fmt: v => v+' Elo' },
    ];
    const c = cats[Math.floor(rng()*cats.length)];
    let best = null;
    for(const pid of elig){ const v = c.val(pid); if(best===null || v > best.v) best = {pid, v}; }
    if(!best) return null;
    return { cat:'personal', ic:c.ic, prio:5,
      title:`${c.noun}: ${nameOf(best.pid)} führt`,
      desc:`${nameOf(best.pid)} hält den Liga-Bestwert — ${c.fmt(best.v)}.`,
      dataRef:{ ambientPid: best.pid } };
  }});

  // ── Fun Fact: Random Stat zu random Spieler ──
  // v9.11: bewusst höher gewichtet (weight 3) + kürzerer Cooldown (3 statt 7
  // Tage). Dieser Typ hat die größte inhaltliche Variabilität (zufälliger
  // Spieler × zufällige Kennzahl), darf also vergleichsweise öfter kommen, ohne
  // zu langweilen — Standard-Cooldown wäre sonst die harte Frequenz-Obergrenze.
  T.push({ key:'fun_random_stat', weight:3, cooldown:3, make: (rng) => {
    const elig = withStats.filter(pid => stats[pid].games >= 5);
    if(!elig.length) return null;
    const pid = elig[Math.floor(rng()*elig.length)];
    const st = stats[pid];
    const wrPct = st.games ? Math.round(st.wins/st.games*100) : 0;
    const facts = [
      `hat bereits ${st.games} Partien bestritten.`,
      `gewinnt ${wrPct}% seiner Spiele.`,
      `hat insgesamt ${st.gf} Tore erzielt.`,
      `steht bei ${st.wins} Siegen und ${st.losses} Niederlagen.`,
      `trifft im Schnitt ${(st.gf/st.games).toFixed(1)}× pro Spiel.`,
    ];
    return { cat:'personal', ic:'chartBar', prio:4,
      title:'Wusstest du schon?',
      desc:`${nameOf(pid)} ${facts[Math.floor(rng()*facts.length)]}`,
      dataRef:{ ambientPid: pid } };
  }});

  // ── Fun Fact: Platzierung in der ewigen Gesamt-Rangliste (random Spieler) ──
  T.push({ key:'fun_overall_rank', make: (rng) => {
    const career = _gsim().careerElo || {};
    const ranked = activePids
      .filter(pid => stats[pid] && stats[pid].games >= 3 && career[pid] != null)
      .sort((a,b) => career[b] - career[a]);
    if(ranked.length < 3) return null;
    // bewusst nicht #1 (langweilig) → aus dem Rest ziehen
    const idx = 1 + Math.floor(rng()*(ranked.length-1));
    const pid = ranked[idx];
    return { cat:'personal', ic:'medalTrio', prio:4,
      title:`${nameOf(pid)} auf Platz ${idx+1}`,
      desc:`In der ewigen Rangliste steht ${nameOf(pid)} auf Rang ${idx+1} von ${ranked.length} — ${Math.round(career[pid])} Karriere-Elo.`,
      dataRef:{ ambientPid: pid } };
  }});

  // ── Fun Fact: längste gemeinsame Team-Serie (random Rekord-Duo) ──
  T.push({ key:'fun_team_record', make: (rng) => {
    const rec = {}; // teamKey → {ids, best, cur}
    for(const m of matches){
      const sides = [[m.a1,m.a2,m.winner==='A'],[m.b1,m.b2,m.winner==='B']];
      for(const [x,y,won] of sides){
        if(!x || !y) continue;
        const ids = [x,y].sort(), k = ids.join('|');
        if(!rec[k]) rec[k] = {ids, best:0, cur:0};
        rec[k].cur = won ? rec[k].cur + 1 : 0;
        if(rec[k].cur > rec[k].best) rec[k].best = rec[k].cur;
      }
    }
    const cands = Object.values(rec).filter(t =>
      t.best >= 3 && pm[t.ids[0]] && pm[t.ids[1]] && !pm[t.ids[0]].hidden && !pm[t.ids[1]].hidden);
    if(!cands.length) return null;
    const t = cands[Math.floor(rng()*cands.length)];
    return { cat:'team', ic:'unstoppable', prio:5,
      title:`Rekord-Duo: ${nameOf(t.ids[0])} & ${nameOf(t.ids[1])}`,
      desc:`Als Team schafften sie schon mal ${t.best} Siege in Serie — einer der besten gemeinsamen Läufe der Liga.`,
      dataRef:{ ambientPids:[t.ids[0], t.ids[1]] } };
  }});

  // ══ Zeitbasierte Form-Fakten (v9.13) — Momentaufnahme der letzten 14 Tage ══
  // Diese Typen leben von der aktuellen Form: das Fenster rollt täglich weiter,
  // die Bestenlisten ändern sich also von allein und bringen Abwechslung — ein
  // Mittelfeldspieler kann kurzfristig heiß laufen, auch wenn seine Karriere-Werte
  // unauffällig sind. Alle teilen recentAgg() (eine einzige Schleife, s.o.) und
  // greifen auf bereits vorhandene Konventionen zurück (Positionen atk/def,
  // enge Spiele Tordiff ≤ 2 = wie Clutch-Award, 1-Tor-Sieg = Zittersieg).

  // ── Beste Siegquote der letzten 14 Tage ──
  T.push({ key:'form_best_wr', make: () => {
    const { agg, count } = recentAgg();
    if(count < 6) return null;
    const elig = Object.keys(agg).filter(id => agg[id].g >= 4);
    const best = _formPick(elig, id => agg[id].w / agg[id].g);
    if(!best || best.v <= 0) return null;
    const a = agg[best.pid];
    return { cat:'personal', ic:'trendUp', prio:5,
      title:`${nameOf(best.pid)} ist in Topform`,
      desc:`Beste Siegquote der letzten 14 Tage: ${Math.round(best.v*100)}% aus ${a.g} Spielen.`,
      dataRef:{ ambientPid: best.pid } };
  }});

  // ── Aktuell bester Stürmer (Ø Tore + Siegquote im Sturm, letzte 14 Tage) ──
  T.push({ key:'form_striker', make: () => {
    const { agg, count } = recentAgg();
    if(count < 6) return null;
    const elig = Object.keys(agg).filter(id => agg[id].aG >= 3);
    const best = _formPick(elig, id => agg[id].aGoals / agg[id].aG);
    if(!best || best.v <= 0) return null;
    const a = agg[best.pid];
    const wrAtk = Math.round(a.aW / a.aG * 100);
    return { cat:'personal', ic:'bolt', prio:5,
      title:`${nameOf(best.pid)} ist der Sturm-Chef`,
      desc:`Bester Stürmer der letzten 14 Tage: Ø ${best.v.toFixed(1)} Tore und ${wrAtk}% Siege im Sturm.`,
      dataRef:{ ambientPid: best.pid } };
  }});

  // ── Aktuell bester Abwehrspieler (wenigste Gegentore als Abwehr, 14 Tage) ──
  T.push({ key:'form_defender', make: () => {
    const { agg, count } = recentAgg();
    if(count < 6) return null;
    const elig = Object.keys(agg).filter(id => agg[id].dG >= 3);
    // Wenigste Gegentore/Spiel = am besten → Negativ-Metrik maximieren.
    const best = _formPick(elig, id => -(agg[id].dGa / agg[id].dG));
    if(!best) return null;
    const a = agg[best.pid];
    return { cat:'personal', ic:'shieldCheck', prio:5,
      title:`${nameOf(best.pid)} macht die Bude dicht`,
      desc:`Bester Abwehrspieler der letzten 14 Tage: nur Ø ${(a.dGa/a.dG).toFixed(1)} Gegentore in ${a.dG} Abwehr-Spielen.`,
      dataRef:{ ambientPid: best.pid } };
  }});

  // ── Clutch: höchste Siegquote in engen Spielen (Tordiff ≤ 2, 14 Tage) ──
  T.push({ key:'form_clutch', make: () => {
    const { agg, count } = recentAgg();
    if(count < 6) return null;
    const elig = Object.keys(agg).filter(id => agg[id].cg >= 3);
    const best = _formPick(elig, id => agg[id].cw / agg[id].cg);
    if(!best || best.v <= 0) return null;
    const a = agg[best.pid];
    return { cat:'personal', ic:'target', prio:5,
      title:`${nameOf(best.pid)} hat Nerven aus Stahl`,
      desc:`Gewinnt aktuell ${Math.round(best.v*100)}% der engen Spiele (Tordiff ≤ 2) — ${a.cw} von ${a.cg} in 14 Tagen.`,
      dataRef:{ ambientPid: best.pid } };
  }});

  // ── Knappe Siege: höchster Anteil 1-Tor-Siege an allen Spielen (14 Tage) ──
  T.push({ key:'form_close_wins', make: () => {
    const { agg, count } = recentAgg();
    if(count < 6) return null;
    const elig = Object.keys(agg).filter(id => agg[id].g >= 4 && agg[id].c1w >= 2);
    const best = _formPick(elig, id => agg[id].c1w / agg[id].g);
    if(!best || best.v <= 0) return null;
    const a = agg[best.pid];
    return { cat:'personal', ic:'nerves', prio:4,
      title:`${nameOf(best.pid)} zittert sich durch`,
      desc:`${Math.round(best.v*100)}% seiner Spiele der letzten 14 Tage waren 1-Tor-Siege — ${a.c1w} Zittersiege.`,
      dataRef:{ ambientPid: best.pid } };
  }});

  // ── Aktivster Spieler der letzten 14 Tage ──
  T.push({ key:'form_most_active', make: () => {
    const { agg, count } = recentAgg();
    if(count < 8) return null;
    const best = _formPick(Object.keys(agg), id => agg[id].g);
    if(!best || best.v < 4) return null;
    return { cat:'personal', ic:'medalTrio', prio:3,
      title:`${nameOf(best.pid)} gibt Vollgas`,
      desc:`Aktivster Spieler der letzten 14 Tage: ${best.v} Partien in zwei Wochen.`,
      dataRef:{ ambientPid: best.pid } };
  }});

  return T;
}

// ─── §11.2 — Story-Cache (DB-basiert, v8.3) + Display-Konsolidierung ──
// Stories werden in der Supabase-Tabelle `stories` persistiert. Der
// Generator (_buildStories) läuft weiterhin clientseitig und produziert
// Story-Objekte aus Live-Daten. Die werden idempotent in die DB geschrieben
// (ON CONFLICT DO NOTHING) — erste INSERT-Zeit gewinnt also den Timestamp.
//
// Lese-Pfad ist ausschließlich aus der DB:
//   syncStoriesViaDb() läuft in loadAll → befüllt _cache._stories
//   getStoriesCache() returns _cache._stories synchron
//
// Vorteile:
//   - Story-Timestamps stabil über Geräte und App-Starts
//     ("Heute, 02:10" bleibt "Heute, 02:10", nicht "Heute, 14:30" beim Reload)
//   - Cross-Device-Konsistenz (alle Spieler sehen dieselben Stories)
//   - Historische Stories über 90 Tage erhalten (auch wenn der Generator
//     sie längst nicht mehr produzieren würde)
//
// Fallback: wenn DB-Calls fehlschlagen (Migration noch nicht eingespielt,
// Netzwerk down etc.), läuft _buildStories als rein in-memory Generator
// weiter. Die App ist somit auch OHNE Migration sofort funktional.
function getStoriesCache(){
  // v8.4: _cache._stories hält bis zu 100 Stories (DB-Load + Realtime-Reserve,
  // §11.8). v8.6: vor dem UI-Limit (NEWS_LIMITS.total) werden Match-Event-
  // Doppel zusammengefasst (_consolidateStories). Cache ist newest-first.
  const base = Array.isArray(_cache._stories) ? _cache._stories : [];
  return _consolidateStories(base).slice(0, NEWS_LIMITS.total);
}

// Gemeinsamer, gecachter Per-Spieler-Match-Index (asc). Ein Aufbau pro
// (matches, version) statt je Live-Kennzahl neu — Basis für _liveStreakForm.
function _byPlayerMatches(){
  const key = matches.length + '_' + _cache.version;
  if(_cache._byPlayerKey === key) return _cache._byPlayer;
  const byP = {};
  for(const m of matches){
    const ids = [m.a1, m.a2, m.b1, m.b2];
    for(let i = 0; i < 4; i++){ const pid = ids[i]; if(!pid) continue; (byP[pid] || (byP[pid] = [])).push(m); }
  }
  _cache._byPlayerKey = key;
  _cache._byPlayer = byP;
  return byP;
}

// v9.9: Aktuelle (LEBENDE) Sieges-/Niederlagenserie + Top-Form je Spieler in
// EINEM Pass (vorher 3 separate Funktionen mit je eigenem Index-Aufbau).
// Nötig, weil persistierte „ungeschlagen/Pechvogel/Top-Form"-Stories bis
// expires_at im Feed bleiben und sonst Spieler zeigen, deren Serie/Form längst
// gebrochen ist. Caps (Win 20, Loss 12) exakt wie die jeweiligen Generatoren.
// Rückgabe: { loss:{pid:n}, win:{pid:n}, form:{pid:siege_der_letzten_10} }.
function _liveStreakForm(){
  const key = matches.length + '_' + _cache.version;
  if(_cache._liveSFKey === key) return _cache._liveSF;
  const byP = _byPlayerMatches();
  const loss = {}, win = {}, form = {};
  for(const pid in byP){
    const arr = byP[pid];
    let w = 0; for(let i = arr.length - 1; i >= 0; i--){ if(!won(pid, arr[i])) break; w++; if(w > 20) break; }
    let l = 0; for(let i = arr.length - 1; i >= 0; i--){ if(won(pid, arr[i])) break; l++; if(l > 12) break; }
    win[pid] = w; loss[pid] = l;
    form[pid] = arr.length < 10 ? 0 : arr.slice(-10).filter(m => won(pid, m)).length;
  }
  _cache._liveSFKey = key;
  _cache._liveSF = { loss, win, form };
  return _cache._liveSF;
}

// Display-seitige Konsolidierung gegen Match-Event-Spam (v8.6).
// Bewusst beim ANZEIGEN, nicht beim Erzeugen — Gründe:
//   • Stories sind in der DB persistiert (ON CONFLICT DO NOTHING). Würde man im
//     Generator zusammenfassen, blieben bereits gespeicherte Doppel-Rows im
//     Feed. Display-seitig wirkt es auf bestehende UND neue Rows.
//   • "Welches Match ist DER Upset der Woche" ist zeitabhängig (wandert
//     wöchentlich) und darf nicht fix in die DB gebrannt werden.
// Regeln:
//   (a) Gleicher Badge, im selben Match von MEHREREN Spielern → EINE Karte
//       ("Leo & Maxi: Upset-König") statt einer pro Spieler.
//   (b) Der upset_king GENAU des Matches, das schon als "Upset der Woche"-
//       Highlight läuft → entfällt (sonst dasselbe Ereignis doppelt).
// VERSCHIEDENE Badges desselben Matches (z.B. Legende UND Upset-König) bleiben
// getrennt. Memoisiert per Eingabe-Referenz (billiger O(N)-Lauf).
function _consolidateStories(list){
  if(!Array.isArray(list)) return [];
  if(_cache._consolFrom === list && Array.isArray(_cache._consolList)) return _cache._consolList;
  const pm = (typeof pmap === 'function') ? pmap() : {};
  const nameOf = pid => (pm[pid] && pm[pid].name) || '?';
  const fmtNames = arr => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' & ' + arr[arr.length - 1];

  // v9.6: Veraltete „loss_streak"-Stories rausfiltern, BEVOR gruppiert/suppress-
  // iert wird. Eine Story bleibt nur, wenn die AKTUELLE Niederlagenserie des
  // Spielers die genannte Länge noch erreicht. Hat er die Serie durch einen Sieg
  // gebrochen (live=0) oder eine neue, kürzere Serie begonnen, ist die alte Story
  // stale → raus. Sonst zeigt „N Pechvögel" Spieler, die längst nicht mehr in
  // Serie verlieren (z.B. jemand mit 1-0-Bilanz als angeblicher 6er-Pechvogel).
  // v9.9: dieselbe Logik für „ungeschlagen"/win_streak. Eine persistierte
  // Sieges-Serien-Story bleibt nur, wenn die AKTUELLE Serie des Spielers die
  // genannte Länge noch erreicht. Hat er verloren (live=0) oder eine neue,
  // kürzere Serie begonnen, ist die alte Story stale → raus. Verhindert
  // „Leo ungeschlagen (5)", obwohl Leo längst wieder verloren hat.
  const { loss: _liveLoss, win: _liveWin, form: _liveForm } = _liveStreakForm();
  const src = list.filter(s => {
    const d = (s && s.dataRef) || {};
    if(d.type === 'loss_streak' && d.pid) return (_liveLoss[d.pid] || 0) >= (d.streak || 0);
    if(d.type === 'win_streak' && d.pid) return (_liveWin[d.pid] || 0) >= (d.streak || 0);
    if(d.type === 'top_form' && d.pid) return (_liveForm[d.pid] || 0) >= (d.wins || 0);
    return true;
  });

  // Regel-Tabelle (v8.7): Highlights, die einen Badge inhaltlich ABDECKEN →
  // der Badge entfällt, sonst stünde dasselbe Ereignis doppelt im Feed.
  const HL_COVERS = {
    upset_match:     { badges:['upset_king'],                     by:'matchId' },
    biggest_blowout: { badges:['perfect_win'],                    by:'matchId' },
    // v9.9: streak5 ergänzt — die „ungeschlagen"-Story startet bei ≥5, deckt
    // also das 5er-Serie-Badge inhaltlich ab (sonst dieselbe Aussage doppelt:
    // „2 ungeschlagene Spieler: Leon (5)" + Badge „Leon: 5er Serie").
    win_streak:      { badges:['streak5','streak10','streak15','streak20'], by:'pid' },
    // v9.5: die „Losing Streak"-Badge (losing5) beschreibt exakt dasselbe
    // Ereignis wie die individuelle Niederlagenserie-Story (5 Pleiten in Folge)
    // → Badge entfällt, die reichere „Pechvögel"-Story bleibt.
    loss_streak:     { badges:['losing5'],                        by:'pid'     },
  };
  const suppressMatch = new Set();  // 'badgeId|matchId'
  const suppressPlayer = new Set(); // 'badgeId|playerId'
  // v9.4: Paare, die schon eine „N. Aufeinandertreffen"-Meilenstein-Story haben
  // → die allgemeine „rivalry"-Story (gleiche Paarung) entfällt (sonst doppelt).
  const rivalryMsPairs = new Set();
  const giantSlayerMatches = new Set(); // matchIds mit Giant-Slayer-Breaking
  // v9.5: Spieler mit laufender „Siege in Folge"-Story → deren Top-Form-Story
  // (≥8/10) beschreibt dieselbe heiße Phase und entfällt (kein Doppel).
  const winStreakPids = new Set();
  for(const s of src){
    const d = s.dataRef || {};
    if(d.type === 'rivalry_milestone' && d.a && d.b) rivalryMsPairs.add([d.a, d.b].sort().join('|'));
    if(d.type === 'giant_slayer' && d.matchId) giantSlayerMatches.add(d.matchId);
    if(d.type === 'win_streak' && d.pid) winStreakPids.add(d.pid);
    const rule = HL_COVERS[d.type];
    if(!rule) continue;
    const keyVal = rule.by === 'matchId' ? d.matchId : d.pid;
    if(!keyVal) continue;
    for(const b of rule.badges){
      (rule.by === 'matchId' ? suppressMatch : suppressPlayer).add(b + '|' + keyVal);
    }
  }

  // Gruppierbare Typen (v8.8): mehrere gleichartige Per-Spieler-Stories werden
  // zu EINER Karte zusammengefasst ("3 Pechvögel: Maxi, Alex & Tom") statt
  // einzeln den Feed zu fluten. frag() liefert den Pro-Spieler-Schnipsel.
  const GROUPABLE = {
    loss_streak:     { label:'Pechvögel',           ic:'dropDouble', frag:s=>`${nameOf(s.dataRef.pid)} (${s.dataRef.streak})`, desc:f=>`Niederlagen in Folge: ${f}. Wer dreht es zuerst?` },
    top_form:        { label:'Spieler in Top-Form', ic:'flame',      frag:s=>`${nameOf(s.dataRef.pid)} (${s.dataRef.wins}/10)`, desc:f=>`Überragende letzte 10 Spiele: ${f}.` },
    win_streak:      { label:'ungeschlagene Spieler', ic:'flame',    frag:s=>`${nameOf(s.dataRef.pid)} (${s.dataRef.streak})`, desc:f=>`Siege in Folge: ${f}.` },
    jubilee:         { label:'Jubiläen',            ic:'calendar',   frag:s=>`${nameOf(s.dataRef.pid)} (${s.dataRef.total}.)`, desc:f=>`Spiele-Meilensteine: ${f}.` },
    milestone_wins:  { label:'Sieg-Meilensteine',   ic:'medalTrio',  frag:s=>`${nameOf(s.dataRef.pid)} (${s.dataRef.milestone})`, desc:f=>`Glückwunsch: ${f}.` },
    milestone_goals: { label:'Tor-Meilensteine',    ic:'thriller',   frag:s=>`${nameOf(s.dataRef.pid)} (${s.dataRef.milestone})`, desc:f=>`Glückwunsch: ${f}.` },
    milestone_elo:   { label:'Elo-Meilensteine',    ic:'peak',       frag:s=>`${nameOf(s.dataRef.pid)} (${s.dataRef.milestone})`, desc:f=>`Neue Bestwerte: ${f}.` },
  };

  const badgeGroups = new Map();
  const typeGroups = new Map();
  const slots = [];
  // v9.12: Exakte Inhalts-Doubletten (gleicher Titel + Text) nur EINMAL zeigen.
  // Grund: Ambiente Fun Facts werden pro Slot (10:00/19:00) tageweise persistiert;
  // greift der Typ-Cooldown bei kaltem _cache._stories nicht (Generator läuft in
  // syncStoriesViaDb vor dem DB-Load), landet derselbe Fun Fact an mehreren
  // Slots/Tagen mit IDENTISCHEM Inhalt (z.B. „Leon thront an der Spitze", solange
  // die Elo gleich bleibt). Da Stories persistiert sind, hilft nur Display-seitige
  // Deduplizierung — sie wirkt auf bestehende UND neue Rows. list ist newest-first
  // → die JÜNGSTE Karte bleibt, ältere inhaltsgleiche entfallen. Gilt für
  // ungruppierte Stories (Gruppen dedupen bereits per Spieler/Match).
  const seenContent = new Set();
  for(const s of src){
    const d = s.dataRef || {};
    // v9.4: allgemeine Rivalitäts-Story entfällt, wenn dasselbe Paar bereits
    // eine (spezifischere) Meilenstein-Story hat.
    if(d.type === 'rivalry' && d.a && d.b && rivalryMsPairs.has([d.a, d.b].sort().join('|'))) continue;
    // v9.4: „Upset der Woche" entfällt, wenn dasselbe Match schon als
    // (stärkeres) Giant-Slayer-Breaking läuft.
    if(d.type === 'upset_match' && d.matchId && giantSlayerMatches.has(d.matchId)) continue;
    // v9.5: Top-Form-Story entfällt für Spieler, die ohnehin schon eine
    // (konkretere) „Siege in Folge"-Story haben — sonst steht dieselbe heiße
    // Phase doppelt im Feed.
    if(d.type === 'top_form' && d.pid && winStreakPids.has(d.pid)) continue;
    if(d.type === 'badge_unlocked' && d.badgeId){
      if(d.matchId && suppressMatch.has(d.badgeId + '|' + d.matchId)) continue;
      if(d.playerId && suppressPlayer.has(d.badgeId + '|' + d.playerId)) continue;
      const gk = d.badgeId + '|' + (d.matchId || '');
      let g = badgeGroups.get(gk);
      if(!g){ g = { rep: s, pids: [], seen: new Set() }; badgeGroups.set(gk, g); slots.push({ b: gk }); }
      if(!g.seen.has(d.playerId)){ g.seen.add(d.playerId); g.pids.push(d.playerId); }
    } else if(GROUPABLE[d.type] && d.pid){
      let g = typeGroups.get(d.type);
      if(!g){ g = { rep: s, members: [], seen: new Set() }; typeGroups.set(d.type, g); slots.push({ t: d.type }); }
      // v9.4: pro Spieler nur EINMAL (list ist newest-first → jüngster Stand
      // bleibt). Verhindert Duplikate wie „Maxi, Maxi, Alex … Alex".
      if(!g.seen.has(d.pid)){ g.seen.add(d.pid); g.members.push(s); }
    } else {
      const ck = (s.title || '') + '\u0000' + (s.desc || '');
      if(seenContent.has(ck)) continue;   // inhaltsgleiche Doublette → überspringen
      seenContent.add(ck);
      slots.push({ s });
    }
  }

  const result = [];
  for(const slot of slots){
    if(slot.s){ result.push(slot.s); continue; }
    if(slot.b){
      const g = badgeGroups.get(slot.b);
      if(g.pids.length <= 1){ result.push(g.rep); continue; }
      const rep = g.rep, d = rep.dataRef || {};
      const names = g.pids.map(nameOf).sort((a, b) => a.localeCompare(b, 'de'));
      const bn = d.badgeName || (rep.title.includes(': ') ? rep.title.split(': ').slice(1).join(': ') : 'Badge');
      result.push(Object.assign({}, rep, {
        id: 'badgegrp_' + d.badgeId + '_' + (d.matchId || ''),
        title: `${fmtNames(names)}: ${bn}`,
        dataRef: Object.assign({}, d, { playerIds: g.pids })
      }));
      continue;
    }
    if(slot.t){
      const g = typeGroups.get(slot.t);
      if(g.members.length <= 1){ result.push(g.rep); continue; } // Einzel: Original unverändert
      const cfg = GROUPABLE[slot.t], rep = g.rep;
      const members = g.members.slice().sort((a, b) => (b.prio||0) - (a.prio||0));
      const pids = members.map(m => (m.dataRef||{}).pid).filter(Boolean);
      const names = pids.map(nameOf);
      const frags = members.map(m => cfg.frag(m));
      const when = members.reduce((mx, m) => (m.when > mx ? m.when : mx), members[0].when);
      const prio = members.reduce((mx, m) => ((m.prio||0) > mx ? (m.prio||0) : mx), 0);
      result.push({
        id: 'grp_' + slot.t + '_' + pids.slice().sort().join('-'),
        cat: rep.cat,
        ic: cfg.ic || rep.ic,
        title: `${members.length} ${cfg.label}: ${fmtNames(names)}`,
        desc: cfg.desc(frags.join(', ')),
        when, prio,
        dataRef: { type:'group', sub: slot.t, playerIds: pids, frags }
      });
      continue;
    }
  }
  _cache._consolFrom = list;
  _cache._consolList = result;
  return result;
}

// Wird in loadAll() aufgerufen. Generator → DB-Upsert → DB-Read → Cache.
// Vollständig in try/catch gewrappt — Failures degradieren auf Fallback.
async function syncStoriesViaDb(){
  let generated = [];
  try { generated = _buildStories() || []; }
  catch(e){ if(NEWS_DEBUG || window.NEWS_DEBUG) console.warn('[news] generator failed', e); }

  // Versuch 1: DB-Pfad
  try {
    await _cleanupExpiredStoriesInDb();        // 1× pro Sync, idempotent
    await _uploadNewStoriesToDb(generated);    // INSERT ON CONFLICT DO NOTHING
    const fromDb = await _loadStoriesFromDb(); // SELECT die letzten 100
    if(Array.isArray(fromDb)){
      _cache._stories = fromDb;
      _ensureStoriesRealtime(); // v8.4: Realtime erst nach erstem erfolgreichen DB-Sync
      _startNewsAutoSync();     // v8.5: ambiente Tages-Stories ohne Reload erscheinen lassen
      return;
    }
  } catch(e){
    // Migration evtl. noch nicht eingespielt → Tabelle fehlt → 42P01
    // oder Netzfehler. Defensiv: in-memory Fallback nutzen, App bleibt nutzbar.
    if(NEWS_DEBUG || window.NEWS_DEBUG) console.warn('[news] DB sync failed, falling back to in-memory', e?.message || e);
  }

  // Versuch 2: in-memory Fallback (alter Zustand)
  _cache._stories = generated;
}
window.syncStoriesViaDb = syncStoriesViaDb;

// ── DB-Helper ──
// Storage-Form ⇄ Runtime-Form Konversion. Story-Objekte des Generators
// haben `when` als Date; in der DB lebt das als `event_at` TIMESTAMPTZ.
function _storyToRow(s){
  return {
    id:          s.id,
    type:        (s.dataRef && s.dataRef.type) || s.id.split('_')[0] || 'unknown',
    category:    s.cat,
    icon:        s.ic || null,
    title:       s.title,
    description: s.desc,
    data_ref:    s.dataRef || {},
    priority:    s.prio | 0,
    event_at:    (s.when instanceof Date ? s.when : new Date(s.when)).toISOString(),
  };
}
function _rowToStory(r){
  return {
    id:       r.id,
    cat:      r.category,
    ic:       r.icon || undefined,
    title:    r.title,
    desc:     r.description,
    dataRef:  r.data_ref || {},
    prio:     r.priority | 0,
    when:     new Date(r.event_at),
  };
}

// Batch-INSERT mit ON CONFLICT DO NOTHING. PostgREST/Supabase macht das per
// `upsert(...,{ignoreDuplicates:true})` — der spannende Teil ist: WIR verändern
// vorhandene Zeilen nicht (kein UPDATE), damit `event_at`/`created_at` der
// ersten Generation erhalten bleiben.
async function _uploadNewStoriesToDb(stories){
  if(!stories || !stories.length) return;
  const rows = stories.map(_storyToRow);
  // In Batches → schützt vor Payload-Limits bei großen Datensätzen. (v8.4)
  // Realistisch sind ~30 Stories pro Sync → ein einziger Batch. 200 deckt auch
  // den Erststart nach langer Pause ab (Postgres erlaubt 1000+ Rows/INSERT).
  const BATCH_SIZE = 200;
  for(let i = 0; i < rows.length; i += BATCH_SIZE){
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await sb.from('stories').upsert(chunk, {
      onConflict: 'id',
      ignoreDuplicates: true,
    });
    if(error) throw error;
  }
}

// Read: neueste 100 nicht-abgelaufene Stories, sortiert nach event_at desc.
// Die Anzeige-Limits (NEWS_LIMITS.total = 50) werden weiterhin im UI greifen.
async function _loadStoriesFromDb(){
  const { data, error } = await sb.from('stories')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('event_at', { ascending: false })
    .limit(100);
  if(error) throw error;
  return (data || []).map(_rowToStory);
}

// Cleanup: löscht alle abgelaufenen Stories. Idempotent, 1× pro Sync.
// Die RLS-Policy "stories_delete_old" erlaubt nur DELETE WHERE expires_at < NOW().
async function _cleanupExpiredStoriesInDb(){
  const { error } = await sb.from('stories')
    .delete()
    .lt('expires_at', new Date().toISOString());
  if(error){
    // 42P01 = Tabelle existiert nicht → Migration nicht eingespielt
    // → bubblen, syncStoriesViaDb fällt auf in-memory zurück
    throw error;
  }
}

// ─── §11.8 — Realtime-Subscription auf `stories` (v8.4) ──────────────
// Wenn ein ANDERES Gerät neue Stories inserted (via syncStoriesViaDb auf der
// Gegenstelle), bekommt dieses Gerät das ohne App-Reload mit. Der Channel wird
// EINMAL beim ersten erfolgreichen DB-Sync aufgebaut und danach
// wiederverwendet — loadAll re-subscribed NICHT (Guard über _storiesChannel).
//
// VORAUSSETZUNG (Dashboard, einmalig): Replication muss für `stories` aktiv
// sein — Database → Replication → supabase_realtime → stories. Ist sie NICHT
// aktiv, liefert subscribe() trotzdem 'SUBSCRIBED', es kommen aber keine
// Events. Das ist clientseitig nicht erkennbar → hier nur dokumentiert.
//
// Graceful degradation: schlägt der Channel fehl (CHANNEL_ERROR/TIMED_OUT),
// läuft die App mit dem bestehenden loadAll-basierten Sync normal weiter —
// kein UI-Block, nur console.warn (hinter NEWS_DEBUG).
let _storiesChannel = null;

function _ensureStoriesRealtime(){
  if(_storiesChannel) return;                       // bereits abonniert
  if(typeof sb === 'undefined' || !sb || !sb.channel) return;
  try {
    // Sofort referenzieren → verhindert doppeltes subscribe bei zwei schnell
    // aufeinanderfolgenden loadAll, bevor der async subscribe-Callback feuert.
    _storiesChannel = sb.channel('stories_changes')
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'stories' },
          (payload) => { try { _onStoryRealtimeInsert(payload.new); }
                         catch(e){ if(NEWS_DEBUG || window.NEWS_DEBUG) console.warn('[news] realtime insert failed', e); } })
      .on('postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'stories' },
          (payload) => { try { _onStoryRealtimeDelete(payload.old); }
                         catch(e){ if(NEWS_DEBUG || window.NEWS_DEBUG) console.warn('[news] realtime delete failed', e); } })
      .subscribe((status) => {
        if(NEWS_DEBUG || window.NEWS_DEBUG) console.log('[news] realtime status:', status);
        if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'){
          // Channel verwerfen → ein späterer syncStoriesViaDb darf neu versuchen.
          if(NEWS_DEBUG || window.NEWS_DEBUG) console.warn('[news] realtime inactive ('+status+') — loadAll-Sync bleibt aktiv');
          _storiesChannel = null;
        }
      });
  } catch(e){
    if(NEWS_DEBUG || window.NEWS_DEBUG) console.warn('[news] realtime subscribe failed', e);
    _storiesChannel = null;
  }
}

// INSERT: neue Story eines anderen Geräts in den Memory-Cache übernehmen.
function _onStoryRealtimeInsert(row){
  if(!row || !row.id) return;
  if(!Array.isArray(_cache._stories)) _cache._stories = [];
  // Eigener Insert / Duplikat → ignorieren.
  if(_cache._stories.some(s => s.id === row.id)) return;
  const story = _rowToStory(row);
  // Einsortieren (newest-first nach event_at) + auf 100 kürzen (Reserve, §11.2).
  // NEUE Array-Referenz → Konsolidierungs-Memo (§11.2) bricht sauber.
  const next = _cache._stories.concat([story]);
  next.sort((a, b) => b.when - a.when);
  _cache._stories = next.slice(0, 100);
  // Badge + Toast + offene Views aktualisieren (Story-Detail #ndBg bleibt unberührt).
  _refreshOpenNewsViews();
}

// DELETE: abgelaufene/gelöschte Story aus dem Memory-Cache entfernen.
function _onStoryRealtimeDelete(row){
  if(!row || !row.id) return;
  if(!Array.isArray(_cache._stories)) return;
  const before = _cache._stories.length;
  _cache._stories = _cache._stories.filter(s => s.id !== row.id);
  if(_cache._stories.length === before) return; // war nicht im Cache → nichts tun
  // Feed re-rendern (Karte verschwindet). Badge NICHT anfassen — newsBadgeRefresh
  // zählt beim nächsten Lauf ohnehin nur noch vorhandene Stories.
  try { if(_isNewsFeedOpen()) _renderNewsFeed(); } catch(e){}
}

// Offen-Zustände (DOM): Feed lebt im #sheet (enthält .nv-list-flat), Mini-Popup
// im #nvBg (Klasse 'show'). Story-Detail (#ndBg) wird bewusst nicht live verändert.
function _isNewsFeedOpen(){
  const sheet = document.getElementById('sheet');
  return !!(sheet && sheet.classList.contains('show') && sheet.querySelector('.nv-list-flat'));
}
function _isNewsPopoverOpen(){
  const bg = document.getElementById('nvBg');
  return !!(bg && bg.classList.contains('show'));
}

// Cleanup beim App-Close: sauberer Realtime-Disconnect.
window.addEventListener('beforeunload', () => {
  try { if(_storiesChannel) _storiesChannel.unsubscribe(); } catch(e){}
});

// Offene News-Views konsistent aktualisieren (Badge/Toast + Feed + Mini-Popup).
// Story-Detail (#ndBg) wird bewusst NICHT angefasst (User liest gerade etwas).
function _refreshOpenNewsViews(){
  try { if(typeof newsBadgeRefresh === 'function') newsBadgeRefresh(); } catch(e){}
  try { if(_isNewsFeedOpen()) _renderNewsFeed(); } catch(e){}
  try { if(_isNewsPopoverOpen()) openNewsPopover(); } catch(e){}
}

// ─── §11.9 — Periodischer News-Auto-Sync (v8.5) ──────────────────────
// Lässt ambiente Fun-Fact-Stories (§11.1b) OHNE Reload erscheinen: alle paar
// Minuten neu synchronisieren. Pausiert bei verstecktem Tab (spart Requests)
// und holt beim Wieder-Sichtbarwerden sofort nach (verpasster 19-Uhr-Slot).
// Spamfrei: Inserts sind tages-deterministisch (ON CONFLICT) → max. 1 neue
// Ambient-Row alle 2 Tage, egal wie oft der Tick läuft.
let _newsAutoSyncTimer = null;
let _newsAutoSyncRunning = false;
async function _newsAutoSyncTick(){
  if(_newsAutoSyncRunning) return;                       // kein Overlap
  if(typeof document !== 'undefined' && document.hidden) return; // Tab im Hintergrund
  if(typeof syncStoriesViaDb !== 'function') return;
  _newsAutoSyncRunning = true;
  try {
    await syncStoriesViaDb();   // Generator (memo) → ggf. neuer Slot → Upload → Reload
    _refreshOpenNewsViews();
  } catch(e){ if(NEWS_DEBUG || window.NEWS_DEBUG) console.warn('[news] auto-sync failed', e); }
  finally { _newsAutoSyncRunning = false; }
}
function _startNewsAutoSync(){
  if(_newsAutoSyncTimer) return;                         // nur einmal starten
  if(typeof setInterval !== 'function') return;
  _newsAutoSyncTimer = setInterval(_newsAutoSyncTick, NEWS_AUTOSYNC_MS);
  if(typeof document !== 'undefined'){
    document.addEventListener('visibilitychange', () => { if(!document.hidden) _newsAutoSyncTick(); });
  }
}

// ─── §11.3 — LocalStorage (Read-State) ───────────────────────────────
// Ring-Buffer-Pattern: max 200 IDs werden gespeichert, älteste fallen raus.
// Lesen ist O(N), Schreiben ist O(N) (Array-Operations). Bei N=200 vernachlässigbar.
function _newsLoadSeen(){
  try {
    const raw = localStorage.getItem(NEWS_LS_SEEN);
    if(!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch(e){ return new Set(); }
}
function _newsSaveSeen(set){
  try {
    // Ring-Buffer: bei Überlauf älteste IDs verwerfen (chronologische Reihenfolge
    // = Einfüge-Reihenfolge → Set-Iteration garantiert das in JS).
    let arr = [...set];
    if(arr.length > NEWS_LS_MAX_SEEN) arr = arr.slice(-NEWS_LS_MAX_SEEN);
    localStorage.setItem(NEWS_LS_SEEN, JSON.stringify(arr));
  } catch(e){}
}
function _newsMarkSeen(ids){
  const seen = _newsLoadSeen();
  const list = Array.isArray(ids) ? ids : [ids];
  list.forEach(id => seen.add(id));
  _newsSaveSeen(seen);
}
function _newsMarkAllSeen(){
  const stories = getStoriesCache();
  _newsMarkSeen(stories.map(s => s.id));
}
function newsUnreadCount(){
  const stories = getStoriesCache();
  const seen = _newsLoadSeen();
  return stories.filter(s => !seen.has(s.id)).length;
}

// ─── §11.4 — Header-Badge-Refresh ────────────────────────────────────
// Wird nach loadAll() und nach gezielten UI-Aktionen aufgerufen.
// Stellt das News-Button-Sichtbarkeit und die Unread-Pille korrekt ein.
// Zusätzlich (v8.1): zeigt einmalig den "X neue Stories"-Toast, wenn neue
// Stories vorliegen und der Cooldown abgelaufen ist.
function newsBadgeRefresh(){
  const btn = document.getElementById('newsBtn');
  const badge = document.getElementById('newsBtnBadge');
  if(!btn || !badge) return;
  btn.style.visibility = 'visible';
  // v8.2: erste Aufruf nach Page-Load → Boot-Grace setzen, damit der
  // Toast den Auto-Recaps Vorrang gibt.
  if(!_newsBootGuardSet){
    _newsBootGuardSet = true;
    _newsBootGuardUntil = Date.now() + NEWS_BOOT_GRACE_MS;
    // Nach Ablauf der Grace einmal nachversuchen
    setTimeout(() => { try { _processDeferredNewsToast(); } catch(e){} }, NEWS_BOOT_GRACE_MS + 100);
  }
  let n = 0;
  try { n = newsUnreadCount(); } catch(e){ n = 0; }
  if(n > 0){
    badge.style.display = '';
    badge.textContent = n > 9 ? '9+' : String(n);
    // Toast nur bei "echten" Neuigkeiten (nicht bei jedem Refresh)
    _maybeShowNewsToast(n);
  } else {
    badge.style.display = 'none';
    // Falls alles gelesen → Toast sofort ausblenden (Zustände konsistent) UND
    // einen evtl. für den Sheet-Close gequeuten Toast verwerfen (v9.5-Fix),
    // damit nach „alle gelesen" + schnellem Schließen kein „X neue Stories"
    // mehr aufpoppt.
    _newsToastDeferredCount = 0;
    try { _hideNewsToast(); } catch(e){}
  }
}
// Global verfügbar machen, damit loadAll und onclick-Handler dranzukommen
window.newsBadgeRefresh = newsBadgeRefresh;

// ─── §11.4b — Toast-Logik (v8.1, erweitert v8.2) ─────────────────────
// Cooldown-basierter Hinweis "X neue Stories" unter dem News-Icon.
//
// Defer-Logik (v8.2): Toast darf NICHT erscheinen, solange ein Sheet
// (Saison-/POTW-/POTD-Recap, Profil etc.) offen ist — sonst überdeckt
// das Recap den Toast und der User sieht ihn nie. Stattdessen wird die
// Anzeige gequeued und beim closeSheet() erneut versucht.
//
// Cooldown gegen Spam (zweistufig):
//   1. unread > zuletzt gezeigte Anzahl  → es gibt WIRKLICH mehr Stories
//   2. ODER seit letztem Toast > 6h verstrichen → erneut sanft erinnern
// Auto-hide nach 4s. Tap → Mini-Popup.
let _newsToastHideTimer = null;
let _newsToastDeferredCount = 0; // wartet auf Sheet-Close
// v8.2: Boot-Grace gegen Race-Condition mit Auto-Recaps.
//   Saison-Recap   → 600ms nach loadAll
//   POTW-Recap     → 900ms
//   POTD-Recap     → 1200ms
// → Für 2500ms nach erstem newsBadgeRefresh wird Toast ZURÜCKGESTELLT,
//   damit Recaps Vorrang haben. _processDeferredNewsToast (closeSheet-Hook)
//   holt ihn nach. Das macht Recaps + Toast nacheinander statt überlappend.
let _newsBootGuardSet = false;
let _newsBootGuardUntil = 0;
const NEWS_BOOT_GRACE_MS = 2500;
function _newsLoadToastState(){
  try {
    const raw = localStorage.getItem(NEWS_LS_TOAST);
    if(!raw) return {lastCount: 0, lastTs: 0};
    const o = JSON.parse(raw);
    return {lastCount: o.lastCount|0, lastTs: o.lastTs|0};
  } catch(e){ return {lastCount: 0, lastTs: 0}; }
}
function _newsSaveToastState(state){
  try { localStorage.setItem(NEWS_LS_TOAST, JSON.stringify(state)); } catch(e){}
}
// True, wenn aktuell ein Sheet offen ODER ein Recap in Schutz-Phase
// ODER die Boot-Grace-Period noch läuft. Während Boot-Grace warten wir,
// damit Auto-Recaps (Saison/POTW/POTD) ihre 600-1200ms-Verzögerung sicher
// nutzen können, BEVOR der Toast erscheint.
function _isSheetActive(){
  try {
    // Boot-Grace: Toast erst nach Recap-Trigger-Fenster zulassen
    if(_newsBootGuardUntil && Date.now() < _newsBootGuardUntil) return true;
    const sheet = document.getElementById('sheet');
    if(sheet && sheet.classList.contains('show')) return true;
    // Auch wenn das Sheet gleich auftaucht (Schutz-Phase aktiv) → warten
    if(sheet && sheet._protectedUntil && Date.now() < sheet._protectedUntil) return true;
  } catch(e){}
  return false;
}
function _maybeShowNewsToast(unreadCount){
  const toast = document.getElementById('newsToast');
  const txt = document.getElementById('newsToastTxt');
  if(!toast || !txt || unreadCount <= 0) return;
  const state = _newsLoadToastState();
  const now = Date.now();
  const moreThanBefore = unreadCount > state.lastCount;
  const cooledDown = (now - state.lastTs) > NEWS_TOAST_COOLDOWN_MS;
  if(!moreThanBefore && !cooledDown) return;
  // ── Defer wenn Recap/Sheet aktiv ─────────────────────────────────
  if(_isSheetActive()){
    _newsToastDeferredCount = unreadCount;
    return;
  }
  // Anzeigen
  txt.textContent = unreadCount + (unreadCount === 1 ? ' neue Story' : ' neue Stories');
  _positionNewsToast();
  toast.classList.add('visible');
  // Reflow erzwingen für CSS-Animation
  void toast.offsetWidth;
  toast.classList.add('show');
  _newsSaveToastState({lastCount: unreadCount, lastTs: now});
  _newsToastDeferredCount = 0;
  // Auto-hide nach 4s
  if(_newsToastHideTimer) clearTimeout(_newsToastHideTimer);
  _newsToastHideTimer = setTimeout(() => _hideNewsToast(), 4000);
  // Click → volles Sheet (v8.9, konsistent mit dem News-Button), Toast aus
  toast.onclick = () => {
    _hideNewsToast();
    try { openNewsFeed(); } catch(e){}
  };
}
function _hideNewsToast(){
  const toast = document.getElementById('newsToast');
  if(!toast) return;
  if(_newsToastHideTimer){ clearTimeout(_newsToastHideTimer); _newsToastHideTimer = null; }
  toast.classList.remove('show');
  setTimeout(() => toast.classList.remove('visible'), 300);
}
// v9: Toast dynamisch unter der News-Pille ausrichten (Pfeil zeigt auf die
// Button-Mitte). Nötig, weil die Pille (Idee E) breiter/variabler ist als das
// frühere Icon — der feste right:60px würde daneben zeigen. Wird nur beim
// Anzeigen aufgerufen (billig: zwei getBoundingClientRect).
function _positionNewsToast(){
  const toast = document.getElementById('newsToast');
  const btn = document.getElementById('newsBtn');
  if(!toast || !btn) return;
  const parent = btn.closest('.appbar');
  if(!parent) return;
  const pr = parent.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  if(!br.width) return; // Button (noch) unsichtbar
  const centerFromRight = pr.right - (br.left + br.width / 2);
  const ARROW = 18, HALF = 5, MINR = 8;
  let toastRight = centerFromRight - ARROW - HALF;
  let arrow = ARROW;
  if(toastRight < MINR){ toastRight = MINR; arrow = Math.max(ARROW, centerFromRight - toastRight - HALF); }
  toast.style.right = toastRight + 'px';
  toast.style.setProperty('--nt-arrow', arrow + 'px');
}
// Wird in closeSheet() aufgerufen — versucht gequeuten Toast nach
// kurzem Delay (User soll Sheet-Close-Animation sehen, bevor der nächste
// Hinweis aufpoppt).
function _processDeferredNewsToast(){
  if(!_newsToastDeferredCount) return;
  setTimeout(() => {
    // erneut prüfen: vielleicht hat sich währenddessen ein neues Sheet geöffnet
    if(_isSheetActive()) return;
    // v9.5-Fix: den Unread-Stand HIER NEU berechnen statt den gemerkten Count
    // zu verwenden. Der gemerkte Count wurde beim Öffnen des Sheets eingefroren;
    // hat der User danach im Sheet Stories (oder „alle") als gelesen markiert
    // und das Sheet schnell geschlossen, war der gemerkte Count veraltet und
    // der Toast poppte mit „X neue Stories" auf, obwohl keine mehr offen sind.
    // Jetzt zeigt der Toast nur, wenn WIRKLICH noch ungelesene Stories da sind.
    let n = 0;
    try { n = newsUnreadCount(); } catch(e){ n = 0; }
    _newsToastDeferredCount = 0;
    if(n <= 0) return;
    // Direkt anzeigen — Cooldown-Check schon im _maybeShowNewsToast wurde
    // bereits beim ersten Aufruf erfüllt; hier zwingen wir die Anzeige.
    const toast = document.getElementById('newsToast');
    const txt = document.getElementById('newsToastTxt');
    if(!toast || !txt) return;
    txt.textContent = n + (n === 1 ? ' neue Story' : ' neue Stories');
    _positionNewsToast();
    toast.classList.add('visible');
    void toast.offsetWidth;
    toast.classList.add('show');
    _newsSaveToastState({lastCount: n, lastTs: Date.now()});
    if(_newsToastHideTimer) clearTimeout(_newsToastHideTimer);
    _newsToastHideTimer = setTimeout(() => _hideNewsToast(), 4000);
    toast.onclick = () => {
      _hideNewsToast();
      try { openNewsFeed(); } catch(e){}
    };
  }, 500);
}
window._processDeferredNewsToast = _processDeferredNewsToast;

// ─── §11.5 — Mini-Popup ──────────────────────────────────────────────
// Klein, kompakt, max 5 Stories. Beim Öffnen: Stories werden NICHT als
// gelesen markiert; das passiert erst beim Schließen/Wechsel zum Vollfeed.
// Ein einzelner Story-Tap markiert nur diese eine Story.
function openNewsPopover(){
  // Falls der "X neue Stories"-Toast gerade läuft, sofort ausblenden —
  // er hat seinen Job (User auf News aufmerksam machen) erfüllt.
  try { _hideNewsToast(); } catch(e){}
  const stories = getStoriesCache();
  const seen = _newsLoadSeen();
  const top = stories.slice(0, 5);
  const nv = document.getElementById('nv');
  const bg = document.getElementById('nvBg');
  if(!nv || !bg) return;
  const newCount = stories.filter(s => !seen.has(s.id)).length;
  const headerSub = newCount > 0
    ? (newCount === 1 ? '1 neue Story' : newCount+' neue Stories')
    : (stories.length ? 'Aktuelles aus der Liga' : 'Noch keine Stories');
  nv.innerHTML = `
    <div class="nv-head">
      <div class="nv-head-ic">${svgI('newspaper')}</div>
      <div style="flex:1;min-width:0">
        <div class="nv-head-title">Liga News</div>
        <div class="nv-head-sub">${esc(headerSub)}</div>
      </div>
      <button class="nv-head-close" id="nvCloseBtn" aria-label="Schließen">×</button>
    </div>
    <div class="nv-list" id="nvList">
      ${top.length
        ? top.map(s => _newsCardHtml(s, seen.has(s.id))).join('')
        : '<div class="nv-empty">Sobald sich etwas in der Liga tut, erscheint es hier.</div>'}
    </div>
    <div class="nv-foot">
      <button class="nv-foot-btn" id="nvOpenFeed">Alle Stories anzeigen<span class="arr">›</span></button>
    </div>`;
  bg.classList.add('show');
  document.getElementById('nvCloseBtn').onclick = closeNewsPopover;
  document.getElementById('nvOpenFeed').onclick = () => {
    closeNewsPopover();
    // Kurz warten bis Popover ausgeblendet ist (vermeidet z-index-Stacking-Glitch)
    setTimeout(openNewsFeed, 180);
  };
  // Story-Click: Detail öffnen, sofort als gelesen markieren, Card visuell updaten
  nv.querySelectorAll('.nv-story[data-sid]').forEach(el => {
    el.onclick = () => {
      const sid = el.dataset.sid;
      _newsMarkSeen(sid);
      el.classList.add('read');
      el.querySelector('.nv-story-dot')?.remove();
      newsBadgeRefresh();
      openNewsDetail(sid);
    };
  });
}
function closeNewsPopover(){
  const bg = document.getElementById('nvBg');
  if(bg) bg.classList.remove('show');
}

// Story-Card-HTML — wird im Popover UND im Vollfeed verwendet
function _newsCardHtml(s, isRead){
  const cat = NEWS_CATEGORIES[s.cat] || NEWS_CATEGORIES.fun;
  return `<div class="nv-story nv-cat-${s.cat} ${isRead?'read':''}" data-sid="${esc(s.id)}">
    <div class="nv-story-ic">${svgI(s.ic || cat.ic)}</div>
    <div class="nv-story-body">
      <div class="nv-story-cat nv-cat-tag ${s.cat}">${esc(cat.descLabel)}</div>
      <div class="nv-story-title">${esc(s.title)}</div>
      <div class="nv-story-desc">${esc(s.desc)}</div>
      <div class="nv-story-when">${esc(_newsWhenLabel(s.when))}</div>
    </div>
    ${!isRead ? '<div class="nv-story-dot"></div>' : ''}
  </div>`;
}

// Datumsformatierung: "Heute, 16:07" / "Gestern, 21:11" / "12.06., 14:30"
function _newsWhenLabel(when){
  const d = new Date(when);
  const now = new Date();
  // Datumskeys in LOKALER Zeit bilden (nicht via toISOString → UTC): sonst zeigt
  // eine Story mit when=heute 00:00 Lokalzeit in Zonen mit positivem UTC-Offset
  // fälschlich „Gestern", obwohl die Uhrzeit lokal (toLocaleTimeString) heute ist.
  const _lkey = x => x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
  const todayKey = _lkey(now);
  const yest = _lkey(new Date(now.getTime() - 86400000));
  const dKey = _lkey(d);
  const hhmm = d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  if(dKey === todayKey) return 'Heute, '+hhmm;
  if(dKey === yest) return 'Gestern, '+hhmm;
  return d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})+', '+hhmm;
}

// ─── §11.6 — Voller Feed (im Sheet) mit Filter-Pills ─────────────────
let _newsFeedFilter = 'all'; // 'all' | 'new' | cat-Key
function openNewsFeed(){
  _newsFeedFilter = 'all';
  _renderNewsFeed();
}
// ─── §11.6b — Breaking-Erkennung + M2-Karten (v9) ────────────────────
// „Breaking" ist eine ANZEIGE-Kategorie, kein Generator-Typ: ultra-seltene,
// liga-relevante Ereignisse werden display-seitig hierher promotet (wirkt auf
// bestehende UND neue persistierte Rows, ohne Regenerierung).
function _isBreaking(s){
  const d = (s && s.dataRef) || {};
  switch(d.type){
    case 'lead_change':    // neuer Spitzenreiter der Liga
    case 'top_clash':      // Platz 1 schlägt Platz 2
    case 'season_endgame': // Saison-Endspurt (Titelentscheidung)
    case 'season_recap':   // Saison-Champion steht fest
    case 'elo_record':     // neuer All-Time-Elo-Rekord der Liga
    case 'streak_record':  // längste Siegesserie aller Zeiten
    case 'giant_slayer':   // Sieg mit < 20% Siegchance
      return true;
    case 'badge_unlocked':
      return d.rarity === 'legendary'; // nur goldene/legendäre Badges
    default:
      return false;
  }
}
// Anzeige-Kategorie: Breaking überschreibt die echte cat NUR fürs Styling.
function _displayCat(s){ return _isBreaking(s) ? 'breaking' : ((s && s.cat) || 'fun'); }
// Wichtige Karten bekommen den farbigen Glow-Rahmen (nur solange ungelesen).
function _isImportant(s){
  const d = (s && s.dataRef) || {};
  return _isBreaking(s) || (s && s.cat === 'highlight') || d.rarity === 'legendary' || d.rarity === 'rare';
}

// Mini-Visual rechts auf der Karte — rein aus dataRef (kein Match-Lookup).
function _newsVisual(s){
  const d = (s && s.dataRef) || {};
  const flames = n => `<div class="nf-v-streak"><span class="fl">${svgI('flame')}</span><span class="fl">${svgI('flame')}</span><span class="fl">${svgI('flame')}</span><span class="n">${n}</span></div>`;
  const chip = (val, label) => `<div class="nf-v"><div class="nf-bigchip">${val}</div>${label?`<span class="nf-vlabel">${label}</span>`:''}</div>`;
  switch(d.type){
    case 'top_form':    return d.wins!=null   ? `<div class="nf-v">${flames(d.wins+'/10')}</div>` : '';
    case 'win_streak':
    case 'team_streak': return d.streak!=null ? `<div class="nf-v">${flames(d.streak)}</div>` : '';
    case 'team_loss_streak':
    case 'loss_streak': return d.streak!=null ? chip(d.streak+'×','in Folge') : '';
    case 'elo_swing':   return chip(((d.delta||0)>0?'+':'')+(d.delta||0),'Elo');
    case 'jubilee':     return d.total!=null ? chip(d.total+'.','Spiel') : '';
    case 'milestone_wins':
    case 'milestone_goals':
    case 'milestone_elo': {
      const m = String(d.milestone||'').match(/\d+/);
      const lbl = d.type==='milestone_goals' ? 'Tore' : d.type==='milestone_elo' ? 'Elo' : 'Siege';
      return m ? chip(m[0], lbl) : '';
    }
    case 'badge_unlocked':  return `<div class="nf-v"><div class="nf-v-badge">${svgI(s.ic||'trophy')}</div></div>`;
    case 'lead_change':     return `<div class="nf-v"><div class="nf-v-crown">${svgI('crown')}<span class="rk">#1</span></div></div>`;
    case 'top_clash':       return `<div class="nf-v"><div class="nf-v-crown">${svgI('swords')}</div></div>`;
    case 'elo_record':      return d.elo!=null ? chip(d.elo,'Rekord-Elo') : '';
    case 'streak_record':   return d.streak!=null ? `<div class="nf-v">${flames(d.streak)}</div>` : '';
    case 'giant_slayer':    return d.chance!=null ? chip(Math.max(1,Math.round(d.chance*100))+'%','Chance') : '';
    case 'biggest_blowout': return d.diff!=null ? chip('+'+d.diff,'Tore') : '';
    case 'potw':
    case 'potd':            return d.wins!=null ? chip(d.wins,'Siege') : '';
    case 'group':           return Array.isArray(d.playerIds) ? chip(d.playerIds.length+'×','') : '';
    default: return '';
  }
}

// M2-Karte: getönt, Kategorie-Pill-Chip, Glow bei wichtigen News, Mini-Visual.
function _newsCardHtmlM2(s, isRead){
  const dcat = _displayCat(s);
  const meta = NEWS_CATEGORIES[dcat] || NEWS_CATEGORIES.fun;
  const vis = _newsVisual(s);
  const imp = (_isImportant(s) && !isRead) ? ' important' : '';
  return `<div class="nf-card nfc-${dcat}${isRead?' read':''}${imp}" data-sid="${esc(s.id)}">
    <div class="nf-top">
      <span class="nf-chip">${svgI(s.ic || meta.ic)} ${esc(meta.descLabel)}</span>
      <span class="nf-when">${esc(_newsWhenLabel(s.when))}${isRead?'':'<span class="nf-dot"></span>'}</span>
    </div>
    <div class="nf-grid">
      <div><div class="nf-h">${esc(s.title)}</div><div class="nf-d">${esc(s.desc)}</div></div>
      ${vis}
    </div>
  </div>`;
}

// Breaking-Hero — das Herzstück oben im Sheet, bewusst dramatisch.
// v9.1: etwas längerer, spannenderer Hero-Text je Breaking-Typ — display-seitig
// aus dataRef gebaut (wirkt auch auf bereits persistierte Rows). Bewusst 1–2
// Sätze: soll neugierig machen, aber nicht von den Stories darunter ablenken.
// Fällt auf s.desc zurück, wenn die Datenlage nicht reicht.
function _breakingHeroText(s){
  const d = (s && s.dataRef) || {};
  const pm = (typeof pmap === 'function') ? pmap() : {};
  const nm = id => (pm[id] && pm[id].name) || '?';
  try {
    switch(d.type){
      case 'season_recap': {
        const te = Array.isArray(d.topElo) ? d.topElo : [];
        const champ = nm(d.championId || (te[0] && te[0].id));
        const runner = te[1] && te[1].id ? nm(te[1].id) : null;
        const elo = d.championElo != null ? d.championElo : (te[0] && te[0].elo);
        return `Die Saison ${d.sid || ''} ist Geschichte: ${champ} krönt sich mit ${elo} Elo zum Champion`
          + (runner ? ` — vor ${runner}.` : '.')
          + ` Wer stürzt ${champ} in der neuen Saison vom Thron?`;
      }
      case 'lead_change':
        return `Machtwechsel an der Tabellenspitze: ${nm(d.newLeader)} verdrängt ${nm(d.prevLeader)} und übernimmt die Führung. Das Titelrennen ist wieder völlig offen.`;
      case 'top_clash': {
        // p1/p2 (v9.3): Platz-1- bzw. Platz-2-Spieler namentlich. Fallback auf
        // Sieger-Team für alte, vor v9.3 persistierte Stories.
        const a = d.p1 ? nm(d.p1) : (Array.isArray(d.winners) ? d.winners.map(nm).join(' & ') : '');
        const b = d.p2 ? nm(d.p2) : null;
        return b
          ? `Gipfeltreffen an der Spitze: Tabellenführer ${a} bezwingt Verfolger ${b} im direkten Duell und baut den Vorsprung an der Spitze aus.`
          : `Gipfeltreffen an der Spitze: ${a} setzt sich im Spitzenspiel durch und zieht weiter davon.`;
      }
      case 'season_endgame': {
        const leader = d.leader && d.leader.pid ? nm(d.leader.pid) : '';
        const dl = d.daysLeft;
        const dtxt = dl != null ? `Nur noch ${dl} ${dl === 1 ? 'Tag' : 'Tage'} bis zum Saisonende` : 'Der Saison-Endspurt läuft';
        return `${dtxt}: ${leader} führt`
          + (d.gap != null ? `, doch der Vorsprung von ${d.gap} Elo ist alles andere als sicher.` : '.')
          + ' Jetzt zählt jedes Spiel.';
      }
      case 'badge_unlocked':
        return `${nm(d.playerId)} schnappt sich mit „${d.badgeName || s.title}" eine der seltensten Auszeichnungen der Liga — das gelingt fast niemandem.`;
      case 'elo_record':
        return `${nm(d.pid)} schreibt Liga-Geschichte: Mit ${d.elo} Elo steht kein Spieler jemals höher. Eine neue Bestmarke für die Ewigkeit — wer traut sich, sie anzugreifen?`;
      case 'streak_record':
        return `${nm(d.pid)} stellt einen Liga-Rekord für die Ewigkeit auf: ${d.streak} Siege in Folge — keine Serie war jemals länger. Wer stoppt diesen Lauf?`;
      case 'giant_slayer': {
        const w = Array.isArray(d.winners) ? d.winners.map(nm).join(' & ') : '';
        const l = Array.isArray(d.losers) ? d.losers.map(nm).join(' & ') : 'den Favoriten';
        const pct = d.chance!=null ? Math.max(1, Math.round(d.chance*100)) : null;
        return `Die Sensation des Spieltags: Mit nur ${pct!=null?pct+'%':'minimaler'} Siegchance bezwingt ${w} das Favoriten-Team ${l}. So einen Coup sieht man in der Liga fast nie.`;
      }
    }
  } catch(e){}
  return s.desc || '';
}
function _newsHeroHtml(s){
  const meta = NEWS_CATEGORIES.breaking;
  return `<div class="nf-hero nfc-breaking" data-sid="${esc(s.id)}">
    <div class="nf-hero-bg"></div><div class="nf-hero-spot"></div>
    <div class="nf-hero-wm">${svgI(s.ic || meta.ic)}</div>
    <div class="nf-hero-when">${esc(_newsWhenLabel(s.when))}</div>
    <div class="nf-hero-ct">
      <span class="nf-hero-pill"><span class="pulse"></span>${svgI('bolt')} Breaking News</span>
      <h2>${esc(s.title)}</h2>
      <div class="nf-hero-sub">${esc(_breakingHeroText(s))}</div>
    </div>
  </div>`;
}

function _renderNewsFeed(){
  _sheetSetReopen(()=>_renderNewsFeed());
  const stories = getStoriesCache();
  const seen = _newsLoadSeen();
  // Kuratierte, bewusst KURZE Filter-Liste (v9.1): „Neu"/„Ungelesen"/„Saison"
  // entfernt — der Feed ist ohnehin neueste-zuerst; das reduziert Rauschen.
  const filters = [
    {k:'all',       label:'Alle'},
    {k:'breaking',  label:'Breaking'},
    {k:'highlight', label:'Highlights'},
    {k:'badge',     label:'Awards'},
    {k:'team',      label:'Teams'},
    {k:'fun',       label:'Fun Facts'},
  ];
  const ONE_DAY = 86400000;
  const nowTs = Date.now();
  let filtered = stories;
  if(_newsFeedFilter === 'new'){
    filtered = stories.filter(s => !seen.has(s.id) && (nowTs - new Date(s.when).getTime()) < ONE_DAY);
  } else if(_newsFeedFilter === 'unread'){
    filtered = stories.filter(s => !seen.has(s.id));
  } else if(_newsFeedFilter === 'breaking'){
    filtered = stories.filter(_isBreaking);
  } else if(_newsFeedFilter !== 'all'){
    filtered = stories.filter(s => s.cat === _newsFeedFilter);
  }

  // Breaking-Hero: jüngste Breaking-Story (max. 14 Tage alt). Nur bei „Alle"/
  // „Breaking" und aus der Kartenliste herausgelöst, damit kein Doppel.
  const HERO_MAX_AGE = 14 * ONE_DAY;
  let hero = null;
  if(_newsFeedFilter === 'all' || _newsFeedFilter === 'breaking'){
    hero = filtered.find(s => _isBreaking(s) && (nowTs - new Date(s.when).getTime()) < HERO_MAX_AGE) || null;
  }
  const cards = hero ? filtered.filter(s => s.id !== hero.id) : filtered;

  const filterBar = `<div class="nv-filters">
    ${filters.map(f => `<button class="nv-filter ${_newsFeedFilter===f.k?'active':''}" data-f="${f.k}">${esc(f.label)}</button>`).join('')}
  </div>`;
  const heroHtml = hero ? _newsHeroHtml(hero) : '';
  const listHtml = cards.length
    ? `<div class="nf-daydiv">Aktuelle Stories</div><div class="nf-feed">${cards.map(s => _newsCardHtmlM2(s, seen.has(s.id))).join('')}</div>`
    : (hero ? '' : '<div class="nv-empty">Keine Stories in dieser Auswahl.</div>');

  openSheet(`
    <div class="nf-wrap">
      <div class="nf-title"><span class="nv-head-ic">${svgI('newspaper')}</span>Liga News</div>
      <div class="nf-sub">Aktuelles · Trends · Fun Facts</div>
      ${filterBar}
      <div class="nf-ctrls">
        <button class="nf-markall" id="nvMarkAllBtn" type="button">${svgI('check')}<span>Alle als gelesen markieren</span></button>
        <span class="nf-sort">Neueste zuerst ${svgI('sort')}</span>
      </div>
      ${heroHtml}
    </div>
    <div class="nf-wrap" style="padding-top:0">${listHtml}</div>
  `);

  // Filter-Click → re-render (billig, Daten aus Cache).
  const sheet = document.getElementById('sheet');
  sheet.querySelectorAll('.nv-filter[data-f]').forEach(el => {
    el.onclick = () => { _newsFeedFilter = el.dataset.f; _renderNewsFeed(); };
  });
  // „Alle als gelesen markieren" — markiert ALLE Cache-Stories.
  const markBtn = document.getElementById('nvMarkAllBtn');
  if(markBtn){
    markBtn.onclick = () => {
      try { _newsMarkAllSeen(); } catch(e){}
      try { newsBadgeRefresh(); } catch(e){}
      sheet.querySelectorAll('.nf-card, .nf-hero').forEach(el => {
        el.classList.add('read'); el.classList.remove('important');
        el.querySelector('.nf-dot')?.remove();
      });
      markBtn.classList.add('done');
      if(_newsFeedFilter === 'unread' || _newsFeedFilter === 'new') _renderNewsFeed();
    };
  }
  // Karten + Hero klickbar → Detail.
  sheet.querySelectorAll('[data-sid]').forEach(el => {
    el.onclick = () => {
      const sid = el.dataset.sid;
      _newsMarkSeen(sid);
      el.classList.add('read'); el.classList.remove('important');
      el.querySelector('.nf-dot')?.remove();
      newsBadgeRefresh();
      openNewsDetail(sid);
    };
  });
}

// ─── §11.7 — Story-Detail (dynamisch je Typ) ─────────────────────────
// Detail-Popover (z-index 140) — kann ÜBER Sheet (100) und nvBg (130)
// liegen und ist unabhängig schließbar.
function openNewsDetail(sid){
  const stories = getStoriesCache();
  const s = stories.find(x => x.id === sid);
  if(!s) return;
  // ── Read-State (Bugfix v8.1) ──
  // Story IMMER hier markieren — egal über welchen Pfad geöffnet wurde
  // (Mini-Popup, Feed-Card, Direkt-Aufruf). _newsMarkSeen ist idempotent
  // (Set-Add), kein Risiko bei mehrfachem Aufruf.
  try {
    _newsMarkSeen(sid);
    newsBadgeRefresh();
    // Sichtbare Cards (Mini-Popup + Feed) visuell synchron halten.
    // CSS.escape ist seit 2015 in allen relevanten Browsern verfügbar; defensiv
    // mit Fallback auf simples Escape für Edge-Cases.
    const escId = (window.CSS && CSS.escape) ? CSS.escape(sid) : sid.replace(/[\\"']/g, '\\$&');
    document.querySelectorAll('.nv-story[data-sid="'+escId+'"], .nf-card[data-sid="'+escId+'"], .nf-hero[data-sid="'+escId+'"]').forEach(el => {
      el.classList.add('read'); el.classList.remove('important');
      el.querySelector('.nv-story-dot')?.remove();
      el.querySelector('.nf-dot')?.remove();
    });
  } catch(e){}
  // v9: Breaking-Stories im Detail ebenfalls in der Breaking-Optik anzeigen.
  const dcat = _displayCat(s);
  const cat = NEWS_CATEGORIES[dcat] || NEWS_CATEGORIES.fun;
  // Body-HTML dynamisch je Typ — nutzt vorhandene Avatar/Stat-Helper
  const body = _newsDetailBody(s);
  const nd = document.getElementById('nd');
  const bg = document.getElementById('ndBg');
  if(!nd || !bg) return;
  nd.innerHTML = `
    <div class="nd-head">
      <div class="nd-ic nv-cat-${dcat}">${svgI(s.ic || cat.ic)}</div>
      <div class="nd-title-wrap">
        <div class="nd-cat nv-cat-tag ${dcat}" style="display:inline-block">${esc(cat.descLabel)}</div>
        <div class="nd-title">${esc(s.title)}</div>
        <div class="nd-when">${esc(_newsWhenLabel(s.when))}</div>
      </div>
      <button class="nd-x" id="ndXBtn" aria-label="Schließen">×</button>
    </div>
    <div class="nd-desc">${esc(s.desc)}</div>
    ${body}
    <button class="nd-close" id="ndCloseBtn">Schließen</button>`;
  bg.classList.add('show');
  document.getElementById('ndCloseBtn').onclick = closeNewsDetail;
  document.getElementById('ndXBtn').onclick = closeNewsDetail;
  // Match-Refs: bei Klick zum Match-Detail springen
  nd.querySelectorAll('[data-mid]').forEach(el => {
    el.onclick = () => {
      const mid = el.dataset.mid;
      closeNewsDetail();
      closeNewsPopover();
      sheetNav(() => { try { showMatchDetail(mid); } catch(e){} }); // über den News-Feed stapeln
    };
  });
  // Player-Refs: zum Spielerprofil
  nd.querySelectorAll('[data-pid]').forEach(el => {
    el.onclick = () => {
      const pid = el.dataset.pid;
      closeNewsDetail();
      closeNewsPopover();
      sheetNav(() => { try { showPlayer(pid); } catch(e){} }); // über den News-Feed stapeln
    };
  });
}
function closeNewsDetail(){
  const bg = document.getElementById('ndBg');
  if(bg) bg.classList.remove('show');
}

// Detail-Body-HTML — schaltet nach dataRef.type. Für unbekannte Typen
// wird nur die Description angezeigt (Fallback).
//
// v8.1: massiv erweitert. Helper-Funktionen unten liefern wiederverwendbare
// Bausteine (Match-VS-Block, Elo-Delta, Form-Strip), die in mehreren Cases
// gemeinsam genutzt werden. Vermeidet duplizierte Berechnungen.
function _newsDetailBody(s){
  const d = s.dataRef || {};
  const pm = pmap();
  const avM = (pid) => (typeof avHtml === 'function' && pm[pid]) ? avHtml(pm[pid]) : '';
  const nameOf = (pid) => (pm[pid] && pm[pid].name) || '?';
  try {
    switch(d.type){
      case 'top_clash': {
        // v9.3: Ränge explizit — Platz 1 (Sieger) & Platz 2 (Verfolger),
        // beide antippbar; darunter das Spitzenspiel als Match-VS-Block.
        const rankRows = (d.p1 && d.p2) ? `
          <div class="nd-stat-row" data-pid="${esc(d.p1)}" style="cursor:pointer"><div class="nd-stat-label">Platz 1</div><div class="nd-stat-val acid">${esc(nameOf(d.p1))} ›</div></div>
          <div class="nd-stat-row" data-pid="${esc(d.p2)}" style="cursor:pointer"><div class="nd-stat-label">Platz 2</div><div class="nd-stat-val">${esc(nameOf(d.p2))} ›</div></div>` : '';
        const matchHtml = d.matchId ? _newsMatchVsBlock(d.matchId) : '';
        return (rankRows ? `<div class="nd-section">Duell an der Spitze</div>${rankRows}` : '')
             + (matchHtml ? `<div class="nd-section">Das Spitzenspiel</div>${matchHtml}` : '');
      }
      case 'elo_record': {
        // v9.4: Rekordhalter (antippbar) + Rekordwert + auslösendes Match.
        const row = d.pid ? `<div class="nd-stat-row" data-pid="${esc(d.pid)}" style="cursor:pointer"><div class="nd-stat-label">Rekordhalter</div><div class="nd-stat-val acid">${esc(nameOf(d.pid))} ›</div></div>` : '';
        const eloRow = d.elo!=null ? `<div class="nd-stat-row"><div class="nd-stat-label">Höchststand</div><div class="nd-stat-val acid">${d.elo} Elo</div></div>` : '';
        const matchHtml = d.matchId ? _newsMatchVsBlock(d.matchId) : '';
        return `<div class="nd-section">Liga-Rekord</div>${row}${eloRow}` + (matchHtml ? `<div class="nd-section">Rekord-Match</div>${matchHtml}` : '');
      }
      case 'streak_record': {
        const row = d.pid ? `<div class="nd-stat-row" data-pid="${esc(d.pid)}" style="cursor:pointer"><div class="nd-stat-label">Rekordhalter</div><div class="nd-stat-val acid">${esc(nameOf(d.pid))} ›</div></div>` : '';
        const sRow = d.streak!=null ? `<div class="nd-stat-row"><div class="nd-stat-label">Siege in Folge</div><div class="nd-stat-val acid">${d.streak}</div></div>` : '';
        return `<div class="nd-section">Liga-Rekord</div>${row}${sRow}`;
      }
      case 'giant_slayer': {
        const pct = d.chance!=null ? `<div class="nd-stat-row"><div class="nd-stat-label">Siegchance</div><div class="nd-stat-val red">${Math.max(1,Math.round(d.chance*100))}%</div></div>` : '';
        const matchHtml = d.matchId ? _newsMatchVsBlock(d.matchId) : '';
        return `<div class="nd-section">Die Sensation</div>${pct}` + (matchHtml ? matchHtml : '');
      }
      case 'group': {
        // v8.8: zusammengefasste Karte ("N Pechvögel: …") — alle Beteiligten
        // tappbar, mit ihrem jeweiligen Wert (frag).
        const pids = Array.isArray(d.playerIds) ? d.playerIds : [];
        const frags = Array.isArray(d.frags) ? d.frags : [];
        const rows = pids.map((pid, i) => {
          const m = (frags[i] || '').match(/\(([^)]*)\)/);
          const val = m ? m[1] : '›';
          return `<div class="nd-stat-row" data-pid="${esc(pid)}" style="cursor:pointer">
            <div class="nd-stat-label">${esc(nameOf(pid))}</div><div class="nd-stat-val">${esc(val)}</div></div>`;
        }).join('');
        return `<div class="nd-section">Beteiligte</div>${rows}`;
      }
      case 'potw':
      case 'potd': {
        // v8.7: Spieler der Woche/des Tages — Sieger als tappbare Chips.
        const pids = (Array.isArray(d.playerIds) && d.playerIds.length) ? d.playerIds : [d.playerId];
        const rows = pids.map(pid => `<div class="nd-stat-row" data-pid="${esc(pid)}" style="cursor:pointer">
            <div class="nd-stat-label">${esc(nameOf(pid))}</div><div class="nd-stat-val">›</div></div>`).join('');
        const wrLine = (d.wins != null && d.wr != null) ? `<div class="nd-stat-row">
            <div class="nd-stat-label">Bilanz</div>
            <div class="nd-stat-val acid">${d.wins} Siege · ${Math.round(d.wr*100)}%</div></div>` : '';
        return `<div class="nd-section">${pids.length > 1 ? 'Sieger' : 'Sieger'}</div>${rows}${wrLine}`;
      }
      case 'ambient': {
        // v8.5: ambiente Tages-Story. Header (Titel/Desc/Zeit) reicht inhaltlich;
        // bei Spieler-/Duell-Bezug zusätzlich tappbare Chips zum Durchspringen.
        if(d.ambientPid && pm[d.ambientPid]){
          return `<div class="nd-section">Im Fokus</div>
            <div class="nd-vs">
              <div class="nd-vs-p" data-pid="${esc(d.ambientPid)}">
                ${avM(d.ambientPid)}
                <div class="nd-vs-name">${esc(nameOf(d.ambientPid))}</div>
              </div>
            </div>`;
        }
        if(Array.isArray(d.ambientPids) && d.ambientPids.length === 2 && pm[d.ambientPids[0]] && pm[d.ambientPids[1]]){
          const [pa, pb] = d.ambientPids;
          return `<div class="nd-section">Duell</div>
            <div class="nd-vs">
              <div class="nd-vs-p" data-pid="${esc(pa)}">${avM(pa)}<div class="nd-vs-name">${esc(nameOf(pa))}</div></div>
              <div class="nd-vs-mid">vs</div>
              <div class="nd-vs-p" data-pid="${esc(pb)}">${avM(pb)}<div class="nd-vs-name">${esc(nameOf(pb))}</div></div>
            </div>`;
        }
        return '';
      }
      case 'season_endgame': {
        const pA = d.leader, pB = d.second;
        return `<div class="nd-section">Top-2 Stand</div>
          <div class="nd-vs">
            <div class="nd-vs-p" data-pid="${esc(pA.pid)}">
              ${avM(pA.pid)}
              <div class="nd-vs-name">${esc(nameOf(pA.pid))}</div>
              <div class="nd-vs-elo">${pA.elo} Elo</div>
            </div>
            <div class="nd-vs-mid">${d.gap}<div class="nd-vs-mid-sub">Elo Diff</div></div>
            <div class="nd-vs-p" data-pid="${esc(pB.pid)}">
              ${avM(pB.pid)}
              <div class="nd-vs-name">${esc(nameOf(pB.pid))}</div>
              <div class="nd-vs-elo">${pB.elo} Elo</div>
            </div>
          </div>
          <div class="nd-stat-row"><div class="nd-stat-label">Verbleibend</div><div class="nd-stat-val acid">${d.daysLeft} ${d.daysLeft===1?'Tag':'Tage'}</div></div>`;
      }
      case 'lead_change': {
        const matchHtml = d.matchId ? _newsMatchVsBlock(d.matchId) : '';
        const eloChg = d.matchId ? _newsEloDelta(d.newLeader, d.matchId) : null;
        const rankInfo = d.matchId ? _newsRankChange(d.newLeader, d.matchId) : null;
        return `<div class="nd-section">Wechsel an der Spitze</div>
          <div class="nd-vs">
            <div class="nd-vs-p" data-pid="${esc(d.newLeader)}">
              ${avM(d.newLeader)}
              <div class="nd-vs-name">${esc(nameOf(d.newLeader))}</div>
              <div class="nd-vs-elo" style="color:var(--acid)">neuer #1</div>
            </div>
            <div class="nd-vs-mid">↑<div class="nd-vs-mid-sub">übernimmt</div></div>
            <div class="nd-vs-p" data-pid="${esc(d.prevLeader)}">
              ${avM(d.prevLeader)}
              <div class="nd-vs-name">${esc(nameOf(d.prevLeader))}</div>
              <div class="nd-vs-elo">vorher #1</div>
            </div>
          </div>
          ${eloChg !== null ? `<div class="nd-stat-row">
            <div class="nd-stat-label">Elo-Veränderung</div>
            <div class="nd-stat-val ${eloChg>=0?'pos':'neg'}">${eloChg>=0?'+':''}${eloChg}</div>
          </div>` : ''}
          ${rankInfo ? `<div class="nd-stat-row">
            <div class="nd-stat-label">Tabelle</div>
            <div class="nd-stat-val acid">#${rankInfo.pre} → #${rankInfo.post}</div>
          </div>` : ''}
          ${matchHtml ? `<div class="nd-section">Auslösendes Match</div>${matchHtml}` : ''}`;
      }
      case 'top_form': {
        const form = _newsRecentForm(d.pid, 10);
        return `<div class="nd-section">Letzte 10 Matches</div>
          ${form.strip ? `<div class="nd-form-strip">${form.strip}</div>` : ''}
          <div class="nd-stat-row" data-pid="${esc(d.pid)}" style="cursor:pointer">
            <div class="nd-stat-label">${esc(nameOf(d.pid))}</div>
            <div class="nd-stat-val acid">${d.wins}/10 Siege</div></div>
          ${form.currentStreak >= 2 ? `<div class="nd-stat-row">
            <div class="nd-stat-label">Aktuelle Serie</div>
            <div class="nd-stat-val acid">${form.currentStreak}× Sieg</div></div>` : ''}`;
      }
      case 'loss_streak': {
        const form = _newsRecentForm(d.pid, 10);
        return `<div class="nd-section">Letzte 10 Matches</div>
          ${form.strip ? `<div class="nd-form-strip">${form.strip}</div>` : ''}
          <div class="nd-stat-row" data-pid="${esc(d.pid)}" style="cursor:pointer">
            <div class="nd-stat-label">${esc(nameOf(d.pid))}</div>
            <div class="nd-stat-val neg">${d.streak}× Niederlage in Folge</div></div>`;
      }
      case 'badge_unlocked': {
        // v8.6: bei konsolidierten Karten (mehrere Spieler, gleicher Badge im
        // selben Match) alle Beteiligten listen; sonst der einzelne Spieler.
        const pids = (Array.isArray(d.playerIds) && d.playerIds.length) ? d.playerIds : [d.playerId];
        const matchHtml = d.matchId ? _newsMatchVsBlock(d.matchId) : '';
        const eloChg = (pids.length === 1 && d.matchId) ? _newsEloDelta(pids[0], d.matchId) : null;
        const rarLabel = d.rarity ? (d.rarity[0].toUpperCase()+d.rarity.slice(1)) : '';
        const playersHtml = pids.map(pid => `<div class="nd-stat-row" data-pid="${esc(pid)}" style="cursor:pointer">
            <div class="nd-stat-label">${esc(nameOf(pid))}</div><div class="nd-stat-val">›</div></div>`).join('');
        const nemRow = d.nemesisOppId ? `<div class="nd-stat-row" data-pid="${esc(d.nemesisOppId)}" style="cursor:pointer">
            <div class="nd-stat-label">Angstgegner</div>
            <div class="nd-stat-val neg">${esc(nameOf(d.nemesisOppId))}</div></div>` : '';
        return `<div class="nd-section">${pids.length > 1 ? pids.length + ' Spieler' : 'Spieler'}</div>
          ${playersHtml}
          ${nemRow}
          ${rarLabel ? `<div class="nd-stat-row">
            <div class="nd-stat-label">Seltenheit</div>
            <div class="nd-stat-val ${d.rarity==='legendary'?'gold':d.rarity==='negative'?'neg':'acid'}">${esc(rarLabel)}</div></div>` : ''}
          ${eloChg !== null ? `<div class="nd-stat-row">
            <div class="nd-stat-label">Match-Elo</div>
            <div class="nd-stat-val ${eloChg>=0?'pos':'neg'}">${eloChg>=0?'+':''}${eloChg}</div></div>` : ''}
          ${matchHtml ? `<div class="nd-section">Auslösendes Match</div>${matchHtml}` : ''}`;
      }
      case 'rivalry': {
        // Live-Bilanz aus matches berechnen — günstig, da rivalry-Stories selten sind.
        const h2h = _newsH2HRecord(d.a, d.b);
        return `<div class="nd-section">Die Kontrahenten</div>
          <div class="nd-vs">
            <div class="nd-vs-p" data-pid="${esc(d.a)}">
              ${avM(d.a)}
              <div class="nd-vs-name">${esc(nameOf(d.a))}</div>
              <div class="nd-vs-elo">${h2h.aWins} Siege</div>
            </div>
            <div class="nd-vs-mid">VS<div class="nd-vs-mid-sub">${d.n} Duelle</div></div>
            <div class="nd-vs-p" data-pid="${esc(d.b)}">
              ${avM(d.b)}
              <div class="nd-vs-name">${esc(nameOf(d.b))}</div>
              <div class="nd-vs-elo">${h2h.bWins} Siege</div>
            </div>
          </div>
          ${h2h.lastMatchId ? `<div class="nd-section">Letztes Duell</div>${_newsMatchVsBlock(h2h.lastMatchId)}` : ''}`;
      }
      case 'jubilee': {
        // Karriere-Bilanz nutzen statt nur Total — bestehende Stats-Funktion.
        const stats = _newsPlayerCareer(d.pid);
        return `<div class="nd-section">Karriere</div>
          <div class="nd-stat-row" data-pid="${esc(d.pid)}" style="cursor:pointer">
            <div class="nd-stat-label">${esc(nameOf(d.pid))}</div>
            <div class="nd-stat-val gold">${d.total} Spiele</div></div>
          ${stats ? `<div class="nd-stat-row">
            <div class="nd-stat-label">Siege / Niederlagen</div>
            <div class="nd-stat-val">${stats.wins} / ${stats.losses}</div></div>
          <div class="nd-stat-row">
            <div class="nd-stat-label">Win-Rate</div>
            <div class="nd-stat-val acid">${stats.winRate}%</div></div>` : ''}
          ${d.matchId ? `<div class="nd-section">Jubiläums-Match</div>${_newsMatchVsBlock(d.matchId)}` : ''}`;
      }
      case 'quiet_week': {
        return `<div class="nd-section">Aktivität</div>
          <div class="nd-stat-row"><div class="nd-stat-label">Letzte 7 Tage</div><div class="nd-stat-val">${d.lastWeek} Spiele</div></div>
          <div class="nd-stat-row"><div class="nd-stat-label">4-Wochen-Schnitt</div><div class="nd-stat-val">${d.avg} Spiele</div></div>`;
      }
      case 'season_recap': {
        // Top-3 Aufstellung statt nur Champion
        const top = (d.topElo || []).slice(0,3);
        const rows = top.map((p, i) => p && p.id && pm[p.id] ? `
          <div class="nd-stat-row" data-pid="${esc(p.id)}" style="cursor:pointer">
            <div class="nd-stat-label">${i+1}. ${esc(nameOf(p.id))}</div>
            <div class="nd-stat-val ${i===0?'gold':i===1?'':''}">${p.elo} Elo</div></div>` : '').join('');
        return `<div class="nd-section">Saison-Top-3</div>
          ${rows}
          <div class="nd-stat-row"><div class="nd-stat-label">Saison</div><div class="nd-stat-val">${esc(d.sid)}</div></div>`;
      }
      case 'season_start': {
        return `<div class="nd-section">Aktuelle Saison</div>
          <div class="nd-stat-row"><div class="nd-stat-label">Saison-ID</div><div class="nd-stat-val">${esc(d.sid)}</div></div>`;
      }
      // Neue Typen (Phase 8) hängen sich hier dran an
      case 'milestone_wins':
      case 'milestone_goals':
      case 'milestone_elo': {
        const stats = _newsPlayerCareer(d.pid);
        return `<div class="nd-section">Meilenstein</div>
          <div class="nd-stat-row" data-pid="${esc(d.pid)}" style="cursor:pointer">
            <div class="nd-stat-label">${esc(nameOf(d.pid))}</div>
            <div class="nd-stat-val gold">${esc(d.milestone)}</div></div>
          ${stats ? `<div class="nd-stat-row">
            <div class="nd-stat-label">Karriere-Bilanz</div>
            <div class="nd-stat-val">${stats.wins}W · ${stats.losses}L</div></div>` : ''}
          ${d.matchId ? `<div class="nd-section">Meilenstein-Match</div>${_newsMatchVsBlock(d.matchId)}` : ''}`;
      }
      case 'biggest_blowout': {
        return `<div class="nd-section">Kantersieg</div>
          ${_newsMatchVsBlock(d.matchId)}
          <div class="nd-stat-row">
            <div class="nd-stat-label">Tordifferenz</div>
            <div class="nd-stat-val gold">+${d.diff}</div></div>`;
      }
      case 'elo_swing': {
        return `<div class="nd-section">Spieler</div>
          <div class="nd-stat-row" data-pid="${esc(d.pid)}" style="cursor:pointer">
            <div class="nd-stat-label">${esc(nameOf(d.pid))}</div>
            <div class="nd-stat-val ${d.delta>=0?'pos':'neg'}">${d.delta>=0?'+':''}${d.delta} Elo</div></div>
          <div class="nd-stat-row">
            <div class="nd-stat-label">Zeitraum</div>
            <div class="nd-stat-val">${esc(d.period)}</div></div>`;
      }
      case 'anniversary': {
        return `<div class="nd-section">Vor genau einem Jahr</div>
          ${d.matchId ? _newsMatchVsBlock(d.matchId) : ''}
          <div class="nd-stat-row">
            <div class="nd-stat-label">Damals</div>
            <div class="nd-stat-val">${esc(d.dateLabel || '')}</div></div>`;
      }
      // ── v8.2 Neue Typen ──
      case 'upset_match': {
        return `<div class="nd-section">Underdog-Sieg</div>
          ${_newsMatchVsBlock(d.matchId)}
          <div class="nd-stat-row">
            <div class="nd-stat-label">Sieger-Rang vorher</div>
            <div class="nd-stat-val acid">#${d.winnerRank}</div></div>
          <div class="nd-stat-row">
            <div class="nd-stat-label">Verlierer-Rang vorher</div>
            <div class="nd-stat-val">#${d.loserRank}</div></div>
          <div class="nd-stat-row">
            <div class="nd-stat-label">Klassenunterschied</div>
            <div class="nd-stat-val gold">${d.gap} Plätze</div></div>`;
      }
      case 'streak_killer': {
        const _breakers = Array.isArray(d.breakerIds) ? d.breakerIds.filter(Boolean) : [];
        const _breakerRow = _breakers.length
          ? `<div class="nd-stat-row">
              <div class="nd-stat-label">Gestoppt von</div>
              <div class="nd-stat-val acid">${esc(_breakers.map(nameOf).join(' & '))}</div></div>`
          : '';
        return `<div class="nd-section">Serien-Ende</div>
          ${_newsMatchVsBlock(d.matchId)}
          <div class="nd-stat-row" data-pid="${esc(d.victimPid)}" style="cursor:pointer">
            <div class="nd-stat-label">${esc(nameOf(d.victimPid))}</div>
            <div class="nd-stat-val neg">−${d.streak}er Serie</div></div>
          ${_breakerRow}`;
      }
      case 'thriller_match': {
        return `<div class="nd-section">Knappes Match</div>
          ${_newsMatchVsBlock(d.matchId)}
          <div class="nd-stat-row">
            <div class="nd-stat-label">Tordifferenz</div>
            <div class="nd-stat-val gold">${d.diff} Tor</div></div>
          <div class="nd-stat-row">
            <div class="nd-stat-label">Tore gesamt</div>
            <div class="nd-stat-val">${d.total}</div></div>`;
      }
      case 'rivalry_milestone': {
        const h2h = _newsH2HRecord(d.a, d.b);
        return `<div class="nd-section">Historische Bilanz</div>
          <div class="nd-vs">
            <div class="nd-vs-p" data-pid="${esc(d.a)}">
              ${avM(d.a)}
              <div class="nd-vs-name">${esc(nameOf(d.a))}</div>
              <div class="nd-vs-elo">${h2h.aWins} Siege</div>
            </div>
            <div class="nd-vs-mid">${d.n}<div class="nd-vs-mid-sub">Duelle</div></div>
            <div class="nd-vs-p" data-pid="${esc(d.b)}">
              ${avM(d.b)}
              <div class="nd-vs-name">${esc(nameOf(d.b))}</div>
              <div class="nd-vs-elo">${h2h.bWins} Siege</div>
            </div>
          </div>
          ${d.matchId ? `<div class="nd-section">Jubiläums-Duell</div>${_newsMatchVsBlock(d.matchId)}` : ''}`;
      }
      case 'win_streak': {
        const form = _newsRecentForm(d.pid, Math.min(d.streak, 10));
        return `<div class="nd-section">Aktuelle Serie</div>
          ${form.strip ? `<div class="nd-form-strip">${form.strip}</div>` : ''}
          <div class="nd-stat-row" data-pid="${esc(d.pid)}" style="cursor:pointer">
            <div class="nd-stat-label">${esc(nameOf(d.pid))}</div>
            <div class="nd-stat-val acid">${d.streak}× Sieg in Folge</div></div>`;
      }
      case 'dry_spell': {
        return `<div class="nd-section">Liga-Pause</div>
          <div class="nd-stat-row">
            <div class="nd-stat-label">Tage ohne Match</div>
            <div class="nd-stat-val gold">${d.daysSince}</div></div>
          ${d.lastMatchId ? `<div class="nd-section">Letztes Match</div>${_newsMatchVsBlock(d.lastMatchId)}` : ''}`;
      }
    }
  } catch(e){ /* defensiv */ }
  return '';
}

// ─── §11.7b — Detail-Body Helper (v8.1) ──────────────────────────────
// Wiederverwendbare Sub-Renderer und Stats-Funktionen für die einzelnen
// Detail-Body-Cases. Alle nutzen bestehende Caches; keine eigenen Walks.

// Match-VS-Block: 2v2 Layout mit Spieler-Avataren, Namen, Score und Datum.
// Klickbar (data-mid) → springt zum Match-Detail über den existierenden
// Click-Handler in openNewsDetail.
function _newsMatchVsBlock(matchId){
  try {
    const m = matches.find(x => x.id === matchId);
    if(!m) return '';
    const pm = pmap();
    const av = pid => (pm[pid] && typeof avHtml === 'function')
      ? avHtml(pm[pid], '')
      : '<span class="av" style="background:var(--surface)"></span>';
    const nm = pid => (pm[pid] && pm[pid].name) || '?';
    const aWon = m.winner === 'A';
    const dt = new Date(m.created_at);
    const dStr = dt.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'});
    return `<div class="nd-match" data-mid="${esc(m.id)}">
      <div class="nd-match-side ${aWon?'won':'lost'}">
        <div class="nd-match-avs">${av(m.a1)}${av(m.a2)}</div>
        <div class="nd-match-names">${esc(nm(m.a1))} & ${esc(nm(m.a2))}</div>
      </div>
      <div class="nd-match-score">
        <div class="nd-match-score-val">${m.score_a}:${m.score_b}</div>
        <div class="nd-match-score-date">${dStr}</div>
      </div>
      <div class="nd-match-side ${!aWon?'won':'lost'}">
        <div class="nd-match-avs">${av(m.b1)}${av(m.b2)}</div>
        <div class="nd-match-names">${esc(nm(m.b1))} & ${esc(nm(m.b2))}</div>
      </div>
    </div>`;
  } catch(e){ return ''; }
}

// Elo-Delta für einen Spieler in einem bestimmten Match. Nutzt bestehenden
// getHistoryByMatchId-Cache (Map<matchId, {deltas, eloBefore, eloAfter}>).
function _newsEloDelta(pid, matchId){
  try {
    const hist = getHistoryByMatchId();
    const entry = hist.get(matchId);
    if(!entry || !entry.deltas) return null;
    const d = entry.deltas[pid];
    if(d === undefined || d === null) return null;
    return Math.round(d);
  } catch(e){ return null; }
}

// Pre/Post-Rank für einen Spieler an einem Match. Nutzt getRankSnapshots-Cache.
function _newsRankChange(pid, matchId){
  try {
    const snaps = getRankSnapshots();
    const snap = snaps[matchId];
    if(!snap || !snap.preRank || !snap.postRank) return null;
    const pre = snap.preRank[pid];
    const post = snap.postRank[pid];
    if(!pre || !post) return null;
    return {pre, post};
  } catch(e){ return null; }
}

// Form-Strip + Win-Streak der letzten N Matches. Walks die filter()-Variante
// nur über matches (gesamt) — wird im Detail aufgerufen, also einmalig.
function _newsRecentForm(pid, n){
  const arr = [];
  for(let i = matches.length - 1; i >= 0 && arr.length < n; i--){
    if(matchOf(pid, matches[i])) arr.unshift(matches[i]);
  }
  if(!arr.length) return {strip:'', currentStreak:0};
  const strip = arr.map(m => {
    const w = won(pid, m);
    return `<div class="nd-form-dot ${w?'w':'l'}" title="${w?'Sieg':'Niederlage'}"></div>`;
  }).join('');
  // Aktuelle Sieges-Streak (von hinten zählen)
  let curStreak = 0;
  for(let i = arr.length - 1; i >= 0; i--){
    if(won(pid, arr[i])) curStreak++;
    else break;
  }
  return {strip, currentStreak: curStreak};
}

// H2H-Bilanz Spieler A vs Spieler B (egal welche Teamkonstellation).
// Iteriert einmal über matches; bei großen Datensätzen kann das auf
// getPairsCache umgestellt werden — derzeit aber günstig genug.
// H2H-Lazy-Cache (v8.4): Statt für jedes Detail ALLE matches zu walken
// (O(N) pro Lookup → bei 100k Matches teuer), wird beim ersten H2H-Lookup
// EINE Map über alle Spieler-Paarungen gebaut und gecached. Danach ist jeder
// _newsH2HRecord-Lookup O(1). Build-Kosten: einmalig O(N × 4) (4 Kreuz-Paare
// pro Match), amortisiert über alle Detail-Aufrufe.
// Key bindet an matches.length + _cache.version → invalidateCache(['news'])
// (§3) löscht _h2hMap/_h2hKey, der Version-Tick bricht den Key zusätzlich.
function _ensureH2HMap(){
  const key = 'h2h_' + matches.length + '_' + _cache.version;
  if(_cache._h2hKey === key && _cache._h2hMap) return _cache._h2hMap;
  const map = new Map();
  for(let i = 0; i < matches.length; i++){
    const m = matches[i];
    const sideA = [m.a1, m.a2], sideB = [m.b1, m.b2];
    const ts = mts(m);
    const aWon = m.winner === 'A';
    // Alle 4 Kreuz-Paare (je 1 Spieler aus A gegen 1 aus B) sind H2H-Gegner.
    for(let x = 0; x < 2; x++){
      for(let y = 0; y < 2; y++){
        const pa = sideA[x], pb = sideB[y];
        if(!pa || !pb) continue;
        const k = pa < pb ? pa + '|' + pb : pb + '|' + pa;
        let e = map.get(k);
        if(!e){ e = {wins:{}, lastMatchId:null, lastTs:0}; map.set(k, e); }
        const winnerPid = aWon ? pa : pb;
        e.wins[winnerPid] = (e.wins[winnerPid] || 0) + 1;
        if(ts > e.lastTs){ e.lastTs = ts; e.lastMatchId = m.id; }
      }
    }
  }
  _cache._h2hKey = key;
  _cache._h2hMap = map;
  return map;
}
function _newsH2HRecord(aPid, bPid){
  const map = _ensureH2HMap();
  const k = aPid < bPid ? aPid + '|' + bPid : bPid + '|' + aPid;
  const e = map.get(k);
  if(!e) return {aWins:0, bWins:0, lastMatchId:null};
  // aWins/bWins richten sich nach der Aufruf-Reihenfolge (nicht nach dem
  // kanonischen Map-Key) → korrekt unabhängig von der Argument-Sortierung.
  return {aWins: e.wins[aPid] || 0, bWins: e.wins[bPid] || 0, lastMatchId: e.lastMatchId};
}

// Karriere-Bilanz (wins, losses, winRate) eines Spielers. Nutzt bestehende
// playerStats falls verfügbar, sonst einmaliger walk.
function _newsPlayerCareer(pid){
  try {
    if(typeof playerStats === 'function'){
      const st = playerStats(pid);
      if(st && (st.wins !== undefined || st.gp !== undefined)){
        const wins = st.wins || 0;
        const losses = st.losses || ((st.gp || 0) - wins);
        const total = wins + losses;
        const winRate = total ? Math.round((wins/total)*100) : 0;
        return {wins, losses, winRate};
      }
    }
  } catch(e){}
  // Fallback: schneller direkter walk
  let wins = 0, losses = 0;
  for(let i = 0; i < matches.length; i++){
    if(!matchOf(pid, matches[i])) continue;
    if(won(pid, matches[i])) wins++; else losses++;
  }
  const total = wins + losses;
  return {wins, losses, winRate: total ? Math.round((wins/total)*100) : 0};
}

// ─── Hookup: News-Button-Click + Backdrop-Close ──────────────────────
(function attachNewsHandlers(){
  const ready = () => {
    const btn = document.getElementById('newsBtn');
    if(btn && !btn._newsBound){
      btn._newsBound = true;
      // v8.9 (User-Wunsch): Klick öffnet direkt das volle Sheet statt des
      // kleinen Vorschau-Popovers. openNewsPopover bleibt für interne Reuse
      // (z.B. Toast-Tap, _refreshOpenNewsViews) erhalten.
      btn.onclick = openNewsFeed;
    }
    // Backdrop-Bindings:
    //   nvBg (Mini-Popup): Backdrop-Click schließt — ist nur ein Vorschau-Layer.
    //   ndBg (Story-Detail): KEIN Backdrop-Close mehr (User-Wunsch v8.1):
    //     Stories sollen bewusst konsumiert werden → nur X-Button oder
    //     "Schließen"-Button unten beenden den Detail-View.
    const nvBg = document.getElementById('nvBg');
    if(nvBg && !nvBg._newsBound){
      nvBg._newsBound = true;
      nvBg.addEventListener('click', (e) => {
        if(e.target === nvBg) closeNewsPopover();
      });
    }
    const ndBg = document.getElementById('ndBg');
    if(ndBg && !ndBg._newsBound){
      ndBg._newsBound = true;
      // Backdrop-Click schließt das Detail NICHT mehr — bewusstes Schließen
      // erfolgt nur via X-Button oder Schließen-Button.
    }
  };
  if(document.readyState !== 'loading') ready();
  else document.addEventListener('DOMContentLoaded', ready);
})();

