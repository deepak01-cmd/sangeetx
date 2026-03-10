// Vercel Serverless Function — /api/search
// Proxies JioSaavn search server-side with automatic fallback endpoints

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const BASES = [
  'https://saavn.dev',
  'https://jiosaavn-api-privatecvc2.vercel.app',
];

async function saavnFetch(path, ms = 9000) {
  for (const base of BASES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      const r = await fetch(base + path, { signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok) continue;
      const d = await r.json();
      if (d) return d;
    } catch {}
  }
  return null;
}

function parseSongs(data) {
  return (data?.data?.results || data?.results || [])
    .filter(r => r.downloadUrl?.length)
    .map(r => {
      const dl   = r.downloadUrl || [];
      const imgs = r.image || [];
      return {
        id:       r.id,
        title:    r.name || r.title || '',
        artist:   (r.artists?.primary || []).map(a => a.name).join(', ') || r.artists?.all?.[0]?.name || '',
        album:    r.album?.name || r.album || '',
        duration: parseInt(r.duration) || 0,
        image:    (imgs.find(i => i.quality === '500x500') || imgs.find(i => i.quality === '150x150') || imgs[imgs.length - 1])?.url || '',
        audio:    (dl.find(d => d.quality === '320kbps') || dl.find(d => d.quality === '160kbps') || dl.find(d => d.quality === '96kbps') || dl[dl.length - 1])?.url || '',
      };
    })
    .filter(t => t.audio);
}

function parseAlbums(data) {
  return (data?.data?.results || []).map(r => ({
    id:     r.id,
    title:  r.name || '',
    type:   'album',
    artist: (r.artists?.primary || []).map(a => a.name).join(', ') || '',
    year:   r.year || '',
    image:  (r.image || []).find(i => i.quality === '500x500')?.url || (r.image || [])[0]?.url || '',
  }));
}

function parseArtists(data) {
  return (data?.data?.results || []).map(r => ({
    id:    r.id,
    title: r.name || '',
    type:  'artist',
    image: (r.image || []).find(i => i.quality === '500x500')?.url || (r.image || [])[0]?.url || '',
  }));
}

// ── Vercel handler ────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  const { query = '', type = 'songs', limit = '20' } = req.query;
  const lim = Math.min(parseInt(limit) || 20, 40);

  if (!query) {
    res.status(200).json({ tracks: [], albums: [], artists: [] });
    return;
  }

  if (type === 'all') {
    const [sd, ad, ard] = await Promise.all([
      saavnFetch(`/api/search/songs?query=${encodeURIComponent(query)}&limit=10`),
      saavnFetch(`/api/search/albums?query=${encodeURIComponent(query)}&limit=6`),
      saavnFetch(`/api/search/artists?query=${encodeURIComponent(query)}&limit=5`),
    ]);
    res.status(200).json({
      tracks:  sd  ? parseSongs(sd)   : [],
      albums:  ad  ? parseAlbums(ad)  : [],
      artists: ard ? parseArtists(ard): [],
    });
    return;
  }

  // songs only
  const data   = await saavnFetch(`/api/search/songs?query=${encodeURIComponent(query)}&limit=${lim}`);
  const tracks = data ? parseSongs(data) : [];
  res.status(tracks.length ? 200 : 502).json({ tracks });
}
