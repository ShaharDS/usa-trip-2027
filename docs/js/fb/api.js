// Callable Cloud Functions (me-west1). The server re-checks who you are on every call.
import { functionsModule } from "./lazy.js";

const MESSAGES_HE = {
  "permission-denied": "אין לחשבון הזה הרשאה לפעולה הזו.",
  unauthenticated: "צריך להתחבר קודם.",
  "resource-exhausted": "הגעתם למגבלת השימוש להיום. נסו שוב מחר.",
  aborted: "מישהו אחר שינה בינתיים. רעננו את הדף ונסו שוב.",
  "invalid-argument": "השינוי לא תקין.",
  unavailable: "אין חיבור כרגע. נסו שוב בעוד רגע.",
  "deadline-exceeded": "זה לקח יותר מדי זמן. נסו שוב.",
};

export class ApiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export async function callFunction(name, data, { timeout = 310_000 } = {}) {
  const { m, functions } = await functionsModule();
  const fn = m.httpsCallable(functions, name, { timeout });
  try {
    const res = await fn(data);
    return res.data;
  } catch (err) {
    const code = String(err.code || "").replace(/^functions\//, "");
    const message = err.details?.messageHe || MESSAGES_HE[code] || "משהו השתבש. נסו שוב.";
    throw new ApiError(code, message, err.details);
  }
}
