// Owns DOM lookups and pure UI rendering helpers for the portfolio interface.
(function () {
  var PT = (window.PT = window.PT || {});

  function qs(id) { return document.getElementById(id); }

  function fmtCurrency(n) {
    if (!isFinite(Number(n))) return '$0.00';
    return Number(n).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  }

  function fmtCompactNumber(n) {
    var value = Number(n);
    if (!isFinite(value)) return 'n/a';
    var abs = Math.abs(value);
    var suffix = '';
    var divisor = 1;
    if (abs >= 1e12) {
      suffix = 'T';
      divisor = 1e12;
    } else if (abs >= 1e9) {
      suffix = 'B';
      divisor = 1e9;
    } else if (abs >= 1e6) {
      suffix = 'M';
      divisor = 1e6;
    } else {
      return value.toLocaleString();
    }
    var scaled = value / divisor;
    var rounded = Math.abs(scaled) >= 100 ? scaled.toFixed(0) : (Math.abs(scaled) >= 10 ? scaled.toFixed(1) : scaled.toFixed(2));
    return String(rounded).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1') + suffix;
  }

  function fmtCompactCurrency(n) {
    var text = fmtCompactNumber(n);
    if (text === 'n/a') return text;
    return '$' + text;
  }

  function fmtAssetUnitPrice(n, assetType) {
    if (assetType !== 'crypto') return fmtCurrency(n);
    var value = Number(n);
    if (!isFinite(value)) return '$0.00';
    var abs = Math.abs(value);
    var maxFrac = 2;
    if (abs > 0 && abs < 1) {
      if (abs >= 0.1) maxFrac = 4;
      else if (abs >= 0.01) maxFrac = 5;
      else if (abs >= 0.001) maxFrac = 6;
      else if (abs >= 0.0001) maxFrac = 7;
      else maxFrac = 8;
    }
    return value.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: maxFrac
    });
  }

  function fmtNumber(n) {
    if (!isFinite(Number(n))) return '0';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  function pctClass(n) {
    if (n > 0) return 'pl--pos';
    if (n < 0) return 'pl--neg';
    return 'pl--flat';
  }

  function pctText(n) {
    if (!isFinite(Number(n))) return '0.00%';
    var v = Number(n);
    var sign = v > 0 ? '+' : '';
    return sign + v.toFixed(2) + '%';
  }

  function signedCurrencyText(n) {
    if (!isFinite(Number(n))) return 'n/a';
    var v = Number(n);
    var absText = Number(Math.abs(v)).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
    return (v > 0 ? '+' : (v < 0 ? '-' : '')) + absText;
  }

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function iconMarkup(name) {
    var icons = {
      layoutWide: '<svg viewBox="0 0 24 24" focusable="false"><rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 9.5h8M8 12h8M8 14.5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      layoutNarrow: '<svg viewBox="0 0 24 24" focusable="false"><rect x="7" y="3" width="10" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 7.5h4M10 11h4M10 14.5h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      eye: '<svg viewBox="0 0 24 24" focusable="false"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
      eyeOff: '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 4.5 21 19.5M10.6 6.2A10.4 10.4 0 0 1 12 6c6 0 9.5 6 9.5 6a17.4 17.4 0 0 1-3.3 3.8M6.3 9A17 17 0 0 0 2.5 12s3.5 6 9.5 6a10 10 0 0 0 3-.4M10 12a2 2 0 0 0 3 1.7 2.1 2.1 0 0 0 .5-2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      moon: '<svg viewBox="0 0 24 24" focusable="false"><path d="M14.5 3.5a8 8 0 1 0 6 13.5A9 9 0 1 1 14.5 3.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
      sun: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      bug: '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 8.5c2.7 0 4.8 2 4.8 4.6v2.2c0 2.7-2.1 4.9-4.8 4.9s-4.8-2.2-4.8-4.9v-2.2c0-2.6 2.1-4.6 4.8-4.6Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.6 8.3V6.9a2.4 2.4 0 1 1 4.8 0v1.4M4.8 10.1h2.4M16.8 10.1h2.4M5.5 15h2M16.5 15h2M8.6 5.4 7.2 4M15.4 5.4 16.8 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      demo: '<svg viewBox="0 0 24 24" focusable="false"><path d="M9 3h6M10 3v3.2l-4.2 6.5a5 5 0 0 0 4.2 7.8h4a5 5 0 0 0 4.2-7.8L14 6.2V3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.6 14h6.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    };
    return '<span class="btn__icon" aria-hidden="true">' + (icons[name] || '') + '</span>';
  }

  PT.UI = {
    el: {},
    init: function () {
      this.el = {
        themeToggle: qs('themeToggle'),
        layoutToggle: qs('layoutToggle'),
        cryptoParticlesToggle: qs('cryptoParticlesToggle'),
        cryptoParticlesCanvas: qs('cryptoParticlesCanvas'),
        demoModeToggle: qs('demoModeToggle'),
        apiSourcesBtn: qs('apiSourcesBtn'),
        apiDebugToggle: qs('apiDebugToggle'),
        apiDebugPanel: qs('apiDebugPanel'),
        apiDebugTableBody: qs('apiDebugTableBody'),
        holdingsPrivacyToggle: qs('holdingsPrivacyToggle'),
        exportBtn: qs('exportBtn'),
        importInput: qs('importInput'),
        addAssetBtn: qs('addAssetBtn'),
        refreshBtn: qs('refreshBtn'),
        stocksAutoRefreshToggle: qs('stocksAutoRefreshToggle'),
        cryptoAutoRefreshToggle: qs('cryptoAutoRefreshToggle'),
        twelveDataToggle: qs('twelveDataToggle'),
        newsRefreshBtn: qs('newsRefreshBtn'),
        newsScopeToggle: qs('newsScopeToggle'),
        newsScopeGeneralBtn: qs('newsScopeGeneralBtn'),
        newsScopeSelectedBtn: qs('newsScopeSelectedBtn'),
        newsSourceSelect: qs('newsSourceSelect'),
        twitterFetchBtn: qs('twitterFetchBtn'),
        stocksTab: qs('stocksTab'),
        cryptoTab: qs('cryptoTab'),
        sortSelect: qs('sortSelect'),
        statusBadge: qs('statusBadge'),
        connectionModeBadge: qs('connectionModeBadge'),
        totalValue: qs('totalValue'),
        totalPL: qs('totalPL'),
        totalDailyPL: qs('totalDailyPL'),
        holdingsCount: qs('holdingsCount'),
        portfolioList: qs('portfolioList'),
        heroCard: qs('heroCard'),
        overviewTitle: qs('overviewTitle'),
        overviewSubtitle: qs('overviewSubtitle'),
        detailTitle: qs('detailTitle'),
        detailPanel: qs('detailPanel'),
        detailPriceBadge: qs('detailPriceBadge'),
        detailMeta: qs('detailMeta'),
        detailChartTimeframes: qs('detailChartTimeframes'),
        externalLink: qs('externalLink'),
        marketDataGrid: qs('marketDataGrid'),
        fundamentalsPanel: qs('fundamentalsPanel'),
        fundamentalsAssetLabel: qs('fundamentalsAssetLabel'),
        fundamentalsTitle: qs('fundamentalsTitle'),
        fundamentalsOverallPill: qs('fundamentalsOverallPill'),
        fundamentalsMeta: qs('fundamentalsMeta'),
        fundamentalsSummary: qs('fundamentalsSummary'),
        fundamentalsGrid: qs('fundamentalsGrid'),
        fundamentalsReasons: qs('fundamentalsReasons'),
        btcDominancePanel: qs('btcDominancePanel'),
        btcDominanceLabel: qs('btcDominanceLabel'),
        btcDominanceValue: qs('btcDominanceValue'),
        btcDominanceUpdated: qs('btcDominanceUpdated'),
        btcDominanceBar: qs('btcDominanceBar'),
        btcDominanceBarLabel: qs('btcDominanceBarLabel'),
        ethDominanceBar: qs('ethDominanceBar'),
        ethDominanceBarLabel: qs('ethDominanceBarLabel'),
        othersDominanceBar: qs('othersDominanceBar'),
        othersDominanceBarLabel: qs('othersDominanceBarLabel'),
        newsList: qs('newsList'),
        twitterSection: qs('twitterSection'),
        usefulLinksList: qs('usefulLinksList'),
        heatmapPanel: qs('heatmapPanel'),
        heatmapFrame: qs('heatmapFrame'),
        heatmapFallback: qs('heatmapFallback'),
        eventsList: qs('eventsList'),
        eventsBlockTitle: qs('eventsBlockTitle'),
        allocationChart: qs('allocationChart'),
        assetChart: qs('assetChart'),
        pieFallback: qs('pieFallback'),
        lineFallback: qs('lineFallback'),
        allocationLegend: qs('allocationLegend'),
        modal: qs('assetModal'),
        modalCloseBtn: qs('modalCloseBtn'),
        cancelAssetBtn: qs('cancelAssetBtn'),
        assetForm: qs('assetForm'),
        positionModal: qs('positionModal'),
        positionModalCloseBtn: qs('positionModalCloseBtn'),
        positionCancelBtn: qs('positionCancelBtn'),
        positionForm: qs('positionForm'),
        positionModalTitle: qs('positionModalTitle'),
        positionSummary: qs('positionSummary'),
        positionQtyInput: qs('positionQtyInput'),
        positionPriceGroup: qs('positionPriceGroup'),
        positionPriceInput: qs('positionPriceInput'),
        positionNote: qs('positionNote'),
        positionSubmitBtn: qs('positionSubmitBtn'),
        apiSourcesModal: qs('apiSourcesModal'),
        apiSourcesModalCloseBtn: qs('apiSourcesModalCloseBtn'),
        apiSourcesContent: qs('apiSourcesContent'),
        indicatorsPanel: qs('indicatorsPanel'),
        indicatorExplorerBtn: qs('indicatorExplorerBtn'),
        indicatorsAssetLabel: qs('indicatorsAssetLabel'),
        indicatorsOverallPill: qs('indicatorsOverallPill'),
        indicatorsMeta: qs('indicatorsMeta'),
        indicatorsTrendMeter: qs('indicatorsTrendMeter'),
        indicatorsTimeframes: qs('indicatorsTimeframes'),
        indicatorExplorerModal: qs('indicatorExplorerModal'),
        indicatorExplorerCloseBtn: qs('indicatorExplorerCloseBtn'),
        indicatorExplorerStocksTab: qs('indicatorExplorerStocksTab'),
        indicatorExplorerCryptoTab: qs('indicatorExplorerCryptoTab'),
        indicatorExplorerSearchInput: qs('indicatorExplorerSearchInput'),
        indicatorExplorerSearchList: qs('indicatorExplorerSearchList'),
        indicatorExplorerChartTitle: qs('indicatorExplorerChartTitle'),
        indicatorExplorerChartMeta: qs('indicatorExplorerChartMeta'),
        indicatorExplorerChartTimeframes: qs('indicatorExplorerChartTimeframes'),
        indicatorExplorerChart: qs('indicatorExplorerChart'),
        indicatorExplorerChartFallback: qs('indicatorExplorerChartFallback'),
        indicatorExplorerAssetLabel: qs('indicatorExplorerAssetLabel'),
        indicatorExplorerModeLabel: qs('indicatorExplorerModeLabel'),
        indicatorExplorerOverallPill: qs('indicatorExplorerOverallPill'),
        indicatorExplorerMeta: qs('indicatorExplorerMeta'),
        indicatorExplorerTrendMeter: qs('indicatorExplorerTrendMeter'),
        indicatorExplorerTimeframes: qs('indicatorExplorerTimeframes'),
        assetTypeInput: qs('assetTypeInput'),
        assetSearchInput: qs('assetSearchInput'),
        assetSelectedId: qs('assetSelectedId'),
        quantityInput: qs('quantityInput'),
        entryPriceInput: qs('entryPriceInput'),
        autocompleteList: qs('autocompleteList'),
        assetRowTemplate: qs('assetRowTemplate')
      };
      this._activeFundamentalsHelpTarget = null;
      this._pendingFundamentalsHelpTarget = null;
      this._fundamentalsHelpShowTimer = null;
      this._fundamentalsHelpTooltipEl = null;
      this._fundamentalsHelpBound = false;
      this._bindFundamentalsHelpTooltip();
    },
    _ensureFundamentalsHelpTooltipEl: function () {
      if (this._fundamentalsHelpTooltipEl && this._fundamentalsHelpTooltipEl.parentNode) return this._fundamentalsHelpTooltipEl;
      var tip = document.createElement('div');
      tip.className = 'fundamentals-help-tooltip';
      tip.setAttribute('role', 'tooltip');
      tip.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tip);
      this._fundamentalsHelpTooltipEl = tip;
      return tip;
    },
    _positionFundamentalsHelpTooltip: function (target) {
      var tip = this._fundamentalsHelpTooltipEl;
      if (!tip || !target || !target.getBoundingClientRect) return;
      var rect = target.getBoundingClientRect();
      var tipRect = tip.getBoundingClientRect();
      var margin = 8;
      var top = rect.top - tipRect.height - 10;
      if (top < margin) top = rect.bottom + 10;
      if ((top + tipRect.height) > (window.innerHeight - margin)) {
        top = Math.max(margin, window.innerHeight - tipRect.height - margin);
      }
      var left = rect.right - tipRect.width;
      if (left < margin) left = margin;
      if ((left + tipRect.width) > (window.innerWidth - margin)) {
        left = Math.max(margin, window.innerWidth - tipRect.width - margin);
      }
      tip.style.top = Math.round(top) + 'px';
      tip.style.left = Math.round(left) + 'px';
    },
    _clearFundamentalsHelpPending: function () {
      if (this._fundamentalsHelpShowTimer) {
        clearTimeout(this._fundamentalsHelpShowTimer);
        this._fundamentalsHelpShowTimer = null;
      }
      this._pendingFundamentalsHelpTarget = null;
    },
    _scheduleFundamentalsHelpTooltip: function (target) {
      if (!target) return;
      if (this._activeFundamentalsHelpTarget === target) return;
      this._clearFundamentalsHelpPending();
      this._pendingFundamentalsHelpTarget = target;
      var self = this;
      this._fundamentalsHelpShowTimer = setTimeout(function () {
        self._fundamentalsHelpShowTimer = null;
        if (self._pendingFundamentalsHelpTarget !== target) return;
        self._pendingFundamentalsHelpTarget = null;
        self._showFundamentalsHelpTooltip(target);
      }, 500);
    },
    _showFundamentalsHelpTooltip: function (target) {
      if (!target) return;
      var text = String(target.getAttribute('data-tooltip') || '').trim();
      if (!text) return;
      var tip = this._ensureFundamentalsHelpTooltipEl();
      tip.textContent = text;
      tip.classList.add('is-visible');
      tip.setAttribute('aria-hidden', 'false');
      this._activeFundamentalsHelpTarget = target;
      this._positionFundamentalsHelpTooltip(target);
    },
    _hideFundamentalsHelpTooltip: function () {
      this._clearFundamentalsHelpPending();
      var tip = this._fundamentalsHelpTooltipEl;
      if (tip) {
        tip.classList.remove('is-visible');
        tip.setAttribute('aria-hidden', 'true');
      }
      this._activeFundamentalsHelpTarget = null;
    },
    _bindFundamentalsHelpTooltip: function () {
      if (this._fundamentalsHelpBound || !this.el || !this.el.fundamentalsGrid) return;
      var self = this;
      var root = this.el.fundamentalsGrid;
      function findHelp(node) {
        return node && node.closest ? node.closest('.fundamentals-metric__help') : null;
      }
      root.addEventListener('mouseover', function (event) {
        var target = findHelp(event.target);
        if (!target) return;
        self._scheduleFundamentalsHelpTooltip(target);
      });
      root.addEventListener('mouseout', function (event) {
        var target = findHelp(event.target);
        if (!target) return;
        var next = event.relatedTarget;
        if (next && (target.contains(next) || findHelp(next) === target)) return;
        self._hideFundamentalsHelpTooltip();
      });
      root.addEventListener('focusin', function (event) {
        var target = findHelp(event.target);
        if (!target) return;
        self._scheduleFundamentalsHelpTooltip(target);
      });
      root.addEventListener('focusout', function (event) {
        var target = findHelp(event.target);
        if (!target) return;
        var next = event.relatedTarget;
        if (next && (target.contains(next) || findHelp(next) === target)) return;
        self._hideFundamentalsHelpTooltip();
      });
      window.addEventListener('resize', function () {
        if (self._activeFundamentalsHelpTarget) {
          self._positionFundamentalsHelpTooltip(self._activeFundamentalsHelpTarget);
        }
      });
      window.addEventListener('scroll', function () {
        if (self._activeFundamentalsHelpTarget) self._hideFundamentalsHelpTooltip();
      }, true);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) self._hideFundamentalsHelpTooltip();
      });
      this._fundamentalsHelpBound = true;
    },
    fmtCurrency: fmtCurrency,
    fmtNumber: fmtNumber,
    pctText: pctText,
    pctClass: pctClass,
    setTheme: function (theme) {
      document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
      if (this.el.themeToggle) {
        var isLight = theme === 'light';
        this.el.themeToggle.innerHTML = iconMarkup(isLight ? 'sun' : 'moon');
        this.el.themeToggle.title = isLight ? 'Switch to dark theme' : 'Switch to light theme';
        this.el.themeToggle.setAttribute('aria-label', isLight ? 'Light theme' : 'Dark theme');
      }
    },
    setLayoutMode: function (mode) {
      var isWide = mode === 'wide';
      document.documentElement.setAttribute('data-layout', isWide ? 'wide' : 'narrow');
      if (this.el.layoutToggle) {
        this.el.layoutToggle.innerHTML = iconMarkup(isWide ? 'layoutWide' : 'layoutNarrow');
        this.el.layoutToggle.title = isWide ? 'Wide layout' : 'Narrow layout';
        this.el.layoutToggle.setAttribute('aria-label', isWide ? 'Wide layout' : 'Narrow layout');
      }
    },
    setHoldingsPrivacy: function (hidden) {
      if (!this.el.holdingsPrivacyToggle) return;
      this.el.holdingsPrivacyToggle.innerHTML = iconMarkup(hidden ? 'eyeOff' : 'eye');
      this.el.holdingsPrivacyToggle.title = hidden ? 'Show quantities and values' : 'Hide quantities and dollar values';
      this.el.holdingsPrivacyToggle.setAttribute('aria-label', hidden ? 'Show holdings' : 'Hide holdings');
    },
    setStocksAutoRefreshToggle: function (enabled, mode) {
      if (!this.el.stocksAutoRefreshToggle) return;
      this.el.stocksAutoRefreshToggle.textContent = 'Auto refresh (10 min): ' + (enabled ? 'On' : 'Off');
      this.el.stocksAutoRefreshToggle.classList.toggle('hidden', mode === 'crypto');
      this.el.stocksAutoRefreshToggle.classList.toggle('btn--primary', !!enabled);
      this.el.stocksAutoRefreshToggle.classList.toggle('btn--ghost', !enabled);
      this.el.stocksAutoRefreshToggle.title = enabled
        ? 'Stocks auto refresh is ON (every 10 minutes)'
        : 'Stocks auto refresh is OFF';
      this.el.stocksAutoRefreshToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    },
    setCryptoAutoRefreshToggle: function (enabled, mode) {
      if (!this.el.cryptoAutoRefreshToggle) return;
      this.el.cryptoAutoRefreshToggle.textContent = 'Auto refresh (10 min): ' + (enabled ? 'On' : 'Off');
      this.el.cryptoAutoRefreshToggle.classList.toggle('hidden', mode === 'stocks');
      this.el.cryptoAutoRefreshToggle.classList.toggle('btn--primary', !!enabled);
      this.el.cryptoAutoRefreshToggle.classList.toggle('btn--ghost', !enabled);
      this.el.cryptoAutoRefreshToggle.title = enabled
        ? 'Crypto auto refresh is ON (every 10 minutes)'
        : 'Crypto auto refresh is OFF';
      this.el.cryptoAutoRefreshToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    },
    setCryptoParticlesToggle: function (enabled, mode) {
      if (!this.el.cryptoParticlesToggle) return;
      this.el.cryptoParticlesToggle.classList.toggle('hidden', false);
      this.el.cryptoParticlesToggle.innerHTML = enabled
        ? '<span aria-hidden="true">●</span> Particles On'
        : '<span aria-hidden="true">○</span> Particles Off';
      this.el.cryptoParticlesToggle.classList.toggle('btn--primary', !!enabled);
      this.el.cryptoParticlesToggle.classList.toggle('btn--ghost', !enabled);
      this.el.cryptoParticlesToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      this.el.cryptoParticlesToggle.title = enabled
        ? ('Background particles are enabled for ' + mode)
        : ('Background particles are disabled for ' + mode);
      if (this.el.cryptoParticlesCanvas) {
        this.el.cryptoParticlesCanvas.classList.toggle('hidden', !enabled);
      }
    },
    setTwelveDataToggle: function (enabled) {
      if (!this.el.twelveDataToggle) return;
      this.el.twelveDataToggle.innerHTML = (enabled ? '<span aria-hidden="true">●</span> 12D On' : '<span aria-hidden="true">○</span> 12D Off');
      this.el.twelveDataToggle.classList.toggle('btn--primary', !!enabled);
      this.el.twelveDataToggle.classList.toggle('btn--ghost', !enabled);
      this.el.twelveDataToggle.title = enabled
        ? 'TwelveData fallback is enabled (used after free sources fail)'
        : 'TwelveData fallback is disabled (free sources only)';
      this.el.twelveDataToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    },
    setDemoModeToggle: function (enabled) {
      if (!this.el.demoModeToggle) return;
      this.el.demoModeToggle.innerHTML = iconMarkup('demo');
      this.el.demoModeToggle.classList.toggle('btn--primary', !!enabled);
      this.el.demoModeToggle.classList.toggle('btn--ghost', !enabled);
      this.el.demoModeToggle.title = enabled
        ? 'Demo portfolio is active'
        : 'Switch to demo holdings ($1,000 per position)';
      this.el.demoModeToggle.setAttribute('aria-label', enabled ? 'Demo mode on' : 'Demo mode off');
      this.el.demoModeToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    },
    setApiDebugToggle: function (enabled) {
      if (!this.el.apiDebugToggle) return;
      this.el.apiDebugToggle.innerHTML = iconMarkup('bug');
      this.el.apiDebugToggle.classList.toggle('btn--primary', !!enabled);
      this.el.apiDebugToggle.classList.toggle('btn--ghost', !enabled);
      this.el.apiDebugToggle.title = enabled
        ? 'API debug panel is visible'
        : 'Show API debug panel';
      this.el.apiDebugToggle.setAttribute('aria-label', enabled ? 'API debug on' : 'API debug off');
      this.el.apiDebugToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    },
    setApiDebugPanelVisible: function (enabled) {
      if (!this.el.apiDebugPanel) return;
      this.el.apiDebugPanel.classList.toggle('hidden', !enabled);
      this.el.apiDebugPanel.setAttribute('aria-hidden', enabled ? 'false' : 'true');
    },
    setModeTabs: function (mode) {
      var isStocks = mode === 'stocks';
      this.el.stocksTab.classList.toggle('is-active', isStocks);
      this.el.cryptoTab.classList.toggle('is-active', !isStocks);
      this.el.stocksTab.setAttribute('aria-selected', String(isStocks));
      this.el.cryptoTab.setAttribute('aria-selected', String(!isStocks));
      this.el.heroCard.classList.toggle('theme-stocks', isStocks);
      this.el.heroCard.classList.toggle('theme-crypto', !isStocks);
      this.el.overviewTitle.textContent = isStocks ? 'Stocks Portfolio' : 'Crypto Portfolio';
      this.el.overviewSubtitle.textContent = isStocks ?
        'Live portfolio tracking with quotes, news, earnings, and charts.' :
        'Live portfolio tracking with pricing, news, dominance, and charts.';
      if (this.el.btcDominancePanel) {
        this.el.btcDominancePanel.classList.toggle('hidden', isStocks);
      }
      if (this.el.stocksAutoRefreshToggle) {
        this.el.stocksAutoRefreshToggle.classList.toggle('hidden', !isStocks);
      }
      if (this.el.cryptoAutoRefreshToggle) {
        this.el.cryptoAutoRefreshToggle.classList.toggle('hidden', isStocks);
      }
      if (this.el.eventsBlockTitle) {
        this.el.eventsBlockTitle.textContent = isStocks ? 'Earnings' : 'Events';
      }
    },
    setStatus: function (text) {
      if (this.el.statusBadge) this.el.statusBadge.textContent = text;
    },
    setNewsSourceValue: function (value) {
      if (!this.el.newsSourceSelect) return;
      this.el.newsSourceSelect.value = value || 'auto';
    },
    setSortValue: function (value) {
      if (!this.el.sortSelect) return;
      this.el.sortSelect.value = value || 'az';
    },
    setNewsScopeToggle: function (mode, scope, hasSelectedStock) {
      if (!this.el.newsScopeToggle || !this.el.newsScopeGeneralBtn || !this.el.newsScopeSelectedBtn) return;
      var isStocks = mode === 'stocks';
      this.el.newsScopeToggle.classList.toggle('hidden', !isStocks);
      if (!isStocks) return;
      var useSelected = scope === 'selected';
      this.el.newsScopeGeneralBtn.classList.toggle('btn--primary', !useSelected);
      this.el.newsScopeGeneralBtn.classList.toggle('btn--ghost', useSelected);
      this.el.newsScopeSelectedBtn.classList.toggle('btn--primary', useSelected);
      this.el.newsScopeSelectedBtn.classList.toggle('btn--ghost', !useSelected);
      this.el.newsScopeGeneralBtn.setAttribute('aria-pressed', useSelected ? 'false' : 'true');
      this.el.newsScopeSelectedBtn.setAttribute('aria-pressed', useSelected ? 'true' : 'false');
      this.el.newsScopeSelectedBtn.disabled = !hasSelectedStock;
      this.el.newsScopeSelectedBtn.title = hasSelectedStock ? 'Show news for selected stock' : 'Select a stock first';
    },
    setConnectionModeBadge: function () {
      if (!this.el.connectionModeBadge) return;
      var cfg = window.PT_CONFIG || {};
      var isProxy = !!cfg.useLocalProxy;
      this.el.connectionModeBadge.textContent = isProxy ? 'Local Proxy' : 'Direct';
      this.el.connectionModeBadge.title = isProxy
        ? 'Using proxy: ' + (cfg.proxyBase || (location.protocol === 'file:' ? 'http://localhost:5500' : location.origin))
        : 'Using direct browser API requests';
    },
    renderPortfolio: function (ctx) {
      var self = this;
      var listEl = this.el.portfolioList;
      listEl.innerHTML = '';
      this.el.holdingsCount.textContent = ctx.items.length + ' asset' + (ctx.items.length === 1 ? '' : 's');

      if (!ctx.items.length) {
        listEl.innerHTML = '<div class="empty-state">No assets yet. Add a ' + (ctx.mode === 'stocks' ? 'stock' : 'crypto asset') + ' to begin.</div>';
        return;
      }

      ctx.items.forEach(function (item) {
        var node = self.el.assetRowTemplate.content.firstElementChild.cloneNode(true);
        node.dataset.key = item.key;
        var rowEl = node.querySelector('.asset-row');
        var symbolEl = node.querySelector('.asset-row__symbol');
        var nameEl = node.querySelector('.asset-row__name');
        if (rowEl) {
          rowEl.dataset.key = item.key;
          if (ctx.selectedKey === item.key) rowEl.classList.add('is-selected');
        }
        if (symbolEl) {
          symbolEl.textContent = item.symbol;
          symbolEl.title = item.name || item.symbol || '';
        }
        if (nameEl) {
          nameEl.textContent = '';
        }
        var valueEl = node.querySelector('.asset-row__value');
        if (ctx.hideHoldings) {
          valueEl.textContent = 'Hidden';
          valueEl.title = '';
        } else {
          valueEl.textContent = fmtCurrency(item.marketValue);
          valueEl.title = (isFinite(Number(item.quantity)) && isFinite(Number(item.entryPrice)))
            ? (Number(item.quantity) + ' @ ' + fmtAssetUnitPrice(Number(item.entryPrice), item.type))
            : '';
        }
        var quoteStatusEls = node.querySelectorAll('.asset-row__quote-status');
        if (quoteStatusEls && quoteStatusEls.length) {
          var statusCls = item.quoteFetchedAt ? (item.quoteIsFresh ? 'quote-time--fresh' : 'quote-time--stale') : 'quote-time--missing';
          var statusTitle = item.quoteFetchedAt
            ? ('Last quote: ' + new Date(item.quoteFetchedAt).toLocaleString())
            : 'No live quote fetched yet';
          var statusHtml =
            '<span class="quote-status-icon ' + statusCls + '" title="' + esc(statusTitle) + '" aria-label="' + esc(statusTitle) + '">' +
              '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">' +
                '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
                '<path d="M15.9 7.1h3.4v3.4M19.3 10.5A7.3 7.3 0 0 0 8 6.3M8.1 16.9H4.7v-3.4M4.7 13.5A7.3 7.3 0 0 0 16 17.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
              '</svg>' +
            '</span>';
          quoteStatusEls.forEach(function (quoteStatusEl) {
            quoteStatusEl.innerHTML = statusHtml;
          });
        }
        var dayMoveEl = node.querySelector('.asset-row__daymove');
        if (dayMoveEl) {
          var dayPct = isFinite(Number(item.dayChangePct)) ? Number(item.dayChangePct) : null;
          var dayUsd = isFinite(Number(item.dayPlAmount)) ? Number(item.dayPlAmount) : null;
          var dayCls = dayPct == null ? 'pl--flat' : pctClass(dayPct);
          var arrow = dayPct == null ? '•' : (dayPct > 0 ? '▲' : (dayPct < 0 ? '▼' : '•'));
          var dayPctText = dayPct == null ? '—' : pctText(dayPct);
          var dayUsdText = (dayPct == null || dayUsd == null) ? '—' : signedCurrencyText(dayUsd);
          dayMoveEl.className = 'asset-row__daymove ' + dayCls;
          dayMoveEl.innerHTML =
            '<span class="asset-row__daymove-arrow" aria-hidden="true">' + arrow + '</span>' +
            '<span class="asset-row__daymove-label">Day</span>' +
            '<strong class="asset-row__daymove-value">' +
            '<span class="asset-row__daymove-pct">' + esc(dayPctText) + '</span>' +
            '<span class="asset-row__daymove-usd">' + esc(dayUsdText) + '</span>' +
            '</strong>';
        }
        var plEl = node.querySelector('.asset-row__pl');
        plEl.className = 'asset-row__pl ' + pctClass(item.plPct);
        var plPriceText = fmtAssetUnitPrice(item.price, item.type);
        var plChangeText = ctx.hideHoldings
          ? ('P/L ' + pctText(item.plPct))
          : (fmtCurrency(item.plAmount) + ' (' + pctText(item.plPct) + ')');
        var plText = ctx.hideHoldings
          ? plChangeText
          : (plPriceText + ' ' + plChangeText);
        plEl.innerHTML = ctx.hideHoldings
          ? ('<span class="asset-row__pl-change">' + esc(plChangeText) + '</span>')
          : (
            '<span class="asset-row__pl-price">' + esc(plPriceText) + '</span>' +
            '<span class="asset-row__pl-sep" aria-hidden="true">|</span>' +
            '<span class="asset-row__pl-change">' + esc(plChangeText) + '</span>'
          );
        plEl.title = isFinite(Number(item.entryPrice))
          ? ('Avg entry: ' + fmtAssetUnitPrice(Number(item.entryPrice), item.type))
          : plText;
        listEl.appendChild(node);
      });
    },
    renderTotals: function (totals, hideHoldings) {
      this.el.totalValue.textContent = hideHoldings ? 'Hidden' : fmtCurrency(totals.value);
      var pct = totals.cost ? (totals.pl / totals.cost) * 100 : 0;
      this.el.totalPL.textContent = hideHoldings ? pctText(pct) : (fmtCurrency(totals.pl) + ' (' + pctText(pct) + ')');
      this.el.totalPL.className = 'stat-pill__value ' + pctClass(pct);
      if (this.el.totalDailyPL) {
        var dailyPct = totals.dailyPrev ? (totals.dailyPl / totals.dailyPrev) * 100 : 0;
        this.el.totalDailyPL.textContent = hideHoldings
          ? pctText(dailyPct)
          : (fmtCurrency(totals.dailyPl) + ' (' + pctText(dailyPct) + ')');
        this.el.totalDailyPL.className = 'stat-pill__value ' + pctClass(dailyPct);
      }
    },
    renderAllocationLegend: function (items, colors, hideHoldings) {
      var total = items.reduce(function (acc, item) { return acc + (Number(item.marketValue) || 0); }, 0);
      var html = items.map(function (item, i) {
        var pct = total > 0 ? (item.marketValue / total) * 100 : 0;
        return '<div class="legend-item" data-allocation-index="' + i + '" tabindex="0" role="button" aria-label="Highlight ' + esc(item.symbol) + ' in chart">' +
          '<span class="legend-item__dot" style="background:' + colors[i % colors.length] + '"></span>' +
          '<span>' + esc(item.symbol) + ' • ' + pct.toFixed(1) + '%</span>' +
          '<strong>' + (hideHoldings ? 'Hidden' : fmtCurrency(item.marketValue)) + '</strong>' +
          '</div>';
      }).join('');
      this.el.allocationLegend.innerHTML = html || '<div class="muted">No allocation data</div>';
    },
    renderDetailHeader: function (asset, computed, hideHoldings, quote) {
      if (!asset) {
        this.el.detailTitle.textContent = 'Select an asset';
        if (this.el.detailPriceBadge) {
          this.el.detailPriceBadge.classList.add('hidden');
          this.el.detailPriceBadge.innerHTML = '';
        }
        this.el.detailMeta.innerHTML = '<span class="meta-chip">Pick a holding to view chart, market data, news, socials, links, and earnings/events.</span>';
        this.el.externalLink.href = '#';
        this.el.externalLink.textContent = 'Open Source Link';
        return;
      }
      this.el.detailTitle.textContent = asset.name + ' (' + asset.symbol + ')';
      if (this.el.detailPriceBadge) {
        var price = computed && isFinite(Number(computed.price)) ? Number(computed.price) : null;
        if (asset.type === 'stock' && quote && isFinite(Number(quote.regularMarketPrice))) {
          price = Number(quote.regularMarketPrice);
        }
        var changePct = null;
        var prevClose = quote && isFinite(Number(quote.regularMarketPreviousClose)) ? Number(quote.regularMarketPreviousClose) : null;
        if (prevClose == null && quote && isFinite(Number(quote.previous_close))) prevClose = Number(quote.previous_close);
        if (quote && isFinite(Number(quote.changePercent))) {
          changePct = Number(quote.changePercent);
        } else if (quote && isFinite(Number(quote.percent_change))) {
          changePct = Number(quote.percent_change);
        } else if (quote && isFinite(Number(quote.change)) && price != null) {
          var derivedPrev = price - Number(quote.change);
          if (derivedPrev) changePct = (Number(quote.change) / derivedPrev) * 100;
        } else if (asset.type === 'crypto' && quote && isFinite(Number(quote.change24h))) {
          changePct = Number(quote.change24h);
        } else if (price != null && prevClose != null && prevClose !== 0) {
          changePct = ((price - prevClose) / prevClose) * 100;
        }
        var cls = pctClass(changePct || 0);
        if (price != null) {
          this.el.detailPriceBadge.classList.remove('hidden');
          this.el.detailPriceBadge.innerHTML =
            '<span class="detail-price-badge__price">' + fmtAssetUnitPrice(price, asset.type) + '</span>' +
            '<span class="detail-price-badge__change ' + cls + '">' + (changePct == null ? '—' : pctText(changePct)) + '</span>';
        } else {
          this.el.detailPriceBadge.classList.add('hidden');
          this.el.detailPriceBadge.innerHTML = '';
        }
      }
      this.el.detailMeta.innerHTML = hideHoldings
        ? [
          '<span class="meta-chip">Holdings hidden</span>',
          '<span class="meta-chip ' + pctClass(computed.plPct) + '">P/L %: ' + pctText(computed.plPct) + '</span>'
        ].join('')
        : [
          '<span class="meta-chip">Qty: ' + fmtNumber(asset.quantity) + '</span>',
          '<span class="meta-chip">Entry: ' + fmtAssetUnitPrice(asset.entryPrice, asset.type) + '</span>',
          '<span class="meta-chip">Value: ' + fmtCurrency(computed.marketValue) + '</span>',
          '<span class="meta-chip ' + pctClass(computed.plPct) + '">P/L: ' + fmtCurrency(computed.plAmount) + ' (' + pctText(computed.plPct) + ')</span>'
        ].join('');
    },
    renderExternalLink: function (asset) {
      if (!asset) {
        this.el.externalLink.href = '#';
        return;
      }
      if (asset.type === 'stock') {
        this.el.externalLink.href = 'https://www.tradingview.com/symbols/' + encodeURIComponent(asset.symbol) + '/';
        this.el.externalLink.textContent = 'Open TradingView';
      } else {
        this.el.externalLink.href = 'https://www.coingecko.com/en/coins/' + encodeURIComponent(asset.coinId || '');
        this.el.externalLink.textContent = 'Open CoinGecko';
      }
    },
    renderMarketData: function (data, asset, errorMsg) {
      if (!asset) {
        this.el.marketDataGrid.innerHTML = '<div class="muted">No asset selected.</div>';
        return;
      }
      if (errorMsg && !data) {
        this.el.marketDataGrid.innerHTML = '<div class="muted">' + esc(errorMsg) + '</div>';
        return;
      }
      var entries = [];
      if (asset.type === 'stock') {
        var fetchedAtText = (data && isFinite(Number(data.fetchedAt)))
          ? new Date(Number(data.fetchedAt)).toLocaleString()
          : 'n/a';
        var sourceStamp = (((data && data.date) || '') + ' ' + ((data && data.time) || '')).trim();
        var sessionClass = (data && data.marketIsOpen) ? 'market-status--open' : 'market-status--closed';
        var countdownClass = 'market-status--closed';
        if (data && data.marketIsOpen) {
          countdownClass = 'market-status--open';
        } else if (data && isFinite(Number(data.marketCountdownMs)) && Number(data.marketCountdownMs) <= 1000 * 60 * 60) {
          countdownClass = 'market-status--warn';
        }
        entries = [
          ['Market', (data && data.market) || asset.market || 'NASDAQ'],
          ['Session', (data && data.marketSessionLabel) || 'n/a', sessionClass],
          ['Countdown', (data && data.marketCountdownLabel) || 'n/a', countdownClass],
          ['Price', fmtCurrency(data && data.price)],
          ['Open', fmtCurrency(data && data.open)],
          ['High', fmtCurrency(data && data.high)],
          ['Low', fmtCurrency(data && data.low)],
          ['Volume', fmtCompactNumber(data && data.volume)],
          ['Last fetched', fetchedAtText],
          ['Source stamp', sourceStamp || 'n/a']
        ];
        if (data && isFinite(Number(data.preMarketPrice))) {
          entries.splice(4, 0,
            ['Pre-Mkt', fmtCurrency(data.preMarketPrice)],
            ['Pre-Mkt %', isFinite(Number(data.preMarketChangePercent)) ? pctText(Number(data.preMarketChangePercent)) : 'n/a']
          );
        }
      } else {
        entries = [
          ['Price', fmtAssetUnitPrice(data && data.price, 'crypto')],
          ['24h %', (data && isFinite(Number(data.change24h)) ? pctText(Number(data.change24h)) : 'n/a')],
          ['Mkt Cap', fmtCompactCurrency(data && data.marketCap)],
          ['24h Vol', fmtCompactCurrency(data && data.volume24h)],
          ['Coin ID', asset.coinId || 'n/a'],
          ['Source', 'CoinGecko']
        ];
      }
      function slugLabel(text) {
        return String(text || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }
      this.el.marketDataGrid.innerHTML = entries.map(function (pair) {
        var valueClass = pair[2] ? (' ' + pair[2]) : '';
        var labelClass = slugLabel(pair[0]);
        return '<div class="mini-card mini-card--' + esc(labelClass) + '"><span>' + esc(pair[0]) + '</span><strong class="' + valueClass.trim() + '">' + esc(pair[1]) + '</strong></div>';
      }).join('');
    },
    renderFundamentals: function (payload, asset, fallbackMsg) {
      if (!this.el.fundamentalsPanel || !this.el.fundamentalsGrid) return;
      if (!asset) {
        if (this.el.fundamentalsAssetLabel) this.el.fundamentalsAssetLabel.textContent = 'No asset selected';
        if (this.el.fundamentalsTitle) this.el.fundamentalsTitle.textContent = 'Fundamentals';
        if (this.el.fundamentalsOverallPill) {
          this.el.fundamentalsOverallPill.className = 'indicator-pill indicator-pill--neutral';
          this.el.fundamentalsOverallPill.textContent = 'n/a';
        }
        if (this.el.fundamentalsMeta) this.el.fundamentalsMeta.textContent = fallbackMsg || 'Select an asset to load fundamentals.';
        if (this.el.fundamentalsSummary) this.el.fundamentalsSummary.innerHTML = '';
        this.el.fundamentalsGrid.innerHTML = '';
        if (this.el.fundamentalsReasons) this.el.fundamentalsReasons.innerHTML = '';
        return;
      }
      if (this.el.fundamentalsAssetLabel) this.el.fundamentalsAssetLabel.textContent = asset.symbol || asset.name || 'Selected asset';

      function overallClass(label) {
        var tone = overallTone(label);
        return 'indicator-pill indicator-pill--' + tone;
      }

      function overallTone(label) {
        var v = String(label || '').toLowerCase();
        if (v.indexOf('low dilution') >= 0) return 'bullish';
        if (v.indexOf('moderate dilution') >= 0 || v.indexOf('unknown dilution') >= 0) return 'neutral';
        if (v.indexOf('high dilution') >= 0) return 'bearish';
        if (v.indexOf('strong') >= 0 || v === 'healthy' || v.indexOf('bullish') >= 0 || v === 'cheap') return 'bullish';
        if (v.indexOf('weak') >= 0 || v.indexOf('risk') >= 0 || v.indexOf('bearish') >= 0) return 'bearish';
        if (v.indexOf('expensive') >= 0) return 'bearish';
        return 'neutral';
      }

      function chipClass(status) {
        var v = String(status || '').toLowerCase();
        if (v === 'bullish' || v === 'healthy' || v === 'cheap' || v === 'strong') return 'fundamentals-chip fundamentals-chip--bullish';
        if (v === 'risk' || v === 'weak' || v === 'expensive' || v === 'bearish') return 'fundamentals-chip fundamentals-chip--bearish';
        return 'fundamentals-chip fundamentals-chip--neutral';
      }

      function daysUntilDateOnly(dateOnly) {
        var raw = String(dateOnly || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
        var parts = raw.split('-');
        var y = Number(parts[0]);
        var m = Number(parts[1]);
        var d = Number(parts[2]);
        if (!isFinite(y) || !isFinite(m) || !isFinite(d)) return null;
        var target = new Date(y, m - 1, d);
        var now = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var diffMs = target.getTime() - today.getTime();
        if (!isFinite(diffMs)) return null;
        return Math.round(diffMs / (1000 * 60 * 60 * 24));
      }

      function metricExplanation(metric) {
        var byId = {
          'revenue-growth-yoy': 'Revenue Growth YoY: Percentage change in company revenue compared to the same period last year. Higher growth usually indicates expanding demand and business momentum.',
          'eps-growth-yoy': 'EPS Growth YoY: Year-over-year growth in earnings per share. Rising EPS suggests improving profitability and shareholder value.',
          'margin': 'Operating Margin: Percentage of revenue left after operating expenses. Higher margins mean the company runs its core business more efficiently.',
          'free-cash-flow': 'Free Cash Flow: Cash remaining after operating expenses and capital investments. Positive FCF means the company generates real cash it can use for growth, debt reduction, or shareholder returns.',
          'debt-equity': 'Debt / Equity: Compares company debt to shareholder equity. Lower values usually indicate lower financial risk and a stronger balance sheet.',
          'roe': 'ROE: Profit generated for each dollar of shareholder equity. Higher ROE generally means the company uses investor capital efficiently.',
          'piotroski': 'Piotroski Score: A 0-9 score measuring financial strength using profitability, leverage, and operating efficiency signals. Scores of 7 or higher typically indicate strong fundamentals.',
          'altman-z': 'Altman Z-Score: Measures bankruptcy risk using profitability, leverage, liquidity, and activity ratios. Scores above 3 suggest a financially healthy company.',
          'pe': 'P/E: Stock price divided by earnings per share. Lower values may indicate cheaper valuation, while higher values can reflect growth expectations.',
          'ps': 'P/S: Company valuation relative to its revenue. Lower values suggest a cheaper valuation compared to sales.',
          'ev-ebitda': 'EV/EBITDA: Compares total company value to operating earnings before non-cash expenses. Lower ratios generally indicate a more attractive valuation.',
          'price-to-fcf': 'P/FCF: Stock price relative to free cash flow per share. Lower values suggest investors are paying less for the company\'s cash generation.'
        };
        var id = String(metric && metric.id || '').trim().toLowerCase();
        var text = byId[id] || String(metric && metric.hint || '').trim();
        if (!text) {
          var label = String(metric && metric.label || 'Metric').trim();
          text = label + ': Core fundamentals metric used in the FA panel.';
        }
        return text;
      }

      var panel = payload && payload.panel ? payload.panel : null;
      if (!panel) {
        var emptyMessage = String(
          (payload && (payload.errorDetail || payload.error || payload.detail || payload.note)) ||
          fallbackMsg ||
          'No fundamentals snapshot yet.'
        ).trim();
        if (!emptyMessage) emptyMessage = 'No fundamentals snapshot yet.';
        if (this.el.fundamentalsTitle) this.el.fundamentalsTitle.textContent = asset.type === 'crypto' ? 'Token Fundamentals' : 'Fundamentals';
        if (this.el.fundamentalsOverallPill) {
          this.el.fundamentalsOverallPill.className = 'indicator-pill indicator-pill--neutral';
          this.el.fundamentalsOverallPill.textContent = 'n/a';
        }
        if (this.el.fundamentalsMeta) this.el.fundamentalsMeta.textContent = emptyMessage;
        if (this.el.fundamentalsSummary) this.el.fundamentalsSummary.innerHTML = '';
        this.el.fundamentalsGrid.innerHTML = '<div class="muted">' + esc(emptyMessage) + '</div>';
        if (this.el.fundamentalsReasons) this.el.fundamentalsReasons.innerHTML = '';
        return;
      }

      var qualityScore = isFinite(Number(panel.qualityScore)) ? Number(panel.qualityScore) : (isFinite(Number(panel.score)) ? Number(panel.score) : 0);
      var qualityScoreOutOf = isFinite(Number(panel.qualityScoreOutOf)) ? Number(panel.qualityScoreOutOf) : (isFinite(Number(panel.scoreOutOf)) ? Number(panel.scoreOutOf) : null);
      var qualityLabel = String(panel.qualityLabel || panel.label || 'Mixed');
      var valuationLabel = String(panel.valuationLabel || 'n/a');
      var sections = Array.isArray(panel.sections) ? panel.sections : [];
      var valuationSummaryText = String(panel.valuationSummaryText || '').trim();
      var reasons = Array.isArray(panel.reasons) ? panel.reasons : [];
      var reasonGroups = Array.isArray(panel.reasonGroups) ? panel.reasonGroups : [];
      var fetchedAt = Number(payload && payload.fetchedAt || 0) || 0;
      var isStockAsset = !!(asset && asset.type === 'stock');
      var nextEarningsDate = String(panel.nextEarningsDate || '').trim();
      var nextEarningsRelative = String(panel.nextEarningsRelative || '').trim();
      var earningsState = String(panel.earningsState || '').trim();
      var nextEarningsText = nextEarningsDate || 'n/a';
      var nextEarningsDaysAway = daysUntilDateOnly(nextEarningsDate);
      var showEarningsSoonAlert = nextEarningsDaysAway != null && nextEarningsDaysAway >= 0 && nextEarningsDaysAway < 7;
      if (nextEarningsRelative && nextEarningsRelative.toLowerCase() !== nextEarningsText.toLowerCase()) {
        nextEarningsText += ' • ' + nextEarningsRelative;
      }

      if (!valuationSummaryText || valuationSummaryText === valuationLabel) {
        var valuationSection = sections.find(function (section) {
          var sid = String(section && section.id || '').toLowerCase();
          var title = String(section && section.title || '').toLowerCase();
          return sid.indexOf('valuation') >= 0 || title.indexOf('valuation') >= 0;
        }) || null;
        var valuationParts = [];
        if (valuationSection && Array.isArray(valuationSection.metrics)) {
          valuationSection.metrics.forEach(function (metric) {
            var metricLabel = String(metric && metric.label || '').trim();
            var metricStatus = String(metric && metric.status || '').trim();
            if (!metricLabel || !metricStatus) return;
            if (metricStatus.toLowerCase() === 'neutral' || metricStatus.toLowerCase() === 'n/a') return;
            valuationParts.push(metricLabel + ' ' + metricStatus);
          });
        }
        valuationSummaryText = valuationParts.length
          ? (valuationLabel + ' • ' + valuationParts.join(', '))
          : (valuationLabel || 'n/a');
      }

      if (this.el.fundamentalsTitle) {
        this.el.fundamentalsTitle.textContent = panel.title || (asset.type === 'crypto' ? 'Token Fundamentals' : 'Fundamentals');
      }
      if (this.el.fundamentalsOverallPill) {
        this.el.fundamentalsOverallPill.className = overallClass(qualityLabel);
        this.el.fundamentalsOverallPill.textContent = 'Quality: ' + qualityLabel;
      }
      if (this.el.fundamentalsMeta) {
        var meta = panel.note || '';
        if (!meta && fetchedAt > 0) meta = 'Updated ' + new Date(fetchedAt).toLocaleString();
        this.el.fundamentalsMeta.textContent = meta || (fallbackMsg || 'Fundamentals ready.');
      }
        if (this.el.fundamentalsSummary) {
        var qualityScoreText = esc(String(qualityScore) + (qualityScoreOutOf != null ? ('/' + String(qualityScoreOutOf)) : ''));
        var earningsAlertHtml = showEarningsSoonAlert
          ? '<span class="fundamentals-earnings-alert" aria-hidden="true" title="Next earnings is within 7 days">!</span>'
          : '';
        var earningsStatHtml = isStockAsset
          ? ('<div class="fundamentals-summary__stat fundamentals-summary__stat--earnings' + (showEarningsSoonAlert ? ' fundamentals-summary__stat--earnings-soon' : '') + '">' +
              '<div class="fundamentals-summary__stat-label-row"><span>Next Earnings</span>' + earningsAlertHtml + '</div>' +
              '<strong>' + esc(nextEarningsText) + '</strong>' +
              (earningsState ? ('<small>' + esc(earningsState) + '</small>') : '') +
            '</div>')
          : '';
        this.el.fundamentalsSummary.innerHTML =
          '<div class="fundamentals-summary__badges fundamentals-summary__badges--grid">' +
            '<div class="fundamentals-summary__badge fundamentals-summary__badge--' + overallTone(qualityLabel) + '">' +
              '<span class="fundamentals-summary__badge-label">Quality</span>' +
              '<span class="' + overallClass(qualityLabel) + '">' + esc(qualityLabel) + '</span>' +
            '</div>' +
            '<div class="fundamentals-summary__badge fundamentals-summary__badge--' + overallTone(valuationLabel) + '">' +
              '<span class="fundamentals-summary__badge-label">Valuation</span>' +
              '<span class="' + overallClass(valuationLabel) + '">' + esc(valuationLabel) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="fundamentals-summary__stats">' +
            '<div class="fundamentals-summary__stat">' +
              '<span>Quality Score</span>' +
              '<strong>' + qualityScoreText + '</strong>' +
            '</div>' +
            '<div class="fundamentals-summary__stat">' +
              '<span>Valuation Summary</span>' +
              '<strong>' + esc(valuationSummaryText) + '</strong>' +
            '</div>' +
            earningsStatHtml +
          '</div>' +
          '<div class="fundamentals-summary__score">Quality and valuation are scored independently.</div>';
      }

      this.el.fundamentalsGrid.innerHTML = sections.map(function (section) {
        var metrics = Array.isArray(section && section.metrics) ? section.metrics : [];
        return '<section class="fundamentals-section">' +
          '<div class="fundamentals-section__title-row"><span class="fundamentals-section__title">' + esc(section && section.title ? section.title : 'Metrics') + '</span><span class="fundamentals-section__count">' + esc(String(metrics.length)) + ' metrics</span></div>' +
          '<div class="fundamentals-section__grid">' +
            metrics.map(function (metric) {
              var explain = metricExplanation(metric);
              return '<article class="fundamentals-metric">' +
                '<div class="fundamentals-metric__head"><span>' + esc(metric && metric.label ? metric.label : '') + '</span><span class="' + chipClass(metric && metric.status) + '">' + esc(metric && metric.status ? metric.status : 'Neutral') + '</span></div>' +
                '<strong>' + esc(metric && metric.display ? metric.display : 'n/a') + '</strong>' +
                '<span class="fundamentals-metric__help" tabindex="0" role="button" aria-label="What is ' + esc(metric && metric.label ? metric.label : 'this metric') + '?" data-tooltip="' + esc(explain) + '">?</span>' +
              '</article>';
            }).join('') +
          '</div>' +
        '</section>';
      }).join('');

      if (this.el.fundamentalsReasons) {
        if (reasonGroups.length) {
          this.el.fundamentalsReasons.innerHTML = reasonGroups.map(function (group) {
            var items = Array.isArray(group && group.items) ? group.items : [];
            if (!items.length) return '';
            return '<div class="fundamentals-reasons__group">' +
              '<div class="fundamentals-reasons__title">' + esc(group && group.title ? group.title : 'Reasons') + '</div>' +
              '<div class="fundamentals-reasons__list">' + items.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' +
            '</div>';
          }).join('');
        } else {
          this.el.fundamentalsReasons.innerHTML = reasons.length
            ? ('<div class="fundamentals-reasons__title">Why</div><div class="fundamentals-reasons__list">' + reasons.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>')
            : '';
        }
      }
    },
    renderNews: function (items, errorMsg) {
      if (!items || !items.length) {
        this.el.newsList.innerHTML = '<div class="muted">' + esc(errorMsg || 'No news available yet. Try Refresh.') + '</div>';
        return;
      }
      this.el.newsList.innerHTML = '<div class="reactive-tiles">' + items.map(function (item) {
        return '<a class="reactive-tile reactive-tile--news" href="' + esc(item.link || '#') + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="reactive-tile__badge">N</span>' +
          '<span class="reactive-tile__body"><strong>' + esc(item.title) + '</strong><small>' + esc(item.source || 'Source') + (item.published ? ' • ' + esc(item.published) : '') + '</small></span>' +
          '<span class="reactive-tile__arrow">↗</span>' +
          '</a>';
      }).join('') + '</div>';
    },
    renderTwitter: function (payload) {
      if (!payload) {
        this.el.twitterSection.innerHTML = '<div class="muted">No social links.</div>';
        return;
      }
      var links = payload.links && payload.links.length
        ? payload.links
        : [{ label: payload.linkLabel || 'Open Source', href: payload.searchUrl || '#' }];
      var html = '';
      if (payload.message) {
        html += '<div class="muted" style="margin-bottom:0.55rem">' + esc(payload.message) + '</div>';
      }
      html += '<div class="social-tiles">' + links.map(function (lnk) {
        var label = String(lnk.label || 'Open');
        var isNitter = /nitter/i.test(label);
        var isStocktwits = /stocktwits/i.test(label);
        var badge = isNitter ? 'N' : (isStocktwits ? 'S' : '↗');
        var cls = isNitter ? 'social-tile social-tile--nitter' : (isStocktwits ? 'social-tile social-tile--stocktwits' : 'social-tile');
        var shortHref = String(lnk.href || '').replace('https://', '').replace('http://', '');
        return '<a class="' + cls + '" target="_blank" rel="noopener noreferrer" href="' + esc(lnk.href || '#') + '">' +
          '<span class="social-tile__badge">' + esc(badge) + '</span>' +
          '<span class="social-tile__body"><strong>' + esc(label) + '</strong><small>' + esc(shortHref) + '</small></span>' +
          '<span class="social-tile__arrow">↗</span>' +
          '</a>';
      }).join('') + '</div>';
      this.el.twitterSection.innerHTML = html;
    },
    renderEvents: function (items) {
      if (!items || !items.length) {
        this.el.eventsList.innerHTML = '<div class="muted">No events.</div>';
        return;
      }
      this.el.eventsList.innerHTML = items.map(function (item) {
        return '<article class="event-item"><strong>' + esc(item.title) + '</strong><p>' + esc(item.date || '') + ' • ' + esc(item.note || '') + '</p></article>';
      }).join('');
    },
    renderUsefulLinks: function (items) {
      if (!this.el.usefulLinksList) return;
      if (!items || !items.length) {
        this.el.usefulLinksList.innerHTML = '<div class="muted">No links available.</div>';
        return;
      }
      this.el.usefulLinksList.innerHTML = '<div class="reactive-tiles">' + items.map(function (item) {
        var badge = /finviz/i.test(item.label || '') ? 'F' : (/tradingview/i.test(item.label || '') ? 'T' : 'L');
        return '<a class="reactive-tile reactive-tile--link" href="' + esc(item.href || '#') + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="reactive-tile__badge">' + esc(badge) + '</span>' +
          '<span class="reactive-tile__body"><strong>' + esc(item.label || 'Open') + '</strong><small>' + esc(item.note || '') + '</small></span>' +
          '<span class="reactive-tile__arrow">↗</span>' +
          '</a>';
      }).join('') + '</div>';
    },
    renderBtcDominanceMeta: function (currentPct, ethPct, updatedAt) {
      if (!this.el.btcDominanceLabel) return;
      if (!isFinite(Number(currentPct))) {
        this.el.btcDominanceLabel.textContent = 'Global crypto market share';
        if (this.el.btcDominanceValue) this.el.btcDominanceValue.textContent = '--.--%';
        if (this.el.btcDominanceUpdated) this.el.btcDominanceUpdated.textContent = 'Waiting for live data...';
        if (this.el.btcDominanceBar) this.el.btcDominanceBar.style.width = '0%';
        if (this.el.ethDominanceBar) this.el.ethDominanceBar.style.width = '0%';
        if (this.el.othersDominanceBar) this.el.othersDominanceBar.style.width = '0%';
        if (this.el.btcDominanceBarLabel) this.el.btcDominanceBarLabel.textContent = '--.--%';
        if (this.el.ethDominanceBarLabel) this.el.ethDominanceBarLabel.textContent = '--.--%';
        if (this.el.othersDominanceBarLabel) this.el.othersDominanceBarLabel.textContent = '--.--%';
        return;
      }
      var btc = Number(currentPct);
      var eth = isFinite(Number(ethPct)) ? Number(ethPct) : 0;
      var others = Math.max(0, 100 - btc - eth);
      this.el.btcDominanceLabel.textContent = 'Global crypto market cap share';
      if (this.el.btcDominanceValue) this.el.btcDominanceValue.textContent = btc.toFixed(2) + '%';
      if (this.el.btcDominanceUpdated) {
        this.el.btcDominanceUpdated.textContent = updatedAt ? ('Live • ' + String(updatedAt).replace('T', ' ').slice(0, 19) + 'Z') : 'Live';
      }
      if (this.el.btcDominanceBar) this.el.btcDominanceBar.style.width = Math.max(0, Math.min(100, btc)) + '%';
      if (this.el.ethDominanceBar) this.el.ethDominanceBar.style.width = Math.max(0, Math.min(100, eth)) + '%';
      if (this.el.othersDominanceBar) this.el.othersDominanceBar.style.width = Math.max(0, Math.min(100, others)) + '%';
      if (this.el.btcDominanceBarLabel) this.el.btcDominanceBarLabel.textContent = btc.toFixed(2) + '%';
      if (this.el.ethDominanceBarLabel) this.el.ethDominanceBarLabel.textContent = eth.toFixed(2) + '%';
      if (this.el.othersDominanceBarLabel) this.el.othersDominanceBarLabel.textContent = others.toFixed(2) + '%';
    },
    renderIndicatorsPanel: function (config) {
      if (!this.el.indicatorsTimeframes || !this.el.indicatorsMeta || !this.el.indicatorsOverallPill) return;
      var mode = config && config.mode === 'crypto' ? 'crypto' : 'stocks';
      var assetLabel = (config && config.assetLabel) || (mode === 'crypto' ? 'No crypto selected' : 'No stock selected');
      var overall = (config && config.overallStatus) || 'Neutral';
      var metaText = (config && config.metaText) || 'Refresh Prices to load indicator snapshots.';
      var timeframes = (config && config.timeframes) || {};
      var hasRows = false;

      function pillClass(status) {
        var normalized = String(status || 'Neutral').toLowerCase();
        if (normalized === 'bullish') return 'indicator-pill indicator-pill--bullish';
        if (normalized === 'bearish') return 'indicator-pill indicator-pill--bearish';
        return 'indicator-pill indicator-pill--neutral';
      }

      function trendMeta(status) {
        var normalized = String(status || 'Neutral').toLowerCase();
        if (normalized === 'bullish') {
          return {
            cls: 'indicator-trend indicator-trend--bullish',
            label: 'Bullish trend',
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l5.2-5.2 3.6 3.6L20 7.2M14.8 7.2H20v5.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'
          };
        }
        if (normalized === 'bearish') {
          return {
            cls: 'indicator-trend indicator-trend--bearish',
            label: 'Bearish trend',
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l5.2 5.2 3.6-3.6L20 16.8M14.8 16.8H20v-5.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'
          };
        }
        return {
          cls: 'indicator-trend indicator-trend--neutral',
          label: 'Neutral trend',
          icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h13.2M13.2 8.8 20 12l-6.8 3.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        };
      }

      function fmtIndicator(value) {
        var numValue = Number(value);
        if (!isFinite(numValue)) return 'n/a';
        var abs = Math.abs(numValue);
        var digits = abs >= 1000 ? 2 : (abs >= 100 ? 2 : (abs >= 1 ? 3 : 4));
        return numValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
      }

      function techBlock(title, status, metrics, note, noteClass) {
        var list = Array.isArray(metrics) ? metrics : [];
        var count = list.length <= 1 ? 1 : (list.length === 2 ? 2 : 3);
        var meta = note ? ('<span class="indicator-tech__meta' + (noteClass ? (' ' + esc(noteClass)) : '') + '">• ' + esc(note) + '</span>') : '';
        return '<div class="indicator-tech">' +
          '<div class="indicator-tech__head">' +
            '<div class="indicator-tech__title-wrap"><div class="indicator-tech__title">' + esc(title) + '</div>' + meta + '</div>' +
            '<span class="' + pillClass(status) + '">' + esc(status || 'Neutral') + '</span>' +
          '</div>' +
          '<div class="indicator-tech__metrics indicator-tech__metrics--' + count + '">' +
            list.map(function (item) {
              return '<div class="indicator-sr__metric indicator-tech__metric">' +
                '<span>' + esc(item && item.label) + '</span>' +
                '<strong>' + esc(item && item.value) + '</strong>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>';
      }

      function fmtPctMaybe(value) {
        var n = Number(value);
        return isFinite(n) ? pctText(n) : 'n/a';
      }

      function asScore(value) {
        var n = Number(value);
        return isFinite(n) ? n : 0;
      }

      function fmtTiny(value) {
        var n = Number(value);
        if (!isFinite(n)) return 'n/a';
        return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
      }

      function trendLabelFromScore(score) {
        if (score >= 2) return 'Bullish';
        if (score <= -2) return 'Bearish';
        return 'Neutral';
      }

      function trendMeterBlock() {
        var provided = (config && config.trendMeter) || {};
        var hasAny = ['1d', '1w', '1m'].some(function (key) { return !!timeframes[key]; });
        if (!hasAny) return '<div class="muted">No trend meter yet. Refresh Prices.</div>';
        var rows = {};
        var weights = { '1d': 1, '1w': 2, '1m': 3 };
        var weighted = 0;
        ['1d', '1w', '1m'].forEach(function (key) {
          var tf = timeframes[key] || {};
          var trend = tf.trendMeter || {};
          var score = asScore(trend.timeframeScore);
          weighted += score * weights[key];
          rows[key] = {
            score: score,
            label: trend.label || trendLabelFromScore(score),
            breakdown: trend.breakdown || null
          };
        });
        var overallScore = isFinite(Number(provided.overallScore)) ? Number(provided.overallScore) : weighted;
        var overallLabel = provided.overallLabel || (overallScore >= 4 ? 'Bullish' : (overallScore <= -4 ? 'Bearish' : 'Neutral'));
        var rowHtml = ['1d', '1w', '1m'].map(function (key) {
          var row = rows[key];
          var b = row.breakdown || {};
          return '<details class="trend-meter__item">' +
            '<summary>' +
              '<span class="trend-meter__tf">' + esc(String(key).toUpperCase()) + '</span>' +
              '<span class="trend-meter__score">Score ' + esc(String(row.score)) + '</span>' +
              '<span class="' + pillClass(row.label) + '">' + esc(row.label) + '</span>' +
            '</summary>' +
            '<div class="trend-meter__details">' +
              '<span>EMA ' + esc(String(asScore(b.emaScore))) + ' • close ' + esc(fmtTiny(b.close)) + ' • 20 ' + esc(fmtTiny(b.ema20)) + ' • 50 ' + esc(fmtTiny(b.ema50)) + ' • 200 ' + esc(fmtTiny(b.ema200)) + '</span>' +
              '<span>RSI ' + esc(String(asScore(b.rsiScore))) + ' • value ' + esc(fmtTiny(b.rsiValue)) + '</span>' +
              '<span>MACD ' + esc(String(asScore(b.macdScore))) + ' • line ' + esc(fmtTiny(b.macdLine)) + ' • signal ' + esc(fmtTiny(b.macdSignal)) + ' • hist ' + esc(fmtTiny(b.macdHistogram)) + '</span>' +
              '<span>SR ' + esc(String(asScore(b.srScore))) + ' • ' + esc(String(b.srStatus || 'n/a')) + '</span>' +
            '</div>' +
          '</details>';
        }).join('');
        return '<div class="trend-meter__head">' +
          '<div class="trend-meter__title">Trend Meter</div>' +
          '<div class="trend-meter__overall">' +
            '<span class="trend-meter__overall-score">Overall ' + esc(String(overallScore)) + '</span>' +
            '<span class="' + pillClass(overallLabel) + '">' + esc(overallLabel) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="trend-meter__rows">' + rowHtml + '</div>';
      }

      function srBlock(tf) {
        var values = tf && tf.values && tf.values.sr ? tf.values.sr : {};
        var pivot = values.pivot || {};
        var donchian = values.donchian || {};
        var nearest = values.nearest || {};
        var srStatus = tf && tf.statuses ? tf.statuses.sr : 'Neutral';
        var channelWidthPct = (isFinite(Number(donchian.support)) && isFinite(Number(donchian.resistance)) && isFinite(Number(tf && tf.close)) && Number(tf.close) !== 0)
          ? ((Number(donchian.resistance) - Number(donchian.support)) / Number(tf.close)) * 100
          : NaN;
        var supportClass = isFinite(Number(nearest.supportDistancePct)) && Number(nearest.supportDistancePct) <= 2.5
          ? ' indicator-sr__nearest-card--near'
          : '';
        var resistanceClass = isFinite(Number(nearest.resistanceDistancePct)) && Number(nearest.resistanceDistancePct) <= 2.5
          ? ' indicator-sr__nearest-card--near'
          : '';
        return '<div class="indicator-sr">' +
          '<div class="indicator-sr__head">' +
            '<div class="indicator-sr__title">Support &amp; Resistance</div>' +
            '<span class="' + pillClass(srStatus) + '">' + esc(srStatus || 'Neutral') + '</span>' +
          '</div>' +
          '<div class="indicator-sr__nearest">' +
            '<article class="indicator-sr__nearest-card indicator-sr__nearest-card--support' + supportClass + '">' +
              '<span class="indicator-sr__kicker">Nearest Support</span>' +
              '<strong>' + esc(fmtIndicator(nearest.support)) + '</strong>' +
              '<small>' + esc(fmtPctMaybe(nearest.supportDistancePct)) + '</small>' +
            '</article>' +
            '<article class="indicator-sr__nearest-card indicator-sr__nearest-card--resistance' + resistanceClass + '">' +
              '<span class="indicator-sr__kicker">Nearest Resistance</span>' +
              '<strong>' + esc(fmtIndicator(nearest.resistance)) + '</strong>' +
              '<small>' + esc(fmtPctMaybe(nearest.resistanceDistancePct)) + '</small>' +
            '</article>' +
          '</div>' +
          '<div class="indicator-sr__pivot-grid">' +
            '<div class="indicator-sr__metric indicator-sr__metric--s2"><span>S2</span><strong>' + esc(fmtIndicator(pivot.s2)) + '</strong></div>' +
            '<div class="indicator-sr__metric indicator-sr__metric--s1"><span>S1</span><strong>' + esc(fmtIndicator(pivot.s1)) + '</strong></div>' +
            '<div class="indicator-sr__metric indicator-sr__metric--p"><span>P</span><strong>' + esc(fmtIndicator(pivot.p)) + '</strong></div>' +
            '<div class="indicator-sr__metric indicator-sr__metric--r1"><span>R1</span><strong>' + esc(fmtIndicator(pivot.r1)) + '</strong></div>' +
            '<div class="indicator-sr__metric indicator-sr__metric--r2"><span>R2</span><strong>' + esc(fmtIndicator(pivot.r2)) + '</strong></div>' +
          '</div>' +
          '<div class="indicator-sr__donchian">' +
            '<div class="indicator-sr__donchian-head">' +
              '<span>Donchian Channel</span>' +
              '<small>Width ' + esc(fmtPctMaybe(channelWidthPct)) + '</small>' +
            '</div>' +
            '<div class="indicator-sr__donchian-grid">' +
              '<div class="indicator-sr__metric indicator-sr__metric--support"><span>Support</span><strong>' + esc(fmtIndicator(donchian.support)) + '</strong></div>' +
              '<div class="indicator-sr__metric"><span>Mid</span><strong>' + esc(fmtIndicator(donchian.midpoint)) + '</strong></div>' +
              '<div class="indicator-sr__metric indicator-sr__metric--resistance"><span>Resistance</span><strong>' + esc(fmtIndicator(donchian.resistance)) + '</strong></div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }

      function reversalBlock(tf) {
        var reversal = tf && tf.reversal ? tf.reversal : {};
        var score = asScore(reversal.score);
        var label = reversal.label || 'No reversal signal';
        var reasons = Array.isArray(reversal.reasons) ? reversal.reasons : [];
        var hint = reasons.length ? reasons.join(' • ') : 'No qualifying reversal conditions.';
        return '<div class="indicator-tech indicator-tech--reversal">' +
          '<div class="indicator-tech__head">' +
            '<div class="indicator-tech__title-wrap">' +
              '<div class="indicator-tech__title">Reversal</div>' +
              '<span class="indicator-tech__meta">• ' + esc(label) + '</span>' +
            '</div>' +
            '<span class="indicator-reversal__badge">' + esc(String(score)) + '/5</span>' +
          '</div>' +
          '<div class="indicator-tech__metrics indicator-tech__metrics--2">' +
            '<div class="indicator-sr__metric indicator-tech__metric"><span>Score</span><strong>' + esc(String(score)) + '/5</strong></div>' +
            '<div class="indicator-sr__metric indicator-tech__metric"><span>Reasons</span><strong>' + esc(String(reasons.length)) + '</strong></div>' +
          '</div>' +
          '<div class="indicator-tech__note indicator-reversal__reasons">' + esc(hint) + '</div>' +
        '</div>';
      }

      function emaPositionBlock(tf) {
        var ep = (tf && tf.emaPosition) || (tf && tf.values && tf.values.emaPosition) || {};
        var label = String(ep.label || 'Neutral');
        var relation = String(ep.relation || '');
        var toneClass = 'indicator-ema-position__badge--neutral';
        if (label === 'Strong Bullish') toneClass = 'indicator-ema-position__badge--bullish';
        else if (label === 'Pullback') toneClass = 'indicator-ema-position__badge--pullback';
        else if (label === 'Trend Test') toneClass = 'indicator-ema-position__badge--test';
        else if (label === 'Bearish Risk') toneClass = 'indicator-ema-position__badge--bearish';
        return '<div class="indicator-tech indicator-tech--ema-position">' +
          '<div class="indicator-tech__head">' +
            '<div class="indicator-tech__title-wrap"><div class="indicator-tech__title">EMA Position</div>' + (relation ? '<span class="indicator-tech__meta">• ' + esc(relation) + '</span>' : '') + '</div>' +
            '<span class="indicator-ema-position__badge ' + toneClass + '">' + esc(label) + '</span>' +
          '</div>' +
          '<div class="indicator-tech__metrics indicator-tech__metrics--3 indicator-ema-position__values">' +
            '<div class="indicator-sr__metric indicator-tech__metric"><span>Close</span><strong>' + esc(fmtIndicator(ep.close)) + '</strong></div>' +
            '<div class="indicator-sr__metric indicator-tech__metric"><span>EMA20</span><strong>' + esc(fmtIndicator(ep.ema20)) + '</strong></div>' +
            '<div class="indicator-sr__metric indicator-tech__metric"><span>EMA50</span><strong>' + esc(fmtIndicator(ep.ema50)) + '</strong></div>' +
          '</div>' +
          (relation ? '<div class="indicator-tech__note indicator-ema-position__relation">' + esc(relation) + '</div>' : '') +
        '</div>';
      }

      if (this.el.indicatorsAssetLabel) {
        this.el.indicatorsAssetLabel.textContent = assetLabel;
      }
      this.el.indicatorsMeta.textContent = metaText;
      if (this.el.indicatorsTrendMeter) {
        this.el.indicatorsTrendMeter.innerHTML = trendMeterBlock();
      }
      this.el.indicatorsOverallPill.className = pillClass(overall) + ' indicator-pill--overall';
      this.el.indicatorsOverallPill.textContent = overall;

      this.el.indicatorsTimeframes.innerHTML = ['1d', '1w', '1m'].map(function (key) {
        var tf = timeframes[key];
        if (!tf) return '';
        hasRows = true;
        var values = tf.values || {};
        var statuses = tf.statuses || {};
        var trend = trendMeta(tf.overall);
        var closeValue = Number(tf.close);
        var ema20Value = Number(values.ema20);
        var ema50Value = Number(values.ema50);
        var emaSignal = '▽ Below EMA20';
        var emaSignalClass = 'indicator-tech__note--neutral';
        if (isFinite(closeValue) && isFinite(ema20Value) && isFinite(ema50Value)) {
          if (closeValue > ema20Value) {
            emaSignal = '▲ Strong above EMA20';
            emaSignalClass = 'indicator-tech__note--up';
          } else if (closeValue < ema50Value) {
            emaSignal = '▽ Closed below EMA50';
            emaSignalClass = 'indicator-tech__note--down';
          } else {
            emaSignal = '▽ Below EMA20';
            emaSignalClass = 'indicator-tech__note--neutral';
          }
        }
        return '<section class="indicator-card">' +
          '<div class="indicator-card__head"><h4>' + esc(String(key).toUpperCase()) + '</h4><span class="' + esc(trend.cls) + '" title="' + esc(trend.label) + '" aria-label="' + esc(trend.label) + '">' + trend.icon + '</span><span class="' + pillClass(tf.overall) + '">' + esc(tf.overall || 'Neutral') + '</span></div>' +
          '<div class="indicator-card__rows">' +
            techBlock('EMA Trend', statuses.ema, [
              { label: 'EMA20', value: fmtIndicator(values.ema20) },
              { label: 'EMA50', value: fmtIndicator(values.ema50) },
              { label: 'Close', value: fmtIndicator(tf.close) }
            ], emaSignal, emaSignalClass) +
            techBlock('RSI 14', statuses.rsi, [
              { label: 'RSI', value: fmtIndicator(values.rsi14) },
              { label: 'Period', value: '14' }
            ], 'Wilder smoothing') +
            techBlock('MACD', statuses.macd, [
              { label: 'Line', value: fmtIndicator(values.macdLine) },
              { label: 'Signal', value: fmtIndicator(values.macdSignal) },
              { label: 'Hist', value: fmtIndicator(values.macdHistogram) }
            ]) +
            techBlock('Bollinger', statuses.bollinger, [
              { label: 'Mid', value: fmtIndicator(values.bbMiddle) },
              { label: 'Upper', value: fmtIndicator(values.bbUpper) },
              { label: 'Lower', value: fmtIndicator(values.bbLower) }
            ], String(values.bollingerPosition || 'n/a')) +
            emaPositionBlock(tf) +
            srBlock(tf) +
            reversalBlock(tf) +
          '</div>' +
          '<div class="indicator-note">Score: ' + esc(String(isFinite(Number(tf.score)) ? Number(tf.score) : 0)) + '</div>' +
        '</section>';
      }).join('');

      if (!hasRows) {
        this.el.indicatorsTimeframes.innerHTML = '<section class="indicator-card"><div class="muted">No indicator snapshot yet. Use Refresh Prices.</div></section>';
      }
    },
    openModal: function (config) {
      this.el.modal.classList.remove('hidden');
      this.el.modal.setAttribute('aria-hidden', 'false');
      qs('modalTitle').textContent = config && config.editing ? 'Edit Asset' : 'Add Asset';
      this.el.assetTypeInput.value = (config && config.asset && config.asset.type) || (config && config.defaultType) || 'stock';
      this.el.assetSearchInput.value = config && config.asset ? config.asset.symbol + ' - ' + config.asset.name : '';
      this.el.assetSelectedId.value = config && config.asset ? (config.asset.type === 'crypto' ? (config.asset.coinId || '') : (config.asset.stooqSymbol || config.asset.symbol)) : '';
      this.el.quantityInput.value = config && config.asset ? String(config.asset.quantity) : '';
      this.el.entryPriceInput.value = config && config.asset ? String(config.asset.entryPrice) : '';
      this.hideAutocomplete();
      this.el.assetSearchInput.focus();
      this.el.assetSearchInput.select();
    },
    closeModal: function () {
      this.el.modal.classList.add('hidden');
      this.el.modal.setAttribute('aria-hidden', 'true');
      this.hideAutocomplete();
      this.el.assetForm.reset();
      this.el.assetSelectedId.value = '';
    },
    openPositionModal: function (config) {
      var action = (config && config.action) || 'add';
      var asset = config && config.asset;
      var defaultPrice = config && config.defaultPrice;
      this.el.positionModal.classList.remove('hidden');
      this.el.positionModal.setAttribute('aria-hidden', 'false');
      this.el.positionModalTitle.textContent = action === 'add'
        ? 'Add to Position'
        : (action === 'reduce' ? 'Reduce Position' : 'Remove Holding');
      this.el.positionSummary.textContent = asset
        ? (asset.symbol + ' • Current Qty: ' + fmtNumber(asset.quantity) + ' • Avg Entry: ' + fmtAssetUnitPrice(asset.entryPrice, asset.type))
        : '';
      this.el.positionQtyInput.value = '';
      this.el.positionQtyInput.max = action === 'add' ? '' : String(asset && asset.quantity ? asset.quantity : '');
      this.el.positionQtyInput.required = action !== 'remove';
      var qtyGroup = this.el.positionQtyInput ? this.el.positionQtyInput.closest('.field-group') : null;
      if (qtyGroup) qtyGroup.classList.toggle('hidden', action === 'remove');
      this.el.positionPriceInput.value = (action === 'add' && defaultPrice != null && isFinite(Number(defaultPrice))) ? String(defaultPrice) : '';
      this.el.positionPriceInput.required = action === 'add';
      this.el.positionPriceGroup.classList.toggle('hidden', action !== 'add');
      this.el.positionNote.textContent = action === 'add'
        ? 'Weighted average entry price will be recalculated automatically.'
        : (action === 'reduce'
          ? 'Reducing keeps the remaining position average entry price unchanged.'
          : 'This will remove the entire holding from your portfolio.');
      this.el.positionSubmitBtn.textContent = action === 'add'
        ? 'Add'
        : (action === 'reduce' ? 'Reduce' : 'Remove');
      this.el.positionSubmitBtn.classList.toggle('btn--danger', action === 'remove');
      this.el.positionSubmitBtn.classList.toggle('btn--primary', action !== 'remove');
      this.el.positionQtyInput.focus();
      this.el.positionQtyInput.select();
    },
    closePositionModal: function () {
      this.el.positionModal.classList.add('hidden');
      this.el.positionModal.setAttribute('aria-hidden', 'true');
      if (this.el.positionForm) this.el.positionForm.reset();
      var qtyGroup = this.el.positionQtyInput ? this.el.positionQtyInput.closest('.field-group') : null;
      if (qtyGroup) qtyGroup.classList.remove('hidden');
      if (this.el.positionQtyInput) this.el.positionQtyInput.required = true;
      if (this.el.positionPriceGroup) this.el.positionPriceGroup.classList.remove('hidden');
      if (this.el.positionSubmitBtn) {
        this.el.positionSubmitBtn.classList.remove('btn--danger');
        this.el.positionSubmitBtn.classList.add('btn--primary');
      }
    },
    renderApiSourcesConfig: function (config) {
      if (!this.el.apiSourcesContent) return;
      var categories = (config && config.categories) || [];
      var autoRefresh = (config && config.autoRefresh) || {};

      function intervalFields(modeKey, label, values) {
        var intervalSec = Math.max(15, Number(values && values.intervalSec || 600) || 600);
        var mins = Math.floor(intervalSec / 60);
        var secs = intervalSec % 60;
        return '<div class="api-auto-row">' +
          '<div class="api-auto-row__meta"><strong>' + esc(label) + '</strong><small>Refresh ' + esc(label.toLowerCase()) + ' prices automatically</small></div>' +
          '<label class="api-toggle">' +
            '<input type="checkbox" data-api-auto-toggle="' + esc(modeKey) + '"' + ((values && values.enabled) ? ' checked' : '') + ' />' +
            '<span>Enabled</span>' +
          '</label>' +
          '<div class="api-auto-row__inputs">' +
            '<label><span>Min</span><input type="number" min="0" step="1" data-api-auto-min="' + esc(modeKey) + '" value="' + esc(String(mins)) + '" /></label>' +
            '<label><span>Sec</span><input type="number" min="0" max="59" step="1" data-api-auto-sec="' + esc(modeKey) + '" value="' + esc(String(secs)) + '" /></label>' +
          '</div>' +
        '</div>';
      }

      var html = '<section class="api-config-section">' +
        '<div class="api-config-section__head"><div><h4>Auto Updates</h4><p>Move refresh timing here instead of the toolbar toggle buttons.</p></div></div>' +
        '<div class="api-auto-grid">' +
          intervalFields('stocks', 'Stocks', autoRefresh.stocks || {}) +
          intervalFields('crypto', 'Crypto', autoRefresh.crypto || {}) +
        '</div>' +
      '</section>';

      categories.forEach(function (category) {
        html += '<section class="api-config-section">' +
          '<div class="api-config-section__head"><div><h4>' + esc(category.label) + '</h4><p>' + esc(category.note || '') + '</p></div></div>' +
          '<div class="api-source-list" data-api-category="' + esc(category.id) + '">';
        (category.items || []).forEach(function (item) {
          html += '<div class="api-source-card" draggable="true" data-api-drag="1" data-api-category="' + esc(category.id) + '" data-api-source="' + esc(item.id) + '">' +
            '<div class="api-source-card__handle" aria-hidden="true">drag</div>' +
            '<div class="api-source-card__body">' +
              '<div class="api-source-card__title"><strong>' + esc(item.label) + '</strong>' + (item.requiresKey ? '<span class="api-source-badge api-source-badge--key">API Key</span>' : '') + '</div>' +
              '<div class="api-source-card__meta">' + esc(item.assetScope || '') + '</div>' +
            '</div>' +
            '<label class="api-toggle">' +
              '<input type="checkbox" data-api-source-toggle="1" data-api-category="' + esc(category.id) + '" data-api-source="' + esc(item.id) + '"' + (item.enabled ? ' checked' : '') + ' />' +
              '<span>' + (item.enabled ? 'On' : 'Off') + '</span>' +
            '</label>' +
          '</div>';
        });
        html += '</div></section>';
      });

      html += '<div class="modal__actions"><button type="button" id="apiSourcesDoneBtn" class="btn btn--primary">Done</button></div>';
      this.el.apiSourcesContent.innerHTML = html;
    },
    openApiSourcesModal: function (config) {
      if (!this.el.apiSourcesModal) return;
      this.el.apiSourcesModal.classList.remove('hidden');
      this.el.apiSourcesModal.setAttribute('aria-hidden', 'false');
      try {
        this.renderApiSourcesConfig(config || {});
      } catch (err) {
        if (this.el.apiSourcesContent) {
          this.el.apiSourcesContent.innerHTML = '<section class="api-config-section">' +
            '<div class="api-config-section__head"><div><h4>Unable to render API source settings</h4><p>' +
            esc((err && err.message) || 'Unknown error') +
            '</p></div></div>' +
            '<div class="modal__actions"><button type="button" id="apiSourcesDoneBtn" class="btn btn--primary">Close</button></div>' +
          '</section>';
        }
      }
    },
    closeApiSourcesModal: function () {
      if (!this.el.apiSourcesModal) return;
      this.el.apiSourcesModal.classList.add('hidden');
      this.el.apiSourcesModal.setAttribute('aria-hidden', 'true');
    },
    renderAutocomplete: function (items) {
      if (!items || !items.length) {
        this.hideAutocomplete();
        return;
      }
      this.el.autocompleteList.innerHTML = items.map(function (item, index) {
        return '<div class="autocomplete__item">' +
          '<button type="button" data-idx="' + index + '"><strong>' + esc(item.symbol) + '</strong> - ' + esc(item.name) + '<br><small>' + esc(item.type === 'crypto' ? item.id : item.stooq) + '</small></button>' +
          '</div>';
      }).join('');
      this.el.autocompleteList.classList.remove('hidden');
    },
    renderAutocompleteMessage: function (message) {
      this.el.autocompleteList.innerHTML = '<div class="autocomplete__item"><small>' + esc(message) + '</small></div>';
      this.el.autocompleteList.classList.remove('hidden');
    },
    hideAutocomplete: function () {
      this.el.autocompleteList.classList.add('hidden');
      this.el.autocompleteList.innerHTML = '';
    }
  };
})();
