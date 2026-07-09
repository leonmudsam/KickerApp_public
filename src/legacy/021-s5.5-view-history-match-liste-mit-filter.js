// ╔═══ §5.5 ─── VIEW: HISTORY (Match-Liste mit Filter) ─────────────────╗
//     Filterbar nach Spieler. Zeigt Badge-Chips pro Match.
// ╚═════════════════════════════════════════════════════════════════════════╝
function vHistory(){
  if(!matches.length)return `<div class="view-head"><h2>Verlauf</h2></div>${emptyState('scroll','Noch keine Matches')}`;
  let list=[...matches].reverse();
  if(histFilter!=='all')
    list=list.filter(m=>[m.a1,m.a2,m.b1,m.b2].includes(histFilter));
  
  // ═══ PAGINIERUNGSLOGIK ═══
  const ITEMS_PER_PAGE = 20; // Anzahl der Matches pro Seite
  const currentPage = _histPage; // Nutze die globale Variable
  const totalPages = Math.ceil(list.length / ITEMS_PER_PAGE);
  const paginatedList = list.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
  
  const opts=`<option value="all">Alle Spieler</option>`+
    [...players].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${p.id}" ${histFilter===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
  
  const rows=paginatedList.map(m=>{
    const aWon=m.winner==='A';
    const tA=`${pname(m.a1)} & ${pname(m.a2)}`, tB=`${pname(m.b1)} & ${pname(m.b2)}`;
    const dl=ids=>ids.map(id=>{const d=(m.deltas||{})[id]||0;
      return `<span><b>${esc(pname(id))}</b> <span class="${d>=0?'delta-v pos':'delta-v neg'}" style="font-size:11px">${d>=0?'+':''}${Math.round(d)}</span></span>`;}).join('');
    // Kompakte Badge-Icons für errungene Auszeichnungen
    const earned=badgesEarnedInMatch(m.id);
    const badgeChips=earned.length?`<div style="display:flex;gap:3px;align-items:center;margin-top:4px;flex-wrap:wrap">${earned.map(e=>
      `<span style="font-size:11px;background:var(--surface3);padding:2px 6px;border-radius:7px;display:inline-flex;align-items:center;gap:4px;color:var(--ink2)">${badgeIc(e.badge,'12px')}<span style="font-size:10px">${esc(pname(e.playerId).split(' ')[0])}</span></span>`
    ).join('')}</div>`:'';
    return `<div class="mrow" data-match="${m.id}">
      <div class="mrow-top">
        <div class="mteam ${aWon?'won':'lost'}">${esc(tA)}</div>
        <div class="mscore num">${m.score_a}:${m.score_b}</div>
        <div class="mteam r ${!aWon?'won':'lost'}">${esc(tB)}</div>
      </div>
      <div class="mrow-bot"><div class="mdeltas">${dl([m.a1,m.a2,m.b1,m.b2])}</div></div>
      ${badgeChips}
      <div class="mrow-bot" style="margin-top:6px"><span>${dateStr(m.created_at)}</span>
        <span data-delmatch="${m.id}" style="color:var(--acid2);display:inline-flex;align-items:center;gap:5px">${svgI('edit')} bearbeiten</span></div>
    </div>`;
  }).join('');

  // ═══ PAGINIERUNGS-CONTROLS ═══
  const paginationControls = totalPages > 1 ? `
    <div style="display:flex;align-items:center;gap:8px;margin-top:16px;padding-bottom:20px;width:100%">
      <button class="btn ghost sm" id="prevPageBtn" style="flex:1;min-width:0;padding:10px 8px;white-space:nowrap" ${currentPage===0?'disabled':''}>← Vorher</button>
      <div style="flex-shrink:0;color:var(--muted);font-size:11px;font-family:'Sometype Mono',monospace;text-align:center;padding:0 2px;white-space:nowrap">
        <b style="color:var(--ink)">${currentPage+1}</b> / <b style="color:var(--ink)">${totalPages}</b>
      </div>
      <button class="btn ghost sm" id="nextPageBtn" style="flex:1;min-width:0;padding:10px 8px;white-space:nowrap" ${currentPage>=(totalPages-1)?'disabled':''}>Weiter →</button>
    </div>
  ` : '';

  return `
    <div class="view-head"><h2>Verlauf</h2><p>${list.length} Matches</p></div>
    <div class="search" style="margin-bottom:14px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z"/></svg>
      <select id="histSel" style="padding-left:40px">${opts}</select>
    </div>
    ${list.length?`<div class="mlist">${rows}</div>${paginationControls}`:emptyState('search','Keine Matches für diesen Filter')}`;
}


