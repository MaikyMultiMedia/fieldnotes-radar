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

The Sites Worker checks that release pointer at most once per minute per warm instance, downloads the four interface files from the exact immutable Git commit, checks every SHA-256 digest, and switches the entire asset set together. Partial downloads, invalid hashes, incompatible API versions and unavailable GitHub service leave the last verified release (or embedded fallback) active. Open tabs show an update button so unsaved notes are not discarded.

**Automatic scope:** changes to `web/index.html`, `web/app.js`, `web/style.css`, and `web/favicon.svg`. Backend code, credentials, schemas, market adapters and the Python engine require a new Sites deployment. This is not unrestricted full-stack CI/CD. Do not claim that arbitrary GitHub changes are automatically deployed. Interface updates require the GitHub repository to remain publicly readable and GitHub Pages to remain enabled.

The frontend contract uses API version 2. Changes to API contracts must keep compatible interface behavior or intentionally change the release manifest version and deploy a matching Worker. The Worker never evaluates remotely fetched backend code.

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

Authenticated GET /api/market supports trending, new, search and exact-token modes. GET /api/market/chart verifies the selected contract belongs to the selected pool before requesting OHLCV. The server contacts only the fixed GeckoTerminal API origin; clients cannot provide upstream URLs. It returns an allowlisted schema without account or wallet fields. Credentials, notes and user identities are never sent to the provider.

Additive migration 0001 creates market_cache and market_budget without changing saved research or sessions. Cache hits share snapshots for 60 seconds; eight upstream attempts per minute are allowed across the workspace. Provider 429 responses set a shared cooldown. Refresh failures may serve the original snapshot for at most 15 minutes, labeled stale with its original receipt time. Older snapshots return unavailable; there is no synthetic fallback. Cache records older than a day are pruned after successful fetches. Requests have an eight-second timeout and 1.5 MB response limit.

Only the visible radar or research view refreshes each minute; refresh pauses while the browser is hidden or a form is being edited. Provider data can lag. Charts label their last candle time, use actual reported intervals and do not invent missing candles. Null market cap is never substituted with FDV. Quote-side pools omit unsupported base-token changes and valuation fields. Holders, exact launch time, Fomo availability, tradable size and Fomo execution quotes remain unknown. The Python alert engine is not connected, and there are no background trade alerts.

API version 2 prevents the updated interface from loading on the older Worker. Deploy the matching backend/migration through Sites; later compatible web-only changes continue to update through checked GitHub releases. Market tests cover identity, missing/zero/malformed values, quote-side semantics, chart bounds, cache freshness, outage fallback, cooldowns, request budgets and authenticated API access.
