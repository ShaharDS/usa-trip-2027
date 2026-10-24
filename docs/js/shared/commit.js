// Preparing a commit: conflict check -> validation -> apply -> bump version -> recompute totals ->
// "what changed" entry. Shared by the browser (optimistic update / demo mode) and the commitChange Cloud
// Function (the authoritative write), so both always agree.

import { ENTITIES } from "./schema.js";
import { applyOps, conflictsOf } from "./ops.js";
import { validateOps } from "./validate.js";
import { computeTrip, derivedSummary } from "./engine.js";
import { describeOp } from "./format.js";

export const RECENT_MAX = 40;

const isPlanOp = (op) => op.t === "choose" || ENTITIES[op.e]?.doc === "plan";

export function summarizeOps(ops, docs, max = 400) {
  // Describe each op against the documents as they are at that point, so later ops can name records
  // created earlier in the same change.
  let cur = docs;
  const lines = ops.map((op) => {
    const line = describeOp(op, cur);
    try {
      cur = applyOps(cur, [op]).docs;
    } catch { /* keep describing against the last good state */ }
    return line;
  });
  let text = lines.slice(0, 4).join(" · ");
  if (lines.length > 4) text += ` · ועוד ${lines.length - 4} שינויים`;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function conflictHe(c, docs) {
  if (c.reason === "missing") return "פריט שניסיתם לשנות כבר לא קיים (אולי מישהו מחק אותו). רעננו את הדף.";
  if (c.reason === "exists") return "הפריט כבר קיים. רעננו את הדף.";
  const rec = c.e && ENTITIES[c.e] && !ENTITIES[c.e].singleton ? (ENTITIES[c.e].doc === "plan" ? docs.plan : docs.priv)?.[ENTITIES[c.e].path]?.[c.id] : null;
  return `מישהו אחר שינה בינתיים את ${rec?.label ? `"${rec.label}"` : "הפריט"}. רעננו את הדף ונסו שוב.`;
}

/**
 * @param docs {plan, priv} — current documents
 * @param ops  change ops
 * @param meta {now, byUid, byLabel, source, summary, approvedBy, proposalId, changeId, undoOf, limits}
 * @returns {ok:false, errors, conflicts?} | {ok:true, docs, change, touched}
 */
export function prepareCommit(docs, ops, meta) {
  const conflicts = conflictsOf(docs, ops);
  if (conflicts.length) return { ok: false, conflicts, errors: conflicts.map((c) => conflictHe(c, docs)) };
  const version = (docs.plan.version || 0) + 1;
  const v = validateOps(docs, ops, { ...(meta.limits || {}), version });
  if (!v.ok) return { ok: false, errors: v.errors };

  const before = computeTrip(docs.plan, { skipOptions: true });
  const after = computeTrip(v.docs.plan, { skipOptions: true });
  const deltaIlsTyp = Math.round(after.total.ils.typ - before.total.ils.typ);
  const planOps = ops.filter(isPlanOp);

  const plan = v.docs.plan;
  plan.version = version;
  plan.updatedAt = meta.now;
  plan.updatedByLabel = meta.byLabel || "";
  plan.derived = derivedSummary(after, meta.now);
  if (planOps.length) {
    const entry = {
      version,
      changeId: meta.changeId || null,
      at: meta.now,
      byLabel: meta.byLabel || "",
      source: meta.source || "manual",
      summary: summarizeOps(planOps, docs, 240), // regenerated here from plan ops only: private details never reach this list
      deltaIlsTyp,
      refs: v.touched.filter((t) => ENTITIES[t.e]?.doc === "plan").slice(0, 10),
    };
    plan.recent = [entry, ...(plan.recent || [])].slice(0, RECENT_MAX);
  }

  const change = {
    at: meta.now,
    by: { uid: meta.byUid || null, label: meta.byLabel || "" },
    source: meta.source || "manual",
    approvedBy: meta.approvedBy || null,
    proposalId: meta.proposalId || null,
    summary: (meta.summary || summarizeOps(ops, docs)).slice(0, 600),
    ops,
    inverseOps: v.inverseOps,
    baseVersion: version - 1,
    newVersion: version,
    deltaIlsTyp,
    undoOf: meta.undoOf || null,
    undoneBy: null,
  };
  return { ok: true, docs: v.docs, change, touched: v.touched };
}

/** Undo = commit the stored inverse ops; conflicts if any field changed again since. meta.undoOf = the change id. */
export function prepareUndo(docs, change, meta) {
  if (change.undoneBy) return { ok: false, errors: ["השינוי הזה כבר בוטל."] };
  return prepareCommit(docs, change.inverseOps, { ...meta, source: "undo", summary: `ביטול: ${change.summary}`.slice(0, 600) });
}
