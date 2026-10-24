// "שאלו את הטיול": family asks in plain Hebrew (typed, or spoken with the keyboard mic); editors can also
// ask the AI to change something or paste a quote — that returns a proposal to approve, never a direct edit.
import { h, icon, toast } from "../ui/h.js";
import { backLink, notice, pageHead } from "../components/common.js";
import { proposalCard } from "../components/proposal.js";
import { signInCard } from "./signin.js";
import { callFunction } from "../fb/api.js";
import { readMyAsks } from "../data/live.js";
import { canListen, hasHebrewVoice, listen, speak, stopSpeaking } from "../ui/speech.js";
import { can, store } from "../store.js";

const MODES = {
  ask: { label: "שאלה", icon: "chat", placeholder: "למשל: כמה עולים המלונות בניו יורק?", button: "לשאול",
    examples: ["כמה עולים המלונות בניו יורק?", "מה כבר הוזמן ומה עוד לא?", "מתי חוזרים הביתה?"] },
  change: { label: "לשנות במשפט", icon: "sparkles", placeholder: "למשל: תוסיף עיר וושינגטון ל-2 לילות אחרי ניו יורק", button: "להכין הצעה",
    examples: ["תוסיף עיר וושינגטון ל-2 לילות אחרי ניו יורק", "תעביר את השייט ל-11 באוקטובר על Wonder עם מרפסת", "תבדוק מחיר עדכני לכרטיסים ליוניברסל"] },
  quote: { label: "הדבקת הצעת מחיר", icon: "file", placeholder: "הדביקו כאן את המייל או הטקסט של הצעת המחיר / אישור ההזמנה", button: "לקרוא ולהציע עדכון", examples: [] },
};

// Kept outside the render so background updates don't wipe what was typed or answered.
const state = { mode: "ask", text: "", busy: false, answer: null, proposal: null, error: "", history: null, historyFor: null };

async function send(rerender) {
  const text = state.text.trim();
  if (!text) return toast("כתבו קודם מה לשאול");
  state.busy = true;
  state.error = "";
  state.answer = null;
  state.proposal = null;
  rerender();
  try {
    if (state.mode === "ask") {
      state.answer = await callFunction("aiAsk", { question: text });
      state.history = null;
    } else {
      state.proposal = await callFunction("aiPropose", { mode: state.mode === "quote" ? "quote" : "sentence", text });
    }
  } catch (err) {
    state.error = err.message || "משהו השתבש. נסו שוב.";
  } finally {
    state.busy = false;
    rerender();
  }
}

function answerCard(a) {
  const speakBtn = h("button", { type: "button", class: "btn btn-secondary", hidden: true, onclick: () => speak(a.answer) }, icon("speak"), "הקראה");
  const stopBtn = h("button", { type: "button", class: "btn btn-ghost", hidden: true, onclick: stopSpeaking }, "עצירה");
  hasHebrewVoice().then((ok) => { speakBtn.hidden = !ok; stopBtn.hidden = !ok; });
  return h("section", { class: "card", "aria-live": "polite" },
    h("h2", {}, icon("chat"), "התשובה"),
    h("div", { class: "answer", dir: "auto" }, a.answer),
    a.sources?.length
      ? h("ul", { class: "sources" }, a.sources.map((s) => h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, icon("external", "icon-sm"), s.title || s.url))))
      : null,
    h("div", { class: "btn-row" }, speakBtn, stopBtn));
}

function historyCard(rerender) {
  if (!store.user?.uid || store.demo) return null;
  if (state.historyFor !== store.user.uid) {
    state.historyFor = store.user.uid;
    state.history = null;
  }
  if (state.history === null) {
    state.history = [];
    readMyAsks(store.user.uid).then((list) => { state.history = list; rerender(); }).catch(() => {});
    return null;
  }
  if (!state.history.length) return null;
  return h("section", { class: "card" },
    h("h2", {}, icon("history"), "שאלתי לאחרונה"),
    h("ul", { class: "check-list" }, state.history.map((q) =>
      h("li", { style: { display: "block" } },
        h("strong", { dir: "auto" }, q.question),
        h("div", { class: "meta", dir: "auto", style: { marginTop: "4px", whiteSpace: "pre-wrap" } }, q.answer)))));
}

export function renderAsk(ctx) {
  if (!can.family()) return [backLink(), pageHead("שאלו את הטיול"), signInCard("כדי לשאול את ה-AI צריך להיכנס פעם אחת עם חשבון גוגל.")];
  const rerender = ctx.rerender;
  const modes = can.edit() ? ["ask", "change", "quote"] : ["ask"];
  if (!modes.includes(state.mode)) state.mode = "ask";
  const m = MODES[state.mode];

  const textarea = h("textarea", {
    class: "textarea", id: "ask-text", dir: "auto", rows: state.mode === "quote" ? 8 : 4, placeholder: m.placeholder, disabled: state.busy,
    "aria-label": m.placeholder, oninput: (e) => { state.text = e.target.value; },
  });
  textarea.value = state.text;

  let stop = null;
  const mic = canListen()
    ? h("button", {
      type: "button", class: "btn btn-secondary", disabled: state.busy,
      onclick: (e) => {
        const btn = e.currentTarget;
        if (stop) {
          stop();
          return;
        }
        const base = state.text ? `${state.text} ` : "";
        btn.lastChild.textContent = "מקשיב… (לחצו לסיום)";
        stop = listen({
          onText: (t) => { state.text = base + t; textarea.value = state.text; },
          onEnd: () => { stop = null; btn.lastChild.textContent = "דברו"; },
          onError: () => { stop = null; btn.lastChild.textContent = "דברו"; toast("לא הצלחנו לשמוע. אפשר ללחוץ על המיקרופון במקלדת."); },
        });
      },
    }, icon("mic"), "דברו")
    : null;

  const demoNote = store.demo ? notice("במצב הדגמה ה-AI לא מחובר. אחרי החיבור ל-Firebase ומפתח ה-API זה יעבוד כאן.", "info", "info") : null;

  return [
    backLink(),
    pageHead("שאלו את הטיול"),
    demoNote,
    h("section", { class: "card ask-box" },
      modes.length > 1
        ? h("div", { class: "choice-row", role: "group", "aria-label": "מה לעשות", style: { marginBottom: "12px" } },
          modes.map((k) => h("button", {
            type: "button", class: "choice", "aria-pressed": state.mode === k ? "true" : "false",
            onclick: () => { state.mode = k; state.answer = null; state.proposal = null; state.error = ""; rerender(); },
          }, icon(MODES[k].icon, "icon-sm"), MODES[k].label)))
        : null,
      textarea,
      h("p", { class: "ask-hint" }, icon("mic", "icon-sm"), "אפשר גם לדבר: לחצו על המיקרופון במקלדת של הטלפון."),
      m.examples.length
        ? h("div", { class: "choice-row", style: { marginTop: "10px" } }, m.examples.map((ex) =>
          h("button", { type: "button", class: "choice", style: { fontWeight: 500 }, onclick: () => { state.text = ex; textarea.value = ex; textarea.focus(); } }, ex)))
        : null,
      h("div", { class: "btn-row" },
        h("button", { type: "button", class: "btn", disabled: state.busy || store.demo, onclick: () => send(rerender) }, icon("send"), state.busy ? "חושב…" : m.button),
        mic),
      state.busy ? h("p", { class: "meta", role: "status" }, state.mode === "ask" ? "חושב… זה לוקח כמה שניות." : "מכין הצעה… זה יכול לקחת עד דקה (ה-AI בודק מחירים).") : null,
      state.mode !== "ask" ? h("p", { class: "meta" }, "שום דבר לא נשמר לבד: תקבלו רשימת שינויים ותאשרו אותם.") : null),
    state.error ? notice(state.error, "danger") : null,
    state.answer ? answerCard(state.answer) : null,
    state.proposal ? proposalCard(state.proposal, { onDone: () => { state.proposal = null; state.text = ""; rerender(); } }) : null,
    state.mode === "ask" ? historyCard(rerender) : null,
  ];
}
