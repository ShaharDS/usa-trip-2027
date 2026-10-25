// Single source of truth for the trip data shape.
// Drives: the validator (validate.js), the editor forms, the AI tool schemas (functions/src/lib/tools.ts)
// and the Hebrew labels. Pure data + tiny helpers, no DOM, no Firebase — runs in the browser and in Node.

export const SCHEMA_VERSION = 1;

/** Icons available in docs/assets/icons.svg (Lucide). Categories, stops and sections pick from these. */
export const ICONS = [
  "plane", "hotel", "bed", "house", "car", "route", "fuel", "ferris", "coaster", "ship", "anchor",
  "food", "coffee", "star", "ticket", "camera", "landmark", "building", "bus", "train", "pin",
  "shield", "passport", "luggage", "baby", "palm", "sun", "bag", "gift", "phone", "wallet", "map",
];

/** Category / chart colors. Picked to stay distinct for color-blind readers; always shown with icon + word. */
export const COLORS = {
  blue: "#0077BB",
  indigo: "#332288",
  brown: "#8B5A2B",
  magenta: "#DC267F",
  sky: "#3C9AD6",
  gold: "#B8860B",
  plum: "#882255",
  teal: "#00796B",
  green: "#15704F",
  slate: "#525B73",
};

export const STATUSES = ["estimate", "quote", "booked", "paid"];
export const STATUS_HE = { estimate: "אומדן", quote: "הצעת מחיר", booked: "הוזמן", paid: "שולם" };
export const CURRENCIES = ["USD", "ILS"];
export const STOP_KINDS = ["city", "road", "parks", "cruise", "beach", "transit", "other"];
export const STOP_KIND_HE = {
  city: "עיר", road: "בדרך", parks: "פארקים", cruise: "שייט", beach: "חוף", transit: "מעבר", other: "אחר",
};
/** Places on the day-by-day route (Wanderlog-style): where we sleep, what we see, where we stop on the way. */
export const PLACE_KINDS = ["hotel", "sight", "food", "park", "stop", "flight", "port", "shop", "other"];
export const PLACE_KIND_HE = {
  hotel: "לינה", sight: "אטרקציה", food: "אוכל", park: "פארק", stop: "עצירה בדרך", flight: "טיסה", port: "נמל", shop: "קניות", other: "מקום",
};
export const PLACE_KIND_ICON = {
  hotel: "hotel", sight: "landmark", food: "food", park: "ferris", stop: "fuel", flight: "plane", port: "ship", shop: "bag", other: "pin",
};

/**
 * US states ("sub country") the route may pass through: code → Hebrew name + band colour (a COLORS key).
 * The colour always comes with the name. Codes not listed are shown as they are.
 */
export const REGIONS = {
  NY: { he: "ניו יורק", color: "blue" },
  NJ: { he: "ניו ג׳רזי", color: "teal" },
  CT: { he: "קונטיקט", color: "slate" },
  MA: { he: "מסצ׳וסטס", color: "brown" },
  PA: { he: "פנסילבניה", color: "indigo" },
  DE: { he: "דלאוור", color: "gold" },
  MD: { he: "מרילנד", color: "plum" },
  DC: { he: "וושינגטון הבירה", color: "magenta" },
  VA: { he: "וירג׳יניה", color: "green" },
  WV: { he: "מערב וירג׳יניה", color: "slate" },
  NC: { he: "צפון קרוליינה", color: "brown" },
  SC: { he: "דרום קרוליינה", color: "sky" },
  GA: { he: "ג׳ורג׳יה", color: "indigo" },
  TN: { he: "טנסי", color: "teal" },
  AL: { he: "אלבמה", color: "plum" },
  FL: { he: "פלורידה", color: "gold" },
};

export const SECTION_TYPES = [
  "hero", "whatsNew", "certainty", "categories", "options", "timeline", "note", "checklist", "docsShortcut", "askBox",
];
export const SECTION_HE = {
  hero: "הסכום הכולל",
  whatsNew: "מה השתנה",
  certainty: "כמה אנחנו בטוחים",
  categories: "לאן הולך הכסף",
  options: "אפשרויות שאנחנו שוקלים",
  timeline: "מסלול הטיול",
  note: "הודעה",
  checklist: "רשימת משימות",
  docsShortcut: "מסמכים",
  askBox: "שאלו את הטיול",
};
export const DEADLINE_KINDS = ["freeCancel", "finalPayment", "payment", "checkIn", "custom"];
export const DEADLINE_HE = {
  freeCancel: "ביטול חינם עד", finalPayment: "תשלום אחרון", payment: "תשלום", checkIn: "צ׳ק-אין", custom: "מועד",
};
export const SOURCE_TAGS = ["V", "S", "E"];

// ---- field-type helpers --------------------------------------------------------------------------

export const T = {
  str: (max, opts = {}) => ({ type: "string", max, ...opts }),
  int: (min, max, opts = {}) => ({ type: "int", min, max, ...opts }),
  num: (min, max, opts = {}) => ({ type: "number", min, max, ...opts }),
  bool: (opts = {}) => ({ type: "bool", ...opts }),
  en: (values, opts = {}) => ({ type: "enum", values, ...opts }),
  date: (opts = {}) => ({ type: "date", ...opts }),
  time: (opts = {}) => ({ type: "time", ...opts }), // "HH:MM", 24h
  url: (opts = {}) => ({ type: "url", ...opts }),
  ref: (entity, opts = {}) => ({ type: "ref", entity, ...opts }),
  arr: (of, max, opts = {}) => ({ type: "array", of, max, ...opts }),
  obj: (fields, opts = {}) => ({ type: "object", fields, ...opts }),
  map: (of, maxKeys, opts = {}) => ({ type: "map", of, maxKeys, ...opts }),
  people: (opts = {}) => ({ type: "people", ...opts }), // a presets id, or a plain number of people
};

/** Fields every entity may carry (managed by the app, not by editors). */
export const COMMON_FIELDS = {
  order: T.num(-1e6, 1e6),
  archived: T.bool(),
  v: T.int(0, 1e9),
};

const price = T.obj({
  low: T.num(0, 1e7),
  typical: T.num(0, 1e7, { required: true }),
  high: T.num(0, 1e7),
  currency: T.en(CURRENCIES, { required: true }),
  table: T.obj({
    rowGroup: T.ref("optionGroups", { required: true }),
    colGroup: T.ref("optionGroups"),
    cells: T.map(T.map(T.num(0, 1e7), 40), 40, { required: true }),
  }),
});

const rule = T.obj({
  people: T.people(),
  unit: T.ref("units"),
  time: T.obj({
    by: T.en(["nights", "days"], { required: true }),
    stopIds: T.arr(T.ref("stops"), 30),
  }),
  count: T.num(0, 1e5),
  countLabel: T.str(30),
});

/**
 * Entities. `doc` says which Firestore document holds them: "plan" (the whole trip with prices) and
 * "private" (booking codes, flights, AI settings) — both editors only. Nobody else reads either: anyone
 * with the link reads the price-free route document that route.js derives from the plan on every write.
 * `singleton` entities have exactly one record stored directly at `path` (id "_").
 */
export const ENTITIES = {
  settings: {
    doc: "plan", singleton: true, path: "settings", labelHe: "הגדרות",
    fields: {
      title: T.str(80, { required: true }),
      subtitle: T.str(120),
      startDate: T.date({ required: true }),
      startTime: T.time(), // when the trip starts, Israel time (the flight) — the editors' countdown
      endDate: T.date({ required: true }),
      fx: T.obj({ planningRate: T.num(1, 10, { required: true }), planningRateDate: T.date() }, { required: true }),
      bufferPct: T.num(0, 50),
      cardFeePct: T.num(0, 10),
      perPersonPreset: T.ref("presets"),
      notIncluded: T.arr(T.str(80), 20),
      contactText: T.str(120),
    },
  },
  groups: {
    doc: "plan", path: "groups", labelHe: "קבוצת נוסעים",
    fields: { label: T.str(40, { required: true }), count: T.int(0, 50, { required: true }), note: T.str(120) },
  },
  presets: {
    doc: "plan", path: "presets", labelHe: "מי נספר",
    fields: { label: T.str(40, { required: true }), weights: T.map(T.num(0, 1), 20, { required: true }) },
  },
  stops: {
    doc: "plan", path: "stops", labelHe: "עצירה במסלול",
    fields: {
      label: T.str(60, { required: true }),
      kind: T.en(STOP_KINDS, { required: true }),
      icon: T.en(ICONS),
      nights: T.int(0, 60),
      fill: T.bool(),
      anchorDate: T.date(),
      note: T.str(300),
      region: T.str(4), // US state code of a stop that sits in one state (NY, FL…); empty for a road leg
    },
  },
  units: {
    doc: "plan", path: "units", labelHe: "יחידות (חדרים / רכבים)",
    fields: { label: T.str(40, { required: true }), count: T.int(0, 50, { required: true }), icon: T.en(ICONS) },
  },
  categories: {
    doc: "plan", path: "categories", labelHe: "קטגוריה",
    fields: {
      label: T.str(40, { required: true }),
      icon: T.en(ICONS, { required: true }),
      color: T.en(Object.keys(COLORS), { required: true }),
      note: T.str(300),
    },
  },
  items: {
    doc: "plan", path: "items", labelHe: "שורת עלות",
    fields: {
      categoryId: T.ref("categories", { required: true }),
      label: T.str(80, { required: true }),
      note: T.str(500),
      rule,
      price: { ...price, required: true },
      actual: T.obj({ amount: T.num(0, 1e7, { required: true }), currency: T.en(CURRENCIES, { required: true }), date: T.date() }),
      status: T.en(STATUSES, { required: true }),
      tag: T.en(SOURCE_TAGS),
      optionId: T.ref("options"),
      sources: T.arr(T.obj({ url: T.url({ required: true }), label: T.str(80), checkedAt: T.date() }), 10),
      deadlines: T.arr(
        T.obj({
          kind: T.en(DEADLINE_KINDS, { required: true }),
          date: T.date({ required: true }),
          label: T.str(80),
          notifyDays: T.arr(T.int(0, 365), 5),
        }),
        10,
      ),
    },
  },
  optionGroups: {
    doc: "plan", path: "optionGroups", labelHe: "שאלה עם אפשרויות",
    fields: { label: T.str(60, { required: true }), question: T.str(120), chosen: T.ref("options") },
  },
  options: {
    doc: "plan", path: "options", labelHe: "אפשרות",
    fields: {
      groupId: T.ref("optionGroups", { required: true }),
      label: T.str(80, { required: true }),
      details: T.str(300),
      stopPatch: T.map(T.obj({ nights: T.int(0, 60), anchorDate: T.date(), fill: T.bool() }), 10),
    },
  },
  sections: {
    doc: "plan", path: "sections", labelHe: "חלק בעמוד הבית",
    fields: {
      type: T.en(SECTION_TYPES, { required: true }),
      title: T.str(60),
      visible: T.bool(),
      text: T.str(1000),
    },
  },
  // ---- the day-by-day route ----
  places: {
    doc: "plan", path: "places", labelHe: "מקום במסלול",
    fields: {
      label: T.str(80, { required: true }),
      kind: T.en(PLACE_KINDS, { required: true }),
      date: T.date(), // the day of a visit / stop; hotels use checkIn + checkOut instead
      checkIn: T.date(),
      checkOut: T.date(),
      time: T.time(),
      endTime: T.time(),
      stopId: T.ref("stops"),
      address: T.str(200),
      city: T.str(60),
      region: T.str(4), // US state code
      lat: T.num(-90, 90),
      lng: T.num(-180, 180),
      mapsUrl: T.url(),
      website: T.url(),
      phone: T.str(30),
      note: T.str(300),
      maybe: T.bool(), // "אולי נעצור"
      photo: T.obj({ url: T.url({ required: true }), credit: T.str(160), page: T.url() }),
      passIds: T.arr(T.str(40), 20), // entry tickets / boarding passes shown at the gate (later)
    },
  },
  days: {
    doc: "plan", path: "days", labelHe: "יום בטיול",
    fields: { date: T.date({ required: true }), title: T.str(60), note: T.str(300) },
  },
  checklist: {
    doc: "plan", path: "checklist", labelHe: "משימה",
    fields: { label: T.str(120, { required: true }), done: T.bool(), dueDate: T.date(), itemId: T.ref("items") },
  },
  holidays: {
    doc: "plan", path: "holidays", labelHe: "חג",
    fields: {
      label: T.str(40, { required: true }),
      start: T.date({ required: true }),
      end: T.date({ required: true }),
      kind: T.en(["jewish", "us", "other"]),
    },
  },
  // ---- private document (editors only) ----
  privateItems: {
    doc: "private", path: "items", labelHe: "פרטי הזמנה",
    fields: {
      bookingRef: T.str(40),
      confirmation: T.str(80),
      privateNote: T.str(1000),
      contact: T.str(200),
      documentIds: T.arr(T.str(40), 20),
    },
  },
  flights: {
    doc: "private", path: "flights", labelHe: "טיסה",
    fields: {
      itemId: T.ref("items"),
      carrier: T.str(3, { required: true }),
      number: T.str(6, { required: true }),
      date: T.date({ required: true }),
      from: T.str(4),
      to: T.str(4),
      schedDep: T.str(5),
      schedArr: T.str(5),
    },
  },
  aiSettings: {
    doc: "private", singleton: true, path: "aiSettings", labelHe: "הגדרות AI",
    fields: {
      model: T.str(60),
      monthlyBudgetUsd: T.num(0, 1000),
      dailyCapFamily: T.int(0, 500),
      dailyCapEditor: T.int(0, 500),
      includePrivateInAsk: T.bool(),
    },
  },
};

export const ENTITY_NAMES = Object.keys(ENTITIES);

/** Record collections of each document (singletons excluded). */
export const PLAN_COLLECTIONS = ENTITY_NAMES.filter((e) => ENTITIES[e].doc === "plan" && !ENTITIES[e].singleton);
export const PRIVATE_COLLECTIONS = ENTITY_NAMES.filter((e) => ENTITIES[e].doc === "private" && !ENTITIES[e].singleton);

export const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** New random id with a readable prefix, e.g. newId("item") -> "item_k3j9x2qa". */
export function newId(prefix = "id") {
  const rand = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  return `${prefix}_${rand}`;
}

/** Empty plan + private documents with the right top-level keys. */
export function emptyDocs() {
  const plan = { schemaVersion: SCHEMA_VERSION, version: 0, updatedAt: null, updatedByLabel: "", recent: [] };
  const priv = { schemaVersion: SCHEMA_VERSION };
  for (const [name, def] of Object.entries(ENTITIES)) {
    const target = def.doc === "plan" ? plan : priv;
    if (!(def.path in target)) target[def.path] = def.singleton ? {} : {};
  }
  return { plan, priv };
}
