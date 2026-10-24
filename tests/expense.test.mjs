import { test } from "node:test";
import assert from "node:assert/strict";
import { expenseOps } from "../docs/js/edit/expenseOps.js";
import { validateOps } from "../docs/js/shared/validate.js";
import { computeTrip } from "../docs/js/shared/engine.js";
import { seedDocs, near } from "./helpers.mjs";

const base = { label: "ESTA", categoryId: "extras", newCategory: null, amount: 21, currency: "USD", per: "total", status: "estimate" };

function add(d) {
  const docs = seedDocs();
  const { ops, problems, categoryId } = expenseOps(docs.plan, d, "item_test1");
  assert.deepEqual(problems, []);
  const v = validateOps(docs, ops);
  assert.ok(v.ok, v.errors.join("; "));
  const before = computeTrip(docs.plan, { skipOptions: true });
  const after = computeTrip(v.docs.plan, { skipOptions: true });
  const cat = (r) => r.categories.find((c) => c.id === categoryId)?.amount.usd.typ ?? 0;
  return { ops, before, after, catDelta: cat(after) - cat(before), totalDelta: after.subtotal.usd.typ - before.subtotal.usd.typ, row: after.items.item_test1 };
}

test("a lump-sum expense adds exactly its amount to its category", () => {
  const r = add(base);
  assert.equal(r.ops.length, 1);
  assert.ok(near(r.catDelta, 21));
  assert.ok(near(r.totalDelta, 21));
  assert.equal(r.row.status, "estimate");
});

test("per person multiplies by the preset (paying = 7)", () => {
  const r = add({ ...base, per: "paying" });
  assert.ok(near(r.catDelta, 21 * 7));
});

test("shekels are converted at the planning rate", () => {
  const r = add({ ...base, amount: 311, currency: "ILS" });
  assert.ok(near(r.catDelta * r.after.rate, 311, 0.5));
});

test("paid: the amount is final (actual = total for everyone counted)", () => {
  const r = add({ ...base, per: "paying", status: "paid" });
  assert.deepEqual(r.ops[0].v.actual, { amount: 147, currency: "USD" });
  assert.equal(r.row.mode, "actual");
  assert.ok(near(r.catDelta, 147));
});

test("a new category is created and shows up in 'where the money goes'", () => {
  const r = add({ ...base, categoryId: null, newCategory: { id: "cat_new1", label: "ביטוח" }, amount: 400 });
  assert.equal(r.ops[0].e, "categories");
  assert.equal(r.ops[0].v.label, "ביטוח");
  assert.ok(r.after.categories.some((c) => c.id === "cat_new1" && near(c.amount.usd.typ, 400)));
  assert.ok(!r.before.categories.some((c) => c.id === "cat_new1"));
});

test("missing fields come back as Hebrew problems, with no ops", () => {
  const { plan } = seedDocs();
  const { ops, problems } = expenseOps(plan, { ...base, label: " ", amount: null, categoryId: "nope" }, "item_x");
  assert.equal(ops.length, 0);
  assert.equal(problems.length, 3);
  assert.deepEqual(expenseOps(plan, { ...base, categoryId: null, newCategory: { id: "c", label: "" } }, "i").problems, ["כתבו שם לקטגוריה החדשה."]);
});
