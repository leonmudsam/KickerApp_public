// ╔═══ §9.3 ─── TEAM PROFIL SHEET ──────────────────────────────────────╗
//     Statistiken für ein konkretes Duo.
// ╚═════════════════════════════════════════════════════════════════════════╝
function showTeam(p1Id,p2Id){
  const pm=pmap();
  const pA=pm[p1Id], pB=pm[p2Id];
  if(!pA||!pB) return;
  _sheetSetReopen(()=>showTeam(p1Id,p2Id));
  const d=teamDetail(p1Id,p2Id);
  if(!d.games){
    openSheet(`
      <div style="text-align:center;margin-bottom:18px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.2em;color:var(--muted);font-weight:700;font-family:'Sometype Mono',monospace">Team</div>
        <h3 style="margin-top:8px">${esc(pA.name)} &amp; ${esc(pB.name)}</h3>
      </div>
      ${emptyState('handshake','Noch keine gemeinsamen Spiele')}
    `);
    return;
  }

  const wr=Math.round(d.wr*100);
  const gdStr=(d.gd>=0?'+':'')+d.gd;
  const eloStr=(d.eloDelta>=0?'+':'')+d.eloDelta;
  const eloColor=d.eloDelta>=0?'var(--acid)':'var(--red)';

  // Großes Avatar je Spieler (64px)
  const avBig=(p)=>{
    const em=p.avatar_id?avatarEmoji(p.avatar_id):null;
    if(em) return `<div style="width:64px;height:64px;border-radius:50%;background:var(--surface3);display:grid;place-items:center;font-size:32px;border:2px solid var(--line2)">${em}</div>`;
    return `<div style="width:64px;height:64px;border-radius:50%;background:${avColor(p.id)};display:grid;place-items:center;font-size:22px;font-family:'Archivo Black',sans-serif;color:#0a0c0b;border:2px solid var(--line2)">${esc(initials(p.name))}</div>`;
  };
  // Kleines Avatar (für Gegner-Rows, 30px)
  const avSm=(p,marginLeft)=>{
    if(!p) return '';
    const em=p.avatar_id?avatarEmoji(p.avatar_id):null;
    const ml=marginLeft?'margin-left:-8px;':'';
    if(em) return `<div style="width:30px;height:30px;border-radius:50%;background:var(--surface3);display:grid;place-items:center;font-size:14px;border:2px solid var(--surface);${ml}">${em}</div>`;
    return `<div style="width:30px;height:30px;border-radius:50%;background:${avColor(p.id)};display:grid;place-items:center;font-size:11px;font-family:'Archivo Black',sans-serif;color:#0a0c0b;border:2px solid var(--surface);${ml}">${esc(initials(p.name))}</div>`;
  };

  // Gegnerspieler-Karte (einzelner Spieler)
  const oppRow=(opp,label,labelColor)=>{
    const op=pm[opp.oid]; if(!op) return '';
    return `<div style="margin-bottom:14px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);font-weight:700;margin-bottom:8px;font-family:'Sometype Mono',monospace">${label}</div>
      <div class="rrow" data-detail="${esc(op.id)}" style="padding:12px 14px">
        ${avSm(op,false)}
        <div class="rmid" style="margin-left:11px">
          <div class="rname" style="font-size:13px">${esc(op.name)}</div>
          <div class="rmeta"><span class="num">${opp.g} Begegnungen</span></div>
        </div>
        <div class="num" style="font-size:13px;font-weight:600;flex-shrink:0">
          <span style="color:var(--acid)">${opp.w}</span><span style="color:var(--faint)"> · </span><span style="color:var(--red)">${opp.g-opp.w}</span>
        </div>
      </div>
    </div>`;
  };

  // Highlight-Karte (höchster Sieg / Upset / schlimmste Niederlage)
  const highlightRow=(entry,kind)=>{
    if(!entry) return '';
    const m=entry.m;
    const onA=(m.a1===d.ids[0]&&m.a2===d.ids[1])||(m.a1===d.ids[1]&&m.a2===d.ids[0]);
    const oppIds=onA?[m.b1,m.b2]:[m.a1,m.a2];
    const o1=pm[oppIds[0]], o2=pm[oppIds[1]];
    const won=kind!=='loss';
    const meta = kind==='upset'
      ? `Erwartung ${Math.round(entry.expected*100)}%`
      : dateStr(m.created_at);
    const labelMap={
      win:    {l:'Höchster Sieg',     ic:'explosion', col:'var(--acid)'},
      upset:  {l:'Größter Upset',     ic:'tornado',   col:'var(--purple)'},
      loss:   {l:'Schlimmste Niederlage', ic:'skull',     col:'var(--red)'}
    };
    const cfg=labelMap[kind];
    return `<div class="rrow" data-match="${esc(m.id)}" style="padding:11px 13px;display:flex;align-items:center;gap:10px">
      <div style="width:32px;height:32px;border-radius:50%;background:var(--bg2);color:${cfg.col};display:grid;place-items:center;flex-shrink:0">
        <span class="ic svg-ic" style="font-size:16px">${svgI(cfg.ic)}</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;color:${cfg.col};font-weight:700;text-transform:uppercase;letter-spacing:.08em;line-height:1">${cfg.l}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px" class="num">vs ${esc((o1?o1.name:'?')+' & '+(o2?o2.name:'?'))} · ${meta}</div>
      </div>
      <div class="num" style="font-size:14px;font-weight:700;color:${won?'var(--acid)':'var(--red)'};flex-shrink:0">${entry.score}</div>
    </div>`;
  };

  // ─── FORM-VERLAUF: Spark der kumulativen Team-Elo über alle Spiele ───
  // Nutzt sim.history.deltas (live Sim, gecached) statt m.deltas (kann stale sein),
  // damit der Endwert exakt zur angezeigten "Elo"-Statistik passt.
  let teamFormHtml = '';
  if(d.games >= 2){
    const histById = getHistoryByMatchId();
    let trace = 0;
    const series = [0];
    for(const mid of d.matchIdsChrono){
      const h = histById.get(mid);
      let dSum = 0;
      if(h && h.deltas){
        dSum = (h.deltas[d.ids[0]] || 0) + (h.deltas[d.ids[1]] || 0);
      } else {
        // Fallback: gespeicherte DB-Deltas, falls kein History-Eintrag
        const m = matches.find(x=>x.id===mid);
        if(m && m.deltas){
          dSum = (m.deltas[d.ids[0]] || 0) + (m.deltas[d.ids[1]] || 0);
        }
      }
      trace += dSum;
      series.push(trace);
    }
    const minE = Math.min(...series), maxE = Math.max(...series);
    const range = Math.max(20, maxE - minE);
    const W = 300, H = 56, pad = 6;
    const usableH = H - 2*pad;
    const points = series.map((e,i) => {
      const x = (i/(series.length-1))*W;
      const y = pad + (1 - (e-minE)/range)*usableH;
      return [x,y];
    });
    const linePath = 'M' + points.map(p => p[0].toFixed(1)+','+p[1].toFixed(1)).join(' L');
    const fillPath = linePath + ` L${W},${H} L0,${H} Z`;
    const last = points[points.length-1];
    const net = Math.round(series[series.length-1] - series[0]);
    const netCls = net >= 0 ? 'pos' : 'neg';
    const netTxt = (net >= 0 ? '+' : '') + net;
    const lineCol = net >= 0 ? 'var(--acid)' : 'var(--red)';
    const gradId = 'tspark-' + d.ids.join('-');
    teamFormHtml = `
      <div style="margin-bottom:18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);font-weight:700;font-family:'Sometype Mono',monospace">Form-Verlauf</div>
          <div style="font-size:10px;color:var(--muted);font-family:'Sometype Mono',monospace;letter-spacing:.04em">${d.games} Spiele · alle Saisons</div>
        </div>
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">
          <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${lineCol}" stop-opacity=".35"/>
              <stop offset="100%" stop-color="${lineCol}" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${fillPath}" fill="url(#${gradId})"/>
          <path d="${linePath}" fill="none" stroke="${lineCol}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="${lineCol}"/>
        </svg>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px;font-family:'Sometype Mono',monospace">
          <span style="font-size:10px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase">Team-Elo</span>
          <span style="font-size:13px;font-weight:700;color:${lineCol}">${netTxt}</span>
        </div>
      </div>`;
  }

  // ─── AUFSTELLUNG: TYPISCH + (optional) BESTE ───
  // Wenn beide Aufstellungen je ≥2× vorkamen UND die beste Quote von der
  // typischen abweicht (in teamDetail.bestLineup gesetzt), zeigen wir beide
  // Karten nebeneinander. Sonst nur die typische wie bisher.
  const POS_LABEL = {atk:'Sturm', def:'Abwehr'};
  const POS_ICON  = {atk:svgI('bolt'), def:svgI('shield')};
  const POS_COLOR = {atk:'var(--orange)', def:'var(--blue)'};
  const POS_RING  = {atk:'rgba(255,120,73,.5)', def:'rgba(86,180,232,.5)'};
  const pA_pos = d.posStats[pA.id].dom;
  const pB_pos = d.posStats[pB.id].dom;
  const isSplit = d.games >= 2 && d.dominantCount === d.swapped; // 50/50

  const buildLineupCard = (label, sublabel, p0Pos, ringOverride) => {
    const ring = ringOverride || POS_RING[p0Pos];
    const opos = p0Pos==='atk' ? 'def' : 'atk';
    const buildSide = (player, pos) => {
      const em = player.avatar_id ? avatarEmoji(player.avatar_id) : null;
      const avInner = em
        ? `<div style="width:40px;height:40px;border-radius:50%;background:var(--surface3);display:grid;place-items:center;font-size:20px;margin:0 auto 6px;border:2px solid ${ring}">${em}</div>`
        : `<div style="width:40px;height:40px;border-radius:50%;background:${avColor(player.id)};display:grid;place-items:center;font-size:14px;font-family:'Archivo Black',sans-serif;color:#0a0c0b;margin:0 auto 6px;border:2px solid ${ring}">${esc(initials(player.name))}</div>`;
      return `<div style="flex:1;text-align:center;cursor:pointer" data-detail="${esc(player.id)}">
        <div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-bottom:6px;color:${POS_COLOR[pos]}">
          <span class="svg-ic" style="width:11px;height:11px;display:inline-flex">${POS_ICON[pos]}</span>
          <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">${POS_LABEL[pos]}</span>
        </div>
        ${avInner}
        <div style="font-size:11px;font-weight:600">${esc(player.name)}</div>
      </div>`;
    };
    return `<div style="background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:11px 10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);font-weight:700;font-family:'Sometype Mono',monospace">${label}</div>
        <div style="font-size:9px;color:var(--ink2);font-family:'Sometype Mono',monospace;letter-spacing:.04em">${sublabel}</div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        ${buildSide(pA, p0Pos)}
        <span style="color:var(--muted);font-size:10px">vs</span>
        ${buildSide(pB, opos)}
      </div>
    </div>`;
  };

  let lineupHtml;

  if(d.bestLineup){
    // Zwei Karten nebeneinander: TYPISCH (Mehrheits) + BESTE (höhere Quote)
    // typGames/typWr aus teamDetail.bestLineup ableiten: bestLineup.p0 ist
    // die seltenere (=bessere) Pos, also die typische = die andere.
    const typGames = d.dominantCount;
    const typWr = Math.round(d.bestLineup.typicalWr * 100);
    const bestWr = Math.round(d.bestLineup.wr * 100);
    lineupHtml = `
      <div style="margin-bottom:18px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);font-weight:700;margin-bottom:10px;font-family:'Sometype Mono',monospace">Aufstellungs-Vergleich</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${buildLineupCard('Typisch', typGames+' Sp · '+typWr+'%', d.posStats[d.ids[0]].dom)}
          ${buildLineupCard('Beste Quote', d.bestLineup.games+' Sp · '+bestWr+'%', d.bestLineup.p0, 'rgba(247,207,74,.55)')}
        </div>
      </div>`;
  } else {
    // Single-Card: bestehende Logik (typische Aufstellung)
    const renderPlayerLineup = (player, pos) => {
      const em = player.avatar_id ? avatarEmoji(player.avatar_id) : null;
      const ring = isSplit ? 'var(--line2)' : POS_RING[pos];
      const avInner = em
        ? `<div style="width:48px;height:48px;border-radius:50%;background:var(--surface3);display:grid;place-items:center;font-size:24px;margin:0 auto 8px;border:2px solid ${ring}">${em}</div>`
        : `<div style="width:48px;height:48px;border-radius:50%;background:${avColor(player.id)};display:grid;place-items:center;font-size:16px;font-family:'Archivo Black',sans-serif;color:#0a0c0b;margin:0 auto 8px;border:2px solid ${ring}">${esc(initials(player.name))}</div>`;
      const posLabelStyle = isSplit ? 'color:var(--ink2)' : `color:${POS_COLOR[pos]}`;
      const posLabel = isSplit ? 'Wechselt' : POS_LABEL[pos];
      return `<div style="flex:1;text-align:center;cursor:pointer" data-detail="${esc(player.id)}">
        <div style="display:flex;align-items:center;justify-content:center;gap:5px;margin-bottom:8px;${posLabelStyle}">
          <span class="svg-ic" style="width:13px;height:13px;display:inline-flex">${POS_ICON[pos]}</span>
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em">${posLabel}</span>
        </div>
        ${avInner}
        <div style="font-size:13px;font-weight:600">${esc(player.name)}</div>
      </div>`;
    };
    const lineupFooter = d.games >= 2 ? `
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;font-family:'Sometype Mono',monospace;font-size:10.5px">
        <span style="color:var(--ink2)">In <span style="color:var(--ink);font-weight:700">${d.dominantCount} / ${d.games}</span> Spielen</span>
        <span style="color:var(--ink2)"><span style="color:var(--muted)">⇄</span> ${d.swapped}× getauscht</span>
      </div>` : '';
    lineupHtml = `
      <div style="margin-bottom:18px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);font-weight:700;margin-bottom:12px;font-family:'Sometype Mono',monospace">Typische Aufstellung</div>
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:14px 14px 12px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
            ${renderPlayerLineup(pA, d.posStats[pA.id].dom)}
            <div style="display:flex;flex-direction:column;align-items:center;color:var(--muted);font-size:11px">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/><polyline points="12,5 5,12 12,19"/></svg>
            </div>
            ${renderPlayerLineup(pB, d.posStats[pB.id].dom)}
          </div>
          ${lineupFooter}
        </div>
      </div>`;
  }

  // ─── TEAM-AWARDS (Lifetime — alle Saisons) ───
  // Spiegel des Spieler-Awards-Konzepts: zeigt die Top-3-Platzierungen des
  // Duos in der saison-übergreifenden awardRankings('all')-Liste.
  const TEAM_AW_IC = {
    mvt:'handshake', bestDuo:'duo', worstTeam:'crashTeam',
    zirkus:'circus', baustelle:'construction', unstoppable:'unstoppable',
    concreteWall:'concreteWall', cheesePlatter:'cheese', luckyCharm:'clover',
    giantSlayer:'giantSlayer', favoritenschreck:'devilMask', rivalry:'crossedSwords'
  };
  const tAch = teamAchievements(p1Id, p2Id);
  const RANK_LABEL = ['#1','#2','#3'];
  const teamAwardsHtml = tAch.length ? `
    <div style="margin-bottom:18px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);font-weight:700;margin-bottom:8px;font-family:'Sometype Mono',monospace">Auszeichnungen als Team</div>
      <div class="pp-awards" style="grid-template-columns:repeat(3,1fr)">
        ${tAch.map(a => {
          const meta = AWARD_META[a.key]; if(!meta) return '';
          const icKey = TEAM_AW_IC[a.key] || 'trophy';
          // Farb-Klasse aus AWARD_META, Wertanzeige in Farbe
          const colorMap = {acid:'var(--acid)', blue:'var(--blue)', gold:'var(--gold)', orange:'var(--orange)', purple:'var(--purple)', red:'var(--red)'};
          const col = colorMap[meta.cls] || 'var(--ink)';
          return `<div class="pp-aw" data-team-award="${esc(a.key)}" style="border-top:2px solid ${col}">
            <span class="ic svg-ic" style="color:${col}">${svgI(icKey)}</span>
            <div class="nm">${esc(meta.title)}</div>
            <div class="num" style="color:${col};font-size:11px">${esc(a.val)}</div>
            <div style="font-size:8.5px;color:var(--muted);margin-top:2px;font-family:'Sometype Mono',monospace">${RANK_LABEL[a.rank]||''}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  // ─── STREAKS (aktuelle + längste) ───
  // Verzichten auf Last-N-Dots wie im Spieler-Profil — hier ist die reine
  // Zahlen-Anzeige übersichtlicher (Form-Spark daneben deckt die Verlaufs-
  // Visualisierung schon ab).
  let streaksHtml = '';
  if(d.games >= 2){
    const curLabel = d.currentStreak === 0 ? '–'
      : d.currentStreak > 0 ? d.currentStreak+' Siege'
      : (-d.currentStreak)+' Niederl.';
    const curColor = d.currentStreak > 0 ? 'var(--acid)' : (d.currentStreak < 0 ? 'var(--red)' : 'var(--muted)');
    streaksHtml = `
      <div style="margin-bottom:18px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);font-weight:700;margin-bottom:8px;font-family:'Sometype Mono',monospace">Serien</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div style="background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px 8px;text-align:center">
            <div style="font-family:'Archivo Black',sans-serif;font-size:16px;color:${curColor};line-height:1">${curLabel}</div>
            <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-top:4px">Aktuell</div>
          </div>
          <div style="background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px 8px;text-align:center">
            <div style="font-family:'Archivo Black',sans-serif;font-size:16px;color:var(--acid);line-height:1">${d.longestWinStreak||'–'}</div>
            <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-top:4px">Längste Sieges</div>
          </div>
          <div style="background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px 8px;text-align:center">
            <div style="font-family:'Archivo Black',sans-serif;font-size:16px;color:var(--red);line-height:1">${d.longestLossStreak||'–'}</div>
            <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-top:4px">Längste Pleiten</div>
          </div>
        </div>
      </div>`;
  }

  // ─── LIGA-TITEL (Team of the Season) ───
  const titlesHtml = d.seasonTitles.length ? `
    <div style="margin-bottom:18px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);font-weight:700;font-family:'Sometype Mono',monospace">Liga-Titel</div>
        <div style="font-size:10px;color:var(--muted);font-family:'Sometype Mono',monospace">${d.seasonTitles.length} ${d.seasonTitles.length===1?'Titel':'Titel'}</div>
      </div>
      <div class="pp-trophies" style="margin:0 -16px;padding:4px 16px">
        ${d.seasonTitles.map(t => `<div class="pp-tr team">
          <span class="ic svg-ic">${svgI('handshake')}</span>
          <div class="ti">Team of<br>the Season</div>
          <div class="su">${esc(t.label)}</div>
        </div>`).join('')}
      </div>
    </div>` : '';

  // ─── FUN FACTS ───
  // Selektion: Tore/Spiel, Gegentore/Spiel, Zu-Null-Siege, ggf. Lieblings-Score.
  // Bewusst kompakt — vier 1/2-Spalten-Cards (oder 1/3 wenn topScore vorhanden).
  let funFactsHtml = '';
  if(d.games >= 2){
    const avgGf = (d.gf / d.games).toFixed(1);
    const avgGa = (d.ga / d.games).toFixed(1);
    const facts = [
      { label:'Ø Tore', value:avgGf, color:'var(--acid)' },
      { label:'Ø Gegen', value:avgGa, color:'var(--red)' },
    ];
    if(d.shutouts > 0) facts.push({ label:'Zu Null', value:d.shutouts+'×', color:'var(--blue)' });
    if(d.perfectWins > 0) facts.push({ label:'10:0', value:d.perfectWins+'×', color:'var(--gold)' });
    if(d.topScore) facts.push({ label:'Top-Stand', value:d.topScore, color:'var(--purple)', sub:d.topScoreCount+'×' });
    const cols = facts.length >= 4 ? 'repeat(4,1fr)' : 'repeat('+facts.length+',1fr)';
    funFactsHtml = `
      <div style="margin-bottom:18px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);font-weight:700;margin-bottom:8px;font-family:'Sometype Mono',monospace">Fun Facts</div>
        <div style="display:grid;grid-template-columns:${cols};gap:8px">
          ${facts.map(f => `<div style="background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px 6px;text-align:center">
            <div class="num" style="font-family:'Archivo Black',sans-serif;font-size:15px;color:${f.color};line-height:1">${f.value}</div>
            <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-top:4px">${f.label}</div>
            ${f.sub?`<div style="font-size:8px;color:var(--muted);margin-top:2px;font-family:'Sometype Mono',monospace">${f.sub}</div>`:''}
          </div>`).join('')}
        </div>
      </div>`;
  }

  const highlights=[
    highlightRow(d.biggestWin,'win'),
    highlightRow(d.biggestUpset,'upset'),
    highlightRow(d.biggestLoss,'loss')
  ].filter(Boolean).join('');

  // Letzte 10 Matches (vorher 5) — slice in teamDetail bereits auf 10 erweitert
  const recentRows=d.recent.map(r=>{
    const m=r.m;
    const oppIds=r.onA?[m.b1,m.b2]:[m.a1,m.a2];
    const o1=pm[oppIds[0]], o2=pm[oppIds[1]];
    const won=r.won;
    return `<div class="rrow" data-match="${esc(m.id)}" style="padding:10px 13px;display:flex;align-items:center;gap:10px">
      <div style="width:24px;height:24px;border-radius:50%;background:${won?'rgba(190,242,100,.12)':'rgba(240,86,106,.12)'};color:${won?'var(--acid)':'var(--red)'};display:grid;place-items:center;flex-shrink:0">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          ${won?'<polyline points="4,12 10,18 20,6"/>':'<path d="M6 6L18 18M6 18L18 6"/>'}
        </svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;line-height:1.2">vs <span style="color:var(--ink2)">${esc((o1?o1.name:'?')+' & '+(o2?o2.name:'?'))}</span></div>
        <div class="num" style="font-size:10px;color:var(--muted);margin-top:2px">${dateStr(m.created_at)}</div>
      </div>
      <div class="num" style="font-size:13px;font-weight:600;color:var(--ink);flex-shrink:0">${m.score_a} : ${m.score_b}</div>
    </div>`;
  }).join('');

  openSheet(`
    <div style="text-align:center;margin-bottom:18px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.2em;color:var(--muted);font-weight:700;font-family:'Sometype Mono',monospace">Team</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:14px">
        <div data-detail="${esc(pA.id)}" style="cursor:pointer">${avBig(pA)}</div>
        <div style="font-family:'Archivo Black',sans-serif;font-size:18px;color:var(--muted)">&amp;</div>
        <div data-detail="${esc(pB.id)}" style="cursor:pointer">${avBig(pB)}</div>
      </div>
      <div style="font-family:'Archivo Black',sans-serif;font-size:20px;letter-spacing:-.02em;line-height:1.1;margin-top:14px">${esc(pA.name)} &amp; ${esc(pB.name)}</div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:18px">
      <div style="flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px 8px;text-align:center">
        <div style="font-family:'Archivo Black',sans-serif;font-size:18px;color:var(--ink);line-height:1">${d.games}</div>
        <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-top:4px">Spiele</div>
      </div>
      <div style="flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px 8px;text-align:center">
        <div style="font-family:'Archivo Black',sans-serif;font-size:18px;color:var(--acid);line-height:1">${wr}%</div>
        <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-top:4px">Quote</div>
      </div>
      <div style="flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px 8px;text-align:center">
        <div class="num" style="font-family:'Archivo Black',sans-serif;font-size:18px;color:var(--ink);line-height:1">${gdStr}</div>
        <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-top:4px">Tordiff</div>
      </div>
      <div style="flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px 8px;text-align:center">
        <div class="num" style="font-family:'Archivo Black',sans-serif;font-size:18px;color:${eloColor};line-height:1">${eloStr}</div>
        <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-top:4px">Elo</div>
      </div>
    </div>

    <div style="margin-bottom:18px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);font-weight:700;margin-bottom:8px;font-family:'Sometype Mono',monospace">Bilanz</div>
      <div style="display:flex;height:8px;border-radius:99px;overflow:hidden;background:var(--line)">
        <div style="width:${d.games?(d.wins/d.games*100):0}%;background:var(--acid)"></div>
        <div style="width:${d.games?(d.losses/d.games*100):0}%;background:var(--red)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px" class="num">
        <span style="color:var(--acid)">${d.wins} Siege</span>
        <span style="color:var(--red)">${d.losses} Niederlagen</span>
      </div>
    </div>

    ${teamAwardsHtml}
    ${streaksHtml}
    ${titlesHtml}
    ${teamFormHtml}
    ${lineupHtml}
    ${funFactsHtml}

    ${d.nemesis?oppRow(d.nemesis,'Erzgegner'):''}
    ${d.favorite?oppRow(d.favorite,'Lieblingsgegner'):''}

    ${highlights?`
    <div style="margin-bottom:18px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);font-weight:700;margin-bottom:8px;font-family:'Sometype Mono',monospace">Highlights</div>
      <div style="display:flex;flex-direction:column;gap:6px">${highlights}</div>
    </div>`:''}

    ${recentRows?`
    <div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);font-weight:700;margin-bottom:8px;font-family:'Sometype Mono',monospace">Letzte ${Math.min(10,d.recent.length)} Spiele</div>
      <div style="display:flex;flex-direction:column;gap:6px">${recentRows}</div>
    </div>`:''}
  `);

  // Innerhalb des Sheets klickbar machen
  const sheetEl=document.getElementById('sheet');
  if(sheetEl){
    sheetEl.querySelectorAll('[data-detail]').forEach(el=>{
      el.onclick=()=>{const pid=el.dataset.detail; sheetNav(()=>showPlayer(pid));};
    });
    sheetEl.querySelectorAll('[data-match]').forEach(el=>{
      el.onclick=()=>{const mid=el.dataset.match; sheetNav(()=>showMatchDetail(mid));};
    });
    // Team-Award-Chips: Klick öffnet Award-Detail-Sheet
    sheetEl.querySelectorAll('[data-team-award]').forEach(el=>{
      el.onclick=()=>{const key=el.dataset.teamAward; sheetNav(()=>{ awPeriod='all'; awSeasonId=null; showAward(key); });};
    });
  }
}

function showMatchDetail(mid){
  const m=matches.find(x=>x.id===mid);if(!m)return;
  _sheetSetReopen(()=>showMatchDetail(mid));
  // DB-First: Delta-Anzeige immer aus m.deltas (Wahrheitsquelle).
  // matchBreakdown() bleibt für Slider-Detail-Komponenten verfügbar.
  const line=(id,pos)=>{
    const d=(m.deltas||{})[id]||0;
    return `<div class="delta-row"><span class="dn">${esc(pname(id))} <span class="chip ${pos}">${pos==='atk'?'STU':'ABW'}</span></span><span class="delta-v ${d>=0?'pos':'neg'}">${d>=0?'+':''}${Math.round(d)}</span></div>`;
  };
  // Auszeichnungen durch dieses Match
  const earned=badgesEarnedInMatch(mid);
  const earnedHtml=earned.length?`
    <div class="mini-label" style="margin-top:14px">Auszeichnungen in diesem Match</div>
    <div style="display:flex;flex-direction:column;gap:5px">
      ${earned.map(e=>{
        // Rarity-Farbe pro Badge: legendary=gold, rare=purple, common=acid, negative=red.
        // Bewusst dezent — nur Icon + Border-Akzent + Badge-Name in der Farbe,
        // damit die Liste auseinanderhaltbar bleibt, aber nicht überladen wirkt.
        const rarity = rarityOf(e.badge.id);
        const color = (RARITY_META[rarity]||{}).color || 'var(--ink2)';
        return `<div class="rrow" style="padding:10px 13px;cursor:default;border-left:3px solid ${color}">
          <span class="ic svg-ic" style="font-size:18px;width:32px;text-align:center;color:${color}">${badgeIc(e.badge,'18px')}</span>
          <div class="rmid"><div class="rname" style="font-size:13px">${esc(pname(e.playerId))}</div>
            <div class="rmeta"><span style="color:${color};opacity:.85">${e.badge.name}</span></div></div>
        </div>`;
      }).join('')}
    </div>`:''
  ;
  openSheet(`<h3>${m.score_a} : ${m.score_b}</h3><div class="sheet-sub">${dateStr(m.created_at)} · Team ${m.winner} gewinnt</div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <div data-team="${esc([m.a1,m.a2].sort().join('|'))}" style="flex:1;background:var(--surface);border:1px solid ${m.winner==='A'?'var(--acid2)':'var(--line)'};border-radius:10px;padding:8px 10px;cursor:pointer;text-align:center">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-family:'Sometype Mono',monospace">Team A</div>
        <div style="font-size:12px;margin-top:2px;line-height:1.2">${esc(pname(m.a1)+' & '+pname(m.a2))}</div>
      </div>
      <div data-team="${esc([m.b1,m.b2].sort().join('|'))}" style="flex:1;background:var(--surface);border:1px solid ${m.winner==='B'?'var(--acid2)':'var(--line)'};border-radius:10px;padding:8px 10px;cursor:pointer;text-align:center">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-family:'Sometype Mono',monospace">Team B</div>
        <div style="font-size:12px;margin-top:2px;line-height:1.2">${esc(pname(m.b1)+' & '+pname(m.b2))}</div>
      </div>
    </div>
    <div class="preview" style="margin-top:16px"><div class="delta-list">
      ${line(m.a1,m.a1_pos)}${line(m.a2,m.a2_pos)}<div class="delta-div"></div>${line(m.b1,m.b1_pos)}${line(m.b2,m.b2_pos)}
    </div></div>
    <button class="btn ghost sm" id="showBreakdownBtn" style="margin-top:10px;width:100%;display:inline-flex;align-items:center;justify-content:center;gap:6px">${svgI('chartBar')} Elo-Analyse anzeigen</button>
    <div id="breakdownSlot"></div>
    ${earnedHtml}
    <div class="btn-row" style="margin-top:14px">
      <button class="btn ghost sm" id="editThisMatch" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px">${svgI('edit')} Bearbeiten</button>
      <button class="btn ghost sm" id="delThisMatch" style="flex:0 0 38%;color:var(--red)">Löschen</button>
    </div>`);
  // Breakdown-Button
    document.getElementById('showBreakdownBtn').onclick=()=>{
    const bd=matchBreakdown(mid);
    const slot=document.getElementById('breakdownSlot');
    if(!bd||!Object.keys(bd).length){slot.innerHTML='<p style="font-size:12px;color:var(--muted);text-align:center">Keine Daten verfügbar</p>';return;}
    // DB-First-Werte (was tatsächlich in der DB steht & oben angezeigt wird).
    // Die Aufschlüsselungs-Faktoren stammen aus simulateEloWithSliders und können
    // abweichen, wenn Slider oder Code-Logik seit dem Match geändert wurden.
    const histById=getHistoryByMatchId();
    const hist=histById.get(mid);
    const dbDeltas=(hist&&hist.deltas)||{};
    const dbBefore=(hist&&hist.eloBefore)||{};
    const dbAfter=(hist&&hist.eloAfter)||{};
    const ids=[m.a1,m.a2,m.b1,m.b2];
    // Divergenz erkennen: weicht die Slider-Summe relevant von der DB ab?
    const anyDiverged=ids.some(id=>{
      const b=bd[id]; if(!b||dbDeltas[id]===undefined)return false;
      return Math.abs(dbDeltas[id]-b.finalDelta)>=1;
    });
    const rows=ids.map(id=>{
      const b=bd[id]; if(!b)return '';
      // Elo-Analyse zeigt exakte Werte mit 2 Nachkommastellen — keine Rundung wie überall sonst.
      const sign=v=>v>=0 ? '+'+v.toFixed(2) : v.toFixed(2);
      // Der Detail-Header zeigt IMMER den präzisen Sim-Wert, damit die große Zahl
      // exakt der Summe der Faktoren-Liste darunter entspricht. Der gerundete DB-Wert
      // bleibt nur oben in der Match-Übersicht sichtbar (eigener Render-Pfad).
      const hasDb=dbDeltas[id]!==undefined;
      const headerDelta=b.finalDelta;
      // Saison-Elo: bei DB-Werten sind das gespeicherte Integer (deshalb keine zusätzliche
      // Präzision möglich). Bei Sim-Fallback geben wir 1 Nachkommastelle aus.
      const fmtElo=v=>Number.isInteger(v)?String(v):v.toFixed(1);
      const seasonBefore=fmtElo(hasDb?dbBefore[id]:b.startElo);
      const seasonAfter=fmtElo(hasDb?dbAfter[id]:b.endElo);
      const simDelta=b.finalDelta;
      const rowDiverged=hasDb&&Math.abs(dbDeltas[id]-simDelta)>=1;
      const factors=[];
      factors.push({label:'Basis (Erwartung)',val:b.rawBase,desc:b.won?'Sieg'+(b.expected<0.5?' gegen stärkeres Team':''):'Niederlage'+(b.expected>0.5?' gegen schwächeres Team':'')});
      if(Math.abs(b.movEffect)>0.1) factors.push({label:'Tordifferenz',val:b.movEffect,desc:b.won?'Klarer Sieg':'Hohe Niederlage'+(b.movMult<1.2?' (gedämpft)':'')});
      if(Math.abs(b.winBoostEffect)>0.1) factors.push({label:'Sieg-Boost',val:b.winBoostEffect,desc:'+'+((b.winBoost-1)*100).toFixed(1)+'% für Siege'});
      if(b.expProtect<1) factors.push({label:'Erfahrungs-Schutz',val:b.expProtectEffect,desc:((1-b.expProtect)*100).toFixed(1)+'% Schutz'});
      if(b.lowEloDamp!==undefined && b.lowEloDamp<0.995){
        factors.push({label:'Low-Elo Schutz',val:b.lowEloEffect,desc:((1-b.lowEloDamp)*100).toFixed(1)+'% Schutz (schwacher Spieler)'});
      }
      if(b.underdogMult>1.005){
        // Underdog-Boost setzt sich aus zwei unabhängig clampten Komponenten zusammen
        // (Elo-Gap + Spiele-Gap). Wir zeigen nur die wirksamen (positiven) Anteile,
        // weil negative Differenzen keinen Effekt mehr haben.
        const eloPart   = b.underdogEloDiff>0   ? b.underdogEloDiff+' Elo schwächer'   : null;
        const gamesPart = b.underdogGamesDiff>0 ? b.underdogGamesDiff+' Spiele weniger' : null;
        const desc = [eloPart, gamesPart].filter(Boolean).join(' · ') || 'Underdog';
        // Effekt ohne lowElo-Anteil: rawBase*mov*boost*expProtect*(underdogMult-1)
        const undEffect = b.rawBase*b.movMult*b.winBoost*b.expProtect*(b.underdogMult-1);
        factors.push({label:'Underdog-Boost',val:undEffect, desc});
      }
      if(Math.abs(b.riskEffect)>0.1) factors.push({label:b.riskShare<1?'Risiko-Split (stark)':'Risiko-Split (schwach)',val:b.riskEffect,desc:'Mate-Stärke-Verteilung'});
      if(Math.abs(b.posEffect)>0.1) factors.push({label:'Positions-Bonus',val:b.posEffect,desc:(b.posMult>1?'Schwache':'Starke')+' Position'});
      factors.push({label:'Spielbonus',val:b.matchBonus,desc:'Flat +'+b.matchBonus.toFixed(2)+' pro Match'});
      const factorRows=factors.map(f=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:11px">
        <div><span style="color:var(--ink)">${f.label}</span> <span style="color:var(--muted);font-size:10px">${f.desc}</span></div>
        <span style="font-family:'Sometype Mono',monospace;font-weight:700;color:${f.val>=0?'var(--acid)':'var(--red)'}">${sign(f.val)}</span>
      </div>`).join('');
      const divergeNote=rowDiverged?`<div style="font-size:10px;color:var(--gold);margin-top:6px;padding-top:6px;border-top:1px dashed var(--line);font-family:'Sometype Mono',monospace">↻ Aktuelle Regler: ${sign(simDelta)} (Σ Faktoren)</div>`:'';
      return `<div style="background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:12px;margin-top:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:700;font-size:13px">${esc(pname(id))}</span>
          <span style="font-family:'Archivo Black',sans-serif;font-size:15px;color:${headerDelta>=0?'var(--acid)':'var(--red)'}">${sign(headerDelta)}</span>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--line)">
          <div style="display:flex;justify-content:space-between">
            <span>${seasonBefore} → ${seasonAfter}</span>
            <span>K=${b.kFactor.toFixed(1)} · Erw. ${(b.expected*100).toFixed(1)}%</span>
          </div>
        </div>
        ${factorRows}
        ${divergeNote}
      </div>`;
    }).join('');
    const banner=anyDiverged?`<div style="background:rgba(247,207,74,.08);border:1px solid rgba(247,207,74,.3);border-radius:10px;padding:10px 12px;margin-top:10px;font-size:11.5px;color:var(--gold);line-height:1.5">
      <b>Hinweis:</b> Die Faktoren unten werden mit den <i>aktuellen</i> Reglern berechnet. Die gespeicherten Deltas (oben) stammen aus der Berechnung zum Zeitpunkt des Matches. <b>Settings → Neu berechnen</b> bringt beides in Deckung.
    </div>`:'';
    slot.innerHTML=`<div class="mini-label" style="margin-top:14px">Elo-Analyse</div>${banner}${rows}`;
    document.getElementById('showBreakdownBtn').style.display='none';
  };

  document.getElementById('editThisMatch').onclick=()=>showEditMatch(mid);
  document.getElementById('delThisMatch').onclick=async()=>{
        if(!confirm('Match wirklich löschen? Die gesamte Rangliste wird danach automatisch neu berechnet.'))return;
    closeSheet(true); toast('Lösche & berechne neu…');
    await sb.from('matches').delete().eq('id',mid);
    const rest=matches.filter(x=>x.id!==mid);
    invalidateCache(['global', 'stats', 'awards', 'teams', 'period', 'badges']); // <-- HIER INVALIDIEREN
    await persistRecalc(rest);
    toast('Gelöscht & neu berechnet','ok'); await loadAll();


  };
  // Team-Chips → Team-Profil
  document.querySelectorAll('[data-team]').forEach(el=>{
    el.onclick=()=>{
      const [a,b]=el.dataset.team.split('|');
      if(!a||!b) return;
      sheetNav(()=>showTeam(a,b));
    };
  });
}

