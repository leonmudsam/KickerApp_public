// ╔═══ §5.4 ─── VIEW: TEAMS ────────────────────────────────────────────╗
//     Team-Tab mit Team-Statistiken und Top-Teams.
// ╚═════════════════════════════════════════════════════════════════════════╝
function vTeams(){
  const T=teamStats().filter(t=>t.g>=4);
  if(!T.length)return `<div class="view-head"><h2>Teams</h2><p>Min. 4 gemeinsame Spiele</p></div>${emptyState('handshake','Noch nicht genug Daten')}`;
  const showBest=teamView!=='worst';
  
  // ═══ SORTIERUNG BASIEREND AUF teamSort VARIABLE ═══
  let sorted;
  if(teamSort==='wr'){
    // Standard: Nach Winrate
    sorted=[...T].sort((a,b)=>(b.w/b.g)-(a.w/a.g)||(b.gf-b.ga)-(a.gf-a.ga)||b.g-a.g);
  } else if(teamSort==='gd'){
    // Nach Tordifferenz
    sorted=[...T].sort((a,b)=>(b.gf-b.ga)-(a.gf-a.ga)||(b.w/b.g)-(a.w/a.g)||b.g-a.g);
  } else if(teamSort==='elo'){
    // Nach gesamtem Elo-Zuwachs (über alle Saisons hinweg)
    const gSim=getGlobalSim();
    sorted=[...T].sort((a,b)=>{
      const keyA=[a.ids[0],a.ids[1]].sort().join('|');
      const keyB=[b.ids[0],b.ids[1]].sort().join('|');
      const eloA=gSim.teamElo[keyA]||0;
      const eloB=gSim.teamElo[keyB]||0;
      return eloB-eloA || (b.w/b.g)-(a.w/a.g) || (b.gf-b.ga)-(a.gf-a.ga);
    });
  }
 else {
    // Fallback
    sorted=[...T].sort((a,b)=>(b.w/b.g)-(a.w/a.g)||(b.gf-b.ga)-(a.gf-a.ga)||b.g-a.g);
  }
  
  const arr=showBest?sorted:[...sorted].reverse();


  // Top-3 Akzente (Gold/Silber/Bronze) — Border + Rang-Kachel-Hintergrund
  const TOP=[
    {border:'rgba(247,207,74,.45)', bg:'#f7cf4a', fg:'#1d1700'},
    {border:'rgba(200,208,203,.35)',bg:'#c8d0cb', fg:'#1a1f1c'},
    {border:'rgba(255,120,73,.3)',  bg:'#ff7849', fg:'#2a1108'}
  ];

  const pm=pmap();
  const avPair=(idA,idB)=>{
    const a=pm[idA], b=pm[idB];
    const one=(p,offset)=>{
      if(!p) return `<div style="width:32px;height:32px;border-radius:50%;background:var(--surface3);border:2px solid var(--surface);${offset?'margin-left:-9px':''}"></div>`;
      const em=p.avatar_id?avatarEmoji(p.avatar_id):null;
      if(em) return `<div style="width:32px;height:32px;border-radius:50%;background:var(--surface3);display:grid;place-items:center;font-size:15px;border:2px solid var(--surface);${offset?'margin-left:-9px':''}">${em}</div>`;
      return `<div style="width:32px;height:32px;border-radius:50%;background:${avColor(p.id)};display:grid;place-items:center;font-size:11px;font-family:'Archivo Black',sans-serif;color:#0a0c0b;border:2px solid var(--surface);${offset?'margin-left:-9px':''}">${esc(initials(p.name))}</div>`;
    };
    return `<div style="display:flex;align-items:center;flex-shrink:0">${one(a,false)}${one(b,true)}</div>`;
  };

  const gSim=getGlobalSim();
  const seasonTeamMap=gSim.seasonTeamElo[currentSeason().id]||{};

  // Dezente Team-/Spieler-Suche: filtert das aktuelle (sortierte) Feld nach
  // Spielername ODER kombiniertem Team-Namen. Beim Suchen keine Top-3-Medaillen.
  const _tq = (teamSearch||'').trim().toLowerCase();
  // Tokenisierte Suche: „&" und Leerzeichen trennen die Terme, Reihenfolge egal.
  // Dadurch findet „Leon & Martin", „Martin & Leon", „Leon Martin" und „Martin Leon"
  // dasselbe Duo. Jeder Term muss auf mind. einen der beiden Spielernamen passen.
  const _tqTokens = _tq.split(/[\s&]+/).filter(Boolean);
  const arrF = _tqTokens.length
    ? arr.filter(t => {
        const names = t.ids.map(id => ((pm[id]&&pm[id].name)||'').toLowerCase());
        return _tqTokens.every(tok => names.some(nm => nm.includes(tok)));
      })
    : arr;

  const rows=arrF.map((t,i)=>{
    const wr=Math.round(t.w/t.g*100);
    const gd=t.gf-t.ga;
    const keyTeam=[t.ids[0],t.ids[1]].sort().join('|');
    const eloGain=Math.round(seasonTeamMap[keyTeam]||0);
    
    // ═══ DYNAMISCHE HAUPTMETRIK BASIEREND AUF teamSort ═══
    let mainValue, mainLabel, mainColor;
    if(teamSort==='wr'){
      mainValue=wr+'%';
      mainLabel='WR';
      mainColor='var(--acid)';
    } else if(teamSort==='gd'){
      mainValue=(gd>=0?'+':'')+gd;
      mainLabel='TD';
      mainColor=gd>=0?'var(--acid)':'var(--red)';
    } else if(teamSort==='elo'){
      const eloGainTotal=Math.round(gSim.teamElo[keyTeam]||0);
      mainValue=(eloGainTotal>=0?'+':'')+eloGainTotal;
      mainLabel='Elo';
      mainColor=eloGainTotal>=0?'var(--acid)':'var(--red)';
    }

    
    const isTop=showBest&&i<3&&!_tq;
    const top=isTop?TOP[i]:null;
    const borderColor=top?top.border:'var(--line)';
    const rankBlock=top
      ? `<div style="width:24px;height:24px;border-radius:8px;background:${top.bg};color:${top.fg};display:grid;place-items:center;font-family:'Archivo Black',sans-serif;font-size:12px;flex-shrink:0">${i+1}</div>`
      : `<div style="width:24px;text-align:center;font-family:'Archivo Black',sans-serif;font-size:14px;color:var(--faint);flex-shrink:0">${i+1}</div>`;
    
    return `<div class="rrow" data-team="${esc(t.ids.join('|'))}" style="background:var(--surface);border:1px solid ${borderColor};border-radius:18px;padding:13px 15px;display:block">
      <div style="display:flex;align-items:center;gap:12px">
        ${rankBlock}
        ${avPair(t.ids[0],t.ids[1])}
        <div style="flex:1;min-width:0">
          <div style="font-family:'Archivo Black',sans-serif;font-size:14px;letter-spacing:-.01em;line-height:1.1">${esc(t.ids.map(pname).join(' & '))}</div>
          <div class="num" style="margin-top:4px;font-size:10.5px;color:var(--muted)">${t.w}–${t.g-t.w} · TD ${gd>=0?'+':''}${gd}</div>
        </div>
        <div style="font-family:'Archivo Black',sans-serif;font-size:20px;color:${mainColor};line-height:1;flex-shrink:0">${mainValue}</div>
      </div>
    </div>`;
  }).join('');


  return `
    <div class="view-head"><h2>Teams</h2><p>${arrF.length} Duo${arrF.length===1?'':'s'}${_tq?' gefunden':' mit min. 4 gemeinsamen Spielen'}</p></div>
    <div class="search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>
      </svg>
      <input type="text" id="teamSearch" placeholder="Spieler oder Team suchen…" value="${esc(teamSearch)}">
    </div>
    <div class="seg accent">
      <button data-teamtoggle="best" class="${showBest?'on':''}">▲ Beste</button>
      <button data-teamtoggle="worst" class="${!showBest?'on':''}">▼ Schlechteste</button>
    </div>
    <div class="seg" style="margin-bottom:14px">
      <button data-teamsort="wr" class="${teamSort==='wr'?'on':''}">Winrate</button>
      <button data-teamsort="gd" class="${teamSort==='gd'?'on':''}">Tordiff</button>
      <button data-teamsort="elo" class="${teamSort==='elo'?'on':''}">Elo-Zuwachs</button>
    </div>
    ${arrF.length ? `<div class="rlist">${rows}</div>` : emptyState('search','Keine Teams gefunden')}`;
}


