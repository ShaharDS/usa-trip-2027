import { test } from "node:test";
import assert from "node:assert/strict";
import { toolCallToOps, toolsFor } from "../docs/js/shared/aitools.js";
import { validateOps } from "../docs/js/shared/validate.js";
import { applyOps } from "../docs/js/shared/ops.js";
import { coordsFromMapsUrl, findMapsUrl, isShortMapsUrl, nameFromMapsUrl } from "../docs/js/shared/geo.js";
import { seedDocs } from "./helpers.mjs";

const NULL_PLACE = {
  label: null, kind: null, date: null, check_in: null, check_out: null, time: null, end_time: null, address: null, city: null, region: null,
  website: null, phone: null, note: null, maybe: null, maps_url: null, wikipedia_title: null,
};

test("the '+ הוספת מקום' AI gets route tools only — no prices, rows or settings", () => {
  const names = toolsFor("place").map((t) => t.name);
  assert.deepEqual([...names].sort(), ["add_place", "add_stop", "remove_place", "set_day", "update_place", "update_stop"]);
  for (const t of toolsFor("place")) {
    assert.ok(!("lat" in t.input_schema.properties) && !("lng" in t.input_schema.properties), `${t.name} must not take coordinates`);
  }
  assert.ok(toolsFor("sentence").some((t) => t.name === "add_place"), "a sentence can add places too");
});

test("add_place: a hotel with check-in / check-out; the server's location wins, the model can't send one", () => {
  const docs = seedDocs();
  const input = { ...NULL_PLACE, temp_id: "$h", label: "Hampton Inn Richmond", kind: "hotel", check_in: "2027-10-06", check_out: "2027-10-07", address: "700 E Main St", city: "Richmond", region: "va", _lat: 37.54, _lng: -77.43, _maps_url: "https://maps.app.goo.gl/abc", lat: 1, lng: 2 };
  const [op] = toolCallToOps("add_place", input, docs);
  assert.equal(op.t, "create");
  assert.equal(op.v.kind, "hotel");
  assert.equal(op.v.checkIn, "2027-10-06");
  assert.equal(op.v.region, "VA");
  assert.equal(op.v.lat, 37.54);
  assert.equal(op.v.lng, -77.43);
  assert.equal(op.v.mapsUrl, "https://maps.app.goo.gl/abc");
  assert.ok(!("date" in op.v));
  const v = validateOps(docs, [{ ...op, id: "plc_new" }]);
  assert.ok(v.ok, v.errors.join("; "));
});

test("add_place keeps a website only if its site came up in the search", () => {
  const docs = seedDocs();
  const input = { ...NULL_PLACE, temp_id: "$s", label: "Top of the Rock", kind: "sight", date: "2027-10-01", website: "https://www.rockefellercenter.com/attractions/top-of-the-rock-observation-deck/" };
  const seen = new Set(["https://www.rockefellercenter.com/buy-tickets/"]);
  assert.equal(toolCallToOps("add_place", input, docs, { allowedUrls: seen })[0].v.website, input.website);
  assert.equal(toolCallToOps("add_place", input, docs, { allowedUrls: new Set(["https://example.com/"]) })[0].v.website, undefined);
});

test("update_place turning a sight into a hotel clears the visit fields; set_day creates, then updates", () => {
  const docs = seedDocs();
  const [up] = toolCallToOps("update_place", { ...NULL_PLACE, place_id: "plc_katz", kind: "hotel", check_in: "2027-10-02", check_out: "2027-10-03" }, docs);
  assert.equal(up.set.kind, "hotel");
  assert.equal(up.set.date, null);
  assert.equal(up.set.maybe, null);
  assert.ok(validateOps(docs, [up]).ok);
  const [create] = toolCallToOps("set_day", { date: "2027-10-12", title: "יום מנוחה", note: null }, docs);
  assert.deepEqual(create, { t: "create", e: "days", id: "d20271012", v: { date: "2027-10-12", title: "יום מנוחה" } });
  const after = applyOps(docs, [create]).docs;
  const [update] = toolCallToOps("set_day", { date: "2027-10-12", title: "יום בבריכה", note: null }, after);
  assert.equal(update.t, "update");
  assert.equal(update.before.title, "יום מנוחה");
  assert.throws(() => toolCallToOps("remove_place", { place_id: "nope" }, docs), /לא קיים/);
});

test("Google Maps links: find one in text, read the place's own pin and its name", () => {
  const long = "https://www.google.com/maps/place/American+Museum+of+Natural+History/@40.7813241,-73.9739882,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d40.7813241!4d-73.9739882";
  assert.equal(findMapsUrl(`תוסיף את זה ${long}, תודה`), long);
  assert.deepEqual(coordsFromMapsUrl(long), { lat: 40.781324, lng: -73.973988 });
  assert.equal(nameFromMapsUrl(long), "American Museum of Natural History");
  assert.deepEqual(coordsFromMapsUrl("https://maps.google.com/?q=28.4747,-81.4677"), { lat: 28.4747, lng: -81.4677 });
  assert.deepEqual(coordsFromMapsUrl("https://www.google.com/maps/@40.1,-73.2,15z/data=!3d40.5!4d-73.6"), { lat: 40.5, lng: -73.6 }, "the pin wins over the map centre");
  assert.equal(coordsFromMapsUrl("https://maps.app.goo.gl/AbCdEf"), null);
  assert.ok(isShortMapsUrl("https://maps.app.goo.gl/AbCdEf"));
  assert.equal(findMapsUrl("no link here"), null);
});
