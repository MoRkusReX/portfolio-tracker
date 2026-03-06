// Coordinates boot, state hydration, data refresh flows, UI rendering, and user interactions.
(function () {
  var PT = (window.PT = window.PT || {});
  var state = PT.State;
  var ui;
  var storage;
  var chartMgr;
  var AUTO_ITEMS = [];
  var AUTO_SELECTED_ITEM = null;
  var AUTO_TIMER = null;
  var AUTO_REQ_ID = 0;
  var AUTO_PRICE_REQ_ID = 0;
  var POSITION_ACTION = null;
  var QUOTE_FRESH_MS = 1000 * 60 * 15;
  var ASSET_DETAIL_FRESH_MS = 1000 * 60 * 5;
  var ASSET_DETAIL_REFRESH_STAMPS = {};
  var STOCKS_AUTO_REFRESH_TIMER = null;
  var CRYPTO_AUTO_REFRESH_TIMER = null;
  var API_SOURCE_DRAG = null;
  var CRYPTO_PARTICLES = null;
  var INDICATOR_IN_FLIGHT = {};
  var PORTFOLIO_REMOTE_REV = 0;
  var PORTFOLIO_LOADED_FROM_LOCAL_STORAGE = false;
  var INDICATOR_EXPLORER = {
    mode: 'stocks',
    query: '',
    results: [],
    selected: null,
    panel: null,
    requestId: 0,
    chartRequestId: 0,
    chart: {
      title: 'Price Chart',
      meta: 'Search for an asset to load its chart.',
      labels: [],
      values: [],
      label: ''
    },
    sessions: {
      stocks: null,
      crypto: null
    }
  };
  var AUTO_COLORS = ['#2cb6ff', '#14f1b2', '#f59e0b', '#fb7185', '#8b5cf6', '#22c55e', '#f97316', '#38bdf8', '#eab308', '#a78bfa'];
  var DEMO_STOCKS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'AVGO', 'TSLA'];
  var DEMO_CRYPTO_IDS = ['bitcoin', 'ethereum', 'tether', 'ripple', 'binancecoin', 'solana', 'usd-coin', 'dogecoin', 'cardano', 'tron'];
  var INDICATOR_TIMEFRAMES = {
    '1d': { label: '1D', interval: '1day', warmup: 300, incremental: 12, maxCandles: 360, bucket: 'day' },
    '1w': { label: '1W', interval: '1week', warmup: 260, incremental: 8, maxCandles: 300, bucket: 'week' },
    '1m': { label: '1M', interval: '1month', warmup: 120, incremental: 5, maxCandles: 160, bucket: 'month' }
  };
  var INDICATOR_DAILY_QUOTA = 800;
  var INDICATOR_DAILY_BUDGET = Math.max(1, Math.floor(INDICATOR_DAILY_QUOTA * 0.7));
  var INDICATOR_BUDGET_CACHE_KEY = 'indicators:budget';
  var CHART_TIMEFRAMES = [
    { id: '1D', label: '1D', days: 1, ttlMs: 1000 * 60 * 30 },
    { id: '1W', label: '1W', days: 7, ttlMs: 1000 * 60 * 45 },
    { id: '1M', label: '1M', days: 31, ttlMs: 1000 * 60 * 60 },
    { id: '3M', label: '3M', days: 93, ttlMs: 1000 * 60 * 60 * 2 },
    { id: '6M', label: '6M', days: 186, ttlMs: 1000 * 60 * 60 * 3 },
    { id: '1Y', label: '1Y', days: 366, ttlMs: 1000 * 60 * 60 * 6 },
    { id: 'MAX', label: 'MAX', days: null, ttlMs: 1000 * 60 * 60 * 8 }
  ];
  var CHART_TIMEFRAME_MAP = CHART_TIMEFRAMES.reduce(function (acc, item) {
    acc[item.id] = item;
    return acc;
  }, {});
  var CHART_HISTORY_IN_FLIGHT = {};

  function id() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function modeToAssetType(mode) {
    return mode === 'crypto' ? 'crypto' : 'stock';
  }

  function assetKey(asset) {
    return asset.type + ':' + asset.id;
  }

  function chartTimeframeConfig(id) {
    return CHART_TIMEFRAME_MAP[String(id || '').toUpperCase()] || CHART_TIMEFRAME_MAP['1M'];
  }

  function normalizeChartTimeframe(id) {
    return chartTimeframeConfig(id).id;
  }

  function parseHistoryPointTs(point) {
    if (!point) return null;
    if (isFinite(Number(point.ts))) return Number(point.ts);
    var raw = point.t;
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) {
      return new Date(String(raw) + 'T00:00:00Z').getTime();
    }
    var direct = new Date(raw).getTime();
    if (isFinite(direct)) return direct;
    var fallback = new Date(String(raw).replace(' ', 'T') + 'Z').getTime();
    return isFinite(fallback) ? fallback : null;
  }

  function filterHistoryForTimeframe(rows, timeframeId) {
    var tf = chartTimeframeConfig(timeframeId);
    var input = Array.isArray(rows) ? rows : [];
    var cleaned = input.map(function (row) {
      var close = Number(row && row.c);
      var ts = parseHistoryPointTs(row);
      if (!isFinite(close) || !isFinite(ts)) return null;
      return Object.assign({}, row, {
        ts: ts,
        t: row && row.t ? String(row.t) : new Date(ts).toISOString()
      });
    }).filter(Boolean).sort(function (a, b) { return Number(a.ts) - Number(b.ts); });
    if (!cleaned.length) return [];
    if (tf.days == null && !tf.intraday) return cleaned;
    var cutoff = tf.intraday
      ? (Date.now() - (tf.hours * 60 * 60 * 1000))
      : (Date.now() - (tf.days * 24 * 60 * 60 * 1000));
    var filtered = cleaned.filter(function (row) { return Number(row.ts) >= cutoff; });
    return filtered.length ? filtered : cleaned;
  }

  function detailChartTimeframeForMode(mode) {
    return mode === 'crypto'
      ? normalizeChartTimeframe(state.app.detailChartTimeframeCrypto || '1M')
      : normalizeChartTimeframe(state.app.detailChartTimeframeStocks || '1M');
  }

  function setDetailChartTimeframeForMode(mode, timeframeId) {
    var safe = normalizeChartTimeframe(timeframeId);
    if (mode === 'crypto') state.app.detailChartTimeframeCrypto = safe;
    else state.app.detailChartTimeframeStocks = safe;
  }

  function explorerChartTimeframeForMode(mode) {
    return mode === 'crypto'
      ? normalizeChartTimeframe(state.app.explorerChartTimeframeCrypto || '1M')
      : normalizeChartTimeframe(state.app.explorerChartTimeframeStocks || '1M');
  }

  function setExplorerChartTimeframeForMode(mode, timeframeId) {
    var safe = normalizeChartTimeframe(timeframeId);
    if (mode === 'crypto') state.app.explorerChartTimeframeCrypto = safe;
    else state.app.explorerChartTimeframeStocks = safe;
  }

  function chartCacheKeyForAsset(asset, timeframeId) {
    if (!asset) return '';
    var tf = normalizeChartTimeframe(timeframeId);
    var idPart = String(asset.coinId || asset.stooqSymbol || asset.yahooSymbol || asset.symbol || '').trim().toUpperCase();
    if (!idPart) return '';
    return 'chart:' + asset.type + ':' + idPart + ':' + tf;
  }

  function chartCacheKeyForExplorerTarget(target, timeframeId) {
    if (!target) return '';
    var tf = normalizeChartTimeframe(timeframeId);
    var idPart = String(target.sourceId || target.coinId || target.stooqSymbol || target.yahooSymbol || target.symbol || '').trim().toUpperCase();
    if (!idPart) return '';
    return 'chart:explore:' + target.assetType + ':' + idPart + ':' + tf;
  }

  function chartWrap(key, maxAgeMs, fetcher) {
    var safeKey = String(key || '').trim();
    if (!safeKey) return Promise.resolve([]);
    var freshCached = storage.getCached(state.caches, safeKey, maxAgeMs || 0);
    if (freshCached) return Promise.resolve(freshCached);

    return Promise.resolve()
      .then(function () {
        if (!storage || typeof storage.getRemoteChartCache !== 'function') return null;
        return storage.getRemoteChartCache(safeKey);
      })
      .then(function (remoteSnapshot) {
        if (remoteSnapshot && Array.isArray(remoteSnapshot.items) && remoteSnapshot.items.length) {
          var freshByServerStamp = !maxAgeMs || (Date.now() - Number(remoteSnapshot.fetchedAt || 0)) <= maxAgeMs;
          if (freshByServerStamp) {
            storage.setCached(state.caches, safeKey, remoteSnapshot.items);
            storage.saveCache(state.caches);
            return remoteSnapshot.items;
          }
        }
        return fetcher().then(function (data) {
          var rows = Array.isArray(data) ? data : [];
          storage.setCached(state.caches, safeKey, rows);
          storage.saveCache(state.caches);
          if (storage && typeof storage.saveRemoteChartCache === 'function') {
            storage.saveRemoteChartCache(safeKey, rows, {
              fetchedAt: Date.now(),
              source: 'client-fetch'
            });
          }
          return rows;
        });
      })
      .catch(function (err) {
        var cached = storage.getCached(state.caches, safeKey, maxAgeMs || 0);
        if (cached) return cached;
        var staleCached = getCachedAny(safeKey);
        if (staleCached) return staleCached;
        throw err;
      });
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(text) {
    state.app.status = text;
    ui.setStatus(text);
  }

  function apiSourceCatalog() {
    var catalog = window.PT && window.PT.ApiSources && Array.isArray(window.PT.ApiSources.catalog)
      ? window.PT.ApiSources.catalog
      : [];
    return clone(catalog);
  }

  function getApiSourcePrefEntry(categoryId, sourceId) {
    var category = state.app.apiSourcePrefs && state.app.apiSourcePrefs[categoryId];
    if (!Array.isArray(category)) return null;
    for (var i = 0; i < category.length; i++) {
      if (category[i] && category[i].id === sourceId) return category[i];
    }
    return null;
  }

  function syncTwelveDataEnabledFromPrefs() {
    var entry = getApiSourcePrefEntry('prices', 'twelvedata');
    state.app.twelveDataEnabled = !!(entry && entry.enabled);
  }

  function apiSourceCategoryView() {
    return apiSourceCatalog().map(function (category) {
      var sourceMap = {};
      (category.sources || []).forEach(function (source) {
        sourceMap[source.id] = source;
      });
      var orderedEntries = Array.isArray(state.app.apiSourcePrefs && state.app.apiSourcePrefs[category.id])
        ? state.app.apiSourcePrefs[category.id]
        : [];
      return {
        id: category.id,
        label: category.label,
        note: category.note,
        items: orderedEntries.map(function (pref) {
          var source = sourceMap[pref.id];
          if (!source) return null;
          return {
            id: source.id,
            label: source.label,
            enabled: pref.enabled !== false,
            requiresKey: !!source.requiresKey,
            assetScope: Array.isArray(source.assetTypes)
              ? (source.assetTypes.length > 1 ? 'Stocks + Crypto' : (source.assetTypes[0] === 'crypto' ? 'Crypto' : 'Stocks'))
              : 'All'
          };
        }).filter(Boolean)
      };
    });
  }

  function refreshApiSourcesModal() {
    if (!ui || !ui.el || !ui.el.apiSourcesModal || ui.el.apiSourcesModal.classList.contains('hidden')) return;
    if (window.PT && typeof window.PT.forceOpenApiSourcesModal === 'function') {
      window.PT.forceOpenApiSourcesModal(window.PT.__apiSourcesModalMode || (state.app.mode === 'crypto' ? 'crypto' : 'stocks'));
      return;
    }
    ui.renderApiSourcesConfig({
      categories: apiSourceCategoryView(),
      autoRefresh: {
        stocks: {
          enabled: !!state.app.stocksAutoRefreshEnabled,
          intervalSec: state.app.stocksAutoRefreshIntervalSec || 600
        },
        crypto: {
          enabled: !!state.app.cryptoAutoRefreshEnabled,
          intervalSec: state.app.cryptoAutoRefreshIntervalSec || 600
        }
      }
    });
  }

  function openApiSourcesModal(mode) {
    if (window.PT && typeof window.PT.forceOpenApiSourcesModal === 'function') {
      window.PT.forceOpenApiSourcesModal(mode || window.PT.__apiSourcesModalMode || (state.app.mode === 'crypto' ? 'crypto' : 'stocks'));
      return;
    }
    var modalEl = document.getElementById('apiSourcesModal');
    var contentEl = document.getElementById('apiSourcesContent');
    if (ui && ui.el) {
      if (!ui.el.apiSourcesModal && modalEl) ui.el.apiSourcesModal = modalEl;
      if (!ui.el.apiSourcesContent && contentEl) ui.el.apiSourcesContent = contentEl;
    }
    if (modalEl) {
      modalEl.classList.remove('hidden');
      modalEl.setAttribute('aria-hidden', 'false');
    }
    try {
      if (ui && typeof ui.renderApiSourcesConfig === 'function') {
        ui.renderApiSourcesConfig({
          categories: apiSourceCategoryView(),
          autoRefresh: {
            stocks: {
              enabled: !!state.app.stocksAutoRefreshEnabled,
              intervalSec: state.app.stocksAutoRefreshIntervalSec || 600
            },
            crypto: {
              enabled: !!state.app.cryptoAutoRefreshEnabled,
              intervalSec: state.app.cryptoAutoRefreshIntervalSec || 600
            }
          },
          selectedMode: mode || (state.app.mode === 'crypto' ? 'crypto' : 'stocks')
        });
      } else if (contentEl) {
        contentEl.innerHTML = '<section class="api-config-section"><div class="api-config-section__head"><div><h4>API source settings unavailable</h4><p>UI layer not initialized.</p></div></div></section>';
      }
      setStatus('API sources opened');
    } catch (err) {
      if (contentEl) {
        contentEl.innerHTML = '<section class="api-config-section">' +
          '<div class="api-config-section__head"><div><h4>Unable to open API source settings</h4><p>' +
          String((err && err.message) || 'Unknown error')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;') +
          '</p></div></div>' +
          '<div class="modal__actions"><button type="button" id="apiSourcesDoneBtn" class="btn btn--primary">Close</button></div>' +
        '</section>';
      }
      setStatus('API sources UI error');
    }
  }

  function closeApiSourcesModal() {
    var modalEl = document.getElementById('apiSourcesModal');
    if (ui && typeof ui.closeApiSourcesModal === 'function') {
      ui.closeApiSourcesModal();
      return;
    }
    if (modalEl) {
      modalEl.classList.add('hidden');
      modalEl.setAttribute('aria-hidden', 'true');
    }
  }

  PT.openApiSourcesModal = openApiSourcesModal;
  PT.closeApiSourcesModal = closeApiSourcesModal;

  function indicatorCandleCacheKey(modeKey, timeframeKey) {
    return 'indicators:candles:' + modeKey + ':' + timeframeKey;
  }

  function indicatorComputedCacheKey(modeKey, timeframeKey) {
    return 'indicators:computed:' + modeKey + ':' + timeframeKey;
  }

  function indicatorTargetKey(target) {
    if (!target || !target.symbol) return '';
    return (target.assetType === 'crypto' ? 'crypto' : 'stock') + ':' + String(target.symbol).toUpperCase().replace(/[^A-Z0-9/_:.+-]+/g, '_');
  }

  function indicatorTargetFromAsset(asset) {
    if (!asset) return null;
    if (asset.type === 'crypto') {
      var cryptoSymbol = String(asset.symbol || '').trim().toUpperCase();
      if (!cryptoSymbol) return null;
      return {
        mode: 'crypto',
        assetType: 'crypto',
        symbol: cryptoSymbol + '/USD',
        label: cryptoSymbol + '/USD',
        cacheKey: indicatorTargetKey({ assetType: 'crypto', symbol: cryptoSymbol + '/USD' }),
        owned: true,
        assetId: asset.id
      };
    }
    var stockSymbol = String(asset.yahooSymbol || asset.symbol || '').trim().toUpperCase();
    if (!stockSymbol) return null;
    return {
      mode: 'stocks',
      assetType: 'stock',
      symbol: stockSymbol,
      label: stockSymbol,
      cacheKey: indicatorTargetKey({ assetType: 'stock', symbol: stockSymbol }),
      owned: true,
      assetId: asset.id
    };
  }

  function indicatorTargetFromExplorerItem(item, modeKey) {
    if (!item) return null;
    if (modeKey === 'crypto') {
      var cryptoSymbol = String(item.symbol || '').trim().toUpperCase();
      if (!cryptoSymbol) return null;
      return {
        mode: 'crypto',
        assetType: 'crypto',
        symbol: cryptoSymbol + '/USD',
        label: (item.name ? (item.name + ' (' + cryptoSymbol + '/USD)') : (cryptoSymbol + '/USD')),
        cacheKey: indicatorTargetKey({ assetType: 'crypto', symbol: cryptoSymbol + '/USD' }),
        owned: false,
        sourceId: item.id || cryptoSymbol,
        coinId: item.id || null,
        baseSymbol: cryptoSymbol
      };
    }
    var stockSymbol = String(item.yahooSymbol || item.symbol || '').trim().toUpperCase();
    if (!stockSymbol) return null;
    return {
      mode: 'stocks',
      assetType: 'stock',
      symbol: stockSymbol,
      label: item.name ? (item.name + ' (' + stockSymbol + ')') : stockSymbol,
      cacheKey: indicatorTargetKey({ assetType: 'stock', symbol: stockSymbol }),
      owned: false,
      sourceId: item.yahooSymbol || item.symbol || stockSymbol,
      yahooSymbol: item.yahooSymbol || stockSymbol,
      stooqSymbol: item.stooq || null,
      market: item.market || 'US'
    };
  }

  function indicatorModeConfig(mode) {
    return indicatorTargetFromAsset(getSelectedAsset(mode === 'crypto' ? 'crypto' : 'stocks'));
  }

  function indicatorSourceEnabled(assetType) {
    return !!(window.PT && window.PT.ApiSources && typeof window.PT.ApiSources.getOrdered === 'function' &&
      window.PT.ApiSources.getOrdered('indicators', assetType, state.app.apiSourcePrefs).length);
  }

  function getIsoWeekKey(ts) {
    var date = new Date(ts);
    if (!isFinite(date.getTime())) return '';
    var utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    var day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    var week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
    return utc.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }

  function indicatorBucketKey(bucketType, ts) {
    var date = new Date(ts);
    if (!isFinite(date.getTime())) return '';
    if (bucketType === 'week') return getIsoWeekKey(ts);
    if (bucketType === 'month') return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
    return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
  }

  function localDayKey(ts) {
    var d = new Date(ts || Date.now());
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getIndicatorBudgetState() {
    var cached = getCachedAny(INDICATOR_BUDGET_CACHE_KEY) || {};
    var day = localDayKey(Date.now());
    if (String(cached.day || '') !== day) {
      cached = {
        day: day,
        callsToday: 0,
        budget: INDICATOR_DAILY_BUDGET
      };
      storage.setCached(state.caches, INDICATOR_BUDGET_CACHE_KEY, cached);
      storage.saveCache(state.caches);
    }
    return cached;
  }

  function canSpendIndicatorCall() {
    var budget = getIndicatorBudgetState();
    return Number(budget.callsToday || 0) < Number(budget.budget || INDICATOR_DAILY_BUDGET);
  }

  function spendIndicatorCall() {
    var budget = getIndicatorBudgetState();
    budget.callsToday = Number(budget.callsToday || 0) + 1;
    budget.lastCallAt = Date.now();
    storage.setCached(state.caches, INDICATOR_BUDGET_CACHE_KEY, budget);
    storage.saveCache(state.caches);
    return budget;
  }

  function trimIndicatorCandles(candles, maxCandles) {
    var list = Array.isArray(candles) ? candles.slice() : [];
    if (list.length <= maxCandles) return list;
    return list.slice(list.length - maxCandles);
  }

  function mergeIndicatorCandles(existing, incoming, maxCandles) {
    var merged = {};
    (Array.isArray(existing) ? existing : []).concat(Array.isArray(incoming) ? incoming : []).forEach(function (row) {
      if (!row || !row.t) return;
      merged[row.t] = row;
    });
    return trimIndicatorCandles(Object.keys(merged).sort().map(function (key) {
      return merged[key];
    }), maxCandles);
  }

  function computeIndicatorSnapshot(candles, timeframeKey) {
    if (!(window.PT && window.PT.IndicatorEngine && typeof window.PT.IndicatorEngine.analyze === 'function')) {
      throw new Error('Indicator engine unavailable');
    }
    return window.PT.IndicatorEngine.analyze(candles, { timeKey: timeframeKey });
  }

  function buildIndicatorPanelMeta(modeKey, options) {
    var opts = options || {};
    if (opts.disabled) {
      return 'Indicator source disabled in API Sources.';
    }
    if (opts.error && opts.usedCache) {
      return 'Using cached indicator data. ' + opts.error;
    }
    if (opts.error) {
      return opts.error;
    }
    if (opts.usedCache) {
      var budgetState = getIndicatorBudgetState();
      if (opts.budgetGuard) {
        return 'Using cached indicator data (daily indicator budget reached: ' + Number(budgetState.callsToday || 0) + '/' + Number(budgetState.budget || INDICATOR_DAILY_BUDGET) + ').';
      }
      return 'Using cached indicator data.';
    }
    if (opts.lastFetchedAt) {
      return 'Twelve Data • Updated ' + new Date(opts.lastFetchedAt).toLocaleString();
    }
    if (opts.assetLabel) {
      return 'Refresh Prices to load ' + opts.assetLabel + ' indicator snapshots.';
    }
    return modeKey === 'crypto'
      ? 'Select a crypto holding or use Explore to load indicator snapshots.'
      : 'Select a stock holding or use Explore to load indicator snapshots.';
  }

  function rebuildIndicatorPanelState(modeKey, target, metaOptions, persistSlot) {
    var config = target || indicatorModeConfig(modeKey);
    if (!config) {
      var emptyState = {
        mode: modeKey === 'crypto' ? 'crypto' : 'stocks',
        assetLabel: modeKey === 'crypto' ? 'No crypto selected' : 'No stock selected',
        overallStatus: 'Neutral',
        weightedScore: 0,
        timeframes: {},
        targetKey: '',
        metaText: buildIndicatorPanelMeta(modeKey, {
          error: metaOptions && metaOptions.error,
          usedCache: true,
          assetLabel: modeKey === 'crypto' ? 'a crypto asset' : 'a stock'
        })
      };
      if (persistSlot !== false) state.indicators[emptyState.mode] = emptyState;
      return emptyState;
    }
    var timeframes = {};
    var usedCache = false;
    var lastFetchedAt = 0;
    var targetKey = config.cacheKey || indicatorTargetKey(config);
    ['1d', '1w', '1m'].forEach(function (timeframeKey) {
      var candlePayload = getCachedAny(indicatorCandleCacheKey(targetKey, timeframeKey));
      var computedPayload = getCachedAny(indicatorComputedCacheKey(targetKey, timeframeKey));
      if (!candlePayload || !Array.isArray(candlePayload.candles) || !candlePayload.candles.length) return;
      usedCache = true;
      lastFetchedAt = Math.max(lastFetchedAt, Number(candlePayload.lastFetchedAt || 0) || 0);
      if (!computedPayload || computedPayload.latestCandleTime !== candlePayload.latestCandleTime) {
        try {
          computedPayload = computeIndicatorSnapshot(candlePayload.candles, timeframeKey);
          storage.setCached(state.caches, indicatorComputedCacheKey(targetKey, timeframeKey), computedPayload);
          storage.saveCache(state.caches);
        } catch (err) {
          computedPayload = null;
        }
      }
      if (computedPayload) timeframes[timeframeKey] = computedPayload;
    });
    var summary = window.PT && window.PT.IndicatorEngine && typeof window.PT.IndicatorEngine.summarizeByTimeframe === 'function'
      ? window.PT.IndicatorEngine.summarizeByTimeframe(timeframes)
      : { overall: 'Neutral', weightedScore: 0 };
    var nextState = {
      mode: config.mode,
      assetLabel: config.label,
      overallStatus: summary.overall || 'Neutral',
      weightedScore: summary.weightedScore || 0,
      targetKey: targetKey,
      timeframes: timeframes,
      metaText: buildIndicatorPanelMeta(config.mode, {
        disabled: metaOptions && metaOptions.disabled,
        error: metaOptions && metaOptions.error,
        usedCache: metaOptions && Object.prototype.hasOwnProperty.call(metaOptions, 'usedCache') ? metaOptions.usedCache : usedCache,
        lastFetchedAt: metaOptions && Object.prototype.hasOwnProperty.call(metaOptions, 'lastFetchedAt') ? metaOptions.lastFetchedAt : lastFetchedAt,
        assetLabel: config.label
      })
    };
    if (persistSlot !== false) state.indicators[config.mode] = nextState;
    return nextState;
  }

  function hydrateIndicatorsFromCache() {
    rebuildIndicatorPanelState('stocks', indicatorModeConfig('stocks'), {});
    rebuildIndicatorPanelState('crypto', indicatorModeConfig('crypto'), {});
  }

  function isIndicatorTimeframeFresh(timeframeKey, payload) {
    var tf = INDICATOR_TIMEFRAMES[timeframeKey];
    if (!tf || !payload || !isFinite(Number(payload.lastFetchedAt))) return false;
    if (!payload.warmupComplete) return false;
    return indicatorBucketKey(tf.bucket, payload.lastFetchedAt) === indicatorBucketKey(tf.bucket, Date.now());
  }

  function updateIndicatorTimeframe(modeKey, timeframeKey, target) {
    var config = target || indicatorModeConfig(modeKey);
    var timeframe = INDICATOR_TIMEFRAMES[timeframeKey];
    if (!config || !timeframe) return Promise.resolve(null);
    var targetKey = config.cacheKey || indicatorTargetKey(config);
    var inflightKey = targetKey + ':' + timeframeKey;
    var candleKey = indicatorCandleCacheKey(targetKey, timeframeKey);
    var computedKey = indicatorComputedCacheKey(targetKey, timeframeKey);
    var existing = getCachedAny(candleKey);

    if (existing && Array.isArray(existing.candles) && existing.candles.length && isIndicatorTimeframeFresh(timeframeKey, existing)) {
      var cachedComputed = getCachedAny(computedKey);
      if (!cachedComputed || cachedComputed.latestCandleTime !== existing.latestCandleTime) {
        cachedComputed = computeIndicatorSnapshot(existing.candles, timeframeKey);
        storage.setCached(state.caches, computedKey, cachedComputed);
        storage.saveCache(state.caches);
      }
      return Promise.resolve({
        snapshot: cachedComputed,
        lastFetchedAt: Number(existing.lastFetchedAt || 0) || 0,
        fromCache: true
      });
    }

    if (!canSpendIndicatorCall()) {
      var budgetComputed = getCachedAny(computedKey);
      if (budgetComputed) {
        return Promise.resolve({
          snapshot: budgetComputed,
          lastFetchedAt: Number(existing && existing.lastFetchedAt || 0) || 0,
          fromCache: true,
          budgetGuard: true
        });
      }
      if (existing && Array.isArray(existing.candles) && existing.candles.length) {
        try {
          budgetComputed = computeIndicatorSnapshot(existing.candles, timeframeKey);
          storage.setCached(state.caches, computedKey, budgetComputed);
          storage.saveCache(state.caches);
          return Promise.resolve({
            snapshot: budgetComputed,
            lastFetchedAt: Number(existing.lastFetchedAt || 0) || 0,
            fromCache: true,
            budgetGuard: true
          });
        } catch (err) {
          return Promise.reject(err);
        }
      }
    }

    if (INDICATOR_IN_FLIGHT[inflightKey]) return INDICATOR_IN_FLIGHT[inflightKey];

    var outputsize = existing && Array.isArray(existing.candles) && existing.candles.length
      ? timeframe.incremental
      : timeframe.warmup;

    if (!PT.IndicatorAPI || typeof PT.IndicatorAPI.getTimeSeries !== 'function') {
      return Promise.reject(new Error('Indicator API unavailable'));
    }

    INDICATOR_IN_FLIGHT[inflightKey] = PT.IndicatorAPI.getTimeSeries(config.symbol, timeframe.interval, outputsize).then(function (response) {
      if (response && response.cache && response.cache.didFetch) {
        spendIndicatorCall();
      }
      var merged = mergeIndicatorCandles(existing && existing.candles, response.values, timeframe.maxCandles);
      var newestTime = merged.length ? merged[merged.length - 1].t : null;
      var hadExisting = !!(existing && Array.isArray(existing.candles) && existing.candles.length);
      var latestExisting = hadExisting ? (existing.latestCandleTime || (existing.candles[existing.candles.length - 1] && existing.candles[existing.candles.length - 1].t)) : null;
      var warmupComplete = !!((existing && existing.warmupComplete) || (!hadExisting && outputsize >= timeframe.warmup) || (hadExisting && Array.isArray(merged) && merged.length >= Math.min(timeframe.warmup, timeframe.maxCandles)));
      var didChange = !latestExisting || (newestTime && String(newestTime) !== String(latestExisting));
      var payload = {
        symbol: config.symbol,
        timeframe: timeframeKey,
        candles: merged,
        latestCandleTime: newestTime,
        lastFetchedAt: Date.now(),
        warmupComplete: warmupComplete
      };
      var snapshot = computeIndicatorSnapshot(merged, timeframeKey);
      if (didChange || !existing || !Array.isArray(existing.candles) || !existing.candles.length || !existing.warmupComplete) {
        storage.setCached(state.caches, candleKey, payload);
        storage.setCached(state.caches, computedKey, snapshot);
        storage.saveCache(state.caches);
      } else {
        var refreshedMeta = Object.assign({}, existing, {
          lastFetchedAt: payload.lastFetchedAt,
          warmupComplete: warmupComplete
        });
        storage.setCached(state.caches, candleKey, refreshedMeta);
        storage.saveCache(state.caches);
      }
      return {
        snapshot: snapshot,
        lastFetchedAt: payload.lastFetchedAt,
        fromCache: !(response && response.cache && response.cache.didFetch),
        didChange: didChange
      };
    }).finally(function () {
      delete INDICATOR_IN_FLIGHT[inflightKey];
    });

    return INDICATOR_IN_FLIGHT[inflightKey];
  }

  function refreshIndicatorsForMode(modeKey, target, persistSlot) {
    var config = target || indicatorModeConfig(modeKey);
    if (!config) {
      return Promise.resolve({
        ok: false,
        empty: true,
        state: rebuildIndicatorPanelState(modeKey, null, {}, persistSlot)
      });
    }
    if (!indicatorSourceEnabled(config.assetType)) {
      var disabledState = rebuildIndicatorPanelState(modeKey, config, { disabled: true, usedCache: true }, persistSlot);
      return Promise.resolve({ ok: false, disabled: true, state: disabledState });
    }
    var keys = Object.keys(INDICATOR_TIMEFRAMES);
    return Promise.allSettled(keys.map(function (timeframeKey) {
      return updateIndicatorTimeframe(modeKey, timeframeKey, config);
    })).then(function (results) {
      var anyFresh = false;
      var anyCache = false;
      var errorText = '';
      var lastFetchedAt = 0;
      var budgetGuarded = false;
      results.forEach(function (result) {
        if (result.status === 'fulfilled' && result.value) {
          anyFresh = anyFresh || !result.value.fromCache;
          anyCache = anyCache || !!result.value.fromCache;
          budgetGuarded = budgetGuarded || !!result.value.budgetGuard;
          lastFetchedAt = Math.max(lastFetchedAt, Number(result.value.lastFetchedAt || 0) || 0);
          return;
        }
        if (!errorText) {
          errorText = (result.reason && result.reason.message) || 'Indicator request failed';
        }
      });
      var nextState = rebuildIndicatorPanelState(modeKey, config, {
        error: errorText,
        usedCache: !anyFresh || anyCache,
        lastFetchedAt: lastFetchedAt,
        budgetGuard: budgetGuarded
      }, persistSlot);
      return {
        ok: !errorText,
        partial: !!errorText,
        usedCache: !anyFresh || anyCache,
        error: errorText,
        state: nextState
      };
    }).catch(function (err) {
      var failState = rebuildIndicatorPanelState(modeKey, config, {
        error: (err && err.message) || 'Indicator refresh failed',
        usedCache: true
      }, persistSlot);
      return {
        ok: false,
        error: (err && err.message) || 'Indicator refresh failed',
        usedCache: true,
        state: failState
      };
    });
  }

  function moveApiSource(categoryId, sourceId, targetIndex) {
    var list = state.app.apiSourcePrefs && state.app.apiSourcePrefs[categoryId];
    if (!Array.isArray(list)) return;
    var fromIndex = list.findIndex(function (entry) { return entry && entry.id === sourceId; });
    if (fromIndex < 0) return;
    var boundedTarget = Math.max(0, Math.min(list.length, Number(targetIndex) || 0));
    var item = list.splice(fromIndex, 1)[0];
    if (fromIndex < boundedTarget) boundedTarget -= 1;
    list.splice(boundedTarget, 0, item);
    syncTwelveDataEnabledFromPrefs();
    renderAll();
    refreshApiSourcesModal();
  }

  function setApiSourceEnabled(categoryId, sourceId, enabled) {
    var entry = getApiSourcePrefEntry(categoryId, sourceId);
    if (!entry) return;
    entry.enabled = !!enabled;
    syncTwelveDataEnabledFromPrefs();
    renderAll();
    refreshApiSourcesModal();
  }

  function localSearchScore(item, q) {
    var symbol = String(item.symbol || '').toLowerCase();
    var name = String(item.name || '').toLowerCase();
    if (symbol === q) return 0;
    if (symbol.indexOf(q) === 0) return 1;
    if (name.indexOf(q) === 0) return 2;
    if (symbol.indexOf(q) >= 0) return 3;
    if (name.indexOf(q) >= 0) return 4;
    return 9;
  }

  function localAutocompleteFallback(type, q) {
    if (type === 'stock') return [];
    var source = type === 'crypto' ? state.symbols.crypto : state.symbols.stocks;
    var qlc = String(q || '').toLowerCase();
    var filtered = source.filter(function (item) {
      var symbol = String(item.symbol || '').toLowerCase();
      var name = String(item.name || '').toLowerCase();
      if (type === 'stock' && qlc.length === 1) {
        return symbol.indexOf(qlc) === 0;
      }
      return symbol.indexOf(qlc) >= 0 || name.indexOf(qlc) >= 0;
    }).sort(function (a, b) {
      var da = localSearchScore(a, qlc);
      var db = localSearchScore(b, qlc);
      if (da !== db) return da - db;
      return String(a.symbol || '').localeCompare(String(b.symbol || ''));
    }).slice(0, 8);

    return filtered.map(function (item) {
      return Object.assign({ type: type }, item);
    });
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatCountdown(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
  }

  function getEasternPseudoDate(now) {
    return new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  }

  function normalizeStockMarketName(market) {
    var m = String(market || '').toUpperCase();
    if (/NYSE|NYQ/.test(m)) return 'NYSE';
    if (/NASDAQ|NMS|NGM|NCM/.test(m)) return 'NASDAQ';
    return m || 'NASDAQ';
  }

  function getStockMarketClock(market, now) {
    var marketName = normalizeStockMarketName(market);
    var current = getEasternPseudoDate(now || new Date());
    var day = current.getDay(); // 0=Sun ... 6=Sat (ET wall clock)
    var secNow = current.getHours() * 3600 + current.getMinutes() * 60 + current.getSeconds();
    var openSec = 9 * 3600 + 30 * 60;
    var closeSec = 16 * 3600;
    var weekday = day >= 1 && day <= 5;
    var isOpen = weekday && secNow >= openSec && secNow < closeSec;
    var next = new Date(current.getTime());

    if (isOpen) {
      next.setHours(16, 0, 0, 0);
      var closeMs = next.getTime() - current.getTime();
      return {
        market: marketName,
        isOpen: true,
        sessionLabel: 'OPEN',
        countdownMs: closeMs,
        countdownLabel: 'Closes in ' + formatCountdown(closeMs)
      };
    }

    next.setMilliseconds(0);
    if (weekday && secNow < openSec) {
      next.setHours(9, 30, 0, 0);
    } else {
      next.setDate(next.getDate() + 1);
      next.setHours(9, 30, 0, 0);
      while (next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1);
      }
    }

    var openMs = next.getTime() - current.getTime();
    return {
      market: marketName,
      isOpen: false,
      sessionLabel: 'CLOSED',
      countdownMs: openMs,
      countdownLabel: 'Opens in ' + formatCountdown(openMs)
    };
  }

  // Restores local portfolio, settings, and cache state before the UI boots.
  function loadInitialState() {
    var savedPortfolio = storage.loadPortfolio();
    var savedSettings = storage.loadSettings();
    var savedCache = storage.loadCache();

    if (savedPortfolio && savedPortfolio.stocks && savedPortfolio.crypto) {
      PORTFOLIO_LOADED_FROM_LOCAL_STORAGE = true;
      state.portfolio = savedPortfolio;
    }

    applySavedSettings(savedSettings);

    state.caches = savedCache || {};
  }

  // Checks whether a portfolio contains at least one asset.
  function hasPortfolioEntries(portfolio) {
    return !!(portfolio && (
      (Array.isArray(portfolio.stocks) && portfolio.stocks.length) ||
      (Array.isArray(portfolio.crypto) && portfolio.crypto.length)
    ));
  }

  function isPortfolioShape(portfolio) {
    return !!(portfolio && Array.isArray(portfolio.stocks) && Array.isArray(portfolio.crypto));
  }

  // Swaps in the server-sourced portfolio and clears dependent derived state.
  function replacePortfolioFromRemote(portfolio, updatedAt) {
    if (!portfolio || !portfolio.stocks || !portfolio.crypto) return;
    PORTFOLIO_REMOTE_REV = Math.max(PORTFOLIO_REMOTE_REV, Math.max(0, Number(updatedAt || 0) || 0));
    state.portfolio = clone(portfolio);
    state.market.stocks = {};
    state.market.crypto = {};
    state.history.stocks = {};
    state.history.crypto = {};
    state.news = {};
    state.twitter = {};
    state.events = {};
    normalizeImportedAssets();
    hydrateCachedData();
    hydrateIndicatorsFromCache();
    renderAll();
  }

  // Reconciles local and server portfolio state, preferring the shared server copy.
  function syncPortfolioWithServer() {
    if (state && state.app && state.app.demoModeEnabled) return Promise.resolve(null);
    if (!storage || typeof storage.loadRemotePortfolio !== 'function') return Promise.resolve(null);
    var localPortfolio = clone(state.portfolio);
    return storage.loadRemotePortfolio().then(function (remoteRecord) {
      var remotePortfolio = remoteRecord && remoteRecord.portfolio ? remoteRecord.portfolio : null;
      var remoteUpdatedAt = Math.max(0, Number(remoteRecord && remoteRecord.updatedAt || 0) || 0);
      PORTFOLIO_REMOTE_REV = remoteUpdatedAt;
      if (hasPortfolioEntries(remotePortfolio)) {
        replacePortfolioFromRemote(remotePortfolio, remoteUpdatedAt);
        return remoteRecord;
      }
      if (!PORTFOLIO_LOADED_FROM_LOCAL_STORAGE || !hasPortfolioEntries(localPortfolio) || typeof storage.saveRemotePortfolio !== 'function') return null;
      return storage.saveRemotePortfolio(localPortfolio, remoteUpdatedAt).then(function (result) {
        if (result && result.ok) {
          PORTFOLIO_REMOTE_REV = Math.max(0, Number(result.updatedAt || 0) || 0);
          return {
            portfolio: localPortfolio,
            updatedAt: PORTFOLIO_REMOTE_REV
          };
        }
        if (result && result.conflict && isPortfolioShape(result.portfolio)) {
          replacePortfolioFromRemote(result.portfolio, result.updatedAt);
          setStatus('Portfolio updated on another device; reloaded latest server copy');
          return {
            portfolio: result.portfolio,
            updatedAt: Math.max(0, Number(result.updatedAt || 0) || 0)
          };
        }
        return null;
      });
    }).catch(function () {
      return null;
    });
  }

  function applySavedSettings(savedSettings) {
    if (savedSettings) {
      var apiSourceHelpers = window.PT && window.PT.ApiSources;
      state.app.theme = savedSettings.theme === 'light' ? 'light' : 'dark';
      state.app.layoutMode = savedSettings.layoutMode === 'wide' ? 'wide' : 'narrow';
      state.app.hideHoldings = !!savedSettings.hideHoldings;
      state.app.stocksAutoRefreshEnabled = !!savedSettings.stocksAutoRefreshEnabled;
      state.app.cryptoAutoRefreshEnabled = !!savedSettings.cryptoAutoRefreshEnabled;
      state.app.stocksAutoRefreshIntervalSec = Math.max(15, Number(savedSettings.stocksAutoRefreshIntervalSec || 600) || 600);
      state.app.cryptoAutoRefreshIntervalSec = Math.max(15, Number(savedSettings.cryptoAutoRefreshIntervalSec || 600) || 600);
      if (Object.prototype.hasOwnProperty.call(savedSettings, 'cryptoParticlesEnabled')) {
        state.app.cryptoParticlesEnabled = !!savedSettings.cryptoParticlesEnabled;
      }
      state.app.demoModeEnabled = !!savedSettings.demoModeEnabled;
      state.app.apiDebugEnabled = !!savedSettings.apiDebugEnabled;
      state.app.apiSourcePrefs = apiSourceHelpers && typeof apiSourceHelpers.normalizePrefs === 'function'
        ? apiSourceHelpers.normalizePrefs(savedSettings.apiSourcePrefs)
        : (savedSettings.apiSourcePrefs || state.app.apiSourcePrefs);
      state.app.newsScopeStocks = savedSettings.newsScopeStocks === 'selected' ? 'selected' : 'general';
      state.app.sortBy = savedSettings.sortBy || 'az';
      state.app.newsSourceStocks = savedSettings.newsSourceStocks || 'auto';
      state.app.newsSourceCrypto = savedSettings.newsSourceCrypto || 'auto';
      state.app.detailChartTimeframeStocks = savedSettings.detailChartTimeframeStocks || '1M';
      state.app.detailChartTimeframeCrypto = savedSettings.detailChartTimeframeCrypto || '1M';
      state.app.explorerChartTimeframeStocks = savedSettings.explorerChartTimeframeStocks || '1M';
      state.app.explorerChartTimeframeCrypto = savedSettings.explorerChartTimeframeCrypto || '1M';
      state.app.mode = savedSettings.mode === 'crypto' ? 'crypto' : 'stocks';
      state.app.selectedStocksKey = savedSettings.selectedStocksKey || null;
      state.app.selectedCryptoKey = savedSettings.selectedCryptoKey || null;
      if (!state.app.selectedStocksKey && !state.app.selectedCryptoKey && savedSettings.selectedKey) {
        if (String(savedSettings.selectedKey).indexOf('crypto:') === 0) state.app.selectedCryptoKey = savedSettings.selectedKey;
        else state.app.selectedStocksKey = savedSettings.selectedKey;
      }
      state.app.selectedKey = getStoredSelectionForMode(state.app.mode);
      if (!savedSettings.apiSourcePrefs && Object.prototype.hasOwnProperty.call(savedSettings, 'twelveDataEnabled')) {
        var pricePrefs = state.app.apiSourcePrefs && state.app.apiSourcePrefs.prices;
        if (Array.isArray(pricePrefs)) {
          pricePrefs.forEach(function (entry) {
            if (entry.id === 'twelvedata') entry.enabled = !!savedSettings.twelveDataEnabled;
          });
        }
      }
    }

    state.app.twelveDataEnabled = (window.PT && window.PT.ApiSources && window.PT.ApiSources.getOrdered('prices', 'stock', state.app.apiSourcePrefs).indexOf('twelvedata') >= 0);
  }

  function getCachedAny(key) {
    var entry = state.caches && state.caches[key];
    return entry && entry.data ? entry.data : null;
  }

  function newsCacheKeyForAsset(asset) {
    var source = asset.type === 'crypto' ? (state.app.newsSourceCrypto || 'auto') : (state.app.newsSourceStocks || 'auto');
    return 'news:' + source + ':' + asset.type + ':' + (asset.coinId || asset.symbol);
  }

  function newsCacheKeyForGeneralStocks() {
    var source = state.app.newsSourceStocks || 'auto';
    return 'news:' + source + ':stock:general';
  }

  function hasFreshNews(asset, maxAgeMs) {
    if (!asset) return false;
    return !!storage.getCached(state.caches, newsCacheKeyForAsset(asset), maxAgeMs || 0);
  }

  function hydrateAssetNewsFromCache(asset, maxAgeMs) {
    if (!asset) return null;
    var scopedKey = newsCacheKeyForAsset(asset);
    var legacyKey = 'news:' + asset.type + ':' + (asset.coinId || asset.symbol);
    var cached = storage.getCached(state.caches, scopedKey, maxAgeMs || 0) ||
      storage.getCached(state.caches, legacyKey, maxAgeMs || 0) ||
      getCachedAny(scopedKey) ||
      getCachedAny(legacyKey);
    if (Array.isArray(cached) && cached.length) {
      state.news[assetKey(asset)] = cached;
      return cached;
    }
    return null;
  }

  function inferPrevCloseFromHistory(hist, quoteDate) {
    if (!Array.isArray(hist) || hist.length < 1) return null;
    var rows = hist.map(function (row) {
      return {
        t: String(row && row.t || ''),
        c: isFinite(Number(row && row.c)) ? Number(row.c) : null
      };
    }).filter(function (row) {
      return row.t && row.c !== null;
    }).sort(function (a, b) {
      return a.t.localeCompare(b.t);
    });
    if (!rows.length) return null;
    var latest = rows[rows.length - 1];
    var safeQuoteDate = String(quoteDate || '').trim();
    if (safeQuoteDate && latest.t === safeQuoteDate && rows.length >= 2) {
      return Number(rows[rows.length - 2].c);
    }
    return Number(latest.c);
  }

  function getStockPrevCloseHint(asset) {
    if (!asset || asset.type !== 'stock') return null;
    var quote = state.market.stocks[asset.id] || getCachedAny(stockQuoteCacheKey(asset));
    var hist = state.history.stocks[asset.id] || getCachedAny('hist:stock:' + (asset.stooqSymbol || asset.symbol));
    var inferred = inferPrevCloseFromHistory(hist, quote && quote.date);
    if (inferred && inferred > 0) return inferred;

    var prev = quote && isFinite(Number(quote.regularMarketPreviousClose)) ? Number(quote.regularMarketPreviousClose)
      : (quote && isFinite(Number(quote.previous_close)) ? Number(quote.previous_close) : null);
    if (prev && prev > 0) return prev;
    return null;
  }

  function normalizeCachedStockQuote(asset, quote, hist) {
    if (!asset || asset.type !== 'stock' || !quote || typeof quote !== 'object') return quote;
    var out = Object.assign({}, quote);
    var price = isFinite(Number(out.regularMarketPrice)) ? Number(out.regularMarketPrice)
      : (isFinite(Number(out.price)) ? Number(out.price) : null);
    var prevClose = isFinite(Number(out.regularMarketPreviousClose)) ? Number(out.regularMarketPreviousClose)
      : (isFinite(Number(out.previous_close)) ? Number(out.previous_close) : null);

    if (!(prevClose > 0)) {
      prevClose = inferPrevCloseFromHistory(hist, out.date);
    }

    if (!(prevClose > 0) || !(price !== null)) return out;

    var changed = false;
    var safePrev = Number(prevClose);
    var dayChange = price - safePrev;
    var dayPct = safePrev !== 0 ? (dayChange / safePrev) * 100 : null;

    if (Number(out.previous_close) !== safePrev) {
      out.previous_close = safePrev;
      changed = true;
    }
    if (Number(out.regularMarketPreviousClose) !== safePrev) {
      out.regularMarketPreviousClose = safePrev;
      changed = true;
    }
    if (!isFinite(Number(out.change)) || Math.abs(Number(out.change) - dayChange) > 0.000001) {
      out.change = dayChange;
      changed = true;
    }
    if (dayPct !== null && (!isFinite(Number(out.changePercent)) || Math.abs(Number(out.changePercent) - dayPct) > 0.000001)) {
      out.changePercent = dayPct;
      changed = true;
    }
    if (dayPct !== null && (!isFinite(Number(out.percent_change)) || Math.abs(Number(out.percent_change) - dayPct) > 0.000001)) {
      out.percent_change = dayPct;
      changed = true;
    }

    if (changed) {
      storage.setCached(state.caches, 'quote:stock:' + (asset.stooqSymbol || asset.symbol), out);
    }
    return out;
  }

  function hydrateCachedData() {
    var allAssets = (state.portfolio.stocks || []).concat(state.portfolio.crypto || []);
    allAssets.forEach(function (asset) {
      var quoteKey = 'quote:' + asset.type + ':' + (asset.coinId || asset.stooqSymbol || asset.symbol);
      var histKey = 'hist:' + asset.type + ':' + (asset.coinId || asset.stooqSymbol || asset.symbol);
      var newsKey = 'news:' + asset.type + ':' + (asset.coinId || asset.symbol);
      var eventsKey = 'events:v2:' + asset.type + ':' + (asset.coinId || asset.symbol);

      var hist = getCachedAny(histKey);
      if (hist) {
        if (asset.type === 'stock') state.history.stocks[asset.id] = hist;
        else state.history.crypto[asset.id] = hist;
      }

      var quote = getCachedAny(quoteKey);
      if (quote) {
        if (asset.type === 'stock') {
          var hydratedQuote = normalizeCachedStockQuote(asset, quote, hist);
          state.market.stocks[asset.id] = hydratedQuote;
        } else {
          state.market.crypto[asset.id] = quote;
        }
      }

      var news = getCachedAny(newsCacheKeyForAsset(asset)) || getCachedAny(newsKey);
      if (news) state.news[assetKey(asset)] = news;

      var events = getCachedAny(eventsKey);
      if (events) state.events[assetKey(asset)] = events;
    });

    var globalMetrics = getCachedAny('crypto:global:metrics');
    if (globalMetrics && state.globals && state.globals.crypto) {
      if (isFinite(Number(globalMetrics.btcDominance))) {
        state.globals.crypto.btcDominanceCurrent = Number(globalMetrics.btcDominance);
      }
      if (isFinite(Number(globalMetrics.ethDominance))) {
        state.globals.crypto.ethDominanceCurrent = Number(globalMetrics.ethDominance);
      }
      state.globals.crypto.updatedAt = globalMetrics.updatedAt || state.globals.crypto.updatedAt || null;
    }
    storage.saveCache(state.caches);
  }

  // Builds the serializable settings payload that is persisted between sessions.
  function buildSettingsPayload() {
    return {
      theme: state.app.theme,
      layoutMode: state.app.layoutMode,
      hideHoldings: !!state.app.hideHoldings,
      stocksAutoRefreshEnabled: !!state.app.stocksAutoRefreshEnabled,
      cryptoAutoRefreshEnabled: !!state.app.cryptoAutoRefreshEnabled,
      stocksAutoRefreshIntervalSec: Math.max(15, Number(state.app.stocksAutoRefreshIntervalSec || 600) || 600),
      cryptoAutoRefreshIntervalSec: Math.max(15, Number(state.app.cryptoAutoRefreshIntervalSec || 600) || 600),
      cryptoParticlesEnabled: !!state.app.cryptoParticlesEnabled,
      demoModeEnabled: !!state.app.demoModeEnabled,
      apiDebugEnabled: !!state.app.apiDebugEnabled,
      twelveDataEnabled: !!state.app.twelveDataEnabled,
      apiSourcePrefs: state.app.apiSourcePrefs,
      newsScopeStocks: state.app.newsScopeStocks === 'selected' ? 'selected' : 'general',
      sortBy: state.app.sortBy,
      newsSourceStocks: state.app.newsSourceStocks || 'auto',
      newsSourceCrypto: state.app.newsSourceCrypto || 'auto',
      detailChartTimeframeStocks: state.app.detailChartTimeframeStocks || '1M',
      detailChartTimeframeCrypto: state.app.detailChartTimeframeCrypto || '1M',
      explorerChartTimeframeStocks: state.app.explorerChartTimeframeStocks || '1M',
      explorerChartTimeframeCrypto: state.app.explorerChartTimeframeCrypto || '1M',
      mode: state.app.mode,
      selectedKey: state.app.selectedKey,
      selectedStocksKey: state.app.selectedStocksKey || null,
      selectedCryptoKey: state.app.selectedCryptoKey || null
    };
  }

  // Persists settings, cache, and the shared portfolio to their respective stores.
  function persist() {
    var settingsPayload = buildSettingsPayload();

    // localStorage quota can be exhausted by cached history/news; never let that block portfolio autosave.
    var portfolioOk = storage.savePortfolio(state.portfolio);
    var settingsOk = storage.saveSettings(settingsPayload);

    if (!portfolioOk || !settingsOk) {
      // Drop cache payload and retry critical data first.
      storage.saveCache({});
      state.caches = {};
      portfolioOk = storage.savePortfolio(state.portfolio);
      settingsOk = storage.saveSettings(settingsPayload);
    }

    // Cache is best-effort only.
    storage.saveCache(state.caches);
    if (state && state.app && state.app.demoModeEnabled) return;
    if (typeof storage.saveRemotePortfolio === 'function') {
      storage.saveRemotePortfolio(state.portfolio, PORTFOLIO_REMOTE_REV).then(function (result) {
        if (result && result.ok) {
          PORTFOLIO_REMOTE_REV = Math.max(0, Number(result.updatedAt || 0) || 0);
          return;
        }
        if (result && result.conflict) {
          if (isPortfolioShape(result.portfolio)) {
            replacePortfolioFromRemote(result.portfolio, result.updatedAt);
          }
          setStatus('Portfolio save blocked by a newer server version; reloaded latest shared copy');
        }
      });
    }
  }

  function getRawModeItems(mode) {
    return mode === 'crypto' ? state.portfolio.crypto : state.portfolio.stocks;
  }

  function getMarketFor(asset) {
    var group = asset.type === 'crypto' ? state.market.crypto : state.market.stocks;
    return group[asset.id] || null;
  }

  function getStoredSelectionForMode(mode) {
    return mode === 'crypto' ? (state.app.selectedCryptoKey || null) : (state.app.selectedStocksKey || null);
  }

  function setStoredSelectionForMode(mode, key) {
    var safeKey = key || null;
    if (mode === 'crypto') state.app.selectedCryptoKey = safeKey;
    else state.app.selectedStocksKey = safeKey;
  }

  function computeAsset(asset) {
    var quote = getMarketFor(asset);
    var preferredLivePrice = preferredQuotePriceForEntry(quote);
    var price = preferredLivePrice !== null ? preferredLivePrice : Number(asset.entryPrice);
    var dayChangePct = null;
    if (quote && isFinite(Number(quote.changePercent))) {
      dayChangePct = Number(quote.changePercent);
    } else if (quote && isFinite(Number(quote.percent_change))) {
      dayChangePct = Number(quote.percent_change);
    } else if (asset.type === 'crypto' && quote && isFinite(Number(quote.change24h))) {
      dayChangePct = Number(quote.change24h);
    } else if (quote && isFinite(Number(quote.change)) && price !== null) {
      var derivedPrev = price - Number(quote.change);
      if (derivedPrev !== 0) dayChangePct = (Number(quote.change) / derivedPrev) * 100;
    } else if (quote && isFinite(Number(quote.regularMarketPreviousClose)) && price !== null && Number(quote.regularMarketPreviousClose) !== 0) {
      dayChangePct = ((price - Number(quote.regularMarketPreviousClose)) / Number(quote.regularMarketPreviousClose)) * 100;
    } else if (quote && isFinite(Number(quote.previous_close)) && price !== null && Number(quote.previous_close) !== 0) {
      dayChangePct = ((price - Number(quote.previous_close)) / Number(quote.previous_close)) * 100;
    }
    var dayChangePerUnit = null;
    if (quote && isFinite(Number(quote.change))) {
      dayChangePerUnit = Number(quote.change);
    } else if (quote && isFinite(Number(quote.regularMarketPreviousClose)) && price !== null) {
      dayChangePerUnit = price - Number(quote.regularMarketPreviousClose);
    } else if (quote && isFinite(Number(quote.previous_close)) && price !== null) {
      dayChangePerUnit = price - Number(quote.previous_close);
    } else if (dayChangePct !== null && price !== null && isFinite(Number(dayChangePct)) && Number(dayChangePct) > -100) {
      var ratio = Number(dayChangePct) / 100;
      dayChangePerUnit = price - (price / (1 + ratio));
    }
    var cost = Number(asset.quantity) * Number(asset.entryPrice);
    var marketValue = Number(asset.quantity) * price;
    var plAmount = marketValue - cost;
    var plPct = cost ? (plAmount / cost) * 100 : 0;
    var dayPlAmount = dayChangePerUnit === null ? null : Number(asset.quantity) * Number(dayChangePerUnit);
    var prevValue = dayPlAmount === null ? null : (marketValue - dayPlAmount);
    var fetchedAt = quote && isFinite(Number(quote.fetchedAt)) ? Number(quote.fetchedAt) : null;
    var quoteAgeMs = fetchedAt ? (Date.now() - fetchedAt) : null;
    return {
      key: assetKey(asset),
      price: price,
      cost: cost,
      marketValue: marketValue,
      plAmount: plAmount,
      plPct: plPct,
      dayChangePct: dayChangePct,
      dayPlAmount: dayPlAmount,
      dayPrevValue: prevValue,
      quoteFetchedAt: fetchedAt,
      quoteAgeMs: quoteAgeMs,
      quoteIsFresh: quoteAgeMs != null && quoteAgeMs <= QUOTE_FRESH_MS
    };
  }

  function getModeComputedItems(mode) {
    var items = getRawModeItems(mode).map(function (asset) {
      var calc = computeAsset(asset);
      return Object.assign({}, asset, calc);
    });
    var s = state.app.sortBy;
    items.sort(function (a, b) {
      if (s === 'value-desc') return b.marketValue - a.marketValue;
      if (s === 'value-asc') return a.marketValue - b.marketValue;
      if (s === 'pl-desc') return b.plAmount - a.plAmount;
      if (s === 'pl-asc') return a.plAmount - b.plAmount;
      if (s === 'daily-pl-desc') return (Number(b.dayPlAmount) || 0) - (Number(a.dayPlAmount) || 0);
      if (s === 'daily-pl-asc') return (Number(a.dayPlAmount) || 0) - (Number(b.dayPlAmount) || 0);
      if (s === 'day-desc') return (Number(b.dayChangePct) || 0) - (Number(a.dayChangePct) || 0);
      if (s === 'day-asc') return (Number(a.dayChangePct) || 0) - (Number(b.dayChangePct) || 0);
      return a.symbol.localeCompare(b.symbol);
    });
    return items;
  }

  function getModeTotals(items) {
    return items.reduce(function (acc, item) {
      acc.value += item.marketValue;
      acc.cost += item.cost;
      acc.pl += item.plAmount;
      if (isFinite(Number(item.dayPlAmount)) && isFinite(Number(item.dayPrevValue))) {
        acc.dailyPl += Number(item.dayPlAmount);
        acc.dailyPrev += Number(item.dayPrevValue);
      }
      return acc;
    }, { value: 0, cost: 0, pl: 0, dailyPl: 0, dailyPrev: 0 });
  }

  function ensureValidSelection(mode, items) {
    if (!items.length) {
      state.app.selectedKey = null;
      setStoredSelectionForMode(mode, null);
      return;
    }
    if (!state.app.selectedKey) return;
    var has = items.some(function (item) { return item.key === state.app.selectedKey; });
    if (!has) {
      state.app.selectedKey = null;
      setStoredSelectionForMode(mode, null);
    }
  }

  function getSelectedAsset(mode) {
    var rawItems = getRawModeItems(mode);
    for (var i = 0; i < rawItems.length; i++) {
      if (assetKey(rawItems[i]) === state.app.selectedKey) return rawItems[i];
    }
    return null;
  }

  function getSelectedComputed(mode) {
    var asset = getSelectedAsset(mode);
    if (!asset) return null;
    var c = computeAsset(asset);
    return Object.assign({}, asset, c);
  }

  function renderIndicatorSnapshot(targetEls, config, modeLabelText) {
    if (!targetEls || !targetEls.assetLabel || !targetEls.overallPill || !targetEls.meta || !targetEls.timeframes) return;
    var mode = config && config.mode === 'crypto' ? 'crypto' : 'stocks';
    var assetLabel = (config && config.assetLabel) || (mode === 'crypto' ? 'No crypto selected' : 'No stock selected');
    var overall = (config && config.overallStatus) || 'Neutral';
    var metaText = (config && config.metaText) || 'No indicator snapshot yet.';
    var timeframes = (config && config.timeframes) || {};
    var hasRows = false;

    function pillClass(status) {
      var normalized = String(status || 'Neutral').toLowerCase();
      if (normalized === 'bullish') return 'indicator-pill indicator-pill--bullish';
      if (normalized === 'bearish') return 'indicator-pill indicator-pill--bearish';
      return 'indicator-pill indicator-pill--neutral';
    }

    function trendMeta(status) {
      var normalized = String(status || 'Neutral').toLowerCase();
      if (normalized === 'bullish') {
        return {
          cls: 'indicator-trend indicator-trend--bullish',
          label: 'Bullish trend',
          icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l5.2-5.2 3.6 3.6L20 7.2M14.8 7.2H20v5.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        };
      }
      if (normalized === 'bearish') {
        return {
          cls: 'indicator-trend indicator-trend--bearish',
          label: 'Bearish trend',
          icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l5.2 5.2 3.6-3.6L20 16.8M14.8 16.8H20v-5.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        };
      }
      return {
        cls: 'indicator-trend indicator-trend--neutral',
        label: 'Neutral trend',
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h13.2M13.2 8.8 20 12l-6.8 3.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      };
    }

    function fmtIndicator(value) {
      var numValue = Number(value);
      if (!isFinite(numValue)) return 'n/a';
      var abs = Math.abs(numValue);
      var digits = abs >= 1000 ? 2 : (abs >= 100 ? 2 : (abs >= 1 ? 3 : 4));
      return numValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
    }

    function techBlock(title, status, metrics, note, noteClass) {
      var list = Array.isArray(metrics) ? metrics : [];
      var count = list.length <= 1 ? 1 : (list.length === 2 ? 2 : 3);
      var meta = note ? ('<span class="indicator-tech__meta' + (noteClass ? (' ' + escapeHtml(noteClass)) : '') + '">• ' + escapeHtml(note) + '</span>') : '';
      return '<div class="indicator-tech">' +
        '<div class="indicator-tech__head">' +
          '<div class="indicator-tech__title-wrap"><div class="indicator-tech__title">' + escapeHtml(title) + '</div>' + meta + '</div>' +
          '<span class="' + pillClass(status) + '">' + escapeHtml(status || 'Neutral') + '</span>' +
        '</div>' +
        '<div class="indicator-tech__metrics indicator-tech__metrics--' + count + '">' +
          list.map(function (item) {
            return '<div class="indicator-sr__metric indicator-tech__metric">' +
              '<span>' + escapeHtml(item && item.label) + '</span>' +
              '<strong>' + escapeHtml(item && item.value) + '</strong>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';
    }

    function fmtPctMaybe(value) {
      var n = Number(value);
      return isFinite(n) ? ui.pctText(n) : 'n/a';
    }

    function srBlock(tf) {
      var values = tf && tf.values && tf.values.sr ? tf.values.sr : {};
      var pivot = values.pivot || {};
      var donchian = values.donchian || {};
      var nearest = values.nearest || {};
      var srStatus = tf && tf.statuses ? tf.statuses.sr : 'Neutral';
      var channelWidthPct = (isFinite(Number(donchian.support)) && isFinite(Number(donchian.resistance)) && isFinite(Number(tf && tf.close)) && Number(tf.close) !== 0)
        ? ((Number(donchian.resistance) - Number(donchian.support)) / Number(tf.close)) * 100
        : NaN;
      var supportClass = isFinite(Number(nearest.supportDistancePct)) && Number(nearest.supportDistancePct) <= 2.5
        ? ' indicator-sr__nearest-card--near'
        : '';
      var resistanceClass = isFinite(Number(nearest.resistanceDistancePct)) && Number(nearest.resistanceDistancePct) <= 2.5
        ? ' indicator-sr__nearest-card--near'
        : '';
      return '<div class="indicator-sr">' +
        '<div class="indicator-sr__head">' +
          '<div class="indicator-sr__title">Support &amp; Resistance</div>' +
          '<span class="' + pillClass(srStatus) + '">' + escapeHtml(srStatus || 'Neutral') + '</span>' +
        '</div>' +
        '<div class="indicator-sr__nearest">' +
          '<article class="indicator-sr__nearest-card indicator-sr__nearest-card--support' + supportClass + '">' +
            '<span class="indicator-sr__kicker">Nearest Support</span>' +
            '<strong>' + escapeHtml(fmtIndicator(nearest.support)) + '</strong>' +
            '<small>' + escapeHtml(fmtPctMaybe(nearest.supportDistancePct)) + '</small>' +
          '</article>' +
          '<article class="indicator-sr__nearest-card indicator-sr__nearest-card--resistance' + resistanceClass + '">' +
            '<span class="indicator-sr__kicker">Nearest Resistance</span>' +
            '<strong>' + escapeHtml(fmtIndicator(nearest.resistance)) + '</strong>' +
            '<small>' + escapeHtml(fmtPctMaybe(nearest.resistanceDistancePct)) + '</small>' +
          '</article>' +
        '</div>' +
        '<div class="indicator-sr__pivot-grid">' +
          '<div class="indicator-sr__metric indicator-sr__metric--s2"><span>S2</span><strong>' + escapeHtml(fmtIndicator(pivot.s2)) + '</strong></div>' +
          '<div class="indicator-sr__metric indicator-sr__metric--s1"><span>S1</span><strong>' + escapeHtml(fmtIndicator(pivot.s1)) + '</strong></div>' +
          '<div class="indicator-sr__metric indicator-sr__metric--p"><span>P</span><strong>' + escapeHtml(fmtIndicator(pivot.p)) + '</strong></div>' +
          '<div class="indicator-sr__metric indicator-sr__metric--r1"><span>R1</span><strong>' + escapeHtml(fmtIndicator(pivot.r1)) + '</strong></div>' +
          '<div class="indicator-sr__metric indicator-sr__metric--r2"><span>R2</span><strong>' + escapeHtml(fmtIndicator(pivot.r2)) + '</strong></div>' +
        '</div>' +
        '<div class="indicator-sr__donchian">' +
          '<div class="indicator-sr__donchian-head">' +
            '<span>Donchian Channel</span>' +
            '<small>Width ' + escapeHtml(fmtPctMaybe(channelWidthPct)) + '</small>' +
          '</div>' +
          '<div class="indicator-sr__donchian-grid">' +
            '<div class="indicator-sr__metric indicator-sr__metric--support"><span>Support</span><strong>' + escapeHtml(fmtIndicator(donchian.support)) + '</strong></div>' +
            '<div class="indicator-sr__metric"><span>Mid</span><strong>' + escapeHtml(fmtIndicator(donchian.midpoint)) + '</strong></div>' +
            '<div class="indicator-sr__metric indicator-sr__metric--resistance"><span>Resistance</span><strong>' + escapeHtml(fmtIndicator(donchian.resistance)) + '</strong></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    targetEls.assetLabel.textContent = assetLabel;
    if (targetEls.modeLabel) targetEls.modeLabel.textContent = modeLabelText || (mode === 'crypto' ? 'Crypto' : 'Stocks');
    targetEls.meta.textContent = metaText;
    targetEls.overallPill.className = pillClass(overall) + ' indicator-pill--overall';
    targetEls.overallPill.textContent = overall;

    targetEls.timeframes.innerHTML = ['1d', '1w', '1m'].map(function (key) {
      var tf = timeframes[key];
      if (!tf) return '';
      hasRows = true;
      var values = tf.values || {};
      var statuses = tf.statuses || {};
      var trend = trendMeta(tf.overall);
      var closeValue = Number(tf.close);
      var ema20Value = Number(values.ema20);
      var ema50Value = Number(values.ema50);
      var emaSignal = '▽ Below EMA20';
      var emaSignalClass = 'indicator-tech__note--neutral';
      if (isFinite(closeValue) && isFinite(ema20Value) && isFinite(ema50Value)) {
        if (closeValue > ema20Value) {
          emaSignal = '▲ Strong above EMA20';
          emaSignalClass = 'indicator-tech__note--up';
        } else if (closeValue < ema50Value) {
          emaSignal = '▽ Closed below EMA50';
          emaSignalClass = 'indicator-tech__note--down';
        } else {
          emaSignal = '▽ Below EMA20';
          emaSignalClass = 'indicator-tech__note--neutral';
        }
      }
      return '<section class="indicator-card">' +
        '<div class="indicator-card__head"><h4>' + escapeHtml(String(key).toUpperCase()) + '</h4><span class="' + escapeHtml(trend.cls) + '" title="' + escapeHtml(trend.label) + '" aria-label="' + escapeHtml(trend.label) + '">' + trend.icon + '</span><span class="' + pillClass(tf.overall) + '">' + escapeHtml(tf.overall || 'Neutral') + '</span></div>' +
        '<div class="indicator-card__rows">' +
          techBlock('EMA Trend', statuses.ema, [
            { label: 'EMA20', value: fmtIndicator(values.ema20) },
            { label: 'EMA50', value: fmtIndicator(values.ema50) },
            { label: 'Close', value: fmtIndicator(tf.close) }
          ], emaSignal, emaSignalClass) +
          techBlock('RSI 14', statuses.rsi, [
            { label: 'RSI', value: fmtIndicator(values.rsi14) },
            { label: 'Period', value: '14' }
          ], 'Wilder smoothing') +
          techBlock('MACD', statuses.macd, [
            { label: 'Line', value: fmtIndicator(values.macdLine) },
            { label: 'Signal', value: fmtIndicator(values.macdSignal) },
            { label: 'Hist', value: fmtIndicator(values.macdHistogram) }
          ]) +
          techBlock('Bollinger', statuses.bollinger, [
            { label: 'Mid', value: fmtIndicator(values.bbMiddle) },
            { label: 'Upper', value: fmtIndicator(values.bbUpper) },
            { label: 'Lower', value: fmtIndicator(values.bbLower) }
          ], String(values.bollingerPosition || 'n/a')) +
          srBlock(tf) +
        '</div>' +
        '<div class="indicator-note">Score: ' + escapeHtml(String(isFinite(Number(tf.score)) ? Number(tf.score) : 0)) + '</div>' +
      '</section>';
    }).join('');

    if (!hasRows) {
      targetEls.timeframes.innerHTML = '<section class="indicator-card"><div class="muted">No indicator snapshot yet.</div></section>';
    }
  }

  function syncMobilePanelOrder() {
    if (!ui || !ui.el) return;
    var layoutEl = document.querySelector('.layout');
    var sidePanelEl = ui.el.detailPanel;
    var indicatorsEl = ui.el.indicatorsPanel;
    if (!layoutEl || !sidePanelEl || !indicatorsEl) return;
    var isMobileLayout = window.matchMedia('(max-width: 1120px)').matches;
    var marketSectionEl = ui.el.marketDataGrid ? ui.el.marketDataGrid.closest('.panel-block') : null;
    var eventsSectionEl = ui.el.eventsList ? ui.el.eventsList.closest('.panel-block') : null;

    if (eventsSectionEl) {
      eventsSectionEl.classList.toggle('hidden', !!isMobileLayout);
    }

    if (isMobileLayout) {
      if (indicatorsEl.parentElement !== sidePanelEl && marketSectionEl) {
        sidePanelEl.insertBefore(indicatorsEl, marketSectionEl.nextSibling);
      }
      indicatorsEl.classList.add('indicators-panel--embedded-mobile');
      return;
    }

    indicatorsEl.classList.remove('indicators-panel--embedded-mobile');
    if (indicatorsEl.parentElement !== layoutEl) {
      layoutEl.insertBefore(indicatorsEl, sidePanelEl.nextSibling);
    }
  }

  function indicatorPanelStateForMode(mode) {
    var target = indicatorModeConfig(mode);
    var slotKey = mode === 'crypto' ? 'crypto' : 'stocks';
    var targetKey = target ? (target.cacheKey || indicatorTargetKey(target)) : '';
    if (!state.indicators[slotKey] || state.indicators[slotKey].targetKey !== targetKey) {
      rebuildIndicatorPanelState(mode, target, {});
    }
    return state.indicators[slotKey];
  }

  function renderAll() {
    ui.setTheme(state.app.theme);
    ui.setLayoutMode(state.app.layoutMode);
    ui.setHoldingsPrivacy(!!state.app.hideHoldings);
    ui.setStocksAutoRefreshToggle(!!state.app.stocksAutoRefreshEnabled, state.app.mode);
    ui.setCryptoAutoRefreshToggle(!!state.app.cryptoAutoRefreshEnabled, state.app.mode);
    ui.setCryptoParticlesToggle(!!state.app.cryptoParticlesEnabled, state.app.mode);
    ui.setDemoModeToggle(!!state.app.demoModeEnabled);
    ui.setApiDebugToggle(!!state.app.apiDebugEnabled);
    ui.setApiDebugPanelVisible(!!state.app.apiDebugEnabled);
    ui.setTwelveDataToggle(!!state.app.twelveDataEnabled);
    ui.setConnectionModeBadge();
    ui.setModeTabs(state.app.mode);
    ui.setNewsSourceValue(state.app.mode === 'crypto' ? state.app.newsSourceCrypto : state.app.newsSourceStocks);
    ui.setNewsScopeToggle(state.app.mode, state.app.newsScopeStocks, !!getSelectedAsset('stocks'));
    ui.setSortValue(state.app.sortBy);
    var items = getModeComputedItems(state.app.mode);
    ensureValidSelection(state.app.mode, items);
    setStoredSelectionForMode(state.app.mode, state.app.selectedKey);
    ui.renderPortfolio({ mode: state.app.mode, items: items, selectedKey: state.app.selectedKey, hideHoldings: !!state.app.hideHoldings });
    ui.renderTotals(getModeTotals(items), !!state.app.hideHoldings);
    renderAllocation(items);
    renderDetails();
    ui.renderIndicatorsPanel(indicatorPanelStateForMode(state.app.mode) || {
      mode: state.app.mode,
      assetLabel: state.app.mode === 'crypto' ? 'No crypto selected' : 'No stock selected',
      overallStatus: 'Neutral',
      metaText: buildIndicatorPanelMeta(state.app.mode, {}),
      timeframes: {}
    });
    syncMobilePanelOrder();
    renderBtcDominancePanel();
    syncCryptoParticles();
    persist();
  }

  function hideIndicatorExplorerSearchResults() {
    if (!ui.el.indicatorExplorerSearchList) return;
    ui.el.indicatorExplorerSearchList.classList.add('hidden');
    ui.el.indicatorExplorerSearchList.innerHTML = '';
  }

  function emptyIndicatorExplorerChart() {
    return {
      title: 'Price Chart',
      meta: 'Search for an asset to load its chart.',
      labels: [],
      values: [],
      label: ''
    };
  }

  function saveIndicatorExplorerSession(modeKey) {
    var normalizedMode = modeKey === 'crypto' ? 'crypto' : 'stocks';
    INDICATOR_EXPLORER.sessions[normalizedMode] = {
      selected: INDICATOR_EXPLORER.selected ? Object.assign({}, INDICATOR_EXPLORER.selected) : null,
      panel: INDICATOR_EXPLORER.panel ? JSON.parse(JSON.stringify(INDICATOR_EXPLORER.panel)) : null,
      chart: INDICATOR_EXPLORER.chart ? JSON.parse(JSON.stringify(INDICATOR_EXPLORER.chart)) : emptyIndicatorExplorerChart()
    };
  }

  function loadIndicatorExplorerSession(modeKey) {
    var normalizedMode = modeKey === 'crypto' ? 'crypto' : 'stocks';
    var session = INDICATOR_EXPLORER.sessions[normalizedMode];
    INDICATOR_EXPLORER.mode = normalizedMode;
    INDICATOR_EXPLORER.query = '';
    INDICATOR_EXPLORER.results = [];
    INDICATOR_EXPLORER.requestId += 1;
    INDICATOR_EXPLORER.chartRequestId += 1;
    INDICATOR_EXPLORER.selected = session && session.selected ? Object.assign({}, session.selected) : null;
    INDICATOR_EXPLORER.panel = session && session.panel ? JSON.parse(JSON.stringify(session.panel)) : null;
    INDICATOR_EXPLORER.chart = session && session.chart ? JSON.parse(JSON.stringify(session.chart)) : emptyIndicatorExplorerChart();
    if (ui.el.indicatorExplorerSearchInput) {
      ui.el.indicatorExplorerSearchInput.value = INDICATOR_EXPLORER.selected ? String(INDICATOR_EXPLORER.selected.label || '') : '';
    }
  }

  function renderIndicatorExplorerSearchResults() {
    var listEl = ui.el.indicatorExplorerSearchList;
    if (!listEl) return;
    if (!INDICATOR_EXPLORER.results.length) {
      listEl.classList.add('hidden');
      listEl.innerHTML = '';
      return;
    }
    listEl.classList.remove('hidden');
    listEl.innerHTML = INDICATOR_EXPLORER.results.map(function (item, idx) {
      var sub = INDICATOR_EXPLORER.mode === 'crypto'
        ? String(item.symbol || '').toUpperCase()
        : String(item.symbol || item.yahooSymbol || '').toUpperCase();
      var rawName = String(item.name || item.id || '').trim();
      var normalizedName = rawName.toUpperCase();
      var secondary = (rawName && normalizedName !== sub)
        ? rawName
        : (INDICATOR_EXPLORER.mode === 'stocks' ? String(item.market || item.stooq || '').trim() : '');
      return '<button class="autocomplete__item" type="button" data-indicator-explorer-idx="' + idx + '">' +
        '<strong>' + escapeHtml(sub) + '</strong>' +
        (secondary ? ('<span>' + escapeHtml(secondary) + '</span>') : '') +
      '</button>';
    }).join('');
  }

  function renderIndicatorExplorer() {
    if (!ui || !ui.el || !ui.el.indicatorExplorerModal) return;
    var isCrypto = INDICATOR_EXPLORER.mode === 'crypto';
    if (ui.el.indicatorExplorerStocksTab) {
      ui.el.indicatorExplorerStocksTab.classList.toggle('is-active', !isCrypto);
      ui.el.indicatorExplorerStocksTab.setAttribute('aria-selected', !isCrypto ? 'true' : 'false');
    }
    if (ui.el.indicatorExplorerCryptoTab) {
      ui.el.indicatorExplorerCryptoTab.classList.toggle('is-active', isCrypto);
      ui.el.indicatorExplorerCryptoTab.setAttribute('aria-selected', isCrypto ? 'true' : 'false');
    }
    if (ui.el.indicatorExplorerSearchInput) {
      ui.el.indicatorExplorerSearchInput.placeholder = isCrypto ? 'Search SOL or Solana' : 'Search TSLA or Tesla';
    }
    var hasSelection = !!INDICATOR_EXPLORER.selected;
    if (ui.el.indicatorExplorerChartTitle && ui.el.indicatorExplorerChartTitle.closest('.panel-block')) {
      ui.el.indicatorExplorerChartTitle.closest('.panel-block').classList.toggle('hidden', !hasSelection);
    }
    if (ui.el.indicatorExplorerAssetLabel && ui.el.indicatorExplorerAssetLabel.closest('.panel-block')) {
      ui.el.indicatorExplorerAssetLabel.closest('.panel-block').classList.toggle('hidden', !hasSelection);
    }
    if (ui.el.indicatorExplorerTimeframes) {
      ui.el.indicatorExplorerTimeframes.classList.toggle('hidden', !hasSelection);
    }
    if (ui.el.indicatorExplorerChartTimeframes) {
      ui.el.indicatorExplorerChartTimeframes.classList.toggle('hidden', !hasSelection);
      renderChartTimeframeButtons(
        ui.el.indicatorExplorerChartTimeframes,
        explorerChartTimeframeForMode(INDICATOR_EXPLORER.mode),
        'explorer',
        INDICATOR_EXPLORER.mode
      );
    }
    renderIndicatorExplorerChart();
    if (hasSelection) {
      renderIndicatorSnapshot({
        assetLabel: ui.el.indicatorExplorerAssetLabel,
        modeLabel: ui.el.indicatorExplorerModeLabel,
        overallPill: ui.el.indicatorExplorerOverallPill,
        meta: ui.el.indicatorExplorerMeta,
        timeframes: ui.el.indicatorExplorerTimeframes
      }, INDICATOR_EXPLORER.panel || {
        mode: INDICATOR_EXPLORER.mode,
        assetLabel: isCrypto ? 'No crypto selected' : 'No stock selected',
        overallStatus: 'Neutral',
        metaText: 'Search for an asset to load its indicator snapshots.',
        timeframes: {}
      }, isCrypto ? 'Crypto Explorer' : 'Stocks Explorer');
    }
    renderIndicatorExplorerSearchResults();
  }

  function setIndicatorExplorerMode(modeKey) {
    saveIndicatorExplorerSession(INDICATOR_EXPLORER.mode);
    loadIndicatorExplorerSession(modeKey);
    hideIndicatorExplorerSearchResults();
    renderIndicatorExplorer();
  }

  function openIndicatorExplorerModal() {
    if (!ui.el.indicatorExplorerModal) return;
    ui.el.indicatorExplorerModal.classList.remove('hidden');
    ui.el.indicatorExplorerModal.setAttribute('aria-hidden', 'false');
    loadIndicatorExplorerSession(INDICATOR_EXPLORER.mode);
    renderIndicatorExplorer();
    if (ui.el.indicatorExplorerSearchInput) ui.el.indicatorExplorerSearchInput.focus();
  }

  function closeIndicatorExplorerModal() {
    if (!ui.el.indicatorExplorerModal) return;
    saveIndicatorExplorerSession(INDICATOR_EXPLORER.mode);
    ui.el.indicatorExplorerModal.classList.add('hidden');
    ui.el.indicatorExplorerModal.setAttribute('aria-hidden', 'true');
    hideIndicatorExplorerSearchResults();
  }

  function runIndicatorExplorerSearch() {
    var inputEl = ui.el.indicatorExplorerSearchInput;
    if (!inputEl) return;
    var q = String(inputEl.value || '').trim();
    INDICATOR_EXPLORER.query = q;
    if (q.length < 1) {
      INDICATOR_EXPLORER.results = [];
      hideIndicatorExplorerSearchResults();
      return;
    }
    var reqId = ++INDICATOR_EXPLORER.requestId;
    var searchTask = INDICATOR_EXPLORER.mode === 'crypto'
      ? (PT.CryptoAPI && typeof PT.CryptoAPI.searchAssets === 'function' ? PT.CryptoAPI.searchAssets(q) : Promise.resolve([]))
      : (PT.StockAPI && typeof PT.StockAPI.searchSymbols === 'function' ? PT.StockAPI.searchSymbols(q) : Promise.resolve([]));
    searchTask.then(function (items) {
      if (reqId !== INDICATOR_EXPLORER.requestId) return;
      INDICATOR_EXPLORER.results = (Array.isArray(items) ? items : []).slice(0, 8);
      renderIndicatorExplorerSearchResults();
    }).catch(function () {
      if (reqId !== INDICATOR_EXPLORER.requestId) return;
      INDICATOR_EXPLORER.results = [];
      hideIndicatorExplorerSearchResults();
    });
  }

  function renderIndicatorExplorerChart() {
    if (!ui || !ui.el) return;
    var chartState = INDICATOR_EXPLORER.chart || {};
    if (ui.el.indicatorExplorerChartTitle) {
      ui.el.indicatorExplorerChartTitle.textContent = chartState.title || 'Price Chart';
    }
    if (ui.el.indicatorExplorerChartMeta) {
      ui.el.indicatorExplorerChartMeta.textContent = chartState.meta || '';
    }
    if (!chartMgr || typeof chartMgr.renderAssetLine !== 'function') return;
    chartMgr.renderAssetLine(
      ui.el.indicatorExplorerChart,
      ui.el.indicatorExplorerChartFallback,
      Array.isArray(chartState.labels) ? chartState.labels : [],
      Array.isArray(chartState.values) ? chartState.values : [],
      chartState.label || '',
      'indicator-explorer'
    );
  }

  function renderChartTimeframeButtons(container, selectedId, context, mode) {
    if (!container) return;
    var selected = normalizeChartTimeframe(selectedId || '1M');
    container.innerHTML = CHART_TIMEFRAMES.map(function (tf) {
      var cls = 'chart-timeframe-btn' + (tf.id === selected ? ' is-active' : '');
      return '<button type="button" class="' + cls + '" data-chart-context="' + context + '" data-chart-mode="' + mode + '" data-chart-tf="' + tf.id + '">' + tf.label + '</button>';
    }).join('');
  }

  function applyDetailChartTimeframe(mode, timeframeId) {
    var safeMode = mode === 'crypto' ? 'crypto' : 'stocks';
    setDetailChartTimeframeForMode(safeMode, timeframeId);
    renderDetails();
    persist();
  }

  function applyExplorerChartTimeframe(mode, timeframeId) {
    var safeMode = mode === 'crypto' ? 'crypto' : 'stocks';
    setExplorerChartTimeframeForMode(safeMode, timeframeId);
    if (INDICATOR_EXPLORER.selected && INDICATOR_EXPLORER.selected.mode === safeMode) {
      fetchIndicatorExplorerChart(INDICATOR_EXPLORER.selected);
    } else {
      renderIndicatorExplorer();
    }
    saveIndicatorExplorerSession(safeMode);
    persist();
  }

  function fetchIndicatorExplorerChart(target) {
    if (!target) return Promise.resolve();
    var timeframeId = explorerChartTimeframeForMode(target.mode || INDICATOR_EXPLORER.mode);
    var reqId = ++INDICATOR_EXPLORER.chartRequestId;
    INDICATOR_EXPLORER.chart = {
      title: (target.label || target.symbol || 'Asset') + ' Chart',
      meta: 'Loading chart...',
      labels: [],
      values: [],
      label: ''
    };
    renderIndicatorExplorer();
    return fetchHistoryForExplorerTimeframe(target, timeframeId)
      .then(function (hist) {
        if (reqId !== INDICATOR_EXPLORER.chartRequestId) return;
        var rows = filterHistoryForTimeframe(hist, timeframeId);
        INDICATOR_EXPLORER.chart = {
          title: (target.label || target.symbol || 'Asset') + ' Chart • ' + normalizeChartTimeframe(timeframeId),
          meta: rows.length ? ('Loaded ' + rows.length + ' points') : 'No chart data available.',
          labels: rows.map(function (p) { return p.t; }),
          values: rows.map(function (p) { return p.c; }),
          label: (target.symbol || '').replace('/USD', '') + ' price'
        };
        renderIndicatorExplorer();
        saveIndicatorExplorerSession(target.mode);
      })
      .catch(function () {
        if (reqId !== INDICATOR_EXPLORER.chartRequestId) return;
        INDICATOR_EXPLORER.chart = {
          title: (target.label || target.symbol || 'Asset') + ' Chart',
          meta: 'Chart data unavailable.',
          labels: [],
          values: [],
          label: ''
        };
        renderIndicatorExplorer();
        saveIndicatorExplorerSession(target.mode);
      });
  }

  function selectIndicatorExplorerItem(item) {
    var target = indicatorTargetFromExplorerItem(item, INDICATOR_EXPLORER.mode);
    if (!target) return;
    // Invalidate in-flight autocomplete responses so the list cannot re-open after selection.
    INDICATOR_EXPLORER.requestId += 1;
    INDICATOR_EXPLORER.results = [];
    INDICATOR_EXPLORER.query = target.symbol || '';
    INDICATOR_EXPLORER.selected = target;
    hideIndicatorExplorerSearchResults();
    if (ui.el.indicatorExplorerSearchInput) {
      ui.el.indicatorExplorerSearchInput.value = target.label;
    }
    fetchIndicatorExplorerChart(target);
    INDICATOR_EXPLORER.panel = rebuildIndicatorPanelState(target.mode, target, {
      usedCache: true,
      assetLabel: target.label
    }, false);
    renderIndicatorExplorer();
    saveIndicatorExplorerSession(target.mode);
    setStatus('Loading ' + target.label + ' indicators...');
    refreshIndicatorsForMode(target.mode, target, false).then(function (result) {
      INDICATOR_EXPLORER.panel = result && result.state ? result.state : rebuildIndicatorPanelState(target.mode, target, {}, false);
      renderIndicatorExplorer();
      saveIndicatorExplorerSession(target.mode);
      setStatus((result && result.ok ? 'Loaded ' : 'Updated ') + target.label + ' indicators');
    }).catch(function (err) {
      INDICATOR_EXPLORER.panel = rebuildIndicatorPanelState(target.mode, target, {
        error: (err && err.message) || 'Indicator refresh failed',
        usedCache: true
      }, false);
      renderIndicatorExplorer();
      saveIndicatorExplorerSession(target.mode);
      setStatus('Indicator refresh failed');
    });
  }

  function renderAllocation(items) {
    var sorted = items.slice().sort(function (a, b) { return b.marketValue - a.marketValue; });
    var labels = sorted.map(function (i) { return i.symbol; });
    var values = sorted.map(function (i) { return Number(i.marketValue.toFixed(2)); });
    chartMgr.renderAllocation(ui.el.allocationChart, ui.el.pieFallback, labels, values);
    ui.renderAllocationLegend(sorted, AUTO_COLORS, !!state.app.hideHoldings);
  }

  function setAllocationLegendHighlight(index) {
    if (!ui || !ui.el || !ui.el.allocationLegend) return;
    var rows = ui.el.allocationLegend.querySelectorAll('.legend-item');
    var i;
    var active = isFinite(Number(index)) ? Number(index) : -1;
    for (i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('is-active', i === active);
      rows[i].classList.toggle('is-dimmed', active >= 0 && i !== active);
    }
  }

  function clearAllocationLegendHighlight() {
    setAllocationLegendHighlight(-1);
    if (chartMgr && typeof chartMgr.clearAllocationHighlight === 'function') {
      chartMgr.clearAllocationHighlight();
    }
  }

  function renderDetails() {
    var asset = getSelectedAsset(state.app.mode);
    var computed = getSelectedComputed(state.app.mode);
    var baseQuote = asset ? getMarketFor(asset) : null;
    var detailTf = detailChartTimeframeForMode(state.app.mode);
    renderChartTimeframeButtons(ui.el.detailChartTimeframes, detailTf, 'detail', state.app.mode);
    ui.renderDetailHeader(asset, computed || {}, !!state.app.hideHoldings, baseQuote || null);
    ui.renderExternalLink(asset);
    renderUsefulLinks(asset);
    if (!asset) {
      ui.renderMarketData(null, null);
      if (state.app.mode === 'stocks') {
        ui.renderNews(state.news['stocks:general'] || [], 'No general market news yet. Use Refresh.');
      } else {
        ui.renderNews([], 'Select an asset to load news.');
      }
      ui.renderTwitter({ message: 'Select an asset to load Stocktwits feed.', searchUrl: '#', linkLabel: 'Open Stocktwits' });
      ui.renderEvents([]);
      chartMgr.renderAssetLine(ui.el.assetChart, ui.el.lineFallback, [], [], '');
      return;
    }
    var quoteData = getMarketFor(asset);
    if (!state.news[assetKey(asset)]) {
      hydrateAssetNewsFromCache(asset, 1000 * 60 * 60 * 24 * 3);
    }
    if (asset.type === 'stock') {
      var clock = getStockMarketClock(asset.market, new Date());
      quoteData = Object.assign({}, quoteData || {}, {
        market: asset.market || clock.market,
        marketIsOpen: clock.isOpen,
        marketCountdownMs: clock.countdownMs,
        marketSessionLabel: clock.sessionLabel,
        marketCountdownLabel: clock.countdownLabel
      });
    }
    ui.renderMarketData(quoteData, asset, 'No live market data yet. Use Refresh Prices.');
    if (asset.type === 'stock' && state.app.newsScopeStocks === 'general') {
      ui.renderNews(state.news['stocks:general'] || [], 'General market news unavailable.');
    } else {
      ui.renderNews(state.news[assetKey(asset)] || [], 'News unavailable (check network/CORS); cached news appears when available.');
    }
    ui.renderTwitter(state.twitter[assetKey(asset)] || PT.TwitterAPI.getPlaceholder(asset));
    ui.renderEvents(state.events[assetKey(asset)] || []);
    var history = (asset.type === 'crypto' ? state.history.crypto : state.history.stocks)[asset.id] || [];
    var cachedTfRows = getCachedAny(chartCacheKeyForAsset(asset, detailTf));
    if (Array.isArray(cachedTfRows) && cachedTfRows.length) history = cachedTfRows;
    var filteredRows = filterHistoryForTimeframe(history, detailTf);
    chartMgr.renderAssetLine(
      ui.el.assetChart,
      ui.el.lineFallback,
      filteredRows.map(function (p) { return p.t; }),
      filteredRows.map(function (p) { return p.c; }),
      asset.symbol + ' price'
    );
    fetchHistoryForAssetTimeframe(asset, detailTf).then(function (rows) {
      var freshRows = filterHistoryForTimeframe(rows, detailTf);
      var selected = getSelectedAsset(state.app.mode);
      if (!selected || selected.id !== asset.id) return;
      chartMgr.renderAssetLine(
        ui.el.assetChart,
        ui.el.lineFallback,
        freshRows.map(function (p) { return p.t; }),
        freshRows.map(function (p) { return p.c; }),
        selected.symbol + ' price'
      );
    }).catch(function () {
      return null;
    });
  }

  function renderUsefulLinks(asset) {
    var links = [];
    // Keep stock links first in the list, regardless of current mode.
    links.push({
      label: 'AskCharly Ratings',
      href: 'https://www.askcharly.ai/ratings',
      note: 'Analyst-style ratings dashboard (stocks)'
    });
    links.push({
      label: asset && asset.type === 'stock' && asset.symbol ? 'Finviz (' + asset.symbol + ')' : 'Finviz Screener',
      href: asset && asset.type === 'stock' && asset.symbol
        ? 'https://finviz.com/quote.ashx?t=' + encodeURIComponent(asset.symbol)
        : 'https://finviz.com/screener.ashx',
      note: asset && asset.type === 'stock' && asset.symbol ? 'Quote, news, and technical snapshot' : 'Stock screener and market overview'
    });
    links.push({
      label: 'Finviz Heatmap',
      href: 'https://finviz.com/map.ashx?t=sec',
      note: 'Sector performance map'
    });
    if (asset && asset.type === 'stock' && asset.symbol) {
      links.push({
        label: 'TradingView (' + asset.symbol + ')',
        href: 'https://www.tradingview.com/symbols/' + encodeURIComponent(asset.symbol) + '/',
        note: 'Chart, ideas, and market overview'
      });
    }

    if (state.app.mode === 'crypto') {
      if (asset && asset.coinId) {
        links.push({
          label: 'CoinGecko (' + asset.symbol + ')',
          href: 'https://www.coingecko.com/en/coins/' + encodeURIComponent(asset.coinId),
          note: 'Market data and coin overview'
        });
      }
      links.push({
        label: 'CoinGecko Trending',
        href: 'https://www.coingecko.com/en/discover',
        note: 'Broader crypto discovery and trends'
      });
    }
    ui.renderUsefulLinks(links);
  }

  function renderBtcDominancePanel() {
    var g = state.globals && state.globals.crypto ? state.globals.crypto : null;
    var current = g ? g.btcDominanceCurrent : null;
    var eth = g ? g.ethDominanceCurrent : null;
    var updatedAt = g ? g.updatedAt : null;
    ui.renderBtcDominanceMeta(current, eth, updatedAt);
  }

  function applyThemeToggle() {
    state.app.theme = state.app.theme === 'dark' ? 'light' : 'dark';
    renderAll();
  }

  function applyLayoutToggle() {
    state.app.layoutMode = state.app.layoutMode === 'wide' ? 'narrow' : 'wide';
    renderAll();
  }

  function applyHoldingsPrivacyToggle() {
    state.app.hideHoldings = !state.app.hideHoldings;
    renderAll();
  }

  function applyCryptoParticlesToggle() {
    state.app.cryptoParticlesEnabled = !state.app.cryptoParticlesEnabled;
    renderAll();
  }

  function syncCryptoParticles() {
    if (!CRYPTO_PARTICLES || typeof CRYPTO_PARTICLES.setActive !== 'function') return;
    var active = !!state.app.cryptoParticlesEnabled;
    CRYPTO_PARTICLES.setActive(active);
  }

  function fallbackCryptoSymbol(id) {
    var map = {
      bitcoin: 'BTC',
      ethereum: 'ETH',
      tether: 'USDT',
      ripple: 'XRP',
      binancecoin: 'BNB',
      solana: 'SOL',
      'usd-coin': 'USDC',
      dogecoin: 'DOGE',
      cardano: 'ADA',
      tron: 'TRX'
    };
    return map[id] || String(id || '').slice(0, 5).toUpperCase();
  }

  function buildDemoPortfolio() {
    var stockRefs = DEMO_STOCKS.map(function (symbol) {
      var ref = (state.symbols.stocks || []).find(function (s) { return String(s.symbol || '').toUpperCase() === symbol; }) || {};
      return {
        symbol: symbol,
        name: ref.name || symbol,
        stooq: ref.stooq || (symbol.toLowerCase() + '.us'),
        yahooSymbol: ref.yahooSymbol || symbol,
        market: ref.market || 'NASDAQ'
      };
    });

    var stockTasks = stockRefs.map(function (ref) {
      var assetRef = {
        type: 'stock',
        symbol: ref.symbol,
        name: ref.name,
        stooqSymbol: ref.stooq,
        yahooSymbol: ref.yahooSymbol,
        market: ref.market
      };
      return PT.StockAPI.getQuote(assetRef).then(function (quote) {
        var px = preferredQuotePriceForEntry(quote);
        if (!(isFinite(Number(px)) && Number(px) > 0)) px = 100;
        return {
          id: id(),
          type: 'stock',
          symbol: ref.symbol,
          name: ref.name,
          stooqSymbol: ref.stooq,
          yahooSymbol: ref.yahooSymbol,
          market: ref.market,
          entryPrice: Number(px),
          quantity: Number((1000 / Number(px)).toFixed(8))
        };
      }).catch(function () {
        var fallbackPrice = 100;
        return {
          id: id(),
          type: 'stock',
          symbol: ref.symbol,
          name: ref.name,
          stooqSymbol: ref.stooq,
          yahooSymbol: ref.yahooSymbol,
          market: ref.market,
          entryPrice: fallbackPrice,
          quantity: Number((1000 / fallbackPrice).toFixed(8))
        };
      });
    });

    return Promise.all(stockTasks).then(function (stocks) {
      return PT.CryptoAPI.getQuotes(DEMO_CRYPTO_IDS).then(function (quoteMap) {
        var crypto = DEMO_CRYPTO_IDS.map(function (coinId) {
          var ref = (state.symbols.crypto || []).find(function (c) { return c.id === coinId; }) || {};
          var q = quoteMap && quoteMap[coinId] ? quoteMap[coinId] : null;
          var px = q && isFinite(Number(q.price)) && Number(q.price) > 0 ? Number(q.price) : 1;
          return {
            id: id(),
            type: 'crypto',
            coinId: coinId,
            symbol: ref.symbol || fallbackCryptoSymbol(coinId),
            name: ref.name || coinId.replace(/-/g, ' '),
            entryPrice: px,
            quantity: Number((1000 / px).toFixed(8))
          };
        });
        return { stocks: stocks, crypto: crypto };
      }).catch(function () {
        var fallbackCrypto = DEMO_CRYPTO_IDS.map(function (coinId) {
          var ref = (state.symbols.crypto || []).find(function (c) { return c.id === coinId; }) || {};
          return {
            id: id(),
            type: 'crypto',
            coinId: coinId,
            symbol: ref.symbol || fallbackCryptoSymbol(coinId),
            name: ref.name || coinId.replace(/-/g, ' '),
            entryPrice: 1,
            quantity: 1000
          };
        });
        return { stocks: stocks, crypto: fallbackCrypto };
      });
    });
  }

  function setDemoModeEnabled(enabled) {
    if (!!enabled === !!state.app.demoModeEnabled) return Promise.resolve();
    if (enabled) {
      storage.saveDemoPortfolioBackup(clone(state.portfolio));
      setStatus('Building demo portfolio...');
      return buildDemoPortfolio().then(function (demoPortfolio) {
        state.portfolio = demoPortfolio;
        state.app.demoModeEnabled = true;
        state.app.selectedKey = null;
        state.app.selectedStocksKey = null;
        state.app.selectedCryptoKey = null;
        renderAll();
        setStatus('Demo mode enabled');
      }).catch(function () {
        setStatus('Demo mode failed');
      });
    }

    var backup = storage.loadDemoPortfolioBackup();
    if (!backup || !Array.isArray(backup.stocks) || !Array.isArray(backup.crypto)) {
      setStatus('No demo backup found to restore');
      return Promise.resolve();
    }
    state.portfolio = backup;
    state.app.demoModeEnabled = false;
    state.app.selectedKey = null;
    state.app.selectedStocksKey = null;
    state.app.selectedCryptoKey = null;
    storage.clearDemoPortfolioBackup();
    renderAll();
    setStatus('Demo mode disabled');
    return Promise.resolve();
  }

  function applyDemoModeToggle() {
    return setDemoModeEnabled(!state.app.demoModeEnabled);
  }

  function applyApiDebugToggle() {
    state.app.apiDebugEnabled = !state.app.apiDebugEnabled;
    renderAll();
  }

  function openAddModal(asset) {
    state.app.editingAssetId = asset ? asset.id : null;
    AUTO_SELECTED_ITEM = asset ? {
      type: asset.type,
      id: asset.coinId,
      stooq: asset.stooqSymbol,
      yahooSymbol: asset.yahooSymbol,
      symbol: asset.symbol,
      name: asset.name,
      market: asset.market
    } : null;
    ui.openModal({ asset: asset || null, editing: !!asset, defaultType: modeToAssetType(state.app.mode) });
  }

  function closeModal() {
    state.app.editingAssetId = null;
    AUTO_SELECTED_ITEM = null;
    ui.closeModal();
  }

  function openPositionActionModal(asset, action) {
    if (!asset) return;
    var quote = getMarketFor(asset);
    var defaultPrice = preferredQuotePriceForEntry(quote);
    if (defaultPrice === null) defaultPrice = Number(asset.entryPrice) || 0;
    POSITION_ACTION = {
      assetId: asset.id,
      mode: state.app.mode,
      action: action
    };
    ui.openPositionModal({
      asset: asset,
      action: action,
      defaultPrice: defaultPrice
    });
  }

  function closePositionActionModal() {
    POSITION_ACTION = null;
    ui.closePositionModal();
  }

  function autocompleteSearch() {
    if (AUTO_TIMER) clearTimeout(AUTO_TIMER);
    AUTO_TIMER = setTimeout(runAutocompleteSearch, 220);
  }

  function runAutocompleteSearch() {
    var type = ui.el.assetTypeInput.value === 'crypto' ? 'crypto' : 'stock';
    var q = ui.el.assetSearchInput.value.trim().toLowerCase();
    var reqId;
    if (!q) {
      AUTO_ITEMS = [];
      ui.hideAutocomplete();
      return;
    }
    if ((type === 'stock' && q.length < 1) || (type === 'crypto' && q.length < 2)) {
      ui.renderAutocompleteMessage(type === 'stock' ? 'Type at least 1 character...' : 'Type at least 2 characters...');
      return;
    }

    reqId = ++AUTO_REQ_ID;
    ui.renderAutocompleteMessage('Searching live...');

    (type === 'crypto' ? PT.CryptoAPI.searchAssets(q) : PT.StockAPI.searchSymbols(q))
      .then(function (items) {
        if (reqId !== AUTO_REQ_ID) return;
        if (!items.length) items = localAutocompleteFallback(type, q);
        AUTO_ITEMS = items;
        if (!AUTO_ITEMS.length) {
          ui.renderAutocompleteMessage('No matches found');
          return;
        }
        ui.renderAutocomplete(AUTO_ITEMS);
      })
      .catch(function () {
        if (reqId !== AUTO_REQ_ID) return;
        AUTO_ITEMS = localAutocompleteFallback(type, q);
        if (AUTO_ITEMS.length) ui.renderAutocomplete(AUTO_ITEMS);
        else ui.renderAutocompleteMessage(type === 'stock'
          ? 'Live stock search unavailable (API/CORS).'
          : 'Live search unavailable (API/CORS). No fallback matches.');
      });
  }

  function chooseAutocomplete(item) {
    if (!item) return;
    AUTO_SELECTED_ITEM = item;
    ui.el.assetSearchInput.value = item.symbol + ' - ' + item.name;
    ui.el.assetSelectedId.value = item.type === 'crypto' ? item.id : item.stooq;
    ui.hideAutocomplete();
    prefillEntryPriceFromLive(item);
  }

  function preferredQuotePriceForEntry(quote) {
    if (!quote) return null;
    if (isFinite(Number(quote.regularMarketPrice))) return Number(quote.regularMarketPrice);
    if (isFinite(Number(quote.price))) return Number(quote.price);
    if (isFinite(Number(quote.preMarketPrice))) return Number(quote.preMarketPrice);
    if (isFinite(Number(quote.postMarketPrice))) return Number(quote.postMarketPrice);
    return null;
  }

  function getCachedQuoteForAutocompleteItem(item) {
    var quoteMap;
    var i;
    var asset;
    if (!item) return null;
    quoteMap = item.type === 'crypto' ? state.market.crypto : state.market.stocks;
    for (i in quoteMap) {
      if (!Object.prototype.hasOwnProperty.call(quoteMap, i)) continue;
      asset = quoteMap[i];
      // quote maps are keyed by asset id; use stored quote object + symbol match through portfolio scan
    }

    if (item.type === 'crypto') {
      for (i = 0; i < state.portfolio.crypto.length; i++) {
        if (state.portfolio.crypto[i].coinId === item.id && state.market.crypto[state.portfolio.crypto[i].id]) {
          return state.market.crypto[state.portfolio.crypto[i].id];
        }
      }
      return storage.getCached(state.caches, 'quote:crypto:' + item.id, 0) || getCachedAny('quote:crypto:' + item.id);
    }

    for (i = 0; i < state.portfolio.stocks.length; i++) {
      if (state.portfolio.stocks[i].stooqSymbol === item.stooq && state.market.stocks[state.portfolio.stocks[i].id]) {
        return state.market.stocks[state.portfolio.stocks[i].id];
      }
    }
    return storage.getCached(state.caches, 'quote:stock:' + String(item.stooq || '').toLowerCase(), 0) ||
      getCachedAny('quote:stock:' + String(item.stooq || '').toLowerCase());
  }

  function prefillEntryPriceFromLive(item) {
    var isEditing = !!state.app.editingAssetId;
    var priceReqId = ++AUTO_PRICE_REQ_ID;
    var selectedRef = item.type === 'crypto' ? item.id : item.stooq;
    if (isEditing && ui.el.entryPriceInput.value) return;

    // Reset field on new selection so an old asset price doesn't linger if the new fetch is slow/fails.
    ui.el.entryPriceInput.value = '';

    var asset = item.type === 'crypto'
      ? { type: 'crypto', coinId: item.id, id: item.id, symbol: item.symbol, name: item.name }
      : { type: 'stock', stooqSymbol: item.stooq, yahooSymbol: item.yahooSymbol || item.symbol, symbol: item.symbol, name: item.name, market: item.market || 'US' };

    // Use an already-fetched quote immediately if we have one.
    var cachedQuote = getCachedQuoteForAutocompleteItem(item);
    var cachedPrice = preferredQuotePriceForEntry(cachedQuote);
    if (cachedPrice !== null && (!isEditing || !ui.el.entryPriceInput.value)) {
      ui.el.entryPriceInput.value = String(cachedPrice);
    }

    ui.el.entryPriceInput.placeholder = 'Loading current price...';

    function applyPrefillQuote(quote) {
      if (priceReqId !== AUTO_PRICE_REQ_ID) return;
      var p = preferredQuotePriceForEntry(quote);
      if (p === null) return;
      if (!ui.el.assetSelectedId.value) return;
      if (ui.el.assetSelectedId.value !== selectedRef) return;
      if (!isEditing || !ui.el.entryPriceInput.value) {
        ui.el.entryPriceInput.value = String(p);
      }
    }

    function getCryptoPrefillQuote() {
      if (item.type !== 'crypto') return Promise.reject(new Error('not-crypto'));
      var coinId = String(item.id || '').trim();
      if (!coinId) return Promise.reject(new Error('missing-coin-id'));
      var cfg = window.PT_CONFIG || {};
      var directUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(coinId) + '&vs_currencies=usd';
      var cached = storage.getCached(state.caches, 'quote:crypto:' + coinId, 1000 * 60 * 10) || getCachedAny('quote:crypto:' + coinId);
      if (cached) return Promise.resolve(cached);

      function parseSimplePrice(data) {
        var row = data && data[coinId];
        var px = row && isFinite(Number(row.usd)) ? Number(row.usd) : null;
        if (px === null) throw new Error('No CoinGecko price');
        var quote = { price: px, fetchedAt: Date.now(), source: 'coingecko-prefill' };
        storage.setCached(state.caches, 'quote:crypto:' + coinId, quote);
        storage.saveCache(state.caches);
        return quote;
      }

      function fetchJsonUrl(url) {
        return fetch(url, { cache: 'no-store' }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        }).then(function (text) {
          var data = text ? JSON.parse(text) : {};
          return parseSimplePrice(data);
        });
      }

      function fetchCoinMarketCapProxy() {
        var symbol = String(item.symbol || '').trim().toUpperCase();
        if (!symbol) return Promise.reject(new Error('missing-symbol'));
        var proxyBase = String(cfg.proxyBase || (location.protocol === 'file:' ? 'http://localhost:5500' : location.origin)).replace(/\/$/, '');
        var url = proxyBase + '/api/cmc/quote/' + encodeURIComponent(symbol);
        return fetch(url, { cache: 'no-store' }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }).then(function (data) {
          var px = data && isFinite(Number(data.price)) ? Number(data.price) : null;
          if (px === null) throw new Error('No CMC price');
          var quote = {
            price: px,
            change24h: isFinite(Number(data.change24h)) ? Number(data.change24h) : null,
            fetchedAt: isFinite(Number(data.fetchedAt)) ? Number(data.fetchedAt) : Date.now(),
            source: 'coinmarketcap-prefill'
          };
          storage.setCached(state.caches, 'quote:crypto:' + coinId, quote);
          storage.saveCache(state.caches);
          return quote;
        });
      }

      var attempts = [];
      // PT.CryptoAPI.getQuote already honors proxy mode via scripts/api/crypto.js, so use it first.
      attempts.push(function () {
        return PT.CryptoAPI.getQuote(asset).then(function (quote) {
          if (quote) {
            storage.setCached(state.caches, 'quote:crypto:' + coinId, quote);
            storage.saveCache(state.caches);
          }
          return quote;
        });
      });
      attempts.push(function () { return fetchJsonUrl(directUrl); });
      attempts.push(fetchCoinMarketCapProxy);

      function runAttempt(i) {
        if (i >= attempts.length) return Promise.reject(new Error('crypto-prefill-failed'));
        return attempts[i]().catch(function () { return runAttempt(i + 1); });
      }
      return runAttempt(0);
    }

    (item.type === 'crypto' ? getCryptoPrefillQuote() : PT.StockAPI.getQuote(asset))
      .then(function (quote) {
        applyPrefillQuote(quote);
      })
      .catch(function () {
        // leave manual entry if live quote fetch is blocked
      })
      .finally(function () {
        if (priceReqId !== AUTO_PRICE_REQ_ID) return;
        ui.el.entryPriceInput.placeholder = '25000';
      });
  }

  function upsertAssetFromForm() {
    var type = ui.el.assetTypeInput.value === 'crypto' ? 'crypto' : 'stock';
    var refId = ui.el.assetSelectedId.value.trim();
    var qStr = ui.el.quantityInput.value;
    var eStr = ui.el.entryPriceInput.value;
    var quantity = Number(qStr);
    var entryPrice = Number(eStr);
    if (!refId) throw new Error('Select an asset from autocomplete first.');
    if (!(quantity > 0)) throw new Error('Quantity must be greater than 0.');
    if (!(entryPrice >= 0)) throw new Error('Entry price must be 0 or greater.');

    var arr = type === 'stock' ? state.portfolio.stocks : state.portfolio.crypto;
    var existingIndex = -1;
    if (state.app.editingAssetId) {
      existingIndex = arr.findIndex(function (a) { return a.id === state.app.editingAssetId; });
    }

    var selected;
    if (AUTO_SELECTED_ITEM && AUTO_SELECTED_ITEM.type === type && (type === 'crypto' ? AUTO_SELECTED_ITEM.id : AUTO_SELECTED_ITEM.stooq) === refId) {
      selected = AUTO_SELECTED_ITEM;
    }
    if (type === 'stock') {
      selected = selected || state.symbols.stocks.find(function (s) { return s.stooq === refId; });
      if (!selected && existingIndex >= 0 && arr[existingIndex].stooqSymbol === refId) {
        selected = {
          symbol: arr[existingIndex].symbol,
          yahooSymbol: arr[existingIndex].yahooSymbol || arr[existingIndex].symbol,
          name: arr[existingIndex].name,
          stooq: arr[existingIndex].stooqSymbol,
          market: arr[existingIndex].market || 'NASDAQ'
        };
      }
      if (!selected) throw new Error('Unknown stock symbol.');
    } else {
      selected = selected || state.symbols.crypto.find(function (c) { return c.id === refId; });
      if (!selected && existingIndex >= 0 && arr[existingIndex].coinId === refId) {
        selected = {
          id: arr[existingIndex].coinId,
          symbol: arr[existingIndex].symbol,
          name: arr[existingIndex].name
        };
      }
      if (!selected) throw new Error('Unknown crypto asset.');
    }
    var asset = {
      id: existingIndex >= 0 ? arr[existingIndex].id : id(),
      type: type,
      symbol: selected.symbol,
      name: selected.name,
      quantity: quantity,
      entryPrice: entryPrice
    };
    if (type === 'stock') {
      asset.stooqSymbol = selected.stooq;
      asset.market = selected.market || 'NASDAQ';
      asset.yahooSymbol = selected.yahooSymbol || selected.symbol;
    } else {
      asset.coinId = selected.id;
    }

    if (existingIndex >= 0) arr[existingIndex] = asset;
    else arr.push(asset);

    state.app.mode = type === 'crypto' ? 'crypto' : 'stocks';
    state.app.selectedKey = assetKey(asset);
    setStoredSelectionForMode(state.app.mode, state.app.selectedKey);
    AUTO_SELECTED_ITEM = null;
    closeModal();
    renderAll();
    refreshAssetData(asset, true);
  }

  function removeAssetById(idToRemove) {
    var modeArr = getRawModeItems(state.app.mode);
    var idx = modeArr.findIndex(function (a) { return a.id === idToRemove; });
    if (idx < 0) return;
    var removed = modeArr[idx];
    if (!window.confirm('Remove ' + removed.symbol + ' from portfolio?')) return;
    modeArr.splice(idx, 1);
    if (state.app.selectedKey === assetKey(removed)) {
      state.app.selectedKey = null;
      setStoredSelectionForMode(state.app.mode, null);
    }
    renderAll();
  }

  function applyPositionActionFromModal() {
    if (!POSITION_ACTION) throw new Error('No position action selected.');
    var arr = POSITION_ACTION.mode === 'crypto' ? state.portfolio.crypto : state.portfolio.stocks;
    var asset = arr.find(function (a) { return a.id === POSITION_ACTION.assetId; });
    if (!asset) throw new Error('Holding not found.');

    var action = POSITION_ACTION.action;
    var currentQty = Number(asset.quantity) || 0;

    if (action === 'remove') {
      arr.splice(arr.indexOf(asset), 1);
      if (state.app.selectedKey === assetKey(asset)) {
        state.app.selectedKey = null;
        setStoredSelectionForMode(POSITION_ACTION.mode, null);
      }
      closePositionActionModal();
      renderAll();
      setStatus('Removed ' + asset.symbol + ' holding');
      return;
    }

    var qty = Number(ui.el.positionQtyInput.value);
    if (!(qty > 0)) throw new Error('Quantity must be greater than 0.');

    if (action === 'reduce') {
      if (qty > currentQty) throw new Error('Cannot reduce more than current quantity (' + currentQty + ').');
      var remaining = currentQty - qty;
      if (remaining <= 0) {
        arr.splice(arr.indexOf(asset), 1);
        if (state.app.selectedKey === assetKey(asset)) {
          state.app.selectedKey = null;
          setStoredSelectionForMode(POSITION_ACTION.mode, null);
        }
        closePositionActionModal();
        renderAll();
        setStatus('Removed ' + asset.symbol + ' holding');
        return;
      }
      asset.quantity = remaining;
      closePositionActionModal();
      renderAll();
      refreshAssetData(asset, false);
      setStatus('Reduced ' + asset.symbol + ' position');
      return;
    }

    if (action === 'add') {
      var addPrice = Number(ui.el.positionPriceInput.value);
      if (!(addPrice >= 0)) throw new Error('Entry price must be 0 or greater.');
      var oldCost = currentQty * (Number(asset.entryPrice) || 0);
      var addCost = qty * addPrice;
      var newQty = currentQty + qty;
      asset.quantity = newQty;
      asset.entryPrice = newQty > 0 ? (oldCost + addCost) / newQty : Number(asset.entryPrice) || 0;
      closePositionActionModal();
      renderAll();
      refreshAssetData(asset, false);
      setStatus('Added to ' + asset.symbol + ' position');
      return;
    }

    throw new Error('Unknown position action.');
  }

  function setRouteMode(mode) {
    var prevMode = state.app.mode;
    setStoredSelectionForMode(prevMode, state.app.selectedKey);
    state.app.mode = mode;
    state.app.selectedKey = getStoredSelectionForMode(mode);
    renderAll();
    if (mode === 'stocks' && prevMode !== 'stocks' && state.app.stocksAutoRefreshEnabled) {
      refreshStocksQuotesOnly({ force: true, reason: 'stocks-tab-enter' });
    }
    if (mode === 'stocks' && state.app.newsScopeStocks === 'general' && !state.news['stocks:general']) {
      refreshGeneralStocksNews();
    }
    if (mode === 'crypto' && prevMode !== 'crypto' && state.app.cryptoAutoRefreshEnabled) {
      refreshVisibleData();
    }
  }

  function cacheWrap(key, maxAgeMs, fetcher) {
    var freshCached = storage.getCached(state.caches, key, maxAgeMs || 0);
    if (freshCached) {
      return Promise.resolve(freshCached);
    }
    return fetcher().then(function (data) {
      storage.setCached(state.caches, key, data);
      storage.saveCache(state.caches);
      return data;
    }).catch(function (err) {
      var cached = storage.getCached(state.caches, key, maxAgeMs || 0);
      if (cached) return cached;
      var staleCached = getCachedAny(key);
      if (staleCached) return staleCached;
      throw err;
    });
  }

  function refreshAssetQuote(asset, options) {
    options = options || {};
    var key = 'quote:' + asset.type + ':' + (asset.coinId || asset.stooqSymbol || asset.symbol);
    if (asset.type === 'stock') {
      return cacheWrap(key, 1000 * 60 * 60, function () {
        return PT.StockAPI.getQuote(asset, {
          skipYahooExtras: !!options.skipYahooExtras
        }).then(function (quote) {
          if (quote && !isFinite(Number(quote.fetchedAt))) quote.fetchedAt = Date.now();
          return quote;
        });
      }).then(function (quote) {
        state.market.stocks[asset.id] = quote;
      });
    }
    return cacheWrap(key, 1000 * 60 * 30, function () {
      return PT.CryptoAPI.getQuote(asset).then(function (quote) {
        if (quote && !isFinite(Number(quote.fetchedAt))) quote.fetchedAt = Date.now();
        return quote;
      });
    }).then(function (quote) {
      state.market.crypto[asset.id] = quote;
    });
  }

  function refreshAssetHistory(asset) {
    var key = 'hist:' + asset.type + ':' + (asset.coinId || asset.stooqSymbol || asset.symbol);
    if (asset.type === 'stock') {
      return cacheWrap(key, 1000 * 60 * 60 * 8, function () {
        return PT.StockAPI.getHistory(asset, 180);
      }).then(function (hist) {
        state.history.stocks[asset.id] = hist;
      });
    }
    return cacheWrap(key, 1000 * 60 * 60 * 4, function () {
      return PT.CryptoAPI.getOHLC(asset, 180);
    }).then(function (hist) {
      state.history.crypto[asset.id] = hist;
    });
  }

  function fetchDailyHistoryForAsset(asset, timeframeId) {
    var tf = chartTimeframeConfig(timeframeId);
    if (asset.type === 'stock') {
      var limit = tf.days == null ? 730 : Math.max(120, Math.ceil(tf.days * 1.2));
      return PT.StockAPI.getHistory(asset, limit);
    }
    var days = tf.days == null ? 365 : Math.max(30, Math.ceil(tf.days * 1.2));
    return PT.CryptoAPI.getOHLC(asset, days);
  }

  function fetchHistoryForAssetTimeframe(asset, timeframeId) {
    if (!asset) return Promise.resolve([]);
    var tf = chartTimeframeConfig(timeframeId);
    var key = chartCacheKeyForAsset(asset, tf.id);
    if (!key) return Promise.resolve([]);
    var inFlightKey = 'asset:' + key;
    if (CHART_HISTORY_IN_FLIGHT[inFlightKey]) return CHART_HISTORY_IN_FLIGHT[inFlightKey];
    var fetcher = function () {
      if (tf.intraday) {
        if (asset.type === 'stock') return PT.StockAPI.getIntraday(asset, tf.hours || 4);
        return PT.CryptoAPI.getIntraday(asset, tf.hours || 4);
      }
      return fetchDailyHistoryForAsset(asset, tf.id);
    };
    CHART_HISTORY_IN_FLIGHT[inFlightKey] = chartWrap(key, tf.ttlMs, fetcher).finally(function () {
      delete CHART_HISTORY_IN_FLIGHT[inFlightKey];
    });
    return CHART_HISTORY_IN_FLIGHT[inFlightKey];
  }

  function fetchHistoryForExplorerTimeframe(target, timeframeId) {
    if (!target) return Promise.resolve([]);
    var tf = chartTimeframeConfig(timeframeId);
    var key = chartCacheKeyForExplorerTarget(target, tf.id);
    if (!key) return Promise.resolve([]);
    var inFlightKey = 'explore:' + key;
    if (CHART_HISTORY_IN_FLIGHT[inFlightKey]) return CHART_HISTORY_IN_FLIGHT[inFlightKey];
    var fetcher = function () {
      if (target.assetType === 'crypto') {
        var coin = {
          type: 'crypto',
          symbol: String(target.baseSymbol || target.symbol || '').replace('/USD', '').trim().toUpperCase(),
          coinId: target.coinId || target.sourceId
        };
        if (tf.intraday) return PT.CryptoAPI.getIntraday(coin, tf.hours || 4);
        var days = tf.days == null ? 365 : Math.max(30, Math.ceil(tf.days * 1.2));
        return PT.CryptoAPI.getOHLC(coin, days);
      }
      var stock = {
        type: 'stock',
        symbol: String(target.symbol || '').replace(/\.[A-Z]+$/, '').trim().toUpperCase(),
        yahooSymbol: String(target.yahooSymbol || target.sourceId || target.symbol || '').trim().toUpperCase(),
        stooqSymbol: target.stooqSymbol || null,
        market: target.market || 'US'
      };
      if (tf.intraday) return PT.StockAPI.getIntraday(stock, tf.hours || 4);
      var limit = tf.days == null ? 730 : Math.max(120, Math.ceil(tf.days * 1.2));
      return PT.StockAPI.getHistory(stock, limit);
    };
    CHART_HISTORY_IN_FLIGHT[inFlightKey] = chartWrap(key, tf.ttlMs, fetcher).finally(function () {
      delete CHART_HISTORY_IN_FLIGHT[inFlightKey];
    });
    return CHART_HISTORY_IN_FLIGHT[inFlightKey];
  }

  function refreshAssetNews(asset, options) {
    options = options || {};
    var source = asset.type === 'crypto' ? (state.app.newsSourceCrypto || 'auto') : (state.app.newsSourceStocks || 'auto');
    var key = newsCacheKeyForAsset(asset);
    var fetcher = function () {
      return PT.NewsAPI.getNews(asset, { source: source });
    };
    var saveSnapshot = function (items) {
      if (!PT.NewsAPI || typeof PT.NewsAPI.saveCachedSnapshot !== 'function') return;
      PT.NewsAPI.saveCachedSnapshot(key, items, { fetchedAt: Date.now(), source: source });
    };
    var loadRemoteSnapshot = function () {
      if (!PT.NewsAPI || typeof PT.NewsAPI.getCachedSnapshot !== 'function') return Promise.resolve(null);
      return PT.NewsAPI.getCachedSnapshot(key).then(function (snapshot) {
        var items = snapshot && Array.isArray(snapshot.items) ? snapshot.items : null;
        if (!items || !items.length) return null;
        storage.setCached(state.caches, key, items);
        storage.saveCache(state.caches);
        return items;
      });
    };
    var load = options.force
      ? fetcher().then(function (items) {
        storage.setCached(state.caches, key, items);
        storage.saveCache(state.caches);
        saveSnapshot(items);
        return items;
      })
      : (function () {
        var localFresh = storage.getCached(state.caches, key, 1000 * 60 * 60 * 2);
        if (localFresh) return Promise.resolve(localFresh);
        return loadRemoteSnapshot().then(function (remoteItems) {
          if (remoteItems) return remoteItems;
          return fetcher().then(function (items) {
            storage.setCached(state.caches, key, items);
            storage.saveCache(state.caches);
            saveSnapshot(items);
            return items;
          });
        });
      })();
    return load.then(function (items) {
      state.news[assetKey(asset)] = items;
      renderDetails();
    }).catch(function () {
      var cached = storage.getCached(state.caches, key, 1000 * 60 * 60 * 24 * 3);
      if (cached) {
        state.news[assetKey(asset)] = cached;
        renderDetails();
        return;
      }
      loadRemoteSnapshot().then(function (remoteItems) {
        state.news[assetKey(asset)] = remoteItems || [];
        renderDetails();
      }).catch(function () {
        state.news[assetKey(asset)] = [];
        renderDetails();
      });
    });
  }

  function refreshGeneralStocksNews(options) {
    options = options || {};
    var source = state.app.newsSourceStocks || 'auto';
    var key = newsCacheKeyForGeneralStocks();
    var fetcher = function () {
      if (PT.NewsAPI && typeof PT.NewsAPI.getGeneralStocksNews === 'function') {
        return PT.NewsAPI.getGeneralStocksNews({ source: source });
      }
      return PT.NewsAPI.getNews({ type: 'stock', symbol: 'SPY', name: 'US Market (SPY)' }, { source: source });
    };
    var saveSnapshot = function (items) {
      if (!PT.NewsAPI || typeof PT.NewsAPI.saveCachedSnapshot !== 'function') return;
      PT.NewsAPI.saveCachedSnapshot(key, items, { fetchedAt: Date.now(), source: source });
    };
    var loadRemoteSnapshot = function () {
      if (!PT.NewsAPI || typeof PT.NewsAPI.getCachedSnapshot !== 'function') return Promise.resolve(null);
      return PT.NewsAPI.getCachedSnapshot(key).then(function (snapshot) {
        var items = snapshot && Array.isArray(snapshot.items) ? snapshot.items : null;
        if (!items || !items.length) return null;
        storage.setCached(state.caches, key, items);
        storage.saveCache(state.caches);
        return items;
      });
    };
    var load = options.force
      ? fetcher().then(function (items) {
        storage.setCached(state.caches, key, items);
        storage.saveCache(state.caches);
        saveSnapshot(items);
        return items;
      })
      : (function () {
        var localFresh = storage.getCached(state.caches, key, 1000 * 60 * 60 * 2);
        if (localFresh) return Promise.resolve(localFresh);
        return loadRemoteSnapshot().then(function (remoteItems) {
          if (remoteItems) return remoteItems;
          return fetcher().then(function (items) {
            storage.setCached(state.caches, key, items);
            storage.saveCache(state.caches);
            saveSnapshot(items);
            return items;
          });
        });
      })();
    return load.then(function (items) {
      state.news['stocks:general'] = items || [];
      renderDetails();
      return items;
    }).catch(function () {
      var cached = storage.getCached(state.caches, key, 1000 * 60 * 60 * 24 * 3);
      if (cached) {
        state.news['stocks:general'] = cached;
        renderDetails();
        return state.news['stocks:general'];
      }
      return loadRemoteSnapshot().then(function (remoteItems) {
        state.news['stocks:general'] = remoteItems || [];
        renderDetails();
        return state.news['stocks:general'];
      }).catch(function () {
        state.news['stocks:general'] = [];
        renderDetails();
        return state.news['stocks:general'];
      });
    });
  }

  function refreshCurrentNewsScope(options) {
    options = options || {};
    if (state.app.mode === 'stocks') {
      var selectedStock = getSelectedAsset('stocks');
      if (state.app.newsScopeStocks === 'selected' && selectedStock) {
        return refreshAssetNews(selectedStock, options);
      }
      return refreshGeneralStocksNews(options);
    }
    var selected = getSelectedAsset(state.app.mode);
    if (!selected) return Promise.resolve([]);
    return refreshAssetNews(selected, options);
  }

  function refreshAssetTwitter(asset) {
    var key = assetKey(asset);
    state.twitter[key] = PT.TwitterAPI.getPlaceholder(asset);
    renderDetails();
  }

  function refreshAssetEvents(asset) {
    var key = 'events:v2:' + asset.type + ':' + (asset.coinId || asset.symbol);
    return cacheWrap(key, 1000 * 60 * 60 * 6, function () {
      return PT.EventsAPI.getEvents(asset);
    }).then(function (items) {
      state.events[assetKey(asset)] = items || [];
      renderDetails();
      return items;
    }).catch(function () {
      var cached = storage.getCached(state.caches, key, 1000 * 60 * 60 * 24 * 14);
      state.events[assetKey(asset)] = cached || [];
      renderDetails();
      return state.events[assetKey(asset)];
    });
  }

  function refreshCryptoGlobalMetrics() {
    var key = 'crypto:global:metrics';
    return cacheWrap(key, 1000 * 30, function () {
      return PT.CryptoAPI.getGlobalMetrics();
    }).then(function (metrics) {
      var g = state.globals.crypto;
      if (!g) return metrics;
      if (metrics && isFinite(Number(metrics.btcDominance))) {
        var pct = Number(metrics.btcDominance);
        g.btcDominanceCurrent = pct;
        g.ethDominanceCurrent = isFinite(Number(metrics.ethDominance)) ? Number(metrics.ethDominance) : null;
        g.updatedAt = metrics.updatedAt || null;
      }
      if (state.app.mode === 'crypto') renderBtcDominancePanel();
      return metrics;
    }).catch(function () {
      if (state.app.mode === 'crypto') renderBtcDominancePanel();
      return null;
    });
  }

  function assetDetailRefreshCacheKey(asset, includeNews) {
    return 'detail-refresh:' + assetKey(asset) + ':' + (includeNews ? 'full' : 'lite');
  }

  function hasFreshAssetDetail(asset, includeNews) {
    if (!asset) return false;
    var memKey = assetDetailRefreshCacheKey(asset, includeNews);
    var memTs = Number(ASSET_DETAIL_REFRESH_STAMPS[memKey] || 0);
    if (memTs && (Date.now() - memTs) <= ASSET_DETAIL_FRESH_MS) return true;
    if (!includeNews) {
      var memFullTs = Number(ASSET_DETAIL_REFRESH_STAMPS[assetDetailRefreshCacheKey(asset, true)] || 0);
      if (memFullTs && (Date.now() - memFullTs) <= ASSET_DETAIL_FRESH_MS) return true;
    }
    if (includeNews) {
      return !!storage.getCached(state.caches, assetDetailRefreshCacheKey(asset, true), ASSET_DETAIL_FRESH_MS);
    }
    return !!(
      storage.getCached(state.caches, assetDetailRefreshCacheKey(asset, true), ASSET_DETAIL_FRESH_MS) ||
      storage.getCached(state.caches, assetDetailRefreshCacheKey(asset, false), ASSET_DETAIL_FRESH_MS)
    );
  }

  function refreshAssetData(asset, includeNews, options) {
    options = options || {};
    if (!asset) return Promise.resolve();
    if (includeNews && options.onSelect && !Array.isArray(state.news[assetKey(asset)])) {
      hydrateAssetNewsFromCache(asset, 1000 * 60 * 60 * 24 * 3);
    }
    var detailStampKey = assetDetailRefreshCacheKey(asset, includeNews);
    var needsNewsRefreshOnSelect = !!(includeNews && options.onSelect && asset.type === 'stock' && !hasFreshNews(asset, 1000 * 60 * 60));
    if (hasFreshAssetDetail(asset, includeNews) && !needsNewsRefreshOnSelect) {
      renderAll();
      setStatus('Using cached ' + asset.symbol + ' • ' + new Date().toLocaleTimeString());
      return Promise.resolve({ cached: true });
    }
    ASSET_DETAIL_REFRESH_STAMPS[detailStampKey] = Date.now();
    setStatus('Refreshing ' + asset.symbol + '...');
    var tasks = [];
    if (!(options.onSelect && asset.type === 'stock')) {
      tasks.push(refreshAssetEvents(asset));
    }
    refreshAssetTwitter(asset);
    tasks.push(refreshAssetQuote(asset, {
      skipYahooExtras: !!(options.onSelect && asset.type === 'stock')
    }), refreshAssetHistory(asset));
    if (asset.type === 'crypto') tasks.push(refreshCryptoGlobalMetrics());
    if (includeNews) {
      if (!(options.onSelect && asset.type === 'stock' && hasFreshNews(asset, 1000 * 60 * 60))) {
        tasks.push(refreshAssetNews(asset));
      }
    }
    return Promise.allSettled(tasks).then(function () {
      storage.setCached(state.caches, assetDetailRefreshCacheKey(asset, includeNews), { refreshedAt: Date.now() });
      storage.saveCache(state.caches);
      renderAll();
      setStatus('Updated ' + asset.symbol + ' • ' + new Date().toLocaleTimeString());
    }).catch(function () {
      delete ASSET_DETAIL_REFRESH_STAMPS[detailStampKey];
      renderAll();
      setStatus('Some data failed; showing cached values where available');
    });
  }

  function stockQuoteCacheKey(asset) {
    return 'quote:stock:' + (asset.stooqSymbol || asset.symbol);
  }

  // Stocks-only quotes refresh path. Source order comes from the API source settings.
  function refreshStocksQuotesOnly(options) {
    options = options || {};
    var assets = (state.portfolio && state.portfolio.stocks ? state.portfolio.stocks : []).slice();
    if (!assets.length) {
      renderAll();
      return Promise.resolve({ empty: true });
    }

    setStatus('Refreshing stock quotes...');
    var prevCloseRunCache = new Map();

    return Promise.allSettled(assets.map(function (asset) {
      return PT.StockAPI.getQuote(asset, {
        force: !!options.force,
        prevCloseRunCache: prevCloseRunCache,
        prevCloseHint: getStockPrevCloseHint(asset),
        skipPrevCloseNetwork: true
      });
    }).concat([
      refreshIndicatorsForMode('stocks')
    ])).then(function (results) {
      var updated = 0;
      var cachedOnly = 0;
      var indicatorMeta = results[results.length - 1];

      results.slice(0, assets.length).forEach(function (res, idx) {
        var asset = assets[idx];
        if (res.status === 'fulfilled' && res.value) {
          var quote = res.value;
          if (quote && !isFinite(Number(quote.fetchedAt))) quote.fetchedAt = Date.now();
          state.market.stocks[asset.id] = quote;
          storage.setCached(state.caches, stockQuoteCacheKey(asset), quote);
          updated += 1;
        } else {
          if (state.market.stocks[asset.id]) cachedOnly += 1;
        }
      });

      storage.saveCache(state.caches);
      renderAll();
      var failed = assets.length - updated;
      var nowText = new Date().toLocaleTimeString();
      var indicatorsFailed = indicatorMeta && (
        indicatorMeta.status !== 'fulfilled' ||
        (indicatorMeta.value && indicatorMeta.value.ok === false && !indicatorMeta.value.disabled && !indicatorMeta.value.empty)
      );
      if (updated <= 0 && cachedOnly > 0) {
        setStatus('Stocks quotes unavailable, using cached values • ' + nowText);
      } else if (updated <= 0) {
        setStatus('Stocks quote refresh failed • ' + nowText);
      } else if (failed > 0 || indicatorsFailed) {
        setStatus('Stocks quotes partial refresh • ' + nowText);
      } else {
        setStatus('Stocks quotes refreshed • ' + nowText);
      }
      return { updated: updated, meta: { failed: failed, staleUsed: cachedOnly, indicatorsFailed: indicatorsFailed } };
    });
  }

  function refreshCryptoQuotesBatch(assets, options) {
    options = options || {};
    var list = Array.isArray(assets) ? assets : [];
    if (!list.length) return Promise.resolve({ updated: 0, failed: 0, staleUsed: 0 });
    var ids = Array.from(new Set(list.map(function (a) { return String(a.coinId || '').trim().toLowerCase(); }).filter(Boolean)));
    if (!ids.length) return Promise.resolve({ updated: 0, failed: list.length, staleUsed: 0 });

    var key = 'quote:crypto:batch:' + ids.slice().sort().join(',');
    return cacheWrap(key, 1000 * 30, function () {
      if (!PT.CryptoAPI || typeof PT.CryptoAPI.getQuotes !== 'function') {
        throw new Error('Crypto batch quotes unavailable');
      }
      return PT.CryptoAPI.getQuotes(ids);
    }).then(function (quoteMap) {
      var updated = 0;
      var failed = 0;
      var staleUsed = 0;
      list.forEach(function (asset) {
        var id = String(asset.coinId || '').trim().toLowerCase();
        var q = quoteMap && quoteMap[id] ? quoteMap[id] : null;
        if (q) {
          var quote = Object.assign({}, q, {
            fetchedAt: isFinite(Number(q.fetchedAt)) ? Number(q.fetchedAt) : Date.now()
          });
          state.market.crypto[asset.id] = quote;
          storage.setCached(state.caches, 'quote:crypto:' + id, quote);
          updated += 1;
        } else {
          failed += 1;
          if (state.market.crypto[asset.id]) staleUsed += 1;
        }
      });
      storage.saveCache(state.caches);
      return { updated: updated, failed: failed, staleUsed: staleUsed };
    }).catch(function () {
      var staleUsed = 0;
      list.forEach(function (asset) {
        if (state.market.crypto[asset.id]) staleUsed += 1;
      });
      return { updated: 0, failed: list.length, staleUsed: staleUsed };
    });
  }

  function clearStocksAutoRefreshTimer() {
    if (STOCKS_AUTO_REFRESH_TIMER) {
      clearInterval(STOCKS_AUTO_REFRESH_TIMER);
      STOCKS_AUTO_REFRESH_TIMER = null;
    }
  }

  function ensureStocksAutoRefreshTimer() {
    clearStocksAutoRefreshTimer();
    if (!state.app.stocksAutoRefreshEnabled) return;
    var intervalMs = Math.max(15000, (Number(state.app.stocksAutoRefreshIntervalSec || 600) || 600) * 1000);
    STOCKS_AUTO_REFRESH_TIMER = setInterval(function () {
      refreshStocksQuotesOnly({ force: true, reason: 'auto' });
    }, intervalMs);
  }

  function clearCryptoAutoRefreshTimer() {
    if (CRYPTO_AUTO_REFRESH_TIMER) {
      clearInterval(CRYPTO_AUTO_REFRESH_TIMER);
      CRYPTO_AUTO_REFRESH_TIMER = null;
    }
  }

  function ensureCryptoAutoRefreshTimer() {
    clearCryptoAutoRefreshTimer();
    if (!state.app.cryptoAutoRefreshEnabled) return;
    var intervalMs = Math.max(15000, (Number(state.app.cryptoAutoRefreshIntervalSec || 600) || 600) * 1000);
    CRYPTO_AUTO_REFRESH_TIMER = setInterval(function () {
      if (state.app.mode !== 'crypto') return;
      refreshVisibleData().then(function () {
        setStatus('Crypto auto refresh • ' + new Date().toLocaleTimeString());
      });
    }, intervalMs);
  }

  function setStocksAutoRefreshEnabled(enabled, opts) {
    opts = opts || {};
    state.app.stocksAutoRefreshEnabled = !!enabled;
    ensureStocksAutoRefreshTimer();
    renderAll();
    if (state.app.stocksAutoRefreshEnabled && opts.fetchNow) {
      refreshStocksQuotesOnly({ force: true, reason: opts.reason || 'auto-toggle' });
    }
  }

  function setCryptoAutoRefreshEnabled(enabled, opts) {
    opts = opts || {};
    state.app.cryptoAutoRefreshEnabled = !!enabled;
    ensureCryptoAutoRefreshTimer();
    renderAll();
    if (state.app.cryptoAutoRefreshEnabled && opts.fetchNow) {
      refreshVisibleData();
    }
  }

  function setAutoRefreshInterval(mode, intervalSec) {
    var safeSec = Math.max(15, Number(intervalSec || 600) || 600);
    if (mode === 'crypto') {
      state.app.cryptoAutoRefreshIntervalSec = safeSec;
      ensureCryptoAutoRefreshTimer();
    } else {
      state.app.stocksAutoRefreshIntervalSec = safeSec;
      ensureStocksAutoRefreshTimer();
    }
    renderAll();
    refreshApiSourcesModal();
  }

  function setTwelveDataEnabled(enabled) {
    var entry = getApiSourcePrefEntry('prices', 'twelvedata');
    if (entry) entry.enabled = !!enabled;
    state.app.twelveDataEnabled = !!enabled;
    renderAll();
    refreshApiSourcesModal();
    setStatus('TwelveData ' + (state.app.twelveDataEnabled ? 'enabled' : 'disabled'));
  }

  function refreshVisibleData() {
    var rawItems = getRawModeItems(state.app.mode);
    if (!rawItems.length) {
      renderAll();
      return Promise.resolve();
    }

    if (state.app.mode === 'crypto') {
      setStatus('Refreshing ' + rawItems.length + ' assets...');
      var selectedCrypto = getSelectedAsset('crypto');
      var jobsCrypto = [
        refreshCryptoQuotesBatch(rawItems, { force: true }),
        refreshCryptoGlobalMetrics().then(function () { return { ok: true }; }).catch(function () { return { ok: false }; }),
        refreshIndicatorsForMode('crypto')
      ];
      if (selectedCrypto) {
        jobsCrypto.push(
          Promise.allSettled([refreshAssetHistory(selectedCrypto), refreshAssetNews(selectedCrypto), refreshAssetEvents(selectedCrypto)])
            .then(function (results) {
              return {
                historyOk: results[0] && results[0].status === 'fulfilled',
                newsOk: results[1] && results[1].status === 'fulfilled',
                eventsOk: results[2] && results[2].status === 'fulfilled'
              };
            })
        );
      }
      return Promise.allSettled(jobsCrypto).then(function (results) {
        var quoteMeta = results[0] && results[0].status === 'fulfilled' ? results[0].value : { updated: 0, failed: rawItems.length, staleUsed: 0 };
        var globalOk = results[1] && results[1].status === 'fulfilled' && results[1].value && results[1].value.ok;
        var indicatorOk = results[2] && results[2].status === 'fulfilled' && results[2].value && (results[2].value.ok || results[2].value.disabled || results[2].value.empty);
        var detail = selectedCrypto && results[3] && results[3].status === 'fulfilled' ? results[3].value : null;
        renderAll();
        var nowText = new Date().toLocaleTimeString();
        var detailFailed = detail ? (!detail.historyOk || !detail.newsOk || !detail.eventsOk) : false;
        if (quoteMeta.updated <= 0 && quoteMeta.staleUsed > 0) {
          setStatus('Crypto quotes unavailable, using cached values • ' + nowText);
        } else if (quoteMeta.updated <= 0) {
          setStatus('Crypto refresh failed (quotes not updated) • ' + nowText);
        } else if (quoteMeta.failed > 0 || !globalOk || !indicatorOk || detailFailed) {
          setStatus('Crypto partial refresh (some requests failed) • ' + nowText);
        } else {
          setStatus('Crypto refresh complete • ' + nowText);
        }
      });
    }

    setStatus('Refreshing ' + rawItems.length + ' assets...');
    var jobs = rawItems.map(function (asset) {
      var eventJob = refreshAssetEvents(asset);
      refreshAssetTwitter(asset);
      return Promise.allSettled([refreshAssetQuote(asset), eventJob]).then(function (results) {
        return {
          kind: 'asset',
          asset: asset,
          quoteOk: results[0] && results[0].status === 'fulfilled',
          eventsOk: results[1] && results[1].status === 'fulfilled'
        };
      });
    });
    if (state.app.mode === 'crypto') {
      jobs.push(
        refreshCryptoGlobalMetrics().then(function () {
          return { kind: 'cryptoGlobal', ok: true };
        }).catch(function () {
          return { kind: 'cryptoGlobal', ok: false };
        })
      );
    }
    var selected = getSelectedAsset(state.app.mode);
    if (selected) {
      jobs.push(Promise.allSettled([refreshAssetHistory(selected), refreshAssetNews(selected)]).then(function (results) {
        return {
          kind: 'selectedDetail',
          asset: selected,
          historyOk: results[0] && results[0].status === 'fulfilled',
          newsOk: results[1] && results[1].status === 'fulfilled'
        };
      }));
    }
    return Promise.allSettled(jobs).then(function (results) {
      var quoteFail = 0;
      var totalQuotes = rawItems.length;
      var hadAnyFailure = false;
      results.forEach(function (r) {
        if (r.status !== 'fulfilled') {
          hadAnyFailure = true;
          return;
        }
        var x = r.value || {};
        if (x.kind === 'asset') {
          if (!x.quoteOk) quoteFail++;
          if (!x.quoteOk || !x.eventsOk) hadAnyFailure = true;
        } else if (x.kind === 'selectedDetail') {
          if (!x.historyOk || !x.newsOk) hadAnyFailure = true;
        } else if (x.kind === 'cryptoGlobal') {
          if (!x.ok) hadAnyFailure = true;
        }
      });
      renderAll();
      var nowText = new Date().toLocaleTimeString();
      if (quoteFail === totalQuotes && totalQuotes > 0) {
        setStatus('Refresh failed (quotes not updated) • ' + nowText);
      } else if (hadAnyFailure) {
        setStatus('Partial refresh (some requests failed) • ' + nowText);
      } else {
        setStatus('Refresh complete • ' + nowText);
      }
    });
  }

  function autoRefresh60s() {
    // legacy timer retained but disabled for data refresh; dedicated stock/crypto auto timers now control this.
  }

  function refreshSelectedMarketClock() {
    var asset = getSelectedAsset(state.app.mode);
    if (!asset || asset.type !== 'stock') return;
    var quoteData = getMarketFor(asset) || {};
    var clock = getStockMarketClock(asset.market, new Date());
    ui.renderMarketData(Object.assign({}, quoteData, {
      market: asset.market || clock.market,
      marketIsOpen: clock.isOpen,
      marketCountdownMs: clock.countdownMs,
      marketSessionLabel: clock.sessionLabel,
      marketCountdownLabel: clock.countdownLabel
    }), asset, 'No live market data yet. Use Refresh Prices.');
  }

  function handlePortfolioListClick(event) {
    var row = event.target.closest('.asset-row');
    var shell = row ? row.closest('.asset-row-shell') : event.target.closest('.asset-row-shell');
    if (!row && !shell) return;
    if (event.target.closest('.js-action-menu-toggle')) return;
    var tappedDayMove = !!event.target.closest('.asset-row__daymove');
    var shouldScrollToChart = tappedDayMove && window.matchMedia('(max-width: 1120px)').matches;
    var key = (row && row.dataset && row.dataset.key) || (shell && shell.dataset && shell.dataset.key);
    if (!key) return;
    var modeItems = getRawModeItems(state.app.mode);
    var asset = modeItems.find(function (a) { return assetKey(a) === key; });
    if (!asset) return;

    if (event.target.closest('.js-remove')) {
      openPositionActionModal(asset, 'remove');
      return;
    }

    if (event.target.closest('.js-addqty')) {
      openPositionActionModal(asset, 'add');
      return;
    }

    if (event.target.closest('.js-reduceqty')) {
      openPositionActionModal(asset, 'reduce');
      return;
    }

    if (event.target.closest('.js-edit')) {
      openAddModal(asset);
      return;
    }

    state.app.selectedKey = key;
    setStoredSelectionForMode(state.app.mode, key);
    var includeNewsOnSelect = true;
    if (state.app.mode === 'stocks') {
      state.app.newsScopeStocks = 'selected';
      includeNewsOnSelect = true;
    }
    renderAll();
    if (shouldScrollToChart) {
      scrollToDetailChartOnMobile();
    }
    refreshAssetData(asset, includeNewsOnSelect, { onSelect: true });
    refreshIndicatorsForMode(state.app.mode).then(function () {
      renderAll();
    }).catch(function () {
      renderAll();
    });
  }

  function scrollToDetailChartOnMobile() {
    if (!ui || !ui.el) return;
    var anchor = ui.el.detailTitle ? ui.el.detailTitle.closest('.section-header') : null;
    if (!anchor && ui.el.assetChart) {
      anchor = ui.el.assetChart.closest('.chart-wrap') || ui.el.assetChart;
    }
    if (!anchor) return;
    requestAnimationFrame(function () {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function closeOpenRowMenus(exceptWithin) {
    var root = ui && ui.el && ui.el.portfolioList;
    if (!root) return;
    var openMenus = root.querySelectorAll('.asset-row__mobile-menu[open]');
    openMenus.forEach(function (menu) {
      if (exceptWithin && menu.contains(exceptWithin)) return;
      menu.removeAttribute('open');
    });
  }

  function bindEvents() {
    ui.el.themeToggle.addEventListener('click', applyThemeToggle);
    if (ui.el.layoutToggle) ui.el.layoutToggle.addEventListener('click', applyLayoutToggle);
    if (ui.el.demoModeToggle) ui.el.demoModeToggle.addEventListener('click', applyDemoModeToggle);
    if (ui.el.apiSourcesBtn) ui.el.apiSourcesBtn.addEventListener('click', openApiSourcesModal);
    if (ui.el.indicatorExplorerBtn) ui.el.indicatorExplorerBtn.addEventListener('click', openIndicatorExplorerModal);
    if (ui.el.indicatorExplorerCloseBtn) ui.el.indicatorExplorerCloseBtn.addEventListener('click', closeIndicatorExplorerModal);
    if (ui.el.indicatorExplorerStocksTab) ui.el.indicatorExplorerStocksTab.addEventListener('click', function () { setIndicatorExplorerMode('stocks'); });
    if (ui.el.indicatorExplorerCryptoTab) ui.el.indicatorExplorerCryptoTab.addEventListener('click', function () { setIndicatorExplorerMode('crypto'); });
    if (ui.el.indicatorExplorerSearchInput) ui.el.indicatorExplorerSearchInput.addEventListener('input', runIndicatorExplorerSearch);
    if (ui.el.indicatorExplorerSearchList) {
      ui.el.indicatorExplorerSearchList.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-indicator-explorer-idx]');
        if (!btn) return;
        var idx = Number(btn.getAttribute('data-indicator-explorer-idx'));
        if (!isFinite(idx) || idx < 0 || idx >= INDICATOR_EXPLORER.results.length) return;
        selectIndicatorExplorerItem(INDICATOR_EXPLORER.results[idx]);
      });
    }
    if (ui.el.apiDebugToggle) ui.el.apiDebugToggle.addEventListener('click', applyApiDebugToggle);
    if (ui.el.holdingsPrivacyToggle) ui.el.holdingsPrivacyToggle.addEventListener('click', applyHoldingsPrivacyToggle);
    if (ui.el.cryptoParticlesToggle) ui.el.cryptoParticlesToggle.addEventListener('click', applyCryptoParticlesToggle);
    ui.el.addAssetBtn.addEventListener('click', function () { openAddModal(null); });
    ui.el.exportBtn.addEventListener('click', function () {
      storage.exportPortfolioFile({
        exportedAt: new Date().toISOString(),
        portfolio: state.portfolio,
        settings: buildSettingsPayload()
      });
      setStatus('Portfolio exported');
    });
    ui.el.importInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      storage.importPortfolioFile(file).then(function (payload) {
        var p = payload.portfolio || payload;
        if (!p || !Array.isArray(p.stocks) || !Array.isArray(p.crypto)) throw new Error('Expected {stocks, crypto}');
        state.portfolio = p;
        if (payload && payload.settings && typeof payload.settings === 'object') {
          applySavedSettings(payload.settings);
        } else {
          state.app.demoModeEnabled = false;
          state.app.selectedKey = null;
          state.app.selectedStocksKey = null;
          state.app.selectedCryptoKey = null;
        }
        storage.clearDemoPortfolioBackup();
        renderAll();
        if (state.app.mode === 'crypto' && state.app.cryptoAutoRefreshEnabled) {
          refreshVisibleData();
        } else if (state.app.stocksAutoRefreshEnabled) {
          refreshStocksQuotesOnly({ force: true, reason: 'import' });
        }
        setStatus('Portfolio imported');
      }).catch(function (err) {
        window.alert(err.message || 'Import failed');
      }).finally(function () {
        ui.el.importInput.value = '';
      });
    });
    ui.el.refreshBtn.addEventListener('click', function () {
      if (state.app.mode === 'stocks') {
        refreshStocksQuotesOnly({ force: true, reason: 'manual' });
        return;
      }
      refreshVisibleData();
    });
    if (ui.el.stocksAutoRefreshToggle) {
      ui.el.stocksAutoRefreshToggle.addEventListener('click', function () {
        setStocksAutoRefreshEnabled(!state.app.stocksAutoRefreshEnabled, {
          fetchNow: true,
          reason: 'auto-toggle'
        });
      });
    }
    if (ui.el.cryptoAutoRefreshToggle) {
      ui.el.cryptoAutoRefreshToggle.addEventListener('click', function () {
        setCryptoAutoRefreshEnabled(!state.app.cryptoAutoRefreshEnabled, {
          fetchNow: true
        });
      });
    }
    if (ui.el.twelveDataToggle) {
      ui.el.twelveDataToggle.addEventListener('click', function () {
        setTwelveDataEnabled(!state.app.twelveDataEnabled);
      });
    }
    if (ui.el.apiSourcesModalCloseBtn) ui.el.apiSourcesModalCloseBtn.addEventListener('click', closeApiSourcesModal);
    if (ui.el.indicatorExplorerModal) {
      ui.el.indicatorExplorerModal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-close-indicator-explorer') === '1') closeIndicatorExplorerModal();
      });
    }
    if (ui.el.apiSourcesModal) {
      ui.el.apiSourcesModal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-close-api-sources-modal') === '1') closeApiSourcesModal();
      });
    }
    if (ui.el.apiSourcesContent) {
      ui.el.apiSourcesContent.addEventListener('click', function (e) {
        var doneBtn = e.target.closest('#apiSourcesDoneBtn');
        if (doneBtn) {
          closeApiSourcesModal();
          return;
        }
      });
      ui.el.apiSourcesContent.addEventListener('change', function (e) {
        var toggle = e.target.closest('[data-api-source-toggle]');
        if (toggle) {
          setApiSourceEnabled(toggle.getAttribute('data-api-category'), toggle.getAttribute('data-api-source'), !!toggle.checked);
          return;
        }
        var autoToggle = e.target.closest('[data-api-auto-toggle]');
        if (autoToggle) {
          var modeKeyToggle = autoToggle.getAttribute('data-api-auto-toggle') || 'stocks';
          if (modeKeyToggle === 'crypto') {
            setCryptoAutoRefreshEnabled(!!autoToggle.checked);
          } else {
            setStocksAutoRefreshEnabled(!!autoToggle.checked);
          }
          refreshApiSourcesModal();
          return;
        }
        var autoMin = e.target.closest('[data-api-auto-min], [data-api-auto-sec]');
        if (autoMin) {
          var modeKey = autoMin.getAttribute('data-api-auto-min') || autoMin.getAttribute('data-api-auto-sec') || 'stocks';
          var minInput = ui.el.apiSourcesContent.querySelector('[data-api-auto-min="' + modeKey + '"]');
          var secInput = ui.el.apiSourcesContent.querySelector('[data-api-auto-sec="' + modeKey + '"]');
          var mins = Math.max(0, Number(minInput && minInput.value || 0) || 0);
          var secs = Math.max(0, Math.min(59, Number(secInput && secInput.value || 0) || 0));
          if (secInput) secInput.value = String(secs);
          setAutoRefreshInterval(modeKey, mins * 60 + secs);
        }
      });
      ui.el.apiSourcesContent.addEventListener('dragstart', function (e) {
        var card = e.target.closest('[data-api-drag]');
        if (!card) return;
        API_SOURCE_DRAG = {
          category: card.getAttribute('data-api-category'),
          sourceId: card.getAttribute('data-api-source')
        };
        card.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', API_SOURCE_DRAG.sourceId || '');
        }
      });
      ui.el.apiSourcesContent.addEventListener('dragend', function (e) {
        var card = e.target.closest('[data-api-drag]');
        if (card) card.classList.remove('is-dragging');
        API_SOURCE_DRAG = null;
      });
      ui.el.apiSourcesContent.addEventListener('dragover', function (e) {
        var list = e.target.closest('[data-api-category]');
        if (!list || !API_SOURCE_DRAG || list.getAttribute('data-api-category') !== API_SOURCE_DRAG.category) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      });
      ui.el.apiSourcesContent.addEventListener('drop', function (e) {
        var list = e.target.closest('.api-source-list');
        if (!list || !API_SOURCE_DRAG || list.getAttribute('data-api-category') !== API_SOURCE_DRAG.category) return;
        e.preventDefault();
        var cards = Array.prototype.slice.call(list.querySelectorAll('.api-source-card'));
        var targetCard = e.target.closest('.api-source-card');
        var targetIndex = cards.length;
        if (targetCard) {
          targetIndex = cards.indexOf(targetCard);
          var rect = targetCard.getBoundingClientRect();
          var after = e.clientX > rect.left + rect.width / 2;
          if (after) targetIndex += 1;
        }
        moveApiSource(API_SOURCE_DRAG.category, API_SOURCE_DRAG.sourceId, targetIndex);
      });
    }
    ui.el.newsRefreshBtn.addEventListener('click', function () {
      refreshCurrentNewsScope({ force: true });
    });
    if (ui.el.newsScopeGeneralBtn) {
      ui.el.newsScopeGeneralBtn.addEventListener('click', function () {
        state.app.newsScopeStocks = 'general';
        renderAll();
        refreshCurrentNewsScope();
      });
    }
    if (ui.el.newsScopeSelectedBtn) {
      ui.el.newsScopeSelectedBtn.addEventListener('click', function () {
        var selectedStock = getSelectedAsset('stocks');
        if (!selectedStock) return;
        state.app.newsScopeStocks = 'selected';
        renderAll();
        refreshCurrentNewsScope();
      });
    }
    if (ui.el.newsSourceSelect) {
      ui.el.newsSourceSelect.addEventListener('change', function () {
        if (state.app.mode === 'crypto') state.app.newsSourceCrypto = ui.el.newsSourceSelect.value || 'auto';
        else state.app.newsSourceStocks = ui.el.newsSourceSelect.value || 'auto';
        renderAll();
        refreshCurrentNewsScope({ force: true });
      });
    }
    if (ui.el.twitterFetchBtn) ui.el.twitterFetchBtn.addEventListener('click', function () {
      var asset = getSelectedAsset(state.app.mode);
      if (!asset) return;
      state.twitter[assetKey(asset)] = PT.TwitterAPI.getPlaceholder(asset);
      renderDetails();
      setStatus('Social links updated');
    });
    ui.el.stocksTab.addEventListener('click', function () { PT.Router.go('stocks'); });
    ui.el.cryptoTab.addEventListener('click', function () { PT.Router.go('crypto'); });
    ui.el.sortSelect.addEventListener('change', function () {
      state.app.sortBy = ui.el.sortSelect.value;
      renderAll();
    });
    if (ui.el.allocationLegend) {
      ui.el.allocationLegend.addEventListener('mouseover', function (e) {
        var item = e.target.closest('.legend-item');
        if (!item) return;
        var idx = Number(item.getAttribute('data-allocation-index'));
        if (!isFinite(idx)) return;
        setAllocationLegendHighlight(idx);
        if (chartMgr && typeof chartMgr.highlightAllocationIndex === 'function') {
          chartMgr.highlightAllocationIndex(idx);
        }
      });
      ui.el.allocationLegend.addEventListener('mouseleave', function () {
        clearAllocationLegendHighlight();
      });
      ui.el.allocationLegend.addEventListener('focusin', function (e) {
        var item = e.target.closest('.legend-item');
        if (!item) return;
        var idx = Number(item.getAttribute('data-allocation-index'));
        if (!isFinite(idx)) return;
        setAllocationLegendHighlight(idx);
        if (chartMgr && typeof chartMgr.highlightAllocationIndex === 'function') {
          chartMgr.highlightAllocationIndex(idx);
        }
      });
      ui.el.allocationLegend.addEventListener('focusout', function (e) {
        if (ui.el.allocationLegend.contains(e.relatedTarget)) return;
        clearAllocationLegendHighlight();
      });
    }

    ui.el.portfolioList.addEventListener('click', handlePortfolioListClick);
    ui.el.portfolioList.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var row = e.target.closest('.asset-row');
      if (!row) return;
      var bodyBtn = row.querySelector('.asset-row__body');
      if (bodyBtn) bodyBtn.click();
    });

    [ui.el.modalCloseBtn, ui.el.cancelAssetBtn].forEach(function (btn) {
      btn.addEventListener('click', closeModal);
    });
    ui.el.modal.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute('data-close-modal') === '1') closeModal();
    });
    [ui.el.positionModalCloseBtn, ui.el.positionCancelBtn].forEach(function (btn) {
      if (btn) btn.addEventListener('click', closePositionActionModal);
    });
    if (ui.el.positionModal) {
      ui.el.positionModal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-close-position-modal') === '1') closePositionActionModal();
      });
    }

    ui.el.assetTypeInput.addEventListener('change', function () {
      AUTO_SELECTED_ITEM = null;
      ui.el.assetSelectedId.value = '';
      autocompleteSearch();
    });
    ui.el.assetSearchInput.addEventListener('input', function () {
      AUTO_SELECTED_ITEM = null;
      ui.el.assetSelectedId.value = '';
      autocompleteSearch();
    });
    ui.el.assetSearchInput.addEventListener('focus', autocompleteSearch);
    document.addEventListener('click', function (e) {
      var tfBtn = e.target.closest('[data-chart-tf][data-chart-context]');
      if (tfBtn) {
        var tf = tfBtn.getAttribute('data-chart-tf');
        var context = tfBtn.getAttribute('data-chart-context');
        var mode = tfBtn.getAttribute('data-chart-mode') || state.app.mode;
        if (context === 'detail') applyDetailChartTimeframe(mode, tf);
        else if (context === 'explorer') applyExplorerChartTimeframe(mode, tf);
        e.preventDefault();
        return;
      }
      var stepBtn = e.target.closest('.num-step');
      if (stepBtn) {
        var targetId = stepBtn.getAttribute('data-target');
        var dir = stepBtn.getAttribute('data-dir');
        var input = targetId ? document.getElementById(targetId) : null;
        if (input && input.type === 'number') {
          try {
            if (dir === 'up') input.stepUp();
            else input.stepDown();
          } catch (err) {
            var stepAttr = input.getAttribute('step');
            var step = stepAttr && stepAttr !== 'any' ? Number(stepAttr) : 1;
            if (!(step > 0)) step = 1;
            var cur = Number(input.value || 0);
            if (!isFinite(cur)) cur = 0;
            input.value = String(cur + (dir === 'up' ? step : -step));
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.focus();
        }
        e.preventDefault();
        return;
      }
      if (!e.target.closest('.asset-row__mobile-menu')) {
        closeOpenRowMenus(null);
      }
      if (!e.target.closest('.autocomplete')) ui.hideAutocomplete();
    });
    ui.el.autocompleteList.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-idx]');
      if (!btn) return;
      chooseAutocomplete(AUTO_ITEMS[Number(btn.dataset.idx)]);
    });
    ui.el.assetForm.addEventListener('submit', function (e) {
      e.preventDefault();
      try {
        upsertAssetFromForm();
      } catch (err) {
        window.alert(err.message || 'Unable to save asset');
      }
    });
    if (ui.el.positionForm) {
      ui.el.positionForm.addEventListener('submit', function (e) {
        e.preventDefault();
        try {
          applyPositionActionFromModal();
        } catch (err) {
          window.alert(err.message || 'Unable to apply position action');
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (ui.el.apiSourcesModal && !ui.el.apiSourcesModal.classList.contains('hidden')) {
        closeApiSourcesModal();
        return;
      }
      if (ui.el.positionModal && !ui.el.positionModal.classList.contains('hidden')) {
        closePositionActionModal();
        return;
      }
      if (!ui.el.modal.classList.contains('hidden')) closeModal();
    });
    window.addEventListener('resize', syncMobilePanelOrder);
  }

  function normalizeImportedAssets() {
    ['stocks', 'crypto'].forEach(function (mode) {
      var arr = state.portfolio[mode] || [];
      state.portfolio[mode] = arr.map(function (a) {
        var type = mode === 'crypto' ? 'crypto' : 'stock';
        var copy = clone(a);
        copy.type = type;
        if (!copy.id) copy.id = id();
        copy.quantity = Number(copy.quantity) || 0;
        copy.entryPrice = Number(copy.entryPrice) || 0;
        if (type === 'stock' && !copy.stooqSymbol) {
          var refStock = state.symbols.stocks.find(function (s) { return s.symbol === copy.symbol; });
          copy.stooqSymbol = refStock ? refStock.stooq : String(copy.symbol || '').toLowerCase() + '.us';
        }
        if (type === 'stock' && !copy.yahooSymbol) {
          copy.yahooSymbol = String(copy.symbol || '').toUpperCase();
        }
        if (type === 'stock' && !copy.market) {
          copy.market = 'NASDAQ';
        }
        if (type === 'crypto' && !copy.coinId) {
          var refCoin = state.symbols.crypto.find(function (c) { return c.symbol === copy.symbol; });
          copy.coinId = refCoin ? refCoin.id : String(copy.name || copy.symbol || '').toLowerCase().replace(/\s+/g, '-');
        }
        return copy;
      }).filter(function (a) {
        return a.symbol && a.name && a.quantity > 0;
      });
    });
  }

  function alignMobileTopbarActionsToRightOnBoot() {
    if (!window.matchMedia || !window.matchMedia('(max-width: 480px)').matches) return;
    var actionsStrip = document.querySelector('.topbar__group--actions');
    if (!actionsStrip) return;
    var scrollToEnd = function () {
      actionsStrip.scrollLeft = Math.max(0, actionsStrip.scrollWidth - actionsStrip.clientWidth);
    };
    requestAnimationFrame(scrollToEnd);
    setTimeout(scrollToEnd, 140);
  }

  // Bootstraps modules, restores persisted state, and starts timers and initial refreshes.
  function boot() {
    ui = PT.UI;
    storage = PT.Storage;
    chartMgr = PT.ChartManager;

    ui.init();
    if (PT.ApiDebug && typeof PT.ApiDebug.mount === 'function') {
      PT.ApiDebug.mount(ui.el.apiDebugTableBody);
    }
    if (PT.CryptoParticles && typeof PT.CryptoParticles.create === 'function') {
      CRYPTO_PARTICLES = PT.CryptoParticles.create(ui.el.cryptoParticlesCanvas);
    }
    loadInitialState();
    normalizeImportedAssets();
    hydrateCachedData();
    hydrateIndicatorsFromCache();
    bindEvents();

    if (!location.hash) {
      location.hash = state.app.mode === 'crypto' ? '#crypto' : '#stocks';
    }

    PT.Router.init(function (mode) {
      setRouteMode(mode);
    });

    renderAll();
    alignMobileTopbarActionsToRightOnBoot();
    syncPortfolioWithServer();
    if (state.app.mode === 'stocks' && state.app.newsScopeStocks === 'general' && !state.news['stocks:general']) {
      refreshGeneralStocksNews();
    }
    if (state.app.mode === 'crypto' && state.app.cryptoAutoRefreshEnabled) {
      refreshVisibleData();
    } else if (state.app.stocksAutoRefreshEnabled) {
      refreshStocksQuotesOnly({ force: true, reason: 'boot' });
    }
    ensureStocksAutoRefreshTimer();
    ensureCryptoAutoRefreshTimer();

    setInterval(refreshSelectedMarketClock, 1000);
    setInterval(autoRefresh60s, 1000 * 60 * 10);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
