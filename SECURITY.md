# Security notes

- **No secrets in this repository.** The Firebase web config in `docs/js/config.js` is public by design. The Claude API key is a Firebase secret (`firebase functions:secrets:set ANTHROPIC_API_KEY`); `OWNER_EMAIL` lives in `functions/.env` (gitignored).
- **Public vs private.** Anyone with the link can read `trips/usa2027/public/state` (costs, route, layout). Booking codes, private notes, flight segments and uploaded documents are in `private/state` / Storage, readable only by Google accounts on the family list (`config/access`, managed by the owner through `setAccess`).
- **No browser writes to trip data.** Every change goes through `commitChange` / `applyProposal`, which re-check the caller's role, validate the change against the schema, detect conflicting edits and record history with an exact undo.
- **AI only proposes.** Claude's tool calls are converted to the same validated operations as manual edits, stored as a proposal, and applied only when an editor approves. Pasted text and uploaded documents are wrapped as untrusted data; documents are read in a step with no tools; quote/document modes cannot remove rows, change settings or the layout; source links must come from the model's own search results.
- **Spending limits.** Daily per-person caps and a monthly budget (Settings → AI), plus a spend limit on the API key's workspace in the Anthropic Console and a Google Cloud budget alert.
- The public page reveals the trip dates. It is `noindex`; share the link only with family.

Report problems to the owner (Shahar).
