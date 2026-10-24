// The proposal loop: Claude calls edit tools; each call is converted to ops, validated against a working
// copy of the trip and recorded. Nothing is written to the trip — the result is stored as a proposal that an
// editor approves line by line (applyProposal).
import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { MODE_TOOLS, resolveWithMap, toolCallToOps, toolsFor } from "../shared/aitools.js";
import { validateOps } from "../shared/validate.js";
import { computeTrip } from "../shared/engine.js";
import { describeOp } from "../shared/format.js";
import { ID_PREFIX } from "../shared/ops.js";
import { newId } from "../shared/schema.js";
import { addUsage, createMessage, emptyUsage, textOf, urlsOf, type Usage } from "./claude.js";
import { PROPOSE_SYSTEM, referencePrices, tripContext } from "./prompts.js";
import { db, paths } from "./admin.js";
import type { Caller } from "./access.js";
import type { Docs } from "./state.js";

export type Mode = "sentence" | "quote" | "extraction";
const MAX_TURNS = 8;
const MAX_OPS = 60;

export interface ProposalResult {
  ops: any[];
  lines: string[];
  summaryHe: string;
  sources: Array<{ url: string; title: string }>;
  usage: Usage;
  rejectedTools: string[];
  refused: boolean;
  working: Docs;
}

export async function runProposal(docs: Docs, mode: Mode, userText: string, model: string): Promise<ProposalResult> {
  const tools: any[] = toolsFor(mode);
  if (mode === "sentence") tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 5, user_location: { type: "approximate", country: "US" } });
  const today = new Date().toISOString().slice(0, 10);
  const system: any[] = [
    { type: "text", text: `${PROPOSE_SYSTEM}\n\n## Reference prices (background research)\n${referencePrices()}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: tripContext(docs, { includePrivate: false }), cache_control: { type: "ephemeral" } },
  ];
  const messages: any[] = [{ role: "user", content: `היום: ${today}\n${userText}` }];
  const usage = emptyUsage();
  const allowed = new Set(MODE_TOOLS[mode]);
  const tempMap: Record<string, string> = {};
  const makeId = (e: string) => newId((ID_PREFIX as any)[e] || "id");
  let working = docs;
  const ops: any[] = [];
  const lines: string[] = [];
  const seenUrls = new Map<string, string>();
  const citedUrls = new Map<string, string>();
  const rejectedTools: string[] = [];
  let summaryHe = "";
  let refused = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const msg = await createMessage({
      model, max_tokens: 16000, thinking: { type: "adaptive" }, output_config: { effort: mode === "sentence" ? "medium" : "low" },
      system, messages, tools, tool_choice: { type: "auto" },
    } as any);
    addUsage(usage, msg);
    const { seen, cited } = urlsOf(msg);
    seen.forEach((t, u) => seenUrls.set(u, t));
    cited.forEach((t, u) => citedUrls.set(u, t));
    messages.push({ role: "assistant", content: msg.content });
    if (msg.stop_reason === "pause_turn") continue;
    if (msg.stop_reason === "refusal") {
      refused = true;
      break;
    }
    const calls = (msg.content as any[]).filter((b) => b.type === "tool_use");
    if (!calls.length) {
      summaryHe = textOf(msg);
      break;
    }
    const results: any[] = [];
    for (const call of calls) {
      if (!allowed.has(call.name)) {
        rejectedTools.push(call.name);
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "הכלי הזה לא זמין כאן ולא נרשם." });
        continue;
      }
      try {
        const raw = toolCallToOps(call.name, call.input, working, { allowedUrls: new Set(seenUrls.keys()) });
        const resolved: any[] = resolveWithMap(raw, tempMap, makeId);
        if (ops.length + resolved.length > MAX_OPS) throw new Error("יותר מדי שינויים בהצעה אחת");
        const v = validateOps(working, resolved, { maxOps: MAX_OPS });
        if (!v.ok) throw new Error(v.errors.slice(0, 3).join("; "));
        const described = resolved.map((op) => describeOp(op, working));
        working = { pub: v.docs.pub, priv: v.docs.priv };
        ops.push(...resolved);
        lines.push(...described);
        const ids = Object.entries(tempMap).map(([t, real]) => `${t}=${real}`).join(", ");
        results.push({ type: "tool_result", tool_use_id: call.id, content: `נרשם בהצעה: ${described.join(" | ")}${ids ? ` (מזהים: ${ids})` : ""}` });
      } catch (err: any) {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: String(err?.message || err).slice(0, 500) });
      }
    }
    messages.push({ role: "user", content: results });
  }

  // Sources the model cited or used on new rows (only URLs that really came from its searches).
  const used = new Set<string>();
  for (const op of ops) for (const s of op.v?.sources || op.set?.sources || []) used.add(s.url);
  const sources = [...new Set([...citedUrls.keys(), ...used])].filter((u) => seenUrls.has(u) || citedUrls.has(u)).slice(0, 10)
    .map((url) => ({ url, title: String(citedUrls.get(url) || seenUrls.get(url) || url).slice(0, 120) }));
  return { ops, lines, summaryHe, sources, usage, rejectedTools, refused, working };
}

/** Store a proposal for review. Returns what the approval screen needs. */
export async function saveProposal(caller: Caller, mode: Mode, input: string, docs: Docs, result: ProposalResult, extra: Record<string, unknown> = {}) {
  const before = computeTrip(docs.pub, { skipOptions: true }).total.ils.typ;
  const after = computeTrip(result.working.pub, { skipOptions: true }).total.ils.typ;
  const ref = db.collection(paths.proposals).doc();
  const summaryHe = result.refused
    ? "ה-AI לא יכול לעזור בבקשה הזו."
    : result.summaryHe || (result.ops.length ? "הנה ההצעה." : "לא נמצא מה לשנות.");
  const doc = {
    status: result.ops.length ? "open" : "empty",
    mode,
    input: input.slice(0, 2000),
    createdAt: new Date().toISOString(),
    createdBy: { uid: caller.uid, label: caller.label },
    ops: result.ops,
    lines: result.lines,
    summaryHe: summaryHe.slice(0, 1500),
    sources: result.sources,
    deltaIlsTyp: Math.round(after - before),
    totalAfterIls: Math.round(after),
    baseVersion: docs.pub.version || 0,
    costUsd: Math.round(result.usage.costUsd * 10000) / 10000,
    models: result.usage.models,
    rejectedTools: result.rejectedTools,
    createdAtTs: FieldValue.serverTimestamp(),
    ...extra,
  };
  await ref.set(doc);
  return {
    proposalId: ref.id, status: doc.status, lines: doc.lines, summaryHe: doc.summaryHe, sources: doc.sources,
    deltaIlsTyp: doc.deltaIlsTyp, totalAfterIls: doc.totalAfterIls, costUsd: doc.costUsd,
  };
}

export function requireText(x: unknown, max: number, emptyMsg: string): string {
  const s = typeof x === "string" ? x.trim() : "";
  if (!s) throw new HttpsError("invalid-argument", emptyMsg, { messageHe: emptyMsg });
  return s.slice(0, max);
}
