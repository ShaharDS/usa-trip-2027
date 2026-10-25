// Edit screens: #/edit/<kind>/<id|new>[/<parent>]. Each builds a draft, previews the effect live, and saves
// through commit() as one change (undoable). Nothing here is trip-specific: every list comes from the data.
import { h, icon } from "../ui/h.js";
import { activeList, computeTrip, peopleCount } from "../shared/engine.js";
import { DEADLINE_HE, DEADLINE_KINDS, SECTION_HE, SECTION_TYPES, STATUS_HE, STATUSES, STOP_KIND_HE, STOP_KINDS, newId } from "../shared/schema.js";
import { ID_PREFIX, applyOps } from "../shared/ops.js";
import { approxIls, explainHe, fmtIls, fmtUsd, nightsHe, warningHe } from "../shared/format.js";
import { backLink, emptyState, pageHead } from "../components/common.js";
import { choices, colorPicker, compact, dateInput, diffOp, errorBox, field, fieldset, iconPicker, numberInput, saveBar, select, textArea, textInput } from "./kit.js";
import { nextOrder, run } from "./tools.js";
import { openAdd } from "./expensePanel.js";
import { openPart } from "./parts.js";
import { store } from "../store.js";

const clone = (x) => (x === undefined ? undefined : structuredClone(x));
const back = (hash) => () => { location.hash = hash; };

async function save(ops, errors, { doneText, after }) {
  const real = ops.filter(Boolean);
  if (!real.length) {
    after();
    return;
  }
  try {
    await run(real, { doneText });
    after();
  } catch (err) {
    errors.show(err.errors?.length ? err.errors : [err.message]);
  }
}

// ---------------------------------------------------------------- item (cost row)

function itemForm(ctx, id, catId) {
  const { state } = ctx;
  const isNew = id === "new";
  const original = isNew ? null : state.items?.[id];
  if (!isNew && !original) return [backLink(), pageHead("לא מצאנו את השורה")];
  const itemId = isNew ? newId(ID_PREFIX.items) : id;
  const draft = clone(original) || {
    categoryId: catId && state.categories?.[catId] ? catId : activeList(state.categories)[0]?.id,
    label: "", rule: {}, price: { typical: null, currency: "USD" }, status: "estimate",
    order: nextOrder(Object.fromEntries(Object.entries(state.items || {}).filter(([, v]) => v.categoryId === catId))),
  };
  draft.rule ||= {};
  draft.price ||= { typical: null, currency: "USD" };
  const privOriginal = store.docs.priv?.items?.[id] || null;
  const privDraft = clone(privOriginal) || {};
  const errors = errorBox();
  const preview = h("div", { class: "item-explain", "aria-live": "polite" });

  const refresh = () => {
    const test = { ...state, items: { ...state.items, [itemId]: compact(draft) } };
    let text;
    try {
      const r = computeTrip(test, { skipOptions: true });
      const res = r.items[itemId];
      text = res
        ? `${explainHe(res, test)} = ${res.mode === "actual" ? fmtIls(res.amount.ils.typ) : approxIls(res.amount.ils.typ)} (${fmtUsd(res.amount.usd.typ)})${res.included ? "" : " — לא נספר כרגע (האפשרות לא נבחרה)"}`
        : "";
    } catch {
      text = "חסרים פרטים לחישוב";
    }
    preview.replaceChildren(h("strong", {}, "החישוב: "), text);
  };

  // --- how the amount is calculated
  const presets = activeList(state.presets);
  const peopleValue = draft.rule.people === undefined ? "none" : typeof draft.rule.people === "number" ? "custom" : draft.rule.people;
  const customPeople = numberInput(typeof draft.rule.people === "number" ? draft.rule.people : null, (n) => { if (n !== null) draft.rule.people = n; refresh(); }, { "aria-label": "מספר אנשים", style: { maxWidth: "140px", marginTop: "8px", display: peopleValue === "custom" ? "block" : "none" } });
  const peopleChoices = choices(
    [{ value: "none", label: "לא לפי אנשים" }, ...presets.map((p) => ({ value: p.id, label: `${p.label} (${peopleCount(state, p.id)})` })), { value: "custom", label: "מספר אחר" }],
    peopleValue,
    (v) => {
      if (v === "none") delete draft.rule.people;
      else if (v === "custom") draft.rule.people = typeof draft.rule.people === "number" ? draft.rule.people : 1;
      else draft.rule.people = v;
      customPeople.style.display = v === "custom" ? "block" : "none";
      if (v === "custom") customPeople.value = String(draft.rule.people);
      refresh();
    },
    { label: "לפי כמה אנשים" });

  const units = activeList(state.units);
  const unitChoices = choices([{ value: "", label: "בלי" }, ...units.map((u) => ({ value: u.id, label: `${u.label} (${u.count})` }))], draft.rule.unit || "",
    (v) => { if (v) draft.rule.unit = v; else delete draft.rule.unit; refresh(); }, { label: "יחידות" });

  const stops = ctx.r.itinerary.stops;
  const stopPicker = choices(stops.map((s) => ({ value: s.id, label: `${s.label} (${nightsHe(s.nights)})` })), draft.rule.time?.stopIds || [],
    (v) => { if (draft.rule.time) { draft.rule.time.stopIds = v; refresh(); } }, { multi: true, label: "באילו עצירות" });
  const stopWrap = h("div", { style: { marginTop: "8px", display: draft.rule.time ? "block" : "none" } }, h("p", { class: "meta", style: { margin: "0 0 4px" } }, "באילו עצירות? (בלי בחירה = כל הטיול)"), stopPicker);
  const timeChoices = choices([{ value: "", label: "בלי" }, { value: "nights", label: "לפי לילות" }, { value: "days", label: "לפי ימים" }], draft.rule.time?.by || "",
    (v) => {
      if (v) draft.rule.time = { by: v, stopIds: draft.rule.time?.stopIds || [] };
      else delete draft.rule.time;
      stopWrap.style.display = v ? "block" : "none";
      refresh();
    }, { label: "לפי זמן" });

  const countInput = numberInput(draft.rule.count ?? null, (n) => { if (n === null) delete draft.rule.count; else draft.rule.count = n; refresh(); }, { style: { maxWidth: "140px" } });
  const countLabel = textInput(draft.rule.countLabel || "", (v) => { draft.rule.countLabel = v; refresh(); }, { placeholder: "למשל: כרטיסים" });

  // --- price
  let priceBlock;
  if (draft.price.table) {
    const t = draft.price.table;
    const rowsOpts = activeList(state.options).filter((o) => o.groupId === t.rowGroup);
    const colOpts = t.colGroup ? activeList(state.options).filter((o) => o.groupId === t.colGroup) : [{ id: "_", label: "מחיר" }];
    priceBlock = fieldset("מחירים לפי אפשרות", h("div", { style: { overflowX: "auto" } },
      h("table", { style: { borderCollapse: "collapse", fontSize: "15px" } },
        h("thead", {}, h("tr", {}, h("th", {}), colOpts.map((c) => h("th", { style: { padding: "4px" } }, c.label)))),
        h("tbody", {}, rowsOpts.map((ro) => h("tr", {},
          h("th", { style: { padding: "4px", textAlign: "start" } }, ro.label),
          colOpts.map((c) => h("td", { style: { padding: "4px" } },
            numberInput(t.cells?.[ro.id]?.[c.id] ?? null, (n) => {
              t.cells ||= {};
              t.cells[ro.id] ||= {};
              if (n === null) delete t.cells[ro.id][c.id];
              else t.cells[ro.id][c.id] = n;
              refresh();
            }, { "aria-label": `${ro.label} — ${c.label}`, style: { minWidth: "90px" } })))))))),
      `המחיר שנכנס לחישוב הוא לפי מה שנבחר בשאלות. מטבע: ${draft.price.currency === "ILS" ? "₪" : "$"}`);
  } else {
    const setP = (k) => (n) => { if (n === null) delete draft.price[k]; else draft.price[k] = n; refresh(); };
    priceBlock = fieldset("מחיר", h("div", {},
      h("div", { class: "grid-3" },
        field("נמוך", numberInput(draft.price.low ?? null, setP("low"))),
        field("רגיל", numberInput(draft.price.typical ?? null, setP("typical"))),
        field("גבוה", numberInput(draft.price.high ?? null, setP("high")))),
      choices([{ value: "USD", label: "דולר $" }, { value: "ILS", label: "שקל ₪" }], draft.price.currency, (v) => { draft.price.currency = v; refresh(); }, { label: "מטבע" })),
      "מחיר לכל יחידה בחישוב (לאדם / ללילה / ליום). כשאין חישוב — זה הסכום הכולל. אם יודעים מחיר אחד, מלאו רק \"רגיל\".");
  }

  // --- status / actual
  const actualWrap = h("div", { style: { display: draft.status === "booked" || draft.status === "paid" ? "block" : "none", marginTop: "8px" } },
    h("div", { class: "grid-2" },
      field("כמה זה עלה בפועל (סה״כ)", numberInput(draft.actual?.amount ?? null, (n) => {
        if (n === null) delete draft.actual;
        else draft.actual = { currency: draft.actual?.currency || draft.price.currency || "USD", ...(draft.actual || {}), amount: n };
        refresh();
      }), "לא חובה. אם ממלאים — הטווח נעלם והסכום הזה נכנס לחישוב."),
      field("מטבע", select([{ value: "USD", label: "דולר $" }, { value: "ILS", label: "שקל ₪" }], draft.actual?.currency || draft.price.currency || "USD", (v) => { if (draft.actual) draft.actual.currency = v; refresh(); }))));
  const statusChoices = choices(STATUSES.map((s) => ({ value: s, label: STATUS_HE[s] })), draft.status, (v) => {
    draft.status = v;
    actualWrap.style.display = v === "booked" || v === "paid" ? "block" : "none";
    refresh();
  }, { label: "סטטוס" });

  // --- option link
  const optionList = [{ value: "", label: "תמיד נספר" }, ...activeList(state.options).map((o) => ({ value: o.id, label: `רק אם בוחרים: ${o.label}` }))];

  // --- sources & deadlines (small lists)
  const listEditor = (key, make, render, addLabel) => {
    const box = h("div", {});
    const draw = () => box.replaceChildren(
      ...(draft[key] || []).map((entry, i) => h("div", { class: "card", style: { padding: "12px", boxShadow: "none", border: "1px solid #DCE1E9" } },
        render(entry, refresh),
        h("button", { type: "button", class: "btn btn-ghost", onclick: () => { draft[key].splice(i, 1); draw(); refresh(); } }, icon("trash", "icon-sm"), "מחיקה"))),
      h("button", { type: "button", class: "btn btn-secondary", onclick: () => { (draft[key] ||= []).push(make()); draw(); } }, icon("plus"), addLabel));
    draw();
    return box;
  };
  const sources = listEditor("sources", () => ({ url: "", label: "" }), (s) => h("div", {},
    field("קישור", textInput(s.url, (v) => { s.url = v.trim(); }, { dir: "ltr", placeholder: "https://", inputmode: "url" })),
    field("שם הקישור", textInput(s.label, (v) => { s.label = v; }))), "הוספת קישור");
  const deadlines = listEditor("deadlines", () => ({ kind: "freeCancel", date: "", label: "" }), (d) => h("div", {},
    field("סוג", select(DEADLINE_KINDS.map((k) => ({ value: k, label: DEADLINE_HE[k] })), d.kind, (v) => { d.kind = v; })),
    field("תאריך", dateInput(d.date, (v) => { d.date = v; })),
    field("תיאור (לא חובה)", textInput(d.label, (v) => { d.label = v; }))), "הוספת מועד");

  const onSave = () => {
    const next = compact(draft);
    if (next.sources) next.sources = next.sources.filter((s) => s.url);
    if (next.deadlines) next.deadlines = next.deadlines.filter((d) => d.date).map((d) => compact(d));
    if (next.status !== "booked" && next.status !== "paid") delete next.actual;
    if (!next.rule) next.rule = {};
    const ops = [];
    if (isNew) ops.push({ t: "create", e: "items", id: itemId, v: next });
    else ops.push(diffOp("items", itemId, original, next, ["label", "categoryId", "note", "rule", "price", "actual", "status", "optionId", "sources", "deadlines"]));
    const priv = compact(privDraft);
    if (store.docs.priv) {
      if (!privOriginal && Object.keys(priv).length) ops.push({ t: "create", e: "privateItems", id: itemId, v: priv });
      else if (privOriginal) ops.push(diffOp("privateItems", itemId, privOriginal, priv, ["bookingRef", "confirmation", "privateNote"]));
    }
    return save(ops, errors, { doneText: isNew ? "השורה נוספה" : "נשמר ✓", after: back(`#/cat/${encodeURIComponent(next.categoryId)}`) });
  };

  refresh();
  return [
    backLink(original ? `#/cat/${encodeURIComponent(original.categoryId)}` : "#/"),
    pageHead(isNew ? "שורה חדשה" : "עריכת שורה"),
    errors,
    h("section", { class: "card" },
      field("שם השורה", textInput(draft.label, (v) => { draft.label = v; refresh(); }, { placeholder: "למשל: מלון בוושינגטון" })),
      field("קטגוריה", select(activeList(state.categories).map((c) => ({ value: c.id, label: c.label })), draft.categoryId, (v) => { draft.categoryId = v; refresh(); }))),
    h("section", { class: "card" },
      h("h2", {}, icon("sparkles"), "איך מחשבים"),
      fieldset("לפי כמה אנשים?", h("div", {}, peopleChoices, customPeople)),
      fieldset("כפול יחידות?", unitChoices),
      fieldset("לפי זמן?", h("div", {}, timeChoices, stopWrap)),
      h("div", { class: "grid-2" }, field("כפול מספר נוסף (לא חובה)", countInput), field("מה הוא סופר", countLabel)),
      priceBlock,
      preview),
    h("section", { class: "card" },
      fieldset("סטטוס", h("div", {}, statusChoices, actualWrap)),
      field("מתי השורה נספרת", select(optionList, draft.optionId || "", (v) => { if (v) draft.optionId = v; else delete draft.optionId; refresh(); })),
      field("הערה (רואים העורכים)", textArea(draft.note, (v) => { draft.note = v; }))),
    h("section", { class: "card" }, h("h2", {}, icon("external"), "מקורות"), sources),
    h("section", { class: "card" }, h("h2", {}, icon("clock"), "מועדים (ביטול חינם, תשלום אחרון…)"), deadlines),
    store.docs.priv
      ? h("section", { class: "card" },
        h("h2", {}, icon("lock"), "פרטים פרטיים (רק לעורכים)"),
        field("קוד הזמנה", textInput(privDraft.bookingRef, (v) => { privDraft.bookingRef = v; }, { dir: "ltr" })),
        field("מספר אישור", textInput(privDraft.confirmation, (v) => { privDraft.confirmation = v; }, { dir: "ltr" })),
        field("הערה פרטית", textArea(privDraft.privateNote, (v) => { privDraft.privateNote = v; })))
      : null,
    saveBar(onSave, {
      onCancel: back(original ? `#/cat/${encodeURIComponent(original.categoryId)}` : "#/"),
      removeName: original?.label,
      onRemove: isNew ? null : () => run([{ t: "archive", e: "items", id: itemId }], { doneText: `"${original.label}" הוסר` }).then(back(`#/cat/${encodeURIComponent(original.categoryId)}`)).catch(() => {}),
    }),
  ];
}

// ---------------------------------------------------------------- category

function categoryForm(ctx, id) {
  const { state } = ctx;
  const isNew = id === "new";
  const original = isNew ? null : state.categories?.[id];
  if (!isNew && !original) return [backLink(), pageHead("לא מצאנו את הקטגוריה")];
  const catId = isNew ? newId(ID_PREFIX.categories) : id;
  const draft = clone(original) || { label: "", icon: "star", color: "teal", order: nextOrder(state.categories) };
  const errors = errorBox();
  const onSave = () => {
    const next = compact(draft);
    const op = isNew ? { t: "create", e: "categories", id: catId, v: next } : diffOp("categories", catId, original, next, ["label", "icon", "color", "note"]);
    return save([op], errors, { doneText: isNew ? "הקטגוריה נוספה" : "נשמר ✓", after: back(`#/cat/${encodeURIComponent(catId)}`) });
  };
  return [
    backLink(isNew ? "#/" : `#/cat/${encodeURIComponent(catId)}`),
    pageHead(isNew ? "קטגוריה חדשה" : "עריכת קטגוריה"),
    errors,
    h("section", { class: "card" },
      field("שם הקטגוריה", textInput(draft.label, (v) => { draft.label = v; }, { placeholder: "למשל: אטרקציות" })),
      fieldset("אייקון", iconPicker(draft.icon, (v) => { draft.icon = v; })),
      fieldset("צבע", colorPicker(draft.color, (v) => { draft.color = v; })),
      field("הערה (לא חובה)", textArea(draft.note, (v) => { draft.note = v; }))),
    saveBar(onSave, { onCancel: back(isNew ? "#/" : `#/cat/${encodeURIComponent(catId)}`) }),
  ];
}

// ---------------------------------------------------------------- home section

function sectionForm(ctx, id) {
  const { state } = ctx;
  const isNew = id === "new";
  const original = isNew ? null : state.sections?.[id];
  if (!isNew && !original) return [backLink(), pageHead("לא מצאנו את החלק")];
  const secId = isNew ? newId(ID_PREFIX.sections) : id;
  const draft = clone(original) || { type: "note", title: "", visible: true, text: "", order: nextOrder(state.sections) };
  const errors = errorBox();
  const textWrap = field("טקסט", textArea(draft.text, (v) => { draft.text = v; }), "רק לחלק מסוג ״הודעה״");
  textWrap.style.display = draft.type === "note" ? "block" : "none";
  const onSave = () => {
    const next = compact(draft);
    next.visible = !!draft.visible;
    const op = isNew ? { t: "create", e: "sections", id: secId, v: next } : diffOp("sections", secId, original, next, ["type", "title", "visible", "text"]);
    return save([op], errors, { doneText: "עמוד הבית עודכן", after: back("#/") });
  };
  return [
    backLink(),
    pageHead(isNew ? "חלק חדש בעמוד הבית" : "עריכת חלק בעמוד הבית"),
    errors,
    h("section", { class: "card" },
      isNew
        ? fieldset("מה יהיה בחלק", choices(SECTION_TYPES.map((t) => ({ value: t, label: SECTION_HE[t] })), draft.type, (v) => { draft.type = v; textWrap.style.display = v === "note" ? "block" : "none"; }))
        : h("p", {}, h("strong", {}, "סוג: "), SECTION_HE[draft.type] || draft.type),
      field("כותרת (לא חובה)", textInput(draft.title, (v) => { draft.title = v; }), "בלי כותרת — מוצגת כותרת ברירת המחדל"),
      textWrap,
      fieldset("מוצג בעמוד", choices([{ value: true, label: "כן" }, { value: false, label: "מוסתר" }], !!draft.visible, (v) => { draft.visible = v; }))),
    saveBar(onSave, {
      onCancel: back("#/"),
      removeName: original?.title || SECTION_HE[original?.type] || "",
      onRemove: isNew ? null : () => run([{ t: "archive", e: "sections", id: secId }], { doneText: "החלק הוסר" }).then(back("#/")).catch(() => {}),
    }),
  ];
}

// ---------------------------------------------------------------- option & option question

function optionForm(ctx, id, groupIdForNew) {
  const { state } = ctx;
  const isNew = id === "new";
  const original = isNew ? null : state.options?.[id];
  const groupId = original?.groupId || groupIdForNew;
  if ((!isNew && !original) || !state.optionGroups?.[groupId]) return [backLink(), pageHead("לא מצאנו את האפשרות")];
  const optId = isNew ? newId(ID_PREFIX.options) : id;
  const draft = clone(original) || { groupId, label: "", details: "", order: nextOrder(Object.fromEntries(Object.entries(state.options || {}).filter(([, o]) => o.groupId === groupId))) };
  const patchStop = Object.keys(draft.stopPatch || {})[0] || "";
  let pStop = patchStop;
  const patch = clone(draft.stopPatch?.[patchStop]) || {};
  const errors = errorBox();
  const onSave = () => {
    const next = compact({ ...draft });
    delete next.stopPatch;
    if (pStop && (patch.anchorDate || patch.nights !== undefined)) next.stopPatch = { [pStop]: compact(patch) };
    const op = isNew ? { t: "create", e: "options", id: optId, v: next } : diffOp("options", optId, original, next, ["label", "details", "stopPatch"]);
    return save([op], errors, { doneText: "נשמר ✓", after: back(`#/options/${encodeURIComponent(groupId)}`) });
  };
  return [
    backLink(`#/options/${encodeURIComponent(groupId)}`),
    pageHead(isNew ? "אפשרות חדשה" : "עריכת אפשרות"),
    errors,
    h("section", { class: "card" },
      h("p", { class: "meta" }, `שאלה: ${state.optionGroups[groupId].label}`),
      field("שם האפשרות", textInput(draft.label, (v) => { draft.label = v; })),
      field("פרטים (לא חובה)", textArea(draft.details, (v) => { draft.details = v; }))),
    h("section", { class: "card" },
      h("h2", {}, icon("route"), "האם האפשרות משנה את המסלול?"),
      field("איזו עצירה", select([{ value: "", label: "לא משנה את המסלול" }, ...activeList(state.stops).map((s) => ({ value: s.id, label: s.label }))], pStop, (v) => { pStop = v; })),
      h("div", { class: "grid-2" },
        field("תאריך התחלה", dateInput(patch.anchorDate, (v) => { if (v) patch.anchorDate = v; else delete patch.anchorDate; })),
        field("לילות", numberInput(patch.nights ?? null, (n) => { if (n === null) delete patch.nights; else patch.nights = Math.round(n); }))),
      h("p", { class: "meta" }, "את המחיר של האפשרות מעדכנים בשורת המחיר שלה (למשל בטבלת המחירים של השייט).")),
    saveBar(onSave, {
      onCancel: back(`#/options/${encodeURIComponent(groupId)}`),
      removeName: original?.label,
      onRemove: isNew ? null : () => run([{ t: "archive", e: "options", id: optId }], { doneText: "האפשרות הוסרה" }).then(back(`#/options/${encodeURIComponent(groupId)}`)).catch(() => {}),
    }),
  ];
}

function groupForm(ctx, id) {
  const { state } = ctx;
  const isNew = id === "new";
  const original = isNew ? null : state.optionGroups?.[id];
  if (!isNew && !original) return [backLink(), pageHead("לא מצאנו את השאלה")];
  const gid = isNew ? newId(ID_PREFIX.optionGroups) : id;
  const draft = clone(original) || { label: "", question: "", order: nextOrder(state.optionGroups) };
  const opts = activeList(state.options).filter((o) => o.groupId === gid);
  const errors = errorBox();
  const onSave = () => {
    const next = compact(draft);
    const op = isNew ? { t: "create", e: "optionGroups", id: gid, v: next } : diffOp("optionGroups", gid, original, next, ["label", "question", "chosen"]);
    return save([op], errors, { doneText: "נשמר ✓", after: back(`#/options/${encodeURIComponent(gid)}`) });
  };
  return [
    backLink(isNew ? "#/" : `#/options/${encodeURIComponent(gid)}`),
    pageHead(isNew ? "שאלה חדשה עם אפשרויות" : "עריכת שאלה"),
    errors,
    h("section", { class: "card" },
      field("השאלה (קצר)", textInput(draft.label, (v) => { draft.label = v; }), "למשל: באיזו הפלגה?"),
      field("הסבר (לא חובה)", textArea(draft.question, (v) => { draft.question = v; })),
      opts.length ? field("מה בחרנו", select(opts.map((o) => ({ value: o.id, label: o.label })), draft.chosen || opts[0].id, (v) => { draft.chosen = v; })) : emptyState("אחרי השמירה מוסיפים אפשרויות.")),
    saveBar(onSave, {
      onCancel: back(isNew ? "#/" : `#/options/${encodeURIComponent(gid)}`),
      removeName: original?.label,
      onRemove: isNew ? null : () => run([{ t: "archive", e: "optionGroups", id: gid }, ...opts.map((o) => ({ t: "archive", e: "options", id: o.id }))], { doneText: "השאלה הוסרה" }).then(back("#/")).catch(() => {}),
    }),
  ];
}

export function renderEdit(ctx, params) {
  const [kind, id = "new", parent] = params;
  switch (kind) {
    case "expense": // #/edit/expense/new[/<categoryId>]: the add box now opens inline on the dashboard
      openAdd(parent && ctx.state.categories?.[parent] ? parent : "");
      location.replace("#/");
      return [];
    case "item": return id === "new" ? itemForm(ctx, "new", parent) : itemForm(ctx, id);
    case "category": return categoryForm(ctx, id);
    case "stop": // #/edit/stop/<id|new>: parts are edited on the route now, with their dates on a calendar
      openPart(id === "new" ? "new" : id);
      location.replace("#/route");
      return [];
    case "section": return sectionForm(ctx, id);
    case "option": return optionForm(ctx, id, parent);
    case "group": return groupForm(ctx, id);
    default: return [backLink(), pageHead("מסך לא מוכר")];
  }
}
