// Owner only: replace the trip with the opening data or a backup file. The previous documents are kept in
// trips/usa2027/backups/{changeId}, so an import can always be reversed by importing that backup.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, paths, REGION } from "./lib/admin.js";
import { requireRole } from "./lib/access.js";
import { badRequest, readDocs, writeDocs } from "./lib/state.js";
import { validateDocs } from "./shared/validate.js";
import { computeTrip, derivedSummary } from "./shared/engine.js";
import { RECENT_MAX } from "./shared/commit.js";
import { SCHEMA_VERSION } from "./shared/schema.js";

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);

export const adminImport = onCall({ region: REGION, memory: "512MiB" }, async (req) => {
  const caller = await requireRole(req, "owner");
  const data = (req.data || {}) as { plan?: unknown; pub?: unknown; priv?: unknown };
  const plan = isObj(data.plan) ? data.plan : data.pub; // backups made before 2026-10-25 call the plan "pub"
  const priv = data.priv;
  if (!isObj(plan)) badRequest("הקובץ לא נראה כמו נתוני טיול.");
  const changeRef = db.collection(paths.changes).doc();
  const backupRef = db.collection(paths.backups).doc(changeRef.id);
  const now = new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const current = await readDocs(tx);
    const nextPriv = isObj(priv) ? priv : current.priv;
    const nextPlan: Record<string, any> = { ...plan, schemaVersion: SCHEMA_VERSION };
    const errors = validateDocs({ plan: nextPlan, priv: nextPriv });
    if (errors.length) {
      const messageHe = `הנתונים לא תקינים: ${errors[0]}`;
      throw new HttpsError("invalid-argument", messageHe, { messageHe, errors: errors.slice(0, 20) });
    }
    const version = (current.plan.version || 0) + 1;
    const result = computeTrip(nextPlan, { skipOptions: true });
    nextPlan.version = version;
    nextPlan.updatedAt = now;
    nextPlan.updatedByLabel = caller.label;
    nextPlan.derived = derivedSummary(result, now);
    nextPlan.recent = [
      { version, changeId: changeRef.id, at: now, byLabel: caller.label, source: "system", summary: "נטענו נתוני טיול חדשים", deltaIlsTyp: 0, refs: [] },
      ...(Array.isArray(nextPlan.recent) ? nextPlan.recent : []),
    ].slice(0, RECENT_MAX);
    tx.set(backupRef, { at: now, by: caller.label, plan: current.plan, priv: current.priv });
    writeDocs(tx, { plan: nextPlan, priv: nextPriv });
    tx.set(changeRef, {
      at: now, by: { uid: caller.uid, label: caller.label }, source: "system", summary: "נטענו נתוני טיול חדשים (גיבוי של הקודמים נשמר)",
      ops: [], inverseOps: [], baseVersion: version - 1, newVersion: version, deltaIlsTyp: 0, backupId: backupRef.id, undoneBy: null,
    });
    return { changeId: changeRef.id, version };
  });
});
