// Edit buttons that appear next to content in edit mode (rows, categories, option questions).
import { h, icon, toast } from "../ui/h.js";
import { commit, undo } from "../data/commit.js";
import { activeList } from "../shared/engine.js";
import { newId } from "../shared/schema.js";
import { ID_PREFIX } from "../shared/ops.js";
import { askFirst } from "../components/common.js";

/** Commit with a toast that offers undo. */
export async function run(ops, opts = {}) {
  try {
    const res = await commit(ops, opts);
    toast(opts.doneText || "נשמר ✓", res?.changeId ? { label: "ביטול", run: () => undoChange(res.changeId) } : null);
    return res;
  } catch (err) {
    toast(err.message || "לא נשמר");
    throw err;
  }
}

export async function undoChange(id) {
  try {
    await undo(id);
    toast("השינוי בוטל");
  } catch (err) {
    toast(err.message);
  }
}

/** Swap `order` with the neighbour (renumbers the list when orders collide). */
export function moveOps(entity, list, id, dir) {
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return [];
  const orders = list.map((x, k) => x.order ?? k);
  const unique = new Set(orders).size === orders.length;
  const target = unique ? orders : list.map((_, k) => k + 1);
  const next = [...target];
  [next[i], next[j]] = [next[j], next[i]];
  return list
    .map((x, k) => ({ x, k }))
    .filter(({ x, k }) => (x.order ?? null) !== next[k])
    .map(({ x, k }) => ({ t: "update", e: entity, id: x.id, set: { order: next[k] }, before: { order: x.order ?? null } }));
}

export function duplicateOp(entity, rec, overrides = {}) {
  const { id: _id, v: _v, archived: _a, ...rest } = rec;
  return { t: "create", e: entity, id: newId(ID_PREFIX[entity] || "id"), v: { ...structuredClone(rest), ...overrides } };
}

export const nextOrder = (map) => Math.max(0, ...activeList(map).map((x) => x.order ?? 0)) + 1;

/** The category that just received an expense — the dashboard highlights it for a few seconds. */
export const lastAdded = { catId: null, at: 0 };
export function markAdded(catId) {
  lastAdded.catId = catId;
  lastAdded.at = Date.now();
}
export const justAdded = (catId) => lastAdded.catId === catId && Date.now() - lastAdded.at < 8000;

function smallBtn(label, iconName, onclick, attrs = {}) {
  return h("button", { type: "button", class: "edit-btn", onclick, ...attrs }, icon(iconName, "icon-sm"), label);
}
function smallLink(label, iconName, href) {
  return h("a", { class: "edit-btn", href }, icon(iconName, "icon-sm"), label);
}

/** Tick / untick a checklist row (one undoable change; the list updates at once). */
export function toggleTodo(t) {
  const done = !t.done;
  return run([{ t: "update", e: "checklist", id: t.id, set: { done }, before: { done: t.done ?? null } }],
    { doneText: done ? `סומן כבוצע: ״${t.label}״` : `הסימון בוטל: ״${t.label}״` }).catch(() => {});
}

/** Remove a category and its rows, after asking. Resolves true when removed. */
export async function removeCategory(ctx, cat) {
  const rows = activeList(ctx.state.items).filter((x) => x.categoryId === cat.id);
  const extra = rows.length ? (rows.length === 1 ? "גם השורה שבה תימחק." : `גם ${rows.length} השורות שבה יימחקו.`) : "";
  let done = false;
  await askFirst(cat.label, async () => {
    await run([{ t: "archive", e: "categories", id: cat.id }, ...rows.map((x) => ({ t: "archive", e: "items", id: x.id }))], { doneText: `הקטגוריה "${cat.label}" נמחקה` });
    done = true;
  }, extra)().catch(() => {});
  return done;
}

const removeItemBtn = (item) =>
  smallBtn("מחיקה", "trash", askFirst(item.label, () => run([{ t: "archive", e: "items", id: item.id }], { doneText: `"${item.label}" נמחק` }).catch(() => {})));

export const editTools = {
  item(ctx, item) {
    const siblings = activeList(ctx.state.items).filter((x) => x.categoryId === item.categoryId);
    return h("div", { class: "btn-row" },
      smallLink("עריכה", "edit", `#/edit/item/${encodeURIComponent(item.id)}`),
      smallBtn("שכפול", "copy", () => run([duplicateOp("items", item, { label: `${item.label} (עותק)`, order: (item.order ?? 0) + 0.5 })], { doneText: "השורה שוכפלה" })),
      smallBtn("למעלה", "up", () => run(moveOps("items", siblings, item.id, -1)), { disabled: siblings[0]?.id === item.id }),
      smallBtn("למטה", "down", () => run(moveOps("items", siblings, item.id, 1)), { disabled: siblings.at(-1)?.id === item.id }),
      removeItemBtn(item));
  },

  /** Outside edit mode: just עריכה and מחיקה. */
  itemBasic(ctx, item) {
    return h("div", { class: "btn-row" }, smallLink("עריכה", "edit", `#/edit/item/${encodeURIComponent(item.id)}`), removeItemBtn(item));
  },

  category(ctx, cat) {
    const cats = activeList(ctx.state.categories);
    return h("div", { class: "btn-row" },
      smallLink("עריכת הקטגוריה", "edit", `#/edit/category/${encodeURIComponent(cat.id)}`),
      smallBtn("למעלה", "up", () => run(moveOps("categories", cats, cat.id, -1)), { disabled: cats[0]?.id === cat.id }),
      smallBtn("למטה", "down", () => run(moveOps("categories", cats, cat.id, 1)), { disabled: cats.at(-1)?.id === cat.id }),
      smallBtn("מחיקת הקטגוריה", "trash", () => removeCategory(ctx, cat).then((done) => { if (done) location.hash = "#/"; })));
  },

  /** Outside edit mode: edit / delete the category. */
  categoryBasic(ctx, cat) {
    return h("div", { class: "btn-row" },
      smallLink("עריכת הקטגוריה", "edit", `#/edit/category/${encodeURIComponent(cat.id)}`),
      smallBtn("מחיקת הקטגוריה", "trash", () => removeCategory(ctx, cat)));
  },

  addItem(ctx, catId) {
    return h("div", { class: "btn-row" },
      h("a", { class: "btn", href: `#/edit/expense/new/${encodeURIComponent(catId)}` }, icon("plus"), "הוספת הוצאה"),
      h("a", { class: "btn btn-secondary", href: `#/edit/item/new/${encodeURIComponent(catId)}` }, icon("plus"), "שורה עם חישוב (לילות, חדרים)"),
      h("a", { class: "btn btn-secondary", href: "#/edit/category/new" }, icon("plus"), "קטגוריה חדשה"));
  },

  optionGroup(ctx, g) {
    const opts = activeList(ctx.state.options).filter((o) => o.groupId === g.id);
    return h("div", { class: "stack", style: { marginTop: "12px" } },
      h("div", { class: "btn-row" },
        smallLink("עריכת השאלה", "edit", `#/edit/group/${encodeURIComponent(g.id)}`),
        smallLink("אפשרות חדשה", "plus", `#/edit/option/new/${encodeURIComponent(g.id)}`)),
      h("p", { class: "meta" }, "עריכת אפשרות:"),
      h("div", { class: "btn-row" }, opts.map((o) => smallLink(o.label, "edit", `#/edit/option/${encodeURIComponent(o.id)}`))));
  },
};
