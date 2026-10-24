// Validation of the trip documents and of change ops, driven by schema.js.
// Used by the editor before sending, by Cloud Functions before committing (the real gate), and on AI proposals.

import { COMMON_FIELDS, ENTITIES, ID_RE } from "./schema.js";
import { applyOps } from "./ops.js";

export const MAX_OPS = 60;
export const MAX_PUBLIC_BYTES = 700_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isPlainObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

function collectionOf(docs, entity) {
  const def = ENTITIES[entity];
  const doc = def.doc === "public" ? docs.pub : docs.priv;
  return doc?.[def.path] || {};
}

function checkValue(def, value, path, ctx, errors) {
  if (value === undefined || value === null) {
    if (def.required) errors.push(`${path}: חסר ערך`);
    return;
  }
  switch (def.type) {
    case "string":
      if (typeof value !== "string") errors.push(`${path}: צריך להיות טקסט`);
      else if (def.max && value.length > def.max) errors.push(`${path}: ארוך מדי (עד ${def.max} תווים)`);
      break;
    case "int":
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${path}: צריך להיות מספר`);
      else if (def.type === "int" && !Number.isInteger(value)) errors.push(`${path}: צריך להיות מספר שלם`);
      else if ((def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max)) {
        errors.push(`${path}: מחוץ לטווח (${def.min}–${def.max})`);
      }
      break;
    case "bool":
      if (typeof value !== "boolean") errors.push(`${path}: צריך להיות כן/לא`);
      break;
    case "enum":
      if (!def.values.includes(value)) errors.push(`${path}: ערך לא מוכר "${value}"`);
      break;
    case "date": {
      if (typeof value !== "string" || !DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
        errors.push(`${path}: תאריך לא תקין`);
      }
      break;
    }
    case "url": {
      let ok = typeof value === "string" && value.length <= 500;
      if (ok) {
        try {
          ok = new URL(value).protocol === "https:";
        } catch {
          ok = false;
        }
      }
      if (!ok) errors.push(`${path}: קישור חייב להתחיל ב-https://`);
      break;
    }
    case "ref":
      if (typeof value !== "string" || !(value in collectionOf(ctx.docs, def.entity))) {
        errors.push(`${path}: מפנה לפריט שלא קיים (${def.entity}/${value})`);
      }
      break;
    case "people":
      if (typeof value === "number") {
        if (!Number.isFinite(value) || value < 0 || value > 1000) errors.push(`${path}: מספר אנשים לא תקין`);
      } else if (typeof value !== "string" || !(value in (ctx.docs.pub.presets || {}))) {
        errors.push(`${path}: קבוצת אנשים לא מוכרת`);
      }
      break;
    case "array":
      if (!Array.isArray(value)) errors.push(`${path}: צריך להיות רשימה`);
      else {
        if (def.max && value.length > def.max) errors.push(`${path}: יותר מדי פריטים (עד ${def.max})`);
        value.forEach((v, i) => checkValue(def.of, v, `${path}[${i}]`, ctx, errors));
      }
      break;
    case "object":
      if (!isPlainObject(value)) errors.push(`${path}: מבנה לא תקין`);
      else checkFields(def.fields, value, path, ctx, errors, {});
      break;
    case "map":
      if (!isPlainObject(value)) errors.push(`${path}: מבנה לא תקין`);
      else {
        const keys = Object.keys(value);
        if (def.maxKeys && keys.length > def.maxKeys) errors.push(`${path}: יותר מדי ערכים`);
        for (const k of keys) {
          if (!ID_RE.test(k)) errors.push(`${path}: מפתח לא תקין "${k}"`);
          checkValue(def.of, value[k], `${path}.${k}`, ctx, errors);
        }
      }
      break;
    default:
      errors.push(`${path}: סוג שדה לא מוכר`);
  }
}

function checkFields(fields, rec, path, ctx, errors, extra) {
  for (const key of Object.keys(rec)) {
    if (!(key in fields) && !(key in extra)) errors.push(`${path}.${key}: שדה לא מוכר`);
  }
  for (const [key, def] of Object.entries(fields)) checkValue(def, rec[key], `${path}.${key}`, ctx, errors);
  for (const [key, def] of Object.entries(extra)) if (key in rec) checkValue(def, rec[key], `${path}.${key}`, ctx, errors);
}

/** Errors for one record (empty array = valid). */
export function validateRecord(entity, rec, docs, id = "_") {
  const def = ENTITIES[entity];
  const errors = [];
  if (!def) return [`ישות לא מוכרת "${entity}"`];
  const path = def.singleton ? entity : `${entity}/${id}`;
  if (!isPlainObject(rec)) return [`${path}: מבנה לא תקין`];
  checkFields(def.fields, rec, path, { docs }, errors, def.singleton ? {} : COMMON_FIELDS);

  if (entity === "items" && isPlainObject(rec.price)) {
    const { low, typical, high } = rec.price;
    if (typeof low === "number" && typeof typical === "number" && low > typical) errors.push(`${path}: המחיר הנמוך גבוה מהרגיל`);
    if (typeof high === "number" && typeof typical === "number" && high < typical) errors.push(`${path}: המחיר הגבוה נמוך מהרגיל`);
  }
  if (entity === "options" && isPlainObject(rec.stopPatch)) {
    for (const stopId of Object.keys(rec.stopPatch)) {
      if (!(stopId in (docs.pub.stops || {}))) errors.push(`${path}: עצירה לא קיימת "${stopId}"`);
    }
  }
  if (entity === "optionGroups" && rec.chosen && docs.pub.options?.[rec.chosen]?.groupId !== id) {
    errors.push(`${path}: האפשרות שנבחרה לא שייכת לשאלה הזו`);
  }
  if (entity === "settings" && rec.startDate && rec.endDate && rec.startDate > rec.endDate) {
    errors.push(`${path}: תאריך הסיום לפני תאריך ההתחלה`);
  }
  if (entity === "holidays" && rec.start && rec.end && rec.start > rec.end) errors.push(`${path}: החג מסתיים לפני שהוא מתחיל`);
  return errors;
}

/** Validate both documents completely. */
export function validateDocs(docs) {
  const errors = [];
  for (const [entity, def] of Object.entries(ENTITIES)) {
    const doc = def.doc === "public" ? docs.pub : docs.priv;
    if (!doc) continue;
    if (def.singleton) {
      if (doc[def.path] !== undefined) errors.push(...validateRecord(entity, doc[def.path], docs));
      continue;
    }
    const coll = doc[def.path];
    if (coll === undefined) continue;
    if (!isPlainObject(coll)) {
      errors.push(`${entity}: מבנה לא תקין`);
      continue;
    }
    for (const [id, rec] of Object.entries(coll)) {
      if (!ID_RE.test(id)) errors.push(`${entity}/${id}: מזהה לא תקין`);
      errors.push(...validateRecord(entity, rec, docs, id));
    }
  }
  const bytes = JSON.stringify(docs.pub || {}).length;
  if (bytes > MAX_PUBLIC_BYTES) errors.push(`המסמך הציבורי גדול מדי (${bytes} בתים)`);
  return errors;
}

function checkOpShape(op, i, opts, errors) {
  const where = `פעולה ${i + 1}`;
  if (!isPlainObject(op)) return errors.push(`${where}: מבנה לא תקין`);
  const allowedTypes = opts.allowedOps || ["create", "delete", "update", "archive", "restore", "choose"];
  if (!allowedTypes.includes(op.t)) return errors.push(`${where}: סוג פעולה לא מותר "${op.t}"`);
  if (op.t === "choose") {
    if (typeof op.groupId !== "string" || typeof op.optionId !== "string") errors.push(`${where}: חסרה שאלה או אפשרות`);
    if (opts.allowedEntities && !opts.allowedEntities.includes("optionGroups")) errors.push(`${where}: אין הרשאה לבחור אפשרות`);
    return;
  }
  const def = ENTITIES[op.e];
  if (!def) return errors.push(`${where}: ישות לא מוכרת "${op.e}"`);
  if (opts.allowedEntities && !opts.allowedEntities.includes(op.e)) errors.push(`${where}: אין הרשאה לשנות ${def.labelHe}`);
  if (def.singleton ? op.id !== "_" : typeof op.id !== "string" || !ID_RE.test(op.id)) errors.push(`${where}: מזהה לא תקין`);
  if (op.t === "create" && !isPlainObject(op.v)) errors.push(`${where}: חסר תוכן לפריט החדש`);
  if (op.t === "update") {
    if (!isPlainObject(op.set) || !Object.keys(op.set).length) errors.push(`${where}: אין מה לעדכן`);
    else {
      for (const path of Object.keys(op.set)) {
        const top = path.split(".")[0];
        if (!(top in def.fields) && !(top in COMMON_FIELDS)) errors.push(`${where}: שדה לא מוכר "${path}"`);
        const allowed = opts.allowedFields?.[op.e];
        if (allowed && !allowed.includes(top)) errors.push(`${where}: אין הרשאה לשנות את השדה "${top}"`);
      }
    }
  }
}

/**
 * Validate ops end to end: shape, permissions, then apply to a copy and validate the result.
 * @param opts {allowedOps, allowedEntities, allowedFields:{entity:[field]}, maxOps, version}
 * @returns {{ok, errors, docs, inverseOps, touched}}
 */
export function validateOps(docs, ops, opts = {}) {
  const errors = [];
  if (!Array.isArray(ops) || ops.length === 0) return { ok: false, errors: ["אין שינויים"] };
  const max = opts.maxOps ?? MAX_OPS;
  if (ops.length > max) return { ok: false, errors: [`יותר מדי שינויים בבת אחת (עד ${max})`] };
  ops.forEach((op, i) => checkOpShape(op, i, opts, errors));
  if (errors.length) return { ok: false, errors };
  let applied;
  try {
    applied = applyOps(docs, ops, { version: opts.version });
  } catch (err) {
    return { ok: false, errors: [String(err.message || err)] };
  }
  const after = validateDocs(applied.docs);
  if (after.length) return { ok: false, errors: after };
  return { ok: true, errors: [], ...applied };
}
