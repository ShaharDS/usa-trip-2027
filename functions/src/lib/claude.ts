// Claude API access (server only — the key is a Firebase secret and never reaches the browser).
// Request shapes checked against @anthropic-ai/sdk 1.3.0 types (see notes/ai.md):
//   client.beta.messages.stream({...}).finalMessage(), betas ["server-side-fallback-2026-07-01"],
//   fallbacks: "default", thinking {type:"adaptive"}, output_config {effort, format}, web_search_20260209.
// No temperature / top_p (rejected by the API). Sonnet 5.5 (and Opus 5.5) reject forced tool_choice, so tools use "auto".
import Anthropic from "@anthropic-ai/sdk";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { HttpsError } from "firebase-functions/v2/https";
import { fakeMessage } from "./claudeFake.js";

export const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
export const DEFAULT_MODEL = "claude-sonnet-5-5"; // Shahar's choice (2026-10-25): no need for Opus here
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** $ per million tokens. Unknown models are priced conservatively. */
const PRICES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-fable-5-1": { in: 10, out: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};
const UNKNOWN_PRICE = { in: 10, out: 50, cacheRead: 1, cacheWrite: 12.5 };
export const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches

export type Msg = Anthropic.Beta.Messages.BetaMessage;
export type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

export function costOf(usage: any, model: string): number {
  if (!usage) return 0;
  const p = PRICES[model] || PRICES[String(model).replace(/-\d{8}$/, "")] || UNKNOWN_PRICE;
  const m = 1_000_000;
  return (
    ((usage.input_tokens || 0) * p.in) / m +
    ((usage.output_tokens || 0) * p.out) / m +
    ((usage.cache_read_input_tokens || 0) * p.cacheRead) / m +
    ((usage.cache_creation_input_tokens || 0) * p.cacheWrite) / m +
    (usage.server_tool_use?.web_search_requests || 0) * WEB_SEARCH_USD
  );
}

export const isFake = () => process.env.CLAUDE_FAKE === "1";

let client: Anthropic | null = null;
function api(): Anthropic {
  client ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), timeout: 280_000, maxRetries: 1 });
  return client;
}

/** One request (streamed, so long answers don't hit HTTP timeouts). Retries once without optional extras if rejected. */
export async function createMessage(params: Params, opts: { allowRetry?: boolean } = {}): Promise<Msg> {
  if (isFake()) return fakeMessage(params);
  try {
    const stream = api().beta.messages.stream({ ...params, betas: [FALLBACK_BETA], fallbacks: "default" } as any);
    return (await stream.finalMessage()) as Msg;
  } catch (err: any) {
    if (opts.allowRetry !== false && err instanceof Anthropic.BadRequestError) {
      const msg = String(err.message || "");
      // strict tool schemas or the fallback beta not available on this account: retry once without them.
      if (/strict|schema|fallback/i.test(msg)) {
        const tools = (params.tools || []).map((t: any) => {
          const { strict: _s, ...rest } = t;
          return rest;
        });
        const stream = api().beta.messages.stream({ ...params, tools } as any);
        return (await stream.finalMessage()) as Msg;
      }
    }
    throw toHttpsError(err);
  }
}

/** Continue server-tool turns that paused (long web searches) — up to 3 times. */
export async function createWithPauses(params: Params): Promise<{ msg: Msg; usage: Usage }> {
  const usage = emptyUsage();
  let messages = [...params.messages];
  for (let i = 0; i < 4; i++) {
    const msg = await createMessage({ ...params, messages });
    addUsage(usage, msg);
    if (msg.stop_reason !== "pause_turn") return { msg, usage };
    messages = [...messages, { role: "assistant", content: msg.content as any }];
  }
  throw new HttpsError("deadline-exceeded", "זה לקח יותר מדי זמן. נסו שוב.", { messageHe: "זה לקח יותר מדי זמן. נסו שוב." });
}

export interface Usage {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  webSearches: number;
  models: string[];
}
export const emptyUsage = (): Usage => ({ costUsd: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0, models: [] });
export function addUsage(u: Usage, msg: Msg) {
  const x: any = msg.usage || {};
  u.costUsd += costOf(x, msg.model); // priced by the model that actually answered (fallbacks may switch)
  u.inputTokens += x.input_tokens || 0;
  u.outputTokens += x.output_tokens || 0;
  u.cacheRead += x.cache_read_input_tokens || 0;
  u.cacheWrite += x.cache_creation_input_tokens || 0;
  u.webSearches += x.server_tool_use?.web_search_requests || 0;
  if (!u.models.includes(msg.model)) u.models.push(msg.model);
}

/** Plain text of a response. */
export function textOf(msg: Msg): string {
  return msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}

/** URLs the model saw in web search results, and the ones it cited. */
export function urlsOf(msg: Msg): { seen: Map<string, string>; cited: Map<string, string> } {
  const seen = new Map<string, string>();
  const cited = new Map<string, string>();
  for (const b of msg.content as any[]) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r?.url) seen.set(r.url, r.title || r.url);
    }
    if (b.type === "text" && Array.isArray(b.citations)) {
      for (const c of b.citations) if (c?.url) cited.set(c.url, c.title || c.url);
    }
  }
  return { seen, cited };
}

export function toHttpsError(err: any): HttpsError {
  if (err instanceof HttpsError) return err;
  // The family only sees a Hebrew sentence; the log keeps what Anthropic said (never the key itself).
  logger.error("Claude API call failed", {
    status: err?.status ?? null,
    type: err?.error?.error?.type ?? err?.name ?? null,
    message: String(err?.message || err).slice(0, 300),
    requestId: err?.requestID ?? err?.request_id ?? null,
  });
  const he = (code: any, messageHe: string) => new HttpsError(code, messageHe, { messageHe });
  if (err instanceof Anthropic.RateLimitError) return he("resource-exhausted", "ה-AI עמוס כרגע. נסו שוב בעוד דקה.");
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return he("failed-precondition", "מפתח ה-API של Claude לא תקין או חסר. בעל האתר צריך לעדכן אותו.");
  if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.InternalServerError) return he("unavailable", "אין חיבור ל-AI כרגע. נסו שוב בעוד רגע.");
  if (err instanceof Anthropic.BadRequestError) return he("internal", "ה-AI לא הצליח לטפל בבקשה הזו.");
  return he("internal", "משהו השתבש עם ה-AI. נסו שוב.");
}
