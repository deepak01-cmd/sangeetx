const V = 'sx-v2';
const STATIC = ['/', '/index.html', '/style.css', '/data.js', '/app.js', '/manifest.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c=>c.addAll(STATIC))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if (res.ok) caches.open(V).then(c=>c.put(e.request,res.clone())); return res;
  }).catch(() => caches.match('/index.html'))));
});
