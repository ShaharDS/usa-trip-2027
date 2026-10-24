// Tickets and confirmations. The browser uploads the file to Storage (rules: editors only), then calls
// addDocument. The file is read by Claude in a step WITHOUT tools (structured JSON only), and those facts —
// never the raw document — feed the proposal step, which suggests: mark the row booked, real price,
// deadlines, private booking code, flight segments. An editor approves as usual.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import { db, paths, REGION, TRIP_ID } from "./lib/admin.js";
import { requireRole } from "./lib/access.js";
import { badRequest, readDocs } from "./lib/state.js";
import { aiSettingsOf, reserve, settle } from "./lib/caps.js";
import { ANTHROPIC_API_KEY, addUsage, createMessage, emptyUsage, textOf, toHttpsError } from "./lib/claude.js";
import { EXTRACT_SYSTEM } from "./lib/prompts.js";
import { runProposal, saveProposal } from "./lib/propose.js";

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const FILE_RE = /^[A-Za-z0-9._-]{1,100}$/;
const nul = (type: string | string[]) => ({ type: Array.isArray(type) ? [...type, "null"] : [type, "null"] });

const FACTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "vendor", "summary", "confirmation", "currency", "totalPaid", "travelers", "startDate", "endDate", "freeCancelUntil", "finalPaymentDate", "segments", "notes"],
  properties: {
    kind: { type: "string", enum: ["flight", "hotel", "car", "cruise", "parks", "insurance", "other"] },
    vendor: nul("string"),
    summary: { type: "string", description: "One short Hebrew line describing the booking" },
    confirmation: nul("string"),
    currency: { type: ["string", "null"], enum: ["USD", "ILS", "EUR", null] },
    totalPaid: nul("number"),
    travelers: nul("integer"),
    startDate: nul("string"),
    endDate: nul("string"),
    freeCancelUntil: nul("string"),
    finalPaymentDate: nul("string"),
    segments: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["carrier", "number", "date", "from", "to", "depart", "arrive"],
        properties: { carrier: nul("string"), number: nul("string"), date: nul("string"), from: nul("string"), to: nul("string"), depart: nul("string"), arrive: nul("string") },
      },
    },
    notes: nul("string"),
  },
};

export const addDocument = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: "1GiB" }, async (req) => {
  const caller = await requireRole(req, "editor");
  const docId = String(req.data?.docId || "");
  const fileName = String(req.data?.fileName || "");
  const title = String(req.data?.title || "").trim().slice(0, 80) || fileName;
  const extract = req.data?.extract !== false;
  if (!ID_RE.test(docId) || !FILE_RE.test(fileName)) badRequest("שם הקובץ לא תקין.");

  const file = getStorage().bucket().file(`trips/${TRIP_ID}/docs/${docId}/${fileName}`);
  const [exists] = await file.exists();
  if (!exists) badRequest("הקובץ לא הועלה. נסו שוב.");
  const [meta] = await file.getMetadata();
  const contentType = String(meta.contentType || "");
  const size = Number(meta.size || 0);
  const docRef = db.collection(paths.documents).doc(docId);
  const record: Record<string, unknown> = {
    title, fileName, contentType, size, uploadedBy: caller.label, uploadedAt: new Date().toISOString(), path: file.name,
  };
  if (!extract) {
    await docRef.set(record);
    return { docId, extracted: false };
  }

  const docs = await readDocs();
  const settings = aiSettingsOf(docs.priv);
  const res = await reserve(caller, "extract", 0.5, settings);
  const usage = emptyUsage();
  try {
    const [buf] = await file.download();
    const data = buf.toString("base64");
    const block = contentType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: contentType, data } };
    // Step 1: read the file. No tools, structured output only.
    const msg = await createMessage({
      model: settings.model, max_tokens: 8000, thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: FACTS_SCHEMA } },
      system: EXTRACT_SYSTEM,
      messages: [{ role: "user", content: [block, { type: "text", text: "חלצו את פרטי ההזמנה מהמסמך." }] }],
    } as any);
    addUsage(usage, msg);
    let facts: any;
    try {
      facts = JSON.parse(textOf(msg));
    } catch {
      throw new HttpsError("internal", "לא הצלחנו לקרוא את המסמך.", { messageHe: "לא הצלחנו לקרוא את המסמך." });
    }
    record.facts = facts;
    record.kind = facts.kind;

    // Step 2: propose changes from the extracted facts (still treated as untrusted data).
    const userText = `הועלה מסמך "${title}" (מזהה ${docId}). אלה הפרטים שחולצו ממנו:\n<untrusted_document>\n${JSON.stringify(facts)}\n</untrusted_document>\nמצאו את שורת העלות המתאימה ועדכנו אותה: סטטוס (booked / paid), הסכום ששולם בפועל, מועדי ביטול/תשלום, קוד ההזמנה בפרטים הפרטיים, ורשמו טיסות אם יש. אם אין שורה מתאימה — הוסיפו אחת.`;
    const result = await runProposal(docs, "extraction", userText, settings.model);
    result.usage.costUsd += usage.costUsd;
    // Link the document to the rows the proposal touches (private document list on each row).
    const touched = [...new Set(result.ops.filter((o: any) => o.e === "items").map((o: any) => o.id))];
    for (const itemId of touched) {
      const cur = result.working.priv?.items?.[itemId];
      const ids = [...new Set([...(cur?.documentIds || []), docId])];
      const op = cur
        ? { t: "update", e: "privateItems", id: itemId, set: { documentIds: ids }, before: { documentIds: cur.documentIds ?? null } }
        : { t: "create", e: "privateItems", id: itemId, v: { documentIds: ids } };
      result.ops.push(op);
      result.lines.push(`המסמך "${title}" צורף לשורה`);
      result.working = {
        pub: result.working.pub,
        priv: { ...result.working.priv, items: { ...(result.working.priv?.items || {}), [itemId]: { ...(cur || {}), documentIds: ids } } },
      };
    }
    const saved = await saveProposal(caller, "extraction", title, docs, result, { docId });
    record.proposalId = saved.proposalId;
    await docRef.set(record);
    return { docId, extracted: true, facts, ...saved };
  } catch (err) {
    await docRef.set(record, { merge: true }); // keep the file listed even if reading it failed
    throw toHttpsError(err);
  } finally {
    await settle(res, usage.costUsd);
  }
});
