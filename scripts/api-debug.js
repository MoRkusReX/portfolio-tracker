// Instruments fetch calls and displays API request diagnostics in the debug panel.
(function () {
  var PT = (window.PT = window.PT || {});

  var DEFINITIONS = [
    { key: 'stooqQuote', label: 'Stooq Quote', description: 'Used for stock quote CSV lookups and free fallback pricing, especially in manual refresh and stock entry defaults.' },
    { key: 'stooqHistory', label: 'Stooq History', description: 'Used for stock historical chart data when loading the selected stock price chart.' },
    { key: 'yahooSearch', label: 'Yahoo Search', description: 'Used for live stock search/autocomplete while typing in Add Asset.' },
    { key: 'yahooAutocomplete', label: 'Yahoo Autocomplete', description: 'Used for Yahoo autocomplete endpoints, including JSONP fallback search for stock symbol suggestions.' },
    { key: 'yahooQuote', label: 'Yahoo Quote', description: 'Used for stock quote enrichment such as regular, pre-market, and post-market fields.' },
    { key: 'yahooChart', label: 'Yahoo Chart', description: 'Used for Yahoo chart/history fallback and some quote fallback paths for selected stocks.' },
    { key: 'coingeckoSearch', label: 'CoinGecko Search', description: 'Used for live crypto search/autocomplete while typing in Add Asset.' },
    { key: 'coingeckoPrice', label: 'CoinGecko Price', description: 'Used for crypto spot prices, holdings refresh, and crypto entry-price prefills.' },
    { key: 'coingeckoOhlc', label: 'CoinGecko OHLC', description: 'Used for crypto historical OHLC data when loading the selected crypto chart.' },
    { key: 'coingeckoGlobal', label: 'CoinGecko Global', description: 'Used for BTC dominance and global crypto market metrics in the crypto panel.' },
    { key: 'coingeckoGlobalChart', label: 'CoinGecko Global Chart', description: 'Used for global market-cap chart style dominance/history endpoints when requested.' },
    { key: 'yahooNews', label: 'Yahoo News RSS', description: 'Used for finance/news feeds in the News panel when Yahoo is selected.' },
    { key: 'tickertick', label: 'TickerTick', description: 'Used for alternative news sourcing in the News panel when TickerTick is selected.' },
    { key: 'stocktwits', label: 'StockTwits Proxy', description: 'Used for the Socials panel via the local proxy route for StockTwits requests.' },
    { key: 'twelvedata', label: 'Twelve Data Proxy', description: 'Used for paid quote fallback and the Indicators panel time-series candles through the local proxy.' },
    { key: 'coinmarketcap', label: 'CoinMarketCap Proxy', description: 'Used as crypto quote fallback through the local proxy when CoinGecko is not enough.' },
    { key: 'genericProxy', label: 'Generic Proxy (Other)', description: 'Used when the browser routes a third-party request through the generic local proxy endpoint.' },
    { key: 'other', label: 'Other / Unclassified', description: 'Used for requests that do not match a known tracked API bucket yet.' }
  ];

  var counters = {};
  var listeners = [];
  var originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

  DEFINITIONS.forEach(function (def) {
    counters[def.key] = { calls: 0, failed: 0, lastTrigger: '' };
  });

  function notify(changedKey) {
    listeners.forEach(function (fn) {
      try { fn(getSnapshot(), changedKey || null); } catch (e) {}
    });
  }

  function getSnapshot() {
    return DEFINITIONS.map(function (def) {
      return {
        key: def.key,
        label: def.label,
        description: def.description,
        count: Number(counters[def.key] && counters[def.key].calls || 0),
        failed: Number(counters[def.key] && counters[def.key].failed || 0),
        lastTrigger: String(counters[def.key] && counters[def.key].lastTrigger || '')
      };
    });
  }

  function setLastTrigger(key, triggerLabel) {
    if (!Object.prototype.hasOwnProperty.call(counters, key)) key = 'other';
    if (triggerLabel) counters[key].lastTrigger = String(triggerLabel);
  }

  function increment(key, triggerLabel) {
    if (!Object.prototype.hasOwnProperty.call(counters, key)) key = 'other';
    setLastTrigger(key, triggerLabel);
    counters[key].calls += 1;
    notify(key);
  }

  function incrementFailed(key, triggerLabel) {
    if (!Object.prototype.hasOwnProperty.call(counters, key)) key = 'other';
    setLastTrigger(key, triggerLabel);
    counters[key].failed += 1;
    notify(key);
  }

  function extractUrl(input) {
    if (!input) return '';
    if (typeof input === 'string') return input;
    if (typeof Request !== 'undefined' && input instanceof Request) return input.url || '';
    return String(input.url || input || '');
  }

  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch (e) { return value; }
  }

  function classifyExternal(url) {
    var text = String(url || '');
    if (!text) return 'other';
    if (/stooq\.com\/q\/d\/l\//i.test(text)) return 'stooqHistory';
    if (/stooq\.com\/q\/l\//i.test(text)) return 'stooqQuote';
    if (/autoc\.finance\.yahoo\.com/i.test(text)) return 'yahooAutocomplete';
    if (/query1\.finance\.yahoo\.com\/v1\/finance\/search/i.test(text)) return 'yahooSearch';
    if (/query1\.finance\.yahoo\.com\/v7\/finance\/quote/i.test(text)) return 'yahooQuote';
    if (/query1\.finance\.yahoo\.com\/v8\/finance\/chart/i.test(text)) return 'yahooChart';
    if (/feeds\.finance\.yahoo\.com\/rss/i.test(text)) return 'yahooNews';
    if (/api\.tickertick\.com\/feed/i.test(text)) return 'tickertick';
    if (/api\.coingecko\.com\/api\/v3\/search/i.test(text)) return 'coingeckoSearch';
    if (/api\.coingecko\.com\/api\/v3\/simple\/price/i.test(text)) return 'coingeckoPrice';
    if (/api\.coingecko\.com\/api\/v3\/coins\/[^/]+\/ohlc/i.test(text)) return 'coingeckoOhlc';
    if (/api\.coingecko\.com\/api\/v3\/global\/market_cap_chart/i.test(text)) return 'coingeckoGlobalChart';
    if (/api\.coingecko\.com\/api\/v3\/global\b/i.test(text)) return 'coingeckoGlobal';
    return 'other';
  }

  function classify(url) {
    var text = String(url || '');
    if (!text) return 'other';

    if (/\/api\/stocks\/quotes\b/i.test(text)) return 'twelvedata';
    if (/\/api\/twelvedata\/time-series\b/i.test(text)) return 'twelvedata';
    if (/\/api\/stocktwits\//i.test(text)) return 'stocktwits';
    if (/\/api\/cmc\/quote\//i.test(text)) return 'coinmarketcap';
    if (/\/api\/search\b/i.test(text)) return 'yahooAutocomplete';
    if (/\/api\/quote\b/i.test(text)) return 'yahooQuote';
    if (/\/api\/chart\//i.test(text)) return 'yahooChart';
    if (/\/api\/stock\//i.test(text)) return 'stooqQuote';

    var genericMatch = text.match(/[?&]url=([^&]+)/i);
    if (genericMatch && genericMatch[1]) {
      var decoded = safeDecode(genericMatch[1]);
      var classified = classifyExternal(decoded);
      return classified === 'other' ? 'genericProxy' : classified;
    }

    return classifyExternal(text);
  }

  function trackUrl(url, triggerLabel) {
    increment(classify(url), triggerLabel);
  }

  function trackFailure(urlOrKey, triggerLabel) {
    var key = Object.prototype.hasOwnProperty.call(counters, urlOrKey) ? urlOrKey : classify(urlOrKey);
    incrementFailed(key, triggerLabel);
  }

  function mount(tableBody) {
    if (!tableBody) return;
    var flashTimers = {};

    function ensureRows(snapshot) {
      if (tableBody.children.length) return;
      tableBody.innerHTML = snapshot.map(function (row) {
        var title = String(row.description || '').replace(/"/g, '&quot;');
        return '<tr data-api-key="' + row.key + '" title="' + title + '">' +
          '<td title="' + title + '">' + row.label + '</td>' +
          '<td class="api-debug-table__trigger" title="' + (row.lastTrigger || 'n/a') + '">' + (row.lastTrigger || 'n/a') + '</td>' +
          '<td>' + row.count + '</td>' +
          '<td>' + row.failed + '</td>' +
          '</tr>';
      }).join('');
    }

    function flashRow(rowEl, key) {
      if (!rowEl) return;
      rowEl.classList.remove('api-debug-table__row--pulse');
      void rowEl.offsetWidth;
      rowEl.classList.add('api-debug-table__row--pulse');
      if (flashTimers[key]) clearTimeout(flashTimers[key]);
      flashTimers[key] = setTimeout(function () {
        rowEl.classList.remove('api-debug-table__row--pulse');
        delete flashTimers[key];
      }, 900);
    }

    function render(snapshot, changedKey) {
      ensureRows(snapshot);
      snapshot.forEach(function (row) {
        var tr = tableBody.querySelector('tr[data-api-key="' + row.key + '"]');
        if (!tr) return;
        var cells = tr.children;
        if (cells[1]) {
          cells[1].textContent = row.lastTrigger || 'n/a';
          cells[1].setAttribute('title', row.lastTrigger || 'n/a');
        }
        if (cells[2]) cells[2].textContent = String(row.count);
        if (cells[3]) cells[3].textContent = String(row.failed);
        if (changedKey && changedKey === row.key) {
          flashRow(tr, row.key);
        }
      });
    }
    listeners.push(render);
    render(getSnapshot(), null);
  }

  if (originalFetch) {
    window.fetch = function (input, init) {
      var url = extractUrl(input);
      var key = classify(url);
      var triggerLabel = init && init.__ptDebugLabel ? String(init.__ptDebugLabel) : '';
      increment(key, triggerLabel);
      return originalFetch(input, init).then(function (response) {
        if (!response || !response.ok) {
          incrementFailed(key, triggerLabel);
        }
        return response;
      }).catch(function (err) {
        incrementFailed(key, triggerLabel);
        throw err;
      });
    };
  }

  PT.ApiDebug = {
    mount: mount,
    trackUrl: trackUrl,
    trackFailure: trackFailure,
    getSnapshot: getSnapshot
  };
})();
