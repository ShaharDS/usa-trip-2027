// Editors' route screen and the compact cities timeline (also on the summary page). Everyone else sees the
// day-by-day route in views/trip.js.
import { h, icon } from "../ui/h.js";
import { activeList } from "../shared/engine.js";
import { STOP_KIND_HE } from "../shared/schema.js";
import { dateHe, dateRangeHe, dayMonthHe, deadlineHe, fmtNum, nightsHe, relativeHe, todayLocal, warningHe } from "../shared/format.js";
import { upcomingDeadlines } from "../shared/deadlines.js";
import { backLink, checklistItems, emptyState, notice, pageHead } from "../components/common.js";
import { can } from "../store.js";
import { toggleTodo } from "../edit/tools.js";
import { routeBody } from "./trip.js";
import { gapRanges } from "../shared/calendar.js";

const KIND_ICON = { city: "building", road: "route", parks: "ferris", cruise: "ship", beach: "palm", transit: "pin", other: "pin" };

function holidaysIn(state, start, end) {
  return activeList(state.holidays).filter((hol) => hol.start < end && hol.end >= start);
}

export function timelineList(ctx, { compact = false } = {}) {
  const { state, r } = ctx;
  const stops = r.itinerary.stops.filter((s) => s.nights > 0);
  return h("ol", { class: "tl" },
    stops.map((s) =>
      h("li", { class: "tl-stop" },
        h("span", { class: "tl-dot" }, icon(s.icon || KIND_ICON[s.kind] || "pin")),
        h("div", { class: "tl-body" },
          h("div", { class: "tl-name" }, s.label, compact ? null : h("span", { class: "meta" }, ` · ${STOP_KIND_HE[s.kind] || ""}`)),
          h("div", { class: "tl-dates" }, s.nights > 0 ? dateRangeHe(s.start, s.end) : dateHe(s.start, "long")),
          h("span", { class: "tl-nights" }, s.nights > 0 ? nightsHe(s.nights) : "בלי לינה"),
          holidaysIn(state, s.start, s.nights > 0 ? s.end : s.start).map((hol) => h("span", { class: "tl-holiday" }, icon("calendar", "icon-sm"), hol.label)),
          !compact && s.note ? h("div", { class: "meta", dir: "auto" }, s.note) : null))),
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

/**
 * Editors' "#/route": the same route the family sees (calendar, map, day by day) with the editing right on it —
 * each part's dates on a calendar — then deadlines, the checklist and holidays.
 */
export function renderRoute(ctx, tripCtx) {
  const { state, r } = ctx;
  const today = todayLocal();
  const deadlines = upcomingDeadlines(state, today);
  return [
    backLink(),
    pageHead("מסלול הטיול"),
    // Nights that belong to no part are named plainly; the other warnings (overlaps, dates outside the trip) as they are.
    gapRanges(state).map((g) => notice(`${g.from === g.to ? `הלילה של ${dayMonthHe(g.from)}` : `הלילות ${dayMonthHe(g.from)}–${dayMonthHe(g.to)}`} עוד לא שייכים לאף חלק במסלול. אפשר לשייך אותם בכרטיס ״עוד לא נקבע איפה ישנים״ למטה.`, "", "alert")),
    r.itinerary.warnings.filter((w) => w.code !== "nightsLeft").map((w) => notice(warningHe(w, state), "", "alert")),
    ...routeBody(tripCtx),
    h("section", { class: "card" },
      h("h2", {}, icon("calendar"), "מועדים חשובים"),
      deadlines.length
        ? h("ul", { class: "check-list" }, deadlines.map((d) => h("li", {}, icon("clock"), h("span", {}, deadlineHe(d)))))
        : emptyState("עוד אין מועדים. כשמזמינים משהו עם תאריך ביטול או תשלום, הוא יופיע כאן.")),
    activeList(state.checklist).length
      ? h("section", { class: "card" }, h("h2", {}, icon("list"), "רשימת משימות"), checklistItems(activeList(state.checklist), can.edit() ? { onToggle: toggleTodo } : {}))
      : null,
    holidaysCard(state),
  ];
}
