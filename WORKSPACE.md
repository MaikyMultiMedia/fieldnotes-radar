# Private Fomo research workspace

The Sites edition adds an invitation-only research workspace alongside the existing public synthetic demonstration. The original `site/` preview and Python momentum engine remain separate and unchanged.

## What works

- The two explicitly invited accounts sign in with the password provided by the owner. Passwords are salted PBKDF2-SHA256 hashes in the hosted `ACCOUNT_CREDENTIALS` secret, never in Git, HTML, or JavaScript assets.
- Opaque session cookies are Secure, HttpOnly and SameSite=Strict; only token hashes persist. Sessions expire after seven days and are revoked on logout. Login attempts are rate-limited through D1, including both email and source-IP buckets. Mutations require a same-origin request.
- Both accounts share a persistent watchlist, exact chain/contract identities, research status and notes. Optimistic revisions prevent one person silently overwriting another person's changes. Activity records attribute updates.
- The radar displays live public GeckoTerminal pools on Solana, Ethereum, Base and BNB Chain. Trending/new views, symbol or exact-contract search, token prices, scoped liquidity/volume and 5-minute/hourly chart intervals are available. Saved tokens open research by exact chain/contract. The research desk also includes an arithmetic scenario calculator. Open Fomo opens the official website; no Fomo session, wallet, signing key, private endpoint or order submission is integrated.
- Public GitHub Pages still publishes only the original public demo and the non-sensitive workspace release manifest. Private saved research lives only in the Sites database.

## GitHub is the interface source of truth

`web/` contains the new interface. A push to `main` runs the existing Python privacy and momentum tests, JavaScript syntax checks, the Worker build and focused authentication/storage tests. Only a successful GitHub Pages deployment advances `workspace-release.json`.

The Sites Worker checks that release pointer at most once per minute per warm instance, downloads the six interface files from the exact immutable Git commit, checks every SHA-256 digest, and switches the entire asset set together. Partial downloads, invalid hashes, incompatible API versions and unavailable GitHub service leave the last verified release (or embedded fallback) active. Open tabs show an update button so unsaved notes are not discarded.

**Automatic scope:** changes to `web/index.html`, `web/app.js`, `web/style.css`, `web/favicon.svg`, `web/charts.js`, and `web/NOTICE.txt`. Backend code, credentials, schemas, market adapters and the Python engine require a new Sites deployment. This is not unrestricted full-stack CI/CD. Do not claim that arbitrary GitHub changes are automatically deployed. Interface updates require the GitHub repository to remain publicly readable and GitHub Pages to remain enabled.

The frontend contract uses API version 4. Changes to API contracts must keep compatible interface behavior or intentionally change the release manifest version and deploy a matching Worker. The Worker never evaluates remotely fetched backend code.

## Local development

Use Node 24 (or Node 22 with node:sqlite support), Python 3.11+, and the existing npm lockfile:

1. `npm ci --ignore-scripts`
2. `npm run db:generate` only after an intentional schema change. Review generated SQL; never rewrite a migration after it has shipped.
3. Create ignored `.local/accounts.json` with the same email-to-`{salt, hash}` shape as the hosted secret, using 100,000 PBKDF2-SHA256 rounds and a distinct random salt per account. Do not commit real credentials or copy the production database.
4. `npm run build`, then `npm run dev` (localhost:8891).
5. `npm test`, `python -m unittest discover -s tests -v`, and `node --check web/app.js`.

The Node SQLite adapter is for local preview and tests only. The production Worker has no npm runtime dependencies and uses the Sites-managed D1 binding named `DB`. The build emits a Worker with default `fetch` at `dist/server/index.js`, an embedded fallback, hosting metadata and Drizzle migrations. Sites handles cloud credentials and migrations.

## Operations and limits

Use the existing project identity in `.openai/hosting.json`; do not create another Site. Keep both invited emails in Sites access controls. Sites may ask visitors to verify their identity before the app's own password screen. Setting a Sites password does not change anyone's Fomo or Google password.

Keep the account secret outside source control, never share session cookies, and do not store wallet keys. To revoke all sessions after changing a password, remove the affected user's session rows through an authorized administrative operation. Account recovery and password rotation are operator-managed in this first version.

Research notes are shared between both users. This is a research workspace, not a portfolio vault. See DATA_ACCESS.md for the active public market source, caching, freshness and coverage limits. A future real trading integration needs documented API access and a separately reviewed signing/confirmation flow; the current release does not place trades.

## Verification performed

Focused tests cover unknown accounts, bad passwords, cross-origin requests, unauthorized direct API access, cookie security flags, expiry/logout, durable throttling, persistence between both accounts, duplicate-contract conflicts and concurrent edits. The original nine Python checks remain required. Desktop and 390px browser checks cover login, saved notes, navigation and the paper calculator. Browser WebMCP navigation is feature-detected and uses the same visible navigation state; no trading tool is exposed.

## Live market operations

Authenticated GET /api/market supports trending, new, search and exact-token modes. GET /api/market/chart verifies the selected contract belongs to the selected pool before requesting OHLCV. The server contacts only the fixed GeckoTerminal API origin; clients cannot provide upstream URLs. It returns an allowlisted schema without user accounts or private holdings. Credentials, notes and user identities are never sent to the provider.

Additive migration 0001 creates market_cache and market_budget without changing saved research or sessions. Cache hits share snapshots for 60 seconds; eight upstream attempts per minute are allowed across the workspace. Provider 429 responses set a shared cooldown. Refresh failures may serve the original snapshot for at most 15 minutes, labeled stale with its original receipt time. Older snapshots return unavailable; there is no synthetic fallback. Cache records older than a day are pruned after successful fetches. Requests have an eight-second timeout and 1.5 MB response limit.

Only the visible radar, research, large-buy or paper-journal view refreshes each minute; refresh pauses while the browser is hidden or a form is being edited. Provider data can lag. Charts label their last candle time, use actual reported intervals and do not invent missing candles. Null market cap is never substituted with FDV. Quote-side pools omit unsupported base-token changes and valuation fields. Holders, exact launch time, Fomo availability, tradable size and Fomo execution quotes remain unknown. The Python alert engine is not connected, and there are no background trade alerts.

API version 4 prevents the updated interface from loading on the older Worker. Deploy the matching backend/migration through Sites; later compatible web-only changes continue to update through checked GitHub releases. Market tests cover identity, missing/zero/malformed values, quote-side semantics, chart bounds, cache freshness, outage fallback, cooldowns, request budgets and authenticated API access.

## Restored research workflow (September 21, 2026)

The private interface preserves the original Fieldnotes Launch Radar / Research Desk workflows, with evidence cards as its default and a compact table option. Each result offers its exact contract, copy, save, and research actions. Paste reads the clipboard only after a click, validates contract-shaped text locally, and asks the user to confirm the network before searching. Browser restrictions fall back to keyboard/long-press paste or selectable copy text. Unsaved search text survives filter changes.

Rising, Falling and Rapid moves use provider five-minute price changes. Rapid means at least +50% or at most -30%; it does not claim the original $2,000 market-cap-change condition. Numeric liquidity, volume and min/max market-cap filters, known-cap filtering, pool-age filtering and sorting apply to the currently loaded provider result set (up to 20 pools), not the entire chain. Unknown values fail filters that need them; zero remains a measured value. Pool identity survives sorting and duplicate tickers.

Recommendations are transparent research-screening rules: a fresh usable price and positive market cap, at least $25,000 liquidity and $50,000 in 24-hour pool volume qualify for a research shortlist. Stale data, unknown values and thin liquidity produce different research prompts. These thresholds are interface heuristics, not empirical safety ratings or buy/sell advice. Token controls, holders, issuer credibility and actual Fomo quotes are not verified. The Research Desk restores the original observation / possible-explanations / next-checks flow, with copyable briefs and the existing paper calculator.

The original Python cap/holder alert engine and its paper tracker remain separate; background alerts remain unconnected; there is no fake red alert on real data. This distinction is shown under the launch-rule explanation in the app. Existing live charts, accounts, shared notes and compatible GitHub updates remain in place.

Local preview now deliberately uses its bundled interface rather than the current remote release so uncommitted UI edits are actually visible during QA. Production release verification is unchanged. Focused UI logic tests cover combined filters, null/zero distinctions, sorting and exact identity, and stale/unknown exclusion from recommendations.

## Public flow intelligence (September 21, 2026)

The Fomo-inspired dark theme preserves copy/paste, token filters, research shortlist, notes, and exact-contract selection. Lightweight Charts 5.2.1 adds interactive candles and volume, with an accessible closing-price table. The unmodified pinned vendor asset and license/notice are checked with the same atomic GitHub release manifest. Update both npm dependency and vendored asset together when upgrading.

Authenticated GET /api/market/trades verifies pool/token membership first, then requests the public provider's most recent 300 pool swaps in the past 24h. Direction comes from the selected token's exact from/to address rather than the provider's base-token label. Event IDs deduplicate swap events, preserving multiple swaps in one transaction. Invalid dates, hashes, identities and future/old observations are rejected. Missing USD amounts remain null. Sender addresses can be routers or aggregators and are not verified trader identities. A first-10-minute badge refers only to pool creation, never token launch or a wallet's first purchase.

Large buys scans up to three currently filtered radar pools, or one research token. The visible view polls these selected pools about once a minute, sharing the existing eight-request/minute workspace budget. Partial failures are shown. Each pool exposes actual oldest/newest block times and fetched time. This is an incomplete sample, not a chain-wide monitor, transaction history archive, guaranteed early alert or profit measure.

Migration 0002 adds shared wallet follows. POST /api/wallets and DELETE /api/wallets/:id require authentication, same-origin writes and current revisions. Public addresses and personal labels are private shared research records, retained until unfollowed. Exact chain/address matches highlight observed senders. Following does not start a background subscription. Audit events record additions, label changes and unfollows; no actual trade histories or addresses belong in repository fixtures.

## Optional profit provider (not activated)

The user chose to finish free features first. No Birdeye subscription, key or paid call was provisioned. GET /api/intelligence/leaders returns not_configured with an empty result until BIRDEYE_API_KEY is configured as a hosted secret by the operator. Never put this key in the browser, source, logs or a URL. Local preview can opt in using a process environment variable; ordinary preview remains free.

Official contract: https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-wallet-v2-leaderboard
Windows map 24h→24h, 48h→2d, 72h→3d, 7d→7d, 30d→30d. Fixed query: sort_by=realized_pnl, pnl_method=wac, from_value=100000, min_trade=10, min_realized_pnl=0, limit=20. This is a provider-indexed Solana cohort, not all Fomo traders. No user/Fomo identity is inferred, and fees/transfers are not independently reconciled. Provider access and live response compatibility must be validated after an authorized key is supplied; current adapter tests use synthetic fixtures only.

The optional provider uses a separate six-attempt/minute budget, five-minute shared cache and a maximum one-hour stale fallback preserving the receipt time. Errors are sanitized. Responses are limited to 500 KB and ten seconds. No background leaderboard polling occurs; changing a window or Retry explicitly loads it. Connected data should be checked for provider entitlements and cost before enabling regular use.

Validation adds quote-side trade direction, multiple swap events per transaction, early-pool timing, unknown vs zero amounts, authenticated trade routes, shared wallet CRUD/revision/origin checks, and missing/configured/stale profit-provider behavior. Remaining npm audit findings affect the existing Drizzle migration tool's old esbuild development-server dependency; that server is not used or shipped. The ORM development dependency was updated to 0.45.2 to clear its high-severity advisory. The hosted Worker does not import npm dependencies.

## Forward paper journal (September 21, 2026)

Research Desk can start a shared paper trial. Its original thesis, reason, exact chain/contract/pool, outlay, entry delay and cost assumptions are saved before entry and cannot be rewritten. The default $5 outlay uses adjustable 1% plus $0.10 fees each way and 1% adverse slippage each way; these are illustrative assumptions, not Fomo fees. No orders, positions, signatures or wallet connections are created.

Entry uses the first usable newly fetched pool snapshot captured after a chosen 60/120/300-second delay, within a further five-minute window. The original signal price is never used as an immediate fill. The journal polls at most four due trials per visible minute and shares the existing eight-attempt/minute provider budget. Closing the app stops collection. Missed windows become missed records rather than retrospective entries. A manual capture button supports explicit observation.

Marks require a fresh response, a receipt time no more than two minutes old, exact identity, positive price/liquidity, and hypothetical size no greater than 1% of reported pool liquidity. This last bound is a modelling restriction, not a verified liquidity or execution guarantee. Stale/unknown prices produce no current P&L and cannot close a trial. Costs apply on entry and exit; proceeds are floored at zero. Snapshot receipt timestamps are not exchange observation times. Detailed evidence retains the first and latest 119 marks; counters and extrema cover all captured samples, not continuous highs/lows.

Explicit paper closure requests a usable current snapshot and records the closing user and time. Cancellation requires a reason and retains the record without inventing a return. Takeaways can be edited with revision checks while the original thesis/costs remain immutable. Closed P&L and descriptive reason groups exclude open/missed/cancelled trials, which remain visible in overall counts. Self-selection, manual closure, differing costs and holding periods make this exploratory evidence rather than a backtest or validated trading strategy.

Additive migration 0003 creates paper_trials. GET /api/paper reads the shared journal; authenticated same-origin POST routes create, observe, close, cancel and update reflections. Request IDs make creation retries idempotent; revision checks protect shared edits and audit events record state changes. Records remain private in Sites D1, capped at 200 total and 20 active. There is no deletion route; further capacity/archive management requires a future explicit feature. Notes, trial records and account identifiers never go to the market provider or public GitHub.

Nine focused paper tests cover numerical bounds, entry timing/no look-ahead, exact identities, unavailable values, both-way costs, sample retention, outcome summaries, private storage, retry/revision handling, expiry, cancellation and refusal of stale closure. These use synthetic fixtures. Browser checks use disposable local paper observations only. API version 4 prevents this frontend from loading on an older backend without the journal schema.
