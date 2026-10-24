# USA Trip 2027 hub — HANDOFF

_Written 2026-10-25, end of the build session. Read `CLAUDE.md` for the rules and the file map; this file is the
**state of play, what was verified, and what is left**._

## 1. Goal (from Shahar)
- One place for the family's USA trip costs, easy for his non-technical father: "how much will it cost, and what is booked?".
- Everything dynamic — he decides the prices, adds categories / cities by typing to the AI; the UI follows the data.
- High-level rows only. Tickets / confirmations stored privately; AI that answers questions and can change things (with approval).
- His answers: open link for viewers; family signs in once for documents + AI; email alerts later; one family total;
  editors = allowlist he supplies; Firebase owner = his Firebase Google account (see `functions/.env`); holidays don't constrain the cruise.

## 2. Where things are
- Code: `C:\Users\Shahar\Desktop\Claude\Claude Code\USA Trip 2027\` — git repo, one commit "USA trip 2027 hub v1" (see `git log`) (not pushed; pending files folded in so no personal email is in the history).


- Local-only (gitignored): `functions/.env` (`OWNER_EMAIL=` the owner's Google account), `functions/.env.local` +
  `functions/.secret.local` (emulator: fake owner, `CLAUDE_FAKE=1`), `.firebaserc` (default project), `.claude/launch.json`.
- Memory note: `usa-trip-2027-hub` (auto-loaded). Root index: `Claude Code\README.md` lists this project.

## 3. Firebase project (checked read-only 2026-10-25 with the Firebase CLI, logged in as the owner)
| Thing | State |
|---|---|
| Project | **`usa-trip-2027-shahar`** ("USA Trip 2027"), number 768226421972 |
| Web app | `trip-site` — config already in `docs/js/config.js` |
| Firestore | `(default)` exists, Native, location **eur3** (plan said me-west1 — fine, can't be changed) |
| Functions | **all 11 deployed 2026-10-25** (Node 24, me-west1). First deploy hit Google's first-time races; aiAsk/aiPropose had to be deleted + recreated to get the `allUsers` invoker binding (now `invoker: "public"` in code). Artifact cleanup policy (1 day) already existed. Smoke test: whoami 200, all others 401 without sign-in. |
| Firestore rules | **NOT deployed yet** — the older site's rules are still live. Our rules now include its `overrides` block, but its editors come from `config/access`, which doesn't exist until the owner signs in once (whoami bootstraps him) and adds his second Google account in Settings → גישה. (Claude was blocked from writing the access list itself — a permission grant is the owner's action.) |
| Auth authorized domains | `usa-trip-2027-shahar.firebaseapp.com`, `.web.app`, `shahards.github.io` — **no `localhost`**, so signing in from the local server needs localhost added (or sign in on the published site). |
| Billing | **Blaze since 2026-10-25** — linked (with Shahar's OK) to the same billing account as PalGate: `billingAccounts/010B1C-5DC32F-DFB4BC` "Firebase Payment" (ILS). Budget alert "USA Trip 2027 — alert at 3 ILS" (≈ $1, 50% / 100%, this project only). Shahar wants it free: family usage stays in the free quotas; Claude API is billed separately by Anthropic. |
| Google sign-in | enabled; authorized domains include `shahards.github.io` (checked 2026-10-25) |
| Storage bucket | **none yet** (no GCS buckets) — Storage → Get started still needed |
| Claude secret | `ANTHROPIC_API_KEY` version 1 set 2026-10-25 (by Shahar in the Cloud console — `firebase` in PowerShell is blocked by the execution policy; use `firebase.cmd`) |

### ⚠️ An OLDER trip site already uses this project and the GitHub repo
- GitHub `ShaharDS/usa-trip-2027` (11 commits, 22–24 Oct 2026) = a single 1.3 MB `index.html` + `.nojekyll`, **live at
  `https://shahards.github.io/usa-trip-2027/`** ("טיול משפחתי לארה״ב – ספט׳–אוק׳ 2027"): routes A–F, tiers, flight options.
- It stores live price edits in Firestore **`overrides/{key}`** (`{v, by, at}`) — 14 docs, edited by Shahar (e.g. `flight.rt.A–F`,
  `sec.B.A.econ.*`). Its rules (deployed 2026-10-22) allow public read + edits by his two Google accounts; everything else denied.
- Our `firestore.rules` doesn't include `overrides` → **deploying our rules as they are would break the old site's editing.**
  Pushing our repo to `main` would replace the old site. Nothing has been deployed or pushed — waiting for Shahar's choice:
  replace the old site (same URL) or keep both (rules merged; new site at another path/repo).
- Local repo: remote `origin` added and fetched (`origin/main` = the old site); local branch is `master` (one commit, v1).

## 4. What is DONE (v1 = milestones M0–M5 of the plan)
- **Viewer** (public, no login): home built from `sections` — hero total (₪ big, $ line, range, per person, % closed),
  "what changed since your last visit", certainty bar, categories with printed bars, option cards with deltas and
  "nights don't fit" warnings, timeline with holiday markers, footer (planning rate + today's rate via frankfurter.dev,
  not-included list). Category pages with "how it's calculated" lines and sources. Route page with deadlines, checklist,
  holidays. Print page. WhatsApp share (fixed text, never the total). OG image `docs/assets/og.jpg`.
- **Engine**: rule factors (people preset / units / nights or days of stops / count), price tables keyed by two option
  groups (cruise), anchors + fill stops, actual amounts for booked/paid, buffer + card-fee %, option deltas, warnings.
  Seed typical total ≈ $53,206 ≈ ₪165,470 at 3.11.
- **Editor**: inline edit forms with live preview (row, category, stop/city incl. "count it in which rows" + optional hotel
  row, home section, option, option question), duplicate / reorder / archive, settings tabs (general, travellers + presets,
  units, checklist, holidays, access, AI limits, backup/import), history with undo, "view as everyone" toggle.
- **Backend**: `commitChange`/`undoChange` (transaction, ordered conflict check, history), `whoami` (role from OWNER_EMAIL +
  `config/access`, bootstraps owner into editors), `getAccess`/`setAccess`, `adminImport` (backup of previous docs),
  `aiAsk`, `aiPropose` (sentence with web search / quote), `applyProposal`/`rejectProposal` (stale detection),
  `addDocument` (Storage file → structured facts with no tools → extraction proposal + document link). Caps: daily per person
  + monthly budget with reserve/settle. Firestore + Storage rules.
- **Docs**: README (Hebrew + English, setup steps), SECURITY.md, notes/ai.md, notes/data-model.md, notes/runbook.md, CI workflow.

## 5. Verified
- `npm test` 43/43 · functions build smoke 1/1 · rules 9/9 · emulator end-to-end 8/8 (`npm run test:all`; the
  integration step can flake once right after the rules run — rerun).
- Browser pane, demo mode + emulators (`?emu=1`): owner import → editor edit through the form (booking code stays private,
  public REST has the new price) → AI sentence proposal approved through the UI (Washington added, Orlando 7 → 5 nights) →
  family sign-in (no edit tools, AI answer) → ticket upload → proposal approved (flight booked $11,900, code private,
  flight recorded, document attached, file reopened via getBlob).
- `docs/js/dev/audit.js` passes on all viewer, family and editor routes at 320 / 375 / 1280 px.
- Against the REAL project before deploy: site loads, falls back to the opening data with the "not loaded yet" note.
- **Not verified:** a real Claude API call (only the scripted fake), real phones, deployed rules/functions.

## 6. Next steps
**Shahar (only he can):**
1. ~~Blaze + budget alert~~ — done 2026-10-25 (linked to PalGate's billing account, ₪3 alert).
2. Authentication → Get started → Sign-in method → **Google** → Enable. Settings → Authorized domains → add `shahards.github.io`.
3. Storage → Get started → production mode → a US location (e.g. us-central1) if offered.
4. Terminal: `firebase functions:secrets:set ANTHROPIC_API_KEY --project usa-trip-2027-shahar` and paste the key; in the
   Anthropic Console set a spend limit for that key's workspace.
5. github.com → new **public** repository `usa-trip-2027` (account ShaharDS), empty (no README).

**Claude, after he says done (each outward step with his OK):**
6. Commit the pending files. `firebase deploy` (rules + functions, Node 24). Then `firebase functions:artifacts:setpolicy`.
7. Add the GitHub remote, push `main`; Shahar enables Settings → Pages → `main` / `/docs`.
8. Shahar opens `https://shahards.github.io/usa-trip-2027/`, signs in, Settings → Backup → "טען נתוני פתיחה",
   Settings → גישה → adds his father, family and editors. One live AI question + one sentence proposal (a few cents).
9. Real-phone checklist (README): iPhone via WhatsApp → Safari, Android Chrome, keyboard dictation, Hebrew read-aloud,
   in-app-browser banner.

## 7. Open questions / known limits
- Cruise quotes: taxes/port fees included? price for guests 3–4 and the baby? cabin layout (seed assumes everyone × quote)?
  Wonder's 2027 home port (research says Miami → different transfer)?
- Firestore is in eur3 while functions run in me-west1 (≈ a few tens of ms per call — acceptable).
- "What's new" is remembered per browser (localStorage), not per account (`users/{uid}.lastSeenVersion` rules exist, unused).
- Hero photo from the plan was skipped (licensing; not needed).
- Later stage (data already in place): weekly watch (deadlines on items, `private.flights`, FlightAware AeroAPI), email via
  Trigger Email + Gmail app password, "what did we forget" audit, "what's new" home note, holiday helper, trip-time
  receipts / photo translate, forwarding inbox.
- Separate session started 2026-10-25: move PalGate's functions off Node 20 (its own project, `PalGate/`).
