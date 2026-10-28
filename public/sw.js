
/* Service Worker for TLS App */
const CACHE_NAME = 'tls-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/tlslogo.png',
  '/tlsicono.png',
  'https://appdesignproyectos.com/tlslogo.png',
  'https://appdesignproyectos.com/tlsicono.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        ASSETS_TO_CACHE.map(async (url) => {
          try {
            const response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch (e) {
            console.warn('Pre-cache skip:', url, e);
          }
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
    ])
  );
});

// 1. Handle incoming PUSH events (From a Push Server - Simulated here)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  showNotification(data.title || 'TLS Notificación', data.body || 'Actualización de viaje');
});

// 2. Handle MESSAGES from the Main Thread (Client-side Notification delegation)
// This is critical for reliable "background" notifications triggered by the app logic itself
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'NOTIFY') {
    const { title, body } = event.data;
    showNotification(title, body);
  }
});

function showNotification(title, body) {
  const options = {
    body: body,
    icon: 'https://appdesignproyectos.com/tlsicono.png',
    badge: 'https://appdesignproyectos.com/tlsicono.png',
    vibrate: [500, 250, 500, 250, 500], // High Priority Pattern
    tag: 'tls-alert', // Stack notifications or replace?
    renotify: true, // Vibrate again even if tag is same
    requireInteraction: true, // Keeps notification on screen until interacted
    data: {
      url: '/'
    }
  };

  self.registration.showNotification(title, options);
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Focus the open window or open a new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Cache Strategy
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  try {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
  } catch (e) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cachedResponse = await caches.match(event.request);
      return cachedResponse || new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});
