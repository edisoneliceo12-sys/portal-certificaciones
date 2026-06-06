var CACHE_NAME = 'portal-cert-3a-v3';
var CDN_CACHE = 'portal-cert-cdn-v3';
var CDN_HOSTS = ['fonts.googleapis.com','fonts.gstatic.com','cdnjs.cloudflare.com','cdn.jsdelivr.net','www.gstatic.com'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(['/', '/index.html']);
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME && k !== CDN_CACHE; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Firebase / APIs — always network
  if (url.hostname.includes('firebase') || url.hostname.includes('firebaseio')) {
    e.respondWith(fetch(e.request).catch(function() {
      return new Response('{}', {headers:{'Content-Type':'application/json'}});
    }));
    return;
  }

  // CDN — cache first
  var isCDN = CDN_HOSTS.some(function(h){ return url.hostname.includes(h); });
  if (isCDN) {
    e.respondWith(caches.open(CDN_CACHE).then(function(cache) {
      return cache.match(e.request).then(function(cached) {
        if (cached) return cached;
        return fetch(e.request).then(function(r){ if(r.ok) cache.put(e.request,r.clone()); return r; });
      });
    }));
    return;
  }

  // HTML — Network first (always get latest), cache as fallback
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request).then(function(r) {
        if (r.ok) { var c=r.clone(); caches.open(CACHE_NAME).then(function(cache){ cache.put(e.request,c); }); }
        return r;
      }).catch(function() {
        return caches.open(CACHE_NAME).then(function(cache){ return cache.match('/index.html'); });
      })
    );
    return;
  }

  // Other — Network with cache fallback
  e.respondWith(
    fetch(e.request).then(function(r){
      if(r.ok){ var c=r.clone(); caches.open(CACHE_NAME).then(function(cache){ cache.put(e.request,c); }); }
      return r;
    }).catch(function(){ return caches.match(e.request); })
  );
});

self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
