// The day-by-day route (Wanderlog-style): what we do each day, where we sleep, Waze / Google Maps buttons.
// Built from a route document — the public one (no hotel names or addresses), the family one, or for editors
// familyView(plan) — through tripDays() (shared/days.js). During the trip the home screen opens on today.
import { h, icon, tint } from "../ui/h.js";
import { activeList } from "../shared/engine.js";
import { nightStops, placesOutside, regionInfo, sleepIn, tripDays, tripParts, tripPhase } from "../shared/days.js";
import { dayRouteUrls, googleMapsUrl, wazeUrl } from "../shared/links.js";
import { COLORS, PLACE_KIND_HE, PLACE_KIND_ICON } from "../shared/schema.js";
import { dateHe, dateRangeHe, dayMonthHe, daysUntil, fmtNum, nightsHe, relativeHe, todayLocal, weekdayLetterHe } from "../shared/format.js";
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

// ---------------------------------------------------------------- the route, part by part

/** One colour per part of the trip (always shown with its name), in trip order. */
const PART_COLORS = ["blue", "teal", "indigo", "magenta", "green", "gold", "plum", "sky", "brown"].map((k) => COLORS[k]);
const partColor = (part) => (part.home ? COLORS.slate : PART_COLORS[part.index % PART_COLORS.length]);
const STOP_ICON = { city: "building", road: "route", parks: "ferris", cruise: "ship", beach: "palm", transit: "pin", other: "pin" };
const partIcon = (part) => (part.home ? "plane" : part.stop?.icon || STOP_ICON[part.stop?.kind] || "pin");
const partName = (part) => (part.home ? "חוזרים הביתה" : part.stop?.label || "עוד לא נקבע איפה ישנים");
const partWhen = (part) => (part.home
  ? dateHe(part.from, "long")
  : `${nightsHe(part.nights)} · ${part.from === part.to ? dateHe(part.from, "dm") : `${dayMonthHe(part.from)}–${dayMonthHe(part.to)}`}`);
const partId = (part) => `part-${part.index}`;

/** The title of a day inside its part (the part already says the city, so don't repeat it). */
function cardTitle(day, part) {
  if (day.title) return day.title;
  if (day.last) return "טסים הביתה";
  if (day.first) return "יוצאים לדרך";
  if (day.checkOut && day.checkIn) return `נוסעים: ${day.checkOut.city || placeName(day.checkOut)} ← ${day.checkIn.city || placeName(day.checkIn)}`;
  if (day.leaving) return `${day.leaving.label} ← ${part.stop?.label || ""}`;
  if (day === part.days[0] && !part.home && part.index > 0) return `מגיעים ל${part.stop?.label || ""}`;
  return "";
}

/** A day: a calendar tile, the title, today's places (numbered, in the part's colour), a new hotel. */
function dayCard(day, part, color, isToday) {
  const title = cardTitle(day, part);
  const shown = day.places.slice(0, 3);
  const newHotel = day.checkIn || (day === part.days[0] ? day.sleep : null);
  return h("li", {},
    h("a", { class: ["day-card", isToday ? "day-card-today" : ""], href: dayHref(day.date), id: `day-${day.date}` },
      h("span", { class: "date-tile", style: { borderColor: color, background: tint(color, 0.08) } },
        h("span", { class: "dt-week" }, weekdayLetterHe(day.date)),
        h("span", { class: "dt-date num" }, dayMonthHe(day.date))),
      h("span", { class: "grow day-card-text" },
        h("span", { class: "day-card-top" },
          isToday ? h("span", { class: "today-tag" }, icon("sun", "icon-sm"), "היום") : null,
          h("span", { class: "day-card-n" }, `יום ${fmtNum(day.n)}`),
          title ? h("span", { class: "day-card-title", dir: "auto" }, title) : null),
        shown.length
          ? h("span", { class: "day-card-places" }, shown.map((p, i) =>
            h("span", { class: "mini-place" }, h("span", { class: "mini-n", style: { background: p.maybe ? "#8A93A6" : color } }, String(i + 1)), h("span", { dir: "auto" }, placeName(p)))),
          day.places.length > 3 ? h("span", { class: "meta" }, `ועוד ${fmtNum(day.places.length - 3)}`) : null)
          : !title ? h("span", { class: "meta" }, "יום חופשי — עוד לא תכננו") : null,
        newHotel && !day.last
          ? h("span", { class: "day-card-sleep" }, icon("moon", "icon-sm"), h("span", { dir: "auto" }, placeName(newHotel)))
          : null),
      icon("next", "chev")));
}

/** The "}" that holds a part's days together (pure CSS: two curls, two stems, the point). */
function brace(color) {
  return h("div", { class: "brace-col", "aria-hidden": "true", style: { color } },
    h("div", { class: "brace" }, ["b-top", "b-stem", "b-pt1", "b-pt2", "b-stem", "b-bot"].map((c) => h("span", { class: c }))),
    h("span", { class: "brace-dot", style: { background: color } }));
}

/** One part of the trip: its name, nights and dates, states — and its days inside the bracket. */
function partSection(part, todayIso) {
  const color = partColor(part);
  return h("section", { class: "card part", id: partId(part), style: { "--part": color } },
    h("header", { class: "part-head" },
      h("span", { class: "part-icon", style: { background: color } }, icon(partIcon(part))),
      h("div", { class: "grow" },
        h("h3", { class: "part-name" }, partName(part)),
        h("p", { class: "part-when" }, partWhen(part)),
        part.regions.length && !part.home ? regionChips(part.regions) : null)),
    h("div", { class: "part-body" },
      brace(color),
      h("ol", { class: "day-list" }, part.days.map((d) => dayCard(d, part, color, d.date === todayIso)))));
}

/** "המסלול במבט אחד": the parts as a coloured bar, the map (pins in the parts' colours) and the parts list. */
function overview(ctx, parts) {
  if (!parts.length) return null;
  const nights = nightStops(ctx.state);
  const partOfDate = (date) => parts.find((p) => p.from <= date && date <= p.to) || parts[0];
  const pts = nights.map((s) => {
    const part = partOfDate(s.from);
    return { lat: s.lat, lng: s.lng, n: part.index + 1, color: partColor(part) };
  });
  const total = parts.reduce((n, p) => n + Math.max(p.nights, 0.6), 0);
  return h("section", { class: "card" },
    h("h2", {}, icon("map"), "המסלול במבט אחד"),
    h("div", { class: "parts-bar", "aria-hidden": "true" }, parts.map((p) =>
      h("span", { style: { flexGrow: String(Math.max(p.nights, 0.6) / total), background: partColor(p) } }, p.nights >= 2 ? String(p.nights) : ""))),
    routeMap(pts, { label: "מפת המסלול: איפה ישנים בכל חלק של הטיול", height: 280 }),
    h("ol", { class: "parts-list" }, parts.map((p) =>
      h("li", {},
        h("button", { type: "button", class: "part-link", onclick: () => document.getElementById(partId(p))?.scrollIntoView({ behavior: "smooth", block: "start" }) },
          h("span", { class: "legend-n", style: { background: partColor(p) } }, String(p.index + 1)),
          h("span", { class: "grow" },
            h("strong", {}, partName(p)),
            h("span", { class: "meta", style: { display: "block" } }, partWhen(p), p.regions.length && !p.home ? ` · ${p.regions.map((r) => regionInfo(r).he).join(" ← ")}` : "")),
          icon("down", "icon-sm"))))));
}

/** The route: the overview, then every part with its days. Shared by the home screen and #/route. */
export function routeBody(ctx) {
  const days = tripDays(ctx.state);
  const parts = tripParts(days);
  const t = today();
  const outside = can.edit() && !ctx.routeOnly ? placesOutside(ctx.state) : [];
  return [
    overview(ctx, parts),
    outside.length ? notice(`${outside.length === 1 ? "מקום אחד" : `${fmtNum(outside.length)} מקומות`} מחוץ לתאריכי הטיול, ולכן לא מופיעים באף יום: ${outside.map((p) => p.label).join(", ")}`, "", "alert") : null,
    h("h2", { class: "section-title" }, icon("days"), "יום אחרי יום"),
    h("p", { class: "meta section-sub" }, "לחצו על יום כדי לראות מה עושים בו, איפה ישנים, וכפתורי ניווט."),
    parts.map((p) => partSection(p, t)),
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
