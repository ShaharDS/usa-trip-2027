// The parts of the trip (a city, the road, the cruise…) and their colours — one place, so the calendar, the
// day-by-day, the map and the date picker always agree. A colour is always shown with the part's name.
import { COLORS } from "../shared/schema.js";
import { tripDays, tripParts } from "../shared/days.js";

export const PART_COLORS = ["blue", "teal", "indigo", "magenta", "green", "gold", "plum", "sky", "brown"].map((k) => COLORS[k]);
export const GAP_COLOR = "#B42335";
export const partColor = (part) => (part.home ? COLORS.slate : part.key === "none" ? GAP_COLOR : PART_COLORS[part.index % PART_COLORS.length]);

const STOP_ICON = { city: "building", road: "route", parks: "ferris", cruise: "ship", beach: "palm", transit: "pin", other: "pin" };
export const partIcon = (part) => (part.home ? "plane" : part.key === "none" ? "alert" : part.stop?.icon || STOP_ICON[part.stop?.kind] || "pin");
export const partName = (part) => (part.home ? "חוזרים הביתה" : part.key === "none" ? "עוד לא נקבע איפה ישנים" : part.stop?.label || "");

/** The route's parts with their colours, and a stop id → {color, label} map (for the date picker). */
export function routeParts(route) {
  const days = tripDays(route);
  const parts = tripParts(days).map((p) => ({ ...p, color: partColor(p) }));
  const byStop = {};
  for (const p of parts) if (p.stop && !byStop[p.stop.id]) byStop[p.stop.id] = { color: p.color, label: p.stop.label };
  return { days, parts, byStop };
}
