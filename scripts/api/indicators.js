(function () {
  var PT = (window.PT = window.PT || {});

  function proxyBase() {
    var cfg = window.PT_CONFIG || {};
    return String(cfg.proxyBase || 'http://localhost:3000').replace(/\/$/, '');
  }

  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function normalizeRows(values) {
    if (!Array.isArray(values)) return [];
    return values.map(function (row) {
      var time = String(row && (row.datetime || row.date || row.time) || '').trim();
      var open = num(row && row.open);
      var high = num(row && row.high);
      var low = num(row && row.low);
      var close = num(row && row.close);
      var volume = num(row && row.volume);
      if (!time || open == null || high == null || low == null || close == null) return null;
      return {
        t: time,
        o: open,
        h: high,
        l: low,
        c: close,
        v: volume
      };
    }).filter(Boolean).sort(function (a, b) {
      return String(a.t).localeCompare(String(b.t));
    });
  }

  function fetchJson(url, debugLabel) {
    return fetch(url, { cache: 'no-store', __ptDebugLabel: debugLabel || '' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });
  }

  PT.IndicatorAPI = {
    getTimeSeries: function (symbol, interval, outputsize) {
      var safeSymbol = String(symbol || '').trim();
      var safeInterval = String(interval || '').trim();
      var safeOutputsize = Math.max(1, Number(outputsize || 1) || 1);
      if (!safeSymbol || !safeInterval) {
        return Promise.reject(new Error('Missing indicator symbol or interval'));
      }
      var url = proxyBase() + '/api/twelvedata/time-series?' + new URLSearchParams({
        symbol: safeSymbol,
        interval: safeInterval,
        outputsize: String(safeOutputsize)
      }).toString();
      return fetchJson(url, 'IndicatorAPI.getTimeSeries.' + safeSymbol + '.' + safeInterval).then(function (payload) {
        var values = normalizeRows(payload && payload.values);
        if (!values.length) throw new Error('No indicator candles returned');
        return {
          source: 'twelvedata',
          symbol: safeSymbol,
          interval: safeInterval,
          meta: payload && payload.meta ? payload.meta : {},
          values: values,
          fetchedAt: payload && payload.fetchedAt ? payload.fetchedAt : Date.now()
        };
      });
    }
  };
})();
