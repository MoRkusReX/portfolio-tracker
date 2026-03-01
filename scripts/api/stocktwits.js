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

  function proxyStocktwitsUrl(symbol) {
    return proxyBase() + '/api/stocktwits/' + encodeURIComponent(symbol);
  }

  function stocktwitsSymbol(asset) {
    if (asset.type === 'crypto') return String(asset.symbol || '').toUpperCase() + '.X';
    return String(asset.symbol || '').toUpperCase();
  }

  function stocktwitsLink(asset) {
    return 'https://stocktwits.com/symbol/' + encodeURIComponent(stocktwitsSymbol(asset));
  }

  function nitterLink(asset) {
    var q = asset.type === 'stock'
      ? ('$' + String(asset.symbol || '').toUpperCase())
      : (String(asset.name || asset.symbol || '') + ' OR $' + String(asset.symbol || '').toUpperCase());
    return 'https://nitter.net/search?f=tweets&q=' + encodeURIComponent(q);
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function cleanText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  PT.TwitterAPI = {
    getPlaceholder: function (asset) {
      return {
        status: 'placeholder',
        searchUrl: stocktwitsLink(asset),
        linkLabel: 'Open Stocktwits',
        links: [
          { label: 'Open Stocktwits', href: stocktwitsLink(asset) },
          { label: 'Open Nitter', href: nitterLink(asset) }
        ],
        message: ''
      };
    },
    tryProxyFetch: function (asset) {
      var sym = stocktwitsSymbol(asset);
      var apiUrl = 'https://api.stocktwits.com/api/2/streams/symbol/' + encodeURIComponent(sym) + '.json';
      var fetchUrl = useLocalProxy() ? proxyStocktwitsUrl(sym) : apiUrl;

      return fetchJson(fetchUrl).then(function (data) {
        var rows = Array.isArray(data) ? data : (Array.isArray(data && data.messages) ? data.messages : []);
        var items = rows.slice(0, 6).map(function (m) {
          // Supports new backend shape [{id,text,user,...}] and legacy StockTwits payload shape.
          var user = m && m.user
            ? (typeof m.user === 'string' ? '@' + m.user : (m.user.username ? '@' + m.user.username : ''))
            : '';
          var body = cleanText(m && (m.text || m.body));
          return cleanText((user ? user + ': ' : '') + body);
        }).filter(Boolean);

        return {
          status: 'proxy',
          searchUrl: stocktwitsLink(asset),
          linkLabel: 'Open Stocktwits',
          links: [
            { label: 'Open Stocktwits', href: stocktwitsLink(asset) },
            { label: 'Open Nitter', href: nitterLink(asset) }
          ],
          items: items,
          message: items.length
            ? (useLocalProxy() ? 'Loaded via Local Proxy (Stocktwits).' : 'Loaded directly from Stocktwits.')
            : 'Stocktwits returned no messages for this symbol right now.'
        };
      });
    }
  };
})();
