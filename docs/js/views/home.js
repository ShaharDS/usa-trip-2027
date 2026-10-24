// Editors' home screen (the cost summary): rendered entirely from state.sections (the layout is data —
// editors and the AI can add, hide, reorder and retitle sections). Unknown section types are skipped.
// Everyone else gets renderRouteHome (views/route.js) instead — they never see prices.
import { h, icon, safeStorage } from "../ui/h.js";
import { activeList } from "../shared/engine.js";
import { SECTION_HE } from "../shared/schema.js";
import {
  approxIls, dateHe, dateRangeHe, deltaSentence, fmtIls, fmtNum, fmtUsd, ilsShort, nightsHe, rangeIls, relativeHe,
  signedIls, warningHe,
} from "../shared/format.js";
import { catChip, catColor, checklistItems, ilsText, shareButton } from "../components/common.js";
import { timelineList } from "./route.js";
import { footer } from "./footer.js";
import { can, store } from "../store.js";
import { sectionTools } from "../edit/sections.js";
import { justAdded } from "../edit/tools.js";

const LAST_SEEN_KEY = "usaTrip.lastSeenVersion";

function isFinalTotal(r) {
  return r.certainty.every((c) => c.status === "paid" || c.status === "booked" || c.pct < 0.0001);
}

function hero(ctx) {
  const { state, r } = ctx;
  const s = state.settings;
  const closedPct = r.certainty.filter((c) => c.status === "paid" || c.status === "booked").reduce((n, c) => n + c.pct, 0);
  const final = isFinalTotal(r);
  return h(
    "section",
    { class: "hero", "aria-label": "הסכום הכולל" },
    h("p", { class: "hero-title" }, s.title),
    h("p", { class: "hero-dates" },
      `${dateRangeHe(s.startDate, s.endDate)} ${s.endDate.slice(0, 4)} · ${fmtNum(r.people.everyone)} נוסעים · ${nightsHe(r.itinerary.tripNights)}`),
    h("p", { class: "hero-label" }, final ? "כל הטיול עולה:" : "כל הטיול יעלה בערך:"),
    h("p", { class: "hero-total num" }, final ? fmtIls(r.total.ils.typ) : approxIls(r.total.ils.typ)),
    h("p", { class: "hero-usd" }, `שזה בערך ${fmtUsd(r.total.usd.typ)}`),
    Math.round(r.total.ils.low) !== Math.round(r.total.ils.high)
      ? h("p", { class: "hero-range" }, `${rangeIls(r.total.ils.low, r.total.ils.high)}, תלוי במחירים שעוד לא סגרנו`)
      : null,
    h("div", { class: "hero-split" },
      h("div", {}, h("span", { class: "k" }, "לאדם, בממוצע"), h("span", { class: "v num" }, approxIls(r.perPerson.ils.typ))),
      h("div", {}, h("span", { class: "k" }, "כבר סגור"), h("span", { class: "v num" }, `${fmtNum(Math.round(closedPct))}%`))),
    state.updatedAt
      ? h("p", { class: "hero-updated" }, `עודכן ${relativeHe(state.updatedAt)}${state.updatedByLabel ? ` · ${state.updatedByLabel}` : ""}`)
      : null,
    shareButton(),
  );
}

function whatsNew(ctx) {
  const { state } = ctx;
  const version = state.version || 0;
  const stored = safeStorage.get(LAST_SEEN_KEY);
  if (stored === null) {
    safeStorage.set(LAST_SEEN_KEY, String(version));
    return null;
  }
  const lastSeen = Number(stored) || 0;
  const fresh = (state.recent || []).filter((e) => e.version > lastSeen).slice(0, 3);
  if (!fresh.length) return null;
  return h(
    "section",
    { class: "card whatsnew" },
    h("h2", {}, icon("sparkles"), ctx.section.title || "מה השתנה מאז הביקור הקודם"),
    h("ul", {}, fresh.map((e) =>
      h("li", {}, e.summary,
        typeof e.deltaIlsTyp === "number" && Math.abs(e.deltaIlsTyp) >= 50
          ? h("span", { class: "meta" }, ` (הסכום הכולל: ${signedIls(e.deltaIlsTyp)})`)
          : null,
        h("span", { class: "meta" }, ` · ${relativeHe(e.at)}`)))),
    h("button", { type: "button", class: "btn btn-secondary", onclick: () => { safeStorage.set(LAST_SEEN_KEY, String(version)); ctx.rerender(); } }, "הבנתי"),
  );
}

const CERT_LABEL = { paid: "כבר שולם", booked: "הוזמן", quote: "הצעת מחיר", estimate: "אומדן" };
const CERT_CLASS = { paid: "cert-paid", booked: "cert-booked", quote: "cert-quote", estimate: "cert-estimate" };

function certainty(ctx) {
  const { r } = ctx;
  const closed = r.certainty.filter((c) => c.status === "paid" || c.status === "booked").reduce((n, c) => n + c.pct, 0);
  const sentence = closed >= 99.5
    ? "כל הסכום כבר סגור."
    : closed < 1
      ? "עוד לא סגרנו כלום — כל הסכומים הם אומדנים והצעות מחיר, והם עוד ישתנו."
      : `${fmtNum(Math.round(closed))}% מהסכום כבר סגור. השאר — אומדנים והצעות מחיר שעוד ישתנו.`;
  return h(
    "section",
    { class: "card" },
    h("h2", {}, icon("done"), ctx.section.title || "כמה מזה כבר סגור?"),
    h("p", { class: "card-sub" }, sentence),
    h("div", { class: "cert-bar", role: "img", "aria-label": r.certainty.map((c) => `${CERT_LABEL[c.status]} ${Math.round(c.pct)}%`).join(", ") },
      r.certainty.filter((c) => c.pct > 0.2).map((c) => h("div", { class: `cert-seg ${CERT_CLASS[c.status]}`, style: { width: `${c.pct}%` } }))),
    h("ul", { class: "cert-legend" }, r.certainty.map((c) =>
      h("li", {},
        h("span", { class: `cert-dot ${CERT_CLASS[c.status]}` }),
        h("span", {}, CERT_LABEL[c.status]),
        h("span", { class: "amt num" }, ilsShort(c.amount.ils.typ)),
        h("span", { class: "pct num" }, `${fmtNum(Math.round(c.pct))}%`)))),
  );
}

function categoryMeta(cat, r) {
  const rows = cat.itemIds.map((id) => r.items[id]).filter((x) => x.included);
  if (!rows.length) return "אין עדיין שורות";
  const statuses = new Set(rows.map((x) => x.status));
  const closed = rows.every((x) => x.status === "paid" || x.status === "booked");
  const some = rows.some((x) => x.status === "paid" || x.status === "booked");
  const word = closed ? "הכל סגור" : some ? "חלק סגור" : statuses.has("quote") && statuses.size === 1 ? "הצעת מחיר" : "אומדן";
  return `${rows.length === 1 ? "שורה אחת" : `${rows.length} שורות`} · ${word}`;
}

export function categoryList(ctx, { withTotal = true } = {}) {
  const { r } = ctx;
  const max = Math.max(1, ...r.categories.map((c) => c.amount.ils.typ), ...r.adjustments.map((a) => a.amount.ils.typ));
  const rows = r.categories.map((cat) => {
    const final = cat.itemIds.every((id) => !r.items[id].included || r.items[id].mode === "actual");
    return h("li", {},
      h("a", { class: ["cat-row", justAdded(cat.id) ? "cat-row-new" : ""], href: `#/cat/${encodeURIComponent(cat.id)}` },
        catChip(cat),
        h("div", { class: "grow" },
          h("div", { class: "row-between" },
            h("span", { class: "cat-name" }, cat.label),
            h("span", { class: "cat-amount num" }, ilsText(cat.amount, final && cat.itemIds.length > 0))),
          h("div", { class: "cat-meta" }, categoryMeta(cat, r)),
          h("div", { class: "cat-bar-track", "aria-hidden": "true" },
            h("div", { class: "cat-bar-fill", style: { width: `${(cat.amount.ils.typ / max) * 100}%`, background: catColor(cat) } }))),
        icon("next", "chev")));
  });
  const adj = r.adjustments.map((a) =>
    h("li", {},
      h("div", { class: "cat-row" },
        h("span", { class: "chip-icon", style: { background: "#F2F4F8", color: "#525B73" } }, icon(a.id === "buffer" ? "shield" : "wallet")),
        h("div", { class: "grow" },
          h("div", { class: "row-between" },
            h("span", { class: "cat-name" }, a.id === "buffer" ? `רזרבה לבלת״מים (${fmtNum(a.pct, 1)}%)` : `עמלות כרטיס אשראי (${fmtNum(a.pct, 1)}%)`),
            h("span", { class: "cat-amount num" }, approxIls(a.amount.ils.typ))),
          h("div", { class: "cat-meta" }, a.id === "buffer" ? "כרית ביטחון למחירים שיעלו" : "עמלת המרה של כרטיס ישראלי"),
          h("div", { class: "cat-bar-track", "aria-hidden": "true" },
            h("div", { class: "cat-bar-fill", style: { width: `${(a.amount.ils.typ / max) * 100}%`, background: "#8A93A6" } }))))));
  return [
    h("ul", { class: "cat-list" }, rows, adj),
    withTotal
      ? h("div", { class: "cat-total" }, h("strong", {}, "סה״כ"), h("span", { class: "v num" }, isFinalTotal(r) ? fmtIls(r.total.ils.typ) : approxIls(r.total.ils.typ)))
      : null,
  ];
}

function categories(ctx) {
  return h("section", { class: "card" },
    h("h2", {}, icon("wallet"), ctx.section.title || "לאן הולך הכסף"),
    h("p", { class: "card-sub" }, "לחצו על קטגוריה כדי לראות ממה היא מורכבת."),
    categoryList(ctx),
    can.edit() ? h("div", { class: "btn-row" }, h("a", { class: "btn", href: "#/edit/expense/new" }, icon("plus"), "הוספת הוצאה")) : null);
}

export function optionRows(ctx, groupId, { limit = Infinity, withChoose = false } = {}) {
  const { state, r } = ctx;
  const info = r.options[groupId];
  if (!info) return null;
  const opts = info.alternatives.slice(0, limit);
  return h("ul", { class: "opt-list" }, opts.map((alt) => {
    const o = state.options[alt.optionId];
    const d = alt.delta.ils.typ;
    return h("li", { class: `opt ${alt.chosen ? "opt-chosen" : ""}` },
      h("div", { class: "row-between" },
        h("span", { class: "opt-title" }, alt.chosen ? h("span", {}, icon("check", "icon-sm"), " ") : null, o.label),
        alt.chosen
          ? h("span", { class: "badge badge-booked" }, "מה שבחרנו")
          : h("span", { class: `opt-delta num ${d > 50 ? "up" : d < -50 ? "down" : ""}` }, deltaSentence(d))),
      o.details ? h("div", { class: "meta" }, o.details) : null,
      alt.warnings.map((w) => h("div", { class: "opt-warn" }, icon("alert"), h("span", {}, `לא מתאים למסלול כרגע: ${warningHe(w, state)}`))),
      withChoose && !alt.chosen && ctx.onChoose
        ? h("button", { type: "button", class: "btn btn-secondary", onclick: () => ctx.onChoose(groupId, alt.optionId) }, "לבחור באפשרות הזו")
        : null);
  }));
}

function options(ctx) {
  const groups = activeList(ctx.state.optionGroups);
  if (!groups.length) return null;
  return h("section", { class: "card" },
    h("h2", {}, icon("list"), ctx.section.title || "אפשרויות שאנחנו שוקלים"),
    h("p", { class: "card-sub" }, "הסכום הכולל מחושב לפי מה שבחרנו. כאן רואים כמה היה עולה אחרת."),
    groups.map((g) => h("div", { class: "stack" },
      h("h3", {}, g.label),
      optionRows(ctx, g.id),
      h("a", { class: "btn btn-ghost", href: `#/options/${encodeURIComponent(g.id)}` }, "לכל הפרטים", icon("next", "icon-sm")))));
}

function timeline(ctx) {
  return h("section", { class: "card" },
    h("h2", {}, icon("route"), ctx.section.title || "מסלול הטיול"),
    timelineList(ctx, { compact: true }),
    ctx.r.itinerary.warnings.map((w) => h("div", { class: "notice" }, icon("alert"), h("div", {}, warningHe(w, ctx.state)))),
    h("a", { class: "btn btn-ghost", href: "#/route" }, "המסלול המלא, מועדים ומשימות", icon("next", "icon-sm")));
}

function note(ctx) {
  if (!ctx.section.text) return null;
  return h("section", { class: "card" },
    ctx.section.title ? h("h2", {}, icon("info"), ctx.section.title) : null,
    h("p", { dir: "auto", style: { whiteSpace: "pre-wrap" } }, ctx.section.text));
}

function checklist(ctx) {
  const list = activeList(ctx.state.checklist);
  if (!list.length) return null;
  return h("section", { class: "card" },
    h("h2", {}, icon("list"), ctx.section.title || "רשימת משימות"),
    checklistItems(list));
}

function docsShortcut(ctx) {
  return h("section", { class: "card" },
    h("h2", {}, icon("file"), ctx.section.title || "כרטיסים ואישורי הזמנה"),
    h("p", { class: "card-sub" }, "כל הכרטיסים והאישורים במקום אחד (רק לעורכים)."),
    h("a", { class: "btn btn-secondary", href: "#/docs" }, icon("file"), "למסמכים"));
}

function askBox(ctx) {
  return h("section", { class: "card" },
    h("h2", {}, icon("chat"), ctx.section.title || "שאלו את הטיול"),
    h("p", { class: "card-sub" }, "אפשר לשאול כל שאלה על הטיול, במילים פשוטות או בהקלטה דרך המקלדת. למשל: ״כמה עולים המלונות בניו יורק?״"),
    h("a", { class: "btn", href: "#/ask" }, icon("chat"), "לשאול שאלה"));
}

const RENDERERS = { hero, whatsNew, certainty, categories, options, timeline, note, checklist, docsShortcut, askBox };

export function renderHome(ctx) {
  const sections = activeList(ctx.state.sections).filter((s) => RENDERERS[s.type]);
  const editing = can.edit() && ctx.editMode;
  const nodes = [];
  for (const section of sections) {
    if (!section.visible && !editing) continue;
    const node = RENDERERS[section.type]({ ...ctx, section });
    if (editing) nodes.push(sectionTools(ctx, section, node, sections));
    else if (node) nodes.push(node);
  }
  if (editing) nodes.push(sectionTools.addButton(ctx));
  nodes.push(footer(ctx));
  return nodes;
}

export { SECTION_HE };
