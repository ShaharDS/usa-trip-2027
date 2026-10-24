// Tiny DOM helpers. All text goes through textContent (never innerHTML), and runs of Latin letters /
// dollar amounts inside Hebrew text are wrapped in <bdi> so "Utopia · חדר פנימי" or "$330–$700" render
// in the right order.

const SVG_NS = "http://www.w3.org/2000/svg";
const LATIN_RUN = /[A-Za-z$€][A-Za-z0-9$€.,'’&()/\-–:+ ]*[A-Za-z0-9)]|[$€][\d.,]+/g;

/** Text with Latin runs isolated in <bdi>. */
export function bidi(text) {
  const frag = document.createDocumentFragment();
  const s = String(text ?? "");
  let last = 0;
  for (const m of s.matchAll(LATIN_RUN)) {
    if (m.index > last) frag.append(s.slice(last, m.index));
    const b = document.createElement("bdi");
    b.textContent = m[0];
    frag.append(b);
    last = m.index + m[0].length;
  }
  if (last < s.length) frag.append(s.slice(last));
  return frag;
}

function append(el, child) {
  if (child === null || child === undefined || child === false || child === true) return;
  if (Array.isArray(child)) return child.forEach((c) => append(el, c));
  if (child instanceof Node) return el.append(child);
  el.append(bidi(child));
}

/**
 * h("a", {class: "btn", href: "#/", onclick: fn}, "טקסט", child...)
 * attrs: class, style (string or object), on<event>, dataset (object), and any attribute (false/null = omitted).
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "value" && (tag === "input" || tag === "textarea" || tag === "select")) el.value = value;
    else if (key === "checked" || key === "selected" || key === "disabled") el[key] = !!value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

/** <svg class="icon"><use href="assets/icons.svg#i-NAME"/></svg> — decorative unless a label is given. */
export function icon(name, cls = "", label = "") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", `icon ${cls}`.trim());
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `assets/icons.svg#i-${name}`);
  svg.append(use);
  return svg;
}

/** Light tint of a hex color for icon chips (works without CSS color-mix). */
export function tint(hex, alpha = 0.12) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(c * alpha + 255 * (1 - alpha));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function mount(target, ...nodes) {
  target.replaceChildren(...nodes.flat().filter(Boolean));
}

/** Short-lived message at the bottom ("נשמר ✓" with an optional action). */
export function toast(message, action) {
  document.querySelector(".toast")?.remove();
  const el = h("div", { class: "toast", role: "status" }, h("span", {}, message),
    action ? h("button", { type: "button", onclick: () => { el.remove(); action.run(); } }, action.label) : null);
  document.body.append(el);
  setTimeout(() => el.remove(), action ? 8000 : 3500);
}

export const safeStorage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* private mode / blocked storage: fine */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};
