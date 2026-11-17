// Service worker: offline app shell + Android "Share to CE Smart Evidence" target.
const VERSION = 'ces-v1.0.1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'assets/css/app.css',
  'assets/icons/icon.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
  'assets/js/app.js', 'assets/js/config.js', 'assets/js/db.js', 'assets/js/utils.js', 'assets/js/services.js',
  'assets/js/ui.js', 'assets/js/drive.js', 'assets/js/exporter.js', 'assets/js/reports.js',
  'assets/js/views/dashboard.js', 'assets/js/views/capture.js', 'assets/js/views/visit.js', 'assets/js/views/files.js',
  'assets/js/views/search.js', 'assets/js/views/daily.js', 'assets/js/views/machines.js', 'assets/js/views/reportsView.js',
  'assets/js/views/inbox.js', 'assets/js/views/settings.js',
  'assets/vendor/jszip.min.js', 'assets/vendor/chart.umd.js', 'assets/vendor/jspdf.umd.min.js',
  'assets/vendor/jspdf.plugin.autotable.min.js', 'assets/vendor/pptxgen.bundle.js', 'assets/vendor/xlsx.full.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ces-v') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Share target: store shared files, then open the Import screen.
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const files = form.getAll('media');
      const cache = await caches.open('ces-share');
      let i = 0;
      for (const f of files) {
        await cache.put(new Request(`./shared/${Date.now()}-${i++}`), new Response(f, {
          headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || 'shared'), 'x-modified': String(f.lastModified || Date.now()) },
        }));
      }
      return Response.redirect('./#/inbox', 303);
    })());
    return;
  }

  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // Google APIs go straight to network

  // App shell: cache-first, refresh in background (stale-while-revalidate).
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || (e.request.mode === 'navigate' ? cache.match('index.html') : new Response('', { status: 504 }));
  })());
});
