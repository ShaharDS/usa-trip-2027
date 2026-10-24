import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrip, resolveItinerary, chosenOptions, peopleCount, quantityOf, diffDays, addDays } from "../docs/js/shared/engine.js";
import { applyOps } from "../docs/js/shared/ops.js";
import { seed, seedDocs, near } from "./helpers.mjs";

const nightsOf = (it) => Object.fromEntries(it.stops.map((s) => [s.id, s.nights]));

test("date helpers", () => {
  assert.equal(diffDays("2027-09-30", "2027-10-18"), 18);
  assert.equal(addDays("2027-09-30", 2), "2027-10-02");
  assert.equal(addDays("2027-12-31", 1), "2028-01-01");
});

test("people presets weight the groups (baby not counted as paying)", () => {
  const s = seed();
  assert.equal(peopleCount(s, "everyone"), 8);
  assert.equal(peopleCount(s, "paying"), 7);
  assert.equal(peopleCount(s, "adults"), 6);
  assert.equal(peopleCount(s, 3), 3);
  assert.equal(peopleCount(s, "nope"), 0);
});

test("default itinerary: Orlando fills the nights until the anchored cruise", () => {
  const s = seed();
  const it = resolveItinerary(s, chosenOptions(s));
  assert.deepEqual(nightsOf(it), { nyc: 6, road: 2, orlando: 7, cruise: 3, after: 0 });
  assert.equal(it.tripNights, 18);
  assert.deepEqual(it.warnings, []);
  const cruise = it.stops.find((x) => x.id === "cruise");
  assert.equal(cruise.start, "2027-10-15");
  assert.equal(cruise.end, "2027-10-18");
  assert.equal(it.stops.find((x) => x.id === "orlando").start, "2027-10-08");
});

test("choosing the 11 Oct 4-night sailing moves nights to after the cruise", () => {
  const s = seed();
  const it = resolveItinerary(s, chosenOptions(s, { sailing: "s1011" }));
  assert.deepEqual(nightsOf(it), { nyc: 6, road: 2, orlando: 3, cruise: 4, after: 3 });
  assert.deepEqual(it.warnings, []);
});

test("an early sailing that cannot fit gives a 'nights short' warning", () => {
  const s = seed();
  const it = resolveItinerary(s, chosenOptions(s, { sailing: "s1001" }));
  const w = it.warnings.find((x) => x.code === "nightsShort");
  assert.ok(w, "expected a nightsShort warning");
  assert.equal(w.n, 7); // NYC 6 + road 2 = 8 nights, but only 1 night until 1 Oct
});

test("adding a city before the cruise shortens Orlando and updates totals", () => {
  const docs = seedDocs();
  const before = computeTrip(docs.plan);
  const { docs: next } = applyOps(docs, [
    { t: "create", e: "stops", id: "dc", v: { label: "וושינגטון", kind: "city", icon: "landmark", nights: 2, order: 1.5 } },
  ]);
  const after = computeTrip(next.plan);
  assert.deepEqual(nightsOf(after.itinerary), { nyc: 6, dc: 2, road: 2, orlando: 5, cruise: 3, after: 0 });
  // Orlando house: 2 fewer nights x $385; cars: 2 fewer days; food: 2 fewer nights for 7 people? (dc not in food stops)
  const house = (r) => r.items.house_orlando.amount.usd.typ;
  assert.ok(near(house(before) - house(after), 2 * 385));
  assert.ok(after.total.usd.typ < before.total.usd.typ);
});

test("quantity parts explain the calculation", () => {
  const s = seed();
  const it = resolveItinerary(s, chosenOptions(s));
  const q = quantityOf(s, s.items.hotel_nyc, it);
  assert.equal(q.qty, 18);
  assert.deepEqual(q.parts.map((p) => [p.kind, p.n]), [["unit", 3], ["nights", 6]]);
  const cars = quantityOf(s, s.items.cars_rental, it);
  assert.equal(cars.qty, 2 * 10); // 2 cars x (2 + 7 + 0 nights + 1) days
  const ins = quantityOf(s, s.items.insurance, it);
  assert.equal(ins.qty, 8 * 19); // everyone x whole-trip days
  const lump = quantityOf(s, s.items.cars_gas, it);
  assert.equal(lump.qty, 1);
  assert.deepEqual(lump.parts, []);
});

test("seed golden totals (update deliberately when the seed changes)", () => {
  const r = computeTrip(seed());
  assert.ok(near(r.subtotal.usd.typ, 48368.96), `subtotal ${r.subtotal.usd.typ}`);
  assert.ok(near(r.total.usd.typ, 53205.856), `total ${r.total.usd.typ}`);
  assert.ok(near(r.total.ils.typ, 53205.856 * 3.11, 0.05));
  assert.ok(r.total.usd.low < r.total.usd.typ && r.total.usd.typ < r.total.usd.high);
  assert.equal(r.people.everyone, 8);
  assert.ok(near(r.perPerson.usd.typ, 53205.856 / 8));
  assert.deepEqual(r.warnings, []);
});

test("categories add up to the subtotal", () => {
  const r = computeTrip(seed());
  const sum = r.categories.reduce((n, c) => n + c.amount.usd.typ, 0);
  assert.ok(near(sum, r.subtotal.usd.typ));
});

test("certainty segments add up to 100%", () => {
  const r = computeTrip(seed());
  const pct = r.certainty.reduce((n, c) => n + c.pct, 0);
  assert.ok(near(pct, 100, 1e-6));
  const quote = r.certainty.find((c) => c.status === "quote");
  assert.ok(near(quote.amount.usd.typ, 8 * 564)); // the cruise fare is a quote
});

test("price table follows both option groups", () => {
  const s = seed();
  const r = computeTrip(s, { choose: { sailing: "s1008", ship: "wonder_bal" } });
  assert.ok(near(r.items.cruise_fare.amount.usd.typ, 8 * 563));
  assert.equal(r.items.cruise_fare.mode, "table");
});

test("option deltas equal recomputing with that option chosen", () => {
  const s = seed();
  const r = computeTrip(s);
  const alt = r.options.ship.alternatives.find((a) => a.optionId === "wonder_in");
  const direct = computeTrip(s, { choose: { ship: "wonder_in" }, skipOptions: true });
  assert.ok(near(alt.delta.usd.typ, direct.total.usd.typ - r.total.usd.typ));
  assert.ok(alt.delta.usd.typ < 0); // Wonder interior is cheaper
  const early = r.options.sailing.alternatives.find((a) => a.optionId === "s1001");
  assert.ok(early.warnings.some((w) => w.code === "nightsShort"));
  assert.equal(r.options.sailing.alternatives.find((a) => a.optionId === "s1015").chosen, true);
});

test("booked items with an actual amount collapse the range", () => {
  const docs = seedDocs();
  const { docs: next } = applyOps(docs, [
    { t: "update", e: "items", id: "hotel_nyc", set: { status: "booked", actual: { amount: 7900, currency: "USD" } } },
  ]);
  const r = computeTrip(next.plan);
  const row = r.items.hotel_nyc;
  assert.equal(row.mode, "actual");
  assert.equal(row.amount.usd.low, 7900);
  assert.equal(row.amount.usd.high, 7900);
  assert.ok(near(r.byStatus.booked.usd.typ, 7900));
});

test("ILS prices convert with the planning rate", () => {
  const docs = seedDocs();
  const { docs: next } = applyOps(docs, [
    { t: "update", e: "items", id: "local_transport", set: { "price.currency": "ILS", "price.low": 1555, "price.typical": 3110, "price.high": 4665 } },
  ]);
  const r = computeTrip(next.plan);
  assert.ok(near(r.items.local_transport.amount.usd.typ, 1000));
  assert.ok(near(r.items.local_transport.amount.ils.typ, 3110));
});

test("items tied to an option only count while it is chosen", () => {
  const docs = seedDocs();
  const { docs: next } = applyOps(docs, [
    { t: "create", e: "items", id: "balcony_upgrade", v: { categoryId: "cruise", label: "שדרוג", optionId: "utopia_bal", rule: {}, price: { typical: 100, currency: "USD" }, status: "estimate" } },
  ]);
  assert.equal(computeTrip(next.plan).items.balcony_upgrade.included, false);
  assert.equal(computeTrip(next.plan, { choose: { ship: "utopia_bal" } }).items.balcony_upgrade.included, true);
});

test("archived records are ignored", () => {
  const docs = seedDocs();
  const base = computeTrip(docs.plan).total.usd.typ;
  const { docs: next } = applyOps(docs, [{ t: "archive", e: "items", id: "cars_gas" }]);
  assert.ok(near(base - computeTrip(next.plan).total.usd.typ, 540 * 1.1));
});
