// Boot: show the last known route instantly (cache), load the current route (Firestore REST, or the seed in
// demo mode), restore a signed-in session if there was one, then render the screen for the current #route.
// Three levels: anyone sees the route (no prices); family also asks the AI (still no prices); editors see the
// whole plan with prices and change it.
import { h, icon, mount, safeStorage, toast } from "./ui/h.js";
import { can, computed, setState, store, subscribe } from "./store.js";
import { currentRoute, onRoute, startRouter } from "./router.js";
import { firebaseEnabled } from "./fb/lazy.js";
import { hadSession, preloadAuth, signOutNow } from "./fb/auth.js";
import { fetchRoute } from "./data/rest.js";
import { startSession } from "./data/session.js";
import { routeView } from "./shared/route.js";
import { renderHome } from "./views/home.js";
import { renderCategory, itemRedirect } from "./views/category.js";
import { renderOptions } from "./views/options.js";
import { renderRoute, renderRouteHome } from "./views/route.js";
import { renderPrint } from "./views/print.js";
import { renderAsk } from "./views/ask.js";
import { renderDocs } from "./views/docs.js";
import { ROLE_HE, renderSignin, startSignIn } from "./views/signin.js";
import { renderSettings, setupCard } from "./views/settings.js";
import { renderHistory } from "./views/history.js";
import { renderEdit } from "./edit/forms.js";
import { editTools, run } from "./edit/tools.js";
import { backLink, notice } from "./components/common.js";

const CACHE_KEY = "usaTrip.routeCache";
const OLD_CACHE_KEY = "usaTrip.publicCache"; // until 2026-10-25 this held the prices: removed from every phone
const root = document.getElementById("app");

const EDITOR_NAV = [
  { name: "home", href: "#/", label: "סיכום", icon: "home" },
  { name: "route", href: "#/route", label: "מסלול", icon: "route" },
  { name: "ask", href: "#/ask", label: "שאלו", icon: "chat" },
  { name: "docs", href: "#/docs", label: "מסמכים", icon: "file" },
  { name: "settings", href: "#/settings", label: "הגדרות", icon: "settings" },
];
const FAMILY_NAV = [
  { name: "home", href: "#/", label: "מסלול", icon: "route", also: "route" },
  { name: "ask", href: "#/ask", label: "שאלו", icon: "chat" },
];

function nav(route) {
  const items = can.edit() ? EDITOR_NAV : can.ask() ? FAMILY_NAV : [];
  if (!items.length) return null; // anyone without sign-in has one page: the route
  return h("nav", { class: "nav", "aria-label": "ניווט ראשי" },
    h("ul", {}, items.map((n) =>
      h("li", {}, h("a", { href: n.href, "aria-current": route.name === n.name || route.name === n.also ? "page" : null }, icon(n.icon), n.label)))));
}

let authPreloaded = false;

/** Always at the top: who you are, and the one sign-in / sign-out button. */
function accountBar() {
  const button = (label, iconName, onclick) => h("button", { type: "button", class: "account-btn", onclick }, icon(iconName, "icon-sm"), label);
  if (store.demo) {
    // Demo mode has no accounts: the buttons switch between the demo roles instead.
    return h("div", { class: "account-bar" },
      h("span", { class: "account-who" }, icon("user", "icon-sm"), store.user ? `הדגמה · ${ROLE_HE[store.role] || store.role}` : "בני משפחה: שאלות ל-AI"),
      store.user ? button("יציאה", "logout", () => { location.search = "?demo"; }) : button("כניסה", "login", startSignIn));
  }
  if (!store.user) {
    if (!authPreloaded) {
      authPreloaded = true;
      setTimeout(() => preloadAuth().catch(() => {}), 1200); // ready before the tap: iOS needs the popup opened synchronously
    }
    return h("div", { class: "account-bar" },
      h("span", { class: "account-who" }, icon("users", "icon-sm"), "בני משפחה: שאלות ל-AI"),
      button("כניסה", "login", startSignIn));
  }
  const who = h("bdi", {}, store.user.name || store.user.email || "");
  if (!store.roleChecked) {
    return h("div", { class: "account-bar" }, h("span", { class: "account-who", role: "status" }, icon("clock", "icon-sm"), "נכנסת בתור ", who, " — בודק הרשאות…"));
  }
  if (store.role === "public") {
    return h("div", { class: "account-bar" },
      h("span", { class: "account-who" }, icon("lock", "icon-sm"), h("bdi", {}, store.user.email || ""), " — לא ברשימה"),
      h("a", { class: "account-btn", href: "#/signin" }, icon("info", "icon-sm"), "מה עכשיו?"));
  }
  return h("div", { class: "account-bar" },
    h("span", { class: "account-who" }, icon("user", "icon-sm"), "מחובר/ת: ", who, ` · ${ROLE_HE[store.role] || ""}`),
    button("יציאה", "logout", () => signOutNow().then(() => { location.hash = "#/"; location.reload(); })));
}

function topBars() {
  const bars = [accountBar()];
  if (store.demo) {
    bars.push(h("div", { class: "demo-banner" }, store.role === "public"
      ? "מצב הדגמה — כך רואה מי שלא נכנס: רק המסלול."
      : `מצב הדגמה (${ROLE_HE[store.role] || store.role}) — שינויים נשמרים רק עד רענון הדף.`));
  }
  if (can.edit() && store.docs.plan) {
    bars.push(h("div", { class: "editbar" },
      h("span", {}, icon("edit", "icon-sm"), store.editMode ? " מצב עריכה" : " בלי כפתורי עריכה"),
      h("span", { class: "row wrap", style: { gap: "6px" } },
        h("button", { type: "button", onclick: () => { location.hash = "#/edit/expense/new"; } }, icon("plus", "icon-sm"), " הוצאה"),
        h("button", { type: "button", onclick: () => setState({ editMode: !store.editMode }) }, store.editMode ? "להסתיר כפתורי עריכה" : "לחזור לעריכה"),
        h("button", { type: "button", onclick: () => { location.hash = "#/history"; } }, "היסטוריה"),
        h("button", { type: "button", onclick: () => { location.hash = "#/ask"; } }, icon("sparkles", "icon-sm"), " AI"))));
  }
  if (store.error) bars.push(h("div", { class: "page", style: { paddingBottom: 0 } }, notice(store.error, "danger")));
  return bars;
}

/** Everyone but editors: the public route, shaped like the editors' context so the route views share code. */
function routeCtx() {
  return { state: store.route, r: { itinerary: store.route.itinerary }, editMode: false, rerender: render, routeOnly: true };
}

/** Editors: the plan and the engine. */
function editorCtx() {
  return {
    state: store.docs.plan,
    priv: store.docs.priv,
    r: computed(),
    editMode: store.editMode !== false,
    editTools,
    rerender: render,
    onChoose: (groupId, optionId) =>
      run([{ t: "choose", groupId, optionId, before: store.docs.plan.optionGroups[groupId]?.chosen ?? null }], { doneText: "הבחירה עודכנה" }).catch(() => {}),
  };
}

const TITLES = { home: "סיכום", route: "מסלול", ask: "שאלו את הטיול", docs: "מסמכים", settings: "הגדרות", history: "היסטוריה", print: "הדפסה", signin: "כניסה" };

const editorsOnly = () => [backLink(), notice("החלק הזה פתוח רק לעורכי הטיול. את המסלול כולם רואים.", "info", "lock")];

function view(route) {
  const [a] = route.params;
  if (route.name === "signin") return renderSignin();
  // Anyone and family: the route only (plus the AI for family). Nothing with a price is rendered for them.
  if (!can.edit()) {
    if (route.name === "ask") return renderAsk(routeCtx());
    if (route.name === "home" || route.name === "route") return renderRouteHome(routeCtx());
    return editorsOnly();
  }
  if (store.docs.plan === undefined) {
    return [notice("טוען את נתוני הטיול המלאים…", "info", "clock"), ...(store.route ? renderRouteHome(routeCtx()) : [])];
  }
  if (store.docs.plan === null) return setupCard(); // no trip in the database yet: editing would fail
  const ctx = editorCtx();
  switch (route.name) {
    case "home": return renderHome(ctx);
    case "cat": return renderCategory(ctx, a);
    case "item": location.replace(itemRedirect(ctx, a)); return [];
    case "options": return renderOptions(ctx, a);
    case "route": return renderRoute(ctx);
    case "print": return renderPrint(ctx);
    case "ask": return renderAsk(ctx);
    case "docs": return renderDocs(ctx);
    case "settings": return renderSettings(ctx, a);
    case "history": return renderHistory(ctx);
    case "edit": return renderEdit(ctx, route.params);
    default: return [backLink(), notice("הדף הזה לא קיים.", "info", "info")];
  }
}

let lastRouteKey = null;
let lastShape = null;
function render() {
  if (!store.route && !store.docs.plan) return;
  const route = currentRoute();
  // While an edit form is open, don't rebuild it on background data updates (it would erase what is typed) —
  // only when who you are / what you may see changed (e.g. sign-in finished after the form appeared).
  const shape = `${store.role}:${store.docs.plan ? 1 : 0}:${store.docs.priv ? 1 : 0}:${store.editMode}`;
  if (route.name === "edit" && lastRouteKey === route.key && lastShape === shape && root.querySelector(".field")) return;
  lastRouteKey = route.key;
  lastShape = shape;
  let nodes;
  try {
    nodes = view(route);
  } catch (err) {
    console.error(err);
    nodes = [notice("משהו השתבש בתצוגה. נסו לרענן את הדף.", "danger")];
  }
  mount(root, ...topBars().filter(Boolean), h("main", { class: "page", id: "main" }, nodes), nav(route));
  const title = (can.edit() && store.docs.plan?.settings?.title) || store.route?.settings?.title || "הטיול";
  const page = !can.edit() && route.name === "home" ? "מסלול" : TITLES[route.name];
  document.title = `${page ? `${page} · ` : ""}${title}`;
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

const loadSeed = () => fetch("data/seed-data.json", { cache: "no-cache" }).then((r) => r.json());

async function boot() {
  const params = new URLSearchParams(location.search);
  const demo = !firebaseEnabled() || params.has("demo");
  const demoRole = ["family", "editor", "owner"].includes(params.get("demo")) ? params.get("demo") : "public";
  setState({ demo, editMode: true });

  onRoute(() => render());
  subscribe(() => render());

  if (demo) {
    try {
      const seed = await loadSeed();
      const editor = demoRole === "editor" || demoRole === "owner";
      setState({
        route: routeView(seed),
        docs: editor ? { plan: seed, priv: emptyPriv() } : { plan: undefined, priv: undefined },
        role: demoRole,
        roleChecked: true,
        user: demoRole === "public" ? null : { uid: "demo", email: "demo@example.com", name: "מצב הדגמה" },
        source: "seed",
        loadedAt: Date.now(),
      });
    } catch {
      mount(root, h("main", { class: "page" }, notice("לא הצלחנו לטעון את נתוני הטיול.", "danger")));
      return;
    }
  } else {
    safeStorage.remove(OLD_CACHE_KEY);
    const cached = safeStorage.get(CACHE_KEY);
    if (cached) {
      try {
        const route = JSON.parse(cached);
        if (route?.itinerary) setState({ route, source: "cache" });
      } catch { /* ignore a broken cache */ }
    }
    try {
      const route = await fetchRoute();
      if (route) {
        safeStorage.set(CACHE_KEY, JSON.stringify(route));
        setState({ route, source: "firestore", loadedAt: Date.now(), error: null });
      } else {
        // Nothing published yet: show the opening route so the page isn't empty (editors get the "load data" card).
        setState({ route: routeView(await loadSeed()), source: "seed" });
      }
    } catch {
      if (!store.route) {
        mount(root, h("main", { class: "page" }, notice("אין חיבור לאינטרנט כרגע. נסו שוב בעוד רגע.", "danger")));
        return;
      }
      setState({ error: "אין חיבור כרגע — מוצג המסלול האחרון שנשמר בטלפון." });
    }
    if (hadSession()) startSession();
  }

  startRouter();
  loadFxToday();
  if (store.source === "cache") toast("מוצג המסלול האחרון — מתעדכן…");
}

boot();
