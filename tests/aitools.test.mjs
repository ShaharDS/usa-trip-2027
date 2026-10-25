import { test } from "node:test";
import assert from "node:assert/strict";
import { MODE_TOOLS, resolveWithMap, stableStringify, toolCallToOps, toolsFor } from "../docs/js/shared/aitools.js";
import { validateOps } from "../docs/js/shared/validate.js";
import { computeTrip } from "../docs/js/shared/engine.js";
import { ID_PREFIX } from "../docs/js/shared/ops.js";
import { seedDocs } from "./helpers.mjs";

let n = 0;
const makeId = (e) => `${ID_PREFIX[e] || "id"}_t${++n}`;

/** Run tool calls like the aiPropose loop does: convert, resolve temp ids, validate against working docs. */
function runCalls(calls, { allowedUrls = null } = {}) {
  let docs = seedDocs();
  const tempMap = {};
  const all = [];
  for (const [name, input] of calls) {
    const ops = resolveWithMap(toolCallToOps(name, input, docs, { allowedUrls }), tempMap, makeId);
    const v = validateOps(docs, ops);
    assert.equal(v.ok, true, `${name}: ${v.errors?.join(" | ")}`);
    docs = v.docs;
    all.push(...ops);
  }
  return { docs, ops: all, tempMap };
}

const nullItem = {
  label: null, category_id: null, note: null, people: null, people_count: null, unit_id: null, time_by: null, time_stop_ids: null,
  count: null, count_label: null, price_low: null, price_typical: null, price_high: null, currency: null, status: null, actual_total: null,
  option_id: null, sources: null,
};

test("every tool schema lists all properties as required and forbids extras (strict-compatible)", () => {
  for (const mode of Object.keys(MODE_TOOLS)) {
    for (const t of toolsFor(mode)) {
      const s = t.input_schema;
      assert.equal(s.additionalProperties, false, t.name);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), t.name);
      assert.equal(t.strict, true);
    }
  }
});

test("'add Washington for 2 nights after New York' as tool calls", () => {
  const { docs, tempMap } = runCalls([
    ["add_stop", { temp_id: "$dc", label: "וושינגטון", kind: "city", nights: 2, fill: null, anchor_date: null, after_stop_id: "nyc", icon: "landmark", note: null }],
    ["add_item", { ...nullItem, temp_id: "$dc_hotel", label: "מלון בוושינגטון", category_id: "lodging", unit_id: "rooms", time_by: "nights", time_stop_ids: ["$dc"], price_low: 160, price_typical: 220, price_high: 350, currency: "USD", status: "estimate", sources: [{ url: "https://example.com/dc-hotels", label: "x" }] }],
    ["update_item", { ...nullItem, item_id: "food", time_by: "nights", time_stop_ids: ["nyc", "$dc", "road", "orlando", "after"] }],
  ], { allowedUrls: new Set(["https://example.com/dc-hotels"]) });
  const dc = tempMap.$dc;
  const r = computeTrip(docs.plan);
  const nights = Object.fromEntries(r.itinerary.stops.map((s) => [s.id, s.nights]));
  assert.equal(nights[dc], 2);
  assert.equal(nights.orlando, 5);
  const hotel = docs.plan.items[tempMap.$dc_hotel];
  assert.deepEqual(hotel.rule, { unit: "rooms", time: { by: "nights", stopIds: [dc] } });
  assert.equal(hotel.sources.length, 1);
  assert.equal(r.items[tempMap.$dc_hotel].amount.usd.typ, 3 * 2 * 220);
  assert.deepEqual(docs.plan.items.food.rule.time.stopIds, ["nyc", dc, "road", "orlando", "after"]);
  assert.equal(docs.plan.items.food.rule.people, "paying", "other rule factors are kept");
});

test("source URLs not seen in the web search are dropped", () => {
  const { docs, tempMap } = runCalls([
    ["add_item", { ...nullItem, temp_id: "$x", label: "כרטיסים", category_id: "extras", people: "paying", price_typical: 50, currency: "USD", status: "estimate", sources: [{ url: "https://made-up.example/price", label: "fake" }] }],
  ], { allowedUrls: new Set(["https://real.example/"]) });
  assert.equal(docs.plan.items[tempMap.$x].sources, undefined);
});

test("cruise sailing, ship, layout and settings tools", () => {
  const { docs } = runCalls([
    ["choose_option", { group_id: "sailing", option_id: "s1011" }],
    ["choose_option", { group_id: "ship", option_id: "wonder_bal" }],
    ["move_section", { section_id: "sec_route", position: 2 }],
    ["update_settings", { title: null, start_date: null, end_date: null, planning_rate: 3.2, buffer_pct: 12, card_fee_pct: null }],
    ["add_section", { temp_id: "$note", type: "note", title: "חשוב", text: "לבדוק דרכונים" }],
  ]);
  assert.equal(docs.plan.optionGroups.sailing.chosen, "s1011");
  assert.equal(docs.plan.settings.fx.planningRate, 3.2);
  assert.equal(docs.plan.settings.bufferPct, 12);
  const order = Object.entries(docs.plan.sections).sort((a, b) => a[1].order - b[1].order).map(([id]) => id);
  assert.equal(order[1], "sec_route");
  assert.ok(Object.values(docs.plan.sections).some((s) => s.type === "note" && s.text === "לבדוק דרכונים"));
});

test("extraction tools store private details and flights in the private document", () => {
  const { docs } = runCalls([
    ["update_item", { ...nullItem, item_id: "hotel_nyc", status: "booked", actual_total: 7900, currency: "USD" }],
    ["set_booking_private", { item_id: "hotel_nyc", booking_ref: "HX12345", confirmation: null, private_note: "ביטול חינם עד 1.9" }],
    ["add_deadline", { item_id: "hotel_nyc", kind: "freeCancel", date: "2027-09-01", label: null }],
    ["add_flight_segment", { item_id: "flights_intl", carrier: "ly", number: "LY001", date: "2027-09-30", from: "TLV", to: "JFK", sched_dep: "00:45", sched_arr: "05:40" }],
  ]);
  assert.equal(docs.priv.items.hotel_nyc.bookingRef, "HX12345");
  assert.ok(!JSON.stringify(docs.plan).includes("HX12345"));
  assert.equal(computeTrip(docs.plan).items.hotel_nyc.mode, "actual");
  const flight = Object.values(docs.priv.flights)[0];
  assert.equal(flight.carrier, "LY");
  assert.equal(flight.number, "001");
});

test("bad calls fail with a Hebrew message instead of producing ops", () => {
  const docs = seedDocs();
  assert.throws(() => toolCallToOps("update_item", { ...nullItem, item_id: "ghost", label: "x" }, docs), /לא קיים/);
  assert.throws(() => toolCallToOps("add_item", { ...nullItem, temp_id: "$a", label: "x", category_id: "extras" }, docs), /חסר מחיר/);
  assert.throws(() => resolveWithMap([{ t: "update", e: "items", id: "food", set: { "rule.unit": "$nope" } }], {}, makeId), /לא הוגדר/);
  assert.throws(() => toolCallToOps("hack_everything", {}, docs), /לא מוכר/);
});

test("pasted quotes and documents get no removal, settings or layout tools", () => {
  for (const mode of ["quote", "extraction"]) {
    const names = toolsFor(mode).map((t) => t.name);
    for (const forbidden of ["remove_item", "remove_stop", "update_settings", "move_section", "update_section", "set_traveler_count"]) {
      assert.ok(!names.includes(forbidden), `${mode} must not offer ${forbidden}`);
    }
  }
});

test("the expense add box offers cost rows and categories only — nothing that removes or reshapes the trip", () => {
  const names = toolsFor("expense").map((t) => t.name);
  assert.deepEqual([...names].sort(), ["add_category", "add_deadline", "add_item", "update_item"]);
});

test("stableStringify is order-independent and byte-stable", () => {
  assert.equal(stableStringify({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } }), stableStringify({ a: { c: null, d: [3, { x: 2, y: 1 }] }, b: 1 }));
  const docs = seedDocs();
  assert.equal(stableStringify(docs.plan), stableStringify(JSON.parse(JSON.stringify(docs.plan))));
});
