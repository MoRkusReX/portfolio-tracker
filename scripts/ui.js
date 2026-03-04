// Owns DOM lookups and pure UI rendering helpers for the portfolio interface.
(function () {
  var PT = (window.PT = window.PT || {});

  function qs(id) { return document.getElementById(id); }

  function fmtCurrency(n) {
    if (!isFinite(Number(n))) return '$0.00';
    return Number(n).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
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
        detailPriceBadge: qs('detailPriceBadge'),
        detailMeta: qs('detailMeta'),
        externalLink: qs('externalLink'),
        marketDataGrid: qs('marketDataGrid'),
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
        indicatorsAssetLabel: qs('indicatorsAssetLabel'),
        indicatorsOverallPill: qs('indicatorsOverallPill'),
        indicatorsMeta: qs('indicatorsMeta'),
        indicatorsTimeframes: qs('indicatorsTimeframes'),
        assetTypeInput: qs('assetTypeInput'),
        assetSearchInput: qs('assetSearchInput'),
        assetSelectedId: qs('assetSelectedId'),
        quantityInput: qs('quantityInput'),
        entryPriceInput: qs('entryPriceInput'),
        autocompleteList: qs('autocompleteList'),
        assetRowTemplate: qs('assetRowTemplate')
      };
    },
    fmtCurrency: fmtCurrency,
    fmtNumber: fmtNumber,
    pctText: pctText,
    pctClass: pctClass,
    setTheme: function (theme) {
      document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
    },
    setLayoutMode: function (mode) {
      var isWide = mode === 'wide';
      document.documentElement.setAttribute('data-layout', isWide ? 'wide' : 'narrow');
      if (this.el.layoutToggle) {
        this.el.layoutToggle.textContent = isWide ? 'Narrow' : 'Wide';
        this.el.layoutToggle.title = isWide ? 'Switch to narrow layout' : 'Switch to wide layout';
      }
    },
    setHoldingsPrivacy: function (hidden) {
      if (!this.el.holdingsPrivacyToggle) return;
      this.el.holdingsPrivacyToggle.textContent = hidden ? 'Show Holdings' : 'Hide Holdings';
      this.el.holdingsPrivacyToggle.title = hidden ? 'Show quantities and values' : 'Hide quantities and dollar values';
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
      var isCrypto = mode === 'crypto';
      this.el.cryptoParticlesToggle.classList.toggle('hidden', !isCrypto);
      this.el.cryptoParticlesToggle.innerHTML = enabled
        ? '<span aria-hidden="true">●</span> Particles On'
        : '<span aria-hidden="true">○</span> Particles Off';
      this.el.cryptoParticlesToggle.classList.toggle('btn--primary', !!enabled);
      this.el.cryptoParticlesToggle.classList.toggle('btn--ghost', !enabled);
      this.el.cryptoParticlesToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      this.el.cryptoParticlesToggle.title = enabled
        ? 'Crypto particles are enabled'
        : 'Crypto particles are disabled';
      if (this.el.cryptoParticlesCanvas) {
        this.el.cryptoParticlesCanvas.classList.toggle('hidden', !isCrypto || !enabled);
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
      this.el.demoModeToggle.innerHTML = enabled
        ? '<span aria-hidden="true">●</span> Demo On'
        : '<span aria-hidden="true">○</span> Demo Off';
      this.el.demoModeToggle.classList.toggle('btn--primary', !!enabled);
      this.el.demoModeToggle.classList.toggle('btn--ghost', !enabled);
      this.el.demoModeToggle.title = enabled
        ? 'Demo portfolio is active'
        : 'Switch to demo holdings ($1,000 per position)';
      this.el.demoModeToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    },
    setApiDebugToggle: function (enabled) {
      if (!this.el.apiDebugToggle) return;
      this.el.apiDebugToggle.innerHTML = enabled
        ? '<span aria-hidden="true">●</span> API Debug On'
        : '<span aria-hidden="true">○</span> API Debug Off';
      this.el.apiDebugToggle.classList.toggle('btn--primary', !!enabled);
      this.el.apiDebugToggle.classList.toggle('btn--ghost', !enabled);
      this.el.apiDebugToggle.title = enabled
        ? 'API debug panel is visible'
        : 'Show API debug panel';
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
        if (rowEl) {
          rowEl.dataset.key = item.key;
          if (ctx.selectedKey === item.key) rowEl.classList.add('is-selected');
        }
        node.querySelector('.asset-row__symbol').textContent = item.symbol;
        if (ctx.hideHoldings) {
          node.querySelector('.asset-row__name').textContent = item.name + ' • Holdings hidden';
          node.querySelector('.asset-row__value').textContent = 'Hidden';
        } else {
          node.querySelector('.asset-row__name').textContent = item.name + ' • ' + fmtNumber(item.quantity) + ' @ ' + fmtCurrency(item.entryPrice);
          node.querySelector('.asset-row__value').textContent = fmtCurrency(item.marketValue);
        }
        var quoteStatusEl = node.querySelector('.asset-row__quote-status');
        if (quoteStatusEl) {
          var statusCls = item.quoteFetchedAt ? (item.quoteIsFresh ? 'quote-time--fresh' : 'quote-time--stale') : 'quote-time--missing';
          var statusText = item.quoteFetchedAt
            ? ('Updated: ' + new Date(item.quoteFetchedAt).toLocaleString())
            : 'Updated: n/a';
          var statusTitle = item.quoteFetchedAt
            ? ('Last quote: ' + new Date(item.quoteFetchedAt).toLocaleString())
            : 'No live quote fetched yet';
          quoteStatusEl.innerHTML = '<span class="' + statusCls + '" title="' + esc(statusTitle) + '">' + esc(statusText) + '</span>';
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
        plEl.textContent = ctx.hideHoldings
          ? ('P/L ' + pctText(item.plPct))
          : ('Px ' + fmtCurrency(item.price) + ' • ' + fmtCurrency(item.plAmount) + ' (' + pctText(item.plPct) + ')');
        listEl.appendChild(node);
      });
    },
    renderTotals: function (totals, hideHoldings) {
      this.el.totalValue.textContent = hideHoldings ? 'Hidden' : fmtCurrency(totals.value);
      var pct = totals.cost ? (totals.pl / totals.cost) * 100 : 0;
      this.el.totalPL.textContent = hideHoldings ? pctText(pct) : (fmtCurrency(totals.pl) + ' (' + pctText(pct) + ')');
      this.el.totalPL.className = pctClass(pct);
      if (this.el.totalDailyPL) {
        var dailyPct = totals.dailyPrev ? (totals.dailyPl / totals.dailyPrev) * 100 : 0;
        this.el.totalDailyPL.textContent = hideHoldings
          ? pctText(dailyPct)
          : (fmtCurrency(totals.dailyPl) + ' (' + pctText(dailyPct) + ')');
        this.el.totalDailyPL.className = pctClass(dailyPct);
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
            '<span class="detail-price-badge__price">' + fmtCurrency(price) + '</span>' +
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
          '<span class="meta-chip">Entry: ' + fmtCurrency(asset.entryPrice) + '</span>',
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
          ['Volume', isFinite(Number(data && data.volume)) ? Number(data.volume).toLocaleString() : 'n/a'],
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
          ['Price', fmtCurrency(data && data.price)],
          ['24h %', (data && isFinite(Number(data.change24h)) ? pctText(Number(data.change24h)) : 'n/a')],
          ['Mkt Cap', fmtCurrency(data && data.marketCap)],
          ['24h Vol', fmtCurrency(data && data.volume24h)],
          ['Coin ID', asset.coinId || 'n/a'],
          ['Source', 'CoinGecko']
        ];
      }
      this.el.marketDataGrid.innerHTML = entries.map(function (pair) {
        var valueClass = pair[2] ? (' ' + pair[2]) : '';
        return '<div class="mini-card"><span>' + esc(pair[0]) + '</span><strong class="' + valueClass.trim() + '">' + esc(pair[1]) + '</strong></div>';
      }).join('');
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
      var assetLabel = (config && config.assetLabel) || (mode === 'crypto' ? 'BTC/USD' : 'TSLA');
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

      function fmtIndicator(value) {
        var numValue = Number(value);
        if (!isFinite(numValue)) return 'n/a';
        var abs = Math.abs(numValue);
        var digits = abs >= 1000 ? 2 : (abs >= 100 ? 2 : (abs >= 1 ? 3 : 4));
        return numValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
      }

      function row(label, primary, secondary, status) {
        return '<div class="indicator-row">' +
          '<div class="indicator-row__label">' + esc(label) + '</div>' +
          '<div class="indicator-row__value"><strong>' + esc(primary) + '</strong>' + (secondary ? '<small>' + esc(secondary) + '</small>' : '') + '</div>' +
          '<span class="' + pillClass(status) + '">' + esc(status || 'Neutral') + '</span>' +
        '</div>';
      }

      if (this.el.indicatorsAssetLabel) {
        this.el.indicatorsAssetLabel.textContent = assetLabel;
      }
      this.el.indicatorsMeta.textContent = metaText;
      this.el.indicatorsOverallPill.className = pillClass(overall);
      this.el.indicatorsOverallPill.textContent = overall;

      this.el.indicatorsTimeframes.innerHTML = ['1d', '1w', '1m'].map(function (key) {
        var tf = timeframes[key];
        if (!tf) return '';
        hasRows = true;
        var values = tf.values || {};
        var statuses = tf.statuses || {};
        return '<section class="indicator-card">' +
          '<div class="indicator-card__head"><h4>' + esc(String(key).toUpperCase()) + '</h4><span class="' + pillClass(tf.overall) + '">' + esc(tf.overall || 'Neutral') + '</span></div>' +
          '<div class="indicator-card__rows">' +
            row('EMA Trend', 'EMA20 ' + fmtIndicator(values.ema20) + ' | EMA50 ' + fmtIndicator(values.ema50), 'Close ' + fmtIndicator(tf.close), statuses.ema) +
            row('RSI 14', fmtIndicator(values.rsi14), 'Wilder smoothing', statuses.rsi) +
            row('MACD', 'Line ' + fmtIndicator(values.macdLine) + ' | Signal ' + fmtIndicator(values.macdSignal), 'Hist ' + fmtIndicator(values.macdHistogram), statuses.macd) +
            row('Bollinger', 'Mid ' + fmtIndicator(values.bbMiddle) + ' | Up ' + fmtIndicator(values.bbUpper), 'Low ' + fmtIndicator(values.bbLower) + ' | ' + String(values.bollingerPosition || 'n/a'), statuses.bollinger) +
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
        ? (asset.symbol + ' • Current Qty: ' + fmtNumber(asset.quantity) + ' • Avg Entry: ' + fmtCurrency(asset.entryPrice))
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
