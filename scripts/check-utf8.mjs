// Fails if any text file has a BOM, a U+FFFD replacement char, or Hebrew mojibake
// (UTF-8 Hebrew read as Windows-1252 shows up as "×" glued to a Latin-1 char).
// PowerShell 5.1 round-trips are the usual cause on this PC.
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SKIP_DIRS = new Set([".git", "node_modules", "lib", ".firebase", ".playwright-mcp", "shared-copy"]);
const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".json", ".html", ".css", ".md", ".rules", ".yml", ".yaml", ".svg", ".txt"]);
const MOJIBAKE = /×[ -ÿŒœŠšŸƒˆ˜–—‘-„†-•…‰‹›€™]/;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (TEXT_EXT.has(extname(entry.name).toLowerCase())) {
      yield join(dir, entry.name);
    }
  }
}

const problems = [];
for await (const file of walk(ROOT)) {
  if (file.endsWith("check-utf8.mjs")) continue;
  const buf = await readFile(file);
  const name = relative(ROOT, file);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) problems.push(`${name}: starts with a BOM`);
  const text = buf.toString("utf8");
  if (text.includes("�")) problems.push(`${name}: contains U+FFFD (broken encoding)`);
  const m = text.match(MOJIBAKE);
  if (m) problems.push(`${name}: looks like mojibake near "${m[0]}"`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("check-utf8: all text files are clean UTF-8");
