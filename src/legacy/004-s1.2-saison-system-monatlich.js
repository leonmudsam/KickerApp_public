// ╔═══ §1.2 ─── SAISON-SYSTEM (monatlich) ──────────────────────────────╗
//     Saisons starten automatisch am Monatsersten. currentSeason() liefert
//     die laufende Saison; archivierte Saisons stehen in `seasons[]`.
// ╚═════════════════════════════════════════════════════════════════════════╝
// Jeder Kalendermonat ist eine eigene Saison mit Elo-Reset.
// v9.15 PERF: seasonOf ist der heißeste Helper der App — er läuft in simulateElo,
// Badge-Cache, Story-Generator u.a. PRO MATCH. Das Intl-Label (toLocaleDateString)
// kostete dabei >60% der gesamten Rechenzeit, obwohl alle Hot-Loops nur `.id`
// lesen. Darum: (a) Label lazy per Getter, memoisiert pro Monat (es gibt nur
// wenige Monate), (b) das ganze Resultat memoisiert pro created_at-String —
// wiederholte Voll-Scans (Sim, Awards, Badges, News) treffen dann nur noch die Map.
const _seasonLabelMemo = {};
function _seasonLabelOf(y, m){
  const k = y + '-' + m;
  return _seasonLabelMemo[k] || (_seasonLabelMemo[k] =
    new Date(y, m).toLocaleDateString('de-DE', {month:'long', year:'numeric'}));
}
const _seasonOfMemo = new Map();
function seasonOf(date){
  const memoKey = (typeof date === 'string') ? date : null;
  if(memoKey !== null){
    const hit = _seasonOfMemo.get(memoKey);
    if(hit) return hit;
  }
  const d = new Date(date);
  const y = d.getFullYear(), m = d.getMonth();
  const res = {year:y, month:m, id:y+'-'+String(m+1).padStart(2,'0'),
    get label(){ return _seasonLabelOf(y, m); }};
  if(memoKey !== null){
    if(_seasonOfMemo.size > 50000) _seasonOfMemo.clear(); // Wachstums-Schutz
    _seasonOfMemo.set(memoKey, res);
  }
  return res;
}
function currentSeason(){
  return seasonOf(new Date());
}
// v9.15 PERF: Match-Zeitstempel. `new Date(m.created_at)` wurde app-weit ~90×
// in Loops/Sort-Komparatoren geparst (O(n·log n) Date-Parses pro Sort).
// Beide Helper memoisieren pro created_at-String — Wiederhol-Scans (Sim, Awards,
// Badges, News, Views) kosten danach nur noch einen Map-Lookup. Der String ist
// der Key: Match-Edits erzeugen neue Strings und treffen automatisch frisch.
const _mtsMemo = new Map();
function mts(m){
  const k = m.created_at;
  let t = _mtsMemo.get(k);
  if(t === undefined){
    t = new Date(k).getTime();
    if(_mtsMemo.size > 50000) _mtsMemo.clear(); // Wachstums-Schutz
    _mtsMemo.set(k, t);
  }
  return t;
}
// 'YYYY-MM-DD' (UTC) des Matches — identische Semantik wie das bisherige
// `mdayKey(m)`.
const _mdayMemo = new Map();
function mdayKey(m){
  const k = m.created_at;
  let d = _mdayMemo.get(k);
  if(d === undefined){
    d = new Date(k).toISOString().slice(0,10);
    if(_mdayMemo.size > 50000) _mdayMemo.clear();
    _mdayMemo.set(k, d);
  }
  return d;
}
function seasonStart(seasonId){
  if(!seasonId) seasonId=currentSeason().id;
  const [y,m]=seasonId.split('-').map(Number);
  return new Date(y,m-1,1);
}
function seasonEnd(seasonId){
  if(!seasonId) seasonId=currentSeason().id;
  const [y,m]=seasonId.split('-').map(Number);
  return new Date(y,m,0,23,59,59); // letzter Tag des Monats
}
function seasonLabel(seasonId){
  if(!seasonId) return '';
  const [y,m]=seasonId.split('-').map(Number);
  return new Date(y,m-1).toLocaleDateString('de-DE',{month:'long',year:'numeric'});
}
function seasonDaysLeft(){
  const end=seasonEnd();const now=new Date();
  return Math.max(0,Math.ceil((end-now)/(1000*60*60*24)));
}
function matchesInSeason(seasonId){
  if(!seasonId) seasonId=currentSeason().id;
  const key='mseason_'+seasonId+'_'+matches.length+'_'+_cache.version;
  if(!_cache._mseason) _cache._mseason={};
  if(_cache._mseason[key]) return _cache._mseason[key];
  const start=seasonStart(seasonId),end=seasonEnd(seasonId);
  const result=matches.filter(m=>{const d=new Date(m.created_at);return d>=start&&d<=end;});
  _cache._mseason[key]=result;
  return result;
}

function allPastSeasons(){
  const key='allPastSeasons_'+matches.length+'_'+seasons.length+'_'+_cache.version; // NEU: seasons.length im Key
  if(_cache._allPastSeasonsKey===key) return _cache._allPastSeasonsData;

  if(!matches.length) {
    _cache._allPastSeasonsKey = key;
    _cache._allPastSeasonsData = [];
    return [];
  }
  const first=new Date(matches[0].created_at);
  const now=new Date(); const cur=currentSeason();
  const ids=[];
  let y=first.getFullYear(), m=first.getMonth();
  while(true){
    const id=y+'-'+String(m+1).padStart(2,'0');
    if(id===cur.id) break;
    if(new Date(y,m,1)>now) break;
    ids.push(id);
    m++; if(m>11){m=0;y++;}
  }
  _cache._allPastSeasonsKey=key;
  _cache._allPastSeasonsData=ids;
  return ids;
}



let seasons=[];  // geladene Saison-Ergebnisse aus DB
let _histPage = 0; // Aktuelle Seite für den Verlaufs-Tab (Lazy Loading)
