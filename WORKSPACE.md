# Private Fomo research workspace

The Sites edition adds an invitation-only research workspace alongside the existing public synthetic demonstration. The original `site/` preview and Python momentum engine remain separate and unchanged.

## What works

- The two explicitly invited accounts sign in with the password provided by the owner. Passwords are salted PBKDF2-SHA256 hashes in the hosted `ACCOUNT_CREDENTIALS` secret, never in Git, HTML, or JavaScript assets.
- Opaque session cookies are Secure, HttpOnly and SameSite=Strict; only token hashes persist. Sessions expire after seven days and are revoked on logout. Login attempts are rate-limited through D1, including both email and source-IP buckets. Mutations require a same-origin request.
- Both accounts share a persistent watchlist, exact chain/contract identities, research status and notes. Optimistic revisions prevent one person silently overwriting another person's changes. Activity records attribute updates.
- The radar displays the original explicitly synthetic examples. The research desk includes an arithmetic scenario calculator. Open Fomo opens the official website; no Fomo session, wallet, signing key, private endpoint or order submission is integrated.
- Public GitHub Pages still publishes only the original public demo and the non-sensitive workspace release manifest. Private saved research lives only in the Sites database.

## GitHub is the interface source of truth

`web/` contains the new interface. A push to `main` runs the existing Python privacy and momentum tests, JavaScript syntax checks, the Worker build and focused authentication/storage tests. Only a successful GitHub Pages deployment advances `workspace-release.json`.

The Sites Worker checks that release pointer at most once per minute per warm instance, downloads the four interface files from the exact immutable Git commit, checks every SHA-256 digest, and switches the entire asset set together. Partial downloads, invalid hashes, incompatible API versions and unavailable GitHub service leave the last verified release (or embedded fallback) active. Open tabs show an update button so unsaved notes are not discarded.

**Automatic scope:** changes to `web/index.html`, `web/app.js`, `web/style.css`, and `web/favicon.svg`. Backend code, credentials, schemas, the bundled synthetic feed and the Python engine require a new Sites deployment. This is not unrestricted full-stack CI/CD. Do not claim that arbitrary GitHub changes are automatically deployed. Interface updates require the GitHub repository to remain publicly readable and GitHub Pages to remain enabled.

The frontend contract uses API version 1. Changes to API contracts must keep compatible interface behavior or intentionally change the release manifest version and deploy a matching Worker. The Worker never evaluates remotely fetched backend code.

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

Research notes are shared between both users. This is a research workspace, not a portfolio vault. The live-data integration described in DATA_ACCESS.md remains unresolved. A future real trading integration needs documented API access and a separately reviewed signing/confirmation flow; the current release does not place trades.

## Verification performed

Focused tests cover unknown accounts, bad passwords, cross-origin requests, unauthorized direct API access, cookie security flags, expiry/logout, durable throttling, persistence between both accounts, duplicate-contract conflicts and concurrent edits. The original nine Python checks remain required. Desktop and 390px browser checks cover login, saved notes, navigation and the paper calculator. Browser WebMCP navigation is feature-detected and uses the same visible navigation state; no trading tool is exposed.
