const CACHE='academy-finance-v7';
const ASSETS=[
  './',
  './index.html?v=7',
  './app.js?v=7',
  './styles.css?v=7',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(()=>{})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, {cache:'no-store'})
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    fetch(req, {cache:'no-store'})
      .then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
