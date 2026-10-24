// App state: the public route (everyone), the editors' documents, who is looking, and a memoized engine result.
import { computeTrip } from "./shared/engine.js";

const listeners = new Set();

export const store = {
  route: null, // the public route document (no prices) — what anyone with the link sees
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
