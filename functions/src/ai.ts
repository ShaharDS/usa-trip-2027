// The AI assistant: "Ask the trip" (family) and change proposals from a sentence or a pasted quote (editors).
import { onCall } from "firebase-functions/v2/https";
import { db, REGION } from "./lib/admin.js";
import { requireRole } from "./lib/access.js";
import { readDocs } from "./lib/state.js";
import { aiSettingsOf, reserve, settle } from "./lib/caps.js";
import { ANTHROPIC_API_KEY, createWithPauses, textOf, toHttpsError, urlsOf } from "./lib/claude.js";
import { ASK_SYSTEM, referencePrices, tripContext } from "./lib/prompts.js";
import { requireText, runProposal, saveProposal } from "./lib/propose.js";

// invoker "public": anyone may reach the endpoint; who may USE it is checked inside (requireRole). Stated
// explicitly so a redeploy always restores the binding (a half-failed first deploy can leave it missing).
const AI_OPTS = { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: "512MiB" as const, invoker: "public" as const };

export const aiAsk = onCall(AI_OPTS, async (req) => {
  const caller = await requireRole(req, "family");
  const question = requireText(req.data?.question, 1000, "מה תרצו לשאול?");
  const docs = await readDocs();
  const settings = aiSettingsOf(docs.priv);
  const res = await reserve(caller, "ask", 0.15, settings);
  let cost = 0;
  try {
    const history = (docs.pub.recent || []).map((e: any) => ({ at: e.at, by: e.byLabel, change: e.summary, totalChangeIls: e.deltaIlsTyp }));
    const today = new Date().toISOString().slice(0, 10);
    const { msg, usage } = await createWithPauses({
      model: settings.model,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: [
        { type: "text", text: `${ASK_SYSTEM}\n\n## General background research (not trip facts)\n${referencePrices()}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: tripContext(docs, { includePrivate: settings.includePrivateInAsk, history }), cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: `היום ${today}. השאלה: ${question}` }],
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
    } as any);
    cost = usage.costUsd;
    const refused = msg.stop_reason === "refusal";
    const answer = refused ? "לא אוכל לעזור בשאלה הזו. אפשר לשאול את שחר." : textOf(msg) || "לא מצאתי תשובה.";
    const { cited } = urlsOf(msg);
    const sources = [...cited.entries()].slice(0, 5).map(([url, title]) => ({ url, title: String(title).slice(0, 120) }));
    const ref = db.collection(`users/${caller.uid}/asks`).doc();
    await ref.set({ question, answer, sources, at: new Date().toISOString(), costUsd: Math.round(cost * 10000) / 10000, models: usage.models });
    return { askId: ref.id, answer, sources, cacheRead: usage.cacheRead };
  } catch (err) {
    throw toHttpsError(err);
  } finally {
    await settle(res, cost);
  }
});

export const aiPropose = onCall(AI_OPTS, async (req) => {
  const caller = await requireRole(req, "editor");
  const mode = req.data?.mode === "quote" ? "quote" : "sentence";
  const text = requireText(req.data?.text, mode === "quote" ? 12000 : 1500, mode === "quote" ? "הדביקו את הצעת המחיר." : "מה לשנות?");
  const docs = await readDocs();
  const settings = aiSettingsOf(docs.priv);
  const res = await reserve(caller, `propose-${mode}`, mode === "quote" ? 0.4 : 0.8, settings);
  let cost = 0;
  try {
    const note = typeof req.data?.note === "string" ? req.data.note.trim().slice(0, 500) : "";
    const userText = mode === "quote"
      ? `הודבקה הצעת מחיר / אישור הזמנה. עדכנו את שורות העלות המתאימות לפיה (מחיר, סטטוס "quote" או "booked", מועדים).${note ? `\nהערה מהעורך: ${note}` : ""}\n<untrusted_document>\n${text}\n</untrusted_document>`
      : `בקשה מהעורך: ${text}`;
    const result = await runProposal(docs, mode, userText, settings.model);
    cost = result.usage.costUsd;
    return await saveProposal(caller, mode, text, docs, result);
  } catch (err) {
    throw toHttpsError(err);
  } finally {
    await settle(res, cost);
  }
});
