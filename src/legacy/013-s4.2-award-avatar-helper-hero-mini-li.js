// ╔═══ §4.2 ─── AWARD AVATAR HELPER (Hero/Mini/Li) ─────────────────────╗
//     awHeroAv, awMiniAv etc. — einheitliche Avatar-Rendering-Funktionen für
//     Award-Details, Pair-Avatare für Team-Awards.
// ╚═════════════════════════════════════════════════════════════════════════╝
// Kleines Avatar (22px) für Award-Cards.
function awMiniAv(pid){
  const p=pmap()[pid];
  if(!p) return '<div class="aw-mini-av" style="background:var(--surface3);color:var(--muted)">?</div>';
  const em=p.avatar_id?avatarEmoji(p.avatar_id):null;
  if(em) return `<div class="aw-mini-av" style="background:var(--surface3);color:var(--ink);font-size:13px">${em}</div>`;
  return `<div class="aw-mini-av" style="background:${avColor(p.id)}">${esc(initials(p.name))}</div>`;
}
function awMiniPair(p1,p2){
  return `<div class="aw-mini-pair">${awMiniAv(p1)}${awMiniAv(p2)}</div>`;
}
// Podium-Avatar (56px / 64px first) für showAward Sheet.
function awPodAv(pid){
  const p=pmap()[pid];
  if(!p) return '<div class="aw-pod-av" style="background:var(--surface3);color:var(--muted)">?</div>';
  const em=p.avatar_id?avatarEmoji(p.avatar_id):null;
  if(em) return `<div class="aw-pod-av" style="background:var(--surface3);color:var(--ink);font-size:30px">${em}</div>`;
  return `<div class="aw-pod-av" style="background:${avColor(p.id)};font-size:18px">${esc(initials(p.name))}</div>`;
}
function awPodPair(p1,p2){
  return `<div class="aw-pod-pair">${awPodAv(p1)}${awPodAv(p2)}</div>`;
}
// Neue Avatar-Hilfsfunktionen für Award-Listen
// aw-li-av ist 34px, in tied-rows ist sie 30px
function awLiAv(pid, isTiedRow = false){
  const p=pmap()[pid];
  const sizeStyle = isTiedRow ? 'width:30px;height:30px;font-size:16px;' : '';
  if(!p) return `<div class="aw-li-av" style="background:var(--surface3);color:var(--muted);${sizeStyle}">?</div>`;
  const em=p.avatar_id?avatarEmoji(p.avatar_id):null;
  if(em) return `<div class="aw-li-av has-emoji" style="background:var(--surface3);color:inherit;${sizeStyle}">${em}</div>`;
  return `<div class="aw-li-av" style="background:${avColor(p.id)};${sizeStyle}">${esc(initials(p.name))}</div>`;
}
function awLiPair(p1,p2, isTiedRow = false){
  return `<div class="aw-li-pair">${awLiAv(p1, isTiedRow)}${awLiAv(p2, isTiedRow)}</div>`;
}

// Großer Hero-Avatar (82px) für die Winner/Schandfleck-Box
function awHeroAv(pid){
  const p=pmap()[pid];
  if(!p) return '<div class="aw-winner-av" style="background:var(--surface3);color:var(--muted)">?</div>';
  const em=p.avatar_id?avatarEmoji(p.avatar_id):null;
  if(em) return `<div class="aw-winner-av has-emoji">${em}</div>`;
  return `<div class="aw-winner-av" style="background:${avColor(p.id)}">${esc(initials(p.name))}</div>`;
}
function awHeroPair(p1,p2){
  return `<div class="aw-winner-pair">${awHeroAv(p1)}${awHeroAv(p2)}</div>`;
}


