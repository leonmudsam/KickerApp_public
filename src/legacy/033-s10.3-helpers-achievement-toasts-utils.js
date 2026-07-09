// ╔═══ §10.3 ─── HELPERS (Achievement-Toasts, Utils) ───────────────────╗
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
// v9.15 PERF: memoisiert + Intl.DateTimeFormat wiederverwendet — toLocaleString
// baute den Formatter bei JEDEM Aufruf neu (läuft pro History-Zeile/Story).
const _dateStrFmt=new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const _dateStrMemo=new Map();
function dateStr(ts){
  const k=typeof ts==='string'?ts:+ts;
  let v=_dateStrMemo.get(k);
  if(v===undefined){
    v=_dateStrFmt.format(new Date(ts));
    if(_dateStrMemo.size>20000)_dateStrMemo.clear();
    _dateStrMemo.set(k,v);
  }
  return v;
}
function mlabel(m){return pname(m.a1)+'&'+pname(m.a2)+' vs '+pname(m.b1)+'&'+pname(m.b2);}
function emptyState(e,t){
  // Wenn 'e' ein Icon-Name aus ICONS ist → SVG rendern; sonst als Text/Emoji belassen
  const inner = ICONS[e] ? `<div class="ee svg-ic">${svgI(e)}</div>` : `<div class="ee">${e}</div>`;
  return `<div class="empty">${inner}${t}</div>`;
}
let tt;
function toast(msg,kind){let t=document.querySelector('.toast');
  if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);}
  t.textContent=msg;t.className='toast '+(kind===true?'err':kind||'');void t.offsetWidth;t.classList.add('show');
  clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),2400);}

// ─── Achievement-Toast: gestapelte Anzeige für neue Badges nach Match-Eingabe ───
// Sequenzielle Queue verhindert, dass mehrere Achievements einander überschreiben.
// Jeder Toast 2.6s sichtbar + 0.4s Pause zwischen den Slides.
let _achToastQueue=[], _achToastBusy=false, _achToastTimer=null;
function showAchievementToast(playerName, badge){
  _achToastQueue.push({playerName, badge});
  _processAchToastQueue();
}
function _processAchToastQueue(){
  if(_achToastBusy || !_achToastQueue.length) return;
  _achToastBusy=true;
  const {playerName, badge}=_achToastQueue.shift();
  let el=document.querySelector('.ach-toast');
  if(!el){el=document.createElement('div');el.className='ach-toast';document.body.appendChild(el);}
  // Badge-Icon: zentrale badgeIc()-Logik nutzen (SVG zuerst, Emoji als Fallback)
  // — konsistent mit Profil, Awards-Sheet und Match-Detail. Mein CSS-Selektor
  // .ach-toast-ic svg übernimmt Größe/Stroke; das umliegende <span> ist neutral.
  const icHtml = badgeIc(badge, '22px');
  const subParts=[esc(playerName)];
  if(badge.count && badge.count>1) subParts.push(badge.count+'×');
  el.innerHTML=`
    <div class="ach-toast-ic">${icHtml}</div>
    <div class="ach-toast-text">
      <div class="ach-toast-cat">Neue Auszeichnung</div>
      <div class="ach-toast-name">${esc(badge.name)}</div>
      <div class="ach-toast-sub">${subParts.join(' · ')}</div>
    </div>`;
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(_achToastTimer);
  _achToastTimer=setTimeout(()=>{
    el.classList.remove('show');
    setTimeout(()=>{ _achToastBusy=false; _processAchToastQueue(); }, 400);
  }, 2600);
}

