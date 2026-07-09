// ╔═══ §10.4 ─── BOOT (Initialisierung) ────────────────────────────────╗
loadAll();
checkForUpdate();
// Alle 5 Min nochmal prüfen, ob neue Version deployed wurde
setInterval(checkForUpdate, 5*60*1000);
setInterval(()=>{if(!document.getElementById('sheet').classList.contains('show')&&tab!=='match')loadAll();},30000);
})();
