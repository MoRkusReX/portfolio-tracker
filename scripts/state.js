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

  PT.State = {
    app: {
      mode: 'stocks',
      sortBy: 'az',
      theme: 'dark',
      layoutMode: 'narrow',
      hideHoldings: false,
      stocksAutoRefreshEnabled: false,
      cryptoAutoRefreshEnabled: false,
      cryptoParticlesEnabled: true,
      demoModeEnabled: false,
      apiDebugEnabled: false,
      twelveDataEnabled: false,
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
