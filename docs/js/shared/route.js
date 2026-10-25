// The route documents everyone but editors read — derived from the plan on every write (commitChange,
// undoChange, applyProposal, adminImport) and never edited directly.
//   public (anyone with the link): dates, the parts of the route with their nights, holidays, how many travel —
//     nothing about places or days (the calendar, map, hotels and places need a sign-in, Shahar 2026-10-25).
//   family (signed in and on the list): the same, plus the full places (hotel names, addresses, map locations,
//     links, notes, photos, files to open) and the days with their titles and notes.
// Neither has prices, cost rows, categories, options, checklist or private data — tests/route.test.mjs checks
// that no amount can leak into them.
import { activeList, resolveItinerary } from "./engine.js";
import { SCHEMA_VERSION } from "./schema.js";

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined && obj[k] !== null && obj[k] !== "").map((k) => [k, obj[k]]));

const FAMILY_PLACE = ["label", "kind", "date", "checkIn", "checkOut", "time", "endTime", "stopId", "city", "region", "maybe", "order",
  "address", "lat", "lng", "mapsUrl", "website", "phone", "note", "photo", "files"];

/**
 * @param plan the plan document
 * @param {{audience?: "public" | "family"}} [opts]
 */
export function routeView(plan, { audience = "public" } = {}) {
  const p = plan || {};
  const it = resolveItinerary(p);
  const family = audience === "family";
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
    ...(family
      ? {
        places: Object.fromEntries(activeList(p.places).map((x) => [x.id, pick(x, FAMILY_PLACE)])),
        days: Object.fromEntries(activeList(p.days).map((x) => [x.id, pick(x, ["date", "title", "note"])])),
      }
      : {}),
  };
}

/** The family document (`trips/{t}/family/state`). */
export const familyView = (plan) => routeView(plan, { audience: "family" });
