/*
  auth.js — Connexion Google + synchronisation des préférences (Supabase).

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
      <p class="auth-tagline">L'essentiel de l'actualité, une fois par jour.</p>
      <button class="auth-gbtn" id="auth-google">
        <svg viewBox="0 0 48 48" width="20" height="20"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Continuer avec Google
      </button>
      <p class="auth-status" id="auth-status"></p>

      <div class="auth-sep"><span>ou</span></div>

      <div class="auth-beta">
        <p class="auth-beta-intro">Pas encore d'accès ?</p>
        <button class="auth-beta-btn" id="auth-beta-open">S'inscrire à la beta</button>
      </div>
    </div>

    <div class="auth-screen" id="auth-onboard" style="display:none">
      <div class="auth-eyebrow">Bienvenue</div>
      <h2 class="auth-hi">Qu'aimeriez-vous suivre ?</h2>
      <p class="auth-sub">Choisissez vos thématiques. Vous pourrez les modifier à tout moment.</p>
      <div class="auth-themes" id="auth-themes"></div>
      <div class="auth-count" id="auth-count"></div>
      <button class="auth-cta" id="auth-ob-done">Voir ma revue</button>
    </div>

    <div class="auth-beta-panel" id="auth-beta-panel" style="display:none">
      <button class="auth-beta-close" id="auth-beta-close" aria-label="Fermer">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <iframe id="auth-beta-frame" data-tally-src="https://tally.so/r/ODrbyk?transparentBackground=1"
              width="100%" height="100%" frameborder="0" marginheight="0" marginwidth="0"
              title="S'inscrire à la beta"></iframe>
    </div>
  `;
  document.body.appendChild(o);

  document.getElementById("auth-google").addEventListener("click", signIn);
  document.getElementById("auth-ob-done").addEventListener("click", finishOnboarding);

  document.getElementById("auth-beta-open").addEventListener("click", () => {
    document.getElementById("auth-beta-panel").style.display = "block";
    loadTally();
  });
  document.getElementById("auth-beta-close").addEventListener("click", () => {
    document.getElementById("auth-beta-panel").style.display = "none";
  });

  loadTally();
}

// Charge le script d'intégration Tally (gère le rendu et la hauteur dynamique
// du formulaire beta). Si déjà chargé, on relance juste l'initialisation.
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
  document.getElementById("auth-onboard").style.display = which === "onboard" ? "flex" : "none";
  if (which === "onboard") renderOnboardThemes();
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
    saved: [...window.saved],
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
// --------------------------------------------------------------------------- //
async function startSession(user, isFreshLogin) {
  currentUser = user;

  const prefs = await loadPreferences(user.id);

  if (prefs.found) {
    // Utilisateur connu : on applique ses préférences enregistrées
    window.selected.clear();
    (prefs.themes.length ? prefs.themes : window.THEMES).forEach((t) => window.selected.add(t));
    window.saved.clear();
    prefs.saved.forEach((id) => window.saved.add(id));
    window.breveRefresh();
    hideOverlay();
  } else {
    // Première connexion : on propose l'onboarding des thèmes.
    // On part d'une suggestion de thèmes pré-cochés.
    window.selected.clear();
    ["Politique", "International", "Culture"].forEach((t) => window.selected.add(t));
    showOverlay("onboard");
  }
}

async function finishOnboarding() {
  if (window.selected.size === 0) return;
  await savePreferences();          // crée la ligne de préférences
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
