// Firebase Cloud Messaging (FCM) Web Push Service Worker
// Project: phivonex-production | Sender ID: 1077670417334

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBO6FmqRoCPxqCGSXsF5SkDqPWWqwkUouE",
  authDomain: "phivonex-production.firebaseapp.com",
  projectId: "phivonex-production",
  storageBucket: "phivonex-production.firebasestorage.app",
  messagingSenderId: "1077670417334",
  appId: "1:1077670417334:web:ac3452016ecea9d1c9a717"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received:', payload);

  const title = payload.notification?.title || payload.data?.title || 'PHIVONEX Network';
  const body = payload.notification?.body || payload.data?.body || 'You have received an authoritative protocol alert.';
  const icon = payload.notification?.icon || '/brand/phivonex-app-icon-192.png';
  const badge = '/brand/phivonex-favicon.svg';

  const notificationOptions = {
    body,
    icon,
    badge,
    data: {
      url: payload.data?.url || '/app',
      sourceType: payload.data?.sourceType || 'SYSTEM',
      timestamp: Date.now()
    },
    vibrate: [200, 100, 200],
    requireInteraction: true
  };

  self.registration.showNotification(title, notificationOptions);
});

// Allowed internal application routes for secure deep-linking
const ALLOWED_ROUTES = [
  '/app',
  '/app/nodes',
  '/app/node-health',
  '/app/network',
  '/app/referrals',
  '/app/wallet',
  '/app/swap',
  '/app/deposit',
  '/app/withdrawals',
  '/app/notifications',
  '/app/rewards',
  '/app/transactions',
  '/app/profile',
  '/app/security'
];

// Handle notification click to focus or open the web app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || '/app/notifications';
  const targetUrl = ALLOWED_ROUTES.includes(rawUrl) ? rawUrl : '/app/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If an existing window is open, focus it
      for (const client of windowClients) {
        if (client.url.includes(self.origin) && 'focus' in client) {
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
