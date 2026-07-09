// PHASE-1-VERIFIKATION: E2E-Kernflow gegen den Vite-Build (dist/) mit
// vollständig gemocktem Supabase (Auth + PostgREST + RPCs, deterministisch).
//
//   Gerät A: Home → Liga erstellen → Liga offen (leer)
//   Server:  Spieler + Matches werden "von Mitspielern" eingetragen (Seed)
//   Gerät A: Reload → Rangliste voll · zweiter Reload → Delta-Query (Cache)
//   Gerät B: Invite-Link #join=CODE → Beitritt → identische Rangliste
//   Gerät A: Zurück-Chevron → Home zeigt die Liga-Karte
//
// Aufruf:  npm run build && node tools/e2e-check.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.E2E_OUT || join(root, 'parity-out');
mkdirSync(outDir, { recursive: true });

/* ── Server-Zustand (die "Datenbank") ─────────────────────────────────── */
const state = {
  leagues: [], members: [], invites: [],
  players: [], matches: [], seasons: [], stories: [],
  queryLog: [],
};
const INVITE_CODE = 'KL7TESTCODE'.slice(0, 10);
const memberLeagues = uid => new Set(state.members.filter(m => m.user_id === uid).map(m => m.league_id));

/* ── Fake-JWT + Session für anonyme User ──────────────────────────────── */
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionFor(uid){
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ sub: uid, role: 'authenticated', exp, is_anonymous: true })}.x`,
    token_type: 'bearer', expires_in: 3600, expires_at: exp,
    refresh_token: 'rt-' + uid,
    user: { id: uid, aud: 'authenticated', role: 'authenticated', is_anonymous: true,
            created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} },
  };
}

/* ── Mini-PostgREST: eq/is/gt/lt/or-Filter, order, limit, single ──────── */
function rowsFor(table){ return state[table] || []; }
function applyFilters(rows, params){
  const conds = [];
  for(const [k, v] of params.entries()){
    if(['select', 'order', 'limit', 'offset', 'on_conflict', 'apikey', 'columns'].includes(k)) continue;
    if(k === 'or'){
      const parts = v.replace(/^\(|\)$/g, '').split(',').map(s => s.split('.'));
      conds.push(row => parts.some(([col, op, ...rest]) => cmp(row, col, op, rest.join('.'))));
    } else {
      const [op, ...rest] = v.split('.');
      conds.push(row => cmp(row, k, op, rest.join('.')));
    }
  }
  return rows.filter(r => conds.every(c => c(r)));
}
function cmp(row, key, op, val){
  const rv = row[key];
  if(op === 'eq') return String(rv) === val;
  if(op === 'is') return val === 'null' ? rv == null : String(rv) === val;
  if(op === 'gt') return rv != null && String(rv) > val;
  if(op === 'lt') return rv != null && String(rv) < val;
  if(op === 'gte') return rv != null && String(rv) >= val;
  if(op === 'lte') return rv != null && String(rv) <= val;
  return true;
}
function applyOrder(rows, params){
  const o = params.get('order');
  if(!o) return rows;
  const [col, dir] = o.split('.');
  const s = [...rows].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')));
  if(dir === 'desc') s.reverse();
  // numerisch sortieren, wenn beide Werte Zahlen sind (elo)
  if(rows.length && typeof rows[0][col] === 'number'){
    s.sort((a, b) => (dir === 'desc' ? b[col] - a[col] : a[col] - b[col]));
  }
  return s;
}

function mockFor(uid){
  return async function mockRoute(route){
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    state.queryLog.push(method + ' ' + url.pathname + url.search);

    /* ── Auth ── */
    if(url.pathname.includes('/auth/v1/')){
      if(url.pathname.endsWith('/signup') || url.pathname.endsWith('/token')) return json(sessionFor(uid));
      if(url.pathname.endsWith('/user')) return json(sessionFor(uid).user);
      if(url.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
      return json({});
    }

    /* ── RPCs ── */
    if(url.pathname.includes('/rest/v1/rpc/')){
      const fn = url.pathname.split('/rpc/')[1];
      const body = JSON.parse(req.postData() || '{}');
      if(fn === 'create_league'){
        const lg = { id: randomUUID(), name: body.p_name, settings: body.p_settings || {},
                     join_enabled: true, rev: 0, deleted_at: null, created_at: new Date().toISOString() };
        state.leagues.push(lg);
        state.members.push({ league_id: lg.id, user_id: uid, role: 'owner' });
        state.invites.push({ league_id: lg.id, code: INVITE_CODE, revoked_at: null });
        return json({ league: lg, invite_code: INVITE_CODE });
      }
      if(fn === 'join_league'){
        const code = String(body.p_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const inv = state.invites.find(i => i.code === code && !i.revoked_at);
        if(!inv) return json({ error: 'invalid_code' });
        const lg = state.leagues.find(l => l.id === inv.league_id);
        const already = state.members.some(m => m.league_id === lg.id && m.user_id === uid);
        if(!already) state.members.push({ league_id: lg.id, user_id: uid, role: 'member' });
        return json({ league: lg, already_member: already });
      }
      return json(null);
    }

    /* ── Tabellen ── */
    const m = url.pathname.match(/\/rest\/v1\/([a-z_]+)/);
    if(!m) return route.fulfill({ status: 404, body: '' });
    const table = m[1];
    const params = url.searchParams;
    const accept = req.headers()['accept'] || '';
    const wantObject = accept.includes('vnd.pgrst.object');
    const myLeagues = memberLeagues(uid);

    if(method === 'GET' || method === 'HEAD'){
      // "Meine Ligen": league_members mit eingebetteten leagues
      if(table === 'league_members' && (params.get('select') || '').includes('leagues(')){
        const rows = state.members.filter(r => r.user_id === uid)
          .map(r => ({ role: r.role, leagues: state.leagues.find(l => l.id === r.league_id) }));
        return json(rows);
      }
      let rows = rowsFor(table === 'league_invites' ? 'invites' : table);
      // RLS-Nachbildung: nur Zeilen der eigenen Ligen
      if(table !== 'leagues') rows = rows.filter(r => !r.league_id || myLeagues.has(r.league_id));
      else rows = rows.filter(r => myLeagues.has(r.id));
      rows = applyOrder(applyFilters(rows, params), params);
      const lim = parseInt(params.get('limit') || '0', 10);
      if(lim) rows = rows.slice(0, lim);
      return json(wantObject ? (rows[0] ?? null) : rows);
    }
    if(method === 'POST'){
      let body; try{ body = JSON.parse(req.postData() || '[]'); }catch(e){ body = []; }
      const arr = Array.isArray(body) ? body : [body];
      const target = rowsFor(table);
      const inserted = [];
      for(const row of arr){
        const conflictCols = (params.get('on_conflict') || '').split(',').filter(Boolean);
        if(conflictCols.length && target.some(t => conflictCols.every(c => String(t[c]) === String(row[c])))){
          const prefer = req.headers()['prefer'] || '';
          if(prefer.includes('ignore-duplicates')) continue;
          Object.assign(target.find(t => conflictCols.every(c => String(t[c]) === String(row[c]))), row);
          continue;
        }
        if(row.id == null && table !== 'seasons' && table !== 'stories') row.id = randomUUID();
        if(row.created_at == null) row.created_at = new Date().toISOString();
        target.push(row);
        inserted.push(row);
      }
      const prefer = req.headers()['prefer'] || '';
      const body2 = prefer.includes('return=representation')
        ? (wantObject ? inserted[0] ?? null : inserted) : (wantObject ? null : []);
      return json(body2, 201);
    }
    if(method === 'PATCH'){
      let body; try{ body = JSON.parse(req.postData() || '{}'); }catch(e){ body = {}; }
      const rows = applyFilters(rowsFor(table), params);
      rows.forEach(r => {
        Object.assign(r, body);
        if(table === 'matches'){
          r.updated_at = new Date().toISOString();
          const lg = state.leagues.find(l => l.id === r.league_id);
          if(lg && ('score_a' in body || 'score_b' in body || 'deleted_at' in body)) lg.rev++;
        }
      });
      return route.fulfill({ status: 204, body: '' });
    }
    if(method === 'DELETE'){
      const doomed = new Set(applyFilters(rowsFor(table), params));
      state[table] = rowsFor(table).filter(r => !doomed.has(r));
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ status: 204, body: '' });
  };
}

/* ── Seed: Spieler + Matches "von Mitspielern eingetragen" ────────────── */
function seedLeague(leagueId){
  const P = n => `00000000-0000-4000-8000-00000000000${n}`;
  const names = ['Anna', 'Ben', 'Cem', 'Dana', 'Emil', 'Fritz'];
  const elos = [1042, 1018, 1005, 996, 974, 961];
  names.forEach((name, i) => state.players.push({
    id: P(i + 1), league_id: leagueId, name, elo: elos[i], atk: 0.5,
    hidden: false, avatar_id: null, claimed_by: null, deleted_at: null,
    created_at: `2026-06-01T10:0${i}:00+00:00`,
  }));
  let mid = 0;
  const match = (day, hh, a1, a2, b1, b2, sa, sb, month = '07') => {
    mid += 1;
    const d = {}; const win = sa > sb;
    [a1, a2].forEach(p => d[p] = win ? 11 : -11);
    [b1, b2].forEach(p => d[p] = win ? -11 : 11);
    state.matches.push({
      id: `10000000-0000-4000-8000-${String(mid).padStart(12, '0')}`,
      league_id: leagueId, deleted_at: null, updated_at: null,
      a1, a1_pos: 'atk', a2, a2_pos: 'def', b1, b1_pos: 'atk', b2, b2_pos: 'def',
      score_a: sa, score_b: sb, winner: win ? 'A' : 'B', deltas: d, exp_a: 0.5,
      created_at: `2026-${month}-${String(day).padStart(2, '0')}T${String(hh).padStart(2, '0')}:15:00+00:00`,
    });
  };
  match(3, 12, P(1), P(2), P(3), P(4), 10, 6, '06');
  match(5, 13, P(5), P(6), P(1), P(4), 4, 10, '06');
  match(10, 17, P(2), P(3), P(5), P(6), 10, 8, '06');
  match(1, 12, P(1), P(2), P(3), P(4), 10, 7);
  match(2, 13, P(5), P(6), P(1), P(2), 3, 10);
  match(3, 17, P(3), P(4), P(5), P(6), 10, 9);
  match(4, 18, P(1), P(4), P(2), P(5), 10, 5);
  match(5, 12, P(2), P(6), P(3), P(5), 8, 10);
}

/* ── statischer Server über dem Repo-Root ─────────────────────────────── */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if(p.endsWith('/')) p += 'index.html';
  const f = join(root, p);
  if(!existsSync(f)){ res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'ETag': '"e2e"' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(4174, r));
const APP = 'http://localhost:4174/dist/index.html';

/* ── Testlauf ─────────────────────────────────────────────────────────── */
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let ok = true;
const errors = [];
const errFilter = e => !/realtime|websocket|WebSocket|net::|Failed to fetch/i.test(e);
function check(cond, label){
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if(!cond) ok = false;
}
async function newDevice(name, uid){
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', msg => { if(msg.type() === 'error') errors.push(`[${name}] ` + msg.text()); });
  page.on('pageerror', e => errors.push(`[${name}] PAGEERROR ` + e.message));
  await page.route('**/*supabase.co/**', mockFor(uid));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/fonts.gstatic.com/**', r => r.fulfill({ status: 200, body: '' }));
  return { ctx, page };
}

// ── Gerät A: Home → Liga erstellen ──
const A = await newDevice('A', 'aaaaaaaa-0000-4000-8000-000000000001');
await A.page.goto(APP, { waitUntil: 'load' });
await A.page.waitForSelector('#home', { state: 'visible', timeout: 15000 });
check(await A.page.isVisible('#lkCreateBtn'), 'Gerät A: Home-Screen sichtbar (keine Liga)');
check((await A.page.textContent('#home')).includes('Noch keine Liga'), 'Gerät A: Empty-State');

await A.page.fill('#lkNewName', 'Testliga');
await A.page.click('#lkCreateBtn');
await A.page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
await A.page.waitForFunction(() => document.getElementById('connText').textContent.includes('Spieler'), null, { timeout: 15000 });
check((await A.page.textContent('#app .logo-txt h1')) === 'Testliga', 'Gerät A: Liga geöffnet, Header = Liganame');
check(state.leagues.length === 1 && state.members.length === 1, 'Server: Liga + Owner-Membership angelegt');

// ── Server-Seed (Mitspieler tragen Spieler + Matches ein), dann Reload ──
seedLeague(state.leagues[0].id);
await A.page.reload({ waitUntil: 'load' });
await A.page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
await A.page.waitForFunction(() => (document.getElementById('main').innerText || '').includes('Anna'), null, { timeout: 15000 });
const tabs = ['ranking', 'positions', 'awards', 'teams', 'history'];
const viewsA = {};
for(const t of tabs){
  await A.page.click(`#botnav button[data-nav="${t}"]`);
  await A.page.waitForTimeout(350);
  viewsA[t] = await A.page.evaluate(() => document.getElementById('main').innerText);
  await A.page.screenshot({ path: join(outDir, `e2e-A-${t}.png`) });
  check((viewsA[t] || '').length > 50, `Gerät A: Tab ${t} rendert (${(viewsA[t] || '').length} Zeichen)`);
}
check(viewsA.ranking.includes('Anna') && viewsA.ranking.includes('Fritz'), 'Gerät A: Rangliste zeigt geseedete Spieler');

// ── Delta-Cache: zweiter Reload muss eine Delta-Query absetzen ──
state.queryLog.length = 0;
await A.page.reload({ waitUntil: 'load' });
// Cache rendert sofort; auf den ABSCHLUSS von loadAll warten (Conn-Pill),
// erst dann steht die Matches-Query im Log
await A.page.waitForFunction(() => /Spieler · /.test(document.getElementById('connText').textContent), null, { timeout: 15000 });
await A.page.waitForFunction(() => (document.getElementById('main').innerText || '').includes('Anna'), null, { timeout: 15000 });
const deltaQ = state.queryLog.find(q => q.includes('/matches') && q.includes('or=') && q.includes('created_at.gt.'));
check(!!deltaQ, 'Gerät A: 2. Reload lädt Matches per Delta-Query (IndexedDB-Cache aktiv)');

// ── Gerät B: Beitritt per Invite-Link ──
const B = await newDevice('B', 'bbbbbbbb-0000-4000-8000-000000000002');
await B.page.goto(APP + '#join=' + INVITE_CODE, { waitUntil: 'load' });
await B.page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
await B.page.waitForFunction(() => (document.getElementById('main').innerText || '').includes('Anna'), null, { timeout: 15000 });
check(state.members.some(m => m.user_id.startsWith('bbbbbbbb')), 'Server: Gerät B ist Mitglied');
const rankingB = await B.page.evaluate(() => document.getElementById('main').innerText);
await B.page.screenshot({ path: join(outDir, 'e2e-B-ranking.png') });
check(rankingB === viewsA.ranking, 'Gerät B: Rangliste identisch zu Gerät A');

// ── Gerät A: Zurück zur Liga-Übersicht ──
await A.page.click(`#botnav button[data-nav="ranking"]`);
await A.page.click('#backHomeBtn');
await A.page.waitForSelector('#home', { state: 'visible', timeout: 15000 });
check((await A.page.textContent('#home')).includes('Testliga'), 'Gerät A: Home zeigt Liga-Karte nach Zurück');

const relevant = errors.filter(errFilter);
console.log(`Konsole: ${errors.length} Meldungen (relevant: ${relevant.length})`, relevant.slice(0, 5));
if(relevant.length) ok = false;

await browser.close();
server.close();
console.log(ok ? '\nE2E ✅ — Plattform-Kernflow funktioniert.' : '\nE2E ❌');
process.exit(ok ? 0 : 1);
