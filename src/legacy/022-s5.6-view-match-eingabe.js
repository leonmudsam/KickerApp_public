// ╔═══ §5.6 ─── VIEW: MATCH-EINGABE ────────────────────────────────────╗
//     Spieler-Auswahl + Score-Eingabe für neues Match.
// ╚═════════════════════════════════════════════════════════════════════════╝
let M={A1:'',A2:'',B1:'',B2:'',pA1:'atk',pA2:'def',pB1:'atk',pB2:'def',sa:0,sb:0};
function vMatch(){
  const pos=k=>`<select data-pos="${k}"><option value="atk" ${M['p'+k]==='atk'?'selected':''}>↑ Sturm</option><option value="def" ${M['p'+k]==='def'?'selected':''}>↓ Abwehr</option></select>`;
  const slot=(t,n)=>{
    const key=t+n;
    const sel=M[key]?pmap()[M[key]]:null;
    return `<div class="slot"><div class="psel"><div class="combo">
      <input type="text" data-combo="${key}" placeholder="Spieler tippen…" autocomplete="off"
        value="${sel?esc(sel.name):''}" class="${sel?'filled':''}">
      <div class="combo-list" data-combolist="${key}"></div>
    </div></div><div class="possel">${pos(key)}</div></div>`;
  };
  return `
    <div class="view-head"><h2>Match</h2><p>Aufstellen, Tore eintragen, speichern</p></div>
    <div class="builder">
      <div class="team-block A"><div class="team-label">Team A <span class="tag" id="avgA"></span></div>${slot('A',1)}${slot('A',2)}</div>
      <div class="vs-mid"><span class="line"></span><span class="vs">VS</span><span class="line"></span></div>
      <div class="team-block B"><div class="team-label">Team B <span class="tag" id="avgB"></span></div>${slot('B',1)}${slot('B',2)}</div>
    </div>
    <div class="score-board" style="margin-top:12px">
      <div class="score-col A"><div class="cl">Team A</div>
        <div class="stepper"><button data-step="sa,-1">−</button><span class="sval num" id="svA" data-scoreedit="sa">${M.sa}</span><button data-step="sa,1">+</button></div></div>
      <div class="score-sep">:</div>
      <div class="score-col B"><div class="cl">Team B</div>
        <div class="stepper"><button data-step="sb,-1">−</button><span class="sval num" id="svB" data-scoreedit="sb">${M.sb}</span><button data-step="sb,1">+</button></div></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:-4px 0 10px">
      <span style="font-size:10.5px;color:var(--muted)">Tipp: auf die Zahl tippen (0–10)</span>
      <button class="btn ghost" id="shuffleBtn" style="padding:8px 14px;font-size:11px;border-radius:10px">Mischen</button>
    </div>
    <div id="previewSlot"></div>
    <div class="btn-row" style="margin-top:4px">
      <button class="btn ghost sm" id="clearM" style="flex:0 0 38%">Reset</button>
      <button class="btn" id="saveM" disabled>Speichern</button>
    </div>`;
}

