// ╔═══ §2.7 ─── RANG-SYSTEM (Durchschnitts-Saison-Elo) ─────────────────╗
//     Spieler-Rang ergibt sich aus dem durchschnittlichen Saison-Elo über
//     alle absolvierten Saisons.
// ╚═════════════════════════════════════════════════════════════════════════╝
const RANKS=[
  {label:'Legende',   icon:'crown',  color:'var(--gold)',   pct:0.10},
  {label:'Elite',     icon:'star',   color:'var(--purple)', pct:0.30},
  {label:'Stark',     icon:'medal',  color:'var(--acid)',   pct:0.60},
  {label:'Solide',    icon:'shield', color:'var(--blue)',   pct:0.85},
  {label:'Einsteiger',icon:'user',   color:'var(--orange)', pct:1.00},
];

function getSeasonAvgElos(){
  // Direkter Lookup aus getGlobalSim — der globale Sim hat bereits Karriere-Elo
  // (gewichteter Durchschnitt aller Saison-End-Elos). Vermeidet Doppelberechnung.
  const sim=getGlobalSim();
  const avgs={};
  players.forEach(p=>{
    avgs[p.id]=sim.careerElo[p.id]!==null && sim.careerElo[p.id]!==undefined
      ? Math.round(sim.careerElo[p.id]) : null;
  });
  return avgs;
}
function getAllPlayerRanks(){
  const key='allRanks_'+matches.length+'_'+_cache.version;
  if(_cache._allRanksKey===key) return _cache._allRanksData;
  const avgs=getSeasonAvgElos();
  const ranked=players
    .filter(p=>!p.hidden&&avgs[p.id]!==null&&avgs[p.id]!==undefined)
    .sort((a,b)=>avgs[b.id]-avgs[a.id]);
  const result={};
  ranked.forEach((p,idx)=>{
    const pct=(idx+1)/ranked.length;
    const rank=RANKS.find(r=>pct<=r.pct)||RANKS[RANKS.length-1];
    result[p.id]={...rank,avg:avgs[p.id]};
  });
  _cache._allRanksKey=key;
  _cache._allRanksData=result;
  return result;
}

function getPlayerRank(id){
  return getAllPlayerRanks()[id]||null;
}

function rankBadgeHtml(id, size='sm'){
  const r=getPlayerRank(id); if(!r) return '';
  const pad=size==='lg'?'6px 14px':'3px 10px';
  const fs=size==='lg'?'13px':'10px';
  const icSize=size==='lg'?'14px':'11px';
  return `<span style="display:inline-flex;align-items:center;gap:5px;
    background:var(--surface2);border:1px solid var(--line2);
    border-radius:20px;padding:${pad};font-size:${fs};font-weight:700;color:${r.color}">
    <span class="ic svg-ic" style="font-size:${icSize};color:${r.color}">${svgI(r.icon)}</span>${r.label}
  </span>`;
}

// Metriken der Gesamt-Rangliste (Filter-Buttons)
const METRICS=[['elo','Elo'],['winrate','Siegrate'],['goaldiff','Tordiff'],['streak','Serie'],['games','Spiele']];

