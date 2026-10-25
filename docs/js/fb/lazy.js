// Lazy Firebase modules from the official gstatic CDN (no build step). Nothing here loads for a plain
// viewer: the public page is read over REST. Auth / Firestore / Functions load only when needed (files go
// through the functions, so the browser never loads Storage).
import { ACTIVE_FIREBASE, EMULATOR_HOST, FIREBASE_SDK, FUNCTIONS_REGION, USE_EMULATORS } from "../config.js";

let appP, authP, liteP, fullP, fnP;

export const firebaseEnabled = () => !!ACTIVE_FIREBASE;

function app() {
  appP ??= import(`${FIREBASE_SDK}/firebase-app.js`).then((m) => m.initializeApp(ACTIVE_FIREBASE));
  return appP;
}

export function authModule() {
  authP ??= Promise.all([app(), import(`${FIREBASE_SDK}/firebase-auth.js`)]).then(([a, m]) => {
    const auth = m.getAuth(a);
    if (USE_EMULATORS) m.connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
    return { m, auth };
  });
  return authP;
}

/** Firestore Lite: one-shot reads (family). */
export function firestoreLite() {
  liteP ??= Promise.all([app(), import(`${FIREBASE_SDK}/firebase-firestore-lite.js`)]).then(([a, m]) => {
    const db = m.getFirestore(a);
    if (USE_EMULATORS) m.connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
    return { m, db };
  });
  return liteP;
}

/** Full Firestore: live updates (editors). */
export function firestoreFull() {
  fullP ??= Promise.all([app(), import(`${FIREBASE_SDK}/firebase-firestore.js`)]).then(([a, m]) => {
    const db = m.getFirestore(a);
    if (USE_EMULATORS) m.connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
    return { m, db };
  });
  return fullP;
}

export function functionsModule() {
  fnP ??= Promise.all([app(), import(`${FIREBASE_SDK}/firebase-functions.js`)]).then(([a, m]) => {
    const functions = m.getFunctions(a, FUNCTIONS_REGION);
    if (USE_EMULATORS) m.connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);
    return { m, functions };
  });
  return fnP;
}

