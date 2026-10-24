// Tickets and booking confirmations (editors only — they carry prices). Editors upload a PDF / screenshot; the AI reads it and
// proposes updates (row booked, real price, deadlines, booking code) for approval.
import { h, icon, toast } from "../ui/h.js";
import { backLink, emptyState, notice, pageHead } from "../components/common.js";
import { proposalCard } from "../components/proposal.js";
import { signInCard } from "./signin.js";
import { dateHe, fmtNum } from "../shared/format.js";
import { newId } from "../shared/schema.js";
import { callFunction } from "../fb/api.js";
import { docBlob, uploadDoc } from "../fb/storage.js";
import { listDocuments } from "../data/live.js";
import { prepareUpload } from "../ui/resize.js";
import { can, store } from "../store.js";

const KIND = { flight: ["plane", "טיסה"], hotel: ["hotel", "לינה"], car: ["car", "רכב"], cruise: ["ship", "שייט"], parks: ["ferris", "פארקים"], insurance: ["shield", "ביטוח"], other: ["file", "מסמך"] };
const state = { list: null, loading: false, busy: false, step: "", proposal: null, error: "", title: "", extract: true };

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
    const blob = await docBlob(d.path);
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else location.href = url;
  } catch {
    win?.close();
    toast("לא הצלחנו לפתוח את הקובץ.");
  }
}

function sizeText(bytes) {
  return bytes > 1e6 ? `${fmtNum(bytes / 1e6, 1)} MB` : `${fmtNum(Math.max(1, Math.round(bytes / 1e3)))} KB`;
}

function uploadCard(rerender) {
  const fileInput = h("input", { type: "file", class: "input", accept: "application/pdf,image/*", id: "doc-file", disabled: state.busy });
  const title = h("input", { class: "input", type: "text", dir: "auto", placeholder: "למשל: כרטיסי טיסה הלוך", value: state.title, oninput: (e) => { state.title = e.target.value; } });
  const go = async () => {
    const file = fileInput.files?.[0];
    if (!file) return toast("בחרו קובץ קודם");
    state.busy = true;
    state.error = "";
    state.proposal = null;
    state.step = "מעלה את הקובץ…";
    rerender();
    try {
      const { blob, contentType, ext } = await prepareUpload(file);
      if (contentType === "application/pdf" && blob.size > 19.5 * 1024 * 1024) throw new Error("ה-PDF גדול מדי (עד 20MB).");
      const docId = newId("doc");
      const fileName = `${(file.name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "document").slice(0, 60)}.${ext}`;
      await uploadDoc(docId, fileName, blob, contentType);
      state.step = state.extract ? "ה-AI קורא את המסמך… זה יכול לקחת עד דקה." : "שומר…";
      rerender();
      const r = await callFunction("addDocument", { docId, fileName, title: state.title || file.name, extract: state.extract });
      state.title = "";
      state.list = null;
      if (r.extracted) state.proposal = r;
      else toast("המסמך נשמר");
    } catch (err) {
      state.error = err.message || "ההעלאה לא הצליחה.";
    } finally {
      state.busy = false;
      state.step = "";
      rerender();
    }
  };
  return h("section", { class: "card" },
    h("h2", {}, icon("upload"), "העלאת כרטיס או אישור הזמנה"),
    h("div", { class: "field" }, h("label", { for: "doc-file" }, h("span", {}, "קובץ (PDF או צילום מסך)")), fileInput),
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
                d.facts?.summary ? h("div", { class: "meta", dir: "auto" }, d.facts.summary) : null),
              h("button", { type: "button", class: "edit-btn", onclick: () => openDoc(d) }, icon("eye", "icon-sm"), "פתיחה"));
          }))
          : emptyState("עוד אין מסמכים.")),
  ];
}
