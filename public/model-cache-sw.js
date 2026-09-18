const MODEL_PATH_PREFIX = '/__duet_models__/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.pathname.startsWith(MODEL_PATH_PREFIX)) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((response) => {
      if (response) return response;
      return new Response('Model file is not installed', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }),
  );
});
