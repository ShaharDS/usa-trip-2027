import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The demo trip (cost rows + sample places) is what the engine tests run on; the opening data that the owner
// loads into the live site has no cost rows (Shahar adds his own) and no sample places.
const DEMO_PATH = fileURLToPath(new URL("../docs/data/demo-trip.json", import.meta.url));
const OPENING_PATH = fileURLToPath(new URL("../docs/data/seed-data.json", import.meta.url));

/** A fresh copy of the demo plan document. */
export function seed() {
  return JSON.parse(readFileSync(DEMO_PATH, "utf8"));
}

/** A fresh copy of the opening data ("טען נתוני פתיחה"). */
export function openingData() {
  return JSON.parse(readFileSync(OPENING_PATH, "utf8"));
}

export function seedDocs() {
  return { plan: seed(), priv: { schemaVersion: 1, items: {}, flights: {}, aiSettings: {} } };
}

export const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
