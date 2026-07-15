/*
  auth.js : Connexion Google + synchronisation des préférences (Supabase).

  Rôle :
   - bloquer l'entrée dans l'app tant que l'utilisateur n'est pas connecté ;
   - à la première connexion, afficher l'onboarding des thèmes ;
   - charger les préférences (thèmes + brèves enregistrées) depuis Supabase ;
   - sauvegarder ces préférences à chaque changement.

  L'app principale (dans index.html) expose quelques fonctions/variables
  globales que ce module utilise : selected, saved, THEMES, CATCOLOR, cat(),
  renderThemes(), renderBrief(), renderSaved(), updateBadge().
*/

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// --- Connexion au projet Supabase (valeurs publiques, prévues pour le navigateur) ---
const SUPABASE_URL = "https://zybelxihwgoygehcwucc.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZRqdxhNK_Sk5qRB3k5r6oQ_3Fv6Tw-w";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// État courant de l'utilisateur connecté
let currentUser = null;
let saveTimer = null;

// --------------------------------------------------------------------------- //
//  Interface : overlay de connexion + onboarding
// --------------------------------------------------------------------------- //
function buildOverlay() {
  const o = document.createElement("div");
  o.id = "auth-overlay";
  o.innerHTML = `
    <div class="auth-screen" id="auth-login">
      <div class="auth-logo">B</div>
      <h1 class="auth-title">Brève</h1>
      <p class="auth-tagline" id="auth-tagline">L'essentiel de l'actualité, une fois par jour.</p>
      <button class="auth-gbtn" id="auth-google">
        <svg viewBox="0 0 48 48" width="20" height="20"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Connexion via Google
      </button>
      <button class="auth-abtn" id="auth-apple">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true"><path d="M17.05 12.54c-.03-2.85 2.33-4.22 2.44-4.29-1.33-1.95-3.4-2.21-4.13-2.24-1.76-.18-3.43 1.03-4.32 1.03-.89 0-2.26-1.01-3.72-.98-1.91.03-3.68 1.11-4.66 2.82-1.99 3.45-.51 8.55 1.43 11.35.95 1.37 2.08 2.91 3.56 2.85 1.43-.06 1.97-.92 3.7-.92 1.73 0 2.22.92 3.73.89 1.54-.03 2.51-1.4 3.45-2.78 1.09-1.59 1.54-3.13 1.57-3.21-.03-.01-3.01-1.16-3.05-4.52zM14.2 4.15c.79-.95 1.32-2.28 1.17-3.6-1.13.05-2.5.76-3.31 1.71-.73.84-1.37 2.19-1.2 3.48 1.26.1 2.55-.64 3.34-1.59z"/></svg>
        Continuer avec Apple
      </button>
      <p class="auth-status" id="auth-status"></p>
    </div>

    <div class="auth-screen" id="auth-denied" style="display:none">
      <div class="auth-logo">B</div>
      <h2 class="auth-hi" id="auth-denied-title">Obtenez votre accès</h2>
      <p class="auth-sub" id="auth-denied-sub">Brève ouvre ses portes petit à petit, à un cercle de premiers lecteurs. Laissez-nous votre adresse : nous vous écrirons dès que votre accès sera prêt.</p>
      <button class="auth-cta" id="auth-denied-beta">Obtenez votre accès</button>
      <button class="auth-skip" id="auth-denied-back">Votre accès est déjà validé ? Connectez-vous</button>
    </div>

    <div class="auth-screen" id="auth-welcome" style="display:none">
      <div class="auth-wcontent">
        <div class="auth-weyebrow" id="auth-weyebrow">Bienvenue sur Brève</div>
        <h2 class="auth-wtitle" id="auth-wtitle"></h2>
        <p class="auth-wtext" id="auth-wtext"></p>
      </div>
      <div class="auth-dots" id="auth-dots"></div>
      <button class="auth-cta" id="auth-w-next">Suivant</button>
      <button class="auth-skip" id="auth-w-skip">Passer</button>
    </div>

    <div class="auth-screen" id="auth-onboard" style="display:none">
      <div class="auth-eyebrow">Bienvenue</div>
      <h2 class="auth-hi">Qu'aimeriez-vous suivre ?</h2>
      <p class="auth-sub">Choisissez vos thématiques. Vous pourrez les modifier à tout moment.</p>
      <div class="auth-themes" id="auth-themes"></div>
      <div class="auth-count" id="auth-count"></div>
      <button class="auth-cta" id="auth-ob-done">Continuer</button>
    </div>

    <div class="auth-screen" id="auth-notif" style="display:none">
      <div class="auth-logo">B</div>
      <h2 class="auth-hi">Un rendez-vous chaque matin</h2>
      <p class="auth-sub" id="auth-notif-sub">Recevez une notification quand votre revue du jour est prête. Rien d'autre, jamais de spam.</p>
      <button class="auth-cta" id="auth-notif-enable">Activer les notifications</button>
      <button class="auth-skip" id="auth-notif-later">Plus tard</button>
    </div>

    <div class="auth-beta-panel" id="auth-beta-panel" style="display:none">
      <button class="auth-beta-close" id="auth-beta-close" aria-label="Fermer">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <iframe id="auth-beta-frame" data-tally-src="https://tally.so/r/ODrbyk?transparentBackground=1"
              width="100%" height="100%" frameborder="0" marginheight="0" marginwidth="0"
              title="Obtenir une invitation"></iframe>
    </div>
  `;
  document.body.appendChild(o);

  document.getElementById("auth-google").addEventListener("click", signIn);
  const appleBtn = document.getElementById("auth-apple");
  if (appleBtn) appleBtn.addEventListener("click", signInApple);
  document.getElementById("auth-ob-done").addEventListener("click", finishOnboarding);

  // Écran notifications de l'onboarding.
  const notifEnable = document.getElementById("auth-notif-enable");
  const notifLater = document.getElementById("auth-notif-later");
  if (notifEnable) notifEnable.addEventListener("click", async () => {
    try {
      // Attendre qu'OneSignal soit prêt, puis demander la permission + abonner.
      if (window.OneSignalReady && window.OneSignal) {
        await window.OneSignal.Notifications.requestPermission();
        await window.OneSignal.User.PushSubscription.optIn();
      }
    } catch (e) {
      console.warn("Activation notifications (onboarding) impossible", e);
    }
    enterApp();
  });
  if (notifLater) notifLater.addEventListener("click", enterApp);

  document.getElementById("auth-beta-close").addEventListener("click", () => {
    document.getElementById("auth-beta-panel").style.display = "none";
  });

  document.getElementById("auth-w-next").addEventListener("click", nextWelcome);
  document.getElementById("auth-w-skip").addEventListener("click", endWelcome);

  document.getElementById("auth-denied-beta").addEventListener("click", () => {
    document.getElementById("auth-beta-panel").style.display = "block";
    loadTally();
  });
  document.getElementById("auth-denied-back").addEventListener("click", () => {
    showOverlay("login");
  });

  // Tally émet un message lorsque le formulaire est réellement soumis. On en
  // profite pour mémoriser, dans ce navigateur, que la demande d'invitation a
  // été faite : on cessera alors de reproposer le formulaire à cette personne.
  window.addEventListener("message", (e) => {
    const d = e && e.data;
    if (d && (d.type === "Tally.FormSubmitted" || d.event === "Tally.FormSubmitted")) {
      markInvitationRequested();
    }
  });

  loadTally();
}

// --- Carrousel de bienvenue (concept de Brève) ---
const WELCOME_SLIDES = [
  { title: "Une fois par jour",
    text: "Une revue préparée chaque matin, qui s'arrête quand vous avez fait le tour. Pas de flux sans fin." },
  { title: "Plusieurs sources",
    text: "Chaque sujet est recoupé entre plusieurs médias, jamais une seule voix. Avec le lien vers les articles d'origine." },
  { title: "Vous gardez la main",
    text: "Vous choisissez vos thèmes. Brève vous montre l'essentiel, vous décidez du reste." },
];
let welcomeIndex = 0;

function renderWelcome() {
  const s = WELCOME_SLIDES[welcomeIndex];
  document.getElementById("auth-wtitle").textContent = s.title;
  document.getElementById("auth-wtext").textContent = s.text;
  // points de progression
  const dots = document.getElementById("auth-dots");
  dots.innerHTML = "";
  WELCOME_SLIDES.forEach((_, i) => {
    const d = document.createElement("span");
    d.className = "auth-dot" + (i === welcomeIndex ? " on" : "");
    dots.appendChild(d);
  });
  // libellé du bouton sur le dernier écran
  document.getElementById("auth-w-next").textContent =
    welcomeIndex === WELCOME_SLIDES.length - 1 ? "Choisir mes thèmes" : "Suivant";
}

function nextWelcome() {
  if (welcomeIndex < WELCOME_SLIDES.length - 1) {
    welcomeIndex++;
    renderWelcome();
  } else {
    endWelcome();
  }
}

// Fin du carrousel → on passe au choix des thèmes.
function endWelcome() {
  showOverlay("onboard");
}

// --- Mémoire locale de la demande d'invitation ----------------------------- //
// On retient, dans ce navigateur, qu'une demande d'invitation a déjà été
// soumise. Cela permet d'afficher un écran d'attente apaisé au lieu de
// reproposer le formulaire en boucle. Ce repère est propre à l'appareil :
// changer d'appareil ou effacer les données du navigateur le réinitialise.
const INVITATION_FLAG = "breve_invitation_demandee";

function invitationRequested() {
  try {
    return window.localStorage.getItem(INVITATION_FLAG) === "1";
  } catch (e) {
    return false;
  }
}

function markInvitationRequested() {
  try {
    window.localStorage.setItem(INVITATION_FLAG, "1");
  } catch (e) {
    // Stockage indisponible (navigation privée stricte) : on ignore sans casser.
  }
}

function loadTally() {
  const initialize = () => { if (window.Tally) window.Tally.loadEmbeds(); };
  if (window.Tally) { initialize(); return; }
  if (document.querySelector('script[src="https://tally.so/widgets/embed.js"]')) return;
  const s = document.createElement("script");
  s.src = "https://tally.so/widgets/embed.js";
  s.onload = initialize;
  s.onerror = initialize;
  document.body.appendChild(s);
}

function showOverlay(which) {
  const o = document.getElementById("auth-overlay");
  o.style.display = "flex";
  document.getElementById("auth-login").style.display = which === "login" ? "flex" : "none";
  document.getElementById("auth-denied").style.display = which === "denied" ? "flex" : "none";
  document.getElementById("auth-welcome").style.display = which === "welcome" ? "flex" : "none";
  document.getElementById("auth-onboard").style.display = which === "onboard" ? "flex" : "none";
  const notifScreen = document.getElementById("auth-notif");
  if (notifScreen) notifScreen.style.display = which === "notif" ? "flex" : "none";
  if (which === "login") typeTagline();
  if (which === "denied") prepareDeniedScreen();
  if (which === "welcome") { welcomeIndex = 0; renderWelcome(); }
  if (which === "onboard") renderOnboardThemes();
  if (which === "notif") prepareNotifScreen();
}

// Adapte l'écran « accès » selon que la demande d'invitation a déjà été faite.
// Première venue : invitation à demander, avec le bouton vers le formulaire.
// Demande déjà soumise : message d'attente apaisé, sans formulaire.
function prepareDeniedScreen() {
  const title = document.getElementById("auth-denied-title");
  const sub = document.getElementById("auth-denied-sub");
  const betaBtn = document.getElementById("auth-denied-beta");
  const backBtn = document.getElementById("auth-denied-back");
  if (invitationRequested()) {
    if (title) title.textContent = "Votre demande est bien arrivée";
    if (sub) sub.textContent = "Merci de votre intérêt pour Brève. Nous ouvrons les accès petit à petit : vous recevrez un message dès que le vôtre sera prêt. Il n'y a rien d'autre à faire.";
    if (betaBtn) betaBtn.style.display = "none";
    if (backBtn) { backBtn.style.display = ""; backBtn.textContent = "Revenir à l'accueil"; }
  } else {
    if (title) title.textContent = "Obtenez votre accès";
    if (sub) sub.textContent = "Brève ouvre ses portes petit à petit, à un cercle de premiers lecteurs. Laissez-nous votre adresse : nous vous écrirons dès que votre accès sera prêt.";
    if (betaBtn) betaBtn.style.display = "";
    if (backBtn) { backBtn.style.display = ""; backBtn.textContent = "Votre accès est déjà validé ? Connectez-vous"; }
  }
}

// Adapte l'écran de proposition des notifications selon l'appareil.
function prepareNotifScreen() {
  const sub = document.getElementById("auth-notif-sub");
  const enableBtn = document.getElementById("auth-notif-enable");
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const standalone = (("standalone" in navigator) && navigator.standalone) ||
                     (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  const supported = ("Notification" in window) && ("serviceWorker" in navigator) && ("PushManager" in window);

  // Cas iPhone pas encore installé sur l'écran d'accueil : les notifications
  // sont impossibles tant que l'app n'est pas installée. On explique au lieu
  // de proposer un bouton qui échouerait.
  if ((isIOS && !standalone) || !supported) {
    if (sub) {
      sub.textContent = isIOS
        ? "Pour recevoir votre revue chaque matin, ajoutez d'abord Brève à votre écran d'accueil (icône Partager, puis « Sur l'écran d'accueil »). Vous pourrez activer les notifications ensuite, depuis les réglages."
        : "Les notifications ne sont pas disponibles sur cet appareil. Vous pourrez les activer plus tard depuis les réglages si cela change.";
    }
    if (enableBtn) enableBtn.style.display = "none";
  } else {
    if (enableBtn) enableBtn.style.display = "";
  }
}

// Effet « machine à écrire » de la tagline : la phrase s'écrit lettre par lettre,
// avec un curseur clignotant qui s'efface en douceur à la fin. Démarre une fois
// le nom « Brève » apparu (≈0,9 s), pour un enchaînement logo → nom → phrase.
let _twTimer = null;
function typeTagline() {
  const el = document.getElementById("auth-tagline");
  if (!el) return;
  const full = el.dataset.full || el.textContent.trim();
  el.dataset.full = full;                 // mémorise le texte complet
  if (_twTimer) clearTimeout(_twTimer);
  // Accessibilité : si l'utilisateur réduit les animations, on affiche la
  // phrase complète immédiatement, sans effet de frappe.
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = full;
    return;
  }
  // Prépare : texte vide + curseur clignotant.
  el.innerHTML = '<span class="tw-text"></span><span class="tw-caret"></span>';
  const txt = el.querySelector(".tw-text");
  const caret = el.querySelector(".tw-caret");
  let i = 0;
  const SPEED = 45;                        // ms par lettre : rythme posé
  const start = () => {
    const step = () => {
      txt.textContent = full.slice(0, i);
      i += 1;
      if (i <= full.length) {
        _twTimer = setTimeout(step, SPEED);
      } else {
        caret.classList.add("done");       // curseur s'efface en fondu
      }
    };
    step();
  };
  // Démarre après l'apparition du nom (cascade : logo puis titre).
  _twTimer = setTimeout(start, 900);
}

function hideOverlay() {
  const o = document.getElementById("auth-overlay");
  if (o) o.style.display = "none";
}

// Pastilles de thèmes dans l'onboarding (réutilise selected + couleurs de l'app)
function renderOnboardThemes() {
  const wrap = document.getElementById("auth-themes");
  wrap.innerHTML = "";
  window.THEMES.forEach((t) => {
    const on = window.selected.has(t);
    const col = window.cat(t);
    const b = document.createElement("button");
    b.className = "auth-chip" + (on ? " on" : "");
    b.textContent = t;
    if (on) { b.style.background = hexSoft(col); b.style.borderColor = col; b.style.color = col; }
    b.addEventListener("click", () => {
      window.selected.has(t) ? window.selected.delete(t) : window.selected.add(t);
      renderOnboardThemes();
    });
    wrap.appendChild(b);
  });
  const n = window.selected.size;
  const c = document.getElementById("auth-count");
  const cta = document.getElementById("auth-ob-done");
  if (n === 0) { c.textContent = "Sélectionnez au moins un thème."; cta.disabled = true; }
  else { c.textContent = n + " thème" + (n > 1 ? "s" : "") + " sélectionné" + (n > 1 ? "s" : "") + "."; cta.disabled = false; }
}

function hexSoft(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
  return "rgba(" + r + "," + g + "," + b + ",0.10)";
}

// --------------------------------------------------------------------------- //
//  Connexion / déconnexion
// --------------------------------------------------------------------------- //
async function signIn() {
  const status = document.getElementById("auth-status");
  status.textContent = "Redirection vers Google…";
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) {
    status.textContent = "La connexion a échoué. Réessayez.";
    console.error(error);
  }
}

// Connexion via Apple. Identique à Google : Supabase gère la redirection,
// et startSession() ne fait aucune différence entre les deux fournisseurs.
async function signInApple() {
  const status = document.getElementById("auth-status");
  status.textContent = "Redirection vers Apple…";
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) {
    status.textContent = "La connexion a échoué. Réessayez.";
    console.error(error);
  }
}

async function signOut() {

async function signOut() {
  await supabase.auth.signOut();
  window.location.reload();
}
window.breveSignOut = signOut; // utilisable depuis un bouton de réglages plus tard

// --------------------------------------------------------------------------- //
//  Préférences : lecture / écriture dans Supabase
// --------------------------------------------------------------------------- //
async function loadPreferences(userId) {
  // Renvoie {found:false} si l'utilisateur n'a pas encore de préférences (1re connexion)
  try {
    const { data, error } = await supabase
      .from("preferences")
      .select("themes, saved")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { found: false };
    return { found: true, themes: data.themes || [], saved: data.saved || [] };
  } catch (e) {
    console.warn("Lecture des préférences impossible :", e);
    return { found: false, error: true };
  }
}

async function savePreferences() {
  if (!currentUser) return;
  const payload = {
    user_id: currentUser.id,
    themes: [...window.selected],
    // window.saved est une Map (clé stable -> contenu de la brève + savedAt).
    // On stocke le tableau de ses valeurs (les brèves complètes).
    saved: [...window.saved.values()],
    updated_at: new Date().toISOString(),
  };
  try {
    const { error } = await supabase.from("preferences").upsert(payload, { onConflict: "user_id" });
    if (error) throw error;
  } catch (e) {
    console.warn("Sauvegarde des préférences impossible :", e);
  }
}

// Sauvegarde « différée » : on attend 600 ms après le dernier changement
// pour éviter d'écrire à chaque clic. Exposée en global pour l'app.
function scheduleSave() {
  if (!currentUser) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePreferences, 600);
}
window.brevePersist = scheduleSave;

// --------------------------------------------------------------------------- //
//  Démarrage de la session
// Vérifie si un email figure dans la liste blanche (allowlist) Supabase.
// Comparaison insensible à la casse (on cherche en minuscules).
async function isAllowed(email) {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  try {
    const { data, error } = await supabase
      .from("allowlist")
      .select("email")
      .eq("email", e)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  } catch (err) {
    console.warn("Vérification de l'accès impossible :", err);
    // En cas d'erreur technique, on refuse par prudence (sécurité d'abord).
    return false;
  }
}

// --------------------------------------------------------------------------- //
async function startSession(user, isFreshLogin) {
  // Accès ouvert : toute personne connectée via Google peut entrer.
  // (La liste blanche n'est plus utilisée. La fonction isAllowed reste
  // présente plus bas, inutilisée, si l'on souhaite un jour la réactiver.)
  currentUser = user;

  // Expose l'email à l'app pour l'afficher (zone compte).
  window.breveUserEmail = (user.email || "");
  if (window.breveUpdateAccount) window.breveUpdateAccount();

  const prefs = await loadPreferences(user.id);

  if (prefs.found) {
    // Utilisateur connu : on applique ses préférences enregistrées
    window.selected.clear();
    (prefs.themes.length ? prefs.themes : window.THEMES).forEach((t) => window.selected.add(t));
    // prefs.saved est un tableau de brèves complètes : on reconstruit la Map
    // côté app (qui connaît la logique de clé stable).
    if (window.breveSetSaved) window.breveSetSaved(prefs.saved || []);
    window.breveRefresh();
    hideOverlay();
  } else {
    // Première connexion : on présente d'abord le concept (carrousel de
    // bienvenue), qui enchaîne ensuite sur le choix des thèmes.
    window.selected.clear();
    ["France", "Monde", "Culture"].forEach((t) => window.selected.add(t));
    showOverlay("welcome");
  }
}

async function finishOnboarding() {
  if (window.selected.size === 0) return;
  await savePreferences();          // crée la ligne de préférences
  // On passe à l'écran de proposition des notifications avant d'entrer.
  showOverlay("notif");
}

// Termine vraiment l'onboarding et entre dans l'app.
function enterApp() {
  window.breveRefresh();
  hideOverlay();
}

// --------------------------------------------------------------------------- //
//  Initialisation
// --------------------------------------------------------------------------- //
async function init() {
  buildOverlay();

  // Y a-t-il déjà une session ? (au retour de Google, ou si déjà connecté)
  const { data: { session } } = await supabase.auth.getSession();
  if (session && session.user) {
    await startSession(session.user, false);
  } else {
    showOverlay("login");
  }

  // Réagit aux changements d'état (connexion réussie au retour de Google)
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session && session.user) {
      if (!currentUser) startSession(session.user, true);
    }
    if (event === "SIGNED_OUT") {
      currentUser = null;
      showOverlay("login");
    }
  });
}

// L'app principale appelle breveAuthInit() une fois prête (voir index.html).
window.breveAuthInit = init;

// Démarre dès que le module est chargé (le script inline de l'app s'est déjà
// exécuté puisque les modules sont différés). Si l'app n'est pas encore prête,
// on réessaie au prochain tick.
function boot() {
  if (window.THEMES && window.selected && window.breveRefresh) {
    init();
  } else {
    setTimeout(boot, 30);
  }
}
boot();
