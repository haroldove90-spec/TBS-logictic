
/* Service Worker for TLS App */
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force activation
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim()); // Take control of all clients immediately
});

// Handle incoming push events (Simulated via client for this demo, or real push if configured)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Tienes una nueva actualización en tu ruta.',
    icon: 'https://appdesignproyectos.com/tlsicono.png', 
    badge: 'https://appdesignproyectos.com/tlsicono.png',
    vibrate: [200, 100, 200, 100, 200], // Distinct vibration
    tag: 'tls-update', 
    renotify: true,
    requireInteraction: true, 
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'TLS Notificación', options)
  );
});

// Handle notification clicks - Focus existing window or open new
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
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
