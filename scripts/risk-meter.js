// Provides pure risk-scoring helpers for stock and crypto risk meter snapshots.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }
  var target = root || (typeof window !== 'undefined' ? window : globalThis);
  var PT = (target.PT = target.PT || {});
  PT.RiskEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var RISK_VERSION = 1;

  function toNumber(value) {
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function average(values) {
    var list = Array.isArray(values) ? values : [];
    var sum = 0;
    var count = 0;
    for (var i = 0; i < list.length; i++) {
      var n = toNumber(list[i]);
      if (n == null) continue;
      sum += n;
      count += 1;
    }
    if (!count) return null;
    return sum / count;
  }

  function weightedAverage(entries) {
    var list = Array.isArray(entries) ? entries : [];
    var sum = 0;
    var weightSum = 0;
    for (var i = 0; i < list.length; i++) {
      var item = list[i] || {};
      var value = toNumber(item.value);
      var weight = Math.max(0, Number(item.weight) || 0);
      if (value == null || weight <= 0) continue;
      sum += value * weight;
      weightSum += weight;
    }
    if (!weightSum) return null;
    return sum / weightSum;
  }

  function scaleRisk(value, low, high) {
    var v = toNumber(value);
    var lo = toNumber(low);
    var hi = toNumber(high);
    if (v == null || lo == null || hi == null || hi <= lo) return null;
    if (v <= lo) return 0;
    if (v >= hi) return 100;
    return ((v - lo) / (hi - lo)) * 100;
  }

  function inverseScaleRisk(value, low, high) {
    var scaled = scaleRisk(value, low, high);
    if (scaled == null) return null;
    return 100 - scaled;
  }

  function dateOnly(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    var ts = new Date(raw).getTime();
    if (!isFinite(ts)) return '';
    var d = new Date(ts);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function daysDiff(today, target) {
    var left = dateOnly(today);
    var right = dateOnly(target);
    if (!left || !right) return null;
    var l = new Date(left + 'T00:00:00Z').getTime();
    var r = new Date(right + 'T00:00:00Z').getTime();
    if (!isFinite(l) || !isFinite(r)) return null;
    return Math.round((r - l) / 86400000);
  }

  function candlesClose(candles) {
    return (Array.isArray(candles) ? candles : []).map(function (row) { return toNumber(row && row.c); }).filter(function (n) { return n != null && n > 0; });
  }

  function computeAnnualizedVolatility(candles, options) {
    var opts = options || {};
    var lookback = Math.max(10, Number(opts.lookback) || 90);
    var periodsPerYear = Math.max(1, Number(opts.periodsPerYear) || 252);
    var closes = candlesClose(candles);
    if (closes.length < 3) return null;
    var window = closes.slice(Math.max(0, closes.length - (lookback + 1)));
    if (window.length < 3) return null;
    var returns = [];
    for (var i = 1; i < window.length; i++) {
      if (window[i - 1] <= 0 || window[i] <= 0) continue;
      returns.push(Math.log(window[i] / window[i - 1]));
    }
    if (returns.length < 2) return null;
    var mean = average(returns);
    if (mean == null) return null;
    var varSum = 0;
    for (i = 0; i < returns.length; i++) {
      var diff = returns[i] - mean;
      varSum += diff * diff;
    }
    var variance = varSum / returns.length;
    var dailyVol = Math.sqrt(Math.max(variance, 0));
    return dailyVol * Math.sqrt(periodsPerYear);
  }

  function computeMaxDrawdown(candles, lookback) {
    var windowSize = Math.max(2, Number(lookback) || 252);
    var closes = candlesClose(candles);
    if (closes.length < 2) return null;
    var window = closes.slice(Math.max(0, closes.length - windowSize));
    if (window.length < 2) return null;
    var peak = window[0];
    var maxDd = 0;
    for (var i = 1; i < window.length; i++) {
      var c = window[i];
      if (c > peak) peak = c;
      if (peak > 0) {
        var dd = (peak - c) / peak;
        if (dd > maxDd) maxDd = dd;
      }
    }
    return clamp(maxDd, 0, 1);
  }

  function computeATRPercent(candles, period) {
    var p = Math.max(2, Number(period) || 14);
    var list = Array.isArray(candles) ? candles : [];
    if (list.length <= p + 1) return null;
    var trs = [];
    for (var i = 1; i < list.length; i++) {
      var high = toNumber(list[i] && list[i].h);
      var low = toNumber(list[i] && list[i].l);
      var prevClose = toNumber(list[i - 1] && list[i - 1].c);
      if (high == null || low == null || prevClose == null || prevClose <= 0) continue;
      var tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      if (isFinite(tr)) trs.push(tr);
    }
    if (trs.length < p) return null;
    var atr = average(trs.slice(0, p));
    if (atr == null) return null;
    for (i = p; i < trs.length; i++) {
      atr = ((atr * (p - 1)) + trs[i]) / p;
    }
    var latestClose = toNumber(list[list.length - 1] && list[list.length - 1].c);
    if (latestClose == null || latestClose <= 0) return null;
    return atr / latestClose;
  }

  function computeAvgDollarVolume(candles, period) {
    var p = Math.max(1, Number(period) || 20);
    var list = Array.isArray(candles) ? candles : [];
    if (!list.length) return null;
    var window = list.slice(Math.max(0, list.length - p));
    var values = window.map(function (row) {
      var close = toNumber(row && row.c);
      var vol = toNumber(row && row.v);
      if (close == null || vol == null || close <= 0 || vol < 0) return null;
      return close * vol;
    });
    return average(values);
  }

  function computeGapRisk(candles, period) {
    var p = Math.max(1, Number(period) || 20);
    var list = Array.isArray(candles) ? candles : [];
    if (list.length < 2) return null;
    var start = Math.max(1, list.length - p);
    var gaps = [];
    for (var i = start; i < list.length; i++) {
      var open = toNumber(list[i] && list[i].o);
      var prevClose = toNumber(list[i - 1] && list[i - 1].c);
      if (open == null || prevClose == null || prevClose <= 0) continue;
      gaps.push(Math.abs(open - prevClose) / prevClose);
    }
    return average(gaps);
  }

  function stockGrowthRiskPct(value) {
    var v = toNumber(value);
    if (v == null) return null;
    if (v > 10) return 20;
    if (v > 0) return 45;
    if (v > -10) return 70;
    return 85;
  }

  function computeStockFundamentalRisk(data) {
    var input = data && typeof data === 'object' ? data : {};
    var scoreParts = [];
    var reasons = [];

    var altman = toNumber(input.altmanZScore);
    if (altman != null) {
      if (altman > 3) scoreParts.push(15);
      else if (altman >= 1.8) {
        scoreParts.push(55);
        reasons.push('Altman Z in caution zone');
      } else {
        scoreParts.push(90);
        reasons.push('Low Altman Z score');
      }
    }

    var debt = toNumber(input.debtToEquity);
    if (debt != null) {
      if (debt < 1) scoreParts.push(20);
      else if (debt <= 2) {
        scoreParts.push(55);
        reasons.push('Debt/Equity is elevated');
      } else {
        scoreParts.push(85);
        reasons.push('High leverage');
      }
    }

    var fcf = toNumber(input.freeCashFlow);
    if (fcf != null) {
      if (fcf > 0) scoreParts.push(25);
      else {
        scoreParts.push(80);
        reasons.push('Negative free cash flow');
      }
    }

    var growthScores = [];
    var revenueGrowth = stockGrowthRiskPct(input.revenueGrowthYoY);
    var epsGrowth = stockGrowthRiskPct(input.epsGrowthYoY);
    if (revenueGrowth != null) growthScores.push(revenueGrowth);
    if (epsGrowth != null) growthScores.push(epsGrowth);
    var growthRisk = average(growthScores);
    if (growthRisk != null) {
      scoreParts.push(growthRisk);
      if (growthRisk >= 70) reasons.push('Weak growth trend');
    }

    return {
      score: average(scoreParts),
      reasons: reasons,
      availableMetrics: scoreParts.length
    };
  }

  function computeStockEventRegimeRisk(indicators, nextEarningsDate, today) {
    var input = indicators && typeof indicators === 'object' ? indicators : {};
    var trendLabel = String(input.trendLabel || '').toLowerCase();
    var adx = toNumber(input.adx14);
    var regimeRisk = 55;
    var reasons = [];

    if (trendLabel.indexOf('bull') >= 0) {
      regimeRisk = (adx != null && adx > 25) ? 20 : 35;
    } else if (trendLabel.indexOf('bear') >= 0) {
      regimeRisk = (adx != null && adx > 25) ? 85 : 75;
      reasons.push('Bearish regime');
    }

    var days = daysDiff(today || new Date().toISOString().slice(0, 10), nextEarningsDate);
    var earningsRisk = null;
    if (days != null) {
      if (days >= 0 && days <= 3) {
        earningsRisk = 92;
        reasons.push('Earnings in 0-3 days');
      } else if (days >= 4 && days <= 7) {
        earningsRisk = 72;
        reasons.push('Earnings in 4-7 days');
      } else if (days >= 8 && days <= 14) {
        earningsRisk = 48;
      } else if (days < 0) {
        earningsRisk = 28;
      } else {
        earningsRisk = 15;
      }
    }

    var score = earningsRisk == null
      ? regimeRisk
      : weightedAverage([
        { value: earningsRisk, weight: 0.6 },
        { value: regimeRisk, weight: 0.4 }
      ]);
    return {
      score: score,
      earningsRisk: earningsRisk,
      regimeRisk: regimeRisk,
      reasons: reasons
    };
  }

  function computeCryptoLiquidityRisk(marketData, candles) {
    var input = marketData && typeof marketData === 'object' ? marketData : {};
    var marketCap = toNumber(input.marketCap);
    var volume24h = toNumber(input.volume24h);
    var avgDollarVolume = computeAvgDollarVolume(candles, 20);
    var volumeToMarketCap = (marketCap != null && marketCap > 0 && volume24h != null)
      ? (volume24h / marketCap)
      : null;
    var marketCapScore = inverseScaleRisk(marketCap, 5e7, 2e10);
    var dollarVolumeScore = inverseScaleRisk(avgDollarVolume, 2e6, 2e8);
    var volumeToMcapScore = inverseScaleRisk(volumeToMarketCap, 0.005, 0.08);
    var score = weightedAverage([
      { value: marketCapScore, weight: 0.35 },
      { value: dollarVolumeScore, weight: 0.35 },
      { value: volumeToMcapScore, weight: 0.30 }
    ]);
    var reasons = [];
    if (marketCapScore != null && marketCapScore >= 70) reasons.push('Small market cap');
    if (dollarVolumeScore != null && dollarVolumeScore >= 70) reasons.push('Low dollar volume');
    if (volumeToMcapScore != null && volumeToMcapScore >= 70) reasons.push('Weak volume vs market cap');
    return {
      score: score,
      marketCapScore: marketCapScore,
      dollarVolumeScore: dollarVolumeScore,
      volumeToMcapScore: volumeToMcapScore,
      reasons: reasons,
      avgDollarVolume: avgDollarVolume,
      volumeToMarketCap: volumeToMarketCap
    };
  }

  function computeCryptoTokenRisk(marketData) {
    var input = marketData && typeof marketData === 'object' ? marketData : {};
    var marketCap = toNumber(input.marketCap);
    var fdv = toNumber(input.fdv);
    var circulating = toNumber(input.circulatingSupply);
    var maxSupply = toNumber(input.maxSupply);
    var totalSupply = toNumber(input.totalSupply);
    var supplyCap = maxSupply != null && maxSupply > 0 ? maxSupply : totalSupply;
    var fdvMultiple = (marketCap != null && marketCap > 0 && fdv != null) ? (fdv / marketCap) : null;
    var circulatingRatio = (circulating != null && supplyCap != null && supplyCap > 0) ? (circulating / supplyCap) : null;
    var fdvScore = scaleRisk(fdvMultiple, 1.1, 4.0);
    var supplyScore = inverseScaleRisk(circulatingRatio, 0.25, 0.85);
    var score = weightedAverage([
      { value: fdvScore, weight: 0.6 },
      { value: supplyScore, weight: 0.4 }
    ]);
    var reasons = [];
    if (fdvScore != null && fdvScore >= 70) reasons.push('High FDV dilution risk');
    if (supplyScore != null && supplyScore >= 70) reasons.push('Low circulating supply ratio');
    if (fdvScore == null && supplyScore == null) reasons.push('Limited tokenomics data');
    return {
      score: score,
      fdvMultiple: fdvMultiple,
      circulatingRatio: circulatingRatio,
      fdvScore: fdvScore,
      supplyScore: supplyScore,
      reasons: reasons
    };
  }

  function riskLabel(score) {
    var s = clamp(Math.round(Number(score) || 0), 0, 100);
    if (s <= 24) return 'Low';
    if (s <= 44) return 'Moderate';
    if (s <= 64) return 'Elevated';
    if (s <= 79) return 'High';
    return 'Very High';
  }

  function timeframePeriodsPerYear(assetType, timeframe) {
    var tf = String(timeframe || '1d').toLowerCase();
    var crypto = String(assetType || '').toLowerCase() === 'crypto';
    if (tf === '1w') return 52;
    if (tf === '1m') return 12;
    return crypto ? 365 : 252;
  }

  function stockPriceRisk(candles, timeframe) {
    var vol = computeAnnualizedVolatility(candles, {
      lookback: 90,
      periodsPerYear: timeframePeriodsPerYear('stock', timeframe)
    });
    var dd = computeMaxDrawdown(candles, 252);
    var atrPct = computeATRPercent(candles, 14);
    var volScore = scaleRisk(vol, 0.15, 0.8);
    var ddScore = scaleRisk(dd, 0.10, 0.60);
    var atrScore = scaleRisk(atrPct, 0.02, 0.12);
    return {
      score: weightedAverage([
        { value: volScore, weight: 0.45 },
        { value: ddScore, weight: 0.35 },
        { value: atrScore, weight: 0.20 }
      ]),
      annualizedVol: vol,
      maxDrawdown: dd,
      atrPercent: atrPct,
      volScore: volScore,
      ddScore: ddScore,
      atrScore: atrScore
    };
  }

  function stockLiquidityRisk(candles) {
    var avgDollarVolume = computeAvgDollarVolume(candles, 20);
    var gapRisk = computeGapRisk(candles, 20);
    var dollarVolumeScore = inverseScaleRisk(avgDollarVolume, 2000000, 100000000);
    var gapScore = scaleRisk(gapRisk, 0.005, 0.05);
    return {
      score: weightedAverage([
        { value: dollarVolumeScore, weight: 0.65 },
        { value: gapScore, weight: 0.35 }
      ]),
      avgDollarVolume: avgDollarVolume,
      gapRisk: gapRisk,
      dollarVolumeScore: dollarVolumeScore,
      gapScore: gapScore
    };
  }

  function cryptoPriceRisk(candles, timeframe) {
    var vol = computeAnnualizedVolatility(candles, {
      lookback: 90,
      periodsPerYear: timeframePeriodsPerYear('crypto', timeframe)
    });
    var dd = computeMaxDrawdown(candles, 180);
    var atrPct = computeATRPercent(candles, 14);
    var volScore = scaleRisk(vol, 0.40, 1.80);
    var ddScore = scaleRisk(dd, 0.20, 0.80);
    var atrScore = scaleRisk(atrPct, 0.03, 0.20);
    return {
      score: weightedAverage([
        { value: volScore, weight: 0.45 },
        { value: ddScore, weight: 0.35 },
        { value: atrScore, weight: 0.20 }
      ]),
      annualizedVol: vol,
      maxDrawdown: dd,
      atrPercent: atrPct,
      volScore: volScore,
      ddScore: ddScore,
      atrScore: atrScore
    };
  }

  function computeRiskMeter(assetType, timeframe, inputs) {
    var type = String(assetType || 'stock').toLowerCase() === 'crypto' ? 'crypto' : 'stock';
    var tf = String(timeframe || '1d').toLowerCase();
    var data = inputs && typeof inputs === 'object' ? inputs : {};
    var candles = Array.isArray(data.candles) ? data.candles : [];
    var indicator = data.indicator && typeof data.indicator === 'object' ? data.indicator : {};
    var fundamentals = data.fundamentals && typeof data.fundamentals === 'object' ? data.fundamentals : {};
    var marketData = data.marketData && typeof data.marketData === 'object' ? data.marketData : {};
    var latestCandle = candles.length ? candles[candles.length - 1] : null;
    var latestCandleTime = latestCandle && latestCandle.t ? String(latestCandle.t) : '';
    var nowIso = new Date().toISOString();
    var reasons = [];
    var componentScores = {};
    var finalScore = null;

    if (type === 'stock') {
      var price = stockPriceRisk(candles, tf);
      var liquidity = stockLiquidityRisk(candles);
      var fundamental = computeStockFundamentalRisk(fundamentals);
      var eventRegime = computeStockEventRegimeRisk({
        trendLabel: indicator.trendLabel,
        trendScore: indicator.trendScore,
        adx14: indicator.adx14
      }, fundamentals.nextEarningsDate, data.todayDate || nowIso.slice(0, 10));
      componentScores.priceRisk = price.score;
      componentScores.liquidityRisk = liquidity.score;
      componentScores.fundamentalRisk = fundamental.score;
      componentScores.eventRegimeRisk = eventRegime.score;
      finalScore = weightedAverage([
        { value: price.score, weight: 0.35 },
        { value: liquidity.score, weight: 0.20 },
        { value: fundamental.score, weight: 0.25 },
        { value: eventRegime.score, weight: 0.20 }
      ]);
      if (price.score != null && price.score >= 70) reasons.push('High volatility and drawdown profile');
      if (liquidity.score != null && liquidity.score >= 65) reasons.push('Liquidity/execution risk is elevated');
      reasons = reasons.concat(fundamental.reasons || []).concat(eventRegime.reasons || []);
    } else {
      var cPrice = cryptoPriceRisk(candles, tf);
      var cLiquidity = computeCryptoLiquidityRisk(marketData, candles);
      var token = computeCryptoTokenRisk(marketData);
      var trend = String(indicator.trendLabel || '').toLowerCase();
      var fibStatus = String(indicator.fibStatus || '').toLowerCase();
      var regimeScore = 55;
      if (trend.indexOf('bear') >= 0 || fibStatus.indexOf('failure') >= 0) regimeScore = 82;
      else if (fibStatus.indexOf('deep') >= 0) regimeScore = 70;
      else if (trend.indexOf('bull') >= 0 && fibStatus.indexOf('strong') >= 0) regimeScore = 28;
      else if (trend.indexOf('bull') >= 0) regimeScore = 38;
      var regimeReasons = [];
      if (regimeScore >= 70) regimeReasons.push('Weak market structure regime');

      componentScores.priceRisk = cPrice.score;
      componentScores.liquidityRisk = cLiquidity.score;
      componentScores.tokenRisk = token.score;
      componentScores.regimeRisk = regimeScore;
      finalScore = weightedAverage([
        { value: cPrice.score, weight: 0.45 },
        { value: cLiquidity.score, weight: 0.25 },
        { value: token.score, weight: 0.20 },
        { value: regimeScore, weight: 0.10 }
      ]);
      if (cPrice.score != null && cPrice.score >= 70) reasons.push('High volatility and drawdown');
      reasons = reasons.concat(cLiquidity.reasons || []).concat(token.reasons || []).concat(regimeReasons);
    }

    var score = finalScore == null ? null : clamp(Math.round(finalScore), 0, 100);
    var label = score == null ? 'n/a' : riskLabel(score);
    return {
      score: score,
      label: label,
      components: componentScores,
      reasons: reasons.filter(Boolean).slice(0, 5),
      latestCandleTimeUsed: latestCandleTime || null,
      computedAt: nowIso,
      riskVersion: RISK_VERSION
    };
  }

  return {
    RISK_VERSION: RISK_VERSION,
    scaleRisk: scaleRisk,
    inverseScaleRisk: inverseScaleRisk,
    computeAnnualizedVolatility: computeAnnualizedVolatility,
    computeMaxDrawdown: computeMaxDrawdown,
    computeATRPercent: computeATRPercent,
    computeAvgDollarVolume: computeAvgDollarVolume,
    computeGapRisk: computeGapRisk,
    computeStockFundamentalRisk: computeStockFundamentalRisk,
    computeStockEventRegimeRisk: computeStockEventRegimeRisk,
    computeCryptoLiquidityRisk: computeCryptoLiquidityRisk,
    computeCryptoTokenRisk: computeCryptoTokenRisk,
    computeRiskMeter: computeRiskMeter,
    riskLabel: riskLabel,
    _internals: {
      weightedAverage: weightedAverage,
      daysDiff: daysDiff
    }
  };
});
