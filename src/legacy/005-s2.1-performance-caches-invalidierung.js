// ╔═══ §2.1 ─── PERFORMANCE CACHES & INVALIDIERUNG ─────────────────────╗
//     Alle Caches hängen am globalen `_cache`-Objekt und werden per
//     `_cache.version`-Tick oder selektivem `invalidateCache([tags])`
//     ungültig gemacht. Cache-Keys sind ENTITY_LENGTH_VERSION — der
//     Version-Tick ist die universelle Bust-Strategie.
// ╚═════════════════════════════════════════════════════════════════════════╝
// Invalidiert bei: loadAll, Match-Add/Edit/Delete, Recalc, Config-Änderung
let _cache={version:0};

function invalidateCache(keys=null){
  _cache.version++;
  // Nur spezifische Caches löschen, nicht alles
  if(!keys){
    // Kompletter Reset (z.B. nach Recalc)
    _cache={version:_cache.version};
    _lastSimState=null;
    _lastSimIndex=-1;
  } else if(Array.isArray(keys)){
    // Selektiv. Die abgeleiteten Caches (history/snap/rankSnap/matchesBySeason/
    // seasonRankings) sind alle version-gebunden — _cache.version++ oben reicht,
    // beim nächsten Lookup wird der Key-Mismatch erkannt und neu berechnet.
    keys.forEach(k=>{
      if(k==='awards') {
        delete _cache._awards;
        delete _cache._playerAwards;  // playerAwards baut auf awardRankings auf
      }
      if(k==='stats') delete _cache._allStatsKey;
      if(k==='global') { _lastSimState=null; _lastSimIndex=-1; }
      if(k==='teams') delete _cache._teamDetail;
      if(k==='allTeamStats') delete _cache._allTeamStatsKey;
      if(k==='period'){ delete _cache._periodStatsKey; delete _cache._mperiod; } // v9.3: _mperiod-Dict nicht über Versionen anwachsen lassen
      if(k==='badges') delete _cache._badgeEarnedKey;
      if(k==='playerSeasonAwards') delete _cache._playerSeasonAwards;
      if(k==='allPastSeasons') delete _cache._allPastSeasonsKey;
      if(k==='news') {
        // v8.4: News-Generator-Memo (_buildStories) + H2H-Lookup-Map.
        // _cache.version++ oben bricht die Keys ohnehin — dies ist der
        // explizite, selbst-dokumentierende Reset-Pfad.
        delete _cache._buildStoriesKey;
        delete _cache._buildStoriesResult;
        delete _cache._h2hMap;
        delete _cache._h2hKey;
      }
    });
  }
}




// Speichert den letzten Sim-State + Index des letzten verarbeiteten Matches
let _lastSimState = null;
let _lastSimIndex = -1;

function getGlobalSim(){
  const key='global_'+matches.length+'_'+_cache.version;
  if(_cache._globalKey===key) return _cache._globalSim;
  
  // Wenn nur neue Matches hinzugekommen sind: inkrementell weitermachen
  if(_lastSimState && _lastSimIndex < matches.length && _cache.version === _lastSimVersion){
    const newMatches = matches.slice(_lastSimIndex + 1);
    if(newMatches.length > 0 && newMatches.length < 50){
      // Inkrementell: nur neue Matches simulieren auf Basis des alten States
      const sim = simulateElo(newMatches, {
        initialState: _lastSimState,
        initialCurSeason: _lastSimState.curSeason
      });
      _lastSimState = sim;
      _lastSimIndex = matches.length - 1;
      _cache._globalKey = key;
      _cache._globalSim = sim;
      // Abgeleitete Maps invalidieren — werden lazy neu gebaut
      _cache._historyByMatchId = null;
      _cache._snapMap = null;
      _cache._seasonRankings = null;
      _cache._matchesBySeason = null;
      _cache._rankSnapshots = null;
      _cache._streakSnap = null;
      return sim;
    }
  }
  
  // Fallback: komplette Neuberechnung (z.B. nach Recalc oder großem Update)
  const sim = simulateElo(matches);
  _lastSimState = sim;
  _lastSimIndex = matches.length - 1;
  _lastSimVersion = _cache.version;
  _cache._globalKey = key;
  _cache._globalSim = sim;
  _cache._historyByMatchId = null;
  _cache._snapMap = null;
  _cache._seasonRankings = null;
  _cache._matchesBySeason = null;
  _cache._rankSnapshots = null;
  _cache._streakSnap = null;
  return sim;
}

// ─── §2.2 Abgeleitete Sim-Maps (snapMap, historyByMatchId) ───────────
// Vermeidet wiederholte O(n) Loops in showPlayer, vAwards, _awardRankingsUncached etc.
// WICHTIG: Cache-Key bindet an matches.length + _cache.version, damit selektives
// invalidateCache(['global', ...]) korrekt invalidiert. Sonst stale nach Match-Add/Edit.
function getHistoryByMatchId(){
  const sim=getGlobalSim();
  const key='hist_'+matches.length+'_'+_cache.version;
  if(_cache._historyByMatchIdKey===key) return _cache._historyByMatchId;
  const map=new Map();
  for(let i=0; i<sim.history.length; i++){
    map.set(sim.history[i].matchId, sim.history[i]);
  }
  _cache._historyByMatchIdKey = key;
  _cache._historyByMatchId = map;
  return map;
}
// ─── §2.3 Streak-Snapshots (für "Serienbrecher"-Badge) ───────────────
// Für jedes Match: die aktuelle Win-Siegesserie aller 4 beteiligten Spieler
// VOR diesem Match. Berechnet per O(n) Walk durch alle Matches chronologisch;
// pro Match werden die Streaks der 4 Spieler vorher gesnapshottet, dann
// aktualisiert (Sieg → +1, Niederlage → 0).
// Ergebnis: { matchId: { pid: cur_streak_before_match (sparse, nur 4 pids) } }
// Genutzt vom Badge "Serienbrecher" — beendet eine ≥4er Serie eines Gegners
// durch direkten Sieg. Saison-Resets beeinflussen Streaks NICHT (analog zu
// longestPlayerStreak), da Serien semantisch durchgehend laufen.
function getStreakSnapshots(){
  const key='streakSnap_'+matches.length+'_'+_cache.version;
  if(_cache._streakSnapKey===key) return _cache._streakSnap;
  const ordered=[...matches].sort((a,b)=>mts(a)-mts(b));
  const cur={}; // pid → laufende Siegesserie (live)
  const out={}; // matchId → snapshot
  for(let i=0;i<ordered.length;i++){
    const m=ordered[i];
    const ids=[m.a1,m.a2,m.b1,m.b2];
    // Pre-Snapshot: nur die 4 beteiligten Spieler tracken
    const snap={};
    ids.forEach(pid=>{ snap[pid]=cur[pid]||0; });
    out[m.id]=snap;
    // Apply: update cur für die 4 Spieler
    ids.forEach(pid=>{
      const onA=(pid===m.a1||pid===m.a2);
      const w=(onA&&m.winner==='A')||(!onA&&m.winner==='B');
      if(w) cur[pid]=(cur[pid]||0)+1;
      else cur[pid]=0;
    });
  }
  _cache._streakSnapKey=key;
  _cache._streakSnap=out;
  return out;
}

function getSnapMap(){
  const sim=getGlobalSim();
  const key='snap_'+matches.length+'_'+_cache.version;
  if(_cache._snapMapKey===key) return _cache._snapMap;
  const map={};
  for(let i=0; i<sim.history.length; i++){
    map[sim.history[i].matchId] = sim.history[i].eloBefore;
  }
  _cache._snapMapKey = key;
  _cache._snapMap = map;
  return map;
}

// ─── §2.4 Saison-Rank-Snapshots (preRank/postRank pro Match) ─────────
// Für jedes Match: die laufende Saison-Rangliste VOR und NACH dem Match.
// Berechnet wird das per O(n) Walk durch alle Matches; pro Match werden
// die Deltas aus globalSim.history auf einen seasonElo-Akkumulator addiert.
// Ergebnis: { matchId: { preRank: {pid: rank}, postRank: {pid: rank} } }
// wobei rank = 1 für höchstes Saison-Elo zum jeweiligen Zeitpunkt.
// Genutzt von den Badges "Thronfäller" (kingslayer) und "Überholmanöver".
// Tie-Break bei gleichem Elo: alphabetisch nach playerId — deterministisch.
function getRankSnapshots(){
  const key='ranksnap_'+matches.length+'_'+_cache.version;
  if(_cache._rankSnapshotsKey===key) return _cache._rankSnapshots;
  getGlobalSim(); // garantiert Sim ist aktuell
  const histMap = getHistoryByMatchId();
  const out = {};
  const seasonElo = {}; // sid → {pid: elo}
  for(let i=0; i<matches.length; i++){
    const m = matches[i];
    const sid = seasonOf(m.created_at).id;
    if(!seasonElo[sid]) seasonElo[sid] = {};
    const elos = seasonElo[sid];
    // Pre-Rank: aktueller Stand VOR diesem Match
    const preEntries = Object.entries(elos);
    preEntries.sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const preRank = {};
    preEntries.forEach(([pid], idx) => preRank[pid] = idx + 1);
    // Apply this match's deltas (vom globalSim)
    const histEntry = histMap.get(m.id);
    if(histEntry && histEntry.deltas){
      Object.entries(histEntry.deltas).forEach(([pid, d]) => {
        elos[pid] = (elos[pid] || 0) + d;
      });
    }
    // Post-Rank: Stand NACH diesem Match
    const postEntries = Object.entries(elos);
    postEntries.sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const postRank = {};
    postEntries.forEach(([pid], idx) => postRank[pid] = idx + 1);
    out[m.id] = {preRank, postRank};
  }
  _cache._rankSnapshotsKey = key;
  _cache._rankSnapshots = out;
  return out;
}

// ─── §2.4b Saison-Positionsverlauf (für §C21 Position-History-Sheet) ──
// Berechnet pro Tag der Saison die Tabellenposition jedes aktiven Saison-
// Spielers, basierend auf saison-isoliertem Elo. Eintritts-Tag eines Spielers
// = Tag des ersten Saison-Matches; vor diesem Tag bleibt der Datenpunkt null
// (→ Linie startet erst am Eintrittstag, wie im Mockup "Neue Spieler ab
// Eintrittsdatum" gefordert).
//
// Tie-Break bei identischem Saison-Elo: alphabetisch nach Spieler-ID —
// deterministisch und konsistent zu getRankSnapshots (Zeile 3060/3072).
//
// Performance: O(Matches × 4) für Delta-Apply, O(Spieler × log Spieler) pro
// Tag für die Sortierung. Bei 12 Spielern × 30 Tagen × 200 Matches ≈ 1500 Ops.
// Cache-Key bindet an matches.length + _cache.version → invalidiert automatisch
// nach jedem Match (doSaveMatch ruft invalidateCache(['global', ...])).
const POSV_COLORS = [
  '#BEF264', '#ff7849', '#56b4e8', '#f7cf4a',
  '#a78bfa', '#4ade80', '#f0566a', '#22d3ee',
  '#fb923c', '#e879f9', '#fde047', '#94a3b8'
];

function getSeasonPositionHistory(seasonId){
  if(!seasonId) seasonId = currentSeason().id;
  const key = 'posHist_'+seasonId+'_'+matches.length+'_'+_cache.version;
  if(_cache._posHistKey===key) return _cache._posHist;

  const sEnd = seasonEnd(seasonId);
  const isCurrent = (seasonId === currentSeason().id);
  const sMatches = matchesInSeason(seasonId);
  const totalDays = sEnd.getDate(); // letzter Tag des Monats

  // Letzter zu rendernder Tag:
  //   laufende Saison → heutiger Tag im Monat (capped auf totalDays)
  //   vergangene Saison → letzter Tag mit ≥1 Match (mind. 1)
  let lastDay;
  if(isCurrent){
    lastDay = Math.min(new Date().getDate(), totalDays);
  } else {
    let mx = 0;
    for(const m of sMatches){ const d=new Date(m.created_at).getDate(); if(d>mx) mx=d; }
    lastDay = Math.max(1, mx);
  }

  // Aktive Spieler in dieser Saison = wer ≥1 Saison-Match hat
  const activeSet = new Set();
  sMatches.forEach(m => [m.a1,m.a2,m.b1,m.b2].forEach(id => activeSet.add(id)));
  const activeIds = [...activeSet];

  // Empty-State: 0 oder 1 aktive Spieler → kein sinnvolles Diagramm
  if(activeIds.length < 1){
    const result = {seasonId, isCurrent, totalDays, lastDay:0, activeIds:[], entryDay:{},
      positionsByDay:{}, finalElo:{}, colorOf:{}, days:[], builtAt:Date.now(), empty:true};
    _cache._posHistKey = key;
    _cache._posHist = result;
    return result;
  }

  // Eintritts-Tag pro Spieler (Tag des ersten Saison-Matches)
  const entryDay = {};
  for(const m of sMatches){
    const d = new Date(m.created_at).getDate();
    [m.a1,m.a2,m.b1,m.b2].forEach(id => {
      if(entryDay[id]===undefined) entryDay[id]=d;
    });
  }

  // Saison-Elo-Akkumulator. Delta-Quelle: globalSim.history via getHistoryByMatchId,
  // damit wir saison-isoliert dieselben Zahlen wie der Rest der App haben.
  const histMap = getHistoryByMatchId();
  const startElo = cfg.start_elo ?? 0;
  const seasonElo = {};
  activeIds.forEach(id => seasonElo[id] = startElo);

  // positionsByDay[pid][dayIdx] = Position (1..N) ODER null wenn vor Eintritt
  const positionsByDay = {};
  activeIds.forEach(id => positionsByDay[id] = new Array(lastDay).fill(null));

  let mIdx = 0;
  for(let day=1; day<=lastDay; day++){
    // Alle Matches dieses Tages anwenden
    while(mIdx < sMatches.length){
      const m = sMatches[mIdx];
      const mDay = new Date(m.created_at).getDate();
      if(mDay > day) break;
      if(mDay === day){
        const histEntry = histMap.get(m.id);
        if(histEntry && histEntry.deltas){
          const ds = histEntry.deltas;
          for(const pid in ds){
            if(seasonElo[pid] !== undefined) seasonElo[pid] += ds[pid];
          }
        }
      }
      mIdx++;
    }
    // Ranking-Snapshot (nur Spieler, die schon eingestiegen sind, werden gezählt;
    // andere bleiben null für diesen Tag — Linie startet erst beim Eintrittstag)
    const ranked = activeIds
      .filter(id => entryDay[id] !== undefined && day >= entryDay[id])
      .map(id => [id, seasonElo[id]])
      .sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0]));
    ranked.forEach(([pid], idx) => {
      positionsByDay[pid][day-1] = idx + 1;
    });
  }

  // Eindeutiges Farb-Mapping: über alphabetisch sortierte ID-Liste → 12 Farben
  // (bei ≤12 Spielern garantiert eindeutig; bei >12 wiederholt sich die Palette).
  const sortedIds = [...activeIds].sort();
  const colorOf = {};
  sortedIds.forEach((id, i) => colorOf[id] = POSV_COLORS[i % POSV_COLORS.length]);

  const result = {
    seasonId, isCurrent, totalDays, lastDay,
    activeIds, entryDay, positionsByDay,
    finalElo: {...seasonElo},
    colorOf,
    days: Array.from({length:lastDay}, (_,i)=>i+1),
    builtAt: Date.now(),
    empty: false
  };
  _cache._posHistKey = key;
  _cache._posHist = result;
  return result;
}

// Saison-Stats pro Spieler (für Detail-Karte im Positionsverlauf-Sheet).
// Liefert Siege/Niederlagen/Quote/Bilanz für eine Saison. Cached.
function getSeasonPlayerStats(seasonId){
  if(!seasonId) seasonId = currentSeason().id;
  const key = 'posStats_'+seasonId+'_'+matches.length+'_'+_cache.version;
  if(_cache._posStatsKey===key) return _cache._posStats;
  const sMatches = matchesInSeason(seasonId);
  const stats = {};
  const ensure = id => { if(!stats[id]) stats[id]={wins:0,losses:0,games:0}; return stats[id]; };
  for(const m of sMatches){
    const aWin = m.winner==='A';
    [m.a1,m.a2].forEach(id => { const s=ensure(id); s.games++; if(aWin) s.wins++; else s.losses++; });
    [m.b1,m.b2].forEach(id => { const s=ensure(id); s.games++; if(aWin) s.losses++; else s.wins++; });
  }
  _cache._posStatsKey = key;
  _cache._posStats = stats;
  return stats;
}

// ─── §2.5 Matches-pro-Saison Cache ───────────────────────────────────
// Gruppiert alle Matches nach ihrer Saison-ID. Wird vom Award-Sammler-Badge
// und potentiell weiteren Saison-aggregierenden Funktionen genutzt.
function getMatchesBySeason(){
  const key='msBySeason_'+matches.length+'_'+_cache.version;
  if(_cache._matchesBySeasonKey===key) return _cache._matchesBySeason;
  const map={};
  for(let i=0; i<matches.length; i++){
    const sid=seasonOf(matches[i].created_at).id;
    if(!map[sid]) map[sid]=[];
    map[sid].push(matches[i]);
  }
  _cache._matchesBySeasonKey=key;
  _cache._matchesBySeason=map;
  return map;
}

// ─── §2.6 Saison-Rangliste Cache (Saison-End-Stand) ──────────────────
// Pro Saison: Top-3 und Bottom-3 Spieler nach Saison-End-Elo.
// Bottom-3 nur definiert wenn mindestens 6 Saison-Teilnehmer (sonst überlappt es mit Top-3).
// Genutzt von Königsklasse + Pflichtaufgabe Badges.
function getSeasonRankingsCache(){
  const _srcKey='seasonRk_'+matches.length+'_'+_cache.version;
  if(_cache._seasonRankingsKey===_srcKey) return _cache._seasonRankings;
  const gSim=getGlobalSim();
  const out={};
  const pm=pmap();
  Object.keys(gSim.seasonEndElos||{}).forEach(sid=>{
    const endElos=gSim.seasonEndElos[sid]||{};
    const playedMap=gSim.seasonPlayed[sid]||{};
    const list=Object.keys(endElos)
      .filter(pid=>{
        const p=pm[pid];
        if(!p||p.hidden) return false;
        return (playedMap[pid]||0)>0;
      })
      .map(pid=>({pid,elo:endElos[pid]}))
      .sort((a,b)=>b.elo-a.elo);
    const top3=new Set(list.slice(0,3).map(x=>x.pid));
    const bottom3 = list.length>=6
      ? new Set(list.slice(-3).map(x=>x.pid))
      : new Set();
    out[sid]={top3,bottom3};
  });
  _cache._seasonRankingsKey=_srcKey;
  _cache._seasonRankings=out;
  return out;
}

let _lastSimVersion = 0;


function getCachedAwardRankings(period){
  let cacheSuffix='';
  if(period==='season') cacheSuffix=awSeasonId||currentSeason().id;
  else if(period==='week') cacheSuffix=awWeekStart?('w'+new Date(awWeekStart).getTime()):'cur';
  const key=period+'_'+cacheSuffix+'_'+matches.length+'_'+_cache.version;
  if(!_cache._awards) _cache._awards={};
  if(_cache._awards[key]) return _cache._awards[key];
  const r=_awardRankingsUncached(period);
  _cache._awards[key]=r;
  return r;
}

function getSeasonEloMap(){
  try{
    // Aus getGlobalSim lesen — der Saison-Reset im Hauptdurchlauf garantiert,
    // dass sim.elo die aktuelle Saison-Elo enthält. Positions-Tracker
    // ist konsistent saison-übergreifend (s. simulateElo).
    const sim=getGlobalSim();
    const map={};
    players.forEach(p=>{
      map[p.id]=sim.elo[p.id]!==undefined ? sim.elo[p.id] : cfg.start_elo;
    });
    return map;
  } catch(e){
    console.error('getSeasonEloMap Fehler:',e);
    const map={};
    players.forEach(p=>{ map[p.id]=cfg.start_elo; });
    return map;
  }
}

async function syncSeasonEloToDB(){
  const map=getSeasonEloMap();
  const updates=[];
  for(const p of players){
    const newElo=Math.round(map[p.id] ?? cfg.start_elo);
    if(newElo!==Math.round(p.elo)){
      updates.push(sb.from('players').update({elo:newElo}).eq('id',p.id));
    }
  }
  if(updates.length) await Promise.all(updates);
}

