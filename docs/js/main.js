// Boot: show the last known numbers instantly (cache), load the current trip (Firestore REST, or the seed in
// demo mode), restore a signed-in session if there was one, then render the screen for the current #route.
import { h, icon, mount, safeStorage, toast } from "./ui/h.js";
import { can, computed, setState, store, subscribe } from "./store.js";
import { currentRoute, onRoute, startRouter } from "./router.js";
import { firebaseEnabled } from "./fb/lazy.js";
import { hadSession } from "./fb/auth.js";
import { fetchPublicState } from "./data/rest.js";
import { startSession } from "./data/session.js";
import { renderHome } from "./views/home.js";
import { renderCategory, itemRedirect } from "./views/category.js";
import { renderOptions } from "./views/options.js";
import { renderRoute } from "./views/route.js";
import { renderPrint } from "./views/print.js";
import { renderAsk } from "./views/ask.js";
import { renderDocs } from "./views/docs.js";
import { renderSignin } from "./views/signin.js";
import { renderSettings } from "./views/settings.js";
import { renderHistory } from "./views/history.js";
import { renderEdit } from "./edit/forms.js";
import { editTools, run } from "./edit/tools.js";
import { backLink, notice } from "./components/common.js";

const CACHE_KEY = "usaTrip.publicCache";
const root = document.getElementById("app");

const NAV = [
  { name: "home", href: "#/", label: "סיכום", icon: "home" },
  { name: "route", href: "#/route", label: "מסלול", icon: "route" },
  { name: "ask", href: "#/ask", label: "שאלו", icon: "chat" },
  { name: "docs", href: "#/docs", label: "מסמכים", icon: "file" },
  { name: "settings", href: "#/settings", label: "הגדרות", icon: "settings", editor: true },
];

function nav(route) {
  return h("nav", { class: "nav", "aria-label": "ניווט ראשי" },
    h("ul", {}, NAV.filter((n) => !n.editor || can.edit()).map((n) =>
      h("li", {}, h("a", { href: n.href, "aria-current": route.name === n.name ? "page" : null }, icon(n.icon), n.label)))));
}

function topBars() {
  const bars = [];
  if (store.demo) {
    bars.push(h("div", { class: "demo-banner" }, store.role === "public"
      ? "מצב הדגמה — המספרים הם נתוני הפתיחה."
      : `מצב הדגמה (${{ family: "משפחה", editor: "עורך", owner: "בעל האתר" }[store.role] || store.role}) — שינויים נשמרים רק עד רענון הדף.`));
  }
  if (can.edit()) {
    bars.push(h("div", { class: "editbar" },
      h("span", {}, icon("edit", "icon-sm"), store.editMode ? " מצב עריכה" : " תצוגה כמו של כולם"),
      h("span", { class: "row", style: { gap: "6px" } },
        h("button", { type: "button", onclick: () => setState({ editMode: !store.editMode }) }, store.editMode ? "לראות כמו כולם" : "לחזור לעריכה"),
        h("button", { type: "button", onclick: () => { location.hash = "#/history"; } }, "היסטוריה"),
        h("button", { type: "button", onclick: () => { location.hash = "#/ask"; } }, icon("sparkles", "icon-sm"), " AI"))));
  }
  if (store.error) bars.push(h("div", { class: "page", style: { paddingBottom: 0 } }, notice(store.error, "danger")));
  return bars;
}

function makeCtx() {
  return {
    state: store.docs.pub,
    priv: store.docs.priv,
    r: computed(),
    editMode: can.edit() && store.editMode !== false,
    editTools,
    rerender: render,
    onChoose: (groupId, optionId) =>
      run([{ t: "choose", groupId, optionId, before: store.docs.pub.optionGroups[groupId]?.chosen ?? null }], { doneText: "הבחירה עודכנה" }).catch(() => {}),
  };
}

const TITLES = { home: "סיכום", route: "מסלול", ask: "שאלו את הטיול", docs: "מסמכים", settings: "הגדרות", history: "היסטוריה", print: "הדפסה", signin: "כניסה" };

function view(route, ctx) {
  const [a, b] = route.params;
  switch (route.name) {
    case "home": return renderHome(ctx);
    case "cat": return renderCategory(ctx, a);
    case "item": location.replace(itemRedirect(ctx, a)); return [];
    case "options": return renderOptions(ctx, a);
    case "route": return renderRoute(ctx);
    case "print": return renderPrint(ctx);
    case "ask": return renderAsk(ctx, a);
    case "docs": return renderDocs(ctx, a);
    case "signin": return renderSignin(ctx);
    case "settings": return renderSettings(ctx, a);
    case "history": return renderHistory(ctx);
    case "edit": return can.edit() ? renderEdit(ctx, route.params) : [backLink(), notice("עריכה זמינה לעורכים בלבד.", "info", "lock")];
    default: return [backLink(), notice("הדף הזה לא קיים.", "info", "info")];
  }
}

let lastRouteKey = null;
let lastShape = null;
function render() {
  if (!store.docs.pub) return;
  const route = currentRoute();
  // While an edit form is open, don't rebuild it on background data updates (it would erase what is typed) —
  // only when who you are / what you may see changed (e.g. sign-in finished after the form appeared).
  const shape = `${store.role}:${store.docs.priv ? 1 : 0}:${store.editMode}`;
  if (route.name === "edit" && lastRouteKey === route.key && lastShape === shape && root.querySelector(".field")) return;
  lastRouteKey = route.key;
  lastShape = shape;
  let nodes;
  try {
    nodes = view(route, makeCtx());
  } catch (err) {
    console.error(err);
    nodes = [notice("משהו השתבש בתצוגה. נסו לרענן את הדף.", "danger")];
  }
  mount(root, ...topBars(), h("main", { class: "page", id: "main" }, nodes), nav(route));
  document.title = `${TITLES[route.name] ? `${TITLES[route.name]} · ` : ""}${store.docs.pub.settings?.title || "הטיול"}`;
}

async function loadFxToday() {
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=ILS");
    const json = await res.json();
    if (json?.rates?.ILS) setState({ fxToday: { rate: json.rates.ILS, date: json.date } });
  } catch {
    /* the planning rate is what counts; today's rate is just extra info */
  }
}

function emptyPriv() {
  return { schemaVersion: 1, items: {}, flights: {}, aiSettings: { monthlyBudgetUsd: 25, dailyCapFamily: 15, dailyCapEditor: 40 } };
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const demo = !firebaseEnabled() || params.has("demo");
  const demoRole = ["family", "editor", "owner"].includes(params.get("demo")) ? params.get("demo") : "public";
  setState({ demo, editMode: true });

  onRoute(() => render());
  subscribe(() => render());

  if (demo) {
    try {
      const seed = await fetch("data/seed-data.json", { cache: "no-cache" }).then((r) => r.json());
      setState({
        docs: { pub: seed, priv: demoRole === "public" ? null : emptyPriv() },
        role: demoRole,
        user: demoRole === "public" ? null : { uid: "demo", email: "demo@example.com", name: "מצב הדגמה" },
        source: "seed",
        loadedAt: Date.now(),
      });
    } catch {
      mount(root, h("main", { class: "page" }, notice("לא הצלחנו לטעון את נתוני הטיול.", "danger")));
      return;
    }
  } else {
    const cached = safeStorage.get(CACHE_KEY);
    if (cached) {
      try {
        setState({ docs: { pub: JSON.parse(cached), priv: null }, source: "cache" });
      } catch { /* ignore a broken cache */ }
    }
    try {
      const pub = await fetchPublicState();
      if (pub) {
        safeStorage.set(CACHE_KEY, JSON.stringify(pub));
        setState({ docs: { pub, priv: store.docs.priv }, source: "firestore", loadedAt: Date.now(), error: null });
      } else {
        const seed = await fetch("data/seed-data.json", { cache: "no-cache" }).then((r) => r.json());
        setState({ docs: { pub: seed, priv: null }, source: "seed", error: "האתר עוד לא קיבל נתונים. בעל האתר צריך להיכנס וללחוץ ״טען נתוני פתיחה״ בהגדרות → גיבוי." });
      }
    } catch {
      if (!store.docs.pub) {
        mount(root, h("main", { class: "page" }, notice("אין חיבור לאינטרנט כרגע. נסו שוב בעוד רגע.", "danger")));
        return;
      }
      setState({ error: "אין חיבור כרגע — מוצגים הנתונים האחרונים שנשמרו בטלפון." });
    }
    if (hadSession()) startSession();
  }

  startRouter();
  loadFxToday();
  if (store.source === "cache") toast("מוצגים הנתונים האחרונים — מתעדכן…");
}

boot();
