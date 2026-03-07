// Wraps browser-side persistence, import/export helpers, and server-backed portfolio sync.
(function () {
  var PT = (window.PT = window.PT || {});
  // Lists the localStorage keys reserved by the app.
  var KEYS = {
    portfolio: 'pt2026_portfolio',
    portfolioBackup: 'pt2026_portfolio_backup',
    demoPortfolioBackup: 'pt2026_demo_portfolio_backup',
    settings: 'pt2026_settings',
    settingsBackup: 'pt2026_settings_backup',
    cache: 'pt2026_cache'
  };

  // Parses JSON without throwing when the stored value is corrupt.
  function safeParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return fallback;
    }
  }

  // Reads and parses a JSON value from localStorage.
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? safeParse(raw, fallback) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  // Writes a JSON value into localStorage.
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Resolves the base URL used for server-backed portfolio sync requests.
  function apiBase() {
    var cfg = window.PT_CONFIG || {};
    if (Object.prototype.hasOwnProperty.call(cfg, 'proxyBase')) {
      return String(cfg.proxyBase || '').replace(/\/$/, '');
    }
    if (location.protocol === 'file:') return 'http://localhost:5500';
    return String(location.origin || '').replace(/\/$/, '');
  }

  // Performs a JSON fetch with a minimal shared error path.
  function fetchJson(url, options) {
    return fetch(url, options || {}).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });
  }

  // Serializes remote portfolio writes so saves stay ordered.
  var remoteSaveQueue = Promise.resolve();

  // Builds a filesystem-safe timestamp suffix for exported portfolio files.
  function timestampForFilename() {
    var d = new Date();
    function pad(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' +
      pad(d.getMonth() + 1) + '-' +
      pad(d.getDate()) + '_' +
      pad(d.getHours()) + '-' +
      pad(d.getMinutes()) + '-' +
      pad(d.getSeconds());
  }

  // Checks whether a value matches the core portfolio shape.
  function isPortfolioShape(x) {
    return !!(x && Array.isArray(x.stocks) && Array.isArray(x.crypto));
  }

  // Normalizes legacy and current portfolio payload formats into one record shape.
  function normalizePortfolioRecord(raw) {
    if (!raw) return null;
    // Legacy shape: { stocks, crypto }
    if (isPortfolioShape(raw)) {
      return { portfolio: raw, savedAt: 0 };
    }
    // New envelope shape: { portfolio: {stocks,crypto}, savedAt }
    if (raw && isPortfolioShape(raw.portfolio)) {
      return {
        portfolio: raw.portfolio,
        savedAt: Number(raw.savedAt || 0) || 0
      };
    }
    return null;
  }

  // Normalizes legacy and current settings payload formats into one record shape.
  function normalizeSettingsRecord(raw) {
    if (!raw) return null;
    // New envelope shape.
    if (raw && raw.settings && typeof raw.settings === 'object') {
      return {
        settings: raw.settings,
        savedAt: Number(raw.savedAt || 0) || 0
      };
    }
    // Legacy plain settings object.
    if (typeof raw === 'object') {
      return { settings: raw, savedAt: 0 };
    }
    return null;
  }

  PT.Storage = {
    // Reads the newest local portfolio copy, preferring the freshest backup pair.
    loadPortfolio: function () {
      var primary = normalizePortfolioRecord(read(KEYS.portfolio, null));
      var backup = normalizePortfolioRecord(read(KEYS.portfolioBackup, null));
      if (primary && backup) {
        return (primary.savedAt >= backup.savedAt ? primary.portfolio : backup.portfolio);
      }
      if (primary) return primary.portfolio;
      if (backup) return backup.portfolio;
      return null;
    },
    // Saves the portfolio to both primary and backup localStorage keys.
    savePortfolio: function (portfolio) {
      var payload = { savedAt: Date.now(), portfolio: portfolio };
      var okPrimary = write(KEYS.portfolio, payload);
      var okBackup = write(KEYS.portfolioBackup, payload);
      return okPrimary || okBackup;
    },
    // Reads the demo-mode backup portfolio from localStorage.
    loadDemoPortfolioBackup: function () {
      var rec = normalizePortfolioRecord(read(KEYS.demoPortfolioBackup, null));
      return rec ? rec.portfolio : null;
    },
    // Saves the demo-mode backup portfolio to localStorage.
    saveDemoPortfolioBackup: function (portfolio) {
      var payload = { savedAt: Date.now(), portfolio: portfolio };
      return write(KEYS.demoPortfolioBackup, payload);
    },
    // Clears the demo-mode backup snapshot.
    clearDemoPortfolioBackup: function () {
      try {
        localStorage.removeItem(KEYS.demoPortfolioBackup);
        return true;
      } catch (e) {
        return false;
      }
    },
    // Reads the newest local settings copy, preferring the freshest backup pair.
    loadSettings: function () {
      var primary = normalizeSettingsRecord(read(KEYS.settings, null));
      var backup = normalizeSettingsRecord(read(KEYS.settingsBackup, null));
      if (primary && backup) {
        return (primary.savedAt >= backup.savedAt ? primary.settings : backup.settings);
      }
      if (primary) return primary.settings;
      if (backup) return backup.settings;
      return null;
    },
    // Saves settings to both primary and backup localStorage keys.
    saveSettings: function (settings) {
      var payload = { savedAt: Date.now(), settings: settings };
      var okPrimary = write(KEYS.settings, payload);
      var okBackup = write(KEYS.settingsBackup, payload);
      return okPrimary || okBackup;
    },
    // Loads the best-effort browser cache payload.
    loadCache: function () {
      return read(KEYS.cache, {});
    },
    // Persists the best-effort browser cache payload.
    saveCache: function (cache) {
      return write(KEYS.cache, cache);
    },
    // Returns a cached entry only if it exists and is still fresh enough.
    getCached: function (cache, key, maxAgeMs) {
      var entry = cache && cache[key];
      if (!entry || !entry.ts) return null;
      if (maxAgeMs && Date.now() - entry.ts > maxAgeMs) return null;
      return entry.data;
    },
    // Stores a cache entry with its current timestamp.
    setCached: function (cache, key, data) {
      if (!cache) return;
      cache[key] = { ts: Date.now(), data: data };
    },
    // Fetches the shared portfolio from the local proxy.
    loadRemotePortfolio: function () {
      return fetchJson(apiBase() + '/api/portfolio', { cache: 'no-store' }).then(function (payload) {
        var rec = normalizePortfolioRecord(payload && payload.portfolio ? payload.portfolio : payload);
        return {
          portfolio: rec ? rec.portfolio : null,
          updatedAt: Math.max(0, Number(payload && payload.updatedAt || 0) || 0)
        };
      }).catch(function () {
        return null;
      });
    },
    // Saves the shared portfolio to the local proxy in write order.
    saveRemotePortfolio: function (portfolio, baseUpdatedAt) {
      remoteSaveQueue = remoteSaveQueue.catch(function () {
        return null;
      }).then(function () {
        return fetch(apiBase() + '/api/portfolio', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portfolio: portfolio,
            baseUpdatedAt: Math.max(0, Number(baseUpdatedAt || 0) || 0)
          })
        }).then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (payload) {
            if (response.ok) {
              return {
                ok: true,
                updatedAt: Math.max(0, Number(payload && payload.updatedAt || 0) || 0)
              };
            }
            if (response.status === 409) {
              var rec = normalizePortfolioRecord(payload && payload.portfolio ? payload.portfolio : payload);
              return {
                ok: false,
                conflict: true,
                portfolio: rec ? rec.portfolio : null,
                updatedAt: Math.max(0, Number(payload && payload.updatedAt || 0) || 0)
              };
            }
            return {
              ok: false,
              conflict: false
            };
          });
        }).catch(function () {
          return {
            ok: false,
            conflict: false
          };
        });
      });
      return remoteSaveQueue;
    },
    // Fetches indicator-explorer favorites from the shared local proxy DB.
    loadRemoteExplorerFavorites: function () {
      return fetchJson(apiBase() + '/api/explorer-favorites', { cache: 'no-store' }).then(function (payload) {
        var favorites = payload && payload.favorites && typeof payload.favorites === 'object'
          ? payload.favorites
          : { stocks: [], crypto: [] };
        return {
          favorites: favorites,
          updatedAt: Math.max(0, Number(payload && payload.updatedAt || 0) || 0)
        };
      }).catch(function () {
        return null;
      });
    },
    // Saves indicator-explorer favorites to the shared local proxy DB.
    saveRemoteExplorerFavorites: function (favorites) {
      return fetch(apiBase() + '/api/explorer-favorites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites: favorites && typeof favorites === 'object' ? favorites : { stocks: [], crypto: [] } })
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (payload) {
          return {
            ok: !!response.ok,
            updatedAt: Math.max(0, Number(payload && payload.updatedAt || 0) || 0)
          };
        });
      }).catch(function () {
        return { ok: false, updatedAt: 0 };
      });
    },
    // Reads a server-persisted chart cache snapshot by key.
    getRemoteChartCache: function (key) {
      var safeKey = String(key || '').trim();
      if (!safeKey) return Promise.resolve(null);
      return fetchJson(apiBase() + '/api/chart-cache?key=' + encodeURIComponent(safeKey), {
        cache: 'no-store'
      }).then(function (payload) {
        if (!payload || !payload.found) return null;
        return {
          key: safeKey,
          items: Array.isArray(payload.items) ? payload.items : [],
          fetchedAt: Math.max(0, Number(payload.fetchedAt || 0) || 0),
          source: String(payload.source || '').trim() || null,
          updatedAt: Math.max(0, Number(payload.updatedAt || 0) || 0)
        };
      }).catch(function () {
        return null;
      });
    },
    // Writes a server-persisted chart cache snapshot by key.
    saveRemoteChartCache: function (key, items, meta) {
      var safeKey = String(key || '').trim();
      if (!safeKey || !Array.isArray(items)) return Promise.resolve({ ok: false });
      var payload = {
        key: safeKey,
        items: items,
        fetchedAt: Math.max(0, Number(meta && meta.fetchedAt || 0) || Date.now()),
        source: String(meta && meta.source || '').trim() || null
      };
      return fetch(apiBase() + '/api/chart-cache', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (json) {
          return {
            ok: !!response.ok,
            updatedAt: Math.max(0, Number(json && json.updatedAt || 0) || 0)
          };
        });
      }).catch(function () {
        return { ok: false };
      });
    },
    // Exports a provided payload as a downloadable JSON file.
    exportPortfolioFile: function (payload) {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'portfolio-' + timestampForFilename() + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 500);
    },
    // Imports and parses a user-selected JSON portfolio file.
    importPortfolioFile: function (file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          try {
            resolve(JSON.parse(String(reader.result || '{}')));
          } catch (e) {
            reject(new Error('Invalid JSON file'));
          }
        };
        reader.onerror = function () { reject(new Error('Failed to read file')); };
        reader.readAsText(file);
      });
    }
  };
})();
