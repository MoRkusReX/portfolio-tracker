// Batches stock quote requests through the proxy with in-memory throttling and caching.
(function () {
  var PT = (window.PT = window.PT || {});

  var LIST_TTL_MS = 1000 * 60;
  var DETAIL_TTL_MS = 1000 * 20;
  // TwelveData free tier is credit-based per symbol, so keep chunks at or below 8 symbols.
  var CHUNK_SIZE = 8;
  var TOKEN_CAPACITY = 8;
  var MAX_RETRIES = 5;
  var BACKOFF_MAX_MS = 60000;
  var cache = {}; // symbol -> { data, fetchedAt }
  var inFlight = {}; // request key -> Promise
  var queue = [];
  var tokens = TOKEN_CAPACITY;
  var refillStarted = false;

  function appConfig() {
    return window.PT_CONFIG || {};
  }

  function proxyBase() {
    return String(appConfig().proxyBase || (location.protocol === 'file:' ? 'http://localhost:5500' : location.origin)).replace(/\/$/, '');
  }

  function proxyBaseCandidates() {
    var base = proxyBase();
    var list = [base];
    if (/\/\/localhost(?::|\/|$)/i.test(base)) {
      list.push(base.replace('//localhost', '//127.0.0.1'));
    } else if (/\/\/127\.0\.0\.1(?::|\/|$)/.test(base)) {
      list.push(base.replace('//127.0.0.1', '//localhost'));
    }
    return Array.from(new Set(list));
  }

  function nowMs() {
    return Date.now();
  }

  function isDev() {
    return /localhost|127\.0\.0\.1/.test(location.host || '') || location.protocol === 'file:';
  }

  function normalizeSymbol(symbol) {
    return String(symbol || '').trim().toUpperCase();
  }

  function chunk(arr, size) {
    var out = [];
    for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function getFreshCached(symbol, ttlMs) {
    var key = normalizeSymbol(symbol);
    var entry = cache[key];
    if (!entry || !entry.data) return null;
    if (nowMs() - Number(entry.fetchedAt || 0) > ttlMs) return null;
    return entry.data;
  }

  function getAnyCached(symbol) {
    var entry = cache[normalizeSymbol(symbol)];
    return entry && entry.data ? entry.data : null;
  }

  function setCached(symbol, quote) {
    var key = normalizeSymbol(symbol);
    if (!key || !quote) return;
    var fetchedAt = isFinite(Number(quote.fetchedAt)) ? Number(quote.fetchedAt) : nowMs();
    quote.fetchedAt = fetchedAt;
    cache[key] = { data: quote, fetchedAt: fetchedAt };
  }

  function startRefillTimer() {
    if (refillStarted) return;
    refillStarted = true;
    setInterval(function () {
      tokens = TOKEN_CAPACITY;
      drainQueue();
    }, 60000);
  }

  function drainQueue() {
    while (queue.length) {
      var item = queue[0];
      var cost = Math.max(1, Number(item.cost || 1));
      if (tokens < cost) break;
      tokens -= cost;
      queue.shift();
      item.run();
    }
  }

  function scheduleWithLimiter(taskFn, cost) {
    startRefillTimer();
    return new Promise(function (resolve, reject) {
      queue.push({
        cost: Math.max(1, Number(cost || 1)),
        run: function () {
          Promise.resolve()
            .then(taskFn)
            .then(resolve, reject);
        }
      });
      drainQueue();
    });
  }

  function backoffDelay(attempt) {
    var delay = Math.min(BACKOFF_MAX_MS, Math.pow(2, attempt + 1) * 1000);
    return delay;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function fetchChunkFromProxy(symbolsChunk, attempt) {
    var syms = symbolsChunk.map(normalizeSymbol).filter(Boolean);
    var bases = proxyBaseCandidates();
    return scheduleWithLimiter(function () {
      function tryBase(i) {
        var url = bases[i] + '/api/stocks/quotes?symbols=' + encodeURIComponent(syms.join(','));
        return fetch(url, { cache: 'no-store' }).then(function (r) {
          return r.text().then(function (text) {
            var payload;
            try {
              payload = text ? JSON.parse(text) : {};
            } catch (e) {
              payload = { error: 'invalid_json', detail: text };
            }
            if (r.status === 429) {
              var err429 = new Error('HTTP 429');
              err429.status = 429;
              err429.payload = payload;
              throw err429;
            }
            if (!r.ok) {
              var err = new Error('HTTP ' + r.status);
              err.status = r.status;
              err.payload = payload;
              throw err;
            }
            return payload;
          });
        }).catch(function (err) {
          // Network-level failures (e.g. ERR_CONNECTION_REFUSED) can happen if app uses localhost but server is on 127.0.0.1, or vice versa.
          var isNetworkErr = !err || (!err.status && (err.name === 'TypeError' || /Failed to fetch|NetworkError|fetch/i.test(String(err.message || ''))));
          if (isNetworkErr && i + 1 < bases.length) {
            return tryBase(i + 1);
          }
          throw err;
        });
      }
      return tryBase(0);
    }, syms.length).catch(function (err) {
      if (err && err.status === 429 && (attempt || 0) < MAX_RETRIES) {
        var delay = backoffDelay(attempt || 0);
        if (isDev()) console.warn('[StocksMarketData] TwelveData 429, backing off', delay + 'ms');
        return sleep(delay).then(function () {
          return fetchChunkFromProxy(syms, (attempt || 0) + 1);
        });
      }
      throw err;
    });
  }

  function adaptQuote(row, symbol) {
    if (!row) return null;
    var q = {
      price: Number.isFinite(Number(row.price)) ? Number(row.price) : null,
      open: Number.isFinite(Number(row.open)) ? Number(row.open) : null,
      high: Number.isFinite(Number(row.high)) ? Number(row.high) : null,
      low: Number.isFinite(Number(row.low)) ? Number(row.low) : null,
      volume: Number.isFinite(Number(row.volume)) ? Number(row.volume) : null,
      regularMarketPrice: Number.isFinite(Number(row.regularMarketPrice)) ? Number(row.regularMarketPrice) : (Number.isFinite(Number(row.price)) ? Number(row.price) : null),
      regularMarketPreviousClose: Number.isFinite(Number(row.regularMarketPreviousClose)) ? Number(row.regularMarketPreviousClose) : null,
      change: Number.isFinite(Number(row.change)) ? Number(row.change) : null,
      changePercent: Number.isFinite(Number(row.changePercent)) ? Number(row.changePercent) : null,
      fetchedAt: Number.isFinite(Number(row.fetchedAt)) ? Number(row.fetchedAt) : nowMs(),
      source: row.source || 'twelvedata',
      symbol: normalizeSymbol(row.symbol || symbol)
    };
    return q;
  }

  function requestKey(symbols) {
    return 'quotes:' + symbols.map(normalizeSymbol).filter(Boolean).sort().join(',');
  }

  function findServerQuoteForSymbol(serverQuotes, sym) {
    var key = normalizeSymbol(sym);
    if (!serverQuotes || typeof serverQuotes !== 'object') return null;
    if (serverQuotes[key]) return serverQuotes[key];
    if (serverQuotes[key.toUpperCase()]) return serverQuotes[key.toUpperCase()];
    if (serverQuotes[key.toLowerCase()]) return serverQuotes[key.toLowerCase()];

    var hasSuffix = key.indexOf('.') >= 0 || key.indexOf(':') >= 0;
    var base = key.split(':')[0].split('.')[0];
    var yahooSuffix = key.indexOf('.') >= 0 ? key.split('.').pop() : '';
    var keys = Object.keys(serverQuotes);
    for (var i = 0; i < keys.length; i++) {
      var k = String(keys[i] || '').toUpperCase();
      if (k === key) return serverQuotes[keys[i]];
      if (!hasSuffix && k.indexOf(key + ':') === 0) return serverQuotes[keys[i]];

      if (hasSuffix) {
        // For non-US tickers (e.g. VWRA.L / WSML.L), avoid matching a different US symbol with the same base ticker.
        if (k.indexOf(base + ':') !== 0) continue;
        if (yahooSuffix === 'L' && /:(LSE|LON|IOB)\b/.test(k)) return serverQuotes[keys[i]];
        if (yahooSuffix === 'IR' && /:(ISE|DUB)\b/.test(k)) return serverQuotes[keys[i]];
        continue;
      }

      if (k.split(':')[0].split('.')[0] === base) return serverQuotes[keys[i]];
    }
    return null;
  }

  function getQuotes(symbols, options) {
    options = options || {};
    var ttlMs = Number.isFinite(Number(options.ttlMs)) ? Number(options.ttlMs) : LIST_TTL_MS;
    var force = !!options.force;
    var normalized = (symbols || []).map(normalizeSymbol).filter(Boolean);
    var unique = Array.from(new Set(normalized));
    if (!unique.length) return Promise.resolve({ quotes: {}, meta: { requested: 0, updated: 0, failed: 0, staleUsed: 0 } });

    var key = requestKey(unique);
    if (inFlight[key]) return inFlight[key];

    var p = Promise.resolve().then(function () {
      var out = {};
      var toFetch = [];
      unique.forEach(function (sym) {
        var cachedQuote = !force ? getFreshCached(sym, ttlMs) : null;
        if (cachedQuote) out[sym] = cachedQuote;
        else toFetch.push(sym);
      });

      if (!toFetch.length) {
        return { quotes: out, meta: { requested: unique.length, updated: 0, failed: 0, staleUsed: 0, cachedOnly: true } };
      }

      var chunks = chunk(toFetch, CHUNK_SIZE);
      return Promise.allSettled(chunks.map(function (c) { return fetchChunkFromProxy(c, 0); })).then(function (results) {
        var updated = 0;
        var failed = 0;
        var staleUsed = 0;

        results.forEach(function (res, idx) {
          var chunkSyms = chunks[idx];
          if (res.status !== 'fulfilled') {
            failed += chunkSyms.length;
            chunkSyms.forEach(function (sym) {
              var stale = getAnyCached(sym);
              if (stale) {
                out[sym] = stale;
                staleUsed += 1;
                failed -= 1;
              }
            });
            return;
          }

          var payload = res.value || {};
          var serverQuotes = payload.quotes || {};
          chunkSyms.forEach(function (sym) {
            var raw = findServerQuoteForSymbol(serverQuotes, sym);
            var adapted = adaptQuote(raw, sym);
            if (adapted && adapted.price != null) {
              out[sym] = adapted;
              setCached(sym, adapted);
              updated += 1;
            } else {
              var stale = getAnyCached(sym);
              if (stale) {
                out[sym] = stale;
                staleUsed += 1;
              } else {
                failed += 1;
              }
            }
          });
        });

        return {
          quotes: out,
          meta: {
            requested: unique.length,
            updated: updated,
            failed: failed,
            staleUsed: staleUsed,
            cachedOnly: false
          }
        };
      });
    }).finally(function () {
      delete inFlight[key];
    });

    inFlight[key] = p;
    return p;
  }

  function getQuote(symbol, options) {
    options = options || {};
    var sym = normalizeSymbol(symbol);
    if (!sym) return Promise.resolve(null);
    var ttlMs = Number.isFinite(Number(options.ttlMs)) ? Number(options.ttlMs) : DETAIL_TTL_MS;
    var force = !!options.force;
    var cachedQuote = !force ? getFreshCached(sym, ttlMs) : null;
    if (cachedQuote) return Promise.resolve(cachedQuote);
    return getQuotes([sym], { ttlMs: ttlMs, force: force, reason: options.reason }).then(function (res) {
      var q = res && res.quotes ? res.quotes[sym] : null;
      if (q) return q;
      return getAnyCached(sym);
    });
  }

  PT.StocksMarketData = {
    getQuotes: getQuotes,
    getQuote: getQuote,
    _cache: cache // debug aid
  };
})();
