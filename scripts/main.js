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
  var PREV_CLOSE_HINT_FROM_QUOTE_MAX_AGE_MS = 1000 * 60 * 60 * 2;
  var PREV_CLOSE_HINT_HISTORY_MAX_AGE_DAYS = 5;
  var ASSET_DETAIL_FRESH_MS = 1000 * 60 * 5;
  var ASSET_DETAIL_REFRESH_STAMPS = {};
  var STOCKS_AUTO_REFRESH_TIMER = null;
  var CRYPTO_AUTO_REFRESH_TIMER = null;
  var API_SOURCE_DRAG = null;
  var CRYPTO_PARTICLES = null;
  var INDICATOR_IN_FLIGHT = {};
  var FUNDAMENTALS_IN_FLIGHT = {};
  var FUNDAMENTALS_REQUEST_STAMPS = {};
  var FUNDAMENTALS_LOCAL_FRESH_MS = 1000 * 60 * 30;
  var FUNDAMENTALS_ERROR_RETRY_MS = 1000 * 60 * 3;
  var RISK_CACHE_LOCAL_KEY_PREFIX = 'risk-meter:';
  var RISK_CACHE_IN_FLIGHT = {};
  var RISK_CACHE_REMOTE_LOADED = {};
  var INDICATOR_EXPLORER_SEARCH_TIMER = null;
  var EXPLORER_CACHE_RETENTION_MS = 1000 * 60 * 60 * 24 * 10;
  var EXPLORER_FAVORITES_LOCAL_CACHE_KEY = 'explorer:favorites:local';
  var INDICATOR_EXPLORER_FAVORITES_STALE_MS = 1000 * 60 * 5;
  var INDICATOR_EXPLORER_NOTE_MAX_LEN = 280;
  var SECTOR_METADATA_TTL_MS = 1000 * 60 * 60 * 24 * 30;
  var SECTOR_META_CACHE_PREFIX = 'sector:stock:';
  var SECTOR_EDIT_NEW_VALUE = '__new_sector__';
  var REFRESH_BTN_FEEDBACK_TIMER = null;
  var PORTFOLIO_CREATE_MODE = null;
  var MOBILE_ROW_FOCUS = {
    active: false,
    key: null,
    shell: null,
    topOffset: 8,
    scrollY: 0
  };
  var HOLDINGS_SCRAMBLE_SEED = id();
  var PORTFOLIO_REMOTE_REV = 0;
  var PORTFOLIO_LOADED_FROM_LOCAL_STORAGE = false;
  var INDICATOR_EXPLORER = {
    mode: 'stocks',
    view: 'all',
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
    fundamentals: null,
    fundamentalsLoading: false,
    newsItems: [],
    newsMeta: '',
    newsLoading: false,
    selectionToken: '',
    selectionRequestId: 0,
    favoritesSort: {
      key: 'asset',
      dir: 'asc'
    },
    favorites: {
      stocks: [],
      crypto: []
    },
    favoritesLoaded: false,
    sessions: {
      stocks: null,
      crypto: null
    }
  };
  var INDICATOR_EXPLORER_NOTE_EDIT = {
    mode: 'stocks',
    key: '',
    title: ''
  };
  var INDICATOR_EXPLORER_FAVORITES_REFRESH_IN_FLIGHT = null;
  var SECTOR_METADATA_IN_FLIGHT = {};
  var PANEL_VIEWER = { type: null };
  var PANEL_VIEWER_ALLOCATION_CHART = null;
  var LINK_VIEWER = { url: '', title: '' };
  var LINK_VIEWER_CHECK_CACHE = {};
  var LINK_VIEWER_CHECK_TTL_MS = 1000 * 60 * 10;
  var SECTOR_EDIT_CONTEXT = {
    symbol: '',
    items: [],
    sectorMap: {}
  };
  var SECTOR_RESET_CONFIRM = {
    pending: null,
    count: 0
  };
  var PORTFOLIO_DELETE_CONFIRM = {
    pending: null,
    mode: 'stocks',
    name: '',
    assetCount: 0
  };
  var API_DEBUG_DRAG = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    left: 0,
    top: 0,
    width: 0,
    height: 0
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

  function toFiniteNumber(value) {
    if (isFinite(Number(value))) return Number(value);
    var text = String(value == null ? '' : value).trim();
    if (!text) return null;
    text = text.replace(/,/g, '');
    if (/%$/.test(text)) text = text.slice(0, -1);
    var parsed = Number(text);
    return isFinite(parsed) ? parsed : null;
  }

  function normalizeStockTicker(raw) {
    var text = String(raw == null ? '' : raw).trim().toUpperCase();
    if (!text) return '';
    var token = text.split(/[,\s|]/)[0] || '';
    if (!token) return '';
    if (token.indexOf(':') >= 0) token = token.split(':')[0];
    token = token.replace(/[^A-Z0-9.\-]/g, '');
    if (/\.US$/.test(token)) token = token.slice(0, -3);
    return token;
  }

  function normalizeStooqSymbol(rawStooq, rawTicker) {
    var explicit = String(rawStooq == null ? '' : rawStooq).trim().toLowerCase();
    if (explicit) return explicit;
    var ticker = normalizeStockTicker(rawTicker);
    if (!ticker) return '';
    if (/\.L$/.test(ticker)) return ticker.slice(0, -2).toLowerCase() + '.uk';
    if (/\.IR$/.test(ticker)) return ticker.slice(0, -3).toLowerCase() + '.ie';
    if (ticker.indexOf('.') >= 0) return ticker.toLowerCase();
    return ticker.toLowerCase() + '.us';
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

  // Plays a short visual confirmation animation on the manual refresh button.
  function playRefreshButtonFeedback() {
    if (!ui || !ui.el) return;
    var buttons = [ui.el.refreshBtn, ui.el.holdingsRefreshBtn].filter(Boolean);
    if (!buttons.length) return;
    if (REFRESH_BTN_FEEDBACK_TIMER) {
      clearTimeout(REFRESH_BTN_FEEDBACK_TIMER);
      REFRESH_BTN_FEEDBACK_TIMER = null;
    }
    buttons.forEach(function (btn) {
      btn.classList.remove('is-clicked');
      void btn.offsetWidth;
      btn.classList.add('is-clicked');
    });
    REFRESH_BTN_FEEDBACK_TIMER = setTimeout(function () {
      buttons.forEach(function (btn) { btn.classList.remove('is-clicked'); });
      REFRESH_BTN_FEEDBACK_TIMER = null;
    }, 560);
  }

  // Triggers the same manual refresh flow used by the main refresh button.
  function runManualRefreshAction() {
    playRefreshButtonFeedback();
    if (state.app.mode === 'stocks') {
      refreshStocksQuotesOnly({ force: true, reason: 'manual' }).finally(function () {
        refreshSelectedFundamentals(true);
      });
      return;
    }
    refreshVisibleData().finally(function () {
      refreshSelectedFundamentals(true);
    });
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
            assetTypes: Array.isArray(source.assetTypes) ? source.assetTypes.slice() : [],
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
    var selectedMode = (window.PT && window.PT.__apiSourcesModalMode) === 'crypto'
      ? 'crypto'
      : ((window.PT && window.PT.__apiSourcesModalMode) === 'stocks'
        ? 'stocks'
        : (state.app.mode === 'crypto' ? 'crypto' : 'stocks'));
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
      selectedMode: selectedMode
    });
  }

  function openApiSourcesModal(mode) {
    var selectedMode = mode === 'crypto'
      ? 'crypto'
      : (mode === 'stocks' ? 'stocks' : (((window.PT && window.PT.__apiSourcesModalMode) === 'crypto') ? 'crypto' : (state.app.mode === 'crypto' ? 'crypto' : 'stocks')));
    if (window.PT) window.PT.__apiSourcesModalMode = selectedMode;
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
          selectedMode: selectedMode
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
        name: item.name || cryptoSymbol,
        cacheKey: indicatorTargetKey({ assetType: 'crypto', symbol: cryptoSymbol + '/USD' }),
        owned: false,
        sourceId: item.id || cryptoSymbol,
        coinId: item.id || null,
        baseSymbol: cryptoSymbol
      };
    }
    var stockSymbol = normalizeStockTicker(item && (item.yahooSymbol || item.symbol || ''));
    if (!stockSymbol) return null;
    return {
      mode: 'stocks',
      assetType: 'stock',
      symbol: stockSymbol,
      label: item.name ? (item.name + ' (' + stockSymbol + ')') : stockSymbol,
      name: item.name || stockSymbol,
      cacheKey: indicatorTargetKey({ assetType: 'stock', symbol: stockSymbol }),
      owned: false,
      sourceId: normalizeStockTicker(item && (item.yahooSymbol || item.symbol || stockSymbol)) || stockSymbol,
      yahooSymbol: stockSymbol,
      stooqSymbol: normalizeStooqSymbol(item && item.stooq, stockSymbol) || null,
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

  function computeIndicatorSnapshot(candles, timeframeKey, context) {
    if (!(window.PT && window.PT.IndicatorEngine && typeof window.PT.IndicatorEngine.analyze === 'function')) {
      throw new Error('Indicator engine unavailable');
    }
    var ctx = context || {};
    var snapshot = window.PT.IndicatorEngine.analyze(candles, {
      timeKey: timeframeKey,
      assetType: ctx.assetType || 'stock'
    });
    if (state && state.app && state.app.apiDebugEnabled && snapshot) {
      var trend = snapshot.trendMeter || {};
      var reversal = snapshot.reversal || {};
      var fib = snapshot && snapshot.values ? snapshot.values.fib : null;
      var tradePlan = snapshot && snapshot.values ? snapshot.values.tradePlan : null;
      var adxTrend = snapshot && snapshot.values ? snapshot.values.adxTrend : null;
      var volumeInfo = snapshot && snapshot.values ? snapshot.values.volumeConfirmation : null;
      try {
        console.debug('[Indicators]', String(timeframeKey).toUpperCase(), 'trend:', trend.timeframeScore, trend.label, trend.breakdown || {});
        console.debug('[Indicators]', String(timeframeKey).toUpperCase(), 'reversal:', reversal.score, reversal.label, reversal.reasons || []);
        console.debug('[Indicators]', String(timeframeKey).toUpperCase(), 'adx-volume:', {
          adx: snapshot && snapshot.values ? snapshot.values.adx14 : null,
          adxTrend: adxTrend,
          currentVolume: snapshot && snapshot.values ? snapshot.values.volumeCurrent : null,
          volumeMA20: snapshot && snapshot.values ? snapshot.values.volumeMA20 : null,
          volumeStatus: volumeInfo && volumeInfo.status ? volumeInfo.status : null,
          trendDirection: volumeInfo && volumeInfo.trendDirection ? volumeInfo.trendDirection : null
        });
        console.debug('[Indicators]', String(timeframeKey).toUpperCase(), 'fib:', {
          asset: ctx.assetKey || ctx.symbol || 'unknown',
          swingHigh: fib && fib.swingHigh,
          swingLow: fib && fib.swingLow,
          levels: fib && fib.levels,
          currentClose: fib && fib.currentClose,
          status: fib && fib.status,
          reason: fib && fib.reason
        });
        console.debug('[Indicators]', String(timeframeKey).toUpperCase(), 'trade-plan:', tradePlan && tradePlan.debug ? tradePlan.debug : tradePlan);
      } catch (err) {
        // Ignore console failures in constrained environments.
      }
    }
    return snapshot;
  }

  function indicatorSnapshotNeedsRecompute(snapshot, candlePayload) {
    function zoneMid(low, high) {
      var lo = Number(low);
      var hi = Number(high);
      if (!isFinite(lo) || !isFinite(hi) || lo <= 0 || hi <= 0 || hi < lo) return null;
      return (lo + hi) / 2;
    }

    function isInvalidTradePlanSnapshot(plan) {
      if (!plan || typeof plan !== 'object') return true;
      var entryMid = zoneMid(plan.entryZoneLow, plan.entryZoneHigh);
      var takeProfitMid = zoneMid(plan.takeProfitZoneLow, plan.takeProfitZoneHigh);
      var failureExitMid = zoneMid(plan.failureExitZoneLow, plan.failureExitZoneHigh);
      var hasZones = entryMid != null && takeProfitMid != null && failureExitMid != null;
      if (plan.available === false) {
        return hasZones; // "no setup" should not carry zones; recompute if it does
      }
      if (!hasZones) return true;
      if (!(takeProfitMid > entryMid)) return true;
      if (!(failureExitMid < entryMid)) return true;
      if (plan.available === true) {
        var rewardPct = Number(plan.rewardPct);
        var riskPct = Number(plan.riskPct);
        var rr = Number(plan.rr);
        if (!isFinite(rewardPct) || rewardPct <= 0) return true;
        if (!isFinite(riskPct) || riskPct <= 0) return true;
        if (!isFinite(rr) || rr <= 0) return true;
      }
      return false;
    }

    if (!snapshot) return true;
    if (Number(snapshot.engineVersion || 0) < 7) return true;
    var candleTime = candlePayload && candlePayload.latestCandleTime;
    if (candleTime && snapshot.latestCandleTime !== candleTime) return true;
    if (!snapshot.trendMeter) return true;
    if (!snapshot.reversal) return true;
    if (!(snapshot.emaPosition || (snapshot.values && snapshot.values.emaPosition))) return true;
    if (!(snapshot.values && snapshot.values.fib)) return true;
    if (!(snapshot.values && Object.prototype.hasOwnProperty.call(snapshot.values, 'adx14'))) return true;
    if (!(snapshot.values && snapshot.values.volumeConfirmation)) return true;
    if (!(snapshot.values && snapshot.values.tradePlan)) return true;
    if (!Object.prototype.hasOwnProperty.call(snapshot.values.tradePlan, 'takeProfitType')) return true;
    if (!Object.prototype.hasOwnProperty.call(snapshot.values.tradePlan, 'failureExitType')) return true;
    if (isInvalidTradePlanSnapshot(snapshot.values.tradePlan)) return true;
    return false;
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
        trendMeter: {
          overallScore: 0,
          overallLabel: 'Neutral',
          timeframes: {}
        },
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
      if (indicatorSnapshotNeedsRecompute(computedPayload, candlePayload)) {
        try {
          computedPayload = computeIndicatorSnapshot(candlePayload.candles, timeframeKey, {
            assetType: config.assetType,
            assetKey: targetKey,
            symbol: config.symbol
          });
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
      : { overall: 'Neutral', weightedScore: 0, trendMeter: { overallScore: 0, overallLabel: 'Neutral', timeframes: {} } };
    var nextState = {
      mode: config.mode,
      assetLabel: config.label,
      overallStatus: summary.overall || 'Neutral',
      weightedScore: summary.weightedScore || 0,
      trendMeter: summary.trendMeter || {
        overallScore: summary.weightedScore || 0,
        overallLabel: summary.overall || 'Neutral',
        timeframes: {}
      },
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
    if (state && state.app && state.app.apiDebugEnabled) {
      try {
        console.debug('[Indicators]', modeKey, 'overall weighted score:', summary.weightedScore, 'label:', summary.overall);
      } catch (err) {
        // Ignore console failures in constrained environments.
      }
    }
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
      if (indicatorSnapshotNeedsRecompute(cachedComputed, existing)) {
        cachedComputed = computeIndicatorSnapshot(existing.candles, timeframeKey, {
          assetType: config.assetType,
          assetKey: targetKey,
          symbol: config.symbol
        });
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
      if (budgetComputed && existing && Array.isArray(existing.candles) && existing.candles.length) {
        if (indicatorSnapshotNeedsRecompute(budgetComputed, existing)) {
          budgetComputed = computeIndicatorSnapshot(existing.candles, timeframeKey, {
            assetType: config.assetType,
            assetKey: targetKey,
            symbol: config.symbol
          });
          storage.setCached(state.caches, computedKey, budgetComputed);
          storage.saveCache(state.caches);
        }
        return Promise.resolve({
          snapshot: budgetComputed,
          lastFetchedAt: Number(existing && existing.lastFetchedAt || 0) || 0,
          fromCache: true,
          budgetGuard: true
        });
      }
      if (existing && Array.isArray(existing.candles) && existing.candles.length) {
        try {
          budgetComputed = computeIndicatorSnapshot(existing.candles, timeframeKey, {
            assetType: config.assetType,
            assetKey: targetKey,
            symbol: config.symbol
          });
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
      var snapshot = computeIndicatorSnapshot(merged, timeframeKey, {
        assetType: config.assetType,
        assetKey: targetKey,
        symbol: config.symbol
      });
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

  // Normalizes raw portfolio payloads into per-mode collections + active portfolio ids.
  function normalizePortfolioCollectionsPayload(raw) {
    var candidate = raw && typeof raw === 'object' ? raw : {};
    var fallback = state.getDefaultPortfolioCollections ? state.getDefaultPortfolioCollections() : {
      stocks: [{ id: 'main', name: 'Main', assets: [] }],
      crypto: [{ id: 'main', name: 'Main', assets: [] }]
    };

    function normalizeList(modeKey) {
      var sourceCollections = candidate.portfolios && typeof candidate.portfolios === 'object'
        ? candidate.portfolios[modeKey]
        : null;
      var sourceList = Array.isArray(sourceCollections) ? sourceCollections : null;
      var fallbackAssets = Array.isArray(candidate[modeKey]) ? candidate[modeKey] : [];
      var out = [];
      var seen = {};

      if (sourceList && sourceList.length) {
        sourceList.forEach(function (item, index) {
          var idRaw = String(item && item.id || '').trim();
          var portfolioId = idRaw || ('p-' + modeKey + '-' + index);
          if (seen[portfolioId]) return;
          seen[portfolioId] = true;
          var assets = Array.isArray(item && item.assets) ? item.assets : [];
          var name = String(item && item.name || '').trim() || ('Portfolio ' + (out.length + 1));
          out.push({
            id: portfolioId,
            name: name,
            assets: clone(assets)
          });
        });
      }

      if (!out.length) {
        out.push({
          id: 'main',
          name: 'Main',
          assets: clone(fallbackAssets.length ? fallbackAssets : (fallback[modeKey] && fallback[modeKey][0] && fallback[modeKey][0].assets) || [])
        });
      }

      return out;
    }

    var stocks = normalizeList('stocks');
    var crypto = normalizeList('crypto');

    function resolveActiveId(modeKey, list) {
      var explicit = modeKey === 'stocks'
        ? String(candidate.activePortfolioStocks || '').trim()
        : String(candidate.activePortfolioCrypto || '').trim();
      var fallbackId = list[0] && list[0].id ? String(list[0].id) : 'main';
      if (!explicit) return fallbackId;
      return list.some(function (item) { return String(item.id) === explicit; }) ? explicit : fallbackId;
    }

    return {
      portfolios: { stocks: stocks, crypto: crypto },
      activePortfolioStocks: resolveActiveId('stocks', stocks),
      activePortfolioCrypto: resolveActiveId('crypto', crypto)
    };
  }

  // Applies normalized collection state and updates active flat portfolio arrays.
  function applyPortfolioPayload(raw) {
    var normalized = normalizePortfolioCollectionsPayload(raw);
    state.portfolioCollections = normalized.portfolios;
    state.app.activePortfolioStocks = normalized.activePortfolioStocks;
    state.app.activePortfolioCrypto = normalized.activePortfolioCrypto;
    syncAllPortfolioArraysFromCollections();
  }

  // Returns the collection list for a mode.
  function portfoliosForMode(mode) {
    var key = mode === 'crypto' ? 'crypto' : 'stocks';
    if (!state.portfolioCollections || typeof state.portfolioCollections !== 'object') {
      state.portfolioCollections = state.getDefaultPortfolioCollections ? state.getDefaultPortfolioCollections() : { stocks: [], crypto: [] };
    }
    if (!Array.isArray(state.portfolioCollections[key])) state.portfolioCollections[key] = [];
    return state.portfolioCollections[key];
  }

  // Returns the active portfolio id field for a mode.
  function activePortfolioIdForMode(mode) {
    return mode === 'crypto'
      ? String(state.app.activePortfolioCrypto || '').trim()
      : String(state.app.activePortfolioStocks || '').trim();
  }

  // Updates active portfolio id field for a mode.
  function setActivePortfolioIdForMode(mode, portfolioId) {
    var safeId = String(portfolioId || '').trim();
    if (mode === 'crypto') state.app.activePortfolioCrypto = safeId;
    else state.app.activePortfolioStocks = safeId;
  }

  // Returns active portfolio record for a mode (always resolves to an existing record).
  function activePortfolioRecordForMode(mode) {
    var list = portfoliosForMode(mode);
    if (!list.length) {
      list.push({ id: 'main', name: 'Main', assets: [] });
    }
    var activeId = activePortfolioIdForMode(mode);
    var found = list.find(function (item) { return String(item.id) === activeId; }) || null;
    if (!found) {
      found = list[0];
      setActivePortfolioIdForMode(mode, found.id);
    }
    return found;
  }

  // Copies active collection assets into flat state.portfolio arrays used by existing app logic.
  function syncPortfolioArrayFromCollections(mode) {
    var key = mode === 'crypto' ? 'crypto' : 'stocks';
    var activeRecord = activePortfolioRecordForMode(mode);
    state.portfolio[key] = clone(Array.isArray(activeRecord && activeRecord.assets) ? activeRecord.assets : []);
  }

  // Copies both mode collections into flat state.portfolio arrays.
  function syncAllPortfolioArraysFromCollections() {
    syncPortfolioArrayFromCollections('stocks');
    syncPortfolioArrayFromCollections('crypto');
  }

  // Writes current flat state.portfolio arrays back to the active collection records.
  function syncActiveCollectionsFromPortfolioArrays() {
    ['stocks', 'crypto'].forEach(function (modeKey) {
      var activeRecord = activePortfolioRecordForMode(modeKey);
      activeRecord.assets = clone(Array.isArray(state.portfolio[modeKey]) ? state.portfolio[modeKey] : []);
    });
  }

  // Builds the persisted portfolio payload (legacy flat arrays + multi-portfolio envelope).
  function buildPortfolioPersistencePayload() {
    syncActiveCollectionsFromPortfolioArrays();
    return {
      stocks: clone(state.portfolio.stocks || []),
      crypto: clone(state.portfolio.crypto || []),
      portfolios: clone(state.portfolioCollections || { stocks: [], crypto: [] }),
      activePortfolioStocks: String(state.app.activePortfolioStocks || '').trim() || 'main',
      activePortfolioCrypto: String(state.app.activePortfolioCrypto || '').trim() || 'main'
    };
  }

  // Restores local portfolio, settings, and cache state before the UI boots.
  function loadInitialState() {
    var savedPortfolio = storage.loadPortfolio();
    var savedSettings = storage.loadSettings();
    var savedCache = storage.loadCache();

    if (savedPortfolio && savedPortfolio.stocks && savedPortfolio.crypto) {
      PORTFOLIO_LOADED_FROM_LOCAL_STORAGE = true;
      applyPortfolioPayload(savedPortfolio);
    }

    applySavedSettings(savedSettings);

    state.caches = savedCache || {};
  }

  // Checks whether a portfolio contains at least one asset.
  function hasPortfolioEntries(portfolio) {
    if (!portfolio) return false;
    if ((Array.isArray(portfolio.stocks) && portfolio.stocks.length) || (Array.isArray(portfolio.crypto) && portfolio.crypto.length)) return true;
    var collections = portfolio.portfolios && typeof portfolio.portfolios === 'object' ? portfolio.portfolios : null;
    if (!collections) return false;
    var stockCollections = Array.isArray(collections.stocks) ? collections.stocks : [];
    var cryptoCollections = Array.isArray(collections.crypto) ? collections.crypto : [];
    return stockCollections.some(function (p) { return Array.isArray(p && p.assets) && p.assets.length; }) ||
      cryptoCollections.some(function (p) { return Array.isArray(p && p.assets) && p.assets.length; });
  }

  function isPortfolioShape(portfolio) {
    return !!(portfolio && Array.isArray(portfolio.stocks) && Array.isArray(portfolio.crypto));
  }

  // Swaps in the server-sourced portfolio and clears dependent derived state.
  function replacePortfolioFromRemote(portfolio, updatedAt) {
    if (!portfolio || !portfolio.stocks || !portfolio.crypto) return;
    PORTFOLIO_REMOTE_REV = Math.max(PORTFOLIO_REMOTE_REV, Math.max(0, Number(updatedAt || 0) || 0));
    applyPortfolioPayload(portfolio);
    state.market.stocks = {};
    state.market.crypto = {};
    state.history.stocks = {};
    state.history.crypto = {};
    state.news = {};
    state.twitter = {};
    state.events = {};
    state.fundamentals = { stocks: {}, crypto: {} };
    normalizeImportedAssets();
    hydrateCachedData();
    hydrateIndicatorsFromCache();
    renderAll();
  }

  // Reconciles local and server portfolio state, preferring the shared server copy.
  function syncPortfolioWithServer() {
    if (state && state.app && state.app.demoModeEnabled) return Promise.resolve(null);
    if (!storage || typeof storage.loadRemotePortfolio !== 'function') return Promise.resolve(null);
    var localPortfolio = buildPortfolioPersistencePayload();
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
      state.app.scrambleHoldings = !!savedSettings.scrambleHoldings;
      state.app.stocksAutoRefreshEnabled = !!savedSettings.stocksAutoRefreshEnabled;
      state.app.cryptoAutoRefreshEnabled = !!savedSettings.cryptoAutoRefreshEnabled;
      state.app.stocksAutoRefreshIntervalSec = Math.max(15, Number(savedSettings.stocksAutoRefreshIntervalSec || 600) || 600);
      state.app.cryptoAutoRefreshIntervalSec = Math.max(15, Number(savedSettings.cryptoAutoRefreshIntervalSec || 600) || 600);
      if (Object.prototype.hasOwnProperty.call(savedSettings, 'cryptoParticlesEnabled')) {
        state.app.cryptoParticlesEnabled = !!savedSettings.cryptoParticlesEnabled;
      }
      if (Object.prototype.hasOwnProperty.call(savedSettings, 'uiTransparencyEnabled')) {
        state.app.uiTransparencyEnabled = !!savedSettings.uiTransparencyEnabled;
      }
      state.app.demoModeEnabled = !!savedSettings.demoModeEnabled;
      state.app.apiDebugEnabled = !!savedSettings.apiDebugEnabled;
      state.app.apiDebugPanelPosition = normalizeApiDebugPanelPosition(savedSettings.apiDebugPanelPosition);
      state.app.apiSourcePrefs = apiSourceHelpers && typeof apiSourceHelpers.normalizePrefs === 'function'
        ? apiSourceHelpers.normalizePrefs(savedSettings.apiSourcePrefs)
        : (savedSettings.apiSourcePrefs || state.app.apiSourcePrefs);
      state.app.newsScopeStocks = savedSettings.newsScopeStocks === 'selected' ? 'selected' : 'general';
      state.app.sortBy = savedSettings.sortBy || 'az';
      state.app.newsSourceStocks = savedSettings.newsSourceStocks || 'marketaux';
      state.app.newsSourceCrypto = savedSettings.newsSourceCrypto || 'auto';
      state.app.allocationModeStocks = savedSettings.allocationModeStocks === 'sectors' ? 'sectors' : 'stocks';
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
      if (savedSettings.indicatorExplorerFavoritesSort && typeof savedSettings.indicatorExplorerFavoritesSort === 'object') {
        INDICATOR_EXPLORER.favoritesSort = {
          key: normalizeIndicatorExplorerFavoritesSortKey(savedSettings.indicatorExplorerFavoritesSort.key),
          dir: normalizeIndicatorExplorerFavoritesSortDir(savedSettings.indicatorExplorerFavoritesSort.dir)
        };
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
    if (state.app.scrambleHoldings) HOLDINGS_SCRAMBLE_SEED = id();

    state.app.twelveDataEnabled = (window.PT && window.PT.ApiSources && window.PT.ApiSources.getOrdered('prices', 'stock', state.app.apiSourcePrefs).indexOf('twelvedata') >= 0);
  }

  function getCachedAny(key) {
    var entry = state.caches && state.caches[key];
    return entry && entry.data ? entry.data : null;
  }

  // Returns the active allocation view mode for stocks pie chart rendering.
  function allocationModeStocks() {
    return state && state.app && state.app.allocationModeStocks === 'sectors' ? 'sectors' : 'stocks';
  }

  // Returns true when sector allocation mode should be used for the current render context.
  function isSectorAllocationModeActive(mode) {
    var safeMode = mode === 'crypto' ? 'crypto' : 'stocks';
    return safeMode === 'stocks' && allocationModeStocks() === 'sectors';
  }

  // Builds a stable local/remote cache key for one stock's sector metadata record.
  function sectorMetaCacheKey(symbol) {
    var safeSymbol = String(symbol || '').trim().toUpperCase();
    if (!safeSymbol) return '';
    return SECTOR_META_CACHE_PREFIX + safeSymbol;
  }

  // Normalizes a persisted sector metadata payload to a stable shape.
  function normalizeSectorMetadataRecord(symbol, raw) {
    var safeSymbol = String(symbol || '').trim().toUpperCase();
    var payload = raw && typeof raw === 'object' ? raw : {};
    var engine = window.PT && window.PT.SectorAllocation;
    var rawSector = payload.rawSector != null ? String(payload.rawSector).trim() : '';
    var rawIndustry = payload.rawIndustry != null ? String(payload.rawIndustry).trim() : '';
    var finnhubIndustry = payload.finnhubIndustry != null ? String(payload.finnhubIndustry).trim() : '';
    var rawName = payload.rawName != null ? String(payload.rawName).trim() : '';
    var rawDescription = payload.rawDescription != null ? String(payload.rawDescription).trim() : '';
    var rawCategory = payload.rawCategory != null ? String(payload.rawCategory).trim() : '';
    var rawAssetType = payload.rawAssetType != null ? String(payload.rawAssetType).trim() : '';
    var userDefinedSectorGroup = payload.userDefinedSectorGroup != null ? String(payload.userDefinedSectorGroup).trim() : '';
    var normalizedSectorGroup = payload.normalizedSectorGroup || payload.normalizedSector || '';
    var normalizedIndustryTheme = payload.normalizedIndustryTheme || '';
    var assetType = payload.assetType != null ? String(payload.assetType).trim().toLowerCase() : '';
    var source = String(payload.source || '').trim() || 'unknown';
    var reasonIfUnavailable = payload.reasonIfUnavailable ? String(payload.reasonIfUnavailable).trim() : null;
    var confidence = Number(payload.confidence);
    if (!isFinite(confidence)) confidence = null;
    var reason = payload.reason != null ? String(payload.reason).trim() : '';
    var classificationVersion = payload.classificationVersion != null ? String(payload.classificationVersion).trim() : '';
    if (engine && typeof engine.normalizeStockClassification === 'function') {
      var normalized = engine.normalizeStockClassification({
        symbol: safeSymbol,
        rawSector: rawSector || normalizedSectorGroup,
        rawIndustry: rawIndustry || normalizedIndustryTheme,
        finnhubIndustry: finnhubIndustry,
        rawName: rawName,
        rawDescription: rawDescription,
        rawCategory: rawCategory,
        rawAssetType: rawAssetType,
        assetType: assetType,
        userDefinedSectorGroup: userDefinedSectorGroup || null,
        source: source,
        lastFetchedAt: payload.lastFetchedAt || payload.fetchedAt || Date.now(),
        reasonIfUnavailable: reasonIfUnavailable || null
      });
      normalizedSectorGroup = normalized.normalizedSectorGroup || normalizedSectorGroup;
      normalizedIndustryTheme = normalized.normalizedIndustryTheme || normalizedIndustryTheme;
      assetType = normalized.assetType || assetType;
      if ((source === 'unknown' || !source) && normalized.source) source = String(normalized.source || '').trim() || source;
      if (normalized.reasonIfUnavailable) reasonIfUnavailable = String(normalized.reasonIfUnavailable).trim() || reasonIfUnavailable;
      if (normalized.reason != null) reason = String(normalized.reason || '').trim();
      if (isFinite(Number(normalized.confidence))) confidence = Number(normalized.confidence);
      if (normalized.classificationVersion) classificationVersion = String(normalized.classificationVersion || '').trim();
      if (!rawSector && normalized.rawSector) rawSector = String(normalized.rawSector || '').trim();
      if (!rawIndustry && normalized.rawIndustry) rawIndustry = String(normalized.rawIndustry || '').trim();
      if (!rawName && normalized.rawName) rawName = String(normalized.rawName || '').trim();
      if (!rawDescription && normalized.rawDescription) rawDescription = String(normalized.rawDescription || '').trim();
      if (!rawCategory && normalized.rawCategory) rawCategory = String(normalized.rawCategory || '').trim();
      if (!rawAssetType && normalized.rawAssetType) rawAssetType = String(normalized.rawAssetType || '').trim();
      if (!userDefinedSectorGroup && normalized.userDefinedSectorGroup) userDefinedSectorGroup = String(normalized.userDefinedSectorGroup || '').trim();
    } else {
      normalizedSectorGroup = String(normalizedSectorGroup || rawSector || rawIndustry || 'Other / Unknown').trim() || 'Other / Unknown';
      normalizedIndustryTheme = String(normalizedIndustryTheme || rawIndustry || normalizedSectorGroup || 'Other / Unknown').trim() || 'Other / Unknown';
      assetType = assetType || 'stock';
    }
    var engineVersion = engine && engine.CLASSIFICATION_VERSION ? String(engine.CLASSIFICATION_VERSION || '').trim() : '';
    if (!classificationVersion && engineVersion) classificationVersion = engineVersion;
    if (confidence != null) {
      if (!isFinite(confidence)) confidence = null;
      else confidence = Math.max(0, Math.min(1, confidence));
    }
    return {
      symbol: safeSymbol,
      assetType: assetType || 'stock',
      rawAssetType: rawAssetType || null,
      rawSector: rawSector || null,
      rawIndustry: rawIndustry || null,
      finnhubIndustry: finnhubIndustry || null,
      rawName: rawName || null,
      rawDescription: rawDescription || null,
      rawCategory: rawCategory || null,
      userDefinedSectorGroup: userDefinedSectorGroup || null,
      normalizedSectorGroup: normalizedSectorGroup,
      normalizedIndustryTheme: normalizedIndustryTheme,
      normalizedSector: normalizedSectorGroup,
      confidence: confidence,
      reason: reason || null,
      classificationVersion: classificationVersion || null,
      source: source,
      lastFetchedAt: Math.max(0, Number(payload.lastFetchedAt || payload.fetchedAt || 0) || 0),
      reasonIfUnavailable: reasonIfUnavailable || null
    };
  }

  // Writes one sector metadata record to local cache, with optional server DB persist.
  function setCachedStockSectorMetadata(symbol, metadata, options) {
    var key = sectorMetaCacheKey(symbol);
    if (!key || !metadata || typeof metadata !== 'object') return Promise.resolve({ ok: false });
    var normalized = normalizeSectorMetadataRecord(symbol, metadata);
    if (!normalized.lastFetchedAt) normalized.lastFetchedAt = Date.now();
    storage.setCached(state.caches, key, normalized);
    storage.saveCache(state.caches);
    var persistRemote = !(options && options.persistRemote === false);
    if (!persistRemote || typeof storage.saveRemoteStockSector !== 'function') {
      return Promise.resolve({ ok: true, metadata: normalized });
    }
    return storage.saveRemoteStockSector(symbol, normalized).then(function (result) {
      return { ok: !!(result && result.ok), metadata: normalized };
    }).catch(function () {
      return { ok: false, metadata: normalized };
    });
  }

  // Reads one stock sector metadata record from local cache (optionally freshness-filtered).
  function getCachedStockSectorMetadata(symbol, maxAgeMs) {
    var key = sectorMetaCacheKey(symbol);
    if (!key) return null;
    var fromLocal = storage.getCached(state.caches, key, maxAgeMs || 0) || getCachedAny(key);
    if (!fromLocal || typeof fromLocal !== 'object') return null;
    return normalizeSectorMetadataRecord(symbol, fromLocal);
  }

  // Loads a stock sector metadata record from DB cache and stores it locally.
  function getRemoteStockSectorMetadata(symbol) {
    if (!storage || typeof storage.getRemoteStockSector !== 'function') return Promise.resolve(null);
    return storage.getRemoteStockSector(symbol).then(function (record) {
      if (!record || !record.metadata) return null;
      var normalized = normalizeSectorMetadataRecord(symbol, record.metadata);
      storage.setCached(state.caches, sectorMetaCacheKey(symbol), normalized);
      storage.saveCache(state.caches);
      return normalized;
    }).catch(function () {
      return null;
    });
  }

  // Returns true when a cached sector row should be recomputed despite TTL freshness.
  function shouldRefreshSectorMetadataRecord(record) {
    var sectorEngine = window.PT && window.PT.SectorAllocation;
    if (!record || typeof record !== 'object') return true;
    if (sectorEngine && typeof sectorEngine.shouldReclassifyCachedRecord === 'function') {
      return !!sectorEngine.shouldReclassifyCachedRecord(
        record,
        sectorEngine.CLASSIFICATION_VERSION || null
      );
    }
    if (!record.normalizedSectorGroup || !record.normalizedIndustryTheme) return true;
    if (!record.classificationVersion || record.confidence == null || !record.reason) return true;
    return false;
  }

  // Fetches and resolves one stock sector metadata record using Finnhub primary + Alpha fallback.
  function fetchStockSectorMetadata(symbol, options) {
    var safeSymbol = String(symbol || '').trim().toUpperCase();
    if (!safeSymbol) return Promise.resolve(null);
    var opts = options && typeof options === 'object' ? options : {};
    var providerSymbol = String(opts.apiSymbol || safeSymbol).trim().toUpperCase() || safeSymbol;
    var fallbackName = String(opts.rawName || '').trim() || '';
    var fallbackDescription = String(opts.rawDescription || '').trim() || '';
    var fallbackAssetType = String(opts.rawAssetType || '').trim() || '';
    var market = String(opts.market || '').trim().toUpperCase();
    var sectorEngine = window.PT && window.PT.SectorAllocation;
    if (!sectorEngine || typeof sectorEngine.selectSectorMetadataFromProviders !== 'function') {
      return Promise.resolve(normalizeSectorMetadataRecord(safeSymbol, {
        symbol: safeSymbol,
        rawSector: null,
        rawIndustry: null,
        normalizedSectorGroup: 'Other / Unknown',
        normalizedIndustryTheme: 'Other / Unknown',
        source: 'unknown',
        lastFetchedAt: Date.now(),
        reasonIfUnavailable: 'sector engine unavailable'
      }));
    }
    function isLseExchange(value) {
      var text = String(value || '').trim().toUpperCase();
      return /(^|[^A-Z])(LSE|LON|XLON|LONDON)([^A-Z]|$)/.test(text);
    }
    function looksLikeEtfHint(value) {
      var text = String(value || '').trim().toLowerCase();
      if (!text) return false;
      return /\b(etf|ucits|fund|index|trust|ishares|vanguard|spdr|invesco|wisdomtree|global x|vaneck)\b/.test(text);
    }
    function buildProviderSymbols() {
      var raw = [];
      if (market === 'LSE') {
        if (/\.L$/.test(providerSymbol)) raw.push(providerSymbol);
        else if (/\.L$/.test(safeSymbol)) raw.push(safeSymbol);
        else if (safeSymbol) raw.push(safeSymbol + '.L');
      }
      raw.push(providerSymbol, safeSymbol);
      if (/\.L$/.test(providerSymbol)) raw.push(providerSymbol.replace(/\.L$/, ''));
      if (/\.L$/.test(safeSymbol)) raw.push(safeSymbol.replace(/\.L$/, ''));
      var out = [];
      var seen = {};
      raw.forEach(function (value) {
        var normalized = String(value || '').trim().toUpperCase();
        if (!normalized || seen[normalized]) return;
        seen[normalized] = true;
        out.push(normalized);
      });
      return out.slice(0, 3);
    }
    var providerSymbols = buildProviderSymbols();
    function trySymbolVariants(fetcher, isUseful) {
      var idx = 0;
      function runNext() {
        if (idx >= providerSymbols.length) return Promise.resolve(null);
        var current = providerSymbols[idx++];
        return fetcher(current).then(function (payload) {
          if (isUseful(payload, current)) return payload;
          return runNext();
        }).catch(function () {
          return runNext();
        });
      }
      return runNext();
    }
    function isUsefulFinnhub(payload, candidateSymbol) {
      var profile = payload && payload.profile ? payload.profile : null;
      if (!profile || typeof profile !== 'object') return false;
      var hasClassifyingFields = !!(
        String(profile.sector || '').trim() ||
        String(profile.industry || '').trim() ||
        String(profile.finnhubIndustry || '').trim() ||
        String(profile.type || '').trim()
      );
      if (!hasClassifyingFields) return false;
      if (market === 'LSE' && /\.L$/.test(String(candidateSymbol || '').trim().toUpperCase())) {
        var exchange = String(profile.exchange || '').trim();
        if (exchange && !isLseExchange(exchange)) return false;
      }
      return true;
    }
    function isUsefulAlpha(payload, candidateSymbol) {
      var overview = payload && payload.overview ? payload.overview : null;
      if (!overview || typeof overview !== 'object') return false;
      var hasClassifyingFields = !!(
        String(overview.Sector || '').trim() ||
        String(overview.Industry || '').trim() ||
        String(overview.AssetType || '').trim() ||
        String(overview.Category || '').trim() ||
        String(overview.Description || '').trim()
      );
      if (!hasClassifyingFields) return false;
      if (market === 'LSE') {
        var exchange = String(overview.Exchange || '').trim();
        var requested = String(candidateSymbol || payload.symbol || '').trim().toUpperCase();
        if (!isLseExchange(exchange) && !/\.L$/.test(requested)) return false;
      }
      return true;
    }
    function isUsefulListing(payload, candidateSymbol) {
      if (!payload || !(payload.found || payload.assetType || payload.name)) return false;
      if (market !== 'LSE') return true;
      var requested = String(candidateSymbol || payload.symbol || '').trim().toUpperCase();
      return isLseExchange(payload.exchange) || /\.L$/.test(requested);
    }
    function isUsefulFundamentalsHint(payload) {
      var profile = payload && payload.profile ? payload.profile : null;
      if (!payload || !payload.found || !profile || typeof profile !== 'object') return false;
      return !!(
        String(profile.type || '').trim() ||
        String(profile.sector || '').trim() ||
        String(profile.industry || '').trim() ||
        String(profile.category || '').trim() ||
        String(profile.name || '').trim() ||
        String(profile.description || '').trim()
      );
    }
    function classificationQuality(metadata) {
      if (!metadata || typeof metadata !== 'object') return -1;
      var normalized = sectorEngine.normalizeStockClassification(Object.assign({}, metadata, {
        symbol: safeSymbol,
        lastFetchedAt: metadata.lastFetchedAt || Date.now()
      }));
      var score = 0;
      if (normalized.assetType && normalized.assetType !== 'unknown') score += 4;
      if (normalized.normalizedSectorGroup && normalized.normalizedSectorGroup !== 'Other / Unknown') score += 3;
      if (normalized.normalizedIndustryTheme && normalized.normalizedIndustryTheme !== 'Other / Unknown') score += 3;
      score += Number(normalized.confidence || 0) * 4;
      if (normalized.rawIndustry || normalized.finnhubIndustry) score += 1;
      if (normalized.rawSector) score += 1;
      if (normalized.rawName || normalized.rawDescription || normalized.rawCategory) score += 1;
      return score;
    }
    var finnhubTask = storage && typeof storage.fetchSectorFromFinnhub === 'function'
      ? trySymbolVariants(function (candidateSymbol) {
        return storage.fetchSectorFromFinnhub(candidateSymbol);
      }, isUsefulFinnhub)
      : Promise.resolve(null);
    return finnhubTask.then(function (finnhubPayload) {
      var finnhubProfile = finnhubPayload && finnhubPayload.profile ? finnhubPayload.profile : null;
      var finCandidate = sectorEngine.normalizeStockClassification({
        symbol: safeSymbol,
        rawSector: finnhubProfile && finnhubProfile.sector,
        rawIndustry: finnhubProfile && (finnhubProfile.industry || finnhubProfile.finnhubIndustry),
        finnhubIndustry: finnhubProfile && finnhubProfile.finnhubIndustry,
        rawName: finnhubProfile && finnhubProfile.name,
        rawAssetType: finnhubProfile && finnhubProfile.type,
        source: 'finnhub',
        lastFetchedAt: Date.now()
      });
      var needsAlpha = !finnhubProfile ||
        finCandidate.normalizedSectorGroup === sectorEngine.UNKNOWN_SECTOR ||
        finCandidate.normalizedIndustryTheme === (sectorEngine.UNKNOWN_THEME || 'Other / Unknown') ||
        finCandidate.assetType === 'unknown';
      var alphaTask = needsAlpha && storage && typeof storage.fetchSectorFromAlphaVantage === 'function'
        ? trySymbolVariants(function (candidateSymbol) {
          return storage.fetchSectorFromAlphaVantage(candidateSymbol);
        }, isUsefulAlpha)
        : Promise.resolve(null);
      return alphaTask.then(function (alphaPayload) {
        var alphaOverview = alphaPayload && alphaPayload.overview ? alphaPayload.overview : null;
        var alphaAssetType = alphaOverview && alphaOverview.AssetType ? String(alphaOverview.AssetType).trim() : '';
        var needsListingType = (!alphaAssetType || alphaAssetType.toLowerCase() === 'unknown') &&
          !!(storage && typeof storage.fetchSectorAssetTypeFromAlphaVantage === 'function');
        var listingTask = needsListingType
          ? trySymbolVariants(function (candidateSymbol) {
            return storage.fetchSectorAssetTypeFromAlphaVantage(candidateSymbol);
          }, isUsefulListing)
          : Promise.resolve(null);
        var fundamentalsHintTask = storage && typeof storage.fetchSectorFromFundamentalsCache === 'function'
          ? trySymbolVariants(function (candidateSymbol) {
            return storage.fetchSectorFromFundamentalsCache(candidateSymbol);
          }, isUsefulFundamentalsHint)
          : Promise.resolve(null);
        return Promise.all([listingTask, fundamentalsHintTask]).then(function (results) {
          var listingPayload = results[0];
          var fundamentalsHintPayload = results[1];
          var selected = sectorEngine.selectSectorMetadataFromProviders(
            safeSymbol,
            finnhubProfile,
            alphaOverview,
            listingPayload,
            Date.now()
          ) || {};
          var fundamentalsProfile = fundamentalsHintPayload && fundamentalsHintPayload.profile
            ? fundamentalsHintPayload.profile
            : null;
          if (fundamentalsProfile && typeof fundamentalsProfile === 'object') {
            var fundamentalsCandidate = {
              symbol: safeSymbol,
              rawSector: fundamentalsProfile.sector,
              rawIndustry: fundamentalsProfile.industry,
              rawName: fundamentalsProfile.name,
              rawDescription: fundamentalsProfile.description,
              rawCategory: fundamentalsProfile.category,
              rawAssetType: fundamentalsProfile.type,
              source: 'fundamentals-cache',
              lastFetchedAt: Number(fundamentalsHintPayload && fundamentalsHintPayload.fetchedAt || 0) || Date.now()
            };
            if (classificationQuality(fundamentalsCandidate) > classificationQuality(selected)) {
              selected = Object.assign({}, selected, fundamentalsCandidate);
            } else {
              if (!selected.rawSector && fundamentalsCandidate.rawSector) selected.rawSector = fundamentalsCandidate.rawSector;
              if (!selected.rawIndustry && fundamentalsCandidate.rawIndustry) selected.rawIndustry = fundamentalsCandidate.rawIndustry;
              if (!selected.rawName && fundamentalsCandidate.rawName) selected.rawName = fundamentalsCandidate.rawName;
              if (!selected.rawDescription && fundamentalsCandidate.rawDescription) selected.rawDescription = fundamentalsCandidate.rawDescription;
              if (!selected.rawCategory && fundamentalsCandidate.rawCategory) selected.rawCategory = fundamentalsCandidate.rawCategory;
              if (!selected.rawAssetType && fundamentalsCandidate.rawAssetType) selected.rawAssetType = fundamentalsCandidate.rawAssetType;
            }
          }
          if (
            selected.normalizedSectorGroup === 'Other / Unknown' &&
            market === 'LSE' &&
            /\.L$/.test(providerSymbol) &&
            !selected.rawAssetType &&
            (looksLikeEtfHint(fallbackName) || looksLikeEtfHint(fallbackDescription))
          ) {
            selected.rawAssetType = 'ETF';
          }
          if (!selected.rawName && fallbackName) selected.rawName = fallbackName;
          if (!selected.rawDescription && fallbackDescription) selected.rawDescription = fallbackDescription;
          if (!selected.rawAssetType && fallbackAssetType) selected.rawAssetType = fallbackAssetType;
          return normalizeSectorMetadataRecord(safeSymbol, selected);
        });
      });
    }).catch(function () {
      return normalizeSectorMetadataRecord(safeSymbol, {
        symbol: safeSymbol,
        rawSector: null,
        rawIndustry: null,
        normalizedSectorGroup: 'Other / Unknown',
        normalizedIndustryTheme: 'Other / Unknown',
        source: 'unknown',
        lastFetchedAt: Date.now(),
        reasonIfUnavailable: 'provider fetch failed'
      });
    });
  }

  // Resolves one stock sector metadata record with cache-first (local, DB) and provider fallback.
  function resolveStockSectorMetadata(symbol, options) {
    var safeSymbol = String(symbol || '').trim().toUpperCase();
    if (!safeSymbol) return Promise.resolve(null);
    var cacheKey = sectorMetaCacheKey(safeSymbol);
    var force = !!(options && options.force);
    var sectorEngine = window.PT && window.PT.SectorAllocation;
    var freshLocal = !force ? getCachedStockSectorMetadata(safeSymbol, SECTOR_METADATA_TTL_MS) : null;
    if (freshLocal && !shouldRefreshSectorMetadataRecord(freshLocal)) return Promise.resolve(freshLocal);
    if (SECTOR_METADATA_IN_FLIGHT[cacheKey]) return SECTOR_METADATA_IN_FLIGHT[cacheKey];

    var staleLocal = getCachedStockSectorMetadata(safeSymbol, 0);
    SECTOR_METADATA_IN_FLIGHT[cacheKey] = getRemoteStockSectorMetadata(safeSymbol).then(function (remoteMeta) {
      if (!force && remoteMeta && sectorEngine && typeof sectorEngine.isSectorMetadataFresh === 'function' &&
        sectorEngine.isSectorMetadataFresh(remoteMeta, SECTOR_METADATA_TTL_MS, Date.now()) &&
        !shouldRefreshSectorMetadataRecord(remoteMeta)) {
        return remoteMeta;
      }
      return fetchStockSectorMetadata(safeSymbol, options).then(function (fetchedMeta) {
        if (staleLocal && staleLocal.userDefinedSectorGroup) {
          fetchedMeta.userDefinedSectorGroup = staleLocal.userDefinedSectorGroup;
          fetchedMeta.normalizedSectorGroup = staleLocal.userDefinedSectorGroup;
          fetchedMeta.normalizedSector = staleLocal.userDefinedSectorGroup;
          if (!fetchedMeta.normalizedIndustryTheme || fetchedMeta.normalizedIndustryTheme === 'Other / Unknown') {
            fetchedMeta.normalizedIndustryTheme = staleLocal.normalizedIndustryTheme || staleLocal.userDefinedSectorGroup;
          }
        }
        return setCachedStockSectorMetadata(safeSymbol, fetchedMeta).then(function (result) {
          return result && result.metadata ? result.metadata : fetchedMeta;
        });
      }).catch(function () {
        return remoteMeta || staleLocal || null;
      });
    }).then(function (resolved) {
      if (resolved) {
        storage.setCached(state.caches, cacheKey, resolved);
        storage.saveCache(state.caches);
      }
      return resolved || staleLocal || null;
    }).finally(function () {
      delete SECTOR_METADATA_IN_FLIGHT[cacheKey];
    });

    return SECTOR_METADATA_IN_FLIGHT[cacheKey];
  }

  // Returns a map of symbol -> sector metadata from cache for current stock holdings.
  function cachedSectorMetadataMapForItems(items) {
    var out = {};
    (Array.isArray(items) ? items : []).forEach(function (item) {
      if (!item || item.type !== 'stock') return;
      var symbol = String(item.symbol || '').trim().toUpperCase();
      if (!symbol || out[symbol]) return;
      var cached = getCachedStockSectorMetadata(symbol, 0);
      if (cached) out[symbol] = cached;
    });
    return out;
  }

  // Triggers background sector metadata hydration for missing/stale stock symbols and refreshes allocation view on completion.
  function ensureStockSectorMetadataForItems(items) {
    if (!isSectorAllocationModeActive(state.app.mode)) return;
    var sectorEngine = window.PT && window.PT.SectorAllocation;
    if (!sectorEngine || typeof sectorEngine.isSectorMetadataFresh !== 'function') return;
    var contexts = [];
    var seen = {};
    (Array.isArray(items) ? items : []).forEach(function (item) {
      if (!item || item.type !== 'stock') return;
      var symbol = String(item.symbol || '').trim().toUpperCase();
      if (!symbol || seen[symbol]) return;
      seen[symbol] = true;
      var fresh = getCachedStockSectorMetadata(symbol, SECTOR_METADATA_TTL_MS);
      if (fresh && !shouldRefreshSectorMetadataRecord(fresh)) return;
      contexts.push({
        symbol: symbol,
        apiSymbol: String(item.yahooSymbol || symbol || '').trim().toUpperCase() || symbol,
        rawName: String(item.name || symbol || '').trim(),
        market: String(item.market || '').trim().toUpperCase()
      });
    });
    if (!contexts.length) return;
    Promise.allSettled(contexts.map(function (ctx) {
      return resolveStockSectorMetadata(ctx.symbol, {
        force: false,
        apiSymbol: ctx.apiSymbol,
        rawName: ctx.rawName,
        market: ctx.market
      });
    })).then(function () {
      if (isSectorAllocationModeActive(state.app.mode)) {
        var modeItems = getModeComputedItems(state.app.mode);
        renderAllocation(modeItems, {
          scrambleHoldings: state.app.mode === 'stocks' && !!state.app.scrambleHoldings,
          scrambleSeed: HOLDINGS_SCRAMBLE_SEED
        });
      }
    });
  }

  // Builds a stable local cache key for fundamentals by asset identity.
  function fundamentalsCacheKeyForAsset(asset) {
    if (!asset || !asset.type) return '';
    if (asset.type === 'crypto') {
      var coinId = String(asset.coinId || asset.id || '').trim().toLowerCase();
      if (!coinId) return '';
      return 'fa:crypto:' + coinId;
    }
    var symbol = String(asset.yahooSymbol || asset.symbol || '').trim().toUpperCase();
    if (!symbol) return '';
    return 'fa:stock:' + symbol;
  }

  // Resolves the in-memory fundamentals bucket for a given asset.
  function fundamentalsBucketForAsset(asset) {
    if (!asset || !asset.type) return null;
    if (!state.fundamentals || typeof state.fundamentals !== 'object') {
      state.fundamentals = { stocks: {}, crypto: {} };
    }
    if (!state.fundamentals.stocks || typeof state.fundamentals.stocks !== 'object') state.fundamentals.stocks = {};
    if (!state.fundamentals.crypto || typeof state.fundamentals.crypto !== 'object') state.fundamentals.crypto = {};
    return asset.type === 'crypto' ? state.fundamentals.crypto : state.fundamentals.stocks;
  }

  // Returns whether fundamentals source routing is enabled for a given asset type.
  function fundamentalsSourceEnabled(assetType) {
    if (!window.PT || !window.PT.ApiSources || typeof window.PT.ApiSources.getOrdered !== 'function') return true;
    var safeType = assetType === 'crypto' ? 'crypto' : 'stock';
    var ordered = window.PT.ApiSources.getOrdered('fundamentals', safeType, state.app.apiSourcePrefs) || [];
    if (safeType === 'crypto') return ordered.indexOf('coingecko') >= 0;
    return ordered.indexOf('fmp') >= 0;
  }

  // Returns whether optional DefiLlama enrichment is enabled in source preferences.
  function fundamentalsProtocolSourceEnabled() {
    if (!window.PT || !window.PT.ApiSources || typeof window.PT.ApiSources.getOrdered !== 'function') return false;
    var ordered = window.PT.ApiSources.getOrdered('fundamentals', 'crypto', state.app.apiSourcePrefs) || [];
    return ordered.indexOf('defillama') >= 0;
  }

  // Reads a cached fundamentals snapshot for a given asset.
  function getFundamentalsSnapshot(asset) {
    var bucket = fundamentalsBucketForAsset(asset);
    if (!bucket) return null;
    return bucket[asset.id] || null;
  }

  // Persists a fundamentals snapshot into memory and local cache.
  function setFundamentalsSnapshot(asset, payload) {
    var bucket = fundamentalsBucketForAsset(asset);
    if (!bucket) return;
    var stamped = Object.assign({}, payload || {}, {
      localFetchedAt: Date.now()
    });
    bucket[asset.id] = stamped;
    var cacheKey = fundamentalsCacheKeyForAsset(asset);
    if (cacheKey) {
      storage.setCached(state.caches, cacheKey, stamped);
      storage.saveCache(state.caches);
    }
  }

  // Builds a stable local/remote cache key for risk snapshots by asset identity.
  function riskCacheKeyForAsset(asset) {
    if (!asset || !asset.type) return '';
    if (asset.type === 'crypto') {
      var coinId = String(asset.coinId || asset.id || asset.symbol || '').trim().toLowerCase();
      if (!coinId) return '';
      return 'crypto:' + coinId;
    }
    var symbol = String(asset.yahooSymbol || asset.symbol || '').trim().toUpperCase();
    if (!symbol) return '';
    return 'stock:' + symbol;
  }

  // Builds a stable risk cache key for an explorer target.
  function riskCacheKeyForExplorerTarget(target) {
    if (!target) return '';
    if (target.assetType === 'crypto') {
      var cryptoId = String(target.coinId || target.sourceId || target.baseSymbol || target.symbol || '').trim().toLowerCase();
      if (!cryptoId) return '';
      return 'crypto:' + cryptoId.replace(/\/usd$/i, '');
    }
    var symbol = normalizeStockTicker(target && (target.yahooSymbol || target.symbol || ''));
    if (!symbol) return '';
    return 'stock:' + symbol;
  }

  // Returns the local cache key used for one risk snapshot payload.
  function riskLocalCacheKey(identityKey) {
    var safe = String(identityKey || '').trim();
    if (!safe) return '';
    return RISK_CACHE_LOCAL_KEY_PREFIX + safe;
  }

  // Reads one risk snapshot from local cache.
  function getCachedRiskSnapshot(identityKey) {
    var localKey = riskLocalCacheKey(identityKey);
    if (!localKey) return null;
    return storage.getCached(state.caches, localKey, 0) || getCachedAny(localKey);
  }

  // Persists one risk snapshot to local cache.
  function setCachedRiskSnapshot(identityKey, snapshot) {
    var localKey = riskLocalCacheKey(identityKey);
    if (!localKey || !snapshot || typeof snapshot !== 'object') return;
    storage.setCached(state.caches, localKey, snapshot);
    storage.saveCache(state.caches);
  }

  // Queues a remote risk snapshot fetch once per key and hydrates local cache.
  function ensureRemoteRiskSnapshot(identityKey) {
    var safeKey = String(identityKey || '').trim();
    if (!safeKey || !storage || typeof storage.getRemoteRiskCache !== 'function') return Promise.resolve(null);
    if (RISK_CACHE_REMOTE_LOADED[safeKey]) return Promise.resolve(getCachedRiskSnapshot(safeKey));
    if (RISK_CACHE_IN_FLIGHT[safeKey]) return RISK_CACHE_IN_FLIGHT[safeKey];
    RISK_CACHE_IN_FLIGHT[safeKey] = storage.getRemoteRiskCache(safeKey).then(function (record) {
      RISK_CACHE_REMOTE_LOADED[safeKey] = true;
      if (record && record.snapshot && typeof record.snapshot === 'object') {
        setCachedRiskSnapshot(safeKey, record.snapshot);
        return record.snapshot;
      }
      return null;
    }).catch(function () {
      RISK_CACHE_REMOTE_LOADED[safeKey] = true;
      return null;
    }).finally(function () {
      delete RISK_CACHE_IN_FLIGHT[safeKey];
    });
    return RISK_CACHE_IN_FLIGHT[safeKey];
  }

  // Persists one risk snapshot to remote DB cache.
  function saveRemoteRiskSnapshot(identityKey, snapshot) {
    var safeKey = String(identityKey || '').trim();
    if (!safeKey || !snapshot || typeof snapshot !== 'object' || !storage || typeof storage.saveRemoteRiskCache !== 'function') {
      return Promise.resolve({ ok: false });
    }
    return storage.saveRemoteRiskCache(safeKey, snapshot).catch(function () {
      return { ok: false };
    });
  }

  // Reads one fundamentals panel metric numeric value by metric id.
  function fundamentalsMetricNumber(panel, metricId) {
    var sections = panel && Array.isArray(panel.sections) ? panel.sections : [];
    var wanted = String(metricId || '').trim().toLowerCase();
    if (!wanted) return null;
    for (var i = 0; i < sections.length; i++) {
      var metrics = sections[i] && Array.isArray(sections[i].metrics) ? sections[i].metrics : [];
      for (var j = 0; j < metrics.length; j++) {
        var metric = metrics[j] || {};
        if (String(metric.id || '').trim().toLowerCase() !== wanted) continue;
        return toFiniteNumber(metric.value);
      }
    }
    return null;
  }

  // Extracts stock fundamentals inputs used by the local risk meter.
  function stockRiskFundamentalInputs(panel) {
    return {
      altmanZScore: fundamentalsMetricNumber(panel, 'altman-z'),
      debtToEquity: fundamentalsMetricNumber(panel, 'debt-equity'),
      freeCashFlow: fundamentalsMetricNumber(panel, 'free-cash-flow'),
      revenueGrowthYoY: fundamentalsMetricNumber(panel, 'revenue-growth-yoy'),
      epsGrowthYoY: fundamentalsMetricNumber(panel, 'eps-growth-yoy'),
      nextEarningsDate: String(panel && panel.nextEarningsDate || '').trim()
    };
  }

  // Extracts crypto market/token inputs used by the local risk meter.
  function cryptoRiskMarketInputs(panel) {
    return {
      marketCap: fundamentalsMetricNumber(panel, 'market-cap'),
      fdv: fundamentalsMetricNumber(panel, 'fdv'),
      circulatingSupply: fundamentalsMetricNumber(panel, 'circulating-supply'),
      totalSupply: fundamentalsMetricNumber(panel, 'total-supply'),
      maxSupply: fundamentalsMetricNumber(panel, 'max-supply'),
      volume24h: fundamentalsMetricNumber(panel, 'volume-24h')
    };
  }

  // Ensures one indicator snapshot exists for risk usage (recomputes if needed).
  function resolveIndicatorSnapshotForRisk(targetKey, timeframeKey, context) {
    var candlePayload = getCachedAny(indicatorCandleCacheKey(targetKey, timeframeKey));
    if (!candlePayload || !Array.isArray(candlePayload.candles) || !candlePayload.candles.length) {
      return { candlePayload: null, snapshot: null };
    }
    var computedKey = indicatorComputedCacheKey(targetKey, timeframeKey);
    var computed = getCachedAny(computedKey);
    if (indicatorSnapshotNeedsRecompute(computed, candlePayload)) {
      try {
        computed = computeIndicatorSnapshot(candlePayload.candles, timeframeKey, context || {});
        storage.setCached(state.caches, computedKey, computed);
        storage.saveCache(state.caches);
      } catch (err) {
        computed = null;
      }
    }
    return { candlePayload: candlePayload, snapshot: computed };
  }

  // Builds a deterministic dependency hash for one timeframe risk snapshot.
  function riskDependencyHash(input) {
    var payload = input && typeof input === 'object' ? input : {};
    try {
      return JSON.stringify(payload);
    } catch (err) {
      return String(Date.now());
    }
  }

  // Computes/reuses one risk meter snapshot object for a target + fundamentals panel.
  function resolveRiskMeterSnapshot(identityKey, targetConfig, panel, fetchedAt) {
    if (!(window.PT && window.PT.RiskEngine && typeof window.PT.RiskEngine.computeRiskMeter === 'function')) return null;
    if (!identityKey || !targetConfig || !panel) return null;
    var riskVersion = Number(window.PT.RiskEngine.RISK_VERSION || 1) || 1;
    var existing = getCachedRiskSnapshot(identityKey);
    var output = existing && typeof existing === 'object'
      ? Object.assign({}, existing)
      : { riskVersion: riskVersion, key: identityKey, timeframes: {}, note: '' };
    if (!output.timeframes || typeof output.timeframes !== 'object') output.timeframes = {};
    output.riskVersion = riskVersion;
    output.key = identityKey;
    output.assetType = targetConfig.assetType;
    output.note = 'Risk Meter estimates trading risk using volatility, drawdown, liquidity, market structure, and fundamentals/tokenomics. It is not a prediction.';
    var changed = false;
    var timeframes = ['1d', '1w', '1m'];
    var today = new Date();
    var todayDate = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    for (var i = 0; i < timeframes.length; i++) {
      var tf = timeframes[i];
      var slot = resolveIndicatorSnapshotForRisk(targetConfig.cacheKey, tf, {
        assetType: targetConfig.assetType,
        assetKey: targetConfig.cacheKey,
        symbol: targetConfig.symbol
      });
      var candlePayload = slot.candlePayload;
      var indicatorSnapshot = slot.snapshot;
      var dep = {
        riskVersion: riskVersion,
        targetKey: targetConfig.cacheKey,
        timeframe: tf,
        latestCandleTime: candlePayload && candlePayload.latestCandleTime ? String(candlePayload.latestCandleTime) : '',
        candleCount: candlePayload && Array.isArray(candlePayload.candles) ? candlePayload.candles.length : 0,
        fundamentalsFetchedAt: Number(fetchedAt || 0) || 0,
        nextEarningsDate: targetConfig.assetType === 'stock' ? String(panel.nextEarningsDate || '') : '',
        trendLabel: indicatorSnapshot && indicatorSnapshot.trendMeter ? String(indicatorSnapshot.trendMeter.label || '') : '',
        trendScore: indicatorSnapshot && indicatorSnapshot.trendMeter ? Number(indicatorSnapshot.trendMeter.timeframeScore || 0) : 0,
        adx14: indicatorSnapshot && indicatorSnapshot.values ? Number(indicatorSnapshot.values.adx14 || 0) : 0,
        fibStatus: indicatorSnapshot && indicatorSnapshot.values && indicatorSnapshot.values.fib
          ? String(indicatorSnapshot.values.fib.status || '')
          : '',
        marketCap: targetConfig.assetType === 'crypto' ? fundamentalsMetricNumber(panel, 'market-cap') : null,
        fdv: targetConfig.assetType === 'crypto' ? fundamentalsMetricNumber(panel, 'fdv') : null,
        volume24h: targetConfig.assetType === 'crypto' ? fundamentalsMetricNumber(panel, 'volume-24h') : null
      };
      var depHash = riskDependencyHash(dep);
      var prev = output.timeframes[tf];
      if (prev && String(prev.dependencyHash || '') === depHash && Number(prev.riskVersion || 0) === riskVersion) {
        continue;
      }
      var result = null;
      if (candlePayload && Array.isArray(candlePayload.candles) && candlePayload.candles.length >= 25) {
        result = window.PT.RiskEngine.computeRiskMeter(
          targetConfig.assetType,
          tf,
          {
            candles: candlePayload.candles,
            indicator: {
              trendLabel: indicatorSnapshot && indicatorSnapshot.trendMeter ? indicatorSnapshot.trendMeter.label : '',
              trendScore: indicatorSnapshot && indicatorSnapshot.trendMeter ? indicatorSnapshot.trendMeter.timeframeScore : 0,
              adx14: indicatorSnapshot && indicatorSnapshot.values ? indicatorSnapshot.values.adx14 : null,
              fibStatus: indicatorSnapshot && indicatorSnapshot.values && indicatorSnapshot.values.fib ? indicatorSnapshot.values.fib.status : ''
            },
            fundamentals: targetConfig.assetType === 'stock' ? stockRiskFundamentalInputs(panel) : {},
            marketData: targetConfig.assetType === 'crypto' ? cryptoRiskMarketInputs(panel) : {},
            todayDate: todayDate
          }
        );
      }
      output.timeframes[tf] = Object.assign(
        {},
        result || {
          score: null,
          label: 'n/a',
          components: {},
          reasons: ['Not enough data'],
          latestCandleTimeUsed: candlePayload && candlePayload.latestCandleTime ? String(candlePayload.latestCandleTime) : null,
          computedAt: new Date().toISOString(),
          riskVersion: riskVersion
        },
        {
          dependencyHash: depHash,
          timeframe: tf
        }
      );
      changed = true;
      if (state.app.apiDebugEnabled) {
        try {
          console.debug('[RiskMeter]', identityKey, tf, output.timeframes[tf]);
        } catch (err) {}
      }
    }

    output.updatedAt = Date.now();
    if (changed) {
      setCachedRiskSnapshot(identityKey, output);
      saveRemoteRiskSnapshot(identityKey, output);
    } else if (!existing) {
      setCachedRiskSnapshot(identityKey, output);
    }
    return output;
  }

  // Attaches risk meter data to a fundamentals snapshot panel (main details + explorer).
  function attachRiskMeterToFundamentalsSnapshot(context) {
    var ctx = context && typeof context === 'object' ? context : {};
    var fundamentalsSnapshot = ctx.fundamentalsSnapshot;
    var panel = fundamentalsSnapshot && fundamentalsSnapshot.panel;
    var targetConfig = ctx.targetConfig;
    var identityKey = String(ctx.identityKey || '').trim();
    if (!panel || !targetConfig || !identityKey) return fundamentalsSnapshot;
    var riskSnapshot = resolveRiskMeterSnapshot(identityKey, targetConfig, panel, Number(fundamentalsSnapshot && fundamentalsSnapshot.fetchedAt || 0) || 0);
    if (riskSnapshot) {
      panel.riskMeter = {
        riskVersion: riskSnapshot.riskVersion,
        assetType: targetConfig.assetType,
        key: identityKey,
        updatedAt: riskSnapshot.updatedAt,
        note: riskSnapshot.note,
        timeframes: riskSnapshot.timeframes || {}
      };
    }
    ensureRemoteRiskSnapshot(identityKey).then(function (remoteSnapshot) {
      if (!remoteSnapshot || !remoteSnapshot.timeframes || panel.riskMeter) return;
      panel.riskMeter = {
        riskVersion: Number(remoteSnapshot.riskVersion || 1) || 1,
        assetType: targetConfig.assetType,
        key: identityKey,
        updatedAt: Number(remoteSnapshot.updatedAt || 0) || Date.now(),
        note: String(remoteSnapshot.note || '').trim() || 'Risk Meter estimates trading risk using volatility, drawdown, liquidity, market structure, and fundamentals/tokenomics. It is not a prediction.',
        timeframes: remoteSnapshot.timeframes || {}
      };
      if (typeof ctx.onHydrated === 'function') ctx.onHydrated();
    }).catch(function () {
      return null;
    });
    return fundamentalsSnapshot;
  }

  // Maps provider/proxy error details into concise user-facing fundamentals status text.
  function normalizeFundamentalsErrorMessage(raw) {
    var code = String(raw || '').trim();
    if (!code) return '';
    var lower = code.toLowerCase();
    if (lower === 'fmp_key_missing') return 'FMP API key missing on proxy server. Set FMP_API_KEY in .env and restart.';
    if (lower === 'finnhub_key_missing') return 'Finnhub fallback key missing on proxy server. Set FINNHUB_API_KEY (or FINHUB_API_KEY) and restart.';
    if (lower === 'stock_fundamentals_keys_missing') return 'Stock fundamentals providers are not configured. Set FMP_API_KEY and/or FINNHUB_API_KEY in .env and restart.';
    if (lower.indexOf('stock_fundamentals_unavailable') === 0) {
      var stockParts = code.split(':');
      if (stockParts.length > 1) return 'Stock fundamentals unavailable: ' + stockParts.slice(1).join(':').trim();
      return 'Stock fundamentals are temporarily unavailable. Showing cached data when possible.';
    }
    if (lower.indexOf('crypto_fundamentals_unavailable') === 0) {
      var cryptoParts = code.split(':');
      if (cryptoParts.length > 1) return 'Token fundamentals unavailable: ' + cryptoParts.slice(1).join(':').trim();
      return 'Token fundamentals are temporarily unavailable. Showing cached data when possible.';
    }
    if (lower === 'missing_symbol') return 'Missing stock symbol for fundamentals request.';
    if (lower === 'missing_coin_id') return 'Missing coin id for fundamentals request.';
    if (lower.indexOf('failed to fetch') >= 0 || lower.indexOf('networkerror') >= 0) {
      return 'Could not reach the local proxy server. Check that it is running.';
    }
    if (/^http\s+\d+/.test(lower)) return 'Fundamentals request failed (' + code + ').';
    return code.replace(/_/g, ' ');
  }

  function buildUnavailableFundamentalsPanel(asset, message) {
    var isCrypto = !!(asset && asset.type === 'crypto');
    var safeMessage = String(message || 'Fundamentals unavailable.').trim() || 'Fundamentals unavailable.';
    return {
      title: isCrypto ? 'Token Fundamentals' : 'Fundamentals',
      label: 'n/a',
      qualityLabel: 'n/a',
      valuationLabel: 'n/a',
      qualityScore: 0,
      qualityScoreOutOf: 0,
      score: 0,
      scoreOutOf: 0,
      valuationSummaryText: 'n/a',
      note: safeMessage,
      reasons: [safeMessage],
      reasonGroups: [
        {
          id: 'coverage',
          title: 'Data coverage',
          items: [safeMessage]
        }
      ],
      sections: [
        {
          id: 'coverage',
          title: 'Data Coverage',
          metrics: [
            {
              id: 'fundamentals-coverage',
              label: 'Fundamentals Coverage',
              value: null,
              display: 'n/a',
              status: 'n/a',
              reasonIfUnavailable: safeMessage
            }
          ]
        }
      ]
    };
  }

  // Detects old crypto FA snapshots that predate market-cap band classification.
  function cryptoFundamentalsNeedsMarketCapRefresh(snapshot) {
    var panel = snapshot && snapshot.panel;
    var sections = panel && Array.isArray(panel.sections) ? panel.sections : [];
    if (!sections.length) return false;
    var marketSection = null;
    for (var i = 0; i < sections.length; i++) {
      if (String(sections[i] && sections[i].id || '') === 'market') {
        marketSection = sections[i];
        break;
      }
    }
    if (!marketSection) return false;
    var metrics = Array.isArray(marketSection.metrics) ? marketSection.metrics : [];
    var marketCapMetric = null;
    for (var j = 0; j < metrics.length; j++) {
      if (String(metrics[j] && metrics[j].id || '') === 'market-cap') {
        marketCapMetric = metrics[j];
        break;
      }
    }
    if (!marketCapMetric) return false;
    var hint = String(marketCapMetric.hint || '');
    var status = String(marketCapMetric.status || '');
    var value = Number(marketCapMetric.value);
    // New snapshots include the size-band hint ("• Micro cap" etc).
    if (hint.indexOf('•') < 0) return true;
    // Guard stale classification explicitly for micro-cap values.
    if (isFinite(value) && value > 0 && value < 10000000 && /healthy/i.test(status)) return true;
    return false;
  }

  function newsCacheKeyForAsset(asset) {
    var source = asset.type === 'crypto' ? (state.app.newsSourceCrypto || 'auto') : (state.app.newsSourceStocks || 'marketaux');
    return 'news:' + source + ':' + asset.type + ':' + (asset.coinId || asset.symbol);
  }

  function newsCacheKeyForGeneralStocks() {
    var source = state.app.newsSourceStocks || 'marketaux';
    return 'news:' + source + ':stock:general';
  }

  function orderedNewsSourcesForMode(mode) {
    var assetType = mode === 'crypto' ? 'crypto' : 'stock';
    if (window.PT && window.PT.ApiSources && typeof window.PT.ApiSources.getOrdered === 'function') {
      return (window.PT.ApiSources.getOrdered('news', assetType, state.app.apiSourcePrefs) || []).slice();
    }
    return assetType === 'crypto'
      ? ['tickertick', 'cryptopanic']
      : ['marketaux', 'tickertick', 'alphavantage'];
  }

  function syncNewsSourceSelectForMode(mode) {
    var safeMode = mode === 'crypto' ? 'crypto' : 'stocks';
    var allowed = orderedNewsSourcesForMode(safeMode);
    var preferred = safeMode === 'crypto'
      ? String(state.app.newsSourceCrypto || 'auto').toLowerCase()
      : String(state.app.newsSourceStocks || 'marketaux').toLowerCase();

    if (preferred !== 'auto' && allowed.indexOf(preferred) < 0) {
      preferred = allowed[0] || 'auto';
      if (safeMode === 'crypto') state.app.newsSourceCrypto = preferred;
      else state.app.newsSourceStocks = preferred;
    }

    if (ui && ui.el && ui.el.newsSourceSelect && ui.el.newsSourceSelect.options) {
      Array.prototype.forEach.call(ui.el.newsSourceSelect.options, function (option) {
        var value = String(option && option.value || '').toLowerCase();
        var visible = value === 'auto' || allowed.indexOf(value) >= 0;
        option.hidden = !visible;
        option.disabled = !visible;
      });
      var selected = preferred || 'auto';
      if (selected !== 'auto' && allowed.indexOf(selected) < 0) selected = allowed[0] || 'auto';
      ui.el.newsSourceSelect.value = selected;
      return selected;
    }

    if (ui && typeof ui.setNewsSourceValue === 'function') {
      ui.setNewsSourceValue(preferred || 'auto');
    }
    return preferred || 'auto';
  }

  function escapeRegex(text) {
    return String(text == null ? '' : text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function newestCachedByRegex(regex, maxAgeMs) {
    var caches = state.caches || {};
    var bestData = null;
    var bestTs = 0;
    Object.keys(caches).forEach(function (key) {
      if (!regex.test(String(key || ''))) return;
      var entry = caches[key];
      if (!entry || !Array.isArray(entry.data) || !entry.data.length) return;
      var ts = Number(entry.ts || 0) || 0;
      if (maxAgeMs && (!ts || (Date.now() - ts > maxAgeMs))) return;
      if (ts >= bestTs) {
        bestTs = ts;
        bestData = entry.data;
      }
    });
    return bestData;
  }

  function anySourceNewsCacheForAsset(asset, maxAgeMs) {
    if (!asset) return null;
    var idPart = String(asset.coinId || asset.symbol || '').trim();
    if (!idPart) return null;
    var typePart = asset.type === 'crypto' ? 'crypto' : 'stock';
    var regex = new RegExp('^news:[^:]+:' + typePart + ':' + escapeRegex(idPart) + '$', 'i');
    return newestCachedByRegex(regex, maxAgeMs || 0);
  }

  function anySourceGeneralStocksNewsCache(maxAgeMs) {
    return newestCachedByRegex(/^news:[^:]+:stock:general$/i, maxAgeMs || 0);
  }

  function hasFreshNews(asset, maxAgeMs) {
    if (!asset) return false;
    return !!storage.getCached(state.caches, newsCacheKeyForAsset(asset), maxAgeMs || 0);
  }

  function hydrateAssetNewsFromCache(asset, maxAgeMs) {
    if (!asset) return null;
    var sourcePref = asset.type === 'crypto' ? (state.app.newsSourceCrypto || 'auto') : (state.app.newsSourceStocks || 'marketaux');
    var allowCrossSourceFallback = sourcePref === 'auto';
    var scopedKey = newsCacheKeyForAsset(asset);
    var legacyKey = 'news:' + asset.type + ':' + (asset.coinId || asset.symbol);
    var cached = storage.getCached(state.caches, scopedKey, maxAgeMs || 0) ||
      storage.getCached(state.caches, legacyKey, maxAgeMs || 0) ||
      (allowCrossSourceFallback ? anySourceNewsCacheForAsset(asset, maxAgeMs || 0) : null) ||
      getCachedAny(scopedKey) ||
      getCachedAny(legacyKey) ||
      (allowCrossSourceFallback ? anySourceNewsCacheForAsset(asset, 0) : null);
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

  // Returns the latest history candle date (YYYY-MM-DD) when available.
  function latestHistoryDate(hist) {
    if (!Array.isArray(hist) || hist.length < 1) return '';
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
    if (!rows.length) return '';
    return String(rows[rows.length - 1].t || '');
  }

  // Checks if a YYYY-MM-DD trading date is recent enough to use as a prev-close hint.
  function isHistoryDateRecent(dateText, maxAgeDays) {
    var safe = String(dateText || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) return false;
    var parsed = Date.parse(safe + 'T00:00:00Z');
    if (!isFinite(Number(parsed))) return false;
    var maxDays = Math.max(1, Number(maxAgeDays || 1) || 1);
    var ageMs = Date.now() - Number(parsed);
    if (ageMs < 0) return false;
    return ageMs <= (maxDays * 24 * 60 * 60 * 1000);
  }

  function getStockPrevCloseHint(asset) {
    if (!asset || asset.type !== 'stock') return null;
    var quote = state.market.stocks[asset.id] || getCachedAny(stockQuoteCacheKey(asset));
    var hist = state.history.stocks[asset.id] || getCachedAny('hist:stock:' + (asset.stooqSymbol || asset.symbol));
    var inferred = inferPrevCloseFromHistory(hist, quote && quote.date);
    var latestHist = latestHistoryDate(hist);
    if (inferred && inferred > 0 && isHistoryDateRecent(latestHist, PREV_CLOSE_HINT_HISTORY_MAX_AGE_DAYS)) return inferred;

    var prev = quote && isFinite(Number(quote.regularMarketPreviousClose)) ? Number(quote.regularMarketPreviousClose)
      : (quote && isFinite(Number(quote.previous_close)) ? Number(quote.previous_close) : null);
    var quoteFetchedAt = quote && isFinite(Number(quote.fetchedAt)) ? Number(quote.fetchedAt) : 0;
    var quoteAgeMs = quoteFetchedAt > 0 ? (Date.now() - quoteFetchedAt) : Number.POSITIVE_INFINITY;
    if (prev && prev > 0 && quoteAgeMs <= PREV_CLOSE_HINT_FROM_QUOTE_MAX_AGE_MS) return prev;
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
      var fundamentalsKey = fundamentalsCacheKeyForAsset(asset);

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

      var fundamentals = fundamentalsKey ? getCachedAny(fundamentalsKey) : null;
      if (fundamentals) {
        var bucket = fundamentalsBucketForAsset(asset);
        if (bucket) bucket[asset.id] = fundamentals;
      }
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
      scrambleHoldings: !!state.app.scrambleHoldings,
      stocksAutoRefreshEnabled: !!state.app.stocksAutoRefreshEnabled,
      cryptoAutoRefreshEnabled: !!state.app.cryptoAutoRefreshEnabled,
      stocksAutoRefreshIntervalSec: Math.max(15, Number(state.app.stocksAutoRefreshIntervalSec || 600) || 600),
      cryptoAutoRefreshIntervalSec: Math.max(15, Number(state.app.cryptoAutoRefreshIntervalSec || 600) || 600),
      cryptoParticlesEnabled: !!state.app.cryptoParticlesEnabled,
      uiTransparencyEnabled: !!state.app.uiTransparencyEnabled,
      demoModeEnabled: !!state.app.demoModeEnabled,
      apiDebugEnabled: !!state.app.apiDebugEnabled,
      apiDebugPanelPosition: normalizeApiDebugPanelPosition(state.app.apiDebugPanelPosition),
      twelveDataEnabled: !!state.app.twelveDataEnabled,
      apiSourcePrefs: state.app.apiSourcePrefs,
      newsScopeStocks: state.app.newsScopeStocks === 'selected' ? 'selected' : 'general',
      sortBy: state.app.sortBy,
      newsSourceStocks: state.app.newsSourceStocks || 'marketaux',
      newsSourceCrypto: state.app.newsSourceCrypto || 'auto',
      allocationModeStocks: state.app.allocationModeStocks === 'sectors' ? 'sectors' : 'stocks',
      detailChartTimeframeStocks: state.app.detailChartTimeframeStocks || '1M',
      detailChartTimeframeCrypto: state.app.detailChartTimeframeCrypto || '1M',
      explorerChartTimeframeStocks: state.app.explorerChartTimeframeStocks || '1M',
      explorerChartTimeframeCrypto: state.app.explorerChartTimeframeCrypto || '1M',
      mode: state.app.mode,
      selectedKey: state.app.selectedKey,
      selectedStocksKey: state.app.selectedStocksKey || null,
      selectedCryptoKey: state.app.selectedCryptoKey || null,
      indicatorExplorerFavoritesSort: {
        key: normalizeIndicatorExplorerFavoritesSortKey(INDICATOR_EXPLORER && INDICATOR_EXPLORER.favoritesSort && INDICATOR_EXPLORER.favoritesSort.key),
        dir: normalizeIndicatorExplorerFavoritesSortDir(INDICATOR_EXPLORER && INDICATOR_EXPLORER.favoritesSort && INDICATOR_EXPLORER.favoritesSort.dir)
      }
    };
  }

  // Builds export payload for explorer state (favorites + favorites sort).
  function buildIndicatorExplorerExportPayload() {
    return {
      favorites: normalizeIndicatorExplorerFavorites(INDICATOR_EXPLORER && INDICATOR_EXPLORER.favorites),
      favoritesSort: {
        key: normalizeIndicatorExplorerFavoritesSortKey(INDICATOR_EXPLORER && INDICATOR_EXPLORER.favoritesSort && INDICATOR_EXPLORER.favoritesSort.key),
        dir: normalizeIndicatorExplorerFavoritesSortDir(INDICATOR_EXPLORER && INDICATOR_EXPLORER.favoritesSort && INDICATOR_EXPLORER.favoritesSort.dir)
      }
    };
  }

  // Restores exported explorer state and syncs favorites to local cache/remote store.
  function applyImportedIndicatorExplorerPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    var explorerPayload = payload.explorer && typeof payload.explorer === 'object' ? payload.explorer : null;
    var rawFavorites = payload.explorerFavorites || payload.indicatorExplorerFavorites || (explorerPayload && explorerPayload.favorites) || null;
    if (rawFavorites && typeof rawFavorites === 'object') {
      var normalizedFavorites = normalizeIndicatorExplorerFavorites(rawFavorites);
      INDICATOR_EXPLORER.favorites = normalizedFavorites;
      INDICATOR_EXPLORER.favoritesLoaded = hasIndicatorExplorerFavorites(normalizedFavorites);
      saveIndicatorExplorerFavoritesToLocalCache(normalizedFavorites);
      saveIndicatorExplorerFavoritesToRemote();
    }
    var rawSort = payload.explorerFavoritesSort || payload.indicatorExplorerFavoritesSort || (explorerPayload && explorerPayload.favoritesSort) || null;
    if (rawSort && typeof rawSort === 'object') {
      INDICATOR_EXPLORER.favoritesSort = {
        key: normalizeIndicatorExplorerFavoritesSortKey(rawSort.key),
        dir: normalizeIndicatorExplorerFavoritesSortDir(rawSort.dir)
      };
    }
  }

  // Persists settings, cache, and the shared portfolio to their respective stores.
  function persist() {
    var demoModeActive = !!(state && state.app && state.app.demoModeEnabled);
    var settingsPayload = buildSettingsPayload();
    var portfolioPayload = demoModeActive ? null : buildPortfolioPersistencePayload();

    // localStorage quota can be exhausted by cached history/news; never let that block portfolio autosave.
    var portfolioOk = demoModeActive ? true : storage.savePortfolio(portfolioPayload);
    var settingsOk = storage.saveSettings(settingsPayload);

    if (!portfolioOk || !settingsOk) {
      // Drop cache payload and retry critical data first.
      storage.saveCache({});
      state.caches = {};
      portfolioOk = demoModeActive ? true : storage.savePortfolio(portfolioPayload);
      settingsOk = storage.saveSettings(settingsPayload);
    }

    // Cache is best-effort only.
    storage.saveCache(state.caches);
    if (demoModeActive) return;
    if (typeof storage.saveRemotePortfolio === 'function') {
      storage.saveRemotePortfolio(portfolioPayload, PORTFOLIO_REMOTE_REV).then(function (result) {
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

  // Returns display name for the active portfolio in a mode.
  function activePortfolioNameForMode(mode) {
    var active = activePortfolioRecordForMode(mode);
    return String(active && active.name || 'Main');
  }

  // Renders the topbar portfolio selector for the active mode.
  function renderPortfolioSelector() {
    if (!ui || !ui.el || !ui.el.portfolioSelect) return;
    var modeKey = state.app.mode === 'crypto' ? 'crypto' : 'stocks';
    var list = portfoliosForMode(modeKey);
    var activeId = activePortfolioIdForMode(modeKey) || (list[0] && list[0].id) || 'main';
    var addValue = '__add_portfolio__';
    var demoModeActive = !!(state && state.app && state.app.demoModeEnabled);
    ui.el.portfolioSelect.innerHTML = list.map(function (portfolio) {
      var idText = String(portfolio && portfolio.id || '');
      var nameText = String(portfolio && portfolio.name || 'Portfolio').trim() || 'Portfolio';
      return '<option value="' + escapeHtml(idText) + '">' + escapeHtml(nameText) + '</option>';
    }).join('') + '<option value="' + addValue + '">+ Add Portfolio</option>';
    ui.el.portfolioSelect.value = activeId;
    ui.el.portfolioSelect.disabled = demoModeActive;
    ui.el.portfolioSelect.title = demoModeActive
      ? 'Portfolio selector is disabled while demo mode is active'
      : 'Choose active ' + (modeKey === 'crypto' ? 'crypto' : 'stocks') + ' portfolio';
    if (ui.el.portfolioDeleteBtn) {
      var disabled = demoModeActive || list.length <= 1;
      ui.el.portfolioDeleteBtn.disabled = disabled;
      ui.el.portfolioDeleteBtn.title = disabled
        ? (demoModeActive
          ? 'Portfolio delete is disabled while demo mode is active'
          : 'Cannot delete the only portfolio')
        : ('Delete portfolio "' + activePortfolioNameForMode(modeKey) + '"');
    }
  }

  // Switches active portfolio for a mode and rebinds state.portfolio arrays.
  function switchActivePortfolio(mode, portfolioId, options) {
    var modeKey = mode === 'crypto' ? 'crypto' : 'stocks';
    var opts = options && typeof options === 'object' ? options : {};
    if (!opts.skipSyncFromFlat) syncActiveCollectionsFromPortfolioArrays();
    setActivePortfolioIdForMode(modeKey, portfolioId);
    syncPortfolioArrayFromCollections(modeKey);
    normalizeImportedAssets();
    hydrateCachedData();
    hydrateIndicatorsFromCache();
    setStoredSelectionForMode(modeKey, null);
    if (state.app.mode === modeKey) state.app.selectedKey = null;
    renderAll();
  }

  // Creates an empty portfolio record and makes it the active portfolio for the mode.
  function createPortfolioForMode(mode, name) {
    var modeKey = mode === 'crypto' ? 'crypto' : 'stocks';
    var safeName = String(name || '').trim();
    if (!safeName) return false;
    syncActiveCollectionsFromPortfolioArrays();
    var list = portfoliosForMode(modeKey);
    var newId = id();
    list.push({
      id: newId,
      name: safeName,
      assets: []
    });
    switchActivePortfolio(modeKey, newId);
    setStatus('Created portfolio "' + safeName + '"');
    return true;
  }

  // Opens the in-app portfolio naming modal for the target mode.
  function openPortfolioNameModal(mode) {
    if (!ui || !ui.el || !ui.el.portfolioNameModal) return;
    var modeKey = mode === 'crypto' ? 'crypto' : 'stocks';
    var suggestedName = 'Portfolio ' + (portfoliosForMode(modeKey).length + 1);
    PORTFOLIO_CREATE_MODE = modeKey;
    renderPortfolioSelector();
    ui.openPortfolioNameModal(modeKey, suggestedName);
  }

  // Closes the portfolio naming modal and clears pending create context.
  function closePortfolioNameModal() {
    PORTFOLIO_CREATE_MODE = null;
    if (!ui || !ui.el || !ui.el.portfolioNameModal) return;
    ui.closePortfolioNameModal();
    renderPortfolioSelector();
  }

  // Validates and submits the portfolio naming modal form.
  function submitPortfolioNameModal() {
    if (!PORTFOLIO_CREATE_MODE || !ui || !ui.el || !ui.el.portfolioNameInput) {
      closePortfolioNameModal();
      return;
    }
    var name = String(ui.el.portfolioNameInput.value || '').trim();
    if (!name) {
      ui.el.portfolioNameInput.focus();
      return;
    }
    var modeKey = PORTFOLIO_CREATE_MODE;
    closePortfolioNameModal();
    createPortfolioForMode(modeKey, name);
  }

  // Opens the portfolio create modal in current mode.
  function addPortfolioForMode(mode) {
    openPortfolioNameModal(mode);
  }

  // Closes the delete-portfolio confirmation modal and resolves the pending decision.
  function closePortfolioDeleteModal(confirmed) {
    var resolver = PORTFOLIO_DELETE_CONFIRM.pending;
    PORTFOLIO_DELETE_CONFIRM.pending = null;
    PORTFOLIO_DELETE_CONFIRM.mode = 'stocks';
    PORTFOLIO_DELETE_CONFIRM.name = '';
    PORTFOLIO_DELETE_CONFIRM.assetCount = 0;
    if (ui && ui.el && ui.el.portfolioDeleteModal) {
      ui.el.portfolioDeleteModal.classList.add('hidden');
      ui.el.portfolioDeleteModal.setAttribute('aria-hidden', 'true');
    }
    if (typeof resolver === 'function') resolver(!!confirmed);
  }

  // Opens a styled delete-portfolio confirmation modal.
  function requestPortfolioDeleteConfirmation(mode, name, assetCount) {
    var modeKey = mode === 'crypto' ? 'crypto' : 'stocks';
    var safeName = String(name || 'this portfolio').trim() || 'this portfolio';
    var count = Math.max(0, Number(assetCount) || 0);
    if (!ui || !ui.el || !ui.el.portfolioDeleteModal) {
      return Promise.resolve(window.confirm('Delete portfolio "' + safeName + '"? This removes its assets only.'));
    }
    if (typeof PORTFOLIO_DELETE_CONFIRM.pending === 'function') {
      closePortfolioDeleteModal(false);
    }
    PORTFOLIO_DELETE_CONFIRM.mode = modeKey;
    PORTFOLIO_DELETE_CONFIRM.name = safeName;
    PORTFOLIO_DELETE_CONFIRM.assetCount = count;
    if (ui.el.portfolioDeleteModeLabel) {
      ui.el.portfolioDeleteModeLabel.textContent = (modeKey === 'crypto' ? 'Crypto' : 'Stocks') + ' portfolio';
    }
    if (ui.el.portfolioDeleteModalMessage) {
      ui.el.portfolioDeleteModalMessage.textContent =
        'Delete "' + safeName + '"? This removes ' + count + ' asset' + (count === 1 ? '' : 's') + ' from this portfolio only.';
    }
    ui.el.portfolioDeleteModal.classList.remove('hidden');
    ui.el.portfolioDeleteModal.setAttribute('aria-hidden', 'false');
    if (ui.el.portfolioDeleteConfirmBtn) ui.el.portfolioDeleteConfirmBtn.focus();
    return new Promise(function (resolve) {
      PORTFOLIO_DELETE_CONFIRM.pending = resolve;
    });
  }

  // Deletes active portfolio in a mode after confirmation; keeps at least one portfolio.
  function deleteActivePortfolioForMode(mode) {
    var modeKey = mode === 'crypto' ? 'crypto' : 'stocks';
    var list = portfoliosForMode(modeKey);
    if (list.length <= 1) {
      window.alert('At least one portfolio must remain.');
      return;
    }
    var active = activePortfolioRecordForMode(modeKey);
    var name = String(active && active.name || 'this portfolio');
    var assetCount = Array.isArray(active && active.assets) ? active.assets.length : 0;
    requestPortfolioDeleteConfirmation(modeKey, name, assetCount).then(function (ok) {
      if (!ok) return;
      syncActiveCollectionsFromPortfolioArrays();
      var activeId = String(active && active.id || '');
      var filtered = list.filter(function (item) { return String(item.id) !== activeId; });
      state.portfolioCollections[modeKey] = filtered;
      var next = filtered[0];
      switchActivePortfolio(modeKey, next && next.id, { skipSyncFromFlat: true });
      setStatus('Deleted portfolio "' + name + '"');
    });
  }

  // Returns cached overall indicator summary (label + score) for an asset row.
  function indicatorSummaryForAsset(asset) {
    var target = indicatorTargetFromAsset(asset);
    if (!target) return { label: 'n/a', score: null };
    var targetKey = target.cacheKey || indicatorTargetKey(target);
    if (!targetKey) return { label: 'n/a', score: null };
    var timeframes = {};
    ['1d', '1w', '1m'].forEach(function (timeframeKey) {
      var snapshot = getCachedAny(indicatorComputedCacheKey(targetKey, timeframeKey));
      if (snapshot && snapshot.trendMeter) timeframes[timeframeKey] = snapshot;
    });
    if (!Object.keys(timeframes).length) return { label: 'n/a', score: null };
    if (window.PT && window.PT.IndicatorEngine && typeof window.PT.IndicatorEngine.summarizeByTimeframe === 'function') {
      var summary = window.PT.IndicatorEngine.summarizeByTimeframe(timeframes) || {};
      if (summary && summary.overall) {
        return {
          label: String(summary.overall),
          score: isFinite(Number(summary.weightedScore)) ? Number(summary.weightedScore) : null
        };
      }
    }
    var fallback = timeframes['1m'] || timeframes['1w'] || timeframes['1d'];
    var fallbackLabel = fallback && fallback.trendMeter && fallback.trendMeter.label;
    return {
      label: fallbackLabel ? String(fallbackLabel) : 'n/a',
      score: fallback && isFinite(Number(fallback.score)) ? Number(fallback.score) : null
    };
  }

  function tradePlanZoneMid(low, high) {
    var zoneLow = Number(low);
    var zoneHigh = Number(high);
    if (!isFinite(zoneLow) || !isFinite(zoneHigh) || zoneLow <= 0 || zoneHigh <= 0 || zoneHigh < zoneLow) return null;
    return (zoneLow + zoneHigh) / 2;
  }

  function tradeTargetSignalForAsset(asset, currentPrice) {
    var price = Number(currentPrice);
    if (!asset || !(price > 0)) return null;
    var target = indicatorTargetFromAsset(asset);
    if (!target) return null;
    var targetKey = target.cacheKey || indicatorTargetKey(target);
    if (!targetKey) return null;
    var ranked = [
      { key: '1m', label: '1M', coins: 3 },
      { key: '1w', label: '1W', coins: 2 },
      { key: '1d', label: '1D', coins: 1 }
    ];
    for (var i = 0; i < ranked.length; i++) {
      var tf = ranked[i];
      var snapshot = getCachedAny(indicatorComputedCacheKey(targetKey, tf.key));
      var plan = snapshot && snapshot.values && snapshot.values.tradePlan ? snapshot.values.tradePlan : null;
      var targetMid = tradePlanZoneMid(plan && plan.takeProfitZoneLow, plan && plan.takeProfitZoneHigh);
      if (!(targetMid > 0)) continue;
      var diffPct = ((targetMid - price) / price) * 100;
      if (diffPct <= 5) {
        return {
          coins: tf.coins,
          timeframe: tf.key,
          timeframeLabel: tf.label,
          targetMid: targetMid,
          diffPct: diffPct,
          aboveTarget: diffPct <= 0
        };
      }
    }
    return null;
  }

  // Returns cached overall indicator conclusion label for an asset row, if available.
  function indicatorOverallStatusForAsset(asset) {
    return indicatorSummaryForAsset(asset).label;
  }

  // Returns cached fundamentals quality label for an asset row, if available.
  function fundamentalsQualityStatusForAsset(asset) {
    var snapshot = getFundamentalsSnapshot(asset);
    if (!snapshot) {
      var cacheKey = fundamentalsCacheKeyForAsset(asset);
      snapshot = cacheKey ? getCachedAny(cacheKey) : null;
    }
    var panel = snapshot && snapshot.panel ? snapshot.panel : null;
    if (!panel) return 'n/a';
    var quality = String(panel.qualityLabel || panel.label || '').trim();
    return quality || 'n/a';
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
      var tradeTargetSignal = tradeTargetSignalForAsset(asset, calc.price);
      return Object.assign({}, asset, calc, {
        indicatorConclusion: indicatorOverallStatusForAsset(asset),
        qualityOverall: fundamentalsQualityStatusForAsset(asset),
        tradeTargetSignal: tradeTargetSignal
      });
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
      if (value == null) return 'n/a';
      if (typeof value === 'string' && !value.trim()) return 'n/a';
      var numValue = Number(value);
      if (!isFinite(numValue)) return 'n/a';
      var abs = Math.abs(numValue);
      var digits = abs >= 1000 ? 2 : (abs >= 100 ? 2 : (abs >= 1 ? 3 : 4));
      return numValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
    }

    function techBlock(title, status, metrics, note, noteClass) {
      var list = Array.isArray(metrics) ? metrics : [];
      var count = list.length <= 1 ? 1 : (list.length === 2 ? 2 : 3);
      var helpText = indicatorHelpText(title);
      var meta = note ? ('<span class="indicator-tech__meta' + (noteClass ? (' ' + escapeHtml(noteClass)) : '') + '">• ' + escapeHtml(note) + '</span>') : '';
      return '<div class="indicator-tech">' +
        '<div class="indicator-tech__head">' +
          '<div class="indicator-tech__title-wrap"><div class="indicator-tech__title" tabindex="0" data-help-tooltip="' + escapeHtml(helpText) + '" aria-label="' + escapeHtml(title + ' explanation') + '">' + escapeHtml(title) + '</div>' + meta + '</div>' +
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
      if (value == null) return 'n/a';
      if (typeof value === 'string' && !value.trim()) return 'n/a';
      var n = Number(value);
      return isFinite(n) ? ui.pctText(n) : 'n/a';
    }

    function fmtPctAbsolute(value) {
      if (value == null) return 'n/a';
      if (typeof value === 'string' && !value.trim()) return 'n/a';
      var n = Number(value);
      if (!isFinite(n)) return 'n/a';
      return Math.abs(n).toFixed(2) + '%';
    }

    function asScore(value) {
      var n = Number(value);
      return isFinite(n) ? n : 0;
    }

    function fmtTiny(value) {
      if (value == null) return 'n/a';
      if (typeof value === 'string' && !value.trim()) return 'n/a';
      var n = Number(value);
      if (!isFinite(n)) return 'n/a';
      return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
    }

    function trendLabelFromScore(score) {
      if (score >= 3) return 'Bullish';
      if (score <= -3) return 'Bearish';
      return 'Neutral';
    }

    function indicatorHelpText(title) {
      var byTitle = {
        'Trend Meter': 'Trend Meter: A simple trend score. It combines moving averages, RSI, MACD, support/resistance, ADX, and volume across timeframes. Higher is usually stronger.',
        'Support & Resistance': 'Support & Resistance: Support is where price often finds buyers. Resistance is where price often finds sellers. These are common bounce or rejection zones.',
        'EMA Trend': 'EMA Trend: Compares the 20, 50, and 200 moving averages to show if trend direction is mostly up, down, or mixed.',
        'RSI 14': 'RSI 14: Momentum gauge from 0 to 100. Above 70 can mean overbought, below 30 can mean oversold.',
        'MACD': 'MACD: Momentum trend signal. When MACD is above its signal line, momentum is improving; below can mean weakening momentum.',
        'Bollinger': 'Bollinger: A moving average with upper/lower bands. Price near outer bands can mean price is stretched.',
        'ADX 14': 'ADX 14: Trend strength only (not direction). Higher ADX means a stronger trend; low ADX often means choppy/sideways action.',
        'Volume Confirm': 'Volume Confirm: Checks if move strength is supported by trading volume. Strong moves are more reliable when volume is above normal.',
        'Fibonacci': 'Fibonacci: Common pullback levels traders watch (23.6, 38.2, 50, 61.8, 78.6) for possible support or resistance.',
        'EMA Position': 'EMA Position: Shows where price is vs EMA20 and EMA50 to spot strength, pullback, or weakness.',
        'Reversal': 'Reversal: Estimates chance of a bounce after weakness using oversold signals, support, momentum shift, and volume.',
        'Trade Plan': 'Trade Plan: Suggested entry, take-profit, and failure-exit zones from indicator confluence. For planning only, not guaranteed.'
      };
      return byTitle[String(title || '').trim()] || 'Quick indicator summary used to understand trend, momentum, and risk.';
    }

    function trendMeterBlock() {
      var provided = (config && config.trendMeter) || {};
      var hasAny = ['1d', '1w', '1m'].some(function (key) { return !!timeframes[key]; });
      if (!hasAny) return '<div class="muted">No trend meter yet. Refresh Prices.</div>';
      var rows = {};
      var weights = { '1d': 1, '1w': 2, '1m': 3 };
      var weighted = 0;
      ['1d', '1w', '1m'].forEach(function (key) {
        var tf = timeframes[key] || {};
        var trend = tf.trendMeter || {};
        var score = asScore(trend.timeframeScore);
        weighted += score * weights[key];
        rows[key] = {
          score: score,
          label: trend.label || trendLabelFromScore(score),
          breakdown: trend.breakdown || null
        };
      });
      var overallScore = isFinite(Number(provided.overallScore)) ? Number(provided.overallScore) : weighted;
      var rowHtml = ['1d', '1w', '1m'].map(function (key) {
        var row = rows[key];
        var b = row.breakdown || {};
        return '<details class="trend-meter__item">' +
          '<summary>' +
            '<span class="trend-meter__tf">' + escapeHtml(String(key).toUpperCase()) + '</span>' +
            '<span class="trend-meter__score">Score ' + escapeHtml(String(row.score)) + '</span>' +
            '<span class="' + pillClass(row.label) + '">' + escapeHtml(row.label) + '</span>' +
          '</summary>' +
          '<div class="trend-meter__details">' +
            '<span>EMA ' + escapeHtml(String(asScore(b.emaScore))) + ' • close ' + escapeHtml(fmtTiny(b.close)) + ' • 20 ' + escapeHtml(fmtTiny(b.ema20)) + ' • 50 ' + escapeHtml(fmtTiny(b.ema50)) + ' • 200 ' + escapeHtml(fmtTiny(b.ema200)) + '</span>' +
            '<span>RSI ' + escapeHtml(String(asScore(b.rsiScore))) + ' • value ' + escapeHtml(fmtTiny(b.rsiValue)) + '</span>' +
            '<span>MACD ' + escapeHtml(String(asScore(b.macdScore))) + ' • line ' + escapeHtml(fmtTiny(b.macdLine)) + ' • signal ' + escapeHtml(fmtTiny(b.macdSignal)) + ' • hist ' + escapeHtml(fmtTiny(b.macdHistogram)) + '</span>' +
            '<span>SR ' + escapeHtml(String(asScore(b.srScore))) + ' • ' + escapeHtml(String(b.srStatus || 'n/a')) + '</span>' +
            '<span>ADX ' + escapeHtml(String(asScore(b.adxScore))) + ' • value ' + escapeHtml(fmtTiny(b.adxValue)) + ' • ' + escapeHtml(String(b.adxStatus || 'n/a')) + '</span>' +
            '<span>VOL ' + escapeHtml(String(asScore(b.volumeScore))) + ' • vol ' + escapeHtml(fmtTiny(b.currentVolume)) + ' • MA20 ' + escapeHtml(fmtTiny(b.volumeMA20)) + ' • ' + escapeHtml(String(b.volumeStatus || 'n/a')) + '</span>' +
          '</div>' +
        '</details>';
      }).join('');
      return '<div class="trend-meter__head">' +
        '<div class="trend-meter__title" tabindex="0" data-help-tooltip="' + escapeHtml(indicatorHelpText('Trend Meter')) + '" aria-label="Trend Meter explanation">Trend Meter</div>' +
        '<div class="trend-meter__overall">' +
          '<span class="trend-meter__overall-score">Overall Score ' + escapeHtml(String(overallScore)) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="trend-meter__rows">' + rowHtml + '</div>';
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
          '<div class="indicator-sr__title" tabindex="0" data-help-tooltip="' + escapeHtml(indicatorHelpText('Support & Resistance')) + '" aria-label="Support and resistance explanation">Support &amp; Resistance</div>' +
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

    function fibPillClass(label) {
      var normalized = String(label || '').toLowerCase();
      if (normalized === 'strong trend') return 'indicator-pill indicator-pill--bullish';
      if (normalized === 'normal pullback') return 'indicator-pill indicator-pill--pullback';
      if (normalized === 'deep retracement') return 'indicator-pill indicator-pill--neutral';
      if (normalized === 'structure failure') return 'indicator-pill indicator-pill--bearish';
      return 'indicator-pill indicator-pill--neutral';
    }

    function fibBlock(tf) {
      var values = tf && tf.values ? tf.values : {};
      var fib = values.fib || {};
      if (!fib.available) {
        return '<div class="indicator-tech indicator-tech--fib">' +
          '<div class="indicator-tech__head">' +
            '<div class="indicator-tech__title-wrap"><div class="indicator-tech__title" tabindex="0" data-help-tooltip="' + escapeHtml(indicatorHelpText('Fibonacci')) + '" aria-label="Fibonacci explanation">Fibonacci</div></div>' +
            '<span class="indicator-pill indicator-pill--neutral">Not enough data</span>' +
          '</div>' +
          '<div class="indicator-tech__note">' + escapeHtml(fib.reason || 'Not enough data') + '</div>' +
        '</div>';
      }
      var levels = fib.levels || {};
      var status = fib.status || 'Not enough data';
      var levelsHtml = [
        { label: '23.6%', key: 'fib236' },
        { label: '38.2%', key: 'fib382' },
        { label: '50.0%', key: 'fib500' },
        { label: '61.8%', key: 'fib618' },
        { label: '78.6%', key: 'fib786' }
      ].map(function (entry) {
        return '<div class="indicator-sr__metric">' +
          '<span>' + escapeHtml(entry.label) + '</span>' +
          '<strong>' + escapeHtml(fmtIndicator(levels[entry.key])) + '</strong>' +
        '</div>';
      }).join('');
      var supportTone = isFinite(Number(fib.nearestFibBelow)) ? ' indicator-sr__metric--support' : '';
      var resistanceTone = isFinite(Number(fib.nearestFibAbove)) ? ' indicator-sr__metric--resistance' : '';
      return '<div class="indicator-sr indicator-fib">' +
        '<div class="indicator-sr__head">' +
          '<div class="indicator-sr__title" tabindex="0" data-help-tooltip="' + escapeHtml(indicatorHelpText('Fibonacci')) + '" aria-label="Fibonacci explanation">Fibonacci</div>' +
          '<span class="' + fibPillClass(status) + '">' + escapeHtml(status) + '</span>' +
        '</div>' +
        '<div class="indicator-sr__pivot-grid indicator-fib__levels">' + levelsHtml + '</div>' +
        '<div class="indicator-fib__summary">' +
          '<div class="indicator-sr__metric"><span>Current Price</span><strong>' + escapeHtml(fmtIndicator(fib.currentClose)) + '</strong></div>' +
          '<div class="indicator-sr__metric' + supportTone + '"><span>Nearest Support</span><strong>' + escapeHtml(fmtIndicator(fib.nearestFibBelow)) + '</strong></div>' +
          '<div class="indicator-sr__metric' + resistanceTone + '"><span>Nearest Resistance</span><strong>' + escapeHtml(fmtIndicator(fib.nearestFibAbove)) + '</strong></div>' +
        '</div>' +
        '<div class="indicator-tech__note indicator-fib__note">Distance to nearest: ' + escapeHtml(fmtPctAbsolute(fib.distanceToNearestFibPct)) + '</div>' +
      '</div>';
    }

    function reversalBlock(tf) {
      var reversal = tf && tf.reversal ? tf.reversal : {};
      var score = asScore(reversal.score);
      var label = reversal.label || 'No reversal signal';
      var reasons = Array.isArray(reversal.reasons) ? reversal.reasons : [];
      var hint = reasons.length ? reasons.join(' • ') : 'No qualifying reversal conditions.';
      return '<div class="indicator-tech indicator-tech--reversal">' +
        '<div class="indicator-tech__head">' +
          '<div class="indicator-tech__title-wrap">' +
            '<div class="indicator-tech__title" tabindex="0" data-help-tooltip="' + escapeHtml(indicatorHelpText('Reversal')) + '" aria-label="Reversal explanation">Reversal</div>' +
            '<span class="indicator-tech__meta">• ' + escapeHtml(label) + '</span>' +
          '</div>' +
          '<span class="indicator-reversal__badge">' + escapeHtml(String(score)) + '/5</span>' +
        '</div>' +
        '<div class="indicator-tech__metrics indicator-tech__metrics--2">' +
          '<div class="indicator-sr__metric indicator-tech__metric"><span>Score</span><strong>' + escapeHtml(String(score)) + '/5</strong></div>' +
          '<div class="indicator-sr__metric indicator-tech__metric"><span>Reasons</span><strong>' + escapeHtml(String(reasons.length)) + '</strong></div>' +
        '</div>' +
        '<div class="indicator-tech__note indicator-reversal__reasons">' + escapeHtml(hint) + '</div>' +
      '</div>';
    }

    function emaPositionPillClass(label) {
      var v = String(label || 'Neutral').toLowerCase();
      if (v === 'strong bullish') return 'indicator-pill--bullish';
      if (v === 'bearish risk') return 'indicator-pill--bearish';
      if (v === 'pullback') return 'indicator-pill--pullback';
      if (v === 'trend test') return 'indicator-pill--test';
      return 'indicator-pill--neutral';
    }

    function emaPositionBlock(tf) {
      var ep = (tf && tf.emaPosition) || (tf && tf.values && tf.values.emaPosition) || {};
      var label = String(ep.label || 'Neutral');
      var relation = String(ep.relation || '');
      var toneClass = emaPositionPillClass(label);
      return '<div class="indicator-tech indicator-tech--ema-position">' +
        '<div class="indicator-tech__head">' +
          '<div class="indicator-tech__title-wrap"><div class="indicator-tech__title" tabindex="0" data-help-tooltip="' + escapeHtml(indicatorHelpText('EMA Position')) + '" aria-label="EMA position explanation">EMA Position</div>' + (relation ? '<span class="indicator-tech__meta">• ' + escapeHtml(relation) + '</span>' : '') + '</div>' +
          '<span class="indicator-pill indicator-ema-position__badge ' + toneClass + '">' + escapeHtml(label) + '</span>' +
        '</div>' +
        '<div class="indicator-tech__metrics indicator-tech__metrics--3 indicator-ema-position__values">' +
          '<div class="indicator-sr__metric indicator-tech__metric"><span>Close</span><strong>' + escapeHtml(fmtIndicator(ep.close)) + '</strong></div>' +
          '<div class="indicator-sr__metric indicator-tech__metric"><span>EMA20</span><strong>' + escapeHtml(fmtIndicator(ep.ema20)) + '</strong></div>' +
          '<div class="indicator-sr__metric indicator-tech__metric"><span>EMA50</span><strong>' + escapeHtml(fmtIndicator(ep.ema50)) + '</strong></div>' +
        '</div>' +
        (relation ? '<div class="indicator-tech__note indicator-ema-position__relation">' + escapeHtml(relation) + '</div>' : '') +
      '</div>';
    }

    function formatTradeZone(low, high) {
      var zoneLow = Number(low);
      var zoneHigh = Number(high);
      if (!isFinite(zoneLow) || !isFinite(zoneHigh) || zoneLow <= 0 || zoneHigh <= 0 || zoneHigh < zoneLow) return 'No setup';
      var mid = (zoneLow + zoneHigh) / 2;
      var widthPct = mid > 0 ? Math.abs(zoneHigh - zoneLow) / mid : Infinity;
      if (widthPct <= 0.002) return 'around ' + fmtIndicator(mid);
      return fmtIndicator(zoneLow) + ' - ' + fmtIndicator(zoneHigh);
    }

    function tradePlanZoneMid(low, high) {
      var zoneLow = Number(low);
      var zoneHigh = Number(high);
      if (!isFinite(zoneLow) || !isFinite(zoneHigh) || zoneLow <= 0 || zoneHigh <= 0 || zoneHigh < zoneLow) return null;
      return (zoneLow + zoneHigh) / 2;
    }

    function isTradePlanRenderable(plan) {
      var payload = plan || {};
      // Ensure Caution plans are visible with warning
      return payload.available === true;
    }

    function tradeConfidencePillClass(label) {
      var normalized = String(label || '').toLowerCase();
      if (normalized === 'strong' || normalized === 'high') return 'indicator-pill indicator-pill--bullish';
      if (normalized === 'moderate' || normalized === 'medium') return 'indicator-pill indicator-pill--pullback';
      return 'indicator-pill indicator-pill--neutral';
    }

    function friendlyTradeConfidenceLabel(label) {
      var normalized = String(label || '').toLowerCase();
      if (normalized === 'strong' || normalized === 'high') return 'Strong';
      if (normalized === 'moderate' || normalized === 'medium') return 'Moderate';
      return 'Caution';
    }

    function tradePlanBlock(tf) {
      var plan = (tf && tf.tradePlan) || (tf && tf.values && tf.values.tradePlan) || {};
      var planValid = isTradePlanRenderable(plan);
      var entryType = planValid ? String(plan.entryType || 'No setup') : 'No setup';
      var confidence = planValid ? friendlyTradeConfidenceLabel(plan.confidence || 'Caution') : 'Caution';
      var reasons = Array.isArray(plan.reasons) ? plan.reasons : [];
      var entryZone = planValid ? formatTradeZone(plan.entryZoneLow, plan.entryZoneHigh) : 'No setup';
      var takeProfitZone = planValid ? formatTradeZone(plan.takeProfitZoneLow, plan.takeProfitZoneHigh) : 'No clear take-profit zone';
      var failureExitZone = planValid ? formatTradeZone(plan.failureExitZoneLow, plan.failureExitZoneHigh) : 'No clear failure exit';
      var rrValue = planValid ? Number(plan.rr) : NaN;
      var rrText = Number.isFinite(rrValue) ? (rrValue.toFixed(2) + 'x') : 'n/a';
      if (takeProfitZone === 'No setup') takeProfitZone = 'No clear take-profit zone';
      if (failureExitZone === 'No setup') failureExitZone = 'No clear failure exit';
      var planReason = planValid
        ? (reasons.length ? reasons.slice(0, 3).join(' • ') : String(plan.reason || 'No clean confluence setup'))
        : String(plan.reason || 'No setup: invalid zone ordering');
      var hasData = planValid;
      var confidenceText = hasData ? (confidence + ' (' + String(Number(plan.confidencePoints || 0)) + ')') : 'Caution (0)';
      var confidenceNote = hasData
        ? (String(confidence).toLowerCase() === 'caution'
          ? 'Confidence: Caution. Caution: Lower conviction (weaker RR/confluence/momentum) - smaller position recommended'
          : ('Confidence: ' + confidence))
        : 'Confidence: Caution';
      return '<div class="indicator-tech indicator-tech--tradeplan">' +
        '<div class="indicator-tech__head">' +
          '<div class="indicator-tech__title-wrap"><div class="indicator-tech__title" tabindex="0" data-help-tooltip="' + escapeHtml(indicatorHelpText('Trade Plan')) + '" aria-label="Trade plan explanation">Trade Plan</div></div>' +
          '<span class="' + tradeConfidencePillClass(confidence) + '">' + escapeHtml(confidence) + '</span>' +
        '</div>' +
        '<div class="indicator-tech__metrics indicator-tech__metrics--3">' +
          '<div class="indicator-sr__metric indicator-tech__metric"><span>Entry</span><strong>' + escapeHtml(entryZone) + '</strong></div>' +
          '<div class="indicator-sr__metric indicator-tech__metric"><span>Take Profit</span><strong>' + escapeHtml(takeProfitZone) + '</strong></div>' +
          '<div class="indicator-sr__metric indicator-tech__metric"><span>Failure Exit</span><strong>' + escapeHtml(failureExitZone) + '</strong></div>' +
        '</div>' +
        '<div class="indicator-tech__metrics indicator-tech__metrics--3">' +
          '<div class="indicator-sr__metric indicator-tech__metric"><span>Entry Type</span><strong>' + escapeHtml(entryType) + '</strong></div>' +
          '<div class="indicator-sr__metric indicator-tech__metric"><span>Setup Quality</span><strong>' + escapeHtml(confidenceText) + '</strong></div>' +
          '<div class="indicator-sr__metric indicator-tech__metric"><span>RR</span><strong>' + escapeHtml(rrText) + '</strong></div>' +
        '</div>' +
        '<div class="indicator-tech__note">' + escapeHtml(confidenceNote) + '</div>' +
        '<div class="indicator-tech__note indicator-trade-plan__reasons">' + escapeHtml(planReason) + '</div>' +
        '<div class="indicator-tech__note indicator-trade-plan__disclaimer">' + escapeHtml(String(plan.note || 'Estimated entry/exit zones are derived from technical indicator confluence and are not guaranteed.')) + '</div>' +
      '</div>';
    }

    targetEls.assetLabel.textContent = assetLabel;
    if (targetEls.modeLabel) targetEls.modeLabel.textContent = modeLabelText || (mode === 'crypto' ? 'Crypto' : 'Stocks');
    targetEls.meta.textContent = metaText;
    if (targetEls.trendMeter) targetEls.trendMeter.innerHTML = trendMeterBlock();
    targetEls.overallPill.className = pillClass(overall) + ' indicator-pill--overall';
    targetEls.overallPill.textContent = overall;

    targetEls.timeframes.innerHTML = ['1d', '1w', '1m'].map(function (key) {
      var tf = timeframes[key];
      if (!tf) return '';
      hasRows = true;
      var values = tf.values || {};
      var statuses = tf.statuses || {};
      var trend = trendMeta(tf.overall);
      var emaSignal = '↔ Mixed EMA structure';
      var emaSignalClass = 'indicator-tech__note--neutral';
      if (statuses.ema === 'Bullish') {
        emaSignal = '▲ Full bullish EMA stack';
        emaSignalClass = 'indicator-tech__note--up';
      } else if (statuses.ema === 'Bearish') {
        emaSignal = '▽ Full bearish EMA stack';
        emaSignalClass = 'indicator-tech__note--down';
      }
      var macdSignal = 'Line and histogram not aligned';
      var macdSignalClass = 'indicator-tech__note--neutral';
      if (statuses.macd === 'Bullish') {
        macdSignal = 'Line > Signal and Histogram > 0';
        macdSignalClass = 'indicator-tech__note--up';
      } else if (statuses.macd === 'Bearish') {
        macdSignal = 'Line < Signal and Histogram < 0';
        macdSignalClass = 'indicator-tech__note--down';
      }
      var volumeInfo = values.volumeConfirmation || {};
      var volumeSignal = String(volumeInfo.status || 'Neutral');
      var volumeSignalClass = 'indicator-tech__note--neutral';
      if (volumeSignal === 'Bullish confirmation') volumeSignalClass = 'indicator-tech__note--up';
      else if (volumeSignal === 'Bearish confirmation') volumeSignalClass = 'indicator-tech__note--down';
      var adxTrendText = String(values.adxTrend || 'n/a');
      return '<section class="indicator-card">' +
        '<div class="indicator-card__head"><h4>' + escapeHtml(String(key).toUpperCase()) + '</h4><span class="' + escapeHtml(trend.cls) + '" title="' + escapeHtml(trend.label) + '" aria-label="' + escapeHtml(trend.label) + '">' + trend.icon + '</span><span class="' + pillClass(tf.overall) + '">' + escapeHtml(tf.overall || 'Neutral') + '</span></div>' +
        '<div class="indicator-card__rows">' +
          srBlock(tf) +
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
          ], macdSignal, macdSignalClass) +
          techBlock('Bollinger', statuses.bollinger, [
            { label: 'Mid', value: fmtIndicator(values.bbMiddle) },
            { label: 'Upper', value: fmtIndicator(values.bbUpper) },
            { label: 'Lower', value: fmtIndicator(values.bbLower) }
          ], String(values.bollingerPosition || 'n/a')) +
          techBlock('ADX 14', statuses.adx, [
            { label: 'ADX', value: fmtIndicator(values.adx14) },
            { label: '+DI', value: fmtIndicator(values.adxPlusDI) },
            { label: '-DI', value: fmtIndicator(values.adxMinusDI) }
          ], adxTrendText) +
          techBlock('Volume Confirm', statuses.volume, [
            { label: 'Volume', value: fmtIndicator(values.volumeCurrent) },
            { label: 'Vol MA20', value: fmtIndicator(values.volumeMA20) },
            { label: 'Prev Close', value: fmtIndicator(values.prevClose) }
          ], volumeSignal, volumeSignalClass) +
          fibBlock(tf) +
          emaPositionBlock(tf) +
          reversalBlock(tf) +
          tradePlanBlock(tf) +
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
    var fundamentalsEl = ui.el.fundamentalsPanel;
    var newsPanelEl = ui.el.newsPanel;
    var quickSummaryEl = ui.el.mobileQuickSummaryPanel;
    if (!layoutEl || !sidePanelEl || !indicatorsEl || !fundamentalsEl || !newsPanelEl || !quickSummaryEl) return;
    var isMobileLayout = window.matchMedia('(max-width: 1120px)').matches;
    var marketSectionEl = ui.el.marketDataGrid ? ui.el.marketDataGrid.closest('.panel-block') : null;

    if (isMobileLayout) {
      if (marketSectionEl) {
        if (quickSummaryEl.parentElement !== sidePanelEl || quickSummaryEl.previousSibling !== marketSectionEl) {
          sidePanelEl.insertBefore(quickSummaryEl, marketSectionEl.nextSibling);
        }
        if (fundamentalsEl.parentElement !== sidePanelEl || fundamentalsEl.previousSibling !== quickSummaryEl) {
          sidePanelEl.insertBefore(fundamentalsEl, quickSummaryEl.nextSibling);
        }
        if (indicatorsEl.parentElement !== sidePanelEl || indicatorsEl.previousSibling !== fundamentalsEl) {
          sidePanelEl.insertBefore(indicatorsEl, fundamentalsEl.nextSibling);
        }
        if (newsPanelEl.parentElement !== sidePanelEl || newsPanelEl.previousSibling !== indicatorsEl) {
          sidePanelEl.insertBefore(newsPanelEl, indicatorsEl.nextSibling);
        }
      } else {
        if (quickSummaryEl.parentElement !== sidePanelEl) sidePanelEl.insertBefore(quickSummaryEl, sidePanelEl.firstChild);
        if (fundamentalsEl.parentElement !== sidePanelEl || fundamentalsEl.previousSibling !== quickSummaryEl) sidePanelEl.insertBefore(fundamentalsEl, quickSummaryEl.nextSibling);
        if (indicatorsEl.parentElement !== sidePanelEl || indicatorsEl.previousSibling !== fundamentalsEl) sidePanelEl.insertBefore(indicatorsEl, fundamentalsEl.nextSibling);
        if (newsPanelEl.parentElement !== sidePanelEl || newsPanelEl.previousSibling !== indicatorsEl) sidePanelEl.insertBefore(newsPanelEl, indicatorsEl.nextSibling);
      }
      quickSummaryEl.classList.add('mobile-quick-summary--embedded-mobile');
      indicatorsEl.classList.add('indicators-panel--embedded-mobile');
      fundamentalsEl.classList.add('right-panel--embedded-mobile');
      newsPanelEl.classList.add('right-panel--embedded-mobile');
      return;
    }

    quickSummaryEl.classList.remove('mobile-quick-summary--embedded-mobile');
    quickSummaryEl.classList.add('hidden');
    quickSummaryEl.setAttribute('aria-hidden', 'true');
    indicatorsEl.classList.remove('indicators-panel--embedded-mobile');
    fundamentalsEl.classList.remove('right-panel--embedded-mobile');
    newsPanelEl.classList.remove('right-panel--embedded-mobile');
    if (indicatorsEl.parentElement !== layoutEl) {
      layoutEl.insertBefore(indicatorsEl, sidePanelEl.nextSibling);
    }
    if (fundamentalsEl.parentElement !== layoutEl) {
      layoutEl.insertBefore(fundamentalsEl, indicatorsEl.nextSibling);
    } else if (indicatorsEl.nextSibling !== fundamentalsEl) {
      layoutEl.insertBefore(fundamentalsEl, indicatorsEl.nextSibling);
    }
    if (newsPanelEl.parentElement !== layoutEl) {
      layoutEl.insertBefore(newsPanelEl, fundamentalsEl.nextSibling);
    } else if (fundamentalsEl.nextSibling !== newsPanelEl) {
      layoutEl.insertBefore(newsPanelEl, fundamentalsEl.nextSibling);
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
    var scrambleEnabled = !!state.app.scrambleHoldings;
    var scrambleStockDisplays = state.app.mode === 'stocks' && scrambleEnabled;
    ui.setTheme(state.app.theme);
    ui.setLayoutMode(state.app.layoutMode);
    ui.setHoldingsPrivacy(!!state.app.hideHoldings);
    ui.setHoldingsScramble(!!state.app.scrambleHoldings);
    ui.setStocksAutoRefreshToggle(!!state.app.stocksAutoRefreshEnabled, state.app.mode);
    ui.setCryptoAutoRefreshToggle(!!state.app.cryptoAutoRefreshEnabled, state.app.mode);
    ui.setCryptoParticlesToggle(!!state.app.cryptoParticlesEnabled, state.app.mode);
    ui.setUiTransparencyToggle(!!state.app.uiTransparencyEnabled);
    ui.setDemoModeToggle(!!state.app.demoModeEnabled);
    ui.setApiDebugToggle(!!state.app.apiDebugEnabled);
    ui.setApiDebugPanelVisible(!!state.app.apiDebugEnabled);
    syncApiDebugPanelPosition();
    ui.setTwelveDataToggle(!!state.app.twelveDataEnabled);
    ui.setConnectionModeBadge();
    ui.setModeTabs(state.app.mode);
    renderPortfolioSelector();
    syncNewsSourceSelectForMode(state.app.mode);
    ui.setSortValue(state.app.sortBy);
    ui.setAllocationModeToggle(allocationModeStocks(), state.app.mode === 'stocks');
    syncAllocationResetSectorsButtonState();
    var items = getModeComputedItems(state.app.mode);
    ensureValidSelection(state.app.mode, items);
    setStoredSelectionForMode(state.app.mode, state.app.selectedKey);
    var selectedStock = getSelectedAsset('stocks');
    ui.setNewsScopeToggle(
      state.app.mode,
      state.app.newsScopeStocks,
      !!selectedStock,
      selectedStock ? (selectedStock.name || selectedStock.symbol || 'Selected') : 'Selected'
    );
    ui.renderPortfolio({
      mode: state.app.mode,
      items: items,
      selectedKey: state.app.selectedKey,
      hideHoldings: !!state.app.hideHoldings,
      scrambleHoldings: scrambleStockDisplays,
      scrambleSeed: HOLDINGS_SCRAMBLE_SEED
    });
    syncMobileFocusedRowAfterRender();
    ui.renderTotals(getModeTotals(items), !!state.app.hideHoldings, {
      scrambleHoldings: scrambleEnabled,
      scrambleSeed: HOLDINGS_SCRAMBLE_SEED
    });
    renderAllocation(items, { scrambleHoldings: scrambleStockDisplays, scrambleSeed: HOLDINGS_SCRAMBLE_SEED });
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
    if (PANEL_VIEWER.type) renderPanelViewerContent();
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

  // Converts an explorer target into an asset-like object for shared news/fundamentals loaders.
  function explorerAssetFromTarget(target) {
    if (!target) return null;
    if (target.assetType === 'crypto') {
      var baseSymbol = String(target.baseSymbol || target.symbol || '').replace('/USD', '').trim().toUpperCase();
      var coinId = String(target.coinId || target.sourceId || '').trim().toLowerCase();
      if (!baseSymbol && !coinId) return null;
      return {
        id: 'explore-crypto-' + (coinId || baseSymbol.toLowerCase()),
        type: 'crypto',
        symbol: baseSymbol || String(target.symbol || '').replace('/USD', '').trim().toUpperCase(),
        coinId: coinId || null,
        name: String(target.name || baseSymbol || coinId || 'Crypto').trim()
      };
    }
    var symbol = normalizeStockTicker(target && (target.yahooSymbol || target.symbol || ''));
    if (!symbol) return null;
    return {
      id: 'explore-stock-' + symbol,
      type: 'stock',
      symbol: symbol,
      yahooSymbol: symbol,
      stooqSymbol: normalizeStooqSymbol(target.stooqSymbol, symbol) || null,
      market: target.market || 'US',
      name: String(target.name || symbol).trim()
    };
  }

  // Normalizes a favorite note to tweet length.
  function normalizeIndicatorExplorerFavoriteNote(raw) {
    var text = String(raw == null ? '' : raw).replace(/\r\n/g, '\n').trim();
    if (!text) return '';
    return text.slice(0, INDICATOR_EXPLORER_NOTE_MAX_LEN);
  }

  // Returns the inline eye icon markup used by favorites note quick-view buttons.
  function indicatorExplorerNoteEyeIconMarkup() {
    return '' +
      '<span class="btn__icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" focusable="false">' +
          '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
          '<circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
        '</svg>' +
      '</span>';
  }

  // Returns the stable favorite key for one persisted favorite entry.
  function indicatorExplorerFavoriteKeyFromEntry(entry) {
    if (!entry || typeof entry !== 'object') return '';
    if (entry.assetType === 'crypto') {
      var cryptoSymbol = String(entry.symbol || '').trim().toUpperCase();
      return cryptoSymbol ? ('crypto:' + cryptoSymbol) : '';
    }
    var stockSymbol = normalizeStockTicker(entry && (entry.yahooSymbol || entry.symbol || ''));
    return stockSymbol ? ('stock:' + stockSymbol) : '';
  }

  // Normalizes favorites payload into stable stocks/crypto arrays with dedupe.
  function normalizeIndicatorExplorerFavorites(raw) {
    var source = raw && raw.favorites && typeof raw.favorites === 'object' ? raw.favorites : raw;
    var out = { stocks: [], crypto: [] };
    var seenStocks = {};
    var seenCrypto = {};
    var stocks = Array.isArray(source && source.stocks) ? source.stocks : [];
    var crypto = Array.isArray(source && source.crypto) ? source.crypto : [];

    stocks.forEach(function (item) {
      var symbol = normalizeStockTicker(item && (item.yahooSymbol || item.symbol || ''));
      if (!symbol) return;
      var key = 'stock:' + symbol;
      var note = normalizeIndicatorExplorerFavoriteNote(item && item.note);
      if (isFinite(Number(seenStocks[key]))) {
        var existingStock = out.stocks[Number(seenStocks[key])];
        if (existingStock && !existingStock.note && note) existingStock.note = note;
        return;
      }
      seenStocks[key] = out.stocks.length;
      out.stocks.push({
        assetType: 'stock',
        symbol: symbol,
        yahooSymbol: symbol,
        stooqSymbol: normalizeStooqSymbol(item && (item.stooqSymbol || item.stooq), symbol) || null,
        market: String(item && item.market || 'US').trim() || 'US',
        name: String(item && item.name || symbol).trim() || symbol,
        note: note
      });
    });

    crypto.forEach(function (item) {
      var symbol = String(item && item.symbol || '').trim().toUpperCase();
      var coinId = String(item && (item.coinId || item.id) || '').trim().toLowerCase();
      if (!symbol && !coinId) return;
      var normalizedSymbol = symbol || coinId.toUpperCase();
      var key = 'crypto:' + normalizedSymbol;
      var note = normalizeIndicatorExplorerFavoriteNote(item && item.note);
      if (isFinite(Number(seenCrypto[key]))) {
        var existingCrypto = out.crypto[Number(seenCrypto[key])];
        if (existingCrypto && !existingCrypto.note && note) existingCrypto.note = note;
        return;
      }
      seenCrypto[key] = out.crypto.length;
      out.crypto.push({
        assetType: 'crypto',
        symbol: normalizedSymbol,
        coinId: coinId || null,
        name: String(item && item.name || normalizedSymbol).trim() || normalizedSymbol,
        note: note
      });
    });

    return out;
  }

  // Returns true when a favorites payload contains at least one saved item.
  function hasIndicatorExplorerFavorites(payload) {
    var normalized = normalizeIndicatorExplorerFavorites(payload);
    return !!((normalized.stocks && normalized.stocks.length) || (normalized.crypto && normalized.crypto.length));
  }

  // Merges two favorites payloads and deduplicates via normalizer.
  function mergeIndicatorExplorerFavorites(a, b) {
    var left = normalizeIndicatorExplorerFavorites(a);
    var right = normalizeIndicatorExplorerFavorites(b);
    return normalizeIndicatorExplorerFavorites({
      stocks: (left.stocks || []).concat(right.stocks || []),
      crypto: (left.crypto || []).concat(right.crypto || [])
    });
  }

  // Builds a stable signature for favorites payload equality checks.
  function indicatorExplorerFavoritesSignature(payload) {
    var normalized = normalizeIndicatorExplorerFavorites(payload);
    var stockKeys = (normalized.stocks || []).map(function (item) {
      var symbol = String(item && (item.yahooSymbol || item.symbol) || '').trim().toUpperCase();
      var note = encodeURIComponent(normalizeIndicatorExplorerFavoriteNote(item && item.note));
      return 'stock:' + symbol + ':' + note;
    }).sort();
    var cryptoKeys = (normalized.crypto || []).map(function (item) {
      var symbol = String(item && item.symbol || '').trim().toUpperCase();
      var coinId = String(item && item.coinId || '').trim().toLowerCase();
      var note = encodeURIComponent(normalizeIndicatorExplorerFavoriteNote(item && item.note));
      return 'crypto:' + (symbol || coinId.toUpperCase()) + ':' + coinId + ':' + note;
    }).sort();
    return stockKeys.join('|') + '||' + cryptoKeys.join('|');
  }

  // Persists favorites in local cache as offline fallback for full-page refreshes.
  function saveIndicatorExplorerFavoritesToLocalCache(payload) {
    var normalized = normalizeIndicatorExplorerFavorites(payload);
    storage.setCached(state.caches, EXPLORER_FAVORITES_LOCAL_CACHE_KEY, normalized);
    storage.saveCache(state.caches);
  }

  // Reads favorites fallback from local cache.
  function loadIndicatorExplorerFavoritesFromLocalCache() {
    return normalizeIndicatorExplorerFavorites(
      storage.getCached(state.caches, EXPLORER_FAVORITES_LOCAL_CACHE_KEY, 0) ||
      getCachedAny(EXPLORER_FAVORITES_LOCAL_CACHE_KEY)
    );
  }

  // Returns the stable favorite key for a target.
  function indicatorExplorerFavoriteKeyFromTarget(target) {
    if (!target) return '';
    if (target.assetType === 'crypto') {
      var cryptoSymbol = String(target.baseSymbol || target.symbol || '').replace('/USD', '').trim().toUpperCase();
      return cryptoSymbol ? ('crypto:' + cryptoSymbol) : '';
    }
    var stockSymbol = String(target.yahooSymbol || target.symbol || '').trim().toUpperCase();
    return stockSymbol ? ('stock:' + stockSymbol) : '';
  }

  // Converts an explorer target into a favorite record.
  function indicatorExplorerFavoriteFromTarget(target) {
    if (!target) return null;
    if (target.assetType === 'crypto') {
      var cryptoSymbol = String(target.baseSymbol || target.symbol || '').replace('/USD', '').trim().toUpperCase();
      if (!cryptoSymbol) return null;
      return {
        assetType: 'crypto',
        symbol: cryptoSymbol,
        coinId: target.coinId || null,
        name: String(target.name || cryptoSymbol).trim() || cryptoSymbol,
        note: ''
      };
    }
    var stockSymbol = String(target.yahooSymbol || target.symbol || '').trim().toUpperCase();
    if (!stockSymbol) return null;
    return {
      assetType: 'stock',
      symbol: stockSymbol,
      yahooSymbol: stockSymbol,
      stooqSymbol: target.stooqSymbol || null,
      market: target.market || 'US',
      name: String(target.name || stockSymbol).trim() || stockSymbol,
      note: ''
    };
  }

  // Returns the favorite list for the active explorer mode.
  function indicatorExplorerFavoritesForMode(modeKey) {
    if (!INDICATOR_EXPLORER.favorites) INDICATOR_EXPLORER.favorites = { stocks: [], crypto: [] };
    return modeKey === 'crypto'
      ? (Array.isArray(INDICATOR_EXPLORER.favorites.crypto) ? INDICATOR_EXPLORER.favorites.crypto : [])
      : (Array.isArray(INDICATOR_EXPLORER.favorites.stocks) ? INDICATOR_EXPLORER.favorites.stocks : []);
  }

  // Finds one favorite in the active mode list by its stable key.
  function findIndicatorExplorerFavoriteByKey(modeKey, key) {
    var normalizedMode = modeKey === 'crypto' ? 'crypto' : 'stocks';
    var list = indicatorExplorerFavoritesForMode(normalizedMode);
    var idx = list.findIndex(function (entry) {
      return indicatorExplorerFavoriteKeyFromEntry(entry) === key;
    });
    return {
      mode: normalizedMode,
      key: String(key || '').trim(),
      list: list,
      index: idx,
      entry: idx >= 0 ? list[idx] : null
    };
  }

  // Returns true when the given target is in favorites.
  function isIndicatorExplorerFavorite(target) {
    var key = indicatorExplorerFavoriteKeyFromTarget(target);
    if (!key) return false;
    var list = indicatorExplorerFavoritesForMode(target && target.mode === 'crypto' ? 'crypto' : 'stocks');
    return list.some(function (entry) {
      return indicatorExplorerFavoriteKeyFromEntry(entry) === key;
    });
  }

  // Persists explorer favorites to the local proxy DB.
  function saveIndicatorExplorerFavoritesToRemote() {
    if (!storage || typeof storage.saveRemoteExplorerFavorites !== 'function') return Promise.resolve({ ok: false });
    var payload = normalizeIndicatorExplorerFavorites(INDICATOR_EXPLORER.favorites);
    INDICATOR_EXPLORER.favorites = payload;
    saveIndicatorExplorerFavoritesToLocalCache(payload);
    return storage.saveRemoteExplorerFavorites(payload);
  }

  // Loads explorer favorites from the local proxy DB.
  function loadIndicatorExplorerFavoritesFromRemote() {
    if (!storage || typeof storage.loadRemoteExplorerFavorites !== 'function') return Promise.resolve(null);
    var localFallback = loadIndicatorExplorerFavoritesFromLocalCache();
    if (hasIndicatorExplorerFavorites(localFallback)) {
      INDICATOR_EXPLORER.favorites = localFallback;
      INDICATOR_EXPLORER.favoritesLoaded = true;
    }
    return storage.loadRemoteExplorerFavorites().then(function (record) {
      if (!record || !record.favorites || typeof record.favorites !== 'object') {
        INDICATOR_EXPLORER.favorites = hasIndicatorExplorerFavorites(localFallback)
          ? localFallback
          : normalizeIndicatorExplorerFavorites(INDICATOR_EXPLORER.favorites);
        INDICATOR_EXPLORER.favoritesLoaded = hasIndicatorExplorerFavorites(INDICATOR_EXPLORER.favorites);
        if (hasIndicatorExplorerFavorites(localFallback)) {
          saveIndicatorExplorerFavoritesToRemote();
        }
        return INDICATOR_EXPLORER.favorites;
      }
      var loaded = normalizeIndicatorExplorerFavorites(record && record.favorites);
      var remoteUpdatedAt = Math.max(0, Number(record && record.updatedAt || 0) || 0);
      var bootstrapFromLocal = !hasIndicatorExplorerFavorites(loaded) &&
        hasIndicatorExplorerFavorites(localFallback) &&
        remoteUpdatedAt <= 0;
      var resolved = bootstrapFromLocal ? localFallback : loaded;
      INDICATOR_EXPLORER.favorites = resolved;
      INDICATOR_EXPLORER.favoritesLoaded = true;
      saveIndicatorExplorerFavoritesToLocalCache(resolved);
      if (bootstrapFromLocal) {
        saveIndicatorExplorerFavoritesToRemote();
      }
      return resolved;
    }).catch(function () {
      INDICATOR_EXPLORER.favorites = hasIndicatorExplorerFavorites(localFallback)
        ? localFallback
        : normalizeIndicatorExplorerFavorites(INDICATOR_EXPLORER.favorites);
      INDICATOR_EXPLORER.favoritesLoaded = hasIndicatorExplorerFavorites(INDICATOR_EXPLORER.favorites);
      return INDICATOR_EXPLORER.favorites;
    });
  }

  // Sets the explorer list view mode to all or favorites.
  function setIndicatorExplorerView(viewKey) {
    closeIndicatorExplorerFavoriteNoteModal();
    INDICATOR_EXPLORER.view = viewKey === 'favorites' ? 'favorites' : 'all';
    hideIndicatorExplorerSearchResults();
    safeRenderIndicatorExplorer('explorer chart start');
  }

  function saveIndicatorExplorerSession(modeKey) {
    var normalizedMode = modeKey === 'crypto' ? 'crypto' : 'stocks';
    INDICATOR_EXPLORER.sessions[normalizedMode] = {
      selected: INDICATOR_EXPLORER.selected ? Object.assign({}, INDICATOR_EXPLORER.selected) : null,
      selectionToken: String(INDICATOR_EXPLORER.selectionToken || ''),
      panel: INDICATOR_EXPLORER.panel ? JSON.parse(JSON.stringify(INDICATOR_EXPLORER.panel)) : null,
      chart: INDICATOR_EXPLORER.chart ? JSON.parse(JSON.stringify(INDICATOR_EXPLORER.chart)) : emptyIndicatorExplorerChart(),
      fundamentals: INDICATOR_EXPLORER.fundamentals ? JSON.parse(JSON.stringify(INDICATOR_EXPLORER.fundamentals)) : null,
      newsItems: Array.isArray(INDICATOR_EXPLORER.newsItems) ? INDICATOR_EXPLORER.newsItems.slice() : [],
      newsMeta: String(INDICATOR_EXPLORER.newsMeta || '')
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
    INDICATOR_EXPLORER.selectionRequestId += 1;
    INDICATOR_EXPLORER.selected = session && session.selected ? Object.assign({}, session.selected) : null;
    INDICATOR_EXPLORER.selectionToken = String(session && session.selectionToken || '');
    if (!INDICATOR_EXPLORER.selectionToken && INDICATOR_EXPLORER.selected) {
      INDICATOR_EXPLORER.selectionToken = explorerTargetSelectionToken(INDICATOR_EXPLORER.selected);
    }
    INDICATOR_EXPLORER.panel = session && session.panel ? JSON.parse(JSON.stringify(session.panel)) : null;
    INDICATOR_EXPLORER.chart = session && session.chart ? JSON.parse(JSON.stringify(session.chart)) : emptyIndicatorExplorerChart();
    INDICATOR_EXPLORER.fundamentals = session && session.fundamentals ? JSON.parse(JSON.stringify(session.fundamentals)) : null;
    INDICATOR_EXPLORER.fundamentalsLoading = false;
    INDICATOR_EXPLORER.newsItems = session && Array.isArray(session.newsItems) ? session.newsItems.slice() : [];
    INDICATOR_EXPLORER.newsMeta = String(session && session.newsMeta || '');
    INDICATOR_EXPLORER.newsLoading = false;
    if (ui.el.indicatorExplorerSearchInput) {
      ui.el.indicatorExplorerSearchInput.value = INDICATOR_EXPLORER.selected ? String(INDICATOR_EXPLORER.selected.label || '') : '';
    }
  }

  function renderIndicatorExplorerSearchResults() {
    var listEl = ui.el.indicatorExplorerSearchList;
    if (!listEl) return;
    if (INDICATOR_EXPLORER.view === 'favorites') {
      listEl.classList.add('hidden');
      listEl.innerHTML = '';
      return;
    }
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
      var target = indicatorTargetFromExplorerItem(item, INDICATOR_EXPLORER.mode);
      var favorite = target ? isIndicatorExplorerFavorite(target) : false;
      var rawName = String(item.name || item.id || '').trim();
      var normalizedName = rawName.toUpperCase();
      var secondary = (rawName && normalizedName !== sub)
        ? rawName
        : (INDICATOR_EXPLORER.mode === 'stocks' ? String(item.market || item.stooq || '').trim() : '');
      var secondaryDisplay = secondary ? (' • ' + secondary) : '';
      return '<div class="autocomplete__item autocomplete__item--with-action">' +
        '<button class="autocomplete__choice" type="button" data-indicator-explorer-idx="' + idx + '">' +
          '<strong>' + escapeHtml(sub) + '</strong>' +
          (secondaryDisplay ? ('<span class="autocomplete__secondary">' + escapeHtml(secondaryDisplay) + '</span>') : '') +
        '</button>' +
        '<button class="autocomplete__fav' + (favorite ? ' is-active' : '') + '" type="button" data-indicator-explorer-fav-idx="' + idx + '"' +
          ' aria-label="' + (favorite ? 'Remove from favorites' : 'Add to favorites') + '"' +
          ' title="' + (favorite ? 'Remove from favorites' : 'Add to favorites') + '"' +
          ' aria-pressed="' + (favorite ? 'true' : 'false') + '">' + (favorite ? '★' : '☆') + '</button>' +
      '</div>';
    }).join('');
  }

  // Adds/removes one explorer search result in favorites without selecting it.
  function toggleIndicatorExplorerFavoriteFromItem(item) {
    var target = indicatorTargetFromExplorerItem(item, INDICATOR_EXPLORER.mode);
    if (!target) return;
    var modeKey = target.mode === 'crypto' ? 'crypto' : 'stocks';
    var key = indicatorExplorerFavoriteKeyFromTarget(target);
    if (!key) return;
    var hit = findIndicatorExplorerFavoriteByKey(modeKey, key);
    if (hit.index >= 0) hit.list.splice(hit.index, 1);
    else {
      var favoriteEntry = indicatorExplorerFavoriteFromTarget(target);
      if (favoriteEntry) hit.list.push(favoriteEntry);
    }
    INDICATOR_EXPLORER.favorites = normalizeIndicatorExplorerFavorites(INDICATOR_EXPLORER.favorites);
    renderIndicatorExplorerSearchResults();
    renderIndicatorExplorerFavoriteButton();
    if (INDICATOR_EXPLORER.view === 'favorites') renderIndicatorExplorerFavoritesList();
    saveIndicatorExplorerSession(modeKey);
    saveIndicatorExplorerFavoritesToRemote();
  }

  // Renders the explorer fundamentals block using the existing fundamentals card language.
  function renderIndicatorExplorerFundamentals() {
    if (!ui || !ui.el || !ui.el.indicatorExplorerFundamentalsGrid) return;
    var selected = INDICATOR_EXPLORER.selected;
    var payload = INDICATOR_EXPLORER.fundamentals;
    var loading = !!INDICATOR_EXPLORER.fundamentalsLoading;
    var asset = explorerAssetFromTarget(selected);
    var hasAsset = !!asset;

    function overallTone(label) {
      var v = String(label || '').toLowerCase();
      if (v.indexOf('strong') >= 0 || v === 'healthy' || v === 'cheap' || v.indexOf('bullish') >= 0) return 'bullish';
      if (v.indexOf('weak') >= 0 || v.indexOf('risk') >= 0 || v.indexOf('bearish') >= 0 || v === 'expensive') return 'bearish';
      return 'neutral';
    }

    function pillClass(label) {
      return 'indicator-pill indicator-pill--' + overallTone(label);
    }

    function chipClass(status) {
      var v = String(status || '').toLowerCase();
      if (!v || v === 'n/a' || v === 'na') return 'fundamentals-chip fundamentals-chip--risk-na';
      if (v === 'bullish' || v === 'healthy' || v === 'cheap' || v === 'strong') return 'fundamentals-chip fundamentals-chip--bullish';
      if (v === 'risk' || v === 'weak' || v === 'expensive' || v === 'bearish') return 'fundamentals-chip fundamentals-chip--bearish';
      return 'fundamentals-chip fundamentals-chip--neutral';
    }

    function riskChipClass(label) {
      var v = String(label || '').toLowerCase();
      if (v === 'low') return 'fundamentals-chip fundamentals-chip--risk-low';
      if (v === 'moderate') return 'fundamentals-chip fundamentals-chip--risk-moderate';
      if (v === 'elevated') return 'fundamentals-chip fundamentals-chip--risk-elevated';
      if (v === 'high') return 'fundamentals-chip fundamentals-chip--risk-high';
      if (v === 'very high') return 'fundamentals-chip fundamentals-chip--risk-very-high';
      return 'fundamentals-chip fundamentals-chip--risk-na';
    }

    function riskRowTone(label) {
      var v = String(label || '').toLowerCase();
      if (v === 'low') return 'low';
      if (v === 'moderate') return 'moderate';
      if (v === 'elevated') return 'elevated';
      if (v === 'high') return 'high';
      if (v === 'very high') return 'very-high';
      return 'na';
    }

    function fmtRiskScore(score) {
      return isFinite(Number(score)) ? String(Math.round(Number(score))) : 'n/a';
    }

    function riskComponentsSummary(components) {
      var c = components && typeof components === 'object' ? components : {};
      var parts = [];
      function add(label, value) {
        if (!isFinite(Number(value))) return;
        parts.push(label + ' ' + String(Math.round(Number(value))));
      }
      add('Price', c.priceRisk);
      add('Liquidity', c.liquidityRisk);
      if (Object.prototype.hasOwnProperty.call(c, 'fundamentalRisk')) add('Fundamentals', c.fundamentalRisk);
      if (Object.prototype.hasOwnProperty.call(c, 'eventRegimeRisk')) add('Regime/Event', c.eventRegimeRisk);
      if (Object.prototype.hasOwnProperty.call(c, 'tokenRisk')) add('Token', c.tokenRisk);
      if (Object.prototype.hasOwnProperty.call(c, 'regimeRisk')) add('Regime', c.regimeRisk);
      return parts.join(' • ');
    }

    function riskMeterSectionHtml(riskMeter) {
      var meter = riskMeter && typeof riskMeter === 'object' ? riskMeter : null;
      var timeframes = meter && meter.timeframes && typeof meter.timeframes === 'object' ? meter.timeframes : {};
      var keys = ['1d', '1w', '1m'];
      var rows = keys.map(function (key) {
        var row = timeframes[key] && typeof timeframes[key] === 'object' ? timeframes[key] : null;
        if (!row) {
          return '<article class="fundamentals-risk-row fundamentals-risk-row--na"><div class="fundamentals-risk-row__head"><span class="fundamentals-risk-row__timeframe">' + key.toUpperCase() + '</span><span class="' + riskChipClass('n/a') + '">n/a</span></div><div class="fundamentals-risk-row__line muted">Not enough data</div></article>';
        }
        var reasons = Array.isArray(row.reasons) ? row.reasons.filter(Boolean).slice(0, 3) : [];
        var tone = riskRowTone(row.label);
        return '<article class="fundamentals-risk-row fundamentals-risk-row--' + tone + '">' +
          '<div class="fundamentals-risk-row__head">' +
            '<span class="fundamentals-risk-row__timeframe">' + key.toUpperCase() + ': ' + fmtRiskScore(row.score) + '</span>' +
            '<span class="' + riskChipClass(row.label) + '">' + escapeHtml(String(row.label || 'n/a')) + '</span>' +
          '</div>' +
          '<div class="fundamentals-risk-row__line">' + escapeHtml(riskComponentsSummary(row.components)) + '</div>' +
          (reasons.length ? ('<div class="fundamentals-risk-row__reasons">' + reasons.map(function (reason) {
            return '<span>' + escapeHtml(reason) + '</span>';
          }).join('') + '</div>') : '') +
        '</article>';
      }).join('');
      var updatedText = meter && isFinite(Number(meter.updatedAt))
        ? ('Updated ' + new Date(Number(meter.updatedAt)).toLocaleString())
        : 'Using cached risk snapshot when available.';
      var note = String(meter && meter.note || 'Risk Meter estimates trading risk using volatility, drawdown, liquidity, market structure, and fundamentals/tokenomics. It is not a prediction.').trim();
      return '<section class="fundamentals-section fundamentals-section--risk">' +
        '<div class="fundamentals-section__title-row">' +
          '<span class="fundamentals-section__title">Risk Meter</span>' +
          '<span class="fundamentals-section__count">' + escapeHtml(updatedText) + '</span>' +
        '</div>' +
        '<div class="fundamentals-risk-meter__note">' + escapeHtml(note) + '</div>' +
        '<div class="fundamentals-risk-meter">' + rows + '</div>' +
      '</section>';
    }

    function metricExplanation(metric) {
      var byId = {
        'revenue-growth-yoy': 'Revenue Growth YoY: How much sales grew vs the same period last year. Higher usually means demand is improving.',
        'eps-growth-yoy': 'EPS Growth YoY: How much earnings per share grew vs last year. Rising EPS can mean profits are improving.',
        'margin': 'Operating Margin: Percent of sales left after core operating costs. Higher margin usually means better efficiency.',
        'free-cash-flow': 'Free Cash Flow: Cash left after running the business and required spending. Positive FCF is usually a good sign.',
        'debt-equity': 'Debt / Equity: Debt compared with shareholder capital. Lower often means less balance-sheet risk.',
        'roe': 'ROE: Profit generated from shareholder money. Higher can mean management is using capital well.',
        'piotroski': 'Piotroski Score: Financial strength score from 0 to 9. Higher is generally better (7+ is often considered strong).',
        'altman-z': 'Altman Z-Score: Financial stress risk score. Higher usually means lower bankruptcy risk.',
        'pe': 'P/E: Price compared with earnings. Lower can be cheaper, but context and growth still matter.',
        'ps': 'P/S: Price compared with sales. Lower can mean a cheaper valuation.',
        'ev-ebitda': 'EV/EBITDA: Company value compared with operating earnings. Lower often means a cheaper valuation.',
        'price-to-fcf': 'P/FCF: Price compared with free cash flow. Lower means investors pay less for each unit of cash flow.'
      };
      var id = String(metric && metric.id || '').trim().toLowerCase();
      var text = byId[id] || String(metric && metric.hint || '').trim();
      if (!text) {
        var label = String(metric && metric.label || 'Metric').trim();
        text = label + ': A fundamentals metric used to judge business quality or valuation.';
      }
      return text;
    }

    if (ui.el.indicatorExplorerFundamentalsAssetLabel) {
      ui.el.indicatorExplorerFundamentalsAssetLabel.textContent = hasAsset
        ? (asset.symbol || asset.name || 'Selected asset')
        : 'No asset selected';
    }

    if (!hasAsset) {
      if (ui.el.indicatorExplorerFundamentalsTitle) ui.el.indicatorExplorerFundamentalsTitle.textContent = 'Fundamentals';
      if (ui.el.indicatorExplorerFundamentalsOverallPill) {
        ui.el.indicatorExplorerFundamentalsOverallPill.className = 'indicator-pill indicator-pill--neutral';
        ui.el.indicatorExplorerFundamentalsOverallPill.textContent = 'n/a';
      }
      if (ui.el.indicatorExplorerFundamentalsMeta) ui.el.indicatorExplorerFundamentalsMeta.textContent = 'Search for an asset to load fundamentals.';
      if (ui.el.indicatorExplorerFundamentalsSummary) ui.el.indicatorExplorerFundamentalsSummary.innerHTML = '';
      ui.el.indicatorExplorerFundamentalsGrid.innerHTML = '';
      if (ui.el.indicatorExplorerFundamentalsReasons) ui.el.indicatorExplorerFundamentalsReasons.innerHTML = '';
      return;
    }

    if (loading && !payload) {
      if (ui.el.indicatorExplorerFundamentalsTitle) ui.el.indicatorExplorerFundamentalsTitle.textContent = asset.type === 'crypto' ? 'Token Fundamentals' : 'Fundamentals';
      if (ui.el.indicatorExplorerFundamentalsOverallPill) {
        ui.el.indicatorExplorerFundamentalsOverallPill.className = 'indicator-pill indicator-pill--neutral';
        ui.el.indicatorExplorerFundamentalsOverallPill.textContent = 'n/a';
      }
      if (ui.el.indicatorExplorerFundamentalsMeta) ui.el.indicatorExplorerFundamentalsMeta.textContent = 'Loading fundamentals...';
      if (ui.el.indicatorExplorerFundamentalsSummary) ui.el.indicatorExplorerFundamentalsSummary.innerHTML = '';
      ui.el.indicatorExplorerFundamentalsGrid.innerHTML = '<div class="muted">Loading fundamentals...</div>';
      if (ui.el.indicatorExplorerFundamentalsReasons) ui.el.indicatorExplorerFundamentalsReasons.innerHTML = '';
      return;
    }

    var panel = payload && payload.panel ? payload.panel : null;
    if (panel && selected && selected.cacheKey) {
      attachRiskMeterToFundamentalsSnapshot({
        fundamentalsSnapshot: payload,
        targetConfig: {
          assetType: selected.assetType === 'crypto' ? 'crypto' : 'stock',
          symbol: selected.symbol,
          cacheKey: selected.cacheKey
        },
        identityKey: riskCacheKeyForExplorerTarget(selected),
        onHydrated: function () {
          if (!INDICATOR_EXPLORER || !INDICATOR_EXPLORER.selected) return;
          if (INDICATOR_EXPLORER.selectionToken !== explorerTargetSelectionToken(selected)) return;
          renderIndicatorExplorerFundamentals();
        }
      });
      panel = payload && payload.panel ? payload.panel : panel;
    }
    if (!panel) {
      var message = String((payload && (payload.errorDetail || payload.error || payload.note)) || 'No fundamentals snapshot yet.').trim();
      if (ui.el.indicatorExplorerFundamentalsTitle) ui.el.indicatorExplorerFundamentalsTitle.textContent = asset.type === 'crypto' ? 'Token Fundamentals' : 'Fundamentals';
      if (ui.el.indicatorExplorerFundamentalsOverallPill) {
        ui.el.indicatorExplorerFundamentalsOverallPill.className = 'indicator-pill indicator-pill--neutral';
        ui.el.indicatorExplorerFundamentalsOverallPill.textContent = 'n/a';
      }
      if (ui.el.indicatorExplorerFundamentalsMeta) ui.el.indicatorExplorerFundamentalsMeta.textContent = message;
      if (ui.el.indicatorExplorerFundamentalsSummary) ui.el.indicatorExplorerFundamentalsSummary.innerHTML = '';
      ui.el.indicatorExplorerFundamentalsGrid.innerHTML = '<div class="muted">' + escapeHtml(message) + '</div>';
      if (ui.el.indicatorExplorerFundamentalsReasons) ui.el.indicatorExplorerFundamentalsReasons.innerHTML = '';
      return;
    }

    var qualityLabel = String(panel.qualityLabel || panel.label || 'Mixed');
    var valuationLabel = String(panel.valuationLabel || 'n/a');
    var qualityScore = isFinite(Number(panel.qualityScore)) ? Number(panel.qualityScore) : (isFinite(Number(panel.score)) ? Number(panel.score) : 0);
    var qualityScoreOutOf = isFinite(Number(panel.qualityScoreOutOf)) ? Number(panel.qualityScoreOutOf) : (isFinite(Number(panel.scoreOutOf)) ? Number(panel.scoreOutOf) : null);
    var sections = Array.isArray(panel.sections) ? panel.sections : [];
    var hasMetricValues = sections.some(function (section) {
      var metrics = Array.isArray(section && section.metrics) ? section.metrics : [];
      return metrics.some(function (metric) {
        return metric && metric.value != null;
      });
    });
    if (!hasMetricValues) {
      qualityLabel = 'n/a';
      valuationLabel = 'n/a';
    }
    var reasons = Array.isArray(panel.reasons) ? panel.reasons : [];
    var fetchedAt = Number(payload && payload.fetchedAt || 0) || 0;
    var metaText = String(panel.note || '').trim();
    if (!metaText && fetchedAt > 0) metaText = 'Updated ' + new Date(fetchedAt).toLocaleString();
    if (!metaText) metaText = 'Using cached fundamentals when available.';

    if (ui.el.indicatorExplorerFundamentalsTitle) {
      ui.el.indicatorExplorerFundamentalsTitle.textContent = panel.title || (asset.type === 'crypto' ? 'Token Fundamentals' : 'Fundamentals');
    }
    if (ui.el.indicatorExplorerFundamentalsOverallPill) {
      ui.el.indicatorExplorerFundamentalsOverallPill.className = pillClass(qualityLabel);
      ui.el.indicatorExplorerFundamentalsOverallPill.textContent = qualityLabel;
    }
    if (ui.el.indicatorExplorerFundamentalsMeta) ui.el.indicatorExplorerFundamentalsMeta.textContent = metaText;
    if (ui.el.indicatorExplorerFundamentalsSummary) {
      ui.el.indicatorExplorerFundamentalsSummary.innerHTML =
        '<div class="fundamentals-summary__badges fundamentals-summary__badges--grid">' +
          '<div class="fundamentals-summary__badge fundamentals-summary__badge--' + overallTone(qualityLabel) + '">' +
            '<span class="fundamentals-summary__badge-label">Quality</span>' +
            '<span class="' + pillClass(qualityLabel) + '">' + escapeHtml(qualityLabel) + '</span>' +
          '</div>' +
          '<div class="fundamentals-summary__badge fundamentals-summary__badge--' + overallTone(valuationLabel) + '">' +
            '<span class="fundamentals-summary__badge-label">Valuation</span>' +
            '<span class="' + pillClass(valuationLabel) + '">' + escapeHtml(valuationLabel) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="fundamentals-summary__score">Quality Score: <strong>' +
          escapeHtml(String(qualityScore) + (qualityScoreOutOf != null ? ('/' + String(qualityScoreOutOf)) : '')) +
        '</strong></div>';
    }

    var riskSection = riskMeterSectionHtml(panel.riskMeter);
    ui.el.indicatorExplorerFundamentalsGrid.innerHTML = sections.map(function (section) {
      var metrics = Array.isArray(section && section.metrics) ? section.metrics : [];
      return '<section class="fundamentals-section">' +
        '<div class="fundamentals-section__title-row"><span class="fundamentals-section__title">' + escapeHtml(section && section.title ? section.title : 'Metrics') + '</span><span class="fundamentals-section__count">' + escapeHtml(String(metrics.length)) + ' metrics</span></div>' +
        '<div class="fundamentals-section__grid">' +
          metrics.map(function (metric) {
            var reasonText = String(metric && metric.reasonIfUnavailable || '').trim();
            var explain = metricExplanation(metric);
            var metricLabel = metric && metric.label ? String(metric.label) : '';
            var metricUnavailable = !metric || metric.value == null;
            var metricStatus = metricUnavailable
              ? 'n/a'
              : (String(metric && metric.status || '').trim() || 'Neutral');
            var valueText = (metric && metric.value != null)
              ? String(metric && metric.display ? metric.display : metric.value)
              : (reasonText ? 'Unavailable' : 'n/a');
            return '<article class="fundamentals-metric">' +
              '<div class="fundamentals-metric__head"><span class="fundamentals-metric__title" tabindex="0" data-help-tooltip="' + escapeHtml(explain) + '" aria-label="' + escapeHtml((metricLabel || 'Metric') + ' explanation') + '">' + escapeHtml(metricLabel) + '</span><span class="' + chipClass(metricStatus) + '">' + escapeHtml(metricStatus) + '</span></div>' +
              '<strong>' + escapeHtml(valueText) + '</strong>' +
              (reasonText ? ('<small class="fundamentals-metric__reason">' + escapeHtml(reasonText) + '</small>') : '') +
            '</article>';
          }).join('') +
        '</div>' +
      '</section>';
    }).join('') + riskSection;

    if (ui.el.indicatorExplorerFundamentalsReasons) {
      ui.el.indicatorExplorerFundamentalsReasons.innerHTML = reasons.length
        ? ('<div class="fundamentals-reasons__title">Why</div><div class="fundamentals-reasons__list">' + reasons.slice(0, 8).map(function (x) { return '<span>' + escapeHtml(x) + '</span>'; }).join('') + '</div>')
        : '';
    }
  }

  // Renders the explorer news block using the same reactive tile language as the main News panel.
  function renderIndicatorExplorerNews() {
    if (!ui || !ui.el || !ui.el.indicatorExplorerNewsList) return;
    var selected = INDICATOR_EXPLORER.selected;
    var hasSelection = !!selected;
    var items = Array.isArray(INDICATOR_EXPLORER.newsItems) ? INDICATOR_EXPLORER.newsItems : [];
    var loading = !!INDICATOR_EXPLORER.newsLoading;
    var meta = String(INDICATOR_EXPLORER.newsMeta || '').trim();

    if (!hasSelection) {
      if (ui.el.indicatorExplorerNewsMeta) ui.el.indicatorExplorerNewsMeta.textContent = 'Search for an asset to load news.';
      ui.el.indicatorExplorerNewsList.innerHTML = '<div class="muted">No news yet.</div>';
      return;
    }

    if (loading && !items.length) {
      if (ui.el.indicatorExplorerNewsMeta) ui.el.indicatorExplorerNewsMeta.textContent = 'Loading news...';
      ui.el.indicatorExplorerNewsList.innerHTML = '<div class="muted">Loading news...</div>';
      return;
    }

    if (ui.el.indicatorExplorerNewsMeta) {
      ui.el.indicatorExplorerNewsMeta.textContent = meta || 'News for ' + (selected.label || selected.symbol || 'selected asset');
    }
    if (!items.length) {
      ui.el.indicatorExplorerNewsList.innerHTML = '<div class="muted">No news available yet. Try Refresh.</div>';
      return;
    }

    ui.el.indicatorExplorerNewsList.innerHTML = '<div class="reactive-tiles">' + items.map(function (item) {
      return '<a class="reactive-tile reactive-tile--news" href="' + escapeHtml(item.link || '#') + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="reactive-tile__badge">N</span>' +
        '<span class="reactive-tile__body"><strong>' + escapeHtml(item.title || 'Untitled') + '</strong><small>' + escapeHtml(item.source || 'Source') + (item.published ? ' • ' + escapeHtml(item.published) : '') + '</small></span>' +
        '<span class="reactive-tile__arrow">↗</span>' +
      '</a>';
    }).join('') + '</div>';
  }

  function renderIndicatorExplorer() {
    if (!ui || !ui.el || !ui.el.indicatorExplorerModal) return;
    var isCrypto = INDICATOR_EXPLORER.mode === 'crypto';
    var showingFavorites = INDICATOR_EXPLORER.view === 'favorites';
    var hasSelection = !!INDICATOR_EXPLORER.selected;
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
    if (ui.el.indicatorExplorerViewAllBtn && ui.el.indicatorExplorerViewFavoritesBtn) {
      ui.el.indicatorExplorerViewAllBtn.classList.toggle('btn--primary', !showingFavorites);
      ui.el.indicatorExplorerViewAllBtn.classList.toggle('btn--ghost', showingFavorites);
      ui.el.indicatorExplorerViewAllBtn.setAttribute('aria-pressed', !showingFavorites ? 'true' : 'false');
      ui.el.indicatorExplorerViewFavoritesBtn.classList.toggle('btn--primary', showingFavorites);
      ui.el.indicatorExplorerViewFavoritesBtn.classList.toggle('btn--ghost', !showingFavorites);
      ui.el.indicatorExplorerViewFavoritesBtn.setAttribute('aria-pressed', showingFavorites ? 'true' : 'false');
    }
    if (ui.el.indicatorExplorerSearchWrap) {
      ui.el.indicatorExplorerSearchWrap.classList.toggle('hidden', showingFavorites);
    }
    if (ui.el.indicatorExplorerFavoritesPage) {
      ui.el.indicatorExplorerFavoritesPage.classList.toggle('hidden', !showingFavorites);
      if (showingFavorites) renderIndicatorExplorerFavoritesList();
    }
    if (ui.el.indicatorExplorerSummaryBar) {
      ui.el.indicatorExplorerSummaryBar.classList.toggle('hidden', showingFavorites || !hasSelection);
    }
    if (ui.el.indicatorExplorerLayout) {
      ui.el.indicatorExplorerLayout.classList.toggle('hidden', showingFavorites);
    }
    if (ui.el.indicatorExplorerChartTitle && ui.el.indicatorExplorerChartTitle.closest('.panel-block')) {
      ui.el.indicatorExplorerChartTitle.closest('.panel-block').classList.toggle('hidden', !hasSelection);
    }
    if (ui.el.indicatorExplorerAssetLabel && ui.el.indicatorExplorerAssetLabel.closest('.panel-block')) {
      ui.el.indicatorExplorerAssetLabel.closest('.panel-block').classList.toggle('hidden', !hasSelection);
    }
    if (ui.el.indicatorExplorerTimeframes) {
      ui.el.indicatorExplorerTimeframes.classList.toggle('hidden', !hasSelection);
    }
    var explorerSideEl = ui.el.indicatorExplorerModal
      ? ui.el.indicatorExplorerModal.querySelector('.indicator-explorer-side')
      : null;
    var explorerMainEl = ui.el.indicatorExplorerModal
      ? ui.el.indicatorExplorerModal.querySelector('.indicator-explorer-main')
      : null;
    var quickSummaryEl = ui.el.indicatorExplorerQuickSummaryPanel || null;
    var indicatorsBlockEl = ui.el.indicatorExplorerAssetLabel
      ? ui.el.indicatorExplorerAssetLabel.closest('.panel-block')
      : null;
    var chartBlockEl = ui.el.indicatorExplorerChart
      ? ui.el.indicatorExplorerChart.closest('.panel-block')
      : null;
    if (quickSummaryEl) {
      if (explorerSideEl && chartBlockEl) {
        if (quickSummaryEl.parentElement !== explorerSideEl || quickSummaryEl.previousSibling !== chartBlockEl) {
          explorerSideEl.insertBefore(quickSummaryEl, chartBlockEl.nextSibling);
        }
      } else if (explorerMainEl && indicatorsBlockEl) {
        if (quickSummaryEl.parentElement !== explorerMainEl || quickSummaryEl.nextSibling !== indicatorsBlockEl) {
          explorerMainEl.insertBefore(quickSummaryEl, indicatorsBlockEl);
        }
      }
    }
    if (explorerSideEl) {
      explorerSideEl.classList.toggle('hidden', !hasSelection);
    }
    var explorerFundamentalsBlock = ui.el.indicatorExplorerFundamentalsGrid
      ? ui.el.indicatorExplorerFundamentalsGrid.closest('.panel-block')
      : null;
    if (explorerFundamentalsBlock) {
      explorerFundamentalsBlock.classList.toggle('hidden', !hasSelection);
    }
    var explorerNewsBlock = ui.el.indicatorExplorerNewsList
      ? ui.el.indicatorExplorerNewsList.closest('.panel-block')
      : null;
    if (explorerNewsBlock) {
      explorerNewsBlock.classList.toggle('hidden', !hasSelection);
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
    renderIndicatorExplorerSummaryBar();
    renderIndicatorExplorerChart();
    renderIndicatorExplorerQuickSummary();
    if (hasSelection) {
      try {
        renderIndicatorSnapshot({
          assetLabel: ui.el.indicatorExplorerAssetLabel,
          modeLabel: ui.el.indicatorExplorerModeLabel,
          overallPill: ui.el.indicatorExplorerOverallPill,
          meta: ui.el.indicatorExplorerMeta,
          trendMeter: ui.el.indicatorExplorerTrendMeter,
          timeframes: ui.el.indicatorExplorerTimeframes
        }, INDICATOR_EXPLORER.panel || {
          mode: INDICATOR_EXPLORER.mode,
          assetLabel: isCrypto ? 'No crypto selected' : 'No stock selected',
          overallStatus: 'Neutral',
          metaText: 'Search for an asset to load its indicator snapshots.',
          timeframes: {}
        }, 'Indicators AI');
      } catch (err) {
        if (ui.el.indicatorExplorerMeta) {
          ui.el.indicatorExplorerMeta.textContent = 'Indicators view failed to render for this asset.';
        }
        if (ui.el.indicatorExplorerTimeframes) {
          ui.el.indicatorExplorerTimeframes.innerHTML = '<section class="indicator-card"><div class="muted">Indicator render error. Try Refresh.</div></section>';
        }
        if (state && state.app && state.app.apiDebugEnabled) {
          try {
            console.debug('[Explore][Indicators] render failed', err && err.message ? err.message : err);
          } catch (noop) {}
        }
      }
    }
    try {
      renderIndicatorExplorerFundamentals();
    } catch (err) {
      if (ui.el.indicatorExplorerFundamentalsMeta) {
        ui.el.indicatorExplorerFundamentalsMeta.textContent = 'Fundamentals view failed to render for this asset.';
      }
      if (state && state.app && state.app.apiDebugEnabled) {
        try {
          console.debug('[Explore][Fundamentals] render failed', err && err.message ? err.message : err);
        } catch (noop) {}
      }
    }
    try {
      renderIndicatorExplorerNews();
    } catch (err) {
      if (ui.el.indicatorExplorerNewsMeta) {
        ui.el.indicatorExplorerNewsMeta.textContent = 'News view failed to render for this asset.';
      }
      if (state && state.app && state.app.apiDebugEnabled) {
        try {
          console.debug('[Explore][News] render failed', err && err.message ? err.message : err);
        } catch (noop) {}
      }
    }
    renderIndicatorExplorerFavoriteButton();
    renderIndicatorExplorerSearchResults();
  }

  // Renders Explore safely so async loading cannot be blocked by a synchronous UI error.
  function safeRenderIndicatorExplorer(contextLabel) {
    try {
      renderIndicatorExplorer();
      return true;
    } catch (err) {
      if (state && state.app && state.app.apiDebugEnabled) {
        try {
          console.debug('[Explore] render failed' + (contextLabel ? (' (' + contextLabel + ')') : ''), err && err.message ? err.message : err);
        } catch (noop) {}
      }
      return false;
    }
  }

  function setIndicatorExplorerMode(modeKey) {
    closeIndicatorExplorerFavoriteNoteModal();
    saveIndicatorExplorerSession(INDICATOR_EXPLORER.mode);
    loadIndicatorExplorerSession(modeKey);
    hideIndicatorExplorerSearchResults();
    safeRenderIndicatorExplorer('select target');
    if (INDICATOR_EXPLORER.selected) refreshIndicatorExplorerSupplementary(INDICATOR_EXPLORER.selected, false, INDICATOR_EXPLORER.selectionRequestId);
  }

  function openIndicatorExplorerModal() {
    if (!ui.el.indicatorExplorerModal) return;
    ui.el.indicatorExplorerModal.classList.remove('hidden');
    ui.el.indicatorExplorerModal.setAttribute('aria-hidden', 'false');
    var startMode = state && state.app && state.app.mode === 'crypto' ? 'crypto' : 'stocks';
    loadIndicatorExplorerSession(startMode);
    renderIndicatorExplorer();
    loadIndicatorExplorerFavoritesFromRemote().then(function () {
      renderIndicatorExplorer();
    });
    if (INDICATOR_EXPLORER.selected) refreshIndicatorExplorerSupplementary(INDICATOR_EXPLORER.selected, false, INDICATOR_EXPLORER.selectionRequestId);
    if (ui.el.indicatorExplorerSearchInput && INDICATOR_EXPLORER.view !== 'favorites') ui.el.indicatorExplorerSearchInput.focus();
  }

  function closeIndicatorExplorerModal() {
    if (!ui.el.indicatorExplorerModal) return;
    saveIndicatorExplorerSession(INDICATOR_EXPLORER.mode);
    closeIndicatorExplorerFavoriteNoteModal();
    ui.el.indicatorExplorerModal.classList.add('hidden');
    ui.el.indicatorExplorerModal.setAttribute('aria-hidden', 'true');
    hideIndicatorExplorerSearchResults();
  }

  // Returns true when desktop-only panel expansion is allowed.
  function canOpenPanelViewer() {
    return !!(window.matchMedia && window.matchMedia('(min-width: 1121px)').matches);
  }

  // Resolves panel viewer source element and labels for the requested panel type.
  function getPanelViewerConfig(type) {
    var safeType = String(type || '').toLowerCase();
    if (safeType === 'holdings') {
      return {
        type: 'holdings',
        title: 'Holdings',
        subtitle: (ui.el.holdingsCount && ui.el.holdingsCount.textContent) || '0 assets',
        source: ui.el.holdingsPanel
      };
    }
    if (safeType === 'indicators') {
      return {
        type: 'indicators',
        title: 'Indicators',
        subtitle: '',
        source: ui.el.indicatorsPanel
      };
    }
    if (safeType === 'allocation') {
      var allocationSubtitle = state.app.mode === 'crypto'
        ? 'Portfolio allocation'
        : (allocationModeStocks() === 'sectors' ? 'Sector allocation' : 'Stock allocation');
      return {
        type: 'allocation',
        title: 'Allocation',
        subtitle: allocationSubtitle,
        source: ui.el.allocationPanel
      };
    }
    if (safeType === 'fundamentals') {
      return {
        type: 'fundamentals',
        title: 'Fundamentals',
        subtitle: '',
        source: ui.el.fundamentalsPanel
      };
    }
    if (safeType === 'news') {
      return {
        type: 'news',
        title: 'News',
        subtitle: '',
        source: ui.el.newsPanel
      };
    }
    return null;
  }

  // Cleans a cloned panel before showing it in the expanded panel viewer modal.
  function sanitizePanelViewerClone(node, type) {
    if (!node) return node;
    var expandBtns = node.querySelectorAll('.panel-expand-btn:not(.holdings-refresh-btn)');
    expandBtns.forEach(function (btn) { btn.remove(); });
    if (String(type || '').toLowerCase() === 'news') {
      var socialsBlock = node.querySelector('.panel-block--socials');
      if (socialsBlock && socialsBlock.parentNode) socialsBlock.parentNode.removeChild(socialsBlock);
    }
    if (String(type || '').toLowerCase() === 'fundamentals') {
      var fundamentalsBlock = node.querySelector('.panel-block--fundamentals');
      var headEl = fundamentalsBlock ? fundamentalsBlock.querySelector('.panel-block__head') : null;
      var metaEl = fundamentalsBlock ? fundamentalsBlock.querySelector('#fundamentalsMeta') : null;
      var summaryEl = fundamentalsBlock ? fundamentalsBlock.querySelector('#fundamentalsSummary') : null;
      var gridEl = fundamentalsBlock ? fundamentalsBlock.querySelector('#fundamentalsGrid') : null;
      var reasonsEl = fundamentalsBlock ? fundamentalsBlock.querySelector('#fundamentalsReasons') : null;
      var riskEl = gridEl ? gridEl.querySelector('.fundamentals-section--risk') : null;
      if (fundamentalsBlock && summaryEl && gridEl && riskEl) {
        var layout = document.createElement('div');
        layout.className = 'fundamentals-expanded-layout';
        var left = document.createElement('div');
        left.className = 'fundamentals-expanded-left';
        var right = document.createElement('div');
        right.className = 'fundamentals-expanded-right';

        if (headEl) left.appendChild(headEl);
        if (metaEl) left.appendChild(metaEl);
        left.appendChild(summaryEl);
        left.appendChild(gridEl);
        right.appendChild(riskEl);

        layout.appendChild(left);
        layout.appendChild(right);
        fundamentalsBlock.insertBefore(layout, reasonsEl || null);
      }
    }
    return node;
  }

  // Builds a stable default filename for analysis PDF export.
  function analysisExportFilename(asset) {
    function pad2(v) { return String(v).padStart(2, '0'); }
    var now = new Date();
    var stamp = String(now.getFullYear()) + pad2(now.getMonth() + 1) + pad2(now.getDate()) +
      '-' + pad2(now.getHours()) + pad2(now.getMinutes());
    var rawLabel = asset ? (asset.symbol || asset.name || '') : '';
    if (!rawLabel) rawLabel = state.app.mode === 'crypto' ? 'crypto' : 'stocks';
    var safeLabel = String(rawLabel).trim().toUpperCase().replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!safeLabel) safeLabel = 'analysis';
    return 'analysis-' + safeLabel + '-' + stamp + '.pdf';
  }

  // Builds a stable filename for single-panel exports.
  function panelExportFilename(panelType, asset) {
    function pad2(v) { return String(v).padStart(2, '0'); }
    var now = new Date();
    var stamp = String(now.getFullYear()) + pad2(now.getMonth() + 1) + pad2(now.getDate()) +
      '-' + pad2(now.getHours()) + pad2(now.getMinutes());
    var rawLabel = asset ? (asset.symbol || asset.name || '') : '';
    if (!rawLabel) rawLabel = state.app.mode === 'crypto' ? 'crypto' : 'stocks';
    var safeLabel = String(rawLabel).trim().toUpperCase().replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!safeLabel) safeLabel = 'asset';
    var kind = String(panelType || '').toLowerCase() === 'fundamentals' ? 'fundamentals' : 'indicators';
    return kind + '-' + safeLabel + '-' + stamp + '.pdf';
  }

  // Builds the top-bar analysis ZIP filename: MarketPilot_[TICKER]_analysis_[DATE].zip
  function analysisZipFilename(asset) {
    function pad2(v) { return String(v).padStart(2, '0'); }
    var now = new Date();
    var dateStamp = String(now.getFullYear()) + pad2(now.getMonth() + 1) + pad2(now.getDate());
    var rawLabel = asset ? (asset.symbol || asset.name || '') : '';
    if (!rawLabel) rawLabel = state.app.mode === 'crypto' ? 'CRYPTO' : 'STOCKS';
    var safeLabel = String(rawLabel).trim().toUpperCase().replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!safeLabel) safeLabel = 'ASSET';
    return 'MarketPilot_' + safeLabel + '_analysis_' + dateStamp + '.zip';
  }

  // Builds panel analysis PDF filenames:
  // MarketPilot_[TICKER]_Indicators_Analysis_[DATETIME].pdf
  // MarketPilot_[TICKER]_Fundamentals_Analysis_[DATETIME].pdf
  function analysisPanelPdfFilename(asset, panelType) {
    function pad2(v) { return String(v).padStart(2, '0'); }
    var now = new Date();
    var dateTime = String(now.getFullYear()) + pad2(now.getMonth() + 1) + pad2(now.getDate()) +
      '-' + pad2(now.getHours()) + pad2(now.getMinutes());
    var rawLabel = asset ? (asset.symbol || asset.name || '') : '';
    if (!rawLabel) rawLabel = state.app.mode === 'crypto' ? 'CRYPTO' : 'STOCKS';
    var safeLabel = String(rawLabel).trim().toUpperCase().replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!safeLabel) safeLabel = 'ASSET';
    var kind = String(panelType || '').toLowerCase() === 'fundamentals' ? 'Fundamentals' : 'Indicators';
    return 'MarketPilot_' + safeLabel + '_' + kind + '_Analysis_' + dateTime + '.pdf';
  }

  // Applies a stronger indicator-like look to fundamentals clones for PDF readability.
  function applyFundamentalsPrintBoost(panelRoot, theme) {
    if (!panelRoot || !panelRoot.querySelectorAll) return;
    function setImportant(el, prop, value) {
      if (!el || !el.style) return;
      el.style.setProperty(prop, value, 'important');
    }
    var isLight = String(theme || '').toLowerCase() === 'light';
    // Dark-mode export uses stronger contrast so fundamentals don't print washed out.
    var blockBorder = isLight ? 'rgba(15, 23, 42, 0.1)' : 'rgba(64, 134, 181, 0.42)';
    var blockBg = isLight
      ? 'linear-gradient(168deg, rgba(255,255,255,0.95), rgba(247,251,255,0.9)), radial-gradient(circle at 8% -45%, rgba(44,182,255,0.12), transparent 64%)'
      : 'linear-gradient(167deg, rgba(9,23,38,0.985), rgba(7,18,31,0.985)), radial-gradient(circle at 8% -45%, rgba(44,182,255,0.22), transparent 60%)';
    var cardBorder = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(83, 156, 204, 0.34)';
    var cardBg = isLight
      ? 'linear-gradient(170deg, rgba(255,255,255,0.9), rgba(248,252,255,0.86)), radial-gradient(circle at 14% -40%, rgba(44,182,255,0.1), transparent 64%)'
      : 'linear-gradient(170deg, rgba(21,44,66,0.8), rgba(14,30,48,0.76)), radial-gradient(circle at 14% -40%, rgba(44,182,255,0.16), transparent 62%)';
    var mutedColor = isLight ? 'rgba(51, 75, 98, 0.94)' : 'rgba(188, 220, 244, 0.96)';
    var textColor = isLight ? '#0b1826' : '#f3f9ff';
    setImportant(panelRoot, '-webkit-print-color-adjust', 'exact');
    setImportant(panelRoot, 'print-color-adjust', 'exact');
    setImportant(panelRoot, 'opacity', '1');
    setImportant(panelRoot, 'filter', 'none');

    var fundamentalsBlock = panelRoot.querySelector('.panel-block--fundamentals');
    if (fundamentalsBlock) {
      setImportant(fundamentalsBlock, 'border-color', blockBorder);
      setImportant(fundamentalsBlock, 'background', blockBg);
      setImportant(fundamentalsBlock, 'box-shadow', 'inset 0 1px 0 rgba(255,255,255,0.08)');
      setImportant(fundamentalsBlock, 'opacity', '1');
      setImportant(fundamentalsBlock, 'filter', 'none');
      setImportant(fundamentalsBlock, 'color', textColor);
    }
    var cards = panelRoot.querySelectorAll('.fundamentals-summary, .fundamentals-metric, .fundamentals-risk-row');
    cards.forEach(function (el) {
      setImportant(el, 'border-color', cardBorder);
      setImportant(el, 'background', cardBg);
      setImportant(el, 'box-shadow', 'none');
      setImportant(el, 'color', textColor);
    });
    var mutedNodes = panelRoot.querySelectorAll(
      '.muted, .fundamentals-metric__title, .fundamentals-metric small, .fundamentals-summary__score, ' +
      '.fundamentals-summary__stat > span, .fundamentals-section__title, .fundamentals-section__count, .fundamentals-risk-meter__note'
    );
    mutedNodes.forEach(function (el) { setImportant(el, 'color', mutedColor); });
    var strongNodes = panelRoot.querySelectorAll(
      '.fundamentals-metric strong, .fundamentals-summary__stat > strong, .fundamentals-summary__score strong, ' +
      '.fundamentals-risk-row__timeframe, .fundamentals-risk-row__line, .fundamentals-risk-row__reasons span'
    );
    strongNodes.forEach(function (el) { setImportant(el, 'color', textColor); });
    var chipNodes = panelRoot.querySelectorAll('.fundamentals-chip, .fundamentals-summary__valuation');
    chipNodes.forEach(function (el) {
      setImportant(el, 'color', textColor);
      if (!isLight) setImportant(el, 'border-color', 'rgba(94, 166, 214, 0.34)');
    });
  }

  // Applies stronger contrast to indicators header status pills for PDF readability.
  function applyIndicatorsPrintBoost(panelRoot, theme) {
    if (!panelRoot || !panelRoot.querySelectorAll) return;
    function setImportant(el, prop, value) {
      if (!el || !el.style) return;
      el.style.setProperty(prop, value, 'important');
    }
    var isLight = String(theme || '').toLowerCase() === 'light';
    var textColor = isLight ? '#0b1826' : '#f3f9ff';
    var mutedColor = isLight ? 'rgba(49, 70, 92, 0.94)' : 'rgba(194, 221, 244, 0.96)';
    var blockBorder = isLight ? 'rgba(15, 23, 42, 0.1)' : 'rgba(64, 134, 181, 0.42)';
    var blockBg = isLight
      ? 'linear-gradient(168deg, rgba(255,255,255,0.95), rgba(247,251,255,0.9)), radial-gradient(circle at 8% -45%, rgba(44,182,255,0.12), transparent 64%)'
      : 'linear-gradient(167deg, rgba(9,23,38,0.985), rgba(7,18,31,0.985)), radial-gradient(circle at 8% -45%, rgba(44,182,255,0.22), transparent 60%)';
    var trendBorder = isLight ? 'rgba(15, 23, 42, 0.1)' : 'rgba(83, 156, 204, 0.34)';
    var trendBg = isLight
      ? 'linear-gradient(170deg, rgba(255,255,255,0.92), rgba(248,252,255,0.88)), radial-gradient(circle at 10% -40%, rgba(44,182,255,0.1), transparent 64%)'
      : 'linear-gradient(170deg, rgba(21,44,66,0.8), rgba(14,30,48,0.76)), radial-gradient(circle at 10% -42%, rgba(44,182,255,0.16), transparent 62%)';
    var trendItemBg = isLight ? 'rgba(15, 23, 42, 0.03)' : 'rgba(8, 24, 39, 0.82)';
    var neutralBorder = isLight ? 'rgba(82, 108, 138, 0.3)' : 'rgba(126, 159, 196, 0.42)';
    var neutralBg = isLight
      ? 'linear-gradient(145deg, rgba(100, 116, 139, 0.2), rgba(100, 116, 139, 0.08))'
      : 'linear-gradient(145deg, rgba(94, 122, 154, 0.58), rgba(63, 90, 119, 0.42))';
    var bullishBorder = isLight ? 'rgba(12, 154, 116, 0.36)' : 'rgba(20, 241, 178, 0.52)';
    var bullishBg = isLight
      ? 'linear-gradient(145deg, rgba(12, 154, 116, 0.24), rgba(12, 154, 116, 0.1))'
      : 'linear-gradient(145deg, rgba(19, 191, 145, 0.5), rgba(18, 145, 112, 0.34))';
    var bearishBorder = isLight ? 'rgba(198, 63, 88, 0.34)' : 'rgba(251, 113, 133, 0.5)';
    var bearishBg = isLight
      ? 'linear-gradient(145deg, rgba(198, 63, 88, 0.22), rgba(198, 63, 88, 0.1))'
      : 'linear-gradient(145deg, rgba(214, 82, 106, 0.48), rgba(156, 56, 74, 0.34))';

    setImportant(panelRoot, '-webkit-print-color-adjust', 'exact');
    setImportant(panelRoot, 'print-color-adjust', 'exact');
    setImportant(panelRoot, 'opacity', '1');
    setImportant(panelRoot, 'filter', 'none');

    var overviewBlocks = panelRoot.querySelectorAll('.panel-block--indicators');
    overviewBlocks.forEach(function (el) {
      setImportant(el, 'border-color', blockBorder);
      setImportant(el, 'background', blockBg);
      setImportant(el, 'box-shadow', 'inset 0 1px 0 rgba(255,255,255,0.08)');
      setImportant(el, 'opacity', '1');
      setImportant(el, 'filter', 'none');
      setImportant(el, 'color', textColor);
    });

    var trendBlocks = panelRoot.querySelectorAll('.panel-block--indicators .trend-meter');
    trendBlocks.forEach(function (el) {
      setImportant(el, 'border-color', trendBorder);
      setImportant(el, 'background', trendBg);
      setImportant(el, 'opacity', '1');
      setImportant(el, 'filter', 'none');
    });
    var trendItems = panelRoot.querySelectorAll('.panel-block--indicators .trend-meter__item');
    trendItems.forEach(function (el) {
      setImportant(el, 'border-color', trendBorder);
      setImportant(el, 'background', trendItemBg);
    });

    var headingNodes = panelRoot.querySelectorAll(
      '.panel-block--indicators .panel-block__head h4, .panel-block--indicators .indicator-meta, .panel-block--indicators .muted, ' +
      '.panel-block--indicators .trend-meter__title, .panel-block--indicators .trend-meter__overall-score, .panel-block--indicators .trend-meter__score, .panel-block--indicators .trend-meter__details'
    );
    headingNodes.forEach(function (el) {
      var color = (
        el.classList.contains('indicator-meta') ||
        el.classList.contains('muted') ||
        el.classList.contains('trend-meter__title') ||
        el.classList.contains('trend-meter__overall-score') ||
        el.classList.contains('trend-meter__score') ||
        el.classList.contains('trend-meter__details')
      ) ? mutedColor : textColor;
      setImportant(el, 'color', color);
    });
    var trendTfNodes = panelRoot.querySelectorAll('.panel-block--indicators .trend-meter__tf');
    trendTfNodes.forEach(function (el) { setImportant(el, 'color', textColor); });

    var statusPills = panelRoot.querySelectorAll(
      '#indicatorsOverallPill, #indicatorExplorerOverallPill, .panel-block--indicators > .panel-block__head .indicator-pill'
    );
    statusPills.forEach(function (el) {
      var borderColor = neutralBorder;
      var background = neutralBg;
      var color = textColor;
      if (el.classList.contains('indicator-pill--bullish')) {
        borderColor = bullishBorder;
        background = bullishBg;
        color = isLight ? '#0c6249' : '#dcfff1';
      } else if (el.classList.contains('indicator-pill--bearish')) {
        borderColor = bearishBorder;
        background = bearishBg;
        color = isLight ? '#8b2e40' : '#ffe0e6';
      }
      setImportant(el, 'color', color);
      setImportant(el, 'border-color', borderColor);
      setImportant(el, 'background', background);
      setImportant(el, 'opacity', '1');
      setImportant(el, 'filter', 'none');
      setImportant(el, 'box-shadow', '0 6px 14px rgba(0,0,0,0.2)');
      setImportant(el, '-webkit-print-color-adjust', 'exact');
      setImportant(el, 'print-color-adjust', 'exact');
    });
  }

  // Builds the full print document HTML used by single-panel PDF export.
  function buildSinglePanelExportPrintHtml(filename, panelHtml, theme) {
    var htmlContent = String(panelHtml || '').trim();
    var safeTheme = String(theme || document.documentElement.getAttribute('data-theme') || 'dark');
    var styles = ['styles/global.css', 'styles/themes.css', 'styles/components.css', 'styles/charts.css']
      .map(function (path) {
        try {
          return '<link rel="stylesheet" href="' + escapeHtml(new URL(path, window.location.href).href) + '" />';
        } catch (err) {
          return '';
        }
      })
      .join('');
    var printTitle = String(filename || 'panel-export').replace(/\.pdf$/i, '');
    var html =
      '<!DOCTYPE html>' +
      '<html lang="en" data-theme="' + escapeHtml(safeTheme) + '">' +
      '<head>' +
        '<meta charset="UTF-8" />' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
        '<title>' + escapeHtml(printTitle) + '</title>' +
        styles +
        '<style>' +
          '@page{size:auto;margin:10mm;}' +
          'html,body{height:auto;min-height:auto;}' +
          'body{margin:0;background:var(--bg,#0b1524);color:var(--text);overflow:visible;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
          '.panel-export-shell{max-width:none;height:auto;min-height:auto;padding:1rem;overflow:visible;display:block;}' +
          '.panel-export-shell > *{display:block!important;width:100%!important;float:none!important;clear:both!important;overflow:visible!important;height:auto!important;min-height:0!important;max-height:none!important;}' +
          '.panel-export-shell .side-panel,.panel-export-shell .right-panel,.panel-export-shell .indicators-panel{overflow:visible!important;height:auto!important;min-height:0!important;max-height:none!important;}' +
          '.panel-export-shell .panel-block,.panel-export-shell .fundamentals-grid,.panel-export-shell .indicators-timeframes,.panel-export-shell .trend-meter{overflow:visible!important;height:auto!important;min-height:0!important;max-height:none!important;}' +
          '.panel-export-shell .panel-block--fundamentals{border-color:rgba(255,255,255,0.16)!important;background:linear-gradient(168deg,rgba(255,255,255,0.07),rgba(255,255,255,0.026)),radial-gradient(circle at 8% -45%,rgba(44,182,255,0.2),transparent 62%)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,0.1)!important;}' +
          '.panel-export-shell .fundamentals-summary{border-color:rgba(255,255,255,0.14)!important;background:linear-gradient(170deg,rgba(255,255,255,0.052),rgba(255,255,255,0.016)),radial-gradient(circle at 14% -40%,rgba(44,182,255,0.14),transparent 64%)!important;}' +
          '.panel-export-shell .fundamentals-metric,.panel-export-shell .fundamentals-risk-row{border-color:rgba(255,255,255,0.14)!important;background:linear-gradient(170deg,rgba(255,255,255,0.052),rgba(255,255,255,0.016)),radial-gradient(circle at 14% -40%,rgba(44,182,255,0.14),transparent 64%)!important;}' +
          '.panel-export-shell .fundamentals-summary__score,.panel-export-shell .fundamentals-summary__stat > span,.panel-export-shell .fundamentals-section__title,.panel-export-shell .fundamentals-section__count,.panel-export-shell .fundamentals-metric__title,.panel-export-shell .fundamentals-metric small,.panel-export-shell .fundamentals-risk-meter__note,.panel-export-shell .muted{color:rgba(236,246,255,0.92)!important;}' +
          'html[data-theme="light"] .panel-export-shell .panel-block--fundamentals{border-color:rgba(15,23,42,0.13)!important;background:linear-gradient(168deg,rgba(255,255,255,0.98),rgba(247,251,255,0.94)),radial-gradient(circle at 8% -45%,rgba(44,182,255,0.14),transparent 64%)!important;}' +
          'html[data-theme="light"] .panel-export-shell .fundamentals-summary{border-color:rgba(15,23,42,0.1)!important;background:linear-gradient(170deg,rgba(255,255,255,0.94),rgba(248,252,255,0.9)),radial-gradient(circle at 14% -40%,rgba(44,182,255,0.12),transparent 64%)!important;}' +
          'html[data-theme="light"] .panel-export-shell .fundamentals-metric,html[data-theme="light"] .panel-export-shell .fundamentals-risk-row{border-color:rgba(15,23,42,0.1)!important;background:linear-gradient(170deg,rgba(255,255,255,0.94),rgba(248,252,255,0.9)),radial-gradient(circle at 14% -40%,rgba(44,182,255,0.12),transparent 64%)!important;}' +
          'html[data-theme="light"] .panel-export-shell .fundamentals-summary__score,html[data-theme="light"] .panel-export-shell .fundamentals-summary__stat > span,html[data-theme="light"] .panel-export-shell .fundamentals-section__title,html[data-theme="light"] .panel-export-shell .fundamentals-section__count,html[data-theme="light"] .panel-export-shell .fundamentals-metric__title,html[data-theme="light"] .panel-export-shell .fundamentals-metric small,html[data-theme="light"] .panel-export-shell .fundamentals-risk-meter__note,html[data-theme="light"] .panel-export-shell .muted{color:rgba(36,56,79,0.92)!important;}' +
          '.panel-export-shell .panel-expand-btn{display:none!important;}' +
          '@media print{.panel-export-shell{padding:0;}}' +
        '</style>' +
      '</head>' +
      '<body data-theme="' + escapeHtml(safeTheme) + '">' +
        '<div class="panel-export-shell">' + htmlContent + '</div>' +
      '</body>' +
      '</html>';
    return html;
  }

  // Opens a print window for a single panel clone (Indicators or Fundamentals).
  function openSinglePanelExportPrintDialog(filename, panelHtml, theme) {
    var html = buildSinglePanelExportPrintHtml(filename, panelHtml, theme);
    if (!html || !String(panelHtml || '').trim()) {
      setStatus('Panel export unavailable');
      return false;
    }
    var printWindow = window.open('', '_blank', 'width=1320,height=940');
    if (!printWindow) {
      setStatus('Popup blocked: allow popups to export panel PDF');
      return false;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onafterprint = function () {
      try { printWindow.close(); } catch (err) {}
    };
    printWindow.onload = function () {
      setTimeout(function () {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (err) {}
      }, 260);
    };
    setStatus('Opening print dialog for panel PDF...');
    return true;
  }

  // Builds normalized indicators panel export payload for print and zip workflows.
  function buildIndicatorsPanelExportPayload() {
    if (!ui || !ui.el || !ui.el.indicatorsPanel) return null;
    var clone = ui.el.indicatorsPanel.cloneNode(true);
    var theme = document.documentElement.getAttribute('data-theme');
    applyIndicatorsPrintBoost(clone, theme);
    var removeSelectors = ['#openIndicatorsPanelBtn', '#exportIndicatorsPdfBtn'];
    removeSelectors.forEach(function (sel) {
      var el = clone.querySelector(sel);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    var selectedAsset = getSelectedAsset(state.app.mode);
    return {
      filename: panelExportFilename('indicators', selectedAsset),
      panelHtml: clone.outerHTML,
      theme: theme
    };
  }

  // Builds normalized fundamentals panel export payload for print and zip workflows.
  function buildFundamentalsPanelExportPayload() {
    if (!ui || !ui.el || !ui.el.fundamentalsPanel) return null;
    var clone = ui.el.fundamentalsPanel.cloneNode(true);
    var theme = document.documentElement.getAttribute('data-theme');
    applyFundamentalsPrintBoost(clone, theme);
    var removeSelectors = ['#openFundamentalsPanelBtn', '#exportFundamentalsPdfBtn', '#btcDominancePanel'];
    removeSelectors.forEach(function (sel) {
      var el = clone.querySelector(sel);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    var selectedAsset = getSelectedAsset(state.app.mode);
    return {
      filename: panelExportFilename('fundamentals', selectedAsset),
      panelHtml: clone.outerHTML,
      theme: theme
    };
  }

  // Downloads a Blob with a provided filename.
  function downloadBlobFile(blob, filename) {
    var safeName = String(filename || 'download').trim() || 'download';
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 600);
  }

  // Renders a panel PDF on server and downloads it without opening print/popups.
  function renderServerPanelPdfAndDownload(filename, htmlDoc) {
    var endpoint = mainProxyBase() + '/api/export-panel-pdf';
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        filename: filename,
        html: String(htmlDoc || '')
      })
    }).then(function (response) {
      if (!response.ok) {
        return response.json().catch(function () { return {}; }).then(function (errBody) {
          var detail = String((errBody && (errBody.detail || errBody.error)) || ('HTTP ' + response.status)).trim();
          throw new Error(detail || 'Panel PDF export failed');
        });
      }
      return response.blob();
    }).then(function (blob) {
      downloadBlobFile(blob, filename);
      return true;
    });
  }

  // Exports Indicators panel only.
  function exportIndicatorsPanelPdf() {
    var payload = buildIndicatorsPanelExportPayload();
    if (!payload) {
      setStatus('Indicators export unavailable');
      return;
    }
    openSinglePanelExportPrintDialog(payload.filename, payload.panelHtml, payload.theme);
  }

  // Exports Fundamentals panel only (without BTC dominance block).
  function exportFundamentalsPanelPdf() {
    var payload = buildFundamentalsPanelExportPayload();
    if (!payload) {
      setStatus('Fundamentals export unavailable');
      return;
    }
    openSinglePanelExportPrintDialog(payload.filename, payload.panelHtml, payload.theme);
  }

  // Top-bar export: renders indicators + fundamentals PDFs server-side and downloads a ZIP bundle.
  function exportAnalysisZipBundle() {
    var indicatorsPayload = buildIndicatorsPanelExportPayload();
    var fundamentalsPayload = buildFundamentalsPanelExportPayload();
    if (!indicatorsPayload || !fundamentalsPayload) {
      setStatus('Analysis export unavailable');
      return;
    }
    var indicatorsHtml = buildSinglePanelExportPrintHtml(
      indicatorsPayload.filename,
      indicatorsPayload.panelHtml,
      indicatorsPayload.theme
    );
    var fundamentalsHtml = buildSinglePanelExportPrintHtml(
      fundamentalsPayload.filename,
      fundamentalsPayload.panelHtml,
      fundamentalsPayload.theme
    );
    if (!indicatorsHtml || !fundamentalsHtml) {
      setStatus('Analysis export unavailable');
      return;
    }

    var selectedAsset = getSelectedAsset(state.app.mode);
    var zipName = analysisZipFilename(selectedAsset);
    var endpoint = mainProxyBase() + '/api/export-analysis-zip';

    setStatus('Building analysis ZIP...');
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        zipFilename: zipName,
        files: [
          { filename: indicatorsPayload.filename, html: indicatorsHtml },
          { filename: fundamentalsPayload.filename, html: fundamentalsHtml }
        ]
      })
    }).then(function (response) {
      if (!response.ok) {
        return response.json().catch(function () { return {}; }).then(function (errBody) {
          var detail = String((errBody && (errBody.detail || errBody.error)) || ('HTTP ' + response.status)).trim();
          throw new Error(detail || 'Analysis ZIP export failed');
        });
      }
      return response.blob();
    }).then(function (blob) {
      downloadBlobFile(blob, zipName);
      setStatus('Analysis ZIP exported');
    }).catch(function (err) {
      if (state.app.apiDebugEnabled) {
        try { console.debug('[Export] Analysis ZIP failed', err && err.message ? err.message : err); } catch (noop) {}
      }
      setStatus('Analysis ZIP export failed');
    });
  }

  // Builds the Quick Summary block used by analysis PDF exports.
  function buildAnalysisExportSummaryPanelHtml(assetLabel, taLabel, taScore, qualityLabel, valuationLabel, riskLabel, riskScore) {
    return '<aside class="side-panel glass analysis-export-panel analysis-export-panel--summary">' +
      '<section class="panel-block mobile-quick-summary analysis-export__summary" aria-hidden="false">' +
        '<div class="section-header">' +
          '<h4>Quick Summary</h4>' +
          '<span class="muted">' + escapeHtml(assetLabel) + '</span>' +
        '</div>' +
        '<div class="mobile-quick-summary__grid">' +
          '<article class="mobile-quick-summary__tile">' +
            '<div class="mobile-quick-summary__tile-head">' +
              '<span class="mobile-quick-summary__tile-title">Indicators</span>' +
              '<span class="indicator-pill ' + mobileQuickSummaryToneClass(taLabel) + '">' + escapeHtml(taLabel) + '</span>' +
            '</div>' +
            '<div class="mobile-quick-summary__meta">Weighted score: <strong>' + escapeHtml(taScore == null ? 'n/a' : String(taScore)) + '</strong></div>' +
          '</article>' +
          '<article class="mobile-quick-summary__tile">' +
            '<div class="mobile-quick-summary__tile-head">' +
              '<span class="mobile-quick-summary__tile-title">Fundamentals</span>' +
              '<span class="indicator-pill ' + mobileQuickSummaryToneClass(qualityLabel) + '">' + escapeHtml(qualityLabel) + '</span>' +
            '</div>' +
            '<div class="mobile-quick-summary__meta">Valuation: <strong class="mobile-quick-summary__valuation ' + mobileQuickSummaryToneClass(valuationLabel) + '">' + escapeHtml(valuationLabel) + '</strong></div>' +
          '</article>' +
          '<article class="mobile-quick-summary__tile">' +
            '<div class="mobile-quick-summary__tile-head">' +
              '<span class="mobile-quick-summary__tile-title">Risk</span>' +
              '<span class="indicator-pill ' + mobileQuickSummaryToneClass(riskLabel) + '">' + escapeHtml(riskLabel) + '</span>' +
            '</div>' +
            '<div class="mobile-quick-summary__meta">1D score: <strong>' + escapeHtml(riskScore == null ? 'n/a' : String(Math.round(riskScore))) + '</strong></div>' +
          '</article>' +
        '</div>' +
      '</section>' +
    '</aside>';
  }

  // Normalizes a panel root into an export-safe wrapper class to avoid app layout CSS interference.
  function normalizeAnalysisExportPanelHtml(panelHtml) {
    return String(panelHtml || '');
  }

  // Opens a print window that mirrors the in-app analysis panel stack for PDF export.
  function openAnalysisExportPrintDialog(filename, summaryPanelHtml, fundamentalsHtml, riskSectionHtml, indicatorsHtml) {
    var riskPanel = document.createElement('aside');
    riskPanel.className = 'right-panel glass analysis-export-panel analysis-export-panel--risk';
    riskPanel.innerHTML =
      '<div class="section-header"><div><h3>Risk Meter</h3></div></div>' +
      '<section class="panel-block panel-block--fundamentals">' +
        '<div class="fundamentals-grid">' +
          (riskSectionHtml || '<div class="muted">No risk meter snapshot yet.</div>') +
        '</div>' +
      '</section>';

    var printWindow = window.open('', '_blank', 'width=1480,height=980');
    if (!printWindow) {
      setStatus('Popup blocked: allow popups to export analysis PDF');
      return false;
    }

    var theme = String(document.documentElement.getAttribute('data-theme') || 'dark');
    var styles = ['styles/global.css', 'styles/themes.css', 'styles/components.css', 'styles/charts.css']
      .map(function (path) {
        try {
          return '<link rel="stylesheet" href="' + escapeHtml(new URL(path, window.location.href).href) + '" />';
        } catch (err) {
          return '';
        }
      })
      .join('');
    var printTitle = String(filename || 'analysis-export').replace(/\.pdf$/i, '');
    var html =
      '<!DOCTYPE html>' +
      '<html lang="en" data-theme="' + escapeHtml(theme) + '">' +
      '<head>' +
        '<meta charset="UTF-8" />' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
        '<title>' + escapeHtml(printTitle) + '</title>' +
        styles +
        '<style>' +
          '@page{size:auto;margin:10mm;}' +
          'html,body{height:auto;min-height:auto;}' +
          'body{margin:0;background:var(--bg,#0b1524);color:var(--text);overflow:visible;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
          '.analysis-export-shell{max-width:none;height:auto;min-height:auto;padding:1rem;overflow:visible;display:block;}' +
          '.analysis-export__stack{margin-top:0;display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:0!important;overflow:visible;}' +
          '.analysis-export__stack > *{display:block!important;width:100%!important;float:none!important;clear:both!important;overflow:visible!important;height:auto!important;min-height:0!important;max-height:none!important;page-break-inside:auto;break-inside:auto;}' +
          '.analysis-export__stack > * + *{margin-top:0!important;}' +
          '.analysis-export__stack > .side-panel,.analysis-export__stack > .indicators-panel,.analysis-export__stack > .right-panel,.analysis-export__stack > .analysis-export-panel{overflow:visible!important;height:auto!important;min-height:0!important;max-height:none!important;}' +
          '.analysis-export__stack .panel-block,.analysis-export__stack .fundamentals-grid,.analysis-export__stack .indicators-timeframes,.analysis-export__stack .trend-meter{overflow:visible!important;height:auto!important;min-height:0!important;max-height:none!important;}' +
          '.analysis-export__summary.mobile-quick-summary{display:block!important;}' +
          '.analysis-export__summary .mobile-quick-summary__tile{cursor:default;}' +
          '.analysis-export__stack .panel-expand-btn{display:none!important;}' +
          '@media print{.analysis-export-shell{padding:0;}.analysis-export__stack{gap:0;}}' +
        '</style>' +
      '</head>' +
      '<body data-theme="' + escapeHtml(theme) + '">' +
        '<div class="analysis-export-shell">' +
          '<main class="analysis-export__stack">' +
            String(summaryPanelHtml || '') +
            String(fundamentalsHtml || '') +
            riskPanel.outerHTML +
            String(indicatorsHtml || '') +
          '</main>' +
        '</div>' +
      '</body>' +
      '</html>';

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onafterprint = function () {
      try { printWindow.close(); } catch (err) {}
    };
    printWindow.onload = function () {
      setTimeout(function () {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (err) {}
      }, 260);
    };
    setStatus('Opening print dialog for analysis PDF...');
    return true;
  }

  // Exports main UI analysis as two panel PDFs (Indicators + Fundamentals) without popups.
  function exportAnalysisPdf() {
    var selectedAsset = getSelectedAsset(state.app.mode);
    var filenameAsset = selectedAsset || null;
    var indicatorsPayload = buildIndicatorsPanelExportPayload();
    var fundamentalsPayload = buildFundamentalsPanelExportPayload();
    if (!indicatorsPayload || !fundamentalsPayload) {
      setStatus('Analysis export unavailable');
      return;
    }
    var indicatorsFilename = analysisPanelPdfFilename(filenameAsset, 'indicators');
    var fundamentalsFilename = analysisPanelPdfFilename(filenameAsset, 'fundamentals');
    var indicatorsDoc = buildSinglePanelExportPrintHtml(
      indicatorsFilename,
      indicatorsPayload.panelHtml,
      indicatorsPayload.theme
    );
    var fundamentalsDoc = buildSinglePanelExportPrintHtml(
      fundamentalsFilename,
      fundamentalsPayload.panelHtml,
      fundamentalsPayload.theme
    );
    setStatus('Preparing indicators and fundamentals PDFs...');
    Promise.all([
      renderServerPanelPdfAndDownload(indicatorsFilename, indicatorsDoc),
      renderServerPanelPdfAndDownload(fundamentalsFilename, fundamentalsDoc)
    ]).then(function () {
      setStatus('Indicators and fundamentals PDFs downloaded');
    }).catch(function (err) {
      if (state.app.apiDebugEnabled) {
        try { console.debug('[Export] Main panel PDF export failed', err && err.message ? err.message : err); } catch (noop) {}
      }
      setStatus('Export failed');
    });
  }

  // Exports the currently selected Explore asset as two panel PDFs (Indicators + Fundamentals).
  function exportAnalysisPdfFromExplorer() {
    if (!ui || !ui.el || !ui.el.indicatorExplorerModal) {
      setStatus('Analysis export unavailable');
      return;
    }
    var selected = INDICATOR_EXPLORER && INDICATOR_EXPLORER.selected ? INDICATOR_EXPLORER.selected : null;
    if (!selected) {
      setStatus('Select an asset in Explore first');
      return;
    }

    var exportAsset = explorerAssetFromTarget(selected);
    var assetLabel = selected.assetType === 'crypto'
      ? String(selected.baseSymbol || selected.symbol || selected.label || '').replace('/USD', '').trim().toUpperCase()
      : normalizeStockTicker(selected.yahooSymbol || selected.symbol || selected.label || '');
    if (!assetLabel) assetLabel = String(selected.label || (exportAsset && (exportAsset.symbol || exportAsset.name)) || 'Selected Asset').trim();
    var filenameAsset = exportAsset || { symbol: assetLabel };
    var exportTheme = document.documentElement.getAttribute('data-theme');

    var indicatorsContainer = document.createElement('aside');
    indicatorsContainer.className = 'indicators-panel glass';
    var indicatorHead = ui.el.indicatorExplorerAssetLabel ? ui.el.indicatorExplorerAssetLabel.closest('.panel-block') : null;
    var indicatorFrames = ui.el.indicatorExplorerTimeframes || null;
    if (indicatorHead) indicatorsContainer.appendChild(indicatorHead.cloneNode(true));
    if (indicatorFrames) indicatorsContainer.appendChild(indicatorFrames.cloneNode(true));
    applyIndicatorsPrintBoost(indicatorsContainer, exportTheme);
    var indicatorExpandBtns = indicatorsContainer.querySelectorAll('.panel-expand-btn');
    indicatorExpandBtns.forEach(function (btn) { btn.remove(); });

    var fundamentalsBlock = ui.el.indicatorExplorerFundamentalsGrid
      ? ui.el.indicatorExplorerFundamentalsGrid.closest('.panel-block')
      : null;
    var fundamentalsClone = fundamentalsBlock ? fundamentalsBlock.cloneNode(true) : null;
    if (fundamentalsClone) {
      applyFundamentalsPrintBoost(fundamentalsClone, exportTheme);
      var expandBtns = fundamentalsClone.querySelectorAll('.panel-expand-btn');
      expandBtns.forEach(function (btn) { btn.remove(); });
    }

    var fundamentalsContainer = document.createElement('aside');
    fundamentalsContainer.className = 'right-panel glass';
    if (fundamentalsClone) {
      fundamentalsContainer.appendChild(fundamentalsClone);
    } else {
      fundamentalsContainer.innerHTML = '<section class="panel-block panel-block--fundamentals"><div class="muted">No fundamentals snapshot yet.</div></section>';
    }

    var indicatorsFilename = analysisPanelPdfFilename(filenameAsset, 'indicators');
    var fundamentalsFilename = analysisPanelPdfFilename(filenameAsset, 'fundamentals');
    var indicatorsDoc = buildSinglePanelExportPrintHtml(indicatorsFilename, indicatorsContainer.outerHTML, exportTheme);
    var fundamentalsDoc = buildSinglePanelExportPrintHtml(fundamentalsFilename, fundamentalsContainer.outerHTML, exportTheme);
    setStatus('Preparing indicators and fundamentals PDFs...');
    Promise.all([
      renderServerPanelPdfAndDownload(indicatorsFilename, indicatorsDoc),
      renderServerPanelPdfAndDownload(fundamentalsFilename, fundamentalsDoc)
    ]).then(function () {
      setStatus('Indicators and fundamentals PDFs downloaded');
    }).catch(function (err) {
      if (state.app.apiDebugEnabled) {
        try { console.debug('[Export] Explorer panel PDF export failed', err && err.message ? err.message : err); } catch (noop) {}
      }
      setStatus('Export failed');
    });
  }

  // Destroys the allocation pie chart instance created inside the expanded panel viewer.
  function destroyPanelViewerAllocationChart() {
    if (PANEL_VIEWER_ALLOCATION_CHART && typeof PANEL_VIEWER_ALLOCATION_CHART.destroy === 'function') {
      PANEL_VIEWER_ALLOCATION_CHART.destroy();
    }
    PANEL_VIEWER_ALLOCATION_CHART = null;
  }

  // Computes allocation chart data for expanded panel mode without mutating main-page chart state.
  function buildAllocationViewerData() {
    var mode = state && state.app && state.app.mode === 'crypto' ? 'crypto' : 'stocks';
    var items = getModeComputedItems(mode);
    var sorted = (Array.isArray(items) ? items : []).slice().sort(function (a, b) {
      return (Number(b && b.marketValue || 0) || 0) - (Number(a && a.marketValue || 0) || 0);
    });
    if (mode !== 'stocks' || allocationModeStocks() !== 'sectors' || !window.PT || !window.PT.SectorAllocation) {
      var stockValues = sorted.map(function (item) { return Number(Number(item.marketValue || 0).toFixed(2)); });
      var stockLabels = sorted.map(function (item) { return item.symbol; });
      var stockPairs = stockLabels.map(function (label, idx) {
        return {
          label: label,
          value: Number(stockValues[idx] || 0) || 0,
          oldIndex: idx
        };
      }).sort(function (a, b) {
        if (b.value !== a.value) return b.value - a.value;
        return String(a.label || '').localeCompare(String(b.label || ''));
      });
      var stockIndexMap = {};
      stockPairs.forEach(function (entry, idx) {
        stockIndexMap[entry.oldIndex] = idx;
      });
      return {
        mode: 'stocks',
        labels: stockPairs.map(function (entry) { return entry.label; }),
        values: stockPairs.map(function (entry) { return entry.value; }),
        oldToNewIndexMap: stockIndexMap
      };
    }
    var sectorMetaMap = cachedSectorMetadataMapForItems(sorted);
    var grouped = window.PT.SectorAllocation.getThemeAllocationData
      ? window.PT.SectorAllocation.getThemeAllocationData(sorted, sectorMetaMap)
      : window.PT.SectorAllocation.getSectorAllocationData(sorted, sectorMetaMap);
    var sectorLabels = Array.isArray(grouped && grouped.labels) ? grouped.labels : [];
    var sectorValues = Array.isArray(grouped && grouped.values) ? grouped.values : [];
    var sectorPairs = sectorLabels.map(function (label, idx) {
      return {
        label: String(label || ''),
        value: Number(sectorValues[idx] || 0) || 0,
        oldIndex: idx
      };
    }).sort(function (a, b) {
      if (b.value !== a.value) return b.value - a.value;
      return String(a.label || '').localeCompare(String(b.label || ''));
    });
    var sectorIndexMap = {};
    sectorPairs.forEach(function (entry, idx) {
      sectorIndexMap[entry.oldIndex] = idx;
    });
    return {
      mode: 'sectors',
      labels: sectorPairs.map(function (entry) { return entry.label; }),
      values: sectorPairs.map(function (entry) { return entry.value; }),
      oldToNewIndexMap: sectorIndexMap
    };
  }

  function panelViewerAllocationColors(count) {
    var size = Math.max(0, Number(count) || 0);
    var out = [];
    var i;
    for (i = 0; i < size; i++) {
      out.push(AUTO_COLORS[i % AUTO_COLORS.length]);
    }
    return out;
  }

  function setPanelViewerLegendHoverState(legendEl, activeIndex) {
    if (!legendEl) return;
    var items = legendEl.querySelectorAll('.legend-item');
    var hasActive = isFinite(Number(activeIndex)) && Number(activeIndex) >= 0;
    var target = hasActive ? Number(activeIndex) : -1;
    items.forEach(function (item) {
      var idx = Number(item.getAttribute('data-allocation-index'));
      var isActive = hasActive && isFinite(idx) && idx === target;
      item.classList.toggle('is-active', isActive);
      item.classList.toggle('is-dimmed', hasActive && !isActive);
    });
  }

  function setPanelViewerStackHoverState(stackEl, activeIndex) {
    if (!stackEl) return;
    var segments = stackEl.querySelectorAll('.allocation-viewer-segment');
    var hasActive = isFinite(Number(activeIndex)) && Number(activeIndex) >= 0;
    var target = hasActive ? Number(activeIndex) : -1;
    segments.forEach(function (seg) {
      var idx = Number(seg.getAttribute('data-allocation-index'));
      var isActive = hasActive && isFinite(idx) && idx === target;
      seg.classList.toggle('is-active', isActive);
      seg.classList.toggle('is-dimmed', hasActive && !isActive);
    });
  }

  // Renders a vertical stacked allocation chart inside expanded panel clone and wires hover sync.
  function renderPanelViewerAllocationPreview(clone) {
    if (!clone) return;
    var chartCanvas = clone.querySelector('#allocationChart');
    var fallbackEl = clone.querySelector('#pieFallback');
    var stocksBtn = clone.querySelector('#allocationModeStocksBtn');
    var sectorsBtn = clone.querySelector('#allocationModeSectorsBtn');
    var modeToggle = clone.querySelector('#allocationModeToggle');
    var chartWrap = clone.querySelector('.chart-wrap--pie');
    var legendEl = clone.querySelector('#allocationLegend');
    var actionsHost = clone.querySelector('.holdings-header-actions');
    var stocksActive = allocationModeStocks() !== 'sectors';
    if (modeToggle) {
      modeToggle.classList.toggle('hidden', state.app.mode !== 'stocks');
    }
    if (stocksBtn) {
      stocksBtn.classList.toggle('is-active', stocksActive);
      stocksBtn.setAttribute('aria-pressed', stocksActive ? 'true' : 'false');
      stocksBtn.addEventListener('click', function () {
        if (state.app.mode !== 'stocks') return;
        applyStockAllocationMode('stocks');
        renderPanelViewerContent();
      });
    }
    if (sectorsBtn) {
      sectorsBtn.classList.toggle('is-active', !stocksActive);
      sectorsBtn.setAttribute('aria-pressed', stocksActive ? 'false' : 'true');
      sectorsBtn.addEventListener('click', function () {
        if (state.app.mode !== 'stocks') return;
        applyStockAllocationMode('sectors');
        renderPanelViewerContent();
      });
    }
    if (actionsHost && state.app.mode === 'stocks') {
      var resetBtn = actionsHost.querySelector('[data-panel-reset-sectors]');
      if (!resetBtn) {
        resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'btn btn--ghost btn--tiny';
        resetBtn.setAttribute('data-panel-reset-sectors', '1');
        resetBtn.textContent = 'Reset sectors';
        actionsHost.appendChild(resetBtn);
      }
      // Expanded panel: force visibility even if the source button is hidden in main UI.
      resetBtn.classList.remove('hidden');
      resetBtn.disabled = allocationModeStocks() !== 'sectors';
      resetBtn.title = resetBtn.disabled
        ? 'Switch to Sectors mode to reset custom sectors'
        : 'Reset custom sectors to algorithm classification';
      resetBtn.addEventListener('click', function (event) {
        event.preventDefault();
        if (resetBtn.disabled) return;
        var modeItems = getModeComputedItems('stocks');
        resetCustomSectorsForItems(modeItems);
      });
    }

    destroyPanelViewerAllocationChart();
    if (!chartWrap || !legendEl) {
      return;
    }
    if (chartCanvas && chartCanvas.parentNode) chartCanvas.parentNode.removeChild(chartCanvas);
    if (fallbackEl && fallbackEl.parentNode) fallbackEl.parentNode.removeChild(fallbackEl);

    var split = clone.querySelector('.allocation-viewer-split');
    if (!split) {
      split = document.createElement('div');
      split.className = 'allocation-viewer-split';
    }
    if (split.parentNode !== chartWrap.parentNode && chartWrap.parentNode) {
      chartWrap.parentNode.insertBefore(split, chartWrap);
    }
    if (legendEl.parentNode !== split) split.appendChild(legendEl);
    if (chartWrap.parentNode !== split) split.appendChild(chartWrap);

    legendEl.classList.add('allocation-viewer-legend');
    chartWrap.classList.add('allocation-viewer-chart-wrap');

    var data = buildAllocationViewerData();
    var labels = Array.isArray(data.labels) ? data.labels : [];
    var values = Array.isArray(data.values) ? data.values : [];
    var oldToNewIndexMap = data && data.oldToNewIndexMap && typeof data.oldToNewIndexMap === 'object'
      ? data.oldToNewIndexMap
      : {};
    var colors = panelViewerAllocationColors(values.length);
    var total = 0;
    values.forEach(function (v) { total += Number(v || 0) || 0; });

    if (legendEl) {
      legendEl.addEventListener('click', function (event) {
        var editBtn = event.target && event.target.closest ? event.target.closest('[data-edit-sector-symbol]') : null;
        if (!editBtn) return;
        event.preventDefault();
        event.stopPropagation();
        var symbol = String(editBtn.getAttribute('data-edit-sector-symbol') || '').trim().toUpperCase();
        if (!symbol) return;
        var modeItems = getModeComputedItems('stocks');
        var metaMap = cachedSectorMetadataMapForItems(modeItems);
        editStockSectorFromLegend(symbol, modeItems, metaMap);
      });
      var legendItems = Array.prototype.slice.call(legendEl.querySelectorAll('.legend-item'));
      legendItems.forEach(function (item) {
        var oldIndex = Number(item.getAttribute('data-allocation-index'));
        if (!isFinite(oldIndex)) return;
        var mapped = oldToNewIndexMap.hasOwnProperty(oldIndex) ? Number(oldToNewIndexMap[oldIndex]) : oldIndex;
        if (isFinite(mapped)) item.setAttribute('data-allocation-index', String(mapped));
      });
    }

    chartWrap.innerHTML = '';
    var stack = document.createElement('div');
    stack.className = 'allocation-viewer-stack';
    var info = document.createElement('div');
    info.className = 'allocation-viewer-stack__info muted';
    info.textContent = 'Hover segment';

    if (!values.length || total <= 0) {
      var empty = document.createElement('div');
      empty.className = 'muted allocation-viewer-stack__empty';
      empty.textContent = 'No allocation data';
      chartWrap.appendChild(empty);
      setPanelViewerLegendHoverState(legendEl, -1);
      return;
    }

    var bar = document.createElement('div');
    bar.className = 'allocation-viewer-stack__bar';
    values.forEach(function (rawValue, idx) {
      var value = Math.max(0, Number(rawValue || 0) || 0);
      if (value <= 0) return;
      var label = String(labels[idx] || '').trim() || 'Allocation';
      var pct = total > 0 ? (value / total) * 100 : 0;
      var tip = data.mode === 'sectors'
        ? (label + ': ' + pct.toFixed(1) + '% of portfolio')
        : (label + ': ' + value.toLocaleString(undefined, { maximumFractionDigits: 2 }));
      var segment = document.createElement('button');
      segment.type = 'button';
      segment.className = 'allocation-viewer-segment';
      segment.setAttribute('data-allocation-index', String(idx));
      segment.setAttribute('aria-label', tip);
      segment.title = tip;
      segment.style.backgroundColor = colors[idx];
      segment.style.flexGrow = String(Math.max(0.0001, value));
      bar.appendChild(segment);
    });

    function clearHoverState() {
      setPanelViewerLegendHoverState(legendEl, -1);
      setPanelViewerStackHoverState(bar, -1);
      info.textContent = 'Hover segment';
    }

    function setHoverStateByIndex(idx) {
      if (!isFinite(Number(idx))) return;
      var index = Number(idx);
      if (index < 0 || index >= labels.length) return;
      setPanelViewerLegendHoverState(legendEl, index);
      setPanelViewerStackHoverState(bar, index);
      var label = String(labels[index] || '').trim() || 'Allocation';
      var value = Number(values[index] || 0) || 0;
      var pct = total > 0 ? (value / total) * 100 : 0;
      info.textContent = label + ' • ' + pct.toFixed(1) + '%';
    }

    legendEl.addEventListener('mouseover', function (event) {
      var item = event.target && event.target.closest ? event.target.closest('.legend-item') : null;
      if (!item) return;
      var idx = Number(item.getAttribute('data-allocation-index'));
      if (!isFinite(idx)) return;
      setHoverStateByIndex(idx);
    });
    legendEl.addEventListener('mouseleave', clearHoverState);
    legendEl.addEventListener('focusin', function (event) {
      var item = event.target && event.target.closest ? event.target.closest('.legend-item') : null;
      if (!item) return;
      var idx = Number(item.getAttribute('data-allocation-index'));
      if (!isFinite(idx)) return;
      setHoverStateByIndex(idx);
    });
    legendEl.addEventListener('focusout', function (event) {
      if (legendEl.contains(event.relatedTarget)) return;
      clearHoverState();
    });

    bar.addEventListener('mouseover', function (event) {
      var segment = event.target && event.target.closest ? event.target.closest('.allocation-viewer-segment') : null;
      if (!segment) return;
      var idx = Number(segment.getAttribute('data-allocation-index'));
      if (!isFinite(idx)) return;
      setHoverStateByIndex(idx);
    });
    bar.addEventListener('mouseleave', clearHoverState);
    bar.addEventListener('focusin', function (event) {
      var segment = event.target && event.target.closest ? event.target.closest('.allocation-viewer-segment') : null;
      if (!segment) return;
      var idx = Number(segment.getAttribute('data-allocation-index'));
      if (!isFinite(idx)) return;
      setHoverStateByIndex(idx);
    });
    bar.addEventListener('focusout', function (event) {
      if (bar.contains(event.relatedTarget)) return;
      clearHoverState();
    });

    stack.appendChild(info);
    stack.appendChild(bar);
    chartWrap.appendChild(stack);
  }

  // Renders the currently selected panel clone into the panel viewer modal body.
  function renderPanelViewerContent() {
    if (!ui || !ui.el || !ui.el.panelViewerHost) return;
    var cfg = getPanelViewerConfig(PANEL_VIEWER.type);
    if (!cfg || !cfg.source) {
      if (ui.el.panelViewerModal) ui.el.panelViewerModal.removeAttribute('data-panel-type');
      ui.el.panelViewerHost.innerHTML = '<div class="muted">Panel unavailable.</div>';
      return;
    }
    if (ui.el.panelViewerModal) ui.el.panelViewerModal.setAttribute('data-panel-type', cfg.type);
    destroyPanelViewerAllocationChart();
    if (ui.el.panelViewerTitle) ui.el.panelViewerTitle.textContent = cfg.title;
    if (ui.el.panelViewerSubtitle) {
      var subtitleText = Object.prototype.hasOwnProperty.call(cfg, 'subtitle')
        ? String(cfg.subtitle || '')
        : 'Expanded panel preview.';
      ui.el.panelViewerSubtitle.textContent = subtitleText;
      ui.el.panelViewerSubtitle.classList.toggle('hidden', !subtitleText);
    }
    var clone = sanitizePanelViewerClone(cfg.source.cloneNode(true), cfg.type);
    var preview = document.createElement('div');
    preview.className = 'panel-viewer-preview panel-viewer-preview--' + cfg.type;
    preview.appendChild(clone);
    if (cfg.type === 'holdings') {
      var clonedRefreshBtn = clone.querySelector('#holdingsRefreshBtn');
      if (clonedRefreshBtn) {
        clonedRefreshBtn.addEventListener('click', function () {
          runManualRefreshAction();
        });
      }
      var clonedSort = clone.querySelector('#holdingsSortSelect');
      if (clonedSort) {
        clonedSort.addEventListener('change', function () {
          state.app.sortBy = clonedSort.value || 'az';
          renderAll();
        });
      }
    }
    ui.el.panelViewerHost.innerHTML = '';
    ui.el.panelViewerHost.appendChild(preview);
    if (cfg.type === 'allocation') {
      renderPanelViewerAllocationPreview(clone);
    }
  }

  // Opens the panel viewer modal with a cloned panel (desktop only).
  function openPanelViewer(type) {
    if (!canOpenPanelViewer()) return;
    if (!ui || !ui.el || !ui.el.panelViewerModal) return;
    var cfg = getPanelViewerConfig(type);
    if (!cfg || !cfg.source) return;
    PANEL_VIEWER.type = cfg.type;
    ui.el.panelViewerModal.classList.remove('hidden');
    ui.el.panelViewerModal.setAttribute('aria-hidden', 'false');
    renderPanelViewerContent();
    if (ui.el.panelViewerCloseBtn) ui.el.panelViewerCloseBtn.focus();
  }

  // Closes and clears the panel viewer modal state.
  function closePanelViewer() {
    if (!ui || !ui.el || !ui.el.panelViewerModal) return;
    PANEL_VIEWER.type = null;
    destroyPanelViewerAllocationChart();
    ui.el.panelViewerModal.removeAttribute('data-panel-type');
    ui.el.panelViewerModal.classList.add('hidden');
    ui.el.panelViewerModal.setAttribute('aria-hidden', 'true');
    if (ui.el.panelViewerHost) ui.el.panelViewerHost.innerHTML = '';
  }

  // Resolves a safe external URL from anchor/link input for the desktop link viewer.
  function resolveDesktopLinkViewerUrl(rawUrl) {
    var text = String(rawUrl || '').trim();
    if (!text || text === '#') return null;
    try {
      var parsed = new URL(text, window.location.href);
      if (!/^https?:$/i.test(String(parsed.protocol || ''))) return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  // Resolves the proxy base used for desktop link embeddability checks.
  function mainProxyBase() {
    var cfg = window.PT_CONFIG || {};
    if (Object.prototype.hasOwnProperty.call(cfg, 'proxyBase')) {
      return String(cfg.proxyBase || '').replace(/\/$/, '');
    }
    if (location.protocol === 'file:') return 'http://localhost:5500';
    return String(location.origin || '').replace(/\/$/, '');
  }

  // Builds a stable local cache key for per-origin link preview checks.
  function linkViewerCheckCacheKey(urlText) {
    var safeUrl = String(urlText || '').trim();
    var safeOrigin = String(window.location && window.location.origin || '').trim().toLowerCase();
    return safeUrl + '|' + safeOrigin;
  }

  // Reads a fresh cached link preview capability check result.
  function getCachedLinkViewerCheck(urlText) {
    var key = linkViewerCheckCacheKey(urlText);
    var row = LINK_VIEWER_CHECK_CACHE[key];
    if (!row) return null;
    if (Number(row.expiresAt || 0) <= Date.now()) {
      delete LINK_VIEWER_CHECK_CACHE[key];
      return null;
    }
    return row.value || null;
  }

  // Stores link preview check result with TTL to avoid duplicate proxy calls.
  function setCachedLinkViewerCheck(urlText, value) {
    var key = linkViewerCheckCacheKey(urlText);
    LINK_VIEWER_CHECK_CACHE[key] = {
      expiresAt: Date.now() + LINK_VIEWER_CHECK_TTL_MS,
      value: value || null
    };
  }

  // Checks whether a URL likely supports iframe embedding for current app origin.
  function checkDesktopLinkViewerSupport(urlText) {
    var parsed = resolveDesktopLinkViewerUrl(urlText);
    if (!parsed) {
      return Promise.resolve({
        embeddable: false,
        reason: 'Invalid URL',
        finalUrl: String(urlText || '').trim()
      });
    }
    var safeUrl = parsed.toString();
    var cached = getCachedLinkViewerCheck(safeUrl);
    if (cached) return Promise.resolve(cached);
    var base = mainProxyBase();
    var endpoint = base + '/api/link-preview/check?url=' + encodeURIComponent(safeUrl) +
      '&origin=' + encodeURIComponent(String(window.location && window.location.origin || ''));
    return fetch(endpoint, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (payload) {
      var resolved = {
        embeddable: !!(payload && payload.embeddable),
        reason: String(payload && payload.reason || ''),
        finalUrl: String(payload && payload.finalUrl || safeUrl)
      };
      setCachedLinkViewerCheck(safeUrl, resolved);
      return resolved;
    }).catch(function (err) {
      var fallback = {
        embeddable: false,
        reason: String(err && err.message || 'Preview check failed'),
        finalUrl: safeUrl
      };
      setCachedLinkViewerCheck(safeUrl, fallback);
      return fallback;
    });
  }

  // Builds a compact modal title from link metadata.
  function resolveDesktopLinkViewerTitle(linkEl, parsedUrl) {
    var fromAttr = linkEl && linkEl.getAttribute ? String(linkEl.getAttribute('data-link-title') || '').trim() : '';
    if (fromAttr) return fromAttr;
    var fromAria = linkEl && linkEl.getAttribute ? String(linkEl.getAttribute('aria-label') || '').trim() : '';
    if (fromAria) return fromAria;
    var text = linkEl ? String(linkEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
    if (text) return text;
    var host = parsedUrl && parsedUrl.hostname ? String(parsedUrl.hostname || '').replace(/^www\./i, '') : '';
    return host || 'External Link';
  }

  // Opens an external link inside the desktop modal viewer.
  function openDesktopLinkViewer(rawUrl, title, opts) {
    if (!canOpenPanelViewer()) return;
    var parsed = resolveDesktopLinkViewerUrl(rawUrl);
    if (!parsed) return;
    var options = opts && typeof opts === 'object' ? opts : {};
    if (!ui || !ui.el || !ui.el.linkViewerModal) {
      window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
      return;
    }
    LINK_VIEWER.url = parsed.toString();
    LINK_VIEWER.title = String(title || '').trim() || parsed.hostname.replace(/^www\./i, '') || 'External Link';
    if (ui.el.linkViewerTitle) ui.el.linkViewerTitle.textContent = LINK_VIEWER.title;
    var blocked = !!options.blocked;
    var blockedReason = String(options.reason || '').trim();
    var subtitle = blocked
      ? (blockedReason || 'This site blocks embedded previews. Use "Open in new tab".')
      : (parsed.hostname.replace(/^www\./i, '') || parsed.toString());
    if (ui.el.linkViewerSubtitle) ui.el.linkViewerSubtitle.textContent = subtitle;
    if (ui.el.linkViewerOpenExternalBtn) ui.el.linkViewerOpenExternalBtn.href = LINK_VIEWER.url;
    if (ui.el.linkViewerFrame) ui.el.linkViewerFrame.src = blocked ? 'about:blank' : LINK_VIEWER.url;
    if (ui.el.linkViewerFallback) {
      ui.el.linkViewerFallback.textContent = blocked
        ? 'Preview blocked by site policy. Open this link in a new tab.'
        : 'If a site blocks embedded preview, use "Open in new tab".';
    }
    if (ui.el.linkViewerModal) ui.el.linkViewerModal.classList.toggle('link-viewer-modal--blocked', blocked);
    if (ui.el.linkViewerFrame && ui.el.linkViewerFrame.parentNode && ui.el.linkViewerFrame.parentNode.classList) {
      ui.el.linkViewerFrame.parentNode.classList.toggle('is-blocked', blocked);
    }
    ui.el.linkViewerModal.classList.remove('hidden');
    ui.el.linkViewerModal.setAttribute('aria-hidden', 'false');
    if (ui.el.linkViewerCloseBtn) ui.el.linkViewerCloseBtn.focus();
  }

  // Closes and resets the desktop link viewer modal.
  function closeDesktopLinkViewer() {
    if (!ui || !ui.el || !ui.el.linkViewerModal) return;
    LINK_VIEWER.url = '';
    LINK_VIEWER.title = '';
    ui.el.linkViewerModal.classList.add('hidden');
    ui.el.linkViewerModal.setAttribute('aria-hidden', 'true');
    if (ui.el.linkViewerFrame) ui.el.linkViewerFrame.src = 'about:blank';
    if (ui.el.linkViewerFrame && ui.el.linkViewerFrame.parentNode && ui.el.linkViewerFrame.parentNode.classList) {
      ui.el.linkViewerFrame.parentNode.classList.remove('is-blocked');
    }
    if (ui.el.linkViewerModal) ui.el.linkViewerModal.classList.remove('link-viewer-modal--blocked');
    if (ui.el.linkViewerOpenExternalBtn) ui.el.linkViewerOpenExternalBtn.href = '#';
    if (ui.el.linkViewerTitle) ui.el.linkViewerTitle.textContent = 'Link Preview';
    if (ui.el.linkViewerSubtitle) ui.el.linkViewerSubtitle.textContent = 'Open any external link in-app.';
    if (ui.el.linkViewerFallback) ui.el.linkViewerFallback.textContent = 'If a site blocks embedded preview, use "Open in new tab".';
  }

  function runIndicatorExplorerSearch() {
    if (INDICATOR_EXPLORER_SEARCH_TIMER) {
      clearTimeout(INDICATOR_EXPLORER_SEARCH_TIMER);
      INDICATOR_EXPLORER_SEARCH_TIMER = null;
    }
    var inputEl = ui.el.indicatorExplorerSearchInput;
    if (!inputEl) return;
    if (INDICATOR_EXPLORER.view === 'favorites') return;
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

  // Debounces live Explore search requests so APIs are called only after typing settles.
  function scheduleIndicatorExplorerSearch() {
    if (INDICATOR_EXPLORER_SEARCH_TIMER) clearTimeout(INDICATOR_EXPLORER_SEARCH_TIMER);
    INDICATOR_EXPLORER_SEARCH_TIMER = setTimeout(function () {
      INDICATOR_EXPLORER_SEARCH_TIMER = null;
      runIndicatorExplorerSearch();
    }, 500);
  }

  // Clears Explore search input and pending autocomplete state before a new query.
  function clearIndicatorExplorerSearchInput() {
    if (!ui || !ui.el || !ui.el.indicatorExplorerSearchInput) return;
    if (INDICATOR_EXPLORER.view === 'favorites') return;
    if (INDICATOR_EXPLORER_SEARCH_TIMER) {
      clearTimeout(INDICATOR_EXPLORER_SEARCH_TIMER);
      INDICATOR_EXPLORER_SEARCH_TIMER = null;
    }
    ui.el.indicatorExplorerSearchInput.value = '';
    INDICATOR_EXPLORER.query = '';
    INDICATOR_EXPLORER.results = [];
    hideIndicatorExplorerSearchResults();
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
    if (ui.el.indicatorExplorerChartTradingViewBtn) {
      var chartUrl = buildIndicatorExplorerTradingViewUrl(INDICATOR_EXPLORER.selected);
      ui.el.indicatorExplorerChartTradingViewBtn.href = chartUrl || '#';
      ui.el.indicatorExplorerChartTradingViewBtn.classList.toggle('is-disabled', !chartUrl);
      ui.el.indicatorExplorerChartTradingViewBtn.setAttribute('aria-disabled', chartUrl ? 'false' : 'true');
      ui.el.indicatorExplorerChartTradingViewBtn.tabIndex = chartUrl ? 0 : -1;
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

  function formatIndicatorExplorerChartPrice(target, value) {
    var price = Number(value);
    if (!isFinite(price) || price <= 0) return '';
    if (target && target.assetType === 'crypto') {
      var abs = Math.abs(price);
      var maxDigits = abs >= 1000 ? 2 : (abs >= 1 ? 4 : 6);
      return '$' + price.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: maxDigits
      });
    }
    if (ui && typeof ui.fmtCurrency === 'function') return ui.fmtCurrency(price);
    return '$' + price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function indicatorExplorerChartTitle(target, timeframeId, latestPrice) {
    var label = String(target && (target.label || target.symbol) || 'Asset').trim() || 'Asset';
    var tfLabel = normalizeChartTimeframe(timeframeId);
    var priceText = formatIndicatorExplorerChartPrice(target, latestPrice);
    return label + ' Chart' + (priceText ? (' • ' + priceText) : '') + ' • ' + tfLabel;
  }

  // Builds the TradingView URL for the selected Explore target.
  function buildIndicatorExplorerTradingViewUrl(target) {
    if (!target) return '';
    if (target.assetType === 'crypto') {
      var base = String(target.baseSymbol || target.symbol || '').replace('/USD', '').trim().toUpperCase();
      if (!base) return '';
      return 'https://www.tradingview.com/symbols/' + encodeURIComponent(base + 'USD') + '/';
    }
    var symbol = normalizeStockTicker(target.yahooSymbol || target.symbol || '');
    if (!symbol) return '';
    return 'https://www.tradingview.com/symbols/' + encodeURIComponent(symbol) + '/';
  }

  // Renders the one-line Explore summary bar above indicators/fundamentals.
  function renderIndicatorExplorerSummaryBar() {
    if (!ui || !ui.el || !ui.el.indicatorExplorerSummaryBar) return;
    var selected = INDICATOR_EXPLORER && INDICATOR_EXPLORER.selected ? INDICATOR_EXPLORER.selected : null;
    if (!selected) {
      if (ui.el.indicatorExplorerSummaryAsset) ui.el.indicatorExplorerSummaryAsset.textContent = 'No asset selected';
      if (ui.el.indicatorExplorerExportAnalysisBtn) {
        ui.el.indicatorExplorerExportAnalysisBtn.disabled = true;
        ui.el.indicatorExplorerExportAnalysisBtn.title = 'Select an asset to export analysis PDF';
      }
      if (ui.el.indicatorExplorerSummaryPriceBadge) {
        ui.el.indicatorExplorerSummaryPriceBadge.classList.add('hidden');
        ui.el.indicatorExplorerSummaryPriceBadge.innerHTML = '';
      }
      return;
    }
    var symbol = selected.assetType === 'crypto'
      ? String(selected.baseSymbol || selected.symbol || '').replace('/USD', '').trim().toUpperCase()
      : normalizeStockTicker(selected.yahooSymbol || selected.symbol || '');
    if (ui.el.indicatorExplorerSummaryAsset) {
      ui.el.indicatorExplorerSummaryAsset.textContent = symbol || selected.label || 'Selected asset';
    }
    if (ui.el.indicatorExplorerExportAnalysisBtn) {
      ui.el.indicatorExplorerExportAnalysisBtn.disabled = false;
      ui.el.indicatorExplorerExportAnalysisBtn.title = 'Export analysis PDF';
    }
    if (!ui.el.indicatorExplorerSummaryPriceBadge) return;
    var summary = getIndicatorExplorerTargetQuoteSummary(selected);
    if (!summary || summary.price === null) {
      ui.el.indicatorExplorerSummaryPriceBadge.classList.add('hidden');
      ui.el.indicatorExplorerSummaryPriceBadge.innerHTML = '';
      return;
    }
    var priceText = typeof ui.fmtAssetUnitPrice === 'function'
      ? ui.fmtAssetUnitPrice(summary.price, selected.assetType === 'crypto' ? 'crypto' : 'stock')
      : (typeof ui.fmtCurrency === 'function'
        ? ui.fmtCurrency(summary.price)
        : ('$' + Number(summary.price).toLocaleString(undefined, { maximumFractionDigits: 2 })));
    var cls = summary.dayPct == null
      ? 'pl--flat'
      : (typeof ui.pctClass === 'function' ? ui.pctClass(summary.dayPct) : (summary.dayPct > 0 ? 'pl--pos' : (summary.dayPct < 0 ? 'pl--neg' : 'pl--flat')));
    var dayText = summary.dayPct == null
      ? '—'
      : (typeof ui.pctText === 'function'
        ? ui.pctText(summary.dayPct)
        : ((summary.dayPct > 0 ? '+' : '') + Number(summary.dayPct).toFixed(2) + '%'));
    ui.el.indicatorExplorerSummaryPriceBadge.innerHTML =
      '<span class="detail-price-badge__price">' + escapeHtml(priceText) + '</span>' +
      '<span class="detail-price-badge__change ' + escapeHtml(cls) + '">' + escapeHtml(dayText) + '</span>';
    ui.el.indicatorExplorerSummaryPriceBadge.classList.remove('hidden');
  }

  // Renders a compact TA/FA quick summary for Explore in mobile layout.
  function renderIndicatorExplorerQuickSummary() {
    if (!ui || !ui.el || !ui.el.indicatorExplorerQuickSummaryPanel || !ui.el.indicatorExplorerQuickSummaryGrid) return;
    var panelEl = ui.el.indicatorExplorerQuickSummaryPanel;
    var selected = INDICATOR_EXPLORER && INDICATOR_EXPLORER.selected ? INDICATOR_EXPLORER.selected : null;
    var showingFavorites = INDICATOR_EXPLORER && INDICATOR_EXPLORER.view === 'favorites';
    var isMobileLayout = window.matchMedia('(max-width: 1120px)').matches;
    if (!isMobileLayout || !selected || showingFavorites) {
      panelEl.classList.add('hidden');
      panelEl.setAttribute('aria-hidden', 'true');
      ui.el.indicatorExplorerQuickSummaryGrid.innerHTML = '';
      if (ui.el.indicatorExplorerQuickSummaryAsset) ui.el.indicatorExplorerQuickSummaryAsset.textContent = 'No asset selected';
      return;
    }

    var taPanel = INDICATOR_EXPLORER.panel || {};
    var taLabel = String(taPanel.overallStatus || 'n/a').trim() || 'n/a';
    var taScore = isFinite(Number(taPanel.weightedScore)) ? Number(taPanel.weightedScore) : null;
    var faPanel = INDICATOR_EXPLORER.fundamentals && INDICATOR_EXPLORER.fundamentals.panel
      ? INDICATOR_EXPLORER.fundamentals.panel
      : null;
    var qualityLabel = faPanel ? String(faPanel.qualityLabel || faPanel.label || 'n/a').trim() || 'n/a' : 'n/a';
    var valuationLabel = faPanel ? String(faPanel.valuationLabel || 'n/a').trim() || 'n/a' : 'n/a';
    if (!fundamentalsPanelHasMetrics(faPanel)) {
      qualityLabel = 'n/a';
      valuationLabel = 'n/a';
    }
    var riskLabel = 'n/a';
    var riskScore = null;
    if (faPanel && faPanel.riskMeter && typeof faPanel.riskMeter === 'object') {
      var riskFrames = faPanel.riskMeter.timeframes && typeof faPanel.riskMeter.timeframes === 'object'
        ? faPanel.riskMeter.timeframes
        : {};
      var riskRow = riskFrames['1d'] || riskFrames['1w'] || riskFrames['1m'] || null;
      if (riskRow && typeof riskRow === 'object') {
        riskLabel = String(riskRow.label || 'n/a').trim() || 'n/a';
        riskScore = isFinite(Number(riskRow.score)) ? Number(riskRow.score) : null;
      }
    }
    if (selected.assetType === 'crypto' && (!valuationLabel || valuationLabel === 'n/a')) {
      valuationLabel = String(faPanel && faPanel.label || 'n/a').trim() || 'n/a';
    }
    var symbolText = selected.assetType === 'crypto'
      ? String(selected.baseSymbol || selected.symbol || '').replace('/USD', '').trim().toUpperCase()
      : normalizeStockTicker(selected.yahooSymbol || selected.symbol || '');
    if (!symbolText) symbolText = selected.label || 'Selected asset';
    if (ui.el.indicatorExplorerQuickSummaryAsset) ui.el.indicatorExplorerQuickSummaryAsset.textContent = symbolText;

    ui.el.indicatorExplorerQuickSummaryGrid.innerHTML =
      '<article class="mobile-quick-summary__tile">' +
        '<div class="mobile-quick-summary__tile-head">' +
          '<span class="mobile-quick-summary__tile-title">Indicators</span>' +
          '<span class="indicator-pill ' + mobileQuickSummaryToneClass(taLabel) + '">' + escapeHtml(taLabel) + '</span>' +
        '</div>' +
        '<div class="mobile-quick-summary__meta">Weighted score: <strong>' + escapeHtml(taScore == null ? 'n/a' : String(taScore)) + '</strong></div>' +
      '</article>' +
      '<article class="mobile-quick-summary__tile">' +
        '<div class="mobile-quick-summary__tile-head">' +
          '<span class="mobile-quick-summary__tile-title">Fundamentals</span>' +
          '<span class="indicator-pill ' + mobileQuickSummaryToneClass(qualityLabel) + '">' + escapeHtml(qualityLabel) + '</span>' +
        '</div>' +
        '<div class="mobile-quick-summary__meta">Valuation: <strong class="mobile-quick-summary__valuation ' + mobileQuickSummaryToneClass(valuationLabel) + '">' + escapeHtml(valuationLabel) + '</strong></div>' +
      '</article>' +
      '<article class="mobile-quick-summary__tile">' +
        '<div class="mobile-quick-summary__tile-head">' +
          '<span class="mobile-quick-summary__tile-title">Risk</span>' +
          '<span class="indicator-pill ' + mobileQuickSummaryToneClass(riskLabel) + '">' + escapeHtml(riskLabel) + '</span>' +
        '</div>' +
        '<div class="mobile-quick-summary__meta">1D score: <strong>' + escapeHtml(riskScore == null ? 'n/a' : String(Math.round(riskScore))) + '</strong></div>' +
      '</article>';

    panelEl.classList.remove('hidden');
    panelEl.setAttribute('aria-hidden', 'false');
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
      fetchIndicatorExplorerChart(INDICATOR_EXPLORER.selected, INDICATOR_EXPLORER.selectionRequestId);
    } else {
      renderIndicatorExplorer();
    }
    saveIndicatorExplorerSession(safeMode);
    persist();
  }

  function fetchIndicatorExplorerChart(target, selectionRequestId) {
    if (!target) return Promise.resolve();
    var timeframeId = explorerChartTimeframeForMode(target.mode || INDICATOR_EXPLORER.mode);
    var reqId = ++INDICATOR_EXPLORER.chartRequestId;
    var token = explorerTargetSelectionToken(target);
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
        if (reqId !== INDICATOR_EXPLORER.chartRequestId ||
            !isIndicatorExplorerSelectionStillActive(selectionRequestId, String(target && target.cacheKey || ''), target, token)) return;
        var rows = filterHistoryForTimeframe(hist, timeframeId);
        var latestClose = rows.length ? Number(rows[rows.length - 1] && rows[rows.length - 1].c) : null;
        if (!isFinite(latestClose)) latestClose = null;
        INDICATOR_EXPLORER.chart = {
          title: indicatorExplorerChartTitle(target, timeframeId, latestClose),
          meta: rows.length ? ('Loaded ' + rows.length + ' points') : 'No chart data available.',
          labels: rows.map(function (p) { return p.t; }),
          values: rows.map(function (p) { return p.c; }),
          label: (target.symbol || '').replace('/USD', '') + ' price'
        };
        safeRenderIndicatorExplorer('explorer chart loaded');
        saveIndicatorExplorerSession(target.mode);
      })
      .catch(function () {
        if (reqId !== INDICATOR_EXPLORER.chartRequestId ||
            !isIndicatorExplorerSelectionStillActive(selectionRequestId, String(target && target.cacheKey || ''), target, token)) return;
        INDICATOR_EXPLORER.chart = {
          title: (target.label || target.symbol || 'Asset') + ' Chart',
          meta: 'Chart data unavailable.',
          labels: [],
          values: [],
          label: ''
        };
        safeRenderIndicatorExplorer('explorer chart error');
        saveIndicatorExplorerSession(target.mode);
      });
  }

  // Builds a stable selection token for one Explore target.
  function explorerTargetSelectionToken(target) {
    if (!target) return '';
    var type = String(target.assetType || '').trim().toLowerCase();
    var symbol = String(target.symbol || '').trim().toUpperCase();
    if (!type || !symbol) return '';
    return type + ':' + symbol;
  }

  // Returns true only while the same explorer target remains selected.
  function isIndicatorExplorerTargetStillSelected(targetKey, target, expectedToken) {
    if (!INDICATOR_EXPLORER || !INDICATOR_EXPLORER.selected) return false;
    var selected = INDICATOR_EXPLORER.selected;
    var selectedToken = String(INDICATOR_EXPLORER.selectionToken || explorerTargetSelectionToken(selected) || '').trim();
    var wantedToken = String(expectedToken || explorerTargetSelectionToken(target) || '').trim();
    if (selectedToken && wantedToken && selectedToken === wantedToken) return true;
    var selectedKey = String(selected.cacheKey || indicatorTargetKey(selected) || '').trim();
    var expectedKey = String(targetKey || '').trim();
    if (selectedKey && expectedKey && selectedKey === expectedKey) return true;

    var expectedType = String(target && target.assetType || '').trim().toLowerCase();
    var selectedType = String(selected.assetType || '').trim().toLowerCase();
    var expectedSymbol = String(target && target.symbol || '').trim().toUpperCase();
    var selectedSymbol = String(selected.symbol || '').trim().toUpperCase();
    if (expectedType && selectedType && expectedType !== selectedType) return false;
    if (expectedSymbol && selectedSymbol && expectedSymbol === selectedSymbol) return true;
    return false;
  }

  // Returns true when async explorer work still belongs to the currently active selection request.
  function isIndicatorExplorerSelectionRequestActive(selectionRequestId) {
    var requestId = Number(selectionRequestId);
    if (!isFinite(requestId) || requestId <= 0) return true;
    return requestId === Number(INDICATOR_EXPLORER.selectionRequestId || 0);
  }

  // Verifies both request-id recency and target identity before applying async explorer updates.
  function isIndicatorExplorerSelectionStillActive(selectionRequestId, targetKey, target, expectedToken) {
    var stillSelected = isIndicatorExplorerTargetStillSelected(targetKey, target, expectedToken);
    if (stillSelected) return true;
    return isIndicatorExplorerSelectionRequestActive(selectionRequestId);
  }

  // Loads fundamentals for the selected explorer target with local/DB-backed cache reuse.
  function refreshIndicatorExplorerFundamentals(target, force, selectionRequestId) {
    var asset = explorerAssetFromTarget(target);
    if (!asset) return Promise.resolve(null);
    var targetKey = String(target && target.cacheKey || '');
    var token = explorerTargetSelectionToken(target);
    if (!isIndicatorExplorerSelectionStillActive(selectionRequestId, targetKey, target, token)) {
      return Promise.resolve(null);
    }
    var faCacheKey = fundamentalsCacheKeyForAsset(asset);
    var cachedSnapshot = faCacheKey
      ? (storage.getCached(state.caches, faCacheKey, EXPLORER_CACHE_RETENTION_MS) || getCachedAny(faCacheKey))
      : null;
    if (cachedSnapshot && isIndicatorExplorerSelectionStillActive(selectionRequestId, targetKey, target, token)) {
      INDICATOR_EXPLORER.fundamentals = cachedSnapshot;
      safeRenderIndicatorExplorer('fundamentals cached');
    }
    if (isIndicatorExplorerSelectionStillActive(selectionRequestId, targetKey, target, token)) {
      INDICATOR_EXPLORER.fundamentalsLoading = true;
      safeRenderIndicatorExplorer('fundamentals loading');
    }
    return refreshAssetFundamentals(asset, { force: !!force }).then(function (payload) {
      if (!isIndicatorExplorerSelectionStillActive(selectionRequestId, targetKey, target, token)) return payload;
      INDICATOR_EXPLORER.fundamentals = payload || cachedSnapshot || null;
      INDICATOR_EXPLORER.fundamentalsLoading = false;
      safeRenderIndicatorExplorer('fundamentals loaded');
      saveIndicatorExplorerSession(target.mode || INDICATOR_EXPLORER.mode);
      return payload;
    }).catch(function () {
      if (!isIndicatorExplorerSelectionStillActive(selectionRequestId, targetKey, target, token)) return null;
      INDICATOR_EXPLORER.fundamentalsLoading = false;
      if (!INDICATOR_EXPLORER.fundamentals && cachedSnapshot) {
        INDICATOR_EXPLORER.fundamentals = cachedSnapshot;
      }
      safeRenderIndicatorExplorer('fundamentals error');
      saveIndicatorExplorerSession(target.mode || INDICATOR_EXPLORER.mode);
      return INDICATOR_EXPLORER.fundamentals || null;
    });
  }

  // Loads news for the selected explorer target with source-aware local and DB cache fallback.
  function refreshIndicatorExplorerNews(target, force, selectionRequestId) {
    var asset = explorerAssetFromTarget(target);
    if (!asset) return Promise.resolve([]);
    var token = explorerTargetSelectionToken(target);
    var targetKey = String(target && target.cacheKey || '');
    if (!isIndicatorExplorerSelectionStillActive(selectionRequestId, targetKey, target, token)) {
      return Promise.resolve([]);
    }
    if (!PT.NewsAPI || typeof PT.NewsAPI.getNews !== 'function') {
      if (isIndicatorExplorerSelectionStillActive(selectionRequestId, targetKey, target, token)) {
        INDICATOR_EXPLORER.newsItems = [];
        INDICATOR_EXPLORER.newsMeta = 'News API unavailable.';
        INDICATOR_EXPLORER.newsLoading = false;
        safeRenderIndicatorExplorer('news api unavailable');
      }
      return Promise.resolve([]);
    }
    var source = asset.type === 'crypto' ? (state.app.newsSourceCrypto || 'auto') : (state.app.newsSourceStocks || 'marketaux');
    var allowCrossSourceFallback = source === 'auto';
    var cacheKey = newsCacheKeyForAsset(asset);

    function apply(items, metaText) {
      if (!isIndicatorExplorerSelectionStillActive(selectionRequestId, targetKey, target, token)) return items;
      INDICATOR_EXPLORER.newsItems = Array.isArray(items) ? items : [];
      INDICATOR_EXPLORER.newsMeta = String(metaText || '').trim();
      INDICATOR_EXPLORER.newsLoading = false;
      safeRenderIndicatorExplorer('news apply');
      saveIndicatorExplorerSession(target.mode || INDICATOR_EXPLORER.mode);
      return INDICATOR_EXPLORER.newsItems;
    }

    function loadRemoteSnapshot() {
      if (!PT.NewsAPI || typeof PT.NewsAPI.getCachedSnapshot !== 'function') return Promise.resolve(null);
      return PT.NewsAPI.getCachedSnapshot(cacheKey).then(function (snapshot) {
        var items = snapshot && Array.isArray(snapshot.items) ? snapshot.items : null;
        if (!items || !items.length) return null;
        storage.setCached(state.caches, cacheKey, items);
        storage.saveCache(state.caches);
        return {
          items: items,
          fetchedAt: Number(snapshot.fetchedAt || 0) || 0,
          source: snapshot.source || source
        };
      });
    }

    function saveSnapshot(items) {
      if (!PT.NewsAPI || typeof PT.NewsAPI.saveCachedSnapshot !== 'function') return;
      PT.NewsAPI.saveCachedSnapshot(cacheKey, items, { fetchedAt: Date.now(), source: source });
    }

    var freshLocal = !force ? storage.getCached(state.caches, cacheKey, 1000 * 60 * 60 * 2) : null;
    if (freshLocal && freshLocal.length) {
      if (isIndicatorExplorerSelectionStillActive(selectionRequestId, targetKey, target, token)) {
        INDICATOR_EXPLORER.newsItems = freshLocal.slice();
        INDICATOR_EXPLORER.newsMeta = 'Using cached news';
        safeRenderIndicatorExplorer('news local cache');
        saveIndicatorExplorerSession(target.mode || INDICATOR_EXPLORER.mode);
      }
      return Promise.resolve(freshLocal.slice());
    }

    if (isIndicatorExplorerSelectionStillActive(selectionRequestId, targetKey, target, token)) {
      INDICATOR_EXPLORER.newsLoading = true;
      safeRenderIndicatorExplorer('news loading');
    }

    var fetcher = function () {
      return PT.NewsAPI.getNews(asset, { source: source, force: !!force }).then(function (items) {
        var rows = Array.isArray(items) ? items : [];
        storage.setCached(state.caches, cacheKey, rows);
        storage.saveCache(state.caches);
        saveSnapshot(rows);
        return {
          items: rows,
          fetchedAt: Date.now(),
          source: source
        };
      });
    };

    var staleLocal = storage.getCached(state.caches, cacheKey, EXPLORER_CACHE_RETENTION_MS) ||
      getCachedAny(cacheKey) ||
      (allowCrossSourceFallback ? anySourceNewsCacheForAsset(asset, EXPLORER_CACHE_RETENTION_MS) : null);

    var loadPromise = force
      ? fetcher()
      : loadRemoteSnapshot().then(function (snapshot) {
        if (snapshot && Array.isArray(snapshot.items) && snapshot.items.length) return snapshot;
        return fetcher();
      });

    return loadPromise.then(function (snapshot) {
      var items = snapshot && Array.isArray(snapshot.items) ? snapshot.items : [];
      var fetchedAt = Number(snapshot && snapshot.fetchedAt || 0) || 0;
      var sourceLabel = String(snapshot && snapshot.source || source || '').trim();
      var metaText = items.length
        ? ('Updated ' + new Date(fetchedAt || Date.now()).toLocaleString() + (sourceLabel ? (' • ' + sourceLabel) : ''))
        : 'No news available.';
      return apply(items, metaText);
    }).catch(function () {
      if (Array.isArray(staleLocal) && staleLocal.length) {
        return apply(staleLocal, 'Using cached news');
      }
      return loadRemoteSnapshot().then(function (remote) {
        if (remote && remote.items && remote.items.length) {
          return apply(remote.items, 'Using cached news');
        }
        return apply([], 'News unavailable (check network/CORS); cached news appears when available.');
      }).catch(function () {
        return apply([], 'News unavailable (check network/CORS); cached news appears when available.');
      });
    });
  }

  // Refreshes both explorer fundamentals and news for the selected symbol/token.
  function refreshIndicatorExplorerSupplementary(target, force, selectionRequestId) {
    if (!target) return Promise.resolve(null);
    return Promise.allSettled([
      refreshIndicatorExplorerFundamentals(target, !!force, selectionRequestId),
      refreshIndicatorExplorerNews(target, !!force, selectionRequestId)
    ]).then(function () { return null; });
  }

  // Converts a persisted favorite record back into an explorer target.
  function indicatorTargetFromExplorerFavorite(entry, modeKey) {
    if (!entry) return null;
    if (modeKey === 'crypto') {
      var cryptoSymbol = String(entry.symbol || '').trim().toUpperCase();
      if (!cryptoSymbol) return null;
      return {
        mode: 'crypto',
        assetType: 'crypto',
        symbol: cryptoSymbol + '/USD',
        label: entry.name ? (entry.name + ' (' + cryptoSymbol + '/USD)') : (cryptoSymbol + '/USD'),
        name: entry.name || cryptoSymbol,
        cacheKey: indicatorTargetKey({ assetType: 'crypto', symbol: cryptoSymbol + '/USD' }),
        owned: false,
        sourceId: entry.coinId || cryptoSymbol,
        coinId: entry.coinId || null,
        baseSymbol: cryptoSymbol
      };
    }
    var stockSymbol = normalizeStockTicker(entry && (entry.yahooSymbol || entry.symbol || ''));
    if (!stockSymbol) return null;
    return {
      mode: 'stocks',
      assetType: 'stock',
      symbol: stockSymbol,
      label: entry.name ? (entry.name + ' (' + stockSymbol + ')') : stockSymbol,
      name: entry.name || stockSymbol,
      cacheKey: indicatorTargetKey({ assetType: 'stock', symbol: stockSymbol }),
      owned: false,
      sourceId: normalizeStockTicker(entry && (entry.yahooSymbol || stockSymbol)) || stockSymbol,
      yahooSymbol: stockSymbol,
      stooqSymbol: normalizeStooqSymbol(entry && entry.stooqSymbol, stockSymbol) || null,
      market: entry.market || 'US'
    };
  }

  // Maps generic trend labels into holdings-style signal classes for favorites rows.
  function indicatorStatusPillClass(label) {
    var normalized = String(label || '').trim().toLowerCase();
    if (normalized.indexOf('bull') >= 0 || normalized === 'strong') return 'indicator-explorer-favorites__status asset-row__signal asset-row__signal--bullish';
    if (normalized.indexOf('bear') >= 0 || normalized.indexOf('risk') >= 0 || normalized.indexOf('weak') >= 0) return 'indicator-explorer-favorites__status asset-row__signal asset-row__signal--bearish';
    return 'indicator-explorer-favorites__status asset-row__signal asset-row__signal--neutral';
  }

  // Maps fundamentals quality labels into holdings-style signal classes for favorites rows.
  function fundamentalsStatusChipClass(label) {
    var normalized = String(label || '').trim().toLowerCase();
    if (normalized.indexOf('strong') >= 0 || normalized === 'healthy') return 'indicator-explorer-favorites__status asset-row__signal asset-row__signal--bullish';
    if (normalized.indexOf('weak') >= 0 || normalized.indexOf('risk') >= 0 || normalized === 'expensive') return 'indicator-explorer-favorites__status asset-row__signal asset-row__signal--bearish';
    return 'indicator-explorer-favorites__status asset-row__signal asset-row__signal--neutral';
  }

  // Reads cached trend-meter overall label for an explorer target.
  function indicatorOverallStatusForTarget(target) {
    if (!target) return 'n/a';
    var targetKey = target.cacheKey || indicatorTargetKey(target);
    if (!targetKey) return 'n/a';
    var timeframes = {};
    ['1d', '1w', '1m'].forEach(function (timeframeKey) {
      var snapshot = getCachedAny(indicatorComputedCacheKey(targetKey, timeframeKey));
      if (snapshot && snapshot.trendMeter) timeframes[timeframeKey] = snapshot;
    });
    if (!Object.keys(timeframes).length) return 'n/a';
    if (window.PT && window.PT.IndicatorEngine && typeof window.PT.IndicatorEngine.summarizeByTimeframe === 'function') {
      var summary = window.PT.IndicatorEngine.summarizeByTimeframe(timeframes) || {};
      if (summary && summary.overall) return String(summary.overall);
    }
    var fallback = timeframes['1m'] || timeframes['1w'] || timeframes['1d'];
    var fallbackLabel = fallback && fallback.trendMeter && fallback.trendMeter.label;
    return fallbackLabel ? String(fallbackLabel) : 'n/a';
  }

  // Reads cached fundamentals quality label for an explorer target.
  function fundamentalsQualityStatusForTarget(target) {
    var asset = explorerAssetFromTarget(target);
    if (!asset) return 'n/a';
    var snapshot = getFundamentalsSnapshot(asset);
    if (!snapshot) {
      var cacheKey = fundamentalsCacheKeyForAsset(asset);
      snapshot = cacheKey ? getCachedAny(cacheKey) : null;
    }
    var panel = snapshot && snapshot.panel ? snapshot.panel : null;
    if (!panel) return 'n/a';
    var quality = String(panel.qualityLabel || panel.label || '').trim();
    return quality || 'n/a';
  }

  // Finds the latest cached quote for an explorer favorite.
  function getCachedQuoteForExplorerFavorite(entry, target) {
    var modeKey = target && target.mode === 'crypto' ? 'crypto' : 'stocks';
    if (modeKey === 'crypto') {
      var coinId = String(entry && entry.coinId || target && target.coinId || '').trim().toLowerCase();
      var symbol = String(entry && entry.symbol || target && target.baseSymbol || '').trim().toUpperCase();
      var portfolioHit = state.portfolio.crypto.find(function (asset) {
        return (coinId && String(asset.coinId || '').toLowerCase() === coinId) ||
          (symbol && String(asset.symbol || '').toUpperCase() === symbol);
      });
      if (portfolioHit && state.market.crypto[portfolioHit.id]) return state.market.crypto[portfolioHit.id];
      if (coinId) return storage.getCached(state.caches, 'quote:crypto:' + coinId, 0) || getCachedAny('quote:crypto:' + coinId);
      if (symbol) return storage.getCached(state.caches, 'quote:crypto:' + symbol.toLowerCase(), 0) || getCachedAny('quote:crypto:' + symbol.toLowerCase());
      return null;
    }
    var stockSymbol = normalizeStockTicker(entry && (entry.yahooSymbol || entry.symbol || '') || target && (target.yahooSymbol || target.symbol || ''));
    var stooqSymbol = normalizeStooqSymbol(entry && entry.stooqSymbol || target && target.stooqSymbol || '', stockSymbol);
    var stockHit = state.portfolio.stocks.find(function (asset) {
      return (stockSymbol && String(asset.yahooSymbol || asset.symbol || '').toUpperCase() === stockSymbol) ||
        (stooqSymbol && String(asset.stooqSymbol || '').toLowerCase() === stooqSymbol);
    });
    if (stockHit && state.market.stocks[stockHit.id]) return state.market.stocks[stockHit.id];
    var quoteKeys = [];
    if (stooqSymbol) quoteKeys.push('quote:stock:' + stooqSymbol);
    if (stockSymbol) {
      quoteKeys.push('quote:stock:' + stockSymbol.toLowerCase());
      quoteKeys.push('quote:stock:' + stockSymbol);
    }
    for (var i = 0; i < quoteKeys.length; i++) {
      var cached = storage.getCached(state.caches, quoteKeys[i], 0) || getCachedAny(quoteKeys[i]);
      if (cached) return cached;
    }
    return null;
  }

  // Resolves display price and day change percent for a favorite row from quote/indicator caches.
  function getExplorerFavoriteQuoteSummary(entry, target) {
    var quote = getCachedQuoteForExplorerFavorite(entry, target);
    var price = preferredQuotePriceForEntry(quote);
    var dayPct = null;
    var fetchedAt = toFiniteNumber(quote && quote.fetchedAt);
    var quoteChangePct = toFiniteNumber(quote && quote.changePercent);
    var quotePercentChange = toFiniteNumber(quote && quote.percent_change);
    var quoteChange = toFiniteNumber(quote && quote.change);
    var quotePrevRegular = toFiniteNumber(quote && quote.regularMarketPreviousClose);
    var quotePrev = toFiniteNumber(quote && quote.previous_close);

    if (quoteChangePct !== null) {
      dayPct = quoteChangePct;
    } else if (quotePercentChange !== null) {
      dayPct = quotePercentChange;
    } else if (target && target.assetType === 'crypto' && quote && isFinite(Number(quote.change24h))) {
      dayPct = Number(quote.change24h);
    } else if (quoteChange !== null && price !== null) {
      var derivedPrev = price - quoteChange;
      if (derivedPrev !== 0) dayPct = (quoteChange / derivedPrev) * 100;
    } else if (quotePrevRegular !== null && price !== null && quotePrevRegular !== 0) {
      dayPct = ((price - quotePrevRegular) / quotePrevRegular) * 100;
    } else if (quotePrev !== null && price !== null && quotePrev !== 0) {
      dayPct = ((price - quotePrev) / quotePrev) * 100;
    }

    var targetKey = target && (target.cacheKey || indicatorTargetKey(target));
    var tfSnapshot = targetKey ? getCachedAny(indicatorComputedCacheKey(targetKey, '1d')) : null;
    var snapshotClose = (tfSnapshot && isFinite(Number(tfSnapshot.close))) ? Number(tfSnapshot.close) : null;
    var snapshotPrev = (tfSnapshot && tfSnapshot.values && isFinite(Number(tfSnapshot.values.prevClose)))
      ? Number(tfSnapshot.values.prevClose)
      : null;
    if (fetchedAt === null && tfSnapshot && isFinite(Number(tfSnapshot.fetchedAt))) fetchedAt = Number(tfSnapshot.fetchedAt);
    if (price === null && snapshotClose !== null) price = snapshotClose;
    if (dayPct === null && snapshotClose !== null && snapshotPrev !== null && snapshotPrev !== 0) {
      dayPct = ((snapshotClose - snapshotPrev) / snapshotPrev) * 100;
    }

    return {
      price: isFinite(Number(price)) ? Number(price) : null,
      dayPct: isFinite(Number(dayPct)) ? Number(dayPct) : null,
      fetchedAt: isFinite(Number(fetchedAt)) ? Number(fetchedAt) : null
    };
  }

  // Resolves quote summary for the currently selected Explore asset.
  function getIndicatorExplorerTargetQuoteSummary(target) {
    if (!target) return { price: null, dayPct: null };
    var pseudoEntry = target.assetType === 'crypto'
      ? {
          assetType: 'crypto',
          symbol: target.baseSymbol || String(target.symbol || '').replace('/USD', ''),
          coinId: target.coinId || null
        }
      : {
          assetType: 'stock',
          symbol: target.symbol || target.yahooSymbol || '',
          yahooSymbol: target.yahooSymbol || target.symbol || '',
          stooqSymbol: target.stooqSymbol || null
        };
    return getExplorerFavoriteQuoteSummary(pseudoEntry, target);
  }

  // Normalizes favorites sort key to one of the supported sortable columns.
  function normalizeIndicatorExplorerFavoritesSortKey(raw) {
    var key = String(raw || '').trim().toLowerCase();
    if (key === 'ta' || key === 'quality' || key === 'price' || key === 'day') return key;
    return 'asset';
  }

  // Normalizes sort direction to asc/desc.
  function normalizeIndicatorExplorerFavoritesSortDir(raw) {
    return String(raw || '').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
  }

  // Updates header sort icons and active state for the favorites table.
  function renderIndicatorExplorerFavoritesSortControls() {
    if (!ui || !ui.el || !ui.el.indicatorExplorerFavoritesPage) return;
    var sortState = INDICATOR_EXPLORER && INDICATOR_EXPLORER.favoritesSort
      ? INDICATOR_EXPLORER.favoritesSort
      : { key: 'asset', dir: 'asc' };
    var activeKey = normalizeIndicatorExplorerFavoritesSortKey(sortState.key);
    var activeDir = normalizeIndicatorExplorerFavoritesSortDir(sortState.dir);
    var buttons = ui.el.indicatorExplorerFavoritesPage.querySelectorAll('[data-explorer-favorites-sort]');
    buttons.forEach(function (btn) {
      var key = normalizeIndicatorExplorerFavoritesSortKey(btn.getAttribute('data-explorer-favorites-sort'));
      var isActive = key === activeKey;
      btn.classList.toggle('is-active', isActive);
      var icon = btn.querySelector('[data-explorer-favorites-sort-icon]');
      if (icon) icon.textContent = isActive ? (activeDir === 'asc' ? '↑' : '↓') : '↕';
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  // Maps TA status labels into numeric sort ranks.
  function indicatorFavoritesTaRank(label) {
    var normalized = String(label || '').trim().toLowerCase();
    if (normalized.indexOf('bull') >= 0 || normalized.indexOf('strong') >= 0) return 3;
    if (normalized.indexOf('neutral') >= 0 || normalized.indexOf('mixed') >= 0) return 2;
    if (normalized.indexOf('bear') >= 0 || normalized.indexOf('risk') >= 0 || normalized.indexOf('weak') >= 0) return 1;
    return 0;
  }

  // Maps quality labels into numeric sort ranks.
  function indicatorFavoritesQualityRank(label) {
    var normalized = String(label || '').trim().toLowerCase();
    if (normalized.indexOf('strong') >= 0 || normalized === 'healthy') return 3;
    if (normalized.indexOf('mixed') >= 0 || normalized.indexOf('neutral') >= 0 || normalized === 'fair') return 2;
    if (normalized.indexOf('weak') >= 0 || normalized.indexOf('risk') >= 0 || normalized === 'expensive') return 1;
    return 0;
  }

  // Compares two optional numeric values while keeping missing values at the end.
  function compareOptionalNumber(a, b, dir) {
    var left = Number(a);
    var right = Number(b);
    var leftValid = isFinite(left);
    var rightValid = isFinite(right);
    if (!leftValid && !rightValid) return 0;
    if (!leftValid) return 1;
    if (!rightValid) return -1;
    return dir === 'asc' ? (left - right) : (right - left);
  }

  // Toggles favorites sorting for the selected sortable key.
  function toggleIndicatorExplorerFavoritesSort(rawKey) {
    var key = normalizeIndicatorExplorerFavoritesSortKey(rawKey);
    if (!INDICATOR_EXPLORER.favoritesSort || typeof INDICATOR_EXPLORER.favoritesSort !== 'object') {
      INDICATOR_EXPLORER.favoritesSort = { key: 'asset', dir: 'asc' };
    }
    var prevKey = normalizeIndicatorExplorerFavoritesSortKey(INDICATOR_EXPLORER.favoritesSort.key);
    var prevDir = normalizeIndicatorExplorerFavoritesSortDir(INDICATOR_EXPLORER.favoritesSort.dir);
    INDICATOR_EXPLORER.favoritesSort = {
      key: key,
      dir: prevKey === key ? (prevDir === 'asc' ? 'desc' : 'asc') : 'asc'
    };
    renderIndicatorExplorerFavoritesList();
  }

  // Toggles loading/animation state for the favorites quotes refresh button.
  function setIndicatorExplorerFavoritesRefreshLoading(loading) {
    if (!ui || !ui.el || !ui.el.indicatorExplorerFavoritesRefreshBtn) return;
    ui.el.indicatorExplorerFavoritesRefreshBtn.disabled = !!loading;
    ui.el.indicatorExplorerFavoritesRefreshBtn.classList.toggle('is-loading', !!loading);
    if (loading) {
      ui.el.indicatorExplorerFavoritesRefreshBtn.classList.remove('is-stale');
      ui.el.indicatorExplorerFavoritesRefreshBtn.classList.remove('is-fresh');
    }
  }

  // Colors favorites refresh state by quote freshness.
  function setIndicatorExplorerFavoritesRefreshTone(tone) {
    if (!ui || !ui.el || !ui.el.indicatorExplorerFavoritesRefreshBtn) return;
    var btn = ui.el.indicatorExplorerFavoritesRefreshBtn;
    btn.classList.toggle('is-stale', tone === 'stale');
    btn.classList.toggle('is-fresh', tone === 'fresh');
  }

  // Applies previous-close derived day metrics to a stock quote snapshot.
  function applyPrevCloseToStockQuote(quote, prevClose, price) {
    if (!quote || typeof quote !== 'object') return quote;
    var safePrev = Number(prevClose);
    var safePrice = isFinite(Number(price)) ? Number(price) : preferredQuotePriceForEntry(quote);
    if (!(safePrev > 0) || !isFinite(Number(safePrice))) return quote;
    var dayChange = Number(safePrice) - safePrev;
    var dayPct = safePrev !== 0 ? (dayChange / safePrev) * 100 : null;
    if (!isFinite(Number(dayPct))) return quote;
    return Object.assign({}, quote, {
      previous_close: safePrev,
      regularMarketPreviousClose: safePrev,
      change: dayChange,
      percent_change: dayPct,
      changePercent: dayPct
    });
  }

  // Ensures favorite stock quotes include day-change fields, using history fallback when needed.
  function ensureFavoriteStockQuoteDayChange(asset, quote) {
    if (!asset || !quote || typeof quote !== 'object') return Promise.resolve(quote);
    var price = preferredQuotePriceForEntry(quote);
    var hasDay = toFiniteNumber(quote.changePercent) !== null || toFiniteNumber(quote.percent_change) !== null;
    if (hasDay) return Promise.resolve(quote);
    var prevClose = toFiniteNumber(quote.regularMarketPreviousClose);
    if (prevClose === null) prevClose = toFiniteNumber(quote.previous_close);
    if (isFinite(Number(prevClose)) && Number(prevClose) > 0 && price !== null) {
      return Promise.resolve(applyPrevCloseToStockQuote(quote, Number(prevClose), price));
    }

    var histKey = 'hist:stock:' + (asset.stooqSymbol || asset.symbol || '').toLowerCase();
    var cachedHist = getCachedAny(histKey);
    var inferredFromCache = inferPrevCloseFromHistory(cachedHist, quote.date);
    if (isFinite(Number(inferredFromCache)) && Number(inferredFromCache) > 0 && price !== null) {
      return Promise.resolve(applyPrevCloseToStockQuote(quote, Number(inferredFromCache), price));
    }
    if (!PT.StockAPI || typeof PT.StockAPI.getHistory !== 'function') return Promise.resolve(quote);

    return PT.StockAPI.getHistory(asset, 20).then(function (rows) {
      if (Array.isArray(rows) && rows.length) {
        storage.setCached(state.caches, histKey, rows);
      }
      var inferred = inferPrevCloseFromHistory(rows, quote.date);
      if (isFinite(Number(inferred)) && Number(inferred) > 0 && price !== null) {
        return applyPrevCloseToStockQuote(quote, Number(inferred), price);
      }
      return quote;
    }).catch(function () {
      return quote;
    });
  }

  // Writes a refreshed stock quote into cache keys and matching in-portfolio market slots.
  function cacheExplorerFavoriteStockQuote(entry, quote) {
    if (!entry || !quote || typeof quote !== 'object') return false;
    var normalizedQuote = Object.assign({}, quote, {
      fetchedAt: isFinite(Number(quote.fetchedAt)) ? Number(quote.fetchedAt) : Date.now()
    });
    var symbol = normalizeStockTicker(entry && (entry.yahooSymbol || entry.symbol || ''));
    var stooq = normalizeStooqSymbol(entry && entry.stooqSymbol, symbol);
    var keys = [];
    if (stooq) keys.push('quote:stock:' + stooq);
    if (symbol) {
      keys.push('quote:stock:' + symbol.toLowerCase());
      keys.push('quote:stock:' + symbol);
    }
    keys.forEach(function (key) {
      storage.setCached(state.caches, key, normalizedQuote);
    });
    state.portfolio.stocks.forEach(function (asset) {
      var hitSymbol = symbol && String(asset.yahooSymbol || asset.symbol || '').trim().toUpperCase() === symbol;
      var hitStooq = stooq && String(asset.stooqSymbol || '').trim().toLowerCase() === stooq;
      if (hitSymbol || hitStooq) state.market.stocks[asset.id] = normalizedQuote;
    });
    return keys.length > 0;
  }

  // Writes a refreshed crypto quote into cache keys and matching in-portfolio market slots.
  function cacheExplorerFavoriteCryptoQuote(entry, quote) {
    if (!entry || !quote || typeof quote !== 'object') return false;
    var normalizedQuote = Object.assign({}, quote, {
      fetchedAt: isFinite(Number(quote.fetchedAt)) ? Number(quote.fetchedAt) : Date.now()
    });
    var coinId = String(entry.coinId || '').trim().toLowerCase();
    var symbol = String(entry.symbol || '').trim().toUpperCase();
    var keys = [];
    if (coinId) keys.push('quote:crypto:' + coinId);
    if (symbol) keys.push('quote:crypto:' + symbol.toLowerCase());
    keys.forEach(function (key) {
      storage.setCached(state.caches, key, normalizedQuote);
    });
    state.portfolio.crypto.forEach(function (asset) {
      var hitCoin = coinId && String(asset.coinId || '').trim().toLowerCase() === coinId;
      var hitSymbol = symbol && String(asset.symbol || '').trim().toUpperCase() === symbol;
      if (hitCoin || hitSymbol) state.market.crypto[asset.id] = normalizedQuote;
    });
    return keys.length > 0;
  }

  // Refreshes quote + day-change inputs used by favorites rows for the active mode.
  function refreshIndicatorExplorerFavoritesQuotes() {
    if (INDICATOR_EXPLORER_FAVORITES_REFRESH_IN_FLIGHT) return INDICATOR_EXPLORER_FAVORITES_REFRESH_IN_FLIGHT;
    var modeKey = INDICATOR_EXPLORER.mode === 'crypto' ? 'crypto' : 'stocks';
    var list = indicatorExplorerFavoritesForMode(modeKey).slice();
    if (!list.length) {
      setStatus('No favorites to refresh');
      return Promise.resolve({ updated: 0, failed: 0, empty: true });
    }

    setIndicatorExplorerFavoritesRefreshLoading(true);
    setStatus('Refreshing favorites quotes...');

    var updated = 0;
    var failed = 0;
    var cacheChanged = false;

    function finalize(result) {
      if (cacheChanged) storage.saveCache(state.caches);
      renderIndicatorExplorerFavoritesList();
      var nowText = new Date().toLocaleTimeString();
      if (updated <= 0 && failed > 0) setStatus('Favorites refresh failed • ' + nowText);
      else if (failed > 0) setStatus('Favorites partial refresh • ' + nowText);
      else setStatus('Favorites refreshed • ' + nowText);
      return result;
    }

    if (modeKey === 'stocks') {
      var prevCloseRunCache = new Map();
      INDICATOR_EXPLORER_FAVORITES_REFRESH_IN_FLIGHT = Promise.allSettled(list.map(function (entry) {
        var symbol = normalizeStockTicker(entry && (entry.yahooSymbol || entry.symbol || ''));
        if (!symbol) {
          failed += 1;
          return Promise.resolve();
        }
        var stockAsset = {
          id: 'fav-stock-' + symbol,
          type: 'stock',
          symbol: symbol,
          yahooSymbol: symbol,
          stooqSymbol: normalizeStooqSymbol(entry && entry.stooqSymbol, symbol) || (symbol.toLowerCase() + '.us'),
          market: entry.market || 'US',
          name: entry.name || symbol
        };
        return PT.StockAPI.getQuote(stockAsset, {
          prevCloseRunCache: prevCloseRunCache,
          prevCloseHint: getStockPrevCloseHint(stockAsset),
          // Favorites refresh is manual, so allow prev-close fetch to derive day % reliably.
          skipPrevCloseNetwork: false
        }).then(function (quote) {
          return ensureFavoriteStockQuoteDayChange(stockAsset, quote);
        }).then(function (quoteWithDay) {
          if (cacheExplorerFavoriteStockQuote(entry, quoteWithDay)) cacheChanged = true;
          updated += 1;
        }).catch(function () {
          failed += 1;
        });
      })).then(function () {
        return Promise.allSettled(list.map(function (entry) {
          var target = indicatorTargetFromExplorerFavorite(entry, modeKey);
          if (!target) return Promise.resolve();
          var tasks = [];
          if (String(indicatorOverallStatusForTarget(target)).toLowerCase() === 'n/a') {
            tasks.push(refreshIndicatorsForMode(modeKey, target, false));
          }
          if (String(fundamentalsQualityStatusForTarget(target)).toLowerCase() === 'n/a') {
            var assetRef = explorerAssetFromTarget(target);
            if (assetRef) tasks.push(refreshAssetFundamentals(assetRef, { force: false }));
          }
          if (!tasks.length) return Promise.resolve();
          return Promise.allSettled(tasks);
        }));
      }).then(function () {
        return finalize({ updated: updated, failed: failed, mode: modeKey });
      }).finally(function () {
        INDICATOR_EXPLORER_FAVORITES_REFRESH_IN_FLIGHT = null;
        setIndicatorExplorerFavoritesRefreshLoading(false);
      });
      return INDICATOR_EXPLORER_FAVORITES_REFRESH_IN_FLIGHT;
    }

    var coinIdSeen = {};
    var withCoinId = [];
    var withoutCoinId = [];
    list.forEach(function (entry) {
      var coinId = String(entry && entry.coinId || '').trim().toLowerCase();
      if (coinId) {
        if (coinIdSeen[coinId]) return;
        coinIdSeen[coinId] = true;
        withCoinId.push(entry);
      } else {
        withoutCoinId.push(entry);
      }
    });

    var jobs = [];
    if (withCoinId.length) {
      jobs.push(
        PT.CryptoAPI.getQuotes(withCoinId.map(function (entry) { return String(entry.coinId || '').trim().toLowerCase(); }))
          .then(function (quoteMap) {
            withCoinId.forEach(function (entry) {
              var coinId = String(entry && entry.coinId || '').trim().toLowerCase();
              var quote = quoteMap && quoteMap[coinId];
              if (quote) {
                if (cacheExplorerFavoriteCryptoQuote(entry, quote)) cacheChanged = true;
                updated += 1;
              } else {
                failed += 1;
              }
            });
          })
          .catch(function () {
            failed += withCoinId.length;
          })
      );
    }

    withoutCoinId.forEach(function (entry) {
      var symbol = String(entry && entry.symbol || '').trim().toUpperCase();
      if (!symbol) {
        failed += 1;
        return;
      }
      var cryptoAsset = {
        id: 'fav-crypto-' + symbol.toLowerCase(),
        type: 'crypto',
        coinId: symbol.toLowerCase(),
        symbol: symbol,
        name: entry.name || symbol
      };
      jobs.push(
        PT.CryptoAPI.getQuote(cryptoAsset).then(function (quote) {
          if (cacheExplorerFavoriteCryptoQuote(entry, quote)) cacheChanged = true;
          updated += 1;
        }).catch(function () {
          failed += 1;
        })
      );
    });

    INDICATOR_EXPLORER_FAVORITES_REFRESH_IN_FLIGHT = Promise.allSettled(jobs)
      .then(function () {
        return finalize({ updated: updated, failed: failed, mode: modeKey });
      })
      .finally(function () {
        INDICATOR_EXPLORER_FAVORITES_REFRESH_IN_FLIGHT = null;
        setIndicatorExplorerFavoritesRefreshLoading(false);
      });
    return INDICATOR_EXPLORER_FAVORITES_REFRESH_IN_FLIGHT;
  }

  // Renders the favorites list section for the active explorer mode.
  function renderIndicatorExplorerFavoritesList() {
    if (!ui || !ui.el || !ui.el.indicatorExplorerFavoritesList) return;
    var list = indicatorExplorerFavoritesForMode(INDICATOR_EXPLORER.mode);
    var nowMs = Date.now();
    var hasStaleQuote = false;
    var otherMode = INDICATOR_EXPLORER.mode === 'crypto' ? 'stocks' : 'crypto';
    var otherList = indicatorExplorerFavoritesForMode(otherMode);
    renderIndicatorExplorerFavoritesSortControls();
    if (ui.el.indicatorExplorerFavoritesCount) {
      ui.el.indicatorExplorerFavoritesCount.textContent = list.length + ' favorite' + (list.length === 1 ? '' : 's');
    }
    if (!list.length) {
      if (otherList.length) {
        var switchLabel = otherMode === 'crypto' ? 'Crypto' : 'Stocks';
        ui.el.indicatorExplorerFavoritesList.innerHTML =
          '<div class="indicator-explorer-favorites__empty">' +
            'No ' + escapeHtml(INDICATOR_EXPLORER.mode === 'crypto' ? 'crypto' : 'stock') + ' favorites in this view. ' +
            '<button class="btn btn--ghost btn--tiny" type="button" data-explorer-favorites-switch-mode="' + escapeHtml(otherMode) + '">' +
              'Show ' + escapeHtml(switchLabel) + ' favorites (' + escapeHtml(String(otherList.length)) + ')' +
            '</button>' +
          '</div>';
      } else {
        ui.el.indicatorExplorerFavoritesList.innerHTML =
          '<div class="indicator-explorer-favorites__empty">No favorites yet. Search and mark assets with ☆ Favorite.</div>';
      }
      setIndicatorExplorerFavoritesRefreshTone('');
      return;
    }
    var rows = [];
    list.forEach(function (entry) {
      try {
        var target = indicatorTargetFromExplorerFavorite(entry, INDICATOR_EXPLORER.mode);
        var key = indicatorExplorerFavoriteKeyFromEntry(entry);
        var ticker = entry.assetType === 'crypto'
          ? String(entry.symbol || '').trim().toUpperCase()
          : String(entry.yahooSymbol || entry.symbol || '').trim().toUpperCase();
        var title = String(entry.name || ticker || '').trim();
        var subtitle = entry.assetType === 'crypto'
          ? (ticker + (entry.coinId ? (' • ' + entry.coinId) : ''))
          : (ticker + (entry.market ? (' • ' + entry.market) : ''));
        var hasNote = !!normalizeIndicatorExplorerFavoriteNote(entry && entry.note);
        var taStatus = indicatorOverallStatusForTarget(target);
        var faStatus = fundamentalsQualityStatusForTarget(target);
        var quoteSummary = getExplorerFavoriteQuoteSummary(entry, target);
        var fetchedAt = toFiniteNumber(quoteSummary.fetchedAt);
        var quoteAgeMs = fetchedAt !== null ? (nowMs - Number(fetchedAt)) : null;
        if (quoteAgeMs === null || quoteAgeMs > INDICATOR_EXPLORER_FAVORITES_STALE_MS) hasStaleQuote = true;
        var priceText = quoteSummary.price != null ? ui.fmtCurrency(quoteSummary.price) : 'n/a';
        var dayClass = quoteSummary.dayPct == null ? 'pl--flat' : ui.pctClass(quoteSummary.dayPct);
        var dayText = quoteSummary.dayPct == null ? 'n/a' : ui.pctText(quoteSummary.dayPct);
        rows.push({
          key: key,
          assetText: String(ticker || title || subtitle || '').trim().toUpperCase(),
          taRank: indicatorFavoritesTaRank(taStatus),
          taLabel: String(taStatus || '').trim().toLowerCase(),
          qualityRank: indicatorFavoritesQualityRank(faStatus),
          qualityLabel: String(faStatus || '').trim().toLowerCase(),
          price: isFinite(Number(quoteSummary.price)) ? Number(quoteSummary.price) : null,
          day: isFinite(Number(quoteSummary.dayPct)) ? Number(quoteSummary.dayPct) : null,
          html: '' +
            '<div class="indicator-explorer-favorites__row" data-explorer-favorite-open="' + escapeHtml(key) + '">' +
              '<button class="indicator-explorer-favorites__open" type="button" data-explorer-favorite-open="' + escapeHtml(key) + '" title="' + escapeHtml(title) + '">' +
                '<span class="indicator-explorer-favorites__ticker">' + escapeHtml(ticker || title || subtitle) + '</span>' +
                '<small class="indicator-explorer-favorites__meta">' + escapeHtml(subtitle) + '</small>' +
              '</button>' +
              '<span class="' + indicatorStatusPillClass(taStatus) + '">' + escapeHtml('TA ' + taStatus) + '</span>' +
              '<span class="' + fundamentalsStatusChipClass(faStatus) + '">' + escapeHtml('Q ' + faStatus) + '</span>' +
              '<span class="indicator-explorer-favorites__price">' + escapeHtml(priceText) + '</span>' +
              '<span class="indicator-explorer-favorites__change ' + escapeHtml(dayClass) + '">' + escapeHtml(dayText) + '</span>' +
              '<span class="indicator-explorer-favorites__actions">' +
                (hasNote
                  ? ('<button class="btn btn--ghost btn--tiny btn--icon indicator-explorer-favorites__note-view" type="button" data-explorer-favorite-note-view="' + escapeHtml(key) + '"' +
                      ' aria-label="View note" title="View note">' + indicatorExplorerNoteEyeIconMarkup() + '</button>')
                  : '') +
                '<button class="btn btn--ghost btn--tiny indicator-explorer-favorites__note" type="button" data-explorer-favorite-note="' + escapeHtml(key) + '"' +
                  ' aria-label="View or edit favorite note" title="' + (hasNote ? 'View or edit note' : 'Add note') + '">' + (hasNote ? 'Edit note' : 'Add note') + '</button>' +
                '<button class="btn btn--ghost btn--tiny indicator-explorer-favorites__remove" type="button" data-explorer-favorite-remove="' + escapeHtml(key) + '" aria-label="Remove favorite">Remove</button>' +
              '</span>' +
            '</div>'
        });
      } catch (err) {
        hasStaleQuote = true;
        var fallbackKey = indicatorExplorerFavoriteKeyFromEntry(entry);
        var fallbackTicker = String(entry && (entry.yahooSymbol || entry.symbol || entry.coinId) || '').trim().toUpperCase();
        rows.push({
          key: fallbackKey,
          assetText: String(fallbackTicker || 'Favorite').trim().toUpperCase(),
          taRank: 0,
          taLabel: 'n/a',
          qualityRank: 0,
          qualityLabel: 'n/a',
          price: null,
          day: null,
          html: '' +
            '<div class="indicator-explorer-favorites__row" data-explorer-favorite-open="' + escapeHtml(fallbackKey) + '">' +
              '<button class="indicator-explorer-favorites__open" type="button" data-explorer-favorite-open="' + escapeHtml(fallbackKey) + '" title="' + escapeHtml(fallbackTicker || 'Favorite') + '">' +
                '<span class="indicator-explorer-favorites__ticker">' + escapeHtml(fallbackTicker || 'Favorite') + '</span>' +
                '<small class="indicator-explorer-favorites__meta">Fallback row</small>' +
              '</button>' +
              '<span class="' + indicatorStatusPillClass('n/a') + '">TA n/a</span>' +
              '<span class="' + fundamentalsStatusChipClass('n/a') + '">Q n/a</span>' +
              '<span class="indicator-explorer-favorites__price">n/a</span>' +
              '<span class="indicator-explorer-favorites__change pl--flat">n/a</span>' +
              '<span class="indicator-explorer-favorites__actions">' +
                (normalizeIndicatorExplorerFavoriteNote(entry && entry.note)
                  ? ('<button class="btn btn--ghost btn--tiny btn--icon indicator-explorer-favorites__note-view" type="button" data-explorer-favorite-note-view="' + escapeHtml(fallbackKey) + '" aria-label="View note" title="View note">' + indicatorExplorerNoteEyeIconMarkup() + '</button>')
                  : '') +
                '<button class="btn btn--ghost btn--tiny indicator-explorer-favorites__note" type="button" data-explorer-favorite-note="' + escapeHtml(fallbackKey) + '" aria-label="View or edit favorite note">Note</button>' +
                '<button class="btn btn--ghost btn--tiny indicator-explorer-favorites__remove" type="button" data-explorer-favorite-remove="' + escapeHtml(fallbackKey) + '" aria-label="Remove favorite">Remove</button>' +
              '</span>' +
            '</div>'
        });
        if (state && state.app && state.app.apiDebugEnabled && typeof console !== 'undefined' && console.warn) {
          console.warn('Favorites row render fallback used:', err && err.message ? err.message : err);
        }
      }
    });
    var sortState = INDICATOR_EXPLORER && INDICATOR_EXPLORER.favoritesSort
      ? INDICATOR_EXPLORER.favoritesSort
      : { key: 'asset', dir: 'asc' };
    var sortKey = normalizeIndicatorExplorerFavoritesSortKey(sortState.key);
    var sortDir = normalizeIndicatorExplorerFavoritesSortDir(sortState.dir);
    rows.sort(function (a, b) {
      if (sortKey === 'price') return compareOptionalNumber(a.price, b.price, sortDir);
      if (sortKey === 'day') return compareOptionalNumber(a.day, b.day, sortDir);
      if (sortKey === 'ta') {
        if (a.taRank !== b.taRank) return sortDir === 'asc' ? (a.taRank - b.taRank) : (b.taRank - a.taRank);
        return sortDir === 'asc'
          ? String(a.taLabel || '').localeCompare(String(b.taLabel || ''))
          : String(b.taLabel || '').localeCompare(String(a.taLabel || ''));
      }
      if (sortKey === 'quality') {
        if (a.qualityRank !== b.qualityRank) return sortDir === 'asc' ? (a.qualityRank - b.qualityRank) : (b.qualityRank - a.qualityRank);
        return sortDir === 'asc'
          ? String(a.qualityLabel || '').localeCompare(String(b.qualityLabel || ''))
          : String(b.qualityLabel || '').localeCompare(String(a.qualityLabel || ''));
      }
      return sortDir === 'asc'
        ? String(a.assetText || '').localeCompare(String(b.assetText || ''))
        : String(b.assetText || '').localeCompare(String(a.assetText || ''));
    });
    ui.el.indicatorExplorerFavoritesList.innerHTML = rows.map(function (row) { return row.html; }).join('');
    ui.el.indicatorExplorerFavoritesList.scrollTop = 0;
    ui.el.indicatorExplorerFavoritesList.scrollLeft = 0;
    setIndicatorExplorerFavoritesRefreshTone(hasStaleQuote ? 'stale' : 'fresh');
  }

  // Updates the selected-asset favorite button state.
  function renderIndicatorExplorerFavoriteButton() {
    if (!ui || !ui.el || !ui.el.indicatorExplorerFavoriteBtn) return;
    var selected = INDICATOR_EXPLORER.selected;
    if (!selected) {
      ui.el.indicatorExplorerFavoriteBtn.disabled = true;
      ui.el.indicatorExplorerFavoriteBtn.textContent = '☆ Favorite';
      ui.el.indicatorExplorerFavoriteBtn.setAttribute('aria-pressed', 'false');
      ui.el.indicatorExplorerFavoriteBtn.title = 'Select an asset first';
      return;
    }
    var favorite = isIndicatorExplorerFavorite(selected);
    ui.el.indicatorExplorerFavoriteBtn.disabled = false;
    ui.el.indicatorExplorerFavoriteBtn.textContent = favorite ? '★ Favorited' : '☆ Favorite';
    ui.el.indicatorExplorerFavoriteBtn.setAttribute('aria-pressed', favorite ? 'true' : 'false');
    ui.el.indicatorExplorerFavoriteBtn.title = favorite ? 'Remove from favorites' : 'Add to favorites';
  }

  // Adds/removes current explorer selection in favorites and persists it to DB.
  function toggleIndicatorExplorerFavorite() {
    var selected = INDICATOR_EXPLORER.selected;
    if (!selected) return;
    var modeKey = selected.mode === 'crypto' ? 'crypto' : 'stocks';
    var key = indicatorExplorerFavoriteKeyFromTarget(selected);
    if (!key) return;
    var hit = findIndicatorExplorerFavoriteByKey(modeKey, key);
    if (hit.index >= 0) hit.list.splice(hit.index, 1);
    else {
      var favoriteEntry = indicatorExplorerFavoriteFromTarget(selected);
      if (favoriteEntry) hit.list.push(favoriteEntry);
    }
    INDICATOR_EXPLORER.favorites = normalizeIndicatorExplorerFavorites(INDICATOR_EXPLORER.favorites);
    renderIndicatorExplorer();
    saveIndicatorExplorerSession(modeKey);
    saveIndicatorExplorerFavoritesToRemote();
  }

  // Removes one favorite by key and persists the updated list.
  function removeIndicatorExplorerFavoriteByKey(modeKey, key) {
    var hit = findIndicatorExplorerFavoriteByKey(modeKey, key);
    if (hit.index < 0) return;
    hit.list.splice(hit.index, 1);
    INDICATOR_EXPLORER.favorites = normalizeIndicatorExplorerFavorites(INDICATOR_EXPLORER.favorites);
    renderIndicatorExplorer();
    saveIndicatorExplorerSession(hit.mode);
    saveIndicatorExplorerFavoritesToRemote();
  }

  // Updates the note editor character counter in the favorite-note modal.
  function updateIndicatorExplorerFavoriteNoteCounter() {
    if (!ui || !ui.el || !ui.el.indicatorExplorerNoteCount || !ui.el.indicatorExplorerNoteInput) return;
    var normalized = normalizeIndicatorExplorerFavoriteNote(ui.el.indicatorExplorerNoteInput.value);
    ui.el.indicatorExplorerNoteCount.textContent = normalized.length + '/' + INDICATOR_EXPLORER_NOTE_MAX_LEN;
  }

  // Opens the favorite-note modal for one explorer favorite.
  function openIndicatorExplorerFavoriteNoteModal(modeKey, key, options) {
    if (!ui || !ui.el || !ui.el.indicatorExplorerNoteModal || !ui.el.indicatorExplorerNoteInput) return;
    var opts = options && typeof options === 'object' ? options : {};
    var readOnly = !!opts.readOnly;
    var hit = findIndicatorExplorerFavoriteByKey(modeKey, key);
    if (!hit.entry) return;
    var ticker = hit.entry.assetType === 'crypto'
      ? String(hit.entry.symbol || '').trim().toUpperCase()
      : String(hit.entry.yahooSymbol || hit.entry.symbol || '').trim().toUpperCase();
    var title = String(hit.entry.name || ticker || 'Favorite').trim() || 'Favorite';
    INDICATOR_EXPLORER_NOTE_EDIT.mode = hit.mode;
    INDICATOR_EXPLORER_NOTE_EDIT.key = hit.key;
    INDICATOR_EXPLORER_NOTE_EDIT.title = title;
    if (ui.el.indicatorExplorerNoteAssetLabel) {
      ui.el.indicatorExplorerNoteAssetLabel.textContent = ticker ? (ticker + ' • ' + title) : title;
    }
    var noteModalTitle = document.getElementById('indicatorExplorerNoteTitle');
    if (noteModalTitle) {
      noteModalTitle.textContent = readOnly ? 'Favorite Note' : 'Favorite Note';
    }
    ui.el.indicatorExplorerNoteInput.value = normalizeIndicatorExplorerFavoriteNote(hit.entry.note);
    ui.el.indicatorExplorerNoteInput.readOnly = readOnly;
    ui.el.indicatorExplorerNoteInput.setAttribute('aria-readonly', readOnly ? 'true' : 'false');
    if (readOnly) {
      ui.el.indicatorExplorerNoteInput.setAttribute('tabindex', '-1');
    } else {
      ui.el.indicatorExplorerNoteInput.removeAttribute('tabindex');
    }
    if (ui.el.indicatorExplorerNoteForm) {
      var submitBtn = ui.el.indicatorExplorerNoteForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.classList.toggle('hidden', readOnly);
    }
    if (ui.el.indicatorExplorerNoteCancelBtn) {
      ui.el.indicatorExplorerNoteCancelBtn.textContent = readOnly ? 'Close' : 'Cancel';
    }
    updateIndicatorExplorerFavoriteNoteCounter();
    ui.el.indicatorExplorerNoteModal.classList.remove('hidden');
    ui.el.indicatorExplorerNoteModal.setAttribute('aria-hidden', 'false');
    if (readOnly && ui.el.indicatorExplorerNoteCancelBtn) {
      ui.el.indicatorExplorerNoteCancelBtn.focus();
    } else {
      ui.el.indicatorExplorerNoteInput.focus();
      ui.el.indicatorExplorerNoteInput.setSelectionRange(
        ui.el.indicatorExplorerNoteInput.value.length,
        ui.el.indicatorExplorerNoteInput.value.length
      );
    }
  }

  // Closes the favorite-note modal and clears its transient context.
  function closeIndicatorExplorerFavoriteNoteModal() {
    if (!ui || !ui.el || !ui.el.indicatorExplorerNoteModal) return;
    ui.el.indicatorExplorerNoteModal.classList.add('hidden');
    ui.el.indicatorExplorerNoteModal.setAttribute('aria-hidden', 'true');
    if (ui.el.indicatorExplorerNoteForm) ui.el.indicatorExplorerNoteForm.reset();
    if (ui.el.indicatorExplorerNoteInput) {
      ui.el.indicatorExplorerNoteInput.readOnly = false;
      ui.el.indicatorExplorerNoteInput.removeAttribute('aria-readonly');
      ui.el.indicatorExplorerNoteInput.removeAttribute('tabindex');
    }
    if (ui.el.indicatorExplorerNoteForm) {
      var submitBtn = ui.el.indicatorExplorerNoteForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.classList.remove('hidden');
    }
    if (ui.el.indicatorExplorerNoteCancelBtn) ui.el.indicatorExplorerNoteCancelBtn.textContent = 'Cancel';
    if (ui.el.indicatorExplorerNoteCount) ui.el.indicatorExplorerNoteCount.textContent = '0/' + INDICATOR_EXPLORER_NOTE_MAX_LEN;
    INDICATOR_EXPLORER_NOTE_EDIT.mode = INDICATOR_EXPLORER.mode === 'crypto' ? 'crypto' : 'stocks';
    INDICATOR_EXPLORER_NOTE_EDIT.key = '';
    INDICATOR_EXPLORER_NOTE_EDIT.title = '';
  }

  // Saves one favorite note and persists the updated favorites snapshot.
  function submitIndicatorExplorerFavoriteNoteModal() {
    var modeKey = INDICATOR_EXPLORER_NOTE_EDIT.mode === 'crypto' ? 'crypto' : 'stocks';
    var key = String(INDICATOR_EXPLORER_NOTE_EDIT.key || '').trim();
    if (!key || !ui || !ui.el || !ui.el.indicatorExplorerNoteInput) return;
    var hit = findIndicatorExplorerFavoriteByKey(modeKey, key);
    if (!hit.entry) {
      closeIndicatorExplorerFavoriteNoteModal();
      return;
    }
    hit.entry.note = normalizeIndicatorExplorerFavoriteNote(ui.el.indicatorExplorerNoteInput.value);
    INDICATOR_EXPLORER.favorites = normalizeIndicatorExplorerFavorites(INDICATOR_EXPLORER.favorites);
    renderIndicatorExplorerFavoritesList();
    saveIndicatorExplorerSession(modeKey);
    saveIndicatorExplorerFavoritesToRemote();
    closeIndicatorExplorerFavoriteNoteModal();
    setStatus('Favorite note saved');
  }

  // Applies a fully-built explorer target selection and triggers all panel refreshes.
  function selectIndicatorExplorerTarget(target) {
    if (!target) return;
    var targetMode = target.mode === 'crypto' ? 'crypto' : 'stocks';
    var targetKey = String(target.cacheKey || indicatorTargetKey(target) || '');
    if (!targetKey) return;
    target.cacheKey = targetKey;
    INDICATOR_EXPLORER.mode = targetMode;
    INDICATOR_EXPLORER.view = 'all';
    closeIndicatorExplorerFavoriteNoteModal();
    // Invalidate in-flight autocomplete responses so the list cannot re-open after selection.
    INDICATOR_EXPLORER.requestId += 1;
    INDICATOR_EXPLORER.results = [];
    INDICATOR_EXPLORER.query = target.symbol || '';
    INDICATOR_EXPLORER.selected = target;
    INDICATOR_EXPLORER.selected.cacheKey = targetKey;
    INDICATOR_EXPLORER.selectionToken = explorerTargetSelectionToken(target);
    var selectionRequestId = ++INDICATOR_EXPLORER.selectionRequestId;
    INDICATOR_EXPLORER.fundamentals = null;
    INDICATOR_EXPLORER.fundamentalsLoading = false;
    INDICATOR_EXPLORER.newsItems = [];
    INDICATOR_EXPLORER.newsMeta = '';
    INDICATOR_EXPLORER.newsLoading = false;
    hideIndicatorExplorerSearchResults();
    if (ui.el.indicatorExplorerSearchInput) {
      ui.el.indicatorExplorerSearchInput.value = target.label;
    }
    primeIndicatorExplorerPanelsForSelection(target);
    INDICATOR_EXPLORER.chart = {
      title: (target.label || target.symbol || 'Asset') + ' Chart',
      meta: 'Loading chart...',
      labels: [],
      values: [],
      label: ''
    };
    fetchIndicatorExplorerChart(target, selectionRequestId);
    INDICATOR_EXPLORER.panel = {
      mode: targetMode,
      assetLabel: target.label,
      overallStatus: 'Neutral',
      weightedScore: 0,
      trendMeter: {
        overallScore: 0,
        overallLabel: 'Neutral',
        timeframes: {}
      },
      timeframes: {},
      targetKey: targetKey,
      metaText: 'Loading indicator snapshots...'
    };
    try {
      INDICATOR_EXPLORER.panel = rebuildIndicatorPanelState(targetMode, target, {
        usedCache: true,
        assetLabel: target.label
      }, false);
    } catch (err) {
      if (state && state.app && state.app.apiDebugEnabled) {
        try {
          console.debug('[Explore][Indicators] initial state rebuild failed', err && err.message ? err.message : err);
        } catch (noop) {}
      }
    }
    renderIndicatorExplorer();
    saveIndicatorExplorerSession(targetMode);
    setStatus('Loading ' + target.label + ' indicators...');
    refreshIndicatorsForMode(targetMode, target, false).then(function (result) {
      if (!isIndicatorExplorerSelectionStillActive(selectionRequestId, targetKey, target)) return;
      INDICATOR_EXPLORER.panel = result && result.state ? result.state : rebuildIndicatorPanelState(targetMode, target, {}, false);
      renderIndicatorExplorer();
      saveIndicatorExplorerSession(targetMode);
      setStatus((result && result.ok ? 'Loaded ' : 'Updated ') + target.label + ' indicators');
    }).catch(function (err) {
      if (!isIndicatorExplorerSelectionStillActive(selectionRequestId, targetKey, target)) return;
      INDICATOR_EXPLORER.panel = rebuildIndicatorPanelState(targetMode, target, {
        error: (err && err.message) || 'Indicator refresh failed',
        usedCache: true
      }, false);
      renderIndicatorExplorer();
      saveIndicatorExplorerSession(targetMode);
      setStatus('Indicator refresh failed');
    });
    refreshIndicatorExplorerSupplementary(target, false, selectionRequestId);
  }

  function selectIndicatorExplorerItem(item) {
    var target = indicatorTargetFromExplorerItem(item, INDICATOR_EXPLORER.mode);
    selectIndicatorExplorerTarget(target);
  }

  // Primes Explore panels for a newly selected target so old asset content cannot linger.
  function primeIndicatorExplorerPanelsForSelection(target) {
    if (!ui || !ui.el || !target) return;
    var symbol = target.assetType === 'crypto'
      ? String(target.baseSymbol || target.symbol || '').replace('/USD', '').trim().toUpperCase()
      : normalizeStockTicker(target.yahooSymbol || target.symbol || '');
    var displayLabel = symbol || target.label || 'Selected asset';
    if (ui.el.indicatorExplorerAssetLabel) ui.el.indicatorExplorerAssetLabel.textContent = displayLabel;
    if (ui.el.indicatorExplorerOverallPill) {
      ui.el.indicatorExplorerOverallPill.className = 'indicator-pill indicator-pill--neutral';
      ui.el.indicatorExplorerOverallPill.textContent = 'Neutral';
    }
    if (ui.el.indicatorExplorerMeta) ui.el.indicatorExplorerMeta.textContent = 'Loading indicator snapshots...';
    if (ui.el.indicatorExplorerTrendMeter) {
      ui.el.indicatorExplorerTrendMeter.innerHTML = '<div class="muted">Loading trend meter...</div>';
    }
    if (ui.el.indicatorExplorerTimeframes) {
      ui.el.indicatorExplorerTimeframes.innerHTML = '<section class="indicator-card"><div class="muted">Loading indicator snapshots...</div></section>';
    }

    if (ui.el.indicatorExplorerFundamentalsTitle) {
      ui.el.indicatorExplorerFundamentalsTitle.textContent = target.assetType === 'crypto' ? 'Token Fundamentals' : 'Fundamentals';
    }
    if (ui.el.indicatorExplorerFundamentalsAssetLabel) ui.el.indicatorExplorerFundamentalsAssetLabel.textContent = displayLabel;
    if (ui.el.indicatorExplorerFundamentalsOverallPill) {
      ui.el.indicatorExplorerFundamentalsOverallPill.className = 'indicator-pill indicator-pill--neutral';
      ui.el.indicatorExplorerFundamentalsOverallPill.textContent = 'n/a';
    }
    if (ui.el.indicatorExplorerFundamentalsMeta) ui.el.indicatorExplorerFundamentalsMeta.textContent = 'Loading fundamentals...';
    if (ui.el.indicatorExplorerFundamentalsSummary) ui.el.indicatorExplorerFundamentalsSummary.innerHTML = '';
    if (ui.el.indicatorExplorerFundamentalsGrid) {
      ui.el.indicatorExplorerFundamentalsGrid.innerHTML = '<div class="muted">Loading fundamentals...</div>';
    }
    if (ui.el.indicatorExplorerFundamentalsReasons) ui.el.indicatorExplorerFundamentalsReasons.innerHTML = '';

    if (ui.el.indicatorExplorerNewsMeta) ui.el.indicatorExplorerNewsMeta.textContent = 'Loading news...';
    if (ui.el.indicatorExplorerNewsList) {
      ui.el.indicatorExplorerNewsList.innerHTML = '<div class="muted">Loading news...</div>';
    }
  }

  // Normalizes a user-entered custom sector label.
  function normalizeCustomSectorLabel(value) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.slice(0, 64);
  }

  function clearLocalStockSectorMetadata(symbol) {
    var key = sectorMetaCacheKey(symbol);
    if (!key || !state || !state.caches || !Object.prototype.hasOwnProperty.call(state.caches, key)) return;
    delete state.caches[key];
    storage.saveCache(state.caches);
  }

  // Builds the existing sub-sector/theme list from current stock holdings for edit prompts.
  function existingSectorChoicesForStocks(items, sectorMetaMap) {
    var out = [];
    var seen = {};
    var list = Array.isArray(items) ? items : [];
    var map = sectorMetaMap && typeof sectorMetaMap === 'object' ? sectorMetaMap : {};
    var sectorEngine = window.PT && window.PT.SectorAllocation;
    list.forEach(function (item) {
      if (!item || item.type !== 'stock') return;
      var symbol = String(item.symbol || '').trim().toUpperCase();
      var meta = symbol ? map[symbol] : null;
      var sector = '';
      if (sectorEngine && typeof sectorEngine.normalizeStockClassification === 'function') {
        sector = String(
          sectorEngine.normalizeStockClassification(Object.assign({}, meta || {}, { symbol: symbol })).normalizedIndustryTheme || ''
        ).trim();
      } else {
        sector = String(meta && (meta.normalizedIndustryTheme || meta.normalizedSectorGroup || meta.normalizedSector) || '').trim();
      }
      if (!sector || sector === 'Other / Unknown' || seen[sector]) return;
      seen[sector] = true;
      out.push(sector);
    });
    out.sort(function (a, b) { return String(a).localeCompare(String(b)); });
    return out;
  }

  function syncSectorEditNewFieldVisibility() {
    if (!ui || !ui.el || !ui.el.sectorEditSelect || !ui.el.sectorEditNewWrap) return;
    var isNew = String(ui.el.sectorEditSelect.value || '') === SECTOR_EDIT_NEW_VALUE;
    ui.el.sectorEditNewWrap.classList.toggle('hidden', !isNew);
    if (isNew && ui.el.sectorEditNewInput) {
      ui.el.sectorEditNewInput.focus();
      ui.el.sectorEditNewInput.select();
    }
  }

  function closeSectorEditModal() {
    SECTOR_EDIT_CONTEXT.symbol = '';
    SECTOR_EDIT_CONTEXT.items = [];
    SECTOR_EDIT_CONTEXT.sectorMap = {};
    if (!ui || !ui.el || !ui.el.sectorEditModal) return;
    ui.el.sectorEditModal.classList.add('hidden');
    ui.el.sectorEditModal.setAttribute('aria-hidden', 'true');
    if (ui.el.sectorEditForm) ui.el.sectorEditForm.reset();
    if (ui.el.sectorEditNewWrap) ui.el.sectorEditNewWrap.classList.add('hidden');
  }

  // Closes the reset-sub-sectors confirmation modal and resolves pending decision.
  function closeSectorResetModal(confirmed) {
    var resolver = SECTOR_RESET_CONFIRM.pending;
    SECTOR_RESET_CONFIRM.pending = null;
    SECTOR_RESET_CONFIRM.count = 0;
    if (ui && ui.el && ui.el.sectorResetModal) {
      ui.el.sectorResetModal.classList.add('hidden');
      ui.el.sectorResetModal.setAttribute('aria-hidden', 'true');
    }
    if (typeof resolver === 'function') resolver(!!confirmed);
  }

  // Opens a styled confirmation modal before resetting custom sub-sectors.
  function requestSectorResetConfirmation(count) {
    var total = Math.max(1, Number(count) || 1);
    if (!ui || !ui.el || !ui.el.sectorResetModal) {
      return Promise.resolve(window.confirm('Reset custom sectors and restore algorithm classification for ' + total + ' stock(s)?'));
    }
    if (typeof SECTOR_RESET_CONFIRM.pending === 'function') {
      closeSectorResetModal(false);
    }
    SECTOR_RESET_CONFIRM.count = total;
    if (ui.el.sectorResetModalSubtitle) {
      ui.el.sectorResetModalSubtitle.textContent = total + ' stock' + (total === 1 ? '' : 's') + ' will be restored to algorithm classification';
    }
    if (ui.el.sectorResetModalMessage) {
      ui.el.sectorResetModalMessage.textContent = 'Custom sub-sector overrides will be removed. Portfolio assets and prices will not change.';
    }
    ui.el.sectorResetModal.classList.remove('hidden');
    ui.el.sectorResetModal.setAttribute('aria-hidden', 'false');
    if (ui.el.sectorResetConfirmBtn) ui.el.sectorResetConfirmBtn.focus();
    return new Promise(function (resolve) {
      SECTOR_RESET_CONFIRM.pending = resolve;
    });
  }

  function applyCustomSectorOverride(symbol, nextSector, contextMetaMap) {
    var safeSymbol = String(symbol || '').trim().toUpperCase();
    if (!safeSymbol) return Promise.resolve(false);
    var cleanedSector = normalizeCustomSectorLabel(nextSector);
    if (!cleanedSector) return Promise.resolve(false);
    var currentMeta = getCachedStockSectorMetadata(safeSymbol, 0) ||
      normalizeSectorMetadataRecord(safeSymbol, contextMetaMap && contextMetaMap[safeSymbol] ? contextMetaMap[safeSymbol] : {});
    var nextMeta = Object.assign({}, currentMeta || {}, {
      symbol: safeSymbol,
      userDefinedSectorGroup: cleanedSector,
      normalizedSectorGroup: cleanedSector,
      normalizedSector: cleanedSector,
      lastFetchedAt: Date.now(),
      source: currentMeta && currentMeta.source
        ? (String(currentMeta.source).indexOf('user') >= 0 ? String(currentMeta.source) : (String(currentMeta.source) + '+user'))
        : 'user',
      reasonIfUnavailable: null
    });
    if (!nextMeta.normalizedIndustryTheme || nextMeta.normalizedIndustryTheme === 'Other / Unknown') {
      nextMeta.normalizedIndustryTheme = cleanedSector;
    }
    return setCachedStockSectorMetadata(safeSymbol, nextMeta).then(function () {
      var modeItems = getModeComputedItems(state.app.mode);
      renderAllocation(modeItems, {
        scrambleHoldings: state.app.mode === 'stocks' && !!state.app.scrambleHoldings,
        scrambleSeed: HOLDINGS_SCRAMBLE_SEED
      });
      if (PANEL_VIEWER && PANEL_VIEWER.type === 'allocation') renderPanelViewerContent();
      setStatus('Sector updated for ' + safeSymbol);
      return true;
    }).catch(function () {
      setStatus('Failed to update sector for ' + safeSymbol);
      return false;
    });
  }

  function openSectorEditModal(symbol, contextItems, contextMetaMap) {
    var safeSymbol = String(symbol || '').trim().toUpperCase();
    if (!safeSymbol || !ui || !ui.el || !ui.el.sectorEditModal || !ui.el.sectorEditSelect) return;
    var currentMeta = getCachedStockSectorMetadata(safeSymbol, 0) ||
      normalizeSectorMetadataRecord(safeSymbol, contextMetaMap && contextMetaMap[safeSymbol] ? contextMetaMap[safeSymbol] : {});
    var currentSector = normalizeCustomSectorLabel(
      currentMeta && (currentMeta.normalizedIndustryTheme || currentMeta.normalizedSectorGroup)
    );
    var choices = existingSectorChoicesForStocks(contextItems, contextMetaMap);
    if (currentSector && currentSector !== 'Other / Unknown' && choices.indexOf(currentSector) < 0) {
      choices.push(currentSector);
      choices.sort(function (a, b) { return String(a || '').localeCompare(String(b || '')); });
    }
    var html = choices.map(function (name) {
      return '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>';
    }).join('');
    html += '<option value="' + SECTOR_EDIT_NEW_VALUE + '">+ New sector</option>';
    ui.el.sectorEditSelect.innerHTML = html;
    var selectValue = choices.indexOf(currentSector) >= 0 ? currentSector : SECTOR_EDIT_NEW_VALUE;
    ui.el.sectorEditSelect.value = selectValue;
    if (ui.el.sectorEditNewInput) {
      ui.el.sectorEditNewInput.value = selectValue === SECTOR_EDIT_NEW_VALUE ? currentSector : '';
    }
    if (ui.el.sectorEditSymbolLabel) {
      ui.el.sectorEditSymbolLabel.textContent = safeSymbol + ' • Choose sub-sector';
    }
    SECTOR_EDIT_CONTEXT.symbol = safeSymbol;
    SECTOR_EDIT_CONTEXT.items = Array.isArray(contextItems) ? contextItems.slice() : [];
    SECTOR_EDIT_CONTEXT.sectorMap = contextMetaMap && typeof contextMetaMap === 'object' ? Object.assign({}, contextMetaMap) : {};
    ui.el.sectorEditModal.classList.remove('hidden');
    ui.el.sectorEditModal.setAttribute('aria-hidden', 'false');
    syncSectorEditNewFieldVisibility();
    if (selectValue !== SECTOR_EDIT_NEW_VALUE) ui.el.sectorEditSelect.focus();
  }

  function submitSectorEditModal() {
    if (!ui || !ui.el || !ui.el.sectorEditSelect) return;
    var safeSymbol = String(SECTOR_EDIT_CONTEXT.symbol || '').trim().toUpperCase();
    if (!safeSymbol) {
      closeSectorEditModal();
      return;
    }
    var selected = String(ui.el.sectorEditSelect.value || '').trim();
    var nextSector = selected === SECTOR_EDIT_NEW_VALUE
      ? normalizeCustomSectorLabel(ui.el.sectorEditNewInput && ui.el.sectorEditNewInput.value)
      : normalizeCustomSectorLabel(selected);
    if (!nextSector) {
      if (selected === SECTOR_EDIT_NEW_VALUE && ui.el.sectorEditNewInput) ui.el.sectorEditNewInput.focus();
      else ui.el.sectorEditSelect.focus();
      return;
    }
    var map = SECTOR_EDIT_CONTEXT.sectorMap && typeof SECTOR_EDIT_CONTEXT.sectorMap === 'object'
      ? SECTOR_EDIT_CONTEXT.sectorMap
      : {};
    closeSectorEditModal();
    applyCustomSectorOverride(safeSymbol, nextSector, map);
  }

  function editStockSectorFromLegend(symbol, contextItems, contextMetaMap) {
    openSectorEditModal(symbol, contextItems, contextMetaMap);
  }

  function resetCustomSectorsForItems(items) {
    var list = Array.isArray(items) ? items : [];
    var targets = [];
    var seen = {};
    list.forEach(function (item) {
      if (!item || item.type !== 'stock') return;
      var symbol = String(item.symbol || '').trim().toUpperCase();
      if (!symbol || seen[symbol]) return;
      seen[symbol] = true;
      var cached = getCachedStockSectorMetadata(symbol, 0);
      if (!cached || !cached.userDefinedSectorGroup) return;
      targets.push({
        symbol: symbol,
        apiSymbol: String(item.yahooSymbol || symbol || '').trim().toUpperCase() || symbol,
        rawName: String(item.name || symbol || '').trim(),
        market: String(item.market || '').trim().toUpperCase()
      });
    });
    if (!targets.length) {
      setStatus('No custom sectors to reset');
      return Promise.resolve(false);
    }
    return requestSectorResetConfirmation(targets.length).then(function (ok) {
      if (!ok) return false;
      targets.forEach(function (target) {
        clearLocalStockSectorMetadata(target.symbol);
      });
      return Promise.allSettled(targets.map(function (target) {
        return resolveStockSectorMetadata(target.symbol, {
          force: true,
          apiSymbol: target.apiSymbol,
          rawName: target.rawName,
          market: target.market
        });
      })).then(function () {
        var modeItems = getModeComputedItems(state.app.mode);
        renderAllocation(modeItems, {
          scrambleHoldings: state.app.mode === 'stocks' && !!state.app.scrambleHoldings,
          scrambleSeed: HOLDINGS_SCRAMBLE_SEED
        });
        if (PANEL_VIEWER && PANEL_VIEWER.type === 'allocation') renderPanelViewerContent();
        setStatus('Custom sectors reset');
        return true;
      }).catch(function () {
        setStatus('Failed to reset custom sectors');
        return false;
      });
    });
  }

  function syncAllocationResetSectorsButtonState() {
    if (!ui || !ui.el || !ui.el.allocationResetSectorsBtn) return;
    // Main UI: keep Reset sectors hidden; it is available only in expanded Allocation panel.
    var sectorsActive = allocationModeStocks() === 'sectors';
    ui.el.allocationResetSectorsBtn.classList.add('hidden');
    ui.el.allocationResetSectorsBtn.disabled = !sectorsActive;
    ui.el.allocationResetSectorsBtn.title = sectorsActive
      ? 'Reset custom sectors to algorithm classification'
      : 'Switch to Sectors mode to reset custom sectors';
  }

  function renderAllocation(items, options) {
    var safeItems = Array.isArray(items) ? items.slice() : [];
    var sorted = safeItems.slice().sort(function (a, b) { return b.marketValue - a.marketValue; });
    var sectorMode = isSectorAllocationModeActive(state.app.mode);
    var sectorEngine = window.PT && window.PT.SectorAllocation;

    if (!sectorMode || !sectorEngine) {
      var labels = sorted.map(function (i) { return i.symbol; });
      var values = sorted.map(function (i) { return Number(i.marketValue.toFixed(2)); });
      chartMgr.renderAllocation(ui.el.allocationChart, ui.el.pieFallback, labels, values, { mode: 'stocks' });
      ui.renderAllocationLegend(sorted, AUTO_COLORS, !!state.app.hideHoldings, options || {});
      return;
    }

    var sectorMetaMap = cachedSectorMetadataMapForItems(sorted);
    var grouped = sectorEngine.getThemeAllocationData
      ? sectorEngine.getThemeAllocationData(sorted, sectorMetaMap)
      : sectorEngine.getSectorAllocationData(sorted, sectorMetaMap);
    var sectorLabels = Array.isArray(grouped && grouped.labels) ? grouped.labels : [];
    var sectorValues = Array.isArray(grouped && grouped.values) ? grouped.values : [];
    chartMgr.renderAllocation(ui.el.allocationChart, ui.el.pieFallback, sectorLabels, sectorValues, { mode: 'sectors' });

    var sortedBySector = sectorEngine.groupStocksBySectorAndIndustry
      ? sectorEngine.groupStocksBySectorAndIndustry(sorted, sectorMetaMap, state.app.sortBy || 'value-desc')
      : sectorEngine.sortStocksBySector(sorted, sectorMetaMap, state.app.sortBy || 'value-desc');
    var sectorIndexByName = {};
    sectorLabels.forEach(function (label, idx) {
      sectorIndexByName[String(label || '')] = idx;
    });
    var shownSectorHeader = {};
    var shownIndustryHeader = {};
    var legendRows = sortedBySector.map(function (item) {
      var symbol = String(item && item.symbol || '').trim().toUpperCase();
      var meta = sectorMetaMap[symbol] || null;
      var normalized = sectorEngine && typeof sectorEngine.normalizeStockClassification === 'function'
        ? sectorEngine.normalizeStockClassification(Object.assign({}, meta || {}, { symbol: symbol }))
        : normalizeSectorMetadataRecord(symbol, meta || {});
      var sectorName = String(normalized.normalizedSectorGroup || 'Other / Unknown');
      var industryTheme = String(normalized.normalizedIndustryTheme || sectorName || 'Other / Unknown');
      var idx = isFinite(Number(sectorIndexByName[industryTheme])) ? Number(sectorIndexByName[industryTheme]) : 0;
      var industryGroupKey = sectorName + '::' + industryTheme;
      var row = Object.assign({}, item, {
        _allocationIndex: idx,
        _allocationGroup: sectorName,
        _allocationGroupLabel: shownSectorHeader[sectorName] ? '' : sectorName,
        _allocationIndustryLabel: shownIndustryHeader[industryGroupKey] ? '' : industryTheme,
        _allocationSymbol: symbol,
        _allocationEditable: item.type === 'stock'
      });
      shownSectorHeader[sectorName] = true;
      shownIndustryHeader[industryGroupKey] = true;
      return row;
    });
    ui.renderAllocationLegend(legendRows, AUTO_COLORS, !!state.app.hideHoldings, Object.assign({}, options || {}, { sectorMode: true }));
    ensureStockSectorMetadataForItems(sortedBySector);
  }

  function setAllocationLegendHighlight(index) {
    if (!ui || !ui.el || !ui.el.allocationLegend) return;
    var rows = ui.el.allocationLegend.querySelectorAll('.legend-item');
    var i;
    var active = isFinite(Number(index)) ? Number(index) : -1;
    for (i = 0; i < rows.length; i++) {
      var rowIndex = Number(rows[i].getAttribute('data-allocation-index'));
      var isActive = active >= 0 && isFinite(rowIndex) && rowIndex === active;
      rows[i].classList.toggle('is-active', isActive);
      rows[i].classList.toggle('is-dimmed', active >= 0 && !isActive);
    }
  }

  function clearAllocationLegendHighlight() {
    setAllocationLegendHighlight(-1);
    if (chartMgr && typeof chartMgr.clearAllocationHighlight === 'function') {
      chartMgr.clearAllocationHighlight();
    }
  }

  // Maps summary labels into compact indicator-pill tone classes.
  function mobileQuickSummaryToneClass(label) {
    var normalized = String(label || '').trim().toLowerCase();
    if (!normalized || normalized === 'n/a') return 'indicator-pill--neutral';
    if (normalized === 'low' || normalized === 'low risk') return 'indicator-pill--bullish';
    if (normalized === 'moderate' || normalized === 'elevated' || normalized === 'moderate risk' || normalized === 'elevated risk') {
      return 'indicator-pill--caution';
    }
    if (normalized === 'high' || normalized === 'very high' || normalized === 'high risk' || normalized === 'very high risk') {
      return 'indicator-pill--bearish';
    }
    if (normalized.indexOf('low risk') >= 0) return 'indicator-pill--bullish';
    if (normalized.indexOf('moderate risk') >= 0 || normalized.indexOf('elevated risk') >= 0) return 'indicator-pill--caution';
    if (normalized.indexOf('very high') >= 0 || normalized.indexOf('high risk') >= 0) return 'indicator-pill--bearish';
    if (
      normalized.indexOf('bull') >= 0 ||
      normalized.indexOf('strong') >= 0 ||
      normalized === 'healthy' ||
      normalized === 'cheap'
    ) return 'indicator-pill--bullish';
    if (
      normalized.indexOf('bear') >= 0 ||
      normalized.indexOf('weak') >= 0 ||
      normalized.indexOf('risk') >= 0 ||
      normalized === 'expensive'
    ) return 'indicator-pill--bearish';
    return 'indicator-pill--neutral';
  }

  function fundamentalsPanelHasMetrics(panel) {
    if (!panel || !Array.isArray(panel.sections)) return false;
    return panel.sections.some(function (section) {
      var metrics = Array.isArray(section && section.metrics) ? section.metrics : [];
      return metrics.some(function (metric) {
        return metric && metric.value != null;
      });
    });
  }

  function mobileQuickSummaryScrollTarget(sectionKey) {
    if (!ui || !ui.el) return null;
    var key = String(sectionKey || '').trim().toLowerCase();
    if (key === 'indicators') return ui.el.indicatorsPanel || null;
    if (key === 'fundamentals') return ui.el.fundamentalsPanel || null;
    if (key === 'risk') {
      var riskSection = ui.el.fundamentalsGrid
        ? ui.el.fundamentalsGrid.querySelector('.fundamentals-section--risk')
        : null;
      return riskSection || ui.el.fundamentalsPanel || null;
    }
    return null;
  }

  function scrollToMobileQuickSummarySection(sectionKey) {
    if (!window.matchMedia('(max-width: 1120px)').matches) return;
    var targetEl = mobileQuickSummaryScrollTarget(sectionKey);
    if (!targetEl) return;
    requestAnimationFrame(function () {
      var stickyTopOffset = getMobileRowFocusTopOffset();
      var extraGap = 8;
      var absoluteTop = Number(window.scrollY || window.pageYOffset || 0) + targetEl.getBoundingClientRect().top;
      var targetTop = Math.max(0, absoluteTop - stickyTopOffset - extraGap);
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    });
  }

  // Renders a compact TA/FA quick summary card shown only in mobile details flow.
  function renderMobileQuickSummary(asset, fundamentalsSnapshot) {
    if (!ui || !ui.el || !ui.el.mobileQuickSummaryPanel || !ui.el.mobileQuickSummaryGrid) return;
    var panelEl = ui.el.mobileQuickSummaryPanel;
    var isMobileLayout = window.matchMedia('(max-width: 1120px)').matches;
    if (!isMobileLayout || !asset) {
      panelEl.classList.add('hidden');
      panelEl.setAttribute('aria-hidden', 'true');
      if (ui.el.mobileQuickSummaryGrid) ui.el.mobileQuickSummaryGrid.innerHTML = '';
      if (ui.el.mobileQuickSummaryAsset) ui.el.mobileQuickSummaryAsset.textContent = 'No asset selected';
      return;
    }

    var taSummary = indicatorSummaryForAsset(asset);
    var taLabel = String(taSummary && taSummary.label || 'n/a').trim() || 'n/a';
    var taScore = taSummary && isFinite(Number(taSummary.score)) ? Number(taSummary.score) : null;

    var snapshot = fundamentalsSnapshot || getFundamentalsSnapshot(asset);
    if (!snapshot) {
      var cacheKey = fundamentalsCacheKeyForAsset(asset);
      snapshot = cacheKey ? getCachedAny(cacheKey) : null;
    }
    var panel = snapshot && snapshot.panel ? snapshot.panel : null;
    var qualityLabel = panel ? String(panel.qualityLabel || panel.label || 'n/a').trim() || 'n/a' : 'n/a';
    var valuationLabel = panel ? String(panel.valuationLabel || 'n/a').trim() || 'n/a' : 'n/a';
    if (!fundamentalsPanelHasMetrics(panel)) {
      qualityLabel = 'n/a';
      valuationLabel = 'n/a';
    }
    var riskLabel = 'n/a';
    var riskScore = null;
    if (panel && panel.riskMeter && typeof panel.riskMeter === 'object') {
      var riskFrames = panel.riskMeter.timeframes && typeof panel.riskMeter.timeframes === 'object'
        ? panel.riskMeter.timeframes
        : {};
      var riskRow = riskFrames['1d'] || riskFrames['1w'] || riskFrames['1m'] || null;
      if (riskRow && typeof riskRow === 'object') {
        riskLabel = String(riskRow.label || 'n/a').trim() || 'n/a';
        riskScore = isFinite(Number(riskRow.score)) ? Number(riskRow.score) : null;
      }
    }
    if (asset.type === 'crypto' && (!valuationLabel || valuationLabel === 'n/a')) {
      valuationLabel = String(panel && panel.label || 'n/a').trim() || 'n/a';
    }

    if (ui.el.mobileQuickSummaryAsset) {
      var assetLabel = String(asset.symbol || asset.name || 'Selected asset').trim();
      ui.el.mobileQuickSummaryAsset.textContent = assetLabel;
    }

    ui.el.mobileQuickSummaryGrid.innerHTML =
      '<button type="button" class="mobile-quick-summary__tile" data-summary-jump="indicators" aria-label="Go to Indicators section">' +
        '<div class="mobile-quick-summary__tile-head">' +
          '<span class="mobile-quick-summary__tile-title">Indicators</span>' +
          '<span class="indicator-pill ' + mobileQuickSummaryToneClass(taLabel) + '">' + escapeHtml(taLabel) + '</span>' +
        '</div>' +
        '<div class="mobile-quick-summary__meta">Weighted score: <strong>' + escapeHtml(taScore == null ? 'n/a' : String(taScore)) + '</strong></div>' +
      '</button>' +
      '<button type="button" class="mobile-quick-summary__tile" data-summary-jump="fundamentals" aria-label="Go to Fundamentals section">' +
        '<div class="mobile-quick-summary__tile-head">' +
          '<span class="mobile-quick-summary__tile-title">Fundamentals</span>' +
          '<span class="indicator-pill ' + mobileQuickSummaryToneClass(qualityLabel) + '">' + escapeHtml(qualityLabel) + '</span>' +
        '</div>' +
        '<div class="mobile-quick-summary__meta">Valuation: <strong class="mobile-quick-summary__valuation ' + mobileQuickSummaryToneClass(valuationLabel) + '">' + escapeHtml(valuationLabel) + '</strong></div>' +
      '</button>' +
      '<button type="button" class="mobile-quick-summary__tile" data-summary-jump="risk" aria-label="Go to Risk section">' +
        '<div class="mobile-quick-summary__tile-head">' +
          '<span class="mobile-quick-summary__tile-title">Risk</span>' +
          '<span class="indicator-pill ' + mobileQuickSummaryToneClass(riskLabel) + '">' + escapeHtml(riskLabel) + '</span>' +
        '</div>' +
        '<div class="mobile-quick-summary__meta">1D score: <strong>' + escapeHtml(riskScore == null ? 'n/a' : String(Math.round(riskScore))) + '</strong></div>' +
      '</button>';

    panelEl.classList.remove('hidden');
    panelEl.setAttribute('aria-hidden', 'false');
  }

  function renderDetails() {
    var asset = getSelectedAsset(state.app.mode);
    var computed = getSelectedComputed(state.app.mode);
    var baseQuote = asset ? getMarketFor(asset) : null;
    var fundamentals = asset ? getFundamentalsSnapshot(asset) : null;
    var detailTf = detailChartTimeframeForMode(state.app.mode);
    renderChartTimeframeButtons(ui.el.detailChartTimeframes, detailTf, 'detail', state.app.mode);
    ui.renderDetailHeader(asset, computed || {}, !!state.app.hideHoldings, baseQuote || null);
    ui.renderExternalLink(asset);
    renderUsefulLinks(asset);
    if (!asset) {
      renderMobileQuickSummary(null, null);
      ui.renderMarketData(null, null);
      if (state.app.mode === 'stocks') {
        ui.renderNews(state.news['stocks:general'] || [], 'No general market news yet. Use Refresh.');
      } else {
        ui.renderNews([], 'Select an asset to load news.');
      }
      ui.renderTwitter({ message: 'Select an asset to load Stocktwits feed.', searchUrl: '#', linkLabel: 'Open Stocktwits' });
      ui.renderFundamentals(null, null, 'Select an asset to load fundamentals.');
      chartMgr.renderAssetLine(ui.el.assetChart, ui.el.lineFallback, [], [], '');
      return;
    }
    var quoteData = getMarketFor(asset);
    var faSourceEnabled = fundamentalsSourceEnabled(asset.type === 'crypto' ? 'crypto' : 'stock');
    if (!faSourceEnabled) {
      ui.renderFundamentals(null, asset, 'Fundamentals source disabled in API Sources.');
    } else if (fundamentals) {
      attachRiskMeterToFundamentalsSnapshot({
        fundamentalsSnapshot: fundamentals,
        targetConfig: indicatorTargetFromAsset(asset),
        identityKey: riskCacheKeyForAsset(asset),
        onHydrated: function () {
          var selectedNow = getSelectedAsset(state.app.mode);
          if (!selectedNow || selectedNow.id !== asset.id || selectedNow.type !== asset.type) return;
          renderDetails();
        }
      });
      var faMsg = normalizeFundamentalsErrorMessage(
        (fundamentals && (fundamentals.errorDetail || fundamentals.errorCode || fundamentals.error)) || ''
      ) || 'Loading fundamentals...';
      ui.renderFundamentals(fundamentals, asset, faMsg);
    } else {
      ui.renderFundamentals(null, asset, 'Loading fundamentals...');
    }
    renderMobileQuickSummary(asset, fundamentals);
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
    if (faSourceEnabled) {
      refreshAssetFundamentals(asset, { force: false }).catch(function () {
        return null;
      });
    }
  }

  function renderUsefulLinks(asset) {
    var links = [];
    var mode = state.app.mode === 'crypto' ? 'crypto' : 'stocks';

    if (mode === 'stocks') {
      // Stocks: asset-specific first, then general market links.
      if (asset && asset.type === 'stock' && asset.symbol) {
        links.push({
          label: 'TradingView (' + asset.symbol + ')',
          href: 'https://www.tradingview.com/symbols/' + encodeURIComponent(asset.symbol) + '/',
          note: 'Chart, ideas, and market overview'
        });
        links.push({
          label: 'Finviz (' + asset.symbol + ')',
          href: 'https://finviz.com/quote.ashx?t=' + encodeURIComponent(asset.symbol),
          note: 'Quote, news, and technical snapshot'
        });
      }
      links.push({
        label: 'AskCharly Ratings',
        href: 'https://www.askcharly.ai/ratings',
        note: 'Analyst-style ratings dashboard (stocks)'
      });
      links.push({
        label: 'Finviz Screener',
        href: 'https://finviz.com/screener.ashx',
        note: 'Stock screener and market overview'
      });
      links.push({
        label: 'Finviz Heatmap',
        href: 'https://finviz.com/map.ashx?t=sec',
        note: 'Sector performance map'
      });
      links.push({
        label: 'Fear & Greed Index',
        href: 'https://feargreedmeter.com/fear-and-greed-index',
        note: 'Stocks market sentiment index'
      });
      links.push({
        label: 'Yahoo Stock Market News',
        href: 'https://finance.yahoo.com/topic/stock-market-news/',
        note: 'Yahoo Finance stock market headlines'
      });
      links.push({
        label: 'Reddit r/investing',
        href: 'https://www.reddit.com/r/investing/',
        note: 'Long-term investing discussions'
      });
      links.push({
        label: 'Reddit r/stocks',
        href: 'https://www.reddit.com/r/stocks/',
        note: 'Stock market news and ideas'
      });
      links.push({
        label: 'Reddit r/SecurityAnalysis',
        href: 'https://www.reddit.com/r/SecurityAnalysis/',
        note: 'Fundamental and valuation analysis'
      });
      links.push({
        label: 'Reddit r/ValueInvesting',
        href: 'https://www.reddit.com/r/ValueInvesting/',
        note: 'Value investing research and discussion'
      });
      links.push({
        label: 'Reddit r/wallstreetbets',
        href: 'https://www.reddit.com/r/wallstreetbets/',
        note: 'High-risk retail trading discussions'
      });
      links.push({
        label: '4chan /biz/ (NSFW)',
        href: 'https://boards.4chan.org/biz/catalog',
        note: 'NSFW warning: unmoderated finance/crypto board'
      });
    } else {
      // Crypto: token-specific first, then general market links.
      if (asset && asset.type === 'crypto') {
        if (asset.coinId) {
          links.push({
            label: 'CoinGecko (' + asset.symbol + ')',
            href: 'https://www.coingecko.com/en/coins/' + encodeURIComponent(asset.coinId),
            note: 'Market data and coin overview'
          });
        }
      }
      links.push({
        label: 'TradingView Crypto Heatmap',
        href: 'https://www.tradingview.com/heatmap/crypto/',
        note: 'Crypto market heatmap'
      });
      links.push({
        label: 'CoinGecko Trending',
        href: 'https://www.coingecko.com/en/discover',
        note: 'Broader crypto discovery and trends'
      });
      links.push({
        label: 'Crypto Fear & Greed',
        href: 'https://feargreedmeter.com/crypto-fear-and-greed-index',
        note: 'Crypto market sentiment index'
      });
      links.push({
        label: 'Yahoo Crypto',
        href: 'https://finance.yahoo.com/topic/crypto/',
        note: 'Yahoo Finance crypto market headlines'
      });
      links.push({
        label: 'Reddit r/CryptoMoonShots',
        href: 'https://www.reddit.com/r/CryptoMoonShots/',
        note: 'Small-cap and speculative token discussions'
      });
      links.push({
        label: 'Reddit r/CryptoMarkets',
        href: 'https://www.reddit.com/r/CryptoMarkets/',
        note: 'Market structure, news, and trading discussion'
      });
      links.push({
        label: 'Reddit r/CryptoCurrency',
        href: 'https://www.reddit.com/r/CryptoCurrency/',
        note: 'General crypto news and community discussion'
      });
      links.push({
        label: 'CoinGlass CBBI Index',
        href: 'https://www.coinglass.com/pro/i/cbbi-index',
        note: 'Bitcoin cycle benchmark index'
      });
      links.push({
        label: 'CoinGlass Pi Cycle Top',
        href: 'https://www.coinglass.com/pro/i/pi-cycle-top-indicator',
        note: 'Cycle-top indicator view'
      });
      links.push({
        label: 'CoinGlass 200WMA',
        href: 'https://www.coinglass.com/pro/i/200WMA',
        note: '200-week moving average tracker'
      });
      links.push({
        label: 'CoinGlass Bitcoin Power Law',
        href: 'https://www.coinglass.com/pro/i/bitcoin-power-law',
        note: 'Bitcoin power-law model view'
      });
      links.push({
        label: 'CoinGlass MA',
        href: 'https://www.coinglass.com/pro/i/MA',
        note: 'Moving-average indicator dashboard'
      });
      links.push({
        label: 'CoinGlass RSI Heatmap',
        href: 'https://www.coinglass.com/pro/i/RsiHeatMap',
        note: 'RSI heatmap across tokens'
      });
      links.push({
        label: '4chan /biz/ (NSFW)',
        href: 'https://boards.4chan.org/biz/catalog',
        note: 'NSFW warning: unmoderated finance/crypto board'
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

  // Toggles UI-only holdings scramble mode (stock tickers + percentage displays).
  function applyHoldingsScrambleToggle() {
    state.app.scrambleHoldings = !state.app.scrambleHoldings;
    if (state.app.scrambleHoldings) HOLDINGS_SCRAMBLE_SEED = id();
    renderAll();
  }

  function applyCryptoParticlesToggle() {
    state.app.cryptoParticlesEnabled = !state.app.cryptoParticlesEnabled;
    renderAll();
  }

  function applyUiTransparencyToggle() {
    state.app.uiTransparencyEnabled = !state.app.uiTransparencyEnabled;
    renderAll();
  }

  // Sets the stock allocation chart mode (stocks vs sectors) and re-renders pie/list.
  function applyStockAllocationMode(mode) {
    var safeMode = mode === 'sectors' ? 'sectors' : 'stocks';
    if (state.app.allocationModeStocks === safeMode) return;
    state.app.allocationModeStocks = safeMode;
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
      storage.saveDemoPortfolioBackup(buildPortfolioPersistencePayload());
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
    applyPortfolioPayload(backup);
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

  function normalizeApiDebugPanelPosition(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var left = Number(raw.left);
    var top = Number(raw.top);
    if (!isFinite(left) || !isFinite(top)) return null;
    return { left: Math.round(left), top: Math.round(top) };
  }

  function apiDebugPanelSupportsDrag() {
    return !!(window.matchMedia && window.matchMedia('(min-width: 981px)').matches);
  }

  function clearApiDebugPanelInlinePosition(panelEl) {
    if (!panelEl) return;
    panelEl.style.removeProperty('left');
    panelEl.style.removeProperty('top');
    panelEl.style.removeProperty('right');
    panelEl.style.removeProperty('bottom');
    panelEl.classList.remove('api-debug-panel--drag-enabled');
  }

  function clampApiDebugPanelPosition(left, top, width, height) {
    var margin = 8;
    var panelWidth = Math.max(120, Number(width) || 0);
    var panelHeight = Math.max(80, Number(height) || 0);
    var maxLeft = Math.max(margin, window.innerWidth - panelWidth - margin);
    var maxTop = Math.max(margin, window.innerHeight - panelHeight - margin);
    var nextLeft = Math.max(margin, Math.min(Number(left) || margin, maxLeft));
    var nextTop = Math.max(margin, Math.min(Number(top) || margin, maxTop));
    return {
      left: Math.round(nextLeft),
      top: Math.round(nextTop)
    };
  }

  function applyApiDebugPanelPosition(position, persistPosition) {
    if (!ui || !ui.el || !ui.el.apiDebugPanel) return null;
    var panelEl = ui.el.apiDebugPanel;
    if (!apiDebugPanelSupportsDrag()) {
      clearApiDebugPanelInlinePosition(panelEl);
      return null;
    }
    var rect = panelEl.getBoundingClientRect();
    var width = Math.max(200, Math.round(rect.width || panelEl.offsetWidth || 0));
    var height = Math.max(120, Math.round(rect.height || panelEl.offsetHeight || 0));
    var normalized = normalizeApiDebugPanelPosition(position);
    if (!normalized) {
      normalized = clampApiDebugPanelPosition(window.innerWidth - width - 16, 100, width, height);
    } else {
      normalized = clampApiDebugPanelPosition(normalized.left, normalized.top, width, height);
    }
    panelEl.style.left = normalized.left + 'px';
    panelEl.style.top = normalized.top + 'px';
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
    panelEl.classList.add('api-debug-panel--drag-enabled');
    if (persistPosition) {
      state.app.apiDebugPanelPosition = { left: normalized.left, top: normalized.top };
    }
    return normalized;
  }

  function syncApiDebugPanelPosition() {
    if (!ui || !ui.el || !ui.el.apiDebugPanel) return;
    if (ui.el.apiDebugPanel.classList.contains('hidden')) return;
    applyApiDebugPanelPosition(state.app.apiDebugPanelPosition, false);
  }

  function stopApiDebugPanelDrag(commit) {
    if (!API_DEBUG_DRAG.active) return;
    API_DEBUG_DRAG.active = false;
    API_DEBUG_DRAG.pointerId = null;
    window.removeEventListener('pointermove', onApiDebugPanelPointerMove);
    window.removeEventListener('pointerup', onApiDebugPanelPointerUp);
    window.removeEventListener('pointercancel', onApiDebugPanelPointerUp);
    if (!ui || !ui.el || !ui.el.apiDebugPanel) return;
    ui.el.apiDebugPanel.classList.remove('is-dragging');
    if (commit) {
      var saved = applyApiDebugPanelPosition(state.app.apiDebugPanelPosition || {
        left: API_DEBUG_DRAG.left,
        top: API_DEBUG_DRAG.top
      }, true);
      if (saved) persist();
    }
  }

  function onApiDebugPanelPointerMove(event) {
    if (!API_DEBUG_DRAG.active) return;
    if (API_DEBUG_DRAG.pointerId != null && event.pointerId !== API_DEBUG_DRAG.pointerId) return;
    if (!ui || !ui.el || !ui.el.apiDebugPanel) return;
    var dx = Number(event.clientX || 0) - API_DEBUG_DRAG.startX;
    var dy = Number(event.clientY || 0) - API_DEBUG_DRAG.startY;
    var next = clampApiDebugPanelPosition(
      API_DEBUG_DRAG.left + dx,
      API_DEBUG_DRAG.top + dy,
      API_DEBUG_DRAG.width,
      API_DEBUG_DRAG.height
    );
    ui.el.apiDebugPanel.style.left = next.left + 'px';
    ui.el.apiDebugPanel.style.top = next.top + 'px';
    ui.el.apiDebugPanel.style.right = 'auto';
    ui.el.apiDebugPanel.style.bottom = 'auto';
    state.app.apiDebugPanelPosition = { left: next.left, top: next.top };
    event.preventDefault();
  }

  function onApiDebugPanelPointerUp(event) {
    if (!API_DEBUG_DRAG.active) return;
    if (API_DEBUG_DRAG.pointerId != null && event.pointerId !== API_DEBUG_DRAG.pointerId) return;
    stopApiDebugPanelDrag(true);
  }

  function beginApiDebugPanelDrag(event) {
    if (!apiDebugPanelSupportsDrag()) return;
    if (!ui || !ui.el || !ui.el.apiDebugPanel || ui.el.apiDebugPanel.classList.contains('hidden')) return;
    if (event.button != null && event.button !== 0) return;
    var handle = event.target && event.target.closest ? event.target.closest('.api-debug-panel__head') : null;
    if (!handle) return;
    var panelEl = ui.el.apiDebugPanel;
    var rect = panelEl.getBoundingClientRect();
    var current = applyApiDebugPanelPosition(state.app.apiDebugPanelPosition || {
      left: rect.left,
      top: rect.top
    }, false) || { left: rect.left, top: rect.top };
    API_DEBUG_DRAG.active = true;
    API_DEBUG_DRAG.pointerId = event.pointerId != null ? event.pointerId : null;
    API_DEBUG_DRAG.startX = Number(event.clientX || 0);
    API_DEBUG_DRAG.startY = Number(event.clientY || 0);
    API_DEBUG_DRAG.left = Number(current.left || rect.left || 0);
    API_DEBUG_DRAG.top = Number(current.top || rect.top || 0);
    API_DEBUG_DRAG.width = Math.max(200, Math.round(rect.width || panelEl.offsetWidth || 0));
    API_DEBUG_DRAG.height = Math.max(120, Math.round(rect.height || panelEl.offsetHeight || 0));
    panelEl.classList.add('is-dragging');
    window.addEventListener('pointermove', onApiDebugPanelPointerMove);
    window.addEventListener('pointerup', onApiDebugPanelPointerUp);
    window.addEventListener('pointercancel', onApiDebugPanelPointerUp);
    event.preventDefault();
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
    AUTO_TIMER = setTimeout(runAutocompleteSearch, 500);
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
      var maxAgeMs = options.force ? 0 : (1000 * 60 * 60);
      return cacheWrap(key, maxAgeMs, function () {
        return PT.StockAPI.getQuote(asset, {
          skipYahooExtras: !!options.skipYahooExtras,
          twelveDataPremarketFallback: !!options.twelveDataPremarketFallback,
          force: !!options.force
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
    var source = asset.type === 'crypto' ? (state.app.newsSourceCrypto || 'auto') : (state.app.newsSourceStocks || 'marketaux');
    var allowCrossSourceFallback = source === 'auto';
    var key = newsCacheKeyForAsset(asset);
    function stillActiveSource() {
      var current = asset.type === 'crypto' ? (state.app.newsSourceCrypto || 'auto') : (state.app.newsSourceStocks || 'marketaux');
      return current === source;
    }
    function applyNewsItems(items) {
      if (!stillActiveSource()) return items;
      state.news[assetKey(asset)] = items;
      renderDetails();
      return items;
    }
    var fetcher = function () {
      return PT.NewsAPI.getNews(asset, { source: source, force: !!options.force });
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
      applyNewsItems(items);
    }).catch(function () {
      var cached = storage.getCached(state.caches, key, 1000 * 60 * 60 * 24 * 3);
      if (!cached && allowCrossSourceFallback) cached = anySourceNewsCacheForAsset(asset, 1000 * 60 * 60 * 24 * 3);
      if (cached) {
        applyNewsItems(cached);
        return;
      }
      loadRemoteSnapshot().then(function (remoteItems) {
        applyNewsItems(remoteItems || []);
      }).catch(function () {
        applyNewsItems([]);
      });
    });
  }

  function refreshGeneralStocksNews(options) {
    options = options || {};
    var source = state.app.newsSourceStocks || 'marketaux';
    var allowCrossSourceFallback = source === 'auto';
    var key = newsCacheKeyForGeneralStocks();
    function stillActiveSource() {
      return (state.app.newsSourceStocks || 'marketaux') === source;
    }
    function applyGeneralNews(items) {
      if (!stillActiveSource()) return items;
      state.news['stocks:general'] = items || [];
      renderDetails();
      return items || [];
    }
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
      return applyGeneralNews(items || []);
    }).catch(function () {
      var cached = storage.getCached(state.caches, key, 1000 * 60 * 60 * 24 * 3);
      if (!cached && allowCrossSourceFallback) cached = anySourceGeneralStocksNewsCache(1000 * 60 * 60 * 24 * 3);
      if (cached) {
        return applyGeneralNews(cached);
      }
      return loadRemoteSnapshot().then(function (remoteItems) {
        return applyGeneralNews(remoteItems || []);
      }).catch(function () {
        return applyGeneralNews([]);
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

  function snapshotVisibleNewsForCurrentSource() {
    var changed = false;
    if (state.app.mode === 'stocks') {
      var sourceStocks = state.app.newsSourceStocks || 'marketaux';
      if (state.app.newsScopeStocks === 'general') {
        var generalItems = state.news['stocks:general'];
        if (Array.isArray(generalItems) && generalItems.length) {
          storage.setCached(state.caches, 'news:' + sourceStocks + ':stock:general', generalItems);
          changed = true;
        }
      } else {
        var selectedStock = getSelectedAsset('stocks');
        var selectedItems = selectedStock ? state.news[assetKey(selectedStock)] : null;
        if (selectedStock && Array.isArray(selectedItems) && selectedItems.length) {
          storage.setCached(state.caches, 'news:' + sourceStocks + ':stock:' + (selectedStock.symbol || ''), selectedItems);
          changed = true;
        }
      }
    } else {
      var sourceCrypto = state.app.newsSourceCrypto || 'auto';
      var selectedCrypto = getSelectedAsset('crypto');
      var cryptoItems = selectedCrypto ? state.news[assetKey(selectedCrypto)] : null;
      if (selectedCrypto && Array.isArray(cryptoItems) && cryptoItems.length) {
        storage.setCached(state.caches, 'news:' + sourceCrypto + ':crypto:' + (selectedCrypto.coinId || selectedCrypto.symbol || ''), cryptoItems);
        changed = true;
      }
    }
    if (changed) storage.saveCache(state.caches);
  }

  function hydrateCurrentNewsScopeFromCache(maxAgeMs) {
    if (state.app.mode === 'stocks') {
      if (state.app.newsScopeStocks === 'general') {
        var generalKey = newsCacheKeyForGeneralStocks();
        var generalCached = storage.getCached(state.caches, generalKey, maxAgeMs || 0) || getCachedAny(generalKey);
        if (Array.isArray(generalCached) && generalCached.length) {
          state.news['stocks:general'] = generalCached;
          return generalCached;
        }
        return null;
      }
      var selectedStock = getSelectedAsset('stocks');
      return selectedStock ? hydrateAssetNewsFromCache(selectedStock, maxAgeMs || 0) : null;
    }
    var selected = getSelectedAsset(state.app.mode);
    return selected ? hydrateAssetNewsFromCache(selected, maxAgeMs || 0) : null;
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

  // Fetches fundamentals for the active asset using the dedicated long-lived FA cache path.
  function refreshAssetFundamentals(asset, options) {
    options = options || {};
    if (!asset || !PT.FundamentalsAPI || typeof PT.FundamentalsAPI.getAssetFundamentals !== 'function') {
      return Promise.resolve(null);
    }
    if (!fundamentalsSourceEnabled(asset.type === 'crypto' ? 'crypto' : 'stock')) {
      return Promise.resolve({ disabled: true });
    }

    var cacheKey = fundamentalsCacheKeyForAsset(asset) || assetKey(asset);
    var existing = getFundamentalsSnapshot(asset);
    var needsCryptoBandRefresh = asset.type === 'crypto' && cryptoFundamentalsNeedsMarketCapRefresh(existing);
    var lastLocal = Number(existing && (existing.localFetchedAt || existing.fetchedAt || 0) || 0);
    var existingIsError = !!(existing && !existing.panel && (existing.error || existing.errorCode || existing.errorDetail));
    var existingErrorText = String(existing && (existing.errorDetail || existing.errorCode || existing.error || '') || '').toLowerCase();
    var legacyGenericError = existingIsError && (
      existingErrorText.indexOf('temporarily unavailable') >= 0 ||
      existingErrorText.indexOf('no fundamentals snapshot yet') >= 0 ||
      existingErrorText.indexOf('legacy endpoint') >= 0
    );
    var freshnessWindowMs = existingIsError
      ? (legacyGenericError ? 0 : FUNDAMENTALS_ERROR_RETRY_MS)
      : FUNDAMENTALS_LOCAL_FRESH_MS;
    if (!options.force && !needsCryptoBandRefresh && existing && (Date.now() - lastLocal) <= freshnessWindowMs) {
      if (state.app.apiDebugEnabled) {
        try {
          console.debug('[FA]', 'cache hit', cacheKey);
        } catch (err) {}
      }
      return Promise.resolve(existing);
    }

    var lastRequestStamp = Number(FUNDAMENTALS_REQUEST_STAMPS[cacheKey] || 0) || 0;
    if (!options.force && !needsCryptoBandRefresh && lastRequestStamp && (Date.now() - lastRequestStamp) <= 15000) {
      if (state.app.apiDebugEnabled) {
        try {
          console.debug('[FA]', 'request cooldown hit', cacheKey);
        } catch (err) {}
      }
      return Promise.resolve(existing || null);
    }

    if (FUNDAMENTALS_IN_FLIGHT[cacheKey]) return FUNDAMENTALS_IN_FLIGHT[cacheKey];
    FUNDAMENTALS_REQUEST_STAMPS[cacheKey] = Date.now();

    if (state.app.apiDebugEnabled) {
      try {
        console.debug('[FA]', 'cache miss', cacheKey, 'force=', !!options.force, 'needsCryptoBandRefresh=', !!needsCryptoBandRefresh);
      } catch (err) {}
    }

    FUNDAMENTALS_IN_FLIGHT[cacheKey] = PT.FundamentalsAPI.getAssetFundamentals(asset, {
      includeProtocol: asset.type === 'crypto' && fundamentalsProtocolSourceEnabled(),
      force: !!options.force
    }).then(function (payload) {
      setFundamentalsSnapshot(asset, payload);
      if (state.app.apiDebugEnabled) {
        try {
          console.debug(
            '[FA]',
            'loaded',
            cacheKey,
            payload && payload.panel ? (payload.panel.qualityLabel || payload.panel.label || 'n/a') : 'n/a',
            payload && payload.panel ? (payload.panel.valuationLabel || 'n/a') : 'n/a',
            payload && payload.panel ? payload.panel.reasons : []
          );
        } catch (err) {}
      }
      var selected = getSelectedAsset(state.app.mode);
      if (selected && selected.id === asset.id && selected.type === asset.type) {
        renderDetails();
      }
      return payload;
    }).catch(function (err) {
      if (state.app.apiDebugEnabled) {
        try {
          console.debug('[FA]', 'load failed', cacheKey, (err && err.message) || 'unknown');
        } catch (e) {}
      }
      if (existing && existing.panel) return existing;
      var rawCode = String((err && err.message) || 'fundamentals_failed').trim() || 'fundamentals_failed';
      var friendly = normalizeFundamentalsErrorMessage(rawCode) || 'Fundamentals unavailable.';
      var fallbackPanel = buildUnavailableFundamentalsPanel(asset, friendly);
      var errorSnapshot = Object.assign({}, existing || {}, {
        assetType: asset.type === 'crypto' ? 'crypto' : 'stock',
        symbol: asset.type === 'stock' ? String(asset.yahooSymbol || asset.symbol || '').trim().toUpperCase() : undefined,
        coinId: asset.type === 'crypto' ? String(asset.coinId || asset.id || '').trim().toLowerCase() : undefined,
        panel: fallbackPanel,
        error: friendly,
        errorCode: rawCode,
        errorDetail: friendly,
        note: friendly,
        fetchedAt: Number(existing && existing.fetchedAt || 0) || Date.now()
      });
      setFundamentalsSnapshot(asset, errorSnapshot);
      var selectedAsset = getSelectedAsset(state.app.mode);
      if (selectedAsset && selectedAsset.id === asset.id && selectedAsset.type === asset.type) {
        renderDetails();
      }
      return errorSnapshot;
    }).finally(function () {
      delete FUNDAMENTALS_IN_FLIGHT[cacheKey];
    });

    return FUNDAMENTALS_IN_FLIGHT[cacheKey];
  }

  // Forces/loads fundamentals for the currently selected asset in the active mode.
  function refreshSelectedFundamentals(force) {
    var selected = getSelectedAsset(state.app.mode);
    if (!selected) return Promise.resolve(null);
    return refreshAssetFundamentals(selected, { force: !!force }).catch(function () {
      return null;
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
    var stockQuote = asset.type === 'stock'
      ? (state.market.stocks[asset.id] || getCachedAny(stockQuoteCacheKey(asset)))
      : null;
    var hasSessionPrice = !!(stockQuote && (
      isFinite(Number(stockQuote.preMarketPrice)) ||
      isFinite(Number(stockQuote.postMarketPrice))
    ));
    var sessionCheckedAt = Number(stockQuote && stockQuote.sessionExtrasCheckedAt || 0);
    var sessionCheckFresh = sessionCheckedAt > 0 && (Date.now() - sessionCheckedAt) <= (1000 * 60 * 60);
    var needsSessionEnrichment = !!(asset.type === 'stock' && !hasSessionPrice && !sessionCheckFresh);
    var detailStampKey = assetDetailRefreshCacheKey(asset, includeNews);
    var needsNewsRefreshOnSelect = !!(includeNews && options.onSelect && asset.type === 'stock' && !hasFreshNews(asset, 1000 * 60 * 60));
    if (hasFreshAssetDetail(asset, includeNews) && !needsNewsRefreshOnSelect && !needsSessionEnrichment) {
      renderAll();
      setStatus('Using cached ' + asset.symbol + ' • ' + new Date().toLocaleTimeString());
      return Promise.resolve({ cached: true });
    }
    ASSET_DETAIL_REFRESH_STAMPS[detailStampKey] = Date.now();
    setStatus('Refreshing ' + asset.symbol + '...');
    var tasks = [];
    refreshAssetTwitter(asset);
    tasks.push(refreshAssetQuote(asset, {
      skipYahooExtras: !!(options.onSelect && asset.type === 'stock' && !needsSessionEnrichment),
      twelveDataPremarketFallback: !!(options.onSelect && asset.type === 'stock'),
      force: !!(options.onSelect && needsSessionEnrichment)
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
          // Critical: allow prev-close history fallback so daily change does not rely on stale cached hints.
          skipPrevCloseNetwork: false
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
          Promise.allSettled([refreshAssetHistory(selectedCrypto), refreshAssetNews(selectedCrypto)])
            .then(function (results) {
              return {
                historyOk: results[0] && results[0].status === 'fulfilled',
                newsOk: results[1] && results[1].status === 'fulfilled'
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
        var detailFailed = detail ? (!detail.historyOk || !detail.newsOk) : false;
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
      refreshAssetTwitter(asset);
      return Promise.allSettled([refreshAssetQuote(asset)]).then(function (results) {
        return {
          kind: 'asset',
          asset: asset,
          quoteOk: results[0] && results[0].status === 'fulfilled'
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
          if (!x.quoteOk) hadAnyFailure = true;
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

  // Re-renders quote freshness icons from cached timestamps only (no fetch/save side effects).
  function refreshQuoteFreshnessBadges() {
    if (!ui || !ui.el || !ui.el.portfolioList) return;
    var scrambleStockDisplays = state.app.mode === 'stocks' && !!state.app.scrambleHoldings;
    var items = getModeComputedItems(state.app.mode);
    ensureValidSelection(state.app.mode, items);
    ui.renderPortfolio({
      mode: state.app.mode,
      items: items,
      selectedKey: state.app.selectedKey,
      hideHoldings: !!state.app.hideHoldings,
      scrambleHoldings: scrambleStockDisplays,
      scrambleSeed: HOLDINGS_SCRAMBLE_SEED
    });
    syncMobileFocusedRowAfterRender();
    if (PANEL_VIEWER.type === 'holdings') renderPanelViewerContent();
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
    if (shouldScrollToChart && MOBILE_ROW_FOCUS.active && MOBILE_ROW_FOCUS.key === key) {
      unlockMobileFocusedRow();
      scrollToHoldingsRowOnMobile(key);
      return;
    }
    if (shouldScrollToChart && MOBILE_ROW_FOCUS.active && MOBILE_ROW_FOCUS.key !== key) {
      unlockMobileFocusedRow();
    }
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
      lockMobileFocusedRow(key);
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
      if (!isMobileHoldingsInteractionMode()) {
        anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      var stickyTopOffset = getMobileRowFocusTopOffset();
      var stickyHost = getMobileRowStickyHost();
      var stickyRowHeight = 0;
      if (stickyHost && !stickyHost.classList.contains('hidden')) {
        var stickyRect = stickyHost.getBoundingClientRect();
        stickyRowHeight = Math.max(0, Math.round(stickyRect.height || stickyHost.offsetHeight || 0));
      }
      var extraGap = 8;
      var absoluteTop = Number(window.scrollY || window.pageYOffset || 0) + anchor.getBoundingClientRect().top;
      var targetTop = Math.max(0, absoluteTop - stickyTopOffset - stickyRowHeight - extraGap);
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    });
  }

  // Returns true when mobile stacked layout rules are active for holdings interactions.
  function isMobileHoldingsInteractionMode() {
    return window.matchMedia('(max-width: 1120px)').matches;
  }

  // Returns the dedicated sticky host used for mobile holdings row focus mode.
  function getMobileRowStickyHost() {
    return document.getElementById('mobileRowStickyHost');
  }

  // Resolves the top offset used for the locked row so it sits below visible sticky chrome.
  function getMobileRowFocusTopOffset() {
    var offset = 8;
    var topbarEl = document.querySelector('.topbar');
    if (!topbarEl) return offset;
    var rect = topbarEl.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < (window.innerHeight * 0.65)) {
      offset = Math.max(offset, Math.round(rect.bottom + 8));
    }
    return offset;
  }

  // Finds a holdings row shell by key inside the current holdings list.
  function getPortfolioRowShellByKey(key) {
    if (!ui || !ui.el || !ui.el.portfolioList) return null;
    var safeKey = String(key || '').trim();
    if (!safeKey) return null;
    var nodes = ui.el.portfolioList.querySelectorAll('.asset-row-shell');
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (String(nodes[i].dataset && nodes[i].dataset.key || '') === safeKey) return nodes[i];
    }
    return null;
  }

  // Updates sticky host top offset for the focused holdings row in mobile mode.
  function applyMobileRowFocusPosition() {
    if (!MOBILE_ROW_FOCUS.active) return;
    var hostEl = getMobileRowStickyHost();
    if (!hostEl) return;
    var topOffset = getMobileRowFocusTopOffset();
    MOBILE_ROW_FOCUS.topOffset = topOffset;
    hostEl.style.setProperty('--mobile-row-sticky-top', topOffset + 'px');
  }

  // Renders the sticky host with a cloned holdings row for mobile focus mode.
  function renderMobileRowStickyHost() {
    var hostEl = getMobileRowStickyHost();
    if (!hostEl) return;
    if (!MOBILE_ROW_FOCUS.active || !isMobileHoldingsInteractionMode()) {
      hostEl.innerHTML = '';
      hostEl.classList.add('hidden');
      hostEl.setAttribute('aria-hidden', 'true');
      hostEl.style.removeProperty('--mobile-row-sticky-top');
      return;
    }
    var key = String(MOBILE_ROW_FOCUS.key || '').trim();
    if (!key) return;
    var sourceShell = getPortfolioRowShellByKey(key);
    if (!sourceShell) {
      unlockMobileFocusedRow();
      return;
    }
    MOBILE_ROW_FOCUS.shell = sourceShell;
    var cloneShell = sourceShell.cloneNode(true);
    cloneShell.classList.add('asset-row-shell--mobile-sticky-preview');
    var openMenus = cloneShell.querySelectorAll('.asset-row__mobile-menu[open]');
    openMenus.forEach(function (menu) { menu.removeAttribute('open'); });
    hostEl.innerHTML = '';
    hostEl.appendChild(cloneShell);
    hostEl.classList.remove('hidden');
    hostEl.setAttribute('aria-hidden', 'false');
    applyMobileRowFocusPosition();
  }

  // Clears sticky host and focus references for the currently focused holdings row.
  function clearMobileRowFocusNodes() {
    var hostEl = getMobileRowStickyHost();
    if (hostEl) {
      hostEl.innerHTML = '';
      hostEl.classList.add('hidden');
      hostEl.setAttribute('aria-hidden', 'true');
      hostEl.style.removeProperty('--mobile-row-sticky-top');
    }
    MOBILE_ROW_FOCUS.shell = null;
  }

  // Releases mobile row focus mode and restores the holdings row to normal flow.
  function unlockMobileFocusedRow() {
    if (!MOBILE_ROW_FOCUS.active) return;
    window.removeEventListener('scroll', handleMobileRowFocusScroll);
    window.removeEventListener('resize', handleMobileRowFocusResize);
    clearMobileRowFocusNodes();
    MOBILE_ROW_FOCUS.active = false;
    MOBILE_ROW_FOCUS.key = null;
    MOBILE_ROW_FOCUS.topOffset = 8;
  }

  // Handles scroll updates for mobile focused rows and unlocks once the row returns to normal place.
  function handleMobileRowFocusScroll() {
    if (!MOBILE_ROW_FOCUS.active) return;
    if (!isMobileHoldingsInteractionMode()) {
      unlockMobileFocusedRow();
      return;
    }
    var currentY = Number(window.scrollY || window.pageYOffset || 0);
    var isScrollingUp = currentY <= MOBILE_ROW_FOCUS.scrollY;
    MOBILE_ROW_FOCUS.scrollY = currentY;
    applyMobileRowFocusPosition();
    if (!isScrollingUp) return;
    var sourceShell = getPortfolioRowShellByKey(MOBILE_ROW_FOCUS.key);
    if (!sourceShell || !sourceShell.isConnected) {
      unlockMobileFocusedRow();
      return;
    }
    if (sourceShell.getBoundingClientRect().top >= (MOBILE_ROW_FOCUS.topOffset - 1)) {
      unlockMobileFocusedRow();
    }
  }

  // Handles viewport changes for the mobile focused row lock state.
  function handleMobileRowFocusResize() {
    if (!MOBILE_ROW_FOCUS.active) return;
    if (!isMobileHoldingsInteractionMode()) {
      unlockMobileFocusedRow();
      return;
    }
    applyMobileRowFocusPosition();
  }

  // Locks a holdings row into the dedicated sticky host in mobile mode.
  function lockMobileFocusedRow(key) {
    if (!isMobileHoldingsInteractionMode()) return false;
    var shellEl = getPortfolioRowShellByKey(key);
    if (!shellEl || !shellEl.parentNode) return false;

    var wasActive = MOBILE_ROW_FOCUS.active;
    if (wasActive) clearMobileRowFocusNodes();
    MOBILE_ROW_FOCUS.active = true;
    MOBILE_ROW_FOCUS.key = String(key || '').trim();
    MOBILE_ROW_FOCUS.shell = shellEl;
    MOBILE_ROW_FOCUS.scrollY = Number(window.scrollY || window.pageYOffset || 0);
    renderMobileRowStickyHost();

    if (!wasActive) {
      window.addEventListener('scroll', handleMobileRowFocusScroll, { passive: true });
      window.addEventListener('resize', handleMobileRowFocusResize, { passive: true });
    }
    return true;
  }

  // Rebinds the mobile focused row lock after holdings list re-renders.
  function syncMobileFocusedRowAfterRender() {
    if (!MOBILE_ROW_FOCUS.active) return;
    if (!isMobileHoldingsInteractionMode()) {
      unlockMobileFocusedRow();
      return;
    }
    var key = String(MOBILE_ROW_FOCUS.key || '').trim();
    if (!key) {
      unlockMobileFocusedRow();
      return;
    }
    if (!getPortfolioRowShellByKey(key)) {
      unlockMobileFocusedRow();
      return;
    }
    renderMobileRowStickyHost();
  }

  // Scrolls the viewport back to holdings for the selected row.
  function scrollToHoldingsRowOnMobile(key) {
    if (!ui || !ui.el) return;
    var anchor = getPortfolioRowShellByKey(key) || ui.el.holdingsPanel;
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
    if (ui.el.holdingsRefreshBtn) ui.el.holdingsRefreshBtn.addEventListener('click', runManualRefreshAction);
    if (ui.el.allocationModeStocksBtn) {
      ui.el.allocationModeStocksBtn.addEventListener('click', function () {
        applyStockAllocationMode('stocks');
      });
    }
    if (ui.el.allocationModeSectorsBtn) {
      ui.el.allocationModeSectorsBtn.addEventListener('click', function () {
        applyStockAllocationMode('sectors');
      });
    }
    if (ui.el.allocationResetSectorsBtn) {
      ui.el.allocationResetSectorsBtn.addEventListener('click', function (event) {
        event.preventDefault();
        if (ui.el.allocationResetSectorsBtn.disabled) return;
        var modeItems = getModeComputedItems('stocks');
        resetCustomSectorsForItems(modeItems);
      });
    }
    if (ui.el.openHoldingsPanelBtn) ui.el.openHoldingsPanelBtn.addEventListener('click', function () { openPanelViewer('holdings'); });
    if (ui.el.openAllocationPanelBtn) ui.el.openAllocationPanelBtn.addEventListener('click', function () { openPanelViewer('allocation'); });
    if (ui.el.openIndicatorsPanelBtn) ui.el.openIndicatorsPanelBtn.addEventListener('click', function () { openPanelViewer('indicators'); });
    if (ui.el.openFundamentalsPanelBtn) ui.el.openFundamentalsPanelBtn.addEventListener('click', function () { openPanelViewer('fundamentals'); });
    if (ui.el.openNewsPanelBtn) ui.el.openNewsPanelBtn.addEventListener('click', function () { openPanelViewer('news'); });
    if (ui.el.mobileQuickSummaryGrid) {
      ui.el.mobileQuickSummaryGrid.addEventListener('click', function (event) {
        var trigger = event.target.closest('[data-summary-jump]');
        if (!trigger) return;
        event.preventDefault();
        scrollToMobileQuickSummarySection(trigger.getAttribute('data-summary-jump'));
      });
    }
    if (ui.el.panelViewerCloseBtn) ui.el.panelViewerCloseBtn.addEventListener('click', closePanelViewer);
    if (ui.el.linkViewerCloseBtn) ui.el.linkViewerCloseBtn.addEventListener('click', closeDesktopLinkViewer);
    if (ui.el.indicatorExplorerCloseBtn) ui.el.indicatorExplorerCloseBtn.addEventListener('click', closeIndicatorExplorerModal);
    if (ui.el.indicatorExplorerStocksTab) ui.el.indicatorExplorerStocksTab.addEventListener('click', function () { setIndicatorExplorerMode('stocks'); });
    if (ui.el.indicatorExplorerCryptoTab) ui.el.indicatorExplorerCryptoTab.addEventListener('click', function () { setIndicatorExplorerMode('crypto'); });
    if (ui.el.indicatorExplorerViewAllBtn) ui.el.indicatorExplorerViewAllBtn.addEventListener('click', function () { setIndicatorExplorerView('all'); });
    if (ui.el.indicatorExplorerViewFavoritesBtn) ui.el.indicatorExplorerViewFavoritesBtn.addEventListener('click', function () { setIndicatorExplorerView('favorites'); });
    if (ui.el.indicatorExplorerFavoriteBtn) ui.el.indicatorExplorerFavoriteBtn.addEventListener('click', toggleIndicatorExplorerFavorite);
    if (ui.el.indicatorExplorerSearchInput) {
      ui.el.indicatorExplorerSearchInput.addEventListener('input', scheduleIndicatorExplorerSearch);
      ui.el.indicatorExplorerSearchInput.addEventListener('focus', clearIndicatorExplorerSearchInput);
      ui.el.indicatorExplorerSearchInput.addEventListener('keydown', function (event) {
        if (INDICATOR_EXPLORER.view === 'favorites') return;
        if (event.key === 'Escape') {
          if (INDICATOR_EXPLORER_SEARCH_TIMER) {
            clearTimeout(INDICATOR_EXPLORER_SEARCH_TIMER);
            INDICATOR_EXPLORER_SEARCH_TIMER = null;
          }
          hideIndicatorExplorerSearchResults();
          return;
        }
        if (event.key !== 'Enter') return;
        event.preventDefault();
        var list = Array.isArray(INDICATOR_EXPLORER.results) ? INDICATOR_EXPLORER.results : [];
        if (!list.length) return;
        var inputValue = String(ui.el.indicatorExplorerSearchInput.value || '').trim().toUpperCase();
        var exact = list.find(function (item) {
          if (!item) return false;
          var symbol = String(item.symbol || item.yahooSymbol || '').trim().toUpperCase();
          return symbol === inputValue;
        });
        selectIndicatorExplorerItem(exact || list[0]);
      });
    }
    if (ui.el.indicatorExplorerNewsRefreshBtn) {
      ui.el.indicatorExplorerNewsRefreshBtn.addEventListener('click', function () {
        if (!INDICATOR_EXPLORER.selected) return;
        refreshIndicatorExplorerNews(INDICATOR_EXPLORER.selected, true, INDICATOR_EXPLORER.selectionRequestId);
      });
    }
    if (ui.el.indicatorExplorerFavoritesRefreshBtn) {
      ui.el.indicatorExplorerFavoritesRefreshBtn.addEventListener('click', function () {
        refreshIndicatorExplorerFavoritesQuotes();
      });
    }
    if (ui.el.indicatorExplorerFavoritesList) {
      ui.el.indicatorExplorerFavoritesList.addEventListener('click', function (event) {
        var switchModeBtn = event.target.closest('[data-explorer-favorites-switch-mode]');
        if (switchModeBtn) {
          var switchMode = String(switchModeBtn.getAttribute('data-explorer-favorites-switch-mode') || '').trim();
          setIndicatorExplorerMode(switchMode === 'crypto' ? 'crypto' : 'stocks');
          return;
        }
        var noteBtn = event.target.closest('[data-explorer-favorite-note]');
        if (noteBtn) {
          var noteKey = String(noteBtn.getAttribute('data-explorer-favorite-note') || '').trim();
          openIndicatorExplorerFavoriteNoteModal(INDICATOR_EXPLORER.mode, noteKey);
          return;
        }
        var noteViewBtn = event.target.closest('[data-explorer-favorite-note-view]');
        if (noteViewBtn) {
          var noteViewKey = String(noteViewBtn.getAttribute('data-explorer-favorite-note-view') || '').trim();
          openIndicatorExplorerFavoriteNoteModal(INDICATOR_EXPLORER.mode, noteViewKey, { readOnly: true });
          return;
        }
        var removeBtn = event.target.closest('[data-explorer-favorite-remove]');
        if (removeBtn) {
          var removeKey = String(removeBtn.getAttribute('data-explorer-favorite-remove') || '').trim();
          removeIndicatorExplorerFavoriteByKey(INDICATOR_EXPLORER.mode, removeKey);
          return;
        }
        var openBtn = event.target.closest('[data-explorer-favorite-open]');
        if (openBtn) {
          var openKey = String(openBtn.getAttribute('data-explorer-favorite-open') || '').trim();
          var hit = findIndicatorExplorerFavoriteByKey(INDICATOR_EXPLORER.mode, openKey);
          if (hit.entry) {
            setIndicatorExplorerView('all');
            selectIndicatorExplorerTarget(indicatorTargetFromExplorerFavorite(hit.entry, INDICATOR_EXPLORER.mode));
          }
          return;
        }
      });
    }
    if (ui.el.indicatorExplorerFavoritesPage) {
      ui.el.indicatorExplorerFavoritesPage.addEventListener('click', function (event) {
        var sortBtn = event.target.closest('[data-explorer-favorites-sort]');
        if (!sortBtn) return;
        toggleIndicatorExplorerFavoritesSort(sortBtn.getAttribute('data-explorer-favorites-sort'));
      });
    }
    if (ui.el.indicatorExplorerNoteInput) {
      ui.el.indicatorExplorerNoteInput.addEventListener('input', updateIndicatorExplorerFavoriteNoteCounter);
    }
    [ui.el.indicatorExplorerNoteModalCloseBtn, ui.el.indicatorExplorerNoteCancelBtn].forEach(function (btn) {
      if (btn) btn.addEventListener('click', closeIndicatorExplorerFavoriteNoteModal);
    });
    if (ui.el.indicatorExplorerNoteModal) {
      ui.el.indicatorExplorerNoteModal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-close-indicator-explorer-note') === '1') {
          closeIndicatorExplorerFavoriteNoteModal();
        }
      });
    }
    if (ui.el.indicatorExplorerNoteForm) {
      ui.el.indicatorExplorerNoteForm.addEventListener('submit', function (e) {
        e.preventDefault();
        submitIndicatorExplorerFavoriteNoteModal();
      });
    }
    if (ui.el.indicatorExplorerSearchList) {
      ui.el.indicatorExplorerSearchList.addEventListener('click', function (event) {
        var favoriteBtn = event.target.closest('[data-indicator-explorer-fav-idx]');
        if (favoriteBtn) {
          var favoriteIdx = Number(favoriteBtn.getAttribute('data-indicator-explorer-fav-idx'));
          if (!isFinite(favoriteIdx) || favoriteIdx < 0 || favoriteIdx >= INDICATOR_EXPLORER.results.length) return;
          toggleIndicatorExplorerFavoriteFromItem(INDICATOR_EXPLORER.results[favoriteIdx]);
          return;
        }
        var btn = event.target.closest('[data-indicator-explorer-idx]');
        if (!btn) return;
        var idx = Number(btn.getAttribute('data-indicator-explorer-idx'));
        if (!isFinite(idx) || idx < 0 || idx >= INDICATOR_EXPLORER.results.length) return;
        selectIndicatorExplorerItem(INDICATOR_EXPLORER.results[idx]);
      });
    }
    if (ui.el.apiDebugToggle) ui.el.apiDebugToggle.addEventListener('click', applyApiDebugToggle);
    if (ui.el.apiDebugPanel) {
      ui.el.apiDebugPanel.addEventListener('pointerdown', beginApiDebugPanelDrag);
    }
    if (ui.el.holdingsPrivacyToggle) ui.el.holdingsPrivacyToggle.addEventListener('click', applyHoldingsPrivacyToggle);
    if (ui.el.holdingsScrambleToggle) ui.el.holdingsScrambleToggle.addEventListener('click', applyHoldingsScrambleToggle);
    if (ui.el.cryptoParticlesToggle) ui.el.cryptoParticlesToggle.addEventListener('click', applyCryptoParticlesToggle);
    if (ui.el.uiTransparencyToggle) ui.el.uiTransparencyToggle.addEventListener('click', applyUiTransparencyToggle);
    ui.el.addAssetBtn.addEventListener('click', function () { openAddModal(null); });
    ui.el.exportBtn.addEventListener('click', function () {
      var explorerExport = buildIndicatorExplorerExportPayload();
      storage.exportPortfolioFile({
        exportedAt: new Date().toISOString(),
        portfolio: buildPortfolioPersistencePayload(),
        settings: buildSettingsPayload(),
        explorer: explorerExport,
        explorerFavorites: explorerExport.favorites,
        explorerFavoritesSort: explorerExport.favoritesSort
      });
      setStatus('Portfolio exported');
    });
    if (ui.el.exportAnalysisBtn) {
      ui.el.exportAnalysisBtn.addEventListener('click', exportAnalysisPdf);
    }
    if (ui.el.exportIndicatorsPdfBtn) {
      ui.el.exportIndicatorsPdfBtn.addEventListener('click', exportIndicatorsPanelPdf);
    }
    if (ui.el.exportFundamentalsPdfBtn) {
      ui.el.exportFundamentalsPdfBtn.addEventListener('click', exportFundamentalsPanelPdf);
    }
    if (ui.el.indicatorExplorerExportAnalysisBtn) {
      ui.el.indicatorExplorerExportAnalysisBtn.addEventListener('click', exportAnalysisPdfFromExplorer);
    }
    ui.el.importInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      storage.importPortfolioFile(file).then(function (payload) {
        var p = payload.portfolio || payload;
        if (!p || !Array.isArray(p.stocks) || !Array.isArray(p.crypto)) throw new Error('Expected {stocks, crypto}');
        applyPortfolioPayload(p);
        if (payload && payload.settings && typeof payload.settings === 'object') {
          applySavedSettings(payload.settings);
        } else {
          state.app.demoModeEnabled = false;
          state.app.selectedKey = null;
          state.app.selectedStocksKey = null;
          state.app.selectedCryptoKey = null;
          state.app.activePortfolioStocks = state.app.activePortfolioStocks || 'main';
          state.app.activePortfolioCrypto = state.app.activePortfolioCrypto || 'main';
        }
        applyImportedIndicatorExplorerPayload(payload);
        storage.clearDemoPortfolioBackup();
        state.market.stocks = {};
        state.market.crypto = {};
        state.history.stocks = {};
        state.history.crypto = {};
        state.news = {};
        state.twitter = {};
        state.events = {};
        state.fundamentals = { stocks: {}, crypto: {} };
        normalizeImportedAssets();
        hydrateCachedData();
        hydrateIndicatorsFromCache();
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
    if (ui.el.refreshBtn) ui.el.refreshBtn.addEventListener('click', runManualRefreshAction);
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
    if (ui.el.panelViewerModal) {
      ui.el.panelViewerModal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-close-panel-viewer') === '1') closePanelViewer();
      });
    }
    if (ui.el.linkViewerModal) {
      ui.el.linkViewerModal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-close-link-viewer') === '1') closeDesktopLinkViewer();
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
        var viewBtn = e.target.closest('[data-api-sources-view]');
        if (viewBtn) {
          var nextMode = String(viewBtn.getAttribute('data-api-sources-view') || '').trim().toLowerCase() === 'crypto' ? 'crypto' : 'stocks';
          openApiSourcesModal(nextMode);
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
        snapshotVisibleNewsForCurrentSource();
        var selected = String(ui.el.newsSourceSelect.value || 'auto').toLowerCase();
        var allowed = orderedNewsSourcesForMode(state.app.mode === 'crypto' ? 'crypto' : 'stocks');
        if (selected !== 'auto' && allowed.indexOf(selected) < 0) {
          selected = allowed[0] || 'auto';
        }
        if (state.app.mode === 'crypto') state.app.newsSourceCrypto = selected;
        else state.app.newsSourceStocks = selected;
        syncNewsSourceSelectForMode(state.app.mode);
        hydrateCurrentNewsScopeFromCache(1000 * 60 * 60 * 24 * 3);
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
    if (ui.el.portfolioSelect) {
      ui.el.portfolioSelect.addEventListener('change', function () {
        if (state.app.demoModeEnabled) {
          renderPortfolioSelector();
          return;
        }
        var rawValue = String(ui.el.portfolioSelect.value || '').trim();
        if (!rawValue) {
          renderPortfolioSelector();
          return;
        }
        if (rawValue === '__add_portfolio__') {
          addPortfolioForMode(state.app.mode);
          return;
        }
        switchActivePortfolio(state.app.mode, rawValue);
      });
    }
    if (ui.el.portfolioDeleteBtn) {
      ui.el.portfolioDeleteBtn.addEventListener('click', function () {
        if (state.app.demoModeEnabled) {
          renderPortfolioSelector();
          return;
        }
        deleteActivePortfolioForMode(state.app.mode);
      });
    }
    ui.el.stocksTab.addEventListener('click', function () { PT.Router.go('stocks'); });
    ui.el.cryptoTab.addEventListener('click', function () { PT.Router.go('crypto'); });
    if (ui.el.sortSelect) {
      ui.el.sortSelect.addEventListener('change', function () {
        state.app.sortBy = ui.el.sortSelect.value;
        renderAll();
      });
    }
    if (ui.el.holdingsSortSelect) {
      ui.el.holdingsSortSelect.addEventListener('change', function () {
        state.app.sortBy = ui.el.holdingsSortSelect.value;
        renderAll();
      });
    }
    if (ui.el.holdingsSortSelectMobile) {
      ui.el.holdingsSortSelectMobile.addEventListener('change', function () {
        state.app.sortBy = ui.el.holdingsSortSelectMobile.value;
        var menu = ui.el.holdingsSortSelectMobile.closest('details');
        if (menu) menu.removeAttribute('open');
        renderAll();
      });
    }
    if (ui.el.allocationLegend) {
      ui.el.allocationLegend.addEventListener('click', function (e) {
        var editBtn = e.target.closest('[data-edit-sector-symbol]');
        if (!editBtn) return;
        var symbol = String(editBtn.getAttribute('data-edit-sector-symbol') || '').trim().toUpperCase();
        if (!symbol) return;
        e.preventDefault();
        var modeItems = getModeComputedItems('stocks');
        var metaMap = cachedSectorMetadataMapForItems(modeItems);
        editStockSectorFromLegend(symbol, modeItems, metaMap);
      });
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
    var mobileStickyHost = getMobileRowStickyHost();
    if (mobileStickyHost) {
      mobileStickyHost.addEventListener('click', function (event) {
        if (!MOBILE_ROW_FOCUS.active || !isMobileHoldingsInteractionMode()) return;
        if (!event.target.closest('.asset-row__daymove')) return;
        var key = String(MOBILE_ROW_FOCUS.key || '').trim();
        if (!key) return;
        unlockMobileFocusedRow();
        scrollToHoldingsRowOnMobile(key);
        event.preventDefault();
      });
    }
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
    [ui.el.portfolioNameModalCloseBtn, ui.el.portfolioNameCancelBtn].forEach(function (btn) {
      if (btn) btn.addEventListener('click', closePortfolioNameModal);
    });
    if (ui.el.portfolioNameModal) {
      ui.el.portfolioNameModal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-close-portfolio-name-modal') === '1') closePortfolioNameModal();
      });
    }
    if (ui.el.portfolioNameForm) {
      ui.el.portfolioNameForm.addEventListener('submit', function (e) {
        e.preventDefault();
        submitPortfolioNameModal();
      });
    }
    [ui.el.portfolioDeleteModalCloseBtn, ui.el.portfolioDeleteCancelBtn].forEach(function (btn) {
      if (btn) btn.addEventListener('click', function () { closePortfolioDeleteModal(false); });
    });
    if (ui.el.portfolioDeleteConfirmBtn) {
      ui.el.portfolioDeleteConfirmBtn.addEventListener('click', function () {
        closePortfolioDeleteModal(true);
      });
    }
    if (ui.el.portfolioDeleteModal) {
      ui.el.portfolioDeleteModal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-close-portfolio-delete-modal') === '1') {
          closePortfolioDeleteModal(false);
        }
      });
    }
    [ui.el.sectorEditModalCloseBtn, ui.el.sectorEditCancelBtn].forEach(function (btn) {
      if (btn) btn.addEventListener('click', closeSectorEditModal);
    });
    if (ui.el.sectorEditModal) {
      ui.el.sectorEditModal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-close-sector-edit-modal') === '1') closeSectorEditModal();
      });
    }
    if (ui.el.sectorEditSelect) {
      ui.el.sectorEditSelect.addEventListener('change', syncSectorEditNewFieldVisibility);
    }
    if (ui.el.sectorEditForm) {
      ui.el.sectorEditForm.addEventListener('submit', function (e) {
        e.preventDefault();
        submitSectorEditModal();
      });
    }
    [ui.el.sectorResetModalCloseBtn, ui.el.sectorResetCancelBtn].forEach(function (btn) {
      if (btn) btn.addEventListener('click', function () { closeSectorResetModal(false); });
    });
    if (ui.el.sectorResetConfirmBtn) {
      ui.el.sectorResetConfirmBtn.addEventListener('click', function () {
        closeSectorResetModal(true);
      });
    }
    if (ui.el.sectorResetModal) {
      ui.el.sectorResetModal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-close-sector-reset-modal') === '1') {
          closeSectorResetModal(false);
        }
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
      if (!e.target.closest('.holdings-sort-menu-mobile')) {
        var openSortMenus = document.querySelectorAll('.holdings-sort-menu-mobile[open]');
        openSortMenus.forEach(function (menu) { menu.removeAttribute('open'); });
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
      if (ui.el.linkViewerModal && !ui.el.linkViewerModal.classList.contains('hidden')) {
        closeDesktopLinkViewer();
        return;
      }
      if (ui.el.portfolioDeleteModal && !ui.el.portfolioDeleteModal.classList.contains('hidden')) {
        closePortfolioDeleteModal(false);
        return;
      }
      if (ui.el.sectorResetModal && !ui.el.sectorResetModal.classList.contains('hidden')) {
        closeSectorResetModal(false);
        return;
      }
      if (ui.el.sectorEditModal && !ui.el.sectorEditModal.classList.contains('hidden')) {
        closeSectorEditModal();
        return;
      }
      if (ui.el.indicatorExplorerNoteModal && !ui.el.indicatorExplorerNoteModal.classList.contains('hidden')) {
        closeIndicatorExplorerFavoriteNoteModal();
        return;
      }
      if (ui.el.panelViewerModal && !ui.el.panelViewerModal.classList.contains('hidden')) {
        closePanelViewer();
        return;
      }
      if (ui.el.apiSourcesModal && !ui.el.apiSourcesModal.classList.contains('hidden')) {
        closeApiSourcesModal();
        return;
      }
      if (ui.el.positionModal && !ui.el.positionModal.classList.contains('hidden')) {
        closePositionActionModal();
        return;
      }
      if (ui.el.portfolioNameModal && !ui.el.portfolioNameModal.classList.contains('hidden')) {
        closePortfolioNameModal();
        return;
      }
      if (!ui.el.modal.classList.contains('hidden')) closeModal();
    });
    window.addEventListener('resize', function () {
      if (!apiDebugPanelSupportsDrag()) {
        stopApiDebugPanelDrag(false);
      }
      syncApiDebugPanelPosition();
      syncMobilePanelOrder();
      syncMobileFocusedRowAfterRender();
      if (!canOpenPanelViewer()) {
        if (PANEL_VIEWER.type) closePanelViewer();
        closeDesktopLinkViewer();
      }
    });
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
    loadIndicatorExplorerFavoritesFromRemote();

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
    setInterval(refreshQuoteFreshnessBadges, 1000 * 60);
    setInterval(autoRefresh60s, 1000 * 60 * 10);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
