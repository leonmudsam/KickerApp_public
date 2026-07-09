// ╔═══ §2.9 ─── POSITIONS-KLASSIFIZIERUNG (7 Stufen) ───────────────────╗
//     Reine Sturm-Spieler -> "Stürmer", reine Abwehr -> "Verteidiger",
//     Mischformen -> 5 Zwischenstufen.
// ╚═════════════════════════════════════════════════════════════════════════╝
// Wandelt atkStrength (0.1 - 0.9) in ein Label + Icon um.
// Feingranular: 60/40-Splits sollen NICHT als reines "Flex" durchrutschen.
function posClassify(autoAtk){
  const a = autoAtk;
  if(a >= 0.78) return {label:'Reiner Stürmer',     icon:'bolt2',       tone:'atk'};
  if(a >= 0.60) return {label:'Stürmer',            icon:'bolt',        tone:'atk'};
  if(a >= 0.54) return {label:'Sturm-Flex',         icon:'bolt',        tone:'atk'};
  if(a >  0.46) return {label:'Flex',               icon:'cycle',       tone:'flex'};
  if(a >  0.40) return {label:'Abwehr-Flex',        icon:'shield',      tone:'def'};
  if(a >  0.22) return {label:'Verteidiger',        icon:'shield',      tone:'def'};
  return                {label:'Reiner Verteidiger', icon:'shieldCheck', tone:'def'};
}

// dynamischer K: neue Spieler (wenige Spiele) bewegen sich schneller
function dynK(pl){
  const g = gamesPlayed(pl.id); // Gesamt für Kompatibilität mit simulateElo
  if(g < 5)  return cfg.k_factor * (cfg.new_player_mult ?? 1.5);
  if(g < 15) return cfg.k_factor * (cfg.new_player_mid_mult ?? 1.2);
  if(pl.elo > cfg.start_elo + 400) return cfg.k_factor * (cfg.veteran_damp ?? 0.85);
  return cfg.k_factor;
}

// Margin-of-Victory Multiplikator (klares Ergebnis zählt mehr, knappes weniger)
function movMult(sa,sb){
  const diff=Math.abs(sa-sb), total=Math.max(sa+sb,1);
  // 1.0 bei knapp, bis ~1+mov_max_boost bei Kantersieg; logarithmisch gedämpft
  const maxBoost = cfg.mov_max_boost ?? 0.4;
  return 1 + maxBoost*(diff/(total)) * (Math.log(diff+1)/Math.log(11));
}

// computeMatch nutzt jetzt DIESELBE Engine wie der Recalc (simulateElo),
// damit die beim Speichern erzeugten Deltas exakt dem entsprechen, was nach
// einer späteren Neuberechnung in der DB steht. Es gibt nur noch EINE Wahrheit.
//
// Vorgehen: Wir bauen ein hypothetisches Match-Objekt, hängen es chronologisch
// an die aktuelle Saison-Matchliste an und lassen simulateElo darüber laufen.
// Die Deltas/exp_a des hypothetischen Matches lesen wir aus dem History-Eintrag.
function computeMatch(teamA, teamB, winner, sa, sb){
  // Optimierung: Wir starten vom End-State des gecachten globalen Sim und simulieren
  // nur das eine hypothetische Match darauf. Bei großen Match-Historien ~100× schneller.
  const HYPO_ID = '__hypo__';
  const hypo = {
    id: HYPO_ID,
    a1: teamA[0].id, a1_pos: teamA[0].pos,
    a2: teamA[1].id, a2_pos: teamA[1].pos,
    b1: teamB[0].id, b1_pos: teamB[0].pos,
    b2: teamB[1].id, b2_pos: teamB[1].pos,
    score_a: sa, score_b: sb, winner,
    created_at: new Date().toISOString()
  };

  const globalSim = getGlobalSim();
  const sim = simulateEloWithSliders([hypo], {
    initialState: globalSim,
    initialCurSeason: globalSim.curSeason
  });
  const entry = sim.history.find(h => h.matchId === HYPO_ID);
  const res = entry ? {...entry.deltas} : {};
  const expA = entry ? entry.expA : 0.5;

  // mov nur für die Anzeige ("Kantersieg ×…") — identische Formel wie in der Engine.
  const rawMov = movMult(sa, sb);
  return {res, expA, mov: rawMov};
}

async function persistNewMatch(newMatchId) {
  // Ein neues Match am Ende ändert nie vorherige Match-Deltas.
  // → Nur schreiben: dieses Match + Spieler-Stats (atk + Saison-Elo)
  // O(Spieler) statt O(alle Matches) DB-Writes.
  const sim = getGlobalSim(); // nutzt bereits das neue Match (cache invalidiert)
  const entry = sim.history.find(h => h.matchId === newMatchId);

  const writes = [];
  if(entry) {
    writes.push(
      sb.from('matches').update({ deltas: entry.deltas, exp_a: entry.expA })
        .eq('id', newMatchId)
    );
  }
  players.forEach(p => {
    const atk = atkStrengthFrom(p.id, matches);
    writes.push(sb.from('players').update({ atk }).eq('id', p.id));
  });

  const BATCH = 25;
  for(let i = 0; i < writes.length; i += BATCH) {
    await Promise.all(writes.slice(i, i + BATCH));
  }
  await syncSeasonEloToDB();
  // NEU: Zusätzliche Caches invalidieren, die durch ein neues Match beeinflusst werden
  invalidateCache(['global', 'stats', 'awards', 'badges', 'allTeamStats', 'allPastSeasons']);
}
// Schreibt eine neu berechnete Historie in die DB (Spieler-Elos + atk + Match-Deltas).
// WICHTIG: invalidiert auch die archivierten Saison-Snapshots (seasons.top_elo),
// damit das Recap-Podium nach Recalc konsistent zu der frischen Berechnung ist.
// Updates laufen in Batches parallel, um Rate-Limits zu respektieren (Supabase ~100 req/s).
async function persistRecalc(matchList){
  const BATCH_SIZE = 25;
  const runBatch = async (promises) => {
    for(let i=0; i<promises.length; i+=BATCH_SIZE){
      await Promise.all(promises.slice(i, i+BATCH_SIZE));
    }
  };
  // Positions-Stärke neu berechnen
  const atkUpdates = players.map(p=>{
    const atk = atkStrengthFrom(p.id, matchList);
    return sb.from('players').update({atk}).eq('id', p.id);
  });
  // Match-Deltas/exp_a aktualisieren (Slider-basiert)
  const{matchPatches} = recalcHistory(matchList);
  const matchUpdates = matchPatches.map(patch =>
    sb.from('matches').update({
      deltas: patch.deltas,
      exp_a: patch.exp_a
    }).eq('id', patch.id)
  );
  await runBatch([...atkUpdates, ...matchUpdates]);
  // Lokale Matches mit neuen Deltas updaten, damit die nachfolgende Archivierung
  // die frischen Werte sieht
  const patchById = {};
  matchPatches.forEach(p => { patchById[p.id] = p; });
  matches.forEach(m => {
    const p = patchById[m.id];
    if(p){ m.deltas = p.deltas; m.exp_a = p.exp_a; }
  });
  invalidateCache();
  // Archivierte Saison-Snapshots invalidieren → autoArchiveSeasons wird sie neu schreiben
  // (mit den frisch berechneten DB-Deltas → konsistent zu Profil/Recap).
  const pastIds = allPastSeasons();
  const wipeArchives = pastIds.map(sid =>
    sb.from('seasons').update({top_elo: JSON.stringify([])}).eq('id', sid)
  );
  await runBatch(wipeArchives);
  // Lokal: top_elo leeren, damit autoArchiveSeasons sie als stale erkennt
  seasons.forEach(s => {
    if(pastIds.includes(s.id)) s.top_elo = JSON.stringify([]);
  });
  // Saison-Elo in DB synchronisieren
  await syncSeasonEloToDB();
  // Saisons neu archivieren mit den frischen Werten
  await autoArchiveSeasons();
}

