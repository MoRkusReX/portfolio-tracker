// Server entrypoint that serves the app, proxies external APIs, and owns SQLite-backed shared persistence.
// Reads local config files and serves static assets.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createFundamentalsService } = require('./scripts/fundamentals-service.js');

// Loads .env values without introducing another dependency.
function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) return;
    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) return;
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

loadDotEnv();

// Main Express app instance for UI and API routes.
const app = express();
// Configures the listening port for both UI and API traffic.
const PORT = Math.max(1, Number(process.env.PORT || 5500) || 5500);
// Configures the listening host so the app can be exposed on the LAN.
const HOST = String(process.env.HOST || '0.0.0.0').trim() || '0.0.0.0';
// Controls how long proxied Stocktwits responses stay in memory.
const STOCKTWITS_CACHE_TTL_MS = 60 * 1000;
// Keeps short-lived Stocktwits responses in memory between requests.
const stocktwitsCache = new Map();
// Holds the Twelve Data API key for server-side indicator and quote requests.
const TWELVEDATA_API_KEY = String(process.env.TWELVEDATA_API_KEY || '').trim();
// Holds the CoinMarketCap API key for server-side crypto quote requests.
const COINMARKETCAP_API_KEY = String(process.env.COINMARKETCAP_API_KEY || '').trim();
// Holds the Financial Modeling Prep API key for stock fundamentals requests.
const FMP_API_KEY = String(process.env.FMP_API_KEY || '').trim();
// Holds the Marketaux API key for server-side stock news requests.
const MARKETAUX_API_KEY = String(process.env.MARKETAUX_API_KEY || '').trim();
// Holds the Alpha Vantage API key for server-side stock news requests.
const ALPHAVANTAGE_API_KEY = String(process.env.ALPHAVANTAGE_API_KEY || '').trim();
// Chooses the Python interpreter used for the SQLite bridge helper.
const PYTHON_BIN = String(process.env.PYTHON_BIN || 'python3').trim() || 'python3';
// Resolves the on-disk SQLite database location.
const DB_PATH = path.resolve(__dirname, String(process.env.DB_PATH || path.join('data', 'portfolio-tracker.db')));
// Points to the Python helper that executes SQLite operations.
const DB_SCRIPT = path.join(__dirname, 'scripts', 'sqlite_store.py');
// Defines warmup and incremental fetch sizes for each supported indicator interval.
const INDICATOR_POLICY = {
  '1day': { warmup: 300, incremental: 12, maxCandles: 360, bucket: 'day' },
  '1week': { warmup: 260, incremental: 8, maxCandles: 300, bucket: 'week' },
  '1month': { warmup: 120, incremental: 5, maxCandles: 160, bucket: 'month' }
};
const INDICATOR_RETENTION_MS = 1000 * 60 * 60 * 24 * 10;
const NEWS_CACHE_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;
const NEWS_CACHE_PRUNE_MIN_INTERVAL_MS = 1000 * 60 * 5;
let newsCachePruneState = { lastRunAt: 0, running: null };

app.use(cors({ origin: true, methods: ['GET', 'PUT', 'OPTIONS'] }));
app.use(express.json({ limit: '1mb' }));

// Shared axios config for external requests.
// Provides a browser-like user agent for upstream services that gate bot traffic.
const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

// Shared axios instance for upstream text and proxy fetches.
const http = axios.create({
  timeout: 10000,
  responseType: 'text',
  headers: {
    'User-Agent': BROWSER_UA
  }
});

// Converts a timestamp into the ISO week bucket used by weekly indicator freshness checks.
function getIsoWeekKey(ts) {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return '';
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Maps a timestamp into its daily, weekly, or monthly freshness bucket.
function indicatorBucketKey(bucketType, ts) {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return '';
  if (bucketType === 'week') return getIsoWeekKey(ts);
  if (bucketType === 'month') return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

// Accepts either the wrapped or raw portfolio shape and normalizes it.
function normalizePortfolioShape(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw.portfolio && typeof raw.portfolio === 'object' ? raw.portfolio : raw;
  if (!candidate || !Array.isArray(candidate.stocks) || !Array.isArray(candidate.crypto)) return null;
  return {
    stocks: candidate.stocks,
    crypto: candidate.crypto
  };
}

// Runs a command against the Python SQLite bridge and parses the JSON response.
async function runDb(command, args, input) {
  const commandArgs = [DB_SCRIPT, DB_PATH, command].concat(Array.isArray(args) ? args : []);
  const options = {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  };
  if (input !== undefined) options.input = JSON.stringify(input);
  const stdout = String(execFileSync(PYTHON_BIN, commandArgs, options) || '').trim();
  if (!stdout) return null;
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Invalid DB response: ${stdout.slice(0, 200)}`);
  }
  if (parsed && parsed.error) throw new Error(parsed.error);
  return parsed;
}

// Provides server-side fundamentals orchestration with provider adapters and DB-backed cache cadence.
const fundamentalsService = createFundamentalsService({
  runDb,
  fmpApiKey: FMP_API_KEY,
  userAgent: BROWSER_UA
});

// Chooses fetch sizes and retention limits for a requested indicator interval.
function indicatorPolicy(interval, requestedOutputsize) {
  const base = INDICATOR_POLICY[interval] || INDICATOR_POLICY['1day'];
  const requested = Math.max(1, Math.min(5000, Number(requestedOutputsize || base.warmup) || base.warmup));
  return {
    warmup: Math.max(base.warmup, requested),
    incremental: base.incremental,
    maxCandles: base.maxCandles,
    bucket: base.bucket
  };
}

// Fetches fresh indicator candles from Twelve Data when the local cache is stale.
async function fetchIndicatorSeries(symbol, interval, outputsize) {
  if (!TWELVEDATA_API_KEY) {
    const err = new Error('twelvedata_key_missing');
    err.statusCode = 500;
    throw err;
  }
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${encodeURIComponent(outputsize)}&apikey=${encodeURIComponent(TWELVEDATA_API_KEY)}`;
  const response = await axios.get(url, {
    timeout: 10000,
    headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json,text/plain,*/*' },
    validateStatus: () => true
  });

  if (response.status !== 200) {
    const detail = typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data || {});
    const err = new Error(String(detail || 'Twelve Data time_series failed').slice(0, 240));
    err.statusCode = response.status === 429 ? 429 : (response.status || 500);
    err.errorCode = response.status === 429 ? 'twelvedata_rate_limited' : 'twelvedata_failed';
    throw err;
  }

  const data = response.data || {};
  if (!data || data.status === 'error' || !Array.isArray(data.values)) {
    const detail = String((data && (data.message || data.code)) || 'No time series values returned').slice(0, 240);
    const limited = /limit|quota|too many/i.test(String(data && data.message || ''));
    const err = new Error(detail);
    err.statusCode = limited ? 429 : 500;
    err.errorCode = limited ? 'twelvedata_rate_limited' : 'twelvedata_failed';
    throw err;
  }

  return {
    meta: data.meta || {},
    values: data.values,
    status: data.status || 'ok',
    source: 'twelvedata',
    fetchedAt: Date.now()
  };
}

// Reads the latest persisted indicator candles from SQLite.
async function getStoredIndicatorRows(symbol, interval, limit) {
  const payload = await runDb('get_candles', [symbol, interval, String(limit)]);
  return payload || { values: [], count: 0, latestFetchedAt: 0 };
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Normalizes a stock symbol into the Stooq symbol format used by fallback routes.
function normalizeStockSymbol(symbol) {
  const raw = String(symbol || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.includes('.') ? raw : `${raw}.us`;
}

// Parses a simple CSV string into an array of row objects.
function parseCsv(text) {
  const lines = String(text || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = String(cols[i] || '').trim(); });
    return row;
  });
}

// Safely converts an arbitrary value into a finite number or null.
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Converts a Twelve Data quote row into the quote shape expected by the UI.
function normalizeTdQuoteRow(row, symbolFallback) {
  const symbol = String((row && (row.symbol || row.meta && row.meta.symbol)) || symbolFallback || '').trim().toUpperCase();
  const close = num(row && (row.close != null ? row.close : row.price));
  const previousClose = num(row && row.previous_close);
  const change = num(row && row.change);
  const percentChange = num(row && (row.percent_change != null ? row.percent_change : row.change_percent));
  return {
    symbol,
    price: close,
    open: num(row && row.open),
    high: num(row && row.high),
    low: num(row && row.low),
    volume: num(row && row.volume),
    regularMarketPrice: close,
    regularMarketPreviousClose: previousClose,
    change,
    changePercent: percentChange,
    fetchedAt: Date.now(),
    source: 'twelvedata'
  };
}

function yahooToStooqSymbol(yahooSymbol) {
  const s = String(yahooSymbol || '').trim().toUpperCase();
  if (!s) return '';
  if (s.endsWith('.L')) return `${s.slice(0, -2).toLowerCase()}.uk`;
  if (s.endsWith('.IR')) return `${s.slice(0, -3).toLowerCase()}.ie`;
  return normalizeStockSymbol(s.toLowerCase());
}

async function stooqQuoteAsYahoo(symbol) {
  const stooqSymbol = yahooToStooqSymbol(symbol);
  if (!stooqSymbol) return null;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
  const response = await http.get(url);
  const rows = parseCsv(response.data);
  const row = rows[0];
  const price = row ? num(row.Close) : null;
  if (!row || price == null) return null;
  return {
    symbol: String(symbol || '').trim().toUpperCase(),
    regularMarketPrice: price,
    regularMarketOpen: num(row.Open),
    regularMarketDayHigh: num(row.High),
    regularMarketDayLow: num(row.Low),
    regularMarketVolume: num(row.Volume),
    regularMarketPreviousClose: null,
    marketState: 'REGULAR',
    sourceInterval: 15
  };
}

async function stooqQuoteFallbackPayload(symbolsCsv) {
  const symbols = String(symbolsCsv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const settled = await Promise.allSettled(symbols.map((s) => stooqQuoteAsYahoo(s)));
  const result = settled
    .filter((x) => x.status === 'fulfilled' && x.value)
    .map((x) => x.value);
  return {
    quoteResponse: {
      result,
      error: null
    },
    _fallback: 'stooq'
  };
}

async function yahooV8ChartQuoteAsYahoo(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return null;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=1m&includePrePost=true&events=div,splits`;
  const response = await http.get(url, { validateStatus: () => true });
  if (response.status !== 200) return null;
  let payload;
  try {
    payload = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  } catch {
    return null;
  }
  const result = payload && payload.chart && Array.isArray(payload.chart.result) ? payload.chart.result[0] : null;
  if (!result) return null;
  const meta = result.meta || {};
  const quote = result.indicators && result.indicators.quote && result.indicators.quote[0] ? result.indicators.quote[0] : {};
  const closes = Array.isArray(quote.close) ? quote.close : [];
  const opens = Array.isArray(quote.open) ? quote.open : [];
  const highs = Array.isArray(quote.high) ? quote.high : [];
  const lows = Array.isArray(quote.low) ? quote.low : [];
  const vols = Array.isArray(quote.volume) ? quote.volume : [];

  const lastNum = (arr) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      const v = num(arr[i]);
      if (v != null) return v;
    }
    return null;
  };

  const price = num(meta.regularMarketPrice) ?? lastNum(closes);
  if (price == null) return null;
  return {
    symbol: s,
    regularMarketPrice: price,
    regularMarketOpen: num(meta.regularMarketOpen) ?? lastNum(opens),
    regularMarketDayHigh: num(meta.regularMarketDayHigh) ?? lastNum(highs),
    regularMarketDayLow: num(meta.regularMarketDayLow) ?? lastNum(lows),
    regularMarketVolume: num(meta.regularMarketVolume) ?? lastNum(vols),
    regularMarketPreviousClose: num(meta.chartPreviousClose) ?? num(meta.previousClose),
    preMarketPrice: num(meta.preMarketPrice),
    postMarketPrice: num(meta.postMarketPrice),
    marketState: meta.marketState || 'REGULAR',
    exchange: meta.exchangeName || meta.fullExchangeName || null,
    sourceInterval: meta.dataGranularity || '1m'
  };
}

async function yahooV8ChartQuoteFallbackPayload(symbolsCsv) {
  const symbols = String(symbolsCsv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const settled = await Promise.allSettled(symbols.map((s) => yahooV8ChartQuoteAsYahoo(s)));
  const result = settled
    .filter((x) => x.status === 'fulfilled' && x.value)
    .map((x) => x.value);
  if (!result.length) return null;
  return {
    quoteResponse: {
      result,
      error: null
    },
    _fallback: 'yahoo-v8-chart'
  };
}

async function twelveDataQuoteAsYahoo(symbol) {
  if (!TWELVEDATA_API_KEY) return null;
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return null;
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(s)}&apikey=${encodeURIComponent(TWELVEDATA_API_KEY)}`;
  const response = await axios.get(url, {
    timeout: 10000,
    headers: { 'User-Agent': BROWSER_UA }
  });
  const row = response && response.data ? response.data : null;
  if (!row || row.status === 'error') return null;
  const price = num(row.close || row.price);
  if (price == null) return null;
  return {
    symbol: s,
    regularMarketPrice: price,
    regularMarketOpen: num(row.open),
    regularMarketDayHigh: num(row.high),
    regularMarketDayLow: num(row.low),
    regularMarketVolume: num(row.volume),
    regularMarketPreviousClose: num(row.previous_close),
    marketState: 'REGULAR',
    sourceInterval: row.interval || null
  };
}

async function twelveDataQuoteFallbackPayload(symbolsCsv) {
  if (!TWELVEDATA_API_KEY) return null;
  const symbols = String(symbolsCsv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const settled = await Promise.allSettled(symbols.map((s) => twelveDataQuoteAsYahoo(s)));
  const result = settled
    .filter((x) => x.status === 'fulfilled' && x.value)
    .map((x) => x.value);
  if (!result.length) return null;
  return {
    quoteResponse: {
      result,
      error: null
    },
    _fallback: 'twelvedata'
  };
}

// GET /api/stocks/quotes?symbols=AAPL,MSFT
// TwelveData batch quote proxy for stocks-only refresh, normalized for the frontend quote service.
app.get('/api/stocks/quotes', async (req, res) => {
  try {
    const symbols = String(req.query.symbols || '')
      .split(',')
      .map((s) => String(s || '').trim().toUpperCase())
      .filter(Boolean);

    if (!symbols.length) {
      return res.status(400).json({ error: 'missing_symbols' });
    }
    if (!TWELVEDATA_API_KEY) {
      return res.status(500).json({ error: 'twelvedata_key_missing' });
    }

    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${encodeURIComponent(TWELVEDATA_API_KEY)}`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json,text/plain,*/*' },
      validateStatus: () => true
    });

    if (response.status === 429) {
      const detail = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data || {});
      return res.status(429).json({
        error: 'twelvedata_rate_limited',
        status: 429,
        detail: String(detail || 'Rate limited').slice(0, 240)
      });
    }

    if (response.status !== 200) {
      const detail = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data || {});
      return res.status(500).json({
        error: 'twelvedata_failed',
        status: response.status,
        detail: String(detail || 'TwelveData request failed').slice(0, 240)
      });
    }

    const data = response.data || {};
    if (data && typeof data === 'object' && !Array.isArray(data) && (data.status === 'error' || data.code || data.message) && !data.symbol) {
      const tdStatus = String(data.status || '').toLowerCase();
      const maybeRateLimit = response.status === 429 || /limit|quota|too many/i.test(String(data.message || ''));
      return res.status(maybeRateLimit ? 429 : 500).json({
        error: maybeRateLimit ? 'twelvedata_rate_limited' : 'twelvedata_failed',
        status: maybeRateLimit ? 429 : 500,
        detail: String(data.message || data.code || 'TwelveData error').slice(0, 240),
        upstream: data
      });
    }
    const quotes = {};

    // Single-symbol responses often come back as a single object; multi-symbol is keyed by symbol.
    if (data && typeof data === 'object' && !Array.isArray(data) && data.symbol) {
      const row = normalizeTdQuoteRow(data, data.symbol);
      if (row.symbol) quotes[row.symbol] = row;
    } else {
      symbols.forEach((sym) => {
        const rawRow = data[sym] || data[sym.toUpperCase()] || data[sym.toLowerCase()];
        if (!rawRow) return;
        if (rawRow && rawRow.status === 'error') return;
        const row = normalizeTdQuoteRow(rawRow, sym);
        if (row.symbol) quotes[row.symbol] = row;
      });

      // Fallback scan if keys are not exact.
      if (!Object.keys(quotes).length && data && typeof data === 'object') {
        Object.keys(data).forEach((k) => {
          const rawRow = data[k];
          if (!rawRow || typeof rawRow !== 'object' || rawRow.status === 'error') return;
          const row = normalizeTdQuoteRow(rawRow, k);
          if (row.symbol) quotes[row.symbol] = row;
        });
      }
    }

    if (!Object.keys(quotes).length) {
      return res.status(500).json({
        error: 'twelvedata_failed',
        status: 500,
        detail: 'No valid quote rows returned by TwelveData',
        upstreamType: Array.isArray(data) ? 'array' : typeof data
      });
    }

    return res.json({
      quotes,
      source: 'twelvedata',
      fetchedAt: Date.now()
    });
  } catch (err) {
    return res.status(500).json({
      error: 'twelvedata_failed',
      status: err && err.response ? err.response.status : 500,
      detail: String((err && err.message) || 'TwelveData proxy failed').slice(0, 240)
    });
  }
});

// GET /api/twelvedata/time-series?symbol=TSLA&interval=1day&outputsize=300
// Proxies Twelve Data time_series for the Indicators panel using the server-side API key.
app.get('/api/portfolio', async (req, res) => {
  try {
    const stored = await runDb('get_state', ['portfolio']);
    return res.json({
      portfolio: normalizePortfolioShape(stored && stored.payload),
      updatedAt: Number(stored && stored.updatedAt || 0) || 0
    });
  } catch (err) {
    return res.status(500).json({
      error: 'portfolio_read_failed',
      detail: String(err && err.message || 'Failed to load portfolio').slice(0, 240)
    });
  }
});

app.put('/api/portfolio', async (req, res) => {
  try {
    const current = await runDb('get_state', ['portfolio']);
    const currentUpdatedAt = Number(current && current.updatedAt || 0) || 0;
    const baseUpdatedAt = Math.max(0, Number(req.body && req.body.baseUpdatedAt || 0) || 0);
    const portfolio = normalizePortfolioShape(req.body);
    if (!portfolio) {
      return res.status(400).json({ error: 'invalid_portfolio' });
    }
    if (baseUpdatedAt !== currentUpdatedAt) {
      return res.status(409).json({
        error: 'portfolio_conflict',
        detail: 'Stale portfolio revision',
        portfolio: normalizePortfolioShape(current && current.payload),
        updatedAt: currentUpdatedAt
      });
    }
    const result = await runDb('set_state', ['portfolio'], portfolio);
    return res.json({
      ok: true,
      portfolio,
      updatedAt: Number(result && result.updatedAt || 0) || Date.now()
    });
  } catch (err) {
    return res.status(500).json({
      error: 'portfolio_write_failed',
      detail: String(err && err.message || 'Failed to save portfolio').slice(0, 240)
    });
  }
});

// Builds a stable SQLite key for per-scope news snapshots.
function dbNewsStateKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) return '';
  return `news:${key}`;
}

// Builds a stable SQLite key for per-scope chart snapshots.
function dbChartStateKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) return '';
  return `chart:${key}`;
}

// Removes stale news snapshots from SQLite no more than once per interval window.
async function pruneStaleNewsCache() {
  const now = Date.now();
  if (newsCachePruneState.running) return newsCachePruneState.running;
  if (now - Number(newsCachePruneState.lastRunAt || 0) < NEWS_CACHE_PRUNE_MIN_INTERVAL_MS) return null;
  newsCachePruneState.running = runDb('prune_stale_state_prefix', ['news:', String(NEWS_CACHE_RETENTION_MS)])
    .then(() => {
      newsCachePruneState.lastRunAt = Date.now();
    })
    .catch((err) => {
      console.warn('Failed to prune stale news cache:', err && err.message ? err.message : err);
      newsCachePruneState.lastRunAt = Date.now();
    })
    .finally(() => {
      newsCachePruneState.running = null;
    });
  return newsCachePruneState.running;
}

// Reads the latest persisted news payload for a given cache key.
app.get('/api/news-cache', async (req, res) => {
  try {
    await pruneStaleNewsCache();
    const key = String(req.query.key || '').trim();
    const stateKey = dbNewsStateKey(key);
    if (!stateKey) {
      return res.status(400).json({ error: 'missing_key' });
    }
    const stored = await runDb('get_state', [stateKey]);
    const payload = stored && stored.payload && typeof stored.payload === 'object' ? stored.payload : {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    return res.json({
      found: !!(stored && stored.found),
      key,
      items,
      fetchedAt: Number(payload.fetchedAt || 0) || 0,
      source: String(payload.source || '').trim() || null,
      updatedAt: Number(stored && stored.updatedAt || 0) || 0
    });
  } catch (err) {
    return res.status(500).json({
      error: 'news_cache_read_failed',
      detail: String(err && err.message || 'Failed to load news cache').slice(0, 240)
    });
  }
});

// Persists the latest fetched news payload for a given cache key.
app.put('/api/news-cache', async (req, res) => {
  try {
    await pruneStaleNewsCache();
    const key = String(req.body && req.body.key || '').trim();
    const stateKey = dbNewsStateKey(key);
    if (!stateKey) {
      return res.status(400).json({ error: 'missing_key' });
    }
    const items = Array.isArray(req.body && req.body.items) ? req.body.items : null;
    if (!items) {
      return res.status(400).json({ error: 'invalid_items' });
    }
    const payload = {
      items,
      fetchedAt: Math.max(0, Number(req.body && req.body.fetchedAt || 0) || Date.now()),
      source: String(req.body && req.body.source || '').trim() || null
    };
    const result = await runDb('set_state', [stateKey], payload);
    return res.json({
      ok: true,
      key,
      updatedAt: Number(result && result.updatedAt || 0) || Date.now()
    });
  } catch (err) {
    return res.status(500).json({
      error: 'news_cache_write_failed',
      detail: String(err && err.message || 'Failed to save news cache').slice(0, 240)
    });
  }
});

// Proxies Marketaux stock news using a server-held API key.
app.get('/api/news/marketaux', async (req, res) => {
  try {
    if (!MARKETAUX_API_KEY) {
      return res.status(500).json({ error: 'marketaux_key_missing' });
    }
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    const query = String(req.query.query || '').trim();
    const general = String(req.query.general || '0') === '1' || !symbol;
    const params = new URLSearchParams();
    params.set('api_token', MARKETAUX_API_KEY);
    params.set('language', 'en');
    params.set('limit', '20');
    params.set('sort', 'published_desc');
    params.set('filter_entities', 'true');
    if (query) {
      params.set('keywords', query);
    } else if (general) {
      params.set('keywords', 'stock market');
    } else {
      params.set('symbols', symbol);
    }
    const url = `https://api.marketaux.com/v1/news/all?${params.toString()}`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json,text/plain,*/*' },
      validateStatus: () => true
    });
    if (response.status !== 200) {
      const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
      return res.status(response.status === 429 ? 429 : 500).json({
        error: response.status === 429 ? 'marketaux_rate_limited' : 'marketaux_failed',
        detail: String(detail || 'Marketaux request failed').slice(0, 240)
      });
    }
    return res.json(response.data || {});
  } catch (err) {
    return res.status(500).json({
      error: 'marketaux_failed',
      detail: String(err && err.message || 'Marketaux proxy failed').slice(0, 240)
    });
  }
});

// Proxies Alpha Vantage NEWS_SENTIMENT responses using a server-held API key.
app.get('/api/news/alphavantage', async (req, res) => {
  try {
    if (!ALPHAVANTAGE_API_KEY) {
      return res.status(500).json({ error: 'alphavantage_key_missing' });
    }
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    const general = String(req.query.general || '0') === '1' || !symbol;
    const params = new URLSearchParams();
    params.set('function', 'NEWS_SENTIMENT');
    params.set('sort', 'LATEST');
    params.set('limit', '20');
    params.set('apikey', ALPHAVANTAGE_API_KEY);
    if (general) params.set('topics', 'financial_markets');
    else params.set('tickers', symbol);
    const url = `https://www.alphavantage.co/query?${params.toString()}`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json,text/plain,*/*' },
      validateStatus: () => true
    });
    if (response.status !== 200) {
      const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
      return res.status(response.status === 429 ? 429 : 500).json({
        error: response.status === 429 ? 'alphavantage_rate_limited' : 'alphavantage_failed',
        detail: String(detail || 'Alpha Vantage request failed').slice(0, 240)
      });
    }
    const payload = response.data || {};
    if (payload['Error Message']) {
      return res.status(400).json({
        error: 'alphavantage_failed',
        detail: String(payload['Error Message']).slice(0, 240)
      });
    }
    if (payload.Note || payload.Information) {
      return res.status(429).json({
        error: 'alphavantage_rate_limited',
        detail: String(payload.Note || payload.Information).slice(0, 240)
      });
    }
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({
      error: 'alphavantage_failed',
      detail: String(err && err.message || 'Alpha Vantage proxy failed').slice(0, 240)
    });
  }
});

// Reads the latest persisted chart payload for a given cache key.
app.get('/api/chart-cache', async (req, res) => {
  try {
    const key = String(req.query.key || '').trim();
    const stateKey = dbChartStateKey(key);
    if (!stateKey) {
      return res.status(400).json({ error: 'missing_key' });
    }
    const stored = await runDb('get_state', [stateKey]);
    const payload = stored && stored.payload && typeof stored.payload === 'object' ? stored.payload : {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    return res.json({
      found: !!(stored && stored.found),
      key,
      items,
      fetchedAt: Number(payload.fetchedAt || 0) || 0,
      source: String(payload.source || '').trim() || null,
      updatedAt: Number(stored && stored.updatedAt || 0) || 0
    });
  } catch (err) {
    return res.status(500).json({
      error: 'chart_cache_read_failed',
      detail: String(err && err.message || 'Failed to load chart cache').slice(0, 240)
    });
  }
});

// Persists the latest fetched chart payload for a given cache key.
app.put('/api/chart-cache', async (req, res) => {
  try {
    const key = String(req.body && req.body.key || '').trim();
    const stateKey = dbChartStateKey(key);
    if (!stateKey) {
      return res.status(400).json({ error: 'missing_key' });
    }
    const items = Array.isArray(req.body && req.body.items) ? req.body.items : null;
    if (!items) {
      return res.status(400).json({ error: 'invalid_items' });
    }
    const payload = {
      items,
      fetchedAt: Math.max(0, Number(req.body && req.body.fetchedAt || 0) || Date.now()),
      source: String(req.body && req.body.source || '').trim() || null
    };
    const result = await runDb('set_state', [stateKey], payload);
    return res.json({
      ok: true,
      key,
      updatedAt: Number(result && result.updatedAt || 0) || Date.now()
    });
  } catch (err) {
    return res.status(500).json({
      error: 'chart_cache_write_failed',
      detail: String(err && err.message || 'Failed to save chart cache').slice(0, 240)
    });
  }
});

// Reads stock/crypto fundamentals from DB cache or upstream providers based on freshness policy.
app.get('/api/fundamentals', async (req, res) => {
  try {
    const assetType = String(req.query.assetType || '').trim().toLowerCase() === 'crypto' ? 'crypto' : 'stock';
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    const coinId = String(req.query.coinId || '').trim().toLowerCase();
    const includeProtocol = String(req.query.includeProtocol || '0') === '1';
    const forceRefresh = String(req.query.force || '0') === '1';
    if (assetType === 'stock' && !symbol) {
      return res.status(400).json({ error: 'missing_symbol' });
    }
    if (assetType === 'crypto' && !coinId) {
      return res.status(400).json({ error: 'missing_coin_id' });
    }
    const payload = await fundamentalsService.getFundamentals({
      assetType,
      symbol,
      coinId,
      includeProtocol,
      forceRefresh
    });
    return res.json(payload || {});
  } catch (err) {
    const msg = String((err && err.message) || 'Fundamentals request failed').slice(0, 240);
    const status = Number(err && err.statusCode || 500) || 500;
    return res.status(status).json({
      error: /missing_/i.test(msg) ? msg : 'fundamentals_failed',
      status,
      detail: msg
    });
  }
});

app.get('/api/twelvedata/time-series', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    const interval = String(req.query.interval || '').trim().toLowerCase();
    const outputsize = Math.max(1, Math.min(5000, Number(req.query.outputsize || 300) || 300));
    const policy = indicatorPolicy(interval, outputsize);

    if (!symbol) {
      return res.status(400).json({ error: 'missing_symbol' });
    }
    if (!['1day', '1week', '1month'].includes(interval)) {
      return res.status(400).json({ error: 'invalid_interval' });
    }

    await runDb('prune_stale_indicators', [String(INDICATOR_RETENTION_MS)]);
    const summary = await runDb('indicator_summary', [symbol, interval]);
    const hasStored = !!(summary && Number(summary.count || 0) > 0);
    const latestFetchedAt = Number(summary && summary.latestFetchedAt || 0) || 0;
    const isFresh = hasStored && indicatorBucketKey(policy.bucket, latestFetchedAt) === indicatorBucketKey(policy.bucket, Date.now());
    let upstream = null;

    if (!isFresh) {
      try {
        upstream = await fetchIndicatorSeries(symbol, interval, hasStored ? policy.incremental : policy.warmup);
        await runDb('upsert_candles', [], {
          symbol,
          interval,
          source: upstream.source,
          fetchedAt: upstream.fetchedAt,
          candles: upstream.values
        });
      } catch (err) {
        if (!hasStored) {
          return res.status(Number(err && err.statusCode || 500) || 500).json({
            error: err && err.errorCode ? err.errorCode : 'twelvedata_failed',
            status: Number(err && err.statusCode || 500) || 500,
            detail: String(err && err.message || 'Twelve Data time_series failed').slice(0, 240)
          });
        }
      }
    }

    const stored = await getStoredIndicatorRows(symbol, interval, policy.maxCandles);
    if (!stored || !Array.isArray(stored.values) || !stored.values.length) {
      return res.status(500).json({
        error: 'twelvedata_failed',
        detail: 'No indicator candles available'
      });
    }

    return res.json({
      meta: upstream && upstream.meta ? upstream.meta : { symbol, interval },
      values: stored.values,
      status: 'ok',
      source: upstream ? upstream.source : 'sqlite-cache',
      fetchedAt: upstream ? upstream.fetchedAt : (Number(stored.latestFetchedAt || latestFetchedAt || 0) || Date.now()),
      cache: {
        persisted: true,
        didFetch: !!upstream,
        count: Number(stored.count || stored.values.length || 0) || 0
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: 'twelvedata_failed',
      status: err && err.response ? err.response.status : 500,
      detail: String((err && err.message) || 'Twelve Data time_series proxy failed').slice(0, 240)
    });
  }
});

// GET /api/search?q=AAPL
// Proxies Yahoo Finance autocomplete (unofficial) and returns JSON.
app.get('/api/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Missing q parameter' });
    }

    const url =
      `https://autoc.finance.yahoo.com/autoc?query=${encodeURIComponent(q)}&region=US&lang=en-US`;

    const response = await http.get(url);
    res.type('application/json').send(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Search proxy failed' });
  }
});

// GET /api/quote?symbols=AAPL,MSFT
// Proxies Yahoo quote endpoint and returns JSON.
app.get('/api/quote', async (req, res) => {
  try {
    const symbols = String(req.query.symbols || '').trim();
    const tdEnabled = String(req.query.td || '0') === '1';
    if (!symbols) {
      return res.status(400).json({ error: 'Missing symbols parameter' });
    }

    const url =
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;

    const response = await http.get(url);
    res.type('application/json').send(response.data);
  } catch (err) {
    const status = err && err.response ? err.response.status : 500;
    if (status === 401) {
      try {
        const yahooV8Fallback = await yahooV8ChartQuoteFallbackPayload(req.query.symbols);
        if (yahooV8Fallback) {
          return res.status(200).json(yahooV8Fallback);
        }
        if (tdEnabled) {
          const tdFallback = await twelveDataQuoteFallbackPayload(req.query.symbols);
          if (tdFallback) {
            return res.status(200).json(tdFallback);
          }
        }
        const fallback = await stooqQuoteFallbackPayload(req.query.symbols);
        return res.status(200).json(fallback);
      } catch (fallbackErr) {
        return res.status(500).json({ error: fallbackErr.message || 'Quote fallback failed' });
      }
    }
    res.status(500).json({ error: err.message || 'Quote proxy failed' });
  }
});

// GET /api/chart/:symbol?range=1mo&interval=1d
// Proxies Yahoo chart endpoint and passes through all query params.
app.get('/api/chart/:symbol', async (req, res) => {
  try {
    const symbol = String(req.params.symbol || '').trim();
    if (!symbol) {
      return res.status(400).json({ error: 'Missing symbol parameter' });
    }

    const qs = new URLSearchParams(req.query).toString();
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}${qs ? `?${qs}` : ''}`;

    const response = await http.get(url);
    res.type('application/json').send(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Chart proxy failed' });
  }
});

// GET /api/stock/aapl
// Proxies Stooq stock CSV quote endpoint. Adds ".us" if missing.
app.get('/api/stock/:symbol', async (req, res) => {
  try {
    const stooqSymbol = normalizeStockSymbol(req.params.symbol);
    if (!stooqSymbol) {
      return res.status(400).json({ error: 'Missing stock symbol' });
    }

    const url =
      `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;

    const response = await http.get(url);
    res.type('text/csv').send(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Stock CSV proxy failed' });
  }
});

// GET /api/crypto/bitcoin
// Proxies a Stooq-style crypto CSV endpoint and returns CSV text.
app.get('/api/crypto/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim().toLowerCase();
    if (!id) {
      return res.status(400).json({ error: 'Missing crypto id' });
    }

    const url =
      `https://stooq.com/q/l/?s=${encodeURIComponent(id)}&f=sd2t2ohlcv&h&e=csv`;

    const response = await http.get(url);
    res.type('text/csv').send(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Crypto CSV proxy failed' });
  }
});

// GET /api/cmc/quote/BTC
// CoinMarketCap (official Pro API) proxy for crypto quote fallback. Requires COINMARKETCAP_API_KEY env var.
app.get('/api/cmc/quote/:symbol', async (req, res) => {
  try {
    const symbol = String(req.params.symbol || '').trim().replace(/^\$/g, '').toUpperCase();
    if (!symbol) {
      return res.status(400).json({ error: 'missing_symbol' });
    }
    if (!COINMARKETCAP_API_KEY) {
      return res.status(500).json({ error: 'coinmarketcap_key_missing' });
    }

    const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbol)}&convert=USD`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'X-CMC_PRO_API_KEY': COINMARKETCAP_API_KEY,
        'Accept': 'application/json',
        'User-Agent': BROWSER_UA
      },
      validateStatus: () => true
    });

    if (response.status !== 200) {
      const detail = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data || {});
      return res.status(response.status || 500).json({
        error: 'coinmarketcap_failed',
        status: response.status || 500,
        detail: String(detail || 'CoinMarketCap quote failed').slice(0, 240)
      });
    }

    const payload = response.data || {};
    const row = payload && payload.data && payload.data[symbol] && payload.data[symbol][0];
    const usd = row && row.quote && row.quote.USD ? row.quote.USD : null;
    const price = usd && Number.isFinite(Number(usd.price)) ? Number(usd.price) : null;
    if (price == null) {
      return res.status(500).json({ error: 'coinmarketcap_failed', detail: 'No USD price in response' });
    }

    return res.json({
      symbol,
      price,
      change24h: Number.isFinite(Number(usd.percent_change_24h)) ? Number(usd.percent_change_24h) : null,
      fetchedAt: Date.now(),
      source: 'coinmarketcap'
    });
  } catch (err) {
    return res.status(500).json({
      error: 'coinmarketcap_failed',
      status: err && err.response ? err.response.status : 500,
      detail: String((err && err.message) || 'CoinMarketCap proxy failed').slice(0, 240)
    });
  }
});

// GET /api/stocktwits/AAPL or /api/stocktwits/BTC.X
// Proxies Stocktwits symbol stream JSON.
app.get('/api/stocktwits/:symbol', async (req, res) => {
  try {
    const symbol = String(req.params.symbol || '')
      .trim()
      .replace(/^\$/g, '')
      .toUpperCase();
    if (!symbol) {
      return res.status(400).json({ error: 'Missing stocktwits symbol' });
    }

    const cached = stocktwitsCache.get(symbol);
    if (cached && (Date.now() - cached.ts) < STOCKTWITS_CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return res.status(500).json({
        error: 'stocktwits_failed',
        status: response.status,
        detail: String(text || response.statusText || 'StockTwits request failed').slice(0, 200)
      });
    }

    const payload = await response.json();
    const messages = Array.isArray(payload && payload.messages) ? payload.messages : [];
    const result = messages.slice(0, 10).map((m) => {
      const id = m && m.id;
      const user = m && m.user && m.user.username ? String(m.user.username) : '';
      return {
        id,
        text: m && m.body ? String(m.body) : '',
        user,
        createdAt: m && m.created_at ? String(m.created_at) : null,
        url: (id && user) ? `https://stocktwits.com/${encodeURIComponent(user)}/message/${encodeURIComponent(String(id))}` : null
      };
    });

    stocktwitsCache.set(symbol, { ts: Date.now(), data: result });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: 'stocktwits_failed',
      status: 500,
      detail: (err && err.message ? err.message : 'Stocktwits proxy failed').slice(0, 200)
    });
  }
});

// Optional catch-all proxy:
// GET /api/generic?url=https://example.com/path
// Use carefully. Forwards to the supplied URL and returns the raw response body.
app.get('/api/generic', async (req, res) => {
  try {
    const target = String(req.query.url || '').trim();
    if (!target) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    const response = await http.get(target, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      validateStatus: () => true
    });

    const contentType = response.headers['content-type'];
    if (contentType) res.setHeader('content-type', contentType);
    res.status(response.status).send(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Generic proxy failed' });
  }
});

runDb('init').catch((err) => {
  console.error('Failed to initialize SQLite store:', err && err.message ? err.message : err);
  process.exit(1);
}).then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`Portfolio Tracker running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`SQLite store: ${DB_PATH}`);
  });
});
