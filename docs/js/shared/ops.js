// Change operations over the two trip documents ({pub, priv}).
// Every edit — by hand, by AI proposal, or undo — is a list of ops. applyOps() returns the new documents
// plus the inverse ops, so any committed change can be undone exactly.
//
// Op shapes:
//   {t:"create",  e, id, v}                  new record (v = the record)
//   {t:"delete",  e, id, before}             remove a record (used mainly as the inverse of create)
//   {t:"update",  e, id, set:{path:value}, before:{path:value}}   dotted paths, e.g. "price.typical"
//   {t:"archive", e, id} / {t:"restore", e, id}
//   {t:"choose",  groupId, optionId, before}
// Singleton entities (settings, aiSettings) use id "_".

import { ENTITIES, newId } from "./schema.js";

const clone = (x) => (x === undefined ? undefined : structuredClone(x));

export function getIn(obj, path) {
  let cur = obj;
  for (const key of String(path).split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return cur;
}

export function setIn(obj, path, value) {
  const keys = String(path).split(".");
  let cur = obj;
  for (const key of keys.slice(0, -1)) {
    if (cur[key] == null || typeof cur[key] !== "object" || Array.isArray(cur[key])) cur[key] = {};
    cur = cur[key];
  }
  const last = keys[keys.length - 1];
  if (value === undefined || value === null) delete cur[last];
  else cur[last] = clone(value);
}

export function sameValue(a, b) {
  const na = a === undefined ? null : a;
  const nb = b === undefined ? null : b;
  return JSON.stringify(na) === JSON.stringify(nb);
}

function docKey(e) {
  const def = ENTITIES[e];
  if (!def) throw new Error(`unknown entity "${e}"`);
  return def.doc === "public" ? "pub" : "priv";
}

function container(docs, e) {
  const def = ENTITIES[e];
  const doc = docs[docKey(e)];
  if (!doc[def.path] || typeof doc[def.path] !== "object") doc[def.path] = {};
  return doc[def.path];
}

/** The record an op targets (singletons: the object itself), or undefined. */
export function recordOf(docs, e, id) {
  const def = ENTITIES[e];
  if (!def) return undefined;
  const doc = docs[docKey(e)];
  if (def.singleton) return doc?.[def.path];
  return doc?.[def.path]?.[id];
}

/**
 * List conflicts: ops whose expectations ("before" values, existence) don't match the documents.
 * Ops are checked in order, each against the documents as earlier ops in the same batch left them
 * (so "create X, then update X" in one change is fine).
 */
export function conflictsOf(docs, ops) {
  const out = [];
  let cur = docs;
  ops.forEach((op, i) => {
    const before = out.length;
    checkOne(cur, op, i, out);
    if (out.length === before) {
      try {
        cur = applyOps(cur, [op]).docs;
      } catch { /* reported by validation */ }
    }
  });
  return out;
}

function checkOne(docs, op, i, out) {
  if (op.t === "choose") {
    const g = docs.pub.optionGroups?.[op.groupId];
    if (!g) out.push({ op: i, reason: "missing", groupId: op.groupId });
    else if ("before" in op && !sameValue(g.chosen, op.before)) out.push({ op: i, reason: "changed", path: "chosen", expected: op.before, actual: g.chosen });
    return;
  }
  const rec = recordOf(docs, op.e, op.id);
  if (op.t === "create") {
    if (rec !== undefined && !ENTITIES[op.e]?.singleton) out.push({ op: i, reason: "exists", e: op.e, id: op.id });
    return;
  }
  if (rec === undefined) {
    out.push({ op: i, reason: "missing", e: op.e, id: op.id });
    return;
  }
  if (op.t === "update" && op.before) {
    for (const [path, expected] of Object.entries(op.before)) {
      const actual = getIn(rec, path);
      if (!sameValue(actual, expected)) out.push({ op: i, reason: "changed", e: op.e, id: op.id, path, expected, actual });
    }
  }
}

/**
 * Apply ops to copies of the documents.
 * @returns {{docs:{pub,priv}, inverseOps:Array, touched:Array<{e,id}>}}
 * @param opts.version stamps `v` on every touched record (drives the "updated" badges)
 */
export function applyOps(docs, ops, opts = {}) {
  const next = { pub: clone(docs.pub) || {}, priv: clone(docs.priv) || {} };
  const inverse = [];
  const touched = [];
  const stamp = (rec) => {
    if (opts.version !== undefined && rec && typeof rec === "object") rec.v = opts.version;
  };

  for (const op of ops) {
    if (op.t === "choose") {
      const g = next.pub.optionGroups?.[op.groupId];
      if (!g) throw new Error(`no option group "${op.groupId}"`);
      inverse.push({ t: "choose", groupId: op.groupId, optionId: g.chosen ?? null, before: op.optionId });
      g.chosen = op.optionId;
      stamp(g);
      touched.push({ e: "optionGroups", id: op.groupId });
      continue;
    }
    const def = ENTITIES[op.e];
    if (!def) throw new Error(`unknown entity "${op.e}"`);
    const doc = next[docKey(op.e)];

    if (def.singleton) {
      const rec = doc[def.path] || (doc[def.path] = {});
      if (op.t === "create") {
        inverse.push({ t: "create", e: op.e, id: "_", v: clone(rec) });
        doc[def.path] = clone(op.v) || {};
        stamp(doc[def.path]);
      } else if (op.t === "update") {
        const before = {};
        for (const path of Object.keys(op.set || {})) before[path] = clone(getIn(rec, path)) ?? null;
        for (const [path, value] of Object.entries(op.set || {})) setIn(rec, path, value);
        stamp(rec);
        inverse.push({ t: "update", e: op.e, id: "_", set: before, before: clone(op.set) });
      } else {
        throw new Error(`op "${op.t}" is not allowed on singleton "${op.e}"`);
      }
      touched.push({ e: op.e, id: "_" });
      continue;
    }

    const coll = container(next, op.e);
    const rec = coll[op.id];
    switch (op.t) {
      case "create": {
        if (rec !== undefined) throw new Error(`${op.e}/${op.id} already exists`);
        coll[op.id] = clone(op.v) || {};
        stamp(coll[op.id]);
        inverse.push({ t: "delete", e: op.e, id: op.id, before: clone(coll[op.id]) });
        break;
      }
      case "delete": {
        if (rec === undefined) throw new Error(`${op.e}/${op.id} not found`);
        inverse.push({ t: "create", e: op.e, id: op.id, v: clone(rec) });
        delete coll[op.id];
        break;
      }
      case "update": {
        if (rec === undefined) throw new Error(`${op.e}/${op.id} not found`);
        const before = {};
        for (const path of Object.keys(op.set || {})) before[path] = clone(getIn(rec, path)) ?? null;
        for (const [path, value] of Object.entries(op.set || {})) setIn(rec, path, value);
        stamp(rec);
        inverse.push({ t: "update", e: op.e, id: op.id, set: before, before: clone(op.set) });
        break;
      }
      case "archive":
      case "restore": {
        if (rec === undefined) throw new Error(`${op.e}/${op.id} not found`);
        const was = !!rec.archived;
        if (op.t === "archive") rec.archived = true;
        else delete rec.archived;
        stamp(rec);
        inverse.push({ t: was ? "archive" : "restore", e: op.e, id: op.id });
        break;
      }
      default:
        throw new Error(`unknown op "${op.t}"`);
    }
    touched.push({ e: op.e, id: op.id });
  }
  return { docs: next, inverseOps: inverse.reverse(), touched };
}

/** Prefix for ids generated for each entity (readable ids help debugging and the AI). */
export const ID_PREFIX = {
  groups: "grp", presets: "who", stops: "stop", units: "unit", categories: "cat", items: "item",
  optionGroups: "q", options: "opt", sections: "sec", checklist: "todo", holidays: "hol",
  privateItems: "pitem", flights: "flt",
};

/**
 * Replace temporary ids ("$name", as produced by the AI) with real ids, everywhere they appear.
 * Returns {ops, map} where map is tempId -> real id.
 */
export function resolveTempIds(ops, makeId = (e) => newId(ID_PREFIX[e] || "id")) {
  const map = {};
  for (const op of ops) {
    if (op.t === "create" && typeof op.id === "string" && op.id.startsWith("$") && !map[op.id]) {
      map[op.id] = makeId(op.e);
    }
  }
  const swap = (x) => {
    if (typeof x === "string") return map[x] ?? x;
    if (Array.isArray(x)) return x.map(swap);
    if (x && typeof x === "object") {
      const out = {};
      for (const [k, v] of Object.entries(x)) out[map[k] ?? k] = swap(v);
      return out;
    }
    return x;
  };
  return { ops: ops.map(swap), map };
}
