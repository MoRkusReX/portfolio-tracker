const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

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

const app = express();
const PORT = 3000;
const STOCKTWITS_CACHE_TTL_MS = 60 * 1000;
const stocktwitsCache = new Map();
const TWELVEDATA_API_KEY = String(process.env.TWELVEDATA_API_KEY || '').trim();
const COINMARKETCAP_API_KEY = String(process.env.COINMARKETCAP_API_KEY || '').trim();

app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
  methods: ['GET']
}));

// Shared axios config for external requests.
const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

const http = axios.create({
  timeout: 10000,
  responseType: 'text',
  headers: {
    'User-Agent': BROWSER_UA
  }
});

function normalizeStockSymbol(symbol) {
  const raw = String(symbol || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.includes('.') ? raw : `${raw}.us`;
}

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

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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

app.listen(PORT, () => {
  console.log('API running on http://localhost:3000');
});
