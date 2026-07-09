// ╔═══ §10.2 ─── LOCK-SYSTEM (Settings-Passwort) ───────────────────────╗
//     SHA-256-Hash, Hash gespeichert in config.
// ╚═════════════════════════════════════════════════════════════════════════╝
const SETTINGS_HASH='03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
let settingsUnlocked=false;

async function openSettingsLock(){
  if(settingsUnlocked){tab='settings';render();window.scrollTo(0,0);return;}
  // Create overlay
  const ov=document.createElement('div');
  ov.id='settingsLockOverlay';
  ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px';
  ov.innerHTML=`
    <div style="background:var(--surface2);border:1px solid var(--line);border-radius:18px;padding:28px 24px;width:100%;max-width:320px;text-align:center">
      <div style="display:flex;justify-content:center;margin-bottom:16px">
        <span style="width:52px;height:52px;border-radius:14px;background:var(--surface3);display:grid;place-items:center;color:var(--ink2)">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS['lock']}</svg>
        </span>
      </div>
      <h3 style="margin:0 0 6px;font-size:17px">Feintuning</h3>
      <p style="font-size:13px;color:var(--muted);margin:0 0 20px;line-height:1.5">Passwort eingeben um fortzufahren.</p>
      <input id="settingsPwInput" type="password" placeholder="Passwort"
        style="width:100%;box-sizing:border-box;background:var(--surface3);border:1px solid var(--line);border-radius:10px;padding:12px 14px;font-size:15px;font-family:inherit;color:var(--ink);outline:none;margin-bottom:8px"/>
      <div id="settingsPwError" style="font-size:12px;color:var(--red);min-height:18px;margin-bottom:12px"></div>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('settingsLockOverlay').remove()"
          style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--surface3);color:var(--ink2);font-family:inherit;font-weight:600;font-size:14px;cursor:pointer">Abbrechen</button>
        <button id="settingsPwBtn"
          style="flex:1;padding:12px;border-radius:10px;border:none;background:var(--acid);color:#000;font-family:inherit;font-weight:700;font-size:14px;cursor:pointer">Entsperren</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const inp=document.getElementById('settingsPwInput');
  const err=document.getElementById('settingsPwError');
  const btn=document.getElementById('settingsPwBtn');
  inp.focus();
  async function tryUnlock(){
    const pw=inp.value;
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pw));
    const hash=Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(hash===SETTINGS_HASH){
      settingsUnlocked=true;
      ov.remove();
      tab='settings';render();window.scrollTo(0,0);
    } else {
      err.textContent='Falsches Passwort';
      inp.value='';
      inp.focus();
      setTimeout(()=>{err.textContent='';},2000);
    }
  }
  btn.onclick=tryUnlock;
  inp.onkeydown=e=>{if(e.key==='Enter')tryUnlock();};
}

document.getElementById('settingsBtn').onclick=openSettingsLock;

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

