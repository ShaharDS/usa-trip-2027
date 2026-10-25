import { test } from "node:test";
import assert from "node:assert/strict";
import { familyView, routeView } from "../docs/js/shared/route.js";
import { dayId, nightStops, placesOutside, regionInfo, tripDays, tripPhase } from "../docs/js/shared/days.js";
import { dayRouteUrls, googleMapsUrl, googlePlaceUrl, wazeUrl } from "../docs/js/shared/links.js";
import { applyOps } from "../docs/js/shared/ops.js";
import { validateOps } from "../docs/js/shared/validate.js";
import { seed, seedDocs } from "./helpers.mjs";

test("one day per date, first to last, with tonight's hotel and the states in travel order", () => {
  const days = tripDays(familyView(seed()));
  assert.equal(days.length, 19);
  assert.equal(days[0].date, "2027-09-30");
  assert.ok(days[0].first && days.at(-1).last);
  assert.equal(days[0].sleep.id, "plc_nyc_hotel");
  assert.equal(days[0].title, "נוחתים בניו יורק");
  const drive = days.find((d) => d.date === "2027-10-06");
  assert.equal(drive.checkOut.id, "plc_nyc_hotel");
  assert.equal(drive.checkIn.id, "plc_dc_hotel");
  assert.ok(drive.moving);
  assert.deepEqual(drive.regions, ["NY", "PA", "DC"]);
  const park = days.find((d) => d.date === "2027-10-09");
  assert.equal(park.sleep.id, "plc_house");
  assert.equal(park.woke.id, "plc_house");
  assert.equal(park.checkIn, null);
  assert.deepEqual(park.places.map((p) => p.id), ["plc_universal"]);
  assert.equal(days.at(-1).sleep, null, "the last day has no hotel (flying home)");
});

test("places on a day are ordered by time, then by order", () => {
  const { docs } = applyOps(seedDocs(), [{ t: "create", e: "places", id: "plc_early", v: { label: "Breakfast", kind: "food", date: "2027-10-01", time: "08:00" } }]);
  const day = tripDays(familyView(docs.plan)).find((d) => d.date === "2027-10-01");
  assert.deepEqual(day.places.map((p) => p.id), ["plc_early", "plc_rock", "plc_park"]);
});

test("the public route still builds days (nameless hotels, cities only)", () => {
  const day = tripDays(routeView(seed())).find((d) => d.date === "2027-10-06");
  assert.equal(day.sleep.city, "Washington");
  assert.equal(day.sleep.label, undefined);
  assert.equal(day.places[0].label, "Liberty Bell, פילדלפיה");
});

test("where today falls in the trip", () => {
  const r = routeView(seed());
  assert.deepEqual(tripPhase(r, "2027-09-29"), { phase: "before", index: -1 });
  assert.deepEqual(tripPhase(r, "2027-09-30"), { phase: "during", index: 0 });
  assert.deepEqual(tripPhase(r, "2027-10-04"), { phase: "during", index: 4 });
  assert.deepEqual(tripPhase(r, "2027-10-18"), { phase: "during", index: 18 });
  assert.deepEqual(tripPhase(r, "2027-10-19"), { phase: "after", index: -1 });
});

test("nights in order for the map: one point per place we sleep", () => {
  const stops = nightStops(familyView(seed()));
  assert.deepEqual(stops.map((s) => [s.city, s.nights]), [["New York", 6], ["Washington", 1], ["Savannah", 1], ["Kissimmee", 7], ["Port Canaveral", 3]]);
  const pub = nightStops(routeView(seed()));
  assert.equal(pub[0].label, "לינה ב-New York");
  assert.equal(pub[0].lat, 40.8, "public map points are on the coarse grid");
});

test("a place outside the trip dates is reported, not lost silently", () => {
  const { docs } = applyOps(seedDocs(), [{ t: "create", e: "places", id: "plc_x", v: { label: "Old", kind: "sight", date: "2027-12-01" } }]);
  assert.deepEqual(placesOutside(familyView(docs.plan)).map((p) => p.id), ["plc_x"]);
});

test("validation: a hotel needs check-in before check-out, a visit needs a day, times are HH:MM", () => {
  const docs = seedDocs();
  const bad = (v) => !validateOps(docs, [{ t: "create", e: "places", id: "plc_t", v }]).ok;
  assert.ok(bad({ label: "H", kind: "hotel", checkIn: "2027-10-02", checkOut: "2027-10-02" }));
  assert.ok(bad({ label: "H", kind: "hotel", checkIn: "2027-10-02" }));
  assert.ok(bad({ label: "S", kind: "sight" }));
  assert.ok(bad({ label: "S", kind: "sight", date: "2027-10-02", time: "9:00" }));
  assert.ok(bad({ label: "S", kind: "sight", date: "2027-10-02", lat: 40.7 }));
  assert.ok(!bad({ label: "S", kind: "sight", date: "2027-10-02", time: "09:00", lat: 40.7, lng: -74 }));
  assert.ok(!bad({ label: "H", kind: "hotel", checkIn: "2027-10-02", checkOut: "2027-10-04" }));
});

test("day ids and state names", () => {
  assert.equal(dayId("2027-10-04"), "d20271004");
  assert.equal(regionInfo("VA").he, "וירג׳יניה");
  assert.equal(regionInfo("ZZ").he, "ZZ");
  assert.equal(regionInfo(""), null);
});

test("Waze goes to the exact spot; Google Maps searches the name and address", () => {
  const hotel = familyView(seed()).places.plc_nyc_hotel;
  assert.equal(wazeUrl(hotel), "https://waze.com/ul?ll=40.7553,-73.9857&navigate=yes");
  const g = new URL(googleMapsUrl(hotel));
  assert.equal(g.searchParams.get("destination"), "Hilton Garden Inn Times Square Central, 136 W 42nd St, New York, NY 10036");
  assert.equal(g.searchParams.get("travelmode"), "driving");
  assert.equal(wazeUrl({ label: "X", address: "1 Main St, Savannah, GA" }), "https://waze.com/ul?q=1%20Main%20St%2C%20Savannah%2C%20GA&navigate=yes");
  assert.equal(wazeUrl({}), null);
  assert.equal(googlePlaceUrl({ mapsUrl: "https://maps.app.goo.gl/abc" }), "https://maps.app.goo.gl/abc");
});

test("the day route: last night's hotel → today's stops (not the 'maybe' ones, not flights) → tonight's hotel", () => {
  const days = tripDays(familyView(seed()));
  const drive = dayRouteUrls(days.find((d) => d.date === "2027-10-07"));
  assert.equal(drive.length, 1);
  const u = new URL(drive[0].url);
  assert.match(u.searchParams.get("origin"), /^Hampton Inn Washington/);
  assert.match(u.searchParams.get("destination"), /^Hampton Inn Savannah/);
  assert.equal(u.searchParams.get("waypoints"), "National Mall, National Mall, Washington, DC", "South of the Border is a 'maybe'");
  assert.deepEqual(dayRouteUrls(days[0]), [], "day 1 is a flight, not a drive");
  const home = dayRouteUrls(days.at(-1));
  assert.match(new URL(home[0].url).searchParams.get("destination"), /Orlando International Airport/);
});

test("a long day is split into parts of at most 3 stops in between", () => {
  const day = { woke: { id: "a", label: "A" }, sleep: { id: "z", label: "Z" }, places: "bcdefg".split("").map((id) => ({ id, label: id.toUpperCase(), kind: "sight" })) };
  const legs = dayRouteUrls(day);
  assert.equal(legs.length, 2);
  assert.equal(new URL(legs[0].url).searchParams.get("waypoints").split("|").length, 3);
  assert.equal(legs[1].from, "E");
  assert.equal(legs.at(-1).to, "Z");
});
