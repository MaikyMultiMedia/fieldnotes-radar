# Market data access

Reviewed September 21, 2026.

## Active private Sites integration

The owner authorized live public token data for the two-user research workspace. This edition uses GeckoTerminal's documented public API without an API key or a paid subscription. Its API guide explicitly describes building apps with live prices, volume, liquidity and historical charts. Source attribution and exact pool links appear in the interface.

- Public API guide: https://apiguide.geckoterminal.com/
- FAQ, rate limits and nullable market cap: https://apiguide.geckoterminal.com/faq
- Public API product page: https://www.geckoterminal.com/dex-api
- OHLCV schema reference: https://docs.coingecko.com/reference/pool-ohlcv-contract-address

Official pages describe differing free limits (10 or 30 calls/minute); this implementation caps upstream attempts at eight/minute across the workspace and respects provider cooldowns. Cache sharing and minute refreshes reduce load. This is a polling research feed, not a real-time execution quote or guaranteed detection latency.

The adapter displays only exact token/pool identities, prices, price changes where supported, pool liquidity, 24-hour pool volume, buy/sell counts, nullable market cap, separate FDV, pool creation time and OHLCV. The owner also requested public large-buy research: the trades endpoint now reads public transaction sender addresses and token transfers for selected pools. It does not request private account profiles or holdings. Unknown values remain unknown. The UI's receipt time is not represented as a provider observation timestamp. Pool creation is not token launch evidence, and pool volume is not since-launch volume.

Server-side access requires the existing app session. Requests go to the fixed public API origin with public search terms/contracts only; notes, passwords, user identities and session cookies are never forwarded. Short-lived cached responses and rate budgets persist in the Sites database. See WORKSPACE.md for retention, limits and stale-data behavior.

The separate GitHub Pages demo retains its synthetic fixtures. This change does not turn that public demo into a live-data redistribution service.

## Fomo scope

Fomo remains the manual trading destination: https://fomo.family/

No official Fomo market/trading API access has been provisioned. No Fomo session, feed, chat, account endpoint or dashboard is scraped or reused. Listing a pool on GeckoTerminal does not establish Fomo availability. Users must match the network and exact token contract in Fomo and review its actual quote themselves. There is no order submission, wallet signing, account linkage, automated buying/selling or trade history import.

## Other providers

PumpPortal and DEX Screener are not integrated. Earlier restrictions noted for their public redistribution remain outside the scope of this release:
- https://pumpportal.fun/legal/
- https://docs.dexscreener.com/api/api-terms-and-conditions

The original permission-request draft was never sent. A different provider or wider public service requires its own access and usage review. No provider permission or commercial license beyond the documented public API access is claimed.

## Public swaps and optional profit intelligence

- Pool trade schema: https://docs.coingecko.com/reference/pool-trades-contract-address
- Free endpoint verified September 21, 2026: GET /api/v2/networks/solana/pools/{pool}/trades returned up to 300 documented public swaps. Verification records stay outside Git.
- Official optional profit contract: https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-wallet-v2-leaderboard
- Ranking interval/sort release: https://data.birdeye.so/docs/changelog/20260910-release-wallet-leaderboard-filters

Public swap observations are cached only in the private workspace with one-day pruning on successful fetches. The free feed cannot calculate complete wallet performance, identify beneficial owners, or establish Fomo profiles. The optional ranking adapter is disabled without an operator-configured key; the user chose free features first. No paid access has been provisioned. See WORKSPACE.md for precise cohort, window, caching and provenance restrictions.
