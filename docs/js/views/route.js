// The itinerary: stops with nights and dates (resolved by the engine), holidays, deadlines, checklist.
// renderRouteHome is the whole site for anyone who isn't an editor: built from the public route document,
// which has no prices to show.
import { h, icon } from "../ui/h.js";
import { activeList } from "../shared/engine.js";
import { STOP_KIND_HE } from "../shared/schema.js";
import { dateHe, dateRangeHe, deadlineHe, fmtNum, nightsHe, relativeHe, warningHe } from "../shared/format.js";
import { upcomingDeadlines } from "../shared/deadlines.js";
import { backLink, checklistItems, emptyState, pageHead, shareButton } from "../components/common.js";
import { can } from "../store.js";
import { stopTools } from "../edit/stops.js";
import { startSignIn } from "./signin.js";

const KIND_ICON = { city: "building", road: "route", parks: "ferris", cruise: "ship", beach: "palm", transit: "pin", other: "pin" };

function holidaysIn(state, start, end) {
  return activeList(state.holidays).filter((hol) => hol.start < end && hol.end >= start);
}

export function timelineList(ctx, { compact = false } = {}) {
  const { state, r } = ctx;
  const editing = can.edit() && ctx.editMode && !compact;
  const stops = r.itinerary.stops.filter((s) => editing || s.nights > 0 || !s.fill);
  return h("ol", { class: "tl" },
    stops.map((s) =>
      h("li", { class: "tl-stop" },
        h("span", { class: "tl-dot" }, icon(s.icon || KIND_ICON[s.kind] || "pin")),
        h("div", { class: "tl-body" },
          h("div", { class: "tl-name" }, s.label, compact ? null : h("span", { class: "meta" }, ` · ${STOP_KIND_HE[s.kind] || ""}`)),
          h("div", { class: "tl-dates" }, s.nights > 0 ? dateRangeHe(s.start, s.end) : dateHe(s.start, "long")),
          h("span", { class: "tl-nights" }, s.nights > 0 ? nightsHe(s.nights) : "בלי לינה"),
          holidaysIn(state, s.start, s.nights > 0 ? s.end : s.start).map((hol) => h("span", { class: "tl-holiday" }, icon("calendar", "icon-sm"), hol.label)),
          !compact && s.note ? h("div", { class: "meta", dir: "auto" }, s.note) : null,
          editing ? stopTools(ctx, s) : null))),
    h("li", { class: "tl-stop tl-end" },
      h("span", { class: "tl-dot" }, icon("plane")),
      h("div", { class: "tl-body" },
        h("div", { class: "tl-name" }, "חוזרים הביתה"),
        h("div", { class: "tl-dates" }, dateHe(state.settings.endDate, "long")))));
}

function holidaysCard(state) {
  const list = activeList(state.holidays);
  if (!list.length) return null;
  return h("section", { class: "card" },
    h("h2", {}, icon("calendar"), "חגים בזמן הטיול"),
    h("ul", { class: "check-list" }, list.map((hol) =>
      h("li", {}, icon("calendar"), h("span", {}, `${hol.label}: ${hol.start === hol.end ? dateHe(hol.start, "long") : dateRangeHe(hol.start, hol.end)}`)))));
}

/** Home for anyone and for family: the route, holidays, and the way to the AI. */
export function renderRouteHome(ctx) {
  const { state, r } = ctx;
  const s = state.settings || {};
  return [
    h("section", { class: "hero", "aria-label": "הטיול" },
      h("p", { class: "hero-title" }, s.title || "הטיול"),
      h("p", { class: "hero-dates" }, s.startDate && s.endDate ? `${dateRangeHe(s.startDate, s.endDate)} ${s.endDate.slice(0, 4)}` : "", s.subtitle ? ` · ${s.subtitle}` : ""),
      h("div", { class: "hero-split" },
        h("div", {}, h("span", { class: "k" }, "נוסעים"), h("span", { class: "v num" }, fmtNum(state.travellers || 0))),
        h("div", {}, h("span", { class: "k" }, "כמה זמן"), h("span", { class: "v" }, nightsHe(r.itinerary.tripNights || 0)))),
      shareButton()),
    h("section", { class: "card" }, h("h2", {}, icon("route"), "המסלול"), timelineList(ctx)),
    holidaysCard(state),
    can.ask()
      ? h("section", { class: "card" },
        h("h2", {}, icon("chat"), "שאלו את הטיול"),
        h("p", { class: "card-sub" }, "אפשר לשאול כל שאלה על המסלול, במילים פשוטות או בהקלטה דרך המקלדת. למשל: ״מתי מגיעים לאורלנדו?״"),
        h("a", { class: "btn", href: "#/ask" }, icon("chat"), "לשאול שאלה"))
      : h("section", { class: "card" },
        h("h2", {}, icon("users"), "בני משפחה"),
        h("p", { class: "card-sub" }, "אחרי כניסה עם חשבון גוגל אפשר לשאול את ה-AI שאלות על הטיול. בקשו משחר להוסיף אתכם לרשימה."),
        h("button", { type: "button", class: "btn btn-secondary", onclick: startSignIn }, icon("login"), "כניסה עם חשבון גוגל")),
    h("footer", { class: "foot" },
      s.contactText ? h("p", {}, s.contactText) : null,
      state.updatedAt ? h("p", {}, `המסלול עודכן ${relativeHe(state.updatedAt)}`) : null),
  ];
}

export function renderRoute(ctx) {
  const { state, r } = ctx;
  const today = new Date().toISOString().slice(0, 10);
  const deadlines = upcomingDeadlines(state, today);
  const editing = can.edit() && ctx.editMode;
  return [
    backLink(),
    pageHead("מסלול הטיול"),
    h("section", { class: "card" },
      r.itinerary.warnings.map((w) => h("div", { class: "notice" }, icon("alert"), h("div", {}, warningHe(w, state)))),
      timelineList(ctx),
      editing ? stopTools.addButton(ctx) : null,
      h("p", { class: "meta", style: { marginTop: "10px" } },
        "הלילות באורלנדו מתעדכנים לבד לפי תאריך השייט. כשמוסיפים עצירה, הלילות שלה יורדים מהעצירה ש״משלימה לילות״.")),
    h("section", { class: "card" },
      h("h2", {}, icon("calendar"), "מועדים חשובים"),
      deadlines.length
        ? h("ul", { class: "check-list" }, deadlines.map((d) => h("li", {}, icon("clock"), h("span", {}, deadlineHe(d)))))
        : emptyState("עוד אין מועדים. כשמזמינים משהו עם תאריך ביטול או תשלום, הוא יופיע כאן.")),
    activeList(state.checklist).length
      ? h("section", { class: "card" }, h("h2", {}, icon("list"), "רשימת משימות"), checklistItems(activeList(state.checklist)))
      : null,
    holidaysCard(state),
  ];
}
