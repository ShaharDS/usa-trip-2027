// Hebrew formatting: money, dates, quantities, warnings and change descriptions.
// Intl adds invisible direction marks (U+200E/U+200F) — we strip them and wrap mixed-direction
// runs in <bdi> in the UI instead, so these strings are also safe for email and the AI.

import { DEADLINE_HE, ENTITIES, STATUS_HE } from "./schema.js";

const MARKS = /[‎‏؜]/g;
export const strip = (s) => String(s).replace(MARKS, "").replace(/ /g, " ");

const nf0 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtNum = (n, digits = 0) => strip((digits === 0 ? nf0 : digits === 1 ? nf1 : nf2).format(n || 0));

/** "165,432 ₪" */
export const fmtIls = (n) => `${fmtNum(Math.round(n || 0))} ₪`;

/** "$53,210" — cents only for small non-round amounts like "$40.62" */
export function fmtUsd(n) {
  const v = n || 0;
  return strip(Math.abs(v) < 100 && !Number.isInteger(v) ? usd2.format(v) : usd0.format(Math.round(v)));
}

export function fmtMoney(n, currency) {
  return currency === "ILS" ? fmtIls(n) : fmtUsd(n);
}

/** "165 אלף", "1.2 מיליון", "950" */
export function compactHe(n) {
  const v = Math.abs(n || 0);
  const sign = n < 0 ? "-" : "";
  if (v >= 1e6) return `${sign}${fmtNum(v / 1e6, 1)} מיליון`;
  if (v >= 1e4) return `${sign}${fmtNum(Math.round(v / 1e3))} אלף`;
  if (v >= 1e3) return `${sign}${fmtNum(Math.round(v / 100) / 10, 1)} אלף`;
  return `${sign}${fmtNum(Math.round(v))}`;
}

/** "165 אלף ₪" */
export const ilsShort = (n) => `${compactHe(n)} ₪`;

/** "כ-165 אלף ₪" for numbers that are not final */
export const approxIls = (n) => `כ-${ilsShort(n)}`;

/** "בין 130 ל-230 אלף ₪" */
export function rangeIls(low, high) {
  if (Math.round(low) === Math.round(high)) return ilsShort(low);
  if (low >= 1e4 && high < 1e6) return `בין ${fmtNum(Math.round(low / 1e3))} ל-${fmtNum(Math.round(high / 1e3))} אלף ₪`;
  return `בין ${ilsShort(low)} ל-${ilsShort(high)}`;
}

/** "+3,200 ₪" / "-1,500 ₪" */
export function signedIls(n) {
  const r = Math.round(n || 0);
  if (r === 0) return "0 ₪";
  return `${r > 0 ? "+" : "-"}${fmtIls(Math.abs(r))}`;
}

/** Plain sentence for an option card: "יקר יותר ב-3,200 ₪" / "זול יותר ב-1,500 ₪" / "אותו מחיר" */
export function deltaSentence(ils) {
  const r = Math.round(ils || 0);
  if (Math.abs(r) < 50) return "בערך אותו מחיר";
  return r > 0 ? `יקר יותר ב-${fmtIls(r)}` : `זול יותר ב-${fmtIls(-r)}`;
}

// ---- dates -------------------------------------------------------------------------------------

const utc = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const DATE_FORMATS = {
  full: new Intl.DateTimeFormat("he-IL", { dateStyle: "full", timeZone: "UTC" }),
  long: new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
  dm: new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", timeZone: "UTC" }),
  dmy: new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  wshort: new Intl.DateTimeFormat("he-IL", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }),
  short: new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", timeZone: "UTC" }),
};

/** dateHe("2027-09-30") -> "יום חמישי, 30 בספטמבר"; styles: full | long | dm | dmy | wshort | short */
export function dateHe(iso, style = "long") {
  if (!iso) return "";
  return strip((DATE_FORMATS[style] || DATE_FORMATS.long).format(utc(iso)));
}

/** "30 בספטמבר – 6 באוקטובר" */
export function dateRangeHe(start, end) {
  if (!start) return "";
  if (!end || start === end) return dateHe(start, "dm");
  return `${dateHe(start, "dm")} – ${dateHe(end, "dm")}`;
}

/** "היום" / "אתמול" / "לפני 3 ימים" / "12 באוגוסט" */
export function relativeHe(isoOrMs, now = Date.now()) {
  if (!isoOrMs) return "";
  const t = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
  if (Number.isNaN(t)) return "";
  const dayOf = (ms) => Math.floor((ms + 3 * 3600_000) / 86_400_000); // Israel is UTC+2/+3; close enough for "yesterday"
  const days = dayOf(now) - dayOf(t);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  if (days < 30) return `לפני ${days} ימים`;
  return dateHe(new Date(t).toISOString().slice(0, 10), "dm");
}

export function daysUntil(iso, todayIso) {
  return Math.round((utc(iso) - utc(todayIso)) / 86_400_000);
}

// ---- quantities --------------------------------------------------------------------------------

export function nightsHe(n) {
  if (n === 1) return "לילה אחד";
  if (n === 2) return "2 לילות";
  return `${fmtNum(n)} לילות`;
}
export const daysHe = (n) => (n === 1 ? "יום אחד" : `${fmtNum(n)} ימים`);
export const peopleHe = (n) => (n === 1 ? "אדם אחד" : `${fmtNum(n, 1)} אנשים`);
export const statusHe = (s) => STATUS_HE[s] || s;

/** One factor of an item's quantity in words. */
export function partHe(part, state) {
  switch (part.kind) {
    case "people":
      return peopleHe(part.n);
    case "unit": {
      const label = state?.units?.[part.unitId]?.label || "יחידות";
      return `${fmtNum(part.n)} ${label}`;
    }
    case "nights":
      return nightsHe(part.n);
    case "days":
      return daysHe(part.n);
    case "count":
      return part.label ? `${fmtNum(part.n, 1)} ${part.label}` : `×${fmtNum(part.n, 1)}`;
    default:
      return "";
  }
}

/** "7 אנשים × 6 לילות × $460" (or "סכום כולל: $540") */
export function explainHe(itemResult, state) {
  const u = itemResult.unit;
  if (itemResult.mode === "actual") return "הסכום ששולם בפועל";
  const priceText =
    u.low !== u.high && !u.fromTable
      ? `${fmtMoney(u.low, u.currency)}–${fmtMoney(u.high, u.currency)}`
      : fmtMoney(u.typical, u.currency);
  if (!itemResult.parts.length) return `סכום כולל: ${priceText}`;
  return [...itemResult.parts.map((p) => partHe(p, state)), priceText].join(" × ");
}

// ---- warnings ----------------------------------------------------------------------------------

export function warningHe(w, state) {
  const stopName = (id) => state?.stops?.[id]?.label || "עצירה";
  const itemName = (id) => state?.items?.[id]?.label || "שורה";
  switch (w.code) {
    case "nightsShort":
      return `במסלול חסרים ${nightsHe(w.n)} בין ${dateHe(w.from, "dm")} ל-${dateHe(w.to, "dm")} — צריך לקצר עצירה או להזיז תאריך.`;
    case "nightsLeft":
      return `נשארו ${nightsHe(w.n)} בלי עצירה בין ${dateHe(w.from, "dm")} ל-${dateHe(w.to, "dm")}.`;
    case "manyFills":
      return "יותר מעצירה אחת מוגדרת \"משלימה לילות\" באותו קטע במסלול.";
    case "anchorOutside":
      return `${stopName(w.stopId)} מתחיל ב-${dateHe(w.date, "dm")}, מחוץ לתאריכי הטיול.`;
    case "priceMissing":
      return `חסר מחיר ל"${itemName(w.itemId)}" באפשרות שנבחרה.`;
    case "noCategory":
      return `"${itemName(w.itemId)}" לא שייך לאף קטגוריה.`;
    default:
      return "יש משהו לבדוק במסלול.";
  }
}

// ---- change descriptions -------------------------------------------------------------------------

const FIELD_HE = {
  label: "שם", title: "כותרת", subtitle: "כותרת משנה", note: "הערה", text: "טקסט", status: "סטטוס",
  "price.typical": "מחיר", "price.low": "מחיר נמוך", "price.high": "מחיר גבוה", "price.currency": "מטבע",
  "actual.amount": "סכום בפועל", "actual.currency": "מטבע", nights: "לילות", anchorDate: "תאריך התחלה",
  fill: "משלים לילות", count: "כמות", order: "מיקום", visible: "מוצג", icon: "אייקון", color: "צבע",
  categoryId: "קטגוריה", kind: "סוג", startDate: "תאריך יציאה", endDate: "תאריך חזרה",
  "fx.planningRate": "שער הדולר לתכנון", bufferPct: "רזרבה (%)", cardFeePct: "עמלת כרטיס (%)",
  "rule.people": "מי נספר", "rule.unit": "יחידות", "rule.count": "כמות", "rule.time": "זמן",
  done: "בוצע", dueDate: "תאריך יעד", weights: "משקלים", deadlines: "מועדים", sources: "מקורות",
  bookingRef: "קוד הזמנה", confirmation: "אישור", privateNote: "הערה פרטית", documentIds: "מסמכים",
};

function recordName(e, rec, id, docs) {
  if (e === "privateItems") return docs?.pub?.items?.[id]?.label || "שורה";
  if (e === "flights" && rec?.carrier) return `${rec.carrier}${rec.number}${rec.date ? ` ב-${dateHe(rec.date, "dm")}` : ""}`;
  return rec?.label || rec?.title || ENTITIES[e]?.labelHe || e;
}

function valueHe(path, value, rec) {
  if (value === null || value === undefined || value === "") return "ריק";
  if (path === "status") return statusHe(value);
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (path.startsWith("price.") && path !== "price.currency" && typeof value === "number") {
    return fmtMoney(value, rec?.price?.currency || "USD");
  }
  if (path === "actual.amount" && typeof value === "number") return fmtMoney(value, rec?.actual?.currency || "USD");
  if (/date$/i.test(path) && typeof value === "string") return dateHe(value, "dm");
  if (typeof value === "number") return fmtNum(value, 2);
  if (typeof value === "string") return value.length > 40 ? `${value.slice(0, 40)}…` : value;
  return "עודכן";
}

const EXPAND = new Set(["price", "actual", "fx"]);
const SUMMARY_ONLY = {
  rule: "אופן החישוב שונה", sources: "המקורות עודכנו", deadlines: "המועדים עודכנו", stopPatch: "השינוי במסלול עודכן",
  weights: "מי נספר עודכן", notIncluded: "רשימת ״לא כלול״ עודכנה", table: "טבלת המחירים עודכנה",
};

function getLeaf(obj, path) {
  return path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), obj);
}

function changedLeaves(a, b, prefix = "") {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = [];
  for (const k of keys) {
    const va = a?.[k];
    const vb = b?.[k];
    if (JSON.stringify(va ?? null) === JSON.stringify(vb ?? null)) continue;
    if (k === "table") out.push(`${prefix}${k}`);
    else if (va && vb && typeof va === "object" && typeof vb === "object" && !Array.isArray(va)) out.push(...changedLeaves(va, vb, `${prefix}${k}.`));
    else out.push(`${prefix}${k}`);
  }
  return out;
}

/** One Hebrew line per op: what changed, before ← after. `docs` = documents BEFORE the op. */
export function describeOp(op, docs) {
  const pub = docs?.pub || {};
  if (op.t === "choose") {
    const g = pub.optionGroups?.[op.groupId];
    const from = pub.options?.[g?.chosen]?.label || "—";
    const to = pub.options?.[op.optionId]?.label || "—";
    return `${g?.label || "בחירה"}: ${from} ← ${to}`;
  }
  const def = ENTITIES[op.e];
  const doc = def?.doc === "private" ? docs?.priv : pub;
  const rec = def?.singleton ? doc?.[def.path] : doc?.[def?.path]?.[op.id];
  switch (op.t) {
    case "create":
      if (op.e === "privateItems") return `שמירת פרטים פרטיים (רק למשפחה) לשורה "${recordName(op.e, op.v, op.id, docs)}"`;
      if (op.e === "flights") return `רישום טיסה ${recordName(op.e, op.v, op.id, docs)}`;
      return `הוספת ${def?.labelHe || "פריט"}: "${recordName(op.e, op.v, op.id, docs)}"`;
    case "delete":
      return `מחיקת ${def?.labelHe || "פריט"}: "${recordName(op.e, rec || op.before, op.id, docs)}"`;
    case "archive":
      return `הסרה: "${recordName(op.e, rec, op.id, docs)}"`;
    case "restore":
      return `החזרה: "${recordName(op.e, rec, op.id, docs)}"`;
    case "update": {
      const name = def?.singleton ? def.labelHe : op.e === "privateItems" ? `פרטים פרטיים של "${recordName(op.e, rec, op.id, docs)}"` : `"${recordName(op.e, rec, op.id, docs)}"`;
      const changes = [];
      for (const [path, after] of Object.entries(op.set || {})) {
        const before = path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), rec);
        const top = path.split(".")[0];
        if (path === top && EXPAND.has(top)) {
          // Whole object replaced (editor forms do this): describe only the leaves that changed.
          const recAfter = { ...rec, [top]: after };
          for (const leaf of changedLeaves(before, after)) {
            const full = `${top}.${leaf}`;
            if (leaf === "table") {
              changes.push(SUMMARY_ONLY.table);
              continue;
            }
            if (full === "fx.planningRateDate") continue;
            if (full === "actual.currency" && changedLeaves(before, after).includes("amount")) continue;
            changes.push(`${FIELD_HE[full] || FIELD_HE[top] || leaf}: ${valueHe(full, getLeaf(before, leaf), rec)} ← ${valueHe(full, getLeaf(after, leaf), recAfter)}`);
          }
          continue;
        }
        if (path === "rule.time.stopIds") {
          const name = (id) => pub.stops?.[id]?.label || "עצירה";
          const added = (after || []).filter((id) => !(before || []).includes(id)).map(name);
          const removed = (before || []).filter((id) => !(after || []).includes(id)).map(name);
          if (added.length) changes.push(`נוספו לחישוב: ${added.join(", ")}`);
          if (removed.length) changes.push(`הוסרו מהחישוב: ${removed.join(", ")}`);
          continue;
        }
        if (SUMMARY_ONLY[top]) {
          changes.push(SUMMARY_ONLY[top]);
          continue;
        }
        const label = FIELD_HE[path] || FIELD_HE[top] || path;
        const recAfter = path.startsWith("price.") && rec ? { ...rec, price: { ...rec.price, ...(op.set["price.currency"] ? { currency: op.set["price.currency"] } : {}) } } : rec;
        changes.push(`${label}: ${valueHe(path, before, rec)} ← ${valueHe(path, after, recAfter)}`);
      }
      return `${name} — ${changes.length ? [...new Set(changes)].join(", ") : "עודכן"}`;
    }
    default:
      return "שינוי";
  }
}

/** Upcoming deadline line: "ביטול חינם עד 1 באוגוסט — מלון בניו יורק (עוד 12 ימים)" */
export function deadlineHe(d) {
  const kind = DEADLINE_HE[d.kind] || "מועד";
  const left = d.daysLeft === 0 ? "היום" : d.daysLeft === 1 ? "מחר" : d.daysLeft > 0 ? `עוד ${d.daysLeft} ימים` : "עבר";
  return `${d.label || kind} ${dateHe(d.date, "dm")} — ${d.itemLabel} (${left})`;
}
