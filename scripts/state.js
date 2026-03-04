// Defines static catalogs, defaults, and the central in-memory application state object.
(function () {
  var PT = (window.PT = window.PT || {});

  var DEFAULT_PORTFOLIO = {
    stocks: [
      { id: 'seed-aapl', type: 'stock', symbol: 'AAPL', stooqSymbol: 'aapl.us', name: 'Apple Inc.', quantity: 8, entryPrice: 182.5 },
      { id: 'seed-msft', type: 'stock', symbol: 'MSFT', stooqSymbol: 'msft.us', name: 'Microsoft Corp.', quantity: 4, entryPrice: 378.3 }
    ],
    crypto: [
      { id: 'seed-btc', type: 'crypto', symbol: 'BTC', coinId: 'bitcoin', name: 'Bitcoin', quantity: 0.18, entryPrice: 54250 },
      { id: 'seed-eth', type: 'crypto', symbol: 'ETH', coinId: 'ethereum', name: 'Ethereum', quantity: 2.4, entryPrice: 2850 }
    ]
  };

  var STOCK_SYMBOLS = [
    { symbol: 'AAPL', name: 'Apple Inc.', stooq: 'aapl.us' },
    { symbol: 'MSFT', name: 'Microsoft Corp.', stooq: 'msft.us' },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', stooq: 'nvda.us' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', stooq: 'amzn.us' },
    { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', stooq: 'googl.us' },
    { symbol: 'META', name: 'Meta Platforms Inc.', stooq: 'meta.us' },
    { symbol: 'TSLA', name: 'Tesla Inc.', stooq: 'tsla.us' },
    { symbol: 'AMD', name: 'Advanced Micro Devices', stooq: 'amd.us' },
    { symbol: 'NFLX', name: 'Netflix Inc.', stooq: 'nflx.us' },
    { symbol: 'U', name: 'Unity Software Inc.', stooq: 'u.us' },
    { symbol: 'S', name: 'SentinelOne Inc.', stooq: 's.us' },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF', stooq: 'spy.us' },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust', stooq: 'qqq.us' },
    { symbol: 'PLTR', name: 'Palantir Technologies', stooq: 'pltr.us' },
    { symbol: 'COIN', name: 'Coinbase Global Inc.', stooq: 'coin.us' },
    { symbol: 'MSTR', name: 'MicroStrategy Inc.', stooq: 'mstr.us' },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.', stooq: 'jpm.us' }
  ];

  var CRYPTO_SYMBOLS = [
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
    { id: 'solana', symbol: 'SOL', name: 'Solana' },
    { id: 'ripple', symbol: 'XRP', name: 'XRP' },
    { id: 'binancecoin', symbol: 'BNB', name: 'BNB' },
    { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
    { id: 'cardano', symbol: 'ADA', name: 'Cardano' },
    { id: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
    { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche' },
    { id: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
    { id: 'sui', symbol: 'SUI', name: 'Sui' },
    { id: 'near', symbol: 'NEAR', name: 'NEAR Protocol' }
  ];

  var API_SOURCE_CATALOG = [
    {
      id: 'prices',
      label: 'Prices',
      note: 'Holdings list and market data prices',
      sources: [
        { id: 'stooq', label: 'Stooq', assetTypes: ['stock'], enabled: true },
        { id: 'yahoo', label: 'Yahoo', assetTypes: ['stock'], enabled: true },
        { id: 'coingecko', label: 'CoinGecko', assetTypes: ['crypto'], enabled: true },
        { id: 'twelvedata', label: 'Twelve Data', assetTypes: ['stock'], enabled: false, requiresKey: true }
      ]
    },
    {
      id: 'chart',
      label: 'Chart',
      note: 'Price history and chart panels',
      sources: [
        { id: 'stooq', label: 'Stooq', assetTypes: ['stock'], enabled: true },
        { id: 'yahoo', label: 'Yahoo', assetTypes: ['stock'], enabled: true },
        { id: 'coingecko', label: 'CoinGecko', assetTypes: ['crypto'], enabled: true }
      ]
    },
    {
      id: 'news',
      label: 'News',
      note: 'News panel feeds',
      sources: [
        { id: 'yahoo', label: 'Yahoo', assetTypes: ['stock', 'crypto'], enabled: true },
        { id: 'tickertick', label: 'TickerTick', assetTypes: ['stock', 'crypto'], enabled: true },
        { id: 'cryptopanic', label: 'CryptoPanic', assetTypes: ['crypto'], enabled: true }
      ]
    },
    {
      id: 'indicators',
      label: 'Indicators',
      note: 'TSLA and BTC/USD indicator candles and signal calculations',
      sources: [
        { id: 'twelvedata', label: 'Twelve Data', assetTypes: ['stock', 'crypto'], enabled: true, requiresKey: true }
      ]
    },
    {
      id: 'events',
      label: 'Events',
      note: 'Earnings and asset event panels',
      sources: [
        { id: 'yahoo', label: 'Yahoo', assetTypes: ['stock'], enabled: true },
        { id: 'coingecko', label: 'CoinGecko', assetTypes: ['crypto'], enabled: true }
      ]
    }
  ];

  function cloneJson(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function catalogEntryMap(categoryId) {
    var out = {};
    var category = API_SOURCE_CATALOG.find(function (item) { return item.id === categoryId; });
    var list = category && Array.isArray(category.sources) ? category.sources : [];
    list.forEach(function (item) { out[item.id] = item; });
    return out;
  }

  function createDefaultApiSourcePrefs() {
    var prefs = {};
    API_SOURCE_CATALOG.forEach(function (category) {
      prefs[category.id] = category.sources.map(function (source) {
        return {
          id: source.id,
          enabled: source.enabled !== false
        };
      });
    });
    return prefs;
  }

  function normalizeApiSourcePrefs(raw) {
    var sourcePrefs = raw && typeof raw === 'object' ? raw : {};
    var out = {};
    API_SOURCE_CATALOG.forEach(function (category) {
      var allowed = catalogEntryMap(category.id);
      var incoming = Array.isArray(sourcePrefs[category.id]) ? sourcePrefs[category.id] : [];
      var seen = {};
      out[category.id] = [];
      incoming.forEach(function (entry) {
        var id = entry && entry.id;
        if (!id || !allowed[id] || seen[id]) return;
        seen[id] = true;
        out[category.id].push({
          id: id,
          enabled: entry.enabled !== false
        });
      });
      category.sources.forEach(function (source) {
        if (seen[source.id]) return;
        out[category.id].push({
          id: source.id,
          enabled: source.enabled !== false
        });
      });
    });
    return out;
  }

  function getOrderedApiSources(categoryId, assetType, prefs) {
    var category = API_SOURCE_CATALOG.find(function (item) { return item.id === categoryId; });
    if (!category) return [];
    var normalized = normalizeApiSourcePrefs(prefs);
    var entries = normalized[categoryId] || [];
    var allowed = catalogEntryMap(categoryId);
    var list = entries.filter(function (entry) {
      var source = allowed[entry.id];
      if (!source || entry.enabled === false) return false;
      if (!assetType) return true;
      return !Array.isArray(source.assetTypes) || source.assetTypes.indexOf(assetType) >= 0;
    }).map(function (entry) {
      return entry.id;
    });
    return list;
  }

  PT.ApiSources = {
    catalog: cloneJson(API_SOURCE_CATALOG),
    createDefaultPrefs: createDefaultApiSourcePrefs,
    normalizePrefs: normalizeApiSourcePrefs,
    getOrdered: function (categoryId, assetType, prefs) {
      return getOrderedApiSources(categoryId, assetType, prefs || (PT.State && PT.State.app && PT.State.app.apiSourcePrefs));
    }
  };

  PT.State = {
    app: {
      mode: 'stocks',
      sortBy: 'az',
      theme: 'dark',
      layoutMode: 'narrow',
      hideHoldings: false,
      stocksAutoRefreshEnabled: false,
      cryptoAutoRefreshEnabled: false,
      stocksAutoRefreshIntervalSec: 600,
      cryptoAutoRefreshIntervalSec: 600,
      cryptoParticlesEnabled: true,
      demoModeEnabled: false,
      apiDebugEnabled: false,
      twelveDataEnabled: false,
      apiSourcePrefs: createDefaultApiSourcePrefs(),
      newsScopeStocks: 'general',
      newsSourceStocks: 'auto',
      newsSourceCrypto: 'auto',
      selectedKey: null,
      selectedStocksKey: null,
      selectedCryptoKey: null,
      editingAssetId: null,
      status: 'Idle'
    },
    portfolio: JSON.parse(JSON.stringify(DEFAULT_PORTFOLIO)),
    market: { stocks: {}, crypto: {} },
    history: { stocks: {}, crypto: {} },
    globals: {
      crypto: {
        btcDominanceCurrent: null,
        btcDominanceRange: 90,
        btcDominanceHistory: [],
        btcDominanceHistoryByRange: {}
      }
    },
    news: {},
    twitter: {},
    events: {},
    indicators: {
      stocks: null,
      crypto: null
    },
    caches: {},
    symbols: {
      stocks: STOCK_SYMBOLS,
      crypto: CRYPTO_SYMBOLS
    },
    getDefaultPortfolio: function () {
      return JSON.parse(JSON.stringify(DEFAULT_PORTFOLIO));
    }
  };
})();
