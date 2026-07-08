/* Site Survey service worker — offline-first app shell.
 * Bump VERSION whenever any app file changes so clients pick up updates. */
const VERSION = 'v1.0.0';
const CACHE = `site-survey-${VERSION}`;

const SHELL = [
  '/survey/',
  '/survey/index.html',
  '/survey/manifest.webmanifest',
  '/survey/css/survey.css',
  '/survey/js/util.js',
  '/survey/js/db.js',
  '/survey/js/schema.js',
  '/survey/js/sensors.js',
  '/survey/js/camera.js',
  '/survey/js/forms.js',
  '/survey/js/siteplot.js',
  '/survey/js/export.js',
  '/survey/js/sync.js',
  '/survey/js/guide.js',
  '/survey/js/app.js',
  '/survey/vendor/pptxgen.bundle.js',
  '/survey/icons/icon-192.png',
  '/survey/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('site-survey-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

/* Cache-first for the app shell (works fully offline in the field);
 * network pass-through for everything else (e.g. Tailscale sync calls). */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/survey/')) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});
