// Deadlines stored on items (free cancellation, final payment, check-in...).
// v1 lists them on the timeline; the later weekly watch reuses upcomingDeadlines() for alerts.

import { activeList } from "./engine.js";
import { daysUntil } from "./format.js";

/** Deadlines from today (minus a week of grace) up to `horizonDays` ahead, soonest first. */
export function upcomingDeadlines(state, todayIso, horizonDays = 400) {
  const out = [];
  for (const item of activeList(state.items)) {
    for (const d of item.deadlines || []) {
      const daysLeft = daysUntil(d.date, todayIso);
      if (daysLeft < -7 || daysLeft > horizonDays) continue;
      out.push({ itemId: item.id, itemLabel: item.label, kind: d.kind, label: d.label || "", date: d.date, daysLeft, notifyDays: d.notifyDays || [] });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.itemLabel.localeCompare(b.itemLabel));
}
