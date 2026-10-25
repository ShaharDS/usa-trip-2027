// Tickets and booking confirmations (editors only — they carry prices). Editors upload a PDF / screenshot; the AI reads it and
// proposes updates (row booked, real price, deadlines, booking code) for approval. Files go to and come back from the
// addDocument / getDocumentFile functions — the browser never talks to Storage itself.
import { h, icon, toast } from "../ui/h.js";
import { backLink, emptyState, notice, pageHead } from "../components/common.js";
import { proposalCard } from "../components/proposal.js";
import { signInCard } from "./signin.js";
import { dateHe, fmtNum } from "../shared/format.js";
import { callFunction } from "../fb/api.js";
import { listDocuments } from "../data/live.js";
import { blobToBase64, prepareUpload } from "../ui/resize.js";
import { can, store } from "../store.js";

const KIND = { flight: ["plane", "טיסה"], hotel: ["hotel", "לינה"], car: ["car", "רכב"], cruise: ["ship", "שייט"], parks: ["ferris", "פארקים"], insurance: ["shield", "ביטוח"], other: ["file", "מסמך"] };
const state = { list: null, loading: false, busy: false, step: "", proposal: null, error: "", reason: "", title: "", file: null, fileName: "", extract: true, reading: null };

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

async function openDoc(d) {
  const win = window.open("", "_blank"); // open synchronously (popup blockers), fill when the file arrives
  try {
    const r = await callFunction("getDocumentFile", { docId: d.id });
    const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: r.contentType }));
    if (win) win.location.href = url;
    else location.href = url;
  } catch (err) {
    win?.close();
    toast(err.message || "לא הצלחנו לפתוח את הקובץ.");
  }
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
    h("p", { class: "meta" }, "המסמכים נראים רק לעורכים. בעמוד הציבורי אין מחירים ואין קודי הזמנה."));
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
          ? h("ul", { class: "check-list" }, state.list.map((d) => {
            const [ic, kindHe] = KIND[d.kind] || KIND.other;
            return h("li", {},
              icon(ic),
              h("div", { class: "grow" },
                h("strong", { dir: "auto" }, d.title),
                h("div", { class: "meta" }, `${kindHe} · ${d.uploadedAt ? dateHe(d.uploadedAt.slice(0, 10), "dm") : ""} · ${sizeText(d.size || 0)}${d.uploadedBy ? ` · ${d.uploadedBy}` : ""}`),
                d.shared ? h("div", { class: "meta" }, icon("users", "icon-sm"), " מצורף למקום במסלול — כל המשפחה רואה") : null,
                d.facts?.summary ? h("div", { class: "meta", dir: "auto" }, d.facts.summary) : null),
              h("div", { class: "row wrap", style: { gap: "6px", justifyContent: "flex-end" } },
                h("button", { type: "button", class: "edit-btn", onclick: () => openDoc(d) }, icon("eye", "icon-sm"), "פתיחה"),
                !d.shared && !d.proposalId
                  ? h("button", { type: "button", class: "edit-btn", disabled: !!state.reading, onclick: () => readAgain(d, rerender) }, icon("sparkles", "icon-sm"), state.reading === d.id ? "קורא…" : "לקרוא עם AI")
                  : null));
          }))
          : emptyState("עוד אין מסמכים.")),
  ];
}
