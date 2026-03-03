'use strict';
const G   = id => document.getElementById(id);
const SI  = (id, v) => { const e = G(id); if (e) e.textContent = v; };
const FMT = s => { s = Math.floor(s||0); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
const ESC = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ════════════════════════════════════════
   AUDIO ENGINE
   Source : JioSaavn API (saavn.dev)
   Audio  : HTML5 <audio> — full songs, 320kbps
   No YouTube, no IFrame, no previews.
════════════════════════════════════════ */
const audio = new Audio();
audio.crossOrigin = 'anonymous';
audio.preload = 'none';

// Web Audio EQ (optional — lazily initialised on first EQ open)
let actx, eqSrc, gainNode, filters = [], eqReady = false;
function initEQ() {
  if (eqReady) return;
  try {
    actx     = new (window.AudioContext || window.webkitAudioContext)();
    eqSrc    = actx.createMediaElementSource(audio);
    gainNode = actx.createGain();
    EQ_FREQS.forEach((_, i) => {
      const f = actx.createBiquadFilter();
      f.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
      f.frequency.value = [60,170,310,600,1000,3000,6000,12000][i];
      f.gain.value = 0; f.Q.value = 1;
      filters.push(f);
    });
    [eqSrc, ...filters, gainNode].reduce((a, b) => (a.connect(b), b));
    gainNode.connect(actx.destination);
    eqReady = true;
  } catch (e) { console.warn('Web Audio unavailable'); }
}

/* ═══ STATE ═══ */
let Q=[], qi=-1, cur=null, isPlaying=false, isShuf=false, isRep=false;
let playlist = JSON.parse(localStorage.getItem('sx_pl') || '[]');
let liked    = JSON.parse(localStorage.getItem('sx_lk') || '[]');
let recent   = JSON.parse(localStorage.getItem('sx_rc') || '[]');
const cache  = {};   // key → tracks[]

/* ═══ BUILD DYNAMIC UI FROM DATA ═══ */
// Genre chips
const chipsEl = G('chipsEl');
CHIPS.forEach(([key, icon, label], i) => {
  const d = document.createElement('div');
  d.className = `chip${i === 0 ? ' on' : ''}`;
  d.innerHTML = `<span class="mi">${icon}</span>${label}`;
  d.onclick = () => loadGenre(key, d);
  chipsEl.appendChild(d);
});

// Mobile nav
G('mobNavRow').innerHTML = NAV.map(([vid, icon, label], i) =>
  `<div class="mob-ni${i===0?' on':''}" onclick="mNavClick(this,'${vid}')">
    <div class="mob-ni-bg"><span class="mi">${icon}</span></div>
    <span class="lbl">${label}</span>
  </div>`
).join('');

// EQ preset buttons
G('eqPres').innerHTML = Object.keys(EQ_PRESETS).map(name =>
  `<div class="eq-p${name==='Flat'?' on':''}" data-p="${name}" onclick="applyPreset('${name}')">${name}</div>`
).join('');

/* ═══ AUDIO EVENTS ═══ */
audio.addEventListener('play',         () => setPlayUI(true));
audio.addEventListener('pause',        () => setPlayUI(false));
audio.addEventListener('ended',        () => isRep ? (audio.currentTime=0, audio.play()) : nextT());
audio.addEventListener('timeupdate',   updateProgress);
audio.addEventListener('loadeddata',   () => SI('npStat', 'Now Playing'));
audio.addEventListener('waiting',      () => SI('npStat', 'Buffering…'));
audio.addEventListener('error',        () => { toast('Stream error — trying next'); setTimeout(nextT, 1000); });
audio.volume = 0.8;

/* ═══ PLAY ═══ */
async function play(t) {
  if (!t) return;
  // If stored track has no audio URL (liked/recent from old session), reload it
  if (!t.audio) {
    toast('Loading…');
    const fresh = await fetchById(t.id).catch(() => null);
    if (!fresh) { toast('Could not load track'); nextT(); return; }
    t = fresh;
    // Update in Q
    if (Q[qi]) Q[qi] = t;
  }
  cur = t;
  audio.src = t.audio;
  audio.load();
  audio.play().catch(() => {}); // autoplay blocked → user taps play
  SI('npStat', 'Loading…');
  updateAllUI(t);
  pushRecent(t);
  updateLikeBtn();
  refreshRows();
}

function setPlayUI(s) {
  isPlaying = s;
  const ic = s ? 'pause' : 'play_arrow';
  ['pbIcon','mIcon','psIcon'].forEach(id => { const e=G(id); if(e) e.textContent=ic; });
  G('psArt')?.classList.toggle('playing', s);
  G('npWave').style.display = s ? 'flex' : 'none';
}

function togglePlay() {
  if (!cur) { toast('Pick a song first!'); return; }
  isPlaying ? audio.pause() : audio.play().catch(() => {});
}

function nextT() {
  if (!Q.length) return;
  qi = isShuf ? Math.floor(Math.random() * Q.length) : (qi + 1) % Q.length;
  play(Q[qi]); renderQ();
}
function prevT() {
  if (!Q.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  qi = (qi - 1 + Q.length) % Q.length;
  play(Q[qi]); renderQ();
}

function updateProgress() {
  const c = audio.currentTime || 0, d = audio.duration || 0;
  const pct = d ? (c / d * 100) + '%' : '0%';
  ['pFill','npFill','psFill'].forEach(id => { const e=G(id); if(e) e.style.width=pct; });
  G('mFill').style.width = pct;
  ['tC','npCur','psC'].forEach(id => SI(id, FMT(c)));
  ['tD','npDur','psD'].forEach(id => SI(id, d ? FMT(d) : '—'));
}

function seek(f)      { if (audio.duration) audio.currentTime = Math.max(0,Math.min(1,f)) * audio.duration; }
function seekBar(e)   { seek((e.clientX - document.querySelector('.pb-bar').getBoundingClientRect().left) / document.querySelector('.pb-bar').getBoundingClientRect().width); }
function seekHero(e)  { const r=G('npProgW').getBoundingClientRect(); seek((e.clientX-r.left)/r.width); }
function seekSheet(e) { const r=G('psBarW').getBoundingClientRect(); seek((e.clientX-r.left)/r.width); }

function setVol(v) {
  audio.volume = v / 100;
  const ic = v > 50 ? 'volume_up' : v > 0 ? 'volume_down' : 'volume_off';
  ['volIc','psVI'].forEach(id => { const e=G(id); if(e) e.querySelector('.mi').textContent=ic; });
  G('volSl').value = v; const pv=G('psVol'); if(pv) pv.value=v;
}
function muteT() {
  audio.muted = !audio.muted;
  ['volIc','psVI'].forEach(id => { const e=G(id); if(e) e.querySelector('.mi').textContent = audio.muted ? 'volume_off' : 'volume_up'; });
}
function toggleShuffle() {
  isShuf = !isShuf;
  ['iBsh','ctSh','psSh'].forEach(id => G(id)?.classList.toggle('on', isShuf));
  toast(isShuf ? 'Shuffle on 🔀' : 'Shuffle off');
}
function toggleRepeat() {
  isRep = !isRep;
  ['iBrp','ctRp','psRp'].forEach(id => G(id)?.classList.toggle('on', isRep));
  toast(isRep ? 'Repeat on 🔁' : 'Repeat off');
}

/* ═══ UI UPDATES ═══ */
function updateAllUI(t) {
  ['pbTit','mTit','npTit','psTit'].forEach(id => SI(id, t.title));
  ['pbArt','mSub','npArt2','psArt2'].forEach(id => SI(id, t.artist));
  updateArt(t.image);
}
function updateArt(img) {
  G('pbIW').innerHTML = img
    ? `<img class="pb-img" src="${ESC(img)}">`
    : `<div class="pb-iph"><span class="mi">music_note</span></div>`;
  G('mAW').innerHTML = img
    ? `<img src="${ESC(img)}">`
    : `<div class="mob-aw-ph"><span class="mi">music_note</span></div>`;
  const nh = G('npArt');
  if (nh) nh.outerHTML = img
    ? `<img class="np-thumb" id="npArt" src="${ESC(img)}">`
    : `<div class="np-ph" id="npArt"><span class="mi">music_note</span></div>`;
  const pa = G('psArt');
  if (pa) pa.outerHTML = img
    ? `<img class="ps-art${isPlaying?' playing':''}" id="psArt" src="${ESC(img)}">`
    : `<div class="ps-art-ph" id="psArt"><span class="mi">music_note</span></div>`;
  const bg = G('psBg');
  if (bg && img) bg.style.backgroundImage = `url(${img})`;
}

const waveHTML = () =>
  `<span style="display:inline-flex;align-items:center;gap:2px;height:13px">${
    [0,.1,.2,.3,.4].map((d,j) =>
      `<span style="width:2.5px;border-radius:2px;background:var(--r);animation:wv 1.2s ease-in-out ${d}s infinite;height:${['30%','80%','100%','60%','85%'][j]}"></span>`
    ).join('')}</span>`;

const showSpinner = el => el.innerHTML = `<div class="spinner"><div class="spin"></div></div>`;
const showEmpty   = (el, icon, msg) => el.innerHTML = `<div class="empty"><span class="mi">${icon}</span><p>${msg}</p></div>`;

/* ═══ RENDER HELPERS ═══ */
function renderCards(tracks, wrap, list) {
  wrap.innerHTML = '';
  if (!tracks.length) { showEmpty(wrap, 'music_off', 'No tracks found'); return; }
  tracks.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `
      <div class="cart-w">
        <img class="cart" src="${ESC(t.image)}" loading="lazy" onerror="this.src=''">
        <button class="cplay"><span class="mi">play_arrow</span></button>
      </div>
      <div class="ctit">${ESC(t.title)}</div>
      <div class="csub">${ESC(t.artist)}</div>`;
    d.addEventListener('click', () => startList(list, i));
    d.querySelector('.cplay').addEventListener('click', e => { e.stopPropagation(); startList(list, i); });
    wrap.appendChild(d);
  });
}

function renderReelCards(tracks, wrap) {
  wrap.innerHTML = '';
  tracks.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'rcard';
    d.innerHTML = `
      <div class="rthumb">
        <img class="rimg" src="${ESC(t.image)}" loading="lazy">
        <div class="rgrad"></div>
        <div class="rplay"><span class="mi">play_arrow</span></div>
        <div class="rtag">HOT</div>
        <div class="rbot"><div class="rname">${ESC(t.title)}</div><div class="rby">${ESC(t.artist)}</div></div>
      </div>
      <div class="rlbl">${ESC(t.title)}</div>
      <div class="rsub">${ESC(t.artist)}</div>`;
    d.addEventListener('click', () => startList(tracks, i));
    wrap.appendChild(d);
  });
}

function renderTL(tracks, wrap, plMode, list) {
  wrap.innerHTML = '';
  if (!tracks.length) { showEmpty(wrap, 'music_off', 'No tracks'); return; }
  tracks.forEach((t, i) => {
    const isNow = cur?.id === t.id;
    const inPl  = playlist.some(p => p.id === t.id);
    const inLk  = liked.some(l => l.id === t.id);
    const row   = document.createElement('div');
    row.className = `tr${isNow ? ' now' : ''}`;
    row.innerHTML = `
      <span class="tr-n">${isNow ? waveHTML() : i+1}</span>
      <img class="tr-img" src="${ESC(t.image)}" loading="lazy">
      <div class="tr-info">
        <div class="tr-tit">${ESC(t.title)}</div>
        <div class="tr-meta">${ESC(t.artist)}${t.album ? ' · ' + ESC(t.album) : ''}</div>
      </div>
      <span class="tr-dur">${FMT(t.duration)}</span>
      <div class="tr-acts">
        ${plMode
          ? `<button class="tact trm" title="Remove"><span class="mi">remove_circle_outline</span></button>`
          : `<button class="tact tadd${inPl?' liked':''}" title="Add to playlist"><span class="mi">${inPl?'playlist_add_check':'playlist_add'}</span></button>`
        }
        <button class="tact tq" title="Queue"><span class="mi">add_to_queue</span></button>
        <button class="tact tlk${inLk?' liked':''}" title="Like"><span class="mi">${inLk?'favorite':'favorite_border'}</span></button>
      </div>`;
    row.addEventListener('click', e => {
      if (e.target.closest('.tact')) return;
      const ref = list || tracks;
      Q = ref.slice(); qi = ref.findIndex(x => x.id === t.id);
      if (qi < 0) qi = 0;
      play(Q[qi]); renderQ(); refreshRows();
    });
    if (plMode) {
      row.querySelector('.trm').addEventListener('click', e => {
        e.stopPropagation(); playlist = playlist.filter(p => p.id !== t.id); savePl(); renderPl(); toast('Removed');
      });
    } else {
      row.querySelector('.tadd').addEventListener('click', e => {
        e.stopPropagation();
        if (playlist.some(p => p.id === t.id)) { toast('Already in playlist'); return; }
        playlist.push(t); savePl();
        e.currentTarget.querySelector('.mi').textContent = 'playlist_add_check';
        e.currentTarget.classList.add('liked');
        toast(`Added: ${t.title}`);
      });
    }
    row.querySelector('.tq').addEventListener('click', e => {
      e.stopPropagation();
      if (!Q.find(q => q.id === t.id)) Q.push(t);
      renderQ(); toast('Queued');
    });
    row.querySelector('.tlk').addEventListener('click', e => {
      e.stopPropagation();
      const btn = e.currentTarget, idx = liked.findIndex(l => l.id === t.id);
      if (idx >= 0) { liked.splice(idx, 1); btn.querySelector('.mi').textContent='favorite_border'; btn.classList.remove('liked'); toast('Unliked'); }
      else          { liked.unshift(t);      btn.querySelector('.mi').textContent='favorite';        btn.classList.add('liked');    toast('Liked ❤'); }
      saveLk(); if (cur?.id === t.id) updateLikeBtn();
    });
    wrap.appendChild(row);
  });
}

function renderQ() {
  const el = G('qEl');
  if (!Q.length) {
    el.innerHTML = `<div class="empty" style="padding:14px 6px"><span class="mi" style="font-size:26px">queue_music</span><p style="font-size:.69rem">Queue empty</p></div>`;
    return;
  }
  const disp = [...Q.slice(qi), ...Q.slice(0, qi)].slice(0, 15);
  el.innerHTML = disp.map((t, j) => {
    const ri = (qi + j) % Q.length, isNow = ri === qi;
    return `<div class="sq-item${isNow?' now':''}" data-ri="${ri}">
      <img class="sq-art" src="${ESC(t.image)}">
      <div class="sq-info">
        <div class="sq-nm${isNow?' now':''}">${ESC(t.title)}</div>
        <div class="sq-by">${ESC(t.artist)}</div>
      </div>
      <button class="sq-rm" data-ri="${ri}"><span class="mi">close</span></button>
    </div>`;
  }).join('');
  el.querySelectorAll('.sq-item').forEach(row => {
    const ri = +row.dataset.ri;
    row.addEventListener('click', e => { if (!e.target.closest('.sq-rm')) { qi=ri; play(Q[ri]); renderQ(); } });
    row.querySelector('.sq-rm').addEventListener('click', e => {
      e.stopPropagation(); Q.splice(ri, 1); if (qi >= Q.length) qi = Math.max(0, Q.length-1); renderQ();
    });
  });
}

function startList(list, i) { Q = list.slice(); qi = i; play(Q[qi]); renderQ(); }
function refreshRows() {
  document.querySelectorAll('.tr').forEach((row, i) => {
    const title = row.querySelector('.tr-tit')?.textContent;
    const isNow = !!(cur && title === cur.title);
    row.classList.toggle('now', isNow);
    const ne = row.querySelector('.tr-n'); if (ne) ne.innerHTML = isNow ? waveHTML() : i + 1;
  });
}

/* ═══ NAVIGATION ═══ */
function goNav(id, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  G(id)?.classList.add('on');
  document.querySelectorAll('.sni').forEach(b => b.classList.remove('on'));
  btn?.classList.add('on');
  ({ plv:renderPl, recv:renderRec, lkv:renderLk, rv:renderTrending })[id]?.();
}
function mNavClick(el, id) {
  goNav(id, null);
  document.querySelectorAll('.mob-ni').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
}
function mNav(id, btn) { goNav(id, null); document.querySelectorAll('.mob-ni').forEach(b => b.classList.remove('on')); btn?.classList.add('on'); }

const openSheet  = () => G('pSheet').classList.add('open');
const closeSheet = () => G('pSheet').classList.remove('open');

// Swipe down to close
(() => {
  const sh = G('pSheet'); let sy = 0;
  sh.addEventListener('touchstart', e => sy = e.touches[0].clientY, { passive: true });
  sh.addEventListener('touchend',   e => { if (e.changedTouches[0].clientY - sy > 70) closeSheet(); });
})();

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space')      { e.preventDefault(); togglePlay(); }
  if (e.code === 'ArrowRight') nextT();
  if (e.code === 'ArrowLeft')  prevT();
  if (e.key  === 'l' || e.key === 'L') toggleLike();
});

/* ═══ GENRE LOADING ═══ */
async function loadGenre(key, chip) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  chip?.classList.add('on');
  const cfg = CHIPS.find(c => c[0] === key);
  if (!cfg) return;
  SI('hTit', cfg[2]);
  const wrap = G('hCards');
  showSpinner(wrap);
  try {
    if (!cache[key]) cache[key] = await fetchTracks(cfg[3], 20);
    renderCards(cache[key], wrap, cache[key]);
  } catch (e) {
    showEmpty(wrap, 'wifi_off', 'Could not load. Check your connection.');
  }
}

/* ═══ SEARCH ═══ */
let stmr;
G('sIn').addEventListener('input', function () {
  clearTimeout(stmr);
  const q = this.value.trim();
  if (!q) return;
  goNav('sv', null);
  stmr = setTimeout(() => doSearch(q), 400);
});
G('sIn').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { clearTimeout(stmr); doSearch(this.value.trim()); }
});
async function doSearch(q) {
  if (!q) return;
  SI('sTit', `"${q}"`);
  G('sEmpty').style.display = 'none';
  const wrap = G('sList');
  showSpinner(wrap);
  try {
    const tracks = await fetchTracks(q, 30);
    if (!tracks.length) { G('sEmpty').style.display = 'flex'; wrap.innerHTML = ''; return; }
    renderTL(tracks, wrap, false, tracks);
  } catch {
    showEmpty(wrap, 'wifi_off', 'Search failed. Check your connection.');
  }
}

/* ═══ TRENDING ═══ */
let trendTracks = [];
async function renderTrending() {
  if (trendTracks.length) {
    renderReelCards(trendTracks, G('reelRow'));
    renderTL(trendTracks, G('reelList'), false, trendTracks);
    return;
  }
  showSpinner(G('reelRow'));
  showSpinner(G('reelList'));
  try {
    const results = await Promise.all(TRENDING_QUERIES.map(q => fetchTracks(q, 3)));
    trendTracks = results.flatMap(r => r.slice(0, 2))
      .filter((t, i, a) => a.findIndex(x => x.id === t.id) === i)
      .slice(0, 16);
    renderReelCards(trendTracks, G('reelRow'));
    renderTL(trendTracks, G('reelList'), false, trendTracks);
  } catch {
    showEmpty(G('reelRow'), 'wifi_off', 'No connection');
    G('reelList').innerHTML = '';
  }
}

/* ═══ PLAYLIST / LIKED / RECENT ═══ */
const savePl = () => localStorage.setItem('sx_pl', JSON.stringify(playlist));
const saveLk = () => localStorage.setItem('sx_lk', JSON.stringify(liked));
const saveRc = () => localStorage.setItem('sx_rc', JSON.stringify(recent));

function saveToPl() { if (!cur) { toast('Nothing playing'); return; } if (playlist.some(p => p.id===cur.id)) { toast('Already saved'); return; } playlist.push(cur); savePl(); toast('Saved ❤'); }
function clearPl()  { playlist = []; savePl(); renderPl(); toast('Playlist cleared'); }
function playPl()   { if (playlist.length) { Q=playlist.slice(); qi=0; play(Q[0]); renderQ(); } }
function playLiked(){ if (liked.length)    { Q=liked.slice();    qi=0; play(Q[0]); renderQ(); } }
function clearQ()   { Q=[]; qi=-1; renderQ(); toast('Queue cleared'); }

function renderPl()  { SI('plCnt', playlist.length ? `${playlist.length} songs` : 'No songs yet'); G('plEmpty').style.display = playlist.length?'none':'flex'; playlist.length ? renderTL(playlist,G('plList'),true,playlist) : (G('plList').innerHTML=''); }
function renderRec() { G('recEmpty').style.display = recent.length?'none':'flex'; recent.length ? renderTL(recent,G('recList'),false,recent) : (G('recList').innerHTML=''); }
function renderLk()  { SI('lkCnt', liked.length ? `· ${liked.length} songs` : ''); G('lkEmpty').style.display = liked.length?'none':'flex'; liked.length ? renderTL(liked,G('lkList'),false,liked) : (G('lkList').innerHTML=''); }

function toggleLike() {
  if (!cur) return;
  const idx = liked.findIndex(l => l.id === cur.id);
  if (idx >= 0) { liked.splice(idx, 1); toast('Unliked'); }
  else          { liked.unshift(cur);   toast('Liked ❤'); }
  saveLk(); updateLikeBtn();
}
function updateLikeBtn() {
  if (!cur) return;
  const on = liked.some(l => l.id === cur.id);
  ['pbLk','mLk','psLk'].forEach(id => {
    const b = G(id); if (!b) return;
    b.classList.toggle('on', on);
    b.querySelector('.mi').textContent = on ? 'favorite' : 'favorite_border';
  });
}
function pushRecent(t) {
  recent = recent.filter(r => r.id !== t.id);
  recent.unshift(t);
  if (recent.length > 50) recent.length = 50;
  saveRc();
}

/* ═══ EQUALIZER ═══ */
let eqBuilt = false, eqEnabled = true;
function buildEQ() {
  if (eqBuilt) return; eqBuilt = true;
  const wrap = G('eqBands'); wrap.innerHTML = '';
  EQ_FREQS.forEach((f, i) => {
    const d = document.createElement('div'); d.className = 'eq-band';
    d.innerHTML = `<span class="eq-val" id="ev${i}">0dB</span><input type="range" class="eq-rng" id="er${i}" min="-12" max="12" value="0" step="0.5"><span class="eq-freq">${f}</span>`;
    wrap.appendChild(d);
    d.querySelector('input').addEventListener('input', function () { setBand(i, +this.value); clearPre(); });
  });
}
function setBand(i, v) {
  const l = G(`ev${i}`); if (l) l.textContent = (v>0?'+':'') + v.toFixed(0) + 'dB';
  if (filters[i] && eqEnabled) filters[i].gain.value = v;
}
function applyPreset(name) {
  EQ_PRESETS[name]?.forEach((v, i) => { const s=G(`er${i}`); if(s){s.value=v; setBand(i,v);} });
  document.querySelectorAll('.eq-p').forEach(p => p.classList.toggle('on', p.dataset.p === name));
}
function clearPre() { document.querySelectorAll('.eq-p').forEach(p => p.classList.remove('on')); }
function toggleEQOn() {
  eqEnabled = !eqEnabled;
  G('eqTog').classList.toggle('on', eqEnabled);
  filters.forEach((f, i) => f.gain.value = eqEnabled ? +(G(`er${i}`)?.value||0) : 0);
  toast(eqEnabled ? 'EQ enabled' : 'EQ bypassed');
}
function toggleEQ() {
  if (!eqReady) initEQ();
  actx?.state === 'suspended' && actx.resume();
  const p = G('eqPanel'), open = p.classList.toggle('open');
  G('iBEQ')?.classList.toggle('on', open);
  G('psEQ')?.classList.toggle('on', open);
  if (open) buildEQ();
}
document.addEventListener('click', e => {
  const p = G('eqPanel'), b = G('iBEQ');
  if (p?.classList.contains('open') && !p.contains(e.target) && !b?.contains(e.target)) {
    p.classList.remove('open'); b?.classList.remove('on');
  }
});

/* ═══ TOAST ═══ */
let ttmr;
function toast(msg) {
  G('toastTxt').textContent = msg;
  G('toast').classList.add('show');
  clearTimeout(ttmr); ttmr = setTimeout(() => G('toast').classList.remove('show'), 2500);
}

/* ═══ BOOT ═══ */
loadGenre('bollywood', chipsEl.firstChild);
renderQ();
