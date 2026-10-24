import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtIls, fmtUsd, compactHe, ilsShort, approxIls, rangeIls, signedIls, deltaSentence, dateHe, dateRangeHe,
  relativeHe, nightsHe, explainHe, describeOp, warningHe,
} from "../docs/js/shared/format.js";
import { computeTrip } from "../docs/js/shared/engine.js";
import { seed, seedDocs } from "./helpers.mjs";

const NBSP = " ";

test("money", () => {
  assert.equal(fmtIls(165432.4), `165,432${NBSP}₪`);
  assert.equal(fmtUsd(53210.4), "$53,210");
  assert.equal(fmtUsd(40.62), "$40.62");
  assert.equal(fmtUsd(18.5), "$18.50");
  assert.equal(fmtUsd(35), "$35");
  assert.equal(compactHe(165432), "165 אלף");
  assert.equal(compactHe(9500), "9.5 אלף");
  assert.equal(compactHe(1234567), "1.2 מיליון");
  assert.equal(compactHe(950), "950");
  assert.equal(ilsShort(165432), `165 אלף${NBSP}₪`);
  assert.equal(approxIls(165432), `כ-165 אלף${NBSP}₪`);
  assert.equal(rangeIls(130100, 229800), `בין 130 ל-230 אלף${NBSP}₪`);
  assert.equal(signedIls(3200), `+3,200${NBSP}₪`);
  assert.equal(signedIls(-1500), `-1,500${NBSP}₪`);
  assert.equal(deltaSentence(-1500), `זול יותר ב-1,500${NBSP}₪`);
  assert.equal(deltaSentence(20), "בערך אותו מחיר");
  assert.ok(!/[‎‏]/.test(fmtIls(5) + compactHe(165432)), "no invisible direction marks");
});

test("dates in Hebrew with weekday and month name", () => {
  assert.equal(dateHe("2027-09-30", "full"), "יום חמישי, 30 בספטמבר 2027");
  assert.equal(dateHe("2027-09-30"), "יום חמישי, 30 בספטמבר");
  assert.equal(dateHe("2027-10-15", "dm"), "15 באוקטובר");
  assert.equal(dateRangeHe("2027-09-30", "2027-10-06"), "30 בספטמבר – 6 באוקטובר");
  const now = Date.parse("2026-10-24T09:00:00Z");
  assert.equal(relativeHe("2026-10-24T07:00:00Z", now), "היום");
  assert.equal(relativeHe("2026-10-23T07:00:00Z", now), "אתמול");
  assert.equal(relativeHe("2026-10-20T07:00:00Z", now), "לפני 4 ימים");
});

test("quantities and explanations", () => {
  assert.equal(nightsHe(1), "לילה אחד");
  assert.equal(nightsHe(6), "6 לילות");
  const s = seed();
  const r = computeTrip(s);
  assert.equal(explainHe(r.items.hotel_nyc, s), "3 חדרי מלון × 6 לילות × $330–$700");
  assert.equal(explainHe(r.items.cruise_fare, s), "8 אנשים × $564");
  assert.equal(explainHe(r.items.cars_gas, s), "סכום כולל: $350–$900");
});

test("change descriptions read before ← after", () => {
  const docs = seedDocs();
  assert.equal(
    describeOp({ t: "update", e: "items", id: "hotel_nyc", set: { "price.typical": 420 } }, docs),
    "\"מלון בניו יורק\" — מחיר: $460 ← $420",
  );
  assert.equal(describeOp({ t: "choose", groupId: "sailing", optionId: "s1011" }, docs), "באיזו הפלגה?: יום ו׳ 15.10 · 3 לילות ← יום ב׳ 11.10 · 4 לילות");
  assert.match(describeOp({ t: "create", e: "stops", id: "dc", v: { label: "וושינגטון" } }, docs), /הוספת עצירה במסלול: "וושינגטון"/);
  assert.equal(describeOp({ t: "archive", e: "items", id: "cars_gas" }, docs), "הסרה: \"דלק וכבישי אגרה\"");
});

test("warnings in plain Hebrew", () => {
  const s = seed();
  assert.match(warningHe({ code: "nightsShort", n: 7, from: "2027-09-30", to: "2027-10-01" }, s), /חסרים 7 לילות/);
});

test("whole-object updates are described by the leaves that changed", () => {
  const docs = seedDocs();
  const price = { ...docs.plan.items.hotel_nyc.price, typical: 420 };
  assert.equal(
    describeOp({ t: "update", e: "items", id: "hotel_nyc", set: { price } }, docs),
    "\"מלון בניו יורק\" — מחיר: $460 ← $420",
  );
  assert.equal(
    describeOp({ t: "update", e: "items", id: "hotel_nyc", set: { rule: {} } }, docs),
    "\"מלון בניו יורק\" — אופן החישוב שונה",
  );
  const fx = { planningRate: 3.2, planningRateDate: "2026-11-01" };
  assert.equal(describeOp({ t: "update", e: "settings", id: "_", set: { fx } }, docs), "הגדרות — שער הדולר לתכנון: 3.11 ← 3.2");
});

test("private details and flights are described by their row", () => {
  const docs = seedDocs();
  assert.equal(describeOp({ t: "create", e: "privateItems", id: "flights_intl", v: { bookingRef: "X" } }, docs), "שמירת פרטים פרטיים (רק לעורכים) לשורה \"טיסות לארה״ב וחזרה\"");
  assert.equal(describeOp({ t: "create", e: "flights", id: "f1", v: { carrier: "LY", number: "1", date: "2027-09-30" } }, docs), "רישום טיסה LY1 ב-30 בספטמבר");
  assert.equal(
    describeOp({ t: "update", e: "items", id: "hotel_nyc", set: { status: "booked", actual: { amount: 7900, currency: "USD" } } }, docs),
    "\"מלון בניו יורק\" — סטטוס: אומדן ← הוזמן, סכום בפועל: ריק ← $7,900",
  );
});
