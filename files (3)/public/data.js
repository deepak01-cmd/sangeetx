'use strict';

const CHIPS = [
  ['bollywood',  'movie',          'Bollywood',   'bollywood hits 2024'],
  ['arijit',     'mic',            'Arijit',      'arijit singh best songs'],
  ['punjabi',    'music_note',     'Punjabi',     'punjabi hits diljit 2024'],
  ['apd',        'star',           'AP Dhillon',  'ap dhillon'],
  ['tamil',      'graphic_eq',     'Tamil',       'tamil hits anirudh 2024'],
  ['telugu',     'graphic_eq',     'Telugu',      'telugu hits sid sriram'],
  ['hiphop',     'headphones',     'Desi Rap',    'divine emiway bantai rap'],
  ['lofi',       'nightlight',     'Lofi',        'lofi hindi chill beats'],
  ['romantic',   'favorite',       'Romantic',    'romantic hindi love songs'],
  ['bhangra',    'celebration',    'Bhangra',     'bhangra punjabi dance hits'],
  ['90s',        'history',        '90s Hits',    'bollywood 90s golden hits'],
  ['party',      'local_bar',      'Party',       'party dance bollywood hits'],
];
const TRENDING_Q = [
  'kesariya arijit','brown munde ap dhillon','naatu naatu','srivalli pushpa',
  'raataan lambiyan','tum hi ho arijit','hawayein ae dil','chaleya jawan',
];
const NAV_ITEMS = [
  ['home',  'home',          'Home'],
  ['sv',    'search',        'Search'],
  ['rv',    'trending_up',   'Hot'],
  ['plv',   'library_music', 'Library'],
  ['lkv',   'favorite',      'Liked'],
];
const EQ_PRESETS = {
  Flat:[0,0,0,0,0,0,0,0], Bass:[8,6,4,1,0,-1,-2,-3], Vocal:[-2,-1,0,3,5,4,2,0],
  Treble:[-3,-2,-1,0,1,3,6,8], Rock:[5,3,1,0,-1,2,4,5], Jazz:[3,2,1,2,-1,-1,0,2],
  Pop:[2,1,0,-1,-2,-1,1,2], Classical:[0,0,0,0,0,0,-3,-5],
};
const EQ_BANDS  = [60,170,310,600,1000,3000,6000,12000];
const EQ_LABELS = ['60Hz','170','310','600','1k','3k','6k','12k'];
const PL_ICONS  = ['favorite','music_note','headphones','local_fire_department','nightlight','star','celebration','album','radio','beach_access'];
const PL_COLORS = ['135deg,#e8175d,#ff6b9d','135deg,#7c3aed,#a78bfa','135deg,#0ea5e9,#06b6d4',
                   '135deg,#f59e0b,#ef4444','135deg,#10b981,#06d6a0','135deg,#ec4899,#f43f5e',
                   '135deg,#f97316,#fbbf24','135deg,#6366f1,#8b5cf6'];

// ── API — calls Vercel serverless functions at /api/* ─────────────
async function fetchTracks(query, limit = 20) {
  const r = await fetch(`/api/search?query=${encodeURIComponent(query)}&limit=${limit}&type=songs`);
  if (!r.ok) throw new Error('API ' + r.status);
  return (await r.json()).tracks || [];
}

async function searchAll(query) {
  const r = await fetch(`/api/search?query=${encodeURIComponent(query)}&type=all`);
  if (!r.ok) throw new Error('API ' + r.status);
  return await r.json();
}

async function fetchLyrics(songId) {
  const r = await fetch(`/api/lyrics?id=${encodeURIComponent(songId)}`);
  if (!r.ok) return null;
  return (await r.json()).lyrics || null;
}
