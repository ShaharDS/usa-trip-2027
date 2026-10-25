// One category: its rows, each with the amount, status, how it is calculated, note and sources.
import { h, icon } from "../ui/h.js";
import { activeList } from "../shared/engine.js";
import { dateHe, explainTypicalHe, fmtIls, fmtUsd, rangeIls } from "../shared/format.js";
import { DEADLINE_HE, STATUS_HINT } from "../shared/schema.js";
import { backLink, catChip, catColor, emptyState, ilsText, pageHead, rangeLine, statusBadge } from "../components/common.js";
import { can } from "../store.js";
import { itemFiles } from "../edit/itemFiles.js";

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function itemCard(ctx, item, cat) {
  const { state, r } = ctx;
  const res = r.items[item.id];
  const final = res.mode === "actual";
  const editing = can.edit() && ctx.editMode;
  return h("article", { class: ["card item-card", res.included ? "" : "item-off"], style: { "--cat": catColor(cat) }, id: `item-${item.id}` },
    h("div", { class: "item-head" },
      h("div", { class: "grow" },
        h("h3", { class: "item-name" }, item.label),
        h("div", { class: "row wrap", style: { marginTop: "6px", gap: "8px" } }, statusBadge(item.status),
          h("span", { class: "meta" }, STATUS_HINT[item.status] || ""),
          res.mode === "table" ? h("span", { class: "meta" }, "· לפי האפשרות שנבחרה") : null)),
      h("div", { class: "item-amount num" },
        res.included ? ilsText(res.amount, final) : "לא נספר",
        h("span", { class: "item-usd" }, res.included ? (final ? fmtUsd(res.amount.usd.typ) : `בערך ${fmtUsd(res.amount.usd.typ)}`) : ""))),
    h("div", { class: "item-explain" }, h("span", { class: "meta" }, "איך חישבנו: "), explainTypicalHe(res, state)),
    res.included && !final && Math.round(res.amount.ils.low) !== Math.round(res.amount.ils.high)
      ? h("p", { class: "meta" }, `המחיר עוד לא סופי: יכול לצאת ${rangeIls(res.amount.ils.low, res.amount.ils.high)}.`)
      : null,
    item.note ? h("p", { class: "item-note", dir: "auto" }, item.note) : null,
    (item.deadlines || []).length
      ? h("ul", { class: "sources" }, item.deadlines.map((d) => h("li", {}, icon("clock", "icon-sm"), ` ${d.label || DEADLINE_HE[d.kind]}: ${dateHe(d.date, "long")}`)))
      : null,
    (item.sources || []).length
      ? h("ul", { class: "sources" }, item.sources.map((s) =>
        h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, icon("external", "icon-sm"), s.label || domainOf(s.url)))))
      : null,
    itemFiles(ctx, item),
    // Editors always get עריכה + צירוף מסמך + מחיקה; edit mode adds duplicate / move.
    editing ? ctx.editTools?.item(ctx, item) : can.edit() ? ctx.editTools?.itemBasic?.(ctx, item) : null);
}

export function renderCategory(ctx, catId) {
  const { state, r } = ctx;
  const cat = state.categories?.[catId];
  const catRes = r.categories.find((c) => c.id === catId);
  if (!cat || !catRes) return [backLink(), pageHead("לא מצאנו את הקטגוריה"), emptyState("ייתכן שהיא הוסרה.")];
  const items = activeList(state.items).filter((i) => i.categoryId === catId);
  const included = items.filter((i) => r.items[i.id].included);
  const excluded = items.filter((i) => !r.items[i.id].included);
  const final = included.length > 0 && included.every((i) => r.items[i.id].mode === "actual");
  const editing = can.edit() && ctx.editMode;
  return [
    backLink(),
    pageHead(cat.label, catChip(cat)),
    h("section", { class: "card" },
      h("div", { class: "row-between" },
        h("span", {}, "סה״כ בקטגוריה"),
        h("strong", { class: "num", style: { fontSize: "24px" } }, ilsText(catRes.amount, final))),
      h("p", { class: "meta", style: { margin: "4px 0 0" } }, final ? fmtUsd(catRes.amount.usd.typ) : `בערך ${fmtUsd(catRes.amount.usd.typ)} · ${rangeLine(catRes.amount)}`),
      cat.note ? h("p", { class: "item-note", dir: "auto", style: { marginTop: "8px" } }, cat.note) : null,
      editing ? ctx.editTools?.category(ctx, cat) : null),
    included.length ? included.map((i) => itemCard(ctx, i, cat)) : emptyState("אין עדיין שורות בקטגוריה הזו."),
    editing ? ctx.editTools?.addItem(ctx, catId) : null,
    excluded.length
      ? h("section", {},
        h("h2", { style: { fontSize: "20px", marginTop: "20px" } }, "לא נספרים כרגע"),
        h("p", { class: "meta" }, "שורות ששייכות לאפשרות שלא בחרנו."),
        excluded.map((i) => itemCard(ctx, i, cat)))
      : null,
  ];
}

/** "#/item/:id" jumps to the row inside its category. */
export function itemRedirect(ctx, itemId) {
  const item = ctx.state.items?.[itemId];
  return item ? `#/cat/${encodeURIComponent(item.categoryId)}` : "#/";
}

export { fmtIls };
