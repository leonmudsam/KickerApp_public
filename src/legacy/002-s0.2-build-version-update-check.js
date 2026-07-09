// ╔═══ §0.2 ─── BUILD-VERSION & UPDATE-CHECK ───────────────────────────╗
//     Bumpe BUILD_VERSION bei jedem Deploy. Banner zeigt sich, wenn ein
//     remote-gefetchtes index.html eine neuere Version trägt.
// ╚═════════════════════════════════════════════════════════════════════════╝
// Bei jedem Deploy diesen String bumpen (Datum + laufender Zähler).
// Der Hintergrund-Check fetched die index.html mit Cache-Bust und vergleicht.
// Bei neuerer Version: Banner oben → Force-Reload bricht iOS-PWA-/Browser-Cache.
const BUILD_VERSION='2026.06.23.12';
function forceReload(){
  const u=new URL(location.href);
  u.searchParams.set('_cb',Date.now());
  // replace statt assign damit der alte Eintrag nicht in der History bleibt
  location.replace(u.toString());
}
// v9.15 PERF: Update-Check per Conditional Request. Vorher wurde alle 5 Min
// die komplette index.html (~800 KB) heruntergeladen, nur um BUILD_VERSION zu
// vergleichen (~9,6 MB/h auf Mobilgeräten). Mit If-None-Match antwortet der
// Server (GitHub Pages sendet ETags) bei unverändertem File mit 304 ohne Body.
// Ohne ETag-Support degradiert das automatisch zum alten Verhalten (200-Pfad).
let _updEtag=null;
async function checkForUpdate(){
  try{
    const url=location.pathname+'?_cb='+Date.now();
    const r=await fetch(url,{cache:'no-store',headers:_updEtag?{'If-None-Match':_updEtag}:{}});
    if(r.status===304)return; // unverändert — kein Body übertragen
    if(!r.ok)return;
    _updEtag=r.headers.get('ETag');
    const text=await r.text();
    const m=text.match(/const BUILD_VERSION=['"]([^'"]+)['"]/);
    if(!m||!m[1]||m[1]===BUILD_VERSION)return;
    if(document.getElementById('updateBanner'))return;
    const b=document.createElement('div');
    b.id='updateBanner';
    b.style.cssText='position:fixed;top:calc(var(--safe-top) + 10px);left:50%;transform:translateX(-50%);z-index:9000;background:var(--acid);color:var(--acid-deep);font-family:inherit;font-size:12.5px;font-weight:700;padding:9px 14px;border-radius:12px;box-shadow:var(--shadow-acid);display:flex;gap:10px;align-items:center;cursor:pointer;max-width:92vw;white-space:nowrap';
    b.innerHTML='<span>Neue Version ('+m[1]+')</span><span style="background:rgba(0,0,0,.18);padding:4px 9px;border-radius:8px">Neu laden</span>';
    b.onclick=forceReload;
    document.body.appendChild(b);
  }catch(e){/* offline / CORS — still ignorieren */}
}

// ---- STATE ----
let players=[], matches=[], cfg={k_factor:32,risk_split:0.6,pos_swing:0.45,start_elo:0,
  win_boost:1.12,mov_loss_damp:0.5,match_bonus:1.5,low_elo_loss_damp:0};
let tab='ranking', unlocked=true;
let rankMetric='elo';      // elo | atk | def | winrate | goaldiff | streak
let rankSearch='';
let teamSearch='';         // Suchfilter im Teams-Tab (Spieler- oder Team-Name)
let histFilter='all';      // all | <playerId>
let teamView='best';       // best | worst (Teams-Tab)
let teamSort='wr';         // wr | gd | elo (Teams-Sortierung) ← NEUE ZEILE
let posSort='wr';          // wr | wins (Positionen-Filter)
let period='season';          // all | season | week | month (Liga-Zeitraum)
let periodSort='wins';     // wins | elo (Zeitraum-Sortierung)
let awPeriod='all';      // all | season | week
let awSeasonId=null;        // konkrete Saison für Award-Filter (null = aktuelle)
let awWeekStart=null;       // konkrete Woche (Date für Montag, lokale Zeit) für Award-Filter (null = aktuelle KW)

