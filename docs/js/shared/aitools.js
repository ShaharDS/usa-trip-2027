// The AI's edit tools. Each tool call becomes the same ops as a manual edit (ops.js), so the AI can do
// exactly what an editor can do in the forms — and nothing else. Used by the aiPropose Cloud Function;
// kept here (pure JS) so it is unit-tested with the rest of the engine.
//
// Every property is listed in `required` and optional ones accept null, so the schemas also work with
// strict tool use. Ids the AI invents for new records start with "$" (e.g. "$dc") and are replaced with
// real ids server-side.

import { COLORS, CURRENCIES, DEADLINE_KINDS, ENTITIES, ICONS, PLACE_KINDS, SECTION_TYPES, STATUSES, STOP_KINDS } from "./schema.js";
import { dayId } from "./days.js";
import { activeList } from "./engine.js";

const S = {
  str: (description) => ({ type: "string", description }),
  strN: (description) => ({ type: ["string", "null"], description }),
  num: (description) => ({ type: "number", description }),
  numN: (description) => ({ type: ["number", "null"], description }),
  intN: (description) => ({ type: ["integer", "null"], description }),
  boolN: (description) => ({ type: ["boolean", "null"], description }),
  en: (values, description) => ({ type: "string", enum: values, description }),
  enN: (values, description) => ({ type: ["string", "null"], enum: [...values, null], description }),
  arrN: (items, description) => ({ type: ["array", "null"], items, description }),
};

function tool(name, description, properties) {
  return {
    name,
    description,
    input_schema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
  };
}

const TEMP = S.str('New id you choose, starting with "$" (e.g. "$dc"). Use it to refer to this record in later calls.');
const ITEM_FIELDS = {
  label: S.strN("Short Hebrew name of the cost row, e.g. 'מלון בוושינגטון'"),
  category_id: S.strN("Existing category id (or a $temp id from add_category)"),
  note: S.strN("One short Hebrew sentence everyone sees (what is included / assumptions)"),
  people: S.strN("Who is counted: a preset id from `presets` (e.g. 'paying', 'everyone'), or null if not per person"),
  people_count: S.numN("Use instead of `people` for a fixed number of people"),
  unit_id: S.strN("Multiply by a unit's count (e.g. 'rooms', 'cars'), or null"),
  time_by: S.enN(["nights", "days"], "Multiply by nights or days of the stops in time_stop_ids (empty = whole trip), or null"),
  time_stop_ids: S.arrN({ type: "string" }, "Stop ids for time_by; null or [] = whole trip"),
  count: S.numN("Extra fixed multiplier (e.g. 3 park days), or null"),
  count_label: S.strN("What `count` counts, in Hebrew, or null"),
  price_low: S.numN("Low estimate per unit"),
  price_typical: S.numN("Typical price per unit (per person / night / car-day...). With no multipliers it is the total."),
  price_high: S.numN("High estimate per unit"),
  currency: S.enN(CURRENCIES, "USD or ILS"),
  status: S.enN(STATUSES, "estimate = researched guess, quote = a real offer, booked, paid"),
  actual_total: S.numN("For booked/paid rows: the real total paid, in `currency`"),
  option_id: S.strN("Count this row only while this option is chosen, or null"),
  sources: S.arrN({
    type: "object",
    properties: { url: S.str("https URL taken from your web search results"), label: S.str("Short label") },
    required: ["url", "label"],
    additionalProperties: false,
  }, "Where the price comes from (only URLs you actually found)"),
};

const PLACE_FIELDS = {
  label: S.strN("Official name as the place itself writes it (usually English), e.g. 'Hampton Inn Richmond-Downtown'"),
  kind: S.enN(PLACE_KINDS, "hotel = where we sleep (also a cruise ship); sight; food; park (theme park); stop = a stop on the way; flight; port; shop; other"),
  date: S.strN("YYYY-MM-DD — the day of a visit / stop (not for hotels)"),
  check_in: S.strN("Hotels: first night YYYY-MM-DD"),
  check_out: S.strN("Hotels: the morning we leave YYYY-MM-DD (after check_in)"),
  time: S.strN("HH:MM 24h — when we arrive / start (hotels: check-in time), or null"),
  end_time: S.strN("HH:MM 24h, or null"),
  address: S.strN("Full street address from an official source (web search), e.g. '700 E Main St, Richmond, VA 23219'. null if not found — never guess"),
  city: S.strN("City, e.g. 'Richmond'"),
  region: S.strN("US state code, e.g. 'VA' (DC for Washington DC)"),
  website: S.strN("Official https website, only from your search results"),
  phone: S.strN("Phone as written on the official site, or null"),
  note: S.strN("One or two short Hebrew sentences the family sees (what it is / tips), or null"),
  maybe: S.boolN("true = 'אולי נעצור' (optional stop)"),
  maps_url: S.strN("A Google Maps link the user pasted for THIS place (copy it exactly), or null"),
  wikipedia_title: S.strN("For a famous sight / city: the English Wikipedia article title (for a photo), or null"),
};

const ALL_TOOLS = {
  add_stop: tool("add_stop", "Add a city or leg to the route. Its nights are taken from the 'fill' stop (usually Orlando) of the same stretch.", {
    temp_id: TEMP,
    label: S.str("Hebrew name, e.g. 'וושינגטון'"),
    kind: S.en(STOP_KINDS, "Type of stop"),
    nights: S.intN("Number of nights (null if fill)"),
    fill: S.boolN("true = takes whatever nights are left until the next fixed date"),
    anchor_date: S.strN("Fixed start date YYYY-MM-DD (e.g. a cruise departure), or null"),
    after_stop_id: S.strN("Place it right after this stop id; null = at the start"),
    icon: S.enN(ICONS, "Icon"),
    note: S.strN("Short Hebrew note"),
  }),
  update_stop: tool("update_stop", "Change a stop. Pass null for fields that stay the same.", {
    stop_id: S.str("Stop id"),
    label: S.strN("New name"),
    kind: S.enN(STOP_KINDS, "Type"),
    nights: S.intN("Nights"),
    fill: S.boolN("Fill remaining nights"),
    anchor_date: S.strN("Fixed start date YYYY-MM-DD; empty string removes it"),
    icon: S.enN(ICONS, "Icon"),
    note: S.strN("Note"),
  }),
  remove_stop: tool("remove_stop", "Remove a stop from the route (it can be restored).", { stop_id: S.str("Stop id") }),
  add_category: tool("add_category", "Add a high-level cost category (e.g. 'אטרקציות'). Keep categories few and broad.", {
    temp_id: TEMP,
    label: S.str("Hebrew name"),
    icon: S.en(ICONS, "Icon"),
    color: S.en(Object.keys(COLORS), "Color"),
    note: S.strN("Note"),
  }),
  update_category: tool("update_category", "Change a category. null = unchanged.", {
    category_id: S.str("Category id"),
    label: S.strN("Name"),
    icon: S.enN(ICONS, "Icon"),
    color: S.enN(Object.keys(COLORS), "Color"),
    note: S.strN("Note"),
  }),
  add_item: tool("add_item", "Add a high-level cost row (not tiny items). amount = price × the multipliers you set.", { temp_id: TEMP, ...ITEM_FIELDS }),
  update_item: tool("update_item", "Change an existing cost row. Pass null for every field that stays the same.", { item_id: S.str("Item id"), ...ITEM_FIELDS }),
  remove_item: tool("remove_item", "Remove a cost row (it can be restored).", { item_id: S.str("Item id") }),
  set_unit_count: tool("set_unit_count", "Change how many rooms / cars / cabins there are.", { unit_id: S.str("Unit id"), count: S.num("New count") }),
  add_unit: tool("add_unit", "Add a countable unit (e.g. 'תאים בשייט').", { temp_id: TEMP, label: S.str("Hebrew name"), count: S.num("Count") }),
  set_traveler_count: tool("set_traveler_count", "Change how many travelers are in a group.", { group_id: S.str("Group id"), count: S.num("New count") }),
  add_option_group: tool("add_option_group", "Add a question with alternatives (e.g. 'באיזה מלון?'). Only the chosen option counts in the total.", {
    temp_id: TEMP, label: S.str("Short Hebrew question"), question: S.strN("Longer explanation"),
  }),
  add_option: tool("add_option", "Add an alternative to a question. Optionally it moves a stop's date/nights when chosen.", {
    temp_id: TEMP,
    group_id: S.str("Question id"),
    label: S.str("Hebrew label"),
    details: S.strN("Details"),
    patch_stop_id: S.strN("Stop whose date/nights change when this option is chosen"),
    patch_anchor_date: S.strN("New start date YYYY-MM-DD for that stop"),
    patch_nights: S.intN("New nights for that stop"),
  }),
  choose_option: tool("choose_option", "Choose which alternative counts in the total.", { group_id: S.str("Question id"), option_id: S.str("Option id") }),
  update_settings: tool("update_settings", "Change trip settings. null = unchanged.", {
    title: S.strN("Trip title"),
    start_date: S.strN("YYYY-MM-DD"),
    end_date: S.strN("YYYY-MM-DD"),
    planning_rate: S.numN("ILS per USD used for all totals"),
    buffer_pct: S.numN("Safety buffer %"),
    card_fee_pct: S.numN("Card FX fee %"),
  }),
  add_deadline: tool("add_deadline", "Add a date to remember on a row (free cancellation, final payment...).", {
    item_id: S.str("Item id"), kind: S.en(DEADLINE_KINDS, "Kind"), date: S.str("YYYY-MM-DD"), label: S.strN("Hebrew label"),
  }),
  add_checklist_row: tool("add_checklist_row", "Add a to-do (e.g. 'להוציא ESTA').", { label: S.str("Hebrew task"), due_date: S.strN("YYYY-MM-DD or null") }),
  add_section: tool("add_section", "Add a section to the home page.", {
    temp_id: TEMP, type: S.en(SECTION_TYPES, "Section type"), title: S.strN("Title or null for default"), text: S.strN("Text (for type 'note')"),
  }),
  update_section: tool("update_section", "Change a home-page section (title, text, shown/hidden). null = unchanged.", {
    section_id: S.str("Section id"), title: S.strN("Title"), text: S.strN("Text"), visible: S.boolN("Shown on the home page"),
  }),
  move_section: tool("move_section", "Move a home-page section to a position (1 = top).", { section_id: S.str("Section id"), position: S.num("1-based position") }),
  set_booking_private: tool("set_booking_private", "Store private booking details for a row (family-only).", {
    item_id: S.str("Item id"), booking_ref: S.strN("Booking code"), confirmation: S.strN("Confirmation number"), private_note: S.strN("Private note"),
  }),
  add_place: tool("add_place", "Add a place to the day-by-day route: a hotel (with check_in / check_out), a sight, a meal, a stop on the way. The server finds the exact map location from maps_url or the address — never give coordinates.", {
    temp_id: TEMP, ...PLACE_FIELDS,
  }),
  update_place: tool("update_place", "Change a place on the route. null = unchanged. Give maps_url or a new address to move its map location.", {
    place_id: S.str("Place id"), ...PLACE_FIELDS,
  }),
  remove_place: tool("remove_place", "Remove a place from the route (it can be restored).", { place_id: S.str("Place id") }),
  set_day: tool("set_day", "Give a day of the trip a short Hebrew title (e.g. 'יום ביוניברסל') and / or a note.", {
    date: S.str("YYYY-MM-DD"), title: S.strN("Short Hebrew title, or null"), note: S.strN("Short Hebrew note, or null"),
  }),
  add_flight_segment: tool("add_flight_segment", "Record a flight from a ticket so changes can be watched later.", {
    item_id: S.strN("Flight cost row id"), carrier: S.str("Airline IATA code, e.g. LY"), number: S.str("Flight number digits"),
    date: S.str("YYYY-MM-DD"), from: S.strN("Airport IATA"), to: S.strN("Airport IATA"), sched_dep: S.strN("HH:MM local"), sched_arr: S.strN("HH:MM local"),
  }),
};

const PLACES = ["add_place", "update_place", "remove_place", "set_day"];
const EDIT = ["add_stop", "update_stop", "remove_stop", "add_category", "update_category", "add_item", "update_item", "remove_item", "set_unit_count", "add_unit",
  "set_traveler_count", "add_option_group", "add_option", "choose_option", "update_settings", "add_deadline", "add_checklist_row", "add_section", "update_section", "move_section",
  ...PLACES];

/**
 * Tools offered per mode. Pasted quotes and documents can't remove things, change settings or the layout.
 * "expense" = the add box inside "לאן הולך הכסף" (typed or spoken): cost rows and categories only.
 */
export const MODE_TOOLS = {
  sentence: EDIT,
  expense: ["add_category", "add_item", "update_item", "add_deadline"],
  place: [...PLACES, "add_stop", "update_stop"], // "+ הוספת מקום" on a day: the route only, no prices
  quote: ["add_item", "update_item", "add_option", "choose_option", "add_deadline", "add_checklist_row"],
  extraction: ["add_item", "update_item", "add_deadline", "set_booking_private", "add_flight_segment", "add_checklist_row"],
};

export function toolsFor(mode, { strict = true } = {}) {
  return (MODE_TOOLS[mode] || []).map((n) => (strict ? { ...ALL_TOOLS[n], strict: true } : ALL_TOOLS[n]));
}

// ---- tool call -> ops -----------------------------------------------------------------------------

const has = (v) => v !== null && v !== undefined;
const isTemp = (id) => typeof id === "string" && id.startsWith("$");

function recordOf(docs, e, id) {
  const def = ENTITIES[e];
  const doc = def.doc === "plan" ? docs.plan : docs.priv;
  return def.singleton ? doc?.[def.path] : doc?.[def.path]?.[id];
}

function requireExisting(docs, e, id, labelHe) {
  if (!recordOf(docs, e, id)) throw new Error(`לא קיים ${labelHe} עם המזהה "${id}"`);
}

function orderAfter(map, afterId) {
  const list = activeList(map);
  if (!afterId) return (list[0]?.order ?? 1) - 1;
  const i = list.findIndex((x) => x.id === afterId);
  if (i < 0) throw new Error(`לא קיימת עצירה "${afterId}"`);
  const a = list[i].order ?? i;
  const b = list[i + 1]?.order ?? a + 2;
  return (a + b) / 2;
}

const nextOrder = (map) => Math.max(0, ...activeList(map).map((x) => x.order ?? 0)) + 1;

function itemRule(input, base = {}) {
  const rule = structuredClone(base || {});
  if ("people" in input || "people_count" in input) {
    if (has(input.people_count)) rule.people = input.people_count;
    else if (has(input.people)) rule.people = input.people;
  }
  if (has(input.unit_id)) rule.unit = input.unit_id;
  if (has(input.time_by)) rule.time = { by: input.time_by, ...(has(input.time_stop_ids) && input.time_stop_ids.length ? { stopIds: input.time_stop_ids } : {}) };
  else if (has(input.time_stop_ids) && rule.time) rule.time = { ...rule.time, stopIds: input.time_stop_ids };
  if (has(input.count)) rule.count = input.count;
  if (has(input.count_label)) rule.countLabel = input.count_label;
  return rule;
}

function itemPrice(input, base) {
  const price = structuredClone(base || { currency: "USD" });
  if (has(input.price_low)) price.low = input.price_low;
  if (has(input.price_typical)) price.typical = input.price_typical;
  if (has(input.price_high)) price.high = input.price_high;
  if (has(input.currency)) price.currency = input.currency;
  if (!has(price.currency)) price.currency = "USD";
  return price;
}

function setIfGiven(set, input, map) {
  for (const [from, to] of Object.entries(map)) if (has(input[from])) set[to] = input[from];
}

/**
 * Convert one tool call to ops against `docs` (the working documents, with earlier calls already applied).
 * Throws an Error with a Hebrew message for impossible calls (the model gets it back as a tool error).
 * `allowedUrls`: Set of URLs seen in this call's web searches — other source URLs are dropped.
 * @param {string} name
 * @param {any} input
 * @param {{plan: any, priv: any}} docs
 * @param {{allowedUrls?: Set<string> | null}} [opts]
 * @returns {any[]}
 */
export function toolCallToOps(name, input, docs, { allowedUrls = null } = {}) {
  const plan = docs.plan;
  const sources = (list) => {
    if (!Array.isArray(list)) return undefined;
    const ok = list.filter((s) => s?.url && /^https:\/\//.test(s.url) && (!allowedUrls || allowedUrls.has(s.url)));
    return ok.length ? ok.slice(0, 5).map((s) => ({ url: s.url, label: String(s.label || "").slice(0, 80), checkedAt: new Date().toISOString().slice(0, 10) })) : undefined;
  };
  // A place's website is kept only if its site came up in this call's web searches (like row sources).
  const host = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  const siteSeen = (u) => !u || !allowedUrls || [...allowedUrls].some((x) => host(x) === host(u));
  switch (name) {
    case "add_stop": {
      const v = { label: input.label, kind: input.kind, order: orderAfter(plan.stops, input.after_stop_id) };
      if (input.fill) v.fill = true;
      else v.nights = Math.max(0, Math.round(input.nights ?? 1));
      if (has(input.anchor_date) && input.anchor_date) v.anchorDate = input.anchor_date;
      if (has(input.icon)) v.icon = input.icon;
      if (has(input.note) && input.note) v.note = input.note;
      return [{ t: "create", e: "stops", id: input.temp_id, v }];
    }
    case "update_stop": {
      requireExisting(docs, "stops", input.stop_id, "עצירה");
      const rec = plan.stops[input.stop_id];
      const set = {};
      setIfGiven(set, input, { label: "label", kind: "kind", icon: "icon", note: "note" });
      if (has(input.nights)) set.nights = Math.max(0, Math.round(input.nights));
      if (has(input.fill)) set.fill = input.fill ? true : null;
      if (has(input.anchor_date)) set.anchorDate = input.anchor_date || null;
      if (!Object.keys(set).length) throw new Error("לא צוין מה לשנות בעצירה");
      return [{ t: "update", e: "stops", id: input.stop_id, set, before: Object.fromEntries(Object.keys(set).map((k) => [k, rec[k] ?? null])) }];
    }
    case "remove_stop":
      requireExisting(docs, "stops", input.stop_id, "עצירה");
      return [{ t: "archive", e: "stops", id: input.stop_id }];
    case "add_category": {
      const v = { label: input.label, icon: input.icon, color: input.color, order: nextOrder(plan.categories) };
      if (input.note) v.note = input.note;
      return [{ t: "create", e: "categories", id: input.temp_id, v }];
    }
    case "update_category": {
      requireExisting(docs, "categories", input.category_id, "קטגוריה");
      const rec = plan.categories[input.category_id];
      const set = {};
      setIfGiven(set, input, { label: "label", icon: "icon", color: "color", note: "note" });
      if (!Object.keys(set).length) throw new Error("לא צוין מה לשנות בקטגוריה");
      return [{ t: "update", e: "categories", id: input.category_id, set, before: Object.fromEntries(Object.keys(set).map((k) => [k, rec[k] ?? null])) }];
    }
    case "add_item": {
      if (!has(input.price_typical)) throw new Error("חסר מחיר רגיל (price_typical)");
      if (!input.label) throw new Error("חסר שם לשורה");
      const v = {
        categoryId: input.category_id, label: input.label, order: nextOrder(plan.items), rule: itemRule(input), price: itemPrice(input),
        status: input.status || "estimate", tag: input.status === "quote" ? undefined : "E",
      };
      if (!v.tag) delete v.tag;
      if (input.note) v.note = input.note;
      if (has(input.option_id)) v.optionId = input.option_id;
      if (has(input.actual_total) && (v.status === "booked" || v.status === "paid")) v.actual = { amount: input.actual_total, currency: v.price.currency };
      const src = sources(input.sources);
      if (src) v.sources = src;
      return [{ t: "create", e: "items", id: input.temp_id, v }];
    }
    case "update_item": {
      requireExisting(docs, "items", input.item_id, "שורה");
      const rec = plan.items[input.item_id];
      const set = {};
      setIfGiven(set, input, { label: "label", category_id: "categoryId", note: "note", status: "status", option_id: "optionId" });
      const touchesRule = ["people", "people_count", "unit_id", "time_by", "time_stop_ids", "count", "count_label"].some((k) => has(input[k]));
      if (touchesRule) set.rule = itemRule(input, rec.rule);
      const touchesPrice = ["price_low", "price_typical", "price_high", "currency"].some((k) => has(input[k]));
      if (touchesPrice) {
        if (rec.price?.table && has(input.price_typical)) throw new Error("לשורה הזו יש טבלת מחירים לפי אפשרויות — עדכנו אותה בעריכה ידנית");
        set.price = itemPrice(input, rec.price);
      }
      if (has(input.actual_total)) set.actual = { amount: input.actual_total, currency: input.currency || rec.price?.currency || "USD" };
      const src = sources(input.sources);
      if (src) set.sources = [...(rec.sources || []), ...src].slice(-10);
      if (!Object.keys(set).length) throw new Error("לא צוין מה לשנות בשורה");
      return [{ t: "update", e: "items", id: input.item_id, set, before: Object.fromEntries(Object.keys(set).map((k) => [k, rec[k] ?? null])) }];
    }
    case "remove_item":
      requireExisting(docs, "items", input.item_id, "שורה");
      return [{ t: "archive", e: "items", id: input.item_id }];
    case "set_unit_count": {
      requireExisting(docs, "units", input.unit_id, "יחידה");
      const n = Math.max(0, Math.round(input.count));
      return [{ t: "update", e: "units", id: input.unit_id, set: { count: n }, before: { count: plan.units[input.unit_id].count ?? null } }];
    }
    case "add_unit":
      return [{ t: "create", e: "units", id: input.temp_id, v: { label: input.label, count: Math.max(0, Math.round(input.count)), order: nextOrder(plan.units) } }];
    case "set_traveler_count": {
      requireExisting(docs, "groups", input.group_id, "קבוצת נוסעים");
      const n = Math.max(0, Math.round(input.count));
      return [{ t: "update", e: "groups", id: input.group_id, set: { count: n }, before: { count: plan.groups[input.group_id].count ?? null } }];
    }
    case "add_option_group": {
      const v = { label: input.label, order: nextOrder(plan.optionGroups) };
      if (input.question) v.question = input.question;
      return [{ t: "create", e: "optionGroups", id: input.temp_id, v }];
    }
    case "add_option": {
      if (!isTemp(input.group_id)) requireExisting(docs, "optionGroups", input.group_id, "שאלה");
      const v = { groupId: input.group_id, label: input.label, order: nextOrder(Object.fromEntries(Object.entries(plan.options || {}).filter(([, o]) => o.groupId === input.group_id))) };
      if (input.details) v.details = input.details;
      if (has(input.patch_stop_id)) {
        const p = {};
        if (has(input.patch_anchor_date)) p.anchorDate = input.patch_anchor_date;
        if (has(input.patch_nights)) p.nights = Math.max(0, Math.round(input.patch_nights));
        if (Object.keys(p).length) v.stopPatch = { [input.patch_stop_id]: p };
      }
      return [{ t: "create", e: "options", id: input.temp_id, v }];
    }
    case "choose_option": {
      if (!isTemp(input.group_id)) requireExisting(docs, "optionGroups", input.group_id, "שאלה");
      return [{ t: "choose", groupId: input.group_id, optionId: input.option_id, before: plan.optionGroups?.[input.group_id]?.chosen ?? null }];
    }
    case "update_settings": {
      const s = plan.settings || {};
      const set = {};
      setIfGiven(set, input, { title: "title", start_date: "startDate", end_date: "endDate", buffer_pct: "bufferPct", card_fee_pct: "cardFeePct" });
      if (has(input.planning_rate)) {
        set["fx.planningRate"] = input.planning_rate;
        set["fx.planningRateDate"] = new Date().toISOString().slice(0, 10);
      }
      if (!Object.keys(set).length) throw new Error("לא צוין מה לשנות בהגדרות");
      const before = {};
      for (const k of Object.keys(set)) before[k] = k.split(".").reduce((x, p) => (x == null ? undefined : x[p]), s) ?? null;
      return [{ t: "update", e: "settings", id: "_", set, before }];
    }
    case "add_deadline": {
      if (!isTemp(input.item_id)) requireExisting(docs, "items", input.item_id, "שורה");
      const rec = plan.items?.[input.item_id];
      const deadlines = [...(rec?.deadlines || []), { kind: input.kind, date: input.date, ...(input.label ? { label: input.label } : {}) }];
      return [{ t: "update", e: "items", id: input.item_id, set: { deadlines }, before: { deadlines: rec?.deadlines ?? null } }];
    }
    case "add_checklist_row":
      return [{ t: "create", e: "checklist", id: `$todo${Object.keys(plan.checklist || {}).length + 1}_${Math.random().toString(36).slice(2, 6)}`, v: { label: input.label, done: false, order: nextOrder(plan.checklist), ...(input.due_date ? { dueDate: input.due_date } : {}) } }];
    case "add_section":
      return [{ t: "create", e: "sections", id: input.temp_id, v: { type: input.type, visible: true, order: nextOrder(plan.sections), ...(input.title ? { title: input.title } : {}), ...(input.text ? { text: input.text } : {}) } }];
    case "update_section": {
      requireExisting(docs, "sections", input.section_id, "חלק בעמוד");
      const rec = plan.sections[input.section_id];
      const set = {};
      setIfGiven(set, input, { title: "title", text: "text", visible: "visible" });
      if (!Object.keys(set).length) throw new Error("לא צוין מה לשנות");
      return [{ t: "update", e: "sections", id: input.section_id, set, before: Object.fromEntries(Object.keys(set).map((k) => [k, rec[k] ?? null])) }];
    }
    case "move_section": {
      requireExisting(docs, "sections", input.section_id, "חלק בעמוד");
      const list = activeList(plan.sections).filter((s) => s.id !== input.section_id);
      const pos = Math.min(Math.max(1, Math.round(input.position)), list.length + 1);
      list.splice(pos - 1, 0, { id: input.section_id, ...plan.sections[input.section_id] });
      return list
        .map((s, i) => ({ s, order: i + 1 }))
        .filter(({ s, order }) => (plan.sections[s.id].order ?? null) !== order)
        .map(({ s, order }) => ({ t: "update", e: "sections", id: s.id, set: { order }, before: { order: plan.sections[s.id].order ?? null } }));
    }
    case "set_booking_private": {
      if (!isTemp(input.item_id)) requireExisting(docs, "items", input.item_id, "שורה");
      const rec = docs.priv?.items?.[input.item_id];
      const v = {};
      setIfGiven(v, input, { booking_ref: "bookingRef", confirmation: "confirmation", private_note: "privateNote" });
      if (!Object.keys(v).length) throw new Error("אין פרטים לשמור");
      return rec
        ? [{ t: "update", e: "privateItems", id: input.item_id, set: v, before: Object.fromEntries(Object.keys(v).map((k) => [k, rec[k] ?? null])) }]
        : [{ t: "create", e: "privateItems", id: input.item_id, v }];
    }
    case "add_place": {
      if (!input.label) throw new Error("חסר שם למקום");
      const v = { label: input.label, kind: input.kind || "sight", order: nextOrder(plan.places) };
      Object.assign(v, placeFields(input, v.kind));
      if (!siteSeen(v.website)) delete v.website;
      return [{ t: "create", e: "places", id: input.temp_id, v }];
    }
    case "update_place": {
      requireExisting(docs, "places", input.place_id, "מקום");
      const rec = plan.places[input.place_id];
      const kind = input.kind || rec.kind;
      const set = placeFields(input, kind, rec);
      if (!siteSeen(set.website)) delete set.website;
      if (has(input.label)) set.label = input.label;
      if (has(input.kind)) set.kind = input.kind;
      if (!Object.keys(set).length) throw new Error("לא צוין מה לשנות במקום");
      return [{ t: "update", e: "places", id: input.place_id, set, before: Object.fromEntries(Object.keys(set).map((k) => [k, rec[k] ?? null])) }];
    }
    case "remove_place":
      requireExisting(docs, "places", input.place_id, "מקום");
      return [{ t: "archive", e: "places", id: input.place_id }];
    case "set_day": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date))) throw new Error("תאריך לא תקין");
      const id = dayId(input.date);
      const rec = plan.days?.[id];
      const set = {};
      setIfGiven(set, input, { title: "title", note: "note" });
      if (!Object.keys(set).length) throw new Error("לא צוין מה לשנות ביום");
      return rec
        ? [{ t: "update", e: "days", id, set, before: Object.fromEntries(Object.keys(set).map((k) => [k, rec[k] ?? null])) }]
        : [{ t: "create", e: "days", id, v: { date: input.date, ...set } }];
    }
    case "add_flight_segment": {
      const v = { carrier: String(input.carrier).toUpperCase().slice(0, 3), number: String(input.number).replace(/\D/g, "").slice(0, 6), date: input.date };
      if (has(input.item_id)) v.itemId = input.item_id;
      setIfGiven(v, input, { from: "from", to: "to", sched_dep: "schedDep", sched_arr: "schedArr" });
      return [{ t: "create", e: "flights", id: `$flt_${v.carrier}${v.number}_${String(v.date).replace(/-/g, "")}`, v }];
    }
    default:
      throw new Error(`כלי לא מוכר: ${name}`);
  }
}

/**
 * A place's fields from a tool call. The map location (_lat / _lng), the state found by the geocoder
 * (_region), an expanded Google Maps link (_maps_url) and a Wikipedia photo (_photo) are added by the server
 * before this runs — the model's own input can't carry them (strict schema), so coordinates never come from it.
 */
function placeFields(input, kind, rec = null) {
  const out = {};
  setIfGiven(out, input, { address: "address", city: "city", website: "website", phone: "phone", note: "note", time: "time", end_time: "endTime" });
  if (has(input.region) && input.region) out.region = String(input.region).toUpperCase().slice(0, 4);
  else if (has(input._region) && !rec?.region) out.region = input._region;
  if (kind === "hotel") {
    if (has(input.check_in)) out.checkIn = input.check_in;
    if (has(input.check_out)) out.checkOut = input.check_out;
    if (rec && rec.kind !== "hotel") {
      out.date = null;
      out.endTime = null;
      out.maybe = null;
    }
  } else {
    if (has(input.date)) out.date = input.date;
    if (has(input.maybe)) out.maybe = input.maybe ? true : null;
    if (rec?.kind === "hotel") {
      out.checkIn = null;
      out.checkOut = null;
    }
  }
  if (out.website && !/^https:\/\//.test(out.website)) delete out.website;
  if (has(input._lat) && has(input._lng)) {
    out.lat = input._lat;
    out.lng = input._lng;
  }
  if (has(input._maps_url)) out.mapsUrl = input._maps_url;
  if (has(input._photo)) out.photo = input._photo;
  return out;
}

/**
 * Replace "$temp" ids with real ids, remembering them across tool calls (a later call may refer to a
 * record created by an earlier one). Mutates `tempMap`.
 * @param {any[]} ops
 * @param {Record<string, string>} tempMap
 * @param {(entity: string) => string} makeId
 * @returns {any[]}
 */
export function resolveWithMap(ops, tempMap, makeId) {
  for (const op of ops) {
    if (op.t === "create" && isTemp(op.id) && !tempMap[op.id]) tempMap[op.id] = makeId(op.e);
  }
  const swap = (x) => {
    if (typeof x === "string") return tempMap[x] ?? x;
    if (Array.isArray(x)) return x.map(swap);
    if (x && typeof x === "object") {
      const out = {};
      for (const [k, v] of Object.entries(x)) out[tempMap[k] ?? k] = swap(v);
      return out;
    }
    return x;
  };
  const resolved = ops.map(swap);
  const leftover = JSON.stringify(resolved).match(/"\$[A-Za-z0-9_-]+"/);
  if (leftover) throw new Error(`מזהה זמני ${leftover[0]} לא הוגדר קודם (צריך ליצור אותו לפני שמשתמשים בו)`);
  return resolved;
}

/** Deterministic JSON (sorted keys) so the cached prompt prefix is byte-identical for the same data. */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}
