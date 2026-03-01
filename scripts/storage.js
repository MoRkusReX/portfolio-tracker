(function () {
  var PT = (window.PT = window.PT || {});
  var KEYS = {
    portfolio: 'pt2026_portfolio',
    portfolioBackup: 'pt2026_portfolio_backup',
    demoPortfolioBackup: 'pt2026_demo_portfolio_backup',
    settings: 'pt2026_settings',
    settingsBackup: 'pt2026_settings_backup',
    cache: 'pt2026_cache'
  };

  function safeParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return fallback;
    }
  }

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? safeParse(raw, fallback) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

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

  function isPortfolioShape(x) {
    return !!(x && Array.isArray(x.stocks) && Array.isArray(x.crypto));
  }

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
    savePortfolio: function (portfolio) {
      var payload = { savedAt: Date.now(), portfolio: portfolio };
      var okPrimary = write(KEYS.portfolio, payload);
      var okBackup = write(KEYS.portfolioBackup, payload);
      return okPrimary || okBackup;
    },
    loadDemoPortfolioBackup: function () {
      var rec = normalizePortfolioRecord(read(KEYS.demoPortfolioBackup, null));
      return rec ? rec.portfolio : null;
    },
    saveDemoPortfolioBackup: function (portfolio) {
      var payload = { savedAt: Date.now(), portfolio: portfolio };
      return write(KEYS.demoPortfolioBackup, payload);
    },
    clearDemoPortfolioBackup: function () {
      try {
        localStorage.removeItem(KEYS.demoPortfolioBackup);
        return true;
      } catch (e) {
        return false;
      }
    },
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
    saveSettings: function (settings) {
      var payload = { savedAt: Date.now(), settings: settings };
      var okPrimary = write(KEYS.settings, payload);
      var okBackup = write(KEYS.settingsBackup, payload);
      return okPrimary || okBackup;
    },
    loadCache: function () {
      return read(KEYS.cache, {});
    },
    saveCache: function (cache) {
      return write(KEYS.cache, cache);
    },
    getCached: function (cache, key, maxAgeMs) {
      var entry = cache && cache[key];
      if (!entry || !entry.ts) return null;
      if (maxAgeMs && Date.now() - entry.ts > maxAgeMs) return null;
      return entry.data;
    },
    setCached: function (cache, key, data) {
      if (!cache) return;
      cache[key] = { ts: Date.now(), data: data };
    },
    exportPortfolioFile: function (payload) {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'portfolio-' + timestampForFilename() + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 500);
    },
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
