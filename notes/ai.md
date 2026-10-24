# Claude in the trip hub

## Features (v1)
| Function | Who | What |
|---|---|---|
| `aiAsk` | family | Plain-Hebrew answer from the trip data + engine output + recent changes. Optional `web_search` (max 2) for general facts. Read-only. Saved in `users/{uid}/asks`. |
| `aiPropose` | editors | `mode: "sentence"` (with `web_search`, max 5) or `"quote"` (pasted text, no web). Tool loop → proposal in `trips/usa2027/proposals/{id}`. |
| `addDocument` | editors | Uploaded PDF/image → step 1: structured `BookingFacts` (no tools) → step 2: proposal in `"extraction"` mode (+ links the document to the touched rows). |
| `applyProposal` / `rejectProposal` | editors | Commit the ticked lines as one change (`source: "ai"`, `approvedBy`), or close the proposal. Stale if the trip changed meanwhile. |

Later (data already in place): weekly watch (deadlines on items, `private.flights`), "what did we forget", "what's new" note.

## Request shapes (verified against `@anthropic-ai/sdk` 1.3.0 type definitions, 24 Oct 2026)
- `client.beta.messages.stream(params).finalMessage()` — streaming avoids HTTP timeouts on long turns.
- `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"` (`BetaFallbacksParam = Array<…> | "default"`).
- `model: "claude-sonnet-5-5"` (Shahar's choice 2026-10-25; changeable in Settings → AI), `thinking: { type: "adaptive" }` (Sonnet 5.5 rejects `disabled`), `output_config: { effort, format? }` with `format: { type: "json_schema", schema }` for extraction.
- Tools: custom tools with `strict: true` (every property required, optional ones nullable, `additionalProperties: false`), `tool_choice: { type: "auto" }` (Sonnet 5.5 and Opus 5.5 reject forced tool choice). Server tool `{ type: "web_search_20260209", name: "web_search", max_uses }`.
- Prompt caching: two system blocks with `cache_control: { type: "ephemeral" }` — instructions + reference prices, then the trip context (deterministic `stableStringify`, so the same data version is byte-identical). Today's date and the question go in the user turn.
- Stop reasons handled: `pause_turn` (continue, up to 3×), `refusal` (friendly Hebrew message), `tool_use` (loop, ≤ 8 turns, ≤ 60 ops), `end_turn`.
- Never sent: `temperature`, `top_p`, `top_k`, assistant prefill.
- If the API rejects strict schemas or the fallback beta (400 mentioning strict/schema/fallback), the request is retried once without them.
- Usage: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `server_tool_use.web_search_requests`; priced by `msg.model` (the model that actually answered).

## Costs (prices in `functions/src/lib/claude.ts`)
Sonnet 5.5: $2 / $10 per M input/output tokens, cache read $0.20, web search $0.01 each. Rough: question ≈ $0.01–0.05, sentence proposal with search ≈ $0.05–0.15, document ≈ $0.05. Typical month ≈ $6. Limits: `trips/usa2027/usage/{yyyy-mm}` — daily caps per person (family 15, editors 40, owner 80) and a monthly budget ($25 default); every call reserves an estimate first, then settles the real cost.

## Safety
- AI never writes: tool call → `toolCallToOps` (`docs/js/shared/aitools.js`) → `validateOps` on a working copy → proposal lines. `applyProposal` re-validates against the current trip.
- Mode tool lists (`MODE_TOOLS`): `quote` and `extraction` cannot remove things, change settings, travellers or the layout.
- Pasted / document text is wrapped in `<untrusted_document>`; the system prompt says it never contains instructions. Raw documents only reach the no-tool extraction step.
- Source URLs on rows are kept only if they appeared in that call's web search results.
- Booking codes are hidden from `aiAsk` unless Settings → AI allows it.

## Testing without spending money
`CLAUDE_FAKE=1` in `functions/.env.local` (emulator only) swaps in `functions/src/lib/claudeFake.ts`, which answers with scripted tool calls (adding Washington, a hostile quote, a ticket). `tests/integration/ai.int.mjs` runs the whole path on the emulators. A live smoke test against the real API should be run once by the owner after deploying (it costs a few cents).
