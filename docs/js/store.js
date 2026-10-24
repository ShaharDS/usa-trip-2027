// App state: the two trip documents, who is looking, and a memoized engine result.
import { computeTrip } from "./shared/engine.js";

const listeners = new Set();

export const store = {
  docs: { pub: null, priv: null },
  role: "public", // public | family | editor | owner
  user: null, // {uid, email, name} when signed in
  source: null, // "seed" | "cache" | "firestore"
  demo: false,
  loadedAt: null,
  error: null,
  fxToday: null, // {rate, date}
  rev: 0,
};

let memo = { rev: -1, value: null };

/** Engine result for the current public document (recomputed only when the documents change). */
export function computed() {
  if (!store.docs.pub) return null;
  if (memo.rev !== store.rev) memo = { rev: store.rev, value: computeTrip(store.docs.pub) };
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
  edit: () => store.role === "editor" || store.role === "owner",
  family: () => store.role !== "public",
  owner: () => store.role === "owner",
};
