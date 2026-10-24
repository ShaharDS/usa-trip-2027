import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDocs, validateOps } from "../docs/js/shared/validate.js";
import { seedDocs } from "./helpers.mjs";

test("the seed is valid", () => {
  assert.deepEqual(validateDocs(seedDocs()), []);
});

test("valid ops pass and return the new documents", () => {
  const r = validateOps(seedDocs(), [
    { t: "create", e: "stops", id: "dc", v: { label: "וושינגטון", kind: "city", nights: 2, order: 1.5 } },
    { t: "update", e: "items", id: "hotel_road", set: { "rule.time.stopIds": ["road", "dc"] } },
  ], { version: 3 });
  assert.equal(r.ok, true, r.errors?.join("\n"));
  assert.equal(r.docs.pub.stops.dc.v, 3);
});

test("bad values are rejected with Hebrew messages", () => {
  const cases = [
    [{ t: "update", e: "items", id: "food", set: { "price.typical": -5 } }, /מחוץ לטווח/],
    [{ t: "update", e: "items", id: "food", set: { "price.low": 500 } }, /הנמוך גבוה/],
    [{ t: "update", e: "items", id: "food", set: { status: "maybe" } }, /ערך לא מוכר/],
    [{ t: "update", e: "items", id: "food", set: { categoryId: "ghost" } }, /לא קיים/],
    [{ t: "update", e: "items", id: "food", set: { hacked: true } }, /שדה לא מוכר/],
    [{ t: "update", e: "items", id: "food", set: { sources: [{ url: "http://evil.example" }] } }, /https/],
    [{ t: "update", e: "stops", id: "nyc", set: { nights: 2.5 } }, /שלם/],
    [{ t: "create", e: "stops", id: "bad id!", v: { label: "x", kind: "city" } }, /מזהה/],
    [{ t: "choose", groupId: "sailing", optionId: "utopia_in" }, /לא שייכת/],
    [{ t: "update", e: "settings", id: "_", set: { endDate: "2027-01-01" } }, /לפני/],
  ];
  for (const [op, re] of cases) {
    const r = validateOps(seedDocs(), [op]);
    assert.equal(r.ok, false, JSON.stringify(op));
    assert.match(r.errors.join("\n"), re, JSON.stringify(op));
  }
});

test("permission limits per mode", () => {
  const r = validateOps(seedDocs(), [{ t: "update", e: "settings", id: "_", set: { bufferPct: 0 } }], { allowedEntities: ["items"] });
  assert.equal(r.ok, false);
  const r2 = validateOps(seedDocs(), [{ t: "update", e: "items", id: "food", set: { label: "x" } }], { allowedFields: { items: ["price"] } });
  assert.equal(r2.ok, false);
  const r3 = validateOps(seedDocs(), [{ t: "delete", e: "items", id: "food" }], { allowedOps: ["create", "update"] });
  assert.equal(r3.ok, false);
});

test("too many ops at once is refused", () => {
  const ops = Array.from({ length: 61 }, (_, i) => ({ t: "update", e: "items", id: "food", set: { "price.typical": i } }));
  assert.equal(validateOps(seedDocs(), ops).ok, false);
});
