// Google sign-in. signInWithPopup must run synchronously inside the tap handler (iOS blocks popups opened
// after an await), so the Auth module is preloaded as soon as a sign-in button is on screen.
import { authModule } from "./lazy.js";
import { safeStorage } from "../ui/h.js";

const HAD_SESSION = "usaTrip.hadSession";
let ready = null;

export function preloadAuth() {
  return authModule().then((x) => (ready = x));
}

export const hadSession = () => safeStorage.get(HAD_SESSION) === "1";

/** Call directly from a click handler. */
export function signInWithGoogle() {
  if (!ready) {
    // Not loaded yet: load, then try (may be blocked on iOS; the button stays available to tap again).
    return preloadAuth().then(() => signInWithGoogle());
  }
  const provider = new ready.m.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return ready.m.signInWithPopup(ready.auth, provider).then((cred) => {
    safeStorage.set(HAD_SESSION, "1");
    return cred.user;
  });
}

export async function signOutNow() {
  const { m, auth } = await authModule();
  safeStorage.remove(HAD_SESSION);
  await m.signOut(auth);
}

export function watchUser(callback) {
  preloadAuth().then(({ m, auth }) => m.onAuthStateChanged(auth, callback));
}

export async function idToken() {
  const { auth } = await authModule();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

/** In-app browsers (WhatsApp/Facebook/Instagram webviews) can't do Google sign-in. */
export function isInAppBrowser(ua = navigator.userAgent) {
  return /FBAN|FBAV|Instagram|Line\/|WhatsApp|; wv\)|GSA\//i.test(ua);
}
