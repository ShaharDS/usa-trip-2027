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
import { locate, wikiPhoto } from "./geo.js";
import { findMapsUrl } from "../shared/geo.js";
import type { Caller } from "./access.js";
import type { Docs } from "./state.js";

export type Mode = "sentence" | "quote" | "extraction" | "expense" | "place";
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
  if (mode === "sentence" || mode === "place") tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 5, user_location: { type: "approximate", country: "US" } });
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
        // Places: the server finds the map location (and a photo) — the model never gives coordinates.
        const place = call.name === "add_place" || call.name === "update_place" ? await enrichPlace(call.input, userText, working) : null;
        const raw = toolCallToOps(call.name, place ? place.input : call.input, working, { allowedUrls: new Set(seenUrls.keys()) });
        const resolved: any[] = resolveWithMap(raw, tempMap, makeId);
        if (ops.length + resolved.length > MAX_OPS) throw new Error("יותר מדי שינויים בהצעה אחת");
        const v = validateOps(working, resolved, { maxOps: MAX_OPS });
        if (!v.ok) throw new Error(v.errors.slice(0, 3).join("; "));
        const described = resolved.map((op) => describeOp(op, working));
        working = { plan: v.docs.plan, priv: v.docs.priv };
        ops.push(...resolved);
        lines.push(...described);
        const ids = Object.entries(tempMap).map(([t, real]) => `${t}=${real}`).join(", ");
        results.push({ type: "tool_result", tool_use_id: call.id, content: `נרשם בהצעה: ${described.join(" | ")}${ids ? ` (מזהים: ${ids})` : ""}${place ? ` — ${place.note}` : ""}` });
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

/** add_place / update_place input + what the server found: _lat/_lng, _region, _maps_url, _photo. */
async function enrichPlace(input: any, userText: string, docs: Docs): Promise<{ input: any; note: string }> {
  const rec = input.place_id ? docs.plan.places?.[input.place_id] : null;
  const out = { ...input };
  const moves = !rec || input.maps_url || input.address;
  if (moves) {
    const merged = { ...input, label: input.label ?? rec?.label, city: input.city ?? rec?.city, region: input.region ?? rec?.region, address: input.address ?? rec?.address };
    const pos = await locate(merged, userText);
    if (pos) {
      out._lat = pos.lat;
      out._lng = pos.lng;
      if (pos.region) out._region = pos.region;
      if (pos.mapsUrl) out._maps_url = pos.mapsUrl;
    } else if (input.maps_url && findMapsUrl(input.maps_url)) {
      out._maps_url = findMapsUrl(input.maps_url);
    }
    out.__found = pos ? (pos.source === "link" ? "המיקום נמצא מהקישור" : "המיקום נמצא לפי הכתובת") : "";
  }
  const kind = input.kind || rec?.kind;
  if (input.wikipedia_title && ["sight", "park", "stop", "other"].includes(kind) && !rec?.photo) {
    const photo = await wikiPhoto(input.wikipedia_title);
    if (photo) out._photo = photo;
  }
  const note = !moves ? "" : out.__found || "לא נמצא מיקום מדויק במפה: המקום יישמר בלי סיכה, ו-Waze / Google Maps ינווטו לפי הכתובת";
  delete out.__found;
  return { input: out, note };
}

/** The places a proposal adds or changes, as the approval card shows them (name, address, map pin). */
function placesOf(result: ProposalResult) {
  const ids = [...new Set(result.ops.filter((o: any) => o.e === "places" && (o.t === "create" || o.t === "update")).map((o: any) => o.id))];
  return ids.map((id) => ({ id, ...(result.working.plan.places?.[id] || {}) }))
    .filter((p: any) => p.label)
    .map((p: any) => Object.fromEntries(["id", "label", "kind", "date", "checkIn", "checkOut", "time", "address", "city", "region", "lat", "lng", "mapsUrl"]
      .filter((k) => p[k] !== undefined && p[k] !== null).map((k) => [k, p[k]])))
    .slice(0, 20);
}

/** Store a proposal for review. Returns what the approval screen needs. */
export async function saveProposal(caller: Caller, mode: Mode, input: string, docs: Docs, result: ProposalResult, extra: Record<string, unknown> = {}) {
  const before = computeTrip(docs.plan, { skipOptions: true }).total.ils.typ;
  const after = computeTrip(result.working.plan, { skipOptions: true }).total.ils.typ;
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
    baseVersion: docs.plan.version || 0,
    costUsd: Math.round(result.usage.costUsd * 10000) / 10000,
    models: result.usage.models,
    rejectedTools: result.rejectedTools,
    places: placesOf(result),
    createdAtTs: FieldValue.serverTimestamp(),
    ...extra,
  };
  await ref.set(doc);
  return {
    proposalId: ref.id, status: doc.status, lines: doc.lines, summaryHe: doc.summaryHe, sources: doc.sources,
    deltaIlsTyp: doc.deltaIlsTyp, totalAfterIls: doc.totalAfterIls, costUsd: doc.costUsd, places: doc.places,
  };
}

export function requireText(x: unknown, max: number, emptyMsg: string): string {
  const s = typeof x === "string" ? x.trim() : "";
  if (!s) throw new HttpsError("invalid-argument", emptyMsg, { messageHe: emptyMsg });
  return s.slice(0, max);
}
