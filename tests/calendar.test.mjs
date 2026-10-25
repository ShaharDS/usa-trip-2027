import { test } from "node:test";
import assert from "node:assert/strict";
import { assignRangeOps, dayOwners, explicitOps, gapRanges, isExplicit, stopRanges } from "../docs/js/shared/calendar.js";
import { applyOps } from "../docs/js/shared/ops.js";
import { validateOps } from "../docs/js/shared/validate.js";
import { computeTrip } from "../docs/js/shared/engine.js";
import { seedDocs } from "./helpers.mjs";

const apply = (docs, ops) => {
  const v = validateOps(docs, ops);
  assert.ok(v.ok, v.errors?.join("; "));
  return { plan: v.docs.plan, priv: v.docs.priv };
};
const nightsOf = (plan) => Object.fromEntries(stopRanges(plan).map((r) => [r.id, [r.start, r.nights]]));

test("who sleeps where, night by night", () => {
  const { plan } = seedDocs();
  const owners = dayOwners(plan);
  assert.equal(owners.length, 18);
  assert.deepEqual(owners[0], { date: "2027-09-30", owners: ["nyc"], gap: false, overlap: false });
  assert.deepEqual(owners.find((d) => d.date === "2027-10-15").owners, ["cruise"]);
});

test("the one-time conversion keeps every date and drops the sailing's hold on the cruise", () => {
  const docs = seedDocs();
  assert.equal(isExplicit(docs.plan), false);
  const before = nightsOf(docs.plan);
  const after = apply(docs, explicitOps(docs.plan));
  assert.deepEqual(nightsOf(after.plan), before);
  assert.ok(isExplicit(after.plan));
  assert.equal(after.plan.options.s1015.stopPatch, undefined);
  assert.equal(computeTrip(after.plan, { skipOptions: true }).itinerary.warnings.length, 0);
});

test("picking the cruise dates over Orlando: the cruise moves, Orlando shrinks, nothing pins it back", () => {
  const docs = seedDocs();
  const { ops, overridden } = assignRangeOps(docs.plan, "cruise", "2027-10-11", "2027-10-14");
  assert.deepEqual(overridden.map((o) => [o.id, o.from, o.to]), [["orlando", "2027-10-11", "2027-10-14"]]);
  const after = apply(docs, ops);
  const n = nightsOf(after.plan);
  assert.deepEqual(n.cruise, ["2027-10-11", 4]);
  assert.deepEqual(n.orlando, ["2027-10-08", 3]);
  assert.equal(n.after[1], 0, "the part after the cruise had no nights and still has none");
  assert.deepEqual(gapRanges(after.plan), [{ from: "2027-10-15", to: "2027-10-17" }], "the nights the cruise left belong to nobody until someone takes them");
  // choosing another sailing no longer moves the cruise
  const chose = apply(after, [{ t: "choose", groupId: "sailing", optionId: "s1001", before: "s1015" }]);
  assert.deepEqual(nightsOf(chose.plan).cruise, ["2027-10-11", 4]);
});

test("a range inside another part keeps that part's larger piece; a fully covered part gets 0 nights", () => {
  const docs = seedDocs();
  const { ops } = assignRangeOps(docs.plan, "road", "2027-09-30", "2027-10-07");
  const after = apply(docs, ops);
  const n = nightsOf(after.plan);
  assert.equal(n.nyc[1], 0, "New York fully covered");
  assert.deepEqual(n.road, ["2027-09-30", 8]);
  assert.equal(computeTrip(after.plan, { skipOptions: true }).itinerary.warnings.length, 0);
});

test("a new part on the calendar, and nights that belong to nobody", () => {
  const docs = seedDocs();
  const { ops } = assignRangeOps(docs.plan, "stop_dc", "2027-10-06", "2027-10-06", { id: "stop_dc", v: { label: "וושינגטון", kind: "city" } });
  const after = apply(docs, ops);
  assert.deepEqual(nightsOf(after.plan).stop_dc, ["2027-10-06", 1]);
  assert.deepEqual(nightsOf(after.plan).road, ["2027-10-07", 1]);
  // longer trip: the new nights belong to nobody until someone takes them
  const longer = apply(after, [{ t: "update", e: "settings", id: "_", set: { endDate: "2027-10-20" }, before: { endDate: "2027-10-18" } }]);
  assert.deepEqual(gapRanges(longer.plan), [{ from: "2027-10-18", to: "2027-10-19" }]);
});
