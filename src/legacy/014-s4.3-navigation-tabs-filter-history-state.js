// ╔═══ §4.3 ─── NAVIGATION (Tabs/Filter/History-State) ─────────────────╗
//     setTab() ist die zentrale Wechsel-Funktion. tab + period + filterPos +
//     filterPlayer steuern, was render() zeichnet.
// ╚═════════════════════════════════════════════════════════════════════════╝
const NAV=[
  ['ranking','Liga',`<path d="M3 13h4v7H3zM10 4h4v16h-4zM17 9h4v11h-4z"/>`],
  ['positions','Positionen',`<circle cx="12" cy="8" r="4"/><path d="M5 21v-1a7 7 0 0114 0v1"/>`],
  ['awards','Awards',`<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM5 9a2 2 0 01-2-2V5h4M19 9a2 2 0 002-2V5h-4"/>`],
  ['teams','Teams',`<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20v-1a6 6 0 0112 0v1M15 20v-1a5 5 0 015-1"/>`],
  ['history','Verlauf',`<path d="M3 3v6h6M3 9a9 9 0 109-6"/><path d="M12 7v5l3 2"/>`]
];
function renderNav(){
  document.getElementById('botnav').innerHTML=NAV.map(([id,lb,ic])=>
    `<button data-nav="${id}" class="${tab===id?'on':''}">
      <span class="ic"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ic}</svg></span>
      <span class="lb">${lb}</span></button>`).join('');
  document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{tab=b.dataset.nav;teamSearch='';window.scrollTo(0,0);render();});
  // FAB nur außerhalb des Match-Tabs sinnvoll
  document.getElementById('fab').style.display = 'grid';
}

function render(){
  renderNav();
  const v={ranking:vRanking,positions:vPositions,awards:vAwards,teams:vTeams,history:vHistory,match:vMatch,settings:vSettings}[tab];
  document.getElementById('main').innerHTML=`<section class="view active">${v()}</section>`;
  bind();
}

