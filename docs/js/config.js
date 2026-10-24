// Site configuration. FIREBASE_CONFIG stays null until the Firebase project exists (README, setup step 3);
// while it is null the site runs in demo mode on docs/data/seed-data.json and nothing is saved.
// The Firebase web config is not a secret — access is enforced by firestore.rules / storage.rules and by
// the Cloud Functions, which hold the owner identity and the Claude API key server-side.

// Firebase console → Project settings → Your apps → "trip-site" (web app).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCdo2V9kaiAPCQYZnsuhcTgC6sEv5PXp3E",
  authDomain: "usa-trip-2027-shahar.firebaseapp.com",
  projectId: "usa-trip-2027-shahar",
  storageBucket: "usa-trip-2027-shahar.firebasestorage.app",
  messagingSenderId: "768226421972",
  appId: "1:768226421972:web:622512dd50ee75c91e9f41",
};

export const TRIP_ID = "usa2027";
export const FUNCTIONS_REGION = "me-west1";
export const SITE_URL = "https://shahards.github.io/usa-trip-2027/";
export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/13.1.0";

// Local testing against the Firebase emulators: open http://localhost:8150/usa-trip-2027/?emu=1
// after `firebase emulators:start --project demo-usa-trip`.
const params = new URLSearchParams(globalThis.location?.search || "");
export const USE_EMULATORS = ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname) && params.has("emu");
const EMULATOR_CONFIG = {
  apiKey: "demo-key",
  authDomain: "demo-usa-trip.firebaseapp.com",
  projectId: "demo-usa-trip",
  storageBucket: "demo-usa-trip.appspot.com",
  appId: "demo-app",
};
export const ACTIVE_FIREBASE = USE_EMULATORS ? EMULATOR_CONFIG : FIREBASE_CONFIG;
export const EMULATOR_HOST = "127.0.0.1";
