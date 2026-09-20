# Data access and public deployment

Reviewed September 20, 2026. This edition currently serves synthetic examples only. It intentionally contains no personal-source adapters or collected observations.

PumpPortal terms section 6 restrict publication/distribution and third-party access absent express authorization, and describe a personal limited license: https://pumpportal.fun/legal/

DEX Screener terms restrict unauthorized third-party availability and directly competing services; public use of this particular product needs permission/scope review: https://docs.dexscreener.com/api/api-terms-and-conditions

Fomo account/feed/chat collection remains unauthorized. No logged-in session is accessed or reused: https://fomo.family/terms

## Next implementation

Obtain written public-display/redistribution permission or select a provider whose documented license covers the intended hosted service. Then implement a replaceable adapter that outputs only an allowlisted public schema: exact mint, pool, source URL, source/receipt timestamps, cap/price, nullable liquidity, properly scoped volume and holder methodology. Never merge wallet or account fields into this public schema. Test malformed responses and private-field rejection.

Host the collector/API separately from static GitHub Pages, with cache/rate limits, TLS, source attribution, explicit retention policy and budget. Data source cadence is not a detection latency guarantee. Exact launch time requires chain evidence; since-launch volume requires complete trade coverage. Authentication is unnecessary for a truly public read-only feed, but required before adding private user settings or holdings.

## Draft permission request (not sent)

We are developing a small read-only token-launch research dashboard for public viewing. We want to display creation events and derived market-change alerts with attribution and source links, without trading or reselling a raw API. Please confirm whether your license permits this, any user/traffic limits, retention restrictions, attribution requirements and applicable pricing. We will keep public live data disabled pending your response.
