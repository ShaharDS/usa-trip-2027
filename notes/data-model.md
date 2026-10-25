# Data model

Two Firestore documents hold the whole trip (both **editors only**); everything is editable data (`docs/js/shared/schema.js` is the single source of truth — validator, editor forms and AI tools all read it). A third, price-free document is generated from them for everyone else.

| Who | Reads |
|---|---|
| anyone with the link | `public/state` — the route only (no hotel names / addresses) |
| family (on the list) | `family/state` — the route with hotel names, addresses, map locations + "Ask the trip" (aiAsk gives the model the family route, travellers and flight times — no prices) |
| editors / owner | `plan/state`, `private/state`, history, documents, proposals, usage |

## `trips/usa2027/public/state` (anyone can read — generated, never edited)
Written by the functions on every write (`writeDocs` → `routeView(plan)`, `docs/js/shared/route.js`): `settings` (title, subtitle, dates, contactText), `itinerary` (`tripNights`, `stops[]` with resolved `nights`/`start`/`end` after the chosen options, labels, notes), `holidays`, `travellers` (count), `version`, `updatedAt`. No prices, rows, categories, options, checklist or private data — `tests/route.test.mjs` fails if any other number or a money sign appears. Stop notes are public: the stop editor says so.

## `trips/usa2027/family/state` (family + editors — generated, never edited)
`familyView(plan)`: the same as the public route plus the full `places` (label, kind, date / checkIn–checkOut, time,
address, city, region, lat / lng, mapsUrl, website, phone, note, maybe, photo, passIds) and `days` with notes. Still no
prices. The public route has places reduced to kind / dates / times / city / region / maybe, a sight's name, and a
~10 km `near` grid square — hotels have no name. `audience` says which one a document is.

## `trips/usa2027/plan/state` (editors only)
| Key | Contents |
|---|---|
| `settings` | title, subtitle, `startDate`/`endDate`, `fx.planningRate` (₪ per $ used for all totals) + date, `bufferPct`, `cardFeePct`, `perPersonPreset`, `notIncluded[]`, `contactText` |
| `groups` | traveller groups with counts (adults 6, teen 1, infant 1) |
| `presets` | "who is counted" = weights per group (`everyone`, `paying` = no baby, `adults`) |
| `stops` | route in `order`: `nights` or `fill: true`, optional `anchorDate` |
| `units` | countable things: rooms, cars… |
| `categories` | label, icon, color |
| `items` | cost rows (below) |
| `optionGroups` / `options` | questions with alternatives; only the `chosen` option counts; an option can `stopPatch` a stop (date/nights) |
| `sections` | home-page layout: `type`, `title`, `visible`, `order`, `text` |
| `checklist`, `holidays` | to-dos (editors tick them on the route / home); holiday markers on the route |
| `places` | the day-by-day route: hotels (`checkIn`/`checkOut`), sights, meals, stops on the way (`date`, `time`), with address, US state (`region`), map location (set by the server), links, note, `maybe` |
| `days` | per date (id `d20271004`): `title`, `note` |
| `version`, `updatedAt`, `updatedByLabel`, `recent[]`, `derived` | written by the functions |

Every record may carry `order`, `archived` (soft delete) and `v` (version that last changed it).

## Cost row (`items/{id}`)
`amount = unit price × quantity`; quantity multiplies whatever is set in `rule`:
- `people`: a preset id or a number
- `unit`: a unit id (× its count)
- `time`: `{ by: "nights" | "days", stopIds? }` — nights of those stops (days = nights + 1); no stops = whole trip
- `count` (+ `countLabel`)

No factors = lump sum. `price` = `{low, typical, high, currency}` or a `table` keyed by two option groups (the cruise: sailing × ship/cabin). `status` = estimate / quote / booked / paid; booked/paid with `actual` uses that total. `optionId` = counts only while that option is chosen. Also `note`, `sources[]`, `deadlines[]`.

## Days (`shared/days.js`)
`tripDays(route)` = one entry per date: day n of N, the stop we sleep in, today's places by time, tonight's hotel
(`checkIn ≤ date < checkOut`), last night's hotel, check-out / check-in when the hotel changes, and the US states in
travel order. Places outside the trip dates are allowed (dates may move) and listed to editors as a warning.

## Itinerary
Stops are walked in order. Anchors split the trip into stretches: trip start, every stop with an `anchorDate`, trip end. In each stretch, fixed nights are summed and the single `fill` stop gets the remainder. Too many nights → warning "חסרים X לילות"; nights left with no fill stop → warning.

## `trips/usa2027/private/state` (editors only)
`items/{itemId}` booking code / confirmation / private note / `documentIds[]`; `flights/{id}` flight segments; `aiSettings` (model, monthly budget, daily caps, `includePrivateInAsk`).

## Collections
`changes/{id}` (history with `ops` + `inverseOps` for undo), `proposals/{id}` (AI), `documents/{id}` (uploaded files' metadata), `usage/{yyyy-mm}` (AI spend), `backups/{id}` (before each import), `config/access` (editors / family emails), `users/{uid}/asks`.

## Changes
Every edit is a list of ops (`docs/js/shared/ops.js`): `create`, `update` (dotted paths + `before` values), `archive`/`restore`, `delete`, `choose`. `prepareCommit` (`shared/commit.js`) checks conflicts in order, validates, applies, bumps `version`, recomputes `derived` and adds a "what changed" line (on the plan, editors only) generated from the plan ops only. The functions refuse every change with a clear message while `plan/state` doesn't exist (`requireTripData`): the owner first loads the opening data.

Backups and `adminImport` use `{plan, priv}`; files made before 2026-10-25 used `{pub, priv}` and still load.
