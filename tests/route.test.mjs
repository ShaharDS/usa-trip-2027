import { test } from "node:test";
import assert from "node:assert/strict";
import { familyView, routeView } from "../docs/js/shared/route.js";
import { applyOps } from "../docs/js/shared/ops.js";
import { seed, seedDocs } from "./helpers.mjs";

// The only numbers the route documents may contain. Anything else could be an amount.
const ALLOWED_NUMBERS = new Set(["schemaVersion", "version", "tripNights", "nights", "travellers", "order"]);
const PLACE_NUMBERS = new Set(["lat", "lng"]); // family only: exact map location of a place
const PLAN_ONLY_KEYS = ["items", "categories", "price", "actual", "options", "optionGroups", "units", "presets", "checklist", "sections", "derived", "recent", "fx", "bufferPct", "cardFeePct", "notIncluded", "updatedByLabel", "groups"];

function walk(x, path, out) {
  if (Array.isArray(x)) x.forEach((v, i) => walk(v, [...path, i], out));
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) walk(v, [...path, k], out);
  else out.push({ path, value: x });
  return out;
}

function assertNoMoney(route, allowedNumber) {
  for (const { path, value } of walk(route, [], [])) {
    if (typeof value === "number") assert.ok(allowedNumber(path), `number at ${path.join(".")}`);
    if (typeof value === "string") assert.ok(!/[$₪]/.test(value), `money sign at ${path.join(".")}: ${value}`);
  }
  const keys = new Set(walk(route, [], []).flatMap(({ path }) => path.filter((p) => typeof p === "string")));
  for (const k of PLAN_ONLY_KEYS) assert.ok(!keys.has(k), `plan-only key "${k}" in the route (${route.audience})`);
}

test("the public route has no amounts and no cost data", () => {
  assertNoMoney(routeView(seed()), (path) => ALLOWED_NUMBERS.has(String(path.at(-1))));
});

test("the family route has no amounts either — only exact map locations on top", () => {
  assertNoMoney(familyView(seed()), (path) => ALLOWED_NUMBERS.has(String(path.at(-1))) || (path[0] === "places" && PLACE_NUMBERS.has(String(path.at(-1)))));
});

test("public: no places and no days at all — the calendar, map, hotels and places need a sign-in", () => {
  const pub = routeView(seed());
  assert.equal(pub.places, undefined);
  assert.equal(pub.days, undefined);
  assert.ok(pub.itinerary.stops.length > 0, "the parts of the route (cities, nights) stay public");
});

test("family: hotel names, addresses and map locations are there", () => {
  const fam = familyView(seed());
  assert.equal(fam.audience, "family");
  assert.equal(fam.places.plc_nyc_hotel.label, "Hilton Garden Inn Times Square Central");
  assert.equal(fam.places.plc_nyc_hotel.address, "136 W 42nd St, New York, NY 10036");
  assert.equal(typeof fam.places.plc_nyc_hotel.lat, "number");
  assert.ok(fam.days.d20270930.note);
});

test("the public route carries the resolved itinerary, holidays and how many travel", () => {
  const route = routeView(seed());
  assert.deepEqual(route.itinerary.stops.map((s) => [s.id, s.nights]), [["nyc", 6], ["road", 2], ["orlando", 7], ["cruise", 3], ["after", 0]]);
  assert.equal(route.itinerary.tripNights, 18);
  assert.equal(route.itinerary.stops.find((s) => s.id === "cruise").start, "2027-10-15");
  assert.equal(route.settings.startDate, "2027-09-30");
  assert.equal(route.travellers, 8);
  assert.deepEqual(Object.keys(route.holidays).sort(), ["columbus", "rh", "sukkot", "yk"]);
});

test("the public route follows the chosen sailing and drops archived stops", () => {
  const { docs } = applyOps(seedDocs(), [
    { t: "choose", groupId: "sailing", optionId: "s1011" },
    { t: "archive", e: "stops", id: "road" },
    { t: "archive", e: "holidays", id: "columbus" },
  ]);
  const route = routeView(docs.plan);
  assert.deepEqual(route.itinerary.stops.map((s) => s.id), ["nyc", "orlando", "cruise", "after"]);
  assert.equal(route.itinerary.stops.find((s) => s.id === "cruise").start, "2027-10-11");
  assert.equal(route.itinerary.stops.find((s) => s.id === "after").nights, 3);
  assert.ok(!("columbus" in route.holidays));
});

test("an empty plan gives an empty route instead of throwing", () => {
  const route = routeView({});
  assert.deepEqual(route.itinerary.stops, []);
  assert.equal(route.travellers, 0);
});
