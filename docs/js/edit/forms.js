// Edit screens: #/edit/<kind>/<id|new>[/<parent>]. Each builds a draft, previews the effect live, and saves
// through commit() as one change (undoable). Nothing here is trip-specific: every list comes from the data.
import { h, icon } from "../ui/h.js";
import { activeList, computeTrip, peopleCount } from "../shared/engine.js";
import { COLORS, DEADLINE_HE, DEADLINE_KINDS, ICONS, SECTION_HE, SECTION_TYPES, STATUS_HE, STATUSES, STOP_KIND_HE, STOP_KINDS, newId } from "../shared/schema.js";
import { ID_PREFIX, applyOps } from "../shared/ops.js";
import { approxIls, explainHe, fmtIls, fmtUsd, nightsHe, warningHe } from "../shared/format.js";
import { backLink, emptyState, pageHead } from "../components/common.js";
import { choices, compact, dateInput, diffOp, errorBox, field, fieldset, numberInput, saveBar, select, textArea, textInput } from "./kit.js";
import { nextOrder, run } from "./tools.js";
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

function iconPicker(value, onChange) {
  return choices(ICONS.map((n) => ({ value: n, label: "", icon: n, ariaLabel: n })), value, onChange, { label: "אייקון" });
}

function colorPicker(value, onChange) {
  const wrap = h("div", { class: "choice-row", role: "group", "aria-label": "צבע" });
  const draw = () => wrap.replaceChildren(...Object.entries(COLORS).map(([key, hex]) =>
    h("button", { type: "button", class: "choice", "aria-pressed": value === key ? "true" : "false", "aria-label": key, style: { minWidth: "48px", background: hex, borderColor: value === key ? "#1F2641" : hex, outline: value === key ? "3px solid #1F2641" : "none" }, onclick: () => { value = key; draw(); onChange(key); } })));
  draw();
  return wrap;
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
      field("הערה (רואים כולם)", textArea(draft.note, (v) => { draft.note = v; }))),
    h("section", { class: "card" }, h("h2", {}, icon("external"), "מקורות"), sources),
    h("section", { class: "card" }, h("h2", {}, icon("clock"), "מועדים (ביטול חינם, תשלום אחרון…)"), deadlines),
    store.docs.priv
      ? h("section", { class: "card" },
        h("h2", {}, icon("lock"), "פרטים פרטיים (רק למשפחה)"),
        field("קוד הזמנה", textInput(privDraft.bookingRef, (v) => { privDraft.bookingRef = v; }, { dir: "ltr" })),
        field("מספר אישור", textInput(privDraft.confirmation, (v) => { privDraft.confirmation = v; }, { dir: "ltr" })),
        field("הערה פרטית", textArea(privDraft.privateNote, (v) => { privDraft.privateNote = v; })))
      : null,
    saveBar(onSave, {
      onCancel: back(original ? `#/cat/${encodeURIComponent(original.categoryId)}` : "#/"),
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

// ---------------------------------------------------------------- stop (city / leg of the route)

function stopForm(ctx, id) {
  const { state, r } = ctx;
  const isNew = id === "new";
  const original = isNew ? null : state.stops?.[id];
  if (!isNew && !original) return [backLink("#/route"), pageHead("לא מצאנו את העצירה")];
  const stopId = isNew ? newId(ID_PREFIX.stops) : id;
  const list = activeList(state.stops);
  const draft = clone(original) || { label: "", kind: "city", icon: "building", nights: 2 };
  let afterId = isNew ? list[0]?.id || "" : null;
  const errors = errorBox();
  const preview = h("div", { class: "item-explain" });
  const nightsField = field("כמה לילות", numberInput(draft.nights ?? null, (n) => { if (n === null) delete draft.nights; else draft.nights = Math.round(n); refresh(); }, { style: { maxWidth: "140px" } }));
  nightsField.style.display = draft.fill ? "none" : "block";

  const orderFor = () => {
    if (!isNew) return draft.order;
    const i = list.findIndex((s) => s.id === afterId);
    if (i < 0) return (list[0]?.order ?? 1) - 1;
    const a = list[i].order ?? i;
    const b = list[i + 1]?.order ?? a + 2;
    return (a + b) / 2;
  };
  const refresh = () => {
    let test = { ...state, stops: { ...state.stops, [stopId]: { ...compact(draft), order: orderFor() } } };
    try {
      test = applyOps({ pub: test, priv: {} }, extraOps()).docs.pub;
    } catch { /* preview only */ }
    const result = computeTrip(test, { skipOptions: true });
    const it = result.itinerary;
    const total = result.total;
    preview.replaceChildren(
      h("strong", {}, "המסלול אחרי השינוי: "),
      it.stops.filter((s) => s.nights > 0 || s.id === stopId).map((s) => `${s.label || "(העצירה החדשה)"} ${s.nights}`).join(" · "),
      h("br"),
      `סה״כ הטיול: ${approxIls(total.ils.typ)} (עכשיו: ${approxIls(r.total.ils.typ)})`,
      ...it.warnings.map((w) => h("div", { class: "opt-warn" }, icon("alert"), h("span", {}, warningHe(w, test)))));
  };

  // A new stop only counts in rows that list stops explicitly if we add it there — offer those rows,
  // pre-ticked when they already include the stop it comes after, plus an optional hotel row.
  const timedRows = activeList(state.items).filter((i) => i.rule?.time?.stopIds?.length);
  const includeIn = new Set();
  const rowPicker = h("div", {});
  const drawRows = () => {
    includeIn.clear();
    const idx = list.findIndex((s) => s.id === afterId);
    const neighbours = [afterId, list[idx + 1]?.id].filter(Boolean);
    // Rows for one specific stop (a hotel) never count a new stop; rows spanning stops (food, cars) do
    // when they include a neighbour.
    for (const i of timedRows) {
      const ids = i.rule.time.stopIds;
      if (ids.length > 1 && neighbours.some((n) => ids.includes(n))) includeIn.add(i.id);
    }
    rowPicker.replaceChildren(choices(timedRows.map((i) => ({ value: i.id, label: i.label })), [...includeIn], (v) => {
      includeIn.clear();
      v.forEach((x) => includeIn.add(x));
      refresh();
    }, { multi: true, label: "שורות שסופרות את העצירה" }));
  };
  let addHotel = isNew;
  let hotelField = null;
  const hotelPrice = { value: 200 };
  const lodging = activeList(state.categories).find((c) => c.icon === "hotel" || c.id === "lodging");
  const rooms = activeList(state.units).find((u) => u.icon === "bed" || u.id === "rooms");

  const extraOps = () => {
    if (!isNew) return [];
    const ops = [...includeIn].map((itemId) => {
      const item = state.items[itemId];
      const stopIds = [...item.rule.time.stopIds, stopId];
      return { t: "update", e: "items", id: itemId, set: { "rule.time.stopIds": stopIds }, before: { "rule.time.stopIds": item.rule.time.stopIds } };
    });
    if (addHotel && lodging && draft.label && !draft.fill && (draft.nights || 0) > 0) {
      ops.push({
        t: "create", e: "items", id: newId(ID_PREFIX.items),
        v: {
          categoryId: lodging.id, label: `מלון ב${draft.label}`, order: nextOrder(state.items),
          rule: { ...(rooms ? { unit: rooms.id } : {}), time: { by: "nights", stopIds: [stopId] } },
          price: { typical: hotelPrice.value || 0, currency: "USD" }, status: "estimate", tag: "E",
        },
      });
    }
    return ops;
  };

  const onSave = () => {
    const next = compact({ ...draft, order: orderFor() });
    if (next.fill) delete next.nights;
    const op = isNew ? { t: "create", e: "stops", id: stopId, v: next } : diffOp("stops", stopId, original, next, ["label", "kind", "icon", "nights", "fill", "anchorDate", "note"]);
    return save([op, ...extraOps()], errors, { doneText: isNew ? "העצירה נוספה למסלול" : "נשמר ✓", after: back("#/route") });
  };
  if (isNew) drawRows();
  refresh();
  return [
    backLink("#/route"),
    pageHead(isNew ? "עיר או עצירה חדשה" : "עריכת עצירה"),
    errors,
    h("section", { class: "card" },
      field("שם", textInput(draft.label, (v) => { draft.label = v; refresh(); }, { placeholder: "למשל: וושינגטון" })),
      isNew ? field("איפה במסלול", select([{ value: "", label: "בהתחלה" }, ...list.map((s) => ({ value: s.id, label: `אחרי ${s.label}` }))], afterId, (v) => { afterId = v; drawRows(); refresh(); })) : null,
      fieldset("סוג", choices(STOP_KINDS.map((k) => ({ value: k, label: STOP_KIND_HE[k] })), draft.kind, (v) => { draft.kind = v; })),
      fieldset("כמה זמן", choices([{ value: "fixed", label: "מספר לילות קבוע" }, { value: "fill", label: "משלים את הלילות שנשארו" }], draft.fill ? "fill" : "fixed", (v) => {
        if (v === "fill") draft.fill = true;
        else delete draft.fill;
        nightsField.style.display = v === "fill" ? "none" : "block";
        refresh();
      }), "עצירה ״משלימה״ מקבלת את כל הלילות שנשארו עד העצירה הבאה שיש לה תאריך קבוע."),
      nightsField,
      field("תאריך התחלה קבוע (לא חובה)", dateInput(draft.anchorDate, (v) => { if (v) draft.anchorDate = v; else delete draft.anchorDate; refresh(); }), "למשל יום היציאה של שייט. בלי תאריך — העצירה מתחילה כשהקודמת נגמרת."),
      fieldset("אייקון", iconPicker(draft.icon, (v) => { draft.icon = v; })),
      field("הערה", textArea(draft.note, (v) => { draft.note = v; }))),
    isNew
      ? h("section", { class: "card" },
        h("h2", {}, icon("wallet"), "מה העצירה עולה"),
        fieldset("לספור את הלילות שלה גם בשורות האלה", rowPicker, "מסומנות שורות כלליות (כמו אוכל ורכבים) שכבר סופרות את העצירות שלידה."),
        fieldset("להוסיף שורת מלון לעצירה?", choices([{ value: true, label: "כן" }, { value: false, label: "לא" }], addHotel, (v) => { addHotel = v; hotelField.style.display = v ? "block" : "none"; refresh(); })),
        (hotelField = field("מחיר לחדר ללילה ($)", numberInput(hotelPrice.value, (n) => { hotelPrice.value = n ?? 0; refresh(); }, { style: { maxWidth: "160px" } }), rooms ? `כפול ${rooms.count} ${rooms.label}` : "")),
        preview)
      : preview,
    saveBar(onSave, { onCancel: back("#/route") }),
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
      onRemove: isNew ? null : () => run([{ t: "archive", e: "optionGroups", id: gid }, ...opts.map((o) => ({ t: "archive", e: "options", id: o.id }))], { doneText: "השאלה הוסרה" }).then(back("#/")).catch(() => {}),
    }),
  ];
}

export function renderEdit(ctx, params) {
  const [kind, id = "new", parent] = params;
  switch (kind) {
    case "item": return id === "new" ? itemForm(ctx, "new", parent) : itemForm(ctx, id);
    case "category": return categoryForm(ctx, id);
    case "stop": return stopForm(ctx, id);
    case "section": return sectionForm(ctx, id);
    case "option": return optionForm(ctx, id, parent);
    case "group": return groupForm(ctx, id);
    default: return [backLink(), pageHead("מסך לא מוכר")];
  }
}
