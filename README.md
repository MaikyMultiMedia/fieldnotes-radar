# Fieldnotes · shared launch research

**Private workspace:** The Sites-hosted edition now adds the two invited accounts, shared saved token research, and automatic checked GitHub interface updates. See [WORKSPACE.md](WORKSPACE.md) for setup, verification and integration limits. The public demo below remains separate. The private workspace now includes live GeckoTerminal token data and charts. Neither edition places trades; the public demo remains synthetic.

A clean public edition of a read-only crypto research dashboard. Two views: **Launch Radar** and **Research Desk**. Designed for Windows, mobile browsers and collaborative development.

**Public site: https://maikymultimedia.github.io/fieldnotes-radar/**

## Current status

The GitHub Pages site is a **clearly labeled synthetic demonstration**, not a live token feed. Public redistribution permission for the original feed has not been established. It has no holdings, wallet addresses, personal screenshots, credentials, transaction history, trades or account connection. No fake login is present. Anyone can view; GitHub accounts are used to contribute to the source.

The repository includes the tested `momentum.py` detection/paper-calculation engine so collaborators can continue the real implementation. It is not connected to the demo frontend. It supports same-mint/pool cap-change signals (up 50% or down 30%, at least $2,000, within 5 minutes), a separate evidence-gated full-holder rule, cooldowns, and next-observation $5 paper valuation. Neither engine nor frontend sends transactions.

## Run locally

Python 3.11+ is sufficient; no third-party runtime dependencies.

```powershell
git clone https://github.com/MaikyMultiMedia/fieldnotes-radar.git
cd fieldnotes-radar
python app.py
```

Open http://127.0.0.1:8877. The hosted HTTPS link is the simplest way to view on iPhone. It works independently of the original personal dashboard and PC.

## Work together with Claude, ChatGPT or another editor

1. Clone or fork this repository and give the coding tool this folder.
2. Read `AGENTS.md` and `CONTRIBUTING.md`.
3. Work on a branch, run checks, and open a pull request.
4. Merge reviewed changes to `main`; GitHub Actions tests and republishes the static demo.

The owner can invite a friend using their GitHub username. Source collaboration access is separate from website authentication. No coupling to ASTRA or another local system is required.

## Files

- `site/`: responsive public UI and deliberately fictional fixtures.
- `momentum.py`: pure detection and paper-mark calculations with SQLite integration helpers.
- `app.py`: local demo server with an explicit static-file allowlist and isolated optional engine storage.
- `tests/`: engine and privacy-boundary tests.
- `.github/workflows/pages.yml`: checks plus GitHub Pages deployment.
- `DATA_ACCESS.md`: active market provider, source scope and integration limits.

```powershell
python -m unittest discover -s tests -v
node --check site/app.js
```

## Hosting and cost

GitHub Pages serves the static preview; no server, wallet, paid data subscription or AI API is provisioned. The preview makes no external data/API calls. GitHub Pages does not run Python or continuous collectors. A future live edition requires authorized source redistribution, an always-on backend, storage, caching and an explicit operating budget. Do not publish the original personal server or database.

No open-source license grant has been selected yet. Repository collaborators may work on this project; choose a license before offering broader redistribution rights.

The red-alert demo button shows a synthetic five-minute cap/holder change. Live personal alerts poll every five seconds; the public preview does not collect live data. Holder-only detection requires comparable complete counts, at least 10 additional owners and a doubling within five minutes. Sampled top-holder lists cannot trigger it.
