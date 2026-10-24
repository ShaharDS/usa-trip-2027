// Reading and writing the trip documents (inside a transaction when changing them). Every write also
// refreshes the public route document from the plan, so it can never drift or carry prices.
import { HttpsError } from "firebase-functions/v2/https";
import type { Transaction } from "firebase-admin/firestore";
import { db, paths } from "./admin.js";
import { emptyDocs } from "../shared/schema.js";
import { routeView } from "../shared/route.js";

export interface Docs {
  plan: any;
  priv: any;
}

export async function readDocs(tx?: Transaction): Promise<Docs> {
  const planRef = db.doc(paths.plan);
  const privRef = db.doc(paths.priv);
  const [planSnap, privSnap] = tx ? await tx.getAll(planRef, privRef) : await db.getAll(planRef, privRef);
  const empty = emptyDocs();
  return {
    plan: planSnap.exists ? planSnap.data() : empty.plan,
    priv: privSnap.exists ? privSnap.data() : empty.priv,
  };
}

export function writeDocs(tx: Transaction, docs: Docs) {
  tx.set(db.doc(paths.plan), docs.plan);
  tx.set(db.doc(paths.priv), docs.priv);
  tx.set(db.doc(paths.route), routeView(docs.plan));
}

/** Changes need a trip to change: before the owner loads the opening data there is nothing to edit. */
export function requireTripData(docs: Docs) {
  if (!docs.plan?.settings?.startDate) {
    const messageHe = "באתר עוד אין נתוני טיול. בעל האתר צריך ללחוץ ״טען נתוני פתיחה״ (הגדרות → גיבוי).";
    throw new HttpsError("failed-precondition", messageHe, { messageHe });
  }
}

/** Turn a failed prepareCommit() into a callable error with Hebrew messages for the UI. */
export function rejectPrepared(prepared: { errors: string[]; conflicts?: unknown[] }): never {
  const messageHe = prepared.errors[0] || "השינוי לא תקין.";
  throw new HttpsError(prepared.conflicts ? "aborted" : "invalid-argument", messageHe, { messageHe, errors: prepared.errors.slice(0, 20) });
}

export function badRequest(messageHe: string): never {
  throw new HttpsError("invalid-argument", messageHe, { messageHe });
}
