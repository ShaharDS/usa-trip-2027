// The change behind the quick "הוספת הוצאה" screen: one new cost row (and a new category when asked).
// Pure — no DOM, no Firebase — so tests/expense.test.mjs can check it against the real engine.
import { activeList, peopleCount } from "../shared/engine.js";
import { COLORS } from "../shared/schema.js";

const nextOrder = (map) => Math.max(0, ...activeList(map).map((x) => x.order ?? 0)) + 1;

/**
 * @param plan the trip plan
 * @param d {label, categoryId, newCategory: {id, label} | null, amount, currency, per: "total" | presetId, status}
 *          categoryId is ignored when newCategory is given.
 * @param itemId id for the new row
 * @returns {{ops: Array, problems: string[], categoryId: string|null}} problems = Hebrew, for the form
 */
export function expenseOps(plan, d, itemId) {
  const problems = [];
  const label = (d.label || "").trim();
  const newLabel = d.newCategory ? (d.newCategory.label || "").trim() : "";
  if (!label) problems.push("כתבו על מה ההוצאה.");
  if (d.newCategory ? !newLabel : !plan.categories?.[d.categoryId]) problems.push(d.newCategory ? "כתבו שם לקטגוריה החדשה." : "בחרו קטגוריה.");
  if (typeof d.amount !== "number" || !Number.isFinite(d.amount) || d.amount < 0) problems.push("כמה זה עולה? כתבו מספר.");
  if (problems.length) return { ops: [], problems, categoryId: null };

  const ops = [];
  let categoryId = d.categoryId;
  if (d.newCategory) {
    const used = new Set(activeList(plan.categories).map((c) => c.color));
    categoryId = d.newCategory.id;
    ops.push({
      t: "create", e: "categories", id: categoryId,
      v: { label: newLabel, icon: "star", color: Object.keys(COLORS).find((k) => !used.has(k)) || "slate", order: nextOrder(plan.categories) },
    });
  }
  const perPerson = d.per && d.per !== "total";
  const v = {
    categoryId,
    label,
    rule: perPerson ? { people: d.per } : {},
    price: { typical: d.amount, currency: d.currency || "USD" },
    status: d.status || "estimate",
    order: nextOrder(Object.fromEntries(Object.entries(plan.items || {}).filter(([, x]) => x.categoryId === categoryId))),
  };
  // Paid or booked: the amount is final (no range), so it counts as "closed" on the dashboard.
  if (v.status === "paid" || v.status === "booked") {
    v.actual = { amount: d.amount * (perPerson ? peopleCount(plan, d.per) : 1), currency: v.price.currency };
  }
  ops.push({ t: "create", e: "items", id: itemId, v });
  return { ops, problems, categoryId };
}
