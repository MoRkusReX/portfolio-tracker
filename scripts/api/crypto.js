(function () {
  var PT = (window.PT = window.PT || {});

  function proxifyUrl(url) {
    var cfg = window.PT_CONFIG || {};
    if (!cfg.useLocalProxy) return url;
    var base = String(cfg.proxyBase || 'http://localhost:3000').replace(/\/$/, '');
    return base + '/api/generic?url=' + encodeURIComponent(url);
  }

  function fetchJson(url, debugLabel) {
    return fetch(proxifyUrl(url), { cache: 'no-store', __ptDebugLabel: debugLabel || '' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function normalizeSeriesPoints(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (row) {
      return Array.isArray(row) && row.length >= 2 ? [Number(row[0]), Number(row[1])] : null;
    }).filter(function (row) {
      return row && isFinite(row[0]) && isFinite(row[1]);
    });
  }

  function nearestJoinRatioSeries(btcCaps, totalCaps) {
    var out = [];
    var j = 0;
    if (!btcCaps.length || !totalCaps.length) return out;
    for (var i = 0; i < btcCaps.length; i++) {
      var bt = btcCaps[i][0];
      while (j + 1 < totalCaps.length && Math.abs(totalCaps[j + 1][0] - bt) <= Math.abs(totalCaps[j][0] - bt)) {
        j++;
      }
      var total = totalCaps[j][1];
      if (isFinite(total) && total > 0) {
        out.push({
          ts: bt,
          value: (btcCaps[i][1] / total) * 100
        });
      }
    }
    return out;
  }

  PT.CryptoAPI = {
    searchAssets: function (query) {
      var q = String(query || '').trim();
      if (!q) return Promise.resolve([]);
      var url = 'https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(q);
      return fetchJson(url, 'CryptoAPI.searchAssets').then(function (data) {
        var coins = Array.isArray(data && data.coins) ? data.coins : [];
        return coins.slice(0, 8).map(function (coin) {
          return {
            type: 'crypto',
            id: coin.id,
            symbol: String(coin.symbol || '').toUpperCase(),
            name: coin.name || coin.id
          };
        }).filter(function (coin) {
          return coin.id && coin.symbol && coin.name;
        });
      });
    },
    getQuote: function (asset) {
      var id = asset.coinId || asset.id || String(asset).toLowerCase();
      var url = 'https://api.coingecko.com/api/v3/simple/price?ids=' +
        encodeURIComponent(id) +
        '&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true';
      return fetchJson(url, 'CryptoAPI.getQuote').then(function (data) {
        var d = data[id];
        if (!d || typeof d.usd !== 'number') throw new Error('Invalid crypto quote');
        return {
          price: d.usd,
          change24h: typeof d.usd_24h_change === 'number' ? d.usd_24h_change : null,
          marketCap: typeof d.usd_market_cap === 'number' ? d.usd_market_cap : null,
          volume24h: typeof d.usd_24h_vol === 'number' ? d.usd_24h_vol : null,
          source: url
        };
      });
    },
    getQuotes: function (ids) {
      var arr = Array.isArray(ids) ? ids : [];
      var unique = Array.from(new Set(arr.map(function (x) { return String(x || '').trim().toLowerCase(); }).filter(Boolean)));
      if (!unique.length) return Promise.resolve({});
      var url = 'https://api.coingecko.com/api/v3/simple/price?ids=' +
        encodeURIComponent(unique.join(',')) +
        '&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true';
      return fetchJson(url, 'CryptoAPI.getQuotes').then(function (data) {
        var out = {};
        unique.forEach(function (id) {
          var d = data && data[id];
          if (!d || typeof d.usd !== 'number') return;
          out[id] = {
            price: d.usd,
            change24h: typeof d.usd_24h_change === 'number' ? d.usd_24h_change : null,
            marketCap: typeof d.usd_market_cap === 'number' ? d.usd_market_cap : null,
            volume24h: typeof d.usd_24h_vol === 'number' ? d.usd_24h_vol : null,
            source: url
          };
        });
        return out;
      });
    },
    getOHLC: function (asset, days) {
      var id = asset.coinId || asset.id || String(asset).toLowerCase();
      var safeDays = days || 180;
      var url = 'https://api.coingecko.com/api/v3/coins/' + encodeURIComponent(id) + '/ohlc?vs_currency=usd&days=' + encodeURIComponent(safeDays);
      return fetchJson(url, 'CryptoAPI.getOHLC').then(function (arr) {
        if (!Array.isArray(arr) || !arr.length) throw new Error('No OHLC data');
        return arr.map(function (row) {
          return {
            t: new Date(row[0]).toISOString().slice(0, 10),
            o: row[1],
            h: row[2],
            l: row[3],
            c: row[4]
          };
        });
      });
    },
    getGlobalMetrics: function () {
      var url = 'https://api.coingecko.com/api/v3/global';
      return fetchJson(url, 'CryptoAPI.getGlobalMetrics').then(function (data) {
        var d = data && data.data ? data.data : {};
        var pct = d.market_cap_percentage || {};
        return {
          btcDominance: typeof pct.btc === 'number' ? pct.btc : null,
          ethDominance: typeof pct.eth === 'number' ? pct.eth : null,
          updatedAt: new Date().toISOString()
        };
      });
    },
    getBtcDominanceHistory: function (days) {
      var safeDays = days || 90;
      var btcUrl = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=' + encodeURIComponent(safeDays);
      var totalUrl = 'https://api.coingecko.com/api/v3/global/market_cap_chart?vs_currency=usd&days=' + encodeURIComponent(safeDays);

      return Promise.all([
        fetchJson(btcUrl, 'CryptoAPI.getBtcDominanceHistory.bitcoin'),
        fetchJson(totalUrl, 'CryptoAPI.getBtcDominanceHistory.global')
      ]).then(function (arr) {
        var btcData = arr[0] || {};
        var totalData = arr[1] || {};
        var btcCaps = normalizeSeriesPoints(btcData.market_caps);
        var totalCaps = normalizeSeriesPoints(
          totalData.market_cap_chart ||
          totalData.total_market_cap ||
          (totalData.data && totalData.data.total_market_cap) ||
          totalData.market_caps ||
          []
        );
        var merged = nearestJoinRatioSeries(btcCaps, totalCaps);
        if (!merged.length) throw new Error('No BTC dominance history points');
        return merged.map(function (p) {
          return {
            ts: p.ts,
            t: new Date(p.ts).toISOString().slice(0, 10),
            v: Number(p.value.toFixed(2))
          };
        });
      });
    }
  };
})();
