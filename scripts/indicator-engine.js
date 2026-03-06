// Provides pure technical-indicator calculations and summary scoring for indicator panels.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }
  var target = root || (typeof window !== 'undefined' ? window : globalThis);
  var PT = (target.PT = target.PT || {});
  PT.IndicatorEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function toNumber(value) {
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function closesFromCandles(candles) {
    return (Array.isArray(candles) ? candles : []).map(function (row) {
      return toNumber(row && row.c);
    });
  }

  function highsFromCandles(candles) {
    return (Array.isArray(candles) ? candles : []).map(function (row) {
      return toNumber(row && row.h);
    });
  }

  function lowsFromCandles(candles) {
    return (Array.isArray(candles) ? candles : []).map(function (row) {
      return toNumber(row && row.l);
    });
  }

  function volumesFromCandles(candles) {
    return (Array.isArray(candles) ? candles : []).map(function (row) {
      return toNumber(row && row.v);
    });
  }

  function sma(values, period) {
    var out = new Array(Array.isArray(values) ? values.length : 0).fill(null);
    if (!Array.isArray(values) || period <= 0) return out;
    var sum = 0;
    var i;
    for (i = 0; i < values.length; i++) {
      var next = toNumber(values[i]);
      if (next == null) {
        sum = 0;
        continue;
      }
      sum += next;
      if (i >= period) {
        var prev = toNumber(values[i - period]);
        if (prev != null) sum -= prev;
      }
      if (i >= period - 1) {
        out[i] = sum / period;
      }
    }
    return out;
  }

  function ema(values, period) {
    var out = new Array(Array.isArray(values) ? values.length : 0).fill(null);
    if (!Array.isArray(values) || period <= 0 || values.length < period) return out;
    var alpha = 2 / (period + 1);
    var seed = 0;
    var i;
    for (i = 0; i < period; i++) {
      var value = toNumber(values[i]);
      if (value == null) return out;
      seed += value;
    }
    out[period - 1] = seed / period;
    for (i = period; i < values.length; i++) {
      var current = toNumber(values[i]);
      if (current == null || out[i - 1] == null) {
        out[i] = null;
        continue;
      }
      out[i] = alpha * current + (1 - alpha) * out[i - 1];
    }
    return out;
  }

  function stddev(values, period, smaSeries) {
    var out = new Array(Array.isArray(values) ? values.length : 0).fill(null);
    if (!Array.isArray(values) || period <= 0) return out;
    var means = Array.isArray(smaSeries) ? smaSeries : sma(values, period);
    for (var i = period - 1; i < values.length; i++) {
      if (means[i] == null) continue;
      var mean = Number(means[i]);
      var sumSq = 0;
      var valid = true;
      for (var j = i - period + 1; j <= i; j++) {
        var value = toNumber(values[j]);
        if (value == null) {
          valid = false;
          break;
        }
        var delta = value - mean;
        sumSq += delta * delta;
      }
      if (valid) out[i] = Math.sqrt(sumSq / period);
    }
    return out;
  }

  function rsi(values, period) {
    var out = new Array(Array.isArray(values) ? values.length : 0).fill(null);
    if (!Array.isArray(values) || period <= 0 || values.length <= period) return out;
    var avgGain = 0;
    var avgLoss = 0;
    var i;
    for (i = 1; i <= period; i++) {
      var current = toNumber(values[i]);
      var prev = toNumber(values[i - 1]);
      if (current == null || prev == null) return out;
      var change = current - prev;
      avgGain += Math.max(change, 0);
      avgLoss += Math.max(-change, 0);
    }
    avgGain /= period;
    avgLoss /= period;
    out[period] = avgLoss === 0 ? 100 : (100 - (100 / (1 + (avgGain / avgLoss))));
    for (i = period + 1; i < values.length; i++) {
      var next = toNumber(values[i]);
      var prior = toNumber(values[i - 1]);
      if (next == null || prior == null) {
        out[i] = null;
        continue;
      }
      var diff = next - prior;
      var gain = Math.max(diff, 0);
      var loss = Math.max(-diff, 0);
      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;
      var rs = avgLoss === 0 ? Infinity : (avgGain / avgLoss);
      out[i] = 100 - (100 / (1 + rs));
    }
    return out;
  }

  function emaFromSparse(values, period) {
    var out = new Array(Array.isArray(values) ? values.length : 0).fill(null);
    if (!Array.isArray(values) || period <= 0) return out;
    var alpha = 2 / (period + 1);
    var queue = [];
    var prevEma = null;
    for (var i = 0; i < values.length; i++) {
      var value = toNumber(values[i]);
      if (value == null) continue;
      if (prevEma == null) {
        queue.push(value);
        if (queue.length === period) {
          var seed = queue.reduce(function (acc, item) { return acc + item; }, 0) / period;
          prevEma = seed;
          out[i] = seed;
        }
        continue;
      }
      prevEma = alpha * value + (1 - alpha) * prevEma;
      out[i] = prevEma;
    }
    return out;
  }

  function macd(values, shortPeriod, longPeriod, signalPeriod) {
    var fast = ema(values, shortPeriod);
    var slow = ema(values, longPeriod);
    var line = new Array(Array.isArray(values) ? values.length : 0).fill(null);
    for (var i = 0; i < line.length; i++) {
      if (fast[i] == null || slow[i] == null) continue;
      line[i] = fast[i] - slow[i];
    }
    var signal = emaFromSparse(line, signalPeriod);
    var histogram = new Array(line.length).fill(null);
    for (i = 0; i < line.length; i++) {
      if (line[i] == null || signal[i] == null) continue;
      histogram[i] = line[i] - signal[i];
    }
    return {
      fast: fast,
      slow: slow,
      line: line,
      signal: signal,
      histogram: histogram
    };
  }

  function bollinger(values, period, multiplier) {
    var middle = sma(values, period);
    var deviations = stddev(values, period, middle);
    var upper = new Array(values.length).fill(null);
    var lower = new Array(values.length).fill(null);
    for (var i = 0; i < values.length; i++) {
      if (middle[i] == null || deviations[i] == null) continue;
      upper[i] = middle[i] + (multiplier * deviations[i]);
      lower[i] = middle[i] - (multiplier * deviations[i]);
    }
    return {
      middle: middle,
      upper: upper,
      lower: lower
    };
  }

  function latestValue(series) {
    if (!Array.isArray(series)) return null;
    for (var i = series.length - 1; i >= 0; i--) {
      var value = toNumber(series[i]);
      if (value != null) return value;
    }
    return null;
  }

  function statusFromScore(score) {
    if (score >= 1) return 'Bullish';
    if (score <= -1) return 'Bearish';
    return 'Neutral';
  }

  function scoreFromStatus(status) {
    if (status === 'Bullish') return 1;
    if (status === 'Bearish') return -1;
    return 0;
  }

  function computePivotLevels(prevCandle) {
    var high = toNumber(prevCandle && prevCandle.h);
    var low = toNumber(prevCandle && prevCandle.l);
    var close = toNumber(prevCandle && prevCandle.c);
    if (high == null || low == null || close == null) return null;
    var p = (high + low + close) / 3;
    var r1 = (2 * p) - low;
    var s1 = (2 * p) - high;
    var span = high - low;
    var r2 = p + span;
    var s2 = p - span;
    return {
      p: p,
      s1: s1,
      s2: s2,
      r1: r1,
      r2: r2
    };
  }

  function computeDonchian(highs, lows, period) {
    var safePeriod = Math.max(1, Number(period) || 1);
    var hi = Array.isArray(highs) ? highs.slice() : [];
    var lo = Array.isArray(lows) ? lows.slice() : [];
    var start = Math.max(0, Math.min(hi.length, lo.length) - safePeriod);
    var windowHighs = hi.slice(start).map(toNumber).filter(function (v) { return v != null; });
    var windowLows = lo.slice(start).map(toNumber).filter(function (v) { return v != null; });
    if (!windowHighs.length || !windowLows.length) return null;
    var resistance = Math.max.apply(null, windowHighs);
    var support = Math.min.apply(null, windowLows);
    if (!(isFinite(resistance) && isFinite(support)) || resistance < support) return null;
    return {
      support: support,
      resistance: resistance,
      midpoint: (support + resistance) / 2,
      period: safePeriod
    };
  }

  function distancePct(from, to) {
    var a = toNumber(from);
    var b = toNumber(to);
    if (a == null || b == null || a === 0) return null;
    return ((b - a) / Math.abs(a)) * 100;
  }

  function findNearestSupportResistance(close, pivot, donchian) {
    var current = toNumber(close);
    if (current == null) {
      return {
        support: null,
        resistance: null,
        supportDistancePct: null,
        resistanceDistancePct: null
      };
    }
    var supports = [];
    var resistances = [];
    if (pivot) {
      [pivot.s1, pivot.s2].forEach(function (level) {
        var n = toNumber(level);
        if (n == null) return;
        if (n < current) supports.push(n);
        if (n > current) resistances.push(n);
      });
    }
    if (donchian) {
      var ds = toNumber(donchian.support);
      var dr = toNumber(donchian.resistance);
      if (ds != null && ds < current) supports.push(ds);
      if (dr != null && dr > current) resistances.push(dr);
    }
    var support = supports.length ? Math.max.apply(null, supports) : null;
    var resistance = resistances.length ? Math.min.apply(null, resistances) : null;
    return {
      support: support,
      resistance: resistance,
      supportDistancePct: support == null ? null : distancePct(current, support),
      resistanceDistancePct: resistance == null ? null : distancePct(current, resistance)
    };
  }

  function computeSRStatus(close, pivot, donchian) {
    var current = toNumber(close);
    var p = pivot && toNumber(pivot.p);
    var midpoint = donchian && toNumber(donchian.midpoint);
    if (current == null || p == null || midpoint == null) return 'Neutral';
    if (current > p && current >= midpoint) return 'Bullish';
    if (current < p && current < midpoint) return 'Bearish';
    return 'Neutral';
  }

  function averageLast(values, count) {
    var list = Array.isArray(values) ? values : [];
    var len = list.length;
    if (!len) return null;
    var start = Math.max(0, len - Math.max(1, Number(count) || 1));
    var sum = 0;
    var seen = 0;
    for (var i = start; i < len; i++) {
      var n = toNumber(list[i]);
      if (n == null) continue;
      sum += n;
      seen += 1;
    }
    if (!seen) return null;
    return sum / seen;
  }

  function mapTrendScoreToLabel(score) {
    var s = Number(score) || 0;
    if (s >= 2) return 'Bullish';
    if (s <= -2) return 'Bearish';
    return 'Neutral';
  }

  function mapReversalScoreToLabel(score) {
    var s = Number(score) || 0;
    if (s <= 1) return 'No reversal signal';
    if (s === 2) return 'Possible bounce';
    if (s === 3) return 'Strong bounce potential';
    return 'High probability reversal';
  }

  function histogramRising(hist) {
    if (!Array.isArray(hist) || hist.length < 3) return false;
    var h0 = toNumber(hist[hist.length - 3]);
    var h1 = toNumber(hist[hist.length - 2]);
    var h2 = toNumber(hist[hist.length - 1]);
    if (h0 == null || h1 == null || h2 == null) return false;
    return h2 > h1 && h1 > h0;
  }

  function supportLookbackFor(timeKey) {
    if (timeKey === '1w') return 40;
    if (timeKey === '1m') return 24;
    return 60;
  }

  function findSupportZonesFromPivots(candles, close, timeKey) {
    var list = Array.isArray(candles) ? candles : [];
    var currentClose = toNumber(close);
    if (!list.length || currentClose == null || currentClose <= 0) return {
      zones: [],
      nearestSupport: null,
      nearSupport: false
    };
    var lookback = supportLookbackFor(timeKey);
    var window = list.slice(Math.max(0, list.length - lookback));
    if (window.length < 5) return {
      zones: [],
      nearestSupport: null,
      nearSupport: false
    };
    var pivotLows = [];
    for (var i = 2; i < window.length - 2; i++) {
      var center = toNumber(window[i] && window[i].l);
      if (center == null) continue;
      var isPivot = true;
      for (var j = i - 2; j <= i + 2; j++) {
        var lv = toNumber(window[j] && window[j].l);
        if (lv == null || lv < center) {
          isPivot = false;
          break;
        }
      }
      if (isPivot) pivotLows.push(center);
    }
    if (!pivotLows.length) return {
      zones: [],
      nearestSupport: null,
      nearSupport: false
    };
    pivotLows.sort(function (a, b) { return a - b; });
    var picks = pivotLows.slice(0, 6);
    var tolerance = currentClose * 0.01;
    var clusters = [];
    picks.forEach(function (price) {
      var assigned = null;
      for (var k = 0; k < clusters.length; k++) {
        if (Math.abs(clusters[k].avg - price) <= tolerance) {
          assigned = clusters[k];
          break;
        }
      }
      if (!assigned) {
        clusters.push({ avg: price, count: 1, total: price });
      } else {
        assigned.count += 1;
        assigned.total += price;
        assigned.avg = assigned.total / assigned.count;
      }
    });
    clusters.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.avg - b.avg;
    });
    var selected = clusters.slice(0, 3).map(function (c) { return c.avg; }).sort(function (a, b) { return a - b; });
    var supportsBelow = selected.filter(function (z) { return z <= currentClose; });
    var nearest = supportsBelow.length ? Math.max.apply(null, supportsBelow) : (selected.length ? selected.reduce(function (best, z) {
      if (best == null) return z;
      return Math.abs(z - currentClose) < Math.abs(best - currentClose) ? z : best;
    }, null) : null);
    var near = nearest != null ? (Math.abs(currentClose - nearest) / currentClose <= 0.015) : false;
    return {
      zones: selected,
      nearestSupport: nearest,
      nearSupport: near
    };
  }

  function computeTrendMeter(values) {
    var close = toNumber(values.close);
    var ema20 = toNumber(values.ema20);
    var ema50 = toNumber(values.ema50);
    var ema200 = toNumber(values.ema200);
    var rsi14 = toNumber(values.rsi14);
    var macdLine = toNumber(values.macdLine);
    var macdSignal = toNumber(values.macdSignal);
    var srStatus = values.srStatus || 'Neutral';

    var emaScore = 0;
    if (close != null && ema20 != null && ema50 != null && ema200 != null) {
      if (close > ema20 && ema20 > ema50 && ema50 > ema200) emaScore = 2;
      else if (close < ema20 && ema20 < ema50 && ema50 < ema200) emaScore = -2;
    }

    var rsiScore = 0;
    if (rsi14 != null) {
      if (rsi14 >= 55) rsiScore = 1;
      else if (rsi14 <= 45) rsiScore = -1;
    }

    var macdScore = 0;
    var epsilon = Math.max(1e-8, Math.abs(close || 0) * 1e-6);
    if (macdLine != null && macdSignal != null) {
      if (Math.abs(macdLine - macdSignal) <= epsilon) macdScore = 0;
      else if (macdLine > macdSignal) macdScore = 1;
      else macdScore = -1;
    }

    var srScore = 0;
    if (srStatus === 'Bullish') srScore = 1;
    else if (srStatus === 'Bearish') srScore = -1;

    var timeframeScore = emaScore + rsiScore + macdScore + srScore;
    return {
      timeframeScore: timeframeScore,
      label: mapTrendScoreToLabel(timeframeScore),
      breakdown: {
        emaScore: emaScore,
        rsiScore: rsiScore,
        macdScore: macdScore,
        srScore: srScore,
        rsiValue: rsi14,
        macdLine: macdLine,
        macdSignal: macdSignal,
        macdHistogram: toNumber(values.macdHistogram),
        ema20: ema20,
        ema50: ema50,
        ema200: ema200,
        close: close,
        srStatus: srStatus,
        epsilon: epsilon
      }
    };
  }

  function computeReversal(values) {
    var reasons = [];
    var score = 0;
    var rsi14 = toNumber(values.rsi14);
    var volumeSpike = toNumber(values.volumeSpike);
    var close = toNumber(values.close);
    var prevClose = toNumber(values.prevClose);
    var distanceFromEma20Pct = toNumber(values.distanceFromEma20Pct);
    var macdHistogramRising = !!values.macdHistogramRising;
    var nearSupport = !!values.nearSupport;

    if (rsi14 != null && rsi14 < 35) {
      score += 1;
      reasons.push('RSI oversold (<35)');
    }
    if (volumeSpike != null && volumeSpike >= 1.8 && close != null && prevClose != null && close > prevClose) {
      score += 1;
      reasons.push('Volume spike (>=1.8x) on green candle');
    }
    if (distanceFromEma20Pct != null && distanceFromEma20Pct <= -6) {
      score += 1;
      reasons.push('Stretched below EMA20 (<= -6%)');
    }
    if (macdHistogramRising) {
      score += 1;
      reasons.push('MACD histogram rising (3 bars)');
    }
    if (nearSupport) {
      score += 1;
      reasons.push('Near support (within 1.5%)');
    }

    return {
      score: score,
      label: mapReversalScoreToLabel(score),
      reasons: reasons
    };
  }

  function computeEmaPosition(close, ema20, ema50, tolerancePct) {
    var c = toNumber(close);
    var e20 = toNumber(ema20);
    var e50 = toNumber(ema50);
    var tol = isFinite(Number(tolerancePct)) ? Math.abs(Number(tolerancePct)) : 0.005;
    var distance = (c != null && e50 != null && e50 !== 0)
      ? (Math.abs(c - e50) / Math.abs(e50))
      : null;
    var label = 'Neutral';
    var relation = 'Neutral';

    if (c != null && e20 != null && c > e20) {
      label = 'Strong Bullish';
      relation = (e50 != null && e20 > e50) ? 'Price > EMA20 > EMA50' : 'Price > EMA20';
    } else if (distance != null && distance <= tol) {
      label = 'Trend Test';
      relation = 'Price ≈ EMA50';
    } else if (c != null && e20 != null && e50 != null && e20 > c && c > e50) {
      label = 'Pullback';
      relation = 'EMA20 > Price > EMA50';
    } else if (c != null && e50 != null && c < e50) {
      label = 'Bearish Risk';
      relation = 'Price < EMA50';
    }

    return {
      label: label,
      relation: relation,
      close: c,
      ema20: e20,
      ema50: e50,
      distanceToEMA50Pct: distance,
      ema50TolerancePct: tol
    };
  }

  function analyze(candles, options) {
    var list = Array.isArray(candles) ? candles : [];
    if (!list.length) {
      return {
        close: null,
        values: {},
        statuses: {},
        score: 0,
        overall: 'Neutral'
      };
    }

    var settings = options || {};
    var close = closesFromCandles(list);
    var highs = highsFromCandles(list);
    var lows = lowsFromCandles(list);
    var volumes = volumesFromCandles(list);
    var latestClose = latestValue(close);
    var ema20Series = ema(close, 20);
    var ema50Series = ema(close, 50);
    var ema200Series = ema(close, 200);
    var rsiSeries = rsi(close, 14);
    var macdSeries = macd(close, 12, 26, 9);
    var bands = bollinger(close, 20, 2);

    var ema20 = latestValue(ema20Series);
    var ema50 = latestValue(ema50Series);
    var ema200 = latestValue(ema200Series);
    var rsi14 = latestValue(rsiSeries);
    var macdLine = latestValue(macdSeries.line);
    var macdSignal = latestValue(macdSeries.signal);
    var macdHistogram = latestValue(macdSeries.histogram);
    var bbMiddle = latestValue(bands.middle);
    var bbUpper = latestValue(bands.upper);
    var bbLower = latestValue(bands.lower);

    var epsilon = Math.max(0.0001, Math.abs(toNumber(latestClose) || 0) * 0.0001);
    var middleTolerance = Math.max(0.0001, Math.abs(toNumber(latestClose) || 0) * 0.001);

    var emaStatus = 'Neutral';
    if (latestClose != null && ema20 != null && ema50 != null) {
      if (latestClose > ema50 && ema20 > ema50) emaStatus = 'Bullish';
      else if (latestClose < ema50 && ema20 < ema50) emaStatus = 'Bearish';
    }

    var rsiStatus = 'Neutral';
    if (rsi14 != null) {
      if (rsi14 >= 55) rsiStatus = 'Bullish';
      else if (rsi14 <= 45) rsiStatus = 'Bearish';
    }

    var macdStatus = 'Neutral';
    if (macdLine != null && macdSignal != null) {
      if (Math.abs(macdLine - macdSignal) < epsilon) macdStatus = 'Neutral';
      else if (macdLine > macdSignal) macdStatus = 'Bullish';
      else macdStatus = 'Bearish';
    }

    var bollingerStatus = 'Neutral';
    if (latestClose != null && bbMiddle != null) {
      if (Math.abs(latestClose - bbMiddle) <= middleTolerance) bollingerStatus = 'Neutral';
      else if (latestClose > bbMiddle) bollingerStatus = 'Bullish';
      else bollingerStatus = 'Bearish';
    }

    var bollingerPosition = 'n/a';
    if (latestClose != null && bbUpper != null && bbLower != null && bbMiddle != null) {
      if (latestClose > bbUpper) bollingerPosition = 'Above upper';
      else if (latestClose < bbLower) bollingerPosition = 'Below lower';
      else if (Math.abs(latestClose - bbMiddle) <= middleTolerance) bollingerPosition = 'Near middle';
      else bollingerPosition = 'Inside bands';
    }

    var prevCompletedCandle = list.length >= 2 ? list[list.length - 2] : (list.length ? list[list.length - 1] : null);
    var donchianPeriod = settings.timeKey === '1m' ? 12 : 20;
    var pivotLevels = computePivotLevels(prevCompletedCandle);
    var donchianLevels = computeDonchian(highs, lows, donchianPeriod);
    var nearestSR = findNearestSupportResistance(latestClose, pivotLevels, donchianLevels);
    var srStatus = computeSRStatus(latestClose, pivotLevels, donchianLevels);

    var prevClose = list.length >= 2 ? toNumber(list[list.length - 2] && list[list.length - 2].c) : null;
    var currentVolume = latestValue(volumes);
    var avgVolume20 = averageLast(volumes, 20);
    var volumeSpike = (currentVolume != null && avgVolume20 != null && avgVolume20 > 0) ? (currentVolume / avgVolume20) : null;
    var distanceFromEma20Pct = (latestClose != null && ema20 != null && ema20 !== 0)
      ? ((latestClose - ema20) / ema20) * 100
      : null;
    var macdHistogramRising = histogramRising(macdSeries.histogram);
    var supportHeuristic = findSupportZonesFromPivots(list, latestClose, settings.timeKey || '1d');
    var nearestSupportDistancePct = nearestSR && nearestSR.supportDistancePct != null
      ? Math.abs(Number(nearestSR.supportDistancePct))
      : null;
    var nearSupportFromSR = nearestSupportDistancePct != null ? nearestSupportDistancePct <= 1.5 : null;
    var nearSupport = nearSupportFromSR != null ? nearSupportFromSR : supportHeuristic.nearSupport;

    var trendMeter = computeTrendMeter({
      close: latestClose,
      ema20: ema20,
      ema50: ema50,
      ema200: ema200,
      rsi14: rsi14,
      macdLine: macdLine,
      macdSignal: macdSignal,
      macdHistogram: macdHistogram,
      srStatus: srStatus
    });
    var emaPosition = computeEmaPosition(latestClose, ema20, ema50, 0.005);
    var reversal = computeReversal({
      rsi14: rsi14,
      volumeSpike: volumeSpike,
      close: latestClose,
      prevClose: prevClose,
      distanceFromEma20Pct: distanceFromEma20Pct,
      macdHistogramRising: macdHistogramRising,
      nearSupport: nearSupport
    });

    var score =
      trendMeter.timeframeScore;

    return {
      timeKey: settings.timeKey || null,
      candleCount: list.length,
      latestCandleTime: list.length ? (list[list.length - 1].t || null) : null,
      close: latestClose,
      values: {
        ema20: ema20,
        ema50: ema50,
        ema200: ema200,
        rsi14: rsi14,
        macdLine: macdLine,
        macdSignal: macdSignal,
        macdHistogram: macdHistogram,
        bbMiddle: bbMiddle,
        bbUpper: bbUpper,
        bbLower: bbLower,
        bollingerPosition: bollingerPosition,
        sr: {
          pivot: pivotLevels,
          donchian: donchianLevels,
          nearest: nearestSR
        },
        emaPosition: emaPosition,
        reversal: {
          avgVolume20: avgVolume20,
          currentVolume: currentVolume,
          volumeSpike: volumeSpike,
          distanceFromEMA20Pct: distanceFromEma20Pct,
          macdHistogramRising: macdHistogramRising,
          nearSupport: nearSupport,
          supportZone: supportHeuristic.nearestSupport,
          supportZones: supportHeuristic.zones
        }
      },
      statuses: {
        ema: emaStatus,
        rsi: rsiStatus,
        macd: macdStatus,
        bollinger: bollingerStatus,
        sr: srStatus
      },
      trendMeter: trendMeter,
      emaPosition: emaPosition,
      reversal: reversal,
      score: score,
      overall: trendMeter.label
    };
  }

  function summarizeByTimeframe(map) {
    var timeframes = map || {};
    var weights = { '1d': 1, '1w': 2, '1m': 3 };
    var weightedScore = 0;
    var trendRows = {};
    Object.keys(weights).forEach(function (key) {
      var item = timeframes[key];
      if (!item) return;
      var tfScore = item.trendMeter && isFinite(Number(item.trendMeter.timeframeScore))
        ? Number(item.trendMeter.timeframeScore)
        : (isFinite(Number(item.score)) ? Number(item.score) : 0);
      weightedScore += tfScore * weights[key];
      trendRows[key] = {
        score: tfScore,
        label: mapTrendScoreToLabel(tfScore),
        breakdown: item.trendMeter && item.trendMeter.breakdown ? item.trendMeter.breakdown : null
      };
    });
    return {
      weightedScore: weightedScore,
      overall: weightedScore >= 4 ? 'Bullish' : (weightedScore <= -4 ? 'Bearish' : 'Neutral'),
      trendMeter: {
        overallScore: weightedScore,
        overallLabel: weightedScore >= 4 ? 'Bullish' : (weightedScore <= -4 ? 'Bearish' : 'Neutral'),
        timeframes: trendRows
      }
    };
  }

  return {
    sma: sma,
    ema: ema,
    stddev: stddev,
    rsi: rsi,
    macd: macd,
    bollinger: bollinger,
    computePivotLevels: computePivotLevels,
    computeDonchian: computeDonchian,
    findNearestSupportResistance: findNearestSupportResistance,
    computeSRStatus: computeSRStatus,
    computeTrendMeter: computeTrendMeter,
    computeEmaPosition: computeEmaPosition,
    computeReversal: computeReversal,
    analyze: analyze,
    summarizeByTimeframe: summarizeByTimeframe,
    _internals: {
      latestValue: latestValue,
      scoreFromStatus: scoreFromStatus,
      statusFromScore: statusFromScore,
      histogramRising: histogramRising,
      findSupportZonesFromPivots: findSupportZonesFromPivots,
      computeEmaPosition: computeEmaPosition
    }
  };
});
