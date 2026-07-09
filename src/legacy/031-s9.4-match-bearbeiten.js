// ╔═══ §9.4 ─── MATCH BEARBEITEN ───────────────────────────────────────╗
//     Edit-Sheet für nachträgliche Korrektur eines Matches.
// ╚═════════════════════════════════════════════════════════════════════════╝
let E={};  // Edit-Zustand
function showEditMatch(mid){
  const m=matches.find(x=>x.id===mid);if(!m)return;
  E={id:m.id,A1:m.a1,A2:m.a2,B1:m.b1,B2:m.b2,pA1:m.a1_pos,pA2:m.a2_pos,pB1:m.b1_pos,pB2:m.b2_pos,sa:m.score_a,sb:m.score_b};
  const gSim=getGlobalSim();
  const sortElo=p=>gSim.careerElo[p.id]??p.elo;
  const showElo=p=>Math.round(gSim.elo[p.id]??cfg.start_elo);
  const opts=sel=>`<option value="">Spieler…</option>`+
    [...players].sort((a,b)=>sortElo(b)-sortElo(a)).map(p=>`<option value="${p.id}" ${E[sel]===p.id?'selected':''}>${esc(p.name)} · ${showElo(p)}</option>`).join('');
  const pos=k=>`<select data-epos="${k}"><option value="atk" ${E['p'+k]==='atk'?'selected':''}>↑ Sturm</option><option value="def" ${E['p'+k]==='def'?'selected':''}>↓ Abwehr</option></select>`;
  const slot=(t,n)=>`<div class="slot">
    <div class="psel"><select data-ep="${t}${n}">${opts(t+n)}</select></div>
    <div class="possel">${pos(t+n)}</div></div>`;
  openSheet(`<h3>Match bearbeiten</h3><div class="sheet-sub">Änderungen lösen eine Neuberechnung aus</div>
    <div class="builder" style="margin-top:16px">
      <div class="team-block A"><div class="team-label">Team A</div>${slot('A',1)}${slot('A',2)}</div>
      <div class="vs-mid"><span class="line"></span><span class="vs">VS</span><span class="line"></span></div>
      <div class="team-block B"><div class="team-label">Team B</div>${slot('B',1)}${slot('B',2)}</div>
    </div>
    <div class="score-board" style="margin-top:12px">
      <div class="score-col A"><div class="cl">Team A</div>
        <div class="stepper"><button data-estep="sa,-1">−</button><span class="sval num" id="esvA">${E.sa}</span><button data-estep="sa,1">+</button></div></div>
      <div class="score-sep">:</div>
      <div class="score-col B"><div class="cl">Team B</div>
        <div class="stepper"><button data-estep="sb,-1">−</button><span class="sval num" id="esvB">${E.sb}</span><button data-estep="sb,1">+</button></div></div>
    </div>
    <div id="editWarn" style="font-size:11px;color:var(--muted);text-align:center;margin-bottom:10px"></div>
    <div class="btn-row">
      <button class="btn ghost sm" id="cancelEdit" style="flex:0 0 38%">Abbrechen</button>
      <button class="btn" id="saveEdit">Speichern</button>
    </div>`);
  const readE=()=>{document.querySelectorAll('[data-ep]').forEach(s=>E[s.dataset.ep]=s.value);
    document.querySelectorAll('[data-epos]').forEach(s=>E['p'+s.dataset.epos]=s.value);};
  const checkE=()=>{const ids=[E.A1,E.A2,E.B1,E.B2];const warn=document.getElementById('editWarn');
    const dup=new Set(ids).size!==ids.filter(Boolean).length;
    const tie=E.sa===E.sb; const incomplete=ids.some(x=>!x);
    const samePosA=E.pA1===E.pA2, samePosB=E.pB1===E.pB2;
    let ok=true,msg='';
    if(incomplete){ok=false;}
    else if(dup){ok=false;msg='Ein Spieler steht doppelt.';}
    else if(tie){ok=false;msg='Unentschieden ist nicht möglich.';}
    else if(samePosA||samePosB){ok=false;msg='Jedes Team braucht Sturm + Abwehr.';}
    if(warn)warn.textContent=msg; document.getElementById('saveEdit').disabled=!ok;};
  document.querySelectorAll('[data-ep],[data-epos]').forEach(s=>s.onchange=()=>{readE();checkE();});
  document.querySelectorAll('[data-estep]').forEach(b=>b.onclick=()=>{const[k,d]=b.dataset.estep.split(',');
    E[k]=Math.max(0,E[k]+(+d));document.getElementById(k==='sa'?'esvA':'esvB').textContent=E[k];checkE();});
  document.getElementById('cancelEdit').onclick=()=>showMatchDetail(mid);
  document.getElementById('saveEdit').onclick=async()=>{
    readE(); const ids=[E.A1,E.A2,E.B1,E.B2];
    if(ids.some(x=>!x)||new Set(ids).size!==4||E.sa===E.sb){toast('Eingabe unvollständig',true);return;}
    closeSheet(true); toast('Speichere & berechne neu…');
    const winner=E.sa>E.sb?'A':'B';
    // Match-Zeile aktualisieren (Deltas folgen aus der Neuberechnung)
    await sb.from('matches').update({
      a1:E.A1,a1_pos:E.pA1,a2:E.A2,a2_pos:E.pA2,b1:E.B1,b1_pos:E.pB1,b2:E.B2,b2_pos:E.pB2,
      score_a:E.sa,score_b:E.sb,winner
    }).eq('id',E.id);
    // lokale Kopie für die Neuberechnung anpassen
    const updated=matches.map(x=>x.id===E.id
      ?{...x,a1:E.A1,a1_pos:E.pA1,a2:E.A2,a2_pos:E.pA2,b1:E.B1,b1_pos:E.pB1,b2:E.B2,b2_pos:E.pB2,score_a:E.sa,score_b:E.sb,winner}
      :x);

    invalidateCache(['global', 'stats', 'awards', 'teams', 'period', 'badges']);
    await persistRecalc(updated);
    toast('Gespeichert & neu berechnet','ok'); await loadAll();
  };
  checkE();
}

