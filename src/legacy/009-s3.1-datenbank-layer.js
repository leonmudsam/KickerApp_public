// ╔═══ §3.1 ─── DATENBANK-LAYER ────────────────────────────────────────╗
//     loadAll() lädt Spieler/Matches/Config/Seasons, persistRecalc()
//     schreibt Elos/Deltas atomar zurück. Saison-Archivierung am
//     Monatswechsel via archiveSeasonAndStartNew().
// ╚═════════════════════════════════════════════════════════════════════════╝
function pmap(){
  const key='pmap_'+players.length+'_'+_cache.version;
  if(_cache._pmapKey===key) return _cache._pmapData;
  const m={};
  players.forEach(p=>m[p.id]=p);
  _cache._pmapKey=key;
  _cache._pmapData=m;
  return m;
}

// Nur sichtbare Spieler (für Ranglisten)
function activePlayers(){ return players.filter(p=>!p.hidden); }
function pname(id){const p=pmap()[id];return p?p.name:'?';}
function gamesPlayed(id){return matches.filter(m=>[m.a1,m.a2,m.b1,m.b2].includes(id)).length;}

// v9.15 PERF: Fingerprint des letzten loadAll-Payloads. Der 30s-Auto-Refresh
// (Boot-Intervall) hat bisher bei JEDEM Tick alle Caches invalidiert und die
// komplette View per innerHTML ersetzt — auch wenn sich in der DB nichts
// geändert hatte (99% der Ticks). Das kostete nicht nur Rechenzeit, sondern
// zerstörte alle 30s Scroll-Position/Fokus. Jetzt: unveränderte Daten →
// Early-Return, Globals/Caches/DOM bleiben unangetastet. Ein Tages-Rollover
// erzwingt trotzdem einen vollen Durchlauf (Saison-/POTD-/Recap-Logik).
let _lastLoadFingerprint = null;
let _lastLoadDay = null;
async function loadAll(){
  if(!LK) return; // PHASE 1: Liga-App lädt nur mit geöffneter Liga (§P)
  setConn('verbinde…','load');
  try{
    // Liga-Zeile (settings/rev/name), Spieler und Saisons sind klein →
    // immer voll laden. Die config-Tabelle ist Geschichte: die Elo-Parameter
    // leben pro Liga in leagues.settings.
    const [lg,p,se,me]=await Promise.all([
      sb.from('leagues').select('*').eq('id',LK.id).single(),
      sb.from('players').select('*').eq('league_id',LK.id).is('deleted_at',null).order('elo',{ascending:false}),
      sb.from('seasons').select('*').eq('league_id',LK.id).order('start_date',{ascending:false}),
      sb.from('league_members').select('role').eq('league_id',LK.id).eq('user_id',_authUser?_authUser.id:'').maybeSingle()
    ]);
    // Kein Zugriff mehr (rausgeworfen / Liga geschlossen): RLS liefert für
    // die Liga-Zeile "0 rows" (PGRST116) bzw. keine Membership → zur
    // Übersicht statt Fehler-Endlosschleife.
    if((lg.error && lg.error.code==='PGRST116') || (!me.error && !me.data)){
      toast('Du bist kein Mitglied dieser Liga mehr', true);
      setTimeout(goHome, 1200);
      return;
    }
    if(lg.error)throw lg.error; if(p.error)throw p.error; if(se.error)throw se.error;
    if(me.data && me.data.role) LK.role=me.data.role;
    LK._joinEnabled=lg.data.join_enabled!==false;
    const serverRev=Number(lg.data.rev||0);

    // Matches: Delta-Sync über created_at/updated_at (IndexedDB-Cache, §P).
    // Bei rev-Wechsel (Match-Edit/Soft-Delete irgendwo, Trigger bumpt
    // leagues.rev) ist der lokale Stand nicht vertrauenswürdig → Full-Refetch.
    const canDelta = LK.rev===serverRev && LK.lastSyncedAt && Array.isArray(matches) && matches.length>0;
    let mq=sb.from('matches').select('*').eq('league_id',LK.id).is('deleted_at',null);
    if(canDelta) mq=mq.or(`created_at.gt.${LK.lastSyncedAt},updated_at.gt.${LK.lastSyncedAt}`);
    const m=await mq.order('created_at',{ascending:true});
    if(m.error)throw m.error;

    let mergedMatches;
    if(canDelta){
      if((m.data||[]).length){
        // Merge-by-id: neue Zeilen anhängen, editierte (deltas!) ersetzen
        const byId=new Map(matches.map(x=>[x.id,x]));
        (m.data||[]).forEach(x=>byId.set(x.id,x));
        mergedMatches=[...byId.values()].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
      } else {
        mergedMatches=matches;
      }
    } else {
      mergedMatches=m.data||[];
    }
    let lastSynced=LK.lastSyncedAt||'';
    mergedMatches.forEach(x=>{
      if(x.created_at && x.created_at>lastSynced) lastSynced=x.created_at;
      if(x.updated_at && x.updated_at>lastSynced) lastSynced=x.updated_at;
    });

    const _fp = JSON.stringify([p.data, se.data, lg.data.settings, lg.data.name, serverRev, mergedMatches.length, lastSynced]);
    const _today = new Date().toDateString();
    LK.rev=serverRev;
    LK.lastSyncedAt=lastSynced||null;
    LK.name=lg.data.name;
    LK.settings=lg.data.settings||{};
    if(_fp === _lastLoadFingerprint && _today === _lastLoadDay){
      // Nichts geändert seit dem letzten Tick → UI in Ruhe lassen.
      setConn(activePlayers().length+' Spieler · '+matches.length+' Matches','ok');
      _ensureMatchesRealtime();
      return;
    }
    _lastLoadFingerprint = _fp;
    _lastLoadDay = _today;
    // Alle (nicht gelöschten) Spieler laden, auch hidden → für Berechnungen nötig
    players=p.data||[];
    // Lokaler Fallback: avatar_id-Edits aus localStorage übernehmen
    players.forEach(pp=>{
      if(pp.avatar_id==null){
        try{
          const raw=localStorage.getItem('playerEdit_'+pp.id);
          if(raw){
            const e=JSON.parse(raw);
            if(pp.avatar_id==null && e.avatar_id!=null) pp.avatar_id=e.avatar_id;
          }
        }catch(err){}
      }
    });
    matches=mergedMatches;
    // Elo-Parameter: Code-Defaults + Liga-Settings (ersetzt config-Tabelle
    // UND das alte cfg_overrides-Muster — neue Parameter brauchen keine
    // Migration, sie fallen einfach auf ihren Default zurück)
    cfg=Object.assign({},CFG_DEFAULTS,LK.settings);
    seasons=se.data||[];
  // NEU: Alle relevanten Caches invalidieren
  invalidateCache(['global', 'stats', 'awards', 'teams', 'allTeamStats', 'period', 'badges', 'playerSeasonAwards', 'allPastSeasons']);
    // Nur aktive Spieler zählen für Anzeige
    const active=activePlayers();
    setConn(active.length+' Spieler · '+matches.length+' Matches','ok');
    // Header aktuell halten (Liga-Umbenennung auf anderem Gerät)
    const _h1=document.querySelector('#app .logo-txt h1');
    if(_h1 && _h1.textContent!==LK.name) _h1.textContent=LK.name;
    // IndexedDB-Cache persistieren (fire-and-forget) + Realtime sicherstellen
    lkCachePut(LK.id,{players,matches,seasons,rev:serverRev,lastSyncedAt:LK.lastSyncedAt,name:LK.name});
    _ensureMatchesRealtime();
    await autoArchiveSeasons();
    if(window._updateRecapBtn) window._updateRecapBtn();
    if(window._updatePosHistBtn) window._updatePosHistBtn();
    render();
    // PHASE 2: Onboarding — nach Liga-Erstellung einmalig "Spieler anlegen",
    // nach frischem Beitritt einmalig "Welcher Spieler bist du?"
    const _playerOb = typeof maybeShowPlayerOnboarding==='function' && maybeShowPlayerOnboarding();
    if(!_playerOb && typeof maybeShowClaimOnboarding==='function') maybeShowClaimOnboarding();
    // News-System v8.3: Stories aus DB synchronisieren.
    //   1. Generator erzeugt Story-Objekte aus Live-Daten
    //   2. INSERT ON CONFLICT DO NOTHING in Supabase
    //   3. SELECT der letzten 100 → memory cache
    //   4. Badge refresht aus memory cache
    // Bei DB-Fehler (Tabelle fehlt, Netz down): in-memory Fallback.
    // await blockiert loadAll, aber der vorherige render() ist schon durch
    // — User sieht UI, News-Badge folgt 100-500ms später.
    try {
      await syncStoriesViaDb();
    } catch(e){ console.warn('[news] sync failed', e); }
    try { if(window.newsBadgeRefresh) window.newsBadgeRefresh(); } catch(e){}
    // Player-of-the-Day Recap (zeigt einmal pro Tag den letzten Spieltag).
    // Verzögerung > Saison-Recap (600ms), damit der bei Bedarf Vorrang hat.
    // POTW (900ms) kommt davor und blockt POTD am Mo/Di.
    setTimeout(autoShowPotwRecap, 900);
    setTimeout(showPotdRecap,1200);
  }catch(e){
    console.error(e); setConn('Verbindung fehlgeschlagen','bad');
    document.getElementById('main').innerHTML=`<div class="card"><div class="empty" style="color:var(--red)">
      <div class="ee"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16.5" r=".6" fill="currentColor"/></svg></div>Konnte nicht laden.<br><span class="num" style="font-size:11px">${esc(e.message||e)}</span></div></div>`;
  }
}

// Automatischer Saison-Abschluss: archiviert vergangene Monate
async function autoArchiveSeasons(){
  // Liga ohne Monatsreset: keine Archive, keine Saison-Recaps
  if(LK && LK.settings && LK.settings.monthlyReset===false) return;
  const past=allPastSeasons(); // alle vergangenen Saison-IDs
  // gSim einmal pro Aufruf für isStale + Archive nutzen → konsistent
  const gSim=getGlobalSim();
  // Erkennt veraltete Archive in drei Fällen:
  //   1. Alle top_elo-Werte == 0 (alter Bug)
  //   2. Archivierte Top-Elo weicht von DB-aggregierter Sim ab → vor Slider-Recalc geschrieben
  //   3. Bestes Team weicht von DB-aggregierter Sim ab
  // → re-archivieren mit aktuellen DB-Werten (= gSim, da DB-First).
  const isStale=(s)=>{
    try{
      const t=typeof s.top_elo==='string'?JSON.parse(s.top_elo):(s.top_elo||[]);
      if(!t.length) return true; // noch nie archiviert
      if(t.every(x=>!x.elo)) return true; // alter Bug
      // Konsistenz-Check: archivierte Top-Elo vs aggregierte gSim
      const snap=gSim.seasonEndElos[s.id]||{};
      for(const entry of t){
        const live=Math.round(snap[entry.id] ?? cfg.start_elo);
        if(live !== entry.elo) return true; // Inkonsistenz → re-archive
      }
      return false;
    }catch{return false;}
  };
  const validStored=new Set(seasons.filter(s=>!isStale(s)).map(s=>s.id));
  for(const sid of past){
    if(validStored.has(sid))continue; // schon (korrekt) archiviert
    const ms=matchesInSeason(sid);
    if(!ms.length)continue; // keine Matches → nichts zu archivieren
    const snap=gSim.seasonEndElos[sid]||{};
    const seasonPlayedMap=gSim.seasonPlayed[sid]||{};
    // Wins/Losses pro Spieler in dieser Saison zählen (saison-isoliert)
    const sw={}, sl={};
    ms.forEach(m=>{
      [[m.a1,m.a2,m.winner==='A'],[m.b1,m.b2,m.winner==='B']].forEach(([x,y,won])=>{
        [x,y].forEach(id=>{
          if(won){ sw[id]=(sw[id]||0)+1; }
          else { sl[id]=(sl[id]||0)+1; }
        });
      });
    });
    const top=Object.keys(seasonPlayedMap).filter(id=>seasonPlayedMap[id]>0)
      .map(id=>({id,elo:Math.round(snap[id] ?? cfg.start_elo),wins:sw[id]||0,losses:sl[id]||0}))
      .sort((a,b)=>b.elo-a.elo);
    if(!top.length)continue;
    // Bestes Team: höchster gemeinsamer Elo-Zuwachs, mind. 2 gemeinsame Spiele
    // Spielanzahl pro Duo zählen
    if(!top.length)continue;
    // Bestes Team: höchster gemeinsamer Elo-Zuwachs, mind. 2 gemeinsame Spiele
    // Spielanzahl pro Duo zählen
    const teamGames={};
    ms.forEach(m=>{
      [[m.a1,m.a2],[m.b1,m.b2]].forEach(([x,y])=>{
        const k=[x,y].sort().join('|');
        teamGames[k]=(teamGames[k]||0)+1;
      });
    });
    const seasonTeamMap = gSim.seasonTeamElo[sid] || {};
    const teamEntries=Object.entries(seasonTeamMap)
      .filter(([k,v])=>v>0 && (teamGames[k]||0)>=2)
      .sort((a,b)=>b[1]-a[1]);
    const bestTeam=teamEntries[0]?teamEntries[0][0].split('|'):null;
    const entry={
      league_id:LK.id,
      id:sid,
      label:seasonLabel(sid),
      start_date:seasonStart(sid).toISOString().slice(0,10),
      end_date:seasonEnd(sid).toISOString().slice(0,10),
      player_id:top[0].id,
      team_p1:bestTeam?bestTeam[0]:null,
      team_p2:bestTeam?bestTeam[1]:null,
      top_elo:JSON.stringify(top.slice(0,3))
    };
    // PK ist jetzt (league_id, id) — idempotenter Multi-Writer-Rollover
    const{error}=await sb.from('seasons').upsert(entry,{onConflict:'league_id,id'});
    if(!error){
      const existIdx=seasons.findIndex(s=>s.id===sid);
      if(existIdx>=0) seasons[existIdx]=entry; else seasons.unshift(entry);
      console.log('Saison archiviert:',sid);
      // NEU: playerSeasonAwards und allPastSeasons invalidieren
      invalidateCache(['playerSeasonAwards', 'allPastSeasons']);
    }
    else console.error('Saison archivieren fehlgeschlagen:',sid,error);
  }
  // Recap-Popup: in den ersten 3 Tagen des neuen Monats anzeigen
      if(seasons.length&&new Date().getDate()<=3){
    const last=seasons[0];
// FIX
if(last && last.id !== currentSeason().id
   && !_recapSeen('recap_shown_'+last.id, 'season:'+last.id)){
  _autoRecapSeen.add('season:'+last.id); // Session-Guard: kein Re-Trigger durch 30s-loadAll
  setTimeout(()=>showSeasonRecap(last, {auto:true}),600);
}

  }

}

// ─── Auto-Recap „schon gezeigt?"-Guard (v9.6) ────────────────────────
// Kombiniert den persistenten localStorage-Marker mit einem In-Memory-Set.
// Grund für den Bug: loadAll() läuft alle 30 s und re-armt die Auto-Show-
// Timeouts (POTW/POTD/Saison). Auf manchen Browsern (Privatmodus, Storage-
// Partitionierung/ITP) persistiert localStorage NICHT — dann greift der
// „_shown"-Check nie und das Recap poppt bei jedem Tick erneut auf. Das Set
// überlebt die loadAll-Ticks der laufenden Session und verhindert die
// Wiederholung auch ohne funktionierendes localStorage. localStorage-Zugriffe
// sind zusätzlich gekapselt, damit ein throwendes setItem den Ablauf nicht bricht.
const _autoRecapSeen = new Set();
function _recapSeen(lsKey, sessKey){
  if(_autoRecapSeen.has(sessKey)) return true;
  try { if(localStorage.getItem(lsKey)) return true; } catch(e){}
  return false;
}
function _recapMarkSeen(lsKey, sessKey){
  _autoRecapSeen.add(sessKey);
  try { localStorage.setItem(lsKey, '1'); } catch(e){}
}

// v9: Kompakte Kurven-Vorschau des Saison-Positionsverlaufs für den Recap.
// Baut ein kleines Multi-Line-SVG (Rang 1 oben) aus getSeasonPositionHistory.
// Gecacht per Saison + matches.length + _cache.version → einmal pro Saison
// gebaut, danach reiner String-Return. Leerer String, wenn zu wenig Daten.
function _recapPosMiniSVG(ph){
  if(!ph || ph.empty) return '';
  const key = 'recapPosMini_'+ph.seasonId+'_'+matches.length+'_'+_cache.version;
  if(_cache._recapPosMiniKey === key) return _cache._recapPosMini;
  const W=78, H=38, padX=3, padY=4;
  const N = ph.activeIds.length, days = ph.lastDay;
  let svg = '';
  if(days >= 2 && N >= 1){
    const xOf = d => padX + (d/(days-1))*(W-2*padX);
    const yOf = rank => padY + ((rank-1)/Math.max(1,N-1))*(H-2*padY); // Rang 1 = oben
    let lines = '';
    for(const pid of ph.activeIds){
      const arr = ph.positionsByDay[pid] || [];
      const pts = [];
      for(let d=0; d<arr.length; d++){ if(arr[d]!=null) pts.push(xOf(d).toFixed(1)+','+yOf(arr[d]).toFixed(1)); }
      if(pts.length < 2) continue;
      const col = (ph.colorOf && ph.colorOf[pid]) || '#94a3b8';
      lines += `<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>`;
      const last = pts[pts.length-1].split(',');
      lines += `<circle cx="${last[0]}" cy="${last[1]}" r="1.7" fill="${col}"/>`;
    }
    if(lines) svg = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${lines}</svg>`;
  }
  _cache._recapPosMiniKey = key;
  _cache._recapPosMini = svg;
  return svg;
}

// Saison-Recap-Popup
// opts.auto=true  → Schutz-Phase (protectMs) gegen versehentliches Schließen aktiv,
//                   wird nur beim automatischen Auto-Trigger (Monatsanfang) gesetzt.
// Beim manuellen Öffnen (Header-Recap-Button, Saison-Picker) bleibt opts.auto leer
// → keine Schutz-Phase, Sheet lässt sich sofort per Backdrop-Klick schließen.
function showSeasonRecap(season, opts){
  opts = opts || {};
  _sheetSetReopen(()=>showSeasonRecap(season));
  const top=typeof season.top_elo==='string'?JSON.parse(season.top_elo):season.top_elo||[];
  const ms=matchesInSeason(season.id);
  const playerIdsInSeason=new Set();
  ms.forEach(m=>[m.a1,m.a2,m.b1,m.b2].forEach(id=>playerIdsInSeason.add(id)));
  const totalGoals=ms.reduce((s,m)=>s+(m.score_a||0)+(m.score_b||0),0);

  // ─── Awards der Saison berechnen ───
  const prevAw=awSeasonId;
  awSeasonId=season.id;
  const R=awardRankings('season');
  awSeasonId=prevAw;

  // Avatar-Helper für das Recap-Sheet
  const recapAv=(pid,cls)=>{
    const p=pmap()[pid];
    if(!p) return `<div class="${cls}" style="background:var(--surface3);color:var(--muted)">?</div>`;
    const em=p.avatar_id?avatarEmoji(p.avatar_id):null;
    if(em) return `<div class="${cls} has-emoji"><span class="em">${em}</span></div>`;
    return `<div class="${cls}" style="background:${avColor(p.id)}">${esc(initials(p.name))}</div>`;
  };

  // ─── Champion Hero ───
  let championHtml='';
  if(top[0]){
    const t=top[0];
    const p=pmap()[t.id];
    if(p){
      const wTot=t.wins+t.losses;
      const wr=wTot>0?Math.round(t.wins/wTot*100):0;
      const em=p.avatar_id?avatarEmoji(p.avatar_id):null;
      const champAv=em
        ? `<div class="rcp-champ-av has-emoji" style="background:var(--surface3)"><span class="em">${em}</span></div>`
        : `<div class="rcp-champ-av" style="background:${avColor(p.id)}">${esc(initials(p.name))}</div>`;
      championHtml=`
        <div class="rcp-champ" data-detail="${esc(t.id)}">
          <div class="rcp-champ-label">Saison-Sieger</div>
          <div class="rcp-champ-av-wrap">
            <div class="rcp-champ-crown">${svgI('crown')}</div>
            ${champAv}
          </div>
          <div class="rcp-champ-name">${esc(p.name)}</div>
          <div class="rcp-champ-stats">
            <div class="s"><div class="v acid">${t.elo}</div><div class="l">Elo</div></div>
            <div class="s"><div class="v">${t.wins}–${t.losses}</div><div class="l">Bilanz</div></div>
            <div class="s"><div class="v">${wr}%</div><div class="l">Siegrate</div></div>
          </div>
        </div>`;
    }
  }

  // ─── Podium Top 3 ───
  let podiumHtml='';
  const podiumOrder=[{e:top[1],cls:'second',n:2},{e:top[0],cls:'first',n:1},{e:top[2],cls:'third',n:3}];
  if(top.length>0){
    const podCols=podiumOrder.map(({e,cls,n})=>{
      if(!e){
        return `<div class="rcp-pod-col ${cls}">
          <div class="rcp-pod-av" style="border-color:var(--line);color:var(--muted);background:var(--surface3);font-size:18px">?</div>
          <div class="rcp-pod-name" style="color:var(--muted)">–</div>
          <div class="rcp-pod-elo">–</div>
          <div class="rcp-pod-wl"></div>
          <div class="rcp-pod-block">${n}</div>
        </div>`;
      }
      const p=pmap()[e.id];
      const em=p&&p.avatar_id?avatarEmoji(p.avatar_id):null;
      const avInner=em
        ? `<div class="rcp-pod-av has-emoji" style="background:var(--surface3)">${cls==='first'?`<div class="rcp-pod-mini-crown">${svgI('crown')}</div>`:''}<span class="em">${em}</span></div>`
        : `<div class="rcp-pod-av" style="background:${avColor(e.id)}">${cls==='first'?`<div class="rcp-pod-mini-crown">${svgI('crown')}</div>`:''}${esc(initials(p?p.name:'?'))}</div>`;
      return `<div class="rcp-pod-col ${cls}" data-detail="${esc(e.id)}" style="cursor:pointer">
        ${avInner}
        <div class="rcp-pod-name">${esc(pname(e.id))}</div>
        <div class="rcp-pod-elo">${e.elo} Elo</div>
        <div class="rcp-pod-wl">${e.wins}W · ${e.losses}L</div>
        <div class="rcp-pod-block">${n}</div>
      </div>`;
    }).join('');
    podiumHtml=`
      <div class="rcp-section">Saison-Podium</div>
      <div class="rcp-pod">${podCols}</div>`;
  }

  // ─── Rangliste Platz 4+ (basierend auf Saison-End-Elo, gleiche Quelle wie Podium) ───
  let restListHtml='';
  {
    const gSim=getGlobalSim();
    const snap=gSim.seasonEndElos[season.id]||{};
    const playedMap=gSim.seasonPlayed[season.id]||{};
    // Saison-isolierte Wins/Losses
    const sw={}, sl={};
    ms.forEach(m=>{
      [[m.a1,m.a2,m.winner==='A'],[m.b1,m.b2,m.winner==='B']].forEach(([x,y,won])=>{
        [x,y].forEach(id=>{
          if(won) sw[id]=(sw[id]||0)+1;
          else sl[id]=(sl[id]||0)+1;
        });
      });
    });
    // Vollständige Saison-Rangliste (alle Spieler mit Saison-Spielen), nach End-Elo
    const fullRank=Object.keys(playedMap)
      .filter(id=>playedMap[id]>0)
      .map(id=>({
        id,
        elo:Math.round(snap[id] ?? cfg.start_elo),
        wins:sw[id]||0,
        losses:sl[id]||0
      }))
      .sort((a,b)=>b.elo-a.elo);
    // Platz 4+: alle ohne Podium (filtert die archivierten Top-3-IDs heraus,
    // falls die Live-Reihenfolge minimal von der archivierten abweicht)
    const podiumIds=new Set((top||[]).filter(t=>t&&t.id).map(t=>t.id));
    const restRank=fullRank.filter(e=>!podiumIds.has(e.id));
    if(restRank.length){
      const rows=restRank.map((e,i)=>{
        const p=pmap()[e.id];
        if(!p) return '';
        const rank=podiumIds.size+i+1;
        const em=p.avatar_id?avatarEmoji(p.avatar_id):null;
        const av=em
          ? `<div class="rcp-rest-av has-emoji"><span class="em">${em}</span></div>`
          : `<div class="rcp-rest-av" style="background:${avColor(p.id)}">${esc(initials(p.name))}</div>`;
        return `<div class="rcp-rest-row" data-detail="${esc(e.id)}">
          <div class="rcp-rest-rank">${rank}</div>
          ${av}
          <div class="rcp-rest-name">${esc(p.name)}</div>
          <div class="rcp-rest-stats">
            <div class="rcp-rest-wl">${e.wins}–${e.losses}</div>
            <div class="rcp-rest-elo">${e.elo}</div>
          </div>
        </div>`;
      }).filter(Boolean).join('');
      if(rows){
        restListHtml=`<div class="rcp-section">Rangliste</div>
          <div class="rcp-rest">${rows}</div>`;
      }
    }
  }

  // ─── Awards Grid (Saison-Awards, sortiert: erst positive, dann Schande) ───
  const scorer    = R.scorer && R.scorer[0];
  const wall      = R.wall && R.wall[0];
  const streak    = R.streaks && R.streaks[0];
  const upset     = R.upsets && R.upsets[0];
  // Erweiterte Auswahl
  const grinder   = R.grinder && R.grinder[0];
  const perfect   = R.perfect && R.perfect[0];
  const weekKing  = R.weekKingList && R.weekKingList[0];
  const dayKing   = R.dayKingList && R.dayKingList[0];
  const worstWr   = R.worstWr && R.worstWr[0];
  const pechvogel = R.pechvogelList && R.pechvogelList[0];

  const awItem=(cls,iconKey,label,name,val,awKey)=>{
    return `<div class="rcp-aw ${cls}" data-award="${awKey}">
      <div class="rcp-aw-ic">${svgI(iconKey)}</div>
      <div class="rcp-aw-info">
        <div class="rcp-aw-label">${label}</div>
        <div class="rcp-aw-name">${esc(name)}</div>
        <div class="rcp-aw-val">${esc(val)}</div>
      </div>
    </div>`;
  };
  let awardsHtml='';
  const awCards=[];
  // POSITIVE Saison-Highlights
  if(scorer)  awCards.push(awItem('orange','ball','Torjäger',pname(scorer.id),'Ø '+scorer.avg.toFixed(1)+' Tore','scorer'));
  if(wall)    awCards.push(awItem('purple','shieldCheck','Eiserne Abwehr',pname(wall.id),(wall.v/wall.g).toFixed(1)+' Gegen/Sp.','wall'));
  if(streak)  awCards.push(awItem('acid','flame','Heißeste Serie',pname(streak.id),streak.v+' in Folge','streaks'));
  if(perfect) awCards.push(awItem('gold','star','Beste Bilanz',pname(perfect.id),Math.round(perfect.wr*100)+'% Siegrate','perfect'));
  if(weekKing)awCards.push(awItem('gold','crown','Wochenkönig',pname(weekKing.id),weekKing.v+'× POTW','weekKing'));
  if(dayKing) awCards.push(awItem('gold','crown','Tageskönig',pname(dayKing.id),dayKing.v+'× POTD','dayKing'));
  if(grinder) awCards.push(awItem('blue','gamepad','Vielspieler',pname(grinder.id),grinder.v+' Spiele','grinder'));
  if(upset){
    const winners=upset.m.winner==='A'?[upset.m.a1,upset.m.a2]:[upset.m.b1,upset.m.b2];
    const winPct=Math.round((1-upset.sp)*100);
    awCards.push(awItem('blue','bolt','Größter Upset',pname(winners[0])+' & '+pname(winners[1]),winPct+'% Chance','upset'));
  }
  // SCHANDE-Tafel der Saison
  if(worstWr)  awCards.push(awItem('red','ghost','Schlechtester',pname(worstWr.id),Math.round(worstWr.wr*100)+'% Siegrate','worstWr'));
  if(pechvogel)awCards.push(awItem('red','ghost','Pechvogel',pname(pechvogel.id),Math.round(pechvogel.pct*100)+'% knapp verloren','pechvogel'));
  // v9: „Baustelle" (Team-Niederlagenserie) bewusst aus dem Saison-Recap entfernt.
  if(awCards.length){
    awardsHtml=`<div class="rcp-section">Awards der Saison</div><div class="rcp-awards">${awCards.join('')}</div>`;
  }

  // ─── Team of the Season ───
  let teamHtml='';
  if(season.team_p1 && season.team_p2){
    const a=season.team_p1, b=season.team_p2;
    const pa=pmap()[a], pb=pmap()[b];
    const avForChip=(pid)=>{
      const p=pmap()[pid];
      if(!p) return `<div class="rcp-tos-av" style="background:var(--surface3);color:var(--muted)">?</div>`;
      const em=p.avatar_id?avatarEmoji(p.avatar_id):null;
      if(em) return `<div class="rcp-tos-av has-emoji" style="background:var(--surface3)"><span class="em">${em}</span></div>`;
      return `<div class="rcp-tos-av" style="background:${avColor(p.id)}">${esc(initials(p.name))}</div>`;
    };
    // Gemeinsame Siege berechnen
    let teamW=0, teamG=0;
    ms.forEach(m=>{
      const onA=(m.a1===a||m.a2===a)&&(m.a1===b||m.a2===b);
      const onB=(m.b1===a||m.b2===a)&&(m.b1===b||m.b2===b);
      if(onA){ teamG++; if(m.winner==='A')teamW++; }
      else if(onB){ teamG++; if(m.winner==='B')teamW++; }
    });
    const teamWr=teamG>0?Math.round(teamW/teamG*100):0;
    teamHtml=`
      <div class="rcp-tos" data-team="${esc([a,b].sort().join('|'))}">
        <div class="rcp-tos-pair">${avForChip(a)}${avForChip(b)}</div>
        <div class="rcp-tos-info">
          <div class="rcp-tos-label">Team of the Season</div>
          <div class="rcp-tos-name">${esc((pa?pa.name:'?')+' & '+(pb?pb.name:'?'))}</div>
          <div class="rcp-tos-detail">${teamG>0?teamG+' Spiele · '+teamWr+'% WR':'–'}</div>
        </div>
        <div class="rcp-tos-arrow">${svgI('chartUp')||'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>'}</div>
      </div>`;
  }

  // Verfügbare vergangene Saisons (für den Recap-Picker) — neueste zuerst
  const pastSeasons = seasons
    .filter(s => s.id !== currentSeason().id)
    .slice()
    .sort((a,b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const showPicker = pastSeasons.length > 1;
  const pickerHtml = showPicker ? `
    <div class="rcp-picker">
      <select id="rcpSeasonPicker" class="rcp-picker-select">
        ${pastSeasons.map(s => `<option value="${esc(s.id)}" ${s.id===season.id?'selected':''}>${esc(s.label)}</option>`).join('')}
      </select>
      <span class="rcp-picker-chevron">${svgI('chartDown')}</span>
    </div>` : '';

  // v9: Mini-Positionsverlauf (dezent, mittig, weit oben) — nur bei genug Daten.
  // getSeasonPositionHistory & _recapPosMiniSVG sind beide gecacht.
  let posMiniHtml = '';
  try {
    const mini = _recapPosMiniSVG(getSeasonPositionHistory(season.id));
    if(mini){
      posMiniHtml = `<button type="button" class="rcp-posmini" data-poshist="${esc(season.id)}">
        <span class="rcp-posmini-chart">${mini}</span>
        <span class="rcp-posmini-tx"><span class="rcp-posmini-tt">Positionsverlauf</span><span class="rcp-posmini-su">Saison-Entwicklung ansehen</span></span>
        <span class="rcp-posmini-ch">${svgI('chartUp')}</span>
      </button>`;
    }
  } catch(e){}

  openSheet(`
    <div class="rcp-head">
      <span class="rcp-label">${svgI('trophy')}Saison beendet</span>
      <div class="rcp-month">${esc(season.label)}</div>
      <div class="rcp-meta">${ms.length} Matches · ${playerIdsInSeason.size} Spieler${totalGoals?' · '+totalGoals+' Tore':''}</div>
      ${pickerHtml}
    </div>
    ${championHtml}
    ${teamHtml}
    ${podiumHtml}
    ${restListHtml}
    ${posMiniHtml}
    ${awardsHtml}
    <button class="recap-done-btn" id="closeRecapBtn">Verstanden</button>
  `, {protectMs: opts.auto ? 2500 : 0});
  // Grab-Hint: kurz pulsieren, signalisiert "wegziehen geht auch"
  const _grab = document.getElementById('sheetGrab');
  if(_grab) _grab.classList.add('grab-pulse');
  // Saison-Picker: bei Auswahl Recap neu rendern (ohne `recap_shown_…` zu markieren)
  const rcpPicker = document.getElementById('rcpSeasonPicker');
  if(rcpPicker){
    rcpPicker.onchange = () => {
      const sid = rcpPicker.value;
      const sel = seasons.find(s => s.id === sid);
      if(sel) showSeasonRecap(sel);
    };
  }
  document.getElementById('closeRecapBtn').onclick=()=>{
    _recapMarkSeen('recap_shown_'+season.id, 'season:'+season.id);
    closeSheet();
  };
  // Spieler-Karten klickbar → Spielerprofil
  document.querySelectorAll('.rcp-champ[data-detail], .rcp-pod-col[data-detail], .rcp-rest-row[data-detail]').forEach(el=>{
    el.onclick=()=>{
      const id=el.dataset.detail; if(!id) return;
      _recapMarkSeen('recap_shown_'+season.id, 'season:'+season.id);
      sheetNav(()=>showPlayer(id));
    };
  });
  // Team-Card klickbar → Team-Profil
  document.querySelectorAll('.rcp-tos[data-team]').forEach(el=>{
    el.onclick=()=>{
      const [a,b]=el.dataset.team.split('|');
      if(!a||!b) return;
      _recapMarkSeen('recap_shown_'+season.id, 'season:'+season.id);
      sheetNav(()=>showTeam(a,b));
    };
  });
  // Award-Karten klickbar → Award-Detail (mit ausgewählter Saison)
  document.querySelectorAll('.rcp-aw[data-award]').forEach(el=>{
    el.onclick=()=>{
      const k=el.dataset.award; if(!k) return;
      _recapMarkSeen('recap_shown_'+season.id, 'season:'+season.id);
      awPeriod='season'; awSeasonId=season.id;
      sheetNav(()=>showAward(k));
    };
  });
  // v9: Mini-Positionsverlauf-Button → voller Positionsverlauf dieser Saison
  document.querySelectorAll('.rcp-posmini[data-poshist]').forEach(el=>{
    el.onclick=()=>{
      const sid=el.dataset.poshist; if(!sid) return;
      _recapMarkSeen('recap_shown_'+season.id, 'season:'+season.id);
      sheetNav(()=>showPositionHistory(sid));
    };
  });
}

// Player-of-the-Day Recap: zeigt einmal pro Tag pro Gerät den Sieger des letzten Spieltags.
// ─── §3.3 Player-of-the-Week / Player-of-the-Day Recap ───────────────
// Helfer: Bereich der zuletzt abgeschlossenen Woche (Mo 00:00 – So 23:59:59.999)
function _potwLastWeekRange(){
  const now=new Date();
  const monday=new Date(now); monday.setHours(0,0,0,0);
  const wd=(monday.getDay()+6)%7;       // 0=Mo
  monday.setDate(monday.getDate()-wd-7); // Montag der Vorwoche
  const end=new Date(monday); end.setDate(end.getDate()+7); end.setMilliseconds(-1);
  return {start:monday, end};
}
function _potwKeyOf(monday){
  return monday.getFullYear()+'-'+String(monday.getMonth()+1).padStart(2,'0')+'-'+String(monday.getDate()).padStart(2,'0');
}
function _potwMatchesInRange(start,end){
  return matches.filter(m=>{const d=new Date(m.created_at); return d>=start && d<=end;});
}
// True wenn die Vorwoche mindestens 1 Match hatte (für Button-Sichtbarkeit)
function potwHasData(){
  const {start,end}=_potwLastWeekRange();
  return _potwMatchesInRange(start,end).length>0;
}

