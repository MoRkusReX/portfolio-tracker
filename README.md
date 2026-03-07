# MarketPilot

A cockpit for your investments.

Pure HTML/CSS/vanilla JS portfolio manager for stocks and crypto, served by a local Express proxy.

## Features

- Shared portfolio storage in a local SQLite database
- Persistent indicator candle history in a local SQLite database
- Persistent fundamentals cache in the same SQLite database (stocks + crypto)
- Stocks quotes/historical CSV via Stooq
- Crypto quotes/OHLC via CoinGecko
- Stock fundamentals via Financial Modeling Prep (FMP) with Finnhub fallback for unsupported symbols
- Token fundamentals via CoinGecko (optional DefiLlama protocol metrics)
- News via Marketaux (default), Yahoo, TickerTick, Alpha Vantage, and CryptoPanic with cached fallback
- Twitter/X section with Nitter links and optional proxy attempt
- Chart.js (UMD CDN) for allocation and price charts
- Import/export JSON (`data/portfolio.json` sample included)
- Dark/light theme and responsive layout

## Local Run

1. Make sure `node` and `python3` are installed.
2. Optional: create `.env` in the project root and set any of: `TWELVEDATA_API_KEY=...`, `COINMARKETCAP_API_KEY=...`, `FMP_API_KEY=...`, `FINNHUB_API_KEY=...`, `MARKETAUX_API_KEY=...`, `ALPHAVANTAGE_API_KEY=...`.
3. Run `./start-local.sh`.
4. Open the printed local URL, usually `http://127.0.0.1:5500/`.

The app, API, and SQLite-backed persistence now run on the same port. Portfolio changes are saved both to browser storage (fallback) and to the local server database. Indicator candles are persisted server-side and incrementally extended on later fetches.

## Phone / LAN Access

1. Start the app with `./start-local.sh`.
2. Use the `Phone/LAN` URL printed by the script, for example `http://192.168.1.20:5500/`.
3. Make sure your phone is on the same Wi-Fi/LAN as the computer running the app.
4. If your OS firewall prompts for access, allow inbound connections on port `5500`.

Because the portfolio now lives in the local SQLite store, the phone and desktop see the same holdings when they open the app through the same server.

## Docker

1. Optional: create a `.env` file with any of: `TWELVEDATA_API_KEY=...`, `COINMARKETCAP_API_KEY=...`, `FMP_API_KEY=...`, `FINNHUB_API_KEY=...`, `MARKETAUX_API_KEY=...`, `ALPHAVANTAGE_API_KEY=...`.
2. Run `docker compose up --build`.
3. Open `http://localhost:5500/` on the host machine, or `http://<your-lan-ip>:5500/` from another device on the same LAN.

The container stores the SQLite database at `/app/data/portfolio-tracker.db`, backed by the mounted local `./data` folder, so data survives container rebuilds.
