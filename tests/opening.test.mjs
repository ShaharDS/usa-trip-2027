import { test } from "node:test";
import assert from "node:assert/strict";
import { openingData } from "./helpers.mjs";
import { validateDocs } from "../docs/js/shared/validate.js";
import { activeList } from "../docs/js/shared/engine.js";

test("opening data is valid, has the categories but no cost rows or sample places", () => {
  const plan = openingData();
  assert.deepEqual(validateDocs({ plan, priv: { schemaVersion: 1 } }), []);
  assert.equal(activeList(plan.items).length, 0);
  assert.ok(activeList(plan.categories).length >= 7);
  assert.equal(activeList(plan.places).length, 0);
});
