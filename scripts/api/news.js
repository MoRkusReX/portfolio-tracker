(function () {
  var PT = (window.PT = window.PT || {});

  function proxifyUrl(url) {
    var cfg = window.PT_CONFIG || {};
    if (!cfg.useLocalProxy) return url;
    var base = String(cfg.proxyBase || 'http://localhost:3000').replace(/\/$/, '');
    return base + '/api/generic?url=' + encodeURIComponent(url);
  }

  function fetchText(url, debugLabel) {
    return fetch(proxifyUrl(url), { cache: 'no-store', __ptDebugLabel: debugLabel || '' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  function fetchJson(url, debugLabel) {
    return fetch(proxifyUrl(url), { cache: 'no-store', __ptDebugLabel: debugLabel || '' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function normalizePublished(value) {
    if (value == null) return '';
    var raw = String(value).trim();
    if (!raw) return '';

    var n = Number(raw);
    if (isFinite(n) && raw.length >= 10) {
      var ms = n < 1e12 ? n * 1000 : n;
      var fromNum = new Date(ms);
      if (!isNaN(fromNum.getTime())) return fromNum.toLocaleString();
    }

    var fromStr = new Date(raw);
    if (!isNaN(fromStr.getTime())) return fromStr.toLocaleString();

    return raw;
  }

  function parsePublishedMs(value) {
    if (value == null) return 0;
    var raw = String(value).trim();
    if (!raw) return 0;

    var n = Number(raw);
    if (isFinite(n) && raw.length >= 10) {
      var ms = n < 1e12 ? n * 1000 : n;
      return isFinite(ms) ? ms : 0;
    }

    var parsed = new Date(raw).getTime();
    return isFinite(parsed) ? parsed : 0;
  }

  function parseRss(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    var items = Array.prototype.slice.call(doc.querySelectorAll('item'));
    return items.map(function (item) {
      var title = (item.querySelector('title') || {}).textContent || 'Untitled';
      var link = (item.querySelector('link') || {}).textContent || '#';
      var pubDate = (item.querySelector('pubDate') || {}).textContent || '';
      var sourceEl = item.querySelector('source');
      return {
        title: title.trim(),
        link: link.trim(),
        published: normalizePublished(pubDate),
        publishedMs: parsePublishedMs(pubDate),
        source: sourceEl ? sourceEl.textContent.trim() : 'Yahoo Finance RSS'
      };
    }).sort(function (a, b) {
      return (Number(b.publishedMs) || 0) - (Number(a.publishedMs) || 0);
    }).slice(0, 8).map(function (item) {
      delete item.publishedMs;
      return item;
    });
  }

  function yahooRssNews(symbol) {
    var rssUrl = 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=' + encodeURIComponent(symbol) + '&region=US&lang=en-US';
    return fetchText(rssUrl, 'NewsAPI.yahooRssNews').then(function (xml) {
      var items = parseRss(xml);
      if (!items.length) throw new Error('No Yahoo RSS items');
      return items;
    });
  }

  function yahooGeneralStocksNews() {
    // Prefer broad Yahoo finance/business feeds for "General" scope.
    var feeds = [
      'https://news.yahoo.com/rss/business',
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US',
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY&region=US&lang=en-US',
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=QQQ&region=US&lang=en-US'
    ];
    var idx = 0;
    function next() {
      if (idx >= feeds.length) return Promise.reject(new Error('No Yahoo general stock news'));
      var url = feeds[idx++];
      return fetchText(url, 'NewsAPI.yahooGeneralStocksNews').then(function (xml) {
        var items = parseRss(xml);
        if (!items.length) throw new Error('Empty Yahoo feed');
        return items;
      }).catch(function () {
        return next();
      });
    }
    return next();
  }

  function pickArray(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    if (data && Array.isArray(data.feed)) return data.feed;
    if (data && Array.isArray(data.results)) return data.results;
    if (data && Array.isArray(data.items)) return data.items;
    if (data && Array.isArray(data.stories)) return data.stories;
    return [];
  }

  function tickertickNews(asset) {
    var symbol = String(asset.symbol || '').toUpperCase();
    var q = 'z:' + symbol;
    var url = 'https://api.tickertick.com/feed?q=' + encodeURIComponent(q) + '&n=50';
    return fetchJson(url, 'NewsAPI.tickertickNews').then(function (data) {
      var rows = pickArray(data);
      var items = rows.map(function (row) {
        var title = row && (row.title || row.headline || row.text || row.body || row.message || row.summary);
        var link = row && (row.url || row.link || row.href);
        var published = row && (row.time || row.date || row.datetime || row.published || row.published_at || row.created_at);
        var source = row && (row.source || row.site || row.domain || row.publisher || 'TickerTick');
        if (!title) return null;
        return {
          title: String(title),
          link: link ? String(link) : '#',
          published: normalizePublished(published),
          source: String(source || 'TickerTick')
        };
      }).filter(Boolean).slice(0, 8);
      if (!items.length) throw new Error('No TickerTick items');
      return items;
    });
  }

  function isRelevantStockHeadline(item, asset) {
    var symbol = String(asset && asset.symbol || '').toUpperCase();
    var name = String(asset && asset.name || '').toUpperCase();
    var title = String(item && item.title || '').toUpperCase();
    var src = String(item && item.source || '').toUpperCase();
    if (!symbol || !title) return false;
    if (title.indexOf(symbol) >= 0) return true;
    if (name && name.length >= 4 && title.indexOf(name) >= 0) return true;
    // ETF names are often shortened in headlines; allow source mention for strict ticker feeds.
    if (src.indexOf('YAHOO') >= 0 && title.indexOf('ETF') >= 0 && title.indexOf(symbol.slice(0, 3)) >= 0) return true;
    return false;
  }

  function filterSelectedStockNews(items, asset) {
    var arr = Array.isArray(items) ? items : [];
    var filtered = arr.filter(function (it) { return isRelevantStockHeadline(it, asset); });
    return filtered.slice(0, 8);
  }

  function cryptoPanicNews() {
    var cryptoUrl = 'https://cryptopanic.com/api/v1/posts/?filter=important';
    return fetchJson(cryptoUrl, 'NewsAPI.cryptoPanicNews').then(function (data) {
      var rows = Array.isArray(data && data.results) ? data.results : [];
      if (!rows.length) throw new Error('No crypto news rows');
      return rows.slice(0, 8).map(function (row) {
        return {
          title: row.title || 'Untitled',
          link: row.url || (row.domain ? 'https://' + row.domain : '#'),
          published: normalizePublished(row.published_at),
          source: row.domain || 'CryptoPanic'
        };
      });
    });
  }

  PT.NewsAPI = {
    getGeneralStocksNews: function (options) {
      var sourcePref = String(options && options.source || 'auto').toLowerCase();
      if (sourcePref === 'tickertick') {
        return tickertickNews({ symbol: 'SPY', type: 'stock' })
          .catch(function () { return tickertickNews({ symbol: 'QQQ', type: 'stock' }); });
      }
      return yahooGeneralStocksNews();
    },
    getNews: function (asset, options) {
      var sourcePref = String(options && options.source || 'auto').toLowerCase();
      if (asset.type === 'crypto') {
        var yahooCryptoSymbol = String(asset.symbol || '').toUpperCase() + '-USD';
        if (sourcePref === 'yahoo') return yahooRssNews(yahooCryptoSymbol);
        if (sourcePref === 'tickertick') return tickertickNews(asset);
        return cryptoPanicNews().catch(function () {
          return yahooRssNews(yahooCryptoSymbol);
        });
      }
      if (sourcePref === 'tickertick') {
        return tickertickNews(asset).then(function (items) {
          var filtered = filterSelectedStockNews(items, asset);
          if (!filtered.length) throw new Error('No relevant selected-stock news');
          return filtered;
        });
      }
      return yahooRssNews(String(asset.symbol || '').toUpperCase()).then(function (items) {
        var filtered = filterSelectedStockNews(items, asset);
        if (!filtered.length) throw new Error('No relevant selected-stock news');
        return filtered;
      });
    }
  };
})();
