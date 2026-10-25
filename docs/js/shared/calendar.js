// The route on a calendar: every part of the trip (a stop) has real dates — its first night (`anchorDate`) and how
// many nights — and the editor picks them on a calendar that shows who already owns each night. Picking a range
// over other parts trims them ("you can override, but you see what's there"). Pure: no DOM, no Firebase.
//
// Older data derived dates instead (`fill` = "takes the nights that are left", and an option's `stopPatch` that
// moved a stop, e.g. the cruise sailing). The first save from the calendar converts the whole route to real dates
// in the same change, and drops those option patches — dates you pick always win.
import { activeList, addDays, diffDays, resolveItinerary } from "./engine.js";

/** Each active stop as the engine resolves it today: {id, label, start (first night), nights}. */
export function stopRanges(plan) {
  return resolveItinerary(plan || {}).stops.map((s) => ({ id: s.id, label: s.label, start: s.start, nights: s.nights || 0 }));
}

/**
 * Every night of the trip (start date … the day before the end date) and who sleeps there:
 * [{date, owners: [stopId…], gap, overlap}].
 */
export function dayOwners(plan) {
  const s = plan?.settings || {};
  if (!s.startDate || !s.endDate || s.endDate <= s.startDate) return [];
  const ranges = stopRanges(plan).filter((r) => r.nights > 0);
  const out = [];
  for (let i = 0, n = diffDays(s.startDate, s.endDate); i < n; i++) {
    const date = addDays(s.startDate, i);
    const owners = ranges.filter((r) => r.start <= date && date < addDays(r.start, r.nights)).map((r) => r.id);
    out.push({ date, owners, gap: owners.length === 0, overlap: owners.length > 1 });
  }
  return out;
}

/** True when every stop already has real dates (no `fill`, every stop anchored, no option moves a stop). */
export function isExplicit(plan) {
  const stops = activeList(plan?.stops);
  return stops.every((s) => s.anchorDate && !s.fill && typeof s.nights === "number")
    && !activeList(plan?.options).some((o) => o.stopPatch && Object.keys(o.stopPatch).length);
}

const upd = (e, rec, id, set) => {
  const changed = Object.fromEntries(Object.entries(set).filter(([k, v]) => (rec?.[k] ?? null) !== (v ?? null)));
  if (!Object.keys(changed).length) return null;
  return { t: "update", e, id, set: changed, before: Object.fromEntries(Object.keys(changed).map((k) => [k, rec?.[k] ?? null])) };
};

/** Ops that give every stop its current resolved dates explicitly and drop option stopPatches (one-time). */
export function explicitOps(plan) {
  const ranges = Object.fromEntries(stopRanges(plan).map((r) => [r.id, r]));
  const ops = [];
  for (const s of activeList(plan?.stops)) {
    const r = ranges[s.id];
    if (!r) continue;
    const op = upd("stops", plan.stops[s.id], s.id, { anchorDate: r.start, nights: r.nights, fill: null });
    if (op) ops.push(op);
  }
  for (const o of activeList(plan?.options)) {
    if (o.stopPatch && Object.keys(o.stopPatch).length) ops.push({ t: "update", e: "options", id: o.id, set: { stopPatch: null }, before: { stopPatch: o.stopPatch } });
  }
  return ops;
}

/**
 * Give a stop (existing id, or a new one with `newStop` = {id, v}) the nights `first` … `last` (inclusive), trim
 * every stop it overlaps (each keeps its larger remaining piece; fully covered → 0 nights, so the editor can remove
 * it), re-order the route by
 * date, and convert everything to real dates.
 * @returns {{ops: any[], overridden: Array<{id, label, from, to}>, nights: number}}
 */
export function assignRangeOps(plan, stopId, first, last, newStop = null) {
  if (!first || !last || last < first) throw new Error("טווח תאריכים לא תקין");
  const nights = diffDays(first, last) + 1;
  const end = addDays(last, 1);
  const ranges = stopRanges(plan).filter((r) => r.id !== stopId);
  const next = {}; // id -> {start, nights}
  const overridden = [];
  for (const r of ranges) {
    const rEnd = addDays(r.start, r.nights);
    if (r.nights > 0 && r.start < end && first < rEnd) {
      const left = r.start < first ? diffDays(r.start, first) : 0;
      const right = rEnd > end ? diffDays(end, rEnd) : 0;
      const from = r.start > first ? r.start : first;
      const to = addDays(rEnd < end ? rEnd : end, -1);
      overridden.push({ id: r.id, label: r.label, from, to });
      if (left === 0 && right === 0) next[r.id] = { start: first, nights: 0 }; // fully covered: no nights, kept just before it
      else if (left >= right) next[r.id] = { start: r.start, nights: left };
      else next[r.id] = { start: end, nights: right };
    } else {
      next[r.id] = { start: r.start, nights: r.nights };
    }
  }
  next[stopId] = { start: first, nights };
  // The route in date order (a stop with no nights keeps its place by its old date).
  const order = Object.entries(next).sort(([a, x], [b, y]) => x.start.localeCompare(y.start) || (a === stopId ? 1 : 0) - (b === stopId ? 1 : 0) || a.localeCompare(b));
  const ops = [];
  order.forEach(([id, r], i) => {
    const set = { anchorDate: r.start, nights: r.nights, fill: null, order: i + 1 };
    if (newStop && id === stopId) {
      ops.push({ t: "create", e: "stops", id, v: { ...newStop.v, anchorDate: r.start, nights: r.nights, order: i + 1 } });
      return;
    }
    const op = upd("stops", plan.stops?.[id], id, set);
    if (op) ops.push(op);
  });
  for (const o of activeList(plan?.options)) {
    if (o.stopPatch && Object.keys(o.stopPatch).length) ops.push({ t: "update", e: "options", id: o.id, set: { stopPatch: null }, before: { stopPatch: o.stopPatch } });
  }
  return { ops, overridden, nights };
}

/** Nights not given to any part, as ranges: [{from, to}] (to = the last such night). */
export function gapRanges(plan) {
  const out = [];
  for (const d of dayOwners(plan)) {
    if (!d.gap) continue;
    const last = out.at(-1);
    if (last && addDays(last.to, 1) === d.date) last.to = d.date;
    else out.push({ from: d.date, to: d.date });
  }
  return out;
}
