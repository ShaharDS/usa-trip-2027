// "דברו" — dictation into a text box (he-IL), shared by "שאלו את הטיול", adding expenses and adding places with the
// AI. The button appears only where the browser itself recognises Hebrew speech; everywhere else the phone
// keyboard's microphone does the same job, and the hint below the box says so.
import { h, icon, toast } from "../ui/h.js";
import { canListen, listen } from "../ui/speech.js";

/**
 * @param {{getText: () => string, setText: (t: string) => void, disabled?: boolean}} o
 *   setText is called while speaking (the box should show the words as they come).
 */
export function micButton({ getText, setText, disabled = false }) {
  if (!canListen()) return null;
  let stop = null;
  const label = h("span", {}, "דברו");
  return h("button", {
    type: "button", class: "btn btn-secondary", disabled,
    onclick: () => {
      if (stop) return stop();
      const base = getText() ? `${getText()} ` : "";
      label.textContent = "מקשיב… (לחצו לסיום)";
      const done = () => { stop = null; label.textContent = "דברו"; };
      stop = listen({
        onText: (t) => setText(base + t),
        onEnd: done,
        onError: () => { done(); toast("לא הצלחנו לשמוע. אפשר ללחוץ על המיקרופון במקלדת."); },
      });
    },
  }, icon("mic"), label);
}

export function micHint(text = "אפשר גם לדבר: לחצו על המיקרופון במקלדת של הטלפון.") {
  return h("p", { class: "ask-hint" }, icon("mic", "icon-sm"), text);
}
