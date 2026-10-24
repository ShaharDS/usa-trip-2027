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
3. **Three levels:** public link (cost summary, no personal data, no login) · family (one Google sign-in: documents + Ask AI) ·
   editors (edit everything, approve AI proposals). The owner manages the email lists in-app (`setAccess`).
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
4. **Booking codes / private notes / flights / documents are private** (`private/state`, Storage). Never let them reach
   `public/state` (the public "what changed" text is regenerated server-side from public ops only).
5. **Claude API usage:** model `claude-opus-5-5` (setting), `thinking: {type: "adaptive"}`, effort per feature,
   `fallbacks: "default"` + beta `server-side-fallback-2026-07-01`, `tool_choice: auto` (forced choice 400s on Opus 5.5),
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
    js/shared/              PURE engine: schema, engine (computeTrip, itinerary), ops (+undo), validate, format (Hebrew),
                            commit (prepareCommit/prepareUndo), aitools (AI tool schemas → ops), deadlines
    js/views/               home (renders `sections`), category, options, route, print, ask, docs, settings, history, signin, footer
    js/edit/                kit (form controls), forms (row/category/stop/section/option/question), tools, sections, stops
    js/components/          common (badges, chips, share), proposal (AI review card)
    js/data/                rest (public REST read), live (Firestore lite/full), session (sign-in → whoami → data), commit
    js/fb/                  lazy (gstatic SDK v13.1.0), auth (popup), api (callables), storage (getBlob only)
    js/ui/                  h (DOM + automatic <bdi>), speech (dictation/read-aloud), resize (photos ≤1600px)
    js/dev/audit.js         father-friendly audit (run via the browser console / pane)
    dev/og.html             source of assets/og.jpg (render 1200×630)
  functions/src/            commitChange (+undoChange) · accessAdmin (whoami/getAccess/setAccess) · adminImport ·
                            ai (aiAsk/aiPropose) · proposals (apply/reject) · documents (addDocument) ·
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
- Auth emulator: sign in from page JS with `GoogleAuthProvider.credential(JSON.stringify({sub,email,email_verified:true}))`;
  set `localStorage.usaTrip.hadSession = "1"` so the session restores on reload.
