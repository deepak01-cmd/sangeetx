'use strict';
const G   = id => document.getElementById(id);
const SI  = (id,v) => { const e=G(id); if(e) e.textContent=v; };
const FMT = s => { s=Math.floor(s||0); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
const ESC = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ════════════════════════════════════════════════════
   AUDIO  — two <audio> nodes for crossfade
   SOURCE — JioSaavn 320kbps via /api/search
════════════════════════════════════════════════════ */
const audA = new Audio(), audB = new Audio();
audA.preload = audB.preload = 'none';
audA.volume = 0.8; audB.volume = 0;
let actAud = audA, nxtAud = audB;  // which is currently playing

/* Web Audio EQ */
let ctx, srcA, srcB, gA, gB, filters=[], eqReady=false;
function initEQ() {
  if (eqReady) return;
  try {
    ctx  = new (window.AudioContext||window.webkitAudioContext)();
    srcA = ctx.createMediaElementSource(audA);
    srcB = ctx.createMediaElementSource(audB);
    gA   = ctx.createGain(); gA.gain.value = 0.8;
    gB   = ctx.createGain(); gB.gain.value = 0;
    const master = ctx.createGain(); master.gain.value = 1;
    EQ_BANDS.forEach((_,i) => {
      const f=ctx.createBiquadFilter();
      f.type = i===0?'lowshelf':i===EQ_BANDS.length-1?'highshelf':'peaking';
      f.frequency.value=EQ_BANDS[i]; f.gain.value=0; f.Q.value=1;
      filters.push(f);
    });
    [master,...filters,ctx.destination].reduce((a,b)=>(a.connect(b),b));
    srcA.connect(gA); gA.connect(master);
    srcB.connect(gB); gB.connect(master);
    eqReady=true;
  } catch(e){console.warn('EQ unavailable',e);}
}

/* ═══ CROSSFADE ═════════════════════════════════════ */
let xfSec=0, xfTimer=null, xfActive=false;
function setXfade(sec){
  xfSec=sec;
  document.querySelectorAll('.popt.xf').forEach(o=>o.classList.toggle('on',+o.dataset.sec===sec));
  togglePanel('xfPanel');
  toast(sec?`Crossfade ${sec}s 🎵`:'Crossfade off');
  G('iBxf').classList.toggle('on',sec>0);
}
function crossfadeTo(t){
  if (!xfSec||!isPlaying){ play(t,false); return; }
  xfActive=true;
  nxtAud.src=t.audio; nxtAud.load(); nxtAud.play().catch(()=>{});
  const vol=getVol(), steps=60, ms=(xfSec*1000)/steps; let i=0;
  clearInterval(xfTimer);
  xfTimer=setInterval(()=>{
    i++; const p=i/steps;
    if(eqReady){ (actAud===audA?gA:gB).gain.value=vol*(1-p); (actAud===audA?gB:gA).gain.value=vol*p; }
    else { actAud.volume=vol*(1-p); nxtAud.volume=vol*p; }
    G('xfBar').style.width=(p*100)+'%';
    if(i>=steps){
      clearInterval(xfTimer); actAud.pause(); actAud.src='';
      [actAud,nxtAud]=[nxtAud,actAud];
      if(eqReady){ gA.gain.value=actAud===audA?vol:0; gB.gain.value=actAud===audB?vol:0; }
      xfActive=false; G('xfBar').style.width='0%';
      cur=t; updateAllUI(t); pushRecent(t); updateLikeBtn(); refreshRows();
    }
  },ms);
}
const getVol=()=>parseFloat(G('volSl')?.value||80)/100;

/* ═══ SLEEP TIMER ════════════════════════════════════ */
let sleepTimer=null, sleepEnd=0;
function setSleep(min){
  clearTimeout(sleepTimer); sleepEnd=0;
  document.querySelectorAll('.popt[data-min]').forEach(o=>o.classList.remove('on'));
  if(!min){ updateSlBadge(); togglePanel('sleepPanel'); toast('Sleep timer off'); return; }
  sleepEnd=Date.now()+min*60000;
  document.querySelector(`.popt[data-min="${min}"]`)?.classList.add('on');
  sleepTimer=setTimeout(()=>{ aud().pause(); sleepEnd=0; updateSlBadge(); toast('😴 Sleep — music paused'); },min*60000);
  updateSlBadge(); togglePanel('sleepPanel'); toast(`Sleep in ${min}min 🌙`);
}
function updateSlBadge(){
  const b=G('slBadge');
  if(!sleepEnd){b.classList.remove('vis');return;}
  b.classList.add('vis');
  G('slTime').textContent=Math.max(0,Math.ceil((sleepEnd-Date.now())/60000))+'m';
}
setInterval(updateSlBadge,30000);

/* ═══ STATE ══════════════════════════════════════════ */
const aud=()=>actAud;
let Q=[], qi=-1, cur=null, isPlaying=false, isShuf=false, isRep=false;
let playlists = JSON.parse(localStorage.getItem('sx_pls')||'null') || [
  {id:'p0',name:'Favourites',icon:'favorite',color:PL_COLORS[0],tracks:[]}
];
let liked  = JSON.parse(localStorage.getItem('sx_lk')||'[]');
let recent = JSON.parse(localStorage.getItem('sx_rc')||'[]');
let curPlId= null;
const cache= {};
const savePls=()=>localStorage.setItem('sx_pls',JSON.stringify(playlists));
const saveLk =()=>localStorage.setItem('sx_lk', JSON.stringify(liked));
const saveRc =()=>localStorage.setItem('sx_rc', JSON.stringify(recent));

/* ═══ AUDIO EVENTS ═══════════════════════════════════ */
function wireAudio(a){
  a.addEventListener('play',    ()=>{ if(aud()===a) setPlayUI(true); });
  a.addEventListener('pause',   ()=>{ if(aud()===a) setPlayUI(false); });
  a.addEventListener('ended',   ()=>{ if(aud()===a) isRep?(a.currentTime=0,a.play()):nextT(); });
  a.addEventListener('timeupdate',()=>{ if(aud()===a) updateProg(); });
  a.addEventListener('canplay', ()=>{ if(aud()===a) SI('npStat','Now Playing'); });
  a.addEventListener('waiting', ()=>{ if(aud()===a) SI('npStat','Buffering…'); });
  a.addEventListener('error',   ()=>{ if(aud()===a){ toast('Stream error — skipping'); setTimeout(nextT,800); } });
}
wireAudio(audA); wireAudio(audB);

/* ═══ BUILD DYNAMIC UI ════════════════════════════════ */
const chipsEl=G('chipsEl');
CHIPS.forEach(([key,icon,label],i)=>{
  const d=document.createElement('div'); d.className=`chip${i===0?' on':''}`;
  d.innerHTML=`<span class="mi">${icon}</span>${label}`;
  d.onclick=()=>loadGenre(key,d); chipsEl.appendChild(d);
});
G('mobNavRow').innerHTML=NAV_ITEMS.map(([vid,icon,label],i)=>
  `<div class="mob-ni${i===0?' on':''}" onclick="mNavClick(this,'${vid}')">
    <div class="mob-ni-bg"><span class="mi">${icon}</span></div>
    <span class="lbl">${label}</span>
  </div>`
).join('');
G('eqPres').innerHTML=Object.keys(EQ_PRESETS).map(n=>
  `<div class="eq-p${n==='Flat'?' on':''}" data-p="${n}" onclick="applyPreset('${n}')">${n}</div>`
).join('');

/* ═══ PLAY ════════════════════════════════════════════ */
async function play(t, startPaused=false){
  if(!t) return;
  if(!t.audio){
    SI('npStat','Fetching…');
    try{
      const f=await fetchTracks(t.title+' '+t.artist,1);
      if(!f.length||!f[0].audio){toast('Could not load — skipping');nextT();return;}
      t={...t,...f[0]}; if(Q[qi])Q[qi]=t;
    }catch{toast('Load failed — skipping');nextT();return;}
  }
  cur=t; SI('npStat','Loading…');
  aud().src=t.audio; aud().load();
  if(!startPaused) aud().play().catch(()=>{});
  updateAllUI(t); pushRecent(t); updateLikeBtn(); refreshRows();
  if(G('lyricsPanel').classList.contains('on')) loadLyrics();
}

function setPlayUI(s){
  isPlaying=s; const ic=s?'pause':'play_arrow';
  ['pbIcon','mIcon','psIcon'].forEach(id=>{const e=G(id);if(e)e.textContent=ic;});
  G('psArt')?.classList.toggle('playing',s);
  G('npWave').style.display=s?'flex':'none';
}
function togglePlay(){ if(!cur){toast('Pick a song first!');return;} isPlaying?aud().pause():aud().play().catch(()=>{}); }
function nextT(){
  if(!Q.length) return;
  qi=isShuf?Math.floor(Math.random()*Q.length):(qi+1)%Q.length;
  if(xfSec&&isPlaying) crossfadeTo(Q[qi]); else play(Q[qi]);
  renderQ();
}
function prevT(){
  if(!Q.length) return;
  if(aud().currentTime>3){aud().currentTime=0;return;}
  qi=(qi-1+Q.length)%Q.length; play(Q[qi]); renderQ();
}

function updateProg(){
  const c=aud().currentTime||0, d=aud().duration||0;
  const pct=d?(c/d*100)+'%':'0%';
  ['pFill','npFill','psFill'].forEach(id=>{const e=G(id);if(e)e.style.width=pct;});
  G('mFill').style.width=pct;
  ['tC','npCur','psC'].forEach(id=>SI(id,FMT(c)));
  ['tD','npDur','psD'].forEach(id=>SI(id,d?FMT(d):'—'));
  // auto-trigger crossfade near end
  if(xfSec&&d&&!xfActive&&isPlaying&&(d-c)<xfSec+0.4&&Q.length>1){
    xfActive=true; const ni=isShuf?Math.floor(Math.random()*Q.length):(qi+1)%Q.length;
    qi=ni; crossfadeTo(Q[qi]); renderQ();
  }
}
function seek(f){ if(aud().duration) aud().currentTime=Math.max(0,Math.min(1,f))*aud().duration; }
function seekBar(e)  { const r=document.querySelector('.pb-bar').getBoundingClientRect(); seek((e.clientX-r.left)/r.width); }
function seekHero(e) { const r=G('npProgW').getBoundingClientRect(); seek((e.clientX-r.left)/r.width); }
function seekSheet(e){ const r=G('psBarW').getBoundingClientRect(); seek((e.clientX-r.left)/r.width); }
function setVol(v){
  const fv=v/100; aud().volume=fv;
  if(eqReady){ gA.gain.value=actAud===audA?fv:0; gB.gain.value=actAud===audB?fv:0; }
  const ic=v>50?'volume_up':v>0?'volume_down':'volume_off';
  ['volIc','psVI'].forEach(id=>{const e=G(id);if(e)e.querySelector('.mi').textContent=ic;});
  G('volSl').value=v; const p=G('psVol');if(p)p.value=v;
}
function muteT(){ audA.muted=audB.muted=!audA.muted; const ic=audA.muted?'volume_off':'volume_up'; ['volIc','psVI'].forEach(id=>{const e=G(id);if(e)e.querySelector('.mi').textContent=ic;}); }
function toggleShuffle(){ isShuf=!isShuf; ['iBsh','ctSh','psSh'].forEach(id=>G(id)?.classList.toggle('on',isShuf)); toast(isShuf?'Shuffle on 🔀':'Shuffle off'); }
function toggleRepeat() { isRep=!isRep;   ['iBrp','ctRp','psRp'].forEach(id=>G(id)?.classList.toggle('on',isRep));  toast(isRep?'Repeat on 🔁':'Repeat off'); }

/* ═══ UI UPDATES ═════════════════════════════════════ */
function updateAllUI(t){
  ['pbTit','mTit','npTit','psTit'].forEach(id=>SI(id,t.title));
  ['pbArt','mSub','npArt2','psSub'].forEach(id=>SI(id,t.artist));
  updateArt(t.image); renderSheetQ();
}
function updateArt(img){
  G('pbIW').innerHTML=img?`<img class="pb-img" src="${ESC(img)}">`:`<div class="pb-iph"><span class="mi">music_note</span></div>`;
  G('mAW').innerHTML =img?`<img src="${ESC(img)}">`:`<div class="mob-aw-ph"><span class="mi">music_note</span></div>`;
  const nh=G('npArt');if(nh)nh.outerHTML=img?`<img class="np-thumb" id="npArt" src="${ESC(img)}">`:`<div class="np-ph" id="npArt"><span class="mi">music_note</span></div>`;
  const pa=G('psArt');if(pa)pa.outerHTML=img?`<img class="ps-art${isPlaying?' playing':''}" id="psArt" src="${ESC(img)}">`:`<div class="ps-art-ph" id="psArt"><span class="mi">music_note</span></div>`;
  const bg=G('psBg');if(bg&&img)bg.style.backgroundImage=`url(${img})`;
}
const waveHTML=()=>`<span style="display:inline-flex;align-items:center;gap:2px;height:12px">${[0,.1,.2,.3,.4].map((d,j)=>`<span style="width:2px;border-radius:2px;background:var(--accent);animation:wv 1.1s ease-in-out ${d}s infinite;height:${['30%','80%','100%','60%','85%'][j]}"></span>`).join('')}</span>`;
const spin =(el)=>{ el.innerHTML=`<div class="spinner"><div class="spin"></div></div>`; };
const empt =(el,ic,msg)=>{ el.innerHTML=`<div class="empty"><span class="mi">${ic}</span><p>${msg}</p></div>`; };

/* ═══ LYRICS ══════════════════════════════════════════ */
const lyrCache={};
async function loadLyrics(){
  const panel=G('lyricsPanel'); if(!cur){panel.innerHTML='<p class="lyr-none">No track playing</p>';return;}
  const key=cur.id;
  if(lyrCache[key]!==undefined){showLyrics(lyrCache[key]);return;}
  panel.innerHTML='<div class="lyr-loading"><div class="spin"></div> Loading lyrics…</div>';
  try{const l=await fetchLyrics(cur.id); lyrCache[key]=l; showLyrics(l);}
  catch{lyrCache[key]=null;showLyrics(null);}
}
function showLyrics(txt){
  G('lyricsPanel').innerHTML=txt?`<div class="lyr">${ESC(txt).replace(/\n/g,'<br>')}</div>`:'<p class="lyr-none">Lyrics not available for this song</p>';
}
function switchTab(tab){
  document.querySelectorAll('.ps-tab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.ps-panel').forEach(p=>p.classList.remove('on'));
  G('tab'+tab.charAt(0).toUpperCase()+tab.slice(1)).classList.add('on');
  G(tab+'Panel').classList.add('on');
  if(tab==='lyrics') loadLyrics();
  if(tab==='queue')  renderSheetQ();
}
// capitalise first letter for tab IDs (tabLyrics, tabQueue)
// fix: use explicit IDs from HTML
function switchTab(tab){
  document.querySelectorAll('.ps-tab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.ps-panel').forEach(p=>p.classList.remove('on'));
  G('tab'+tab[0].toUpperCase()+tab.slice(1)).classList.add('on');
  G(tab+'Panel').classList.add('on');
  if(tab==='lyrics') loadLyrics();
  if(tab==='queue')  renderSheetQ();
}

/* ═══ RENDER ══════════════════════════════════════════ */
function renderCards(tracks,wrap,list){
  wrap.innerHTML=''; if(!tracks.length){empt(wrap,'music_off','No tracks found');return;}
  tracks.forEach((t,i)=>{
    const d=document.createElement('div'); d.className='card';
    d.innerHTML=`<div class="cart-w"><img class="cart" src="${ESC(t.image)}" loading="lazy"><button class="cplay"><span class="mi">play_arrow</span></button></div><div class="ctit">${ESC(t.title)}</div><div class="csub">${ESC(t.artist)}</div>`;
    d.addEventListener('click',()=>startList(list,i));
    d.querySelector('.cplay').addEventListener('click',e=>{e.stopPropagation();startList(list,i);});
    wrap.appendChild(d);
  });
}
function renderReelCards(tracks,wrap){
  wrap.innerHTML='';
  tracks.forEach((t,i)=>{
    const d=document.createElement('div'); d.className='rcard';
    d.innerHTML=`<div class="rthumb"><img class="rimg" src="${ESC(t.image)}" loading="lazy"><div class="rgrad"></div><div class="rplay"><span class="mi">play_arrow</span></div><div class="rtag">HOT</div><div class="rbot"><div class="rname">${ESC(t.title)}</div><div class="rby">${ESC(t.artist)}</div></div></div><div class="rlbl">${ESC(t.title)}</div><div class="rsub">${ESC(t.artist)}</div>`;
    d.addEventListener('click',()=>startList(tracks,i));
    wrap.appendChild(d);
  });
}
function renderTL(tracks,wrap,plId,list){
  const rmMode=!!plId;
  wrap.innerHTML=''; if(!tracks.length){empt(wrap,'music_off','No tracks');return;}
  tracks.forEach((t,i)=>{
    const isNow=cur?.id===t.id, inLk=liked.some(l=>l.id===t.id);
    const row=document.createElement('div'); row.className=`tr${isNow?' now':''}`;
    row.innerHTML=`<span class="tr-n">${isNow?waveHTML():i+1}</span><img class="tr-img" src="${ESC(t.image)}" loading="lazy"><div class="tr-info"><div class="tr-tit">${ESC(t.title)}</div><div class="tr-meta">${ESC(t.artist)}${t.album?' · '+ESC(t.album):''}</div></div><span class="tr-dur">${FMT(t.duration)}</span><div class="tr-acts">${rmMode?`<button class="tact rm" title="Remove"><span class="mi">remove_circle_outline</span></button>`:`<button class="tact add" title="Add to playlist"><span class="mi">playlist_add</span></button>`}<button class="tact q" title="Queue"><span class="mi">add_to_queue</span></button><button class="tact lk${inLk?' on':''}" title="Like"><span class="mi">${inLk?'favorite':'favorite_border'}</span></button></div>`;
    row.addEventListener('click',e=>{
      if(e.target.closest('.tact'))return;
      const ref=list||tracks; Q=ref.slice(); qi=ref.findIndex(x=>x.id===t.id); if(qi<0)qi=0;
      play(Q[qi]); renderQ(); refreshRows();
    });
    if(rmMode){
      row.querySelector('.rm').addEventListener('click',e=>{
        e.stopPropagation(); const pl=playlists.find(p=>p.id===plId);
        if(pl){pl.tracks=pl.tracks.filter(x=>x.id!==t.id);savePls();renderPlDetail(plId);toast('Removed');}
      });
    } else {
      row.querySelector('.add').addEventListener('click',e=>{e.stopPropagation();showATP(t);});
    }
    row.querySelector('.q').addEventListener('click',e=>{e.stopPropagation();if(!Q.find(q=>q.id===t.id))Q.push(t);renderQ();toast('Queued');});
    row.querySelector('.lk').addEventListener('click',e=>{
      e.stopPropagation(); const btn=e.currentTarget, idx=liked.findIndex(l=>l.id===t.id);
      if(idx>=0){liked.splice(idx,1);btn.querySelector('.mi').textContent='favorite_border';btn.classList.remove('on');toast('Unliked');}
      else{liked.unshift(t);btn.querySelector('.mi').textContent='favorite';btn.classList.add('on');toast('Liked ❤');}
      saveLk(); if(cur?.id===t.id)updateLikeBtn();
    });
    wrap.appendChild(row);
  });
}
function renderQ(){
  const el=G('qEl');
  if(!Q.length){el.innerHTML=`<div class="empty-sm">Queue is empty</div>`;renderSheetQ();return;}
  const disp=[...Q.slice(qi),...Q.slice(0,qi)].slice(0,14);
  el.innerHTML=disp.map((t,j)=>{const ri=(qi+j)%Q.length,n=ri===qi;return`<div class="sq-item${n?' now':''}" data-ri="${ri}"><img class="sq-art" src="${ESC(t.image)}"><div class="sq-info"><div class="sq-nm${n?' now':''}">${ESC(t.title)}</div><div class="sq-by">${ESC(t.artist)}</div></div><button class="sq-rm" data-ri="${ri}"><span class="mi">close</span></button></div>`;}).join('');
  el.querySelectorAll('.sq-item').forEach(r=>{
    const ri=+r.dataset.ri;
    r.addEventListener('click',e=>{if(!e.target.closest('.sq-rm')){qi=ri;play(Q[ri]);renderQ();}});
    r.querySelector('.sq-rm').addEventListener('click',e=>{e.stopPropagation();Q.splice(ri,1);if(qi>=Q.length)qi=Math.max(0,Q.length-1);renderQ();});
  });
  renderSheetQ();
}
function renderSheetQ(){
  const el=G('queuePanel'); if(!el)return;
  if(!Q.length){el.innerHTML='<p class="lyr-none">Queue is empty</p>';return;}
  const disp=[...Q.slice(qi),...Q.slice(0,qi)].slice(0,20);
  el.innerHTML=disp.map((t,j)=>{const ri=(qi+j)%Q.length,n=ri===qi;return`<div class="shq-item${n?' now':''}" data-ri="${ri}"><img class="shq-img" src="${ESC(t.image)}"><div><div class="shq-nm">${ESC(t.title)}</div><div class="shq-by">${ESC(t.artist)}</div></div></div>`;}).join('');
  el.querySelectorAll('.shq-item').forEach(r=>{const ri=+r.dataset.ri;r.addEventListener('click',()=>{qi=ri;play(Q[ri]);renderQ();});});
}
function startList(list,i){Q=list.slice();qi=i;play(Q[qi]);renderQ();}
function refreshRows(){
  document.querySelectorAll('.tr').forEach((row,i)=>{
    const n=cur&&row.querySelector('.tr-tit')?.textContent===cur.title;
    row.classList.toggle('now',n);
    const ne=row.querySelector('.tr-n');if(ne)ne.innerHTML=n?waveHTML():i+1;
  });
}

/* ═══ NAVIGATION ══════════════════════════════════════ */
function goNav(id,btn){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));G(id)?.classList.add('on');
  document.querySelectorAll('.sni').forEach(b=>b.classList.remove('on'));btn?.classList.add('on');
  ({plv:renderLibrary,recv:renderRec,lkv:renderLk,rv:renderTrending})[id]?.();
}
function mNavClick(el,id){goNav(id,null);document.querySelectorAll('.mob-ni').forEach(b=>b.classList.remove('on'));el.classList.add('on');}
const openSheet =()=>G('pSheet').classList.add('open');
const closeSheet=()=>G('pSheet').classList.remove('open');
(()=>{const s=G('pSheet');let sy=0;s.addEventListener('touchstart',e=>sy=e.touches[0].clientY,{passive:true});s.addEventListener('touchend',e=>{if(e.changedTouches[0].clientY-sy>70)closeSheet();});})();
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT')return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}
  if(e.code==='ArrowRight')nextT(); if(e.code==='ArrowLeft')prevT();
  if(e.key==='l'||e.key==='L')toggleLike();
  if(e.key==='Escape'){closeSheet();closeAllPanels();}
});

/* ═══ FLOATING PANELS ═════════════════════════════════ */
const PANELS=['eqPanel','sleepPanel','xfPanel'];
function togglePanel(id){
  const open=!G(id).classList.contains('open');
  PANELS.forEach(p=>G(p).classList.remove('open'));
  if(open) G(id).classList.add('open');
  G('iBEQ')?.classList.toggle('on', id==='eqPanel'&&open);
  G('iBxf')?.classList.toggle('on', id==='xfPanel'&&(xfSec>0));
  G('psEQ')?.classList.toggle('on', id==='eqPanel'&&open);
  G('psXF')?.classList.toggle('on', id==='xfPanel'&&open);
  G('psSl')?.classList.toggle('on', id==='sleepPanel'&&open);
  if(id==='eqPanel'&&open){if(!eqReady)initEQ();ctx?.state==='suspended'&&ctx.resume();buildEQ();}
}
function closeAllPanels(){PANELS.forEach(p=>G(p).classList.remove('open'));G('iBEQ')?.classList.remove('on');}
document.addEventListener('click',e=>{
  if(PANELS.every(p=>!G(p).contains(e.target))&&
     !['iBEQ','iBxf','iBSl','psEQ','psXF','psSl'].some(id=>G(id)?.contains(e.target)))
    closeAllPanels();
});

/* ═══ GENRE ═══════════════════════════════════════════ */
async function loadGenre(key,chip){
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));chip?.classList.add('on');
  const cfg=CHIPS.find(c=>c[0]===key);if(!cfg)return;
  SI('hTit',cfg[2]); const wrap=G('hCards'); spin(wrap);
  try{
    if(!cache[key])cache[key]=await fetchTracks(cfg[3],20);
    renderCards(cache[key],wrap,cache[key]);
  }catch{empt(wrap,'wifi_off','Could not load. Check your connection.');}
}

/* ═══ SEARCH ══════════════════════════════════════════ */
let stmr, lastSQ='';
G('sIn').addEventListener('input',function(){
  const q=this.value.trim();
  G('srchClr').classList.toggle('vis',!!q);
  if(!q)return; clearTimeout(stmr); stmr=setTimeout(()=>doSearch(q),380);
  if(q!==lastSQ)goNav('sv',null);
});
G('sIn').addEventListener('keydown',function(e){if(e.key==='Enter'){clearTimeout(stmr);doSearch(this.value.trim());}});
G('srchClr').addEventListener('click',()=>{G('sIn').value='';G('srchClr').classList.remove('vis');lastSQ='';G('sIn').focus();});

async function doSearch(q){
  if(!q||q===lastSQ)return; lastSQ=q;
  SI('sTit',`"${q}"`); G('sEmpty').style.display='none';
  const wrap=G('sList'); spin(wrap);
  try{
    const data=await searchAll(q); wrap.innerHTML=''; let found=false;
    // Songs
    if(data.tracks?.length){
      found=true;
      wrap.appendChild(mkSec('Songs','p-sv','JioSaavn'));
      const tl=document.createElement('div');tl.className='tl';wrap.appendChild(tl);
      renderTL(data.tracks,tl,null,data.tracks);
    }
    // Albums
    if(data.albums?.length){
      found=true;
      wrap.appendChild(mkSec('Albums','p-al','Albums','14px'));
      const g=mkGrid();wrap.appendChild(g);
      data.albums.forEach(a=>{
        const d=document.createElement('div');d.className='scard';
        d.innerHTML=`<span class="scard-badge alb">Album</span><img class="scard-img" src="${ESC(a.image)}" loading="lazy"><div class="scard-nm">${ESC(a.title)}</div><div class="scard-sub">${ESC(a.artist||a.year||'')}</div>`;
        d.addEventListener('click',()=>{toast('Loading album…');fetchTracks(a.title+' '+a.artist,15).then(t=>{if(t.length){Q=t;qi=0;play(Q[0]);renderQ();}else toast('No tracks found');});});
        g.appendChild(d);
      });
    }
    // Artists
    if(data.artists?.length){
      found=true;
      wrap.appendChild(mkSec('Artists','p-ar','Artists','14px'));
      const g=mkGrid();wrap.appendChild(g);
      data.artists.forEach(a=>{
        const d=document.createElement('div');d.className='scard';
        d.innerHTML=`<span class="scard-badge art">Artist</span><img class="scard-img circle" src="${ESC(a.image)}" loading="lazy"><div class="scard-nm">${ESC(a.title)}</div>`;
        d.addEventListener('click',()=>{toast('Loading artist…');fetchTracks(a.title,20).then(t=>{if(t.length){Q=t;qi=0;play(Q[0]);renderQ();}else toast('No tracks found');});});
        g.appendChild(d);
      });
    }
    if(!found)G('sEmpty').style.display='flex';
  }catch{empt(wrap,'wifi_off','Search failed.');}
}
function mkSec(title,pill,pillTxt,mt=''){
  const d=document.createElement('div');d.className='sec';d.style.marginTop=mt;
  d.innerHTML=`<div class="sec-title">${title}</div><span class="pill ${pill}">${pillTxt}</span>`;return d;
}
function mkGrid(){const d=document.createElement('div');d.className='cards';d.style.marginBottom='6px';return d;}

/* ═══ TRENDING ════════════════════════════════════════ */
let trendTracks=[];
async function renderTrending(){
  if(trendTracks.length){renderReelCards(trendTracks,G('reelRow'));renderTL(trendTracks,G('reelList'),null,trendTracks);return;}
  spin(G('reelRow'));spin(G('reelList'));
  try{
    const res=await Promise.all(TRENDING_Q.map(q=>fetchTracks(q,3)));
    trendTracks=res.flatMap(r=>r.slice(0,2)).filter((t,i,a)=>a.findIndex(x=>x.id===t.id)===i).slice(0,16);
    renderReelCards(trendTracks,G('reelRow'));
    renderTL(trendTracks,G('reelList'),null,trendTracks);
  }catch{empt(G('reelRow'),'wifi_off','No connection');G('reelList').innerHTML='';}
}

/* ═══ LIBRARY ════════════════════════════════════════ */
function renderLibrary(){
  G('plvHome').style.display='block'; G('plvDetail').style.display='none';
  const wrap=G('libGrid');wrap.innerHTML='';
  // Add button
  const add=document.createElement('div');add.className='plc plc-add';
  add.innerHTML=`<span class="mi">add</span><span class="plc-add-lbl">New Playlist</span>`;
  add.onclick=openNewPl; wrap.appendChild(add);
  // Each playlist
  playlists.forEach(pl=>{
    const d=document.createElement('div');d.className='plc';
    d.innerHTML=`<div class="plc-ic" style="background:linear-gradient(${pl.color})"><span class="mi">${pl.icon}</span></div><div class="plc-nm">${ESC(pl.name)}</div><div class="plc-cnt">${pl.tracks.length} songs</div>`;
    d.addEventListener('click',()=>renderPlDetail(pl.id));
    wrap.appendChild(d);
  });
}
function renderPlDetail(plId){
  curPlId=plId;
  const pl=playlists.find(p=>p.id===plId);if(!pl)return;
  G('plvHome').style.display='none';G('plvDetail').style.display='block';
  G('plDIc').style.background=`linear-gradient(${pl.color})`;
  G('plDIcIc').textContent=pl.icon;
  G('plDNm').textContent=pl.name;
  G('plDSub').textContent=`${pl.tracks.length} songs`;
  const dl=G('plDList'); renderTL(pl.tracks,dl,pl.id,pl.tracks);
  G('plDEmpty').style.display=pl.tracks.length?'none':'flex';
}
function backToLib(){G('plvDetail').style.display='none';G('plvHome').style.display='block';renderLibrary();curPlId=null;}
function playPlDetail(){const pl=playlists.find(p=>p.id===curPlId);if(pl?.tracks.length){Q=pl.tracks.slice();qi=0;play(Q[0]);renderQ();}}
function deleteFromPlDetail(){
  if(curPlId==='p0'){toast("Can't delete default playlist");return;}
  playlists=playlists.filter(p=>p.id!==curPlId);savePls();backToLib();toast('Playlist deleted');
}

/* ═══ NEW PLAYLIST ════════════════════════════════════ */
let newPl={icon:PL_ICONS[0],color:PL_COLORS[0]};
function openNewPl(){
  G('newPlName').value='';
  G('newPlIcGrid').innerHTML=PL_ICONS.map((ic,i)=>
    `<div class="ic-opt${i===0?' on':''}" data-i="${i}" onclick="selPlIc(this,'${ic}',${i})"><span class="mi" style="font-size:15px;color:#fff">${ic}</span></div>`
  ).join('');
  G('newPlIcGrid').querySelectorAll('.ic-opt').forEach((el,i)=>{
    el.style.background=`linear-gradient(${PL_COLORS[i%PL_COLORS.length]})`;
  });
  newPl={icon:PL_ICONS[0],color:PL_COLORS[0]};
  openModal('newPlOv'); setTimeout(()=>G('newPlName').focus(),120);
}
function selPlIc(el,icon,i){
  document.querySelectorAll('.ic-opt').forEach(e=>e.classList.remove('on'));
  el.classList.add('on'); newPl.icon=icon; newPl.color=PL_COLORS[i%PL_COLORS.length];
}
function createPlaylist(){
  const nm=G('newPlName').value.trim();if(!nm){toast('Enter a name');return;}
  playlists.push({id:'p'+Date.now(),name:nm,icon:newPl.icon,color:newPl.color,tracks:[]});
  savePls(); closeModal('newPlOv'); renderLibrary(); toast(`"${nm}" created 🎵`);
}

/* ═══ ADD TO PLAYLIST ════════════════════════════════ */
let atpTrack=null;
function showATP(t){
  atpTrack=t;
  G('atpList').innerHTML=playlists.map(pl=>
    `<div class="atp-item" onclick="addToPlaylist('${pl.id}')">
      <div class="atp-ic" style="background:linear-gradient(${pl.color})"><span class="mi" style="font-size:13px;color:#fff">${pl.icon}</span></div>
      ${ESC(pl.name)}<span style="margin-left:auto;font-size:.6rem;color:var(--t3)">${pl.tracks.length}</span>
    </div>`
  ).join('');
  openModal('atpOv');
}
function addToPlaylist(plId){
  const pl=playlists.find(p=>p.id===plId);if(!pl||!atpTrack)return;
  if(pl.tracks.some(t=>t.id===atpTrack.id)){toast('Already in playlist');closeModal('atpOv');return;}
  pl.tracks.push(atpTrack);savePls();closeModal('atpOv');toast(`Added to "${pl.name}" ❤`);atpTrack=null;
}
function quickSave(){if(!cur){toast('Nothing playing');return;}showATP(cur);}

/* ═══ LIKED / RECENT ═════════════════════════════════ */
function renderLk(){SI('lkCnt',liked.length?`· ${liked.length} songs`:'');G('lkEmpty').style.display=liked.length?'none':'flex';liked.length?renderTL(liked,G('lkList'),null,liked):(G('lkList').innerHTML='');}
function renderRec(){G('recEmpty').style.display=recent.length?'none':'flex';recent.length?renderTL(recent,G('recList'),null,recent):(G('recList').innerHTML='');}
function toggleLike(){if(!cur)return;const idx=liked.findIndex(l=>l.id===cur.id);if(idx>=0){liked.splice(idx,1);toast('Unliked');}else{liked.unshift(cur);toast('Liked ❤');}saveLk();updateLikeBtn();}
function updateLikeBtn(){if(!cur)return;const on=liked.some(l=>l.id===cur.id);['pbLk','mLk','psLk'].forEach(id=>{const b=G(id);if(!b)return;b.classList.toggle('on',on);b.querySelector('.mi').textContent=on?'favorite':'favorite_border';});}
function playLiked(){if(liked.length){Q=liked.slice();qi=0;play(Q[0]);renderQ();}}
function pushRecent(t){recent=recent.filter(r=>r.id!==t.id);recent.unshift(t);if(recent.length>50)recent.length=50;saveRc();}
function clearQ(){Q=[];qi=-1;renderQ();toast('Queue cleared');}

/* ═══ EQ ══════════════════════════════════════════════ */
let eqBuilt=false,eqOn=true;
function buildEQ(){
  if(eqBuilt)return;eqBuilt=true;
  const w=G('eqBands');w.innerHTML='';
  EQ_LABELS.forEach((lbl,i)=>{
    const d=document.createElement('div');d.className='eq-band';
    d.innerHTML=`<span class="eq-val" id="ev${i}">0dB</span><input type="range" class="eq-rng" id="er${i}" min="-12" max="12" value="0" step="0.5"><span class="eq-freq">${lbl}</span>`;
    w.appendChild(d);
    d.querySelector('input').addEventListener('input',function(){setBand(i,+this.value);clearPre();});
  });
}
function setBand(i,v){const l=G(`ev${i}`);if(l)l.textContent=(v>0?'+':'')+v.toFixed(0)+'dB';if(filters[i]&&eqOn)filters[i].gain.value=v;}
function applyPreset(n){EQ_PRESETS[n]?.forEach((v,i)=>{const s=G(`er${i}`);if(s){s.value=v;setBand(i,v);}});document.querySelectorAll('.eq-p').forEach(p=>p.classList.toggle('on',p.dataset.p===n));}
function clearPre(){document.querySelectorAll('.eq-p').forEach(p=>p.classList.remove('on'));}
function toggleEQOn(){eqOn=!eqOn;G('eqTog').classList.toggle('on',eqOn);filters.forEach((f,i)=>f.gain.value=eqOn?+(G(`er${i}`)?.value||0):0);toast(eqOn?'EQ on':'EQ off');}

/* ═══ MODALS ══════════════════════════════════════════ */
const openModal =id=>G(id).classList.add('open');
const closeModal=id=>G(id).classList.remove('open');

/* ═══ TOAST ═══════════════════════════════════════════ */
let ttmr;
function toast(msg){G('toastTxt').textContent=msg;G('toast').classList.add('show');clearTimeout(ttmr);ttmr=setTimeout(()=>G('toast').classList.remove('show'),2500);}

/* ═══ PWA ═════════════════════════════════════════════ */
let dPr=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();dPr=e;G('btnInstall').classList.add('vis');});
G('btnInstall').addEventListener('click',async()=>{if(!dPr)return;dPr.prompt();const{outcome}=await dPr.userChoice;if(outcome==='accepted')G('btnInstall').classList.remove('vis');dPr=null;});
window.addEventListener('appinstalled',()=>{G('btnInstall').classList.remove('vis');toast('App installed! 🎉');});
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js');

/* ═══ BOOT ════════════════════════════════════════════ */
loadGenre('bollywood',chipsEl.firstChild);
renderQ();
