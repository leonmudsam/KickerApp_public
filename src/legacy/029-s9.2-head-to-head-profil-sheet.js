// ╔═══ §9.2 ─── HEAD-TO-HEAD PROFIL SHEET ──────────────────────────────╗
//     Vergleich zweier Spieler in direkten Begegnungen.
// ╚═════════════════════════════════════════════════════════════════════════╝
// Zwei-Spieler-Bilanz: zusammen (als Teamkollegen) UND gegen (als Gegner).
// Aus Sicht von Spieler A; tauscht man die Reihenfolge der Args, dreht sich
// die Gegner-Perspektive um. Konsistent zum showTeam-Sheet-Design.
function showH2H(idA, idB){
  const pm = pmap();
  const pA = pm[idA], pB = pm[idB];
  if(!pA || !pB) return;
  _sheetSetReopen(()=>showH2H(idA, idB));
  if(idA === idB) return;

  const d = h2hDetail(idA, idB);

  // Avatar-Helper (konsistent mit showTeam)
  const avBig = (p) => {
    const em = p.avatar_id ? avatarEmoji(p.avatar_id) : null;
    if(em) return `<div style="width:60px;height:60px;border-radius:50%;background:var(--surface3);display:grid;place-items:center;font-size:28px;border:2px solid var(--line2)">${em}</div>`;
    return `<div style="width:60px;height:60px;border-radius:50%;background:${avColor(p.id)};display:grid;place-items:center;font-size:20px;font-family:'Archivo Black',sans-serif;color:#0a0c0b;border:2px solid var(--line2)">${esc(initials(p.name))}</div>`;
  };

  // Empty state — beide Spieler kennen sich, aber keine gemeinsamen Matches
  if(d.total === 0){
    openSheet(`
      <div style="text-align:center;margin-bottom:18px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.2em;color:var(--muted);font-weight:700;font-family:'Sometype Mono',monospace">Head-to-Head</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:14px">
          <div data-detail="${esc(pA.id)}" style="cursor:pointer">${avBig(pA)}</div>
          <span class="svg-ic" style="color:var(--muted);width:18px;height:18px">${svgI('swords')}</span>
          <div data-detail="${esc(pB.id)}" style="cursor:pointer">${avBig(pB)}</div>
        </div>
        <div style="font-family:'Archivo Black',sans-serif;font-size:18px;letter-spacing:-.02em;line-height:1.1;margin-top:12px">${esc(pA.name)} <span style="color:var(--muted);font-size:14px">vs</span> ${esc(pB.name)}</div>
      </div>
      ${emptyState('swords','Noch keine gemeinsamen Matches')}
    `);
    return;
  }

  const teamWr  = d.asTeam.g ? Math.round(d.asTeam.w / d.asTeam.g * 100) : 0;
  const oppWr   = d.asOppForA.g ? Math.round(d.asOppForA.w / d.asOppForA.g * 100) : 0;
  const teamGdRaw  = d.asTeam.gf - d.asTeam.ga;
  const oppGdRaw   = d.asOppForA.gf - d.asOppForA.ga;
  const teamGd  = (teamGdRaw>=0?'+':'') + teamGdRaw;
  const oppGd   = (oppGdRaw>=0?'+':'') + oppGdRaw;
  const teamElo = Math.round(d.asTeam.eloDelta);
  const oppElo  = Math.round(d.asOppForA.eloDelta);
  const teamEloStr = (teamElo>=0?'+':'') + teamElo;
  const oppEloStr  = (oppElo>=0?'+':'') + oppElo;
  const teamEloCol = teamElo>=0 ? 'var(--acid)' : 'var(--red)';
  const oppEloCol  = oppElo>=0  ? 'var(--acid)' : 'var(--red)';

  // ─── ALS-TEAM BLOCK ───
  const teamBlock = d.asTeam.g ? `
    <div style="background:var(--surface);border:1px solid rgba(86,180,232,.22);border-radius:14px;padding:14px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span class="svg-ic" style="color:var(--blue);width:16px;height:16px">${svgI('handshake')}</span>
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--blue);font-weight:700;font-family:'Sometype Mono',monospace">Als Team</span>
        <span style="margin-left:auto;font-size:11px;color:var(--muted);font-family:'Sometype Mono',monospace">${d.asTeam.g} Spiele</span>
      </div>
      <div style="display:flex;height:7px;border-radius:99px;overflow:hidden;background:var(--line);margin-bottom:6px">
        <div style="width:${teamWr}%;background:var(--acid)"></div>
        <div style="width:${100-teamWr}%;background:var(--red);opacity:.85"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;font-family:'Sometype Mono',monospace;margin-bottom:11px">
        <span style="color:var(--acid);font-weight:700">${d.asTeam.w} Siege</span>
        <span style="font-weight:700">${teamWr}%</span>
        <span style="color:var(--red);font-weight:700">${d.asTeam.g-d.asTeam.w} Niederlagen</span>
      </div>
      <div style="display:flex;gap:7px">
        <div style="flex:1;background:var(--bg2);border-radius:9px;padding:8px;text-align:center">
          <div class="num" style="font-family:'Archivo Black',sans-serif;font-size:14px;line-height:1">${teamGd}</div>
          <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-top:3px">Tordiff</div>
        </div>
        <div style="flex:1;background:var(--bg2);border-radius:9px;padding:8px;text-align:center">
          <div class="num" style="font-family:'Archivo Black',sans-serif;font-size:14px;line-height:1;color:${teamEloCol}">${teamEloStr}</div>
          <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-top:3px">Σ Elo</div>
        </div>
        <button data-team="${esc([idA,idB].sort().join('|'))}" style="flex:1.2;background:rgba(86,180,232,.1);border:1px solid rgba(86,180,232,.3);border-radius:9px;padding:8px;color:var(--blue);font-family:'Sometype Mono',monospace;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px">
          Team-Sheet
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    </div>` : '';

  // ─── ALS-GEGNER BLOCK (aus Sicht idA) ───
  const oppBlock = d.asOppForA.g ? `
    <div style="background:var(--surface);border:1px solid rgba(167,139,250,.22);border-radius:14px;padding:14px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span class="svg-ic" style="color:var(--purple);width:16px;height:16px">${svgI('swords')}</span>
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--purple);font-weight:700;font-family:'Sometype Mono',monospace">Als Gegner</span>
        <span style="margin-left:auto;font-size:11px;color:var(--muted);font-family:'Sometype Mono',monospace">${d.asOppForA.g} Spiele</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px;font-family:'Sometype Mono',monospace">
        <span style="color:var(--ink)">${esc(pA.name)}</span> vs <span style="color:var(--ink)">${esc(pB.name)}</span>
      </div>
      <div style="display:flex;height:7px;border-radius:99px;overflow:hidden;background:var(--line);margin-bottom:6px">
        <div style="width:${oppWr}%;background:var(--acid)"></div>
        <div style="width:${100-oppWr}%;background:var(--red);opacity:.85"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;font-family:'Sometype Mono',monospace;margin-bottom:11px">
        <span style="color:var(--acid);font-weight:700">${d.asOppForA.w}× gewonnen</span>
        <span style="font-weight:700">${oppWr}%</span>
        <span style="color:var(--red);font-weight:700">${d.asOppForA.g-d.asOppForA.w}× verloren</span>
      </div>
      <div style="display:flex;gap:7px">
        <div style="flex:1;background:var(--bg2);border-radius:9px;padding:8px;text-align:center">
          <div class="num" style="font-family:'Archivo Black',sans-serif;font-size:14px;line-height:1">${oppGd}</div>
          <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-top:3px">Tordiff</div>
        </div>
        <div style="flex:1;background:var(--bg2);border-radius:9px;padding:8px;text-align:center">
          <div class="num" style="font-family:'Archivo Black',sans-serif;font-size:14px;line-height:1;color:${oppEloCol}">${oppEloStr}</div>
          <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-top:3px">Elo (für ${esc(pA.name.split(' ')[0])})</div>
        </div>
      </div>
    </div>` : '';

  // ─── LETZTE BEGEGNUNGEN ───
  const lastRows = d.lastEncounters.map(enc => {
    const m = enc.m;
    const won = enc.wonForA;
    const isTeam = enc.type === 'team';
    const score = m.score_a + ':' + m.score_b;
    const typeChip = isTeam
      ? `<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(86,180,232,.12);color:var(--blue);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:2px 6px;border-radius:6px;font-family:'Sometype Mono',monospace">Team</span>`
      : `<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(167,139,250,.12);color:var(--purple);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:2px 6px;border-radius:6px;font-family:'Sometype Mono',monospace">Gegner</span>`;
    return `<div class="rrow" data-match="${esc(m.id)}" style="padding:10px 12px;display:flex;align-items:center;gap:10px">
      <div style="width:24px;height:24px;border-radius:50%;background:${won?'rgba(190,242,100,.12)':'rgba(240,86,106,.12)'};color:${won?'var(--acid)':'var(--red)'};display:grid;place-items:center;flex-shrink:0">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          ${won?'<polyline points="4,12 10,18 20,6"/>':'<path d="M6 6L18 18M6 18L18 6"/>'}
        </svg>
      </div>
      <div style="flex:1;min-width:0;display:flex;align-items:center;gap:7px">
        ${typeChip}
        <span class="num" style="font-size:10px;color:var(--muted)">${dateStr(m.created_at)}</span>
      </div>
      <div class="num" style="font-size:13px;font-weight:600;color:var(--ink);flex-shrink:0">${score}</div>
    </div>`;
  }).join('');

  const lastBlock = d.lastEncounters.length ? `
    <div style="margin-bottom:14px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);font-weight:700;margin-bottom:8px;font-family:'Sometype Mono',monospace">Letzte Begegnungen</div>
      <div class="rlist">${lastRows}</div>
    </div>` : '';

  openSheet(`
    <div style="text-align:center;margin-bottom:18px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.2em;color:var(--muted);font-weight:700;font-family:'Sometype Mono',monospace">Head-to-Head</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:14px">
        <div data-detail="${esc(pA.id)}" style="cursor:pointer">${avBig(pA)}</div>
        <span class="svg-ic" style="color:var(--muted);width:18px;height:18px">${svgI('swords')}</span>
        <div data-detail="${esc(pB.id)}" style="cursor:pointer">${avBig(pB)}</div>
      </div>
      <div style="font-family:'Archivo Black',sans-serif;font-size:18px;letter-spacing:-.02em;line-height:1.1;margin-top:12px">${esc(pA.name)} <span style="color:var(--muted);font-size:14px">vs</span> ${esc(pB.name)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:5px;font-family:'Sometype Mono',monospace">${d.total} ${d.total===1?'gemeinsame Begegnung':'gemeinsame Begegnungen'}</div>
    </div>

    ${teamBlock}
    ${oppBlock}
    ${lastBlock}
  `);

  // Sheet-Handler — analog zu showTeam
  const sheetEl = document.getElementById('sheet');
  if(sheetEl){
    sheetEl.querySelectorAll('[data-detail]').forEach(el=>{
      el.onclick=()=>{const pid=el.dataset.detail; sheetNav(()=>showPlayer(pid));};
    });
    sheetEl.querySelectorAll('[data-team]').forEach(el=>{
      el.onclick=()=>{const [a,b]=el.dataset.team.split('|'); if(a&&b){sheetNav(()=>showTeam(a,b));}};
    });
    sheetEl.querySelectorAll('[data-match]').forEach(el=>{
      el.onclick=()=>{const mid=el.dataset.match; sheetNav(()=>showMatchDetail(mid));};
    });
  }
}

