// Netlify serverless function — runs on server, no CORS issues
// Proxies JioSaavn's own internal API used by their website

const SAAVN = 'https://www.jiosaavn.com/api.php';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.jiosaavn.com/',
};

// Decrypt JioSaavn's obfuscated audio URL
function decrypt(url) {
  if (!url) return null;
  try {
    // JioSaavn encodes URLs in a simple cipher — decode from their format
    const decoded = Buffer.from(url, 'base64').toString('utf8');
    // Replace low quality with high quality
    return decoded
      .replace('_96.mp4', '_320.mp4')
      .replace('http://', 'https://');
  } catch {
    return url;
  }
}

// Normalise a song result from JioSaavn search
function normSong(s) {
  if (!s) return null;

  // Audio URL — JioSaavn returns encrypted_media_url
  const raw = s.more_info?.encrypted_media_url || s.encrypted_media_url;
  const audio = decrypt(raw);
  if (!audio) return null;

  // Image — pick 500x500 if available
  const img = (s.image || '').replace('150x150', '500x500').replace('50x50', '500x500').replace('http://', 'https://');

  // Artists
  const artists = s.more_info?.artistMap?.primary_artists?.map(a => a.name).join(', ')
    || s.primary_artists || s.singers || '';

  return {
    id:       s.id,
    title:    s.title || s.song || '',
    artist:   artists,
    album:    s.more_info?.album || s.album || '',
    duration: parseInt(s.more_info?.duration || s.duration || 0),
    image:    img,
    audio,
  };
}

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const { action, query, id, limit = 20 } = event.queryStringParameters || {};

  try {
    let data;

    if (action === 'search') {
      const url = `${SAAVN}?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=${limit}&q=${encodeURIComponent(query)}`;
      const res  = await fetch(url, { headers: HEADERS });
      const json = await res.json();
      const results = json.results || [];
      data = results.map(normSong).filter(Boolean);
    }

    else if (action === 'song') {
      const url = `${SAAVN}?__call=song.getDetails&cc=in&_marker=0&_format=json&pids=${id}`;
      const res  = await fetch(url, { headers: HEADERS });
      const json = await res.json();
      const s    = json[id] || Object.values(json)[0];
      data = s ? normSong(s) : null;
    }

    else if (action === 'trending') {
      // JioSaavn trending/featured
      const url = `${SAAVN}?__call=content.getAlbums&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=${limit}&editorial_language=hindi`;
      const res  = await fetch(url, { headers: HEADERS });
      const json = await res.json();
      // Fallback to search for trending
      const fallback = `${SAAVN}?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=${limit}&q=bollywood+hits+2024`;
      const res2  = await fetch(fallback, { headers: HEADERS });
      const json2 = await res2.json();
      data = (json2.results || []).map(normSong).filter(Boolean);
    }

    else {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Unknown action' }) };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ data }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
