// ╔═══ §5.7 ─── VIEW: SETTINGS ─────────────────────────────────────────╗
//     Spieler verwalten, Saison-Recap, App-Reset (hinter Passwort-Lock).
// ╚═════════════════════════════════════════════════════════════════════════╝
function vSettings(){
  const sl=(id,name,val,min,max,suf)=>`<div class="slider-wrap">
    <div class="sh"><span class="sn">${name}</span><span class="sv"><span id="${id}v">${val}</span>${suf||''}</span></div>
    <input type="range" id="${id}" min="${min}" max="${max}" value="${val}"></div>`;
  // Aktuelle Werte für Erklärungen (mit Fallbacks)
  const c = {
    k:          Math.round(cfg.k_factor),
    risk:       Math.round((cfg.risk_split ?? 0.6)*100),
    pos:        Math.round((cfg.pos_swing ?? 0.45)*100),
    winBoost:   Math.round((cfg.win_boost ?? 1.12)*100),
    movDamp:    Math.round((cfg.mov_loss_damp ?? 0.5)*100),
    bonus:      ((cfg.match_bonus ?? 1.5)).toFixed(1),
    startElo:   Math.round(cfg.start_elo ?? 0),
    posMin:     Math.round(cfg.pos_min_games ?? 3),
    expW:       Math.round((cfg.exp_weight ?? 0.5)*100),
    npMult:     Math.round((cfg.new_player_mult ?? 1.5)*100),
    npMidMult:  Math.round((cfg.new_player_mid_mult ?? 1.2)*100),
    vetDamp:    Math.round((cfg.veteran_damp ?? 0.85)*100),
    movMax:     Math.round((cfg.mov_max_boost ?? 0.4)*100),
    expProt:    Math.round((cfg.exp_protect_max ?? 0.1)*100),
    udElo:      Math.round((cfg.underdog_elo_max ?? 0.15)*100),
    udGames:    Math.round((cfg.underdog_games_max ?? 0.05)*100),
    lowDamp:    Math.round((cfg.low_elo_loss_damp ?? 0)*100),
  };
  // PHASE 2: Einstellungen sind für alle Mitglieder offen (kein Passwort
  // mehr); die Formel-Slider ändern leagues.settings und sind daher nur
  // für Gründer/Admins editierbar (RLS erzwingt das serverseitig).
  const _admin = typeof _lkIsAdmin==='function' && _lkIsAdmin();
  const formulaHtml = !_admin ? `
    <div class="cfg-section-title">Elo-Formel</div>
    <div class="card"><p style="font-size:12px;color:var(--ink2);line-height:1.55;margin:0">
      Die Formel-Parameter kann nur der Gründer oder ein Admin der Liga
      anpassen. Frag in deiner Runde — oder lass dich befördern. 😉
    </p></div>` : `
    <div class="cfg-section-title">Grundparameter</div>
    <div class="card">
      ${sl('cfgK','K-Faktor (Tempo)',c.k,8,64,'')}
      ${sl('cfgStartElo','Start-Elo pro Saison',c.startElo,0,1000,'')}
    </div>

    <div class="cfg-section-title">Spielerlast & Position</div>
    <div class="card">
      ${sl('cfgRisk','Risiko-Split (schwacher Mate)',c.risk,0,100,'%')}
      ${sl('cfgPos','Positions-Swing',c.pos,0,100,'%')}
      ${sl('cfgExpW','Positions-Erfahrungs-Gewicht',c.expW,0,100,'%')}
      ${sl('cfgPosMin','Min. Spiele für Positions-Wertung',c.posMin,1,10,'')}
    </div>

    <div class="cfg-section-title">Sieg & Niederlage</div>
    <div class="card">
      ${sl('cfgWinBoost','Sieg-Boost',c.winBoost,100,140,'%')}
      ${sl('cfgMovDamp','MoV-Dämpfung Niederlage',c.movDamp,0,100,'%')}
      ${sl('cfgMovMax','MoV-Max-Boost (Kantersieg)',c.movMax,0,100,'%')}
      ${sl('cfgLowEloLossDamp','Low-Elo Verlustschutz',c.lowDamp,0,100,'%')}
    </div>

    <div class="cfg-section-title">Bonus-System</div>
    <div class="card">
      ${sl('cfgBonus','Spielbonus pro Match',Math.round((cfg.match_bonus ?? 1.5)*10),0,50,)}
      ${sl('cfgExpProt','Erfahrungs-Schutz Maximum',c.expProt,0,30,'%')}
      ${sl('cfgUdElo','Underdog-Boost (Elo-Gap)',c.udElo,0,100,'%')}
      ${sl('cfgUdGames','Underdog-Boost (Spiele-Gap)',c.udGames,0,100,'%')}
    </div>

    <div class="cfg-section-title">K-Faktor-Dynamik</div>
    <div class="card">
      ${sl('cfgNpMult','Neuling-Multi (&lt;5 Spiele)',c.npMult,100,200,'%')}
      ${sl('cfgNpMidMult','Anfänger-Multi (&lt;15 Spiele)',c.npMidMult,100,200,'%')}
      ${sl('cfgVetDamp','Veteran-Elogewinn (&gt;Start+400 Elo)',c.vetDamp,0,100,'%')}
    </div>

    <div class="card">
      <div class="mini-label">Mechaniken</div>
      <div style="font-size:12px;color:var(--ink2);line-height:1.8">
        <b style="color:var(--acid)">K-Faktor</b> — Wie stark einzelne Matches die Elo verändern. Hoch = schnelle Änderungen, niedrig = stabile Elo.<br>
        <b style="color:var(--acid)">Start-Elo</b> — Der Wert auf den jeder Spieler zu Saisonbeginn zurückgesetzt wird. Höhere Werte machen Verluste in den ersten Matches "weniger schmerzhaft".<br>
        <b style="color:var(--acid)">Risiko-Split</b> — Wie viel Last der schwächere Mitspieler trägt. Bei ${c.risk}% verlierst du weniger Elo wenn dein Mate deutlich schlechter ist.<br>
        <b style="color:var(--acid)">Positions-Swing</b> — Bonus für Siege auf der schwachen Position. Ein Abwehr-Spieler der im Sturm gewinnt bekommt extra Elo.<br>
        <b style="color:var(--acid)">Positions-Erfahrungs-Gewicht</b> — Mischverhältnis bei der automatischen Positions-Erkennung. ${c.expW}% bedeutet: ${c.expW}% Häufigkeit der Position, ${100-c.expW}% Performance. Hoch = wer oft Abwehr spielt gilt als Verteidiger, egal wie gut. Niedrig = nur Über-Erwartungs-Performance zählt.<br>
        <b style="color:var(--acid)">Min. Spiele Position</b> — Erst ab ${c.posMin} Spielen auf einer Position fließt sie in die Positions-Wertung ein. Schützt vor Zufalls-Einstufung nach 1 Spiel.<br>
        <b style="color:var(--acid)">Sieg-Boost</b> — Siege bringen ${c.winBoost-100}% mehr als Niederlagen kosten. Sorgt für langfristigen Aufwärtstrend.<br>
        <b style="color:var(--acid)">MoV-Dämpfung</b> — Tordifferenz bei Niederlagen nur ${c.movDamp}% so stark wie bei Siegen. Eine 0:10 Niederlage bestraft so nicht 3× so hart wie 5:10.<br>
        <b style="color:var(--acid)">MoV-Max-Boost</b> — Maximaler Multiplikator durch Tordifferenz bei einem Kantersieg. ${c.movMax}% heißt: ein 10:0 zählt bis zu ${(100+c.movMax)}% des normalen Werts.<br>
        <b style="color:var(--acid)">Low-Elo Verlustschutz</b> — Spieler unter dem Match-Durchschnitts-Elo verlieren bei Niederlagen bis zu ${c.lowDamp}% weniger Elo (tanh-skaliert nach 200 Elo Abstand zum Match-Durchschnitt). Symmetrisch zum Underdog-Boost — schützt schwache Spieler vor Elo-Absturz, aber nur wenn sie tatsächlich schwächer als der Schnitt im Match sind.<br>
        <b style="color:var(--acid)">Spielbonus</b> — +${c.bonus} Elo pro Match, egal ob Sieg oder Niederlage. Belohnt aktive Spieler.<br>
        <b style="color:var(--acid)">Erfahrungs-Schutz Max</b> — Erfahrene Spieler verlieren bei Niederlagen bis zu ${c.expProt}% weniger Elo (linear ab 5 bis 30 Saison-Matches). Schützt vor Absturz durch Pech-Serien.<br>
        <b style="color:var(--acid)">Underdog-Boost (Elo-Gap)</b> — Schwächere Spieler bekommen bis zu ${c.udElo}% Bonus bei Siegen gegen stärkere Gegner (tanh-skaliert nach 400 Elo-Differenz). Wirkt nur als Belohnung, nie als Bestrafung.<br>
        <b style="color:var(--acid)">Underdog-Boost (Spiele-Gap)</b> — Spieler mit weniger Matches bekommen bis zu ${c.udGames}% zusätzlichen Boost (tanh-skaliert nach 30 Spiele-Differenz). Hilft Neueinsteigern beim Aufholen. Veteranen werden nicht bestraft — beide Komponenten wirken unabhängig.<br>
        <b style="color:var(--acid)">Neuling-Multi</b> — In den ersten 5 Saison-Spielen wirkt K-Faktor um ${c.npMult}% verstärkt. Neue Spieler finden so schnell ihr Niveau.<br>
        <b style="color:var(--acid)">Anfänger-Multi</b> — Zwischen 5–14 Saison-Spielen wirkt K-Faktor um ${c.npMidMult}% verstärkt. Sanfter Übergang zur Normal-Bewertung.<br>
        <b style="color:var(--acid)">Veteran-Dämpfung</b> — Sehr starke Spieler (&gt; Start+400 Elo) bewegen sich um ${c.vetDamp}% des K-Faktors. Verhindert dass Top-Spieler durch Pflicht-Siege ewig weiter wachsen.<br>
        <b style="color:var(--acid)">Saison-Reset</b> — Jeden Monatswechsel werden alle Elo-Werte auf den Start-Wert zurückgesetzt. Karriere-Elo = gewichteter Durchschnitt der Saison-End-Elos.
      </div>
    </div>
    <div class="card" style="margin-top:14px;border:1px solid rgba(190,242,100,.18);background:linear-gradient(155deg,rgba(190,242,100,.06),var(--surface) 80%)">
      <div class="mini-label" style="color:var(--acid);display:flex;align-items:center;gap:6px">${svgI('info')}Slider-Verhalten</div>
      <p style="font-size:12px;color:var(--ink2);line-height:1.55;margin-top:8px">
        Slider-Änderungen wirken <b style="color:var(--acid)">nur auf neue Matches</b>.
        Vergangene Matches behalten ihre damaligen Elo-Werte — abgeschlossene Saisons bleiben stabil,
        Awards &amp; Achievements ändern sich nicht.
      </p>
      <p style="font-size:11px;color:var(--muted);line-height:1.55;margin-top:6px">
        Falls du die Slider <b>rückwirkend</b> auf die gesamte Historie anwenden willst, kannst du alle
        Matches neu berechnen lassen. <b style="color:var(--red)">Achtung:</b> dabei werden alle bisher
        gespeicherten Match-Deltas überschrieben.
      </p>
      <button class="btn" id="recalcBtn" style="margin-top:14px;width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px">${svgI('cycle')} Alle Matches rückwirkend neu berechnen</button>
    </div>`;

  return `
    <div class="view-head"><h2>Einstellungen</h2><p>Liga · Mitglieder · Konto · Formel</p></div>

    ${typeof vLeagueSettings==='function' ? vLeagueSettings() : ''}

    ${formulaHtml}

    <div class="card" style="margin-top:14px">
      <div class="mini-label">App-Version</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:10px">
        <div style="font-size:12px;color:var(--ink2);font-family:'Sometype Mono',monospace">${BUILD_VERSION}</div>
        <button class="btn ghost sm fit" id="forceReloadBtn" style="padding:7px 12px;font-size:11px;white-space:normal">Cache leeren &amp; neu laden</button>
      </div>
      <p style="font-size:11px;color:var(--muted);line-height:1.55;margin-top:10px">
        Falls neue Features nicht erscheinen, ist meist der iOS-PWA-/Browser-Cache schuld. Der Button erzwingt einen Frischen Load. Außerdem checkt die App im Hintergrund auf neue Versionen und blendet oben einen Banner ein.
      </p>
    </div>
    ${players.filter(p=>p.hidden).length?`
    <div class="card" style="margin-top:14px">
      <div class="mini-label">Ausgeblendete Spieler</div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:10px">
        ${players.filter(p=>p.hidden).map(p=>`
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)">
            <div style="display:flex;align-items:center;gap:10px">
              ${avHtml(p,'width:32px;height:32px;border-radius:9px;font-size:11px')}
              <span style="font-weight:600">${esc(p.name)}</span>
            </div>
            <button data-unhide="${p.id}" class="btn ghost sm fit" style="padding:7px 12px;font-size:11px">Einblenden</button>
          </div>`).join('')}
      </div>
    </div>`:''}

    `;
}

