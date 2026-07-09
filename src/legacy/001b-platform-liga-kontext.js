// ╔═══ §P — PLATTFORM (Phase 1): Auth · Home-Screen · Liga-Kontext ═════════╗
//   Neue Ebene VOR der Liga-App: anonymer Sign-in, "Meine Ligen",
//   Erstellen/Beitreten per Invite-Code, IndexedDB-Cache pro Liga.
//   Die Liga-App (alles ab §1) startet erst, wenn eine Liga geöffnet ist.
//   Liga-Wechsel = location.reload() → garantiert saubere Memo-Caches.
// ╚═════════════════════════════════════════════════════════════════════════╝

// Aktueller Liga-Kontext. null = Home-Screen. Alle Datenlayer-Queries
// scopen auf LK.id; cfg wird aus CFG_DEFAULTS + LK.settings gemerged.
let LK = null;

// Code-Defaults der Elo-Parameter (ehem. Spaltendefaults der config-Tabelle).
// leagues.settings enthält nur Abweichungen + start_elo/monthlyReset.
const CFG_DEFAULTS = {
  k_factor: 32, risk_split: 0.6, pos_swing: 0.45, start_elo: 1000,
  win_boost: 1.10, mov_loss_damp: 0.5, match_bonus: 1.5, pos_min_games: 3,
  exp_weight: 0.5, new_player_mult: 1.5, new_player_mid_mult: 1.2,
  veteran_damp: 0.85, mov_max_boost: 0.4, exp_protect_max: 0.1,
  underdog_elo_max: 0.15, underdog_games_max: 0.05, low_elo_loss_damp: 0,
};

// ─── IndexedDB-Cache pro Liga: {players, matches, seasons, rev, lastSyncedAt}
// Öffnen → sofort aus Cache rendern → Delta-Fetch. Fehler ⇒ einfach ohne Cache.
function _idbOpen(){
  return new Promise((res, rej) => {
    const rq = indexedDB.open('kicker_leagues', 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore('league_cache'); };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function lkCacheGet(id){
  try{
    const db = await _idbOpen();
    return await new Promise(res => {
      const rq = db.transaction('league_cache', 'readonly').objectStore('league_cache').get(id);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => res(null);
    });
  }catch(e){ return null; }
}
async function lkCachePut(id, val){
  try{
    const db = await _idbOpen();
    db.transaction('league_cache', 'readwrite').objectStore('league_cache').put(val, id);
  }catch(e){}
}

// ─── Session: erster Start = stiller anonymer Sign-in (echte auth.uid()).
// Die Session lebt im localStorage; Verlust ist verlustfrei (Re-Join per Code).
async function ensureSession(){
  const { data } = await sb.auth.getSession();
  if(data && data.session) return data.session;
  const { data: d2, error } = await sb.auth.signInAnonymously();
  if(error) throw error;
  return d2.session;
}

async function fetchMyLeagues(){
  const { data, error } = await sb.from('league_members')
    .select('role, leagues(id, name, settings, join_enabled, rev, deleted_at, created_at)');
  if(error) throw error;
  return (data || []).map(r => r.leagues).filter(l => l && !l.deleted_at);
}

// ─── Boot: Session → Join-Link → letzte Liga → Home ─────────────────────
async function platformBoot(){
  try{
    await ensureSession();
  }catch(e){
    console.error('[platform] auth', e);
    renderHomeShell(`<div class="card"><div class="empty" style="color:var(--red)">
      Anmeldung fehlgeschlagen.<br>
      <span class="num" style="font-size:11px">${esc(e.message || e)}</span><br><br>
      <span style="font-size:12px;color:var(--muted)">Sind „Anonymous Sign-ins" im Supabase-Dashboard aktiviert?</span>
    </div></div>`);
    return;
  }

  // Join-Link (#join=CODE): direkt beitreten, Hash aus der URL entfernen
  const jm = (location.hash || '').match(/join=([A-Za-z0-9-]+)/i);
  if(jm){
    try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
    const res = await lkJoin(jm[1]);
    if(res) return; // Liga wurde geöffnet
  }

  let leagues = [];
  try{ leagues = await fetchMyLeagues(); }
  catch(e){ console.error('[platform] leagues', e); }

  const last = (()=>{ try{ return localStorage.getItem('lastLeagueId'); }catch(e){ return null; } })();
  const lastLg = leagues.find(l => l.id === last);
  if(lastLg){ openLeague(lastLg); return; }
  renderHome(leagues);
}

// Beitritt per Code (aus Link oder Eingabe). true = Liga geöffnet.
async function lkJoin(codeRaw){
  // Auch komplette Links akzeptieren
  const m = String(codeRaw || '').match(/join=([A-Za-z0-9-]+)/i);
  const code = (m ? m[1] : String(codeRaw || '')).trim();
  if(!code) return false;
  const { data, error } = await sb.rpc('join_league', { p_code: code });
  if(error){
    toast('Beitritt fehlgeschlagen: ' + error.message, true);
    return false;
  }
  if(data && data.error){
    toast(data.error === 'rate_limited'
      ? 'Zu viele Versuche — bitte später erneut.'
      : 'Dieser Einladungscode ist ungültig.', true);
    return false;
  }
  toast(data.already_member ? 'Du bist schon Mitglied' : 'Willkommen in der Liga!', 'ok');
  openLeague(data.league);
  return true;
}

// ─── Home-Screen ─────────────────────────────────────────────────────────
function renderHomeShell(inner){
  const home = document.getElementById('home');
  home.innerHTML = `
    <div class="appbar">
      <div class="appbar-row">
        <div class="logo">
          <div class="logo-mark"><img src="icon.png" alt="Kicker Leagues Logo"></div>
          <div class="logo-txt"><h1>Kicker Leagues</h1><div class="sub">Deine Ligen</div></div>
        </div>
      </div>
    </div>
    <main>${inner}</main>`;
  home.style.display = 'block';
  document.getElementById('app').style.display = 'none';
  document.getElementById('botnav').style.display = 'none';
  document.getElementById('fab').style.display = 'none';
}

function renderHome(leagues){
  const cards = leagues.length ? leagues.map(l => `
    <div class="card" data-open-league="${esc(l.id)}" style="cursor:pointer;display:flex;align-items:center;gap:14px">
      <div style="width:44px;height:44px;border-radius:12px;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px">${esc((l.name || '?').trim().slice(0, 2).toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.name)}</div>
        <div style="font-size:11px;color:var(--muted)">Liga öffnen</div>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--muted)"><path d="M9 18l6-6-6-6"/></svg>
    </div>`).join('') : `
    <div class="card"><div class="empty">Noch keine Liga.<br>
      <span style="font-size:12px;color:var(--muted)">Erstelle eine eigene Liga oder tritt mit einem Einladungscode bei.</span>
    </div></div>`;

  renderHomeShell(`
    ${cards}
    <div class="card">
      <div class="field-label">Neue Liga erstellen</div>
      <input id="lkNewName" type="text" maxlength="60" placeholder="Name der Liga"
        style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--surface2);color:var(--ink);font:inherit;margin:8px 0">
      <div style="display:flex;gap:10px;align-items:center;margin:8px 0 12px">
        <label style="flex:1;font-size:12px;color:var(--ink2)">Start-Elo
          <input id="lkStartElo" type="number" value="1000" min="100" max="5000" step="50"
            style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--surface2);color:var(--ink);font:inherit;margin-top:4px">
        </label>
        <label style="flex:1;font-size:12px;color:var(--ink2);display:flex;gap:8px;align-items:center;margin-top:14px">
          <input id="lkMonthly" type="checkbox" checked style="width:18px;height:18px"> Monatliche Saisons
        </label>
      </div>
      <button class="btn" id="lkCreateBtn" style="width:100%">Liga erstellen</button>
    </div>
    <div class="card">
      <div class="field-label">Liga beitreten</div>
      <input id="lkJoinCode" type="text" placeholder="Einladungscode oder -link" autocapitalize="characters"
        style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--surface2);color:var(--ink);font:inherit;margin:8px 0 12px">
      <button class="btn ghost" id="lkJoinBtn" style="width:100%">Beitreten</button>
    </div>
  `);

  document.querySelectorAll('[data-open-league]').forEach(el => {
    el.onclick = () => {
      const lg = leagues.find(l => l.id === el.dataset.openLeague);
      if(lg) openLeague(lg);
    };
  });
  const createBtn = document.getElementById('lkCreateBtn');
  createBtn.onclick = async () => {
    const name = document.getElementById('lkNewName').value.trim();
    if(!name){ toast('Bitte einen Liga-Namen eingeben', true); return; }
    const startElo = parseInt(document.getElementById('lkStartElo').value, 10) || 1000;
    const monthly = !!document.getElementById('lkMonthly').checked;
    createBtn.disabled = true;
    const { data, error } = await sb.rpc('create_league', {
      p_name: name,
      p_settings: { start_elo: startElo, monthlyReset: monthly },
    });
    createBtn.disabled = false;
    if(error){ toast('Erstellen fehlgeschlagen: ' + error.message, true); return; }
    toast('Liga erstellt — lade Freunde ein!', 'ok');
    openLeague(data.league);
  };
  const joinBtn = document.getElementById('lkJoinBtn');
  joinBtn.onclick = async () => {
    joinBtn.disabled = true;
    await lkJoin(document.getElementById('lkJoinCode').value);
    joinBtn.disabled = false;
  };
  const joinInp = document.getElementById('lkJoinCode');
  joinInp.onkeydown = e => { if(e.key === 'Enter') joinBtn.click(); };
}

// ─── Liga öffnen: Kontext setzen, Cache vorladen, Liga-App starten ───────
async function openLeague(lg){
  LK = {
    id: lg.id, name: lg.name,
    settings: lg.settings || {},
    rev: null, lastSyncedAt: null,
  };
  try{ localStorage.setItem('lastLeagueId', lg.id); }catch(e){}
  cfg = Object.assign({}, CFG_DEFAULTS, LK.settings);

  document.getElementById('home').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('botnav').style.display = 'flex';
  const h1 = document.querySelector('#app .logo-txt h1');
  if(h1) h1.textContent = lg.name;
  const sub = document.querySelector('#app .logo-txt .sub');
  if(sub) sub.textContent = 'Kicker Leagues';
  const back = document.getElementById('backHomeBtn');
  if(back){ back.style.display = 'inline-flex'; back.onclick = goHome; }
  const logo = document.getElementById('logoHome');
  if(logo) logo.onclick = goHome;
  const inv = document.getElementById('inviteBtn');
  if(inv){ inv.style.display = 'inline-flex'; inv.onclick = shareInvite; }

  // Cache-First: sofort rendern, Netz-Sync (Delta) folgt in startLeagueApp
  const cached = await lkCacheGet(lg.id);
  if(cached && Array.isArray(cached.matches)){
    players = cached.players || [];
    matches = cached.matches || [];
    seasons = cached.seasons || [];
    LK.rev = cached.rev;
    LK.lastSyncedAt = cached.lastSyncedAt || null;
    invalidateCache(['global', 'stats', 'awards', 'teams', 'allTeamStats', 'period', 'badges', 'playerSeasonAwards', 'allPastSeasons']);
    try{ render(); }catch(e){ console.warn('[platform] cache render', e); }
  }
  startLeagueApp();
}

// Zurück zur Liga-Übersicht. Bewusst per Reload: die Engines halten
// modulweite Memo-Caches — ein frischer Seitenkontext ist der einzige
// garantiert leckfreie Liga-Wechsel (Plan §8/§12.8).
function goHome(){
  try{ localStorage.removeItem('lastLeagueId'); }catch(e){}
  try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  location.reload();
}

// ─── Einladen: aktiven Code holen → Share-Sheet / Zwischenablage ─────────
async function shareInvite(){
  if(!LK) return;
  const { data, error } = await sb.from('league_invites')
    .select('code').eq('league_id', LK.id).is('revoked_at', null).limit(1).maybeSingle();
  if(error || !data){ toast('Kein aktiver Einladungscode gefunden', true); return; }
  const url = location.origin + location.pathname + '#join=' + data.code;
  const text = `Komm in unsere Kicker-Liga „${LK.name}"! Code: ${data.code}`;
  if(navigator.share){
    try{ await navigator.share({ title: 'Kicker Leagues', text, url }); return; }catch(e){ /* abgebrochen */ }
  }
  try{
    await navigator.clipboard.writeText(text + '\n' + url);
    toast('Einladungslink kopiert', 'ok');
  }catch(e){
    prompt('Einladungslink kopieren:', url);
  }
}

// ─── Liga-App starten (ehem. Boot §10.4) ─────────────────────────────────
let _leagueAppStarted = false;
function startLeagueApp(){
  if(_leagueAppStarted) return;
  _leagueAppStarted = true;
  loadAll();
  // 30s-Polling bleibt als Fallback (Realtime ist der primäre Weg)
  setInterval(() => {
    if(LK && !document.getElementById('sheet').classList.contains('show') && tab !== 'match') loadAll();
  }, 30000);
  _ensureMatchesRealtime();
}

// ─── Per-Liga-Realtime auf matches (Phase-1-Entscheidung §14.8) ──────────
// Events anderer Geräte (Insert/Edit/Soft-Delete) triggern einen debounced
// loadAll — der ist dank Delta-Sync billig. Eigene Writes kommen ebenfalls
// an und sind durch die Merge-Logik idempotent.
let _matchesChannel = null;
let _rtLoadTimer = null;
function _ensureMatchesRealtime(){
  if(_matchesChannel || !LK) return;
  if(!sb || !sb.channel) return;
  try{
    _matchesChannel = sb.channel('matches_changes_' + LK.id)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'matches', filter: 'league_id=eq.' + LK.id },
          () => _onMatchRealtime())
      .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'matches', filter: 'league_id=eq.' + LK.id },
          () => _onMatchRealtime())
      .subscribe(status => {
        if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'){
          _matchesChannel = null; // 30s-Polling übernimmt; nächster loadAll darf neu abonnieren
        }
      });
  }catch(e){ _matchesChannel = null; }
}
function _onMatchRealtime(){
  if(!LK) return;
  if(_rtLoadTimer) clearTimeout(_rtLoadTimer);
  _rtLoadTimer = setTimeout(() => {
    _rtLoadTimer = null;
    if(!document.getElementById('sheet').classList.contains('show') && tab !== 'match') loadAll();
  }, 600);
}
