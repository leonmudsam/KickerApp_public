// ╔═══ §5.7b ─── LIGA-SETTINGS · MITGLIEDER · KONTO (Phase 2) ──────────╗
//     Neue Bereiche im Einstellungen-Tab: Liga (Name/Invite/Beitritt),
//     Mitglieder-/Rollenverwaltung, Claim („Wer bist du?"), Konto
//     (E-Mail-Verknüpfung per OTP-Code — bewusst ohne Redirect-Links,
//     robust auf GitHub Pages/PWA), Audit-Log, Gefahrenzone.
//     UI zeigt nach Rolle (LK.role); durchgesetzt wird serverseitig
//     (RLS/Trigger/RPCs) — die UI ist nur Komfort.
// ╚═════════════════════════════════════════════════════════════════════════╝

function _lkIsAdmin(){ return !!(LK && (LK.role==='owner' || LK.role==='admin')); }
function _lkRoleLabel(r){ return r==='owner'?'Gründer':r==='admin'?'Admin':'Mitglied'; }
const _LK_INPUT_STYLE='width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--surface2);color:var(--ink);font:inherit';

// Wer steckt hinter einer user_id? → geclaimter Spieler dieser Liga.
function _lkUserLabel(uid){
  const p=players.find(pp=>pp.claimed_by===uid);
  if(p) return p.name;
  if(_authUser && uid===_authUser.id) return 'Du (kein Spieler gewählt)';
  return 'Mitglied '+String(uid||'').slice(0,6);
}

// ─── Markup der neuen Settings-Bereiche ──────────────────────────────────
function vLeagueSettings(){
  const admin=_lkIsAdmin();
  const owner=LK && LK.role==='owner';
  const myPlayer=_authUser?players.find(p=>p.claimed_by===_authUser.id):null;
  return `
    <div class="cfg-section-title">Liga</div>
    <div class="card">
      <div class="field-label">Name</div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input id="lkRenameInp" type="text" maxlength="60" value="${esc(LK?LK.name:'')}" ${admin?'':'disabled'}
          style="${_LK_INPUT_STYLE};flex:1">
        ${admin?'<button class="btn ghost sm fit" id="lkRenameBtn">Speichern</button>':''}
      </div>
      <div class="field-label" style="margin-top:16px">Einladung</div>
      <div id="lkInviteBox" style="margin-top:8px;font-size:13px;color:var(--muted)">Lade…</div>
    </div>

    <div class="cfg-section-title">Mitglieder</div>
    <div class="card">
      <div id="lkMembersBox" style="font-size:13px;color:var(--muted)">Lade…</div>
    </div>

    <div class="cfg-section-title">Wer bist du?</div>
    <div class="card">
      <p style="font-size:12px;color:var(--ink2);line-height:1.55;margin:0 0 10px">
        Verknüpfe dich mit deinem Spieler — dein Name taucht dann in der
        Mitgliederliste auf.${myPlayer?` Aktuell: <b style="color:var(--acid)">${esc(myPlayer.name)}</b>`:''}
      </p>
      <button class="btn ghost" id="lkClaimBtn" style="width:100%">${myPlayer?'Spieler wechseln / freigeben':'Spieler auswählen'}</button>
    </div>

    <div class="cfg-section-title">Konto</div>
    <div class="card" id="lkAccountBox">${vAccountSection()}</div>

    ${admin?`
    <div class="cfg-section-title">Protokoll</div>
    <div class="card">
      <p style="font-size:12px;color:var(--ink2);line-height:1.55;margin:0 0 10px">
        Wer hat wann Ergebnisse korrigiert, Spieler umbenannt oder Rollen
        geändert? Das Protokoll zeigt die letzten Änderungen.
      </p>
      <button class="btn ghost" id="lkAuditBtn" style="width:100%">Änderungsprotokoll ansehen</button>
    </div>`:''}

    <div class="cfg-section-title">Gefahrenzone</div>
    <div class="card" style="border:1px solid rgba(248,113,113,.25)">
      <button class="btn ghost" id="lkLeaveBtn" style="width:100%;color:var(--red);border-color:rgba(248,113,113,.4)">Liga verlassen</button>
      ${owner?`<button class="btn ghost" id="lkCloseBtn" style="width:100%;margin-top:10px;color:var(--red);border-color:rgba(248,113,113,.4)">Liga schließen</button>
      <p style="font-size:11px;color:var(--muted);line-height:1.5;margin:10px 0 0">
        Schließen entfernt die Liga von allen Geräten und blockiert Beitritte.
        Als Gründer kannst du die Liga nur verlassen, wenn du sie vorher
        überträgst oder als Letzter gehst (dann wird sie geschlossen).
      </p>`:''}
    </div>
  `;
}

// ─── Konto-Bereich (auch vom Home-Screen genutzt) ────────────────────────
function vAccountSection(){
  if(!_isAnonUser()){
    return `
      <p style="font-size:12px;color:var(--ink2);line-height:1.55;margin:0 0 10px">
        Angemeldet als <b style="color:var(--acid)">${esc(_authUser.email)}</b>.
        Deine Ligen sind gesichert — melde dich auf jedem Gerät mit dieser
        E-Mail an.
      </p>
      <button class="btn ghost sm fit" id="lkLogoutBtn">Abmelden</button>`;
  }
  return `
    <p style="font-size:12px;color:var(--ink2);line-height:1.55;margin:0 0 10px">
      Dein Zugang lebt aktuell nur auf diesem Gerät. Verknüpfe eine E-Mail
      als <b>Backup</b> — dann bekommst du deine Ligen auf jedem Gerät
      wieder. Keine Newsletter, nur Login.
    </p>
    <div id="lkEmailStep1">
      <div style="display:flex;gap:8px">
        <input id="lkEmailInp" type="email" placeholder="deine@email.de" autocomplete="email"
          style="${_LK_INPUT_STYLE};flex:1">
        <button class="btn ghost sm fit" id="lkEmailSendBtn">Code senden</button>
      </div>
    </div>
    <div id="lkEmailStep2" style="display:none;margin-top:10px">
      <p style="font-size:12px;color:var(--muted);margin:0 0 8px">
        Wir haben dir einen 6-stelligen Code geschickt (Spam-Ordner prüfen).
      </p>
      <div style="display:flex;gap:8px">
        <input id="lkOtpInp" type="text" inputmode="numeric" maxlength="6" placeholder="123456"
          style="${_LK_INPUT_STYLE};flex:1;letter-spacing:4px;text-align:center">
        <button class="btn sm fit" id="lkOtpBtn">Bestätigen</button>
      </div>
    </div>`;
}

// E-Mail-Verknüpfung (anonymer User → E-Mail-Identity, gleiche auth.uid()).
// Schritt 1: updateUser({email}) verschickt den OTP-Code an die neue Adresse.
// Schritt 2: verifyOtp(type 'email_change') bestätigt — in place, alle
// Mitgliedschaften bleiben (Plan §7).
function bindAccountSection(rootDoc){
  const d=rootDoc||document;
  const send=d.querySelector('#lkEmailSendBtn');
  if(send) send.onclick=async()=>{
    const email=(d.querySelector('#lkEmailInp').value||'').trim();
    if(!/.+@.+\..+/.test(email)){ toast('Bitte gültige E-Mail eingeben', true); return; }
    send.disabled=true;
    const { error } = await sb.auth.updateUser({ email });
    send.disabled=false;
    if(error){ toast('Senden fehlgeschlagen: '+error.message, true); return; }
    toast('Code verschickt','ok');
    const s2=d.querySelector('#lkEmailStep2');
    if(s2){ s2.style.display='block'; const o=d.querySelector('#lkOtpInp'); if(o) o.focus(); }
    send.textContent='Erneut senden';
  };
  const verify=d.querySelector('#lkOtpBtn');
  if(verify) verify.onclick=async()=>{
    const email=(d.querySelector('#lkEmailInp').value||'').trim();
    const token=(d.querySelector('#lkOtpInp').value||'').trim();
    if(token.length<6){ toast('Bitte den 6-stelligen Code eingeben', true); return; }
    verify.disabled=true;
    const { data, error } = await sb.auth.verifyOtp({ email, token, type:'email_change' });
    verify.disabled=false;
    if(error){ toast('Code ungültig oder abgelaufen', true); return; }
    if(data && data.user) _authUser=data.user;
    else { try{ const u=await sb.auth.getUser(); if(u.data) _authUser=u.data.user; }catch(e){} }
    toast('E-Mail verknüpft — Zugang gesichert!','ok');
    const box=d.querySelector('#lkAccountBox');
    if(box){ box.innerHTML=vAccountSection(); bindAccountSection(d); }
    else if(typeof render==='function' && LK) render();
  };
  const logout=d.querySelector('#lkLogoutBtn');
  if(logout) logout.onclick=async()=>{
    if(!confirm('Abmelden? Du kannst dich jederzeit mit deiner E-Mail wieder anmelden.')) return;
    await sb.auth.signOut();
    try{ localStorage.removeItem('lastLeagueId'); }catch(e){}
    location.reload();
  };
}

// ─── Handler & asynchrone Füllungen (aus bind() aufgerufen) ─────────────
function bindLeagueSettings(){
  if(!LK || !document.getElementById('lkInviteBox')) return;
  const admin=_lkIsAdmin();

  // Liga umbenennen (owner/admin; Policy erzwingt serverseitig)
  const rn=document.getElementById('lkRenameBtn');
  if(rn) rn.onclick=async()=>{
    const name=(document.getElementById('lkRenameInp').value||'').trim();
    if(!name){ toast('Name darf nicht leer sein', true); return; }
    const { error }=await sb.from('leagues').update({ name }).eq('id',LK.id);
    if(error){ toast('Umbenennen fehlgeschlagen: '+error.message, true); return; }
    LK.name=name;
    const h1=document.querySelector('#app .logo-txt h1'); if(h1) h1.textContent=name;
    toast('Umbenannt','ok');
  };

  _lkFillInviteBox();
  _lkFillMembersBox();

  const claim=document.getElementById('lkClaimBtn');
  if(claim) claim.onclick=()=>showClaimSheet(false);

  bindAccountSection(document);

  const audit=document.getElementById('lkAuditBtn');
  if(audit) audit.onclick=showAuditSheet;

  const leave=document.getElementById('lkLeaveBtn');
  if(leave) leave.onclick=async()=>{
    const lastOwner=LK.role==='owner';
    if(!confirm(lastOwner
      ? 'Liga verlassen? Als Gründer geht das nur, wenn du das letzte Mitglied bist — die Liga wird dann geschlossen.'
      : 'Liga wirklich verlassen? Du kannst jederzeit per Einladungscode zurückkommen.')) return;
    const { error }=await sb.rpc('leave_league',{ p_league_id: LK.id });
    if(error){
      toast(error.message.includes('owner_must_transfer')
        ? 'Übertrage erst die Gründer-Rolle (Mitglieder-Liste) oder schließe die Liga.'
        : 'Verlassen fehlgeschlagen: '+error.message, true);
      return;
    }
    toast('Liga verlassen','ok');
    setTimeout(goHome, 600);
  };

  const close=document.getElementById('lkCloseBtn');
  if(close) close.onclick=async()=>{
    if(!confirm(`Liga „${LK.name}" wirklich schließen?\n\nSie verschwindet von allen Geräten und Beitritte sind blockiert. Die Daten bleiben erhalten, aber es gibt aktuell keinen Weg zurück.`)) return;
    const { error }=await sb.rpc('close_league',{ p_league_id: LK.id });
    if(error){ toast('Schließen fehlgeschlagen: '+error.message, true); return; }
    toast('Liga geschlossen','ok');
    setTimeout(goHome, 600);
  };
}

// Einladung: aktiver Code + Teilen + (admin) Rotation & Beitritts-Toggle
async function _lkFillInviteBox(){
  const box=document.getElementById('lkInviteBox');
  if(!box) return;
  const admin=_lkIsAdmin();
  let code=null;
  try{
    const { data }=await sb.from('league_invites')
      .select('code').eq('league_id',LK.id).is('revoked_at',null).limit(1).maybeSingle();
    if(data) code=data.code;
  }catch(e){}
  box.innerHTML=`
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span class="num" style="font-size:17px;letter-spacing:2px;background:var(--surface3);padding:8px 12px;border-radius:10px">${code?esc(code):'—'}</span>
      <button class="btn ghost sm fit" id="lkShareBtn2">Teilen</button>
      ${admin?'<button class="btn ghost sm fit" id="lkRotateBtn">Neuer Code</button>':''}
    </div>
    ${admin?`<label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:12px;color:var(--ink2)">
      <input id="lkJoinToggle" type="checkbox" ${LK._joinEnabled!==false?'checked':''} style="width:18px;height:18px">
      Beitritte erlaubt (aus = Link/Code funktioniert nicht mehr)
    </label>`:''}`;
  const share=document.getElementById('lkShareBtn2');
  if(share) share.onclick=shareInvite;
  const rot=document.getElementById('lkRotateBtn');
  if(rot) rot.onclick=async()=>{
    if(!confirm('Neuen Einladungscode erzeugen? Der alte Link funktioniert dann sofort nicht mehr.')) return;
    const { data, error }=await sb.rpc('rotate_invite',{ p_league_id: LK.id });
    if(error){ toast('Rotation fehlgeschlagen: '+error.message, true); return; }
    toast('Neuer Code aktiv','ok');
    _lkFillInviteBox();
  };
  const tgl=document.getElementById('lkJoinToggle');
  if(tgl) tgl.onchange=async()=>{
    const { error }=await sb.from('leagues').update({ join_enabled: tgl.checked }).eq('id',LK.id);
    if(error){ toast('Ändern fehlgeschlagen: '+error.message, true); tgl.checked=!tgl.checked; return; }
    LK._joinEnabled=tgl.checked;
    toast(tgl.checked?'Beitritte erlaubt':'Beitritte gesperrt','ok');
  };
}

// Mitgliederliste + Rollen/Kick/Transfer
async function _lkFillMembersBox(){
  const box=document.getElementById('lkMembersBox');
  if(!box) return;
  let rows=[];
  try{
    const { data, error }=await sb.from('league_members')
      .select('user_id, role, joined_at').eq('league_id',LK.id).order('joined_at');
    if(error) throw error;
    rows=data||[];
  }catch(e){ box.textContent='Mitglieder konnten nicht geladen werden.'; return; }
  const meId=_authUser?_authUser.id:null;
  const owner=LK.role==='owner';
  const admin=_lkIsAdmin();
  box.innerHTML=rows.map(m=>{
    const me=m.user_id===meId;
    const since=m.joined_at?new Date(m.joined_at).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'}):'';
    const canKick=admin && !me && m.role!=='owner';
    const canRole=owner && !me && m.role!=='owner';
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${esc(_lkUserLabel(m.user_id))}${me?' <span style="color:var(--acid);font-size:11px">· Du</span>':''}
        </div>
        <div style="font-size:11px;color:var(--muted)">${_lkRoleLabel(m.role)}${since?' · seit '+since:''}</div>
      </div>
      ${canRole?`<button class="btn ghost sm fit" data-lkrole="${m.user_id}|${m.role==='admin'?'member':'admin'}" style="padding:6px 10px;font-size:11px">${m.role==='admin'?'Zu Mitglied':'Zu Admin'}</button>
      <button class="btn ghost sm fit" data-lktransfer="${m.user_id}" style="padding:6px 10px;font-size:11px">Gründer</button>`:''}
      ${canKick?`<button class="btn ghost sm fit" data-lkkick="${m.user_id}" style="padding:6px 10px;font-size:11px;color:var(--red)">Entfernen</button>`:''}
    </div>`;
  }).join('') || '<div class="empty">Keine Mitglieder</div>';

  box.querySelectorAll('[data-lkrole]').forEach(b=>b.onclick=async()=>{
    const [uid,role]=b.dataset.lkrole.split('|');
    const { error }=await sb.from('league_members').update({ role })
      .eq('league_id',LK.id).eq('user_id',uid);
    if(error){ toast('Rollenwechsel fehlgeschlagen: '+error.message, true); return; }
    toast('Rolle geändert','ok'); _lkFillMembersBox();
  });
  box.querySelectorAll('[data-lktransfer]').forEach(b=>b.onclick=async()=>{
    const uid=b.dataset.lktransfer;
    if(!confirm(`Gründer-Rolle an „${_lkUserLabel(uid)}" übertragen?\n\nDu wirst dadurch Admin und kannst die Liga nicht mehr schließen.`)) return;
    const { error }=await sb.rpc('transfer_ownership',{ p_league_id: LK.id, p_new_owner: uid });
    if(error){ toast('Übertragen fehlgeschlagen: '+error.message, true); return; }
    LK.role='admin';
    toast('Gründer-Rolle übertragen','ok');
    render();
  });
  box.querySelectorAll('[data-lkkick]').forEach(b=>b.onclick=async()=>{
    const uid=b.dataset.lkkick;
    if(!confirm(`„${_lkUserLabel(uid)}" aus der Liga entfernen?\n\nSpieler & Matches bleiben erhalten; die Person kann nur per neuem Einladungscode zurück.`)) return;
    const { error }=await sb.from('league_members').delete()
      .eq('league_id',LK.id).eq('user_id',uid);
    if(error){ toast('Entfernen fehlgeschlagen: '+error.message, true); return; }
    toast('Mitglied entfernt','ok'); _lkFillMembersBox();
  });
}

// ─── Spieler-Onboarding: Popup nach dem Erstellen einer Liga ─────────────
// Flag setzt der Create-Flow (001b); erscheint einmalig, ist schließbar
// (Backdrop/Swipe/„Fertig") und legt beliebig viele Spieler nacheinander an.
// true = Sheet wurde gezeigt (dann kein Claim-Onboarding im selben loadAll).
function maybeShowPlayerOnboarding(){
  if(!LK || !_authUser) return false;
  let flag=null;
  try{ flag=localStorage.getItem('pendingPlayers_'+LK.id); }catch(e){}
  if(!flag) return false;
  try{ localStorage.removeItem('pendingPlayers_'+LK.id); }catch(e){}
  if(players.length) return false;                           // gibt schon Spieler
  showAddPlayersSheet();
  return true;
}

function showAddPlayersSheet(){
  if(!LK) return;
  openSheet(`
    <div style="padding:4px 18px 24px">
      <h3 style="margin:10px 0 4px;font-size:17px">Spieler anlegen</h3>
      <p style="font-size:12px;color:var(--muted);line-height:1.5;margin:0 0 12px">
        Leg alle Mitspieler deiner Runde an — jeder startet bei ${cfg.start_elo} Elo.
        Später geht das jederzeit über die Rangliste.
      </p>
      <div id="obPlayerList" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px"></div>
      <div style="display:flex;gap:8px">
        <input id="obNameInp" type="text" maxlength="40" placeholder="Name…" autocomplete="off"
          style="${_LK_INPUT_STYLE};flex:1">
        <button class="btn sm fit" id="obAddBtn">Hinzufügen</button>
      </div>
      <button class="btn ghost" id="obDoneBtn" style="width:100%;margin-top:14px">Fertig</button>
    </div>`, {protectMs:800});
  const inp=document.getElementById('obNameInp');
  const list=document.getElementById('obPlayerList');
  const addBtn=document.getElementById('obAddBtn');
  const names=[];
  const add=async()=>{
    const n=inp.value.trim();
    if(!n){ inp.focus(); return; }
    addBtn.disabled=true;
    const { error }=await sb.from('players').insert({ league_id:LK.id, name:n, elo:cfg.start_elo, atk:0.5 });
    addBtn.disabled=false;
    if(error){ toast(error.message&&error.message.includes('duplicate')?'Name existiert schon':'Anlegen fehlgeschlagen', true); return; }
    names.push(n);
    list.innerHTML=names.map(x=>`<span style="background:var(--surface3);border:1px solid var(--line);border-radius:9px;padding:6px 10px;font-size:12px;font-weight:600">${esc(x)}</span>`).join('');
    inp.value=''; inp.focus();
    // Hintergrund (Rangliste) mitziehen — Sheet bleibt offen, loadAll ist
    // dank Delta-Sync billig und fasst offene Sheets nicht an
    loadAll();
  };
  addBtn.onclick=add;
  inp.onkeydown=e=>{ if(e.key==='Enter') add(); };
  inp.focus();
  document.getElementById('obDoneBtn').onclick=async()=>{
    closeSheet(true);
    await loadAll();
    // direkt in den Claim-Flow: „Welcher Spieler bist du?" (Plan §3)
    if(names.length && _authUser && !players.some(p=>p.claimed_by===_authUser.id)) showClaimSheet(true);
  };
}

// ─── Claim-Flow: „Welcher Spieler bist du?" ──────────────────────────────
// Onboarding nach frischem Beitritt (Flag aus lkJoin) — sonst via Settings.
function maybeShowClaimOnboarding(){
  if(!LK || !_authUser) return;
  let flag=null;
  try{ flag=localStorage.getItem('pendingClaim_'+LK.id); }catch(e){}
  if(!flag) return;
  try{ localStorage.removeItem('pendingClaim_'+LK.id); }catch(e){}
  if(!players.length) return;                                // noch keine Spieler angelegt
  if(players.some(p=>p.claimed_by===_authUser.id)) return;   // schon geclaimt
  showClaimSheet(true);
}

function showClaimSheet(onboarding){
  if(!LK || !_authUser) return;
  const meId=_authUser.id;
  const mine=players.find(p=>p.claimed_by===meId);
  const list=players.filter(p=>!p.hidden).map(p=>{
    const isMine=p.claimed_by===meId;
    const taken=p.claimed_by && !isMine;
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)">
      ${avHtml(p,'width:36px;height:36px;border-radius:10px;font-size:12px')}
      <div style="flex:1;min-width:0">
        <div style="font-weight:600">${esc(p.name)}${isMine?' <span style="color:var(--acid);font-size:11px">· Das bist du</span>':''}</div>
        ${taken?'<div style="font-size:11px;color:var(--muted)">bereits vergeben</div>':''}
      </div>
      ${isMine
        ? `<button class="btn ghost sm fit" data-unclaim="${p.id}" style="font-size:11px;padding:6px 10px">Freigeben</button>`
        : `<button class="btn ghost sm fit" data-claim="${p.id}" data-taken="${taken?1:0}" style="font-size:11px;padding:6px 10px">${taken?'Übernehmen':'Das bin ich'}</button>`}
    </div>`;
  }).join('');
  openSheet(`
    <div style="padding:4px 18px 24px">
      <h3 style="margin:10px 0 4px;font-size:17px">Welcher Spieler bist du?</h3>
      <p style="font-size:12px;color:var(--muted);line-height:1.5;margin:0 0 12px">
        ${onboarding?'Willkommen! ':''}Die Verknüpfung zeigt anderen, wer du bist —
        deine Spielstatistik hängt am Spieler, nicht am Gerät.
      </p>
      ${list||'<div class="empty">Noch keine Spieler in der Liga</div>'}
      <button class="btn ghost" id="claimSkipBtn" style="width:100%;margin-top:14px">${mine?'Schließen':'Nur zuschauen'}</button>
    </div>`, onboarding?{protectMs:800}:{});
  const sheet=document.getElementById('sheet');
  sheet.querySelectorAll('[data-claim]').forEach(b=>b.onclick=async()=>{
    if(b.dataset.taken==='1' && !confirm('Dieser Spieler ist schon mit einem anderen Gerät verknüpft. Übernehmen?')) return;
    const { error }=await sb.from('players').update({ claimed_by: meId }).eq('id',b.dataset.claim);
    if(error){ toast('Verknüpfen fehlgeschlagen: '+error.message, true); return; }
    closeSheet(true);
    toast('Verknüpft — viel Erfolg!','ok');
    await loadAll();
    if(tab==='settings') render();
  });
  sheet.querySelectorAll('[data-unclaim]').forEach(b=>b.onclick=async()=>{
    const { error }=await sb.from('players').update({ claimed_by: null }).eq('id',b.dataset.unclaim);
    if(error){ toast('Freigeben fehlgeschlagen: '+error.message, true); return; }
    closeSheet(true);
    toast('Freigegeben','ok');
    await loadAll();
    if(tab==='settings') render();
  });
  const skip=document.getElementById('claimSkipBtn');
  if(skip) skip.onclick=()=>closeSheet(true);
}

// ─── Audit-Log-Sheet (owner/admin — RLS erzwingt das Lesen serverseitig) ─
function _lkAuditLine(a){
  const pay=a.payload||{};
  const o=pay.old||{}, n=pay.new||{};
  const pl=id=>{ const p=players.find(pp=>pp.id===id); return p?p.name:'?'; };
  let txt;
  if(a.entity==='matches'){
    if(n.deleted_at && !o.deleted_at) txt='Match gelöscht ('+pl(o.a1)+'/'+pl(o.a2)+' vs '+pl(o.b1)+'/'+pl(o.b2)+')';
    else if(o.score_a!==undefined && (o.score_a!==n.score_a||o.score_b!==n.score_b))
      txt=`Ergebnis korrigiert: ${o.score_a}:${o.score_b} → ${n.score_a}:${n.score_b}`;
    else txt='Match bearbeitet';
  } else if(a.entity==='players'){
    if(n.deleted_at && !o.deleted_at) txt=`Spieler „${o.name}" gelöscht`;
    else if(o.name!==n.name) txt=`Spieler umbenannt: „${o.name}" → „${n.name}"`;
    else if(o.claimed_by!==n.claimed_by) txt=n.claimed_by?`Spieler „${n.name}" verknüpft`:`Verknüpfung von „${o.name}" gelöst`;
    else if(o.hidden!==n.hidden) txt=`Spieler „${n.name}" ${n.hidden?'ausgeblendet':'eingeblendet'}`;
    else txt=`Spieler „${n.name||o.name}" bearbeitet`;
  } else if(a.entity==='leagues'){
    if(n.deleted_at && !o.deleted_at) txt='Liga geschlossen';
    else if(o.name!==n.name) txt=`Liga umbenannt: „${o.name}" → „${n.name}"`;
    else if(o.join_enabled!==n.join_enabled) txt=n.join_enabled?'Beitritte erlaubt':'Beitritte gesperrt';
    else txt='Liga-Einstellungen geändert';
  } else if(a.entity==='league_members'){
    if(a.action==='delete') txt=`Mitglied „${_lkUserLabel(a.entity_id)}" entfernt/ausgetreten`;
    else if(o.role!==n.role) txt=`Rolle von „${_lkUserLabel(a.entity_id)}": ${_lkRoleLabel(o.role)} → ${_lkRoleLabel(n.role)}`;
    else txt='Mitglied bearbeitet';
  } else txt=a.action+' '+a.entity;
  const when=new Date(a.created_at).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  return `<div style="padding:9px 0;border-bottom:1px solid var(--line)">
    <div style="font-size:13px;line-height:1.4">${esc(txt)}</div>
    <div style="font-size:11px;color:var(--muted);margin-top:2px">${when} · ${esc(_lkUserLabel(a.actor))}</div>
  </div>`;
}

async function showAuditSheet(){
  openSheet(`<div style="padding:4px 18px 24px">
    <h3 style="margin:10px 0 12px;font-size:17px">Änderungsprotokoll</h3>
    <div id="auditList" style="font-size:13px;color:var(--muted)">Lade…</div>
  </div>`);
  try{
    const { data, error }=await sb.from('audit_log').select('*')
      .eq('league_id',LK.id).order('created_at',{ascending:false}).limit(50);
    if(error) throw error;
    const el=document.getElementById('auditList');
    if(el) el.innerHTML=(data&&data.length)
      ? data.map(_lkAuditLine).join('')
      : '<div class="empty">Noch keine Einträge — hier landen Korrekturen, Umbenennungen und Rollen-Änderungen.</div>';
  }catch(e){
    const el=document.getElementById('auditList');
    if(el) el.textContent='Protokoll konnte nicht geladen werden.';
  }
}
