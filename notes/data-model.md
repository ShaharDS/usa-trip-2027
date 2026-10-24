# Data model

Two Firestore documents hold the whole trip; everything is editable data (`docs/js/shared/schema.js` is the single source of truth — validator, editor forms and AI tools all read it).

## `trips/usa2027/public/state` (anyone can read)
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
| `checklist`, `holidays` | to-dos; holiday markers on the route |
| `version`, `updatedAt`, `updatedByLabel`, `recent[]`, `derived` | written by the functions |

Every record may carry `order`, `archived` (soft delete) and `v` (version that last changed it).

## Cost row (`items/{id}`)
`amount = unit price × quantity`; quantity multiplies whatever is set in `rule`:
- `people`: a preset id or a number
- `unit`: a unit id (× its count)
- `time`: `{ by: "nights" | "days", stopIds? }` — nights of those stops (days = nights + 1); no stops = whole trip
- `count` (+ `countLabel`)

No factors = lump sum. `price` = `{low, typical, high, currency}` or a `table` keyed by two option groups (the cruise: sailing × ship/cabin). `status` = estimate / quote / booked / paid; booked/paid with `actual` uses that total. `optionId` = counts only while that option is chosen. Also `note`, `sources[]`, `deadlines[]`.

## Itinerary
Stops are walked in order. Anchors split the trip into stretches: trip start, every stop with an `anchorDate`, trip end. In each stretch, fixed nights are summed and the single `fill` stop gets the remainder. Too many nights → warning "חסרים X לילות"; nights left with no fill stop → warning.

## `trips/usa2027/private/state` (family only)
`items/{itemId}` booking code / confirmation / private note / `documentIds[]`; `flights/{id}` flight segments; `aiSettings` (model, monthly budget, daily caps, `includePrivateInAsk`).

## Collections
`changes/{id}` (history with `ops` + `inverseOps` for undo), `proposals/{id}` (AI), `documents/{id}` (uploaded files' metadata), `usage/{yyyy-mm}` (AI spend), `backups/{id}` (before each import), `config/access` (editors / family emails), `users/{uid}/asks`.

## Changes
Every edit is a list of ops (`docs/js/shared/ops.js`): `create`, `update` (dotted paths + `before` values), `archive`/`restore`, `delete`, `choose`. `prepareCommit` (`shared/commit.js`) checks conflicts in order, validates, applies, bumps `version`, recomputes `derived` and adds a public "what changed" line generated from the public ops only.
