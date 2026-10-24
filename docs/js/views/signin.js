// Family sign-in. One tap on "כניסה עם גוגל"; the session is remembered on that phone.
import { h, icon } from "../ui/h.js";
import { backLink, notice, pageHead } from "../components/common.js";
import { isInAppBrowser, preloadAuth, signInWithGoogle, signOutNow } from "../fb/auth.js";
import { firebaseEnabled } from "../fb/lazy.js";
import { store } from "../store.js";
import { startSession } from "../data/session.js";
import { SITE_URL } from "../config.js";

const ROLE_HE = { owner: "בעל האתר", editor: "עורך", family: "משפחה", public: "אורח" };

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
      signInWithGoogle().then(() => { status.textContent = "נכנסתם — בודק הרשאות…"; }).catch((err) => {
        status.textContent = err?.code === "auth/popup-blocked"
          ? "הדפדפן חסם את החלון. לחצו שוב על הכפתור."
          : err?.code === "auth/popup-closed-by-user" ? "החלון נסגר. אפשר לנסות שוב." : "הכניסה לא הצליחה. נסו שוב.";
      });
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
    h("p", { class: "card-sub" }, reason || "הכניסה פותחת את המסמכים ואת השאלות ל-AI. את הסכום הכולל רואים גם בלי כניסה."),
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

export function renderSignin() {
  if (store.user) {
    return [
      backLink(),
      pageHead("החשבון שלי"),
      h("section", { class: "card" },
        h("p", {}, "מחובר/ת בתור ", h("bdi", {}, store.user.email || "")),
        h("p", {}, `הרשאה: ${ROLE_HE[store.role] || store.role}`),
        store.role === "public" ? notice("החשבון הזה עוד לא ברשימת המשפחה. בקשו משחר להוסיף אתכם, ואז היכנסו שוב.", "", "info") : null,
        h("button", { type: "button", class: "btn btn-secondary", onclick: () => signOutNow().then(() => { location.hash = "#/"; location.reload(); }) }, icon("logout"), "יציאה")),
    ];
  }
  return [backLink(), pageHead("כניסה"), signInCard()];
}
