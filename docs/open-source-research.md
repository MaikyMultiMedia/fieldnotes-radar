# Focused open-source selection

Reviewed September 21, 2026. No claim of an objectively best repository or guaranteed profit is made. Each dependency needs a concrete role and usable license.

| Project | Decision | License / evidence |
| --- | --- | --- |
| TradingView Lightweight Charts 5.2.1 | Reuse official standalone production build for candles, volume, crosshair and zoom. Pinned dependency and vendor asset; no third-party runtime script fetch. | Apache-2.0, local licenses/lightweight-charts-APACHE-2.0.txt and web/NOTICE.txt. Chart attribution links to TradingView. https://github.com/tradingview/lightweight-charts |
| Helius official SDK | Assessed as a potential complete Solana transaction-history/indexing provider; not installed or copied. Requires authorized provider access and a cost budget. | https://github.com/helius-labs/helius-sdk |
| Existing Fieldnotes momentum.py | Keep the repository's original tested rules, cap/holder evidence gates and paper calculation logic. Live provider data currently lacks the complete comparable inputs to claim those rules are active. | Existing collaborator-owned project; no new redistribution license asserted. |

Live data uses official documented HTTP interfaces. Private Fomo endpoints, reverse-engineered login sessions and unofficial scraped leaderboards were not integrated. Public trade size is not wallet PnL. Profit rankings require an authorized provider with historical cost basis; do not substitute volume, followers or unrealized gains.

Official references: https://www.tradingview.com/lightweight-charts/ ; https://github.com/tradingview/lightweight-charts/blob/master/LICENSE ; https://github.com/tradingview/lightweight-charts/blob/master/NOTICE ; https://apiguide.geckoterminal.com/ ; https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-wallet-v2-leaderboard

GoPlus token checks use its official documented HTTP service directly; no SDK or proprietary detection code is copied. The vendor describes the API as open and license-free (https://www.gopluslabs.io/en/security-api). API service access is distinct from open-sourcing its detection algorithms. The original adapter is intentionally small and pinned to explicit field/network contracts. Solana public RPC documentation was assessed but no public RPC dependency was added: that endpoint is not intended as production infrastructure (https://solana.com/docs/references/clusters).

## GMGN official client — protocol reference

Reviewed https://github.com/GMGNAI/gmgn-skills (MIT, copyright GMGN). Its documented read-only authentication and wallet_profits contract informed an original small server adapter; no CLI, third-party skills or signing dependencies were installed or copied. GMGN labels its public demo access testing-only and requires a personal key for production. Provider profit estimates do not establish Fomo identities, execution quality or a validated strategy.

## Raydium public quote protocol

Reviewed the official Raydium REST and Trade API docs and SDK endpoint constants. The SDK is GPL-3.0 (https://github.com/raydium-io/raydium-sdk-V2/blob/master/LICENSE); no SDK code, dependency, transaction builder or signing example is copied or installed. An original small HTTP adapter uses the published read-only metadata/quote contracts. Protocol access does not imply a separate redistribution license. Sources: https://docs.raydium.io/sdk-api/rest-api and https://docs.raydium.io/sdk-api/trade-api.
