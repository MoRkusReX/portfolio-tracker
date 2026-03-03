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
  var AUTO_COLORS = ['#2cb6ff', '#14f1b2', '#f59e0b', '#fb7185', '#8b5cf6', '#22c55e', '#f97316', '#38bdf8', '#eab308', '#a78bfa'];
  var DEMO_STOCKS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'AVGO', 'TSLA'];
  var DEMO_CRYPTO_IDS = ['bitcoin', 'ethereum', 'tether', 'ripple', 'binancecoin', 'solana', 'usd-coin', 'dogecoin', 'cardano', 'tron'];

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

  function loadInitialState() {
    var savedPortfolio = storage.loadPortfolio();
    var savedSettings = storage.loadSettings();
    var savedCache = storage.loadCache();

    if (savedPortfolio && savedPortfolio.stocks && savedPortfolio.crypto) {
      state.portfolio = savedPortfolio;
    }

    applySavedSettings(savedSettings);

    state.caches = savedCache || {};
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

  function getStockPrevCloseHint(asset) {
    if (!asset || asset.type !== 'stock') return null;
    var quote = state.market.stocks[asset.id] || getCachedAny(stockQuoteCacheKey(asset));
    var prev = quote && isFinite(Number(quote.regularMarketPreviousClose)) ? Number(quote.regularMarketPreviousClose)
      : (quote && isFinite(Number(quote.previous_close)) ? Number(quote.previous_close) : null);
    if (prev && prev > 0) return prev;

    var hist = state.history.stocks[asset.id] || getCachedAny('hist:stock:' + (asset.stooqSymbol || asset.symbol));
    if (!Array.isArray(hist) || hist.length < 2) return null;
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
    if (rows.length < 2) return null;
    return Number(rows[rows.length - 2].c);
  }

  function normalizeCachedStockQuote(asset, quote, hist) {
    if (!asset || asset.type !== 'stock' || !quote || typeof quote !== 'object') return quote;
    var out = Object.assign({}, quote);
    var price = isFinite(Number(out.regularMarketPrice)) ? Number(out.regularMarketPrice)
      : (isFinite(Number(out.price)) ? Number(out.price) : null);
    var prevClose = isFinite(Number(out.regularMarketPreviousClose)) ? Number(out.regularMarketPreviousClose)
      : (isFinite(Number(out.previous_close)) ? Number(out.previous_close) : null);

    if (!(prevClose > 0) && Array.isArray(hist) && hist.length >= 2) {
      var rows = hist
        .map(function (row) {
          return {
            t: String(row && row.t || ''),
            c: isFinite(Number(row && row.c)) ? Number(row.c) : null
          };
        })
        .filter(function (row) {
          return row.t && row.c !== null;
        })
        .sort(function (a, b) {
          return a.t.localeCompare(b.t);
        });
      if (rows.length >= 2) {
        prevClose = Number(rows[rows.length - 2].c);
      }
    }

    if (!(prevClose > 0) || !(price !== null)) return out;

    var changed = false;
    if (!isFinite(Number(out.previous_close))) {
      out.previous_close = prevClose;
      changed = true;
    }
    if (!isFinite(Number(out.regularMarketPreviousClose))) {
      out.regularMarketPreviousClose = prevClose;
      changed = true;
    }

    var dayChange = isFinite(Number(out.change)) ? Number(out.change) : null;
    if (dayChange === null) {
      dayChange = price - prevClose;
      out.change = dayChange;
      changed = true;
    }

    var dayPct = isFinite(Number(out.changePercent)) ? Number(out.changePercent)
      : (isFinite(Number(out.percent_change)) ? Number(out.percent_change) : null);
    if (dayPct === null && prevClose !== 0) {
      dayPct = (dayChange / prevClose) * 100;
      out.changePercent = dayPct;
      out.percent_change = dayPct;
      changed = true;
    } else {
      if (!isFinite(Number(out.changePercent)) && dayPct !== null) {
        out.changePercent = dayPct;
        changed = true;
      }
      if (!isFinite(Number(out.percent_change)) && dayPct !== null) {
        out.percent_change = dayPct;
        changed = true;
      }
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

      var news = getCachedAny(newsKey);
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
      mode: state.app.mode,
      selectedKey: state.app.selectedKey,
      selectedStocksKey: state.app.selectedStocksKey || null,
      selectedCryptoKey: state.app.selectedCryptoKey || null
    };
  }

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
    renderBtcDominancePanel();
    syncCryptoParticles();
    persist();
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
    chartMgr.renderAssetLine(
      ui.el.assetChart,
      ui.el.lineFallback,
      history.map(function (p) { return p.t; }),
      history.map(function (p) { return p.c; }),
      asset.symbol + ' price'
    );
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
    var active = state.app.mode === 'crypto' && !!state.app.cryptoParticlesEnabled;
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
        var proxyBase = String(cfg.proxyBase || 'http://localhost:3000').replace(/\/$/, '');
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

  function refreshAssetNews(asset, options) {
    options = options || {};
    var source = asset.type === 'crypto' ? (state.app.newsSourceCrypto || 'auto') : (state.app.newsSourceStocks || 'auto');
    var key = newsCacheKeyForAsset(asset);
    var fetcher = function () {
      return PT.NewsAPI.getNews(asset, { source: source });
    };
    var load = options.force
      ? fetcher().then(function (items) {
        storage.setCached(state.caches, key, items);
        storage.saveCache(state.caches);
        return items;
      })
      : cacheWrap(key, 1000 * 60 * 60 * 2, fetcher);
    return load.then(function (items) {
      state.news[assetKey(asset)] = items;
      renderDetails();
    }).catch(function () {
      var cached = storage.getCached(state.caches, key, 1000 * 60 * 60 * 24 * 3);
      state.news[assetKey(asset)] = cached || [];
      renderDetails();
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
    var load = options.force
      ? fetcher().then(function (items) {
        storage.setCached(state.caches, key, items);
        storage.saveCache(state.caches);
        return items;
      })
      : cacheWrap(key, 1000 * 60 * 60 * 2, fetcher);
    return load.then(function (items) {
      state.news['stocks:general'] = items || [];
      renderDetails();
      return items;
    }).catch(function () {
      var cached = storage.getCached(state.caches, key, 1000 * 60 * 60 * 24 * 3);
      state.news['stocks:general'] = cached || [];
      renderDetails();
      return state.news['stocks:general'];
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
    })).then(function (results) {
      var updated = 0;
      var cachedOnly = 0;

      results.forEach(function (res, idx) {
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
      if (updated <= 0 && cachedOnly > 0) {
        setStatus('Stocks quotes unavailable, using cached values • ' + nowText);
      } else if (updated <= 0) {
        setStatus('Stocks quote refresh failed • ' + nowText);
      } else if (failed > 0) {
        setStatus('Stocks quotes partial refresh • ' + nowText);
      } else {
        setStatus('Stocks quotes refreshed • ' + nowText);
      }
      return { updated: updated, meta: { failed: failed, staleUsed: cachedOnly } };
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
        refreshCryptoGlobalMetrics().then(function () { return { ok: true }; }).catch(function () { return { ok: false }; })
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
        var detail = selectedCrypto && results[2] && results[2].status === 'fulfilled' ? results[2].value : null;
        renderAll();
        var nowText = new Date().toLocaleTimeString();
        var detailFailed = detail ? (!detail.historyOk || !detail.newsOk || !detail.eventsOk) : false;
        if (quoteMeta.updated <= 0 && quoteMeta.staleUsed > 0) {
          setStatus('Crypto quotes unavailable, using cached values • ' + nowText);
        } else if (quoteMeta.updated <= 0) {
          setStatus('Crypto refresh failed (quotes not updated) • ' + nowText);
        } else if (quoteMeta.failed > 0 || !globalOk || detailFailed) {
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
    if (!row) return;
    var key = row.dataset.key;
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
    refreshAssetData(asset, includeNewsOnSelect, { onSelect: true });
  }

  function bindEvents() {
    ui.el.themeToggle.addEventListener('click', applyThemeToggle);
    if (ui.el.layoutToggle) ui.el.layoutToggle.addEventListener('click', applyLayoutToggle);
    if (ui.el.demoModeToggle) ui.el.demoModeToggle.addEventListener('click', applyDemoModeToggle);
    if (ui.el.apiSourcesBtn) ui.el.apiSourcesBtn.addEventListener('click', openApiSourcesModal);
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
    bindEvents();

    if (!location.hash) {
      location.hash = state.app.mode === 'crypto' ? '#crypto' : '#stocks';
    }

    PT.Router.init(function (mode) {
      setRouteMode(mode);
    });

    renderAll();
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
