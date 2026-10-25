// Where an uploaded document is attached. Every file lives once in the documents list ("מסמכים"); a cost row links to
// it from the private document (`privateItems.documentIds`, editors only — expenses carry prices) and a place on the
// route from the plan (`places.files`, with a title and type, because family sees those). Pure: no DOM, no Firebase.
import { activeList } from "./engine.js";

/** {items: [{id, label}], places: [{id, label}]} that link to this document. */
export function docLinks(docs, docId) {
  const items = Object.entries(docs?.priv?.items || {})
    .filter(([id, p]) => (p?.documentIds || []).includes(docId) && docs.plan?.items?.[id] && !docs.plan.items[id].archived)
    .map(([id]) => ({ id, label: docs.plan.items[id].label }));
  const places = activeList(docs?.plan?.places).filter((p) => (p.files || []).some((f) => f.id === docId)).map((p) => ({ id: p.id, label: p.label }));
  return { items, places };
}

/** True when some place on the route shows this document — then the family may open it. */
export const linkedToPlace = (plan, docId) => activeList(plan?.places).some((p) => (p.files || []).some((f) => f.id === docId));

/** Attach a document to a cost row. */
export function linkItemOps(docs, itemId, docId) {
  const cur = docs?.priv?.items?.[itemId];
  if (!cur) return [{ t: "create", e: "privateItems", id: itemId, v: { documentIds: [docId] } }];
  if ((cur.documentIds || []).includes(docId)) return [];
  return [{ t: "update", e: "privateItems", id: itemId, set: { documentIds: [...(cur.documentIds || []), docId].slice(-20) }, before: { documentIds: cur.documentIds ?? null } }];
}

/** Attach a document to a place (the family can open it from there). */
export function linkPlaceOps(docs, placeId, file) {
  const rec = docs?.plan?.places?.[placeId];
  if (!rec || (rec.files || []).some((f) => f.id === file.id)) return [];
  return [{ t: "update", e: "places", id: placeId, set: { files: [...(rec.files || []), file].slice(-10) }, before: { files: rec.files ?? null } }];
}

export function unlinkItemOps(docs, itemId, docId) {
  const cur = docs?.priv?.items?.[itemId];
  if (!cur || !(cur.documentIds || []).includes(docId)) return [];
  const left = cur.documentIds.filter((x) => x !== docId);
  return [{ t: "update", e: "privateItems", id: itemId, set: { documentIds: left.length ? left : null }, before: { documentIds: cur.documentIds } }];
}

export function unlinkPlaceOps(docs, placeId, docId) {
  const rec = docs?.plan?.places?.[placeId];
  if (!rec || !(rec.files || []).some((f) => f.id === docId)) return [];
  const left = rec.files.filter((f) => f.id !== docId);
  return [{ t: "update", e: "places", id: placeId, set: { files: left.length ? left : null }, before: { files: rec.files } }];
}

/** Every link to a document, removed (before the document itself is deleted). Archived rows / places included. */
export function unlinkAllOps(docs, docId) {
  const ops = [];
  for (const id of Object.keys(docs?.priv?.items || {})) ops.push(...unlinkItemOps(docs, id, docId));
  for (const id of Object.keys(docs?.plan?.places || {})) ops.push(...unlinkPlaceOps(docs, id, docId));
  return ops;
}
