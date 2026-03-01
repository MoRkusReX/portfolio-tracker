(function () {
  var PT = (window.PT = window.PT || {});

  function appConfig() {
    return window.PT_CONFIG || {};
  }

  function useLocalProxy() {
    return !!appConfig().useLocalProxy;
  }

  function proxyBase() {
    return String(appConfig().proxyBase || 'http://localhost:3000').replace(/\/$/, '');
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
        if (rows.length < 2) return null;
        return Number(rows[rows.length - 2].close);
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
      var yahooCount = q.length === 1 ? 50 : 20;
      var url = 'https://query1.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(q) + '&quotesCount=' + yahooCount + '&newsCount=0';
      var yahooJsonpPromise = useLocalProxy() ? Promise.resolve([]) : yahooJsonpSearch(q, 12);
      var yahooPromise = fetch(proxifyUrl(url), { cache: 'no-store', __ptDebugLabel: 'StockAPI.searchSymbols' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (data) {
        var quotes = Array.isArray(data && data.quotes) ? data.quotes : [];
        return quotes
          .filter(function (row) {
            var symbol = String(row.symbol || '');
            var exch = String(row.exchange || row.exchDisp || '');
            var qt = String(row.quoteType || '').toUpperCase();
            return symbol &&
              (/^(EQUITY|ETF|COMMONSTOCK)$/.test(qt)) &&
              /NASDAQ|NMS|NGM|NCM|NYSE|NYQ|AMEX|ASE|ARCA|PCX|LSE|LON|IOB|DUB|ISE/i.test(exch);
          })
          .map(function (row) {
            var yahooSym = String(row.symbol || '').toUpperCase();
            var displaySym = splitYahooDisplaySymbol(yahooSym);
            var suffix = stooqSuffixFromExchange(row.exchDisp || row.exchange || 'NASDAQ', yahooSym);
            return {
              type: 'stock',
              symbol: displaySym,
              yahooSymbol: yahooSym,
              name: row.shortname || row.longname || row.symbol,
              stooq: displaySym.toLowerCase() + '.' + suffix,
              market: normalizeExchangeLabel(row.exchDisp || row.exchange || 'NASDAQ')
            };
          })
          .sort(function (a, b) {
            var da = stockScore(a, q);
            var db = stockScore(b, q);
            if (da !== db) return da - db;
            return a.symbol.localeCompare(b.symbol);
          })
          .slice(0, 12);
      });

      return Promise.allSettled([probeExactTickerStooq(q), yahooJsonpPromise, yahooPromise]).then(function (results) {
        var probeItems = results[0].status === 'fulfilled' ? results[0].value : [];
        var yahooJsonpItems = results[1].status === 'fulfilled' ? results[1].value : [];
        var yahooItems = results[2].status === 'fulfilled' ? results[2].value : [];
        var merged = dedupeBySymbol([].concat(probeItems, yahooJsonpItems, yahooItems))
          .sort(function (a, b) {
            var da = stockScore(a, q);
            var db = stockScore(b, q);
            if (da !== db) return da - db;
            return a.symbol.localeCompare(b.symbol);
          })
          .slice(0, 8);
        if (!merged.length &&
            results[0].status === 'rejected' &&
            results[1].status === 'rejected' &&
            results[2].status === 'rejected') {
          throw new Error('Stock search unavailable');
        }
        return merged;
      });
    },
    getQuote: function (asset, options) {
      options = options || {};
      if (isNonUsYahooListing(asset)) {
        if (options.skipYahooFallback) {
          var stooqSymbolNonUs = normalizeStooqSymbol(asset);
          var urlNonUs = 'https://stooq.com/q/l/?s=' + encodeURIComponent(stooqSymbolNonUs) + '&f=sd2t2ohlcv&h&e=csv';
          return fetchTextMaybeProxyStock(urlNonUs, stooqSymbolNonUs, 'StockAPI.getQuote.nonUsDirect').then(function (csv) {
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
              market: asset.market || 'LSE',
              source: urlNonUs
            }, options);
          });
        }
        return yahooQuoteFallback(asset).catch(function () {
          var stooqSymbolAlt = normalizeStooqSymbol(asset);
          var urlAlt = 'https://stooq.com/q/l/?s=' + encodeURIComponent(stooqSymbolAlt) + '&f=sd2t2ohlcv&h&e=csv';
          return fetchTextMaybeProxyStock(urlAlt, stooqSymbolAlt, 'StockAPI.getQuote.nonUsStooqFallback').then(function (csv) {
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
              market: asset.market || 'LSE',
              source: urlAlt
            }, options);
          });
        });
      }

      var stooqSymbol = normalizeStooqSymbol(asset);
      var url = 'https://stooq.com/q/l/?s=' + encodeURIComponent(stooqSymbol) + '&f=sd2t2ohlcv&h&e=csv';
      return fetchTextMaybeProxyStock(url, stooqSymbol, 'StockAPI.getQuote').then(function (csv) {
        var rows = parseCsv(csv);
        if (!rows.length) throw new Error('No stock quote rows');
        var row = rows[0];
        var close = num(row.Close);
        if (close === null) throw new Error('Invalid stock quote');
        var baseQuote = {
          price: close,
          open: num(row.Open),
          high: num(row.High),
          low: num(row.Low),
          volume: num(row.Volume),
          date: row.Date || null,
          time: row.Time || null,
          market: asset.market || 'NASDAQ',
          source: url
        };
        if (options.skipYahooExtras) {
          return withStooqDailyChange(asset, baseQuote, options);
        }
        return getYahooQuoteExtras(asset).then(function (extras) {
          if (!extras) return baseQuote;
          if (isFinite(Number(extras.regularMarketPrice))) {
            baseQuote.price = Number(extras.regularMarketPrice);
          }
          return withStooqDailyChange(asset, Object.assign(baseQuote, extras), options);
        });
      }).catch(function () {
        if (options.skipYahooFallback) {
          throw new Error('Stooq quote failed');
        }
        return yahooQuoteFallback(asset);
      });
    },
    getHistory: function (asset, limit) {
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
      }).catch(function () {
        return yahooHistoryFallback(asset, limit);
      });
    }
  };
})();
