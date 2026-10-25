// App state: the public route (everyone), the family route (signed-in family), the editors' documents, who is
// looking, and memoized engine results.
import { computeTrip } from "./shared/engine.js";
import { familyView } from "./shared/route.js";

const listeners = new Set();

export const store = {
  route: null, // the public route document (no prices) — what anyone with the link sees
  family: null, // the family route document (hotel names, addresses, map locations; no prices) — signed-in family
  // Editors only: the whole plan (prices) and the private document. undefined = not loaded yet,
  // null = the database has no trip yet (the owner still has to load the opening data).
  docs: { plan: undefined, priv: undefined },
  role: "public", // public | family | editor | owner
  user: null, // {uid, email, name} when signed in
  roleChecked: false, // true once the server has said what this account may do
  source: null, // "seed" | "cache" | "firestore" — where the route came from
  demo: false,
  loadedAt: null,
  error: null,
  fxToday: null, // {rate, date}
  rev: 0,
};

let memo = { rev: -1, value: null };

/** Engine result for the plan (editors only; recomputed only when the documents change). */
export function computed() {
  if (!store.docs.plan) return null;
  if (memo.rev !== store.rev) memo = { rev: store.rev, value: computeTrip(store.docs.plan) };
  return memo.value;
}

let familyMemo = { rev: -1, value: null };

/**
 * The route this person sees on the route screens: editors — built from the live plan (always current);
 * family — the family document; everyone else — the public route.
 */
export function routeDoc() {
  if (store.docs.plan) {
    if (familyMemo.rev !== store.rev) familyMemo = { rev: store.rev, value: familyView(store.docs.plan) };
    return familyMemo.value;
  }
  return store.family || store.route;
}

export function setState(patch) {
  const docsChanged = "docs" in patch;
  Object.assign(store, patch);
  if (docsChanged) store.rev += 1;
  for (const fn of listeners) fn(store);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const can = {
  edit: () => store.role === "editor" || store.role === "owner", // editors see prices and change things
  ask: () => store.role !== "public", // family and editors may ask the AI (family gets route-only answers)
  owner: () => store.role === "owner",
};
