// The route documents everyone but editors read — derived from the plan on every write (commitChange,
// undoChange, applyProposal, adminImport) and never edited directly.
//   public (anyone with the link): dates, stops with their nights (after the chosen options), holidays, how many
//     travel, and the day-by-day route reduced to day titles, sight names and cities/states — a hotel is only
//     "לינה ב<city>", and no place has an address, exact location, link, phone, note or photo.
//   family (signed in and on the list): the same, plus the full places (hotel names, addresses, map locations,
//     links, notes, photos) and day notes — everything a phone needs for Waze / Google Maps.
// Neither has prices, cost rows, categories, options, checklist or private data — tests/route.test.mjs checks
// that no amount can leak into them.
import { activeList, resolveItinerary } from "./engine.js";
import { SCHEMA_VERSION } from "./schema.js";

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined && obj[k] !== null && obj[k] !== "").map((k) => [k, obj[k]]));

const PUBLIC_PLACE = ["kind", "date", "checkIn", "checkOut", "time", "endTime", "stopId", "city", "region", "maybe", "order"];
const FAMILY_PLACE = [...PUBLIC_PLACE, "label", "address", "lat", "lng", "mapsUrl", "website", "phone", "note", "photo", "passIds"];

/** ~10 km grid: enough to put a city on the overview map, not enough to find a hotel. */
const coarse = (n) => Math.round(n * 10) / 10;

function placeFor(p, audience) {
  if (audience === "family") return pick(p, FAMILY_PLACE);
  const out = pick(p, PUBLIC_PLACE);
  if (p.kind !== "hotel") out.label = p.label; // sights, food, stops on the way: the name is fine; a hotel stays nameless
  if (typeof p.lat === "number" && typeof p.lng === "number") out.near = [coarse(p.lat), coarse(p.lng)];
  return out;
}

/**
 * @param plan the plan document
 * @param {{audience?: "public" | "family"}} [opts]
 */
export function routeView(plan, { audience = "public" } = {}) {
  const p = plan || {};
  const it = resolveItinerary(p);
  const dayKeys = audience === "family" ? ["date", "title", "note"] : ["date", "title"];
  return {
    schemaVersion: SCHEMA_VERSION,
    audience,
    version: p.version || 0,
    updatedAt: p.updatedAt || null,
    settings: pick(p.settings, ["title", "subtitle", "startDate", "endDate", "contactText"]),
    itinerary: {
      tripNights: it.tripNights,
      stops: it.stops.map((s) => pick(s, ["id", "label", "kind", "icon", "note", "nights", "start", "end", "fill", "region"])),
    },
    holidays: Object.fromEntries(activeList(p.holidays).map((x) => [x.id, pick(x, ["label", "start", "end", "kind", "order"])])),
    travellers: activeList(p.groups).reduce((n, g) => n + (g.count || 0), 0),
    places: Object.fromEntries(activeList(p.places).map((x) => [x.id, placeFor(x, audience)])),
    days: Object.fromEntries(activeList(p.days).map((x) => [x.id, pick(x, dayKeys)])),
  };
}

/** The family document (`trips/{t}/family/state`). */
export const familyView = (plan) => routeView(plan, { audience: "family" });
