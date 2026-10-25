// Tickets and booking confirmations (editors only — they carry prices). Editors upload a PDF / screenshot; the AI reads it and
// proposes updates (row booked, real price, deadlines, booking code) for approval. Files go to and come back from the
// addDocument / getDocumentFile functions — the browser never talks to Storage itself.
import { h, icon, toast } from "../ui/h.js";
import { askFirst, backLink, emptyState, notice, pageHead } from "../components/common.js";
import { openFile } from "../components/fileViewer.js";
import { select } from "../edit/kit.js";
import { run } from "../edit/tools.js";
import { activeList } from "../shared/engine.js";
import { docLinks, linkItemOps, linkPlaceOps } from "../shared/docLinks.js";
import { fileOf, refreshDocs } from "../data/docsIndex.js";
import { proposalCard } from "../components/proposal.js";
import { signInCard } from "./signin.js";
import { dateHe, fmtNum } from "../shared/format.js";
import { callFunction } from "../fb/api.js";
import { listDocuments } from "../data/live.js";
import { blobToBase64, prepareUpload } from "../ui/resize.js";
import { can, store } from "../store.js";

const KIND = { flight: ["plane", "טיסה"], hotel: ["hotel", "לינה"], car: ["car", "רכב"], cruise: ["ship", "שייט"], parks: ["ferris", "פארקים"], insurance: ["shield", "ביטוח"], other: ["file", "מסמך"] };
const state = { list: null, loading: false, busy: false, step: "", proposal: null, error: "", reason: "", title: "", file: null, fileName: "", extract: true, reading: null, linkFor: null };

/** Read a saved file with the AI again (e.g. the first try failed). */
async function readAgain(d, rerender) {
  state.reading = d.id;
  state.error = "";
  state.reason = "";
  state.proposal = null;
  rerender();
  try {
    state.proposal = await callFunction("readDocument", { docId: d.id });
    state.list = null;
  } catch (err) {
    state.error = err.message || "הקריאה לא הצליחה.";
    state.reason = err.details?.reason || "";
    if (err.details?.facts) state.list = null;
  } finally {
    state.reading = null;
    rerender();
  }
}

function load(rerender) {
  if (state.loading) return;
  state.loading = true;
  listDocuments()
    .then((list) => { state.list = list; })
    .catch(() => { state.error = "לא הצלחנו לטעון את רשימת המסמכים."; state.list = []; })
    .finally(() => { state.loading = false; rerender(); });
}

function sizeText(bytes) {
  return bytes > 1e6 ? `${fmtNum(bytes / 1e6, 1)} MB` : `${fmtNum(Math.max(1, Math.round(bytes / 1e3)))} KB`;
}

function uploadCard(rerender) {
  const chosen = h("p", { class: "meta", dir: "auto", "aria-live": "polite" }, state.fileName ? `נבחר: ${state.fileName}` : "");
  const fileInput = h("input", {
    type: "file", class: "input", accept: "application/pdf,image/*", id: "doc-file", disabled: state.busy,
    onchange: (e) => { state.file = e.target.files?.[0] || null; state.fileName = state.file?.name || ""; chosen.replaceChildren(state.fileName ? `נבחר: ${state.fileName}` : ""); },
  });
  const title = h("input", { class: "input", type: "text", dir: "auto", placeholder: "למשל: כרטיסי טיסה הלוך", value: state.title, oninput: (e) => { state.title = e.target.value; } });
  const go = async () => {
    // Kept in state, not read from the input: a background update re-creates the input and would forget the choice.
    const file = state.file;
    if (!file) return toast("בחרו קובץ קודם");
    state.busy = true;
    state.error = "";
    state.reason = "";
    state.proposal = null;
    state.step = "מעלה את הקובץ…";
    rerender();
    try {
      const { blob, contentType } = await prepareUpload(file);
      if (contentType === "application/pdf" && blob.size > 15 * 1024 * 1024) throw new Error("ה-PDF גדול מדי (עד 15MB).");
      if (contentType !== "application/pdf" && blob.size > 10 * 1024 * 1024) throw new Error("התמונה גדולה מדי (עד 10MB).");
      const data = await blobToBase64(blob);
      state.step = state.extract ? "מעלה, וה-AI קורא את המסמך… זה יכול לקחת עד דקה." : "מעלה ושומר…";
      rerender();
      const r = await callFunction("addDocument", { contentType, fileName: file.name, data, title: state.title || file.name, extract: state.extract });
      state.title = "";
      state.fileName = "";
      state.file = null;
      state.list = null;
      refreshDocs();
      if (r.extracted) state.proposal = r;
      else toast("המסמך נשמר");
    } catch (err) {
      const msg = err.message || "ההעלאה לא הצליחה.";
      // The server keeps the file listed even when reading it with the AI failed — say so, and refresh the list.
      const saved = !!err.details?.saved;
      state.error = saved ? `הקובץ נשמר ברשימה, אבל קריאת המסמך עם AI לא הצליחה: ${msg} אפשר לנסות שוב עם ״לקרוא עם AI״ ליד הקובץ.` : msg;
      state.reason = err.details?.reason || "";
      if (saved) state.list = null;
    } finally {
      state.busy = false;
      state.step = "";
      rerender();
    }
  };
  return h("section", { class: "card" },
    h("h2", {}, icon("upload"), "העלאת כרטיס או אישור הזמנה"),
    h("div", { class: "field" }, h("label", { for: "doc-file" }, h("span", {}, "קובץ (PDF או צילום מסך)")), fileInput, chosen),
    h("div", { class: "field" }, h("label", {}, h("span", {}, "שם המסמך"), title)),
    h("div", { class: "choice-row", role: "group", "aria-label": "לקרוא עם AI" },
      h("button", { type: "button", class: "choice", "aria-pressed": state.extract ? "true" : "false", onclick: () => { state.extract = true; rerender(); } }, icon("sparkles", "icon-sm"), "לקרוא עם AI ולהציע עדכון"),
      h("button", { type: "button", class: "choice", "aria-pressed": state.extract ? "false" : "true", onclick: () => { state.extract = false; rerender(); } }, "רק לשמור")),
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", disabled: state.busy, onclick: go }, icon("upload"), state.busy ? "רגע…" : "העלאה")),
    state.step ? h("p", { class: "meta", role: "status" }, state.step) : null,
    h("p", { class: "meta" }, "המסמכים נראים רק לעורכים — חוץ ממסמך שמצרפים למקום במסלול, שאותו כל המשפחה יכולה לפתוח. אפשר לצרף מסמך גם ישר מהוצאה או ממקום במסלול."));
}

/** "מצורף ל: הוצאה ״טיסות״ · מקום ״Hilton…״" */
function linksLine(links) {
  const parts = [
    ...links.items.map((x) => h("span", { class: "doc-link" }, icon("wallet", "icon-sm"), ` הוצאה: ״${x.label}״`)),
    ...links.places.map((x) => h("span", { class: "doc-link" }, icon("pin", "icon-sm"), ` במסלול: ״${x.label}״ (המשפחה רואה)`)),
  ];
  return parts.length ? h("div", { class: "doc-links" }, h("span", { class: "meta" }, "מצורף ל:"), parts) : h("div", { class: "meta" }, "לא מצורף לשום הוצאה או מקום.");
}

/** Attach an existing document to a cost row or to a place on the route. */
function linkPanel(d, rerender) {
  const plan = store.docs.plan || {};
  const items = activeList(plan.items);
  const places = activeList(plan.places);
  let itemId = items[0]?.id || "";
  let placeId = places[0]?.id || "";
  const file = fileOf(d);
  const go = async (ops, doneText) => {
    if (!ops.length) return toast("כבר מצורף לשם.");
    try {
      await run(ops, { doneText });
      state.linkFor = null;
      rerender();
    } catch { /* the toast said why */ }
  };
  return h("div", { class: "inline-form" },
    h("h3", {}, icon("upload"), ` לצרף את ״${d.title}״`),
    items.length
      ? h("div", { class: "field" },
        h("label", {}, h("span", {}, "להוצאה (רק עורכים רואים)"),
          select(items.map((x) => ({ value: x.id, label: `${x.label} — ${plan.categories?.[x.categoryId]?.label || ""}` })), itemId, (v) => { itemId = v; })),
        h("button", { type: "button", class: "btn btn-secondary", style: { marginTop: "8px" }, onclick: () => go(linkItemOps(store.docs, itemId, d.id), `צורף ל״${plan.items[itemId]?.label}״`) }, icon("wallet", "icon-sm"), "צירוף להוצאה"))
      : h("p", { class: "meta" }, "עוד אין הוצאות לצרף אליהן."),
    places.length
      ? h("div", { class: "field" },
        h("label", {}, h("span", {}, "למקום במסלול (כל המשפחה תוכל לפתוח אותו)"),
          select(places.map((x) => ({ value: x.id, label: `${x.label}${x.date || x.checkIn ? ` — ${dateHe(x.date || x.checkIn, "dm")}` : ""}` })), placeId, (v) => { placeId = v; })),
        h("button", { type: "button", class: "btn btn-secondary", style: { marginTop: "8px" }, onclick: () => go(linkPlaceOps(store.docs, placeId, file), `צורף ל״${plan.places[placeId]?.label}״ במסלול`) }, icon("pin", "icon-sm"), "צירוף למקום במסלול"))
      : h("p", { class: "meta" }, "עוד אין מקומות במסלול לצרף אליהם."),
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn btn-secondary", onclick: () => { state.linkFor = null; rerender(); } }, "סגירה")));
}

async function removeDoc(d, rerender) {
  try {
    await callFunction("deleteDocument", { docId: d.id });
    state.list = null;
    refreshDocs();
    toast(`״${d.title}״ נמחק`);
  } catch (err) {
    toast(err.message || "המחיקה לא הצליחה.");
  }
  rerender();
}

function docRow(d, rerender) {
  const [ic, kindHe] = KIND[d.kind] || KIND.other;
  const links = docLinks(store.docs, d.id);
  const where = [...links.items.map((x) => `ההוצאה ״${x.label}״`), ...links.places.map((x) => `״${x.label}״ במסלול`)];
  return h("li", { class: "doc-row" },
    h("div", { class: "row", style: { alignItems: "flex-start" } },
      icon(ic),
      h("div", { class: "grow" },
        h("strong", { dir: "auto" }, d.title),
        h("div", { class: "meta" }, `${kindHe} · ${d.uploadedAt ? dateHe(d.uploadedAt.slice(0, 10), "dm") : ""} · ${sizeText(d.size || 0)}${d.uploadedBy ? ` · ${d.uploadedBy}` : ""}`),
        d.facts?.summary ? h("div", { class: "meta", dir: "auto" }, d.facts.summary) : null,
        linksLine(links))),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "edit-btn", onclick: () => openFile(fileOf(d)) }, icon("eye", "icon-sm"), "פתיחה"),
      h("button", { type: "button", class: "edit-btn", onclick: () => { state.linkFor = state.linkFor === d.id ? null : d.id; rerender(); } }, icon("upload", "icon-sm"), "צירוף להוצאה / למסלול"),
      !d.proposalId && !links.places.length
        ? h("button", { type: "button", class: "edit-btn", disabled: !!state.reading, onclick: () => readAgain(d, rerender) }, icon("sparkles", "icon-sm"), state.reading === d.id ? "קורא…" : "לקרוא עם AI")
        : null,
      h("button", {
        type: "button", class: "edit-btn edit-btn-danger",
        onclick: askFirst(d.title, () => removeDoc(d, rerender), where.length ? `הוא יוסר גם מ${where.join(", ")}.` : "הקובץ יימחק לגמרי."),
      }, icon("trash", "icon-sm"), "מחיקה")),
    state.linkFor === d.id ? linkPanel(d, rerender) : null);
}

export function renderDocs(ctx) {
  if (!can.edit()) return [backLink(), pageHead("כרטיסים ואישורים"), signInCard("המסמכים מכילים מחירים וקודי הזמנה, ולכן הם רק לעורכי הטיול.")];
  if (store.demo) return [backLink(), pageHead("כרטיסים ואישורים"), notice("במצב הדגמה אין אחסון קבצים. אחרי החיבור ל-Firebase אפשר להעלות כאן כרטיסים ואישורים.", "info", "info")];
  const rerender = ctx.rerender;
  if (state.list === null) load(rerender);
  return [
    backLink(),
    pageHead("כרטיסים ואישורים"),
    can.edit() ? uploadCard(rerender) : null,
    state.error ? notice(state.error, "danger") : null,
    state.error && state.reason ? h("p", { class: "meta tech-reason", dir: "ltr" }, `פרטים טכניים: ${state.reason}`) : null,
    state.proposal ? proposalCard(state.proposal, { onDone: () => { state.proposal = null; rerender(); } }) : null,
    h("section", { class: "card" },
      h("h2", {}, icon("file"), "המסמכים שלנו"),
      state.list === null
        ? h("p", { class: "meta" }, "טוען…")
        : state.list.length
          ? h("ul", { class: "doc-list" }, state.list.map((d) => docRow(d, rerender)))
          : emptyState("עוד אין מסמכים.")),
  ];
}
