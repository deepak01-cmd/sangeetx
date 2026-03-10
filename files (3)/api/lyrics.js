// Vercel Serverless Function — /api/lyrics

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const BASES = [
  'https://saavn.dev',
  'https://jiosaavn-api-privatecvc2.vercel.app',
];

async function saavnFetch(path, ms = 6000) {
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  const { id = '' } = req.query;
  if (!id) { res.status(200).json({ lyrics: null }); return; }

  const data   = await saavnFetch(`/api/songs/${encodeURIComponent(id)}/lyrics`);
  const lyrics = data?.data?.lyrics || data?.lyrics || null;
  res.status(200).json({ lyrics });
}
