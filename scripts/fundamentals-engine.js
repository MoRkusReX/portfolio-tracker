// Provides pure scoring and interpretation helpers for stock and crypto fundamentals.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  var exports = factory();
  root.PT = root.PT || {};
  root.PT.FundamentalsEngine = exports;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var STOCK_THRESHOLDS = {
    revenueGrowthPct: 10,
    epsGrowthPct: 10,
    operatingMarginPct: 10,
    grossMarginPct: 25,
    debtToEquityMax: 1,
    roePct: 10,
    piotroskiMin: 7,
    altmanMin: 3,
    peCheapMax: 20,
    peFairMax: 40,
    psCheapMax: 3,
    psFairMax: 10,
    evEbitdaCheapMax: 12,
    evEbitdaFairMax: 25,
    pfcfCheapMax: 15,
    pfcfFairMax: 30
  };

  var CRYPTO_THRESHOLDS = {
    marketCapLiquidityMin: 0.01,
    marketCapMicroMax: 10_000_000,
    marketCapSmallMax: 100_000_000,
    marketCapMidMax: 1_000_000_000,
    fdvCloseRatioMax: 1.5,
    fdvHighRiskRatioMin: 3,
    supplyRatioHealthyMin: 0.6,
    supplyRatioWeakMax: 0.2,
    volumeStrongRatioMin: 0.08,
    volumeWeakRatioMax: 0.005
  };

  // Safely coerces arbitrary input into a finite number.
  function num(value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  // Computes a percentage growth value using prior-period normalization.
  function pctGrowth(current, previous) {
    var now = num(current);
    var prev = num(previous);
    if (now == null || prev == null || prev === 0) return null;
    return ((now - prev) / Math.abs(prev)) * 100;
  }

  // Determines whether a cache entry is still fresh for a given TTL window.
  function isFresh(lastFetchedAt, ttlMs, nowMs) {
    var ts = num(lastFetchedAt);
    var ttl = Math.max(0, Number(ttlMs || 0) || 0);
    var now = num(nowMs) != null ? Number(nowMs) : Date.now();
    if (ts == null || ttl <= 0) return false;
    return (now - ts) <= ttl;
  }

  // Maps a stock quality ratio into a user-facing quality label.
  function mapStockQualityLabel(qualityRatio) {
    var r = num(qualityRatio);
    if (r == null) return 'Mixed';
    if (r >= 0.75) return 'Strong Quality';
    if (r >= 0.55) return 'Healthy';
    if (r >= 0.35) return 'Mixed';
    return 'Weak';
  }

  // Maps valuation average score into Cheap/Fair/Expensive.
  function mapStockValuationLabel(valuationAvg) {
    var avg = num(valuationAvg);
    if (avg == null) return 'n/a';
    if (avg <= -0.5) return 'Cheap';
    if (avg < 0.5) return 'Fair';
    return 'Expensive';
  }

  // Maps the aggregate stock fundamentals score to a user-facing label.
  function mapStockFAScoreToLabel(score) {
    var n = Number(score || 0);
    if (n >= 6) return 'Strong Fundamentals';
    if (n >= 4) return 'Healthy';
    if (n >= 2) return 'Mixed';
    return 'Weak Fundamentals';
  }

  // Maps the aggregate token fundamentals score to a user-facing label.
  function mapCryptoFAScoreToLabel(score) {
    var n = Number(score || 0);
    if (n >= 4) return 'Strong Token Fundamentals';
    if (n >= 2) return 'Healthy';
    if (n >= 1) return 'Mixed';
    return 'Weak Token Fundamentals';
  }

  // Classifies crypto market cap into size band + UI status tone.
  function interpretCryptoMarketCap(marketCap, thresholds) {
    var t = Object.assign({}, CRYPTO_THRESHOLDS, thresholds || {});
    var mcap = num(marketCap);
    if (mcap == null || mcap <= 0) {
      return {
        band: 'Unknown',
        status: 'Neutral',
        reason: 'Market cap unavailable'
      };
    }
    if (mcap < t.marketCapMicroMax) {
      return {
        band: 'Micro cap',
        status: 'Risk',
        reason: 'Very small market cap'
      };
    }
    if (mcap < t.marketCapSmallMax) {
      return {
        band: 'Small cap',
        status: 'Neutral',
        reason: 'Smaller market cap'
      };
    }
    if (mcap < t.marketCapMidMax) {
      return {
        band: 'Mid cap',
        status: 'Healthy',
        reason: 'Established market cap'
      };
    }
    return {
      band: 'Large cap',
      status: 'Bullish',
      reason: 'Large market cap'
    };
  }

  // Classifies a valuation multiple into Cheap/Fair/Expensive with a numeric score.
  function classifyValuationMultiple(value, cheapMax, fairMax, metricLabel) {
    var v = num(value);
    if (v == null || v <= 0) {
      return { label: 'n/a', score: null, reason: metricLabel + ' unavailable' };
    }
    if (v < cheapMax) {
      return { label: 'Cheap', score: -1, reason: metricLabel + ' looks cheap' };
    }
    if (v <= fairMax) {
      return { label: 'Fair', score: 0, reason: metricLabel + ' appears fair' };
    }
    return { label: 'Expensive', score: 1, reason: metricLabel + ' looks expensive' };
  }

  // Computes stock quality score using available-metric normalization.
  function computeStockQualityScore(input, thresholds) {
    var t = Object.assign({}, STOCK_THRESHOLDS, thresholds || {});
    var data = input || {};
    var checks = [];

    function addCheck(id, value, passPredicate, passReason, failReason) {
      var numeric = num(value);
      if (numeric == null) {
        checks.push({ id: id, available: false, passed: null, value: null, reason: id + ' unavailable' });
        return;
      }
      var passed = !!passPredicate(numeric);
      checks.push({
        id: id,
        available: true,
        passed: passed,
        value: numeric,
        reason: passed ? passReason : failReason
      });
    }

    addCheck('revenueGrowth', data.revenueGrowthYoY, function (v) { return v > t.revenueGrowthPct; }, 'Revenue growth > 10%', 'Revenue growth below preferred threshold');
    addCheck('epsGrowth', data.epsGrowthYoY, function (v) { return v > t.epsGrowthPct; }, 'EPS growth > 10%', 'EPS growth below preferred threshold');
    if (num(data.operatingMarginPct) != null) {
      addCheck('operatingMargin', data.operatingMarginPct, function (v) { return v > t.operatingMarginPct; }, 'Operating margin > 10%', 'Operating margin below preferred threshold');
    } else {
      addCheck('grossMargin', data.grossMarginPct, function (v) { return v > t.grossMarginPct; }, 'Gross margin is healthy', 'Gross margin below preferred threshold');
    }
    addCheck('freeCashFlow', data.freeCashFlow, function (v) { return v > 0; }, 'FCF positive', 'FCF is negative');
    addCheck('debtToEquity', data.debtToEquity, function (v) { return v < t.debtToEquityMax; }, 'Low leverage (Debt/Equity < 1)', 'Leverage above preferred range');
    addCheck('roe', data.roePct, function (v) { return v > t.roePct; }, 'ROE > 10%', 'ROE below preferred threshold');
    addCheck('piotroski', data.piotroskiScore, function (v) { return v >= t.piotroskiMin; }, 'Piotroski score is strong', 'Piotroski score is not strong');
    addCheck('altman', data.altmanZScore, function (v) { return v > t.altmanMin; }, 'Altman Z-score > 3', 'Altman Z-score below preferred threshold');

    var availableChecks = checks.filter(function (c) { return c.available; });
    var passedChecks = availableChecks.filter(function (c) { return c.passed; });
    var qualityRatio = availableChecks.length ? (passedChecks.length / availableChecks.length) : null;
    var label = mapStockQualityLabel(qualityRatio);
    var reasons = checks.map(function (c) { return c.reason; }).filter(Boolean);

    var breakdown = {};
    checks.forEach(function (c) {
      breakdown[c.id] = c.available ? (c.passed ? 1 : 0) : null;
    });

    return {
      label: label,
      earnedPoints: passedChecks.length,
      availableMetrics: availableChecks.length,
      ratio: qualityRatio,
      checks: checks,
      reasons: reasons,
      breakdown: breakdown
    };
  }

  // Computes stock valuation summary from available valuation multiples.
  function computeStockValuationScore(input, thresholds) {
    var t = Object.assign({}, STOCK_THRESHOLDS, thresholds || {});
    var data = input || {};
    var metrics = {};

    metrics.pe = Object.assign(
      { value: num(data.pe) },
      classifyValuationMultiple(data.pe, t.peCheapMax, t.peFairMax, 'P/E')
    );
    metrics.ps = Object.assign(
      { value: num(data.ps) },
      classifyValuationMultiple(data.ps, t.psCheapMax, t.psFairMax, 'P/S')
    );
    metrics.evEbitda = Object.assign(
      { value: num(data.evEbitda) },
      classifyValuationMultiple(data.evEbitda, t.evEbitdaCheapMax, t.evEbitdaFairMax, 'EV/EBITDA')
    );
    metrics.priceToFcf = Object.assign(
      { value: num(data.priceToFcf) },
      classifyValuationMultiple(data.priceToFcf, t.pfcfCheapMax, t.pfcfFairMax, 'P/FCF')
    );

    var metricList = Object.keys(metrics).map(function (k) { return Object.assign({ id: k }, metrics[k]); });
    var availableMetrics = metricList.filter(function (m) { return m.score != null; });
    var valuationAvg = availableMetrics.length
      ? availableMetrics.reduce(function (acc, metric) { return acc + metric.score; }, 0) / availableMetrics.length
      : null;
    var label = mapStockValuationLabel(valuationAvg);
    var reasons = metricList.map(function (m) { return m.reason; }).filter(Boolean);

    return {
      label: label,
      avg: valuationAvg,
      availableMetrics: availableMetrics.length,
      metrics: metrics,
      reasons: reasons
    };
  }

  // Interprets valuation multiples into a compact valuation stance.
  function interpretValuation(pe, ps, thresholds) {
    var result = computeStockValuationScore({ pe: pe, ps: ps }, thresholds);
    return {
      label: result.label,
      reasons: result.reasons,
      avg: result.avg,
      metrics: result.metrics
    };
  }

  // Interprets dilution and supply risk from market-cap and supply structure.
  function interpretDilutionRisk(marketCap, fdv, circulatingSupply, maxSupply, thresholds) {
    var t = Object.assign({}, CRYPTO_THRESHOLDS, thresholds || {});
    var mcap = num(marketCap);
    var fdvNum = num(fdv);
    var circ = num(circulatingSupply);
    var max = num(maxSupply);
    var ratio = (mcap != null && mcap > 0 && fdvNum != null && fdvNum > 0) ? (fdvNum / mcap) : null;
    var supplyRatio = (circ != null && max != null && max > 0) ? (circ / max) : null;

    if (ratio != null && ratio >= t.fdvHighRiskRatioMin) {
      return { label: 'High dilution risk', ratio: ratio, supplyRatio: supplyRatio };
    }
    if (ratio != null && ratio <= t.fdvCloseRatioMax) {
      return { label: 'Low dilution risk', ratio: ratio, supplyRatio: supplyRatio };
    }
    if (ratio == null && supplyRatio == null) {
      return { label: 'Unknown dilution risk', ratio: null, supplyRatio: null };
    }
    return { label: 'Moderate dilution risk', ratio: ratio, supplyRatio: supplyRatio };
  }

  // Computes legacy stock FA score while preserving compatibility for existing callers.
  function computeStockFAScore(input, thresholds) {
    var quality = computeStockQualityScore(input, thresholds);
    var valuation = computeStockValuationScore(input, thresholds);
    var expensivePenalty = valuation.label === 'Expensive' ? 1 : 0;
    var score = Math.max(-2, quality.earnedPoints - expensivePenalty);
    var reasons = []
      .concat(quality.reasons.slice(0, 6))
      .concat(valuation.reasons.slice(0, 4));
    return {
      score: score,
      label: mapStockFAScoreToLabel(score),
      reasons: reasons,
      breakdown: quality.breakdown,
      availableSignals: quality.availableMetrics + valuation.availableMetrics,
      quality: quality,
      valuation: valuation
    };
  }

  // Computes crypto token fundamentals score contributions, penalties, and explanations.
  function computeCryptoFAScore(input, thresholds) {
    var t = Object.assign({}, CRYPTO_THRESHOLDS, thresholds || {});
    var data = input || {};
    var score = 0;
    var reasons = [];
    var breakdown = {};

    var marketCap = num(data.marketCap);
    var fdv = num(data.fdv);
    var volume24h = num(data.volume24h);
    var circulating = num(data.circulatingSupply);
    var maxSupply = num(data.maxSupply);
    var fees = num(data.fees24h);
    var revenue = num(data.revenue24h);

    var volToMcap = (marketCap != null && marketCap > 0 && volume24h != null) ? (volume24h / marketCap) : null;
    var fdvToMcap = (marketCap != null && marketCap > 0 && fdv != null) ? (fdv / marketCap) : null;
    var supplyRatio = (circulating != null && maxSupply != null && maxSupply > 0) ? (circulating / maxSupply) : null;

    if (marketCap != null && volToMcap != null && volToMcap >= t.marketCapLiquidityMin) {
      score += 1;
      breakdown.marketCapLiquidity = 1;
      reasons.push('Market cap is supported by tradable liquidity');
    } else {
      breakdown.marketCapLiquidity = 0;
    }

    if (fdvToMcap != null && fdvToMcap <= t.fdvCloseRatioMax) {
      score += 1;
      breakdown.lowDilution = 1;
      reasons.push('Low dilution risk');
    } else {
      breakdown.lowDilution = 0;
    }

    if (supplyRatio != null && supplyRatio >= t.supplyRatioHealthyMin) {
      score += 1;
      breakdown.supplyMaturity = 1;
      reasons.push('Supply is largely circulating');
    } else {
      breakdown.supplyMaturity = 0;
    }

    if (volToMcap != null && volToMcap >= t.volumeStrongRatioMin) {
      score += 1;
      breakdown.volumeStrength = 1;
      reasons.push('Strong volume vs market cap');
    } else {
      breakdown.volumeStrength = 0;
    }

    if ((fees != null && fees > 0) || (revenue != null && revenue > 0)) {
      score += 1;
      breakdown.protocolRevenue = 1;
      reasons.push('Positive protocol fees/revenue');
    } else {
      breakdown.protocolRevenue = 0;
    }

    if (fdvToMcap != null && fdvToMcap >= t.fdvHighRiskRatioMin) {
      score -= 1;
      breakdown.fdvPenalty = -1;
      reasons.push('FDV much higher than market cap');
    } else {
      breakdown.fdvPenalty = 0;
    }

    if (volToMcap != null && volToMcap <= t.volumeWeakRatioMax) {
      score -= 1;
      breakdown.volumePenalty = -1;
      reasons.push('Volume is extremely weak');
    } else {
      breakdown.volumePenalty = 0;
    }

    if (supplyRatio == null || supplyRatio <= t.supplyRatioWeakMax) {
      score -= 1;
      breakdown.supplyPenalty = -1;
      reasons.push('Supply structure suggests higher inflation/dilution risk');
    } else {
      breakdown.supplyPenalty = 0;
    }

    return {
      score: score,
      label: mapCryptoFAScoreToLabel(score),
      reasons: reasons,
      breakdown: breakdown,
      ratios: {
        volumeToMcap: volToMcap,
        fdvToMcap: fdvToMcap,
        supplyRatio: supplyRatio
      }
    };
  }

  return {
    STOCK_THRESHOLDS: STOCK_THRESHOLDS,
    CRYPTO_THRESHOLDS: CRYPTO_THRESHOLDS,
    num: num,
    pctGrowth: pctGrowth,
    isFresh: isFresh,
    interpretValuation: interpretValuation,
    interpretDilutionRisk: interpretDilutionRisk,
    interpretCryptoMarketCap: interpretCryptoMarketCap,
    computeStockQualityScore: computeStockQualityScore,
    computeStockValuationScore: computeStockValuationScore,
    computeStockFAScore: computeStockFAScore,
    computeCryptoFAScore: computeCryptoFAScore,
    mapStockQualityLabel: mapStockQualityLabel,
    mapStockValuationLabel: mapStockValuationLabel,
    mapStockFAScoreToLabel: mapStockFAScoreToLabel,
    mapCryptoFAScoreToLabel: mapCryptoFAScoreToLabel
  };
});
