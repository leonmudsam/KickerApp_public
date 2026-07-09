// ╔═══ §9.1 ─── BILANZEN-SHEET (Mitspieler-Liste) ──────────────────────╗
//     H2H-Bilanz gegen alle Mitspieler.
// ╚═════════════════════════════════════════════════════════════════════════╝
// Aufgerufen aus dem Profil-Sheet via ppH2HBtn. Zeigt ALLE Mitspieler mit
// ≥3 gemeinsamen Matches, sortiert nach Häufigkeit. Pro Zeile: Avatar,
// Name, T/G-Bilanz, Total. Klick → showH2H (asymmetrisch: Profil-Spieler
// zuerst, damit "asOppForA" aus seiner Sicht aggregiert).
function showPlayerH2HList(playerId){
  const p = pmap()[playerId]; if(!p) return;
  _sheetSetReopen(()=>showPlayerH2HList(playerId));
  const h2hList = playerH2HList(playerId, 3);
  const pmL = pmap();

  const miniAv = (pp) => {
    const em = pp.avatar_id ? avatarEmoji(pp.avatar_id) : null;
    if(em) return `<div style="width:36px;height:36px;border-radius:50%;background:var(--surface3);display:grid;place-items:center;font-size:18px;flex-shrink:0">${em}</div>`;
    return `<div style="width:36px;height:36px;border-radius:50%;background:${avColor(pp.id)};display:grid;place-items:center;font-size:13px;font-family:'Archivo Black',sans-serif;color:#0a0c0b;flex-shrink:0">${esc(initials(pp.name))}</div>`;
  };

  const rows = h2hList.map(x => {
    const other = pmL[x.oid]; if(!other) return '';
    const teamChip = x.teamG
      ? `<span style="color:var(--blue);font-weight:700">${x.teamW}-${x.teamG-x.teamW}</span><span style="color:var(--muted);font-size:9px;margin-left:2px">T</span>`
      : '';
    const oppChip = x.oppG
      ? `<span style="color:var(--purple);font-weight:700">${x.oppW}-${x.oppG-x.oppW}</span><span style="color:var(--muted);font-size:9px;margin-left:2px">G</span>`
      : '';
    const sep = (teamChip && oppChip) ? `<span style="color:var(--faint);margin:0 6px">·</span>` : '';
    return `<div class="rrow" data-h2h="${esc(playerId+'|'+x.oid)}" style="padding:11px 13px;display:flex;align-items:center;gap:10px;cursor:pointer">
      ${miniAv(other)}
      <div style="flex:1;min-width:0">
        <div class="rname" style="font-size:13px;line-height:1.15">${esc(other.name)}</div>
        <div class="num" style="font-size:11px;margin-top:3px;font-family:'Sometype Mono',monospace">${teamChip}${sep}${oppChip}</div>
      </div>
      <div class="num" style="font-size:11px;color:var(--muted);flex-shrink:0">${x.total}</div>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-linecap="round" style="flex-shrink:0;opacity:.7"><path d="M9 18l6-6-6-6"/></svg>
    </div>`;
  }).join('');

  openSheet(`
    <div style="display:flex;align-items:center;gap:14px">
      ${avHtml(p,"width:48px;height:48px;border-radius:14px;font-size:18px")}
      <div><h3>Bilanzen</h3><div class="sheet-sub">${esc(p.name)} · ${h2hList.length} Mitspieler</div></div>
    </div>
    <div style="font-size:10px;color:var(--muted);font-family:'Sometype Mono',monospace;letter-spacing:.04em;margin-top:14px;margin-bottom:10px">
      <span style="color:var(--blue);font-weight:700">T</span> = als Team · <span style="color:var(--purple);font-weight:700">G</span> = als Gegner · Tap für Details
    </div>
    ${h2hList.length ? `<div class="rlist">${rows}</div>` : emptyState('swords','Noch keine Mitspieler mit min. 3 Begegnungen')}
    <button class="btn ghost sm" id="backToPlayerH2H" style="margin-top:16px">← Zurück zum Profil</button>
  `);

  // Sheet-lokale Handler: H2H-Klicks öffnen das H2H-Detail-Sheet
  const sheetEl = document.getElementById('sheet');
  if(sheetEl){
    sheetEl.querySelectorAll('[data-h2h]').forEach(el=>{
      el.onclick = () => {
        const [a,b] = el.dataset.h2h.split('|');
        if(a && b){ sheetNav(()=>showH2H(a,b)); }
      };
    });
  }
  const back = document.getElementById('backToPlayerH2H');
  if(back) back.onclick = () => closeSheet();
}

// Saison-Auszeichnungen eines Spielers
function playerSeasonAwards(id){
  // Cache-Schlüssel muss auch die Version der 'seasons' berücksichtigen,
  // da sich diese unabhängig von `matches` ändern können.
  const key='playerSeasonAwards_'+id+'_'+seasons.length+'_'+_cache.version;
  if(!_cache._playerSeasonAwards) _cache._playerSeasonAwards={};
  if(_cache._playerSeasonAwards[key]) return _cache._playerSeasonAwards[key];

  const result=seasons.filter(s=>s.player_id===id||s.team_p1===id||s.team_p2===id);
  _cache._playerSeasonAwards[key]=result;
  return result;
}


function seasonBtnHtml(id){
  const sa=playerSeasonAwards(id);
  if(!sa.length) return '';
  return `
    <div class="rrow" id="playerSeasonBtn" style="margin-top:8px;cursor:pointer;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:12px">
        <span class="ic svg-ic" style="font-size:22px;color:var(--gold)">${svgI('trophy')}</span>
        <div><div class="rname">Saison-Titel</div>
          <div class="rmeta">${(()=>{let n=0;sa.forEach(s=>{if(s.player_id===id)n++;if(s.team_p1===id||s.team_p2===id)n++;});return n;})()} Titel</div></div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;color:var(--ink2)">
        ${(()=>{const out=[];sa.forEach(s=>{
          if(s.player_id===id) out.push(`<span class="ic svg-ic" style="font-size:14px;color:var(--gold)">${svgI('trophy')}</span>`);
          if(s.team_p1===id||s.team_p2===id) out.push(`<span class="ic svg-ic" style="font-size:14px;color:var(--blue)">${svgI('handshake')}</span>`);
        });return out.slice(0,4).join('');})()}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </div>`;
}
function showPlayerSeasons(playerId){
  const p=pmap()[playerId];if(!p)return;
  _sheetSetReopen(()=>showPlayerSeasons(playerId));
  const sa=playerSeasonAwards(playerId);
  const rows=sa.flatMap(s=>{
    const isPlayer=s.player_id===playerId;
    const isTeam=s.team_p1===playerId||s.team_p2===playerId;
    const mate=isTeam?(s.team_p1===playerId?s.team_p2:s.team_p1):null;
    const out=[];
    if(isPlayer) out.push(`<div class="rrow" style="cursor:default">
      <span class="ic svg-ic" style="font-size:22px;color:var(--gold)">${svgI('trophy')}</span>
      <div class="rmid"><div class="rname">Player of the Season</div>
        <div class="rmeta">${s.label}</div></div>
    </div>`);
    if(isTeam) out.push(`<div class="rrow" style="cursor:default">
      <span class="ic svg-ic" style="font-size:22px;color:var(--blue)">${svgI('handshake')}</span>
      <div class="rmid"><div class="rname">Team of the Season</div>
        <div class="rmeta">${s.label}${mate?' · mit '+esc(pname(mate)):''}</div></div>
    </div>`);
    return out;
  }).join('');
  openSheet(`
    <div style="display:flex;align-items:center;gap:14px">
      ${avHtml(p,"width:48px;height:48px;border-radius:14px;font-size:18px")}
      <div><h3>Saison-Titel</h3><div class="sheet-sub">${esc(p.name)} · ${(()=>{let n=0;sa.forEach(s=>{if(s.player_id===playerId)n++;if(s.team_p1===playerId||s.team_p2===playerId)n++;});return n;})()} Titel</div></div>
    </div>
    <div class="rlist" style="margin-top:16px">${rows}</div>
    <button class="btn ghost sm" id="backToPlayer3" style="margin-top:14px">← Zurück zum Profil</button>
  `);
  const back=document.getElementById('backToPlayer3');
  if(back) back.onclick=()=>closeSheet();
}

function showAddPlayer(){
  openSheet(`<h3>Neuer Spieler</h3><div class="sheet-sub">Startet bei ${cfg.start_elo} Elo</div>
    <input type="text" class="text-in" id="newName" placeholder="Name…" style="margin-top:18px" autofocus>
    <button class="btn" id="confirmAdd" style="margin-top:12px">Hinzufügen</button>`);
  const ni=document.getElementById('newName');ni.focus();
  const go=async()=>{const n=ni.value.trim();if(!n){toast('Name fehlt',true);return;}
    const{error}=await sb.from('players').insert({name:n,elo:cfg.start_elo,atk:0.5});
    if(error){toast(error.message.includes('duplicate')?'Name existiert':'Fehler',true);return;}
    closeSheet(true);toast('Spieler angelegt','ok');await loadAll();};
  document.getElementById('confirmAdd').onclick=go;
  ni.onkeydown=e=>{if(e.key==='Enter')go();};
}

