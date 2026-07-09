// ╔═══ §0.1 ────────────────────────────────────────────────────────────────╗
//     ZUGANGSDATEN
// ╚═════════════════════════════════════════════════════════════════════════╝
const SUPABASE_URL = "https://ffpvdqebpbzdyaisovnm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcHZkcWVicGJ6ZHlhaXNvdm5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDgxNTIsImV4cCI6MjA5ODIyNDE1Mn0.UouxTKnSTBVaXFYfSxgZIHzclzeDYyC16mmaCJCpYAw";
// ════════════════════════════════════════════════════════════

(function(){
"use strict";
if(SUPABASE_URL.startsWith("HIER")||SUPABASE_KEY.startsWith("HIER")){
  document.getElementById('setupGate').style.display='block'; return;
}
// PHASE 1: Sichtbarkeit steuert die Plattform-Ebene (§P) — Home-Screen
// zuerst, #app/#botnav erst wenn eine Liga geöffnet ist.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

