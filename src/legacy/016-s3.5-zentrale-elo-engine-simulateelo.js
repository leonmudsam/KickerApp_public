// ╔═══ §3.5 ─── ZENTRALE ELO-ENGINE (simulateElo) ──────────────────────╗
//     Eine kanonische Engine, die aus den DB-Match-Deltas Saison-Elo, History
//     und peakElo rekonstruiert. Wird per Cache (globalSim) abgeschirmt.
// ╚═════════════════════════════════════════════════════════════════════════╝
// Pro Saison isoliert: Bei jedem Monatswechsel werden Elo/Played auf start_elo zurückgesetzt.
// Positions-Tracker bleibt saison-übergreifend. Karriere-Elo = gewichteter Durchschnitt
// der Saison-End-Elos (gewichtet nach Spielanzahl pro Saison).
// ════════════════════════════════════════════════════════════════════════
// ELO-AGGREGATION (DB-First Architektur)
// ════════════════════════════════════════════════════════════════════════
// simulateElo()           → aggregiert m.deltas aus DB (KEINE Slider-Berechnung)
// simulateEloWithSliders()→ berechnet Deltas neu mit aktuellen Slidern
// computeMatchDelta()     → berechnet Delta für EIN Match mit Slidern (Match-Eingabe)
//
// Die DB ist die Wahrheit. simulateEloWithSliders wird nur aufgerufen bei:
//   • Match-Eingabe (für das frische Delta) → via computeMatch
//   • Komplett-Neuberechnung (Settings) → via recalcHistory → persistRecalc
//
// Slider-Änderungen wirken NUR auf neue Matches. Vergangene Saisons bleiben
// stabil, weil sie aus den persistierten m.deltas aggregiert werden.
// ════════════════════════════════════════════════════════════════════════

// ─── §3.5a DB-First Aggregation (default simulateElo) ────────────────
function simulateElo(matchSubset, opts={}){
  const startElo=opts.startElo ?? cfg.start_elo;
  const elo={}, played={}, playedSeason={}, wins={}, losses={}, curStreak={}, bestStreak={};
  const eloGain={}, eloLoss={}, gd={};
  const peakElo={};
  const teamElo={};
  const seasonTeamElo={};
  const history=[];
  const posTracker={};
  players.forEach(p=>{
    elo[p.id]=startElo;played[p.id]=0;playedSeason[p.id]=0;
    wins[p.id]=0;losses[p.id]=0;curStreak[p.id]=0;bestStreak[p.id]=0;
    eloGain[p.id]=0;eloLoss[p.id]=0;gd[p.id]=0;peakElo[p.id]=startElo;
    posTracker[p.id]={aG:0,aW:0,dG:0,dW:0,aPerf:0,dPerf:0};
  });

  // Initial-State (für inkrementelle Sim)
  let _curSeason=null;
  if(opts.initialState){
    const s=opts.initialState;
    Object.assign(elo, s.elo||{});
    Object.assign(played, s.played||{});
    Object.assign(playedSeason, s.playedSeason||{});
    Object.assign(wins, s.wins||{});
    Object.assign(losses, s.losses||{});
    Object.assign(curStreak, s.curStreak||{});
    Object.assign(bestStreak, s.bestStreak||{});
    Object.assign(eloGain, s.eloGain||{});
    Object.assign(eloLoss, s.eloLoss||{});
    Object.assign(gd, s.gd||{});
    Object.assign(peakElo, s.peakElo||{});
    if(s.posTracker){
      Object.keys(s.posTracker).forEach(id=>{ posTracker[id]={...s.posTracker[id]}; });
    }
    _curSeason=opts.initialCurSeason||null;
  }

  const ordered=[...matchSubset].sort((a,b)=>mts(a)-mts(b));

  const seasonEndElos={};
  const seasonPlayed={};
  const resetSeason=()=>{ players.forEach(p=>{elo[p.id]=startElo;playedSeason[p.id]=0;}); };

  ordered.forEach(m=>{
    const mSeason=seasonOf(m.created_at).id;
    if(_curSeason && _curSeason!==mSeason){
      // Snapshot der abgelaufenen Saison
      seasonEndElos[_curSeason]={};
      seasonPlayed[_curSeason]={};
      players.forEach(p=>{
        if((playedSeason[p.id]||0)>0){
          seasonEndElos[_curSeason][p.id]=elo[p.id];
          seasonPlayed[_curSeason][p.id]=playedSeason[p.id];
        }
      });
      resetSeason();
    }
    _curSeason=mSeason;

    const ids=[m.a1,m.a2,m.b1,m.b2];
    if(ids.some(id=>elo[id]===undefined)){
      history.push({matchId:m.id,eloBefore:{},eloAfter:{},deltas:{},expA:0.5,breakdowns:{}});
      return;
    }

    const eloBefore={}; ids.forEach(id=>eloBefore[id]=elo[id]);

    // ★ DB-First: Deltas aus DB lesen, NICHT mit Slidern berechnen
    const dbDeltas=m.deltas||{};
    const expA=m.exp_a ?? 0.5;
    const res={};
    ids.forEach(id=>{ res[id]=dbDeltas[id]||0; });

    const aWon=m.winner==='A';

    // Apply (gleiche Aggregation wie vorher)
    ids.forEach(id=>{
      const d=res[id];
      elo[id]+=d; played[id]++; playedSeason[id]++;
      if(d>=0) eloGain[id]=(eloGain[id]||0)+d;
      else     eloLoss[id]=(eloLoss[id]||0)+d;
      if(elo[id] > (peakElo[id] ?? startElo)) peakElo[id]=elo[id];
    });

    ids.forEach(id=>{
      const onA=(id===m.a1||id===m.a2);
      const won=(onA&&aWon)||(!onA&&!aWon);
      const gf=onA?m.score_a:m.score_b, ga=onA?m.score_b:m.score_a;
      gd[id]=(gd[id]||0)+(gf-ga);
      if(won){wins[id]++; curStreak[id]=curStreak[id]>0?curStreak[id]+1:1;}
      else{losses[id]++; curStreak[id]=curStreak[id]<0?curStreak[id]-1:-1;}
      if(curStreak[id]>bestStreak[id]) bestStreak[id]=curStreak[id];
    });

    // Team-Elo
    const winnerIds=aWon?[m.a1,m.a2]:[m.b1,m.b2];
    const loserIds =aWon?[m.b1,m.b2]:[m.a1,m.a2];
    const wKey=winnerIds.slice().sort().join('|'), lKey=loserIds.slice().sort().join('|');
    const wDelta=winnerIds.reduce((s,id)=>s+(res[id]||0),0);
    const lDelta=loserIds.reduce((s,id)=>s+(res[id]||0),0);
    teamElo[wKey]=(teamElo[wKey]||0)+wDelta;
    teamElo[lKey]=(teamElo[lKey]||0)+lDelta;
    if(!seasonTeamElo[mSeason]) seasonTeamElo[mSeason]={};
    seasonTeamElo[mSeason][wKey]=(seasonTeamElo[mSeason][wKey]||0)+wDelta;
    seasonTeamElo[mSeason][lKey]=(seasonTeamElo[mSeason][lKey]||0)+lDelta;

    history.push({matchId:m.id,eloBefore,eloAfter:{...elo},deltas:res,expA,breakdowns:{}});

    // Position-Tracker
    [[m.a1,m.a1_pos,aWon,expA],[m.a2,m.a2_pos,aWon,expA],
     [m.b1,m.b1_pos,!aWon,1-expA],[m.b2,m.b2_pos,!aWon,1-expA]]
    .forEach(([id,pos,won,myExp])=>{
      const t=posTracker[id]; if(!t) return;
      const perf=(won?1:0)-myExp;
      if(pos==='atk'){t.aG++; if(won)t.aW++; t.aPerf+=perf;}
      else           {t.dG++; if(won)t.dW++; t.dPerf+=perf;}
    });
  });

  // Letzten Saison-Snapshot + ggf. Reset auf Kalender-Saison
  if(_curSeason){
    seasonEndElos[_curSeason]={};
    seasonPlayed[_curSeason]={};
    players.forEach(p=>{
      if((playedSeason[p.id]||0)>0){
        seasonEndElos[_curSeason][p.id]=elo[p.id];
        seasonPlayed[_curSeason][p.id]=playedSeason[p.id];
      }
    });
    try {
      const currentCalSeason=currentSeason().id;
      if(currentCalSeason !== _curSeason){
        resetSeason();
        _curSeason=currentCalSeason;
      }
    } catch(e){}
  }

  // Karriere-Elo
  const careerElo={};
  players.forEach(p=>{
    let sumElo=0, sumGames=0;
    Object.keys(seasonEndElos).forEach(sid=>{
      if(seasonEndElos[sid][p.id]!==undefined){
        const g=seasonPlayed[sid][p.id]||0;
        sumElo+=seasonEndElos[sid][p.id]*g;
        sumGames+=g;
      }
    });
    careerElo[p.id]=sumGames>0?sumElo/sumGames:null;
  });

  return {elo,played,playedSeason,wins,losses,curStreak,bestStreak,eloGain,eloLoss,gd,
          teamElo,seasonTeamElo,history,seasonEndElos,seasonPlayed,careerElo,
          posTracker,peakElo,curSeason:_curSeason};
}

// ─── §3.6 Slider-basierte Berechnung (für Match-Eingabe + Recalc) ────
function simulateEloWithSliders(matchSubset, opts={}){
  const startElo=opts.startElo ?? cfg.start_elo;
  const elo={}, played={}, playedSeason={}, wins={}, losses={}, curStreak={}, bestStreak={};
  const eloGain={}, eloLoss={}, gd={};
  const peakElo={}; // saison-übergreifender Allzeit-Höchst-Elo pro Spieler
  const teamElo={};
  const seasonTeamElo={}; // seasonId → {teamKey → cumulative Elo-Zuwachs in dieser Saison}
  const history=[];
  players.forEach(p=>{elo[p.id]=startElo;played[p.id]=0;playedSeason[p.id]=0;wins[p.id]=0;losses[p.id]=0;curStreak[p.id]=0;bestStreak[p.id]=0;eloGain[p.id]=0;eloLoss[p.id]=0;gd[p.id]=0;peakElo[p.id]=startElo;});
  // Inkrementeller Positions-Tracker (ersetzt atkStrengthFrom(id, prior))
  const posTracker={};
  players.forEach(p=>{posTracker[p.id]={aG:0,aW:0,dG:0,dW:0,aPerf:0,dPerf:0};});

  // Optional: initialer State (für schnelle Vorschau eines einzelnen Hypo-Matches)
  // Erwartet ein Objekt mit den gleichen Keys wie der Return-Value von simulateElo.
  // Achtung: opts.initialCurSeason wird benötigt damit der Saison-Reset korrekt greift.
  let _curSeason=null;
  if(opts.initialState){
    const s=opts.initialState;
    Object.assign(elo, s.elo||{});
    Object.assign(played, s.played||{});
    Object.assign(playedSeason, s.playedSeason||{});
    Object.assign(wins, s.wins||{});
    Object.assign(losses, s.losses||{});
    Object.assign(curStreak, s.curStreak||{});
    Object.assign(bestStreak, s.bestStreak||{});
    Object.assign(eloGain, s.eloGain||{});
    Object.assign(eloLoss, s.eloLoss||{});
    Object.assign(gd, s.gd||{});
    Object.assign(peakElo, s.peakElo||{});
    // posTracker ist ein nested object → tief kopieren
    if(s.posTracker){
      Object.keys(s.posTracker).forEach(id=>{
        posTracker[id]={...s.posTracker[id]};
      });
    }
    _curSeason=opts.initialCurSeason||null;
  }
  const atkFromTracker=(id)=>{
    const t=posTracker[id]||{aG:0,aW:0,dG:0,dW:0,aPerf:0,dPerf:0};
    const total=t.aG+t.dG;
    const minG = _posMinGames();
    const aOk=t.aG>=minG, dOk=t.dG>=minG;
    if(!aOk&&!dOk) return 0.5;
    let perfAtk;
    if(aOk&&dOk){
      const diff=(t.aPerf-t.dPerf)/total;
      perfAtk=0.5+diff*0.5;
    } else if(aOk){
      perfAtk=0.5+(t.aPerf/t.aG)*0.3;
    } else {
      perfAtk=0.5-(t.dPerf/t.dG)*0.3;
    }
    const expAtk=total>0?t.aG/total:0.5;
    const ew = _expWeight();
    return Math.max(0.1,Math.min(0.9,(1-ew)*perfAtk+ew*expAtk));
  };

  const ordered=[...matchSubset].sort((a,b)=>mts(a)-mts(b));
  const localExp=(a,b)=>1/(1+Math.pow(10,(b-a)/400));
  const localDynK=(id)=>{const g=playedSeason[id]||0,e=elo[id];
    if(g<5)return cfg.k_factor*(cfg.new_player_mult ?? 1.5);
    if(g<15)return cfg.k_factor*(cfg.new_player_mid_mult ?? 1.2);
    if(e>cfg.start_elo+400)return cfg.k_factor*(cfg.veteran_damp ?? 0.85);
    return cfg.k_factor;};

  // Saison-Reset Tracking: bei jedem Monatswechsel werden Elo/Played zurückgesetzt
  // Positions-Tracker bleibt erhalten (saison-übergreifend gewollt).
  // Per-Saison Snapshots: Karriere-Elo = Durchschnitt der End-Elos pro Saison
  const seasonEndElos={}; // seasonId → {playerId → endElo}
  const seasonPlayed={};  // seasonId → {playerId → games}
  const resetSeason=()=>{
    players.forEach(p=>{elo[p.id]=startElo;playedSeason[p.id]=0;});
  };

  ordered.forEach((m)=>{
    const mSeason=seasonOf(m.created_at).id;
    if(_curSeason && _curSeason!==mSeason){
      // Snapshot der abgelaufenen Saison
      seasonEndElos[_curSeason]={};
      seasonPlayed[_curSeason]={};
      players.forEach(p=>{
        if((playedSeason[p.id]||0)>0){
          seasonEndElos[_curSeason][p.id]=elo[p.id];
          seasonPlayed[_curSeason][p.id]=playedSeason[p.id];
        }
      });
      resetSeason();
    }
    _curSeason=mSeason;
    const ids=[m.a1,m.a2,m.b1,m.b2];
    if(ids.some(id=>elo[id]===undefined)){
      history.push({matchId:m.id,eloBefore:{},eloAfter:{},deltas:{},expA:0.5,breakdowns:{}});
      return;
    }
    const eloBefore={};ids.forEach(id=>eloBefore[id]=elo[id]);
    const teamA=[{id:m.a1,pos:m.a1_pos},{id:m.a2,pos:m.a2_pos}];
    const teamB=[{id:m.b1,pos:m.b1_pos},{id:m.b2,pos:m.b2_pos}];
    const aAvg=(elo[m.a1]+elo[m.a2])/2,bAvg=(elo[m.b1]+elo[m.b2])/2;
    const expA=localExp(aAvg,bAvg);
    const rawMov=movMult(m.score_a,m.score_b);
    const res={}, breakdowns={};

    // Durchschnittliche Spielanzahl aller 4 Spieler (für Underdog-Berechnung)
    const avgGames=ids.reduce((s,id)=>s+(playedSeason[id]||0),0)/4;
    const avgElo=ids.reduce((s,id)=>s+elo[id],0)/4;
    // Match-Ø-K: alle 4 Spieler eines Matches teilen denselben K-Faktor (Mittelwert
    // ihrer individuellen dyn. K-Werte). Innerhalb eines Matches gilt damit dieselbe
    // Bewegungs-Skala für alle — keine 18-vs-35-Diskrepanz mehr zwischen Teamkollegen.
    const matchK=ids.reduce((s,id)=>s+localDynK(id),0)/4;

    const applyTeam=(team,opp,won,exp)=>{
  const e0=elo[team[0].id],e1=elo[team[1].id];
  const high=e0>=e1?team[0]:team[1];
  const w=riskWeights(Math.max(e0,e1),Math.min(e0,e1),cfg.risk_split);
  const oppAvg=(elo[opp[0].id]+elo[opp[1].id])/2;
  const teamDeltas=[]; // Temporärer Array für alle Deltas dieses Teams
  
  team.forEach(slot=>{
    const bd={playerId:slot.id,won,startElo:elo[slot.id]};
    const k=matchK; bd.kFactor=k;
    bd.expected=exp;
    const rawBase=k*((won?1:0)-exp); bd.rawBase=rawBase;

    // MoV
    const mov=won?rawMov:(1+(rawMov-1)*(cfg.mov_loss_damp||0.5));
    bd.movMult=mov; bd.movEffect=rawBase*mov-rawBase;

    // Win-Boost
    const boost=won?(cfg.win_boost||1.12):1.0;
    bd.winBoost=boost; bd.winBoostEffect=rawBase*mov*boost-rawBase*mov;

    // Erfahrungs-Schutz
    const g=playedSeason[slot.id]||0;
    const protectShare=Math.max(0,Math.min(1,(g-5)/25));
    const protectMax = cfg.exp_protect_max ?? 0.1;
    const expProtect=won?1:(1-protectMax*protectShare);
    bd.expProtect=expProtect; bd.expProtectEffect=won?0:rawBase*mov*boost*expProtect-rawBase*mov*boost;

    // Underdog-Boost
    const myElo=elo[slot.id];
    const eloDiff=oppAvg-myElo;
    const gamesDiff=avgGames-(playedSeason[slot.id]||0);
    const eloMax = cfg.underdog_elo_max ?? 0.15;
    const gamesMax = cfg.underdog_games_max ?? 0.05;
    // Jede Komponente einzeln auf >=0 begrenzt: der Bonus belohnt nur, die Faktoren
    // bestrafen sich nicht gegenseitig. Ein Veteran mit Elo-Rückstand bekommt den
    // Elo-Boost trotz vieler Spiele; ein Neuling mit hohem Elo bekommt den
    // Spiele-Boost trotz Top-Elo. Niemand wird durch eine zweite Komponente bestraft.
    const eloFactor=Math.max(0, Math.tanh(eloDiff/400)*eloMax);
    const gamesFactor=Math.max(0, Math.tanh(gamesDiff/30)*gamesMax);
    const underdogRaw=eloFactor+gamesFactor;
    // Favoriten-Malus entfernt: nur Underdog-Boost (Sieg als Schwächerer) wirkt.
    // Favoriten/Veteranen, die verlieren, nehmen den vollen Elo-Hit.
    const underdogMult=(won&&underdogRaw>0)?1+underdogRaw:1;
    bd.underdogMult=underdogMult;
    bd.underdogEloDiff=Math.round(eloDiff);
    bd.underdogGamesDiff=Math.round(gamesDiff);

    // ── Low-Elo Verlustschutz ──
    // Spieler unter dem Match-Durchschnitts-Elo werden bei Niederlagen gedämpft.
    // Symmetrisch zum Underdog-Boost (gleiche tanh-Skala auf 200 Elo), wirkt aber
    // nur bei Niederlagen. Slider 0..1 bestimmt die maximale Dämpfung.
    // Beispiel (Slider=70%, Spieler 80 Elo unter Match-Avg): tanh(80/200)≈0.38,
    //   Dämpfung = 1 - 0.7*0.38 = 0.733 → Verlust auf 73% reduziert.
    const lowEloMax = cfg.low_elo_loss_damp ?? 0;
    const eloBelowAvg = Math.max(0, avgElo - myElo);
    const lowEloShare = Math.tanh(eloBelowAvg/200);
    const lowEloDamp = won ? 1 : (1 - lowEloMax*lowEloShare);
    bd.lowEloDamp=lowEloDamp; bd.lowEloShare=lowEloShare;
    bd.lowEloEffect=won?0:rawBase*mov*boost*expProtect*underdogMult*lowEloDamp - rawBase*mov*boost*expProtect*underdogMult;

    const afterMods=rawBase*mov*boost*expProtect*underdogMult*lowEloDamp;
    bd.afterMods=afterMods;

    // Risiko-Split
    const share=slot.id===high.id?w.strong:w.weak;
    bd.riskShare=share; bd.riskEffect=afterMods*share-afterMods;

    // Positions-Bonus
    const a=atkFromTracker(slot.id);
    const ps=slot.pos==='atk'?a:(1-a);
    const pf=posFactor(ps,cfg.pos_swing);
    const posMult=won?pf:(2-pf);
    bd.posStrength=a; bd.posMult=posMult; bd.posEffect=afterMods*share*posMult-afterMods*share;

    // Match-Bonus
    const mb=cfg.match_bonus||1.5;
    bd.matchBonus=mb;

    // Finale Delta (NICHT GERUNDET)
    const finalDelta=afterMods*share*posMult+mb;
    bd.finalDelta=finalDelta;
    bd.endElo=elo[slot.id]+finalDelta;

    teamDeltas.push({slot, delta: finalDelta, bd});
  });
  
  // ═══ RUNDUNGS-KORREKTUR ═══
  // Runde beide Deltas einzeln, dann korrigiere die Summe
  let totalDelta = 0;
  teamDeltas.forEach(item => {
    const rounded = Math.round(item.delta);
    res[item.slot.id] = rounded;
    breakdowns[item.slot.id] = item.bd;
    totalDelta += rounded;
  });
};

    const aWon=m.winner==='A';
    applyTeam(teamA,teamB,aWon,expA);
    applyTeam(teamB,teamA,!aWon,1-expA);

    // Apply
    Object.entries(res).forEach(([id,d])=>{
      elo[id]+=d;played[id]++;playedSeason[id]++;
      if(d>=0)eloGain[id]=(eloGain[id]||0)+d; else eloLoss[id]=(eloLoss[id]||0)+d;
      // Peak Elo: höchster je erreichter Saison-Elo (überlebt Saison-Resets)
      if(elo[id] > (peakElo[id] ?? startElo)) peakElo[id]=elo[id];
    });
    ids.forEach(id=>{
      const onA=(id===m.a1||id===m.a2);
      const won=(onA&&aWon)||(!onA&&!aWon);
      const gf=onA?m.score_a:m.score_b, ga=onA?m.score_b:m.score_a;
      gd[id]=(gd[id]||0)+(gf-ga);
      if(won){wins[id]++;curStreak[id]=curStreak[id]>0?curStreak[id]+1:1;}
      else{losses[id]++;curStreak[id]=curStreak[id]<0?curStreak[id]-1:-1;}
      if(curStreak[id]>bestStreak[id])bestStreak[id]=curStreak[id];
    });

    // Team-Elo tracking (global + pro Saison)
    const winnerIds=aWon?[m.a1,m.a2]:[m.b1,m.b2];
    const loserIds=aWon?[m.b1,m.b2]:[m.a1,m.a2];
    const wKey=winnerIds.sort().join('|'),lKey=loserIds.sort().join('|');
    const wDelta=winnerIds.reduce((s,id)=>s+(res[id]||0),0);
    const lDelta=loserIds.reduce((s,id)=>s+(res[id]||0),0);
    teamElo[wKey]=(teamElo[wKey]||0)+wDelta;
    teamElo[lKey]=(teamElo[lKey]||0)+lDelta;
    // Pro Saison
    if(!seasonTeamElo[mSeason])seasonTeamElo[mSeason]={};
    seasonTeamElo[mSeason][wKey]=(seasonTeamElo[mSeason][wKey]||0)+wDelta;
    seasonTeamElo[mSeason][lKey]=(seasonTeamElo[mSeason][lKey]||0)+lDelta;

    history.push({matchId:m.id,eloBefore,eloAfter:{...elo},deltas:res,expA,breakdowns});
    // Positions-Tracker inkrementell updaten
    [[m.a1,m.a1_pos,aWon,expA],[m.a2,m.a2_pos,aWon,expA],
     [m.b1,m.b1_pos,!aWon,1-expA],[m.b2,m.b2_pos,!aWon,1-expA]]
    .forEach(([id,pos,won,myExp])=>{
      const t=posTracker[id]; if(!t) return;
      const perf=(won?1:0)-myExp;
      if(pos==='atk'){t.aG++;if(won)t.aW++;t.aPerf+=perf;}
      else{t.dG++;if(won)t.dW++;t.dPerf+=perf;}
    });
  });

  // Letzten Saison-Snapshot festhalten
  if(_curSeason){
    seasonEndElos[_curSeason]={};
    seasonPlayed[_curSeason]={};
    players.forEach(p=>{
      if((playedSeason[p.id]||0)>0){
        seasonEndElos[_curSeason][p.id]=elo[p.id];
        seasonPlayed[_curSeason][p.id]=playedSeason[p.id];
      }
    });

    // Falls die aktuelle Kalender-Saison NACH der letzten Match-Saison liegt
    // (z.B. neuer Monat ohne Matches), Elo zurücksetzen — sonst zeigt die UI
    // noch die Werte vom Vormonat.
    try {
      const currentCalSeason = currentSeason().id;
      if(currentCalSeason !== _curSeason){
        resetSeason();
        _curSeason = currentCalSeason;
      }
    } catch(e){}
  }
  // Karriere-Elo: gewichteter Durchschnitt der End-Elos, gewichtet nach Spielanzahl pro Saison.
  // So zählt eine Saison mit 30 Spielen 30× stärker als eine mit 1 Spiel.
  const careerElo={};
  players.forEach(p=>{
    let sumElo=0, sumGames=0;
    Object.keys(seasonEndElos).forEach(sid=>{
      if(seasonEndElos[sid][p.id]!==undefined){
        const g=seasonPlayed[sid][p.id]||0;
        sumElo+=seasonEndElos[sid][p.id]*g;
        sumGames+=g;
      }
    });
    careerElo[p.id]=sumGames>0?sumElo/sumGames:null;
  });
  return {elo,played,playedSeason,wins,losses,curStreak,bestStreak,eloGain,eloLoss,gd,teamElo,seasonTeamElo,history,seasonEndElos,seasonPlayed,careerElo,posTracker,peakElo,curSeason:_curSeason};
}

// recalcHistory nutzt simulateEloWithSliders — berechnet ALLE Deltas mit aktuellen
// Slidern neu. Wird nur bei "Komplett neu berechnen" aufgerufen.
function recalcHistory(matchList){
  const sim=simulateEloWithSliders(matchList);
  return {playerElos:sim.elo, matchPatches:sim.history.map(h=>({id:h.matchId,deltas:h.deltas,exp_a:h.expA}))};
}

// Berechnet Breakdown für ein einzelnes Match (für Match-Detail Anzeige)
function matchBreakdown(matchId){
  // DB-First: Breakdowns sind nicht persistiert. Bei Bedarf berechnen wir sie
  // on-demand mit den AKTUELLEN Slidern für die Visualisierung. Das tatsächliche
  // Match-Delta in der DB kann von der Slider-Berechnung abweichen wenn der User
  // die Slider seit Match-Eingabe geändert hat. Die Delta-Anzeige im UI nutzt
  // deshalb immer den DB-Wert, nur die analytischen Komponenten sind Slider-basiert.
  const key='breakdownSim_'+matches.length+'_'+_cache.version;
  if(_cache._breakdownSimKey !== key){
    const sim=simulateEloWithSliders(matches);
    _cache._breakdownSim=new Map();
    sim.history.forEach(h=>_cache._breakdownSim.set(h.matchId, h.breakdowns||{}));
    _cache._breakdownSimKey=key;
  }
  return _cache._breakdownSim.get(matchId) || {};
}

function periodPlayerStats(period){
  const sid=period==='season'?currentSeason().id:'';
  const key='periodStats_'+period+'_'+sid+'_'+matches.length+'_'+_cache.version;
  if(_cache._periodStatsKey===key) return _cache._periodStatsData;
  // EINE Wahrheit: alle Werte aus globalSim ableiten. Vorher gab es einen separaten
  // Sim für die Periode mit LEEREM Positions-Tracker → andere posBonus-Multiplikatoren
  // → andere Deltas → Anzeige "+X -Y" passte nicht zu "Elo" und Wochen-Werte
  // wichen vom Saison-Tab ab.
  const ms=[...matchesInPeriod(period)].sort((a,b)=>mts(a)-mts(b));
  // Gecachter History-Lookup (Map) statt ad-hoc Object-Aufbau pro Aufruf
  const histById=getHistoryByMatchId();
  // Akkumulatoren initialisieren (nur für Spieler die in der Periode gespielt haben)
  const stats={};
  const ensure=(id)=>{
    if(!stats[id]) stats[id]={wins:0,losses:0,games:0,eloGain:0,eloLoss:0,gd:0,curStreak:0};
    return stats[id];
  };
  ms.forEach(m=>{
    const h=histById.get(m.id);
    const deltas=h&&h.deltas?h.deltas:{};
    // Wenn das Match keine Deltas hat (z.B. weil ein Spieler unbekannt ist und die
    // Sim-Engine es übersprungen hat), zählt es auch nicht als gespieltes Match —
    // konsistent mit dem Vorgänger-Code (simulateElo überspringt solche Matches).
    if(!Object.keys(deltas).length) return;
    const aWon=m.winner==='A';
    [m.a1,m.a2,m.b1,m.b2].forEach(id=>{
      const s=ensure(id);
      const d=deltas[id]||0;
      s.games++;
      if(d>=0) s.eloGain+=d; else s.eloLoss+=d;
      const onA=(id===m.a1||id===m.a2);
      const won=(onA&&aWon)||(!onA&&!aWon);
      const gf=onA?m.score_a:m.score_b, ga=onA?m.score_b:m.score_a;
      s.gd+=(gf-ga);
      if(won){s.wins++; s.curStreak=s.curStreak>0?s.curStreak+1:1;}
      else  {s.losses++; s.curStreak=s.curStreak<0?s.curStreak-1:-1;}
    });
  });
  const hidden=new Set(players.filter(p=>p.hidden).map(p=>p.id));
  // Für 'season': absoluter Elo-Stand aus globalSim (deckt sich mit Profil & Recap).
  // Für 'week'/'all': eloNet = Summe der Deltas in der Periode (Net = Gain + Loss).
  const gSim=getGlobalSim();
  const result=Object.keys(stats).filter(id=>stats[id].games>0&&!hidden.has(id)).map(id=>{
    const s=stats[id];
    const net=s.eloGain+s.eloLoss; // eloLoss ist negativ
    const absElo=gSim.elo[id]!==undefined?gSim.elo[id]:cfg.start_elo;
    return {
      id, wins:s.wins, losses:s.losses, games:s.games,
      elo: Math.round(absElo), // Immer die aktuelle Saison-Elo anzeigen
      eloNet: Math.round(net),
      eloGain: Math.round(s.eloGain),
      eloLoss: Math.round(s.eloLoss),
      gd: s.gd,
      curStreak: s.curStreak
    };
  });
  _cache._periodStatsKey=key;
  _cache._periodStatsData=result;
  return result;
}

