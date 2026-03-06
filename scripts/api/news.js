// Fetches stock and crypto news feeds with proxy-aware fallbacks.
(function () {
  var PT = (window.PT = window.PT || {});

  function proxifyUrl(url) {
    var cfg = window.PT_CONFIG || {};
    if (!cfg.useLocalProxy) return url;
    var base = String(cfg.proxyBase || (location.protocol === 'file:' ? 'http://localhost:5500' : location.origin)).replace(/\/$/, '');
    return base + '/api/generic?url=' + encodeURIComponent(url);
  }

  function apiBase() {
    var cfg = window.PT_CONFIG || {};
    if (Object.prototype.hasOwnProperty.call(cfg, 'proxyBase')) {
      return String(cfg.proxyBase || '').replace(/\/$/, '');
    }
    if (location.protocol === 'file:') return 'http://localhost:5500';
    return String(location.origin || '').replace(/\/$/, '');
  }

  function proxyUrl(url) {
    var base = apiBase();
    if (!base) return url;
    return base + '/api/generic?url=' + encodeURIComponent(url);
  }

  function isAbsoluteUrl(url) {
    return /^https?:\/\//i.test(String(url || '').trim());
  }

  function shouldRetryViaProxy(url) {
    if (!isAbsoluteUrl(url)) return false;
    var cfg = window.PT_CONFIG || {};
    if (cfg.useLocalProxy) return false;
    return !!apiBase();
  }

  function doFetchText(url, debugLabel) {
    return fetch(url, { cache: 'no-store', __ptDebugLabel: debugLabel || '' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  function fetchText(url, debugLabel) {
    var target = proxifyUrl(url);
    return doFetchText(target, debugLabel).catch(function (err) {
      if (!shouldRetryViaProxy(url) || target !== url) throw err;
      return doFetchText(proxyUrl(url), String(debugLabel || '') + '.proxyFallback');
    });
  }

  function doFetchJson(url, debugLabel) {
    return fetch(url, { cache: 'no-store', __ptDebugLabel: debugLabel || '' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function fetchJson(url, debugLabel) {
    var target = proxifyUrl(url);
    return doFetchJson(target, debugLabel).catch(function (err) {
      if (!shouldRetryViaProxy(url) || target !== url) throw err;
      return doFetchJson(proxyUrl(url), String(debugLabel || '') + '.proxyFallback');
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
    }).catch(function () {
      return yahooSearchNews(symbol);
    });
  }

  function yahooSearchNews(query) {
    var q = String(query || '').trim();
    if (!q) return Promise.reject(new Error('Missing Yahoo query'));
    var url = 'https://query2.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(q) + '&quotesCount=0&newsCount=20&enableFuzzyQuery=false&region=US&lang=en-US';
    return fetchJson(url, 'NewsAPI.yahooSearchNews').then(function (data) {
      var rows = Array.isArray(data && data.news) ? data.news : [];
      var items = rows.map(function (row) {
        var title = row && (row.title || row.shortname || row.summary);
        var link = row && (row.link || row.clickThroughUrl && row.clickThroughUrl.url || row.canonicalUrl && row.canonicalUrl.url);
        var published = row && (row.providerPublishTime != null ? row.providerPublishTime : (row.pubDate || row.published));
        var relatedTickers = Array.isArray(row && row.relatedTickers)
          ? row.relatedTickers.map(function (t) { return String(t || '').trim().toUpperCase(); }).filter(Boolean)
          : [];
        if (!title) return null;
        return {
          title: String(title).trim(),
          link: link ? String(link).trim() : '#',
          published: normalizePublished(published),
          publishedMs: parsePublishedMs(published),
          source: String((row && (row.publisher || row.provider || row.source)) || 'Yahoo Finance').trim(),
          relatedTickers: relatedTickers
        };
      }).filter(Boolean).sort(function (a, b) {
        return (Number(b.publishedMs) || 0) - (Number(a.publishedMs) || 0);
      }).slice(0, 8).map(function (item) {
        delete item.publishedMs;
        return item;
      });
      if (!items.length) throw new Error('No Yahoo search news items');
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
    return next().catch(function () {
      return yahooSearchNews('stock market');
    });
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
    var relatedTickers = Array.isArray(item && item.relatedTickers)
      ? item.relatedTickers.map(function (t) { return String(t || '').toUpperCase(); })
      : [];
    if (!symbol || !title) return false;
    if (relatedTickers.indexOf(symbol) >= 0) return true;
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
    getCachedSnapshot: function (key) {
      var safeKey = String(key || '').trim();
      if (!safeKey) return Promise.resolve(null);
      return fetch(apiBase() + '/api/news-cache?key=' + encodeURIComponent(safeKey), {
        cache: 'no-store',
        __ptDebugLabel: 'NewsAPI.getCachedSnapshot'
      }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).then(function (payload) {
        if (!payload || !Array.isArray(payload.items) || !payload.items.length) return null;
        return {
          items: payload.items,
          updatedAt: Math.max(0, Number(payload.updatedAt || 0) || 0),
          fetchedAt: Math.max(0, Number(payload.fetchedAt || 0) || 0),
          source: payload.source || null
        };
      }).catch(function () {
        return null;
      });
    },
    saveCachedSnapshot: function (key, items, meta) {
      var safeKey = String(key || '').trim();
      var safeItems = Array.isArray(items) ? items : null;
      if (!safeKey || !safeItems) return Promise.resolve(null);
      var body = {
        key: safeKey,
        items: safeItems,
        fetchedAt: Math.max(0, Number(meta && meta.fetchedAt || 0) || Date.now()),
        source: meta && meta.source ? String(meta.source) : null
      };
      return fetch(apiBase() + '/api/news-cache', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        __ptDebugLabel: 'NewsAPI.saveCachedSnapshot'
      }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).catch(function () {
        return null;
      });
    },
    getGeneralStocksNews: function (options) {
      var sourcePref = String(options && options.source || 'auto').toLowerCase();
      var enabledOrdered = (PT.ApiSources && typeof PT.ApiSources.getOrdered === 'function')
        ? PT.ApiSources.getOrdered('news', 'stock')
        : ['yahoo', 'tickertick'];
      var ordered = sourcePref !== 'auto'
        ? (enabledOrdered.indexOf(sourcePref) >= 0 ? [sourcePref] : enabledOrdered.slice())
        : enabledOrdered.slice();

      function run(idx) {
        if (idx >= ordered.length) return Promise.reject(new Error('No enabled news source'));
        var sourceId = ordered[idx];
        var task = sourceId === 'tickertick'
          ? tickertickNews({ symbol: 'SPY', type: 'stock' }).catch(function () { return tickertickNews({ symbol: 'QQQ', type: 'stock' }); })
          : yahooGeneralStocksNews();
        return task.catch(function () { return run(idx + 1); });
      }

      return run(0);
    },
    getNews: function (asset, options) {
      var sourcePref = String(options && options.source || 'auto').toLowerCase();
      var enabledOrdered = (PT.ApiSources && typeof PT.ApiSources.getOrdered === 'function')
        ? PT.ApiSources.getOrdered('news', asset.type === 'crypto' ? 'crypto' : 'stock')
        : ['yahoo', 'tickertick'];
      var ordered = sourcePref !== 'auto'
        ? (enabledOrdered.indexOf(sourcePref) >= 0 ? [sourcePref] : enabledOrdered.slice())
        : enabledOrdered.slice();

      function run(idx) {
        if (idx >= ordered.length) return Promise.reject(new Error('No enabled news source'));
        var sourceId = ordered[idx];
        var task;
        if (asset.type === 'crypto') {
          var yahooCryptoSymbol = String(asset.symbol || '').toUpperCase() + '-USD';
          if (sourceId === 'tickertick') task = tickertickNews(asset);
          else if (sourceId === 'cryptopanic') task = cryptoPanicNews();
          else task = yahooRssNews(yahooCryptoSymbol);
        } else if (sourceId === 'tickertick') {
          task = tickertickNews(asset).then(function (items) {
            var filtered = filterSelectedStockNews(items, asset);
            if (!filtered.length) throw new Error('No relevant selected-stock news');
            return filtered;
          });
        } else {
          task = yahooRssNews(String(asset.symbol || '').toUpperCase()).then(function (items) {
            var filtered = filterSelectedStockNews(items, asset);
            if (!filtered.length) throw new Error('No relevant selected-stock news');
            return filtered;
          });
        }
        return task.catch(function () { return run(idx + 1); });
      }

      return run(0);
    }
  };
})();
