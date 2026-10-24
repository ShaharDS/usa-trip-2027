// `firebase deploy` uploads only functions/, so the shared engine (docs/js/shared) and the AI background
// notes (seed/reference-prices.md) are copied in before every build. Both copies are gitignored.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const shared = `${root}docs/js/shared`;
const target = `${root}functions/src/shared`;
const assets = `${root}functions/assets`;

rmSync(target, { recursive: true, force: true });
cpSync(shared, target, { recursive: true });
mkdirSync(assets, { recursive: true });
for (const file of ["reference-prices.md"]) {
  const src = `${root}seed/${file}`;
  if (existsSync(src)) cpSync(src, `${assets}/${file}`);
}
console.log("sync-shared: copied docs/js/shared -> functions/src/shared and seed notes -> functions/assets");
