// Sign-in. The "כניסה" button sits in the bar at the top of every page (and on the route page); this screen
// is for the cases that need words: WhatsApp's in-app browser, an account that isn't on the list, sign-out.
import { h, icon, toast } from "../ui/h.js";
import { backLink, notice, pageHead } from "../components/common.js";
import { isInAppBrowser, preloadAuth, signInWithGoogle, signOutNow } from "../fb/auth.js";
import { firebaseEnabled } from "../fb/lazy.js";
import { store } from "../store.js";
import { startSession } from "../data/session.js";
import { SITE_URL } from "../config.js";

export const ROLE_HE = { owner: "בעל האתר", editor: "עורך", family: "משפחה", public: "אורח" };

const signInError = (err) => (err?.code === "auth/popup-blocked"
  ? "הדפדפן חסם את החלון. לחצו שוב על ״כניסה״."
  : err?.code === "auth/popup-closed-by-user" ? "החלון נסגר. אפשר לנסות שוב." : "הכניסה לא הצליחה. נסו שוב.");

/** One tap → Google's account chooser. Must run inside the tap handler (iOS blocks late popups). */
export function startSignIn() {
  if (store.demo || !firebaseEnabled()) {
    location.search = "?demo=family"; // demo mode has no accounts: show what family sees
    return;
  }
  if (isInAppBrowser()) {
    location.hash = "#/signin"; // WhatsApp's browser can't do Google sign-in: this screen explains what to do
    return;
  }
  startSession();
  signInWithGoogle().catch((err) => toast(signInError(err)));
}

function copyLinkButton() {
  return h("button", {
    type: "button", class: "btn btn-secondary",
    onclick: async (e) => {
      try {
        await navigator.clipboard.writeText(SITE_URL);
        e.currentTarget.lastChild.textContent = "הקישור הועתק — הדביקו בכרום או בספארי";
      } catch {
        prompt("העתיקו את הקישור:", SITE_URL);
      }
    },
  }, icon("copy"), "העתקת הקישור");
}

/** Sign-in card; `reason` explains why sign-in is needed on this screen. */
export function signInCard(reason) {
  if (!firebaseEnabled()) {
    return h("section", { class: "card" }, notice("הכניסה תעבוד אחרי שהאתר יחובר ל-Firebase (במצב הדגמה אפשר לנסות עם ‎?demo=family או ‎?demo=editor בכתובת).", "info", "info"));
  }
  preloadAuth();
  const status = h("p", { class: "meta", "aria-live": "polite" });
  const inApp = isInAppBrowser();
  const signInButton = (label) => h("button", {
    type: "button", class: "btn btn-block",
    onclick: () => {
      status.textContent = "פותח חלון של גוגל…";
      startSession();
      // A new Google sign-in replaces the current account (the chooser is always shown).
      signInWithGoogle().then(() => { status.textContent = "נכנסתם — בודק הרשאות…"; }).catch((err) => { status.textContent = signInError(err); });
    },
  }, icon("login"), label);

  // Signed in, but the server hasn't answered yet / this account isn't on the list.
  if (store.user && !inApp) {
    const who = h("bdi", {}, store.user.email || "");
    if (!store.roleChecked) {
      return h("section", { class: "card" }, h("h2", {}, icon("clock"), "בודק הרשאות…"), h("p", { class: "card-sub" }, "נכנסת בתור ", who, "."));
    }
    return h("section", { class: "card" },
      h("h2", {}, icon("lock"), "החשבון הזה עוד לא ברשימה"),
      notice(h("span", {}, "נכנסת בתור ", who, ". החשבון הזה לא נמצא ברשימת המשפחה של האתר."), "", "info"),
      h("p", { class: "card-sub" }, "אם יש לך חשבון גוגל אחר שכן ברשימה — החליפו חשבון. אחרת בקשו משחר להוסיף אתכם, ואז היכנסו שוב."),
      signInButton("החלפת חשבון גוגל"),
      status);
  }

  return h("section", { class: "card" },
    h("h2", {}, icon("lock"), "כניסה לבני המשפחה"),
    h("p", { class: "card-sub" }, reason || "הכניסה פותחת את השאלות ל-AI. את המסלול רואים גם בלי כניסה."),
    inApp
      ? h("div", {},
        notice("גוגל לא מאפשרת להיכנס מתוך הדפדפן של וואטסאפ. פתחו את האתר בכרום או בספארי:", "", "alert"),
        copyLinkButton(),
        /Android/i.test(navigator.userAgent)
          ? h("a", { class: "btn", style: { marginInlineStart: "8px" }, href: `intent://${SITE_URL.replace(/^https:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end` }, "פתיחה בכרום")
          : null)
      : signInButton("כניסה עם חשבון גוגל"),
    status);
}

const WHAT_YOU_SEE = {
  family: "את המסלול ואת השאלות ל-AI. המחירים פתוחים רק לעורכים.",
  editor: "הכל — כולל המחירים, העריכה והמסמכים.",
  owner: "הכל — כולל המחירים, העריכה, המסמכים וניהול הגישה.",
};

export function renderSignin() {
  const signOut = h("button", { type: "button", class: "btn btn-secondary", onclick: () => signOutNow().then(() => { location.hash = "#/"; location.reload(); }) }, icon("logout"), "יציאה");
  if (!store.user) return [backLink(), pageHead("כניסה"), signInCard()];
  if (store.role === "public") return [backLink(), pageHead("כניסה"), signInCard(), signOut]; // checking, or not on the list
  return [
    backLink(),
    pageHead("החשבון שלי"),
    h("section", { class: "card" },
      h("p", {}, "מחובר/ת בתור ", h("bdi", {}, store.user.email || "")),
      h("p", {}, `הרשאה: ${ROLE_HE[store.role] || store.role}`),
      WHAT_YOU_SEE[store.role] ? h("p", { class: "card-sub" }, `מה רואים: ${WHAT_YOU_SEE[store.role]}`) : null,
      signOut),
  ];
}
