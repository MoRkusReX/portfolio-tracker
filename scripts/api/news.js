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
    var alphaTs = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
    if (alphaTs) {
      var isoAlpha = alphaTs[1] + '-' + alphaTs[2] + '-' + alphaTs[3] + 'T' + alphaTs[4] + ':' + alphaTs[5] + ':' + alphaTs[6] + 'Z';
      var fromAlpha = new Date(isoAlpha);
      if (!isNaN(fromAlpha.getTime())) return fromAlpha.toLocaleString();
    }

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
    var alphaTs = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
    if (alphaTs) {
      var isoAlpha = alphaTs[1] + '-' + alphaTs[2] + '-' + alphaTs[3] + 'T' + alphaTs[4] + ':' + alphaTs[5] + ':' + alphaTs[6] + 'Z';
      var parsedAlpha = new Date(isoAlpha).getTime();
      if (isFinite(parsedAlpha)) return parsedAlpha;
    }

    var n = Number(raw);
    if (isFinite(n) && raw.length >= 10) {
      var ms = n < 1e12 ? n * 1000 : n;
      return isFinite(ms) ? ms : 0;
    }

    var parsed = new Date(raw).getTime();
    return isFinite(parsed) ? parsed : 0;
  }

  var NEWS_FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  var CRYPTO_NEWS_MEMORY_TTL_MS = 5 * 60 * 1000;
  var CRYPTO_NEWS_MEMORY_CACHE = {};
  var TOKEN_NAME_MAP = {
    BTC: 'Bitcoin',
    ETH: 'Ethereum',
    SOL: 'Solana',
    BNB: 'Binance Coin',
    ADA: 'Cardano',
    DOGE: 'Dogecoin'
  };

  function countRecentItems(items, maxAgeMs) {
    var arr = Array.isArray(items) ? items : [];
    if (!arr.length) return 0;
    var cutoff = Date.now() - (maxAgeMs || NEWS_FRESH_WINDOW_MS);
    var count = 0;
    arr.forEach(function (item) {
      var publishedMs = parsePublishedMs(item && item.published);
      if (publishedMs && publishedMs >= cutoff) count += 1;
    });
    return count;
  }

  function preferRecentItems(items, maxAgeMs, minKeep) {
    var arr = Array.isArray(items) ? items.slice() : [];
    if (!arr.length) return [];
    var cutoff = Date.now() - (maxAgeMs || NEWS_FRESH_WINDOW_MS);
    var recent = arr.filter(function (item) {
      var publishedMs = parsePublishedMs(item && item.published);
      return publishedMs && publishedMs >= cutoff;
    });
    if (recent.length >= (Number(minKeep) || 1)) return recent;
    return arr;
  }

  function cryptoNewsCacheKey(asset) {
    if (!asset) return '';
    return String(asset.symbol || asset.coinId || '').trim().toUpperCase();
  }

  function getCryptoNewsMemorySnapshot(cacheKey) {
    var key = String(cacheKey || '').trim().toUpperCase();
    if (!key) return null;
    var entry = CRYPTO_NEWS_MEMORY_CACHE[key];
    if (!entry || !Array.isArray(entry.items) || !entry.items.length) return null;
    var fetchedAt = Number(entry.fetchedAt || 0) || 0;
    if (!fetchedAt || (Date.now() - fetchedAt) > CRYPTO_NEWS_MEMORY_TTL_MS) {
      delete CRYPTO_NEWS_MEMORY_CACHE[key];
      return null;
    }
    return entry.items.slice();
  }

  function setCryptoNewsMemorySnapshot(cacheKey, items) {
    var key = String(cacheKey || '').trim().toUpperCase();
    var rows = Array.isArray(items) ? items : [];
    if (!key || !rows.length) return;
    CRYPTO_NEWS_MEMORY_CACHE[key] = {
      items: rows.slice(),
      fetchedAt: Date.now()
    };
  }

  function getCryptoNewsApiKey() {
    var cfg = window.PT_CONFIG || {};
    return String(cfg.cryptoNewsApiKey || cfg.cryptoNewsToken || '').trim();
  }

  function getNewsApiKey() {
    var cfg = window.PT_CONFIG || {};
    return String(cfg.newsApiKey || '').trim();
  }

  function tokenSearchName(asset) {
    var symbol = String(asset && asset.symbol || '').trim().toUpperCase();
    if (TOKEN_NAME_MAP[symbol]) return TOKEN_NAME_MAP[symbol];
    var name = String(asset && asset.name || '').trim();
    return name || symbol;
  }

  function cryptoNewsApiTokenNews(asset) {
    var ticker = String(asset && asset.symbol || '').trim().toUpperCase();
    var apiKey = getCryptoNewsApiKey();
    if (!ticker) return Promise.reject(new Error('Missing crypto ticker'));
    if (!apiKey) return Promise.reject(new Error('cryptonews_key_missing'));
    var url = 'https://cryptonews-api.com/api/v1?tickers=' + encodeURIComponent(ticker) +
      '&items=10&token=' + encodeURIComponent(apiKey);
    return fetchJson(url, 'NewsAPI.cryptoNewsApi').then(function (data) {
      var rows = Array.isArray(data && data.data) ? data.data : [];
      var items = rows.map(function (row) {
        var title = row && (row.title || row.text || row.summary);
        var link = row && (row.news_url || row.url || row.link);
        var published = row && (row.date || row.published_at || row.published);
        var source = row && (row.source_name || row.source || row.domain || 'CryptoNews');
        if (!title) return null;
        return {
          title: String(title).trim(),
          link: link ? String(link).trim() : '#',
          published: normalizePublished(published),
          publishedMs: parsePublishedMs(published),
          source: String(source || 'CryptoNews')
        };
      }).filter(Boolean).sort(function (a, b) {
        return (Number(b.publishedMs) || 0) - (Number(a.publishedMs) || 0);
      }).slice(0, 10).map(function (item) {
        delete item.publishedMs;
        return item;
      });
      if (!items.length) throw new Error('No CryptoNews API items');
      return items;
    });
  }

  function newsApiTokenNews(asset) {
    var query = tokenSearchName(asset);
    var apiKey = getNewsApiKey();
    if (!query) return Promise.reject(new Error('Missing token query'));
    if (!apiKey) return Promise.reject(new Error('newsapi_key_missing'));
    var url = 'https://newsapi.org/v2/everything?q=' + encodeURIComponent(query) +
      '&sortBy=publishedAt&pageSize=10&language=en&apiKey=' + encodeURIComponent(apiKey);
    return fetchJson(url, 'NewsAPI.newsApiCryptoFallback').then(function (data) {
      var rows = Array.isArray(data && data.articles) ? data.articles : [];
      var items = rows.map(function (row) {
        var title = row && row.title;
        var link = row && row.url;
        var published = row && (row.publishedAt || row.published_at || row.date);
        var source = row && row.source && row.source.name
          ? row.source.name
          : (row && row.author) || 'NewsAPI';
        if (!title) return null;
        return {
          title: String(title).trim(),
          link: link ? String(link).trim() : '#',
          published: normalizePublished(published),
          publishedMs: parsePublishedMs(published),
          source: String(source || 'NewsAPI')
        };
      }).filter(Boolean).sort(function (a, b) {
        return (Number(b.publishedMs) || 0) - (Number(a.publishedMs) || 0);
      }).slice(0, 10).map(function (item) {
        delete item.publishedMs;
        return item;
      });
      if (!items.length) throw new Error('No NewsAPI crypto items');
      return items;
    });
  }

  function fetchCryptoModeNews(asset, options) {
    var opts = options || {};
    var cacheKey = cryptoNewsCacheKey(asset);
    if (!opts.force) {
      var memo = getCryptoNewsMemorySnapshot(cacheKey);
      if (memo && memo.length) return Promise.resolve(memo);
    }
    return cryptoNewsApiTokenNews(asset)
      .catch(function () {
        return newsApiTokenNews(asset);
      })
      .then(function (items) {
        var rows = Array.isArray(items) ? items.slice(0, 10) : [];
        if (rows.length) setCryptoNewsMemorySnapshot(cacheKey, rows);
        return rows;
      });
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
      var parsed = parseRss(xml);
      if (!countRecentItems(parsed, NEWS_FRESH_WINDOW_MS)) throw new Error('Yahoo RSS news stale');
      var items = preferRecentItems(parsed, NEWS_FRESH_WINDOW_MS, 1);
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
      return preferRecentItems(items, NEWS_FRESH_WINDOW_MS, 2);
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
        var parsed = parseRss(xml);
        if (!countRecentItems(parsed, NEWS_FRESH_WINDOW_MS)) throw new Error('Empty/stale Yahoo feed');
        var items = preferRecentItems(parsed, NEWS_FRESH_WINDOW_MS, 1);
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

  function marketauxNews(asset, options) {
    options = options || {};
    var symbol = asset && asset.type === 'stock' ? String(asset.symbol || '').trim().toUpperCase() : '';
    var query = String(options.query || '').trim();
    var qs = query
      ? ('?query=' + encodeURIComponent(query))
      : (symbol ? ('?symbol=' + encodeURIComponent(symbol)) : '?general=1');
    return doFetchJson(apiBase() + '/api/news/marketaux' + qs, 'NewsAPI.marketauxNews').then(function (data) {
      var rows = Array.isArray(data && data.data) ? data.data : [];
      var items = rows.map(function (row) {
        var title = row && (row.title || row.headline || row.snippet);
        var link = row && (row.url || row.link);
        var published = row && (row.published_at || row.datetime || row.date);
        var source = row && (row.source || row.source_name || row.domain || 'Marketaux');
        var relatedTickers = Array.isArray(row && row.entities)
          ? row.entities.map(function (entity) {
            return String(entity && (entity.symbol || entity.ticker) || '').trim().toUpperCase();
          }).filter(Boolean)
          : [];
        if (!title) return null;
        return {
          title: String(title).trim(),
          link: link ? String(link).trim() : '#',
          published: normalizePublished(published),
          publishedMs: parsePublishedMs(published),
          source: String(source || 'Marketaux'),
          relatedTickers: relatedTickers
        };
      }).filter(Boolean).sort(function (a, b) {
        return (Number(b.publishedMs) || 0) - (Number(a.publishedMs) || 0);
      }).slice(0, 8).map(function (item) {
        delete item.publishedMs;
        return item;
      });
      if (!items.length) throw new Error('No Marketaux news items');
      return items;
    });
  }

  function marketauxQueryForAsset(asset) {
    if (!asset || asset.type !== 'stock') return '';
    var symbol = String(asset.symbol || '').trim().toUpperCase();
    var rawName = String(asset.name || '').trim();
    if (!rawName) return symbol;
    var normalized = normalizeHeadlineText(rawName);
    if (!normalized) return symbol;
    var stopWords = {
      INC: true,
      INCORPORATED: true,
      CORPORATION: true,
      CORP: true,
      COMPANY: true,
      CO: true,
      LIMITED: true,
      LTD: true,
      PLC: true,
      HOLDINGS: true,
      HOLDING: true,
      GROUP: true,
      CLASS: true,
      ORDINARY: true,
      STOCK: true,
      ADR: true
    };
    var firstMeaningful = normalized.split(' ').filter(function (token) {
      return token && !stopWords[token];
    })[0] || '';
    if (symbol && firstMeaningful) return symbol + ' ' + firstMeaningful;
    return symbol || firstMeaningful || rawName;
  }

  function alphaVantageNews(asset) {
    var symbol = asset && asset.type === 'stock' ? String(asset.symbol || '').trim().toUpperCase() : '';
    var qs = symbol ? ('?symbol=' + encodeURIComponent(symbol)) : '?general=1';
    return doFetchJson(apiBase() + '/api/news/alphavantage' + qs, 'NewsAPI.alphaVantageNews').then(function (data) {
      var rows = Array.isArray(data && data.feed) ? data.feed : [];
      var items = rows.map(function (row) {
        var title = row && row.title;
        var link = row && row.url;
        var published = row && (row.time_published || row.published_at || row.date);
        var source = row && (row.source || row.source_domain || 'Alpha Vantage');
        var relatedTickers = Array.isArray(row && row.ticker_sentiment)
          ? row.ticker_sentiment.map(function (entry) {
            return String(entry && entry.ticker || '').trim().toUpperCase();
          }).filter(Boolean)
          : [];
        if (!title) return null;
        return {
          title: String(title).trim(),
          link: link ? String(link).trim() : '#',
          published: normalizePublished(published),
          publishedMs: parsePublishedMs(published),
          source: String(source || 'Alpha Vantage'),
          relatedTickers: relatedTickers
        };
      }).filter(Boolean).sort(function (a, b) {
        return (Number(b.publishedMs) || 0) - (Number(a.publishedMs) || 0);
      }).slice(0, 8).map(function (item) {
        delete item.publishedMs;
        return item;
      });
      if (!items.length) throw new Error('No Alpha Vantage news items');
      return items;
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

  function normalizeHeadlineText(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hasTickerBoundary(text, symbol) {
    var t = String(text || '').toUpperCase();
    var s = String(symbol || '').toUpperCase();
    if (!t || !s) return false;
    var escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|[^A-Z0-9])' + escaped + '(?:$|[^A-Z0-9])').test(t);
  }

  function companyNameNeedles(asset) {
    var rawName = String(asset && asset.name || '');
    if (!rawName) return [];
    var normalized = normalizeHeadlineText(rawName);
    if (!normalized) return [];
    var stopWords = {
      INC: true,
      INCORPORATED: true,
      CORPORATION: true,
      CORP: true,
      COMPANY: true,
      CO: true,
      LIMITED: true,
      LTD: true,
      PLC: true,
      HOLDINGS: true,
      HOLDING: true,
      GROUP: true,
      CLASS: true,
      ORDINARY: true,
      STOCK: true,
      ADR: true
    };
    var parts = normalized.split(' ').filter(function (token) {
      return token && !stopWords[token];
    });
    var needles = [];
    if (normalized.length >= 4) needles.push(normalized);
    if (parts[0] && parts[0].length >= 4) needles.push(parts[0]);
    if (parts.length >= 2) {
      var pair = (parts[0] + ' ' + parts[1]).trim();
      if (pair.length >= 6) needles.push(pair);
    }
    var dedup = {};
    return needles.filter(function (needle) {
      if (!needle || dedup[needle]) return false;
      dedup[needle] = true;
      return true;
    });
  }

  function isRelevantStockHeadline(item, asset) {
    var symbol = String(asset && asset.symbol || '').toUpperCase();
    var title = String(item && item.title || '').toUpperCase();
    var normalizedTitle = normalizeHeadlineText(title);
    var src = String(item && item.source || '').toUpperCase();
    var needles = companyNameNeedles(asset);
    var relatedTickers = Array.isArray(item && item.relatedTickers)
      ? item.relatedTickers.map(function (t) { return String(t || '').toUpperCase(); })
      : [];
    if (!symbol || !title) return false;
    if (relatedTickers.indexOf(symbol) >= 0) return true;
    if (hasTickerBoundary(title, symbol)) return true;
    if (normalizedTitle.indexOf(symbol) >= 0) return true;
    if (needles.some(function (needle) { return normalizedTitle.indexOf(needle) >= 0; })) return true;
    // ETF names are often shortened in headlines; allow source mention for strict ticker feeds.
    if (src.indexOf('YAHOO') >= 0 && title.indexOf('ETF') >= 0 && title.indexOf(symbol.slice(0, 3)) >= 0) return true;
    return false;
  }

  function filterSelectedStockNews(items, asset) {
    var arr = Array.isArray(items) ? items : [];
    var filtered = arr.filter(function (it) { return isRelevantStockHeadline(it, asset); });
    if (filtered.length) return filtered.slice(0, 8);
    // Provider calls are symbol-scoped; if matching heuristics miss, keep top items instead of empty state.
    return arr.slice(0, 8);
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
        : ['marketaux', 'yahoo', 'tickertick', 'alphavantage'];
      var ordered = sourcePref !== 'auto'
        ? (enabledOrdered.indexOf(sourcePref) >= 0 ? [sourcePref] : enabledOrdered.slice())
        : enabledOrdered.slice();

      function run(idx) {
        if (idx >= ordered.length) return Promise.reject(new Error('No enabled news source'));
        var sourceId = ordered[idx];
        var task;
        if (sourceId === 'marketaux') {
          task = marketauxNews(null);
        } else if (sourceId === 'alphavantage') {
          task = alphaVantageNews(null);
        } else if (sourceId === 'tickertick') {
          task = tickertickNews({ symbol: 'SPY', type: 'stock' }).catch(function () { return tickertickNews({ symbol: 'QQQ', type: 'stock' }); });
        } else {
          task = yahooGeneralStocksNews();
        }
        return task.catch(function () { return run(idx + 1); });
      }

      return run(0);
    },
    getNews: function (asset, options) {
      var sourcePref = String(options && options.source || 'auto').toLowerCase();
      var strictFreshness = sourcePref === 'auto';
      var enabledOrdered = (PT.ApiSources && typeof PT.ApiSources.getOrdered === 'function')
        ? PT.ApiSources.getOrdered('news', asset.type === 'crypto' ? 'crypto' : 'stock')
        : ['marketaux', 'yahoo', 'tickertick', 'alphavantage'];
      var ordered = sourcePref !== 'auto'
        ? (enabledOrdered.indexOf(sourcePref) >= 0 ? [sourcePref] : enabledOrdered.slice())
        : enabledOrdered.slice();

      if (asset.type === 'crypto') {
        return fetchCryptoModeNews(asset, {
          force: !!(options && options.force)
        });
      }

      function run(idx) {
        if (idx >= ordered.length) return Promise.reject(new Error('No enabled news source'));
        var sourceId = ordered[idx];
        var task;
        if (sourceId === 'marketaux') {
          task = marketauxNews(asset)
            .catch(function () {
              var query = marketauxQueryForAsset(asset);
              if (!query) throw new Error('No Marketaux query fallback');
              return marketauxNews(asset, { query: query });
            })
            .then(function (items) {
              var filtered = filterSelectedStockNews(items, asset);
              if (!filtered.length) throw new Error('No relevant selected-stock news');
              return filtered;
            });
        } else if (sourceId === 'alphavantage') {
          task = alphaVantageNews(asset).then(function (items) {
            var filtered = filterSelectedStockNews(items, asset);
            if (!filtered.length) throw new Error('No relevant selected-stock news');
            return filtered;
          });
        } else if (sourceId === 'tickertick') {
          task = tickertickNews(asset).then(function (items) {
            var filtered = filterSelectedStockNews(items, asset);
            if (!filtered.length) throw new Error('No relevant selected-stock news');
            return filtered;
          });
        } else {
          var yahooSymbol = String(asset.symbol || '').toUpperCase();
          task = yahooSearchNews(yahooSymbol).then(function (items) {
            var filtered = filterSelectedStockNews(items, asset);
            if (!filtered.length) throw new Error('No relevant Yahoo search news');
            if (strictFreshness && !countRecentItems(filtered, NEWS_FRESH_WINDOW_MS)) throw new Error('Yahoo search news stale');
            return filtered;
          }).catch(function () {
            return yahooRssNews(yahooSymbol).then(function (items) {
              var filtered = filterSelectedStockNews(items, asset);
              if (!filtered.length) throw new Error('No relevant selected-stock news');
              if (strictFreshness && !countRecentItems(filtered, NEWS_FRESH_WINDOW_MS)) throw new Error('Yahoo RSS news stale');
              return filtered;
            });
          });
        }
        return task.catch(function () { return run(idx + 1); });
      }

      return run(0);
    }
  };
})();
