/*
  service-worker.js — le script d'arrière-plan de la PWA Brève.

  Deux rôles :
   1. Mettre en cache l'app pour qu'elle s'ouvre vite et même hors-ligne.
   2. Recevoir les notifications push et les afficher, même app fermée.

  Ce fichier DOIT être servi depuis la racine du site (même dossier que
  index.html) pour pouvoir contrôler toute l'application.
*/

const CACHE = "breve-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

// Installation : on pré-charge les fichiers de base.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activation : on nettoie les anciens caches.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stratégie réseau : on tente le réseau d'abord (pour avoir la revue fraîche),
// et on retombe sur le cache si hors-ligne.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // On laisse passer sans interception les requêtes vers d'autres domaines
  // (ex. la revue du jour sur raw.githubusercontent.com) : l'app les gère
  // elle-même avec cache:"no-store" pour toujours obtenir la version fraîche.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // met à jour le cache au passage
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});

// Réception d'une notification push envoyée par le serveur.
self.addEventListener("push", (event) => {
  let data = { title: "Brève", body: "Votre revue du jour est prête." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: "breve-daily",          // remplace la précédente plutôt que d'empiler
      data: { url: data.url || "./index.html" },
    })
  );
});

// Clic sur la notification : ouvre (ou réveille) l'app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "./index.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
