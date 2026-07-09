// ╔═══ §5.3 ─── VIEW: AWARDS ───────────────────────────────────────────╗
//     ⚑ HOTSPOT — neue Awards benötigen Updates an mehreren Stellen.
//     Siehe Maintenance-Block oben für die volle Checkliste.
//
//     Reihenfolge in dieser Sektion:
//       1. AWARD_META       — Titel, Klasse (Farbe), Erklärung
//       2. AW_IC (1/3)      — Award-ID -> Icon-Name (gespiegelt in §8.3, §8.4)
//       3. vAwards()        — baut Awards-Tab mit Story-Cards
// ╚═════════════════════════════════════════════════════════════════════════╝
// Cache-Wrapper für awardRankings
function awardRankings(period){return getCachedAwardRankings(period);}
function _awardRankingsUncached(period){
  let ms;
  if(period==='all') ms = matches;
  else if(period==='season') ms = matchesInSeason(awSeasonId||currentSeason().id);
  else if(period==='week' && awWeekStart){
    const start=new Date(awWeekStart); start.setHours(0,0,0,0);
    const end=new Date(start); end.setDate(end.getDate()+7);
    ms = matches.filter(m=>{
      const d=new Date(m.created_at);
      return d>=start && d<end;
    });
  } else ms = matchesInPeriod(period);
  
  // ═══ ALLE AGGREGATOREN IN EINEM OBJEKT ═══
  const agg = {
    pElo:{}, pWins:{}, pGoals:{}, pConceded:{}, pGames:{},
    tElo:{}, tWins:{}, tGames:{}, tGoalsFor:{}, tGoalsAgainst:{},
    atkGoals:{}, atkGoalGames:{}, defConceded:{}, defGames_:{},
    single:[], team:[], upsets:[], biggest:[],
    clutch:{}, iceWins:{}, snapMap:null,
    // ── NEUE AWARDS v3 ──
    underdogWins:{},  // playerId → Anzahl Underdog-Siege (myExp < 0.35 & gewonnen)
    closeLosses:{},   // playerId → Anzahl knapper Niederlagen (verloren & |Diff| ≤ 2)
    // ── NEUE NEGATIV-AWARDS v6 ──
    favLosses:{},     // playerId → Anzahl Niederlagen in Favoriten-Rolle (myExp ≥ 0.65 & verloren)
    favMatches:{},    // playerId → Anzahl Spiele in Favoriten-Rolle (myExp ≥ 0.65)
    // ── NEUE TEAM-AWARDS v4 ──
    tCloseWins:{},      // teamKey → Anzahl 1-Tor-Siege (Glückspilze, Zähler)
    tGiantSlayer:{},    // teamKey → Anzahl Siege gegen stärkeres Team (Giant Slayer, Zähler)
    tFavoriteMatches:{},// teamKey → Anzahl Matches in denen das Team Underdog war (Giant Slayer Nenner)
    tFavoritenschreck:{},// teamKey → {best: maxOvercome, m: match, eloDiff} (höchster gewonnener Upset)
    rivalries:{}        // pairKey "teamA|teamB" sortiert → {idsA, idsB, g, wA, wB, gfA, gfB}
  };
  
  // Snapshot-Map: gecached, wird nur 1× pro Sim-Generation gebaut
  agg.snapMap = getSnapMap();
  
  // ═══ SINGLE-PASS DURCH ALLE MATCHES ═══
  for(let i=0; i<ms.length; i++){
    const m = ms[i];
    const deltas = m.deltas || {};
    const expA = m.exp_a ?? 0.5;
    const we = m.winner==='A' ? expA : (1-expA);
    
    // === ELOS & TEAMS ===
    Object.entries(deltas).forEach(([id,v])=>{
      agg.single.push({v,id,m});
    });
    
    const dA = (deltas[m.a1]||0) + (deltas[m.a2]||0);
    const dB = (deltas[m.b1]||0) + (deltas[m.b2]||0);
    agg.team.push({v:dA,ids:[m.a1,m.a2],m});
    agg.team.push({v:dB,ids:[m.b1,m.b2],m});
    
    // === UPSETS & BIGGEST ===
    agg.upsets.push({sp:1-we,m});
    agg.biggest.push({diff:Math.abs(m.score_a-m.score_b),m});
    
    // === SPIELER-STATS (4er Loop) ===
    const teams = [
      [m.a1,m.a2,m.score_a,m.score_b,m.a1_pos,m.a2_pos,true],
      [m.b1,m.b2,m.score_b,m.score_a,m.b1_pos,m.b2_pos,false]
    ];
    
    for(let t=0; t<2; t++){
      const [p1,p2,gf,ga,pos1,pos2,onA] = teams[t];
      const won = onA ? (m.winner==='A') : (m.winner==='B');
      // ── NEUE AWARDS v3 ──
      // myExp: Wahrscheinlichkeit dieses Teams zu gewinnen (vor dem Match)
      const myExp = onA ? expA : (1 - expA);
      const goalDiff = Math.abs(gf - ga);

      for(let p=0; p<2; p++){
        const id = [p1,p2][p];
        const pos = [pos1,pos2][p];

        if(!agg.pElo[id]) agg.pElo[id]=0;
        if(!agg.pWins[id]) agg.pWins[id]=0;
        if(!agg.pGoals[id]) agg.pGoals[id]=0;
        if(!agg.pConceded[id]) agg.pConceded[id]=0;
        if(!agg.pGames[id]) agg.pGames[id]=0;

        agg.pElo[id] += deltas[id]||0;
        agg.pGames[id]++;
        if(won) agg.pWins[id]++;
        agg.pGoals[id] += gf;
        agg.pConceded[id] += ga;

        // Tor-Awards (Stürmer)
        if(pos==='atk'){
          if(!agg.atkGoals[id]) agg.atkGoals[id]=0;
          if(!agg.atkGoalGames[id]) agg.atkGoalGames[id]=0;
          agg.atkGoals[id] += gf;
          agg.atkGoalGames[id]++;
        }

        // Gegentore (Abwehr)
        if(pos==='def'){
          if(!agg.defConceded[id]) agg.defConceded[id]=0;
          if(!agg.defGames_[id]) agg.defGames_[id]=0;
          agg.defConceded[id] += ga;
          agg.defGames_[id]++;
        }

        // ── NEUE AWARDS v3 ──
        // Underdog-Held: Sieg trotz < 35% Erwartung
        if(won && myExp < 0.35){
          if(!agg.underdogWins[id]) agg.underdogWins[id]=0;
          agg.underdogWins[id]++;
        }
        // Pechvogel: Niederlage mit max. 2 Toren Differenz
        if(!won && goalDiff <= 2){
          if(!agg.closeLosses[id]) agg.closeLosses[id]=0;
          agg.closeLosses[id]++;
        }
        // ── NEUE NEGATIV-AWARDS v6 ──
        // Favoriten-Versager: Anteil Niederlagen, wenn die Sieg-Erwartung ≥ 65 % war.
        // Zählt sowohl Favoritenspiele (Nenner) als auch Niederlagen dort (Zähler).
        if(myExp >= 0.65){
          if(!agg.favMatches[id]) agg.favMatches[id]=0;
          agg.favMatches[id]++;
          if(!won){
            if(!agg.favLosses[id]) agg.favLosses[id]=0;
            agg.favLosses[id]++;
          }
        }
      }
    }
    
    // === TEAM-AGGREGATE ===
    const tA=[m.a1,m.a2].sort().join('|');
    const tB=[m.b1,m.b2].sort().join('|');
    if(!agg.tElo[tA]) agg.tElo[tA]=0;
    if(!agg.tElo[tB]) agg.tElo[tB]=0;
    if(!agg.tWins[tA]) agg.tWins[tA]=0;
    if(!agg.tWins[tB]) agg.tWins[tB]=0;
    if(!agg.tGames[tA]) agg.tGames[tA]=0;
    if(!agg.tGames[tB]) agg.tGames[tB]=0;
    if(!agg.tGoalsFor[tA]) agg.tGoalsFor[tA]=0;
    if(!agg.tGoalsFor[tB]) agg.tGoalsFor[tB]=0;
    if(!agg.tGoalsAgainst[tA]) agg.tGoalsAgainst[tA]=0;
    if(!agg.tGoalsAgainst[tB]) agg.tGoalsAgainst[tB]=0;
    
    agg.tElo[tA] += dA;
    agg.tElo[tB] += dB;
    if(m.winner==='A') agg.tWins[tA]++;
    if(m.winner==='B') agg.tWins[tB]++;
    agg.tGames[tA]++;
    agg.tGames[tB]++;
    agg.tGoalsFor[tA] += m.score_a;
    agg.tGoalsFor[tB] += m.score_b;
    agg.tGoalsAgainst[tA] += m.score_b;
    agg.tGoalsAgainst[tB] += m.score_a;

    // ── NEUE TEAM-AWARDS v4 ──
    const goalDiffM = Math.abs(m.score_a - m.score_b);
    const winnerKey = m.winner==='A' ? tA : tB;
    // Glückspilze: 1-Tor-Sieg pro Team zählen
    if(goalDiffM === 1){
      if(!agg.tCloseWins[winnerKey]) agg.tCloseWins[winnerKey]=0;
      agg.tCloseWins[winnerKey]++;
    }
    // Giant Slayer + Favoritenschreck: brauchen Pre-Match-Team-Elo aus snapMap.
    // snapMap[m.id] enthält eloBefore aller 4 Spieler (saison-isoliert via globalSim).
    // Fehlt der Snap (z.B. hidden Player), wird das Match übersprungen — sicher.
    const snapPre = agg.snapMap[m.id];
    if(snapPre && snapPre[m.a1]!==undefined && snapPre[m.a2]!==undefined
       && snapPre[m.b1]!==undefined && snapPre[m.b2]!==undefined){
      const eloA = snapPre[m.a1] + snapPre[m.a2];
      const eloB = snapPre[m.b1] + snapPre[m.b2];
      const winnerElo = m.winner==='A' ? eloA : eloB;
      const loserElo  = m.winner==='A' ? eloB : eloA;
      const loserKey  = m.winner==='A' ? tB : tA;
      // Underdog-Match-Counter (Nenner für Giant-Slayer-Rate):
      // pro Match das Team mit niedrigerer Pre-Match-Team-Elo zählt — egal ob Sieg
      // oder Niederlage. Bei Elo-Gleichstand zählt KEIN Team (kein Favorit definiert).
      if(eloA !== eloB){
        const underdogKey = eloA < eloB ? tA : tB;
        if(!agg.tFavoriteMatches[underdogKey]) agg.tFavoriteMatches[underdogKey]=0;
        agg.tFavoriteMatches[underdogKey]++;
      }
      // Giant Slayer: Sieger-Team hatte vor dem Spiel weniger Team-Elo
      if(winnerElo < loserElo){
        if(!agg.tGiantSlayer[winnerKey]) agg.tGiantSlayer[winnerKey]=0;
        agg.tGiantSlayer[winnerKey]++;
        // Favoritenschreck: höchster jemals überwundener Elo-Unterschied (pro Team)
        const overcome = loserElo - winnerElo;
        const cur = agg.tFavoritenschreck[winnerKey];
        if(!cur || overcome > cur.eloDiff){
          agg.tFavoritenschreck[winnerKey] = {
            eloDiff: overcome,
            m,
            winnerKey,
            loserKey
          };
        }
      }
    }
    // Erzfeinde: Begegnung Team-A vs Team-B (sortiert als Pair-Key)
    const sortedPair = [tA, tB].sort();
    const pairKey = sortedPair.join('::');
    if(tA !== tB){ // gleiches Team auf beiden Seiten unmöglich, aber defensiv
      if(!agg.rivalries[pairKey]){
        agg.rivalries[pairKey] = {
          idsA: sortedPair[0].split('|'),
          idsB: sortedPair[1].split('|'),
          g:0, wA:0, wB:0, gfA:0, gfB:0
        };
      }
      const r = agg.rivalries[pairKey];
      r.g++;
      // wA/gfA gehören zum SORTIERTEN ersten Team (idsA)
      if(tA === sortedPair[0]){
        r.gfA += m.score_a; r.gfB += m.score_b;
        if(m.winner==='A') r.wA++; else r.wB++;
      } else {
        r.gfA += m.score_b; r.gfB += m.score_a;
        if(m.winner==='B') r.wA++; else r.wB++;
      }
    }
    
    // === ICE-WINS (ZU-NULL) ===
    const defA = m.a1_pos==='def' ? m.a1 : m.a2;
    const defB = m.b1_pos==='def' ? m.b1 : m.b2;
    if(m.winner==='A' && m.score_b===0){
      if(!agg.iceWins[defA]) agg.iceWins[defA]=0;
      agg.iceWins[defA]++;
    }
    if(m.winner==='B' && m.score_a===0){
      if(!agg.iceWins[defB]) agg.iceWins[defB]=0;
      agg.iceWins[defB]++;
    }
    
    // === CLUTCH (KNAPPE SPIELE) ===
    if(Math.abs(m.score_a-m.score_b)<=2){
      [m.a1,m.a2,m.b1,m.b2].forEach(id=>{
        const onA=(id===m.a1||id===m.a2);
        const w=(onA&&m.winner==='A')||(!onA&&m.winner==='B');
        if(!agg.clutch[id]) agg.clutch[id]={g:0,w:0};
        agg.clutch[id].g++;
        if(w) agg.clutch[id].w++;
      });
    }
  }
  
  // ═══ SORTIERUNGEN (nach SINGLE-PASS) ═══
  agg.single.sort((a,b)=>b.v-a.v);
  agg.team.sort((a,b)=>b.v-a.v);
  agg.upsets.sort((a,b)=>b.sp-a.sp);
  agg.biggest.sort((a,b)=>b.diff-a.diff || new Date(b.m.created_at)-new Date(a.m.created_at));
  
  // ═══ ABGELEITETE AWARDS ═══
  const mvt=Object.entries(agg.tElo).map(([k,v])=>({ids:k.split('|'),v,g:agg.tGames[k]||0}))
    .filter(x=>x.g>=2).sort((a,b)=>b.v-a.v);
  
  const scorer=Object.entries(agg.atkGoals).filter(([,v])=>v>0).map(([id,v])=>({id,v,g:agg.atkGoalGames[id],avg:v/agg.atkGoalGames[id]})).filter(x=>x.g>=2).sort((a,b)=>b.avg-a.avg||b.v-a.v);
  const wall=Object.entries(agg.defConceded).filter(([id])=>agg.defGames_[id]!==0).map(([id,v])=>({id,v,g:agg.defGames_[id]||1}))
    .filter(x=>x.g>=2).sort((a,b)=>(a.v/a.g)-(b.v/b.g));
  const iceList=Object.entries(agg.iceWins).map(([id,v])=>({id,v})).sort((a,b)=>b.v-a.v);
  
  const grinder=Object.entries(agg.pGames).map(([id,v])=>({id,v})).sort((a,b)=>b.v-a.v);
  const winsList=Object.entries(agg.pWins).map(([id,v])=>({id,v,g:agg.pGames[id]})).sort((a,b)=>b.v-a.v);
  const perfectMin=Math.min(10, Math.max(5, Math.ceil((grinder[0]?.v||5)*0.15)));
  const perfect=Object.entries(agg.pWins).map(([id,w])=>({id,w,g:agg.pGames[id],wr:agg.pGames[id]?w/agg.pGames[id]:0}))
    .filter(x=>x.g>=perfectMin)
    .sort((a,b)=>b.wr-a.wr||b.g-a.g);
  
  const streaks=longestStreaks(ms);
  
  const worstWr=Object.entries(agg.pWins).map(([id,w])=>({id,w,g:agg.pGames[id],wr:agg.pGames[id]?w/agg.pGames[id]:0}))
    .filter(x=>x.g>=3).sort((a,b)=>a.wr-b.wr||b.g-a.g);
  const worstAtk=Object.entries(agg.atkGoals).map(([id,v])=>({id,v,g:agg.atkGoalGames[id]||1}))
    .filter(x=>x.g>=2).sort((a,b)=>(a.v/a.g)-(b.v/b.g));
  const worstDef=Object.entries(agg.defConceded).map(([id,v])=>({id,v,g:agg.defGames_[id]||1}))
    .filter(x=>x.g>=2).sort((a,b)=>(b.v/b.g)-(a.v/a.g));
  const worstElo=Object.entries(agg.pElo).map(([id,v])=>({id,v})).sort((a,b)=>a.v-b.v);

  // ═══ NEUE AWARDS v3 ═══
  // Plus-Minus: Ø Tor-Saldo pro Spiel (Tore_für − Tore_gegen), min. 10 Spiele.
  // Schwelle 10 ist konsistent mit der Logik der anderen "Durchschnitt"-Awards
  // (perfect: dynamisch zwischen 5-10, scorer: min 2, wall: min 2). Plus-Minus
  // braucht etwas mehr Volumen, weil ein einzelnes 10:0-Spiel den Saldo stark
  // verzerren würde — bei 10+ Spielen ist der Wert robust.
  const plusMinusList = Object.entries(agg.pGames)
    .filter(([id,g]) => g >= 10)
    .map(([id,g]) => ({
      id,
      v: (agg.pGoals[id] - agg.pConceded[id]) / g,  // Saldo pro Spiel
      gf: agg.pGoals[id], ga: agg.pConceded[id], g
    }))
    .sort((a,b) => b.v - a.v);

  // Underdog-Held: Anzahl Underdog-Siege (myExp < 0.35), absoluter Counter,
  // keine Mindestschwelle — wer 1 Underdog-Sieg hat, kommt schon ins Ranking,
  // aber 0-Werte werden rausgefiltert.
  const underdogList = Object.entries(agg.underdogWins)
    .filter(([,v]) => v > 0)
    .map(([id,v]) => ({id,v}))
    .sort((a,b) => b.v - a.v);

  // Pechvogel: Anteil knapper Niederlagen an allen Spielen. Prozentual statt
  // absolut — sonst gewinnen reine Vielspieler durch Volumen, nicht durch
  // tatsächliches Pech. Schwelle: min. 2 knappe Niederlagen UND min. 5 Spiele,
  // damit der Pct-Wert robust ist (bei 2/3 wäre er 67% — wenig aussagekräftig).
  const pechvogelList = Object.entries(agg.closeLosses)
    .filter(([id,v]) => v >= 2 && agg.pGames[id] >= 5)
    .map(([id,v]) => ({
      id,
      v,                              // Anzahl knapper Niederlagen (für Anzeige)
      g: agg.pGames[id],              // Gesamtspiele
      pct: v / agg.pGames[id]         // Sortier-Kriterium
    }))
    .sort((a,b) => b.pct - a.pct);

  // ── NEUE NEGATIV-AWARDS v6 ──
  // Favoriten-Versager: Quote = Niederlagen in Favoriten-Rolle / Favoriten-Spiele.
  // Spiegel zu Underdog-Held (Sieg trotz < 35% Erwartung) — hier: Niederlage trotz
  // ≥ 65% Erwartung. Schwelle: min. 5 Favoriten-Matches für stabile Quote.
  const favoriteLoserList = Object.keys(agg.favMatches)
    .filter(id => agg.favMatches[id] >= 5)
    .map(id => {
      const losses = agg.favLosses[id] || 0;
      const games = agg.favMatches[id];
      return {
        id,
        v: losses / games,              // Sortier-Kriterium (Quote)
        losses, games                   // Zähler/Nenner für Anzeige
      };
    })
    .filter(x => x.losses > 0)          // 0-Werte raus (kein "Versager")
    .sort((a,b) => b.v - a.v);
  
  // ═══ ENDGEGNER ═══
  // Anteil "wir treffen als Gegner aufeinander" an der gemeinsamen Match-Aktivität.
  // Genutzt: g / min(pGames[a], pGames[b]) — der dominantere Anteil (für den
  // Spieler mit weniger Spielen ist die Begegnung relativ wichtiger).
  // Schwellen: min. 3 Begegnungen UND beide Spieler min. 5 Spiele insgesamt.
  const egPairs={};
  for(let i=0; i<ms.length; i++){
    const m=ms[i];
    const ATeam=[m.a1,m.a2], BTeam=[m.b1,m.b2];
    const aWon=m.winner==='A';
    ATeam.forEach(aId=>BTeam.forEach(bId=>{
      const sorted=[aId,bId].sort();
      const k=sorted.join('|');
      if(!egPairs[k]) egPairs[k]={ids:sorted,g:0,w1:0,w2:0};
      egPairs[k].g++;
      const firstWon = (sorted[0]===aId && aWon) || (sorted[0]===bId && !aWon);
      if(firstWon) egPairs[k].w1++; else egPairs[k].w2++;
    }));
  }
  const endgegner=Object.values(egPairs)
    .filter(p => {
      const ga = agg.pGames[p.ids[0]] || 0;
      const gb = agg.pGames[p.ids[1]] || 0;
      return p.g >= 3 && ga >= 5 && gb >= 5;
    })
    .map(p => {
      const ga = agg.pGames[p.ids[0]];
      const gb = agg.pGames[p.ids[1]];
      const denom = Math.min(ga, gb);
      return {
        ...p,
        gA: ga, gB: gb,
        pct: p.g / denom              // Sortier-Wert
      };
    })
    .sort((a,b) => b.pct - a.pct);
  
  // ═══ CLUTCH ═══
  const clutchList=Object.entries(agg.clutch).filter(([,v])=>v.g>=2)
    .map(([id,v])=>({id,wr:v.w/v.g,g:v.g,w:v.w})).sort((a,b)=>b.wr-a.wr||b.g-a.g);
  
  // ═══ CARRY, SOLO, FORMTIEF, etc. ═══
  const carryList=_computeCarry(ms, agg.snapMap);
  const soloList=_computeSolo(ms, agg.snapMap);
  const formtief=_computeFormtief(ms);
  const worstTeam=[...teamStatsFromMatches(ms)].filter(t=>t.g>=2).sort((a,b)=>(a.w/a.g)-(b.w/b.g));
  const bestDuo=[...teamStatsFromMatches(ms)].sort((a,b)=>b.g-a.g);
  const onFire=currentStreaks(ms,true);
  const coldStreak=currentStreaks(ms,false);
  const lossStreaks=longestLossStreaks(ms);
  const zirkusList=_computeZirkus(ms);
  const baustelleList=_computeBarstelle(ms);
  const showmasterList=_computeShowmaster(ms);

  // Peak Elo: höchster je in einer Saison erreichter Elo-Stand. NUR im Gesamt-Modus.
  // Wert überdauert Saison-Resets, ist also der Allzeit-Höchststand pro Spieler.
  let peakEloList=[];
  if(period==='all'){
    const pk = getGlobalSim().peakElo || {};
    const startElo = cfg.start_elo ?? 0;
    peakEloList = Object.entries(pk)
      .map(([id,v])=>({id, v:Math.round(v)}))
      .filter(x => {
        const p = pmap()[x.id];
        if(!p || p.hidden) return false;
        // Nur Spieler die jemals über start_elo lagen
        return x.v > startElo;
      })
      .sort((a,b)=>b.v-a.v);
  }

  // ═══ POTW-/POTD-KÖNIG: kumulierte Player-of-the-Week / Player-of-the-Day Auszeichnungen ═══
  // Beide Funktionen schließen den laufenden Zeitraum automatisch aus und sind identisch
  // mit dem Zähler der POTW-/POTD-Badges → konsistent zwischen Award und Badge.
  // Für period='week' bleibt die Liste leer (Zeitraum = 1 Woche, läuft noch).
  const visiblePlayers = activePlayers();
  const weekKingList = visiblePlayers
    .map(p=>({id:p.id, v:countPeriodWins(p.id, ms, 'week')}))
    .filter(x=>x.v>0)
    .sort((a,b)=>b.v-a.v);
  const dayKingList = visiblePlayers
    .map(p=>({id:p.id, v:countDayWins(p.id, ms)}))
    .filter(x=>x.v>0)
    .sort((a,b)=>b.v-a.v);

  // ════════════════════════════════════════════════════════════════════
  // NEUE TEAM-AWARDS v4 — saison-übergreifend gemäß Anforderung
  // ════════════════════════════════════════════════════════════════════
  // unstoppable    — längste Team-Siegesserie (Sieg-Streak pro Team-Key)
  // concreteWall   — niedrigster Gegentore-Schnitt pro Spiel (min. 10 Sp.)
  // luckyCharm     — meiste 1-Tor-Siege pro Team
  // giantSlayer    — meiste Siege gegen stärkeres Team (Pre-Match-Team-Elo)
  // favoritenschreck — höchster überwundener Team-Elo-Unterschied (Match-Award je Team)
  // rivalryList    — Team-Paar mit den meisten direkten Duellen
  // ════════════════════════════════════════════════════════════════════

  // Unstoppable: chronologisch durchwandern, pro Team-Key cur/best Streak
  const _orderedForStreak = [...ms].sort((a,b)=>mts(a)-mts(b));
  const _tStreak = {}; // teamKey → {cur, best, ids}
  for(let i=0;i<_orderedForStreak.length;i++){
    const m=_orderedForStreak[i];
    const wKey = m.winner==='A' ? [m.a1,m.a2].sort().join('|') : [m.b1,m.b2].sort().join('|');
    const lKey = m.winner==='A' ? [m.b1,m.b2].sort().join('|') : [m.a1,m.a2].sort().join('|');
    if(!_tStreak[wKey]) _tStreak[wKey]={cur:0,best:0,ids:wKey.split('|')};
    if(!_tStreak[lKey]) _tStreak[lKey]={cur:0,best:0,ids:lKey.split('|')};
    _tStreak[wKey].cur++;
    if(_tStreak[wKey].cur>_tStreak[wKey].best) _tStreak[wKey].best=_tStreak[wKey].cur;
    _tStreak[lKey].cur=0;
  }
  const unstoppableList = Object.values(_tStreak)
    .filter(x=>x.best>=2)
    .map(x=>({ids:x.ids, v:x.best}))
    .sort((a,b)=>b.v-a.v);

  // Concrete Wall: Σ Gegentore / Anzahl Team-Spiele, min. 10 Spiele
  const concreteWallList = Object.keys(agg.tGames)
    .filter(k=>agg.tGames[k]>=10)
    .map(k=>({
      ids:k.split('|'),
      v: agg.tGoalsAgainst[k] / agg.tGames[k],   // Sortierwert (niedriger=besser)
      ga: agg.tGoalsAgainst[k],
      g: agg.tGames[k]
    }))
    .sort((a,b)=>a.v-b.v);

  // ── NEUE NEGATIV-AWARDS v6 ──
  // Käseteller: Spiegel zu Concrete Wall — höchster Gegentor-Schnitt als Team.
  // Sortierung ist absteigend (hoch = schlecht), gleiche Schwelle min. 10 Sp.
  const cheesePlatterList = Object.keys(agg.tGames)
    .filter(k=>agg.tGames[k]>=10)
    .map(k=>({
      ids:k.split('|'),
      v: agg.tGoalsAgainst[k] / agg.tGames[k],   // Sortierwert (höher = schlechter)
      ga: agg.tGoalsAgainst[k],
      g: agg.tGames[k]
    }))
    .sort((a,b)=>b.v-a.v);

  // Lucky Charm: Anteil knapper Siege (1 Tor Vorsprung) an gemeinsamen Team-Spielen.
  // Verhindert, dass Vielspieler-Teams durch reine Match-Zahl gewinnen.
  // Schwelle: min. 10 gemeinsame Spiele für stabile Quote.
  const luckyCharmList = Object.keys(agg.tCloseWins)
    .filter(k => (agg.tGames[k]||0) >= 10)
    .map(k => {
      const wins = agg.tCloseWins[k];
      const games = agg.tGames[k];
      return {
        ids: k.split('|'),
        v: wins / games,        // Sortier-Wert: Anteil
        wins, games             // für Anzeige "X/Y"
      };
    })
    .sort((a,b) => b.v - a.v);

  // Giant Slayer: Anteil der gewonnenen Underdog-Spiele an allen Underdog-Spielen
  // (=Spielen, in denen das Team vor Match-Beginn die niedrigere Team-Elo hatte).
  // Sicherstellt, dass die Wertung nicht von Vielspielern dominiert wird.
  // Schwelle: min. 5 Underdog-Matches für stabile Quote.
  const giantSlayerList = Object.keys(agg.tGiantSlayer)
    .filter(k => (agg.tFavoriteMatches[k]||0) >= 5)
    .map(k => {
      const wins = agg.tGiantSlayer[k];
      const games = agg.tFavoriteMatches[k]; // Nenner
      return {
        ids: k.split('|'),
        v: wins / games,        // Sortier-Wert: Quote
        wins, games
      };
    })
    .sort((a,b) => b.v - a.v);

  // Favoritenschreck: pro Team höchsten überwundenen Elo-Unterschied,
  // dann sortiert nach diesem maximalen Wert.
  const favoritenschreckList = Object.entries(agg.tFavoritenschreck)
    .map(([k,info])=>({
      ids:k.split('|'),
      v: Math.round(info.eloDiff),
      m: info.m,
      loserIds: info.loserKey.split('|')
    }))
    .sort((a,b)=>b.v-a.v);

  // Erzfeinde: Team-Paar mit höchstem Anteil "direkte Duelle" an der gemeinsamen
  // Match-Aktivität beider Teams. Genutzt: g / min(tGamesA, tGamesB) — gibt den
  // dominantesten Aspekt der Rivalität wieder (für das Team mit weniger Spielen
  // ist es der größere Anteil).
  // Schwellen: min. 3 direkte Duelle UND beide Teams min. 5 Spiele insgesamt.
  const rivalryList = Object.values(agg.rivalries)
    .filter(r => {
      const gA = agg.tGames[r.idsA.slice().sort().join('|')] || 0;
      const gB = agg.tGames[r.idsB.slice().sort().join('|')] || 0;
      return r.g >= 3 && gA >= 5 && gB >= 5;
    })
    .map(r => {
      const gA = agg.tGames[r.idsA.slice().sort().join('|')];
      const gB = agg.tGames[r.idsB.slice().sort().join('|')];
      const denom = Math.min(gA, gB);
      return {
        idsA: r.idsA,
        idsB: r.idsB,
        ids:  [...r.idsA, ...r.idsB], // für Hidden-Filter
        g: r.g, wA: r.wA, wB: r.wB,
        gfA: r.gfA, gfB: r.gfB,
        gA, gB,                       // Team-Total-Spiele (für Anzeige im Detail)
        pct: r.g / denom              // Sortier-Wert: Quote der Rivalität
      };
    })
    .sort((a,b) => b.pct - a.pct);

  // ════════════════════════════════════════════════════════════════════
  // HIDDEN-FILTER für ALLE Award-Listen (zentral, konsistent)
  // ════════════════════════════════════════════════════════════════════
  // Hidden-Spieler werden aus allen Single- und Team-Listen entfernt.
  // Bei Team-Awards fliegt das Team raus, sobald EIN Mitglied hidden ist.
  // Sortierung bleibt erhalten, ranks/medals werden weiter korrekt vergeben.
  // ════════════════════════════════════════════════════════════════════
  const _pm = pmap();
  const _isHidden = id => { const p = _pm[id]; return !p || p.hidden; };
  const _fSingle = arr => arr.filter(x => !_isHidden(x.id));
  const _fTeam   = arr => arr.filter(x => !x.ids.some(_isHidden));

  return {
    single:_fSingle(agg.single),
    team:_fTeam(agg.team),
    upsets:agg.upsets, biggest:agg.biggest,
    mvt:_fTeam(mvt),
    scorer:_fSingle(scorer), wall:_fSingle(wall),
    grinder:_fSingle(grinder), winsList:_fSingle(winsList),
    perfect:_fSingle(perfect), streaks:_fSingle(streaks),
    worstWr:_fSingle(worstWr), worstAtk:_fSingle(worstAtk),
    worstDef:_fSingle(worstDef), worstElo:_fSingle(worstElo),
    endgegner:_fTeam(endgegner),
    clutchList:_fSingle(clutchList), iceList:_fSingle(iceList),
    worstTeam:_fTeam(worstTeam), bestDuo:_fTeam(bestDuo),
    onFire:_fSingle(onFire), coldStreak:_fSingle(coldStreak),
    carryList:_fSingle(carryList), lossStreaks:_fSingle(lossStreaks),
    soloList:_fSingle(soloList), formtief, // formtief filtert hidden bereits intern
    zirkusList:_fTeam(zirkusList), baustelleList:_fTeam(baustelleList),
    showmasterList:_fSingle(showmasterList),
    peakEloList:_fSingle(peakEloList),
    weekKingList, dayKingList, // weekKingList/dayKingList nutzen activePlayers() bereits
    // ── NEUE AWARDS v3 ──
    plusMinusList:_fSingle(plusMinusList),
    underdogList:_fSingle(underdogList),
    pechvogelList:_fSingle(pechvogelList),
    // ── NEUE NEGATIV-AWARDS v6 ──
    favoriteLoserList:_fSingle(favoriteLoserList),
    cheesePlatterList:_fTeam(cheesePlatterList),
    // ── NEUE TEAM-AWARDS v4 ──
    unstoppableList:_fTeam(unstoppableList),
    concreteWallList:_fTeam(concreteWallList),
    luckyCharmList:_fTeam(luckyCharmList),
    giantSlayerList:_fTeam(giantSlayerList),
    favoritenschreckList:_fTeam(favoritenschreckList),
    rivalryList:_fTeam(rivalryList), // _fTeam prüft x.ids → alle 4 Spieler müssen sichtbar sein
    counts:{matches:ms.length}
  };
}

// ─── §5.3a Award-Hilfsfunktionen (topNames, topTeamNames, _addColl) ──
function _computeCarry(ms, snapMap){
  const result={};
  for(let i=0; i<ms.length; i++){
    const m=ms[i];
    const snap=snapMap[m.id]; if(!snap)continue;
    const allFour=[m.a1,m.a2,m.b1,m.b2];
    if(allFour.some(x=>snap[x]===undefined))continue;
    const weakest=allFour.reduce((a,b)=>(snap[a]??cfg.start_elo)<=(snap[b]??cfg.start_elo)?a:b);
    const aWon=m.winner==='A';
    [[m.a1,m.a2,aWon],[m.b1,m.b2,!aWon]].forEach(([p1,p2,won])=>{
      if(!won)return;
      [p1,p2].forEach(pid=>{
        const mate=pid===p1?p2:p1;
        if(mate===weakest&&weakest!==pid){
          if(!result[pid])result[pid]=0;
          result[pid]++;
        }
      });
    });
  }
  return Object.entries(result).filter(([,v])=>v>0).map(([id,v])=>({id,v})).sort((a,b)=>b.v-a.v);
}

function _computeSolo(ms, snapMap){
  const result={};
  const allActivePlayers=activePlayers();
  for(let i=0; i<ms.length; i++){
    const m=ms[i];
    const snap=snapMap[m.id]; if(!snap)continue;
    const allFour=[m.a1,m.a2,m.b1,m.b2];
    if(allFour.some(x=>snap[x]===undefined))continue;
    const sortedSnap=[...allFour].sort((a,b)=>(snap[a]??cfg.start_elo)-(snap[b]??cfg.start_elo));
    const bottom3=new Set(sortedSnap.slice(0,3).map(p=>p));
    const aWon=m.winner==='A';
    [[m.a1,m.a2,aWon],[m.b1,m.b2,!aWon]].forEach(([p1,p2,won])=>{
      [p1,p2].forEach(pid=>{
        const mate=pid===p1?p2:p1;
        if(bottom3.has(mate)&&!bottom3.has(pid)){
          if(!result[pid])result[pid]={g:0,w:0};
          result[pid].g++;
          if(won)result[pid].w++;
        }
      });
    });
  }
  return Object.entries(result).filter(([,v])=>v.g>=2)
    .map(([id,v])=>({id,wr:v.w/v.g,g:v.g,w:v.w})).sort((a,b)=>b.wr-a.wr||b.g-a.g);
}

function _computeFormtief(ms){
  // ════════════════════════════════════════════════════════════════════
  // FORMTIEF — saison-bewusste Peak-zu-Aktuell-Berechnung
  // ════════════════════════════════════════════════════════════════════
  // Liest die echten eloBefore/eloAfter Werte aus globalSim.history.
  // Diese Werte sind bereits saison-isoliert, weil simulateElo bei jedem
  // Monatswechsel `resetSeason()` auf start_elo durchführt — peak und
  // last werden daher PRO SAISON getrackt, nicht durchgängig kumuliert.
  //
  //   • 'season'      → Drop in der einen Saison (Peak − End)
  //   • 'week'/'day'  → bleibt korrekt auch wenn die Periode einen
  //                     Monatswechsel überspannt (Reset zerstört nicht
  //                     den Peak des Vormonats — beide Saisons werden
  //                     separat ausgewertet, max gewinnt)
  //   • 'all'         → max Saison-Drop über die gesamte Karriere
  //
  // Der initiale Peak einer Saison ist max(eloBefore, eloAfter) des
  // ersten Periode-Matches in jener Saison: ein Spieler kann VOR der
  // Periode in derselben Saison bereits höher gestanden haben — sein
  // Eingangs-Elo zählt als Periodenstart-Peak.
  //
  // Hidden-Spieler werden hier (anders als im alten Code) korrekt
  // herausgefiltert. Schwelle drop > 10 wie zuvor.
  // ════════════════════════════════════════════════════════════════════
  const gSim = getGlobalSim();
  const histById = {};
  (gSim.history||[]).forEach(h => { histById[h.matchId] = h; });
  const pm = pmap();
  const startElo = cfg.start_elo;

  const ordered = [...ms].sort((a,b)=>mts(a)-mts(b));

  // perPlayer[id] = { seasons: { sId: { peak, last } } }
  const perPlayer = {};
  for(let i=0; i<ordered.length; i++){
    const m = ordered[i];
    const h = histById[m.id];
    if(!h || !h.eloAfter) continue;
    const sId = seasonOf(m.created_at).id;
    const ids = [m.a1,m.a2,m.b1,m.b2];
    for(let j=0; j<ids.length; j++){
      const id = ids[j];
      const eloAfter = h.eloAfter[id];
      if(eloAfter === undefined) continue;
      if(!perPlayer[id]) perPlayer[id] = { seasons:{} };
      const slot = perPlayer[id].seasons[sId];
      if(!slot){
        const eloBefore = (h.eloBefore && h.eloBefore[id]!==undefined) ? h.eloBefore[id] : startElo;
        perPlayer[id].seasons[sId] = { peak: Math.max(eloBefore, eloAfter), last: eloAfter };
      } else {
        if(eloAfter > slot.peak) slot.peak = eloAfter;
        slot.last = eloAfter;
      }
    }
  }

  const result = [];
  Object.entries(perPlayer).forEach(([id, data])=>{
    const p = pm[id]; if(!p || p.hidden) return;
    let bestDrop=0, bestPeak=0, bestLast=0;
    Object.values(data.seasons).forEach(s=>{
      const d = s.peak - s.last;
      if(d > bestDrop){ bestDrop=d; bestPeak=s.peak; bestLast=s.last; }
    });
    if(bestDrop > 10){
      result.push({ id, drop: bestDrop, peak: Math.round(bestPeak), cur: Math.round(bestLast) });
    }
  });
  return result.sort((a,b)=>b.drop-a.drop);
}

function _computeZirkus(ms){
  // Zirkus = Anteil hoher Niederlagen (Tordifferenz ≥ 5) an gemeinsamen Team-Spielen.
  // Verhindert Vielspieler-Bias. Schwelle: min. 5 gemeinsame Team-Spiele.
  const zirkus={};      // teamKey → {ids, v: # hohe Niederlagen, g: # Spiele insgesamt}
  const tGames={};      // teamKey → # Spiele insgesamt (lokal, da _computeZirkus
                        //   nicht den globalen agg.tGames sehen kann)
  for(let i=0; i<ms.length; i++){
    const m=ms[i];
    const teamA=[m.a1,m.a2].sort().join('|');
    const teamB=[m.b1,m.b2].sort().join('|');
    tGames[teamA] = (tGames[teamA]||0) + 1;
    tGames[teamB] = (tGames[teamB]||0) + 1;
    const diff=Math.abs(m.score_a-m.score_b);
    if(diff<5) continue;
    const loserTeam=m.winner==='A'?teamB:teamA;
    if(!zirkus[loserTeam]) zirkus[loserTeam]={ids:loserTeam.split('|'), v:0};
    zirkus[loserTeam].v++;
  }
  // Anreichern + Mindestschwelle anwenden
  return Object.values(zirkus)
    .map(z => {
      const key = z.ids.slice().sort().join('|');
      const g = tGames[key] || 0;
      return { ...z, g, pct: g>0 ? z.v / g : 0 };
    })
    .filter(z => z.g >= 5 && z.v >= 1)
    .sort((a,b) => b.pct - a.pct);
}

function _computeBarstelle(ms){
  const teamLossStreaks={};
  const ordered=[...ms].sort((a,b)=>mts(a)-mts(b));
  for(let i=0; i<ordered.length; i++){
    const m=ordered[i];
    const loserKey=m.winner==='A'?[m.b1,m.b2].sort().join('|'):[m.a1,m.a2].sort().join('|');
    const winnerKey=m.winner==='A'?[m.a1,m.a2].sort().join('|'):[m.b1,m.b2].sort().join('|');
    if(!teamLossStreaks[loserKey])teamLossStreaks[loserKey]={cur:0,best:0,ids:loserKey.split('|')};
    teamLossStreaks[loserKey].cur++;
    if(teamLossStreaks[loserKey].cur>teamLossStreaks[loserKey].best)teamLossStreaks[loserKey].best=teamLossStreaks[loserKey].cur;
    if(teamLossStreaks[winnerKey])teamLossStreaks[winnerKey].cur=0;
  }
  return Object.values(teamLossStreaks).filter(x=>x.best>=2).sort((a,b)=>b.best-a.best);
}

function _computeShowmaster(ms){
  const result={};
  for(let i=0; i<ms.length; i++){
    const m=ms[i];
    if(m.score_a===10&&m.score_b===0){[m.a1,m.a2].forEach(id=>{result[id]=(result[id]||0)+1;});}
    if(m.score_b===10&&m.score_a===0){[m.b1,m.b2].forEach(id=>{result[id]=(result[id]||0)+1;});}
  }
  return Object.entries(result).filter(([,v])=>v>=1).map(([id,v])=>({id,v})).sort((a,b)=>b.v-a.v);
}


// Team-Stats aus einer gefilterten Match-Liste
function teamStatsFromMatches(ms){
  const T={};
  ms.forEach(m=>{
    [[m.a1,m.a2,m.winner==='A',m.score_a,m.score_b],[m.b1,m.b2,m.winner==='B',m.score_b,m.score_a]]
    .forEach(([x,y,won,gf,ga])=>{const k=[x,y].sort().join('|');
      if(!T[k])T[k]={ids:[x,y].sort(),g:0,w:0,gf:0,ga:0};
      T[k].g++;if(won)T[k].w++;T[k].gf+=gf;T[k].ga+=ga;});
  });
  return Object.values(T);
}

// Aktuelle (noch laufende) Serie je Spieler
function currentStreaks(ms,forWins){
  const ordered=[...ms].sort((a,b)=>mts(a)-mts(b));
  const cur={};
  ordered.forEach(m=>{
    [m.a1,m.a2,m.b1,m.b2].forEach(id=>{
      const onA=(id===m.a1||id===m.a2);
      const w=(onA&&m.winner==='A')||(!onA&&m.winner==='B');
      if(forWins?w:!w) cur[id]=(cur[id]||0)+1; else cur[id]=0;
    });
  });
  return Object.entries(cur).filter(([,v])=>v>=1).map(([id,v])=>({id,v})).sort((a,b)=>b.v-a.v);
}

// Längste Siegesserie je Spieler innerhalb der (zeitlich sortierten) Match-Liste
function longestStreaks(ms){
  const ordered=[...ms].sort((a,b)=>mts(a)-mts(b));
  const cur={}, best={};
  ordered.forEach(m=>{
    [m.a1,m.a2,m.b1,m.b2].forEach(id=>{
      const onA=(id===m.a1||id===m.a2);
      const won=(onA&&m.winner==='A')||(!onA&&m.winner==='B');
      if(won){cur[id]=(cur[id]||0)+1; if((cur[id])>(best[id]||0))best[id]=cur[id];}
      else cur[id]=0;
    });
  });
  return Object.entries(best).map(([id,v])=>({id,v})).filter(x=>x.v>=2).sort((a,b)=>b.v-a.v);
}

// Längste Niederlagenserie je Spieler (insgesamt, nicht nur aktuell laufend)
function longestLossStreaks(ms){
  const ordered=[...ms].sort((a,b)=>mts(a)-mts(b));
  const cur={}, best={};
  ordered.forEach(m=>{
    [m.a1,m.a2,m.b1,m.b2].forEach(id=>{
      const onA=(id===m.a1||id===m.a2);
      const won=(onA&&m.winner==='A')||(!onA&&m.winner==='B');
      if(!won){cur[id]=(cur[id]||0)+1; if((cur[id])>(best[id]||0))best[id]=cur[id];}
      else cur[id]=0;
    });
  });
  return Object.entries(best).map(([id,v])=>({id,v})).filter(x=>x.v>=2).sort((a,b)=>b.v-a.v);
}

function vAwards(){
  // Beim Tab-Rendern: stale awWeekStart vom POTW-Click zurücksetzen, damit der Awards-Tab
  // immer die aktuelle Woche zeigt (POTW-Detail wird per Sheet überlagert).
  awWeekStart=null;
  // Saison-Picker: Dropdown mit allen verfügbaren Saisons
  const seasons_list=availableSeasons();
  const selSeason=awSeasonId||currentSeason().id;
  const seasonPicker=awPeriod==='season'?`
    <div style="margin-bottom:14px">
      <select id="awSeasonPicker" style="width:100%;padding:10px 14px;border-radius:var(--r-sm);
        border:1px solid var(--line);background:var(--surface);color:var(--ink);font-family:inherit;font-size:14px">
        ${seasons_list.map(sid=>`<option value="${sid}" ${sid===selSeason?'selected':''}>${seasonLabel(sid)}${sid===currentSeason().id?' (aktuell)':''}</option>`).join('')}
      </select>
    </div>`:'';
  const periodBar=`
    <div class="seg accent" style="margin-bottom:${awPeriod==='season'?'10':'14'}px">
      <button data-awperiod="season" class="${awPeriod==='season'?'on':''}">Saison</button>
      <button data-awperiod="week" class="${awPeriod==='week'?'on':''}">Woche</button>
      <button data-awperiod="all" class="${awPeriod==='all'?'on':''}">Gesamt</button>
    </div>
    ${seasonPicker}`;
  const R=awardRankings(awPeriod);
  const pl=awPeriodLabel();
  if(!R.counts.matches)
    return `<div class="view-head"><h2>Awards</h2><p>${pl}</p></div>${periodBar}${emptyState('trophy','Keine Matches in diesem Zeitraum')}`;
  const tn=ids=>ids.map(pname).join(' & ');
  // ⚑ HOTSPOT — Award-ID -> Icon-Name. DIESE Map existiert 3x identisch in:
  //   §5.3 vAwards()       (Awards-Tab)
  //   §8.3 showAward()     (Award-Detail-Sheet)
  //   §8.4 showPlayerAwards() (Spieler-Awards-Sheet)
  // Neue Awards brauchen einen Eintrag in ALLEN 3 Maps, sonst fallback auf 'trophy'.
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

  // Trophy-Builder für die Vitrine.
  //   key, cls(color), label, ids(array of 1 or 2 player ids; null = empty),
  //   name (Komma-Liste bei Gleichstand), detail (im Sheet, hier ignoriert),
  //   val (große Zahl auf der Trophäe), opts (legacy, hier ignoriert).
  // Signatur kompatibel zur alten card()-Funktion → minimal-invasive Umstellung.
  const trophy = (key, cls, label, ids, name, detail, val, opts) => {
    const isEmpty = !ids || !ids.length;
    const emptyCls = isEmpty ? ' empty' : '';

    // ── Plakette: Avatar + Name bei Single, "X & Y" Text bei Team, "X&Y vs Z&W" bei Rivalry ──
    let plaqueContent;
    if(isEmpty){
      plaqueContent = `<span class="aw-trophy-plaque-name" style="color:var(--muted)">noch keine Daten</span>`;
    } else if(ids.length === 1){
      const p = pmap()[ids[0]];
      const em = p && p.avatar_id ? avatarEmoji(p.avatar_id) : null;
      const avHtml = em
        ? `<span class="aw-trophy-plaque-av">${em}</span>`
        : `<span class="aw-trophy-plaque-av" style="background:${avColor(ids[0])}">${esc(initials(p ? p.name : '?'))}</span>`;
      // Der "name" String kann bei Gleichstand mehrere Namen kommagetrennt enthalten
      plaqueContent = `${avHtml}<span class="aw-trophy-plaque-name">${name}</span>`;
    } else if(ids.length === 4){
      // Rivalität (Erzfeinde): vier Spieler, Plakette zeigt "TeamA vs TeamB" kompakt
      plaqueContent = `<span class="aw-trophy-plaque-name" style="font-size:9.5px;line-height:1.2">${name}</span>`;
    } else {
      // Team-Award: nur Namen als Text "X & Y" (ohne Avatare in der Plakette)
      plaqueContent = `<span class="aw-trophy-plaque-name" style="font-size:10.5px">${name}</span>`;
    }

    return `<div class="aw-trophy ${cls}${emptyCls}" data-award="${esc(key)}">
      <div class="aw-trophy-cup">${ic(key)}<div class="aw-trophy-cup-base"></div></div>
      <div class="aw-trophy-lbl">${label}</div>
      <div class="aw-trophy-val">${isEmpty ? '—' : esc(String(val))}</div>
      <div class="aw-trophy-plaque">${plaqueContent}</div>
    </div>`;
  };
  // Alias für Rückwärtskompatibilität — alle bestehenden card(...)-Aufrufe nutzen jetzt trophy()
  const card = trophy;

  // Sammelt alle Platz-1-Namen bei Gleichstand (für Einzel-Awards)
  const topNames=(arr,valFn,nameFn)=>{
    if(!arr||!arr.length)return null;
    const topVal=valFn(arr[0]);
    return arr.filter(x=>valFn(x)===topVal).map(nameFn).join(', ');
  };
  const topTeamNames=(arr,valFn)=>{
    if(!arr||!arr.length)return null;
    const topVal=valFn(arr[0]);
    return arr.filter(x=>valFn(x)===topVal).map(x=>tn(x.ids)).join(', ');
  };
  const g=(arr)=>arr&&arr.length?arr[0]:null;
  const wn0=g(R.winsList),mvt0=g(R.mvt),st0=g(R.streaks),
        sc0=g(R.scorer),wl0=g(R.wall),u0=g(R.upsets),b0=g(R.biggest),
        pf0=g(R.perfect),gr0=g(R.grinder),
        wwr0=g(R.worstWr),wa0=g(R.worstAtk),wd0=g(R.worstDef),we0=g(R.worstElo),
        eg0=g(R.endgegner),cl0=g(R.clutchList),ic0=g(R.iceList),
        wt0=g(R.worstTeam),bd0=g(R.bestDuo),of0=g(R.onFire),cs0=g(R.coldStreak),ck0=g(R.carryList),
        sl0=g(R.soloList),ft0=g(R.formtief),zk0=g(R.zirkusList),bs0=g(R.baustelleList),
        sm0=g(R.showmasterList),pk0=g(R.peakEloList),
        wk0=g(R.weekKingList),dk0=g(R.dayKingList),
        // ── NEUE AWARDS v3 ──
        pm0=g(R.plusMinusList),uh0=g(R.underdogList),pv0=g(R.pechvogelList),
        // ── NEUE TEAM-AWARDS v4 ──
        un0=g(R.unstoppableList), cw0=g(R.concreteWallList), lc0=g(R.luckyCharmList),
        gs0=g(R.giantSlayerList), fs0=g(R.favoritenschreckList), rv0=g(R.rivalryList),
        // ── NEUE NEGATIV-AWARDS v6 ──
        cp0=g(R.cheesePlatterList), fl0=g(R.favoriteLoserList);

  let html='';
  // ════════════════════════════════════════════════════════════════
  // AWARD-SAMMLER-PODIUM (Top-3 Spieler nach Anzahl gewonnener Awards)
  // ════════════════════════════════════════════════════════════════
  // Zählt jeden Platz-1-Award pro Spieler. Bei Team-Awards (mvt, bestDuo,
  // endgegner, biggest, upset, zirkus, baustelle, worstTeam) zählen beide
  // Teammitglieder. Schandtafel-Awards sind NICHT positiv und fließen daher
  // NICHT in den Sammler-Counter ein.
  // ════════════════════════════════════════════════════════════════
  const _coll = {}; // playerId → count
  const _addColl = (ids) => {
    if(!ids) return;
    ids.forEach(id => { if(id) _coll[id] = (_coll[id] || 0) + 1; });
  };
  // ────────────────────────────────────────────────────────────────
  // Tie-aware Top-1-Sammler. Bei geteilten Platz-1-Auszeichnungen
  // werden ALLE Spieler/Teams mit demselben Top-Wert gezählt.
  // valFn muss zur Sort-Logik der jeweiligen Award-Card passen (die
  // Listen sind bereits desc nach valFn sortiert; list[0] = Top-Wert).
  // ────────────────────────────────────────────────────────────────
  const _topSingleIds = (list, valFn) => {
    if(!list || !list.length) return [];
    const topVal = valFn(list[0]);
    return list.filter(x => valFn(x) === topVal).map(x => x.id);
  };
  const _topTeamIds = (list, valFn) => {
    if(!list || !list.length) return [];
    const topVal = valFn(list[0]);
    const out = [];
    list.filter(x => valFn(x) === topVal).forEach(x => x.ids.forEach(id => out.push(id)));
    return out;
  };
  // Highlights
  if(wn0) _addColl(_topSingleIds(R.winsList, x => x.v));
  if(of0 && of0.v >= 2) _addColl(_topSingleIds(R.onFire, x => x.v));
  if(pf0) _addColl(_topSingleIds(R.perfect, x => Math.round(x.wr*100)));
  if(st0) _addColl(_topSingleIds(R.streaks, x => x.v));
  if(sm0) _addColl(_topSingleIds(R.showmasterList, x => x.v));
  if(awPeriod === 'all' && pk0) _addColl(_topSingleIds(R.peakEloList, x => x.v));
  if(awPeriod !== 'week'){
    if(wk0) _addColl(_topSingleIds(R.weekKingList, x => x.v));
    if(dk0) _addColl(_topSingleIds(R.dayKingList, x => x.v));
  }
  // Teams
  if(mvt0) _addColl(_topTeamIds(R.mvt, x => Math.round(x.v)));
  if(bd0 && bd0.g >= 2) _addColl(_topTeamIds(R.bestDuo, x => x.g));
  // Angriff & Verteidigung
  if(sc0) _addColl(_topSingleIds(R.scorer, x => Math.round(x.avg*10)));
  if(wl0) _addColl(_topSingleIds(R.wall, x => Math.round(x.v/x.g*10)));
  if(ic0 && ic0.v >= 1) _addColl(_topSingleIds(R.iceList, x => x.v));
  if(pm0) _addColl(_topSingleIds(R.plusMinusList, x => Math.round(x.v*10)));
  // Spezial
  if(eg0) _addColl(_topTeamIds(R.endgegner, x => Math.round(x.pct*1000)));
  if(cl0) _addColl(_topSingleIds(R.clutchList, x => Math.round(x.wr*100)));
  if(ck0 && ck0.v >= 1) _addColl(_topSingleIds(R.carryList, x => x.v));
  if(sl0) _addColl(_topSingleIds(R.soloList, x => Math.round(x.wr*100)));
  // upset / biggest sind Einzel-Match-Awards (kein Top-1-Konzept wie bei Listen)
  if(u0) _addColl(u0.m.winner === 'A' ? [u0.m.a1, u0.m.a2] : [u0.m.b1, u0.m.b2]);
  if(b0) _addColl(b0.m.winner === 'A' ? [b0.m.a1, b0.m.a2] : [b0.m.b1, b0.m.b2]);
  if(gr0) _addColl(_topSingleIds(R.grinder, x => x.v));
  if(uh0) _addColl(_topSingleIds(R.underdogList, x => x.v));
  // ── NEUE TEAM-AWARDS v4 (positive Awards → in Sammler-Counter) ──
  if(un0) _addColl(_topTeamIds(R.unstoppableList, x => x.v));
  if(cw0) _addColl(_topTeamIds(R.concreteWallList, x => -Math.round(x.v*100))); // niedriger = besser
  if(lc0) _addColl(_topTeamIds(R.luckyCharmList, x => Math.round(x.v*1000)));   // Quote
  if(gs0) _addColl(_topTeamIds(R.giantSlayerList, x => Math.round(x.v*1000)));  // Quote
  // Rivalry zählt für alle 4 Spieler beider Teams (idsA + idsB), Sortierung per Quote.
  if(rv0){
    const topPct = rv0.pct;
    R.rivalryList.filter(x => x.pct === topPct).forEach(x => _addColl([...x.idsA, ...x.idsB]));
  }
  // Favoritenschreck ist semantisch negativ/dramatisch (für den Verlierer) — wir werten
  // ihn neutral, also NICHT im Award-Sammler.
  // Schandtafel-Awards (inkl. Pechvogel) fließen bewusst NICHT in den Sammler.

  const _collTop = Object.entries(_coll)
    .map(([id, count]) => ({id, count}))
    .sort((a, b) => b.count - a.count || pname(a.id).localeCompare(pname(b.id)))
    .slice(0, 3);

  if(_collTop.length){
    const _avTrophyHtml = (pid) => {
      const p = pmap()[pid];
      const em = p && p.avatar_id ? avatarEmoji(p.avatar_id) : null;
      if(em) return em;
      return `<span style="font-family:'Archivo Black',sans-serif;font-size:14px;color:#0a0c0b;background:${avColor(pid)};width:100%;height:100%;display:grid;place-items:center;border-radius:50%">${esc(initials(p ? p.name : '?'))}</span>`;
    };
    // ────────────────────────────────────────────────────────────────
    // EFFEKTIVER RANG mit Standard Competition Ranking ("1224"-Stil):
    //   [10, 7, 7]  → ränge [1, 2, 2]
    //   [10, 10, 5] → ränge [1, 1, 3]
    //   [7, 7, 7]   → ränge [1, 1, 1]
    //   [10, 7, 5]  → ränge [1, 2, 3]
    // Tier folgt dem effektiven Rang: 1=gold, 2=silver, 3=bronze.
    // Layout bleibt 3-spaltig (silver-slot|gold-slot|bronze-slot), aber
    // die Tier-CSS-Klasse pro Slot kommt aus dem effektiven Rang, sodass
    // bei Gleichstand alle gleich aussehen (gold-Border, gold-Bar, gold-Zahl).
    // ────────────────────────────────────────────────────────────────
    const _eRank = _collTop.map((c,i,a) =>
      i === 0 ? 1 : (c.count === a[i-1].count ? null : i + 1)
    );
    // Zweiter Durchgang: null-Werte (Gleichstand) auf den vorigen Rang setzen
    for(let i = 1; i < _eRank.length; i++) if(_eRank[i] === null) _eRank[i] = _eRank[i-1];
    const _tierOf = r => r === 1 ? 'gold' : r === 2 ? 'silver' : 'bronze';

    const _slot = (idx) => {
      const c = _collTop[idx];
      if(!c) return `<div class="aw-collector" style="opacity:.3">
        <div class="aw-collector-av">·</div>
        <div class="aw-collector-name">—</div>
        <div class="aw-collector-count">0</div>
        <div class="aw-collector-lbl">Awards</div>
        <div class="aw-collector-bar"></div>
      </div>`;
      const tier = _tierOf(_eRank[idx]);
      return `<div class="aw-collector ${tier}" data-detail="${esc(c.id)}">
        <div class="aw-collector-av">${_avTrophyHtml(c.id)}</div>
        <span class="aw-collector-rank">${_eRank[idx]}</span>
        <div class="aw-collector-name">${esc(pname(c.id))}</div>
        <div class="aw-collector-count">${c.count}</div>
        <div class="aw-collector-lbl">${c.count===1?'Award':'Awards'}</div>
        <div class="aw-collector-bar"></div>
      </div>`;
    };
    // Render-Reihenfolge: Daten-Index 1 links, 0 mittig, 2 rechts (Treppe).
    // Mittig steht IMMER der erste Sammler (höchste Awards-Anzahl bzw. erste
    // alphabetisch bei Gleichstand) — auch wenn er nicht alleine Rang 1 ist.
    html += `<div class="aw-collectors">
      <div class="aw-collectors-title">Award-Sammler</div>
      ${_slot(1)}
      ${_slot(0)}
      ${_slot(2)}
    </div>`;
  }

  // Section header: kleiner farbiger Punkt + Caps-Label + verlaufende Linie.
  // Cards landen in einer aw-vitrine (Schaukasten-Container) darunter.
  const sect = (iconKey, iconCol, title, cards) => {
    html += `<div class="aw-sect ${iconCol}">
      <span class="aw-sect-dot"></span>
      <span>${title}</span>
      <span class="aw-sect-line"></span>
    </div><div class="aw-vitrine">${cards.join('')}</div>`;
  };
  const empty=(key,cls,label)=>card(key,cls,label,null,'–','noch keine Daten','');

  // ── HIGHLIGHTS ──
  const highlights=[];
  // Hero: Meiste Siege
  highlights.push(wn0
    ? card('wins','gold','Meiste Siege',[wn0.id],esc(topNames(R.winsList,x=>x.v,x=>pname(x.id))),pl,wn0.v,{hero:true,valSuffix:'Siege'})
    : empty('wins','gold','Meiste Siege'));
  if(of0&&of0.v>=2) highlights.push(card('onFire','acid','On Fire',[of0.id],esc(topNames(R.onFire,x=>x.v,x=>pname(x.id))),'aktuelle Serie',of0.v+'er'));
  highlights.push(pf0
    ? card('perfect','gold','Beste Bilanz',[pf0.id],esc(topNames(R.perfect,x=>Math.round(x.wr*100),x=>pname(x.id))),pf0.w+'–'+(pf0.g-pf0.w),Math.round(pf0.wr*100)+'%')
    : empty('perfect','gold','Beste Bilanz'));
  highlights.push(st0
    ? card('streaks','acid','Längste Siegesserie',[st0.id],esc(topNames(R.streaks,x=>x.v,x=>pname(x.id))),pl,st0.v+'er')
    : empty('streaks','acid','Längste Siegesserie'));
  highlights.push(sm0
    ? card('showmaster','gold','Showmaster',[sm0.id],esc(topNames(R.showmasterList,x=>x.v,x=>pname(x.id))),sm0.v+'× 10:0',sm0.v)
    : empty('showmaster','gold','Showmaster'));
  // Peak Elo: nur in Gesamt-Ansicht. Allzeit-Höchster Elo-Stand, saison-übergreifend.
  if(awPeriod==='all'){
    highlights.push(pk0
      ? card('peakElo','gold','Peak Elo',[pk0.id],esc(topNames(R.peakEloList,x=>x.v,x=>pname(x.id))),'Allzeit-Höchststand',pk0.v)
      : empty('peakElo','gold','Peak Elo'));
  }
  // Wochenkönig & Tageskönig: nur in Saison/Gesamt sinnvoll (in Woche wäre Zeitraum=1).
  // Beide nutzen exakt die Zähler-Logik der POTW-/POTD-Badges (Konsistenz garantiert).
  if(awPeriod!=='week'){
    highlights.push(wk0
      ? card('weekKing','gold','Wochenkönig',[wk0.id],esc(topNames(R.weekKingList,x=>x.v,x=>pname(x.id))),wk0.v+'× Player of the Week',wk0.v)
      : empty('weekKing','gold','Wochenkönig'));
    highlights.push(dk0
      ? card('dayKing','gold','Tageskönig',[dk0.id],esc(topNames(R.dayKingList,x=>x.v,x=>pname(x.id))),dk0.v+'× Player of the Day',dk0.v)
      : empty('dayKing','gold','Tageskönig'));
  }
  sect('star','gold','Highlights',highlights);

  // ── TEAMS ──
  const teams=[];
  teams.push(mvt0
    ? card('mvt','blue','Bestes Team',mvt0.ids,esc(topTeamNames(R.mvt,x=>Math.round(x.v))),'gemeinsamer Elo-Zuwachs · '+pl,(mvt0.v>=0?'+':'')+Math.round(mvt0.v))
    : empty('mvt','blue','Bestes Team'));
  teams.push(bd0&&bd0.g>=2
    ? card('bestDuo','blue','Unzertrennlich',bd0.ids,esc(topTeamNames(R.bestDuo,x=>x.g)),bd0.g+' gemeinsame Spiele',bd0.g)
    : empty('bestDuo','blue','Unzertrennlich'));
  // ── NEUE TEAM-AWARDS v4 ──
  // Unaufhaltsam: längste Team-Siegesserie
  teams.push(un0
    ? card('unstoppable','acid','Unaufhaltsam',un0.ids,esc(topTeamNames(R.unstoppableList,x=>x.v)),un0.v+' Siege in Folge',un0.v)
    : empty('unstoppable','acid','Unaufhaltsam'));
  // Betonmauer: niedrigster Gegentor-Schnitt (min. 10 Sp.)
  teams.push(cw0
    ? card('concreteWall','blue','Betonmauer',cw0.ids,esc(topTeamNames(R.concreteWallList,x=>-Math.round(x.v*100))),cw0.v.toFixed(2)+' Gegentore/Sp.',cw0.v.toFixed(2))
    : empty('concreteWall','blue','Betonmauer'));
  // Glückspilze: meiste 1-Tor-Siege
  teams.push(lc0
    ? card('luckyCharm','acid','Glückspilze',lc0.ids,esc(topTeamNames(R.luckyCharmList,x=>Math.round(x.v*1000))),Math.round(lc0.v*100)+'% knappe Siege ('+lc0.wins+'/'+lc0.games+')',Math.round(lc0.v*100)+'%')
    : empty('luckyCharm','acid','Glückspilze'));
  // Giant Slayer: meiste Siege gegen stärkere Teams
  teams.push(gs0
    ? card('giantSlayer','orange','Giant Slayer',gs0.ids,esc(topTeamNames(R.giantSlayerList,x=>Math.round(x.v*1000))),Math.round(gs0.v*100)+'% Favoriten besiegt ('+gs0.wins+'/'+gs0.games+')',Math.round(gs0.v*100)+'%')
    : empty('giantSlayer','orange','Giant Slayer'));
  // Favoritenschreck: höchster überwundener Team-Elo-Unterschied (Match-Award je Team)
  teams.push(fs0
    ? card('favoritenschreck','red','Favoritenschreck',fs0.ids,esc(topTeamNames(R.favoritenschreckList,x=>x.v)),fs0.v+' Elo überwunden · '+dateStr(fs0.m.created_at),fs0.v)
    : empty('favoritenschreck','red','Favoritenschreck'));
  // Erzfeinde: 4-Spieler-Rivalität — beide Teams im name-String "X & Y vs Z & W"
  if(rv0){
    const rivalryName = pname(rv0.idsA[0])+' & '+pname(rv0.idsA[1])+' vs '+pname(rv0.idsB[0])+' & '+pname(rv0.idsB[1]);
    teams.push(card('rivalry','purple','Erzfeinde',[...rv0.idsA, ...rv0.idsB],esc(rivalryName),Math.round(rv0.pct*100)+'% ihrer Spiele ('+rv0.g+' Duelle)',Math.round(rv0.pct*100)+'%'));
  } else {
    teams.push(empty('rivalry','purple','Erzfeinde'));
  }
  sect('handshake','blue','Teams',teams);

  // ── ANGRIFF & VERTEIDIGUNG ──
  const combat=[];
  combat.push(sc0
    ? card('scorer','orange','Torjäger',[sc0.id],esc(topNames(R.scorer,x=>Math.round(x.avg*10),x=>pname(x.id))),'Ø '+sc0.avg.toFixed(1)+' Tore/Sp.',sc0.avg.toFixed(1))
    : empty('scorer','orange','Torjäger'));
  combat.push(wl0
    ? card('wall','blue','Eiserne Abwehr',[wl0.id],esc(topNames(R.wall,x=>Math.round(x.v/x.g*10),x=>pname(x.id))),(wl0.v/wl0.g).toFixed(1)+' Gegentore/Sp.',(wl0.v/wl0.g).toFixed(1))
    : empty('wall','blue','Eiserne Abwehr'));
  combat.push(ic0&&ic0.v>=1
    ? card('ice','blue','Eiskalt',[ic0.id],esc(topNames(R.iceList,x=>x.v,x=>pname(x.id))),ic0.v+'× Zu-Null als Verteidiger',ic0.v)
    : empty('ice','blue','Eiskalt'));
  // Plus-Minus: Ø Tor-Saldo pro Spiel. Vorzeichen vor dem Wert für klares "Plus"-Gefühl.
  combat.push(pm0
    ? card('plusMinus','orange','Plus-Minus',[pm0.id],esc(topNames(R.plusMinusList,x=>Math.round(x.v*10),x=>pname(x.id))),pm0.gf+':'+pm0.ga+' · '+pm0.g+' Spiele',(pm0.v>=0?'+':'')+pm0.v.toFixed(1))
    : empty('plusMinus','orange','Plus-Minus'));
  sect('shield','blue','Angriff & Verteidigung',combat);

  // ── SPEZIAL ──
  const special=[];
  special.push(eg0
    ? card('endgegner','purple','Endgegner',eg0.ids,esc(topTeamNames(R.endgegner,x=>Math.round(x.pct*1000))),Math.round(eg0.pct*100)+'% als Gegner ('+eg0.g+'×)',Math.round(eg0.pct*100)+'%')
    : empty('endgegner','purple','Endgegner'));
  special.push(cl0
    ? card('clutch','acid','Clutch-Player',[cl0.id],esc(topNames(R.clutchList,x=>Math.round(x.wr*100),x=>pname(x.id))),cl0.g+' knappe Spiele',Math.round(cl0.wr*100)+'%')
    : empty('clutch','acid','Clutch-Player'));
  special.push(ck0&&ck0.v>=1
    ? card('carryKing','acid','Carry-King',[ck0.id],esc(topNames(R.carryList,x=>x.v,x=>pname(x.id))),ck0.v+'× mit schwachem Mate',ck0.v)
    : empty('carryKing','acid','Carry-King'));
  special.push(sl0
    ? card('solo','acid','Einzelkämpfer',[sl0.id],esc(topNames(R.soloList,x=>Math.round(x.wr*100),x=>pname(x.id))),sl0.g+' Spiele mit Bottom-3',Math.round(sl0.wr*100)+'%')
    : empty('solo','acid','Einzelkämpfer'));
  // Match-Awards: zeigen die Avatare des Gewinner-Teams (winnerSide via m.winner)
  // Match-Awards haben pro Match nur einen Eintrag → keine Komma-Liste nötig
  special.push(u0
    ? card('upset','orange','Größte Überraschung',u0.m.winner==='A'?[u0.m.a1,u0.m.a2]:[u0.m.b1,u0.m.b2],esc(mlabel(u0.m)),u0.m.score_a+':'+u0.m.score_b+' · '+Math.round((1-u0.sp)*100)+'% Chance',Math.round(u0.sp*100)+'%')
    : empty('upset','orange','Größte Überraschung'));
  special.push(b0
    ? card('biggest','purple','Höchster Sieg',b0.m.winner==='A'?[b0.m.a1,b0.m.a2]:[b0.m.b1,b0.m.b2],esc(mlabel(b0.m)),b0.m.score_a+':'+b0.m.score_b,'+'+b0.diff)
    : empty('biggest','purple','Höchster Sieg'));
  special.push(gr0
    ? card('grinder','blue','Vielspieler',[gr0.id],esc(topNames(R.grinder,x=>x.v,x=>pname(x.id))),pl,gr0.v)
    : empty('grinder','blue','Vielspieler'));
  // Underdog-Held: meiste Underdog-Siege (myExp < 35%). Anders als die Match-Trophy
  // "Größte Überraschung" (= einzelner Match) ist das hier ein Saison-Counter.
  special.push(uh0
    ? card('underdog','purple','Underdog-Held',[uh0.id],esc(topNames(R.underdogList,x=>x.v,x=>pname(x.id))),uh0.v+'× als Außenseiter gewonnen',uh0.v)
    : empty('underdog','purple','Underdog-Held'));
  sect('bolt','purple','Spezial',special);

  // ── SCHANDTAFEL ──
  const neg=[];
  neg.push(wwr0
    ? card('worstWr','red','Schlechtester Spieler',[wwr0.id],esc(topNames(R.worstWr,x=>Math.round(x.wr*100),x=>pname(x.id))),wwr0.w+'–'+(wwr0.g-wwr0.w),Math.round(wwr0.wr*100)+'%',{neg:true})
    : empty('worstWr','red','Schlechtester Spieler'));
  if(cs0&&cs0.v>=2) neg.push(card('coldStreak','red','Eiskalt erwischt',[cs0.id],esc(topNames(R.coldStreak,x=>x.v,x=>pname(x.id))),'aktuelle Serie',cs0.v+'er',{neg:true}));
  const ls0=g(R.lossStreaks);
  neg.push(ls0
    ? card('lossStreaks','red','Längste Niederlagenserie',[ls0.id],esc(topNames(R.lossStreaks,x=>x.v,x=>pname(x.id))),'insgesamt',ls0.v+'er',{neg:true})
    : empty('lossStreaks','red','Längste Niederlagenserie'));
  neg.push(ft0
    ? card('formtief','red','Formtief',[ft0.id],esc(topNames(R.formtief,x=>Math.round(x.drop),x=>pname(x.id))),'Peak '+ft0.peak+' → jetzt '+ft0.cur,'-'+Math.round(ft0.drop),{neg:true})
    : empty('formtief','red','Formtief'));
  neg.push(wa0
    ? card('worstAtk','red','Zahnloser Stürmer',[wa0.id],esc(topNames(R.worstAtk,x=>Math.round(x.v/x.g*10),x=>pname(x.id))),(wa0.v/wa0.g).toFixed(1)+' Tore/Sp.',(wa0.v/wa0.g).toFixed(1),{neg:true})
    : empty('worstAtk','red','Zahnloser Stürmer'));
  neg.push(wd0
    ? card('worstDef','red','Löchrigste Abwehr',[wd0.id],esc(topNames(R.worstDef,x=>Math.round(x.v/x.g*10),x=>pname(x.id))),(wd0.v/wd0.g).toFixed(1)+' Gegentore/Sp.',(wd0.v/wd0.g).toFixed(1),{neg:true})
    : empty('worstDef','red','Löchrigste Abwehr'));
  neg.push(zk0
    ? card('zirkus','red','Zirkus',zk0.ids,esc(topTeamNames(R.zirkusList,x=>Math.round(x.pct*1000))),Math.round(zk0.pct*100)+'% hohe Niederlagen ('+zk0.v+'/'+zk0.g+')',Math.round(zk0.pct*100)+'%',{neg:true})
    : empty('zirkus','red','Zirkus'));
  neg.push(wt0
    ? card('worstTeam','red','Schlechtestes Team',wt0.ids,esc(topTeamNames(R.worstTeam,x=>Math.round(x.w/x.g*100))),wt0.w+'–'+(wt0.g-wt0.w),Math.round(wt0.w/wt0.g*100)+'%',{neg:true})
    : empty('worstTeam','red','Schlechtestes Team'));
  neg.push(bs0
    ? card('baustelle','red','Baustelle',bs0.ids,esc(topTeamNames(R.baustelleList,x=>x.best)),'Niederlagenserie',bs0.best+'er',{neg:true})
    : empty('baustelle','red','Baustelle'));
  // Pechvogel: meiste knappe Niederlagen prozentual (Diff ≤ 2). Symmetrisch
  // zum Clutch-Player (gewinnt knapp prozentual) — der Pechvogel verliert knapp prozentual.
  neg.push(pv0
    ? card('pechvogel','red','Pechvogel',[pv0.id],
        esc(topNames(R.pechvogelList,x=>Math.round(x.pct*1000),x=>pname(x.id))),
        pv0.v+' knappe Niederlagen in '+pv0.g+' Spielen',
        Math.round(pv0.pct*100)+'%',
        {neg:true})
    : empty('pechvogel','red','Pechvogel'));
  // ── NEUE NEGATIV-AWARDS v6 ──
  // Käseteller: Spiegel zu Concrete Wall — höchster Gegentor-Schnitt als Team.
  neg.push(cp0
    ? card('cheesePlatter','red','Käseteller',cp0.ids,esc(topTeamNames(R.cheesePlatterList,x=>Math.round(x.v*100))),cp0.v.toFixed(2)+' Gegentore/Sp.',cp0.v.toFixed(2),{neg:true})
    : empty('cheesePlatter','red','Käseteller'));
  // Favoriten-Versager: Spiegel zu Underdog-Held — höchste Niederlagen-Quote bei myExp ≥ 65%.
  neg.push(fl0
    ? card('favoriteLoser','red','Favoriten-Versager',[fl0.id],
        esc(topNames(R.favoriteLoserList,x=>Math.round(x.v*1000),x=>pname(x.id))),
        fl0.losses+' verloren in '+fl0.games+' Favoriten-Spielen',
        Math.round(fl0.v*100)+'%',
        {neg:true})
    : empty('favoriteLoser','red','Favoriten-Versager'));
  html+=`<div class="aw-shame-divider">
    <div class="line"></div>
    <div class="lbl">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9h.01M15 9h.01M9 16c.85-1 2-1.5 3-1.5s2.15.5 3 1.5"/></svg>
      Schandtafel
    </div>
    <div class="line r"></div>
  </div><div class="aw-vitrine">${neg.join('')}</div>`;

  return `
    <div class="view-head"><h2>Awards</h2><p>${pl} · tippen für Top 3</p></div>
    ${periodBar}
    ${html}`;
}

// ⚑ HOTSPOT — Award-Metadaten (Titel, Klasse, Erklärung).
// Eine fehlende Erweiterung hier führt dazu, dass das Detail-Sheet im
// showAward() nicht öffnen kann (meta = undefined -> return).
// Reihenfolge der Felder pro Award:
//   title — Anzeigename
//   cls   — Farbklasse (acid|blue|gold|orange|purple|red)
//   why   — Knappe Erklärung (1 Satz, idealerweise inkl. Mindestschwellen)
const AWARD_META={
  wins:        {title:'Meiste Siege',          cls:'gold',  why:'Wer hat im Zeitraum die meisten Spiele gewonnen.'},
  mvt:         {title:'Bestes Team',           cls:'gold',  why:'Das Duo, das im Zeitraum zusammen die meisten Elo-Punkte geholt hat.'},
  streaks:     {title:'Längste Siegesserie',   cls:'acid',  why:'Meiste Siege in Folge im Zeitraum.'},
  onFire:      {title:'On Fire',               cls:'acid',  why:'Längste aktuell noch laufende Siegesserie.'},
  scorer:      {title:'Torjäger',              cls:'orange',why:'Höchster Tore-Schnitt pro Spiel als Stürmer. Min. 2 Sturm-Spiele.'},
  wall:        {title:'Eiserne Abwehr',        cls:'blue',  why:'Niedrigster Gegentore-Schnitt pro Spiel als Verteidiger. Min. 2 Abwehr-Spiele.'},
  ice:         {title:'Eiskalt',               cls:'blue',  why:'Meiste Zu-Null-Siege als Verteidiger.'},
  endgegner:   {title:'Endgegner',             cls:'purple',why:'Spieler-Paar mit dem höchsten Anteil "wir treffen als Gegner aufeinander" an der gemeinsamen Match-Aktivität. Min. 3 Begegnungen, beide Spieler min. 5 Spiele.'},
  clutch:      {title:'Clutch-Player',         cls:'acid',  why:'Höchste Siegrate in knappen Spielen (Tordifferenz ≤ 2). Min. 2 knappe Spiele.'},
  carryKing:   {title:'Carry-King',            cls:'acid',  why:'Meiste Siege, bei denen der Mitspieler einer der drei schwächsten Spieler im Match war.'},
  bestDuo:     {title:'Unzertrennlich',        cls:'blue',  why:'Duo mit den meisten gemeinsamen Spielen im Zeitraum.'},
  upset:       {title:'Größte Überraschung',   cls:'orange',why:'Das Match mit der niedrigsten Sieg-Wahrscheinlichkeit für den späteren Sieger.'},
  biggest:     {title:'Höchster Sieg',         cls:'purple',why:'Das Match mit der größten Tordifferenz.'},
  perfect:     {title:'Beste Bilanz',          cls:'gold',  why:'Höchste Siegrate im Zeitraum, mit einer dynamischen Mindest-Spielzahl für Stabilität.'},
  grinder:     {title:'Vielspieler',           cls:'blue',  why:'Wer hat im Zeitraum die meisten Matches gespielt.'},
  worstWr:     {title:'Schlechtester Spieler', cls:'red',   why:'Niedrigste Siegrate im Zeitraum. Min. 3 Spiele.'},
  coldStreak:  {title:'Eiskalt erwischt',      cls:'red',   why:'Längste aktuell noch laufende Niederlagenserie.'},
  lossStreaks: {title:'Längste Niederlagenserie',cls:'red', why:'Meiste Niederlagen in Folge im Zeitraum.'},
  worstAtk:    {title:'Zahnloser Stürmer',     cls:'red',   why:'Wenigste erzielte Tore pro Spiel als Stürmer. Min. 2 Sturm-Spiele.'},
  worstDef:    {title:'Löchrigste Abwehr',     cls:'red',   why:'Meiste kassierte Tore pro Spiel als Verteidiger. Min. 2 Abwehr-Spiele.'},
  worstTeam:   {title:'Schlechtestes Team',    cls:'red',   why:'Duo mit der niedrigsten Siegrate. Min. 2 gemeinsame Spiele.'},
  showmaster:  {title:'Showmaster',            cls:'gold',  why:'Meiste 10:0-Siege im Zeitraum.'},
  solo:        {title:'Einzelkämpfer',         cls:'acid',  why:'Höchste Siegrate in Spielen mit einem Bottom-3-Mitspieler. Min. 2 solche Spiele.'},
  formtief:    {title:'Formtief',              cls:'red',   why:'Größter Abstand zwischen persönlichem Peak-Elo und aktueller Elo (innerhalb einer Saison).'},
  zirkus:      {title:'Zirkus',                cls:'red',   why:'Team mit dem höchsten Anteil hoher Niederlagen (5+ Tore Unterschied) an den gemeinsamen Spielen. Min. 5 Team-Spiele.'},
  baustelle:   {title:'Baustelle',             cls:'red',   why:'Team mit der längsten gemeinsamen Niederlagenserie.'},
  peakElo:     {title:'Peak Elo',              cls:'gold',  why:'Höchster jemals erreichter Saison-Elo-Stand, saison-übergreifend.'},
  weekKing:    {title:'Wochenkönig',           cls:'gold',  why:'Spieler mit den meisten Player-of-the-Week-Auszeichnungen. Die laufende Woche wird nicht gezählt.'},
  dayKing:     {title:'Tageskönig',            cls:'gold',  why:'Spieler mit den meisten Player-of-the-Day-Auszeichnungen. Der laufende Tag wird nicht gezählt.'},
  // ── AWARDS v3 ──
  plusMinus:   {title:'Plus-Minus',            cls:'orange',why:'Höchster Tor-Saldo pro Spiel (Tore minus Gegentore). Min. 10 Spiele.'},
  underdog:    {title:'Underdog-Held',         cls:'purple',why:'Meiste Siege mit weniger als 35 % Sieg-Wahrscheinlichkeit.'},
  pechvogel:   {title:'Pechvogel',             cls:'red',   why:'Höchster Anteil knapper Niederlagen (Tordiff. ≤ 2) an allen Spielen. Min. 2 knappe Niederlagen und 5 Spiele.'},
  // ── TEAM-AWARDS v4 ──
  unstoppable: {title:'Unaufhaltsam',          cls:'acid',  why:'Team mit der längsten Siegesserie. Eine Niederlage beendet die Serie sofort.'},
  concreteWall:{title:'Betonmauer',            cls:'blue',  why:'Team mit dem niedrigsten Gegentore-Schnitt pro Spiel. Min. 10 gemeinsame Spiele.'},
  luckyCharm:  {title:'Glückspilze',           cls:'acid',  why:'Team mit dem höchsten Anteil knapper Siege (1 Tor Vorsprung) an den gemeinsamen Spielen. Min. 10 Team-Spiele.'},
  giantSlayer: {title:'Giant Slayer',          cls:'orange',why:'Team mit der höchsten Erfolgsquote als Underdog (Quote: Siege gegen stärkeres Team / Spiele gegen ein stärkeres Team). Min. 5 Underdog-Matches.'},
  favoritenschreck:{title:'Favoritenschreck',  cls:'red',   why:'Größter Team-Elo-Unterschied, der durch einen Sieg überwunden wurde.'},
  rivalry:     {title:'Erzfeinde',             cls:'purple',why:'Team-Paar mit dem höchsten Anteil direkter Duelle an der gemeinsamen Match-Aktivität. Min. 3 Duelle, beide Teams min. 5 Spiele.'},
  // ── NEUE NEGATIV-AWARDS v6 ──
  cheesePlatter:{title:'Käseteller',           cls:'red',   why:'Team mit dem höchsten Gegentor-Schnitt pro Spiel. Min. 10 gemeinsame Spiele.'},
  favoriteLoser:{title:'Favoriten-Versager',   cls:'red',   why:'Höchste Niederlagen-Quote in Favoriten-Rollen (Siegerwartung ≥ 65 %). Min. 5 Favoriten-Matches.'}
};
function showAward(key){
  const R=awardRankings(awPeriod); const pl=awPeriodLabel(); const meta=AWARD_META[key]; if(!meta)return;
  _sheetSetReopen(()=>showAward(key));
  const tn=ids=>ids.map(pname).join(' & ');
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

  // ── NEUE TEAM-AWARDS v4 ──
  // favoritenschreck verhält sich wie ein Match-Award (zeigt ein konkretes Spiel),
  // gewinner/verlierer sind aber TEAMS — daher haben wir ein eigenes Layout unten.
  // rivalry ist ein 4-Spieler-Award mit Sonderlayout (Team A vs Team B).
  const MATCH_AWARDS = new Set(['upset','biggest']);
  const TEAM_AWARDS = new Set([
    'mvt','bestDuo','endgegner','worstTeam','zirkus','baustelle',
    'unstoppable','concreteWall','luckyCharm','giantSlayer',
    // ── NEUE NEGATIV-AWARDS v6 ──
    'cheesePlatter'
  ]);
  const RIVALRY_AWARDS = new Set(['rivalry']);
  const FAVS_AWARDS = new Set(['favoritenschreck']);
  const NEG_KEYS = new Set(['worstWr','worstAtk','worstDef','worstTeam','formtief','coldStreak','lossStreaks','zirkus','baustelle','pechvogel','favoritenschreck','cheesePlatter','favoriteLoser']);

  let bodyHtml='';

  if(MATCH_AWARDS.has(key)){
    const arr = key==='upset' ? R.upsets : R.biggest;
    if(arr&&arr.length){
      const top = arr[0];
      const m = top.m;
      const winnerSide = m.winner;
      const isUpsetVariant = key==='upset';
      const upsetWinPct = isUpsetVariant ? Math.round((1-top.sp)*100) : null;
      const diffStr = key==='biggest' ? '+'+top.diff+' Tore' : 'Siegchance nur '+upsetWinPct+'%';
      bodyHtml = `
        <div class="aw-match${isUpsetVariant?' upset':''}">
          <div class="aw-match-score">${m.score_a} : ${m.score_b}</div>
          <div class="aw-match-meta">${dateStr(m.created_at)} · ${diffStr}</div>
          <div class="aw-match-teams">
            <div class="aw-match-team">
              ${winnerSide==='A'?'<div class="aw-match-winner">Gewinner</div>':''}
              ${awMiniPair(m.a1,m.a2)}
              <div class="aw-match-team-name">${esc(pname(m.a1)+' & '+pname(m.a2))}</div>
            </div>
            <div class="aw-match-vs">vs</div>
            <div class="aw-match-team">
              ${winnerSide==='B'?'<div class="aw-match-winner">Gewinner</div>':''}
              ${awMiniPair(m.b1,m.b2)}
              <div class="aw-match-team-name">${esc(pname(m.b1)+' & '+pname(m.b2))}</div>
            </div>
          </div>
        </div>`;
    } else {
      bodyHtml = `<div class="empty" style="margin-top:24px">Keine Daten</div>`;
    }
  } else if(FAVS_AWARDS.has(key)){
    // Favoritenschreck: Match-Detail aus dem Top-Eintrag der Liste rendern.
    // Wie biggest/upset zeigen wir das konkrete Spiel mit Score + Teams. Zusätzlich
    // wird die überwundene Team-Elo-Differenz oben prominent dargestellt.
    const arr = R.favoritenschreckList;
    if(arr && arr.length){
      const top = arr[0];
      const m = top.m;
      const winnerSide = m.winner;
      bodyHtml = `
        <div class="aw-match upset">
          <div class="aw-match-score">${m.score_a} : ${m.score_b}</div>
          <div class="aw-match-meta">${dateStr(m.created_at)} · ${top.v} Elo überwunden</div>
          <div class="aw-match-teams">
            <div class="aw-match-team">
              ${winnerSide==='A'?'<div class="aw-match-winner">Sieger</div>':''}
              ${awMiniPair(m.a1,m.a2)}
              <div class="aw-match-team-name">${esc(pname(m.a1)+' & '+pname(m.a2))}</div>
            </div>
            <div class="aw-match-vs">vs</div>
            <div class="aw-match-team">
              ${winnerSide==='B'?'<div class="aw-match-winner">Sieger</div>':''}
              ${awMiniPair(m.b1,m.b2)}
              <div class="aw-match-team-name">${esc(pname(m.b1)+' & '+pname(m.b2))}</div>
            </div>
          </div>
        </div>`;
      // Weitere Plätze als kompakte Liste — andere Teams mit ihren best-Coups
      if(arr.length > 1){
        const rest = arr.slice(1, 7);
        const items = rest.map((e, idx) => {
          const teamName = pname(e.ids[0]) + ' & ' + pname(e.ids[1]);
          return `<div class="aw-li" data-li-team="${esc(e.ids.slice().sort().join('|'))}">
            <div class="aw-li-rank">${idx+2}.</div>
            ${awLiPair(e.ids[0], e.ids[1])}
            <div class="aw-li-info"><div class="aw-li-name">${esc(teamName)}</div></div>
            <div class="aw-li-val">${e.v} Elo</div>
          </div>`;
        }).join('');
        bodyHtml += `<div class="aw-list-label">Weitere Coups</div><div class="aw-list">${items}</div>`;
      }
    } else {
      bodyHtml = `<div class="empty" style="margin-top:24px">Keine Daten</div>`;
    }
  } else if(RIVALRY_AWARDS.has(key)){
    // Erzfeinde: Team-Paar mit zwei Bilanz-Boxen (Team A | Team B) + Torverhältnis.
    const arr = R.rivalryList;
    if(arr && arr.length){
      const top = arr[0];
      const teamAName = pname(top.idsA[0]) + ' & ' + pname(top.idsA[1]);
      const teamBName = pname(top.idsB[0]) + ' & ' + pname(top.idsB[1]);
      const aLeading = top.wA > top.wB;
      const bLeading = top.wB > top.wA;
      bodyHtml = `
        <div class="aw-match">
          <div class="aw-match-score">${Math.round(top.pct*100)}%</div>
          <div class="aw-match-meta">${top.g} direkte Duelle · ${top.gfA}:${top.gfB} Tore gesamt</div>
          <div class="aw-match-teams">
            <div class="aw-match-team" data-li-team="${esc(top.idsA.slice().sort().join('|'))}" style="cursor:pointer">
              ${aLeading?'<div class="aw-match-winner">Führt</div>':''}
              ${awMiniPair(top.idsA[0],top.idsA[1])}
              <div class="aw-match-team-name">${esc(teamAName)}</div>
              <div class="aw-match-team-name" style="margin-top:4px;font-family:'Sometype Mono',monospace;font-size:10px;color:var(--muted)">${top.wA} S · ${top.gA} Sp.</div>
            </div>
            <div class="aw-match-vs">vs</div>
            <div class="aw-match-team" data-li-team="${esc(top.idsB.slice().sort().join('|'))}" style="cursor:pointer">
              ${bLeading?'<div class="aw-match-winner">Führt</div>':''}
              ${awMiniPair(top.idsB[0],top.idsB[1])}
              <div class="aw-match-team-name">${esc(teamBName)}</div>
              <div class="aw-match-team-name" style="margin-top:4px;font-family:'Sometype Mono',monospace;font-size:10px;color:var(--muted)">${top.wB} S · ${top.gB} Sp.</div>
            </div>
          </div>
        </div>`;
      // Weitere Rivalitäten
      if(arr.length > 1){
        const rest = arr.slice(1, 7);
        const items = rest.map((e, idx) => {
          const aN = pname(e.idsA[0]) + ' & ' + pname(e.idsA[1]);
          const bN = pname(e.idsB[0]) + ' & ' + pname(e.idsB[1]);
          return `<div class="aw-li">
            <div class="aw-li-rank">${idx+2}.</div>
            <div class="aw-li-info" style="min-width:0">
              <div class="aw-li-name" style="font-size:12px">${esc(aN)}</div>
              <div class="aw-li-name" style="font-size:9.5px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-top:2px">vs ${esc(bN)}</div>
            </div>
            <div class="aw-li-val">${Math.round(e.pct*100)}% · ${e.g}×</div>
          </div>`;
        }).join('');
        bodyHtml += `<div class="aw-list-label">Weitere Rivalitäten</div><div class="aw-list">${items}</div>`;
      }
    } else {
      bodyHtml = `<div class="empty" style="margin-top:24px">Keine Daten</div>`;
    }
  } else {
    const arr = (() => {
      switch(key){
        case 'wins':       return R.winsList.map(x=>({ids:[x.id],name:pname(x.id),val:x.v+' Siege',sort:x.v}));
        case 'mvt':        return R.mvt.map(x=>({ids:x.ids,name:tn(x.ids),val:(x.v>=0?'+':'')+Math.round(x.v)+' Elo',sort:Math.round(x.v)}));
        case 'streaks':    return R.streaks.map(x=>({ids:[x.id],name:pname(x.id),val:x.v+'er Serie',sort:x.v}));
        case 'scorer':     return R.scorer.map(x=>({ids:[x.id],name:pname(x.id),val:'Ø '+x.avg.toFixed(1)+' Tore',sort:Math.round(x.avg*10)}));
        case 'wall':       return R.wall.map(x=>({ids:[x.id],name:pname(x.id),val:(x.v/x.g).toFixed(1)+' /Sp.',sort:-Math.round(x.v/x.g*10)}));
        case 'perfect':    return R.perfect.map(x=>({ids:[x.id],name:pname(x.id),val:Math.round(x.wr*100)+'%',sort:Math.round(x.wr*100)}));
        case 'grinder':    return R.grinder.map(x=>({ids:[x.id],name:pname(x.id),val:x.v+' Spiele',sort:x.v}));
        case 'worstWr':    return R.worstWr.map(x=>({ids:[x.id],name:pname(x.id),val:Math.round(x.wr*100)+'%',sort:-Math.round(x.wr*100)}));
        case 'worstAtk':   return R.worstAtk.map(x=>({ids:[x.id],name:pname(x.id),val:(x.v/x.g).toFixed(1)+' Tore/Sp.',sort:-Math.round(x.v/x.g*10)}));
        case 'worstDef':   return R.worstDef.map(x=>({ids:[x.id],name:pname(x.id),val:(x.v/x.g).toFixed(1)+' Gegen/Sp.',sort:Math.round(x.v/x.g*10)}));
        case 'endgegner':  return R.endgegner.map(x=>({ids:x.ids,name:tn(x.ids),val:Math.round(x.pct*100)+'% ('+x.g+'×)',sort:Math.round(x.pct*1000)}));
        case 'clutch':     return R.clutchList.map(x=>({ids:[x.id],name:pname(x.id),val:Math.round(x.wr*100)+'%',sort:Math.round(x.wr*100)}));
        case 'ice':        return R.iceList.map(x=>({ids:[x.id],name:pname(x.id),val:x.v+'× Zu-Null',sort:x.v}));
        case 'worstTeam':  return R.worstTeam.map(x=>({ids:x.ids,name:tn(x.ids),val:Math.round(x.w/x.g*100)+'%',sort:-Math.round(x.w/x.g*100)}));
        case 'bestDuo':    return R.bestDuo.map(x=>({ids:x.ids,name:tn(x.ids),val:x.g+' Spiele',sort:x.g}));
        case 'onFire':     return R.onFire.map(x=>({ids:[x.id],name:pname(x.id),val:x.v+'er Serie',sort:x.v}));
        case 'coldStreak': return R.coldStreak.map(x=>({ids:[x.id],name:pname(x.id),val:x.v+'er Niederlagen',sort:x.v}));
        case 'lossStreaks':return R.lossStreaks.map(x=>({ids:[x.id],name:pname(x.id),val:x.v+'er Serie',sort:x.v}));
        case 'carryKing':  return R.carryList.map(x=>({ids:[x.id],name:pname(x.id),val:x.v+' Carries',sort:x.v}));
        case 'showmaster': return R.showmasterList.map(x=>({ids:[x.id],name:pname(x.id),val:x.v+'× 10:0',sort:x.v}));
        case 'solo':       return R.soloList.map(x=>({ids:[x.id],name:pname(x.id),val:Math.round(x.wr*100)+'%',sort:Math.round(x.wr*100)}));
        case 'formtief':   return R.formtief.map(x=>({ids:[x.id],name:pname(x.id),val:'-'+Math.round(x.drop)+' Elo',sort:Math.round(x.drop)}));
        case 'zirkus':     return R.zirkusList.map(x=>({ids:x.ids,name:tn(x.ids),val:Math.round(x.pct*100)+'% ('+x.v+'/'+x.g+')',sort:Math.round(x.pct*1000)}));
        case 'baustelle':  return R.baustelleList.map(x=>({ids:x.ids,name:tn(x.ids),val:x.best+'er Serie',sort:x.best}));
        case 'peakElo':    return (R.peakEloList||[]).map(x=>({ids:[x.id],name:pname(x.id),val:x.v+' Elo',sort:x.v}));
        case 'weekKing':   return (R.weekKingList||[]).map(x=>({ids:[x.id],name:pname(x.id),val:x.v+'× POTW',sort:x.v}));
        case 'dayKing':    return (R.dayKingList||[]).map(x=>({ids:[x.id],name:pname(x.id),val:x.v+'× POTD',sort:x.v}));
        // ── NEUE AWARDS v3 ──
        case 'plusMinus':  return R.plusMinusList.map(x=>({ids:[x.id],name:pname(x.id),val:(x.v>=0?'+':'')+x.v.toFixed(1)+' /Sp.',sort:Math.round(x.v*10)}));
        case 'underdog':   return R.underdogList.map(x=>({ids:[x.id],name:pname(x.id),val:x.v+'× Underdog-Sieg',sort:x.v}));
        case 'pechvogel':  return R.pechvogelList.map(x=>({ids:[x.id],name:pname(x.id),val:Math.round(x.pct*100)+'% knapp verloren ('+x.v+'/'+x.g+')',sort:Math.round(x.pct*1000)}));
        // ── NEUE TEAM-AWARDS v4 ──
        case 'unstoppable':  return R.unstoppableList.map(x=>({ids:x.ids,name:tn(x.ids),val:x.v+' Siege in Folge',sort:x.v}));
        case 'concreteWall': return R.concreteWallList.map(x=>({ids:x.ids,name:tn(x.ids),val:x.v.toFixed(2)+' Gegentore/Sp.',sort:-Math.round(x.v*100)}));
        case 'luckyCharm':   return R.luckyCharmList.map(x=>({ids:x.ids,name:tn(x.ids),val:Math.round(x.v*100)+'% ('+x.wins+'/'+x.games+')',sort:Math.round(x.v*1000)}));
        case 'giantSlayer':  return R.giantSlayerList.map(x=>({ids:x.ids,name:tn(x.ids),val:Math.round(x.v*100)+'% ('+x.wins+'/'+x.games+')',sort:Math.round(x.v*1000)}));
        // ── NEUE NEGATIV-AWARDS v6 ──
        case 'cheesePlatter': return R.cheesePlatterList.map(x=>({ids:x.ids,name:tn(x.ids),val:x.v.toFixed(2)+' Gegentore/Sp.',sort:Math.round(x.v*100)}));
        case 'favoriteLoser': return R.favoriteLoserList.map(x=>({ids:[x.id],name:pname(x.id),val:Math.round(x.v*100)+'% ('+x.losses+'/'+x.games+')',sort:Math.round(x.v*1000)}));
        default: return [];
      }
    })();

    // Hero (#1) + Liste der weiteren Plätze
    if(!arr.length){
      bodyHtml = `<div class="empty" style="margin-top:24px">Keine Daten</div>`;
    } else {
      const isTeamAward = TEAM_AWARDS.has(key);
      const isNeg = NEG_KEYS.has(key);
      // meta.cls → RGB für Hero-Akzentfarbe
      const CLS_RGB = {gold:'247,207,74',acid:'190,242,100',blue:'86,180,232',orange:'255,120,73',purple:'167,139,250',red:'240,86,106'};
      const heroRgb = CLS_RGB[meta.cls] || CLS_RGB.gold;

      // ─── Hero (#1) – alle bei sort=arr[0].sort sind geteilte #1 ───
      const topGroup = arr.filter(x => x.sort === arr[0].sort);
      const isShared = topGroup.length > 1;
      const top = arr[0];
      // Wert (für Hero – alle teilen denselben Wert)
      const heroVal = (() => {
        const v = top.val;
        const m = v.match(/^([+\-]?\d+(?:[.,]\d+)?)/);
        return m ? `<b>${esc(m[1])}</b>${esc(v.slice(m[1].length))}` : esc(v);
      })();

      let heroHtml;
      if(!isShared){
        // ─── Single Hero (#1) ───
        const heroClick = isTeamAward
          ? `data-li-team="${esc(top.ids.slice().sort().join('|'))}"`
          : `data-li-player="${esc(top.ids[0])}"`;
        const heroAv = isTeamAward ? awHeroPair(top.ids[0], top.ids[1]) : awHeroAv(top.ids[0]);
        const heroMarker = isNeg
          ? `<div class="aw-winner-marker"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.skull}</svg></div>`
          : `<div class="aw-winner-crown">${svgI('crown')}</div>`;
        const heroBadge = isNeg
          ? `<span class="aw-winner-badge">Schandfleck · #1</span>`
          : `<span class="aw-winner-badge"><svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z"/></svg> Best · #1</span>`;

        heroHtml = `
          <div class="aw-winner ${isNeg?'shame':''}" style="--c:${heroRgb}" ${heroClick}>
            ${heroBadge}
            <div class="aw-winner-av-wrap">
              ${heroMarker}
              ${heroAv}
            </div>
            <div class="aw-winner-name">${esc(top.name)}</div>
            <div class="aw-winner-val">${heroVal}</div>
          </div>`;
      } else {
        // ─── Shared Hero: mehrere Spieler/Teams teilen sich #1 ───
        const sharedBadge = isNeg
          ? `<span class="aw-winner-badge">Geteilt · #1 · ${topGroup.length} ${isTeamAward?'Teams':'Sünder'}</span>`
          : `<span class="aw-winner-badge"><svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z"/></svg> Geteilt · #1 · ${topGroup.length} ${isTeamAward?'Teams':'Spieler'}</span>`;
        const sharedMarker = isNeg
          ? `<div class="aw-winner-shared-marker shame"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.skull}</svg></div>`
          : `<div class="aw-winner-shared-marker">${svgI('crown')}</div>`;
        const entries = topGroup.map(e => {
          const av = isTeamAward
            ? `<div class="aw-winner-tied-pair">${awLiAv(e.ids[0])}${awLiAv(e.ids[1])}</div>`
            : awLiAv(e.ids[0]);
          const click = isTeamAward
            ? `data-li-team="${esc(e.ids.slice().sort().join('|'))}"`
            : `data-li-player="${esc(e.ids[0])}"`;
          return `<div class="aw-winner-tied-entry" ${click}>
            ${av}
            <div class="aw-winner-tied-name">${esc(e.name)}</div>
          </div>`;
        }).join('');

        heroHtml = `
          <div class="aw-winner shared ${isNeg?'shame':''}" style="--c:${heroRgb}">
            ${sharedBadge}
            ${sharedMarker}
            <div class="aw-winner-shared-grid">${entries}</div>
            <div class="aw-winner-val">${heroVal}</div>
          </div>`;
      }

      // ─── Liste (Plätze ab nach allen #1-Geteilten) ───
      // Olympische Ränge: Position des ersten Eintrags mit gleichem sort + 1
      const rankOf = (i) => {
        for(let j=0; j<=i; j++) if(arr[j].sort === arr[i].sort) return j+1;
        return i+1;
      };
      const MAX_LIST = 6;
      const byRank = {};
      const orderRanks = [];
      // Bei geteiltem #1 starten wir die Liste hinter allen geteilten Plätzen
      const listStart = topGroup.length;
      for(let i=listStart; i<arr.length; i++){
        const rk = rankOf(i);
        if(!byRank[rk]){ byRank[rk] = []; orderRanks.push(rk); }
        byRank[rk].push(arr[i]);
        if(Object.values(byRank).reduce((a,b)=>a+b.length,0) >= MAX_LIST) break;
      }

      const listItems = [];
      const shameCls = isNeg ? 'shame' : '';
      for(const rk of orderRanks){
        const entries = byRank[rk];
        if(entries.length === 1){
          const e = entries[0];
          const avHtml = isTeamAward ? awLiPair(e.ids[0],e.ids[1]) : awLiAv(e.ids[0]);
          const clickAttr = isTeamAward
            ? `data-li-team="${esc(e.ids.slice().sort().join('|'))}"`
            : `data-li-player="${esc(e.ids[0])}"`;
          listItems.push(`
            <div class="aw-li ${shameCls}" ${clickAttr}>
              <div class="aw-li-rank">${rk}.</div>
              ${avHtml}
              <div class="aw-li-info">
                <div class="aw-li-name">${esc(e.name)}</div>
              </div>
              <div class="aw-li-val">${esc(e.val)}</div>
            </div>
          `);
        } else {
          const tiedRows = entries.map(e => {
            const avHtml = isTeamAward ? awLiPair(e.ids[0],e.ids[1],true) : awLiAv(e.ids[0],true);
            const clickAttr = isTeamAward
              ? `data-li-team="${esc(e.ids.slice().sort().join('|'))}"`
              : `data-li-player="${esc(e.ids[0])}"`;
            return `
              <div class="aw-li-tied-row" ${clickAttr}>
                ${avHtml}
                <div class="aw-li-info">
                  <div class="aw-li-name">${esc(e.name)}</div>
                </div>
              </div>`;
          }).join('');
          listItems.push(`
            <div class="aw-li tied ${shameCls}">
              <div class="aw-li-rank">${rk}.</div>
              <div class="aw-li-tied-stack">
                ${tiedRows}
                <span class="aw-li-tie-badge">Geteilt · ${entries.length} ${isTeamAward?'Teams':'Spieler'}</span>
              </div>
              <div class="aw-li-val">${esc(entries[0].val)}</div>
            </div>`);
        }
      }

      const listLabel = isNeg ? 'Weitere Sünder' : 'Weitere Plätze';
      bodyHtml = heroHtml + (listItems.length
        ? `<div class="aw-list-label">${listLabel}</div><div class="aw-list">${listItems.join('')}</div>`
        : '');
    }
  }

  const heroCls = meta.cls || 'gold';

  openSheet(`
    <div class="aw-hero-icon">
      <div class="aw-hero-icon-glow ${heroCls}">
        <svg viewBox="0 0 24 24">${ICONS[AW_IC[key]||'trophy']||''}</svg>
      </div>
      <div class="aw-hero-title">${meta.title}</div>
      <div class="aw-hero-sub">${pl}</div>
    </div>
    ${bodyHtml}
    <div class="aw-why">
      <div class="aw-why-ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16v.5"/></svg></div>
      <div class="aw-why-content">
        <div class="aw-why-label">So wird gewertet</div>
        <div class="aw-why-body">${meta.why}</div>
      </div>
    </div>`);

  // Match-Card klickbar
  if(MATCH_AWARDS.has(key)){
    const arr = key==='upset' ? R.upsets : R.biggest;
    if(arr&&arr.length){
      const el = document.querySelector('.aw-match');
      if(el){ el.style.cursor='pointer'; el.onclick=()=>{ sheetNav(()=>showMatchDetail(arr[0].m.id)); }; }
    }
  }
  // Favoritenschreck: Hauptkarte führt zum Match-Detail
  if(FAVS_AWARDS.has(key)){
    const arr = R.favoritenschreckList;
    if(arr && arr.length){
      const el = document.querySelector('.aw-match');
      if(el){ el.style.cursor='pointer'; el.onclick=()=>{ sheetNav(()=>showMatchDetail(arr[0].m.id)); }; }
    }
  }
  // Erzfeinde: die zwei Team-Boxen tragen data-li-team und werden durch den
  // generischen Team-Handler unten (querySelectorAll[data-li-team]) klickbar.

  // Listen-Einträge klickbar
  document.querySelectorAll('.aw-li[data-li-player], .aw-li-tied-row[data-li-player], .aw-winner[data-li-player], .aw-winner-tied-entry[data-li-player]').forEach(el=>{
    el.style.cursor='pointer';
    el.onclick=()=>{ const pid=el.dataset.liPlayer; sheetNav(()=>showPlayer(pid)); };
  });
  document.querySelectorAll('.aw-li[data-li-team], .aw-li-tied-row[data-li-team], .aw-winner[data-li-team], .aw-winner-tied-entry[data-li-team], .aw-match-team[data-li-team]').forEach(el=>{
    el.style.cursor='pointer';
    el.onclick=(ev)=>{ ev.stopPropagation(); const [a,b]=el.dataset.liTeam.split('|'); sheetNav(()=>showTeam(a,b)); };
  });
}


function dedupeBy(arr,keyFn){const seen=new Set(),out=[];for(const x of arr){const k=keyFn(x);if(seen.has(k))continue;seen.add(k);out.push(x);}return out;}
function mscoreLabel(m){return m.score_a+':'+m.score_b;}

