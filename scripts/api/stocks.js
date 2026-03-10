// Fetches stock quotes, chart history, and symbol search results from multiple providers.
(function () {
  var PT = (window.PT = window.PT || {});

  function appConfig() {
    return window.PT_CONFIG || {};
  }

  function useLocalProxy() {
    return !!appConfig().useLocalProxy;
  }

  function proxyBase() {
    return String(appConfig().proxyBase || (location.protocol === 'file:' ? 'http://localhost:5500' : location.origin)).replace(/\/$/, '');
  }

  function proxifyUrl(url) {
    if (!useLocalProxy()) return url;
    return proxyBase() + '/api/generic?url=' + encodeURIComponent(url);
  }

  function proxyStockQuoteUrl(symbolOrStooq) {
    var raw = String(symbolOrStooq || '').trim().toLowerCase();
    var clean = raw;
    if (clean.indexOf('.') < 0) clean = clean + '.us';
    return proxyBase() + '/api/stock/' + encodeURIComponent(clean);
  }

  function proxyYahooQuoteUrl(symbol) {
    var tdEnabled = false;
    try {
      tdEnabled = !!(window.PT && window.PT.State && window.PT.State.app && window.PT.State.app.twelveDataEnabled);
    } catch (e) {}
    return proxyBase() + '/api/quote?symbols=' + encodeURIComponent(String(symbol || '').trim().toUpperCase()) +
      '&td=' + (tdEnabled ? '1' : '0');
  }

  function proxyYahooChartUrl(symbol, params) {
    var qs = new URLSearchParams(params || {}).toString();
    return proxyBase() + '/api/chart/' + encodeURIComponent(String(symbol || '').trim()) + (qs ? ('?' + qs) : '');
  }

  function parseCsv(text) {
    var lines = String(text || '').trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    var headers = lines[0].split(',').map(function (h) { return h.trim(); });
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var cols = lines[i].split(',');
      var row = {};
      for (var j = 0; j < headers.length; j++) {
        row[headers[j]] = (cols[j] || '').trim();
      }
      rows.push(row);
    }
    return rows;
  }

  function fetchText(url, debugLabel) {
    return fetch(proxifyUrl(url), { cache: 'no-store', __ptDebugLabel: debugLabel || '' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  function fetchTextMaybeProxyStock(url, stooqSymbol, debugLabel) {
    var target = (useLocalProxy() && stooqSymbol) ? proxyStockQuoteUrl(stooqSymbol) : proxifyUrl(url);
    return fetch(target, { cache: 'no-store', __ptDebugLabel: debugLabel || '' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  function fetchJson(url, debugLabel) {
    return fetch(proxifyUrl(url), { cache: 'no-store', __ptDebugLabel: debugLabel || '' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function fetchYahooQuoteJson(symbol, debugLabel) {
    var target = useLocalProxy()
      ? proxyYahooQuoteUrl(symbol)
      : ('https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + encodeURIComponent(symbol));
    return fetch(target, { cache: 'no-store', __ptDebugLabel: debugLabel || '' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function fetchYahooChartJson(symbol, params, debugLabel) {
    var query = new URLSearchParams(params || {}).toString();
    var target = useLocalProxy()
      ? proxyYahooChartUrl(symbol, params)
      : ('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + (query ? ('?' + query) : ''));
    return fetch(target, { cache: 'no-store', __ptDebugLabel: debugLabel || '' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function normalizeStooqSymbol(assetOrSymbol) {
    if (typeof assetOrSymbol === 'string') {
      return assetOrSymbol.indexOf('.') >= 0 ? assetOrSymbol.toLowerCase() : assetOrSymbol.toLowerCase() + '.us';
    }
    var explicit = String(assetOrSymbol.stooqSymbol || assetOrSymbol.stooq || '').trim();
    if (explicit) return explicit.toLowerCase();
    var yahooSymbol = String(assetOrSymbol.yahooSymbol || '').trim().toUpperCase();
    if (yahooSymbol) {
      if (/\.L$/.test(yahooSymbol)) return yahooSymbol.slice(0, -2).toLowerCase() + '.uk';
      if (/\.IR$/.test(yahooSymbol)) return yahooSymbol.slice(0, -3).toLowerCase() + '.ie';
      if (yahooSymbol.indexOf('.') < 0) return yahooSymbol.toLowerCase() + '.us';
    }
    var base = String(assetOrSymbol.symbol || '').trim().toLowerCase();
    if (!base) return '';
    return base.indexOf('.') >= 0 ? base : (base + '.us');
  }

  function num(v) {
    if (v == null) return null;
    var text = String(v).trim().replace(/,/g, '');
    if (!text) return null;
    var n = Number(text);
    return isFinite(n) ? n : null;
  }

  var PREV_CLOSE_IN_FLIGHT = {};
  var PREV_CLOSE_QUEUE = [];
  var PREV_CLOSE_ACTIVE = 0;
  var PREV_CLOSE_CONCURRENCY = 4;

  function runNextPrevCloseTask() {
    while (PREV_CLOSE_ACTIVE < PREV_CLOSE_CONCURRENCY && PREV_CLOSE_QUEUE.length) {
      var task = PREV_CLOSE_QUEUE.shift();
      PREV_CLOSE_ACTIVE += 1;
      Promise.resolve()
        .then(task.run)
        .then(task.resolve, task.reject)
        .finally(function () {
          PREV_CLOSE_ACTIVE = Math.max(0, PREV_CLOSE_ACTIVE - 1);
          runNextPrevCloseTask();
        });
    }
  }

  function schedulePrevCloseTask(run) {
    return new Promise(function (resolve, reject) {
      PREV_CLOSE_QUEUE.push({
        run: run,
        resolve: resolve,
        reject: reject
      });
      runNextPrevCloseTask();
    });
  }

  function inferPrevCloseFromHistoryRows(rows, quoteDate) {
    var list = Array.isArray(rows) ? rows.slice() : [];
    if (!list.length) return null;
    var latest = list[list.length - 1];
    var safeQuoteDate = String(quoteDate || '').trim();
    if (safeQuoteDate && latest && String(latest.date || '') === safeQuoteDate) {
      if (list.length < 2) return null;
      return Number(list[list.length - 2].close);
    }
    return latest ? Number(latest.close) : null;
  }

  function withStooqDailyChange(asset, baseQuote, options) {
    options = options || {};
    if (!baseQuote || !isFinite(Number(baseQuote.price))) {
      return Promise.resolve(baseQuote);
    }
    if (isFinite(Number(baseQuote.changePercent)) ||
        isFinite(Number(baseQuote.percent_change)) ||
        (isFinite(Number(baseQuote.previous_close)) && Number(baseQuote.previous_close) !== 0) ||
        (isFinite(Number(baseQuote.regularMarketPreviousClose)) && Number(baseQuote.regularMarketPreviousClose) !== 0)) {
      return Promise.resolve(baseQuote);
    }

    if (isFinite(Number(options.prevCloseHint)) && Number(options.prevCloseHint) > 0) {
      return Promise.resolve(applyPrevClose(baseQuote, Number(options.prevCloseHint)));
    }

    if (options.skipPrevCloseNetwork) {
      return Promise.resolve(baseQuote);
    }

    var symbol = normalizeStooqSymbol(asset);
    if (!symbol) return Promise.resolve(baseQuote);

    var runCache = options.prevCloseRunCache instanceof Map ? options.prevCloseRunCache : null;
    var cacheKey = 'prevClose:' + symbol;
    if (runCache && runCache.has(cacheKey)) {
      return Promise.resolve(runCache.get(cacheKey)).then(function (prevClose) {
        return applyPrevClose(baseQuote, prevClose);
      });
    }

    if (PREV_CLOSE_IN_FLIGHT[cacheKey]) {
      var inflight = PREV_CLOSE_IN_FLIGHT[cacheKey];
      if (runCache) runCache.set(cacheKey, inflight);
      return Promise.resolve(inflight).then(function (prevClose) {
        return applyPrevClose(baseQuote, prevClose);
      });
    }

    var url = 'https://stooq.com/q/d/l/?s=' + encodeURIComponent(symbol) + '&i=d';
    var task = schedulePrevCloseTask(function () {
      return fetchText(url, 'StockAPI.getQuote.prevCloseHistory').then(function (csv) {
        var rows = parseCsv(csv)
          .map(function (row) {
            return {
              date: row.Date || '',
              close: num(row.Close)
            };
          })
          .filter(function (row) {
            return row.date && isFinite(Number(row.close));
          })
          .sort(function (a, b) {
            return String(a.date).localeCompare(String(b.date));
          });
        return inferPrevCloseFromHistoryRows(rows, baseQuote && baseQuote.date);
      });
    }).finally(function () {
      delete PREV_CLOSE_IN_FLIGHT[cacheKey];
    });

    PREV_CLOSE_IN_FLIGHT[cacheKey] = task;
    if (runCache) runCache.set(cacheKey, task);

    return task.then(function (prevClose) {
      return applyPrevClose(baseQuote, prevClose);
    }).catch(function () {
      return baseQuote;
    });
  }

  function applyPrevClose(baseQuote, prevClose) {
    if (!baseQuote || !isFinite(Number(baseQuote.price))) return baseQuote;
    var prev = num(prevClose);
    if (!(prev > 0)) return baseQuote;
    var price = Number(baseQuote.price);
    var change = price - prev;
    var pct = (change / prev) * 100;
    return Object.assign({}, baseQuote, {
      previous_close: prev,
      regularMarketPreviousClose: prev,
      change: change,
      percent_change: pct,
      changePercent: pct
    });
  }

  function stockScore(item, query) {
    var q = String(query || '').toUpperCase();
    var symbol = String(item.symbol || '').toUpperCase();
    var name = String(item.name || '').toUpperCase();
    if (symbol === q) return 0;
    if (symbol.indexOf(q) === 0) return 1;
    if (name.indexOf(q) === 0) return 2;
    if (symbol.indexOf(q) >= 0) return 3;
    if (name.indexOf(q) >= 0) return 4;
    return 9;
  }

  function dedupeBySymbol(items) {
    var seen = {};
    return items.filter(function (item) {
      var key = String(item.yahooSymbol || (String(item.symbol || '') + '|' + String(item.market || ''))).toUpperCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function marketFromStooqSymbol(stooq) {
    var text = String(stooq || '').trim().toLowerCase();
    if (/\.uk$/.test(text)) return 'LSE';
    if (/\.ie$/.test(text)) return 'ISE';
    return 'US';
  }

  function localCatalogSearch(query, count) {
    var q = String(query || '').trim().toUpperCase();
    if (!q) return [];
    var state = window.PT && window.PT.State;
    var stocks = state && state.symbols && Array.isArray(state.symbols.stocks) ? state.symbols.stocks : [];
    return stocks
      .map(function (row) {
        var symbol = String(row && row.symbol || '').trim().toUpperCase();
        if (!symbol) return null;
        var stooq = String(row && row.stooq || '').trim().toLowerCase();
        var yahooSymbol = String(row && row.yahooSymbol || symbol).trim().toUpperCase();
        return {
          type: 'stock',
          symbol: symbol,
          yahooSymbol: yahooSymbol,
          name: String(row && row.name || symbol).trim(),
          stooq: stooq || (symbol.toLowerCase() + '.us'),
          market: String(row && row.market || marketFromStooqSymbol(stooq)).trim() || 'US'
        };
      })
      .filter(function (item) {
        if (!item) return false;
        var symbol = String(item.symbol || '').toUpperCase();
        var name = String(item.name || '').toUpperCase();
        return symbol.indexOf(q) >= 0 || name.indexOf(q) >= 0;
      })
      .sort(function (a, b) {
        var da = stockScore(a, q);
        var db = stockScore(b, q);
        if (da !== db) return da - db;
        return a.symbol.localeCompare(b.symbol);
      })
      .slice(0, count || 12);
  }

  function normalizeExchangeLabel(exchange) {
    var raw = String(exchange || '').trim();
    if (!raw) return 'NASDAQ';
    if (/nasdaq/i.test(raw)) return 'NASDAQ';
    if (/nyse/i.test(raw)) return 'NYSE';
    if (/amex|american/i.test(raw)) return 'AMEX';
    if (/london|lse|lon|iob/i.test(raw)) return 'LSE';
    if (/dublin|irish|ise|euronext.*dublin/i.test(raw)) return 'ISE';
    return raw.toUpperCase();
  }

  function splitYahooDisplaySymbol(symbol) {
    return String(symbol || '').toUpperCase().replace(/\.[A-Z]+$/, '');
  }

  function stooqSuffixFromExchange(exchange, yahooSymbol) {
    var ex = String(exchange || '').toUpperCase();
    var ys = String(yahooSymbol || '').toUpperCase();
    if (/NASDAQ|NMS|NGM|NCM|NYSE|NYQ|AMEX|ASE|ARCA|PCX/.test(ex)) return 'us';
    if (/LSE|LON|IOB/.test(ex) || /\.L$/.test(ys)) return 'uk';
    if (/DUB|ISE|IRISH/.test(ex) || /\.IR$/.test(ys)) return 'ie';
    return 'us';
  }

  function getYahooQuoteExtras(asset) {
    var symbol = String(asset && (asset.yahooSymbol || asset.symbol) || '').trim().toUpperCase();
    if (!symbol) return Promise.resolve(null);
    return fetchYahooQuoteJson(symbol, 'StockAPI.getYahooQuoteExtras').then(function (data) {
      var rows = data && data.quoteResponse && Array.isArray(data.quoteResponse.result) ? data.quoteResponse.result : [];
      var row = rows[0];
      if (!row) return null;
      return {
        preMarketPrice: num(row.preMarketPrice),
        preMarketChange: num(row.preMarketChange),
        preMarketChangePercent: num(row.preMarketChangePercent),
        postMarketPrice: num(row.postMarketPrice),
        postMarketChange: num(row.postMarketChange),
        postMarketChangePercent: num(row.postMarketChangePercent),
        regularMarketPrice: num(row.regularMarketPrice),
        regularMarketPreviousClose: num(row.regularMarketPreviousClose)
      };
    }).catch(function () {
      return null;
    });
  }

  function isNonUsYahooListing(asset) {
    var yahooSymbol = String(asset && (asset.yahooSymbol || asset.symbol) || '').trim().toUpperCase();
    return /\.[A-Z]+$/.test(yahooSymbol) && !/\.US$/.test(yahooSymbol);
  }

  function yahooJsonpSearch(query, count) {
    var q = String(query || '').trim();
    if (!q) return Promise.resolve([]);
    return new Promise(function (resolve, reject) {
      var cbName = '__ptYahooAutoCb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
      var timer;
      var script = document.createElement('script');

      function cleanup() {
        if (timer) clearTimeout(timer);
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        if (script && script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = function (payload) {
        cleanup();
        try {
          var rs = payload && payload.ResultSet;
          var rows = Array.isArray(rs && rs.Result) ? rs.Result : [];
          var items = rows
            .filter(function (row) {
              var symbol = String(row.symbol || '');
              var exch = String(row.exch || row.exchDisp || '');
              var type = String(row.type || row.typeDisp || '').toUpperCase();
              return symbol &&
                (!type || /EQUITY|ETF/.test(type)) &&
                /NASDAQ|NYSE|NMS|NGM|NCM|NYQ|AMEX|ASE|ARCA|PCX|LSE|LON|IOB|DUB|ISE/i.test(exch);
            })
            .map(function (row) {
              var yahooSym = String(row.symbol || '').toUpperCase();
              var displaySym = splitYahooDisplaySymbol(yahooSym);
              var suffix = stooqSuffixFromExchange(row.exchDisp || row.exch || 'US', yahooSym);
              return {
                type: 'stock',
                symbol: displaySym,
                yahooSymbol: yahooSym,
                name: row.name || row.symbol || '',
                stooq: displaySym.toLowerCase() + '.' + suffix,
                market: normalizeExchangeLabel(row.exchDisp || row.exch || 'US')
              };
            })
            .filter(function (x) { return x.symbol; })
            .sort(function (a, b) {
              var da = stockScore(a, q);
              var db = stockScore(b, q);
              if (da !== db) return da - db;
              return a.symbol.localeCompare(b.symbol);
            })
            .slice(0, count || 12);
          resolve(items);
        } catch (err) {
          reject(err);
        }
      };

      script.onerror = function () {
        cleanup();
        if (PT.ApiDebug && typeof PT.ApiDebug.trackFailure === 'function') {
          PT.ApiDebug.trackFailure('yahooAutocomplete', 'StockAPI.yahooJsonpSearch');
        }
        reject(new Error('Yahoo JSONP failed'));
      };

      timer = setTimeout(function () {
        cleanup();
        if (PT.ApiDebug && typeof PT.ApiDebug.trackFailure === 'function') {
          PT.ApiDebug.trackFailure('yahooAutocomplete', 'StockAPI.yahooJsonpSearch');
        }
        reject(new Error('Yahoo JSONP timeout'));
      }, 4000);

      script.src = proxifyUrl('https://autoc.finance.yahoo.com/autoc?query=' +
        encodeURIComponent(q) +
        '&region=1&lang=en&callback=' + encodeURIComponent(cbName));
      if (PT.ApiDebug && typeof PT.ApiDebug.trackUrl === 'function') {
        PT.ApiDebug.trackUrl(script.src, 'StockAPI.yahooJsonpSearch');
      }
      document.head.appendChild(script);
    });
  }

  function probeExactTickerStooq(query) {
    var q = String(query || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z.\-]{0,9}$/.test(q)) return Promise.resolve([]);
    var probes = [
      { suffix: 'us', market: 'US', yahooSuffix: '' },
      { suffix: 'uk', market: 'LSE', yahooSuffix: '.L' },
      { suffix: 'ie', market: 'ISE', yahooSuffix: '.IR' }
    ];
    return Promise.allSettled(probes.map(function (p) {
      var stooq = q.toLowerCase() + '.' + p.suffix;
      var url = 'https://stooq.com/q/l/?s=' + encodeURIComponent(stooq) + '&f=sd2t2ohlcv&h&e=csv';
      return fetchText(url, 'StockAPI.probeExactTickerStooq').then(function (csv) {
        var rows = parseCsv(csv);
        if (!rows.length) return null;
        var row = rows[0];
        var close = num(row.Close);
        if (close === null) return null;
        return {
          type: 'stock',
          symbol: q,
          yahooSymbol: q + p.yahooSuffix,
          name: q,
          stooq: stooq,
          market: p.market
        };
      });
    })).then(function (results) {
      return results
        .filter(function (r) { return r.status === 'fulfilled' && r.value; })
        .map(function (r) { return r.value; });
    }).catch(function () {
      return [];
    });
  }

  function yahooQuoteFallback(asset) {
    var yahooSymbol = String(asset && (asset.yahooSymbol || asset.symbol) || '').trim().toUpperCase();
    if (!yahooSymbol) return Promise.reject(new Error('Missing Yahoo symbol'));
    return fetchYahooQuoteJson(yahooSymbol, 'StockAPI.yahooQuoteFallback').then(function (data) {
      var rows = data && data.quoteResponse && Array.isArray(data.quoteResponse.result) ? data.quoteResponse.result : [];
      var row = rows[0];
      if (!row) throw new Error('No Yahoo quote row');
      var price = num(row.regularMarketPrice);
      if (price === null) throw new Error('Invalid Yahoo price');
      return {
        price: price,
        open: num(row.regularMarketOpen),
        high: num(row.regularMarketDayHigh),
        low: num(row.regularMarketDayLow),
        volume: num(row.regularMarketVolume),
        date: null,
        time: null,
        market: asset.market || normalizeExchangeLabel(row.fullExchangeName || row.exchange || ''),
        source: 'yahoo-quote-fallback',
        preMarketPrice: num(row.preMarketPrice),
        preMarketChange: num(row.preMarketChange),
        preMarketChangePercent: num(row.preMarketChangePercent),
        postMarketPrice: num(row.postMarketPrice),
        postMarketChange: num(row.postMarketChange),
        postMarketChangePercent: num(row.postMarketChangePercent),
        regularMarketPrice: num(row.regularMarketPrice),
        regularMarketPreviousClose: num(row.regularMarketPreviousClose)
      };
    });
  }

  function yahooHistoryFallback(asset, limit) {
    var yahooSymbol = String(asset && (asset.yahooSymbol || asset.symbol) || '').trim().toUpperCase();
    if (!yahooSymbol) return Promise.reject(new Error('Missing Yahoo symbol'));
    return fetchYahooChartJson(yahooSymbol, {
      range: '1y',
      interval: '1d',
      includePrePost: 'false',
      events: 'div,splits'
    }, 'StockAPI.yahooHistoryFallback').then(function (data) {
      var result = data && data.chart && Array.isArray(data.chart.result) ? data.chart.result[0] : null;
      var ts = result && Array.isArray(result.timestamp) ? result.timestamp : [];
      var quote = result && result.indicators && result.indicators.quote && result.indicators.quote[0] ? result.indicators.quote[0] : null;
      if (!ts.length || !quote) throw new Error('No Yahoo history rows');
      var rows = [];
      for (var i = 0; i < ts.length; i++) {
        var c = num(quote.close && quote.close[i]);
        if (c === null) continue;
        rows.push({
          t: new Date(Number(ts[i]) * 1000).toISOString().slice(0, 10),
          o: num(quote.open && quote.open[i]),
          h: num(quote.high && quote.high[i]),
          l: num(quote.low && quote.low[i]),
          c: c,
          v: num(quote.volume && quote.volume[i])
        });
      }
      if (!rows.length) throw new Error('No parsed Yahoo history rows');
      return rows.slice(-(limit || 180));
    });
  }

  PT.StockAPI = {
    searchSymbols: function (query) {
      var q = String(query || '').trim();
      if (!q) return Promise.resolve([]);
      var catalogItems = localCatalogSearch(q, 12);
      return Promise.allSettled([probeExactTickerStooq(q)]).then(function (results) {
        var probeItems = results[0].status === 'fulfilled' ? results[0].value : [];
        var merged = dedupeBySymbol([].concat(probeItems, catalogItems))
          .sort(function (a, b) {
            var da = stockScore(a, q);
            var db = stockScore(b, q);
            if (da !== db) return da - db;
            return a.symbol.localeCompare(b.symbol);
          })
          .slice(0, 8);
        return merged;
      });
    },
    getQuote: function (asset, options) {
      options = options || {};

      function runSequential(order, runner, idx) {
        var nextIdx = Number(idx || 0);
        if (nextIdx >= order.length) return Promise.reject(new Error('No enabled quote source'));
        return Promise.resolve()
          .then(function () { return runner(order[nextIdx]); })
          .catch(function () { return runSequential(order, runner, nextIdx + 1); });
      }

      function mergeYahooExtras(baseQuote) {
        function withTwelveDataPremarketFallback(quoteInput) {
          var quoteBase = Object.assign({}, quoteInput || {});
          if (isFinite(Number(quoteBase.preMarketPrice))) return Promise.resolve(quoteBase);

          var sourceText = String(quoteBase.source || '').toLowerCase();
          // TwelveData quote has no explicit pre-market field; use latest quote as fallback.
          if (sourceText.indexOf('twelvedata') >= 0) {
            var tdInlinePrice = isFinite(Number(quoteBase.regularMarketPrice))
              ? Number(quoteBase.regularMarketPrice)
              : (isFinite(Number(quoteBase.price)) ? Number(quoteBase.price) : null);
            if (isFinite(Number(tdInlinePrice)) && Number(tdInlinePrice) > 0) {
              quoteBase.preMarketPrice = Number(tdInlinePrice);
            }
            return Promise.resolve(quoteBase);
          }

          if (!options.twelveDataPremarketFallback) return Promise.resolve(quoteBase);
          if (!PT.StocksMarketData || typeof PT.StocksMarketData.getQuote !== 'function') return Promise.resolve(quoteBase);

          var providerSymbol = String(asset && (asset.yahooSymbol || asset.symbol) || '').trim().toUpperCase();
          if (!providerSymbol) return Promise.resolve(quoteBase);

          return PT.StocksMarketData.getQuote(providerSymbol, {
            force: !!options.force,
            reason: 'premarket-fallback'
          }).then(function (tdQuote) {
            var tdPrice = tdQuote && isFinite(Number(tdQuote.price))
              ? Number(tdQuote.price)
              : (tdQuote && isFinite(Number(tdQuote.regularMarketPrice)) ? Number(tdQuote.regularMarketPrice) : null);
            if (!(isFinite(Number(tdPrice)) && Number(tdPrice) > 0)) return quoteBase;
            quoteBase.preMarketPrice = Number(tdPrice);
            return quoteBase;
          }).catch(function () {
            return quoteBase;
          });
        }

        if (options.skipYahooExtras) {
          return withTwelveDataPremarketFallback(baseQuote);
        }
        return getYahooQuoteExtras(asset).then(function (extras) {
          if (!extras || typeof extras !== 'object') {
            return withTwelveDataPremarketFallback(Object.assign({}, baseQuote || {}, {
              sessionExtrasCheckedAt: Date.now()
            }));
          }
          var merged = Object.assign({}, baseQuote || {});
          if (!isFinite(Number(merged.regularMarketPrice)) && isFinite(Number(merged.price))) {
            merged.regularMarketPrice = Number(merged.price);
          }
          [
            'preMarketPrice',
            'preMarketChange',
            'preMarketChangePercent',
            'postMarketPrice',
            'postMarketChange',
            'postMarketChangePercent',
            'regularMarketPrice',
            'regularMarketPreviousClose'
          ].forEach(function (field) {
            var value = Number(extras[field]);
            if (isFinite(value)) merged[field] = value;
          });
          merged.sessionExtrasCheckedAt = Date.now();
          return withTwelveDataPremarketFallback(merged);
        }).catch(function () {
          return withTwelveDataPremarketFallback(Object.assign({}, baseQuote || {}, {
            sessionExtrasCheckedAt: Date.now()
          }));
        });
      }

      function runStooqQuote() {
        var stooqSymbol = normalizeStooqSymbol(asset);
        var url = 'https://stooq.com/q/l/?s=' + encodeURIComponent(stooqSymbol) + '&f=sd2t2ohlcv&h&e=csv';
        var debugLabel = isNonUsYahooListing(asset) ? 'StockAPI.getQuote.nonUsDirect' : 'StockAPI.getQuote';
        return fetchTextMaybeProxyStock(url, stooqSymbol, debugLabel).then(function (csv) {
          var rows = parseCsv(csv);
          if (!rows.length) throw new Error('No stock quote rows');
          var row = rows[0];
          var close = num(row.Close);
          if (close === null) throw new Error('Invalid stock quote');
          return withStooqDailyChange(asset, {
            price: close,
            open: num(row.Open),
            high: num(row.High),
            low: num(row.Low),
            volume: num(row.Volume),
            date: row.Date || null,
            time: row.Time || null,
            market: asset.market || (isNonUsYahooListing(asset) ? 'LSE' : 'NASDAQ'),
            source: url
          }, options);
        });
      }

      function runYahooQuote() {
        if (options.skipYahooFallback) return Promise.reject(new Error('Yahoo disabled'));
        return yahooQuoteFallback(asset);
      }

      function runTwelveDataQuote() {
        if (!PT.StocksMarketData || typeof PT.StocksMarketData.getQuote !== 'function') {
          return Promise.reject(new Error('TwelveData unavailable'));
        }
        var providerSymbol = String(asset && (asset.yahooSymbol || asset.symbol) || '').trim().toUpperCase();
        if (!providerSymbol) return Promise.reject(new Error('Missing symbol'));
        return PT.StocksMarketData.getQuote(providerSymbol, { force: !!options.force }).then(function (quote) {
          if (!quote || !isFinite(Number(quote.price))) throw new Error('Invalid TwelveData quote');
          return Object.assign({}, quote, {
            market: asset.market || quote.market || 'NASDAQ',
            source: quote.source || 'twelvedata'
          });
        });
      }

      var ordered = (PT.ApiSources && typeof PT.ApiSources.getOrdered === 'function')
        ? PT.ApiSources.getOrdered('prices', 'stock')
        : ['stooq', 'yahoo'];
      if (options.skipYahooFallback) {
        ordered = ordered.filter(function (sourceId) { return sourceId !== 'yahoo'; });
      }
      var selectedSource = '';
      return runSequential(ordered, function (sourceId) {
        selectedSource = sourceId;
        if (sourceId === 'twelvedata') return runTwelveDataQuote();
        if (sourceId === 'yahoo') return runYahooQuote();
        return runStooqQuote();
      }, 0).then(function (quote) {
        if (selectedSource === 'yahoo') {
          return Object.assign({}, quote || {}, {
            sessionExtrasCheckedAt: Date.now()
          });
        }
        return mergeYahooExtras(quote);
      });
    },
    getHistory: function (asset, limit) {
      function runSequential(order, runner, idx) {
        var nextIdx = Number(idx || 0);
        if (nextIdx >= order.length) return Promise.reject(new Error('No enabled chart source'));
        return Promise.resolve()
          .then(function () { return runner(order[nextIdx]); })
          .catch(function () { return runSequential(order, runner, nextIdx + 1); });
      }

      function runStooqHistory() {
        var stooqSymbol = normalizeStooqSymbol(asset);
        var url = 'https://stooq.com/q/d/l/?s=' + encodeURIComponent(stooqSymbol) + '&i=d';
        return fetchText(url, 'StockAPI.getHistory').then(function (csv) {
          var rows = parseCsv(csv).map(function (row) {
            return {
              t: row.Date,
              o: num(row.Open),
              h: num(row.High),
              l: num(row.Low),
              c: num(row.Close),
              v: num(row.Volume)
            };
          }).filter(function (row) {
            return row.t && row.c !== null;
          });
          if (!rows.length) throw new Error('No stock history rows');
          return rows.slice(-(limit || 180));
        });
      }

      var ordered = (PT.ApiSources && typeof PT.ApiSources.getOrdered === 'function')
        ? PT.ApiSources.getOrdered('chart', 'stock')
        : ['stooq', 'yahoo'];
      return runSequential(ordered, function (sourceId) {
        return sourceId === 'yahoo' ? yahooHistoryFallback(asset, limit) : runStooqHistory();
      }, 0);
    },
    getIntraday: function (asset, hours) {
      var ordered = (PT.ApiSources && typeof PT.ApiSources.getOrdered === 'function')
        ? PT.ApiSources.getOrdered('chart', 'stock')
        : ['stooq', 'yahoo'];
      if (ordered.indexOf('yahoo') < 0) {
        return Promise.reject(new Error('Yahoo intraday source disabled'));
      }
      var yahooSymbol = String(asset && (asset.yahooSymbol || asset.symbol) || '').trim().toUpperCase();
      if (!yahooSymbol) return Promise.reject(new Error('Missing Yahoo symbol'));
      var safeHours = Math.max(1, Math.min(96, Number(hours || 4) || 4));
      return fetchYahooChartJson(yahooSymbol, {
        range: '5d',
        interval: '1h',
        includePrePost: 'true',
        events: 'div,splits'
      }, 'StockAPI.getIntraday').then(function (data) {
        var result = data && data.chart && Array.isArray(data.chart.result) ? data.chart.result[0] : null;
        var ts = result && Array.isArray(result.timestamp) ? result.timestamp : [];
        var quote = result && result.indicators && result.indicators.quote && result.indicators.quote[0] ? result.indicators.quote[0] : null;
        if (!ts.length || !quote) throw new Error('No stock intraday rows');
        var rows = [];
        for (var i = 0; i < ts.length; i++) {
          var close = num(quote.close && quote.close[i]);
          if (close === null) continue;
          var ms = Number(ts[i]) * 1000;
          rows.push({
            ts: ms,
            t: new Date(ms).toISOString().slice(0, 16).replace('T', ' '),
            o: num(quote.open && quote.open[i]),
            h: num(quote.high && quote.high[i]),
            l: num(quote.low && quote.low[i]),
            c: close,
            v: num(quote.volume && quote.volume[i])
          });
        }
        if (!rows.length) throw new Error('No parsed stock intraday rows');
        var cutoff = Date.now() - (safeHours * 60 * 60 * 1000);
        var filtered = rows.filter(function (row) { return Number(row.ts) >= cutoff; });
        return (filtered.length ? filtered : rows).slice(-(safeHours + 6));
      });
    }
  };
})();
