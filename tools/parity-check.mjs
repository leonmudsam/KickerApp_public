// PHASE-0-VERIFIKATION: lädt die Original-App (legacy/index.html) und den
// Vite-Build (dist/) mit IDENTISCHEN, deterministischen Supabase-Antworten
// (Netzwerk wird per Playwright-Routing gemockt) und vergleicht das
// gerenderte Ergebnis aller Tabs. Ziel: byte-gleiche UI → keine
// Verhaltensänderung durch die Modularisierung.
//
// Aufruf:  npm run build && node tools/parity-check.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.PARITY_OUT || join(root, 'parity-out');
mkdirSync(outDir, { recursive: true });

/* ── deterministischer Datensatz ──────────────────────────────────────── */
const P = n => `00000000-0000-4000-8000-00000000000${n}`;
const players = [
  { id: P(1), name: 'Anna',  elo: 1042, atk: 0.62, hidden: false, avatar_id: null, created_at: '2026-05-01T10:00:00+00:00' },
  { id: P(2), name: 'Ben',   elo: 1018, atk: 0.44, hidden: false, avatar_id: null, created_at: '2026-05-01T10:01:00+00:00' },
  { id: P(3), name: 'Cem',   elo: 1005, atk: 0.55, hidden: false, avatar_id: null, created_at: '2026-05-01T10:02:00+00:00' },
  { id: P(4), name: 'Dana',  elo:  996, atk: 0.38, hidden: false, avatar_id: null, created_at: '2026-05-01T10:03:00+00:00' },
  { id: P(5), name: 'Emil',  elo:  974, atk: 0.51, hidden: false, avatar_id: null, created_at: '2026-05-02T10:00:00+00:00' },
  { id: P(6), name: 'Fritz', elo:  961, atk: 0.47, hidden: false, avatar_id: null, created_at: '2026-05-02T10:01:00+00:00' },
];
const cfgRow = {
  id: 1, k_factor: 32, risk_split: 0.6, pos_swing: 0.45, start_elo: 1000,
  win_boost: 1.10, mov_loss_damp: 0.5, match_bonus: 1.5, pos_min_games: 3,
  exp_weight: 0.5, new_player_mult: 1.5, new_player_mid_mult: 1.2,
  veteran_damp: 0.85, mov_max_boost: 0.4, exp_protect_max: 0.1,
  underdog_elo_max: 0.15, underdog_games_max: 0.05, low_elo_loss_damp: 0,
};
let mid = 0;
function match(day, hh, a1, a2, b1, b2, sa, sb, month = '07') {
  mid += 1;
  const d = {};
  const win = sa > sb;
  [a1, a2].forEach(p => d[p] = win ? 11 : -11);
  [b1, b2].forEach(p => d[p] = win ? -11 : 11);
  return {
    id: `10000000-0000-4000-8000-${String(mid).padStart(12, '0')}`,
    a1, a1_pos: 'atk', a2, a2_pos: 'def', b1, b1_pos: 'atk', b2, b2_pos: 'def',
    score_a: sa, score_b: sb, winner: win ? 'A' : 'B', deltas: d, exp_a: 0.5,
    created_at: `2026-${month}-${String(day).padStart(2, '0')}T${String(hh).padStart(2, '0')}:15:00+00:00`,
  };
}
const matches = [
  // Juni (archivierte Saison)
  match(3, 12, P(1), P(2), P(3), P(4), 10, 6, '06'),
  match(5, 13, P(5), P(6), P(1), P(4), 4, 10, '06'),
  match(10, 17, P(2), P(3), P(5), P(6), 10, 8, '06'),
  match(17, 18, P(1), P(3), P(2), P(6), 10, 2, '06'),
  match(24, 12, P(4), P(5), P(1), P(2), 7, 10, '06'),
  // Juli (laufende Saison)
  match(1, 12, P(1), P(2), P(3), P(4), 10, 7),
  match(2, 13, P(5), P(6), P(1), P(2), 3, 10),
  match(3, 17, P(3), P(4), P(5), P(6), 10, 9),
  match(4, 18, P(1), P(4), P(2), P(5), 10, 5),
  match(5, 12, P(2), P(6), P(3), P(5), 8, 10),
  match(6, 13, P(1), P(6), P(2), P(4), 10, 0),
  match(7, 17, P(3), P(6), P(1), P(5), 6, 10),
  match(8, 18, P(2), P(3), P(4), P(6), 10, 9),
];
const seasons = [{
  id: '2026-06', label: 'Juni 2026', start_date: '2026-06-01', end_date: '2026-06-30',
  player_id: P(1), team_p1: P(1), team_p2: P(3),
  top_elo: JSON.stringify([
    { id: P(1), elo: 1030, wins: 3, losses: 1 },
    { id: P(2), elo: 1012, wins: 2, losses: 2 },
    { id: P(3), elo: 1008, wins: 3, losses: 1 },
  ]),
  created_at: '2026-07-01T00:05:00+00:00',
}];

/* ── Mock-Router für Supabase-REST ────────────────────────────────────── */
const tables = { players, matches, config: [cfgRow], seasons, stories: [] };
async function mockRoute(route) {
  const req = route.request();
  const url = new URL(req.url());
  const m = url.pathname.match(/\/rest\/v1\/([a-z_]+)/);
  if (!m) {
    if (url.pathname.includes('/auth/') || url.pathname.includes('/realtime')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 404, body: '' });
  }
  const table = m[1];
  const method = req.method();
  if (method === 'GET' || method === 'HEAD') {
    let rows = tables[table] ?? [];
    if (table === 'matches') rows = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (table === 'players') rows = [...rows].sort((a, b) => b.elo - a.elo);
    if (table === 'seasons') rows = [...rows].sort((a, b) => b.start_date.localeCompare(a.start_date));
    const accept = req.headers()['accept'] || '';
    const body = accept.includes('vnd.pgrst.object') ? JSON.stringify(rows[0] ?? null) : JSON.stringify(rows);
    return route.fulfill({ status: 200, contentType: 'application/json', body });
  }
  // Schreiboperationen: bestätigen, aber Datensatz unverändert lassen
  // (Determinismus; die App toleriert das — Upserts sind fire-and-forget)
  if (method === 'POST') {
    const prefer = req.headers()['prefer'] || '';
    const body = prefer.includes('return=representation') ? (req.postData() || '[]') : '[]';
    return route.fulfill({ status: 201, contentType: 'application/json', body });
  }
  return route.fulfill({ status: 204, body: '' });
}

/* ── statischer Server über dem Repo-Root ─────────────────────────────── */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(root, p);
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'ETag': '"parity"' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(4173, r));

/* ── App laden + alle Tabs einsammeln ─────────────────────────────────── */
const TABS = ['ranking', 'positions', 'awards', 'teams', 'history'];
const supabaseUmd = readFileSync(join(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'));

async function capture(browser, label, url) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  // Externe Hosts abfangen: Supabase → Mock, CDN → lokale UMD, Fonts → leer
  await page.route('**/*supabase.co/**', mockRoute);
  await page.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: supabaseUmd }));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/fonts.gstatic.com/**', r => r.fulfill({ status: 200, body: '' }));

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  await page.waitForSelector('#botnav button[data-nav]', { timeout: 15000 });
  await page.waitForTimeout(1200); // Stories/Async-Rendering abwarten

  const result = {};
  for (const t of TABS) {
    await page.click(`#botnav button[data-nav="${t}"]`);
    await page.waitForTimeout(350);
    result[t] = await page.evaluate(() => document.getElementById('main').innerText);
    await page.screenshot({ path: join(outDir, `${label}-${t}.png`), fullPage: false });
  }
  result._errors = errors;
  await page.close();
  return result;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const legacy = await capture(browser, 'legacy', 'http://localhost:4173/legacy/index.html');
const dist = await capture(browser, 'dist', 'http://localhost:4173/dist/index.html');
await browser.close();
server.close();

/* ── Vergleich ────────────────────────────────────────────────────────── */
let ok = true;
for (const t of TABS) {
  const same = legacy[t] === dist[t];
  if (!same) {
    ok = false;
    writeFileSync(join(outDir, `diff-${t}-legacy.txt`), legacy[t]);
    writeFileSync(join(outDir, `diff-${t}-dist.txt`), dist[t]);
  }
  console.log(`${same ? '✅' : '❌'} Tab ${t}: ${same ? 'identisch' : 'DIFFERENZ (siehe parity-out/diff-*)'} (${(legacy[t] || '').length} Zeichen)`);
}
const errFilter = e => !/realtime|websocket|WebSocket|net::|Failed to fetch/i.test(e);
const le = legacy._errors.filter(errFilter), de = dist._errors.filter(errFilter);
console.log(`Konsole legacy: ${legacy._errors.length} (relevant: ${le.length})`, le.slice(0, 5));
console.log(`Konsole dist:   ${dist._errors.length} (relevant: ${de.length})`, de.slice(0, 5));
if (le.length || de.length) ok = false;
console.log(ok ? '\nPARITÄT ✅ — Modularisierung verhält sich identisch.' : '\nPARITÄT ❌');
process.exit(ok ? 0 : 1);
