'use strict';

// Genre chips: [key, icon, label, searchQuery]
const CHIPS = [
  ['bollywood',  'movie',       'Bollywood',  'bollywood hits 2024'],
  ['arijit',     'mic',         'Arijit',     'arijit singh best songs'],
  ['punjabi',    'music_note',  'Punjabi',    'punjabi hits diljit ap dhillon'],
  ['ap_dhillon', 'star',        'AP Dhillon', 'ap dhillon'],
  ['tamil',      'graphic_eq',  'Tamil',      'tamil hits anirudh 2024'],
  ['telugu',     'graphic_eq',  'Telugu',     'telugu hits sid sriram'],
  ['hiphop',     'headphones',  'Desi Rap',   'divine emiway bantai rap'],
  ['lofi',       'nightlight',  'Lofi',       'lofi hindi chill'],
  ['romantic',   'favorite',    'Romantic',   'romantic hindi love songs'],
  ['bhangra',    'celebration', 'Bhangra',    'bhangra punjabi dance hits'],
];

const TRENDING_QUERIES = [
  'kesariya','brown munde','naatu naatu','srivalli',
  'raataan lambiyan','tum hi ho','hawayein','chaleya',
];

const NAV = [
  ['home','home','Home'],
  ['sv','search','Search'],
  ['rv','trending_up','Trending'],
  ['plv','playlist_play','Playlist'],
  ['lkv','favorite','Liked'],
];

const EQ_PRESETS = {
  Flat:     [0,0,0,0,0,0,0,0],
  Bass:     [8,6,4,1,0,-1,-2,-3],
  Vocal:    [-2,-1,0,3,5,4,2,0],
  Treble:   [-3,-2,-1,0,1,3,6,8],
  Rock:     [5,3,1,0,-1,2,4,5],
  Jazz:     [3,2,1,2,-1,-1,0,2],
};
const EQ_FREQS = ['60Hz','170','310','600','1kHz','3k','6k','12k'];

/* ─────────────────────────────────────────────
   API layer — calls our own Netlify function
   which proxies JioSaavn server-side.
   • No CORS issues (same origin)
   • No third-party proxy needed
   • Full 320kbps songs
───────────────────────────────────────────── */
async function fetchTracks(query, limit = 20) {
  const url = `/api?action=search&query=${encodeURIComponent(query)}&limit=${limit}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

async function fetchById(id) {
  const url = `/api?action=song&id=${encodeURIComponent(id)}`;
  const res  = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data || null;
}
