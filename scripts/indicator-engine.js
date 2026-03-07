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

  var FIB_RETRACEMENT_LEVELS = [
    { key: 'fib236', ratio: 0.236, label: '23.6%' },
    { key: 'fib382', ratio: 0.382, label: '38.2%' },
    { key: 'fib500', ratio: 0.5, label: '50.0%' },
    { key: 'fib618', ratio: 0.618, label: '61.8%' },
    { key: 'fib786', ratio: 0.786, label: '78.6%' }
  ];
  var FIB_MIN_HISTORY = 20;
  var ANALYZE_SCHEMA_VERSION = 6;
  var SR_MIDPOINT_TOLERANCE_PCT = 0.005;
  var TRADE_ZONE_TOLERANCE_STOCK = 0.0075;
  var TRADE_ZONE_TOLERANCE_CRYPTO = 0.0125;
  var TRADE_SINGLE_LEVEL_BAND_STOCK = 0.0075;
  var TRADE_SINGLE_LEVEL_BAND_CRYPTO = 0.0125;
  var BREAKOUT_BAND_STOCK = { low: 0.0025, high: 0.01 };
  var BREAKOUT_BAND_CRYPTO = { low: 0.004, high: 0.015 };
  var TRADE_LEVEL_WEIGHTS = {
    ema20: 2,
    ema50: 3,
    ema200: 3,
    pivotP: 2,
    s1: 2,
    s2: 1,
    r1: 2,
    r2: 1,
    donchianSupport: 3,
    donchianResistance: 3,
    donchianMidpoint: 2,
    nearestSupport: 3,
    nearestResistance: 3,
    fib236: 2,
    fib382: 3,
    fib500: 3,
    fib618: 3,
    fib786: 2,
    bbLower: 3,
    bbUpper: 3,
    supportZone: 2
  };

  function fibonacciLookbackFor(timeKey, assetType, availableCount) {
    var tf = String(timeKey || '1d').toLowerCase();
    var isCrypto = String(assetType || 'stock').toLowerCase() === 'crypto';
    var target = 90;
    if (isCrypto) {
      if (tf === '1w') target = 200;
      else if (tf === '1m') target = 240;
      else target = 120;
    } else {
      if (tf === '1w') target = 120;
      else if (tf === '1m') target = 180;
      else target = 90;
    }
    var available = Math.max(0, Number(availableCount) || 0);
    if (!available) return target;
    return Math.min(target, available);
  }

  function computeFibonacciLevels(swingHigh, swingLow) {
    var high = toNumber(swingHigh);
    var low = toNumber(swingLow);
    if (high == null || low == null || high <= low || high <= 0 || low <= 0) return null;
    var range = high - low;
    var levels = {};
    FIB_RETRACEMENT_LEVELS.forEach(function (entry) {
      levels[entry.key] = high - (range * entry.ratio);
    });
    return levels;
  }

  function findNearestFibLevels(close, levels) {
    var current = toNumber(close);
    if (current == null || !levels) {
      return {
        nearestFibBelow: null,
        nearestFibAbove: null,
        nearestFib: null,
        distanceToNearestFibPct: null
      };
    }
    var values = FIB_RETRACEMENT_LEVELS.map(function (entry) {
      return toNumber(levels[entry.key]);
    }).filter(function (value) {
      return value != null && value > 0;
    });
    if (!values.length) {
      return {
        nearestFibBelow: null,
        nearestFibAbove: null,
        nearestFib: null,
        distanceToNearestFibPct: null
      };
    }
    var below = values.filter(function (value) { return value <= current; });
    var above = values.filter(function (value) { return value >= current; });
    var nearestFibBelow = below.length ? Math.max.apply(null, below) : null;
    var nearestFibAbove = above.length ? Math.min.apply(null, above) : null;
    var nearestFib = null;
    if (nearestFibBelow != null && nearestFibAbove != null) {
      nearestFib =
        Math.abs(current - nearestFibBelow) <= Math.abs(current - nearestFibAbove)
          ? nearestFibBelow
          : nearestFibAbove;
    } else {
      nearestFib = nearestFibBelow != null ? nearestFibBelow : nearestFibAbove;
    }
    return {
      nearestFibBelow: nearestFibBelow,
      nearestFibAbove: nearestFibAbove,
      nearestFib: nearestFib,
      distanceToNearestFibPct: nearestFib != null && current !== 0
        ? (Math.abs(current - nearestFib) / Math.abs(current)) * 100
        : null
    };
  }

  function classifyFibStatus(close, levels) {
    var current = toNumber(close);
    var fib382 = levels && toNumber(levels.fib382);
    var fib618 = levels && toNumber(levels.fib618);
    var fib786 = levels && toNumber(levels.fib786);
    if (current == null || current <= 0 || fib382 == null || fib618 == null || fib786 == null) return null;
    if (current > fib382) return 'Strong Trend';
    if (current <= fib382 && current >= fib618) return 'Normal Pullback';
    if (current < fib618 && current >= fib786) return 'Deep Retracement';
    if (current < fib786) return 'Structure Failure';
    return null;
  }

  function computeFibonacci(candles, options) {
    var list = Array.isArray(candles) ? candles : [];
    var settings = options || {};
    var timeKey = String(settings.timeKey || '1d').toLowerCase();
    var assetType = String(settings.assetType || 'stock').toLowerCase() === 'crypto' ? 'crypto' : 'stock';
    var lookbackTarget = fibonacciLookbackFor(timeKey, assetType, list.length);
    var window = list.slice(Math.max(0, list.length - lookbackTarget));
    if (window.length < FIB_MIN_HISTORY) {
      return {
        available: false,
        reason: 'Not enough data',
        timeKey: timeKey,
        assetType: assetType,
        lookbackTarget: lookbackTarget,
        lookbackUsed: window.length
      };
    }
    var swingHigh = null;
    var swingLow = null;
    for (var i = 0; i < window.length; i++) {
      var high = toNumber(window[i] && window[i].h);
      var low = toNumber(window[i] && window[i].l);
      if (high != null && high > 0) swingHigh = swingHigh == null ? high : Math.max(swingHigh, high);
      if (low != null && low > 0) swingLow = swingLow == null ? low : Math.min(swingLow, low);
    }
    var levels = computeFibonacciLevels(swingHigh, swingLow);
    var currentClose = toNumber(window[window.length - 1] && window[window.length - 1].c);
    if (!levels || currentClose == null || currentClose <= 0) {
      return {
        available: false,
        reason: 'Not enough data',
        timeKey: timeKey,
        assetType: assetType,
        lookbackTarget: lookbackTarget,
        lookbackUsed: window.length,
        swingHigh: swingHigh,
        swingLow: swingLow
      };
    }
    var nearest = findNearestFibLevels(currentClose, levels);
    var status = classifyFibStatus(currentClose, levels);
    return {
      available: true,
      reason: '',
      timeKey: timeKey,
      assetType: assetType,
      lookbackTarget: lookbackTarget,
      lookbackUsed: window.length,
      swingHigh: swingHigh,
      swingLow: swingLow,
      levels: levels,
      rows: FIB_RETRACEMENT_LEVELS.map(function (entry) {
        return {
          key: entry.key,
          ratio: entry.ratio,
          label: entry.label,
          value: levels[entry.key]
        };
      }),
      currentClose: currentClose,
      nearestFibBelow: nearest.nearestFibBelow,
      nearestFibAbove: nearest.nearestFibAbove,
      nearestFib: nearest.nearestFib,
      fibMid: levels.fib500,
      distanceToNearestFibPct: nearest.distanceToNearestFibPct,
      status: status || null,
      goldenZone: status === 'Normal Pullback'
    };
  }

  function computePivotLevels(prevCandle) {
    var high = toNumber(prevCandle && prevCandle.h);
    var low = toNumber(prevCandle && prevCandle.l);
    var close = toNumber(prevCandle && prevCandle.c);
    if (high == null || low == null || close == null || high <= 0 || low <= 0 || close <= 0) return null;
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
    windowHighs = windowHighs.filter(function (v) { return v > 0; });
    windowLows = windowLows.filter(function (v) { return v > 0; });
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
        if (n == null || n <= 0) return;
        if (n < current) supports.push(n);
        if (n > current) resistances.push(n);
      });
    }
    if (donchian) {
      var ds = toNumber(donchian.support);
      var dr = toNumber(donchian.resistance);
      if (ds != null && ds > 0 && ds < current) supports.push(ds);
      if (dr != null && dr > 0 && dr > current) resistances.push(dr);
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
    var midpoint = donchian && toNumber(donchian.midpoint);
    if (current == null || midpoint == null || current <= 0) return 'Neutral';
    var midDistance = Math.abs(current - midpoint) / Math.abs(current);
    if (midDistance <= SR_MIDPOINT_TOLERANCE_PCT) return 'Neutral';
    if (current > midpoint) return 'Bullish';
    if (current < midpoint) return 'Bearish';
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
    if (s >= 3) return 'Bullish';
    if (s <= -3) return 'Bearish';
    return 'Neutral';
  }

  function mapOverallScoreToLabel(score) {
    var s = Number(score) || 0;
    if (s >= 8) return 'Bullish';
    if (s <= -8) return 'Bearish';
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

  function classifyEmaTrend(close, ema20, ema50, ema200) {
    var c = toNumber(close);
    var e20 = toNumber(ema20);
    var e50 = toNumber(ema50);
    var e200 = toNumber(ema200);
    if (c == null || e20 == null || e50 == null || e200 == null) return 'Neutral';
    if (c > e20 && e20 > e50 && e50 > e200) return 'Bullish';
    if (c < e20 && e20 < e50 && e50 < e200) return 'Bearish';
    return 'Neutral';
  }

  function adx(highs, lows, closes, period) {
    var h = Array.isArray(highs) ? highs : [];
    var l = Array.isArray(lows) ? lows : [];
    var c = Array.isArray(closes) ? closes : [];
    var len = Math.min(h.length, l.length, c.length);
    var p = Math.max(2, Number(period) || 14);
    var adxSeries = new Array(len).fill(null);
    var plusDISeries = new Array(len).fill(null);
    var minusDISeries = new Array(len).fill(null);
    var dxSeries = new Array(len).fill(null);
    if (len <= p + 1) {
      return {
        adx: adxSeries,
        plusDI: plusDISeries,
        minusDI: minusDISeries,
        dx: dxSeries
      };
    }

    var tr = new Array(len).fill(null);
    var plusDM = new Array(len).fill(0);
    var minusDM = new Array(len).fill(0);
    for (var i = 1; i < len; i++) {
      var high = toNumber(h[i]);
      var low = toNumber(l[i]);
      var prevHigh = toNumber(h[i - 1]);
      var prevLow = toNumber(l[i - 1]);
      var prevClose = toNumber(c[i - 1]);
      if (high == null || low == null || prevHigh == null || prevLow == null || prevClose == null) continue;
      var upMove = high - prevHigh;
      var downMove = prevLow - low;
      plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
      minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
      tr[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    }

    var tr14 = 0;
    var plusDM14 = 0;
    var minusDM14 = 0;
    for (i = 1; i <= p; i++) {
      var trv = toNumber(tr[i]);
      if (trv == null) continue;
      tr14 += trv;
      plusDM14 += plusDM[i];
      minusDM14 += minusDM[i];
    }
    if (!(tr14 > 0)) {
      return {
        adx: adxSeries,
        plusDI: plusDISeries,
        minusDI: minusDISeries,
        dx: dxSeries
      };
    }

    for (i = p; i < len; i++) {
      if (i > p) {
        var trNow = toNumber(tr[i]);
        if (trNow == null) continue;
        tr14 = tr14 - (tr14 / p) + trNow;
        plusDM14 = plusDM14 - (plusDM14 / p) + plusDM[i];
        minusDM14 = minusDM14 - (minusDM14 / p) + minusDM[i];
      }
      if (tr14 <= 0) continue;
      var plusDI = 100 * (plusDM14 / tr14);
      var minusDI = 100 * (minusDM14 / tr14);
      plusDISeries[i] = isFinite(plusDI) ? plusDI : null;
      minusDISeries[i] = isFinite(minusDI) ? minusDI : null;
      var denom = plusDI + minusDI;
      if (denom > 0) {
        dxSeries[i] = 100 * (Math.abs(plusDI - minusDI) / denom);
      }
    }

    var firstAdxIdx = (2 * p) - 1;
    if (firstAdxIdx < len) {
      var dxSum = 0;
      var dxCount = 0;
      for (i = p; i <= firstAdxIdx; i++) {
        var dxVal = toNumber(dxSeries[i]);
        if (dxVal == null) continue;
        dxSum += dxVal;
        dxCount += 1;
      }
      if (dxCount > 0) {
        adxSeries[firstAdxIdx] = dxSum / dxCount;
        for (i = firstAdxIdx + 1; i < len; i++) {
          var prevAdx = toNumber(adxSeries[i - 1]);
          var nextDx = toNumber(dxSeries[i]);
          if (prevAdx == null || nextDx == null) continue;
          adxSeries[i] = ((prevAdx * (p - 1)) + nextDx) / p;
        }
      }
    }

    return {
      adx: adxSeries,
      plusDI: plusDISeries,
      minusDI: minusDISeries,
      dx: dxSeries
    };
  }

  function classifyAdx(adxValue) {
    var adxNum = toNumber(adxValue);
    if (adxNum == null) return 'n/a';
    if (adxNum > 25) return 'Strong Trend';
    if (adxNum < 20) return 'Weak / Sideways';
    return 'Moderate Trend';
  }

  function computeVolumeConfirmation(values) {
    var currentVolume = toNumber(values && values.currentVolume);
    var volumeMA20 = toNumber(values && values.volumeMA20);
    var close = toNumber(values && values.close);
    var prevClose = toNumber(values && values.prevClose);
    var trendDirection = String(values && values.trendDirection || 'Neutral');
    var bullish = false;
    var bearish = false;
    if (currentVolume != null && volumeMA20 != null && close != null && prevClose != null && currentVolume > volumeMA20) {
      if (close > prevClose) bullish = true;
      else if (close < prevClose) bearish = true;
    }
    var status = 'Neutral';
    var score = 0;
    if (bullish) {
      status = 'Bullish confirmation';
      if (trendDirection === 'Bullish') score = 1;
    } else if (bearish) {
      status = 'Bearish confirmation';
      if (trendDirection === 'Bearish') score = -1;
    }
    return {
      currentVolume: currentVolume,
      volumeMA20: volumeMA20,
      close: close,
      prevClose: prevClose,
      trendDirection: trendDirection,
      bullish: bullish,
      bearish: bearish,
      status: status,
      score: score
    };
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
    var macdHistogram = toNumber(values.macdHistogram);
    var srStatus = values.srStatus || 'Neutral';
    var adxValue = toNumber(values.adx14);
    var emaTrendStatus = classifyEmaTrend(close, ema20, ema50, ema200);
    var volumeConfirmation = values.volumeConfirmation || { score: 0, status: 'Neutral' };

    var emaScore = 0;
    if (emaTrendStatus === 'Bullish') emaScore = 2;
    else if (emaTrendStatus === 'Bearish') emaScore = -2;

    var rsiScore = 0;
    if (rsi14 != null) {
      if (rsi14 > 60) rsiScore = 1;
      else if (rsi14 < 40) rsiScore = -1;
    }

    var macdScore = 0;
    if (macdLine != null && macdSignal != null && macdHistogram != null) {
      if (macdLine > macdSignal && macdHistogram > 0) macdScore = 1;
      else if (macdLine < macdSignal && macdHistogram < 0) macdScore = -1;
    }

    var srScore = 0;
    if (srStatus === 'Bullish') srScore = 1;
    else if (srStatus === 'Bearish') srScore = -1;

    var adxStatus = classifyAdx(adxValue);
    var adxScore = 0;
    if (adxValue != null && adxValue > 25) {
      if (emaTrendStatus === 'Bullish') adxScore = 1;
      else if (emaTrendStatus === 'Bearish') adxScore = -1;
    }

    var volumeScore = toNumber(volumeConfirmation.score) || 0;
    var timeframeScore = emaScore + rsiScore + macdScore + srScore + adxScore + volumeScore;
    return {
      timeframeScore: timeframeScore,
      label: mapTrendScoreToLabel(timeframeScore),
      breakdown: {
        emaScore: emaScore,
        rsiScore: rsiScore,
        macdScore: macdScore,
        srScore: srScore,
        adxScore: adxScore,
        volumeScore: volumeScore,
        emaTrendStatus: emaTrendStatus,
        rsiValue: rsi14,
        macdLine: macdLine,
        macdSignal: macdSignal,
        macdHistogram: macdHistogram,
        ema20: ema20,
        ema50: ema50,
        ema200: ema200,
        close: close,
        srStatus: srStatus,
        adxValue: adxValue,
        adxStatus: adxStatus,
        volumeStatus: volumeConfirmation.status || 'Neutral',
        currentVolume: toNumber(volumeConfirmation.currentVolume),
        volumeMA20: toNumber(volumeConfirmation.volumeMA20),
        prevClose: toNumber(volumeConfirmation.prevClose),
        trendDirectionForConfirm: emaTrendStatus
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

  function normalizeAssetType(assetType) {
    return String(assetType || 'stock').toLowerCase() === 'crypto' ? 'crypto' : 'stock';
  }

  function zoneTolerancePctForAsset(assetType) {
    return normalizeAssetType(assetType) === 'crypto' ? TRADE_ZONE_TOLERANCE_CRYPTO : TRADE_ZONE_TOLERANCE_STOCK;
  }

  function singleLevelBandPctForAsset(assetType) {
    return normalizeAssetType(assetType) === 'crypto' ? TRADE_SINGLE_LEVEL_BAND_CRYPTO : TRADE_SINGLE_LEVEL_BAND_STOCK;
  }

  function breakoutBandForAsset(assetType) {
    return normalizeAssetType(assetType) === 'crypto' ? BREAKOUT_BAND_CRYPTO : BREAKOUT_BAND_STOCK;
  }

  function uniqueStrings(list) {
    var seen = {};
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (item) {
      var text = String(item || '').trim();
      if (!text) return;
      if (seen[text]) return;
      seen[text] = true;
      out.push(text);
    });
    return out;
  }

  function pushCandidate(target, value, key, reason, weight) {
    if (!Array.isArray(target)) return;
    var n = toNumber(value);
    if (n == null || n <= 0) return;
    target.push({
      value: n,
      key: String(key || 'level'),
      reason: String(reason || key || 'level'),
      weight: Math.max(1, Number(weight) || 1)
    });
  }

  function normalizeCandidateLevels(levels) {
    var input = Array.isArray(levels) ? levels : [];
    var out = [];
    input.forEach(function (entry) {
      if (typeof entry === 'number') {
        var n = toNumber(entry);
        if (n != null && n > 0) {
          out.push({
            value: n,
            key: 'level',
            reason: 'Level',
            weight: 1
          });
        }
        return;
      }
      var value = toNumber(entry && entry.value);
      if (value == null || value <= 0) return;
      out.push({
        value: value,
        key: String((entry && entry.key) || 'level'),
        reason: String((entry && entry.reason) || (entry && entry.key) || 'Level'),
        weight: Math.max(1, Number(entry && entry.weight) || 1)
      });
    });
    return out;
  }

  function buildConfluenceZone(levels, assetType, zoneType, options) {
    var candidates = normalizeCandidateLevels(levels);
    if (!candidates.length) return null;
    var opts = options || {};
    var tolerancePct = zoneTolerancePctForAsset(assetType);
    var referencePrice = toNumber(opts.referencePrice);
    candidates.sort(function (a, b) { return a.value - b.value; });
    var clusters = [];
    candidates.forEach(function (item) {
      var cluster = clusters.length ? clusters[clusters.length - 1] : null;
      if (!cluster) {
        clusters.push({
          low: item.value,
          high: item.value,
          weight: item.weight,
          count: 1,
          weightedSum: item.value * item.weight,
          weightSum: item.weight,
          items: [item]
        });
        return;
      }
      var basis = Math.max(cluster.high, 1e-9);
      var deltaPct = Math.abs(item.value - cluster.high) / basis;
      if (deltaPct <= tolerancePct) {
        cluster.low = Math.min(cluster.low, item.value);
        cluster.high = Math.max(cluster.high, item.value);
        cluster.weight += item.weight;
        cluster.count += 1;
        cluster.weightedSum += item.value * item.weight;
        cluster.weightSum += item.weight;
        cluster.items.push(item);
        return;
      }
      clusters.push({
        low: item.value,
        high: item.value,
        weight: item.weight,
        count: 1,
        weightedSum: item.value * item.weight,
        weightSum: item.weight,
        items: [item]
      });
    });
    if (!clusters.length) return null;
    clusters.forEach(function (cluster) {
      var center = cluster.weightSum > 0 ? (cluster.weightedSum / cluster.weightSum) : ((cluster.low + cluster.high) / 2);
      cluster.center = center;
      cluster.score = cluster.weight + ((cluster.count - 1) * 0.85);
      cluster.distanceToRef = referencePrice != null ? Math.abs(center - referencePrice) : Infinity;
    });
    clusters.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.count !== a.count) return b.count - a.count;
      if (a.distanceToRef !== b.distanceToRef) return a.distanceToRef - b.distanceToRef;
      return b.center - a.center;
    });
    var selected = clusters[0];
    if (!selected) return null;
    var representativeLevel = selected.center;
    var zoneLow = selected.low;
    var zoneHigh = selected.high;
    var zoneKind = String(zoneType || 'support').toLowerCase();
    if (zoneKind === 'breakout') {
      var breakoutBand = breakoutBandForAsset(assetType);
      var breakoutBase = Math.max(selected.high, representativeLevel);
      zoneLow = breakoutBase * (1 + breakoutBand.low);
      zoneHigh = breakoutBase * (1 + breakoutBand.high);
    } else if (selected.count === 1) {
      var singleBand = singleLevelBandPctForAsset(assetType);
      zoneLow = representativeLevel * (1 - singleBand);
      zoneHigh = representativeLevel * (1 + singleBand);
    } else {
      var minimumBand = representativeLevel * singleLevelBandPctForAsset(assetType) * 0.35;
      if ((zoneHigh - zoneLow) < minimumBand) {
        var mid = (zoneLow + zoneHigh) / 2;
        zoneLow = mid - (minimumBand / 2);
        zoneHigh = mid + (minimumBand / 2);
      }
    }
    if (!(isFinite(zoneLow) && isFinite(zoneHigh)) || zoneLow <= 0 || zoneHigh <= 0 || zoneHigh < zoneLow) return null;
    return {
      zoneLow: zoneLow,
      zoneHigh: zoneHigh,
      representativeLevel: representativeLevel,
      confluenceCount: selected.count,
      totalWeight: selected.weight,
      score: selected.score,
      reasons: uniqueStrings(selected.items.map(function (item) { return item.reason; })),
      levelKeys: uniqueStrings(selected.items.map(function (item) { return item.key; })),
      levels: selected.items.map(function (item) {
        return {
          key: item.key,
          value: item.value,
          reason: item.reason,
          weight: item.weight
        };
      })
    };
  }

  function collectEntryCandidates(indicators, timeframe, assetType) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var sr = values.sr || {};
    var pivot = sr.pivot || {};
    var donchian = sr.donchian || {};
    var nearest = sr.nearest || {};
    var fib = values.fib || {};
    var fibLevels = fib.levels || {};
    var reversal = values.reversal || {};
    var close = toNumber(snapshot.close);
    var tolerance = zoneTolerancePctForAsset(assetType);
    var nearAllowance = close != null ? (close * (1 + (tolerance * 0.7))) : null;
    var out = {
      trendPullback: [],
      bounce: [],
      breakout: []
    };
    function pushSupportIfNear(arr, value, key, reason, weight) {
      var n = toNumber(value);
      if (n == null || n <= 0) return;
      if (close == null || n <= nearAllowance) pushCandidate(arr, n, key, reason, weight);
    }
    function pushBreakoutIfNear(arr, value, key, reason, weight) {
      var n = toNumber(value);
      if (n == null || n <= 0) return;
      if (close == null || n >= (close * (1 - (tolerance * 0.3)))) pushCandidate(arr, n, key, reason, weight);
    }

    pushSupportIfNear(out.trendPullback, values.ema20, 'ema20', 'EMA20 trend support', TRADE_LEVEL_WEIGHTS.ema20);
    pushSupportIfNear(out.trendPullback, values.ema50, 'ema50', 'EMA50 support', TRADE_LEVEL_WEIGHTS.ema50);
    pushSupportIfNear(out.trendPullback, fibLevels.fib382, 'fib382', 'Fib 38.2 support', TRADE_LEVEL_WEIGHTS.fib382);
    pushSupportIfNear(out.trendPullback, fibLevels.fib500, 'fib500', 'Fib 50 support', TRADE_LEVEL_WEIGHTS.fib500);
    pushSupportIfNear(out.trendPullback, pivot.p, 'pivotP', 'Pivot P', TRADE_LEVEL_WEIGHTS.pivotP);
    pushSupportIfNear(out.trendPullback, donchian.midpoint, 'donchianMidpoint', 'Donchian midpoint', TRADE_LEVEL_WEIGHTS.donchianMidpoint);

    pushSupportIfNear(out.bounce, nearest.support, 'nearestSupport', 'Nearest support', TRADE_LEVEL_WEIGHTS.nearestSupport);
    pushSupportIfNear(out.bounce, pivot.s1, 's1', 'Pivot S1', TRADE_LEVEL_WEIGHTS.s1);
    pushSupportIfNear(out.bounce, pivot.s2, 's2', 'Pivot S2', TRADE_LEVEL_WEIGHTS.s2);
    pushSupportIfNear(out.bounce, fibLevels.fib618, 'fib618', 'Fib 61.8 support', TRADE_LEVEL_WEIGHTS.fib618);
    pushSupportIfNear(out.bounce, fibLevels.fib786, 'fib786', 'Fib 78.6 support', TRADE_LEVEL_WEIGHTS.fib786);
    pushSupportIfNear(out.bounce, values.bbLower, 'bbLower', 'Lower Bollinger band', TRADE_LEVEL_WEIGHTS.bbLower);
    pushSupportIfNear(out.bounce, donchian.support, 'donchianSupport', 'Donchian support', TRADE_LEVEL_WEIGHTS.donchianSupport);
    pushSupportIfNear(out.bounce, reversal.supportZone, 'supportZone', 'Support zone', TRADE_LEVEL_WEIGHTS.supportZone);

    pushBreakoutIfNear(out.breakout, nearest.resistance, 'nearestResistance', 'Nearest resistance', TRADE_LEVEL_WEIGHTS.nearestResistance);
    pushBreakoutIfNear(out.breakout, donchian.resistance, 'donchianResistance', 'Donchian resistance', TRADE_LEVEL_WEIGHTS.donchianResistance);
    pushBreakoutIfNear(out.breakout, fibLevels.fib236, 'fib236', 'Fib 23.6', TRADE_LEVEL_WEIGHTS.fib236);
    pushBreakoutIfNear(out.breakout, pivot.r1, 'r1', 'Pivot R1', TRADE_LEVEL_WEIGHTS.r1);
    pushBreakoutIfNear(out.breakout, pivot.r2, 'r2', 'Pivot R2', TRADE_LEVEL_WEIGHTS.r2);
    pushBreakoutIfNear(out.breakout, values.bbUpper, 'bbUpper', 'Upper Bollinger band', TRADE_LEVEL_WEIGHTS.bbUpper);

    return out;
  }

  function collectExitCandidates(indicators, timeframe, assetType) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var sr = values.sr || {};
    var pivot = sr.pivot || {};
    var donchian = sr.donchian || {};
    var nearest = sr.nearest || {};
    var fib = values.fib || {};
    var fibLevels = fib.levels || {};
    var reversal = values.reversal || {};
    var close = toNumber(snapshot.close);
    var out = {
      takeProfit: [],
      defensive: []
    };
    function pushResistance(arr, value, key, reason, weight) {
      var n = toNumber(value);
      if (n == null || n <= 0) return;
      if (close == null || n > close) pushCandidate(arr, n, key, reason, weight);
    }
    function pushSupport(arr, value, key, reason, weight) {
      var n = toNumber(value);
      if (n == null || n <= 0) return;
      if (close == null || n < close) pushCandidate(arr, n, key, reason, weight);
    }

    pushResistance(out.takeProfit, nearest.resistance, 'nearestResistance', 'Nearest resistance', TRADE_LEVEL_WEIGHTS.nearestResistance);
    pushResistance(out.takeProfit, donchian.resistance, 'donchianResistance', 'Donchian resistance', TRADE_LEVEL_WEIGHTS.donchianResistance);
    pushResistance(out.takeProfit, fibLevels.fib236, 'fib236', 'Fib 23.6', TRADE_LEVEL_WEIGHTS.fib236);
    pushResistance(out.takeProfit, pivot.r1, 'r1', 'Pivot R1', TRADE_LEVEL_WEIGHTS.r1);
    pushResistance(out.takeProfit, pivot.r2, 'r2', 'Pivot R2', TRADE_LEVEL_WEIGHTS.r2);
    pushResistance(out.takeProfit, values.bbUpper, 'bbUpper', 'Upper Bollinger band', TRADE_LEVEL_WEIGHTS.bbUpper);

    pushSupport(out.defensive, values.ema50, 'ema50', 'EMA50 failure level', TRADE_LEVEL_WEIGHTS.ema50);
    pushSupport(out.defensive, values.ema200, 'ema200', 'EMA200 structural level', TRADE_LEVEL_WEIGHTS.ema200);
    pushSupport(out.defensive, nearest.support, 'nearestSupport', 'Nearest support', TRADE_LEVEL_WEIGHTS.nearestSupport);
    pushSupport(out.defensive, donchian.midpoint, 'donchianMidpoint', 'Donchian midpoint', TRADE_LEVEL_WEIGHTS.donchianMidpoint);
    pushSupport(out.defensive, donchian.support, 'donchianSupport', 'Donchian support', TRADE_LEVEL_WEIGHTS.donchianSupport);
    pushSupport(out.defensive, fibLevels.fib618, 'fib618', 'Fib 61.8', TRADE_LEVEL_WEIGHTS.fib618);
    pushSupport(out.defensive, fibLevels.fib786, 'fib786', 'Fib 78.6', TRADE_LEVEL_WEIGHTS.fib786);
    pushSupport(out.defensive, pivot.s1, 's1', 'Pivot S1', TRADE_LEVEL_WEIGHTS.s1);
    pushSupport(out.defensive, pivot.s2, 's2', 'Pivot S2', TRADE_LEVEL_WEIGHTS.s2);
    pushSupport(out.defensive, reversal.supportZone, 'supportZone', 'Support zone', TRADE_LEVEL_WEIGHTS.supportZone);

    return out;
  }

  function selectEntrySetup(indicators, timeframe, assetType, precomputedCandidates) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var statuses = snapshot.statuses || {};
    var trendMeter = snapshot.trendMeter || {};
    var emaPosition = snapshot.emaPosition || values.emaPosition || {};
    var reversal = snapshot.reversal || {};
    var reversalValues = values.reversal || {};
    var sr = values.sr || {};
    var nearest = sr.nearest || {};
    var fib = values.fib || {};
    var fibLevels = fib.levels || {};
    var close = toNumber(snapshot.close);
    var ema20 = toNumber(values.ema20);
    var rsi14 = toNumber(values.rsi14);
    var adx14 = toNumber(values.adx14);
    var trendLabel = String(trendMeter.label || snapshot.overall || 'Neutral');
    var candidates = precomputedCandidates || collectEntryCandidates(snapshot, timeframe, assetType);
    var setup = null;

    var extensionLimit = normalizeAssetType(assetType) === 'crypto' ? 0.05 : 0.035;
    var fib382 = toNumber(fibLevels.fib382);
    var pullbackStyle = String(emaPosition.label || '').toLowerCase() === 'pullback' || String(emaPosition.label || '').toLowerCase() === 'trend test';
    var pullbackByPrice = close != null && ema20 != null && close <= (ema20 * 1.012);
    var pullbackByFib = close != null && fib382 != null && close <= (fib382 * 1.012);
    var notExtended = close != null && ema20 != null ? close <= (ema20 * (1 + extensionLimit)) : false;
    if (trendLabel === 'Bullish' && statuses.ema === 'Bullish' && notExtended && (pullbackStyle || pullbackByPrice || pullbackByFib)) {
      var trendPullbackZone = buildConfluenceZone(candidates.trendPullback, assetType, 'support', { referencePrice: close });
      if (trendPullbackZone) {
        setup = {
          type: 'Trend Pullback Entry',
          zone: trendPullbackZone,
          reasons: uniqueStrings((trendPullbackZone.reasons || []).concat(['Trend and EMA structure aligned']))
        };
      }
    }

    if (!setup) {
      var reversalScore = Number(reversal.score || 0);
      var nearSupport = !!reversalValues.nearSupport;
      if (!nearSupport && nearest && nearest.supportDistancePct != null) {
        nearSupport = Math.abs(Number(nearest.supportDistancePct)) <= 1.8;
      }
      var rsiWeak = rsi14 != null && rsi14 <= 45;
      var macdImproving = !!reversalValues.macdHistogramRising;
      if (reversalScore >= 2 && nearSupport && (rsiWeak || macdImproving)) {
        var bounceZone = buildConfluenceZone(candidates.bounce, assetType, 'support', { referencePrice: close });
        if (bounceZone) {
          setup = {
            type: 'Bounce Entry',
            zone: bounceZone,
            reasons: uniqueStrings((bounceZone.reasons || []).concat(['Reversal signal near support']))
          };
        }
      }
    }

    if (!setup) {
      var nearResistance = false;
      if (nearest && nearest.resistanceDistancePct != null) {
        nearResistance = Math.abs(Number(nearest.resistanceDistancePct)) <= 1.8;
      }
      var donchianResistance = values && values.sr && values.sr.donchian ? toNumber(values.sr.donchian.resistance) : null;
      if (!nearResistance && close != null && donchianResistance != null && donchianResistance > 0) {
        nearResistance = close >= (donchianResistance * 0.995);
      }
      var adxStrong = adx14 != null && adx14 > 25;
      var volumeBull = values.volumeConfirmation && values.volumeConfirmation.status === 'Bullish confirmation';
      var momentumStrong = adxStrong || volumeBull || Number(trendMeter.timeframeScore || 0) >= 4;
      if (trendLabel === 'Bullish' && statuses.macd === 'Bullish' && rsi14 != null && rsi14 > 60 && nearResistance && momentumStrong) {
        var breakoutZone = buildConfluenceZone(candidates.breakout, assetType, 'breakout', { referencePrice: close });
        if (breakoutZone) {
          setup = {
            type: 'Breakout Entry',
            zone: breakoutZone,
            reasons: uniqueStrings((breakoutZone.reasons || []).concat(['Momentum breakout setup']))
          };
        }
      }
    }

    return setup;
  }

  function isValidTakeProfitZone(zone, currentClose) {
    var z = zone || {};
    var close = toNumber(currentClose);
    var low = toNumber(z.zoneLow);
    var high = toNumber(z.zoneHigh);
    if (close == null || low == null || high == null) return false;
    return low > close && high > close;
  }

  function isValidFailureZone(zone, currentClose) {
    var z = zone || {};
    var close = toNumber(currentClose);
    var low = toNumber(z.zoneLow);
    var high = toNumber(z.zoneHigh);
    if (close == null || low == null || high == null) return false;
    return low < close && high < close;
  }

  function selectTakeProfitSetup(indicators, timeframe, assetType, precomputedCandidates) {
    var snapshot = indicators || {};
    var close = toNumber(snapshot.close);
    var candidates = precomputedCandidates || collectExitCandidates(snapshot, timeframe, assetType);
    var takeProfitZone = buildConfluenceZone(candidates.takeProfit, assetType, 'resistance', { referencePrice: close });
    if (takeProfitZone && isValidTakeProfitZone(takeProfitZone, close)) {
      return {
        type: 'Take Profit Zone',
        zone: takeProfitZone,
        reasons: uniqueStrings((takeProfitZone.reasons || []).concat(['Overhead resistance cluster']))
      };
    }
    return null;
  }

  function selectFailureExitSetup(indicators, timeframe, assetType, precomputedCandidates) {
    var snapshot = indicators || {};
    var close = toNumber(snapshot.close);
    var candidates = precomputedCandidates || collectExitCandidates(snapshot, timeframe, assetType);
    var failureZone = buildConfluenceZone(candidates.defensive, assetType, 'support', { referencePrice: close });
    if (failureZone && isValidFailureZone(failureZone, close)) {
      return {
        type: 'Trend Failure Exit',
        zone: failureZone,
        reasons: uniqueStrings((failureZone.reasons || []).concat(['Downside structure failure level']))
      };
    }
    return null;
  }

  function selectExitSetup(indicators, timeframe, assetType, precomputedCandidates) {
    return selectTakeProfitSetup(indicators, timeframe, assetType, precomputedCandidates) ||
      selectFailureExitSetup(indicators, timeframe, assetType, precomputedCandidates);
  }

  function mapTradeConfidenceLabel(points) {
    var p = Number(points) || 0;
    if (p >= 5) return 'High';
    if (p >= 3) return 'Medium';
    return 'Low';
  }

  function computeTradePlanConfidence(indicators, entrySetup, takeProfitSetup, failureExitSetup) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var statuses = snapshot.statuses || {};
    var trendMeter = snapshot.trendMeter || {};
    var trendLabel = String(trendMeter.label || snapshot.overall || 'Neutral');
    var rsi14 = toNumber(values.rsi14);
    var adx14 = toNumber(values.adx14);
    var volumeStatus = values.volumeConfirmation && values.volumeConfirmation.status;
    var reversal = snapshot.reversal || {};
    var points = 0;

    var setup = entrySetup || null;
    if (setup && setup.zone && Number(setup.zone.confluenceCount || 0) >= 2) points += 1;
    if (!setup && takeProfitSetup && takeProfitSetup.zone && Number(takeProfitSetup.zone.confluenceCount || 0) >= 2) points += 1;
    if (!setup && failureExitSetup && failureExitSetup.zone && Number(failureExitSetup.zone.confluenceCount || 0) >= 2) points += 1;

    if (setup && setup.type === 'Trend Pullback Entry' && trendLabel === 'Bullish') points += 1;
    if (setup && setup.type === 'Breakout Entry' && trendLabel === 'Bullish') points += 1;
    if (setup && setup.type === 'Bounce Entry' && (trendLabel === 'Bullish' || trendLabel === 'Neutral')) points += 1;
    if (!setup && failureExitSetup && failureExitSetup.type === 'Trend Failure Exit' && trendLabel === 'Bearish') points += 1;

    if (setup) {
      if (setup.type === 'Bounce Entry') {
        if (statuses.macd === 'Bullish' || (values.reversal && values.reversal.macdHistogramRising)) points += 1;
      } else if (statuses.macd === 'Bullish') {
        points += 1;
      }
    }

    if (setup) {
      if (setup.type === 'Bounce Entry') {
        if (rsi14 != null && rsi14 < 45) points += 1;
      } else if (rsi14 != null && rsi14 > 55) {
        points += 1;
      }
    }

    if (setup) {
      if ((adx14 != null && adx14 > 25) || volumeStatus === 'Bullish confirmation') points += 1;
    } else if ((takeProfitSetup || failureExitSetup) && ((adx14 != null && adx14 > 25) || volumeStatus === 'Bearish confirmation')) {
      points += 1;
    }

    if (setup && setup.type === 'Bounce Entry' && Number(reversal.score || 0) >= 2) points += 1;

    return {
      points: points,
      label: mapTradeConfidenceLabel(points)
    };
  }

  function computeTradePlan(indicators, timeframe, assetType) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var close = toNumber(snapshot.close);
    var mode = normalizeAssetType(assetType);
    var timeKey = String(timeframe || snapshot.timeKey || '1d').toLowerCase();
    var fib = values.fib || {};
    var sr = values.sr || {};
    var hasCoreData = close != null && (
      toNumber(values.ema20) != null ||
      toNumber(values.ema50) != null ||
      toNumber(values.bbLower) != null ||
      toNumber(values.bbUpper) != null ||
      (sr && sr.donchian && (toNumber(sr.donchian.support) != null || toNumber(sr.donchian.resistance) != null)) ||
      (fib && fib.available && fib.levels)
    );
    if (!hasCoreData) {
      return {
        available: false,
        timeframe: timeKey,
        assetType: mode,
        entryType: 'No setup',
        takeProfitType: 'No clear take-profit zone',
        failureExitType: 'No clear failure exit',
        exitType: 'No setup',
        confidence: 'Low',
        confidencePoints: 0,
        reasons: [],
        note: 'Estimated entry/exit zones are derived from technical indicator confluence and are not guaranteed.',
        reason: 'Not enough data'
      };
    }

    var entryCandidates = collectEntryCandidates(snapshot, timeKey, mode);
    var exitCandidates = collectExitCandidates(snapshot, timeKey, mode);
    var entrySetup = selectEntrySetup(snapshot, timeKey, mode, entryCandidates);
    var takeProfitSetup = selectTakeProfitSetup(snapshot, timeKey, mode, exitCandidates);
    var failureExitSetup = selectFailureExitSetup(snapshot, timeKey, mode, exitCandidates);
    var confidence = computeTradePlanConfidence(snapshot, entrySetup, takeProfitSetup, failureExitSetup);
    var combinedReasons = uniqueStrings(
      (entrySetup && entrySetup.reasons ? entrySetup.reasons : [])
        .concat(takeProfitSetup && takeProfitSetup.reasons ? takeProfitSetup.reasons : [])
        .concat(failureExitSetup && failureExitSetup.reasons ? failureExitSetup.reasons : [])
    );
    var isAvailable = !!(entrySetup || takeProfitSetup || failureExitSetup);
    var primaryExitSetup = takeProfitSetup || failureExitSetup || null;

    return {
      available: isAvailable,
      timeframe: timeKey,
      assetType: mode,
      entryZoneLow: entrySetup && entrySetup.zone ? entrySetup.zone.zoneLow : null,
      entryZoneHigh: entrySetup && entrySetup.zone ? entrySetup.zone.zoneHigh : null,
      entryType: entrySetup ? entrySetup.type : 'No setup',
      takeProfitZoneLow: takeProfitSetup && takeProfitSetup.zone ? takeProfitSetup.zone.zoneLow : null,
      takeProfitZoneHigh: takeProfitSetup && takeProfitSetup.zone ? takeProfitSetup.zone.zoneHigh : null,
      takeProfitType: takeProfitSetup ? takeProfitSetup.type : 'No clear take-profit zone',
      failureExitZoneLow: failureExitSetup && failureExitSetup.zone ? failureExitSetup.zone.zoneLow : null,
      failureExitZoneHigh: failureExitSetup && failureExitSetup.zone ? failureExitSetup.zone.zoneHigh : null,
      failureExitType: failureExitSetup ? failureExitSetup.type : 'No clear failure exit',
      exitZoneLow: primaryExitSetup && primaryExitSetup.zone ? primaryExitSetup.zone.zoneLow : null,
      exitZoneHigh: primaryExitSetup && primaryExitSetup.zone ? primaryExitSetup.zone.zoneHigh : null,
      exitType: primaryExitSetup ? primaryExitSetup.type : 'No setup',
      confidence: confidence.label,
      confidencePoints: confidence.points,
      reasons: combinedReasons,
      entryReasons: entrySetup && entrySetup.reasons ? entrySetup.reasons : [],
      takeProfitReasons: takeProfitSetup && takeProfitSetup.reasons ? takeProfitSetup.reasons : [],
      failureExitReasons: failureExitSetup && failureExitSetup.reasons ? failureExitSetup.reasons : [],
      exitReasons: primaryExitSetup && primaryExitSetup.reasons ? primaryExitSetup.reasons : [],
      note: 'Estimated entry/exit zones are derived from technical indicator confluence and are not guaranteed.',
      reason: isAvailable ? '' : 'No clean confluence setup',
      debug: {
        timeframe: timeKey,
        entrySetupType: entrySetup ? entrySetup.type : null,
        takeProfitSetupType: takeProfitSetup ? takeProfitSetup.type : null,
        failureExitSetupType: failureExitSetup ? failureExitSetup.type : null,
        entryCandidates: entryCandidates,
        exitCandidates: exitCandidates,
        entryCluster: entrySetup && entrySetup.zone ? entrySetup.zone : null,
        takeProfitCluster: takeProfitSetup && takeProfitSetup.zone ? takeProfitSetup.zone : null,
        failureExitCluster: failureExitSetup && failureExitSetup.zone ? failureExitSetup.zone : null,
        confidencePoints: confidence.points,
        reasons: combinedReasons
      }
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
    var adxSeries = adx(highs, lows, close, 14);
    var adx14 = latestValue(adxSeries.adx);
    var adxPlusDI = latestValue(adxSeries.plusDI);
    var adxMinusDI = latestValue(adxSeries.minusDI);
    var bbMiddle = latestValue(bands.middle);
    var bbUpper = latestValue(bands.upper);
    var bbLower = latestValue(bands.lower);

    var emaStatus = classifyEmaTrend(latestClose, ema20, ema50, ema200);

    var rsiStatus = 'Neutral';
    if (rsi14 != null) {
      if (rsi14 > 60) rsiStatus = 'Bullish';
      else if (rsi14 < 40) rsiStatus = 'Bearish';
    }

    var macdStatus = 'Neutral';
    if (macdLine != null && macdSignal != null && macdHistogram != null) {
      if (macdLine > macdSignal && macdHistogram > 0) macdStatus = 'Bullish';
      else if (macdLine < macdSignal && macdHistogram < 0) macdStatus = 'Bearish';
    }

    var bollingerStatus = 'Neutral';
    if (latestClose != null && bbMiddle != null && bbUpper != null && bbLower != null) {
      var distanceToUpper = Math.abs(bbUpper - latestClose);
      var distanceToLower = Math.abs(latestClose - bbLower);
      if (latestClose > bbMiddle && distanceToUpper < distanceToLower) bollingerStatus = 'Bullish';
      else if (latestClose < bbMiddle && distanceToLower < distanceToUpper) bollingerStatus = 'Bearish';
    }

    var bollingerPosition = 'n/a';
    if (latestClose != null && bbUpper != null && bbLower != null && bbMiddle != null) {
      if (latestClose > bbUpper) bollingerPosition = 'Near/above upper';
      else if (latestClose < bbLower) bollingerPosition = 'Near/below lower';
      else if (bollingerStatus === 'Bullish') bollingerPosition = 'Upper-side bias';
      else if (bollingerStatus === 'Bearish') bollingerPosition = 'Lower-side bias';
      else bollingerPosition = 'Balanced';
    }

    var prevCompletedCandle = list.length >= 2 ? list[list.length - 2] : (list.length ? list[list.length - 1] : null);
    var donchianPeriod = settings.timeKey === '1m' ? 12 : 20;
    var pivotLevels = computePivotLevels(prevCompletedCandle);
    var donchianLevels = computeDonchian(highs, lows, donchianPeriod);
    var nearestSR = findNearestSupportResistance(latestClose, pivotLevels, donchianLevels);
    var srStatus = computeSRStatus(latestClose, pivotLevels, donchianLevels);

    var prevClose = list.length >= 2 ? toNumber(list[list.length - 2] && list[list.length - 2].c) : null;
    var currentVolume = latestValue(volumes);
    var volumeMA20Series = sma(volumes, 20);
    var avgVolume20 = latestValue(volumeMA20Series);
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
    var volumeConfirmation = computeVolumeConfirmation({
      currentVolume: currentVolume,
      volumeMA20: avgVolume20,
      close: latestClose,
      prevClose: prevClose,
      trendDirection: emaStatus
    });
    var fibonacci = computeFibonacci(list, {
      timeKey: settings.timeKey || '1d',
      assetType: settings.assetType || 'stock'
    });

    var trendMeter = computeTrendMeter({
      close: latestClose,
      ema20: ema20,
      ema50: ema50,
      ema200: ema200,
      rsi14: rsi14,
      macdLine: macdLine,
      macdSignal: macdSignal,
      macdHistogram: macdHistogram,
      srStatus: srStatus,
      adx14: adx14,
      volumeConfirmation: volumeConfirmation
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
    var tradePlan = computeTradePlan({
      close: latestClose,
      timeKey: settings.timeKey || '1d',
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
        adx14: adx14,
        volumeCurrent: currentVolume,
        volumeMA20: avgVolume20,
        prevClose: prevClose,
        volumeConfirmation: volumeConfirmation,
        fib: fibonacci,
        sr: {
          pivot: pivotLevels,
          donchian: donchianLevels,
          nearest: nearestSR
        },
        reversal: {
          avgVolume20: avgVolume20,
          currentVolume: currentVolume,
          volumeSpike: volumeSpike,
          distanceFromEMA20Pct: distanceFromEma20Pct,
          macdHistogramRising: macdHistogramRising,
          nearSupport: nearSupport,
          supportZone: supportHeuristic.nearestSupport,
          supportZones: supportHeuristic.zones
        },
        emaPosition: emaPosition
      },
      statuses: {
        ema: emaStatus,
        rsi: rsiStatus,
        macd: macdStatus,
        bollinger: bollingerStatus,
        sr: srStatus
      },
      trendMeter: trendMeter,
      reversal: reversal,
      emaPosition: emaPosition,
      overall: trendMeter.label
    }, settings.timeKey || '1d', settings.assetType || 'stock');

    var score =
      trendMeter.timeframeScore;

    return {
      timeKey: settings.timeKey || null,
      engineVersion: ANALYZE_SCHEMA_VERSION,
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
        adx14: adx14,
        adxPlusDI: adxPlusDI,
        adxMinusDI: adxMinusDI,
        adxTrend: classifyAdx(adx14),
        volumeCurrent: currentVolume,
        volumeMA20: avgVolume20,
        prevClose: prevClose,
        volumeConfirmation: volumeConfirmation,
        sr: {
          pivot: pivotLevels,
          donchian: donchianLevels,
          nearest: nearestSR
        },
        fib: fibonacci,
        tradePlan: tradePlan,
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
        adx: adx14 != null && adx14 > 25
          ? (emaStatus === 'Bullish' ? 'Bullish' : (emaStatus === 'Bearish' ? 'Bearish' : 'Neutral'))
          : 'Neutral',
        volume: volumeConfirmation.status === 'Bullish confirmation'
          ? 'Bullish'
          : (volumeConfirmation.status === 'Bearish confirmation' ? 'Bearish' : 'Neutral'),
        sr: srStatus,
        fib: fibonacci && fibonacci.status ? fibonacci.status : 'Neutral'
      },
      trendMeter: trendMeter,
      emaPosition: emaPosition,
      reversal: reversal,
      tradePlan: tradePlan,
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
      overall: mapOverallScoreToLabel(weightedScore),
      trendMeter: {
        overallScore: weightedScore,
        overallLabel: mapOverallScoreToLabel(weightedScore),
        timeframes: trendRows
      }
    };
  }

  return {
    sma: sma,
    computeEMA: ema,
    ema: ema,
    stddev: stddev,
    computeRSI14: function (candles) {
      return rsi(closesFromCandles(candles), 14);
    },
    rsi: rsi,
    computeMACD: function (candles, fast, slow, signal) {
      return macd(closesFromCandles(candles), Number(fast) || 12, Number(slow) || 26, Number(signal) || 9);
    },
    macd: macd,
    computeBollinger: function (candles, period, stdMultiplier) {
      return bollinger(closesFromCandles(candles), Number(period) || 20, Number(stdMultiplier) || 2);
    },
    bollinger: bollinger,
    computePivotLevels: computePivotLevels,
    computeDonchian: computeDonchian,
    computeADX14: function (candles) {
      return adx(highsFromCandles(candles), lowsFromCandles(candles), closesFromCandles(candles), 14);
    },
    computeVolumeMA20: function (candles) {
      return sma(volumesFromCandles(candles), 20);
    },
    computeVolumeConfirmation: computeVolumeConfirmation,
    collectEntryCandidates: collectEntryCandidates,
    collectExitCandidates: collectExitCandidates,
    buildConfluenceZone: buildConfluenceZone,
    selectEntrySetup: selectEntrySetup,
    selectTakeProfitSetup: selectTakeProfitSetup,
    selectFailureExitSetup: selectFailureExitSetup,
    selectExitSetup: selectExitSetup,
    computeTradePlan: computeTradePlan,
    findNearestSupportResistance: findNearestSupportResistance,
    computeSRStatus: computeSRStatus,
    fibonacciLookbackFor: fibonacciLookbackFor,
    computeFibonacciLevels: computeFibonacciLevels,
    findNearestFibLevels: findNearestFibLevels,
    classifyFibStatus: classifyFibStatus,
    computeFibonacci: computeFibonacci,
    classifyEmaTrend: classifyEmaTrend,
    computeTrendMeter: computeTrendMeter,
    computeTrendMeterV2: computeTrendMeter,
    mapTrendScoreToLabel: mapTrendScoreToLabel,
    mapOverallScoreToLabel: mapOverallScoreToLabel,
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
      computeEmaPosition: computeEmaPosition,
      fibonacciLookbackFor: fibonacciLookbackFor,
      buildConfluenceZone: buildConfluenceZone,
      collectEntryCandidates: collectEntryCandidates,
      collectExitCandidates: collectExitCandidates,
      selectEntrySetup: selectEntrySetup,
      selectTakeProfitSetup: selectTakeProfitSetup,
      selectFailureExitSetup: selectFailureExitSetup,
      selectExitSetup: selectExitSetup,
      computeTradePlan: computeTradePlan
    }
  };
});
