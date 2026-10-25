// The day-by-day route (Wanderlog-style): what we do each day, where we sleep, Waze / Google Maps buttons.
// Built from a route document — the public one (no hotel names or addresses), the family one, or for editors
// familyView(plan) — through tripDays() (shared/days.js). During the trip the home screen opens on today.
import { h, icon, tint } from "../ui/h.js";
import { activeList } from "../shared/engine.js";
import { nightStops, placesOutside, regionInfo, sleepIn, tripDays, tripPhase } from "../shared/days.js";
import { dayRouteUrls, googleMapsUrl, wazeUrl } from "../shared/links.js";
import { COLORS, PLACE_KIND_HE, PLACE_KIND_ICON } from "../shared/schema.js";
import { dateHe, dateRangeHe, daysUntil, fmtNum, nightsHe, relativeHe, todayLocal } from "../shared/format.js";
import { backLink, notice, shareButton } from "../components/common.js";
import { routeMap } from "../components/map.js";
import { can, store } from "../store.js";
import { startSignIn } from "./signin.js";
import { addPlaceArea, dayTitleTools, placeTools } from "../edit/places.js";

const KIND_COLOR = {
  hotel: COLORS.indigo, sight: COLORS.magenta, food: COLORS.gold, park: COLORS.plum, stop: COLORS.teal,
  flight: COLORS.blue, port: COLORS.sky, shop: COLORS.brown, other: COLORS.slate,
};

/** Today's date — or, in demo mode only, ?today=YYYY-MM-DD to see the screens as on a trip day. */
export function today() {
  const forced = store.demo ? new URLSearchParams(location.search).get("today") : null;
  return forced && /^\d{4}-\d{2}-\d{2}$/.test(forced) ? forced : todayLocal();
}

const hasPos = (p) => typeof p?.lat === "number" && typeof p?.lng === "number";
const placeName = (p) => p?.label || (p?.kind === "hotel" ? sleepIn(p.city) : PLACE_KIND_HE[p?.kind] || "מקום");
const dayHref = (date) => `#/day/${date}`;

function regionChips(codes) {
  if (!codes.length) return null;
  return h("div", { class: "region-row" }, codes.map((code, i) => {
    const r = regionInfo(code);
    return [
      i ? h("span", { class: "region-arrow", "aria-hidden": "true" }, "←") : null,
      h("span", { class: "region-chip", style: { borderColor: r.color, background: tint(r.color, 0.1), color: "#1F2641" } },
        h("span", { class: "region-dot", style: { background: r.color } }), r.he, r.he !== code ? h("bdi", { class: "region-code" }, code) : null),
    ];
  }));
}

/** Waze + Google Maps for a place (only when there is something to navigate to). */
export function navButtons(p, { big = false, website = true } = {}) {
  if (!p || (p.kind === "hotel" && !p.label)) return null; // public: a nameless hotel has no address
  if (!p.address && !hasPos(p) && !p.label) return null;
  const w = wazeUrl(p);
  const g = googleMapsUrl(p);
  if (!w && !g) return null;
  return [
    h("div", { class: ["nav-row", big ? "nav-row-big" : ""] },
      w ? h("a", { class: "btn nav-waze", href: w, target: "_blank", rel: "noopener noreferrer" }, icon("navigation", "icon-sm"), "Waze") : null,
      g ? h("a", { class: "btn btn-secondary nav-gmaps", href: g, target: "_blank", rel: "noopener noreferrer" }, icon("map", "icon-sm"), "Google Maps") : null),
    website && p.website ? h("p", { class: "meta place-site" }, h("a", { href: p.website, target: "_blank", rel: "noopener noreferrer" }, "לאתר של המקום"), " ", icon("external", "icon-sm")) : null,
  ];
}

function kindTile(kind, n) {
  const color = KIND_COLOR[kind] || COLORS.slate;
  return h("span", { class: "place-icon", style: { background: tint(color, 0.14), color } },
    n !== undefined ? h("span", { class: "place-n" }, String(n)) : null,
    icon(PLACE_KIND_ICON[kind] || "pin"));
}

/**
 * One row on a day: kind, time, name, where, note, photo, navigation (+ edit buttons for editors).
 * `brief` = the hotel we leave in the morning / reach in the evening: name only (the sleep card has the rest).
 */
function placeRow(ctx, p, { n, prefix = "", day, brief = false, nav = true } = {}) {
  const editing = can.edit() && ctx.editMode && !ctx.routeOnly && !brief;
  const time = brief ? (prefix.startsWith("מגיעים") ? p.time : "") : p.time;
  return h("li", { class: ["place", p.maybe ? "place-maybe" : "", brief ? "place-brief" : ""] },
    kindTile(p.kind, n),
    h("div", { class: "place-body" },
      h("div", { class: "place-name" },
        time ? h("span", { class: "time-pill num" }, h("bdi", {}, p.endTime && !brief ? `${time}–${p.endTime}` : time)) : null,
        prefix ? h("span", { class: "place-prefix" }, prefix) : null,
        h("span", { dir: "auto" }, placeName(p))),
      brief
        ? null
        : h("div", { class: "meta" },
          PLACE_KIND_HE[p.kind] || "",
          p.city ? [" · ", h("span", { dir: "auto" }, p.city)] : null,
          p.maybe ? h("span", { class: "badge badge-estimate place-badge" }, "אולי") : null),
      !brief && p.address ? h("div", { class: "place-address", dir: "auto" }, p.address) : null,
      !brief && p.note ? h("p", { class: "place-note", dir: "auto" }, p.note) : null,
      !brief && p.photo?.url
        ? h("figure", { class: "place-photo" },
          h("img", { src: p.photo.url, alt: placeName(p), loading: "lazy", referrerpolicy: "no-referrer", onerror: (e) => e.target.closest("figure")?.remove() }),
          p.photo.credit ? h("figcaption", { class: "meta", dir: "auto" }, p.photo.page ? h("a", { href: p.photo.page, target: "_blank", rel: "noopener noreferrer" }, p.photo.credit) : p.photo.credit) : null)
        : null,
      nav && ctx.state.audience === "family" ? navButtons(p, { website: !brief }) : null, // navigation is for family (signed in)
      editing ? placeTools(ctx, p, day) : null));
}

function autoTitle(day) {
  if (day.title) return day.title;
  if (day.last) return "חוזרים הביתה";
  if (day.first && !day.woke) return "יוצאים לדרך";
  if (day.checkOut && day.checkIn) return `נוסעים: ${day.checkOut.city || placeName(day.checkOut)} ← ${day.checkIn.city || placeName(day.checkIn)}`;
  if (day.leaving && day.stop) return `${day.leaving.label} ← ${day.stop.label}`;
  return day.stop?.label || day.sleep?.city || "";
}

/** The coloured top of a day: day number, date, title, states. */
function dayBand(day, { isToday = false, compact = false } = {}) {
  const color = regionInfo(day.regions.at(-1))?.color || COLORS.slate;
  return h("header", { class: ["day-band", compact ? "day-band-compact" : ""], style: { "--band": color, background: tint(color, 0.1) } },
    h("div", { class: "day-num" }, h("span", { class: "k" }, "יום"), h("span", { class: "v num" }, fmtNum(day.n)), h("span", { class: "of" }, `מתוך ${fmtNum(day.of)}`)),
    h("div", { class: "grow" },
      isToday ? h("span", { class: "today-tag" }, icon("sun", "icon-sm"), "היום") : null,
      h(compact ? "h2" : "h1", { class: "day-date" }, dateHe(day.date, "long")),
      autoTitle(day) ? h("p", { class: "day-title", dir: "auto" }, autoTitle(day)) : null,
      regionChips(day.regions)));
}

/** "איפה ישנים הלילה" */
function sleepCard(ctx, day) {
  if (day.last) {
    return h("section", { class: "card sleep-card" },
      h("h2", {}, icon("plane"), "הלילה בטיסה הביתה"),
      h("p", { class: "meta" }, "נוחתים בישראל. ברוכים השבים!"));
  }
  const hotel = day.sleep;
  const nightN = hotel ? daysUntil(day.date, hotel.checkIn) + 1 : 0;
  const nights = hotel ? daysUntil(hotel.checkOut, hotel.checkIn) : 0;
  return h("section", { class: "card sleep-card" },
    h("h2", {}, icon("moon"), "איפה ישנים הלילה"),
    hotel
      ? [
        h("p", { class: "sleep-name", dir: "auto" }, placeName(hotel)),
        h("p", { class: "meta" },
          nights > 1 ? `לילה ${fmtNum(nightN)} מתוך ${fmtNum(nights)}` : "לילה אחד",
          ` · עד ${dateHe(hotel.checkOut, "dm")}`,
          day.checkIn && hotel.time ? ` · צ׳ק-אין מ-${hotel.time}` : ""),
        hotel.address ? h("p", { class: "place-address", dir: "auto" }, hotel.address) : null,
        hotel.phone ? h("p", { class: "meta" }, icon("phone", "icon-sm"), " ", h("a", { href: `tel:${hotel.phone.replace(/[^\d+]/g, "")}`, dir: "ltr" }, hotel.phone)) : null,
        hotel.note ? h("p", { class: "place-note", dir: "auto" }, hotel.note) : null,
        navButtons(hotel, { big: true }),
        can.edit() && ctx.editMode && !ctx.routeOnly ? placeTools(ctx, hotel, day) : null,
      ]
      : [
        h("p", {}, day.stop ? `ב${day.stop.label}` : "עוד לא נקבע."),
        can.edit() && !ctx.routeOnly ? h("p", { class: "meta" }, "עוד לא הוספנו מלון ללילה הזה. אפשר להוסיף למטה (״הוספת מקום״), גם עם AI.") : null,
      ]);
}

/** Points of one day on its map: last night's hotel, today's places, tonight's hotel. */
function dayPoints(day) {
  const pts = [];
  const seen = new Set();
  const add = (p, n) => {
    if (!p || seen.has(p.id)) return;
    seen.add(p.id);
    const pos = hasPos(p) ? [p.lat, p.lng] : p.near;
    if (pos) pts.push({ lat: pos[0], lng: pos[1], n, color: KIND_COLOR[p.kind] || COLORS.slate });
  };
  if (day.checkOut) add(day.checkOut, "⌂");
  day.places.forEach((p, i) => add(p, i + 1));
  add(day.sleep, "⌂");
  return pts;
}

/** Everything about one day (used by the day screen and by "today" on the home screen). */
function dayBody(ctx, day, { isToday = false } = {}) {
  const rows = [];
  if (day.checkOut) rows.push(placeRow(ctx, day.checkOut, { prefix: "יוצאים מ: ", day, brief: true, nav: false }));
  day.places.forEach((p, i) => rows.push(placeRow(ctx, p, { n: i + 1, day })));
  if (day.checkIn) rows.push(placeRow(ctx, day.checkIn, { prefix: "מגיעים ללינה: ", day, brief: true }));
  const legs = ctx.state.audience === "family" ? dayRouteUrls(day) : [];
  const editing = can.edit() && !ctx.routeOnly;
  return [
    dayBand(day, { isToday }),
    editing && ctx.editMode ? dayTitleTools(ctx, day) : null,
    day.note ? h("p", { class: "day-note", dir: "auto" }, day.note) : null,
    h("section", { class: "card" },
      h("h2", {}, icon("list"), "מה עושים היום"),
      rows.length ? h("ol", { class: "place-list" }, rows) : h("p", { class: "muted" }, day.moving ? "יום נסיעה." : "יום חופשי — עוד לא תכננו מה עושים."),
      legs.length
        ? h("div", { class: "btn-row" }, legs.map((leg, i) =>
          h("a", { class: "btn btn-secondary", href: leg.url, target: "_blank", rel: "noopener noreferrer" }, icon("route", "icon-sm"),
            legs.length > 1 ? `כל היום ב-Google Maps, חלק ${i + 1}` : "כל היום ב-Google Maps")))
        : null,
      routeMap(dayPoints(day), { label: `מפה של יום ${day.n}`, height: 220 }),
      editing ? addPlaceArea(ctx, day) : null),
    sleepCard(ctx, day),
  ];
}

function dayNav(days, i) {
  const prev = days[i - 1];
  const next = days[i + 1];
  return h("nav", { class: "day-nav", "aria-label": "ימים" },
    prev ? h("a", { class: "btn btn-secondary", href: dayHref(prev.date) }, icon("back", "icon-sm"), `יום ${fmtNum(prev.n)}`) : h("span"),
    h("a", { class: "btn btn-ghost", href: "#/route" }, icon("days", "icon-sm"), "כל הימים"),
    next ? h("a", { class: "btn btn-secondary", href: dayHref(next.date) }, `יום ${fmtNum(next.n)}`, icon("prev", "icon-sm")) : h("span"));
}

/** #/day/YYYY-MM-DD */
export function renderDay(ctx, date) {
  const days = tripDays(ctx.state);
  const i = days.findIndex((d) => d.date === date);
  if (i < 0) return [backLink("#/route"), notice("היום הזה לא בתאריכי הטיול.", "info", "info")];
  return [
    backLink("#/route", "כל הימים"),
    ...dayBody(ctx, days[i], { isToday: days[i].date === today() }),
    dayNav(days, i),
  ];
}

/** A day in the list: number, date, title, what's on, where we sleep. */
function dayCard(day, isToday) {
  const shown = day.places.slice(0, 3);
  return h("li", {},
    h("a", { class: ["day-card", isToday ? "day-card-today" : ""], href: dayHref(day.date), id: `day-${day.date}` },
      h("span", { class: "day-card-num" }, h("span", { class: "v num" }, fmtNum(day.n)), h("span", { class: "k" }, dateHe(day.date, "wshort"))),
      h("span", { class: "grow" },
        h("span", { class: "day-card-title", dir: "auto" }, isToday ? h("span", { class: "today-tag" }, "היום") : null, autoTitle(day) || dateHe(day.date, "dm")),
        shown.length
          ? h("span", { class: "day-card-places" }, shown.map((p) => h("span", { class: "mini-place" }, icon(PLACE_KIND_ICON[p.kind] || "pin", "icon-sm"), h("span", { dir: "auto" }, placeName(p)))),
            day.places.length > 3 ? h("span", { class: "meta" }, `ועוד ${fmtNum(day.places.length - 3)}`) : null)
          : null,
        !day.last && (day.sleep || day.stop)
          ? h("span", { class: "day-card-sleep meta" }, icon("moon", "icon-sm"), " ", h("span", { dir: "auto" }, day.sleep ? placeName(day.sleep) : `ב${day.stop.label}`))
          : null),
      icon("next", "chev")));
}

/** The days, under a coloured band each time the state we sleep in changes. */
function dayList(days, todayIso) {
  const groups = [];
  for (const d of days) {
    const code = d.last ? "" : d.sleep?.region || d.stop?.region || d.regions.at(-1) || "";
    const g = groups.at(-1);
    if (g && g.code === code) g.days.push(d);
    else groups.push({ code, days: [d] });
  }
  return groups.map((g) => {
    const r = regionInfo(g.code);
    return h("section", { class: "day-group", style: { "--band": r?.color || COLORS.slate } },
      h("h3", { class: "day-group-head" },
        r ? [h("span", { class: "region-dot", style: { background: r.color } }), r.he, r.he !== g.code ? h("bdi", { class: "region-code" }, g.code) : null] : (g.days[0].last ? "חוזרים הביתה" : "בדרך"),
        h("span", { class: "meta" }, g.days.length > 1 ? ` · ימים ${fmtNum(g.days[0].n)}–${fmtNum(g.days.at(-1).n)}` : ` · יום ${fmtNum(g.days[0].n)}`)),
      h("ol", { class: "day-list" }, g.days.map((d) => dayCard(d, d.date === todayIso))));
  });
}

/** Overview map + the nights in order (the legend). */
function overview(ctx) {
  const stops = nightStops(ctx.state);
  const pts = stops.map((s, i) => ({ lat: s.lat, lng: s.lng, n: i + 1, color: regionInfo(s.region)?.color || COLORS.slate }));
  const map = routeMap(pts, { label: "מפת המסלול: איפה ישנים בכל שלב", height: 300 });
  if (!stops.length) return null;
  return h("section", { class: "card" },
    h("h2", {}, icon("map"), "המסלול על המפה"),
    map,
    h("ol", { class: "legend" }, stops.map((s, i) => {
      const r = regionInfo(s.region);
      return h("li", {},
        h("span", { class: "legend-n", style: { background: r?.color || COLORS.slate } }, String(i + 1)),
        h("span", { class: "grow" }, h("strong", { dir: "auto" }, s.label), r ? h("span", { class: "meta" }, ` · ${r.he}`) : null,
          h("span", { class: "meta", style: { display: "block" } }, `${nightsHe(s.nights)} · מ-${dateHe(s.from, "dm")}`)));
    })));
}

/** The route: map, then every day (grouped by state). Shared by the home screen and #/route. */
export function routeBody(ctx) {
  const days = tripDays(ctx.state);
  const t = today();
  const outside = can.edit() && !ctx.routeOnly ? placesOutside(ctx.state) : [];
  return [
    overview(ctx),
    outside.length ? notice(`${outside.length === 1 ? "מקום אחד" : `${fmtNum(outside.length)} מקומות`} מחוץ לתאריכי הטיול, ולכן לא מופיעים באף יום: ${outside.map((p) => p.label).join(", ")}`, "", "alert") : null,
    h("section", { class: "card" },
      h("h2", {}, icon("days"), "יום אחרי יום"),
      h("p", { class: "card-sub" }, "לחצו על יום כדי לראות מה עושים בו, איפה ישנים, וכפתורי ניווט."),
      dayList(days, t)),
  ];
}

function holidaysCard(state) {
  const list = activeList(state.holidays);
  if (!list.length) return null;
  return h("section", { class: "card" },
    h("h2", {}, icon("calendar"), "חגים בזמן הטיול"),
    h("ul", { class: "check-list" }, list.map((hol) =>
      h("li", {}, icon("calendar"), h("span", {}, `${hol.label}: ${hol.start === hol.end ? dateHe(hol.start, "long") : dateRangeHe(hol.start, hol.end)}`)))));
}

/** Home for anyone and for family: during the trip, today first; then the route. */
export function renderTripHome(ctx) {
  const { state } = ctx;
  const s = state.settings || {};
  const days = tripDays(state);
  const t = today();
  const { phase, index } = tripPhase(state, t);
  const left = s.startDate ? daysUntil(s.startDate, t) : 0;
  return [
    h("section", { class: "hero", "aria-label": "הטיול" },
      h("p", { class: "hero-title" }, s.title || "הטיול"),
      h("p", { class: "hero-dates" }, s.startDate && s.endDate ? `${dateRangeHe(s.startDate, s.endDate)} ${s.endDate.slice(0, 4)}` : "", s.subtitle ? ` · ${s.subtitle}` : ""),
      h("div", { class: "hero-split" },
        h("div", {}, h("span", { class: "k" }, "נוסעים"), h("span", { class: "v num" }, fmtNum(state.travellers || 0))),
        h("div", {}, h("span", { class: "k" }, phase === "before" ? "עוד" : "כמה זמן"),
          h("span", { class: "v" }, phase === "before" ? (left === 1 ? "יום אחד" : `${fmtNum(left)} ימים`) : nightsHe(ctx.state.itinerary?.tripNights || 0)))),
      shareButton()),
    phase === "during" && days[index]
      ? h("div", { class: "today-block" }, ...dayBody(ctx, days[index], { isToday: true }), dayNav(days, index))
      : null,
    ...routeBody(ctx),
    holidaysCard(state),
    can.ask()
      ? h("section", { class: "card" },
        h("h2", {}, icon("chat"), "שאלו את הטיול"),
        h("p", { class: "card-sub" }, "אפשר לשאול כל שאלה על המסלול, במילים פשוטות או בהקלטה דרך המקלדת. למשל: ״מה הכתובת של המלון בוושינגטון?״"),
        h("a", { class: "btn", href: "#/ask" }, icon("chat"), "לשאול שאלה"))
      : h("section", { class: "card" },
        h("h2", {}, icon("users"), "בני משפחה"),
        h("p", { class: "card-sub" }, "אחרי כניסה עם חשבון גוגל רואים גם את שמות המלונות, הכתובות וכפתורי הניווט (Waze / Google Maps), ואפשר לשאול את ה-AI. בקשו משחר להוסיף אתכם לרשימה."),
        h("button", { type: "button", class: "btn btn-secondary", onclick: startSignIn }, icon("login"), "כניסה עם חשבון גוגל")),
    h("footer", { class: "foot" },
      s.contactText ? h("p", {}, s.contactText) : null,
      state.updatedAt ? h("p", {}, `המסלול עודכן ${relativeHe(state.updatedAt)}`) : null),
  ];
}
