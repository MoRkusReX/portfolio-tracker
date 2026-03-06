// Fetches cached or refreshed fundamentals snapshots via the local proxy.
(function () {
  var PT = (window.PT = window.PT || {});

  // Resolves the proxy base URL used for fundamentals requests.
  function proxyBase() {
    var cfg = window.PT_CONFIG || {};
    return String(cfg.proxyBase || (location.protocol === 'file:' ? 'http://localhost:5500' : location.origin)).replace(/\/$/, '');
  }

  // Performs a JSON request and throws on non-2xx responses.
  function fetchJson(url, debugLabel) {
    return fetch(url, { cache: 'no-store', __ptDebugLabel: debugLabel || '' }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (response.ok) return payload;
        var detail = String(payload && (payload.detail || payload.error) || ('HTTP ' + response.status)).trim();
        throw new Error(detail || ('HTTP ' + response.status));
      });
    });
  }

  // Builds a normalized fundamentals query for a stock or crypto asset.
  function queryForAsset(asset, options) {
    var opts = options || {};
    if (!asset || !asset.type) return null;
    if (asset.type === 'crypto') {
      var coinId = String(asset.coinId || asset.id || '').trim().toLowerCase();
      if (!coinId) return null;
      return {
        assetType: 'crypto',
        coinId: coinId,
        includeProtocol: opts.includeProtocol ? '1' : '0',
        force: opts.force ? '1' : '0'
      };
    }
    var symbol = String(asset.yahooSymbol || asset.symbol || '').trim().toUpperCase();
    if (!symbol) return null;
    return {
      assetType: 'stock',
      symbol: symbol,
      includeProtocol: '0',
      force: opts.force ? '1' : '0'
    };
  }

  PT.FundamentalsAPI = {
    // Fetches fundamentals for the active asset using server-side provider adapters and DB cache.
    getAssetFundamentals: function (asset, options) {
      var query = queryForAsset(asset, options);
      if (!query) return Promise.reject(new Error('Missing asset identifier for fundamentals'));
      var url = proxyBase() + '/api/fundamentals?' + new URLSearchParams(query).toString();
      return fetchJson(url, 'FundamentalsAPI.getAssetFundamentals.' + query.assetType + '.' + (query.symbol || query.coinId));
    }
  };
})();
