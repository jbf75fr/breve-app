/*
  notifications.js — gère, côté navigateur, l'abonnement aux notifications.

  Branché sur un bouton « M'avertir chaque matin ». Au clic :
   1. enregistre le service worker,
   2. demande l'autorisation des notifications,
   3. crée un abonnement push (avec la clé publique VAPID),
   4. envoie cet abonnement au serveur pour qu'il puisse notifier l'utilisateur.

  À CONFIGURER : remplacez VAPID_PUBLIC_KEY et API_BASE ci-dessous par les
  vôtres (voir le guide).
*/

// Clé publique VAPID (exemple — générez la vôtre, voir GUIDE).
const VAPID_PUBLIC_KEY = "BKP0GXg6wNW6KxEvbJje6pXooCJjZWnrbay2RgO8EweuaHu1GKZFXZQAVd1EOWuK22yyj9lPokWFxMbNb1MCG2A";

// Adresse de votre serveur de notifications (voir GUIDE). Ex : "https://breve-api.onrender.com"
const API_BASE = "";

// --- utilitaires ---
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function notifySupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// Enregistre le service worker au chargement (pour le cache + push).
async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("./service-worker.js");
  } catch (e) {
    console.warn("Service worker non enregistré:", e);
    return null;
  }
}

// Détecte iOS pour guider l'utilisateur (Apple exige l'ajout à l'écran d'accueil).
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

// Le flux d'abonnement complet, déclenché par le bouton.
async function subscribeToDaily(statusEl) {
  const say = (msg) => { if (statusEl) statusEl.textContent = msg; };

  if (!notifySupported()) {
    say("Votre navigateur ne gère pas les notifications.");
    return;
  }
  // Cas iPhone : sans installation sur l'écran d'accueil, Apple bloque les notifs.
  if (isIOS() && !isStandalone()) {
    say("Sur iPhone : touchez Partager puis « Sur l'écran d'accueil », puis rouvrez Brève depuis l'icône pour activer les notifications.");
    return;
  }

  const reg = await registerSW();
  if (!reg) { say("Impossible d'initialiser les notifications."); return; }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    say("Notifications refusées. Vous pouvez les réactiver dans les réglages du navigateur.");
    return;
  }

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Envoie l'abonnement au serveur. Sans API_BASE configuré, on s'arrête là.
    if (API_BASE) {
      const res = await fetch(API_BASE + "/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error("serveur " + res.status);
    }
    say("C'est fait — vous serez averti chaque matin quand la revue est prête.");
    localStorage.setItem("breve.notif", "on");
  } catch (e) {
    console.error(e);
    say("L'abonnement a échoué. Réessayez plus tard.");
  }
}

// Au chargement de la page : enregistre le SW et câble le bouton s'il existe.
window.addEventListener("load", () => {
  registerSW();
  const btn = document.getElementById("notif-btn");
  const status = document.getElementById("notif-status");
  if (btn) {
    btn.addEventListener("click", () => subscribeToDaily(status));
    // Si déjà abonné, on l'indique.
    if (localStorage.getItem("breve.notif") === "on" && status) {
      status.textContent = "Notifications activées.";
    }
  }
});
