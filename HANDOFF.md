# USA Trip 2027 hub — HANDOFF

_Written 2026-10-25, end of the build session; updated 2026-10-25 (second session: three access levels + the two live bugs).
Read `CLAUDE.md` for the rules and the file map; this file is the **state of play, what was verified, and what is left**._

## 0. Round 3 (2026-10-25, third session) — built + tested locally, NOT deployed, NOT committed
Plan: `~/.claude/plans/see-that-usa-trip-spicy-tide.md`. Shahar's asks and what was built:
- **Documents upload was broken** → cause: **Firebase Storage was never set up** on the project (`deploy --only storage
  --dry-run`: "has not been set up"; `addDocument` never called). Code: Hebrew errors per step (`fb/storage.js`
  `storageErrorHe`), file choice survives re-renders. Still needed (see go-live). The dry-run turned on the free
  `firebasestorage` API.
- **Expenses:** all rows removed from the opening data (categories kept empty, cruise options kept); live DB: owner button
  Settings → גיבוי → **"ריקון כל ההוצאות"** (one undoable change). "לאן הולך הכסף" is now an **accordion** (categories open in
  place); **inline add** under the rows (`edit/expensePanel.js`) — by hand or **with AI** (type / dictate → `aiPropose`
  `mode: "expense"`); inline "קטגוריה חדשה". `#/edit/expense/...` links open the inline box.
- **"בטוחים?" popup** on every removal (`confirmDialog` / `askFirst` in `components/common.js`, also `saveBar` remove).
- **Checklist rows tick** for editors (home section + route page). **Countdown** in the editors' hero to
  `settings.startDate` + optional `settings.startTime` (Israel time; Settings → כללי). "Today" is the phone's local date.
- **Day-by-day route (Wanderlog-style):** `places` + `days` entities; `shared/days.js` (`tripDays`, tonight's hotel, US
  states in travel order), `shared/links.js` (Waze / Google Maps / whole-day route, ≤3 stops per part), views/trip.js
  (home for family/public, `#/day/:date`, days grouped under state bands, overview map), Leaflet bundled
  (`docs/vendor/leaflet-1.9.4`, SRI-checked) with OSM tiles. During the trip the home opens on today.
- **Visibility (Shahar's choice):** public = days, cities, states, sight names, city-level map; **family (signed in)** =
  hotel names, addresses, Waze / Google Maps → new generated doc **`trips/usa2027/family/state`** (`familyView`), rules:
  `isFamily()`. Family route cached on the phone for offline use; removed on sign-out.
- **AI adds places:** `aiPropose` `mode: "place"` (+ `date`), tools `add_place / update_place / remove_place / set_day`;
  the server finds the location (`functions/src/lib/geo.ts`: Google Maps link incl. short links → pin; else Nominatim;
  Wikipedia photo with credit). The approval card shows the places with pins and "לבדוק ב-Google Maps".
- **Verified:** `npm test` 75/75 · functions build · rules 12/12 · emulator e2e 11/11 (new: hotel by name → family doc has
  address + location, public doc has the night without the name; expense mode). Browser (demo): owner / family / public at
  320 and 375 with `audit()` clean on home, route, day screens; inline add + confirm + checklist tick + countdown + manual
  place add (location read from a pasted long Google Maps link) + day title, all exercised.
- **Not verified:** a real Claude call in the new modes, real Nominatim / short-link expansion from the deployed function,
  real phones (Waze / Google Maps buttons opening the apps).

**To go live (each needs Shahar's OK — outward-facing):**
1. Shahar: Firebase console → Storage → **Get started** → production, location `us-east1` (or `us-central1`).
2. `firebase.cmd deploy --only functions,firestore:rules,storage --project usa-trip-2027-shahar` (say yes to letting
   Storage rules read Firestore). This also moves the functions to Claude-secret v2.
3. Shahar, Cloud Shell, once: `gcloud storage buckets update gs://usa-trip-2027-shahar.firebasestorage.app --cors-file=storage-cors.json`
   (upload the file or paste its JSON) — needed for opening documents from the site.
4. Commit + push `main` (Pages serves `/docs`). Functions first, then the site.
5. Shahar: Settings → גיבוי → "ריקון כל ההוצאות" (this write also creates `family/state`); add family in Settings → גישה;
   add hotels per day with "הוספת מקום ליום הזה" → "עם AI".

**Next (designed, not built): tickets / QR on the route (plan Phase 7).** Documents stay the editors' archive. New
"כרטיסי כניסה" (passes: museum QR, park ticket, boarding pass) uploaded from the place itself, linked via
`places.passIds`, shown on the day as a big "הצגת הכרטיס" button → full-screen viewer; family can see them (Storage
`trips/{t}/passes/…` with `isFamily()`), kept on the phone after the first open for no-reception gates.

## 0b. Previous session (2026-10-25, second) — deployed + pushed since (see "Go-live status")
**Two live bugs Shahar hit, both diagnosed:**
- *"פריט שניסיתם לשנות כבר לא קיים" when moving a home section:* the live database had **no trip data** (`public/state` 404 —
  opening data never loaded). The page fell back to the seed and let the editor edit it; the server then found nothing to
  change. Fixed: editors with no data now get a "עוד אין נתוני טיול" card with the **טען נתוני פתיחה** button (owner), and
  every write function refuses with that message (`requireTripData`) instead of "the item was deleted".
- *"מפתח ה-API של Claude לא תקין או חסר":* secret **version 1 was not a Claude key** (didn't start with `sk-ant-`; Anthropic
  401 invalid x-api-key). Shahar added **version 2** — tested from this PC: valid (models list, Sonnet 5.5, fallback beta,
  web search all 200). **The deployed AI functions are still pinned to version 1** → redeploy needed. `toHttpsError` now
  logs the real Anthropic status/type ("Claude API call failed") so the next failure is visible in the logs.

**Shahar's new access rule, implemented (this replaces the §8 ticket below):**
| Who | Sees |
|---|---|
| anyone with the link | the route only — title, dates, stops/nights, holidays, traveller count. No prices, no AI, no nav. |
| family (signed in, on the list) | the route + **Ask AI**. Still **no prices**: `aiAsk` gives them `familyContext()` (route + flight times) and a prompt that declines cost questions. |
| editors / owner | everything as before (sum, categories, options, docs, history, editing, AI proposals). |
- Sign-in moved to an **account bar at the top of every page** ("כניסה" / "מחובר/ת: X · role · יציאה").
- Data: the trip moved to `trips/usa2027/plan/state` (editors only); `public/state` is now a **generated price-free route**
  (`routeView()` in `docs/js/shared/route.js`, written by `writeDocs` on every change). `private/state`, history,
  documents (Firestore + Storage), proposals, usage → editors only. In-memory key `pub` renamed `plan` everywhere.
- **Decision I made (tell Shahar, reversible):** documents/tickets are now **editors only** — they show prices.
- WhatsApp preview text + `og.jpg` now say "המסלול המעודכן" instead of "כמה זה עולה?".
- Verified: `npm test` 47/47 (4 new route tests: no amounts can leak), functions build, rules 11/11, emulator e2e 9/9
  (incl. family AI gets no prices, public route has no price keys, route change reaches the public doc, empty-DB message);
  browser: demo public/family/owner at 375 + desktop with the audit clean; emulators: owner → load card → load → move
  section saved on the server.

**Later the same day — quick "הוספת הוצאה" (Shahar: adding an expense was too clumsy):** `#/edit/expense/new[/cat]`
(`docs/js/edit/expense.js`, ops in `expenseOps.js`, tests in `tests/expense.test.mjs`): what / category (or a new one) /
amount ₪ or $ / total or per person / status, with a live line of how the category and the total change; saves one
undoable change and returns to the dashboard with the category highlighted. Buttons: "+ הוצאה" in the edit bar, "הוספת
הוצאה" under "לאן הולך הכסף" and on each category page. Site-only change (no functions/rules).

**Go-live status:** functions + rules deployed and the restructure pushed (`1ec30ef`) on 2026-10-25; Shahar loaded the
opening data. The steps below are kept for reference.

**To go live (each needs Shahar's OK — outward-facing):**
1. `firebase.cmd deploy --only functions,firestore:rules --project usa-trip-2027-shahar` (functions pick up key v2;
   storage rules only after the bucket exists).
2. Commit + push to `main` (GitHub Pages serves `/docs`). Deploy functions/rules **first**, then push — the new site
   reads `plan/state`.
3. Shahar signs in → "טען נתוני פתיחה" (now on the home page) → Settings → גישה: add family / editors.
4. Optional: disable/destroy the bad secret version 1 (`firebase.cmd functions:secrets:destroy ANTHROPIC_API_KEY@1`).


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
| Claude secret | `ANTHROPIC_API_KEY` v1 (2026-10-25) was **not a Claude key** (401). **v2** added by Shahar the same day — valid. Deployed functions still use v1 until redeployed. (`firebase` in PowerShell is blocked by the execution policy; use `firebase.cmd`) |

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
Done 2026-10-25: Blaze + ₪3 alert · Google sign-in + `shahards.github.io` authorized · Claude secret · all 11 functions
deployed · repo pushed (`main`, old site merged with history into `docs/old/`) · Pages = `main` / `/docs` (built).

0. Done 2026-10-25 at Shahar's request: **both of his Google accounts are owners** (`OWNER_EMAIL` in `functions/.env` is a
   comma-separated list) and both are on the editors list in `config/access` (so either can load data, manage people,
   edit here and edit the old site's prices). Family list still empty.
1. Shahar signs in (either account) → Settings → גישה → adds his father / family.
2. Settings → Backup → "טען נתוני פתיחה". One live AI question + one sentence proposal (a few cents).
3. Storage → Get started (only needed for ticket uploads), then `firebase deploy --only storage`.
4. Real-phone checklist (README): iPhone via WhatsApp → Safari, Android Chrome, keyboard dictation, Hebrew read-aloud,
   in-app-browser banner.
5. **Next upgrade — see §8 (ticket from Shahar).**

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

## 8. ~~Ticket~~ DONE 2026-10-25 (see §0) — with Shahar's stricter rule: family sees no prices either. Original ticket kept for context:
**Why:** he doesn't like where sign-in sits today (a card inside the "שאלו" / "מסמכים" screens), and the open link should
show only the final route — not prices.

**What he wants**
- **Anyone with the link (no sign-in):** only the final itinerary — cities / legs with dates and nights, holidays, maybe
  the "fly home" date. **No prices, totals, categories, options or AI** for the public.
- **Signed in + on the list (family / editors):** everything else — the total and summary, prices per category and row,
  options and their deltas, adding / editing prices, history, documents, "Ask the trip" and AI proposals.
- **Sign-in in a clear, obvious place:** e.g. a "כניסה למשפחה" button in the page header / top of the route page
  (not hidden in the bottom-nav screens), and a visible "מחובר/ת בתור … · יציאה" when signed in.

**Implementation notes (for whoever picks this up)**
- Data split: today `trips/usa2027/public/state` holds prices and is readable by anyone. Move the costs out of it:
  public doc = settings (title/dates), stops, holidays, sections needed for the route view; a new family-only doc
  (e.g. `trips/usa2027/family/state`) = groups, presets, units, categories, items, options, checklist, recent, derived.
  Update `schema.js` (`doc: "family"`), `ops.js` (third doc), `commit.js`, `validate.js`, rules (family read), REST/live
  loading (family reads the cost doc after sign-in), `adminImport`, AI context, tests (unit + rules + e2e).
- The engine needs the cost doc to resolve option-driven nights (cruise sailing `stopPatch`): either store the resolved
  itinerary in the public doc on every commit (`derived.itinerary`), or keep option groups that move stops public
  without their prices.
- Viewer home = route-only layout; signed-in home = today's home. The WhatsApp preview text should stop promising costs.
- "What changed" lines on the public doc must not mention prices (regenerate public `recent` from route ops only).
- Acceptance: anonymous REST read of every public path contains no amounts; signed-in family sees today's screens; the
  audit (`docs/js/dev/audit.js`) still passes; rules tests prove anonymous can't read the cost doc.
