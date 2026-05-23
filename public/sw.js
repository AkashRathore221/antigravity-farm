// Antigravity Farm PWA - Service Worker
// Cache-first strategy for static assets, network-first for API calls

const CACHE_NAME = 'antigravity-farm-v1.0.0';
const OFFLINE_URL = '/';

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg'
];

// Install - precache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching app shell assets');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      // Force activate immediately without waiting for old tabs to close
      return self.skipWaiting();
    })
  );
});

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Take control of all open clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch - Cache-first for static assets, network-first for everything else
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST, PUT, DELETE)
  if (request.method !== 'GET') return;

  // Skip external API calls (Supabase, weather APIs)
  if (!url.origin.includes(self.location.origin)) return;

  // Cache-first strategy for static JS/CSS/fonts/images
  const isStaticAsset = /\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|webp|ico)(\?.*)?$/.test(url.pathname);
  
  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Serve from cache, but update in background (stale-while-revalidate)
          const fetchPromise = fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          }).catch(() => {});
          
          return cachedResponse;
        }

        // Not in cache - fetch from network and cache it
        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return networkResponse;
        });
      })
    );
    return;
  }

  // Network-first strategy for HTML navigation requests
  if (request.mode === 'navigate' || request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback - serve cached index
        return caches.match(OFFLINE_URL).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return new Response(
            '<html><body style="font-family:sans-serif;display:flex;height:100vh;align-items:center;justify-content:center;background:#0f172a;color:#10b981"><div style="text-align:center"><h2>🌱 Antigravity Farm</h2><p style="color:#94a3b8">You are offline. Data is saved locally and will sync when reconnected.</p></div></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        });
      })
    );
    return;
  }
});

// Background sync for queued mutations when back online
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-farm-data') {
    console.log('[SW] Background sync triggered - flushing mutation queue');
    // The actual sync logic is handled in the React app via Zustand store
    // SW just notifies the client
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_TRIGGERED' });
        });
      })
    );
  }
});

// Push notification handler (for future use)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Antigravity Farm', {
      body: data.body || 'Farm update available',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'farm-notification',
      data: data.url || '/'
    })
  );
});
