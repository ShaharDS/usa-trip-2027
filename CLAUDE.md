# USA Trip 2027 hub — project instructions for Claude

Hebrew (RTL) family trip-cost website for an 8-person USA trip (TLV → New York → road trip → Orlando/Universal →
Royal Caribbean cruise → home, 30 Sep – 18 Oct 2027). Owner: Shahar. The main reader is his father — older, **not
technical**, opens a WhatsApp link on his phone. Static site on GitHub Pages (`docs/`, no build) + Firebase backend
(`functions/`, Firestore, Auth, Storage) + Claude API (server side only).

> Read `HANDOFF.md` first for the current state, what was verified, and the exact next steps.
> Approved plan: `~/.claude/plans/i-want-you-to-distributed-horizon.md`. Deeper notes: `notes/ai.md`, `notes/data-model.md`, `notes/runbook.md`.

## Owner decisions (don't undo these)
1. **Everything is data.** Stops/cities, categories, cost rows, prices, travellers, units, options (cruise sailings) and the
   **home-page layout** (`sections`) live in Firestore. Never hard-code trip content in views. New capability = add it to
   `docs/js/shared/schema.js` (+ engine/renderer), not a one-off in a view.
2. **High-level rows only** (flights, a hotel per city, car rental, parks, cruise, food, extras) — not souvenirs/lockers/Wi-Fi.
   Detailed research is AI background in `seed/reference-prices.md`, not rows.
3. **Three levels (Shahar, 2026-10-25):** public link = **the parts of the route only** (cities, dates, nights, holidays
   — no calendar, map, places, day screens, prices or AI) · family (one Google sign-in, "כניסה" button at the top of
   every page) = + the calendar, day by day, the map, hotels, addresses, Waze / Google Maps, files on places and Ask AI,
   **still no prices** · editors = everything: prices, edit, documents, history, approve AI proposals.
   The owner manages the email lists in-app (`setAccess`). Editors land on the cost summary (with the countdown);
   family / public land on the day-by-day route, which opens on **today** during the trip.
4. **AI only proposes.** Every Claude edit becomes a proposal (before ← after lines with checkboxes); an editor taps אשר.
   AI v1 = Ask the trip + edit-by-sentence + paste a quote + upload a ticket. Weekly watch / email alerts / forgot-audit = later.
5. Holidays do not constrain the cruise (they are timeline markers only). Shahar's 5 sailings × Utopia/Wonder quotes are the
   cruise options; default Utopia 15 Oct interior.
6. Father-friendly UI rules: body ≥ 18px, meta ≥ 15px, tap targets ≥ 48px, no hover/swipe/hamburger/dropdowns for viewers,
   labelled icons, bars with printed values (no pies), status = word + color + border style, plain Hebrew, red only for
   real alerts. `docs/js/dev/audit.js` checks this — keep it passing.

## Hard rules
1. **One write path:** the browser never writes trip data. All changes go through the `commitChange` / `applyProposal`
   Cloud Functions, which re-validate with the shared engine. Firestore rules deny browser writes.
2. **`docs/js/shared/` is shared by the browser AND the functions** (copied into `functions/src/shared/` by
   `scripts/sync-shared.mjs` on every functions build — the copy is gitignored). Pure JS, no DOM, no Firebase. After
   changing it, deploy both the site and the functions.
3. **Secrets never in the repo** (it is public for GitHub Pages): Claude key = Firebase secret `ANTHROPIC_API_KEY`;
   `OWNER_EMAIL` in `functions/.env`; emulator files `functions/.env.local` (CLAUDE_FAKE=1) and `functions/.secret.local`.
   Never type or print the real API key — the owner sets it with `firebase functions:secrets:set`.
4. **Prices never reach anyone but editors.** `plan/state` (whole trip, prices) and `private/state` (booking codes, notes,
   flights) are editors only; so are history, proposals, usage and documents (they all carry amounts). `public/state` and
   `family/state` are generated from the plan by `routeView()` / `familyView()` (`docs/js/shared/route.js`) inside
   `writeDocs` on every write — never write them any other way, and never add a field to them without checking
   `tests/route.test.mjs` (public places: no address / location / link / phone / note / photo, nameless hotels, only a
   ~10 km `near` grid). Family's `aiAsk` uses `familyContext()` (family route + flight times), never `tripContext()`.
5c. **The route = parts with real dates.** Every stop has `anchorDate` (first night) + `nights`; editors pick them on a
   calendar (`components/rangePicker.js`) that shows who owns each night; `shared/calendar.js` `assignRangeOps` trims
   overlapped parts and drops option `stopPatch`es (dates you pick win). Old data (`fill`, patches) converts on the first
   calendar save. Parts are edited inline on `#/route` (`edit/parts.js`); there is no separate stop form any more.
5b. **Coordinates never come from the model.** Places get their map location on the server (`functions/src/lib/geo.ts`:
   Google Maps link → pin, else OpenStreetMap Nominatim on the address); the AI tool schemas have no lat/lng.
5. **Claude API usage:** model `claude-sonnet-5-5` (Shahar's choice; changeable in Settings → AI), `thinking: {type: "adaptive"}`, effort per feature,
   `fallbacks: "default"` + beta `server-side-fallback-2026-07-01`, `tool_choice: auto` (forced choice 400s on Sonnet 5.5 / Opus 5.5),
   strict tools, no temperature/top_p, streaming `finalMessage()`. Shapes verified against `@anthropic-ai/sdk` 1.3.0 —
   see `notes/ai.md` before changing them.
6. **Edit Hebrew files only with the Edit/Write tools** (PowerShell 5.1 corrupts UTF-8). `npm test` runs `check-utf8`.
7. **Git:** repo-local identity `ShaharDS` / `132921874+ShaharDS@users.noreply.github.com` (the global identity on this PC is
   someone else's). **No Claude co-author lines.** Commit / push only when Shahar asks.
8. **Cloud Functions runtime = Node 24** (`firebase.json`, `functions/package.json`). The PC has Node 20 — fine for building,
   tests and the emulator. Node 20 runtime was decommissioned 2026-10-30.
9. Edit forms are not rebuilt on background updates (`render()` shape guard in `main.js`) — keep forms self-updating
   (update preview nodes on input, never re-render the form while typing).

## Layout
```
USA Trip 2027/
  CLAUDE.md / HANDOFF.md / README.md (Hebrew, then English) / SECURITY.md
  docs/                     the site (GitHub Pages: main /docs), served under /usa-trip-2027/
    index.html              shell + static OG tags (never put the live total in OG — WhatsApp caches it)
    css/                    tokens.css (colors, sizes) · base.css · components.css · print.css
    assets/                 icons.svg (Lucide sprite, built by scripts/build-icons.mjs) · og.jpg · favicon.svg
    data/seed-data.json     opening data (also the demo-mode data and the "טען נתוני פתיחה" source)
    js/config.js            Firebase web config (public), ?emu=1 emulator switch
    js/main.js              boot, routing → views, nav, edit bar, render guard
    js/store.js router.js   state + memoized engine result; hash routes
    data/demo-trip.json     demo mode + engine tests: cost rows and sample places (NEVER the opening data)
    vendor/leaflet-1.9.4/   Leaflet (BSD-2), bundled; loaded only on screens with a map (OSM tiles)
    js/shared/              PURE engine: schema, engine (computeTrip, itinerary), ops (+undo), validate, format (Hebrew),
                            commit (prepareCommit/prepareUndo), aitools (AI tool schemas → ops), deadlines,
                            route (routeView / familyView: plan → price-free public / family route), days (tripDays,
                            tripParts), calendar (dayOwners, assignRangeOps, explicitOps, gapRanges), links (Waze /
                            Google Maps URLs), geo (Maps links)
    js/views/               home (editors: renders `sections`; categories open in place), trip (calendar + day by day in
                            the old site's look, home for public/family, #/day/:date), route (editors' #/route = trip +
                            deadlines / checklist), category, options, print,
                            ask, docs, settings (+ setupCard when no data), history, signin, footer
    js/edit/                kit (form controls, pickers), forms (row/category/stop/section/option/question), expensePanel
                            (inline add: by hand or AI) + expenseOps (pure), places (add/edit places on a day, AI box,
                            hotel dates on the calendar, files for the family, day titles), parts (a part's name / dates),
                            tools, sections
    js/components/          common (badges, chips, share, confirmDialog / askFirst), proposal (AI review card + place
                            check), map (Leaflet route map), voice (dictation button), parts (part colours),
                            rangePicker (calendar date picker), fileViewer (files on places, full-screen images)
    js/data/                rest (public route via REST), live (editors: live plan + private), session (sign-in → whoami → data), commit
    js/fb/                  lazy (gstatic SDK v13.1.0), auth (popup), api (callables) — no Storage SDK: files go through the functions
    js/ui/                  h (DOM + automatic <bdi>), speech (dictation/read-aloud), resize (photos ≤1600px)
    js/dev/audit.js         father-friendly audit (run via the browser console / pane)
    dev/og.html             source of assets/og.jpg (render 1200×630)
  functions/src/            commitChange (+undoChange) · accessAdmin (whoami/getAccess/setAccess) · adminImport ·
                            ai (aiAsk/aiPropose) · proposals (apply/reject) · documents (addDocument saves + reads a file, getDocumentFile opens it) ·
                            lib/ admin, access, state, caps, claude, claudeFake, prompts, propose
  firestore.rules storage.rules firebase.json firestore.indexes.json
  seed/reference-prices.md  AI background research (copied to functions/assets/ at build)
  scripts/                  serve.mjs (local Pages mirror :8150) · sync-shared · build-icons · check-utf8
  tests/                    *.test.mjs (unit) · rules/*.rules.mjs · integration/*.int.mjs (emulators, fake Claude)
  notes/                    ai.md · data-model.md · runbook.md
```

## Commands
- `npm test` — unit tests (engine, validation, ops/undo, Hebrew formatting, AI tools) + UTF-8 check. No network.
- `npm run test:all` — + functions build, security-rules tests and end-to-end emulator tests (needs Java 21; free ports 8080/9099/5001/9199/4000).
- `npm run serve` → http://localhost:8150/usa-trip-2027/ (`?demo=editor|family|owner` = local demo, nothing saved; `?emu=1` = against emulators).
- `npm run emulators` — build functions + start the emulators (owner = owner@example.com, fake Claude).
- `firebase deploy` — rules + functions to project `usa-trip-2027-shahar` (outward-facing: only with Shahar's OK).

## Gotchas
- `preview_start` by name can pick up another project's launch.json (PalGate) — run `node scripts/serve.mjs 8150` in the
  background and `preview_start {url}` instead.
- The functions emulator sometimes fails "Failed to load function definition … fetch failed" right after another emulator run — just rerun.
- Stopping a background `firebase emulators:start` leaves java/node listening; find them by port and stop those PIDs only.
- A hash-only URL change doesn't reload the page: after editing JS, navigate with a new query string (`?r=N`).
- In-memory documents are `{plan, priv}` (`store.docs`, functions `Docs`); `store.route` is the public route. `store.docs.plan`
  is `undefined` while loading and `null` when the database has no trip (editors then get `setupCard`, and the functions
  refuse changes via `requireTripData`).
- Demo mode: `?demo` = what anyone sees, `?demo=family`, `?demo=editor|owner`; the top bar's buttons switch between them.
  Demo mode loads `data/demo-trip.json` (sample rows + places). `&today=2027-10-06` (demo only) shows the screens as on
  that trip day.
- Every removal goes through `askFirst()` / `confirmDialog()` (the "בטוחים?" popup). Inline boxes (`.inline-form`) keep
  their text in module state and `main.js` holds back re-renders while a field inside one is focused.
- Map tiles: OpenStreetMap (`tile.openstreetmap.org`, credit line under the map). CARTO's free tiles now need a key.
- The family route is cached on the phone (`usaTrip.familyCache`) for offline use on the road; signing out removes it.
- Auth emulator: sign in from page JS with `GoogleAuthProvider.credential(JSON.stringify({sub,email,email_verified:true}))`;
  set `localStorage.usaTrip.hadSession = "1"` so the session restores on reload.
