import { test } from "node:test";
import assert from "node:assert/strict";
import { docLinks, linkItemOps, linkPlaceOps, linkedToPlace, unlinkAllOps } from "../docs/js/shared/docLinks.js";
import { validateOps } from "../docs/js/shared/validate.js";
import { familyView } from "../docs/js/shared/route.js";
import { seedDocs } from "./helpers.mjs";

const apply = (docs, ops) => {
  const v = validateOps(docs, ops);
  assert.ok(v.ok, v.errors?.join("; "));
  return { plan: v.docs.plan, priv: v.docs.priv };
};

test("one file, attached to an expense and to a place; links listed; the family sees only the place one", () => {
  let docs = seedDocs();
  docs = apply(docs, linkItemOps(docs, "flights_intl", "doc_ticket"));
  docs = apply(docs, linkPlaceOps(docs, "plc_fly_out", { id: "doc_ticket", title: "כרטיסי טיסה", type: "pdf" }));
  assert.deepEqual(docLinks(docs, "doc_ticket"), {
    items: [{ id: "flights_intl", label: "טיסות לארה״ב וחזרה" }],
    places: [{ id: "plc_fly_out", label: "טיסה לניו יורק" }],
  });
  assert.ok(linkedToPlace(docs.plan, "doc_ticket"));
  assert.deepEqual(linkItemOps(docs, "flights_intl", "doc_ticket"), [], "no double link");
  assert.deepEqual(familyView(docs.plan).places.plc_fly_out.files, [{ id: "doc_ticket", title: "כרטיסי טיסה", type: "pdf" }]);
  assert.ok(!JSON.stringify(familyView(docs.plan)).includes("documentIds"), "expense links stay private");
});

test("deleting a file removes every link to it", () => {
  let docs = seedDocs();
  docs = apply(docs, [...linkItemOps(docs, "hotel_nyc", "doc_x"), ...linkItemOps(docs, "flights_intl", "doc_x")]);
  docs = apply(docs, linkPlaceOps(docs, "plc_nyc_hotel", { id: "doc_x", title: "אישור", type: "image" }));
  docs = apply(docs, linkItemOps(docs, "hotel_nyc", "doc_other"));
  const after = apply(docs, unlinkAllOps(docs, "doc_x"));
  assert.deepEqual(docLinks(after, "doc_x"), { items: [], places: [] });
  assert.ok(!linkedToPlace(after.plan, "doc_x"));
  assert.deepEqual(after.priv.items.hotel_nyc.documentIds, ["doc_other"], "other files stay");
  assert.deepEqual(unlinkAllOps(after, "doc_x"), []);
});
