// The only write path for trip data. Re-validates everything with the shared engine (the browser's check is
// only a convenience), applies it in a transaction, recomputes totals and records the change for history/undo.
import { onCall } from "firebase-functions/v2/https";
import { db, paths, REGION } from "./lib/admin.js";
import { requireRole } from "./lib/access.js";
import { badRequest, readDocs, rejectPrepared, requireTripData, writeDocs } from "./lib/state.js";
import { prepareCommit, prepareUndo } from "./shared/commit.js";
import { MAX_OPS } from "./shared/validate.js";

export const commitChange = onCall({ region: REGION }, async (req) => {
  const caller = await requireRole(req, "editor");
  const { ops, summary } = (req.data || {}) as { ops?: unknown; summary?: unknown };
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > MAX_OPS) badRequest("אין שינויים לשמור.");
  const changeRef = db.collection(paths.changes).doc();
  const now = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const docs = await readDocs(tx);
    requireTripData(docs);
    const prepared = prepareCommit(docs, ops, {
      now,
      byUid: caller.uid,
      byLabel: caller.label,
      source: "manual",
      summary: typeof summary === "string" ? summary.slice(0, 600) : undefined,
      changeId: changeRef.id,
    });
    if (!prepared.ok) rejectPrepared(prepared);
    writeDocs(tx, prepared.docs);
    tx.set(changeRef, prepared.change);
    return { changeId: changeRef.id, version: prepared.docs.plan.version };
  });
});

export const undoChange = onCall({ region: REGION }, async (req) => {
  const caller = await requireRole(req, "editor");
  const changeId = String((req.data || {}).changeId || "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(changeId)) badRequest("לא מצאנו את השינוי.");
  const origRef = db.collection(paths.changes).doc(changeId);
  const newRef = db.collection(paths.changes).doc();
  const now = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const origSnap = await tx.get(origRef);
    const docs = await readDocs(tx);
    if (!origSnap.exists) badRequest("לא מצאנו את השינוי.");
    requireTripData(docs);
    const change = origSnap.data() as any;
    if (change.source === "system" || !Array.isArray(change.inverseOps) || change.inverseOps.length === 0) {
      badRequest("את השינוי הזה אי אפשר לבטל מכאן (אפשר לטעון גיבוי בהגדרות).");
    }
    const prepared = prepareUndo(docs, change, { now, byUid: caller.uid, byLabel: caller.label, changeId: newRef.id, undoOf: changeId });
    if (!prepared.ok) rejectPrepared(prepared);
    writeDocs(tx, prepared.docs);
    tx.set(newRef, prepared.change);
    tx.update(origRef, { undoneBy: newRef.id });
    return { changeId: newRef.id, version: prepared.docs.plan.version };
  });
});
