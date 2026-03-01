# Portfolio Tracker 2026 (file:// safe)

Pure HTML/CSS/vanilla JS portfolio manager for stocks and crypto that runs by double-clicking `index.html`.

## Features

- Local-first portfolio storage via `localStorage`
- Stocks quotes/historical CSV via Stooq
- Crypto quotes/OHLC via CoinGecko
- News via Yahoo Finance RSS / CryptoPanic with cached fallback
- Twitter/X section with Nitter links and optional proxy attempt
- Chart.js (UMD CDN) for allocation and price charts
- Import/export JSON (`data/portfolio.json` sample included)
- Dark/light theme and responsive layout

## Run

1. Run start-local.sh
2. Add assets, refresh prices, and your portfolio is persisted automatically.
3. If a feed/API is blocked by browser CORS from `file://`, cached data or fallback links are shown.
