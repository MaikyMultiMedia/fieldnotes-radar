# Focused open-source selection

Reviewed September 21, 2026. No claim of an objectively best repository or guaranteed profit is made. Each dependency needs a concrete role and usable license.

| Project | Decision | License / evidence |
| --- | --- | --- |
| TradingView Lightweight Charts 5.2.1 | Reuse official standalone production build for candles, volume, crosshair and zoom. Pinned dependency and vendor asset; no third-party runtime script fetch. | Apache-2.0, local licenses/lightweight-charts-APACHE-2.0.txt and web/NOTICE.txt. Chart attribution links to TradingView. https://github.com/tradingview/lightweight-charts |
| Helius official SDK | Assessed as a potential complete Solana transaction-history/indexing provider; not installed or copied. Requires authorized provider access and a cost budget. | https://github.com/helius-labs/helius-sdk |
| Existing Fieldnotes momentum.py | Keep the repository's original tested rules, cap/holder evidence gates and paper calculation logic. Live provider data currently lacks the complete comparable inputs to claim those rules are active. | Existing collaborator-owned project; no new redistribution license asserted. |

Live data uses official documented HTTP interfaces. Private Fomo endpoints, reverse-engineered login sessions and unofficial scraped leaderboards were not integrated. Public trade size is not wallet PnL. Profit rankings require an authorized provider with historical cost basis; do not substitute volume, followers or unrealized gains.

Official references: https://www.tradingview.com/lightweight-charts/ ; https://github.com/tradingview/lightweight-charts/blob/master/LICENSE ; https://github.com/tradingview/lightweight-charts/blob/master/NOTICE ; https://apiguide.geckoterminal.com/ ; https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-wallet-v2-leaderboard
