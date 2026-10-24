import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEED_PATH = fileURLToPath(new URL("../docs/data/seed-data.json", import.meta.url));

/** A fresh copy of the seed public document. */
export function seed() {
  return JSON.parse(readFileSync(SEED_PATH, "utf8"));
}

export function seedDocs() {
  return { plan: seed(), priv: { schemaVersion: 1, items: {}, flights: {}, aiSettings: {} } };
}

export const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
