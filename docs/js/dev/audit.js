// Dev-only page audit for the father-friendly rules. Run in the browser console or a test harness:
//   const { audit } = await import("./js/dev/audit.js"); audit()
// Returns { ok, problems: [...] }.

const INTERACTIVE = "a[href], button, input, select, textarea, [role='button']";

function visible(el) {
  const r = el.getBoundingClientRect();
  const st = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
}

function describe(el) {
  const text = (el.getAttribute("aria-label") || el.textContent || el.value || "").trim().replace(/\s+/g, " ").slice(0, 40);
  return `<${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(" ")[0]}` : ""}> "${text}"`;
}

export function audit({ minBody = 18, minMeta = 15, minTarget = 48 } = {}) {
  const problems = [];
  const html = document.documentElement;
  if (html.lang !== "he" || html.dir !== "rtl") problems.push(`html lang/dir is ${html.lang}/${html.dir}`);
  if (html.scrollWidth > window.innerWidth + 1) problems.push(`horizontal scroll: page is ${html.scrollWidth}px wide in a ${window.innerWidth}px window`);
  const bodySize = parseFloat(getComputedStyle(document.body).fontSize);
  if (bodySize < minBody) problems.push(`body font-size ${bodySize}px < ${minBody}px`);

  // Text size: every visible text node's parent must be >= minMeta.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const small = new Set();
  const latin = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue.trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || !visible(el) || el.closest("script, style, noscript, option, .visually-hidden")) continue;
    if (parseFloat(getComputedStyle(el).fontSize) < minMeta) small.add(el);
    if (/[A-Za-z]/.test(text) && !el.closest("bdi, input, textarea, select, [dir='ltr'], [dir='auto'], svg")) latin.add(el);
  }
  for (const el of small) problems.push(`text smaller than ${minMeta}px: ${describe(el)} (${getComputedStyle(el).fontSize})`);
  for (const el of latin) problems.push(`Latin text outside <bdi>: ${describe(el)}`);

  // Tap targets (inline links inside running text are exempt, as in WCAG 2.2).
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!visible(el) || el.type === "hidden") continue;
    if (el.tagName === "A" && el.closest("p, li") && !el.className) continue;
    const r = el.getBoundingClientRect();
    if (r.width < minTarget - 0.5 || r.height < minTarget - 0.5) problems.push(`small tap target ${Math.round(r.width)}×${Math.round(r.height)}: ${describe(el)}`);
  }

  // Icons: decorative ones must sit next to visible text; meaningful ones need a label.
  for (const svg of document.querySelectorAll("svg.icon")) {
    if (!visible(svg)) continue;
    if (svg.getAttribute("aria-label")) continue;
    // Decorative icon: fine if one of its nearest 3 ancestors carries visible text (e.g. the row's name).
    let host = svg.parentElement;
    let labelled = false;
    for (let i = 0; i < 3 && host; i++, host = host.parentElement) {
      if ((host.textContent || "").trim() || host.getAttribute("aria-label")) {
        labelled = true;
        break;
      }
    }
    if (!labelled) problems.push(`icon without a visible label: ${svg.querySelector("use")?.getAttribute("href")}`);
  }
  return { ok: problems.length === 0, problems: problems.slice(0, 80), count: problems.length };
}
