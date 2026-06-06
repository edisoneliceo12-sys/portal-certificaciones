/* ═══════════════════════════════════════════════════════════════
   PORTAL CERTIFICACIONES 3A — SERVICE WORKER v1.0
   Estrategia: Cache-first para HTML, Network-first para APIs
═══════════════════════════════════════════════════════════════ */

var CACHE_NAME = 'portal-cert-3a-v1';
var CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

/* Recursos a cachear al instalar */
var PRECACHE_URLS = [
  '/',
  '/index.html'
];

/* CDN externos a cachear en uso */
var CDN_CACHE = 'portal-cert-cdn-v1';
var CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'www.gstatic.com'
];

/* ─── INSTALL ─────────────────────────────────────────────── */
self.addEventListener('install', function(e) {
  console.log('[SW] Instalando v1...');
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      console.log('[SW] Pre-cache listo');
      return self.skipWaiting();
    })
  );
});

/* ─── ACTIVATE ────────────────────────────────────────────── */
self.addEventListener('activate', function(e) {
  console.log('[SW] Activando...');
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) {
          return k !== CACHE_NAME && k !== CDN_CACHE;
        }).map(function(k) {
          console.log('[SW] Eliminando cache viejo:', k);
          return caches.delete(k);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ─── FETCH ───────────────────────────────────────────────── */
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  /* Firebase / EmailJS — siempre red (no cachear datos) */
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('firebaseio') ||
      url.hostname.includes('googleapis.com') && url.pathname.includes('/v1/') ||
      url.hostname.includes('emailjs')) {
    e.respondWith(
      fetch(e.request).catch(function() {
        /* Si Firebase falla offline, devolver respuesta vacía controlada */
        return new Response(JSON.stringify({offline: true}), {
          headers: {'Content-Type': 'application/json'}
        });
      })
    );
    return;
  }

  /* CDN externos — Cache first, fallback red */
  var isCDN = CDN_HOSTS.some(function(h) { return url.hostname.includes(h); });
  if (isCDN) {
    e.respondWith(
      caches.open(CDN_CACHE).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          if (cached) return cached;
          return fetch(e.request).then(function(response) {
            if (response.ok) cache.put(e.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  /* App principal (index.html) — Cache first, red como fallback */
  if (e.request.mode === 'navigate' ||
      url.pathname === '/' ||
      url.pathname.endsWith('.html')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return fetch(e.request).then(function(response) {
          if (response.ok) cache.put(e.request, response.clone());
          return response;
        }).catch(function() {
          /* Offline: servir desde cache */
          return cache.match('/index.html').then(function(cached) {
            if (cached) {
              console.log('[SW] Sirviendo index.html desde cache (offline)');
              return cached;
            }
            return new Response('<h2>Sin conexion — abre la app una vez con internet primero</h2>', {
              headers: {'Content-Type': 'text/html'}
            });
          });
        });
      })
    );
    return;
  }

  /* Otros recursos — Red con fallback a cache */
  e.respondWith(
    fetch(e.request).then(function(response) {
      if (response.ok) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
      }
      return response;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});

/* ─── BACKGROUND SYNC ─────────────────────────────────────── */
self.addEventListener('sync', function(e) {
  if (e.tag === 'sync-records') {
    console.log('[SW] Background sync triggered');
    /* El sync real lo maneja la app via IndexedDB */
    self.clients.matchAll().then(function(clients) {
      clients.forEach(function(client) {
        client.postMessage({type: 'SYNC_NOW'});
      });
    });
  }
});

/* ─── MESSAGES ────────────────────────────────────────────── */
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data && e.data.type === 'GET_VERSION') {
    e.ports[0].postMessage({version: CACHE_NAME});
  }
});
