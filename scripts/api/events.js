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

  function fetchJson(url, debugLabel) {
    return fetch(proxifyUrl(url), { cache: 'no-store', __ptDebugLabel: debugLabel || '' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }


  function fetchYahooQuote(symbol) {
    var url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + encodeURIComponent(symbol);
    if (useLocalProxy()) {
      var direct = proxyBase() + '/api/quote?symbols=' + encodeURIComponent(symbol);
      return fetch(direct, { cache: 'no-store', __ptDebugLabel: 'EventsAPI.fetchYahooQuote' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }
    return fetchJson(url, 'EventsAPI.fetchYahooQuote');
  }
  function tsToDate(value) {
    if (value == null) return null;
    var n = Number(value);
    if (!isFinite(n)) return null;
    // Yahoo quoteSummary timestamps are seconds.
    if (n < 1e12) n = n * 1000;
    try {
      return new Date(n).toISOString().slice(0, 10);
    } catch (e) {
      return null;
    }
  }

  function pushEvent(arr, title, date, note, source) {
    if (!date) return;
    arr.push({ title: title, date: date, note: note || '', source: source || '' });
  }

  function stockEventsFromQuote(symbol) {
    return fetchYahooQuote(symbol).then(function (data) {
      var rows = data && data.quoteResponse && Array.isArray(data.quoteResponse.result) ? data.quoteResponse.result : [];
      var row = rows[0];
      if (!row) return [];

      var startRaw = row.earningsTimestampStart || row.earningsTimestamp || null;
      var endRaw = row.earningsTimestampEnd || null;
      var nextDate = tsToDate(startRaw);
      if (!nextDate) return [];

      var noteParts = ['Yahoo Finance quote'];
      if (endRaw && tsToDate(endRaw) && tsToDate(endRaw) !== nextDate) {
        noteParts.push('window ends ' + tsToDate(endRaw));
      }
      if (row.epsCurrentYear != null) {
        noteParts.push('EPS FY est: ' + row.epsCurrentYear);
      }

      return [{
        title: symbol + ' next earnings (est.)',
        date: nextDate,
        note: noteParts.join(' • '),
        source: 'Yahoo Finance',
        link: 'https://finance.yahoo.com/calendar/earnings?symbol=' + encodeURIComponent(symbol)
      }];
    }).catch(function () {
      return [];
    });
  }

  function stockEventsFromQuoteSummary(symbol) {
    var url = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/' +
      encodeURIComponent(symbol) +
      '?modules=calendarEvents';

    return fetchJson(url, 'EventsAPI.stockEventsFromQuoteSummary').then(function (data) {
      var result = data && data.quoteSummary && Array.isArray(data.quoteSummary.result) ? data.quoteSummary.result[0] : null;
      if (!result || !result.calendarEvents) return [];

      var earnings = result.calendarEvents.earnings || {};
      var dates = Array.isArray(earnings.earningsDate) ? earnings.earningsDate.slice() : [];
      if (!dates.length) return [];

      var nowSec = Math.floor(Date.now() / 1000);
      dates.sort(function (a, b) {
        return Number((a && a.raw) || 0) - Number((b && b.raw) || 0);
      });

      var next = null;
      for (var i = 0; i < dates.length; i++) {
        var raw = Number(dates[i] && dates[i].raw);
        if (isFinite(raw) && raw >= nowSec) {
          next = dates[i];
          break;
        }
      }
      if (!next) next = dates[0];

      var nextDate = (next && next.fmt) || tsToDate(next && next.raw);
      if (!nextDate) return [];

      return [{
        title: symbol + ' next earnings (est.)',
        date: nextDate,
        note: 'Yahoo Finance calendarEvents',
        source: 'Yahoo Finance',
        link: 'https://finance.yahoo.com/calendar/earnings?symbol=' + encodeURIComponent(symbol)
      }];
    }).catch(function () {
      return [];
    });
  }

  function stockEvents(asset) {
    var symbol = String(asset.symbol || '').trim().toUpperCase();
    if (!symbol) return Promise.resolve([]);
    return stockEventsFromQuoteSummary(symbol);
  }


  function cryptoEvents(asset) {
    var coinId = String(asset.coinId || '').trim();
    if (!coinId) return Promise.resolve([]);
    var url = 'https://api.coingecko.com/api/v3/coins/' + encodeURIComponent(coinId) +
      '?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false';

    return fetchJson(url, 'EventsAPI.cryptoEvents').then(function (data) {
      var events = [];
      if (!data) return [];

      pushEvent(
        events,
        (data.name || asset.name || coinId) + ' genesis date',
        data.genesis_date || null,
        'CoinGecko genesis_date',
        'CoinGecko'
      );

      if (data.market_data && data.market_data.ath_date && data.market_data.ath_date.usd) {
        pushEvent(
          events,
          (data.name || asset.name || coinId) + ' ATH date (USD)',
          String(data.market_data.ath_date.usd).slice(0, 10),
          'CoinGecko market_data.ath_date.usd',
          'CoinGecko'
        );
      }

      if (data.market_data && data.market_data.atl_date && data.market_data.atl_date.usd) {
        pushEvent(
          events,
          (data.name || asset.name || coinId) + ' ATL date (USD)',
          String(data.market_data.atl_date.usd).slice(0, 10),
          'CoinGecko market_data.atl_date.usd',
          'CoinGecko'
        );
      }

      pushEvent(
        events,
        (data.name || asset.name || coinId) + ' data last updated',
        data.last_updated ? String(data.last_updated).slice(0, 10) : null,
        'CoinGecko last_updated',
        'CoinGecko'
      );

      return events.slice(0, 6);
    }).catch(function () {
      return [];
    });
  }

  PT.EventsAPI = {
    getEvents: function (asset) {
      if (!asset) return Promise.resolve([]);
      return asset.type === 'stock' ? stockEvents(asset) : cryptoEvents(asset);
    }
  };
})();
