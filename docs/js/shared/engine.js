// Trip cost engine. Pure functions over the public state document — no DOM, no Firebase.
// The browser renders from computeTrip(); Cloud Functions use the same code for AI answers.
//
// Item amount = unit price × quantity, where quantity multiplies the optional factors in item.rule:
//   people (a preset like "paying", or a plain number) × unit (e.g. 3 rooms) × time (nights / days of
//   chosen stops) × count. No factors = a lump sum. A booked/paid item with `actual` uses that total.
// Stop nights come from the itinerary: fixed nights are summed between anchors (trip start, stops with
// an anchorDate, trip end) and the single `fill` stop in each stretch takes what is left.

export const ENGINE_VERSION = 1;

const DAY_MS = 86_400_000;

export function parseDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso, n) {
  return new Date(parseDate(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(fromIso, toIso) {
  return Math.round((parseDate(toIso) - parseDate(fromIso)) / DAY_MS);
}

/** Records of a map, without archived ones, sorted by `order` then id. */
export function activeList(map) {
  return Object.entries(map || {})
    .filter(([, v]) => v && !v.archived)
    .map(([id, v]) => ({ ...v, id }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
}

/** Chosen option per group: explicit override, else the group's `chosen`, else its first option. */
export function chosenOptions(state, choose = {}) {
  const out = {};
  const options = activeList(state.options);
  for (const g of activeList(state.optionGroups)) {
    const inGroup = options.filter((o) => o.groupId === g.id);
    const pick = choose[g.id] ?? g.chosen;
    out[g.id] = inGroup.some((o) => o.id === pick) ? pick : inGroup[0]?.id ?? null;
  }
  return out;
}

function patchedStops(state, chosen) {
  const stops = {};
  for (const [id, s] of Object.entries(state.stops || {})) stops[id] = { ...s };
  for (const optionId of Object.values(chosen)) {
    const patch = optionId && state.options?.[optionId]?.stopPatch;
    if (!patch) continue;
    for (const [stopId, p] of Object.entries(patch)) {
      if (stops[stopId]) Object.assign(stops[stopId], p);
    }
  }
  return stops;
}

/**
 * Resolve nights and dates for every active stop.
 * Returns { stops: [{id,label,kind,icon,nights,start,end,fill,anchored}], tripNights, warnings }.
 * Warning codes: "nightsShort" (stops need more nights than the stretch has), "nightsLeft" (unassigned
 * nights and no fill stop), "manyFills", "anchorOutside".
 */
export function resolveItinerary(state, chosen = chosenOptions(state)) {
  const { startDate, endDate } = state.settings || {};
  const warnings = [];
  const list = activeList(patchedStops(state, chosen));
  const tripNights = startDate && endDate ? Math.max(0, diffDays(startDate, endDate)) : 0;
  if (!startDate || !endDate) return { stops: list.map((s) => ({ ...s, nights: s.nights || 0 })), tripNights, warnings };

  const segments = [];
  let cur = { start: startDate, stops: [] };
  for (const stop of list) {
    if (stop.anchorDate) {
      if (diffDays(startDate, stop.anchorDate) < 0 || diffDays(stop.anchorDate, endDate) < 0) {
        warnings.push({ code: "anchorOutside", stopId: stop.id, date: stop.anchorDate });
      }
      segments.push({ ...cur, end: stop.anchorDate });
      cur = { start: stop.anchorDate, stops: [stop] };
    } else {
      cur.stops.push(stop);
    }
  }
  segments.push({ ...cur, end: endDate });

  const out = [];
  for (const seg of segments) {
    const avail = diffDays(seg.start, seg.end);
    const fills = seg.stops.filter((s) => s.fill);
    const fixed = seg.stops.filter((s) => !s.fill).reduce((sum, s) => sum + (s.nights || 0), 0);
    const remainder = avail - fixed;
    if (fills.length > 1) warnings.push({ code: "manyFills", stopIds: fills.map((s) => s.id) });
    if (remainder < 0) {
      warnings.push({ code: "nightsShort", stopIds: seg.stops.map((s) => s.id), n: -remainder, from: seg.start, to: seg.end });
    } else if (remainder > 0 && fills.length === 0) {
      warnings.push({ code: "nightsLeft", stopIds: seg.stops.map((s) => s.id), n: remainder, from: seg.start, to: seg.end });
    }
    let cursor = seg.start;
    for (const s of seg.stops) {
      const nights = s.fill ? (s === fills[0] ? Math.max(0, remainder) : 0) : s.nights || 0;
      const start = cursor;
      const end = addDays(start, nights);
      out.push({
        id: s.id, label: s.label, kind: s.kind, icon: s.icon, note: s.note, region: s.region,
        nights, start, end, fill: !!s.fill, anchored: !!s.anchorDate,
      });
      cursor = end;
    }
  }
  return { stops: out, tripNights, warnings };
}

/** Number of people a rule counts: a preset id (weighted groups) or a plain number. */
export function peopleCount(state, people) {
  if (typeof people === "number") return people;
  const preset = state.presets?.[people];
  if (!preset) return 0;
  let n = 0;
  for (const g of activeList(state.groups)) n += (g.count || 0) * (preset.weights?.[g.id] ?? 0);
  return n;
}

/** Quantity of an item and the parts that explain it ("7 אנשים × 6 לילות"). */
export function quantityOf(state, item, itinerary) {
  const rule = item.rule || {};
  const parts = [];
  let qty = 1;
  if (rule.people !== undefined && rule.people !== null && rule.people !== "") {
    const n = peopleCount(state, rule.people);
    qty *= n;
    parts.push({ kind: "people", n, presetId: typeof rule.people === "string" ? rule.people : null });
  }
  if (rule.unit) {
    const unit = state.units?.[rule.unit];
    const n = unit && !unit.archived ? unit.count || 0 : 0;
    qty *= n;
    parts.push({ kind: "unit", n, unitId: rule.unit });
  }
  if (rule.time) {
    const ids = rule.time.stopIds?.length ? new Set(rule.time.stopIds) : null;
    const stops = itinerary.stops.filter((s) => !ids || ids.has(s.id));
    const nights = ids ? stops.reduce((sum, s) => sum + s.nights, 0) : itinerary.tripNights;
    const n = rule.time.by === "days" ? (nights > 0 ? nights + 1 : 0) : nights;
    qty *= n;
    parts.push({ kind: rule.time.by, n, stopIds: rule.time.stopIds || [] });
  }
  if (typeof rule.count === "number") {
    qty *= rule.count;
    parts.push({ kind: "count", n: rule.count, label: rule.countLabel || "" });
  }
  return { qty, parts };
}

/** Unit price {low, typical, high, currency} — from a price table cell, or the item's own range. */
export function unitPriceOf(item, chosen) {
  const p = item.price || {};
  if (p.table) {
    const row = chosen[p.table.rowGroup];
    const col = p.table.colGroup ? chosen[p.table.colGroup] : "_";
    const v = p.table.cells?.[row]?.[col];
    if (typeof v !== "number") return { missing: true, low: 0, typical: 0, high: 0, currency: p.currency || "USD", fromTable: true };
    return { low: v, typical: v, high: v, currency: p.currency || "USD", fromTable: true };
  }
  const typical = Number(p.typical) || 0;
  return {
    low: typeof p.low === "number" ? p.low : typical,
    typical,
    high: typeof p.high === "number" ? p.high : typical,
    currency: p.currency || "USD",
  };
}

function money(lowUsd, typUsd, highUsd, rate) {
  return {
    usd: { low: lowUsd, typ: typUsd, high: highUsd },
    ils: { low: lowUsd * rate, typ: typUsd * rate, high: highUsd * rate },
  };
}

function toUsd(amount, currency, rate) {
  return currency === "ILS" ? amount / rate : amount;
}

function addMoney(a, b) {
  return {
    usd: { low: a.usd.low + b.usd.low, typ: a.usd.typ + b.usd.typ, high: a.usd.high + b.usd.high },
    ils: { low: a.ils.low + b.ils.low, typ: a.ils.typ + b.ils.typ, high: a.ils.high + b.ils.high },
  };
}

const ZERO = () => money(0, 0, 0, 1);

function scaleMoney(m, f) {
  return {
    usd: { low: m.usd.low * f, typ: m.usd.typ * f, high: m.usd.high * f },
    ils: { low: m.ils.low * f, typ: m.ils.typ * f, high: m.ils.high * f },
  };
}

/** Whether an item counts with the current choices (items tied to an option count only while it is chosen). */
export function itemIncluded(state, item, chosen) {
  if (item.archived) return false;
  if (!item.optionId) return true;
  const opt = state.options?.[item.optionId];
  return !!opt && chosen[opt.groupId] === item.optionId;
}

/**
 * Full computation.
 * @param state public state document
 * @param opts { choose: {groupId: optionId}, skipOptions: bool }
 */
export function computeTrip(state, opts = {}) {
  const rate = state.settings?.fx?.planningRate || 1;
  const chosen = chosenOptions(state, opts.choose);
  const itinerary = resolveItinerary(state, chosen);
  const warnings = [...itinerary.warnings];
  const items = {};
  const statusTotals = { estimate: ZERO(), quote: ZERO(), booked: ZERO(), paid: ZERO() };
  let subtotal = ZERO();

  for (const item of activeList(state.items)) {
    const included = itemIncluded(state, item, chosen);
    const { qty, parts } = quantityOf(state, item, itinerary);
    const unit = unitPriceOf(item, chosen);
    if (included && unit.missing) warnings.push({ code: "priceMissing", itemId: item.id });
    let amount;
    let mode = unit.fromTable ? "table" : "range";
    const hasActual = item.actual && typeof item.actual.amount === "number" && (item.status === "booked" || item.status === "paid");
    if (hasActual) {
      const v = toUsd(item.actual.amount, item.actual.currency, rate);
      amount = money(v, v, v, rate);
      mode = "actual";
    } else {
      amount = money(
        toUsd(unit.low * qty, unit.currency, rate),
        toUsd(unit.typical * qty, unit.currency, rate),
        toUsd(unit.high * qty, unit.currency, rate),
        rate,
      );
    }
    items[item.id] = { id: item.id, categoryId: item.categoryId, included, qty, parts, unit, mode, amount, status: item.status };
    if (included) {
      subtotal = addMoney(subtotal, amount);
      const bucket = statusTotals[item.status] ? item.status : "estimate";
      statusTotals[bucket] = addMoney(statusTotals[bucket], amount);
    }
  }

  const categories = activeList(state.categories).map((c) => ({
    id: c.id, label: c.label, icon: c.icon, color: c.color, note: c.note,
    itemIds: [], amount: ZERO(),
  }));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  for (const item of activeList(state.items)) {
    const cat = catById[item.categoryId];
    const r = items[item.id];
    if (!cat) {
      if (r.included) warnings.push({ code: "noCategory", itemId: item.id });
      continue;
    }
    cat.itemIds.push(item.id);
    if (r.included) cat.amount = addMoney(cat.amount, r.amount);
  }

  const adjustments = [];
  const bufferPct = state.settings?.bufferPct || 0;
  if (bufferPct > 0) adjustments.push({ id: "buffer", pct: bufferPct, amount: scaleMoney(subtotal, bufferPct / 100) });
  const cardFeePct = state.settings?.cardFeePct || 0;
  if (cardFeePct > 0) adjustments.push({ id: "cardFee", pct: cardFeePct, amount: scaleMoney(subtotal, cardFeePct / 100) });
  let total = subtotal;
  for (const a of adjustments) {
    total = addMoney(total, a.amount);
    statusTotals.estimate = addMoney(statusTotals.estimate, a.amount);
  }

  const everyone = activeList(state.groups).reduce((n, g) => n + (g.count || 0), 0);
  const perPersonPreset = state.settings?.perPersonPreset;
  const perPersonCount = perPersonPreset ? peopleCount(state, perPersonPreset) : everyone;
  const perPerson = perPersonCount > 0 ? scaleMoney(total, 1 / perPersonCount) : ZERO();

  const totalTyp = total.usd.typ;
  const certainty = ["paid", "booked", "quote", "estimate"].map((status) => ({
    status,
    amount: statusTotals[status],
    pct: totalTyp > 0 ? (statusTotals[status].usd.typ / totalTyp) * 100 : 0,
  }));

  const result = {
    engineVersion: ENGINE_VERSION,
    rate,
    chosen,
    itinerary,
    items,
    categories,
    subtotal,
    adjustments,
    total,
    people: { everyone, perPersonCount },
    perPerson,
    byStatus: statusTotals,
    certainty,
    options: {},
    warnings,
  };

  if (!opts.skipOptions) {
    for (const g of activeList(state.optionGroups)) {
      const alternatives = activeList(state.options)
        .filter((o) => o.groupId === g.id)
        .map((o) => {
          if (o.id === chosen[g.id]) return { optionId: o.id, chosen: true, delta: ZERO(), warnings: [] };
          const alt = computeTrip(state, { choose: { ...chosen, [g.id]: o.id }, skipOptions: true });
          return {
            optionId: o.id,
            chosen: false,
            delta: addMoney(alt.total, scaleMoney(total, -1)),
            warnings: alt.warnings.filter((w) => !warnings.some((x) => JSON.stringify(x) === JSON.stringify(w))),
          };
        });
      result.options[g.id] = { chosen: chosen[g.id], alternatives };
    }
  }
  return result;
}

/** Compact numbers kept on the public doc for email / WhatsApp / AI (no need to rerun the engine). */
export function derivedSummary(result, nowIso) {
  const r = (x) => Math.round(x);
  return {
    total: {
      usd: { low: r(result.total.usd.low), typ: r(result.total.usd.typ), high: r(result.total.usd.high) },
      ils: { low: r(result.total.ils.low), typ: r(result.total.ils.typ), high: r(result.total.ils.high) },
    },
    byStatusUsd: Object.fromEntries(Object.entries(result.byStatus).map(([k, v]) => [k, r(v.usd.typ)])),
    computedAt: nowIso,
    engineVersion: ENGINE_VERSION,
  };
}
