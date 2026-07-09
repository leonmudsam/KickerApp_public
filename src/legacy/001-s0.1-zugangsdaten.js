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
document.getElementById('app').style.display='block';
document.getElementById('botnav').style.display='flex';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

