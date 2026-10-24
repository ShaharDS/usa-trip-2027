// Voice in the browser. Typing with the phone keyboard's microphone works everywhere and is the main way to
// speak; the mic button appears only where the browser itself supports Hebrew speech recognition.

const Recognition = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;

export const canListen = () => !!Recognition();

/** Start listening (he-IL). onText(text, isFinal). Returns a stop() function. */
export function listen({ onText, onEnd, onError }) {
  const R = Recognition();
  const rec = new R();
  rec.lang = "he-IL";
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    let text = "";
    for (const result of e.results) text += result[0].transcript;
    onText?.(text, e.results[e.results.length - 1].isFinal);
  };
  rec.onerror = (e) => onError?.(e.error);
  rec.onend = () => onEnd?.();
  rec.start();
  return () => rec.stop();
}

function hebrewVoice() {
  try {
    return speechSynthesis.getVoices().find((v) => /^(he|iw)/i.test(v.lang)) || null;
  } catch {
    return null;
  }
}

/** Resolves true when a Hebrew voice is available (voices load asynchronously on some phones). */
export function hasHebrewVoice() {
  if (!("speechSynthesis" in globalThis)) return Promise.resolve(false);
  if (hebrewVoice()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => resolve(!!hebrewVoice());
    speechSynthesis.addEventListener?.("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

export function speak(text) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "he-IL";
  const v = hebrewVoice();
  if (v) u.voice = v;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  try {
    speechSynthesis.cancel();
  } catch { /* ignore */ }
}
