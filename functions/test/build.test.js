// Smoke test: the compiled functions load and export every callable.
import { test } from "node:test";
import assert from "node:assert/strict";

test("compiled index exports the callables", async () => {
  process.env.GCLOUD_PROJECT ||= "demo-usa-trip";
  process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: "demo-usa-trip" });
  const mod = await import("../lib/index.js");
  for (const name of ["commitChange", "undoChange", "whoami", "getAccess", "setAccess", "adminImport", "aiAsk", "aiPropose", "applyProposal", "rejectProposal", "addDocument"]) {
    assert.equal(typeof mod[name], "function", name);
  }
});
