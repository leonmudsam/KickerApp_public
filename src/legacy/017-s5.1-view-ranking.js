// ╔═══ §5.1 ─── VIEW: RANKING ──────────────────────────────────────────╗
//     Zeigt Saison/Woche/Gesamt-Rangliste, Hall of Fame, POTW/POTD.
// ╚═════════════════════════════════════════════════════════════════════════╝
function vRanking(){ return _vRankingCore() + _seasonToolsHtml(); }
// v9: „Saison-Tools" am Ende der Rangliste — Recap + Positionsverlauf, aus dem
// App-Header hierher verschoben (Idee E). Konditional wie die alten Buttons:
//   • Recap nur wenn eine vergangene Saison existiert
//   • Positionsverlauf nur wenn die aktuelle Saison ≥1 Match hat
// Leichtgewichtig: nur zwei billige Längen-Checks (matchesInSeason ist gecached).
function _seasonToolsHtml(){
  const cur = currentSeason();
  const hasPos = matchesInSeason(cur.id).length > 0;
  const past = seasons.filter(s => s.id !== cur.id);
  const hasRecap = past.length > 0;
  if(!hasPos && !hasRecap) return '';
  const recapIc = `<svg viewBox="0 0 24 24"><path d="M7 4v6a5 5 0 0010 0V4H7zM7 4H4v2a3 3 0 003 3M17 4h3v2a3 3 0 01-3 3M12 15v3M9 21h6"/></svg>`;
  const posIc   = `<svg viewBox="0 0 24 24"><path d="M5 21V11M12 21V7M19 21V3M3 21h18"/></svg>`;
  let cards = '';
  if(hasRecap){
    cards += `<button type="button" class="st-card recap" data-seasontool="recap">
      <span class="st-ic">${recapIc}</span><span class="st-tt">Saison-Recap</span>
      <span class="st-su">${esc(seasonLabel(past[0].id))} ansehen</span></button>`;
  }
  if(hasPos){
    cards += `<button type="button" class="st-card pos" data-seasontool="pos">
      <span class="st-ic">${posIc}</span><span class="st-tt">Positionsverlauf</span>
      <span class="st-su">Saison-Entwicklung</span></button>`;
  }
  const one = (hasRecap && hasPos) ? '' : ' one';
  return `<div class="seasontools"><div class="st-sec">Saison-Tools</div><div class="st-grid${one}">${cards}</div></div>`;
}
function _vRankingCore(){
  const periodBar=`
    <div class="seg accent" style="margin-bottom:14px">
      <button data-period="season" class="${period==='season'?'on':''}">Saison</button>
      <button data-period="week" class="${period==='week'?'on':''}">Woche</button>
      <button data-period="day" class="${period==='day'?'on':''}">Tag</button>
      <button data-period="all" class="${period==='all'?'on':''}">Gesamt</button>
    </div>`;

  // ZEITRAUM-ANSICHT (Tag/Woche/Monat)
  if(period!=='all'){
    let ps=periodPlayerStats(period);
    if(rankSearch)ps=ps.filter(x=>{const p=pmap()[x.id];return p&&p.name.toLowerCase().includes(rankSearch.toLowerCase());});
    // Match-Liste des Zeitraums einmalig cachen — wird in formDots pro Spieler aufgerufen
    const periodMs=matchesInPeriod(period);
    // Sortierung: Saison nach Elo, Woche nach Siegen mit korrekten Tie-Breakern
    if(period==='season'){
      ps.sort((a,b)=>b.elo-a.elo||b.wins-a.wins);
    } else {
      ps.sort(periodSort==='elo'
        ?(a,b)=>b.eloNet-a.eloNet||b.wins-a.wins||(b.wins/b.games||0)-(a.wins/a.games||0)||b.gd-a.gd
        :(a,b)=>b.wins-a.wins||(b.wins/b.games||0)-(a.wins/a.games||0)||b.gd-a.gd||b.eloNet-a.eloNet);
    }
    // Saison-Champion: höchste Saison-Elo. Woche/Tag: identisch zur POTW/POTD-Badge-Logik.
    const totalMatches=periodMs.length;
    let winner;
    if(period==='season'){
      winner=ps.length&&ps[0].games>0?ps[0]:null;
    } else {
      const minWins = period==='week' ? 5 : period==='day' ? 3 : 1;
      const qual=ps.filter(x=>x.wins>=minWins);
      // ────────────────────────────────────────────────────────────────
      // Tie-Break IDENTISCH zur POTW/POTD-Badge-Logik:
      //   • Woche: WR desc → Siege desc → Elo-Delta desc
      //     (siehe POTW-Recap, Zeile ~3604)
      //   • Tag:   Siege desc → Elo-Delta desc
      //     (siehe showPotdRecap, Zeile ~4015)
      // Wichtig: der Sieger darf NICHT vom periodSort abhängen — sonst
      // wechselt die Hero-Card je nach "Nach Siegen"/"Nach Elo"-Filter
      // (das war der Bug: zwei Spieler mit 4W-1L 80% wurden je nach
      // Sortierung verschieden als Tagessieger angezeigt).
      // ────────────────────────────────────────────────────────────────
      if(period==='week'){
        winner=qual.length?[...qual].sort((a,b)=>
          (b.wins/b.games)-(a.wins/a.games)
          ||b.wins-a.wins
          ||b.eloNet-a.eloNet
        )[0]:null;
      } else {
        // period==='day' — exakt analog showPotdRecap
        winner=qual.length?[...qual].sort((a,b)=>
          b.wins-a.wins
          ||b.eloNet-a.eloNet
        )[0]:null;
      }
    }
    const rows=(()=>{
      // Form der letzten 5 Matches (W/L Punkte) — nutzt das gecachte periodMs
      const formDots=(id)=>{
        const ms2=periodMs.filter(m=>[m.a1,m.a2,m.b1,m.b2].includes(id))
          .sort((a,b)=>mts(b)-mts(a)).slice(0,5).reverse();
        return ms2.map(m=>{const onA=(id===m.a1||id===m.a2);
          const w=(onA&&m.winner==='A')||(!onA&&m.winner==='B');
          return `<div class="dot ${w?'w':'l'}"></div>`;}).join('');
      };
      // Streak-Badge: 1/2/3 Flammen je nach Stärke — alle in Standard-Farbe
      const streakBadge=(cs)=>{
        if(cs>=3){
          const flames = cs>=7 ? 'flameTriple' : cs>=5 ? 'flameDouble' : 'flame';
          return `<span class="streak-badge" title="${cs}er Siegesserie">${svgI(flames)}</span>`;
        }
        if(cs<=-3){
          const drops = cs<=-7 ? 'dropTriple' : cs<=-5 ? 'dropDouble' : 'drop';
          return `<span class="streak-badge fire" title="${-cs}er Niederlagenserie">${svgI(drops)}</span>`;
        }
        return '';
      };
      return ps.map((x,i)=>{
        const p=pmap()[x.id]; if(!p)return '';
        const medal=medalB(i);
        let big, small;
        if(period==='season'){big=x.elo;small='Elo';}
        else if(periodSort==='elo'){big=(x.eloNet>=0?'+':'')+x.eloNet;small='Elo';}
        else {big=x.wins;small='Siege';}
        const wr=x.games?Math.round(x.wins/x.games*100):0;
        const streak=streakBadge(x.curStreak);
        const isTop=i<3;
        const gainLoss=x.games&&period!=='all'?`<div class="elo-gain-bar"><span class="gain">+${x.eloGain}</span><span class="loss">${x.eloLoss}</span></div>`:'';
        return `<div class="rrow ${isTop?'top'+(i+1):''}" data-detail="${x.id}" style="${isTop?'padding:14px 16px':'padding:10px 14px'}">
          ${medal?`<span class="medal">${medal}</span><span class="pos" style="opacity:0"></span>`:`<span class="pos num" style="${!isTop?'font-size:13px':''}">${i+1}</span>`}
          ${avHtml(p, i===0&&period==='season'?'width:46px;height:46px;font-size:16px':!isTop?'width:34px;height:34px;font-size:11px;border-radius:10px':'')}
          <div class="rmid">
            <div class="rname" style="${!isTop?'font-size:13px':''}">${esc(p.name)}${streak}</div>
            <div class="rmeta"><span>${x.wins}–${x.losses}</span>
              <span class="wbar"><i style="width:${wr}%"></i></span><span>${wr}%</span></div>
            ${period!=='all'?`<div class="form-dots">${formDots(x.id)}</div>`:''}
            ${period!=='all'&&x.games?`<div class="elo-gain-bar"><span class="gain">+${x.eloGain}</span><span class="loss">${x.eloLoss}</span></div>`:''}
          </div>
          <div class="rval"><div class="${isTop&&period==='season'?'elo-big':'big'} num" style="${!isTop?'font-size:15px':''}">${big}</div><div class="small">${small}</div></div>
        </div>`;}).join('');
    })();
    // Team of the Season + Titelverteidiger
    let teamBannerHtml='', defenderCards='', bestTeamKey='';
    // Hilfsfunktion für kleine Chip-Avatare (22 px)
    const chipAv=(pid)=>{
      const pp=pmap()[pid];
      if(!pp) return `<div class="sh-chip-av" style="background:var(--surface3);color:var(--muted)">?</div>`;
      const em=pp.avatar_id?avatarEmoji(pp.avatar_id):null;
      if(em) return `<div class="sh-chip-av" style="background:var(--surface3);color:inherit;font-size:13px">${em}</div>`;
      return `<div class="sh-chip-av" style="background:${avColor(pid)}">${esc(initials(pp.name))}</div>`;
    };
    if(period==='season'){
      const seasonMs=periodMs; // bereits gecacht
      const T={};
      seasonMs.forEach(m=>{
        [[m.a1,m.a2,m.winner==='A'],[m.b1,m.b2,m.winner==='B']]
        .forEach(([x,y,won])=>{const k=[x,y].sort().join('|');
          if(!T[k])T[k]={ids:[x,y].sort(),g:0,w:0};T[k].g++;if(won)T[k].w++;});
      });
      // Team of Season = höchster gemeinsamer Elo-Zuwachs (aus globalSim für Konsistenz)
      const _gsim=getGlobalSim();
      const _seasonTeamMap=_gsim.seasonTeamElo[currentSeason().id]||{};
      const teamEntries=Object.entries(_seasonTeamMap).filter(([k])=>{
        const ids=k.split('|');const tms=Object.values(T);
        return tms.some(t=>t.ids[0]===ids[0]&&t.ids[1]===ids[1]&&t.g>=2);
      }).sort((a,b)=>b[1]-a[1]);
      const bestTeamEntry=teamEntries[0];
      if(bestTeamEntry){
        const ids=bestTeamEntry[0].split('|');
        bestTeamKey=ids.sort().join('|');
        const eloGain=Math.round(bestTeamEntry[1]);
        const tData=Object.values(T).find(t=>t.ids[0]===ids[0]&&t.ids[1]===ids[1]);
        teamBannerHtml=`
          <div class="sh-chip team clickable" id="seasonTeamCard" data-team="${esc(bestTeamKey)}">
            <div class="sh-chip-label">Team of the Season</div>
            <div class="sh-chip-row">
              <div class="sh-chip-pair">${chipAv(ids[0])}${chipAv(ids[1])}</div>
              <div class="sh-chip-name">${esc(ids.map(pname).join(' & '))}</div>
            </div>
            <div class="sh-chip-detail">${eloGain>=0?'+':''}${eloGain} Elo${tData?' · '+tData.w+'/'+tData.g:''}</div>
          </div>`;
      } else {
        teamBannerHtml=`
          <div class="sh-chip team" id="seasonTeamCard">
            <div class="sh-chip-label">Team of the Season</div>
            <div class="sh-chip-row">
              <div class="sh-chip-av" style="background:var(--surface3);color:var(--muted)">?</div>
              <div class="sh-chip-name" style="color:var(--muted)">noch offen</div>
            </div>
            <div class="sh-chip-detail">min. 2 gemeinsame Spiele</div>
          </div>`;
      }
      if(seasons.length){
        const last=seasons.find(s=>s.id!==currentSeason().id);
        if(last&&last.player_id){
          const titleCount=seasons.filter(s=>s.id!==currentSeason().id&&s.player_id===last.player_id).length;
          defenderCards=`
            <div class="sh-chip def clickable" id="defenderCard">
              <div class="sh-chip-label">Defending Champion</div>
              <div class="sh-chip-row">
                ${chipAv(last.player_id)}
                <div class="sh-chip-name">${esc(pname(last.player_id))}</div>
              </div>
              <div class="sh-chip-detail">${last.label}${titleCount>1?' · '+titleCount+' Titel':''}</div>
            </div>`;
        }
      }
    }

    // Saison-Fortschritt: Tag X von Y mit Balken (ersetzt den alten Countdown)
    let seasonProgressHtml='';
    if(period==='season'){
      const sStart=seasonStart();
      const sEnd=seasonEnd();
      const totalMs=sEnd-sStart;
      const elapsedMs=Math.max(0,Math.min(totalMs,Date.now()-sStart));
      const dayElapsed=Math.max(1,Math.ceil(elapsedMs/(1000*60*60*24)));
      const dayTotal=Math.ceil(totalMs/(1000*60*60*24));
      const pct=Math.round((elapsedMs/totalMs)*100);
      seasonProgressHtml=`
        <div class="season-progress">
          <div class="season-progress-top">
            <span class="season-progress-label">Saison-Fortschritt</span>
            <span class="season-progress-days">Tag <b>${dayElapsed}</b> von ${dayTotal}</span>
          </div>
          <div class="season-progress-bar"><i style="width:${pct}%"></i></div>
        </div>`;
    } else if(period==='week'){
      // Wochen-Fortschritt: Tag X von 7
      const wkStart=periodStart('week');
      const wkEnd=new Date(wkStart); wkEnd.setDate(wkEnd.getDate()+7);
      const wkTotalMs=wkEnd-wkStart;
      const wkElapsedMs=Math.max(0,Math.min(wkTotalMs,Date.now()-wkStart));
      const wkDayElapsed=Math.max(1,Math.min(7,Math.ceil(wkElapsedMs/(1000*60*60*24))));
      const wkPct=Math.round((wkElapsedMs/wkTotalMs)*100);
      const wkRemain=7-wkDayElapsed;
      seasonProgressHtml=`
        <div class="season-progress">
          <div class="season-progress-top">
            <span class="season-progress-label">Woche läuft</span>
            <span class="season-progress-days">Tag <b>${wkDayElapsed}</b> von 7</span>
          </div>
          <div class="season-progress-bar"><i style="width:${wkPct}%"></i></div>
        </div>`;
    } else if(period==='day'){
      // Tages-Fortschritt: Stunde X von 24 (exakt gleicher Stil wie Woche)
      const dyStart=periodStart('day');
      const dyEnd=new Date(dyStart); dyEnd.setDate(dyEnd.getDate()+1);
      const dyTotalMs=dyEnd-dyStart;
      const dyElapsedMs=Math.max(0,Math.min(dyTotalMs,Date.now()-dyStart));
      const dyHourElapsed=Math.max(1,Math.min(24,Math.ceil(dyElapsedMs/(1000*60*60))));
      const dyPct=Math.round((dyElapsedMs/dyTotalMs)*100);
      seasonProgressHtml=`
        <div class="season-progress">
          <div class="season-progress-top">
            <span class="season-progress-label">Tag läuft</span>
            <span class="season-progress-days">Stunde <b>${dyHourElapsed}</b> von 24</span>
          </div>
          <div class="season-progress-bar"><i style="width:${dyPct}%"></i></div>
        </div>`;
    }

    // Player of Season: Vorsprung auf Platz 2
    const gap2=ps.length>=2&&winner?Math.round(winner.elo-(ps.find(x=>x.id!==winner.id)||{elo:0}).elo):0;

    // Champion-Hero-Card (Saison-Modus) bzw. Wochensieger-Card (Wochen-Modus)
    let heroSection='';
    if(period==='season'){
      if(winner){
        const wp=pmap()[winner.id];
        const wWr=winner.games?Math.round(winner.wins/winner.games*100):0;
        // Tier-Klasse für den Avatar-Glow
        const rinf=getPlayerRank(winner.id);
        const tierCls=rinf?('tier-'+rinf.label.toLowerCase().replace('ä','a').replace('ö','o').replace('ü','u')):'';
        const isLegend=rinf&&rinf.label==='Legende';
        // Avatar (72 px, getöntem Border je Tier)
        const em=wp.avatar_id?avatarEmoji(wp.avatar_id):null;
        const avInner=em
          ? `<div class="sh-av has-emoji ${tierCls}" style="background:var(--surface3)"><span class="em">${em}</span></div>`
          : `<div class="sh-av ${tierCls}" style="background:${avColor(wp.id)}">${esc(initials(wp.name))}</div>`;
        // Form-Dots des Champions (letzte 5 Saison-Matches)
        const winnerForm=(()=>{
          const ms2=periodMs.filter(m=>[m.a1,m.a2,m.b1,m.b2].includes(winner.id))
            .sort((a,b)=>mts(b)-mts(a)).slice(0,5).reverse();
          return ms2.map(m=>{const onA=(winner.id===m.a1||winner.id===m.a2);
            const w=(onA&&m.winner==='A')||(!onA&&m.winner==='B');
            return `<div class="dot ${w?'w':'l'}"></div>`;}).join('');
        })();
        const gdColor=winner.gd>=0?'var(--ink)':'var(--red)';
        heroSection=`
          <div class="season-hero" id="seasonLeaderCard">
            <div class="sh-row">
              <div class="sh-av-wrap">
                ${isLegend?`<div class="sh-crown">${svgI('crown')}</div>`:''}
                ${avInner}
              </div>
              <div class="sh-info">
                <div class="sh-label">Player of the Season</div>
                <div class="sh-name">${esc(wp.name)}</div>
                <div class="sh-meta">${gap2>0?'+'+gap2+' Vorsprung · ':''}${wWr}% Quote</div>
              </div>
              <div class="sh-elo-wrap">
                <div class="sh-elo-v">${winner.elo}</div>
                <div class="sh-elo-l">Elo</div>
              </div>
            </div>
            <div class="sh-stats">
              <div class="sh-stat"><div class="v acid">${winner.wins}</div><div class="l">Siege</div></div>
              <div class="sh-stat"><div class="v red">${winner.losses}</div><div class="l">Niederlagen</div></div>
              <div class="sh-stat"><div class="v" style="color:${gdColor}">${winner.gd>=0?'+':''}${winner.gd}</div><div class="l">Tordifferenz</div></div>
              ${winnerForm?`<div class="sh-form">${winnerForm}</div>`:''}
            </div>
          </div>`;
      } else {
        heroSection=`
          <div class="season-hero" id="seasonLeaderCard">
            <div class="sh-row">
              <div class="sh-av-wrap">
                <div class="sh-av" style="background:var(--surface3);border-color:var(--line);box-shadow:none;color:var(--muted);font-size:32px">?</div>
              </div>
              <div class="sh-info">
                <div class="sh-label">Player of the Season</div>
                <div class="sh-name-empty">noch offen</div>
                <div class="sh-meta">Saison läuft</div>
              </div>
            </div>
          </div>`;
      }
      // Side-Chips (Team + Defender)
      if(teamBannerHtml||defenderCards){
        heroSection+=`<div class="sh-side">${teamBannerHtml}${defenderCards}</div>`;
      }
    } else {
      // ═══ WOCHE / TAG: Hero im season-hero-Stil + Highlights ═══
      // Period-spezifische Labels — Logik darunter ist für beide identisch,
      // da alles über das gefilterte periodMs läuft (eine Wahrheit für Elo/Stats).
      const heroLabel    = period==='day' ? 'Tagessieger'           : 'Wochensieger';
      const heroEloLabel = period==='day' ? 'Elo Tag'               : 'Elo Woche';
      const minWinsTxt   = period==='day' ? 'min. 3 Siege benötigt' : 'min. 5 Siege benötigt';
      if(winner){
        const wp=pmap()[winner.id];
        const wWr=winner.games?Math.round(winner.wins/winner.games*100):0;
        const em=wp.avatar_id?avatarEmoji(wp.avatar_id):null;
        const avInner=em
          ? `<div class="sh-av has-emoji tier-legende" style="background:var(--surface3)"><span class="em">${em}</span></div>`
          : `<div class="sh-av tier-legende" style="background:${avColor(wp.id)}">${esc(initials(wp.name))}</div>`;
        const winnerForm=(()=>{
          const ms2=periodMs.filter(m=>[m.a1,m.a2,m.b1,m.b2].includes(winner.id))
            .sort((a,b)=>mts(b)-mts(a)).slice(0,5).reverse();
          return ms2.map(m=>{const onA=(winner.id===m.a1||winner.id===m.a2);
            const w=(onA&&m.winner==='A')||(!onA&&m.winner==='B');
            return `<div class="dot ${w?'w':'l'}"></div>`;}).join('');
        })();
        heroSection=`
          <div class="season-hero" data-detail="${winner.id}" style="cursor:pointer">
            <div class="sh-row">
              <div class="sh-av-wrap">
                <div class="sh-crown">${svgI('crown')}</div>
                ${avInner}
              </div>
              <div class="sh-info">
                <div class="sh-label">${heroLabel}</div>
                <div class="sh-name">${esc(wp.name)}</div>
                <div class="sh-meta">${winner.wins}W · ${winner.losses}L · ${wWr}% Quote</div>
              </div>
              <div class="sh-elo-wrap">
                <div class="sh-elo-v" style="color:${winner.eloNet>=0?'var(--acid)':'var(--red)'}">${winner.eloNet>=0?'+':''}${winner.eloNet}</div>
                <div class="sh-elo-l">${heroEloLabel}</div>
              </div>
            </div>
            <div class="sh-stats">
              <div class="sh-stat"><div class="v acid">+${winner.eloGain}</div><div class="l">Gewonnen</div></div>
              <div class="sh-stat"><div class="v red">${winner.eloLoss}</div><div class="l">Verloren</div></div>
              ${winnerForm?`<div class="sh-form">${winnerForm}</div>`:''}
            </div>
          </div>`;
      } else {
        heroSection=`
          <div class="season-hero">
            <div class="sh-row">
              <div class="sh-av-wrap">
                <div class="sh-av" style="background:var(--surface3);border-color:var(--line);box-shadow:none;color:var(--muted);font-size:32px">?</div>
              </div>
              <div class="sh-info">
                <div class="sh-label">${heroLabel}</div>
                <div class="sh-name-empty">noch offen</div>
                <div class="sh-meta">${minWinsTxt}</div>
              </div>
            </div>
          </div>`;
      }

      // Wochen-Highlights: Bestes Team / Heißeste Serie / Größter Upset
      // Bestes Team: Duo mit der höchsten kumulierten Elo-Summe in der Woche
      const wkTeams={}; // teamKey → {ids:[id1,id2], elo, games}
      periodMs.forEach(m=>{
        const tA=[m.a1,m.a2].sort(); const kA=tA.join('|');
        const tB=[m.b1,m.b2].sort(); const kB=tB.join('|');
        const dA=((m.deltas||{})[m.a1]||0)+((m.deltas||{})[m.a2]||0);
        const dB=((m.deltas||{})[m.b1]||0)+((m.deltas||{})[m.b2]||0);
        if(!wkTeams[kA]) wkTeams[kA]={ids:tA, elo:0, games:0};
        if(!wkTeams[kB]) wkTeams[kB]={ids:tB, elo:0, games:0};
        wkTeams[kA].elo+=dA; wkTeams[kA].games++;
        wkTeams[kB].elo+=dB; wkTeams[kB].games++;
      });
      const bestTeam=Object.values(wkTeams).filter(t=>t.elo>0)
        .sort((a,b)=>b.elo-a.elo||b.games-a.games)[0];

      // Heißeste Serie: längste Siegesserie innerhalb der Woche
      const wkStreaks=longestStreaks(periodMs);
      const topStreak=wkStreaks[0];

      // Größter Upset: niedrigste Sieg-Wahrscheinlichkeit des Gewinners
      const wkUps=periodMs.map(m=>{
        const expA=m.exp_a??0.5;
        const we=m.winner==='A'?expA:(1-expA);
        return {sp:1-we, m, winPct:Math.round(we*100)};
      }).sort((a,b)=>b.sp-a.sp);
      const topUpset=wkUps[0];

      const renderHl=(cls,labelTxt,iconKey,nameTxt,detailTxt,clickAttr='')=>{
        if(!nameTxt) return `<div class="wk-hl empty">
          <div class="wk-hl-ic">${svgI(iconKey)}</div>
          <div class="wk-hl-label">${labelTxt}</div>
          <div class="wk-hl-val">–</div>
          <div class="wk-hl-detail">noch keine Daten</div>
        </div>`;
        return `<div class="wk-hl ${cls}" ${clickAttr} style="cursor:pointer">
          <div class="wk-hl-ic">${svgI(iconKey)}</div>
          <div class="wk-hl-label">${labelTxt}</div>
          <div class="wk-hl-val">${esc(nameTxt)}</div>
          <div class="wk-hl-detail">${detailTxt}</div>
        </div>`;
      };

      const upsetWinners=topUpset?(topUpset.m.winner==='A'?[topUpset.m.a1,topUpset.m.a2]:[topUpset.m.b1,topUpset.m.b2]):null;
      const upsetName=upsetWinners?(pname(upsetWinners[0])+' & '+pname(upsetWinners[1])):null;

      
    // POTW / POTD Recap Button — je nach Period
    let recapBtn = '';
    const recapPeriod = period==='day' ? 'potd' : period==='week' ? 'potw' : null;
    const showRecap   = recapPeriod==='potw' ? potwHasData() : recapPeriod==='potd' ? potdHasData() : false;
    if(showRecap){
      const recapTitle    = recapPeriod==='potd' ? 'Player of the Day'  : 'Player of the Week';
      const recapSubtitle = recapPeriod==='potd' ? 'Letzten Tag ansehen' : 'Letzte Woche ansehen';
      const recapBtnId    = recapPeriod==='potd' ? 'potdRecapDayBtn'    : 'potwRecapWeekBtn';
      const recapIconKey  = recapPeriod==='potd' ? 'trophyDay'          : 'weekly';
      recapBtn = `
        <button id="${recapBtnId}" style="
          width:100%;
          background:linear-gradient(135deg,rgba(190,242,100,.08),rgba(190,242,100,.03));
          border:1px solid rgba(190,242,100,.3);
          border-radius:14px;
          padding:12px 14px;
          margin-bottom:12px;
          cursor:pointer;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          transition:.16s;
          font-family:inherit;
          color:var(--ink);
        ">
          <div style="display:flex;align-items:center;gap:12px;flex:1">
            <div style="width:40px;height:40px;border-radius:11px;background:rgba(190,242,100,.12);display:grid;place-items:center;color:var(--acid);flex-shrink:0">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                ${ICONS[recapIconKey]||''}
              </svg>
            </div>
            <div style="text-align:left;min-width:0">
              <div style="font-weight:700;font-size:13px;letter-spacing:-.01em">${recapTitle}</div>
              <div style="font-size:10px;color:var(--muted);margin-top:2px;font-family:'Sometype Mono',monospace">${recapSubtitle}</div>
            </div>
          </div>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>`;
    }

    // Click-Attribute für Highlights — bind() verdrahtet [data-detail] → showPlayer,
    // [data-match] → showMatchDetail, [data-team] → showTeam automatisch.
    const teamClick   = bestTeam  ? `data-team="${esc(bestTeam.ids.join('|'))}"` : '';
    const teamName    = bestTeam  ? `${pname(bestTeam.ids[0])} & ${pname(bestTeam.ids[1])}` : null;
    const streakClick = topStreak ? `data-detail="${esc(topStreak.id)}"` : '';
    const upsetClick  = topUpset  ? `data-match="${esc(topUpset.m.id)}"` : '';

    // All-Time POTW-/POTD-König (Award "Wochenkönig"/"Tageskönig" aus dem Awards-Tab).
    // weekKingList/dayKingList werden in _awardRankingsUncached('all') aus countPeriodWins/
    // countDayWins über die gesamte Match-Historie aufgebaut — laufender Zeitraum wird
    // dort bereits ausgeschlossen. Cache-Wrapper (getCachedAwardRankings) verhindert
    // teure Re-Berechnung pro Re-Render.
    const _allRanks   = getCachedAwardRankings('all');
    const _kingList   = period==='week' ? (_allRanks.weekKingList||[]) : (_allRanks.dayKingList||[]);
    const topKing     = _kingList[0] || null;
    const kingClick   = topKing ? `data-detail="${esc(topKing.id)}"` : '';
    const kingLabel   = period==='week' ? 'Wochenkönig'   : 'Tageskönig';
    const kingIcon    = period==='week' ? 'weekKing'      : 'dayKing';
    const kingDetail  = topKing ? `${topKing.v}× ${period==='week'?'Player of Week':'Player of Day'}` : '';

    heroSection += `
      ${recapBtn}
      <div class="wk-highlights">
        ${renderHl('team','Bestes Team','handshake', teamName, bestTeam?`+${Math.round(bestTeam.elo)} Elo`:'', teamClick)}
        ${renderHl('streak','Heißeste Serie','flame', topStreak?pname(topStreak.id):null, topStreak?`${topStreak.v} in Folge`:'', streakClick)}
        ${renderHl('upset','Größter Upset','bolt', upsetName, topUpset?`${topUpset.winPct}% Chance`:'', upsetClick)}
        ${renderHl('king', kingLabel, kingIcon, topKing?pname(topKing.id):null, kingDetail, kingClick)}
      </div>`;
    }
    
    return `
      <div class="view-head"><h2>Liga</h2><p>${periodLabel(period)} · ${ps.length} aktiv · ${totalMatches} Matches</p></div>
      ${periodBar}
      ${seasonProgressHtml}
      ${heroSection}
      ${(period==='week'||period==='day')?`<div class="seg"><button data-periodsort="wins" class="${periodSort==='wins'?'on':''}">Nach Siegen</button>
        <button data-periodsort="elo" class="${periodSort==='elo'?'on':''}">Nach Elo</button></div>`:''}
      ${ps.length?`<div class="rlist">${rows}</div>`:emptyState('calendar','Keine Matches in diesem Zeitraum')}`;
  }

  // GESAMT-ANSICHT: Karriere-Elo = Durchschnitt der Saison-End-Elos
  const globalSim = getGlobalSim();
  const getGlobalElo = id => Math.round(globalSim.careerElo[id] ?? cfg.start_elo);

  const _allStats=allPlayerStats();
  let list = activePlayers().map(p => ({p, s:_allStats[p.id]||playerStats(p.id), globalElo:getGlobalElo(p.id)}));
  if(rankSearch) list = list.filter(x => x.p.name.toLowerCase().includes(rankSearch.toLowerCase()));

  const sortFn = {
    elo:      (a,b) => b.globalElo - a.globalElo,
    winrate:  (a,b) => b.s.wr - a.s.wr || b.s.games - a.s.games,
    goaldiff: (a,b) => b.s.gd - a.s.gd,
    streak:   (a,b) => b.s.curStreak - a.s.curStreak,
    games:    (a,b) => b.s.games - a.s.games
  }[rankMetric];
  list.sort(sortFn);

  const top = list.length ? list[0].globalElo : 0;
  const rows = list.map((x,i) => rrow(x.p, x.s, i, rankMetric, x.globalElo)).join('');

  // ═══ HALL OF FAME: #1 nach Karriere-Elo ═══
  const hofList=activePlayers().map(p=>({p, e:getGlobalElo(p.id), s:_allStats[p.id]||playerStats(p.id)})).sort((a,b)=>b.e-a.e);
  const hof=hofList[0];
  let hofHtml='';
  if(hof && hof.s.games>0){
    const hp=hof.p;
    const em=hp.avatar_id?avatarEmoji(hp.avatar_id):null;
    const avInner=em
      ? `<div class="hof-av has-emoji" style="background:var(--surface3)"><span class="em">${em}</span></div>`
      : `<div class="hof-av" style="background:${avColor(hp.id)}">${esc(initials(hp.name))}</div>`;
    const r=getPlayerRank(hp.id);
    const tierKey=r?r.label.toLowerCase().replace('ä','a').replace('ö','o').replace('ü','u'):'';
    const tierHtml=r?`<span class="hof-tier t-${tierKey}">${svgI(r.icon)}${r.label}</span>`:'';
    // Saison-Titel zählen: Player of the Season + Team of the Season getrennt zählen
    // (analog zur Profile-Anzeige), abgelaufene Saisons.
    const titleCount = seasons.filter(s=>s.id!==currentSeason().id)
      .reduce((sum,s)=>{
        let n=0;
        if(s.player_id===hp.id) n++;
        if(s.team_p1===hp.id || s.team_p2===hp.id) n++;
        return sum+n;
      },0);
    const wr=hof.s.wr?Math.round(hof.s.wr*100):0;
    const gdColor=hof.s.gd>=0?'var(--acid)':'var(--red)';
    hofHtml=`
      <div class="hof-hero" data-detail="${hp.id}">
        <span class="hof-ribbon">${svgI('trophy')}Hall of Fame · #1 All-Time</span>
        <div class="hof-main">
          <div class="hof-av-wrap">
            <div class="hof-crown">${svgI('crown')}</div>
            ${avInner}
          </div>
          <div class="hof-info">
            <div class="hof-name">${esc(hp.name)}</div>
            <div class="hof-tier-row">
              ${tierHtml}
              <span class="hof-elo">Ø <b>${hof.e}</b> Karriere-Elo</span>
            </div>
          </div>
        </div>
        <div class="hof-stats">
          <div class="hof-stat"><div class="v acid">${hof.s.wins}–${hof.s.losses}</div><div class="l">Bilanz</div></div>
          <div class="hof-stat"><div class="v acid">${wr}%</div><div class="l">Siegrate</div></div>
          <div class="hof-stat"><div class="v">${titleCount}</div><div class="l">Saison-Titel</div></div>
          <div class="hof-stat"><div class="v" style="color:${gdColor}">${hof.s.gd>=0?'+':''}${hof.s.gd}</div><div class="l">Tordiff.</div></div>
        </div>
      </div>`;
  }

  // ═══ HALL OF FAME PODIUM: #2 (Silber) und #3 (Bronze) ═══
  let hofPodsHtml='';
  if(hof && hof.s.games>0){
    const podEntries = [
      { entry: hofList[1], rank: 2, cls: 'silver', label: '#2 All-Time' },
      { entry: hofList[2], rank: 3, cls: 'bronze', label: '#3 All-Time' }
    ].filter(x => x.entry && x.entry.s && x.entry.s.games > 0);
    if(podEntries.length){
      const podCards = podEntries.map(({entry, rank, cls, label}) => {
        const pp = entry.p;
        const em = pp.avatar_id ? avatarEmoji(pp.avatar_id) : null;
        const avInner = em
          ? `<div class="hof-pod-av has-emoji"><span class="em">${em}</span></div>`
          : `<div class="hof-pod-av" style="background:${avColor(pp.id)}">${esc(initials(pp.name))}</div>`;
        const r = getPlayerRank(pp.id);
        const tierKey = r ? r.label.toLowerCase().replace('ä','a').replace('ö','o').replace('ü','u') : '';
        const tierHtml = r ? `<span class="tier-pill t-${tierKey}">${svgI(r.icon)}${r.label}</span>` : '';
        const wrPod = entry.s.wr ? Math.round(entry.s.wr*100) : 0;
        return `
          <div class="hof-pod ${cls}" data-detail="${pp.id}">
            <div class="hof-pod-rank">${svgI('trophy')}<span>${label}</span></div>
            <div class="hof-pod-row">
              <div class="hof-pod-av-wrap">${avInner}</div>
              <div class="hof-pod-info">
                <div class="hof-pod-name">${esc(pp.name)}</div>
                <div class="hof-pod-tier-row">
                  ${tierHtml}
                  <span class="hof-pod-elo">Ø <b>${entry.e}</b> Elo</span>
                </div>
              </div>
            </div>
            <div class="hof-pod-stats">
              <span class="hof-pod-stat">${entry.s.wins}–${entry.s.losses}</span>
              <span class="hof-pod-stat-sep">·</span>
              <span class="hof-pod-stat">${wrPod}% WR</span>
            </div>
          </div>`;
      }).join('');
      hofPodsHtml = `<div class="hof-pods">${podCards}</div>`;
    }
  }

  // ═══ ALL-TIME RECORDS ═══
  // Peak Elo: höchste Saison-End-Elo aller Spieler über alle Saisons
  let peakEloVal=null, peakEloId=null, peakSeason=null;
  Object.entries(globalSim.seasonEndElos||{}).forEach(([sid,eloMap])=>{
    Object.entries(eloMap).forEach(([pid,e])=>{
      if(peakEloVal===null || e>peakEloVal){ peakEloVal=e; peakEloId=pid; peakSeason=sid; }
    });
  });
  // Meiste Siege (Karriere)
  const winsArr=activePlayers().map(p=>({id:p.id, v:globalSim.wins[p.id]||0})).sort((a,b)=>b.v-a.v);
  const mostWins=winsArr[0];
  // Beste WR (min 10 Spiele Karriere)
  const wrArr=activePlayers().map(p=>{
    const g=globalSim.played[p.id]||0, w=globalSim.wins[p.id]||0;
    return {id:p.id, g, w, wr:g?w/g:0};
  }).filter(x=>x.g>=10).sort((a,b)=>b.wr-a.wr||b.g-a.g);
  const bestWr=wrArr[0];

  const formatSeason=(sid)=>{ if(!sid)return ''; const [y,m]=sid.split('-'); const months=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']; return months[parseInt(m,10)-1]+" '"+y.slice(2); };

  const recordsHtml=`
    <div class="records-grid">
      <div class="rec peak"${peakEloId?` data-detail="${peakEloId}"`:''}>
        <div class="rec-ic">${svgI('trendUp')}</div>
        <div class="rec-label">Peak-Elo</div>
        <div class="rec-val">${peakEloVal!==null?Math.round(peakEloVal):'–'}</div>
        <div class="rec-name">${peakEloId?esc(pname(peakEloId))+' · '+formatSeason(peakSeason):'–'}</div>
      </div>
      <div class="rec wins"${mostWins&&mostWins.v>0?` data-detail="${mostWins.id}"`:''}>
        <div class="rec-ic">${svgI('trophyStar')}</div>
        <div class="rec-label">Meiste Siege</div>
        <div class="rec-val">${mostWins?mostWins.v:'–'}</div>
        <div class="rec-name">${mostWins&&mostWins.v>0?esc(pname(mostWins.id)):'–'}</div>
      </div>
      <div class="rec wr"${bestWr?` data-detail="${bestWr.id}"`:''}>
        <div class="rec-ic">${svgI('target')}</div>
        <div class="rec-label">Beste WR</div>
        <div class="rec-val">${bestWr?Math.round(bestWr.wr*100)+'%':'–'}</div>
        <div class="rec-name">${bestWr?esc(pname(bestWr.id))+' · '+bestWr.g+' Sp.':'min. 10 Spiele'}</div>
      </div>
    </div>`;

  return `
    <div class="view-head"><h2>Liga</h2><p>${players.length} Spieler · ${matches.length} Matches</p></div>
    ${periodBar}
    ${hofHtml || `<div class="stat-strip">
      <div class="s"><div class="v num">${activePlayers().length}</div><div class="l">Spieler</div></div>
      <div class="s"><div class="v num">${matches.length}</div><div class="l">Matches</div></div>
      <div class="s"><div class="v num">${top||'–'}</div><div class="l">Top-Elo</div></div>
    </div>`}
    ${hofPodsHtml}
    ${recordsHtml}
    <div class="search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>
      </svg>
      <input type="text" id="rankSearch" placeholder="Spieler suchen…" value="${esc(rankSearch)}">
    </div>
    <div class="seg accent">
      ${METRICS.map(([k,l])=>`<button data-metric="${k}" class="${rankMetric===k?'on':''}">${l}</button>`).join('')}
    </div>
    ${list.length ? `<div class="rlist">${rows}</div>` : emptyState('search','Keine Spieler gefunden')}
    <button class="btn ghost sm" id="addPlayerBtn" style="margin-top:14px">+ Spieler anlegen</button>`;

}
function rrow(p, s, i, metric, globalElo){
  const elo = globalElo !== undefined ? globalElo : Math.round(p.elo);
  const medal = medalB(i); // 1/2/3-Badge statt 🥇🥈🥉
  const cls = i<3 ? `top${i+1}` : '';
  let big, small;
    if(metric==='elo'){
    const r=getPlayerRank(p.id);
    const avgElos=getSeasonAvgElos();
    big=r?`<span class="ic svg-ic" style="font-size:13px;color:${r.color};margin-right:3px">${svgI(r.icon)}</span>${r.label}`:'–';
    small=(avgElos[p.id]!==null&&avgElos[p.id]!==undefined)?'Ø '+avgElos[p.id]+' Elo':'–';
  }

  else if(metric==='winrate'){big=Math.round(s.wr*100)+'%'; small=s.wins+'–'+s.losses;}
  else if(metric==='goaldiff'){big=(s.gd>=0?'+':'')+s.gd; small='Tordiff';}
  else if(metric==='streak'){
    const r=s.curStreak;
    big=(r>0?r+'W':r<0?(-r)+'L':'–');
    small=r>0?'Siege':r<0?'Niederlagen':'neutral';
  }
  else{big=s.games; small='Spiele';}
  const neutral = metric!=='elo' && !(metric==='goaldiff'&&s.gd>=0) && !(metric==='streak'&&s.curStreak>0) ? ' neutral':'';
  const fireTag = streakInline(s.curStreak);
  return `<div class="rrow ${cls}" data-detail="${p.id}">
    ${medal
      ? `<span class="medal">${medal}</span><span class="pos" style="opacity:0"></span>`
      : `<span class="pos num">${i+1}</span>`}
    ${avHtml(p)}
    <div class="rmid">
              <div class="rname">
        ${esc(p.name)}${fireTag}
      </div>

      <div class="rmeta">
        <span>${s.wins}–${s.losses}</span>
        <span class="wbar"><i style="width:${Math.round(s.wr*100)}%"></i></span>
        <span>${Math.round(s.wr*100)}%</span>
      </div>
    </div>
        <div class="rval">
      ${metric==='elo'
        ? `<div style="font-size:13px;font-weight:700;color:${getPlayerRank(p.id)?.color||'var(--muted)'}; text-align:right">${big}</div>`
        : `<div class="big${neutral} num">${big}</div>`
      }
      <div class="small">${small}</div>
    </div>

  </div>`;
}

