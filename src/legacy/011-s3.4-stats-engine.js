// ╔═══ §3.4 ─── STATS ENGINE ───────────────────────────────────────────╗
//     winRate, atkW/defW, Pos-Klasse, allgemeine Player-Aggregate.
// ╚═════════════════════════════════════════════════════════════════════════╝
// matchSubset optional — defaults zu allen Matches
function playerStats(id, matchSubset){
  const ms = matchSubset || matches;

  // Wenn Statistiken für ALLE Matches angefragt werden, den bereits gecachten globalen Datensatz verwenden
  if (ms === matches) {
    const allStats = allPlayerStats(); // Dieser Datensatz ist bereits gecacht
    // allPlayerStats enthält nur aktive Spieler. Wenn ein versteckter Spieler angefragt wird,
    // der nicht im Cache ist, fällt die Logik auf die vollständige Berechnung zurück.
    if (allStats[id]) {
      // WICHTIG: Erstelle eine Kopie, um Änderungen am Cache-Objekt zu vermeiden,
      // da `bestWorstMate` und `nemesis` direkt in das Objekt schreiben könnten.
      return { ...allStats[id] };
    }
  }

  // Ursprüngliche Berechnungslogik für Teilmengen oder versteckte Spieler
  const s={games:0,wins:0,losses:0,gf:0,ga:0,atkG:0,atkW:0,defG:0,defW:0,
           atkGoals:0,defConceded:0, // Pos-spezifische Tore/Gegentore (Donut + Positionen-Tab)
           mates:{},opps:{},best:-1e9,worst:1e9,curStreak:0};
  let run=0;
  ms.forEach(m=>{
    const onA=(id===m.a1||id===m.a2),onB=(id===m.b1||id===m.b2);
    if(!onA&&!onB)return;
    const won=(onA&&m.winner==='A')||(onB&&m.winner==='B');
    const myPos=id===m.a1?m.a1_pos:id===m.a2?m.a2_pos:id===m.b1?m.b1_pos:m.b2_pos;
    const gf=onA?m.score_a:m.score_b, ga=onA?m.score_b:m.score_a;
    s.games++; s.gf+=gf; s.ga+=ga;
    if(won){s.wins++; run=run>=0?run+1:1;} else {s.losses++; run=run<=0?run-1:-1;}
    if(myPos==='atk'){s.atkG++; if(won)s.atkW++; s.atkGoals+=gf;} else {s.defG++; if(won)s.defW++; s.defConceded+=ga;}
    const mate=onA?(id===m.a1?m.a2:m.a1):(id===m.b1?m.b2:m.b1);
    if(!s.mates[mate])s.mates[mate]={g:0,w:0}; s.mates[mate].g++; if(won)s.mates[mate].w++;
    const opps=onA?[m.b1,m.b2]:[m.a1,m.a2];
    opps.forEach(o=>{if(!s.opps[o])s.opps[o]={g:0,w:0};s.opps[o].g++;if(won)s.opps[o].w++;});
    const d=(m.deltas&&m.deltas[id])||0;
    if(d>s.best)s.best=d; if(d<s.worst)s.worst=d;
  });
  s.curStreak=run;
  s.wr=s.games?s.wins/s.games:0;
  s.atkWr=s.atkG?s.atkW/s.atkG:null;
  s.defWr=s.defG?s.defW/s.defG:null;
  s.gd=s.gf-s.ga;
  return s;
}


function bestWorstMate(id, s_param){
  const s= s_param || playerStats(id); // Nutzt übergebene Stats oder berechnet neu (was jetzt gecacht ist)
  let best=null,worst=null;
  Object.entries(s.mates).forEach(([mid,v])=>{ if(v.g<2)return; const wr=v.w/v.g;
    if(!best||wr>best.wr)best={mid,wr,g:v.g}; if(!worst||wr<worst.wr)worst={mid,wr,g:v.g}; });
  return {best,worst};
}
function nemesis(id, s_param){
  const s= s_param || playerStats(id); // Nutzt übergebene Stats oder berechnet neu (was jetzt gecacht ist)
  let n=null,f=null;
  Object.entries(s.opps).forEach(([oid,v])=>{ if(v.g<2)return; const wr=v.w/v.g;
    if(!n||wr<n.wr)n={oid,wr,g:v.g}; if(!f||wr>f.wr)f={oid,wr,g:v.g}; });
  return {nemesis:n,favorite:f};
}


function teamStats(){
  const key='allTeamStats_'+matches.length+'_'+_cache.version;
  if(_cache._allTeamStatsKey===key) return _cache._allTeamStatsData;

  const T={};
  matches.forEach(m=>{
    [[m.a1,m.a2,m.winner==='A',m.score_a,m.score_b],[m.b1,m.b2,m.winner==='B',m.score_b,m.score_a]]
    .forEach(([x,y,won,gf,ga])=>{ const k=[x,y].sort().join('|');
      if(!T[k])T[k]={ids:[x,y].sort(),g:0,w:0,gf:0,ga:0};
      T[k].g++; if(won)T[k].w++; T[k].gf+=gf; T[k].ga+=ga; });
  });
  const result = Object.values(T);
  _cache._allTeamStatsKey = key;
  _cache._allTeamStatsData = result;
  return result;
}


// Detaillierte Team-Stats für das Team-Profil-Sheet.
// Ein Walk durch alle Matches → komplettes Detail. Gecached pro Team-Key + Cache-Version.
function teamDetail(p1,p2){
  const ids=[p1,p2].sort();
  const key=ids.join('|');
  if(!_cache._teamDetail) _cache._teamDetail={};
  if(_cache._teamDetail[key]) return _cache._teamDetail[key];

  let wins=0,losses=0,gf=0,ga=0,eloDelta=0;
  const oppStats={}; // einzelner Gegnerspieler → {g,w}
  const teamMatches=[]; // Matches in denen das Duo zusammen gespielt hat
  let biggestWin=null, biggestLoss=null, biggestUpset=null;
  // Positions-Tracking für ids[0]; ids[1] ist immer die Gegenposition
  // (im 2v2-Modell hat der Partner immer atk↔def zum Mate).
  let p0Atk=0, p0Def=0;
  // Aufstellungs-Quote pro Variante (für "Beste Aufstellung")
  let p0AtkWins=0, p0DefWins=0;
  // Fun-Facts-Aggregate
  let shutouts=0;       // Zu-Null-Siege (myGa===0 und gewonnen)
  let shutoutsAgainst=0;// Zu-Null-Niederlagen (myGf===0 und verloren)
  let perfectWins=0;    // 10:0-Siege
  let scoreCounts={};   // "myGf:myGa" → Anzahl (häufigster Endstand)

  for(const m of matches){
    const onA=(m.a1===ids[0]&&m.a2===ids[1])||(m.a1===ids[1]&&m.a2===ids[0]);
    const onB=(m.b1===ids[0]&&m.b2===ids[1])||(m.b1===ids[1]&&m.b2===ids[0]);
    if(!onA&&!onB) continue;
    const won=(onA&&m.winner==='A')||(onB&&m.winner==='B');
    const myGf=onA?m.score_a:m.score_b;
    const myGa=onA?m.score_b:m.score_a;
    const diff=myGf-myGa;
    const expected=onA?(m.exp_a||0.5):(1-(m.exp_a||0.5));
    const t=mts(m);

    // Position von ids[0] in diesem Match bestimmen
    const slot = onA
      ? (m.a1===ids[0] ? 'a1' : 'a2')
      : (m.b1===ids[0] ? 'b1' : 'b2');
    const p0Pos = m[slot+'_pos'] || 'atk';
    if(p0Pos==='atk'){ p0Atk++; if(won) p0AtkWins++; }
    else             { p0Def++; if(won) p0DefWins++; }

    gf+=myGf; ga+=myGa;
    if(won) wins++; else losses++;
    const opps=onA?[m.b1,m.b2]:[m.a1,m.a2];
    opps.forEach(oid=>{
      if(!oppStats[oid]) oppStats[oid]={g:0,w:0};
      oppStats[oid].g++; if(won) oppStats[oid].w++;
    });

    teamMatches.push({m,onA,won,myGf,myGa,diff,expected,t});

    // Fun-Facts-Tracking
    if(won && myGa===0) shutouts++;
    if(!won && myGf===0) shutoutsAgainst++;
    if(won && myGf===10 && myGa===0) perfectWins++;
    const scoreKey = myGf+':'+myGa;
    scoreCounts[scoreKey] = (scoreCounts[scoreKey]||0) + 1;

    if(won){
      if(!biggestWin || diff>biggestWin.diff || (diff===biggestWin.diff && t>biggestWin.t)){
        biggestWin={m,diff,t,score:myGf+':'+myGa};
      }
      if(!biggestUpset || expected<biggestUpset.expected || (expected===biggestUpset.expected && t>biggestUpset.t)){
        biggestUpset={m,expected,t,score:myGf+':'+myGa};
      }
    } else {
      const lossDiff=-diff;
      if(!biggestLoss || lossDiff>biggestLoss.lossDiff || (lossDiff===biggestLoss.lossDiff && t>biggestLoss.t)){
        biggestLoss={m,lossDiff,t,score:myGf+':'+myGa};
      }
    }
  }

  // Erz-/Lieblingsgegner: einzelne Spieler, min. 2 Begegnungen
  let nemesis=null, favorite=null;
  Object.entries(oppStats).forEach(([oid,s])=>{
    if(s.g<2) return;
    const wr=s.w/s.g;
    if(!nemesis || wr<nemesis.wr || (wr===nemesis.wr && s.g>nemesis.g)) nemesis={oid,wr,g:s.g,w:s.w};
    if(!favorite || wr>favorite.wr || (wr===favorite.wr && s.g>favorite.g)) favorite={oid,wr,g:s.g,w:s.w};
  });
  if(nemesis && favorite && nemesis.oid===favorite.oid){ favorite=null; }

  // Upset nur zeigen wenn tatsächlich ein Underdog-Sieg (Erwartung < 45%)
  if(biggestUpset && biggestUpset.expected>=0.45) biggestUpset=null;

  // ═══ STREAKS (chronologisch) ═══
  const chronoMatches=[...teamMatches].sort((a,b)=>a.t-b.t);
  let currentStreak=0; // positiv=Sieges-, negativ=Niederlagen-Serie
  let longestWinStreak=0, longestLossStreak=0;
  let curWin=0, curLoss=0;
  chronoMatches.forEach(tm=>{
    if(tm.won){
      curWin++; if(curWin>longestWinStreak) longestWinStreak=curWin;
      curLoss=0;
    } else {
      curLoss++; if(curLoss>longestLossStreak) longestLossStreak=curLoss;
      curWin=0;
    }
  });
  // Aktuell-Streak: laufender Wert nach dem letzten Spiel
  if(chronoMatches.length){
    const last=chronoMatches[chronoMatches.length-1];
    currentStreak = last.won ? curWin : -curLoss;
  }

  // Letzte 10 Matches (neueste zuerst) — vorher waren es 5
  const recent=[...teamMatches].sort((a,b)=>b.t-a.t).slice(0,10);

  // ═══ KONSISTENTE ELO-BERECHNUNG ═══
  const globalSim=getGlobalSim();
  const teamKey=[ids[0],ids[1]].sort().join('|');
  const consistentEloDelta=Math.round(globalSim.teamElo[teamKey]||0);

  const games=teamMatches.length;
  // ═══ AUFSTELLUNGS-ANALYSE ═══
  // Typische Aufstellung = häufigere; Beste Aufstellung = höhere Siegrate.
  // "Beste" wird nur angezeigt, wenn (a) beide Aufstellungen je ≥2× vorkamen
  // (Mindestschwelle für stabile Quote) und (b) die "Beste" tatsächlich
  // VON DER TYPISCHEN ABWEICHT (= seltenere Aufstellung mit besserer Quote).
  const p0Dom = p0Atk>=p0Def ? 'atk' : 'def';
  const dominantCount = Math.max(p0Atk, p0Def);
  const swapped = Math.min(p0Atk, p0Def);
  const posStats = {
    [ids[0]]: {atk:p0Atk, def:p0Def, dom:p0Dom},
    [ids[1]]: {atk:p0Def, def:p0Atk, dom:p0Dom==='atk'?'def':'atk'}
  };
  // Aufstellungs-Siegraten (nur wenn jede Variante ≥2× vorkam)
  let bestLineup = null;
  if(p0Atk>=2 && p0Def>=2){
    const atkWr = p0AtkWins/p0Atk;
    const defWr = p0DefWins/p0Def;
    const bestP0Pos = atkWr >= defWr ? 'atk' : 'def';
    if(bestP0Pos !== p0Dom){ // nur wenn anders als typische
      bestLineup = {
        p0: bestP0Pos,
        wr: bestP0Pos==='atk' ? atkWr : defWr,
        wins: bestP0Pos==='atk' ? p0AtkWins : p0DefWins,
        games: bestP0Pos==='atk' ? p0Atk : p0Def,
        // Vergleichswert: wie viel besser als typische?
        typicalWr: p0Dom==='atk' ? atkWr : defWr
      };
    }
  }

  // Chronologisch sortierte Match-IDs für den Form-Spark (älteste zuerst)
  const matchIdsChrono = chronoMatches.map(tm=>tm.m.id);

  // ═══ GEMEINSAME SAISON-TITEL ═══
  // Team of the Season aus seasons[]: team_p1/team_p2 sind die archivierten Sieger-Duo-IDs
  const seasonTitles = seasons.filter(srow => {
    if(!srow.team_p1 || !srow.team_p2) return false;
    const t1 = srow.team_p1, t2 = srow.team_p2;
    return (t1===ids[0] && t2===ids[1]) || (t1===ids[1] && t2===ids[0]);
  }).map(srow => {
    let label = srow.id || '';
    if(srow.id){
      const [y, mo] = srow.id.split('-').map(Number);
      if(y && mo) label = new Date(y, mo-1, 1).toLocaleDateString('de-DE', {month:'long', year:'numeric'});
    }
    return { id: srow.id, label };
  });

  // ═══ HÄUFIGSTER ENDSTAND ═══
  let topScore = null, topScoreCount = 0;
  Object.entries(scoreCounts).forEach(([s, c]) => {
    if(c > topScoreCount){ topScoreCount = c; topScore = s; }
  });
  // Nur als "Lieblings-Score" anzeigen, wenn er ≥2× vorkam
  if(topScoreCount < 2) topScore = null;

  // Erstes/letztes gemeinsames Match-Datum (für "aktiv seit")
  const firstMatchDate = chronoMatches.length ? chronoMatches[0].m.created_at : null;
  const lastMatchDate  = chronoMatches.length ? chronoMatches[chronoMatches.length-1].m.created_at : null;

  const result={
    ids, games, wins, losses, gf, ga,
    gd: gf-ga,
    wr: games?wins/games:0,
    eloDelta: consistentEloDelta,
    nemesis, favorite,
    biggestWin, biggestLoss, biggestUpset,
    recent,
    posStats, dominantCount, swapped, bestLineup,
    matchIdsChrono,
    // Streaks
    currentStreak, longestWinStreak, longestLossStreak,
    // Fun Facts
    shutouts, shutoutsAgainst, perfectWins,
    topScore, topScoreCount,
    firstMatchDate, lastMatchDate,
    // Karriere
    seasonTitles
  };
  _cache._teamDetail[key]=result;
  return result;
}

// ════════════════════════════════════════════════════════════════════
// RANG-HELPER (extracted aus playerAwards für Wiederverwendung)
// ════════════════════════════════════════════════════════════════════
// Liefert 0-basierten Rang (0,1,2) wenn der Eintrag in den Top-3 einer
// Liste vorkommt — oder -1 wenn nicht. Tie-aware (Spieler mit gleichem
// Wert teilen sich den Rang).
function getRankInList(arr, valFn, checkFn){
  if(!arr || !arr.length) return -1;
  let rank = 1;
  for(let i=0; i<Math.min(arr.length, 10); i++){
    if(i>0 && valFn(arr[i]) !== valFn(arr[i-1])) rank = i+1;
    if(rank > 3) break;
    if(checkFn(arr[i])) return rank - 1;
  }
  return -1;
}

// ════════════════════════════════════════════════════════════════════
// TEAM-ACHIEVEMENTS: alle Team-Awards (Lifetime), in denen dieses
// konkrete Duo Top-3 erreicht hat. Genutzt vom Team-Profil-Sheet, um
// die Auszeichnungen des Duos prominent zu zeigen.
// ════════════════════════════════════════════════════════════════════
// Nutzt den globalen awardRankings('all')-Cache. Pro Award-Key prüfen
// wir, ob die Liste einen Eintrag enthält dessen ids === Duo-IDs (sortiert).
// Sonderbehandlung für Rivalry (4-Spieler-Award): das Duo kann entweder
// in idsA oder idsB sein.
function teamAchievements(p1Id, p2Id){
  const R = awardRankings('all');
  const sortKey = [p1Id, p2Id].sort().join('|');

  const TEAM_AWARD_LISTS = {
    mvt:              R.mvt,
    bestDuo:          R.bestDuo,
    worstTeam:        R.worstTeam,
    zirkus:           R.zirkusList,
    baustelle:        R.baustelleList,
    unstoppable:      R.unstoppableList,
    concreteWall:     R.concreteWallList,
    cheesePlatter:    R.cheesePlatterList,
    luckyCharm:       R.luckyCharmList,
    giantSlayer:      R.giantSlayerList,
    favoritenschreck: R.favoritenschreckList
  };
  // Sortier-Funktionen — konsistent mit playerAwards (teamValFns)
  const VAL_FNS = {
    mvt:              x => Math.round(x.v),
    bestDuo:          x => x.g,
    worstTeam:        x => -Math.round(x.w/x.g*100),
    zirkus:           x => Math.round(x.pct*1000),
    baustelle:        x => x.best,
    unstoppable:      x => x.v,
    concreteWall:     x => -Math.round(x.v*100),
    cheesePlatter:    x => Math.round(x.v*100),
    luckyCharm:       x => Math.round(x.v*1000),
    giantSlayer:      x => Math.round(x.v*1000),
    favoritenschreck: x => x.v
  };
  // Display-Werte für die Anzeige der erreichten Quote/Anzahl
  const DISP_FNS = {
    mvt:              x => (x.v>=0?'+':'')+Math.round(x.v),
    bestDuo:          x => x.g+' Sp.',
    worstTeam:        x => Math.round(x.w/x.g*100)+'%',
    zirkus:           x => Math.round(x.pct*100)+'%',
    baustelle:        x => x.best+'er',
    unstoppable:      x => x.v+'er',
    concreteWall:     x => x.v.toFixed(2),
    cheesePlatter:    x => x.v.toFixed(2),
    luckyCharm:       x => Math.round(x.v*100)+'%',
    giantSlayer:      x => Math.round(x.v*100)+'%',
    favoritenschreck: x => x.v+' Elo'
  };

  const found = [];
  Object.entries(TEAM_AWARD_LISTS).forEach(([key, arr]) => {
    if(!arr || !arr.length) return;
    const matchFn = x => x.ids && x.ids.slice().sort().join('|') === sortKey;
    const rank = getRankInList(arr, VAL_FNS[key], matchFn);
    if(rank >= 0 && rank <= 2){
      const entry = arr.find(matchFn);
      if(entry) found.push({key, rank, val: DISP_FNS[key](entry)});
    }
  });

  // Rivalry: 4-Spieler-Award — Duo kann entweder idsA oder idsB sein
  if(R.rivalryList && R.rivalryList.length){
    const matchFn = x => {
      const a = x.idsA.slice().sort().join('|');
      const b = x.idsB.slice().sort().join('|');
      return a === sortKey || b === sortKey;
    };
    const rank = getRankInList(R.rivalryList, x => Math.round(x.pct*1000), matchFn);
    if(rank >= 0 && rank <= 2){
      const entry = R.rivalryList.find(matchFn);
      if(entry) found.push({key:'rivalry', rank, val: Math.round(entry.pct*100)+'%'});
    }
  }

  return found;
}

// ════════════════════════════════════════════════════════════════════
// H2H-DETAIL: Bilanz zweier Spieler in zwei Dimensionen
// ════════════════════════════════════════════════════════════════════
// Liefert für Spieler-Paar (idA, idB) ALLES, was das H2H-Sheet braucht:
//   • asTeam     — gemeinsame Matches als Teamkollegen
//   • asOppForA  — Matches als Gegner, ALLES AUS SICHT VON idA
//                  (Wins zählen idA-Siege gegen idB; eloDelta = Σ idA-Deltas;
//                   gf/ga = idA-Team's Score)
//   • lastEncounters — die jüngsten 6 gemeinsamen Matches (Team ∪ Gegner)
//
// Achtung: Cache-Key behält die Reihenfolge (idA + '|' + idB), weil asOppForA
// asymmetrisch ist — h2hDetail(X,Y).asOppForA ≠ h2hDetail(Y,X).asOppForA.
// ════════════════════════════════════════════════════════════════════
function h2hDetail(idA, idB){
  const key = idA + '|' + idB;
  if(!_cache._h2hDetail) _cache._h2hDetail = {};
  if(_cache._h2hDetail[key]) return _cache._h2hDetail[key];

  const asTeam = {g:0, w:0, gf:0, ga:0, eloDelta:0};
  const asOppForA = {g:0, w:0, gf:0, ga:0, eloDelta:0};
  const encounters = [];

  for(const m of matches){
    const aInA = m.a1===idA || m.a2===idA;
    const bInA = m.a1===idB || m.a2===idB;
    const aInB = m.b1===idA || m.b2===idA;
    const bInB = m.b1===idB || m.b2===idB;

    const dA = (m.deltas||{})[idA] || 0;
    const dB = (m.deltas||{})[idB] || 0;

    if(aInA && bInA){
      // Beide im Team A
      asTeam.g++;
      if(m.winner==='A') asTeam.w++;
      asTeam.gf += m.score_a;
      asTeam.ga += m.score_b;
      asTeam.eloDelta += (dA + dB);
      encounters.push({m, type:'team', wonForA: m.winner==='A'});
    } else if(aInB && bInB){
      // Beide im Team B
      asTeam.g++;
      if(m.winner==='B') asTeam.w++;
      asTeam.gf += m.score_b;
      asTeam.ga += m.score_a;
      asTeam.eloDelta += (dA + dB);
      encounters.push({m, type:'team', wonForA: m.winner==='B'});
    } else if((aInA && bInB) || (aInB && bInA)){
      // Gegeneinander — aus Sicht von idA aggregieren
      asOppForA.g++;
      const aSideWon = aInA ? (m.winner==='A') : (m.winner==='B');
      if(aSideWon) asOppForA.w++;
      asOppForA.gf += aInA ? m.score_a : m.score_b;
      asOppForA.ga += aInA ? m.score_b : m.score_a;
      asOppForA.eloDelta += dA;
      encounters.push({m, type:'opp', wonForA: aSideWon});
    }
  }

  encounters.sort((a,b)=> new Date(b.m.created_at) - new Date(a.m.created_at));

  const result = {
    asTeam,
    asOppForA,
    total: asTeam.g + asOppForA.g,
    lastEncounters: encounters.slice(0, 6)
  };
  _cache._h2hDetail[key] = result;
  return result;
}

// Aggregierte Liste aller Mitspieler-Bilanzen für einen Spieler.
// Pro Mitspieler: Anzahl Team-Matches + Anzahl Gegner-Matches.
// Sortiert nach Gesamt-Häufigkeit, gefiltert ≥ min Spiele.
function playerH2HList(id, minTotal=3){
  if(!_cache._h2hList) _cache._h2hList = {};
  const ckey = id+'|'+minTotal;
  if(_cache._h2hList[ckey]) return _cache._h2hList[ckey];

  const stats = {}; // otherId → {teamG, teamW, oppG, oppW}
  for(const m of matches){
    const ids = [m.a1, m.a2, m.b1, m.b2];
    if(!ids.includes(id)) continue;
    const inA = m.a1===id || m.a2===id;
    const sameTeam = inA ? [m.a1, m.a2] : [m.b1, m.b2];
    const oppTeam  = inA ? [m.b1, m.b2] : [m.a1, m.a2];
    const won = (inA && m.winner==='A') || (!inA && m.winner==='B');

    sameTeam.forEach(other=>{
      if(other===id) return;
      if(!stats[other]) stats[other]={teamG:0,teamW:0,oppG:0,oppW:0};
      stats[other].teamG++;
      if(won) stats[other].teamW++;
    });
    oppTeam.forEach(other=>{
      if(!stats[other]) stats[other]={teamG:0,teamW:0,oppG:0,oppW:0};
      stats[other].oppG++;
      if(won) stats[other].oppW++;
    });
  }
  const pm = pmap();
  const out = Object.entries(stats)
    .filter(([oid, s]) => {
      const p = pm[oid];
      return p && !p.hidden && (s.teamG + s.oppG) >= minTotal;
    })
    .map(([oid, s]) => ({oid, ...s, total: s.teamG + s.oppG}))
    .sort((a,b)=> b.total - a.total);
  _cache._h2hList[ckey] = out;
  return out;
}

function monthlyElo(){
  const now=new Date(), ym=now.getFullYear()+'-'+now.getMonth();
  const pS={},tS={};
  matches.forEach(m=>{ const d=new Date(m.created_at);
    if(d.getFullYear()+'-'+d.getMonth()!==ym)return;
    Object.entries(m.deltas||{}).forEach(([id,v])=>pS[id]=(pS[id]||0)+v);
    const tA=[m.a1,m.a2].sort().join('|'),tB=[m.b1,m.b2].sort().join('|');
    tS[tA]=(tS[tA]||0)+(((m.deltas||{})[m.a1]||0)+((m.deltas||{})[m.a2]||0));
    tS[tB]=(tS[tB]||0)+(((m.deltas||{})[m.b1]||0)+((m.deltas||{})[m.b2]||0));
  });
  return {pS,tS};
}

