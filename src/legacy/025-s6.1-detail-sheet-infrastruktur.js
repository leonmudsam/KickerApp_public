// ╔═══ §6.1 ─── DETAIL-SHEET-INFRASTRUKTUR ─────────────────────────────╗
//     Bottom-Sheet-System mit Swipe-to-close. openSheet()/closeSheet().
// ╚═════════════════════════════════════════════════════════════════════════╝
// ── Sheet-Navigations-Stack (v9.2) ──────────────────────────────────
// Ermöglicht ÜBERLAPPENDE Sheets: ein Kind-Sheet (z.B. Spielerprofil aus dem
// Recap) legt sich „über" das aktuelle. closeSheet() — egal ob Button, Swipe
// oder Backdrop — geht dann Schritt für Schritt EINE Ebene zurück, statt alles
// zu schließen. Kein zweites DOM-Sheet nötig: pro Ebene merken wir uns eine
// reopen-Funktion und bauen das Eltern-Sheet frisch auf (Handler werden korrekt
// neu gebunden). Das einzelne #sheet + die Swipe-Geste bleiben unverändert.
let _sheetStack = [];      // {fn, scroll} der darunterliegenden Sheets (unten→oben)
let _sheetReopen = null;   // wie das AKTUELL sichtbare Sheet neu gebaut wird
let _sheetPopping = false; // true, während closeSheet ein Eltern-Sheet wiederherstellt
// Jeder stapelbare Sheet-Builder meldet zu Beginn, wie er sich neu öffnen lässt.
function _sheetSetReopen(fn){ _sheetReopen = (typeof fn === 'function') ? fn : null; }
// Aktuelles Sheet (samt Scroll-Position) auf den Stack legen.
function _pushCurrentSheet(){
  if(!_sheetReopen) return;
  const sheet = document.getElementById('sheet');
  _sheetStack.push({ fn: _sheetReopen, scroll: sheet ? sheet.scrollTop : 0 });
}
// Sauberer Übergang beim Stapeln/Zurückgehen: aktuelles Sheet nach unten
// „schließen", Inhalt tauschen, neues Sheet hochschieben — genau wie beim
// normalen Öffnen/Schließen (kein hartes Aufpoppen). swapFn ersetzt den Inhalt
// (ruft intern openSheet + ggf. Scroll-Restore).
let _sheetAnimating = false;
function _animateSheetSwap(swapFn){
  const sheet = document.getElementById('sheet');
  const bg = document.getElementById('sheetBg');
  // Kein sichtbares Sheet oder schon eine Animation aktiv → sofort tauschen.
  if(!sheet || !bg || !bg.classList.contains('show') || _sheetAnimating){ swapFn(); return; }
  _sheetAnimating = true;
  if(sheet._swipeCleanup){ sheet._swipeCleanup(); sheet._swipeCleanup=null; }
  sheet.classList.remove('is-dragging');
  // 1) aktuelles Sheet nach unten (schließen)
  sheet.style.transition = 'transform .2s cubic-bezier(.4,0,1,1)';
  sheet.style.transform = 'translateY(100%)';
  setTimeout(() => {
    // 2) Inhalt tauschen, unsichtbar unten halten
    sheet.style.transition = 'none';
    try { swapFn(); } catch(e){}
    sheet.style.transform = 'translateY(100%)';
    void sheet.offsetWidth; // Reflow, damit die Aufwärts-Transition greift
    // 3) hochschieben (öffnen)
    sheet.style.transition = 'transform .3s cubic-bezier(.2,.8,.2,1)';
    sheet.style.transform = 'translateY(0)';
    setTimeout(() => { sheet.style.transition=''; sheet.style.transform=''; _sheetAnimating=false; }, 300);
  }, 200);
}
// Vorwärts-Navigation: aktuelles Sheet stapeln, dann Kind sauber „öffnen".
// Ersetzt das frühere Schließen-und-neu-öffnen-Muster bei Navigationen.
function sheetNav(openChild){
  const sheet = document.getElementById('sheet');
  const stacking = sheet && sheet.classList.contains('show') && _sheetReopen && !_sheetPopping;
  if(stacking){
    _pushCurrentSheet();
    _animateSheetSwap(() => { try { openChild(); } catch(e){ _sheetStack.pop(); } });
  } else {
    try { openChild(); } catch(e){ _sheetStack.pop(); }
  }
}
window.sheetNav = sheetNav;

function openSheet(html, opts){
  opts = opts || {};
  const sheet=document.getElementById('sheet');
  const bg=document.getElementById('sheetBg');
  // Frischer Root-Open (kein Sheet war offen, kein Pop läuft) → Stack leeren.
  // Bei Navigation/Pop bleibt das Sheet sichtbar → Stack unangetastet.
  if(!bg.classList.contains('show') && !_sheetPopping){ _sheetStack.length = 0; }
  // Falls bereits ein Sheet offen war (openSheet direkt nach openSheet, ohne
  // closeSheet dazwischen), zuerst dessen Swipe-Listener aufräumen — sonst
  // stapeln sich window-mousemove/mouseup-Listener und lecken.
  if(sheet._swipeCleanup){ sheet._swipeCleanup(); sheet._swipeCleanup=null; }
  sheet.innerHTML=`<div class="sheet-grab" id="sheetGrab"></div>${html}`;
  // Scroll-Position zurücksetzen — sonst landet man im neuen Sheet dort, wo
  // im vorigen Sheet (oder bei vorigem Öffnen desselben Sheets) gescrollt war.
  // Muss nach innerHTML kommen, damit das Layout schon steht.
  sheet.scrollTop = 0;
  bg.classList.add('show');
  sheet.classList.add('show');
  // ⚠ Schutz-Phase: für auto-getriggerte Pop-Ups (Saison-/POTW-/POTD-Recap)
  // wird der Backdrop-Click für protectMs ms unterdrückt — verhindert
  // versehentliches Schließen bei direkt-nach-App-Start-Scroll-Aktionen.
  // Swipe-down und der "Verstanden"-Button bleiben jederzeit aktiv.
  if(opts.protectMs && opts.protectMs > 0){
    sheet._protectedUntil = Date.now() + opts.protectMs;
  } else {
    sheet._protectedUntil = 0;
  }
  bindSheetSwipe();
}

// closeSheet(force):
//   • Standard: EINE Ebene zurück, falls der Stack noch Eltern-Sheets enthält
//     (Button/Swipe/Backdrop wirken so als „Zurück").
//   • force=true: hart komplett schließen + Stack leeren (für terminale Aktionen
//     wie Löschen/Anlegen/Neuberechnen/Home, nach denen render() ohnehin greift).
function closeSheet(force){
  const sheet=document.getElementById('sheet');
  const bg=document.getElementById('sheetBg');
  if(!force && _sheetStack.length){
    // Zurück zum Eltern-Sheet — mit sauberer Schließen/Öffnen-Animation.
    bg.style.transition=''; bg.style.opacity='';
    const entry = _sheetStack.pop();
    _animateSheetSwap(() => {
      _sheetPopping = true;
      try {
        entry.fn();
        // Scroll-Position des Eltern-Sheets wiederherstellen (openSheet setzt 0).
        try { if(entry.scroll) sheet.scrollTop = entry.scroll; } catch(e){}
      }
      catch(e){ _sheetForceClose(sheet,bg); }
      _sheetPopping = false;
    });
    return;
  }
  _sheetForceClose(sheet,bg);
}
function _sheetForceClose(sheet,bg){
  _sheetStack.length = 0; _sheetReopen = null;
  // Swipe-Listener aufräumen
  if(sheet._swipeCleanup){ sheet._swipeCleanup(); sheet._swipeCleanup=null; }
  sheet.classList.remove('show','is-dragging');
  sheet.style.transform='';
  bg.style.opacity='';
  bg.classList.remove('show');
  // Falls Badge-Popover noch offen war (Navigation aus Popover heraus zu
  // Match-Detail → Sheet schließt mit), Popover auch schließen.
  const bpBg = document.getElementById('bpBg');
  if(bpBg && bpBg.classList.contains('show')) bpBg.classList.remove('show');
  // v8.2: gequeuten News-Toast nachholen, falls beim Boot ein Recap
  // ihn blockiert hat. Verzögerung kommt aus _processDeferredNewsToast.
  try { if(window._processDeferredNewsToast) window._processDeferredNewsToast(); } catch(e){}
}

function bindSheetSwipe(){
  const sheet=document.getElementById('sheet');
  const bg=document.getElementById('sheetBg');
  let startY=0, startScrollTop=0, dragging=false;
  let lastY=0, lastT=0;
  // Sheet-Close-Schwellen (kalibriert für versehentliche Touches vs echte Geste):
  // - CLOSE_THRESHOLD: lange, langsame Geste schließt erst nach 200 px Wegstrecke
  // - VELOCITY_THRESHOLD: 1.2 px/ms = echter Wisch (≈1200 px/s)
  // - MIN_DY_FOR_VEL_CLOSE: ein schneller Wisch braucht zusätzlich min. 60 px Strecke,
  //   damit kurze Flicks nicht ungewollt schließen
  // - DRAG_INTENT_THRESHOLD: ab dieser Strecke wird das Sheet visuell mitgezogen
  const CLOSE_THRESHOLD=200;
  const VELOCITY_THRESHOLD=1.2;
  const MIN_DY_FOR_VEL_CLOSE=60;
  const DRAG_INTENT_THRESHOLD=12;

  // ── TOUCH (Smartphone) ──
  const onTouchStart=(e)=>{
    const touch=e.touches[0];
    startY=touch.clientY;
    // ── Inner-Scroll-Tracking (Bugfix v8.1) ──────────────────────────
    // Häufige UX-Falle: Sheet enthält INNERE Scroll-Container (z.B.
    // .nv-list mit max-height:60vh + overflow-y:auto). Wenn der User
    // dort scrollt, bleibt sheet.scrollTop=0, und ein Hochziehen aus
    // einer Liste, die unten gescrollt war, wird fälschlich als Sheet-
    // Schließen interpretiert.
    //
    // Lösung: beim touchstart innersten scrollbaren Vorfahr finden und
    // dessen scrollTop tracken. Der Sheet-Swipe darf NUR greifen, wenn
    // sowohl Sheet als auch innerer Container am Top sind.
    let scrollEl = e.target;
    while(scrollEl && scrollEl !== sheet && scrollEl !== document.body){
      const cs = window.getComputedStyle(scrollEl);
      if((cs.overflowY === 'auto' || cs.overflowY === 'scroll')
         && scrollEl.scrollHeight > scrollEl.clientHeight){
        break;
      }
      scrollEl = scrollEl.parentElement;
    }
    if(!scrollEl || scrollEl === document.body) scrollEl = sheet;
    sheet._innerScrollEl = scrollEl;
    sheet._innerScrollTopStart = scrollEl.scrollTop;
    startScrollTop = sheet.scrollTop;
    lastY=startY; lastT=Date.now();
    dragging=false;
  };

  const onTouchMove=(e)=>{
    const touch=e.touches[0];
    const dy=touch.clientY-startY;
    lastY=touch.clientY; lastT=Date.now();
    // (1) Wenn das äußere Sheet bereits gescrollt war → kein Swipe
    if(startScrollTop>0) return;
    // (2) Wenn ein INNERER Scroll-Container bereits gescrollt war → kein Swipe
    if(sheet._innerScrollTopStart > 0) return;
    // (3) Wenn der innere Container WÄHREND der Geste runterscrollt (= User
    //     hat innen hochgezogen, Browser scrollt die Liste runter) → auch
    //     kein Sheet-Swipe. Verhindert "Scroll-Ende → Sheet zieht mit".
    if(sheet._innerScrollEl && sheet._innerScrollEl !== sheet
       && sheet._innerScrollEl.scrollTop > 0) return;
    if(dy<0) return;
    if(dy<DRAG_INTENT_THRESHOLD) return;
    if(!dragging){ dragging=true; sheet.classList.add('is-dragging'); }
    e.preventDefault();
    sheet.style.transform=`translateY(${dy*0.88}px)`;
    bg.style.opacity=1-Math.min(dy*0.88/300,1)*0.6;
  };

  const onTouchEnd=(e)=>{
    if(!dragging){ sheet.classList.remove('is-dragging'); return; }
    dragging=false;
    sheet.classList.remove('is-dragging');
    const touch=e.changedTouches[0];
    const dy=touch.clientY-startY;
    const velocity=Math.abs(dy)/(Date.now()-lastT+1);
    snapOrClose(dy,velocity);
  };

  // ── MOUSE (Desktop) ──
  const onMouseDown=(e)=>{
    // Nur auf dem Grab-Handle reagieren, nicht auf das gesamte Sheet
    const grab=document.getElementById('sheetGrab');
    if(!grab||!grab.contains(e.target)) return;
    startY=e.clientY;
    startScrollTop=sheet.scrollTop;
    lastY=startY; lastT=Date.now();
    dragging=true;
    sheet.classList.add('is-dragging');
    e.preventDefault();
  };

  const onMouseMove=(e)=>{
    if(!dragging) return;
    const dy=e.clientY-startY;
    lastY=e.clientY; lastT=Date.now();
    if(dy<0){ sheet.style.transform='translateY(0)'; return; }
    sheet.style.transform=`translateY(${dy*0.88}px)`;
    bg.style.opacity=1-Math.min(dy*0.88/300,1)*0.6;
  };

  const onMouseUp=(e)=>{
    if(!dragging) return;
    dragging=false;
    sheet.classList.remove('is-dragging');
    const dy=e.clientY-startY;
    const velocity=Math.abs(dy)/(Date.now()-lastT+1);
    snapOrClose(dy,velocity);
  };

  // ── GEMEINSAME SNAP/CLOSE LOGIK ──
  function snapOrClose(dy,velocity){
    if(dy>CLOSE_THRESHOLD || (velocity>VELOCITY_THRESHOLD && dy>=MIN_DY_FOR_VEL_CLOSE)){
      // Gibt es ein Eltern-Sheet? → NICHT hart schließen, sondern animiert eine
      // Ebene zurück (closeSheet → _animateSheetSwap übernimmt den Übergang).
      if(_sheetStack.length){ closeSheet(); return; }
      sheet.style.transition='transform .28s cubic-bezier(.4,0,1,1)';
      sheet.style.transform='translateY(100%)';
      bg.style.transition='opacity .28s';
      bg.style.opacity='0';
      setTimeout(()=>{
        closeSheet();
        sheet.style.transition='';
        bg.style.transition='';
      },280);
    } else {
      sheet.style.transition='transform .32s cubic-bezier(.2,.8,.2,1)';
      sheet.style.transform='translateY(0)';
      bg.style.transition='opacity .32s';
      bg.style.opacity='1';
      setTimeout(()=>{
        sheet.style.transition='';
        bg.style.transition='';
      },320);
    }
  }

  // Events registrieren
  sheet.addEventListener('touchstart',onTouchStart,{passive:true});
  sheet.addEventListener('touchmove',onTouchMove,{passive:false});
  sheet.addEventListener('touchend',onTouchEnd,{passive:true});

  // Mouse nur auf dem Grab-Handle
  sheet.addEventListener('mousedown',onMouseDown);
  window.addEventListener('mousemove',onMouseMove);
  window.addEventListener('mouseup',onMouseUp);

  // Cleanup wenn Sheet geschlossen wird
  const cleanup=()=>{
    sheet.removeEventListener('touchstart',onTouchStart);
    sheet.removeEventListener('touchmove',onTouchMove);
    sheet.removeEventListener('touchend',onTouchEnd);
    sheet.removeEventListener('mousedown',onMouseDown);
    window.removeEventListener('mousemove',onMouseMove);
    window.removeEventListener('mouseup',onMouseUp);
  };
  sheet._swipeCleanup=cleanup;
}

// Hintergrund-Klick schließt Sheet
document.getElementById('sheetBg').onclick=()=>{
  // Schutz-Phase respektieren (auto-getriggerte Recap-Pop-Ups).
  // Während der Schutz-Phase gibt es leichtes haptisches Feedback via
  // CSS-Klassen-Toggle, damit der User merkt: "hier passiert was, aber
  // ich muss bewusst schließen".
  const sheet=document.getElementById('sheet');
  if(sheet && sheet._protectedUntil && Date.now() < sheet._protectedUntil){
    // Optisches Mini-Bounce-Feedback statt schließen
    sheet.classList.remove('sheet-nudge');
    void sheet.offsetWidth; // Re-trigger Animation
    sheet.classList.add('sheet-nudge');
    return;
  }
  closeSheet();
};

// Badge-Popover: Backdrop-Click (außerhalb der Karte) schließt Popover.
// ESC schließt ebenfalls. Sheet darunter bleibt offen.
document.getElementById('bpBg').addEventListener('click', (e) => {
  // Nur schließen, wenn direkt der Backdrop geklickt wurde — nicht die Karte
  if(e.target.id === 'bpBg') closeBadgePopover();
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    // Reihenfolge: News-Detail > News-Popover > Badge-Popover (innerster zuerst)
    const ndBg = document.getElementById('ndBg');
    if(ndBg && ndBg.classList.contains('show')){
      if(typeof closeNewsDetail === 'function') closeNewsDetail();
      return;
    }
    const nvBg = document.getElementById('nvBg');
    if(nvBg && nvBg.classList.contains('show')){
      if(typeof closeNewsPopover === 'function') closeNewsPopover();
      return;
    }
    const bpBg = document.getElementById('bpBg');
    if(bpBg && bpBg.classList.contains('show')) closeBadgePopover();
  }
});

