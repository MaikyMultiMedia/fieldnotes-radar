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

The frontend contract uses API version 10. Changes to API contracts must keep compatible interface behavior or intentionally change the release manifest version and deploy a matching Worker. The Worker never evaluates remotely fetched backend code.

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

Only the visible radar, research, large-buy or paper-journal view refreshes each minute; refresh pauses while the browser is hidden or a form is being edited. Provider data can lag. Charts label their last candle time, use actual reported intervals and do not invent missing candles. Null market cap is never substituted with FDV. Quote-side pools omit unsupported base-token changes and valuation fields. Complete independently verified holders, exact launch time, Fomo availability, tradable size and Fomo execution quotes remain unknown. The Python alert engine is not connected, and there are no background trade alerts.

API version 5 prevents the updated interface from loading on the older Worker. Deploy the matching backend/migration through Sites; later compatible web-only changes continue to update through checked GitHub releases. Market tests cover identity, missing/zero/malformed values, quote-side semantics, chart bounds, cache freshness, outage fallback, cooldowns, request budgets and authenticated API access.

## Restored research workflow (September 21, 2026)

The private interface preserves the original Fieldnotes Launch Radar / Research Desk workflows, with evidence cards as its default and a compact table option. Each result offers its exact contract, copy, save, and research actions. Paste reads the clipboard only after a click, validates contract-shaped text locally, and asks the user to confirm the network before searching. Browser restrictions fall back to keyboard/long-press paste or selectable copy text. Unsaved search text survives filter changes.

Rising, Falling and Rapid moves use provider five-minute price changes. Rapid means at least +50% or at most -30%; it does not claim the original $2,000 market-cap-change condition. Numeric liquidity, volume and min/max market-cap filters, known-cap filtering, pool-age filtering and sorting apply to the currently loaded provider result set (up to 20 pools), not the entire chain. Unknown values fail filters that need them; zero remains a measured value. Pool identity survives sorting and duplicate tickers.

Recommendations are transparent research-screening rules: a fresh usable price and positive market cap, at least $25,000 liquidity and $50,000 in 24-hour pool volume qualify for a research shortlist. Stale data, unknown values and thin liquidity produce different research prompts. These thresholds are interface heuristics, not empirical safety ratings or buy/sell advice. The market feed alone does not verify token controls, holders, issuer credibility or actual Fomo quotes. Optional on-demand GoPlus checks are described below. The Research Desk restores the original observation / possible-explanations / next-checks flow, with copyable briefs and the existing paper calculator.

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

Nine focused paper tests cover numerical bounds, entry timing/no look-ahead, exact identities, unavailable values, both-way costs, sample retention, outcome summaries, private storage, retry/revision handling, expiry, cancellation and refusal of stale closure. These use synthetic fixtures. Browser checks use disposable local paper observations only. API version 5 prevents this frontend from loading on an older backend without the journal schema.

## Free token-control evidence (September 21, 2026)

Research Desk offers Load free checks for the exact contract and network. The authenticated /api/token-checks route uses GoPlus documented unauthenticated token-security endpoints for Solana (beta), Ethereum, Base and BNB Chain. No SDK, paid account, token, wallet or Fomo credential is added. The interface attributes GoPlus and links its field documentation. These provider findings do not constitute an independent audit, safety rating, verified sell route, Fomo listing or profitable-trader list.

The server allowlists network IDs and provider fields, distinguishes true/false/unknown, and rejects wrong-contract or empty reports. Solana controls include minting/freezing, privileged balance changes, closure, fee/hook changes, default account state and non-transferability. EVM checks include provider sell/buy findings, minting, pausing, blacklist capability, proxy/source visibility and tax changes. Fees are provider rates rather than execution costs. Missing fields and invalid numeric data remain unknown. No provider trust-list label is turned into a safety guarantee.

The holder sample has at most ten validated unique addresses (Solana token accounts). Displayed shares are calculated from reported balances and positive supply; invalid or inconsistent denominators, incomplete rows or sums above 100% suppress the aggregate. Pool/exchange accounts are not excluded or identified as independent owners. Provider holder count is marked unverified and never feeds the original complete-holder alert rule.

Checks are requested explicitly, not polled. A separate workspace-wide budget allows eight upstream attempts/minute, with five-minute cache sharing, 15-minute stale fallback, original receipt times, provider cooldowns capped at one hour, a ten-second timeout and a 500 KB response bound. Access/paywall errors fail closed without enabling paid access. Only network IDs and public token contracts go upstream. Cache uses the existing market_cache/market_budget tables, with one-day pruning; there is no new schema migration.

Up to 100 cached report summaries are shared in the existing workspace refresh. A loaded or shared cached report excludes a token from the market shortlist when it has reported flags, unknown controls or outdated evidence. Tokens not yet checked retain the explicitly labelled market-only screening rules; this is not a chain-wide scanner. Full report details load on request and the browser retains at most 50 reports. Fresh reports have no exact provider observation timestamp.

New paper trials retain a compact fresh check snapshot from the server cache when one was fetched within five minutes. It is immutable historical evidence alongside the original thesis, without extra GoPlus calls or raw holder lists. Older trials and trials without a current report explicitly show missing evidence. Copy checks and Copy record retain provenance and limitations.

Validation: 43 Node checks (including new normalization, input limits, network mapping, budget/cooldown, caching/staleness, shared summary and paper-snapshot tests) and all nine Python checks. Live unauthenticated provider responses were verified for the four supported chains with public wrapped-native tokens; local records are excluded from source and deployment. API contract 5 requires the matching Worker while preserving later compatible GitHub interface updates.

## Saved buy alerts (September 21, 2026)

The private Buy alerts view adds up to three exact token/pool rules. Save a rule from a completed Large buys scan, set a minimum USD amount, and optionally require the pool's first ten minutes or an exact followed sender. Rule saves and edits start a new forward-only block-time boundary; older trades are never backfilled into alerts. Provider token/pool membership is checked before saving. A followed sender remains an unverified public address, potentially a router; neither buy size nor a match proves trader profit.

This is a visible-tab collector, with no scheduler or closed-tab notification service. About once a minute, any visible workspace view requests a scan of the least-recently attempted pool; switching to charts, notes or research no longer suspends collection. A ten-second eligibility tick enforces at least 60 seconds between automatic attempts, including after tab visibility changes. Initial rule discovery and no-rule refreshes are read-only. Unread counts update in navigation without replacing the active research view or interrupting a draft. A per-tab session pause survives reloads and does not stop a teammate’s collector. Hidden/signed-out tabs start no new scans; an already-running request may finish. Automatic scans are quiet; manual checks retain feedback. Each rule has a shared one-minute cooldown; three rules normally rotate over three minutes. A claim across users prevents duplicate concurrent scans. Collection uses the same eight-attempt/minute GeckoTerminal budget and stops emitting alerts from stale/unavailable trade or pool snapshots. The journal and ordinary market views share that budget. Failed scans, actual sample bounds, unknown amounts and possible gaps remain visible.

Migration 0004 adds buy_alert_rules and buy_alerts. Authenticated same-origin POST routes save/remove revision-checked rules, scan one due pool, and mark an alert reviewed. GET /api/alerts reads shared rules and up to 100 of the newest retained observations. Alerts retain exact identities, provider event/transaction evidence, rule settings, block time, snapshot receipt, detection time/delay and bounded sample coverage. IDs include chain, contract, pool and provider event ID, preserving distinct swaps in one transaction. Existing records are immutable except the shared reviewed flag. The last sampled event IDs also suppress repeated notifications if recent records were pruned; these internal IDs are not sent in the rule list.

Retention is the latest 500 records within seven days; reads hide expired records, and successful scan requests prune old/overflow rows. Rule removal preserves captured alerts. This bounded private archive is not a complete transaction history, continuous chain-wide monitor, launch detector, profit ranking or execution quote. Copy evidence includes source and scope, and Research token opens the captured observation as historical. No real wallet histories, local QA records or provider payload exports belong in Git. No additional provider, key, subscription, order or Fomo integration is introduced.

API contract 6 keeps this interface from loading against an older Worker without the alert schema. Compatible later interface releases still synchronize from checked GitHub main releases. Validation covers forward timing, unknown/stale rejection, exact-chain follows, event deduplication, shared revisions, scan races, cooldown, authentication and same-origin protection. UI QA uses only the local private database.

Alert inserts use 25-row bound statements (77 parameters), keeping a full 300-match scan below 30 database queries and within Cloudflare D1 free invocation limits. A synthetic full-sample test verifies query and binding bounds. Official reference: https://developers.cloudflare.com/d1/platform/limits/

## Live market-cap comparisons (September 21, 2026)

Launch Radar now captures server-fetched market-cap observations through authenticated, same-origin POST /api/radar. The original numerical rule is preserved: same network/contract/pool and provider, positive caps, at least $2,000 absolute change, rise at least 50% or fall at least 30%, no more than 300 seconds between snapshots. The oldest qualifying baseline is used and each exact pool/direction has a 60-second cooldown. The original Python engine is unchanged. Shared synthetic boundary fixtures exercise both implementations.

These are explicitly `received_cap_change` signals. The interval is between snapshot receipts, because GeckoTerminal does not provide an exact observation timestamp for these estimates. It is not proof that a capitalization change occurred within that exchange-time interval. FDV, nullable/zero caps, cross-pool/ticker matches, stale data and reversed/duplicate receipts cannot replace evidence. Cap changes can reflect supply changes, provider revisions or thin liquidity; they are not money flowing in. Complete-owner and combined launch rules remain inactive.

The existing visible radar refresh captures up to 20 returned pools before browser display filters. It reuses the same upstream cache and eight-attempt/minute budget; no additional provider or paid entitlement is enabled. Only POST public search/identity inputs are accepted, never client-supplied prices or history. Capture failure leaves the ordinary market snapshot usable with an explicit tracking error. Matching observations from both users and different radar views share baselines. A full 20-signal response, including upstream-cache work, capture, pruning and lookup, stays within the free 50-query invocation budget; automated tests bound it.

Migration 0005 adds cap_observations (up to 2,000, ten-minute retention) and cap_signals (up to 300, 24-hour retention). Pruning runs on fresh captures; reads exclude expired signals. The interface shows the latest 30 signals for the selected network, with rise/fall filters, complete copyable evidence, source and receipt times. Signal creation is deduplicated and cooldown checks are atomic. This remains selected-sample research, not whole-chain or closed-tab monitoring.

Paper-test thesis opens a manual forward trial with a new current price check and the existing delayed-entry rules. The server loads the saved signal by ID, requires exact network/contract/pool identity and embeds its evidence immutably. Later removal of the short-lived signal archive does not rewrite the paper record; idempotent retries preserve it. A new Market-cap signal reason appears in descriptive paper outcomes. The price at paper setup is distinct from the cap signal's older snapshots; no past fill is backdated. This is not an automatic reproduction of the original Python paper strategy.

API contract 7 prevents this interface from loading on older Workers without the cap schema. The public Pages demonstration remains synthetic. Neither provider samples, private trial records, local test data nor screenshots are included in Git or deployment archives.

## Optional wallet-profit reports (September 21, 2026)

Profit history opens from a large-trade sender, saved buy evidence or a followed wallet. The authenticated /api/intelligence/wallet route queries only GMGN's documented read-only wallet_profits endpoint, with one exact address and selected network. Supported periods are 24h, 7d and 30d; 48h/72h are not fabricated. This is individual-address research, not a whole-market leaderboard. The existing optional Birdeye ranking keeps its separate scope.

GMGN documents a free API tier. Set a personal GMGN_API_KEY as a Sites server secret to activate this optional source. The app never receives a signing key, submits an order or accesses account-linked holdings. The documented public demo key is for local compatibility testing only and must not be deployed. No key is configured by this change; without one, requests return an explicit connection state and make no upstream request. Do not put keys in Git, browser storage, research notes or chat.

The report allowlists selected-period realized profit, associated cost basis, buy/sell counts and current unrealized profit. Missing values stay unknown, losses remain negative and an empty response does not imply zero activity. Fees, transfer accounting, cost-basis methodology, observation time and Fomo identity are not independently established. Public senders may be routers or shared accounts. Copy report retains exact identity, period, source and receipt time.

Results share the existing private market cache for five minutes, with an explicitly stale fallback up to one hour and one-day cache pruning after successful fetches. Requests share an eight-attempt/minute budget and minimum two-second spacing, honor provider cooldowns, use a ten-second timeout and reject responses larger than 350 KB. Only public address/network/period inputs are forwarded. No notes, user identity, app cookies or raw provider profile fields leave the workspace. Reports load on demand; no new polling or background collection is enabled.

## Free saved-buyer discovery

The Traders view summarizes retained buy alerts by exact network and public sender. It supports 24h, 48h, 72h and 7d windows based on transaction block time. Thirty-day discovery is unavailable because the inbox retains at most seven days. This is activity research, not a profit ranking or a complete wallet history.

The authenticated GET `/api/alerts/buyers?window=24h` reads at most the latest 500 retained records using the existing detection-time index. It makes no upstream request and excludes future/expired records, unknown or nonpositive USD values, invalid identities, sells and unusable transaction evidence. Events are deduplicated by network/contract/pool/provider event ID. A sender's transaction count is deduplicated across pools by transaction hash; swap and pool counts still include routed legs. No summed volume, invested capital or PnL is inferred.

Each row provides its largest observed buy and transaction link, distinct buy transactions, swap/pool/token counts, early-pool swap count, and first/last matching block times. Display filters apply to a sender's largest buy and do not change their other counts. At most 50 matching senders are displayed; all retained eligible senders are available to the filters. The summary shows assembly time rather than claiming a refreshed market timestamp. Users explicitly refresh it. Unread/reviewed state has no effect on discovery. Rule changes and discarded older records limit coverage, and removed rules can still contribute retained observations.

Copied evidence includes exact identities, period, transaction, timestamps and coverage. Following uses the existing shared private address list. Profit history remains an optional separately connected provider. No new schema, data source, subscription or background process is required. This feature introduced checked-interface compatibility contract 9.

## Free Solana sell-route preview

Research Desk → Sell-route preview requests a hypothetical exact-input Raydium quote into mainnet Solana USDC (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v, six decimals). Input amounts are token units, never dollars or a read of personal holdings. Input decimals come from matching Raydium metadata; string/BigInt conversion preserves smallest units and rejects excess precision, zero, negative, exponential and u64-overflow amounts. Tokens with more than 18 decimals and input USDC are unsupported. Slippage accepts 1–500 basis points; the interface offers 0.1%, 0.5%, 1%, 2% and 5% without recommending an increase after a failed quote.

Authenticated GET /api/market/exit-quote validates exact input/output identities, BaseIn type, amounts, slippage and a continuous route of at most five pools. Quotes with referral charges or inconsistent fields are rejected. Output includes expected USDC, provider minimum threshold, raw amounts, route identities, source and receipt/expiry times. Price impact is omitted because its unit has not been independently verified. Network, priority, setup and Fomo costs are not calculated; transfer restrictions and actual fills remain unverified. USDC amounts do not imply a cash-dollar balance. A no-route response means no usable quote was returned, not proof that all selling is impossible.

The existing private cache stores matching quotes for ten seconds of reuse and metadata for up to one day. Each preview expires 30 seconds after the quote request starts, without extending expiry for network latency or cache hits. No stale quote is served after refresh failure. The browser marks old snapshots expired, invalidates them when amount/tolerance changes, and retains their absolute expiry in copyable evidence. Only manual form submission makes requests; the expiry timer makes none. A shared eight-attempt/minute budget includes metadata calls and respects Retry-After cooldowns. Each request has a ten-second timeout, no redirects, and a 100 KB response limit. One-day pruning bounds old cache records; no quote history, new table or paid entitlement is introduced.

The source is Raydium routing, independent of the selected GeckoTerminal chart pool and actual Fomo quote. There is no account connection, transaction construction, signing or trading. The public demo remains synthetic. API compatibility contract 10 prevents this interface from reaching an older server without the route.
