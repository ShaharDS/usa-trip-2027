// Adding to "לאן הולך הכסף" without leaving it. Categories open in place (an accordion), and the add box opens
// right under the category's rows, so what is already written stays in view. Two ways to fill it: by hand
// (what / how much / total or per person / status, with a live line of how the total changes) or with the AI
// (type or speak a sentence → a proposal to approve). Everything typed lives in `money` (outside the render), so
// a background update never erases it, and main.js doesn't re-render while a field in `.inline-form` is focused.
import { h, icon } from "../ui/h.js";
import { activeList, computeTrip, peopleCount } from "../shared/engine.js";
import { STATUS_HE, STATUSES, newId } from "../shared/schema.js";
import { ID_PREFIX, applyOps } from "../shared/ops.js";
import { approxIls, fmtIls, signedIls } from "../shared/format.js";
import { notice } from "../components/common.js";
import { proposalCard } from "../components/proposal.js";
import { micButton, micHint } from "../components/voice.js";
import { callFunction } from "../fb/api.js";
import { choices, colorPicker, errorBox, field, fieldset, iconPicker, numberInput, textInput } from "./kit.js";
import { markAdded, nextOrder, run } from "./tools.js";
import { expenseOps } from "./expenseOps.js";
import { store } from "../store.js";

const NEW_CAT = "__new";
const freshAi = () => ({ text: "", busy: false, proposal: null, error: "" });

export const money = {
  open: new Set(), // categories shown open
  addFor: null, // null = no add box; "" = the general box (pick a category); otherwise a category id
  newCat: null, // draft of the "קטגוריה חדשה" box, or null
  tab: "manual", // "manual" | "ai"
  d: null,
  itemId: null,
  newCategory: null,
  ai: freshAi(),
};

function freshDraft(catId) {
  money.d = { label: "", categoryId: catId || "", amount: null, currency: "USD", per: "total", status: "estimate" };
  money.itemId = newId(ID_PREFIX.items);
  money.newCategory = { id: newId(ID_PREFIX.categories), label: "" };
}

const scrollTo = (sel) => setTimeout(() => document.querySelector(sel)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);

/** Open the add box for a category ("" = any category). */
export function openAdd(catId = "") {
  if (money.addFor !== catId || !money.d) freshDraft(catId);
  money.addFor = catId;
  money.newCat = null;
  if (catId) money.open.add(catId);
  scrollTo("#add-panel");
}

export function closeAdd() {
  money.addFor = null;
  money.d = null;
  money.ai = freshAi();
}

export function toggleCategory(id) {
  if (money.open.has(id)) {
    money.open.delete(id);
    if (money.addFor === id) closeAdd();
  } else {
    money.open.add(id);
  }
}

// ---------------------------------------------------------------- by hand

function manualBox(ctx) {
  const { state } = ctx;
  const d = money.d;
  const general = money.addFor === "";
  const cats = activeList(state.categories);
  const errors = errorBox();
  const preview = h("div", { class: "item-explain", "aria-live": "polite" });
  const input = () => ({ ...d, newCategory: d.categoryId === NEW_CAT ? money.newCategory : null });
  const catLabel = () => (d.categoryId === NEW_CAT ? money.newCategory.label.trim() : state.categories?.[d.categoryId]?.label) || "";

  const refresh = () => {
    const { ops, problems, categoryId } = expenseOps(state, input(), money.itemId);
    if (problems.length) {
      preview.replaceChildren("מלאו על מה וכמה — ותראו כאן איך זה משנה את הסכום.");
      return;
    }
    try {
      const before = computeTrip(state, { skipOptions: true });
      const after = computeTrip(applyOps({ plan: state, priv: {} }, ops).docs.plan, { skipOptions: true });
      const row = after.items[money.itemId];
      const cat = after.categories.find((c) => c.id === categoryId);
      preview.replaceChildren(
        h("strong", {}, `${row.mode === "actual" ? fmtIls(row.amount.ils.typ) : approxIls(row.amount.ils.typ)} יתווספו ל״${catLabel()}״`),
        h("br"),
        `״${catLabel()}״ יהיה ${approxIls(cat.amount.ils.typ)} · כל הטיול: ${approxIls(after.total.ils.typ)} (${signedIls(after.total.ils.typ - before.total.ils.typ)}, כולל רזרבה ועמלות)`);
    } catch {
      preview.replaceChildren("חסרים פרטים לחישוב.");
    }
  };

  const newCatInput = textInput(money.newCategory.label, (v) => { money.newCategory.label = v; refresh(); }, { placeholder: "למשל: ביטוח נסיעות", "aria-label": "שם הקטגוריה החדשה" });
  const newCatWrap = h("div", { style: { marginTop: "8px", display: d.categoryId === NEW_CAT ? "block" : "none" } }, newCatInput);

  const onSave = async (btn) => {
    const { ops, problems, categoryId } = expenseOps(state, input(), money.itemId);
    if (problems.length) return errors.show(problems);
    btn.disabled = true;
    try {
      await run(ops, { doneText: `נוסף ל״${catLabel()}״` });
    } catch (err) {
      btn.disabled = false;
      errors.show(err.errors?.length ? err.errors : [err.message]);
      return;
    }
    markAdded(categoryId);
    money.open.add(categoryId);
    closeAdd();
    ctx.rerender();
    scrollTo(".cat-row-new");
  };

  refresh();
  const save = h("button", { type: "button", class: "btn", onclick: (e) => onSave(e.currentTarget) }, icon("check"), "הוספה");
  return h("div", {},
    errors,
    field("על מה?", textInput(d.label, (v) => { d.label = v; refresh(); }, { placeholder: "למשל: ESTA, כרטיסים לאמפייר סטייט", maxlength: 80 })),
    general
      ? fieldset("לאיזו קטגוריה?", h("div", {},
        choices([...cats.map((c) => ({ value: c.id, label: c.label, icon: c.icon })), { value: NEW_CAT, label: "קטגוריה חדשה", icon: "plus" }], d.categoryId,
          (v) => { d.categoryId = v; newCatWrap.style.display = v === NEW_CAT ? "block" : "none"; if (v === NEW_CAT) newCatInput.focus(); refresh(); },
          { label: "קטגוריה" }),
        newCatWrap))
      : null,
    h("div", { class: "grid-2" },
      field("כמה?", numberInput(d.amount, (n) => { d.amount = n; refresh(); }, { placeholder: "0" })),
      fieldset("מטבע", choices([{ value: "USD", label: "דולר $" }, { value: "ILS", label: "שקל ₪" }], d.currency, (v) => { d.currency = v; refresh(); }, { label: "מטבע" }))),
    fieldset("הסכום הוא", choices(
      [{ value: "total", label: "סה״כ לכולם" }, ...activeList(state.presets).map((p) => ({ value: p.id, label: `לאדם × ${peopleCount(state, p.id)} (${p.label})` }))],
      d.per, (v) => { d.per = v; refresh(); }, { label: "הסכום הוא" })),
    fieldset("מה המצב?", choices(STATUSES.map((s) => ({ value: s, label: STATUS_HE[s] })), d.status, (v) => { d.status = v; refresh(); }, { label: "מה המצב" }),
      "״שולם״ או ״הוזמן״ = הסכום סגור ונספר ב״כמה מזה כבר סגור״."),
    preview,
    h("div", { class: "btn-row" },
      save,
      h("button", { type: "button", class: "btn btn-secondary", onclick: () => { closeAdd(); ctx.rerender(); } }, "ביטול")),
    h("p", { class: "meta", style: { marginTop: "10px" } }, icon("info", "icon-sm"), " צריך חישוב לפי לילות או חדרים, טווח מחירים או קישורים? ",
      h("a", { href: `#/edit/item/new/${encodeURIComponent(d.categoryId && d.categoryId !== NEW_CAT ? d.categoryId : cats[0]?.id || "")}` }, "שורה עם חישוב")));
}

// ---------------------------------------------------------------- with the AI

async function sendAi(ctx, catId) {
  const ai = money.ai;
  const text = ai.text.trim();
  if (!text) {
    ai.error = "כתבו או אמרו קודם מה להוסיף.";
    return ctx.rerender();
  }
  ai.busy = true;
  ai.error = "";
  ai.proposal = null;
  ctx.rerender();
  try {
    ai.proposal = await callFunction("aiPropose", { mode: "expense", text, categoryId: catId || null });
  } catch (err) {
    ai.error = err.message || "משהו השתבש. נסו שוב.";
  } finally {
    ai.busy = false;
    ctx.rerender();
  }
}

function aiBox(ctx, catId) {
  const ai = money.ai;
  const cat = catId ? ctx.state.categories?.[catId] : null;
  const box = h("textarea", {
    class: "textarea", dir: "auto", rows: 3, disabled: ai.busy,
    "aria-label": "מה להוסיף",
    placeholder: cat ? `למשל: שילמנו 420 דולר על ${cat.label === "טיסות" ? "בחירת מושבים" : "זה"}, לכל המשפחה` : "למשל: ביטוח נסיעות 6 דולר לאדם ליום, לכולם",
    oninput: (e) => { ai.text = e.target.value; },
  });
  box.value = ai.text;
  if (store.demo) return notice("במצב הדגמה ה-AI לא מחובר. אחרי החיבור ל-Firebase זה יעבוד כאן.", "info", "info");
  return h("div", {},
    h("p", { class: "meta" }, "כתבו או אמרו במילים פשוטות מה להוסיף — כמה, על מה, לכמה אנשים, ואם כבר שולם. ה-AI מכין הצעה, ושום דבר לא נשמר עד שתאשרו."),
    box,
    micHint(),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", disabled: ai.busy, onclick: () => sendAi(ctx, catId) }, icon("sparkles"), ai.busy ? "מכין הצעה…" : "להכין הצעה"),
      micButton({ getText: () => ai.text, setText: (t) => { ai.text = t; box.value = t; }, disabled: ai.busy }),
      h("button", { type: "button", class: "btn btn-secondary", onclick: () => { closeAdd(); ctx.rerender(); } }, "ביטול")),
    ai.busy ? h("p", { class: "meta", role: "status" }, "חושב… זה לוקח כמה שניות.") : null,
    ai.error ? notice(ai.error, "danger") : null,
    ai.proposal ? proposalCard(ai.proposal, {
      onDone: (r) => {
        if (r && catId) markAdded(catId);
        closeAdd();
        ctx.rerender();
      },
    }) : null);
}

/** The add box (inline). */
export function addPanel(ctx) {
  const catId = money.addFor;
  if (catId === null) return null;
  if (!money.d) freshDraft(catId);
  const cat = catId ? ctx.state.categories?.[catId] : null;
  return h("div", { class: "inline-form", id: "add-panel" },
    h("h3", {}, icon("plus"), cat ? ` הוצאה חדשה ב״${cat.label}״` : " הוצאה חדשה"),
    h("div", { class: "choice-row", role: "group", "aria-label": "איך להוסיף", style: { marginBottom: "12px" } },
      [["manual", "edit", "למלא בעצמי"], ["ai", "sparkles", "עם AI — כתיבה או דיבור"]].map(([v, ic, label]) =>
        h("button", { type: "button", class: "choice", "aria-pressed": money.tab === v ? "true" : "false", onclick: () => { money.tab = v; ctx.rerender(); } }, icon(ic, "icon-sm"), label))),
    money.tab === "ai" ? aiBox(ctx, catId) : manualBox(ctx));
}

// ---------------------------------------------------------------- new category

export function openNewCategory() {
  closeAdd();
  money.newCat = { id: newId(ID_PREFIX.categories), label: "", icon: "star", color: "teal" };
  scrollTo("#newcat-panel");
}

export function newCategoryPanel(ctx) {
  const c = money.newCat;
  if (!c) return null;
  const errors = errorBox();
  const onSave = async (btn) => {
    if (!c.label.trim()) return errors.show(["כתבו שם לקטגוריה."]);
    btn.disabled = true;
    try {
      await run([{ t: "create", e: "categories", id: c.id, v: { label: c.label.trim(), icon: c.icon, color: c.color, order: nextOrder(ctx.state.categories) } }], { doneText: `הקטגוריה ״${c.label.trim()}״ נוספה` });
    } catch (err) {
      btn.disabled = false;
      return errors.show(err.errors?.length ? err.errors : [err.message]);
    }
    money.newCat = null;
    markAdded(c.id);
    openAdd(c.id); // straight on to its first expense
    ctx.rerender();
  };
  return h("div", { class: "inline-form", id: "newcat-panel" },
    h("h3", {}, icon("plus"), " קטגוריה חדשה"),
    errors,
    field("שם הקטגוריה", textInput(c.label, (v) => { c.label = v; }, { placeholder: "למשל: אטרקציות", maxlength: 40 })),
    fieldset("אייקון", iconPicker(c.icon, (v) => { c.icon = v; })),
    fieldset("צבע", colorPicker(c.color, (v) => { c.color = v; })),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", onclick: (e) => onSave(e.currentTarget) }, icon("check"), "הוספת הקטגוריה"),
      h("button", { type: "button", class: "btn btn-secondary", onclick: () => { money.newCat = null; ctx.rerender(); } }, "ביטול")),
    h("p", { class: "meta", style: { marginTop: "10px" } }, "רוצים שה-AI יפתח קטגוריה ויוסיף לה הוצאות? לחצו ״הוספת הוצאה״ ובחרו ״עם AI״."));
}

