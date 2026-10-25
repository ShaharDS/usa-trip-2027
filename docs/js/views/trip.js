// The day-by-day route (Wanderlog-style): what we do each day, where we sleep, Waze / Google Maps buttons.
// Built from a route document — the public one (no hotel names or addresses), the family one, or for editors
// familyView(plan) — through tripDays() (shared/days.js). During the trip the home screen opens on today.
import { h, icon, tint } from "../ui/h.js";
import { nightStops, placesOutside, regionInfo, sleepIn, tripDays, tripPhase } from "../shared/days.js";
import { activeList, addDays } from "../shared/engine.js";
import { dayRouteUrls, googleMapsUrl, wazeUrl } from "../shared/links.js";
import { COLORS, PLACE_KIND_HE, PLACE_KIND_ICON } from "../shared/schema.js";
import { dateHe, dateRangeHe, dayMonthHe, daysUntil, fmtNum, nightsHe, relativeHe, todayLocal, weekdayLetterHe } from "../shared/format.js";
import { backLink, notice, shareButton } from "../components/common.js";
import { routeMap } from "../components/map.js";
import { fileButtons } from "../components/fileViewer.js";
import { PART_COLORS, partIcon, partName, routeParts } from "../components/parts.js";
import { addPartButton, partEditButton, partEditor } from "../edit/parts.js";
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
      !brief && ctx.state.audience === "family" ? fileButtons(p.files) : null,
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
        fileButtons(hotel.files),
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
  if (ctx.state.audience !== "family") return [backLink(), ...publicRoute(ctx)];
  const days = tripDays(ctx.state);
  const i = days.findIndex((d) => d.date === date);
  if (i < 0) return [backLink("#/route"), notice("היום הזה לא בתאריכי הטיול.", "info", "info")];
  return [
    backLink("#/route", "כל הימים"),
    ...dayBody(ctx, days[i], { isToday: days[i].date === today() }),
    dayNav(days, i),
  ];
}

// ---------------------------------------------------------------- the route: calendar + day by day (the old site's look)

const editingRoute = (ctx) => can.edit() && !ctx.routeOnly;
const partWhen = (part) => (part.home
  ? dateHe(part.from, "long")
  : `${nightsHe(part.nights)} · ${part.from === part.to ? dayMonthHe(part.from) : `${dayMonthHe(part.from)}–${dayMonthHe(part.to)}`}`);
const ARRIVE = { city: "הגעה ל", parks: "הגעה ל", beach: "הגעה ל", cruise: "עולים ל", road: "יוצאים ל" };

/** What a day is called on the calendar: its title, "הגעה ל…" on a part's first day, else the part. */
function dayLabel(day, part) {
  if (day.title) return day.title;
  if (day.last) return "טסים הביתה";
  if (part.key === "none") return "לא משויך";
  if (day === part.days[0]) return `${ARRIVE[part.stop?.kind] || ""}${partName(part)}`;
  return partName(part);
}

/** "לוח שנה": the month grid (Sun–Sat), each night in its part's colour; tap a day to open it. */
function calendarCard(days, parts, todayIso) {
  if (!days.length) return null;
  const partOf = new Map();
  for (const p of parts) for (const d of p.days) partOf.set(d.date, p);
  const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
  const first = days[0].date;
  const last = days.at(-1).date;
  const cells = [];
  for (let d = addDays(first, -dow(first)); d <= addDays(last, 6 - dow(last)); d = addDays(d, 1)) {
    const day = days.find((x) => x.date === d);
    const part = day && partOf.get(d);
    if (!day) {
      cells.push(h("span", { class: "cal-c cal-out", "aria-hidden": "true" }, h("span", { class: "cal-d num" }, dayMonthHe(d))));
      continue;
    }
    cells.push(h("a", {
      class: ["cal-c", d === todayIso ? "cal-today" : "", part.key === "none" ? "cal-gap" : ""], href: dayHref(d),
      style: { borderTopColor: part.color }, "aria-label": `${dateHe(d, "long")}: ${dayLabel(day, part)}`,
    },
    h("span", { class: "cal-d num" }, dayMonthHe(d)),
    h("span", { class: "cal-t", style: { color: part.color } }, dayLabel(day, part)),
    day.moving ? h("span", { class: "cal-s" }, icon("car", "icon-sm", "יום נסיעה")) : null));
  }
  return h("section", { class: "card cal-card" },
    h("h2", {}, icon("calendar"), "לוח שנה"),
    h("div", { class: "cal", role: "list" }, ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"].map((w) => h("span", { class: "cal-h", "aria-hidden": "true" }, w)), cells));
}

/** Map (pins in the parts' colours) + the old site's colour legend — tap a part to jump to it. */
function overview(ctx, parts) {
  if (!parts.length) return null;
  const nights = nightStops(ctx.state);
  const partOfDate = (date) => parts.find((p) => p.from <= date && date <= p.to) || parts[0];
  const pts = nights.map((s) => {
    const part = partOfDate(s.from);
    return { lat: s.lat, lng: s.lng, n: part.index + 1, color: part.color };
  });
  return h("section", { class: "card" },
    h("h2", {}, icon("map"), "המסלול על המפה"),
    routeMap(pts, { label: "מפת המסלול: איפה ישנים בכל חלק של הטיול", height: 280 }),
    h("ul", { class: "legend-sq" }, parts.map((p) =>
      h("li", {}, h("button", { type: "button", class: "legend-btn", onclick: () => document.getElementById(`part-${p.index}`)?.scrollIntoView({ behavior: "smooth", block: "start" }) },
        h("i", { style: { background: p.color }, "aria-hidden": "true" }), h("span", {}, `${p.index + 1}. ${partName(p)}`), h("span", { class: "meta" }, ` · ${p.home ? dayMonthHe(p.from) : nightsHe(p.nights)}`))))));
}

/** One item of a day: a coloured pill and a bold line (old site), with a muted second line. */
function item(pill, color, title, sub = "") {
  return h("div", { class: "it" },
    h("span", { class: "pill", style: { background: color } }, pill),
    h("div", {}, h("div", { class: "it-t", dir: "auto" }, title), sub ? h("div", { class: "meta", dir: "auto" }, sub) : null));
}

/** A day row: big date, weekday, where — and what happens, as pills. */
function dayRow(day, part, isToday) {
  const items = [];
  if (day.title) items.push(h("div", { class: "day-title-line", dir: "auto" }, day.title));
  if (day.checkOut) items.push(item("יציאה", COLORS.slate, `יוצאים מ־${placeName(day.checkOut)}`));
  for (const p of day.places) {
    items.push(item(p.maybe ? "אולי" : PLACE_KIND_HE[p.kind] || "מקום", p.maybe ? "#8A93A6" : KIND_COLOR[p.kind] || COLORS.slate, placeName(p),
      [p.time ? (p.endTime ? `${p.time}–${p.endTime}` : p.time) : "", p.city || ""].filter(Boolean).join(" · ")));
  }
  const sleepNew = day.checkIn || (day === part.days[0] ? day.sleep : null);
  if (sleepNew && !day.last) items.push(item("לינה", KIND_COLOR.hotel, placeName(sleepNew), sleepNew.time ? `צ׳ק-אין מ-${sleepNew.time}` : ""));
  if (!items.length) items.push(h("div", { class: "meta" }, part.key === "none" ? "עוד לא שויך לאף חלק במסלול." : day.last ? "טסים הביתה." : "יום חופשי — עוד לא תכננו."));
  return h("a", { class: ["day-row", isToday ? "day-today" : ""], href: dayHref(day.date), id: `day-${day.date}` },
    h("div", { class: "day-date" },
      h("b", { class: "num" }, dayMonthHe(day.date)),
      h("span", {}, `יום ${weekdayLetterHe(day.date)}`),
      h("em", { style: { color: part.color } }, isToday ? "היום" : `יום ${fmtNum(day.n)}`)),
    h("div", { class: "day-body" }, items),
    icon("next", "chev"));
}

/** A part: header in its colour (name, nights, dates, states) and its days. Editors edit it right here. */
function grpCard(ctx, part, todayIso) {
  const editing = editingRoute(ctx);
  return h("section", { class: "grp", id: `part-${part.index}`, style: { "--c": part.color } },
    h("header", { class: "grp-head", style: { background: tint(part.color, 0.09) } },
      h("span", { class: "grp-icon", style: { background: part.color } }, icon(partIcon(part))),
      h("div", { class: "grow" },
        h("div", { class: "grp-t" }, partName(part)),
        h("div", { class: "grp-s" }, partWhen(part)),
        part.regions.length && !part.home ? regionChips(part.regions) : null),
      editing && part.stop ? partEditButton(ctx, part.stop.id) : null),
    editing && part.stop ? partEditor(ctx, part.stop.id) : null,
    editing && part.key === "none" ? h("div", { class: "grp-gap" }, addPartButton(ctx, { from: part.from, to: part.to })) : null,
    part.days.map((d) => dayRow(d, part, d.date === todayIso)));
}

/** Without sign-in: just the parts — cities, dates, nights. The calendar, map and places are for the family. */
function publicRoute(ctx) {
  const stops = (ctx.state.itinerary?.stops || []).filter((s) => s.nights > 0);
  return [
    h("section", { class: "card" },
      h("h2", {}, icon("route"), "המסלול בקצרה"),
      h("ul", { class: "legend-sq legend-list" }, stops.map((st, i) =>
        h("li", {}, h("i", { style: { background: PART_COLORS[i % PART_COLORS.length] }, "aria-hidden": "true" }),
          h("strong", {}, st.label), h("span", { class: "meta" }, ` · ${nightsHe(st.nights)} · ${dayMonthHe(st.start)}–${dayMonthHe(addDays(st.end, -1))}`))),
        ctx.state.settings?.endDate ? h("li", {}, h("i", { style: { background: COLORS.slate }, "aria-hidden": "true" }), h("strong", {}, "חוזרים הביתה"), h("span", { class: "meta" }, ` · ${dayMonthHe(ctx.state.settings.endDate)}`)) : null)),
    h("section", { class: "card signin-teaser" },
      h("h2", {}, icon("lock"), "לוח שנה, מפה, מלונות ומקומות"),
      h("p", { class: "card-sub" }, "פתוחים לבני המשפחה אחרי כניסה אחת עם חשבון גוגל: לוח שנה של כל הטיול, יום אחר יום, המפה, שמות המלונות והכתובות, כפתורי Waze / Google Maps, ואישורי הזמנה לצפייה."),
      h("button", { type: "button", class: "btn", onclick: startSignIn }, icon("login"), "כניסה עם חשבון גוגל")),
  ];
}

/** The route: calendar, map, then every part with its days. Shared by the home screen and #/route. */
export function routeBody(ctx) {
  if (ctx.state.audience !== "family") return publicRoute(ctx);
  const { days, parts } = routeParts(ctx.state);
  const t = today();
  const editing = editingRoute(ctx);
  const outside = editing ? placesOutside(ctx.state) : [];
  const noNights = editing ? (ctx.state.itinerary?.stops || []).filter((st) => !st.nights) : [];
  return [
    calendarCard(days, parts, t),
    overview(ctx, parts),
    outside.length ? notice(`${outside.length === 1 ? "מקום אחד" : `${fmtNum(outside.length)} מקומות`} מחוץ לתאריכי הטיול, ולכן לא מופיעים באף יום: ${outside.map((p) => p.label).join(", ")}`, "", "alert") : null,
    h("h2", { class: "section-title" }, icon("days"), "יום אחר יום"),
    h("p", { class: "meta section-sub" }, "לחצו על יום כדי לראות מה עושים בו, איפה ישנים, כפתורי ניווט ואישורים."),
    h("div", { class: "timeline" }, parts.map((p) => grpCard(ctx, p, t))),
    editing
      ? h("section", { class: "card" },
        h("h2", {}, icon("route"), "חלקי המסלול"),
        h("p", { class: "card-sub" }, "כל חלק (עיר, נסיעה, שייט) מקבל תאריכים בלוח. שינוי כאן מעדכן מיד את הלוח, יום אחר יום, המפה והסיכום."),
        noNights.length
          ? h("div", {}, h("p", { class: "meta" }, "חלקים בלי לילות כרגע (אפשר לתת להם תאריכים או למחוק):"),
            noNights.map((st) => h("div", { class: "row-between wrap", style: { margin: "6px 0" } }, h("strong", {}, st.label), partEditButton(ctx, st.id))),
            noNights.map((st) => partEditor(ctx, st.id)))
          : null,
        partEditor(ctx, "new"),
        h("div", { class: "btn-row" }, addPartButton(ctx)))
      : null,
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
    phase === "during" && days[index] && state.audience === "family"
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
        h("p", { class: "card-sub" }, "אחרי כניסה עם חשבון גוגל אפשר גם לשאול את ה-AI על המסלול. בקשו משחר להוסיף אתכם לרשימה."),
        h("button", { type: "button", class: "btn btn-secondary", onclick: startSignIn }, icon("login"), "כניסה עם חשבון גוגל")),
    h("footer", { class: "foot" },
      s.contactText ? h("p", {}, s.contactText) : null,
      state.updatedAt ? h("p", {}, `המסלול עודכן ${relativeHe(state.updatedAt)}`) : null),
  ];
}
