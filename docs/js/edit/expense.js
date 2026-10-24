// Quick "הוספת הוצאה": what, which category (or a new one), how much, total or per person, status — on one
// screen, with a live line showing how "לאן הולך הכסף" and the total change. Saved as one undoable change,
// then back to the dashboard with the category highlighted. Nights / rooms / price ranges / sources live in
// the full row form (#/edit/item/new).
import { h, icon } from "../ui/h.js";
import { activeList, computeTrip, peopleCount } from "../shared/engine.js";
import { STATUS_HE, STATUSES, newId } from "../shared/schema.js";
import { ID_PREFIX, applyOps } from "../shared/ops.js";
import { approxIls, fmtIls, signedIls } from "../shared/format.js";
import { backLink, pageHead } from "../components/common.js";
import { choices, errorBox, field, fieldset, numberInput, saveBar, textInput } from "./kit.js";
import { markAdded, run } from "./tools.js";
import { expenseOps } from "./expenseOps.js";

const NEW_CAT = "__new";

export function expenseForm(ctx, catId) {
  const { state } = ctx;
  const cats = activeList(state.categories);
  const itemId = newId(ID_PREFIX.items);
  const newCategory = { id: newId(ID_PREFIX.categories), label: "" };
  const d = { label: "", categoryId: cats.some((c) => c.id === catId) ? catId : "", amount: null, currency: "USD", per: "total", status: "estimate" };
  const errors = errorBox();
  const preview = h("div", { class: "item-explain", "aria-live": "polite" });
  const input = () => ({ ...d, newCategory: d.categoryId === NEW_CAT ? newCategory : null });
  const catLabel = () => (d.categoryId === NEW_CAT ? newCategory.label.trim() : state.categories?.[d.categoryId]?.label) || "";

  const refresh = () => {
    const { ops, problems, categoryId } = expenseOps(state, input(), itemId);
    if (problems.length) {
      preview.replaceChildren("מלאו על מה, קטגוריה וסכום — ותראו כאן איך זה משנה את הסכום.");
      return;
    }
    try {
      const before = computeTrip(state, { skipOptions: true });
      const after = computeTrip(applyOps({ plan: state, priv: {} }, ops).docs.plan, { skipOptions: true });
      const row = after.items[itemId];
      const cat = after.categories.find((c) => c.id === categoryId);
      const delta = after.total.ils.typ - before.total.ils.typ;
      preview.replaceChildren(
        h("strong", {}, `${row.mode === "actual" ? fmtIls(row.amount.ils.typ) : approxIls(row.amount.ils.typ)} יתווספו ל״${catLabel()}״`),
        h("br"),
        `״${catLabel()}״ יהיה ${approxIls(cat.amount.ils.typ)} · כל הטיול: ${approxIls(after.total.ils.typ)} (${signedIls(delta)}, כולל רזרבה ועמלות)`);
    } catch {
      preview.replaceChildren("חסרים פרטים לחישוב.");
    }
  };

  const newCatInput = textInput("", (v) => { newCategory.label = v; refresh(); }, { placeholder: "למשל: ביטוח נסיעות", "aria-label": "שם הקטגוריה החדשה" });
  const newCatWrap = h("div", { style: { marginTop: "8px", display: d.categoryId === NEW_CAT ? "block" : "none" } }, newCatInput);
  const presets = activeList(state.presets);

  const onSave = async () => {
    const { ops, problems, categoryId } = expenseOps(state, input(), itemId);
    if (problems.length) return errors.show(problems);
    try {
      await run(ops, { doneText: `נוסף ל״${catLabel()}״` });
    } catch (err) {
      errors.show(err.errors?.length ? err.errors : [err.message]);
      return;
    }
    markAdded(categoryId);
    location.hash = "#/";
    setTimeout(() => document.querySelector(".cat-row-new")?.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
  };

  refresh();
  return [
    backLink(),
    pageHead("הוצאה חדשה"),
    errors,
    h("section", { class: "card" },
      field("על מה?", textInput("", (v) => { d.label = v; refresh(); }, { placeholder: "למשל: ESTA, כרטיסים לאמפייר סטייט", maxlength: 80 })),
      fieldset("לאיזו קטגוריה?", h("div", {},
        choices([...cats.map((c) => ({ value: c.id, label: c.label, icon: c.icon })), { value: NEW_CAT, label: "קטגוריה חדשה", icon: "plus" }], d.categoryId,
          (v) => { d.categoryId = v; newCatWrap.style.display = v === NEW_CAT ? "block" : "none"; if (v === NEW_CAT) newCatInput.focus(); refresh(); },
          { label: "קטגוריה" }),
        newCatWrap)),
      h("div", { class: "grid-2" },
        field("כמה?", numberInput(null, (n) => { d.amount = n; refresh(); }, { placeholder: "0" })),
        fieldset("מטבע", choices([{ value: "USD", label: "דולר $" }, { value: "ILS", label: "שקל ₪" }], d.currency, (v) => { d.currency = v; refresh(); }, { label: "מטבע" }))),
      fieldset("הסכום הוא", choices(
        [{ value: "total", label: "סה״כ לכולם" }, ...presets.map((p) => ({ value: p.id, label: `לאדם × ${peopleCount(state, p.id)} (${p.label})` }))],
        d.per, (v) => { d.per = v; refresh(); }, { label: "הסכום הוא" })),
      fieldset("מה המצב?", choices(STATUSES.map((s) => ({ value: s, label: STATUS_HE[s] })), d.status, (v) => { d.status = v; refresh(); }, { label: "מה המצב" }),
        "״שולם״ או ״הוזמן״ = הסכום סגור ונספר ב״כמה מזה כבר סגור״."),
      preview),
    saveBar(onSave, { saveLabel: "הוספה", onCancel: () => history.back() }),
    h("p", { class: "meta" }, icon("info", "icon-sm"), " צריך חישוב לפי לילות או חדרים, טווח מחירים או קישורים? ",
      h("a", { href: `#/edit/item/new/${encodeURIComponent(d.categoryId && d.categoryId !== NEW_CAT ? d.categoryId : cats[0]?.id || "")}` }, "לטופס המלא")),
  ];
}
