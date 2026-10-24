// The public route document — what anyone with the link sees, without signing in. Derived from the plan
// on every write (commitChange, undoChange, applyProposal, adminImport) and never edited directly.
// It holds the route only: dates, stops with their nights (after the chosen options), holidays and how many
// travel. No prices, cost rows, categories, options, checklist or private data — tests/route.test.mjs checks
// that no amount can leak into it.
import { activeList, resolveItinerary } from "./engine.js";
import { SCHEMA_VERSION } from "./schema.js";

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined && obj[k] !== null && obj[k] !== "").map((k) => [k, obj[k]]));

export function routeView(plan) {
  const p = plan || {};
  const it = resolveItinerary(p);
  return {
    schemaVersion: SCHEMA_VERSION,
    version: p.version || 0,
    updatedAt: p.updatedAt || null,
    settings: pick(p.settings, ["title", "subtitle", "startDate", "endDate", "contactText"]),
    itinerary: {
      tripNights: it.tripNights,
      stops: it.stops.map((s) => pick(s, ["id", "label", "kind", "icon", "note", "nights", "start", "end", "fill"])),
    },
    holidays: Object.fromEntries(activeList(p.holidays).map((x) => [x.id, pick(x, ["label", "start", "end", "kind", "order"])])),
    travellers: activeList(p.groups).reduce((n, g) => n + (g.count || 0), 0),
  };
}
