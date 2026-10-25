// The trip day by day, built from a route document (the public one, the family one, or — for editors —
// familyView(plan)). Pure: no DOM, no Firebase.
import { addDays, diffDays } from "./engine.js";
import { COLORS, REGIONS } from "./schema.js";

const list = (map) => Object.entries(map || {}).filter(([, v]) => v && !v.archived).map(([id, v]) => ({ ...v, id }));
const byTime = (a, b) =>
  (a.time || "99:99").localeCompare(b.time || "99:99") || (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id);

/** Id of a day's record ("days" entity): d + the date without dashes, e.g. d20271004. */
export const dayId = (date) => `d${String(date).replace(/-/g, "")}`;

/** "לינה בניו יורק" / "לינה ב-Savannah" (a hyphen before a Latin name). */
export const sleepIn = (city) => (city ? `לינה ב${/^[A-Za-z]/.test(city) ? "-" : ""}${city}` : "לינה");

/** {code, he, color (hex)} for a US state code; unknown codes are shown as they are. */
export function regionInfo(code) {
  if (!code) return null;
  const r = REGIONS[code];
  return { code, he: r?.he || code, color: COLORS[r?.color] || COLORS.slate };
}

/**
 * One entry per date, first day to last:
 * { date, n, of, first, last, title, note, dayId, stop (where we sleep), leaving (the stop we leave today),
 *   places (today's visits / stops, by time), sleep (tonight's hotel), woke (last night's hotel),
 *   checkOut / checkIn (the hotel we leave / reach today, when it changes), moving, regions (state codes in
 *   travel order) }
 */
export function tripDays(route) {
  const s = route?.settings || {};
  if (!s.startDate || !s.endDate || s.endDate < s.startDate) return [];
  const stops = route.itinerary?.stops || [];
  const places = list(route.places);
  const hotels = places.filter((p) => p.kind === "hotel" && p.checkIn && p.checkOut).sort(byTime);
  const dayRecs = list(route.days);
  const of = diffDays(s.startDate, s.endDate) + 1;
  const out = [];
  for (let i = 0; i < of; i++) {
    const date = addDays(s.startDate, i);
    const prev = addDays(date, -1);
    const stop = stops.find((x) => x.nights > 0 && x.start <= date && date < x.end) || null;
    const leaving = stops.find((x) => x.nights > 0 && x.end === date && x.id !== stop?.id) || null;
    const sleep = hotels.find((x) => x.checkIn <= date && date < x.checkOut) || null;
    const woke = hotels.find((x) => x.checkIn <= prev && prev < x.checkOut) || null;
    const today = places.filter((p) => p.kind !== "hotel" && p.date === date).sort(byTime);
    const rec = dayRecs.find((d) => d.date === date);
    const checkOut = woke && woke.id !== sleep?.id ? woke : null;
    const checkIn = sleep && sleep.id !== woke?.id ? sleep : null;
    const regions = [];
    for (const r of [checkOut?.region, leaving?.region, ...today.map((p) => p.region), sleep?.region, stop?.region]) {
      if (r && !regions.includes(r)) regions.push(r);
    }
    out.push({
      date, n: i + 1, of, first: i === 0, last: i === of - 1,
      title: rec?.title || "", note: rec?.note || "", dayId: rec?.id || dayId(date),
      stop, leaving, places: today, sleep, woke, checkOut, checkIn,
      moving: !!(checkOut && checkIn) || !!leaving,
      regions,
    });
  }
  return out;
}

/** Where today falls: {phase: "before" | "during" | "after", index} (index of today's day while "during"). */
export function tripPhase(route, today) {
  const s = route?.settings || {};
  if (!s.startDate || !s.endDate || today < s.startDate) return { phase: "before", index: -1 };
  if (today > s.endDate) return { phase: "after", index: -1 };
  return { phase: "during", index: diffDays(s.startDate, today) };
}

/** Places whose day is outside the trip dates (they don't appear on any day): editors get a warning. */
export function placesOutside(route) {
  const s = route?.settings || {};
  if (!s.startDate || !s.endDate) return [];
  return list(route.places).filter((p) => {
    const from = p.kind === "hotel" ? p.checkIn : p.date;
    const to = p.kind === "hotel" ? addDays(p.checkOut, -1) : p.date;
    return !from || to < s.startDate || from > s.endDate;
  });
}

/**
 * Overview of the nights in order — one point per change of where we sleep — for the route map and the
 * "cities" strip: [{key, label, region, lat, lng, from, nights}]. Family docs have exact places; the public
 * doc only `near` (a ~10 km grid).
 */
export function nightStops(route) {
  const out = [];
  for (const day of tripDays(route)) {
    if (day.last) break;
    const h = day.sleep;
    const key = h ? `h:${h.id}` : day.stop ? `s:${day.stop.id}` : null;
    if (!key) continue;
    const lastPt = out[out.length - 1];
    if (lastPt?.key === key) {
      lastPt.nights += 1;
      continue;
    }
    const pos = h ? (typeof h.lat === "number" ? [h.lat, h.lng] : h.near || null) : null;
    out.push({
      key,
      label: h ? h.label || sleepIn(h.city) : day.stop.label,
      city: h?.city || "",
      region: h?.region || day.stop?.region || "",
      lat: pos?.[0] ?? null,
      lng: pos?.[1] ?? null,
      from: day.date,
      nights: 1,
    });
  }
  return out;
}
