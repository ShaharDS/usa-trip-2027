// Local dev server that mirrors GitHub Pages: docs/ is served under /usa-trip-2027/,
// so absolute-path mistakes show up here exactly as they would in production.
// Usage: node scripts/serve.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../docs/", import.meta.url));
const BASE = "/usa-trip-2027/";
const PORT = Number(process.argv[2] || process.env.PORT || 8150);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path = decodeURIComponent(url.pathname);
  if (path === "/" || path === BASE.slice(0, -1)) {
    res.writeHead(302, { Location: BASE });
    return res.end();
  }
  if (!path.startsWith(BASE)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end(`Not under ${BASE} (GitHub Pages serves the project site there)`);
  }
  let rel = path.slice(BASE.length) || "index.html";
  if (rel.endsWith("/")) rel += "index.html";
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(normalize(ROOT)) || file.includes(`${sep}..${sep}`)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404");
  }
});

server.listen(PORT, () => {
  console.log(`USA Trip 2027 site: http://localhost:${PORT}${BASE}`);
});
