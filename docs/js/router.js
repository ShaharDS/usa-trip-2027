// Hash routing (works on GitHub Pages without server rewrites). "#/cat/lodging" -> {name:"cat", params:["lodging"]}.
// The browser back button always works because every screen is its own hash.

const scrollByRoute = new Map();
let current = null;
const handlers = new Set();

export function parseHash(hash = location.hash) {
  const clean = hash.replace(/^#\/?/, "").split("?")[0];
  const [name = "", ...params] = clean.split("/").filter(Boolean).map(decodeURIComponent);
  return { name: name || "home", params, key: clean || "home" };
}

export function currentRoute() {
  return current || parseHash();
}

export function onRoute(fn) {
  handlers.add(fn);
}

export function go(hash) {
  if (location.hash === hash) handlers.forEach((fn) => fn(current, { same: true }));
  else location.hash = hash;
}

export function startRouter() {
  const fire = () => {
    if (current) scrollByRoute.set(current.key, window.scrollY);
    current = parseHash();
    handlers.forEach((fn) => fn(current, { same: false }));
    const y = scrollByRoute.get(current.key);
    setTimeout(() => window.scrollTo(0, y ?? 0), 0); // not rAF: it stalls in hidden/background tabs
  };
  window.addEventListener("hashchange", fire);
  fire();
}
