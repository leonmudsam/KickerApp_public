// ╔═══ §10.4 ─── BOOT (Initialisierung) ────────────────────────────────╗
// PHASE 1: Die Plattform-Ebene (§P) bootet zuerst (anonyme Session,
// Join-Link, Home-Screen bzw. letzte Liga). loadAll + 30s-Polling starten
// erst in startLeagueApp(), wenn eine Liga geöffnet wurde.
platformBoot();
checkForUpdate();
// Alle 5 Min nochmal prüfen, ob neue Version deployed wurde
setInterval(checkForUpdate, 5*60*1000);
})();
