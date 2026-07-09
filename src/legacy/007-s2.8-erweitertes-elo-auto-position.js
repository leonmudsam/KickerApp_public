// ╔═══ §2.8 ─── ERWEITERTES ELO + AUTO-POSITION ────────────────────────╗
//     K-Faktor + Gewichtung + Score-Spread laut cfg.
// ╚═════════════════════════════════════════════════════════════════════════╝
// Bestehende DB-Felder bleiben gleich. Neu: dynamischer K + Margin-of-Victory,
// rein clientseitig berechnet (kein Schema-Umbau nötig).
function expected(a,b){ return 1/(1+Math.pow(10,(b-a)/400)); }
function posFactor(ps,sw){ return 1+sw*(0.5-ps)*2; }
function riskWeights(hi,lo,rs){ const gap=Math.min(Math.abs(hi-lo)/400,1); const s=rs*gap; return {strong:1-s,weak:1+s}; }

// ─── §2.8a Automatische Position (erwartungsbasiert + Erfahrung) ─────
// Misst NICHT nur rohe Siege, sondern:
//   1) Leistung ÜBER der Erwartung je Position (Performance)
//   2) Wie OFT der Spieler auf der Position spielt (Erfahrung)
// Wer 90% der Spiele in der Abwehr macht, hat dort einen Erfahrungs-Bonus —
// auch wenn die Siegrate schlecht ist. Sonst wird jemand, der 9/10 als Verteidiger
// spielt und dort schlecht abschneidet, fälschlich als "Stürmer" eingestuft.
// ─── Konstanten sind jetzt cfg-getunt (Defaults als Fallback) ───
const POS_MIN_GAMES_DEFAULT = 3;
const EXP_WEIGHT_DEFAULT = 0.5;
const _posMinGames = () => cfg.pos_min_games ?? POS_MIN_GAMES_DEFAULT;
const _expWeight  = () => cfg.exp_weight ?? EXP_WEIGHT_DEFAULT;

function posPerfFrom(id, matchSubset){
  if (!matchSubset || matchSubset === matches) {
    const sim = getGlobalSim();
    const t = sim.posTracker[id];
    if (t) {
      return {
        aG: t.aG, aW: t.aW, dG: t.dG, dW: t.dW,
        aWr: t.aG ? t.aW / t.aG : null,
        dWr: t.dG ? t.dW / t.dG : null,
        aPerfAvg: t.aG ? t.aPerf / t.aG : null,
        dPerfAvg: t.dG ? t.dPerf / t.dG : null
      };
    }
  }
  let aG=0,aW=0,dG=0,dW=0, aPerf=0, dPerf=0;
  for(const m of matchSubset){
    const onA=(id===m.a1||id===m.a2), onB=(id===m.b1||id===m.b2);
    if(!onA&&!onB) continue;
    const won=(onA&&m.winner==='A')||(onB&&m.winner==='B');
    const pos=id===m.a1?m.a1_pos:id===m.a2?m.a2_pos:id===m.b1?m.b1_pos:m.b2_pos;
    const myExp = onA ? (m.exp_a!=null?m.exp_a:0.5) : (m.exp_a!=null?1-m.exp_a:0.5);
    const score = won?1:0;
    const perf = score - myExp;  // >0 = über Erwartung, <0 = darunter
    if(pos==='atk'){aG++; if(won)aW++; aPerf+=perf;} else {dG++; if(won)dW++; dPerf+=perf;}
  }
  return {aG,aW,dG,dW,
    aWr:aG?aW/aG:null, dWr:dG?dW/dG:null,
    aPerfAvg:aG?aPerf/aG:null, dPerfAvg:dG?dPerf/dG:null};
}


// Sturm-Anteil 0..1, kombiniert Performance + Erfahrung.
// Performance wird GEWICHTET nach Spielanzahl auf der Position (mehr Spiele = höheres Vertrauen).
// Erfahrung (wie oft auf der Position) fließt als eigener Faktor ein.
function atkStrengthFrom(id, matchSubset){
  const p=posPerfFrom(id,matchSubset);
  const total = p.aG + p.dG;
  const minG = _posMinGames();
  const aOk = p.aG>=minG, dOk = p.dG>=minG;
  if(!aOk && !dOk) return 0.5;

  // ── Faktor 1: Spielanzahl-gewichtete Performance ──
  // Statt perfAtk = aPerfAvg vs dPerfAvg direkt zu vergleichen (was bei ungleicher
  // Spielanzahl verzerrt), gewichten wir jede Performance mit der Spielanzahl.
  // So hat eine Position mit 9 Spielen 3x so viel Einfluss wie eine mit 3.
  let perfAtk;
  if(aOk && dOk){
    // Gewichteter Vergleich: perf*games normalisiert
    const aScore = p.aPerfAvg * p.aG;  // Gesamt-Überperformance im Sturm
    const dScore = p.dPerfAvg * p.dG;  // Gesamt-Überperformance in Abwehr
    // Positiv = Sturm-Spieler, Negativ = Abwehr-Spieler
    // Normalisiert auf [-1,1] durch Division durch total
    const diff = (aScore - dScore) / total;
    perfAtk = 0.5 + diff * 0.5;
  } else if(aOk) {
    perfAtk = 0.5 + p.aPerfAvg * 0.3;  // Nur Sturm-Daten: gedämpft
  } else {
    perfAtk = 0.5 - p.dPerfAvg * 0.3;  // Nur Abwehr-Daten: gedämpft
  }

  // ── Faktor 2: Erfahrung (wie oft auf der Position) ──
  const expAtk = total>0 ? p.aG/total : 0.5;

  // ── Kombination ──
  // exp_weight steuert den Mix. Bei 0.4: 60% gewichtete Performance, 40% Erfahrung.
  const ew = _expWeight();
  const combined = (1-ew)*perfAtk + ew*expAtk;
  return Math.max(0.1, Math.min(0.9, combined));
}
function clampHalf(v){return Math.max(0.1,Math.min(0.9,v));}
// Live-Stärke aus allen aktuellen Matches (für Anzeige & Vorschau)
function atkStrength(id){ return atkStrengthFrom(id, matches); }

