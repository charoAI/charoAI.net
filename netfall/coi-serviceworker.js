// NETFALL cross-origin-isolation service worker.
//
// The blocking Python bridge needs SharedArrayBuffer, which browsers only
// enable on cross-origin-isolated pages (COOP + COEP response headers).
// Static hosts like GitHub Pages can't set response headers, so this worker
// intercepts fetches within its scope and stamps the headers on. Everything
// the game loads is same-origin, which keeps this simple: no CORP juggling
// for third-party responses is needed.
//
// Registration (with the reload-once dance) lives inline in index.html.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  event.respondWith(
    fetch(req).then((response) => {
      if (response.status === 0 || response.type === 'opaque' || response.type === 'opaqueredirect') {
        return response; // can't touch opaque responses; pass through untouched
      }
      const headers = new Headers(response.headers);
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }),
  );
});
