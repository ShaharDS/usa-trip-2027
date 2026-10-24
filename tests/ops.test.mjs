import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, conflictsOf, resolveTempIds, getIn, setIn } from "../docs/js/shared/ops.js";
import { seedDocs } from "./helpers.mjs";

const strip = (docs) => JSON.parse(JSON.stringify(docs));

test("getIn / setIn with dotted paths", () => {
  const o = {};
  setIn(o, "price.typical", 5);
  assert.equal(getIn(o, "price.typical"), 5);
  setIn(o, "price.typical", null);
  assert.deepEqual(o, { price: {} });
});

test("inverse ops restore the documents exactly", () => {
  const docs = seedDocs();
  const ops = [
    { t: "create", e: "stops", id: "dc", v: { label: "וושינגטון", kind: "city", nights: 2, order: 1.5 } },
    { t: "update", e: "items", id: "hotel_nyc", set: { "price.typical": 420, status: "quote" } },
    { t: "update", e: "settings", id: "_", set: { bufferPct: 12 } },
    { t: "archive", e: "items", id: "cars_gas" },
    { t: "choose", groupId: "sailing", optionId: "s1011" },
    { t: "update", e: "privateItems", id: "hotel_nyc", set: { bookingRef: "X1" } },
  ];
  // privateItems/hotel_nyc doesn't exist yet: create it first
  ops.splice(5, 1, { t: "create", e: "privateItems", id: "hotel_nyc", v: { bookingRef: "X1" } });
  const { docs: changed, inverseOps } = applyOps(docs, ops);
  assert.notDeepEqual(strip(changed), strip(docs));
  const { docs: back } = applyOps(changed, inverseOps);
  assert.deepEqual(strip(back), strip(docs));
});

test("randomized round trips are the identity", () => {
  const docs = seedDocs();
  const itemIds = Object.keys(docs.plan.items);
  for (let i = 0; i < 50; i++) {
    const ops = [];
    for (let j = 0; j < 4; j++) {
      const id = itemIds[(i * 7 + j * 3) % itemIds.length];
      const r = (i + j) % 4;
      if (r === 0) ops.push({ t: "update", e: "items", id, set: { "price.typical": 100 + i + j, note: `n${i}` } });
      else if (r === 1) ops.push({ t: "archive", e: "items", id });
      else if (r === 2) ops.push({ t: "update", e: "stops", id: "nyc", set: { nights: (i % 5) + 2 } });
      else ops.push({ t: "create", e: "categories", id: `c${i}_${j}`, v: { label: "x", icon: "star", color: "teal" } });
    }
    const { docs: a, inverseOps } = applyOps(docs, ops);
    const { docs: b } = applyOps(a, inverseOps);
    assert.deepEqual(strip(b), strip(docs), `round trip ${i}`);
  }
});

test("version stamps touched records", () => {
  const { docs, touched } = applyOps(seedDocs(), [{ t: "update", e: "items", id: "food", set: { "price.typical": 80 } }], { version: 7 });
  assert.equal(docs.plan.items.food.v, 7);
  assert.deepEqual(touched, [{ e: "items", id: "food" }]);
});

test("conflicts: changed before-values, missing and existing records", () => {
  const docs = seedDocs();
  const c = conflictsOf(docs, [
    { t: "update", e: "items", id: "food", set: { "price.typical": 80 }, before: { "price.typical": 75 } },
    { t: "update", e: "items", id: "food", set: { "price.typical": 80 }, before: { "price.typical": 70 } },
    { t: "update", e: "items", id: "ghost", set: { label: "x" } },
    { t: "create", e: "items", id: "food", v: {} },
    { t: "choose", groupId: "sailing", optionId: "s1011", before: "s1008" },
  ]);
  assert.deepEqual(c.map((x) => [x.op, x.reason]), [[1, "changed"], [2, "missing"], [3, "exists"], [4, "changed"]]);
});

test("temp ids are replaced everywhere, including map keys", () => {
  const { ops, map } = resolveTempIds(
    [
      { t: "create", e: "stops", id: "$dc", v: { label: "DC", kind: "city", nights: 2 } },
      { t: "create", e: "items", id: "$hotel", v: { label: "מלון", categoryId: "lodging", rule: { unit: "rooms", time: { by: "nights", stopIds: ["$dc"] } } } },
      { t: "create", e: "options", id: "$opt", v: { groupId: "sailing", label: "x", stopPatch: { $dc: { nights: 1 } } } },
    ],
    (e) => `${e}_real`,
  );
  assert.deepEqual(map, { $dc: "stops_real", $hotel: "items_real", $opt: "options_real" });
  assert.deepEqual(ops[1].v.rule.time.stopIds, ["stops_real"]);
  assert.deepEqual(Object.keys(ops[2].v.stopPatch), ["stops_real"]);
});

test("conflicts are checked in order: create then update in one batch is fine", () => {
  const docs = seedDocs();
  const c = conflictsOf(docs, [
    { t: "create", e: "privateItems", id: "flights_intl", v: { bookingRef: "ABC" } },
    { t: "update", e: "privateItems", id: "flights_intl", set: { documentIds: ["d1"] }, before: { documentIds: null } },
    { t: "update", e: "items", id: "food", set: { "price.typical": 80 }, before: { "price.typical": 75 } },
    { t: "update", e: "items", id: "food", set: { "price.typical": 90 }, before: { "price.typical": 80 } },
  ]);
  assert.deepEqual(c, []);
});
