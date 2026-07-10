// ╔═══ §10.2 ─── SETTINGS-ZUGANG ───────────────────────────────────────╗
//     PHASE 2: Der alte Passwort-Lock (clientseitiges SHA-256, kosmetisch)
//     ist ersetzt: Einstellungen sind für JEDES Liga-Mitglied offen —
//     was wer ändern darf, entscheiden Rollen (LK.role) in der UI und
//     RLS/Trigger serverseitig. Premium-Gates folgen in Phase 3.
// ╚═════════════════════════════════════════════════════════════════════════╝
document.getElementById('settingsBtn').onclick=()=>{tab='settings';render();window.scrollTo(0,0);};

// Recap-Button: nur sichtbar wenn es archivierte Saisons gibt
(function setupRecapBtn(){
  const btn=document.getElementById('recapBtn');
  if(!btn)return;
  // updateRecapBtn wird auch nach Saison-Archivierung aufgerufen
  window._updateRecapBtn=function(){
    const past=seasons.filter(s=>s.id!==currentSeason().id);
    btn.style.visibility=past.length?'visible':'hidden';
  };
  btn.onclick=()=>{
    const past=seasons.filter(s=>s.id!==currentSeason().id);
    if(!past.length)return;
    // Jüngste vergangene Saison zeigen
    showSeasonRecap(past[0]);
  };
})();

// Positionsverlauf-Button: nur sichtbar wenn die aktuelle Saison ≥1 Match hat.
// Auto-Update nach loadAll & nach jeder Match-Eingabe (via persistRecalc).
(function setupPosHistBtn(){
  const btn=document.getElementById('posHistBtn');
  if(!btn)return;
  window._updatePosHistBtn=function(){
    const has = matchesInSeason(currentSeason().id).length > 0;
    btn.style.visibility = has ? 'visible' : 'hidden';
  };
  btn.onclick = () => showPositionHistory();
})();
document.getElementById('logoHome').onclick=()=>{tab='ranking';period='season';rankSearch='';closeSheet(true);render();window.scrollTo(0,0);};
document.getElementById('fab').onclick=()=>{tab='match';render();window.scrollTo(0,0);};

