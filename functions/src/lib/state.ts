// Reading and writing the two trip documents (inside a transaction when changing them).
import { HttpsError } from "firebase-functions/v2/https";
import type { Transaction } from "firebase-admin/firestore";
import { db, paths } from "./admin.js";
import { emptyDocs } from "../shared/schema.js";

export interface Docs {
  pub: any;
  priv: any;
}

export async function readDocs(tx?: Transaction): Promise<Docs> {
  const pubRef = db.doc(paths.pub);
  const privRef = db.doc(paths.priv);
  const [pubSnap, privSnap] = tx ? await tx.getAll(pubRef, privRef) : await db.getAll(pubRef, privRef);
  const empty = emptyDocs();
  return {
    pub: pubSnap.exists ? pubSnap.data() : empty.pub,
    priv: privSnap.exists ? privSnap.data() : empty.priv,
  };
}

export function writeDocs(tx: Transaction, docs: Docs) {
  tx.set(db.doc(paths.pub), docs.pub);
  tx.set(db.doc(paths.priv), docs.priv);
}

/** Turn a failed prepareCommit() into a callable error with Hebrew messages for the UI. */
export function rejectPrepared(prepared: { errors: string[]; conflicts?: unknown[] }): never {
  const messageHe = prepared.errors[0] || "השינוי לא תקין.";
  throw new HttpsError(prepared.conflicts ? "aborted" : "invalid-argument", messageHe, { messageHe, errors: prepared.errors.slice(0, 20) });
}

export function badRequest(messageHe: string): never {
  throw new HttpsError("invalid-argument", messageHe, { messageHe });
}
