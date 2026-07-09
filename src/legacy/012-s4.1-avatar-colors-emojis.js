// ╔═══ §4.1 ─── AVATAR COLORS & EMOJIS ─────────────────────────────────╗
//     Hash-basierte Farbzuweisung pro Spieler-ID. Emoji-Avatar überschreibt.
// ╚═════════════════════════════════════════════════════════════════════════╝
const AV_COLORS=['#BEF264','#ff7849','#56b4e8','#f7cf4a','#a78bfa','#4ade80','#f0566a','#22d3ee','#fb923c','#e879f9'];
function avColor(id){let h=0;for(let i=0;i<id.length;i++)h=id.charCodeAt(i)+((h<<5)-h);return AV_COLORS[Math.abs(h)%AV_COLORS.length];}

// 54 Avatar-Optionen (29 Originale + 25 Neue)
const AVATAR_OPTIONS = [
  // Originale 29
  {id:'wolf',     em:'🐺'}, {id:'smiletear', em:'🥲'}, {id:'cloud',   em:'😶‍🌫️'},
  {id:'cold',     em:'🥶'}, {id:'poop',      em:'💩'}, {id:'clown',   em:'🤡'},
  {id:'alien',    em:'👽'}, {id:'eye',       em:'👁'},  {id:'detective',em:'🕵'},
  {id:'ninja',    em:'🥷'}, {id:'wizard',    em:'🧙‍♂️'}, {id:'zombie',  em:'🧟'},
  {id:'monkey',   em:'🐵'}, {id:'raccoon',   em:'🦝'}, {id:'pig',     em:'🐷'},
  {id:'shrimp',   em:'🦐'}, {id:'eggplant',  em:'🍆'}, {id:'coconut', em:'🥥'},
  {id:'brick',    em:'🧱'}, {id:'pumpkin',   em:'🎃'}, {id:'heel',    em:'👠'},
  {id:'unicorn',  em:'🦄'}, {id:'shark',     em:'🦈'}, {id:'eagle',   em:'🦅'},
  {id:'tropicaldrink',    em:'🍹'}, {id:'xray',      em:'🩻'}, {id:'cigarette',em:'🚬'},
  {id:'moai',     em:'🗿'}, {id:'owl',       em:'🦉'},
  // 29 Neue Avatar-Optionen
  {id:'twoface',   em:'🎭'}, {id:'bat',     em:'🦇'}, {id:'champagne',   em:'🍾'},
  {id:'juggle',   em:'🤹🏼‍♂️'}, {id:'biohazard',     em:'☣️'}, {id:'devil',   em:'😈'},
  {id:'ogre',     em:'👹'}, {id:'goblin',    em:'👺'}, {id:'dragon',  em:'🐉'},
  {id:'nuclear',   em:'☢️'}, {id:'crab',    em:'🦀'},
  {id:'frog',     em:'🐸'}, {id:'panda',     em:'🐼'}, {id:'lion',    em:'🦁'},
  {id:'mosquito',      em:'🦟'}, {id:'beer',      em:'🍺'}, {id:'sloth',   em:'🦥'},
  {id:'hedgehog', em:'🦔'}, {id:'swan',      em:'🦢'}, {id:'butterfly',em:'🦋'},
  {id:'scorpion', em:'🦂'}, {id:'burner',    em:'👨🏼‍🏭'}, {id:'snake',   em:'🐍'},
  {id:'lizard',   em:'🦎'}, {id:'gorilla',   em:'🦍'}, 
];

function avatarEmoji(avId){const a=AVATAR_OPTIONS.find(x=>x.id===avId);return a?a.em:null;}
// Rendert das Avatar-Inner (Emoji wenn gesetzt, sonst Initialen)
function avatarInnerHtml(player){
  const em = player && player.avatar_id ? avatarEmoji(player.avatar_id) : null;
  if(em) return `<span class="em">${em}</span>`;
  return initials(player.name);
}
// Zentrale Avatar-Render-Funktion für Ranglisten etc.
// player: das player-Objekt; extraStyle: zusätzliche Inline-Styles
function avHtml(player, extraStyle){
  if(!player) return '';
  const em = player.avatar_id ? avatarEmoji(player.avatar_id) : null;
  if(em){
    return `<span class="av av-emoji" style="${extraStyle||''}"><span class="em">${em}</span></span>`;
  }
  return `<span class="av" style="background:${avColor(player.id)};${extraStyle||''}">${initials(player.name)}</span>`;
}
function initials(n){return n.trim().slice(0,2).toUpperCase();}

