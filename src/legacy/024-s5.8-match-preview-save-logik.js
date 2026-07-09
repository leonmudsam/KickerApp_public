// ╔═══ §5.8 ─── MATCH PREVIEW & SAVE-LOGIK ─────────────────────────────╗
//     Live-Preview der Elo-Deltas + doSaveMatch() schreibt Match und zeigt
//     Achievement-Toasts (Badge-Trigger via getBadgeEarnedCache).
// ╚═════════════════════════════════════════════════════════════════════════╝
function readM(){
  document.querySelectorAll('[data-p]').forEach(s=>M[s.dataset.p]=s.value);
  document.querySelectorAll('[data-pos]').forEach(s=>M['p'+s.dataset.pos]=s.value);
}
function validM(){const ids=[M.A1,M.A2,M.B1,M.B2];
  return !ids.some(x=>!x)&&new Set(ids).size===4&&M.sa!==M.sb
    &&M.pA1!==M.pA2&&M.pB1!==M.pB2;}
function teamsFromM(){return{teamA:[{id:M.A1,pos:M.pA1},{id:M.A2,pos:M.pA2}],teamB:[{id:M.B1,pos:M.pB1},{id:M.B2,pos:M.pB2}]};}
function updatePreview(){
  const slot = document.getElementById('previewSlot');
  const save = document.getElementById('saveM');
  if(!slot) return;
  const P = pmap();
  const gSim = getGlobalSim();
  const seasonElo = id => gSim.elo[id] ?? cfg.start_elo;

  const setAvg = (el,a,b) => {
    const e = document.getElementById(el);
    if(e && P[a] && P[b]) e.textContent = 'Ø '+Math.round((seasonElo(a)+seasonElo(b))/2)+' (Saison)';
    else if(e) e.textContent = '';
  };
  setAvg('avgA', M.A1, M.A2); setAvg('avgB', M.B1, M.B2);

  const ids = [M.A1,M.A2,M.B1,M.B2].filter(Boolean);
  if(new Set(ids).size !== ids.length){
    slot.innerHTML = `<div class="preview" style="color:var(--red);font-size:12px;text-align:center">Ein Spieler steht doppelt.</div>`;
    save.disabled = true; return;
  }
  // Beide Spieler eines Teams müssen unterschiedliche Positionen haben
  const allFour = ids.length === 4;
  if(allFour && (M.pA1===M.pA2 || M.pB1===M.pB2)){
    slot.innerHTML = `<div class="preview" style="color:var(--red);font-size:12px;text-align:center">Jedes Team braucht Sturm + Abwehr.</div>`;
    save.disabled = true; return;
  }
  if(!validM()){slot.innerHTML=''; save.disabled=true; return;}

  const winner = M.sa > M.sb ? 'A' : 'B';
  const{teamA, teamB} = teamsFromM();
  const c = computeMatch(teamA, teamB, winner, M.sa, M.sb);
  const pA = Math.round(c.expA*100), pB = 100-pA;
  const line = s => {
    const d = c.res[s.id];
    return `<div class="delta-row">
      <span class="dn">${esc(P[s.id].name)}
        <span class="chip ${s.pos}">${s.pos==='atk'?'STU':'ABW'}</span>
      </span>
      <span class="delta-v ${d>=0?'pos':'neg'}">${d>=0?'+':''}${Math.round(d)}</span>
    </div>`;
  };
  slot.innerHTML = `<div class="preview">
    <div class="prob">
      <div class="pa" style="width:${pA}%">${pA}%</div>
      <div class="pb" style="width:${pB}%">${pB}%</div>
    </div>
    <div class="prob-cap">Siegchance (Saison-Elo) · Team ${winner} gewinnt ${M.sa}:${M.sb}
      ${c.mov>1.08?' · Kantersieg ×'+c.mov.toFixed(2):''}
    </div>
    <div class="delta-list">
      ${line(teamA[0])}${line(teamA[1])}
      <div class="delta-div"></div>
      ${line(teamB[0])}${line(teamB[1])}
    </div>
  </div>`;
  save.disabled = false;
}

async function doSaveMatch(){
  readM(); if(!validM()){toast('Match unvollständig',true);return;}
  const winner = M.sa > M.sb ? 'A' : 'B';
  const{teamA, teamB} = teamsFromM();

  // players.elo = Saison-Elo → direkt nutzen
  const c = computeMatch(teamA, teamB, winner, M.sa, M.sb);

  const row = {
    a1:M.A1, a1_pos:M.pA1, a2:M.A2, a2_pos:M.pA2,
    b1:M.B1, b1_pos:M.pB1, b2:M.B2, b2_pos:M.pB2,
    score_a:M.sa, score_b:M.sb, winner, deltas:c.res, exp_a:c.expA
  };
  // insert(...).select() gibt die erzeugte Zeile inkl. id + created_at zurück,
  // damit die lokale Kopie exakt der DB entspricht (created_at wird für die
  // Saison-Filterung in matchesInSeason zwingend gebraucht).
  const{data:inserted, error} = await sb.from('matches').insert(row).select().single();
  if(error){toast('Fehler: '+error.message,true);return;}

  // Fallback: falls select() nicht greift, created_at lokal setzen,
  // sonst fiele das frische Match aus matchesInSeason heraus.
  const savedRow = inserted || {...row, created_at:new Date().toISOString()};

  // Lokal updaten, dann über die EINE kanonische Engine neu berechnen.
  // persistRecalc schreibt atk, Match-Deltas und Saison-Elos konsistent.
  matches = [...matches, savedRow];
  invalidateCache(['global', 'stats', 'awards', 'badges']);
  await persistNewMatch(savedRow.id);

  // ─── ACHIEVEMENT-TOASTS ───────────────────────────────────────────
  // Nach dem persist+invalidate liefert badgesEarnedInMatch genau die in
  // DIESEM Match neu erreichten Badges (Pre-State-Vergleich → echte Neu-
  // erreichungen, keine Wiederholungen). Sequenzielle Queue zeigt sie der
  // Reihe nach, jeder Toast 2.6s. Spielername aus pname() konsistent zur
  // gesamten App.
  //
  // ⚠ Common-Badges (grün) werden NICHT als Toast gezeigt, weil sie zu
  // häufig feuern und sonst eine Toast-Kaskade von 5+ PopUps entsteht.
  // Sie bleiben im Match-Review sichtbar und zählen im Profil weiter.
  const newBadges = badgesEarnedInMatch(savedRow.id);
  const toastWorthy = newBadges.filter(e => rarityOf(e.badge.id) !== 'common');
  if(toastWorthy.length){
    toastWorthy.forEach(e => showAchievementToast(pname(e.playerId), e.badge));
  } else {
    toast('Match gespeichert', 'ok');
  }
  M = {A1:'',A2:'',B1:'',B2:'',pA1:'atk',pA2:'def',pB1:'atk',pB2:'def',sa:0,sb:0};
  tab = 'ranking'; await loadAll();
}

