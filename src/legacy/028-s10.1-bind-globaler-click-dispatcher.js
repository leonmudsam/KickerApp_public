// ╔═══ §10.1 ─── BIND (globaler Click-Dispatcher) ──────────────────────╗
//     Zentrale Stelle, die data-* Attribute auf Click-Handler mappt.
// ╚═════════════════════════════════════════════════════════════════════════╝
function bind(){
  // ranking search & filter
  const rs=document.getElementById('rankSearch');
  if(rs){
    let searchTimeout;
    rs.oninput=()=>{
      rankSearch=rs.value;
      clearTimeout(searchTimeout); // Vorherigen Timer löschen
      searchTimeout = setTimeout(() => { // Neuen Timer setzen
        // Wenn der Zeitraum nicht "all" ist, rendern wir die gesamte Ansicht neu
        if(period!=='all'){ 
          const cur=rs.value, pos=rs.selectionStart; render();
          const n=document.getElementById('rankSearch'); if(n){n.focus();try{n.setSelectionRange(pos,pos);}catch(e){}}
          return;
        }
        // Wenn der Zeitraum "all" ist, aktualisieren wir nur die Rangliste
        let list=activePlayers().map(p=>({p,s:playerStats(p.id)}));
        if(rankSearch) list = list.filter(x => x.p.name.toLowerCase().includes(rankSearch.toLowerCase()));
        const gSim=getGlobalSim();
        const gElo=id=>Math.round(gSim.careerElo[id] ?? cfg.start_elo);
        const listWithElo=list.map(x=>({...x,globalElo:gElo(x.p.id)}));
        const sortFn={elo:(a,b)=>b.globalElo-a.globalElo,winrate:(a,b)=>b.s.wr-a.s.wr||b.s.games-a.s.games,
          goaldiff:(a,b)=>b.s.gd-a.s.gd,streak:(a,b)=>b.s.curStreak-a.s.curStreak,games:(a,b)=>b.s.games-a.s.games}[rankMetric];
        listWithElo.sort(sortFn);
        const cont=document.querySelector('.rlist');
        if(cont){
          cont.innerHTML=listWithElo.length?listWithElo.map((x,i)=>rrow(x.p,x.s,i,rankMetric,x.globalElo)).join(''):'';
          cont.querySelectorAll('[data-detail]').forEach(el=>el.onclick=()=>showPlayer(el.dataset.detail));
        }
      }, 300); // 300ms Verzögerung
    };
  }

  // Teams-Tab-Suche (Spieler oder Team) — analog rankSearch, mit Fokus-Restore.
  const ts=document.getElementById('teamSearch');
  if(ts){
    let teamSearchTimeout;
    ts.oninput=()=>{
      teamSearch=ts.value;
      clearTimeout(teamSearchTimeout);
      teamSearchTimeout=setTimeout(()=>{
        const pos=ts.selectionStart; render();
        const n=document.getElementById('teamSearch'); if(n){n.focus();try{n.setSelectionRange(pos,pos);}catch(e){}}
      }, 300);
    };
  }

  document.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{rankMetric=b.dataset.metric;render();});
  document.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{period=b.dataset.period;rankSearch='';render();});
  document.querySelectorAll('[data-periodsort]').forEach(b=>b.onclick=()=>{periodSort=b.dataset.periodsort;render();});
  // v9: Saison-Tools am Ende der Rangliste (Recap + Positionsverlauf)
  document.querySelectorAll('[data-seasontool]').forEach(b=>b.onclick=()=>{
    if(b.dataset.seasontool==='pos'){ showPositionHistory(); return; }
    const past=seasons.filter(s=>s.id!==currentSeason().id);
    if(past.length) showSeasonRecap(past[0]);
  });
  const ap=document.getElementById('addPlayerBtn');if(ap)ap.onclick=showAddPlayer;

  // positions toggle (reuse rankMetric)
  document.querySelectorAll('[data-postoggle]').forEach(b=>b.onclick=()=>{rankMetric=b.dataset.postoggle;render();});
  document.querySelectorAll('[data-possort]').forEach(b=>b.onclick=()=>{posSort=b.dataset.possort;render();});

  // awards anklickbar
  document.querySelectorAll('[data-award]').forEach(el=>el.onclick=()=>showAward(el.dataset.award));
  document.querySelectorAll('[data-awperiod]').forEach(b=>b.onclick=()=>{awPeriod=b.dataset.awperiod;if(awPeriod!=='season')awSeasonId=null;if(awPeriod!=='week')awWeekStart=null;render();});
  const awSP=document.getElementById('awSeasonPicker');
  if(awSP) awSP.onchange=()=>{awSeasonId=awSP.value;render();};

  // teams toggle (eigene State-Variable teamView)
  document.querySelectorAll('[data-teamtoggle]').forEach(b=>b.onclick=()=>{teamView=b.dataset.teamtoggle;render();});
  
  // teams sort (neue State-Variable teamSort)
  document.querySelectorAll('[data-teamsort]').forEach(b=>b.onclick=()=>{teamSort=b.dataset.teamsort;render();});


  // detail
  document.querySelectorAll('[data-detail]').forEach(el=>el.onclick=()=>showPlayer(el.dataset.detail));
  // team detail
  document.querySelectorAll('[data-team]').forEach(el=>el.onclick=()=>{
    const [a,b]=el.dataset.team.split('|');
    if(a&&b) showTeam(a,b);
  });
  // head-to-head detail (asymmetrisch: erste ID = "Du", zweite = Gegenüber)
  document.querySelectorAll('[data-h2h]').forEach(el=>el.onclick=(e)=>{
    e.stopPropagation();
    const [a,b]=el.dataset.h2h.split('|');
    if(a&&b) showH2H(a,b);
  });
  const dc=document.getElementById('defenderCard');
  if(dc) dc.onclick=()=>{
    const last=seasons.find(s=>s.id!==currentSeason().id);
    if(last&&last.player_id) showPlayer(last.player_id);
  };

  // history filter
  const hs=document.getElementById('histSel');if(hs)hs.onchange=()=>{histFilter=hs.value;render();};
  document.querySelectorAll('[data-match]').forEach(el=>el.onclick=e=>{
    if(e.target.dataset.delmatch)return; showMatchDetail(el.dataset.match);});
  document.querySelectorAll('[data-delmatch]').forEach(el=>el.onclick=e=>{
    e.stopPropagation(); showMatchDetail(el.dataset.delmatch);});

  // ═══ PAGINIERUNGS-BUTTONS FÜR VERLAUFSTAB ═══
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  if(prevPageBtn) prevPageBtn.onclick = () => {
    _histPage = Math.max(0, _histPage - 1);
    render();
  };
  if(nextPageBtn) nextPageBtn.onclick = () => {
    _histPage = _histPage + 1;
    render();
  };

  // match builder
  if(document.getElementById('saveM')){
    // Positions-Dropdown — Partner-Position automatisch umdrehen
    document.querySelectorAll('[data-pos]').forEach(s=>s.onchange=()=>{
      readM();
      // Partner gleicher Team hat immer entgegengesetzte Position
      const k=s.dataset.pos;
      const partner = k==='A1'?'A2':k==='A2'?'A1':k==='B1'?'B2':'B1';
      M['p'+partner] = M['p'+k]==='atk' ? 'def' : 'atk';
      // Partner-Dropdown im DOM nachziehen
      const partnerSel=document.querySelector(`[data-pos="${partner}"]`);
      if(partnerSel) partnerSel.value=M['p'+partner];
      updatePreview();
    });

    // Text-Modus: Combobox mit Vorschlägen
    document.querySelectorAll('[data-combo]').forEach(inp=>bindCombo(inp));

    // Score: Stepper
    document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{
      const[k,d]=b.dataset.step.split(',');M[k]=Math.max(0,Math.min(10,M[k]+(+d)));
      const el=document.getElementById(k==='sa'?'svA':'svB');if(el&&el.tagName!=='INPUT')el.textContent=M[k];updatePreview();});
    // Score: Klick zum Eintippen
    document.querySelectorAll('[data-scoreedit]').forEach(sp=>sp.onclick=()=>makeScoreEditable(sp));

    document.getElementById('clearM').onclick=()=>{M={A1:'',A2:'',B1:'',B2:'',pA1:'atk',pA2:'def',pB1:'atk',pB2:'def',sa:0,sb:0};render();};
    // Durchwechseln: 4 gewählte Spieler random in neue Teams mischen
    const shuf=document.getElementById('shuffleBtn');
    if(shuf) shuf.onclick=()=>{
      const ids=[M.A1,M.A2,M.B1,M.B2].filter(Boolean);
      if(ids.length!==4){toast('Erst 4 Spieler auswählen',true);return;}
      // Fisher-Yates Shuffle
      for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
      M.A1=ids[0];M.A2=ids[1];M.B1=ids[2];M.B2=ids[3];
      // Positionen nach Stärke-Profil: höherer atkStrength = Sturm
      const assignPos=(p1,p2)=>{
        const a1=atkStrength(p1), a2=atkStrength(p2);
        // Wahrscheinlichkeit dass p1 stürmt: basierend auf relativem Stärke-Unterschied
        // Bei gleichem Profil (67% vs 70%) → fast 50/50
        // Bei klarem Unterschied (90% vs 30%) → fast sicher der Stärkere
        const diff=a1-a2; // positiv = p1 ist eher Stürmer
        // sigmoid-artige Mapping: diff=0 → 50%, diff=0.5 → ~88%, diff=-0.5 → ~12%
        const prob=1/(1+Math.exp(-diff*6));
        return Math.random()<prob?{s:p1,d:p2}:{s:p2,d:p1};
      };
      const tA=assignPos(M.A1,M.A2);
      M.pA1=M.A1===tA.s?'atk':'def'; M.pA2=M.A2===tA.s?'atk':'def';
      const tB=assignPos(M.B1,M.B2);
      M.pB1=M.B1===tB.s?'atk':'def'; M.pB2=M.B2===tB.s?'atk':'def';
      toast('Teams gemischt','ok');render();
    };
    document.getElementById('saveM').onclick=doSaveMatch;
    readM();updatePreview();
  }

  // settings sliders
  bindSlider('cfgK','k_factor',v=>v,v=>Math.round(v));
  bindSlider('cfgRisk','risk_split',v=>v/100,v=>Math.round(v));
  bindSlider('cfgPos','pos_swing',v=>v/100,v=>Math.round(v));
  bindSlider('cfgWinBoost','win_boost',v=>v/100,v=>Math.round(v));
  bindSlider('cfgMovDamp','mov_loss_damp',v=>v/100,v=>Math.round(v));
  bindSlider('cfgLowEloLossDamp','low_elo_loss_damp',v=>v/100,v=>Math.round(v));
  bindSlider('cfgBonus','match_bonus',v=>v/10,v=>Math.round(v));
  // Neue Slider
  bindSlider('cfgStartElo','start_elo',v=>v,v=>Math.round(v));
  bindSlider('cfgExpW','exp_weight',v=>v/100,v=>Math.round(v));
  bindSlider('cfgPosMin','pos_min_games',v=>v,v=>Math.round(v));
  bindSlider('cfgMovMax','mov_max_boost',v=>v/100,v=>Math.round(v));
  bindSlider('cfgExpProt','exp_protect_max',v=>v/100,v=>Math.round(v));
  bindSlider('cfgUdElo','underdog_elo_max',v=>v/100,v=>Math.round(v));
  bindSlider('cfgUdGames','underdog_games_max',v=>v/100,v=>Math.round(v));
  bindSlider('cfgNpMult','new_player_mult',v=>v/100,v=>Math.round(v));
  bindSlider('cfgNpMidMult','new_player_mid_mult',v=>v/100,v=>Math.round(v));
  bindSlider('cfgVetDamp','veteran_damp',v=>v/100,v=>Math.round(v));
  const recalcBtn=document.getElementById('recalcBtn');
  if(recalcBtn) recalcBtn.onclick=async()=>{
    if(!confirm('Wirklich alle Matches mit aktuellen Slidern rückwirkend neu berechnen?\n\nAlle gespeicherten Match-Deltas werden überschrieben. Vergangene Saison-Ergebnisse und Awards können sich dadurch ändern.\n\nDieser Vorgang kann nicht rückgängig gemacht werden.')) return;
    toast('Berechne alle Matches neu…');
    await persistRecalc(matches);
    toast('Neuberechnung abgeschlossen','ok');
    await loadAll();
  };
  const forceReloadBtn=document.getElementById('forceReloadBtn');
  if(forceReloadBtn) forceReloadBtn.onclick=forceReload;
  // PHASE 2: Liga-/Mitglieder-/Konto-Bereiche im Einstellungen-Tab
  if(tab==='settings' && typeof bindLeagueSettings==='function') bindLeagueSettings();

  // Ausgeblendete Spieler wieder einblenden
  document.querySelectorAll('[data-unhide]').forEach(btn=>btn.onclick=async()=>{
    await sb.from('players').update({hidden:false}).eq('id',btn.dataset.unhide);
    toast('Eingeblendet','ok');
    await loadAll();
  });
// POTW Recap Button in Wochenansicht
const potwRecapWeekBtn = document.getElementById('potwRecapWeekBtn');
if(potwRecapWeekBtn){
  potwRecapWeekBtn.onclick = () => showPotwRecap();
}
// POTD Recap Button in Tagesansicht — force-Aufruf umgeht localStorage-Check
const potdRecapDayBtn = document.getElementById('potdRecapDayBtn');
if(potdRecapDayBtn){
  potdRecapDayBtn.onclick = () => showPotdRecap({force:true});
}

  };


// Combobox: Tippen filtert Spieler, Auswahl setzt M[key]
function bindCombo(inp){
  const key=inp.dataset.combo;
  const list=document.querySelector(`[data-combolist="${key}"]`);
  const chosenIds=()=>[M.A1,M.A2,M.B1,M.B2].filter((v,i)=>['A1','A2','B1','B2'][i]!==key&&v);
  const renderList=(q)=>{
    const taken=chosenIds();
    const gSim=getGlobalSim();
    const rankElo=p=>gSim.careerElo[p.id]??p.elo; // Karriere-Elo für Sortierung
    const dispElo=p=>Math.round(gSim.elo[p.id]??cfg.start_elo); // Saison-Elo für Anzeige
    let arr=[...activePlayers()].sort((a,b)=>rankElo(b)-rankElo(a)).filter(p=>!taken.includes(p.id));
    if(q)arr=arr.filter(p=>p.name.toLowerCase().includes(q.toLowerCase()));
    if(!arr.length){list.innerHTML=`<div class="combo-opt empty">Kein Treffer</div>`;list.classList.add('show');return;}
    list.innerHTML=arr.slice(0,8).map(p=>`<div class="combo-opt" data-pick="${p.id}">${esc(p.name)}<span class="ce">${dispElo(p)}</span></div>`).join('');
    list.classList.add('show');
    list.querySelectorAll('[data-pick]').forEach(o=>o.onclick=()=>{
      M[key]=o.dataset.pick; const p=pmap()[M[key]];
      inp.value=p.name; inp.classList.add('filled'); list.classList.remove('show');
      readM(); updatePreview();
    });
  };
  inp.onfocus=()=>renderList(inp.value && pmap()[M[key]] && pmap()[M[key]].name===inp.value ? '' : inp.value);
  inp.oninput=()=>{ M[key]=''; inp.classList.remove('filled'); renderList(inp.value); updatePreview(); };
  inp.onblur=()=>setTimeout(()=>list.classList.remove('show'),180);
  // Enter wählt ersten Treffer
  inp.onkeydown=e=>{ if(e.key==='Enter'){const first=list.querySelector('[data-pick]');if(first)first.click();} };
}

// Score per Klick eintippbar machen, nur 0–10
function makeScoreEditable(span){
  const k=span.dataset.scoreedit;
  const inp=document.createElement('input');
  inp.type='number'; inp.min=0; inp.max=10; inp.value=M[k];
  inp.className='sval-input num'; inp.inputMode='numeric';
  span.replaceWith(inp); inp.focus(); inp.select();
  const commit=()=>{
    let v=parseInt(inp.value,10); if(isNaN(v))v=0; v=Math.max(0,Math.min(10,v));
    M[k]=v;
    const ns=document.createElement('span');
    ns.className='sval num'; ns.id=(k==='sa'?'svA':'svB'); ns.dataset.scoreedit=k; ns.textContent=v;
    inp.replaceWith(ns); ns.onclick=()=>makeScoreEditable(ns);
    updatePreview();
  };
  inp.onblur=commit;
  inp.oninput=()=>{ // hart auf 0–10 begrenzen während des Tippens
    if(inp.value!==''){let v=parseInt(inp.value,10);if(!isNaN(v)){if(v>10)inp.value=10;if(v<0)inp.value=0;}}
  };
  inp.onkeydown=e=>{ if(e.key==='Enter')inp.blur(); };
}
function bindSlider(id,key,toState,toLabel){
  const sl=document.getElementById(id);if(!sl)return;
  sl.oninput=()=>{document.getElementById(id+'v').textContent=toLabel(+sl.value);};
  sl.onchange=async()=>{
    const newVal=toState(+sl.value);
    const o={};o[key]=newVal;
    // Lokales State sofort updaten (synchron) damit die Vorschau & nächster
    // Match-Save den neuen Wert sieht. Persistenz folgt asynchron.
    cfg[key]=newVal;
    invalidateCache();
    // PHASE 1: Die Parameter leben pro Liga in leagues.settings (JSONB) —
    // das alte cfg_overrides-Muster (fehlende DB-Spalten) ist damit obsolet.
    let dbOk=false;
    try{
      const ns=Object.assign({},(LK&&LK.settings)||{});
      ns[key]=newVal;
      const {error}=await sb.from('leagues').update({settings:ns}).eq('id',LK.id);
      if(!error){ dbOk=true; LK.settings=ns; }
      else console.warn('Settings-Update fehlgeschlagen für',key,':',error.message);
    }catch(e){
      console.warn('Settings-Update Exception:',e);
    }
    toast(dbOk?'Gespeichert':'Speichern fehlgeschlagen',dbOk?'ok':true);
  };
}

