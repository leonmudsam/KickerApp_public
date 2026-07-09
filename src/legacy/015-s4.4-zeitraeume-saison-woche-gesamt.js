// ╔═══ §4.4 ─── ZEITRÄUME (Saison/Woche/Gesamt) ────────────────────────╗
//     periodBounds() liefert {from,to} für die aktuelle Periode.
//     periodMatches() filtert matches[] entsprechend.
// ╚═════════════════════════════════════════════════════════════════════════╝
function periodStart(period){
  const now=new Date();
  if(period==='season') return seasonStart();
  if(period==='week'){ const d=new Date(now); d.setHours(0,0,0,0);
    const wd=(d.getDay()+6)%7; d.setDate(d.getDate()-wd); return d; }
  if(period==='day'){ const d=new Date(now); d.setHours(0,0,0,0); return d; }
  return null; // all
}
function matchesInPeriod(period){
  const key='mperiod_'+period+'_'+matches.length+'_'+_cache.version;
  if(!_cache._mperiod) _cache._mperiod={};
  if(_cache._mperiod[key]) return _cache._mperiod[key];
  let result;
  if(period==='season') result=matchesInSeason(currentSeason().id);
  else{
    const start=periodStart(period);
    result=start?matches.filter(m=>new Date(m.created_at)>=start):matches;
  }
  _cache._mperiod[key]=result;
  return result;
}

function periodLabel(period){
  const now=new Date();
  if(period==='season'){ return seasonLabel(currentSeason().id); }
  if(period==='week'){ const s=periodStart('week');
    return 'KW '+isoWeek(now)+' · ab '+s.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}); }
  if(period==='day'){ const s=periodStart('day');
    return s.toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit'}); }
  return 'Gesamte Liga';
}
function isoWeek(d){
  const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const dayNum=(date.getUTCDay()+6)%7; date.setUTCDate(date.getUTCDate()-dayNum+3);
  const firstThu=new Date(Date.UTC(date.getUTCFullYear(),0,4));
  const fd=(firstThu.getUTCDay()+6)%7; firstThu.setUTCDate(firstThu.getUTCDate()-fd+3);
  return 1+Math.round((date-firstThu)/(7*24*3600*1000));
}

