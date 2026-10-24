// Spending limits: per-person daily caps and a monthly budget, stored in trips/usa2027/usage/{yyyy-mm}.
// A call first reserves an estimate (so parallel calls can't overspend), then settles the real cost.
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db, paths } from "./admin.js";
import type { Caller } from "./access.js";

export const AI_DEFAULTS = { model: "claude-sonnet-5-5", monthlyBudgetUsd: 25, dailyCapFamily: 15, dailyCapEditor: 40, includePrivateInAsk: false };
export type AiSettings = typeof AI_DEFAULTS;

export function aiSettingsOf(priv: any): AiSettings {
  return { ...AI_DEFAULTS, ...(priv?.aiSettings || {}) };
}

const israelDay = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

export interface Reservation {
  month: string;
  day: string;
  estimate: number;
  feature: string;
}

export async function reserve(caller: Caller, feature: string, estimate: number, settings: AiSettings): Promise<Reservation> {
  const day = israelDay();
  const month = day.slice(0, 7);
  const ref = db.doc(`${paths.usage}/${month}`);
  const cap = caller.role === "family" ? settings.dailyCapFamily : caller.role === "owner" ? settings.dailyCapEditor * 2 : settings.dailyCapEditor;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = (snap.exists ? snap.data() : {}) as any;
    const used = d.days?.[day]?.[caller.uid as string] || 0;
    if (used >= cap) {
      const messageHe = `הגעתם למגבלה של ${cap} פעולות AI להיום. אפשר לנסות שוב מחר.`;
      throw new HttpsError("resource-exhausted", messageHe, { messageHe });
    }
    const spent = (d.costUsd || 0) + (d.reservedUsd || 0);
    if (spent + estimate > settings.monthlyBudgetUsd) {
      const messageHe = "התקציב החודשי ל-AI נגמר. בעל האתר יכול להגדיל אותו בהגדרות.";
      throw new HttpsError("resource-exhausted", messageHe, { messageHe });
    }
    tx.set(ref, {
      calls: FieldValue.increment(1),
      reservedUsd: FieldValue.increment(estimate),
      days: { [day]: { [caller.uid as string]: used + 1 } },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { month, day, estimate, feature };
}

export async function settle(res: Reservation, actualUsd: number) {
  const ref = db.doc(`${paths.usage}/${res.month}`);
  await ref.set({
    costUsd: FieldValue.increment(Math.max(0, actualUsd)),
    reservedUsd: FieldValue.increment(-res.estimate),
    byFeature: { [res.feature]: FieldValue.increment(Math.max(0, actualUsd)) },
  }, { merge: true });
}
