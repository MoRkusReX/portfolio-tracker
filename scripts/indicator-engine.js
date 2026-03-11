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
  var ANALYZE_SCHEMA_VERSION = 7;
  var SR_MIDPOINT_TOLERANCE_PCT = 0.005;
  var TRADE_ZONE_TOLERANCE_STOCK = 0.01; // Relaxed from 0.75% to 1.00% to reduce empty plans
  var TRADE_ZONE_TOLERANCE_CRYPTO = 0.015; // Relaxed from 1.25% to 1.50% to reduce empty plans
  var TRADE_SINGLE_LEVEL_BAND_STOCK = 0.0075;
  var TRADE_SINGLE_LEVEL_BAND_CRYPTO = 0.0125;
  var BREAKOUT_BAND_STOCK = { low: 0.0025, high: 0.01 };
  var BREAKOUT_BAND_CRYPTO = { low: 0.004, high: 0.015 };
  var TRADE_LEVEL_WEIGHTS_DEFAULT = {
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
  var TRADE_LEVEL_WEIGHTS_BY_TIMEFRAME = {
    '1d': {
      ema20: 3,
      ema50: 3,
      ema200: 2,
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
      supportZone: 3
    },
    '1w': {
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
      bbLower: 2,
      bbUpper: 2,
      supportZone: 2
    },
    '1m': {
      ema20: 1,
      ema50: 2,
      ema200: 4,
      pivotP: 1,
      s1: 1,
      s2: 1,
      r1: 1,
      r2: 1,
      donchianSupport: 4,
      donchianResistance: 4,
      donchianMidpoint: 3,
      nearestSupport: 4,
      nearestResistance: 4,
      fib236: 1,
      fib382: 2,
      fib500: 4,
      fib618: 4,
      fib786: 3,
      bbLower: 1,
      bbUpper: 1,
      supportZone: 3
    }
  };
  var TRADE_MIN_REWARD_PCT = {
    stock: { '1d': 5, '1w': 5, '1m': 5, defaultValue: 5 },
    crypto: { '1d': 5, '1w': 5, '1m': 5, defaultValue: 5 }
  };
  var TRADE_MIN_RR = {
    stock: 1.5,
    crypto: 1.5
  };
  var TRADE_CLOSE_GUARD_PCT = {
    stock: 5.0,
    crypto: 5.0
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

  function atr(highs, lows, closes, period) {
    var h = Array.isArray(highs) ? highs : [];
    var l = Array.isArray(lows) ? lows : [];
    var c = Array.isArray(closes) ? closes : [];
    var len = Math.min(h.length, l.length, c.length);
    var p = Math.max(2, Number(period) || 14);
    var out = new Array(len).fill(null);
    if (len <= p) return out;
    var tr = new Array(len).fill(null);
    for (var i = 1; i < len; i++) {
      var high = toNumber(h[i]);
      var low = toNumber(l[i]);
      var prevClose = toNumber(c[i - 1]);
      if (high == null || low == null || prevClose == null) continue;
      tr[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    }
    var sum = 0;
    var valid = 0;
    for (i = 1; i <= p; i++) {
      var t = toNumber(tr[i]);
      if (t == null) continue;
      sum += t;
      valid += 1;
    }
    if (!valid) return out;
    var first = sum / valid;
    out[p] = first;
    var prevAtr = first;
    for (i = p + 1; i < len; i++) {
      var nextTr = toNumber(tr[i]);
      if (nextTr == null) {
        out[i] = null;
        continue;
      }
      prevAtr = ((prevAtr * (p - 1)) + nextTr) / p;
      out[i] = prevAtr;
    }
    return out;
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

  function normalizeTimeframeKey(timeframe) {
    var key = String(timeframe || '1d').toLowerCase();
    if (key === '1w' || key === '1m') return key;
    return '1d';
  }

  function getLevelWeightsForTimeframe(timeframe) {
    var key = normalizeTimeframeKey(timeframe);
    var base = TRADE_LEVEL_WEIGHTS_DEFAULT;
    var scoped = TRADE_LEVEL_WEIGHTS_BY_TIMEFRAME[key] || {};
    var out = {};
    Object.keys(base).forEach(function (name) {
      var scopedValue = toNumber(scoped[name]);
      out[name] = scopedValue != null ? Math.max(1, scopedValue) : base[name];
    });
    return out;
  }

  function clamp(value, min, max) {
    var n = Number(value);
    if (!isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function computeAtrPct(values, close) {
    var atr14 = toNumber(values && values.atr14);
    var currentClose = toNumber(close);
    if (atr14 == null || currentClose == null || currentClose <= 0) return null;
    return (atr14 / currentClose) * 100;
  }

  function zoneTolerancePctForAsset(assetType, atrPct) {
    var mode = normalizeAssetType(assetType);
    var atr = toNumber(atrPct);
    if (mode === 'crypto') {
      var cryptoTol = Math.max(1.25, atr != null ? (0.50 * atr) : 1.25);
      return clamp(cryptoTol, 1.25, 3.5);
    }
    var stockTol = Math.max(0.75, atr != null ? (0.35 * atr) : 0.75);
    return clamp(stockTol, 0.75, 2.0);
  }

  function zoneHalfWidthPctForAsset(assetType, atrPct) {
    var atrComponent = toNumber(atrPct);
    if (normalizeAssetType(assetType) === 'crypto') {
      var dynamicCrypto = atrComponent != null ? (0.50 * atrComponent) : 0;
      return clamp(Math.max(0.80, dynamicCrypto), 0.80, 2.50);
    }
    var dynamicStock = atrComponent != null ? (0.35 * atrComponent) : 0;
    return clamp(Math.max(0.40, dynamicStock), 0.40, 1.50);
  }

  function breakoutBandPctForAsset(assetType, atrPct) {
    var atrComponent = toNumber(atrPct);
    if (normalizeAssetType(assetType) === 'crypto') {
      return {
        low: Math.max(0.35, atrComponent != null ? (0.25 * atrComponent) : 0.35),
        high: Math.max(1.25, atrComponent != null ? (0.80 * atrComponent) : 1.25)
      };
    }
    return {
      low: Math.max(0.20, atrComponent != null ? (0.20 * atrComponent) : 0.20),
      high: Math.max(0.80, atrComponent != null ? (0.60 * atrComponent) : 0.80)
    };
  }

  function tradeThresholds(assetType, timeframe) {
    var mode = normalizeAssetType(assetType);
    var key = normalizeTimeframeKey(timeframe);
    var rewardCfg = TRADE_MIN_REWARD_PCT[mode] || TRADE_MIN_REWARD_PCT.stock;
    var minRewardPct = toNumber(rewardCfg[key]);
    if (minRewardPct == null) minRewardPct = toNumber(rewardCfg.defaultValue);
    return {
      minRewardPct: minRewardPct != null ? minRewardPct : 5,
      minRR: toNumber(TRADE_MIN_RR[mode]) || 1.5,
      minTakeProfitDistancePct: toNumber(TRADE_CLOSE_GUARD_PCT[mode]) || 5
    };
  }

  function uniqueStrings(list) {
    var seen = {};
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (item) {
      var text = String(item || '').trim();
      if (!text || seen[text]) return;
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
          out.push({ value: n, key: 'level', reason: 'Level', weight: 1 });
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

  function buildConfluenceZone(levels, assetType, zoneType, atrPct, timeframe, options) {
    var candidates = normalizeCandidateLevels(levels);
    if (!candidates.length) return null;
    var opts = options || {};
    var atrPercent = toNumber(atrPct);
    if (arguments.length <= 4 && atrPct && typeof atrPct === 'object' && !Array.isArray(atrPct)) {
      opts = atrPct;
      atrPercent = toNumber(opts.atrPct);
    }
    if (timeframe && typeof timeframe === 'object' && !Array.isArray(timeframe)) {
      opts = timeframe;
    }
    if (atrPercent == null) atrPercent = toNumber(opts.atrPct);
    var tolerancePct = zoneTolerancePctForAsset(assetType, atrPercent);
    var toleranceRatio = tolerancePct / 100;
    var referencePrice = toNumber(opts.referencePrice);
    var halfWidthPct = tolerancePct;

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
      var basis = Math.max(cluster.center || cluster.high, 1e-9);
      var deltaPct = Math.abs(item.value - cluster.high) / basis;
      if (deltaPct <= toleranceRatio) {
        cluster.low = Math.min(cluster.low, item.value);
        cluster.high = Math.max(cluster.high, item.value);
        cluster.weight += Math.max(1, Number(item.weight) || 1);
        cluster.count += 1;
        cluster.weightedSum += item.value * Math.max(1, Number(item.weight) || 1);
        cluster.weightSum += Math.max(1, Number(item.weight) || 1);
        cluster.items.push(item);
        cluster.center = cluster.weightSum > 0 ? (cluster.weightedSum / cluster.weightSum) : ((cluster.low + cluster.high) / 2);
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
      cluster.structuralImportance = cluster.weight;
      cluster.score = cluster.weight + ((cluster.count - 1) * 1.0);
      cluster.distanceToRef = referencePrice != null ? Math.abs(center - referencePrice) : Infinity;
    });

    clusters.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.count !== a.count) return b.count - a.count;
      if (b.structuralImportance !== a.structuralImportance) return b.structuralImportance - a.structuralImportance;
      if (a.distanceToRef !== b.distanceToRef) return a.distanceToRef - b.distanceToRef;
      return b.center - a.center;
    });

    var selected = clusters[0];
    if (!selected) return null;
    var representativeLevel = selected.center;
    var zoneLow = selected.low;
    var zoneHigh = selected.high;
    var zoneKind = String(zoneType || 'support').toLowerCase();
    if (selected.count === 1) {
      zoneLow = representativeLevel * (1 - (halfWidthPct / 100));
      zoneHigh = representativeLevel * (1 + (halfWidthPct / 100));
    } else {
      var minimumBand = representativeLevel * (halfWidthPct / 100) * 0.8;
      if ((zoneHigh - zoneLow) < minimumBand) {
        var mid = (zoneLow + zoneHigh) / 2;
        zoneLow = mid - (minimumBand / 2);
        zoneHigh = mid + (minimumBand / 2);
      }
    }
    if (zoneKind === 'breakout') {
      var breakoutBand = breakoutBandPctForAsset(assetType, atrPercent);
      var breakoutBase = Math.max(selected.high, representativeLevel);
      zoneLow = Math.max(zoneLow, breakoutBase * (1 + (breakoutBand.low / 100)));
      zoneHigh = Math.max(zoneHigh, breakoutBase * (1 + (breakoutBand.high / 100)));
    } else if (zoneKind === 'breakdown') {
      var breakdownBand = breakoutBandPctForAsset(assetType, atrPercent);
      var breakdownBase = Math.min(selected.low, representativeLevel);
      zoneLow = Math.min(zoneLow, breakdownBase * (1 - (breakdownBand.high / 100)));
      zoneHigh = Math.min(zoneHigh, breakdownBase * (1 - (breakdownBand.low / 100)));
    }

    if (!(isFinite(zoneLow) && isFinite(zoneHigh)) || zoneLow <= 0 || zoneHigh <= 0 || zoneHigh < zoneLow) return null;
    return {
      zoneLow: zoneLow,
      zoneHigh: zoneHigh,
      zoneMid: midpoint(zoneLow, zoneHigh),
      representativeLevel: representativeLevel,
      confluenceCount: selected.count,
      totalWeight: selected.weight,
      structuralImportance: selected.weight,
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

  function buildEntryCandidates(indicators, timeframe, assetType) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var statuses = snapshot.statuses || {};
    var trendMeter = snapshot.trendMeter || {};
    var reversal = snapshot.reversal || {};
    var sr = values.sr || {};
    var pivot = sr.pivot || {};
    var donchian = sr.donchian || {};
    var nearest = sr.nearest || {};
    var fib = values.fib || {};
    var fibLevels = fib.levels || {};
    var reversalValues = values.reversal || {};
    var close = toNumber(snapshot.close);
    var atrPct = computeAtrPct(values, close);
    var nearPct = zoneTolerancePctForAsset(assetType, atrPct) * 1.4;
    var weights = getLevelWeightsForTimeframe(timeframe);
    var trendScore = Number(trendMeter.timeframeScore || 0);
    var trendLabel = String(trendMeter.label || snapshot.overall || 'Neutral');
    var rsi14 = toNumber(values.rsi14);
    var macdLine = toNumber(values.macdLine);
    var macdSignal = toNumber(values.macdSignal);
    var macdHistogram = toNumber(values.macdHistogram);
    var macdBull = statuses.macd === 'Bullish' || (macdLine != null && macdSignal != null && macdLine >= macdSignal) || (macdHistogram != null && macdHistogram > 0);

    function isNearSupport(level) {
      var n = toNumber(level);
      if (n == null || n <= 0) return false;
      if (close == null || close <= 0) return true;
      return n <= (close * (1 + (nearPct / 100)));
    }

    function isNearResistance(level) {
      var n = toNumber(level);
      if (n == null || n <= 0) return false;
      if (close == null || close <= 0) return true;
      return n >= (close * (1 - (nearPct / 100)));
    }

    var pullbackLevels = [];
    if (isNearSupport(values.ema20)) pushCandidate(pullbackLevels, values.ema20, 'ema20', 'EMA20 pullback support', weights.ema20);
    if (isNearSupport(values.ema50)) pushCandidate(pullbackLevels, values.ema50, 'ema50', 'EMA50 structural support', weights.ema50);
    if (isNearSupport(pivot.p)) pushCandidate(pullbackLevels, pivot.p, 'pivotP', 'Pivot P', weights.pivotP);
    if (isNearSupport(donchian.midpoint)) pushCandidate(pullbackLevels, donchian.midpoint, 'donchianMidpoint', 'Donchian midpoint', weights.donchianMidpoint);
    if (isNearSupport(fibLevels.fib382)) pushCandidate(pullbackLevels, fibLevels.fib382, 'fib382', 'Fib 38.2 support', weights.fib382);
    if (isNearSupport(fibLevels.fib500)) pushCandidate(pullbackLevels, fibLevels.fib500, 'fib500', 'Fib 50 support', weights.fib500);
    if (isNearSupport(nearest.support)) pushCandidate(pullbackLevels, nearest.support, 'nearestSupport', 'Nearest support', weights.nearestSupport);

    var bounceLevels = [];
    if (isNearSupport(nearest.support)) pushCandidate(bounceLevels, nearest.support, 'nearestSupport', 'Nearest support', weights.nearestSupport);
    if (isNearSupport(reversalValues.supportZone)) pushCandidate(bounceLevels, reversalValues.supportZone, 'supportZone', 'Support zone', weights.supportZone);
    if (isNearSupport(fibLevels.fib618)) pushCandidate(bounceLevels, fibLevels.fib618, 'fib618', 'Fib 61.8 support', weights.fib618);
    if (isNearSupport(fibLevels.fib786)) pushCandidate(bounceLevels, fibLevels.fib786, 'fib786', 'Fib 78.6 support', weights.fib786);
    if (isNearSupport(values.bbLower)) pushCandidate(bounceLevels, values.bbLower, 'bbLower', 'Lower Bollinger band', weights.bbLower);
    if (isNearSupport(donchian.support)) pushCandidate(bounceLevels, donchian.support, 'donchianSupport', 'Donchian support', weights.donchianSupport);
    if (isNearSupport(pivot.s1)) pushCandidate(bounceLevels, pivot.s1, 's1', 'Pivot S1', weights.s1);
    if (isNearSupport(pivot.s2)) pushCandidate(bounceLevels, pivot.s2, 's2', 'Pivot S2', weights.s2);

    var breakoutLevels = [];
    if (isNearResistance(nearest.resistance)) pushCandidate(breakoutLevels, nearest.resistance, 'nearestResistance', 'Nearest resistance', weights.nearestResistance);
    if (isNearResistance(donchian.resistance)) pushCandidate(breakoutLevels, donchian.resistance, 'donchianResistance', 'Donchian resistance', weights.donchianResistance);
    if (isNearResistance(fibLevels.fib236)) pushCandidate(breakoutLevels, fibLevels.fib236, 'fib236', 'Fib 23.6 resistance', weights.fib236);
    if (isNearResistance(pivot.r1)) pushCandidate(breakoutLevels, pivot.r1, 'r1', 'Pivot R1', weights.r1);
    if (isNearResistance(pivot.r2)) pushCandidate(breakoutLevels, pivot.r2, 'r2', 'Pivot R2', weights.r2);
    if (isNearResistance(values.bbUpper)) pushCandidate(breakoutLevels, values.bbUpper, 'bbUpper', 'Upper Bollinger band', weights.bbUpper);

    return [
      {
        family: 'pullback',
        type: 'Pullback Entry',
        zoneType: 'support',
        levels: pullbackLevels,
        eligible: (trendLabel === 'Bullish' || trendScore >= 3 || statuses.ema === 'Bullish') && pullbackLevels.length > 0,
        reasons: ['Constructive trend with pullback support confluence']
      },
      {
        family: 'bounce',
        type: 'Bounce Entry',
        zoneType: 'support',
        levels: bounceLevels,
        eligible: (Number(reversal.score || 0) >= 2 || (rsi14 != null && rsi14 <= 45) || (rsi14 != null && rsi14 <= 50 && macdBull)) && bounceLevels.length > 0,
        reasons: ['Bounce setup near support/reversal zone']
      },
      {
        family: 'breakout',
        type: 'Breakout Entry',
        zoneType: 'breakout',
        levels: breakoutLevels,
        eligible: (trendLabel === 'Bullish' || trendScore >= 4 || statuses.ema === 'Bullish') && macdBull && rsi14 != null && rsi14 >= 52 && breakoutLevels.length > 0,
        reasons: ['Momentum breakout around overhead resistance']
      }
    ];
  }

  function collectEntryCandidates(indicators, timeframe, assetType) {
    var families = buildEntryCandidates(indicators, timeframe, assetType);
    var out = { trendPullback: [], bounce: [], breakout: [] };
    families.forEach(function (entry) {
      if (!entry || !Array.isArray(entry.levels)) return;
      if (entry.family === 'pullback') out.trendPullback = entry.levels.slice();
      else if (entry.family === 'bounce') out.bounce = entry.levels.slice();
      else if (entry.family === 'breakout') out.breakout = entry.levels.slice();
    });
    return out;
  }

  function buildTakeProfitCandidates(indicators, timeframe, assetType, entryZone, setupType) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var sr = values.sr || {};
    var pivot = sr.pivot || {};
    var donchian = sr.donchian || {};
    var nearest = sr.nearest || {};
    var fib = values.fib || {};
    var fibLevels = fib.levels || {};
    var close = toNumber(snapshot.close);
    var weights = getLevelWeightsForTimeframe(timeframe);
    var setup = String(setupType || '').toLowerCase();
    var ref = midpoint(entryZone && entryZone.zoneLow, entryZone && entryZone.zoneHigh);
    if (ref == null) ref = close;
    var out = [];

    function pushResistance(value, key, reason, weight) {
      var n = toNumber(value);
      if (n == null || n <= 0) return;
      if (ref == null || n > ref) pushCandidate(out, n, key, reason, weight);
    }

    var breakoutBoost = setup.indexOf('breakout') !== -1 ? 1.25 : 1;
    var bounceBias = setup.indexOf('bounce') !== -1 ? 1.15 : 1;
    pushResistance(nearest.resistance, 'nearestResistance', 'Nearest resistance', weights.nearestResistance * breakoutBoost * bounceBias);
    pushResistance(donchian.resistance, 'donchianResistance', 'Donchian resistance', weights.donchianResistance * breakoutBoost);
    pushResistance(pivot.r1, 'r1', 'Pivot R1', weights.r1 * bounceBias);
    pushResistance(pivot.r2, 'r2', 'Pivot R2', weights.r2 * breakoutBoost);
    pushResistance(values.bbUpper, 'bbUpper', 'Upper Bollinger band', weights.bbUpper);
    pushResistance(fibLevels.fib236, 'fib236', 'Fib 23.6 resistance', weights.fib236);
    pushResistance(fib.swingHigh, 'swingHigh', 'Recent swing high', Math.max(2, weights.nearestResistance || 2));
    return out;
  }

  function collectTakeProfitCandidates(indicators, timeframe, assetType, setupType) {
    return buildTakeProfitCandidates(indicators, timeframe, assetType, null, setupType);
  }

  function buildFailureExitCandidates(indicators, timeframe, assetType, entryZone, setupType) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var sr = values.sr || {};
    var pivot = sr.pivot || {};
    var donchian = sr.donchian || {};
    var nearest = sr.nearest || {};
    var fib = values.fib || {};
    var fibLevels = fib.levels || {};
    var reversalValues = values.reversal || {};
    var close = toNumber(snapshot.close);
    var weights = getLevelWeightsForTimeframe(timeframe);
    var setup = String(setupType || '').toLowerCase();
    var ref = midpoint(entryZone && entryZone.zoneLow, entryZone && entryZone.zoneHigh);
    if (ref == null) ref = close;
    var out = [];

    function pushSupport(value, key, reason, weight) {
      var n = toNumber(value);
      if (n == null || n <= 0) return;
      if (ref == null || n < ref) pushCandidate(out, n, key, reason, weight);
    }

    var bounceBias = setup.indexOf('bounce') !== -1 ? 1.2 : 1;
    pushSupport(values.ema50, 'ema50', 'EMA50 structural support', weights.ema50);
    pushSupport(values.ema200, 'ema200', 'EMA200 structural support', weights.ema200);
    pushSupport(nearest.support, 'nearestSupport', 'Nearest support', weights.nearestSupport * bounceBias);
    pushSupport(reversalValues.supportZone, 'supportZone', 'Support zone', weights.supportZone * bounceBias);
    pushSupport(donchian.midpoint, 'donchianMidpoint', 'Donchian midpoint', weights.donchianMidpoint);
    pushSupport(donchian.support, 'donchianSupport', 'Donchian support', weights.donchianSupport);
    pushSupport(fibLevels.fib618, 'fib618', 'Fib 61.8 support', weights.fib618 * bounceBias);
    pushSupport(fibLevels.fib786, 'fib786', 'Fib 78.6 support', weights.fib786 * bounceBias);
    pushSupport(pivot.s1, 's1', 'Pivot S1', weights.s1);
    pushSupport(pivot.s2, 's2', 'Pivot S2', weights.s2);
    return out;
  }

  function collectFailureExitCandidates(indicators, timeframe, assetType, setupType) {
    return buildFailureExitCandidates(indicators, timeframe, assetType, null, setupType);
  }

  function collectExitCandidates(indicators, timeframe, assetType, setupType) {
    return {
      takeProfit: collectTakeProfitCandidates(indicators, timeframe, assetType, setupType),
      defensive: collectFailureExitCandidates(indicators, timeframe, assetType, setupType)
    };
  }

  function buildShortEntryCandidates(indicators, timeframe, assetType) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var statuses = snapshot.statuses || {};
    var trendMeter = snapshot.trendMeter || {};
    var sr = values.sr || {};
    var pivot = sr.pivot || {};
    var donchian = sr.donchian || {};
    var nearest = sr.nearest || {};
    var fib = values.fib || {};
    var fibLevels = fib.levels || {};
    var close = toNumber(snapshot.close);
    var atrPct = computeAtrPct(values, close);
    var nearPct = zoneTolerancePctForAsset(assetType, atrPct) * 1.4;
    var weights = getLevelWeightsForTimeframe(timeframe);
    var trendScore = Number(trendMeter.timeframeScore || 0);
    var trendLabel = String(trendMeter.label || snapshot.overall || 'Neutral');
    var rsi14 = toNumber(values.rsi14);
    var macdLine = toNumber(values.macdLine);
    var macdSignal = toNumber(values.macdSignal);
    var macdHistogram = toNumber(values.macdHistogram);
    var adx14 = toNumber(values.adx14);
    var volumeStatus = values.volumeConfirmation && values.volumeConfirmation.status;
    var macdBear = statuses.macd === 'Bearish' || (macdLine != null && macdSignal != null && macdLine <= macdSignal) || (macdHistogram != null && macdHistogram < 0);
    var momentumStrongDown = (adx14 != null && adx14 >= 18) || trendScore <= -3 || volumeStatus === 'Bearish confirmation';

    function isNearResistance(level) {
      var n = toNumber(level);
      if (n == null || n <= 0) return false;
      if (close == null || close <= 0) return true;
      var lowBound = close * (1 - (nearPct / 100));
      var highBound = close * (1 + ((nearPct * 1.8) / 100));
      return n >= lowBound && n <= highBound;
    }

    function isNearSupport(level) {
      var n = toNumber(level);
      if (n == null || n <= 0) return false;
      if (close == null || close <= 0) return true;
      var lowBound = close * (1 - ((nearPct * 1.8) / 100));
      var highBound = close * (1 + (nearPct / 100));
      return n >= lowBound && n <= highBound;
    }

    var rejectionLevels = [];
    if (isNearResistance(values.ema20)) pushCandidate(rejectionLevels, values.ema20, 'ema20', 'EMA20 resistance test', weights.ema20);
    if (isNearResistance(values.ema50)) pushCandidate(rejectionLevels, values.ema50, 'ema50', 'EMA50 overhead resistance', weights.ema50);
    if (isNearResistance(values.ema200)) pushCandidate(rejectionLevels, values.ema200, 'ema200', 'EMA200 macro resistance', weights.ema200);
    if (isNearResistance(pivot.p)) pushCandidate(rejectionLevels, pivot.p, 'pivotP', 'Pivot P resistance', weights.pivotP);
    if (isNearResistance(nearest.resistance)) pushCandidate(rejectionLevels, nearest.resistance, 'nearestResistance', 'Nearest resistance', weights.nearestResistance);
    if (isNearResistance(donchian.midpoint)) pushCandidate(rejectionLevels, donchian.midpoint, 'donchianMidpoint', 'Donchian midpoint', weights.donchianMidpoint);
    if (isNearResistance(donchian.resistance)) pushCandidate(rejectionLevels, donchian.resistance, 'donchianResistance', 'Donchian resistance', weights.donchianResistance);
    if (isNearResistance(fibLevels.fib382)) pushCandidate(rejectionLevels, fibLevels.fib382, 'fib382', 'Fib 38.2 resistance', weights.fib382);
    if (isNearResistance(fibLevels.fib500)) pushCandidate(rejectionLevels, fibLevels.fib500, 'fib500', 'Fib 50 resistance', weights.fib500);
    if (isNearResistance(fibLevels.fib618)) pushCandidate(rejectionLevels, fibLevels.fib618, 'fib618', 'Fib 61.8 resistance', weights.fib618);
    if (isNearResistance(values.bbMiddle)) pushCandidate(rejectionLevels, values.bbMiddle, 'bbMiddle', 'Bollinger middle', Math.max(1, weights.bbUpper - 1));
    if (isNearResistance(values.bbUpper)) pushCandidate(rejectionLevels, values.bbUpper, 'bbUpper', 'Upper Bollinger band', weights.bbUpper);

    var breakdownLevels = [];
    if (isNearSupport(nearest.support)) pushCandidate(breakdownLevels, nearest.support, 'nearestSupport', 'Nearest support breakdown', weights.nearestSupport);
    if (isNearSupport(donchian.support)) pushCandidate(breakdownLevels, donchian.support, 'donchianSupport', 'Donchian support loss', weights.donchianSupport);
    if (isNearSupport(pivot.s1)) pushCandidate(breakdownLevels, pivot.s1, 's1', 'Pivot S1', weights.s1);
    if (isNearSupport(pivot.s2)) pushCandidate(breakdownLevels, pivot.s2, 's2', 'Pivot S2', weights.s2);
    if (isNearSupport(fibLevels.fib618)) pushCandidate(breakdownLevels, fibLevels.fib618, 'fib618', 'Fib 61.8 weak structure', weights.fib618);
    if (isNearSupport(fibLevels.fib786)) pushCandidate(breakdownLevels, fibLevels.fib786, 'fib786', 'Fib 78.6 weak structure', weights.fib786);
    if (isNearSupport(values.bbLower)) pushCandidate(breakdownLevels, values.bbLower, 'bbLower', 'Lower Bollinger support', weights.bbLower);

    var exhaustionLevels = [];
    if (isNearResistance(values.bbUpper)) pushCandidate(exhaustionLevels, values.bbUpper, 'bbUpper', 'Upper Bollinger stretch', weights.bbUpper);
    if (isNearResistance(nearest.resistance)) pushCandidate(exhaustionLevels, nearest.resistance, 'nearestResistance', 'Nearest resistance', weights.nearestResistance);
    if (isNearResistance(pivot.r1)) pushCandidate(exhaustionLevels, pivot.r1, 'r1', 'Pivot R1', weights.r1);
    if (isNearResistance(pivot.r2)) pushCandidate(exhaustionLevels, pivot.r2, 'r2', 'Pivot R2', weights.r2);
    if (isNearResistance(fibLevels.fib236)) pushCandidate(exhaustionLevels, fibLevels.fib236, 'fib236', 'Fib 23.6 resistance', weights.fib236);
    if (isNearResistance(donchian.resistance)) pushCandidate(exhaustionLevels, donchian.resistance, 'donchianResistance', 'Donchian resistance', weights.donchianResistance);
    if (isNearResistance(values.ema20)) pushCandidate(exhaustionLevels, values.ema20, 'ema20', 'EMA20 retest resistance', weights.ema20);

    var nearUpperBand = close != null && toNumber(values.bbUpper) != null
      ? close >= (toNumber(values.bbUpper) * 0.985)
      : false;
    var elevatedRsi = rsi14 != null && rsi14 >= 62;
    var fadingMomentum = macdHistogram != null && macdHistogram <= 0;

    return [
      {
        family: 'rejection',
        type: 'Rejection Short',
        zoneType: 'resistance',
        levels: rejectionLevels,
        eligible: (trendLabel === 'Bearish' || trendScore <= -3 || statuses.ema === 'Bearish') && rejectionLevels.length > 0,
        reasons: ['Rally into resistance inside bearish/weak regime']
      },
      {
        family: 'breakdown',
        type: 'Breakdown Short',
        zoneType: 'breakdown',
        levels: breakdownLevels,
        eligible: (trendLabel === 'Bearish' || trendScore <= -2 || statuses.ema === 'Bearish') &&
          macdBear &&
          (rsi14 == null || rsi14 <= 55) &&
          momentumStrongDown &&
          breakdownLevels.length > 0,
        reasons: ['Support breakdown continuation setup']
      },
      {
        family: 'exhaustion',
        type: 'Exhaustion Short',
        zoneType: 'resistance',
        levels: exhaustionLevels,
        eligible: (nearUpperBand || elevatedRsi || fadingMomentum || trendLabel !== 'Bullish') && exhaustionLevels.length > 0,
        reasons: ['Overextended rally into resistance with fading momentum']
      }
    ];
  }

  function buildShortCoverCandidates(indicators, timeframe, assetType, shortEntryZone) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var sr = values.sr || {};
    var pivot = sr.pivot || {};
    var donchian = sr.donchian || {};
    var nearest = sr.nearest || {};
    var fib = values.fib || {};
    var fibLevels = fib.levels || {};
    var reversalValues = values.reversal || {};
    var close = toNumber(snapshot.close);
    var ref = shortEntryZone ? midpoint(shortEntryZone.zoneLow, shortEntryZone.zoneHigh) : null;
    if (ref == null || ref <= 0) ref = close;
    var weights = getLevelWeightsForTimeframe(timeframe);
    var out = [];

    function pushSupport(value, key, reason, weight) {
      var n = toNumber(value);
      if (n == null || n <= 0) return;
      if (ref == null || n < ref) pushCandidate(out, n, key, reason, weight);
    }

    pushSupport(nearest.support, 'nearestSupport', 'Nearest support', weights.nearestSupport);
    pushSupport(reversalValues.supportZone, 'supportZone', 'Support zone', weights.supportZone);
    pushSupport(donchian.support, 'donchianSupport', 'Donchian support', weights.donchianSupport);
    pushSupport(fibLevels.fib618, 'fib618', 'Fib 61.8 support', weights.fib618);
    pushSupport(fibLevels.fib786, 'fib786', 'Fib 78.6 support', weights.fib786);
    pushSupport(pivot.s1, 's1', 'Pivot S1', weights.s1);
    pushSupport(pivot.s2, 's2', 'Pivot S2', weights.s2);
    pushSupport(values.bbLower, 'bbLower', 'Lower Bollinger band', weights.bbLower);
    pushSupport(fib.swingLow, 'swingLow', 'Recent swing low', Math.max(2, weights.nearestSupport || 2));
    return out;
  }

  function buildShortFailureExitCandidates(indicators, timeframe, assetType, shortEntryZone) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var sr = values.sr || {};
    var pivot = sr.pivot || {};
    var donchian = sr.donchian || {};
    var nearest = sr.nearest || {};
    var fib = values.fib || {};
    var fibLevels = fib.levels || {};
    var close = toNumber(snapshot.close);
    var ref = shortEntryZone ? midpoint(shortEntryZone.zoneLow, shortEntryZone.zoneHigh) : null;
    if (ref == null || ref <= 0) ref = close;
    var weights = getLevelWeightsForTimeframe(timeframe);
    var out = [];

    function pushResistance(value, key, reason, weight) {
      var n = toNumber(value);
      if (n == null || n <= 0) return;
      if (ref == null || n > ref) pushCandidate(out, n, key, reason, weight);
    }

    pushResistance(values.ema50, 'ema50', 'EMA50 invalidation', weights.ema50);
    pushResistance(values.ema200, 'ema200', 'EMA200 invalidation', weights.ema200);
    pushResistance(nearest.resistance, 'nearestResistance', 'Nearest resistance', weights.nearestResistance);
    pushResistance(donchian.resistance, 'donchianResistance', 'Donchian resistance', weights.donchianResistance);
    pushResistance(pivot.p, 'pivotP', 'Pivot P', weights.pivotP);
    pushResistance(pivot.r1, 'r1', 'Pivot R1', weights.r1);
    pushResistance(pivot.r2, 'r2', 'Pivot R2', weights.r2);
    pushResistance(fibLevels.fib382, 'fib382', 'Fib 38.2 resistance', weights.fib382);
    pushResistance(fibLevels.fib236, 'fib236', 'Fib 23.6 resistance', weights.fib236);
    pushResistance(values.bbUpper, 'bbUpper', 'Upper Bollinger band', weights.bbUpper);
    pushResistance(fib.swingHigh, 'swingHigh', 'Recent swing high', Math.max(2, weights.nearestResistance || 2));
    return out;
  }

  function isValidShortCoverZone(zone, currentClose) {
    var z = zone || {};
    var close = toNumber(currentClose);
    var low = toNumber(z.zoneLow);
    var high = toNumber(z.zoneHigh);
    if (close == null || low == null || high == null) return false;
    return low < close && high < close;
  }

  function isValidShortFailureZone(zone, currentClose) {
    var z = zone || {};
    var close = toNumber(currentClose);
    var low = toNumber(z.zoneLow);
    var high = toNumber(z.zoneHigh);
    if (close == null || low == null || high == null) return false;
    return low > close && high > close;
  }

  function computeShortRewardRisk(entryZone, coverZone, failureExitZone) {
    var entryMid = midpoint(entryZone && entryZone.zoneLow, entryZone && entryZone.zoneHigh);
    var coverMid = midpoint(coverZone && coverZone.zoneLow, coverZone && coverZone.zoneHigh);
    var failureExitMid = midpoint(failureExitZone && failureExitZone.zoneLow, failureExitZone && failureExitZone.zoneHigh);
    var rewardPct = null;
    var riskPct = null;
    var rr = null;
    if (entryMid != null && coverMid != null && entryMid > 0) rewardPct = ((entryMid - coverMid) / entryMid) * 100;
    if (entryMid != null && failureExitMid != null && entryMid > 0) riskPct = ((failureExitMid - entryMid) / entryMid) * 100;
    if (rewardPct != null && riskPct != null && riskPct > 0) rr = rewardPct / riskPct;
    return {
      entryMid: entryMid,
      coverMid: coverMid,
      failureExitMid: failureExitMid,
      rewardPct: rewardPct,
      riskPct: riskPct,
      rr: rr
    };
  }

  function validateShortTradePlan(setup, assetType, timeframe) {
    var candidate = setup || {};
    var thresholds = tradeThresholds(assetType, timeframe);
    var mode = normalizeAssetType(assetType);
    var entryZone = candidate.entryZone || null;
    var coverZone = candidate.coverZone || candidate.takeProfitZone || null;
    var failureExitZone = candidate.failureExitZone || null;
    if (!entryZone || !isFinite(entryZone.zoneLow) || !isFinite(entryZone.zoneHigh)) {
      return { valid: false, reason: 'No setup: missing short entry zone' };
    }
    if (!coverZone || !failureExitZone) {
      return { valid: false, reason: 'No setup: missing cover or failure exit zone' };
    }
    var metrics = computeShortRewardRisk(entryZone, coverZone, failureExitZone);
    if (metrics.entryMid == null || metrics.coverMid == null || metrics.failureExitMid == null || metrics.entryMid <= 0) {
      return { valid: false, reason: 'No setup: invalid short zone data', metrics: metrics };
    }
    if (!(metrics.coverMid < metrics.entryMid)) {
      return { valid: false, reason: 'No setup: invalid zone ordering', metrics: metrics };
    }
    if (!(metrics.failureExitMid > metrics.entryMid)) {
      return { valid: false, reason: 'No setup: invalid zone ordering', metrics: metrics };
    }
    var minDistance = mode === 'crypto' ? 3.0 : 2.0;
    if (metrics.rewardPct == null || metrics.rewardPct < minDistance) {
      return { valid: false, reason: 'No setup: cover too close to entry', metrics: metrics };
    }
    if (metrics.rewardPct == null || metrics.rewardPct < thresholds.minRewardPct) {
      return { valid: false, reason: 'No setup: downside too small', metrics: metrics };
    }
    if (metrics.rr == null || metrics.rr < thresholds.minRR) {
      return { valid: false, reason: 'No setup: reward/risk too weak', metrics: metrics };
    }
    return { valid: true, reason: '', metrics: metrics, thresholds: thresholds };
  }

  function scoreShortTradeSetup(candidate, indicators, timeframe, assetType) {
    var c = candidate || {};
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var statuses = snapshot.statuses || {};
    var trendMeter = snapshot.trendMeter || {};
    var trendLabel = String(trendMeter.label || snapshot.overall || 'Neutral');
    var trendScore = Number(trendMeter.timeframeScore || 0);
    var rsi14 = toNumber(values.rsi14);
    var adx14 = toNumber(values.adx14);
    var close = toNumber(snapshot.close);
    var bbUpper = toNumber(values.bbUpper);
    var volumeStatus = values.volumeConfirmation && values.volumeConfirmation.status;
    var score = 0;
    var confluenceCount = Number(c.entryZone && c.entryZone.confluenceCount || 0);
    if (confluenceCount >= 3) score += 2;
    else if (confluenceCount >= 2) score += 1;

    if ((c.type === 'Rejection Short' || c.type === 'Breakdown Short') && trendLabel === 'Bearish') score += 2;
    else if (trendLabel === 'Neutral' && trendScore <= -1) score += 1;
    else if (trendLabel === 'Bullish' && trendScore >= 3) score -= 1;

    if (statuses.macd === 'Bearish') score += 1;
    if ((c.type === 'Rejection Short' || c.type === 'Breakdown Short') && rsi14 != null && rsi14 <= 50) score += 1;
    if (c.type === 'Exhaustion Short' && rsi14 != null && rsi14 >= 62) score += 1;
    if (adx14 != null && adx14 >= 20) score += 1;
    if (volumeStatus === 'Bearish confirmation') score += 1;

    if (c.type === 'Exhaustion Short') {
      if (close != null && bbUpper != null && close >= (bbUpper * 0.985)) score += 1;
      if (rsi14 != null && rsi14 >= 68) score += 1;
      var keys = c.entryZone && Array.isArray(c.entryZone.levelKeys) ? c.entryZone.levelKeys : [];
      if (keys.indexOf('fib236') !== -1 || keys.indexOf('r1') !== -1 || keys.indexOf('r2') !== -1 || keys.indexOf('bbUpper') !== -1) score += 1;
    }

    var rr = c.rewardRisk || {};
    if (rr.rr != null && rr.rr >= 2.5) score += 2;
    else if (rr.rr != null && rr.rr >= 2.0) score += 1;

    if (trendLabel === 'Bullish' && trendScore >= 4) score -= 2;
    if (rr.rewardPct != null && rr.rewardPct < 6) score -= 2;
    if (rr.rewardPct != null && rr.riskPct != null && rr.riskPct >= rr.rewardPct) score -= 2;
    if (c.validation && !c.validation.valid) score -= 2;
    return score;
  }

  function scoreRejectionShortSetup(indicators, payload, timeframe, assetType) {
    return scoreShortTradeSetup({
      type: 'Rejection Short',
      entryZone: payload && payload.entrySetup ? payload.entrySetup.zone : null,
      rewardRisk: payload ? payload.rewardRisk : null,
      validation: payload ? payload.validation : null
    }, indicators, timeframe, assetType);
  }

  function scoreBreakdownShortSetup(indicators, payload, timeframe, assetType) {
    return scoreShortTradeSetup({
      type: 'Breakdown Short',
      entryZone: payload && payload.entrySetup ? payload.entrySetup.zone : null,
      rewardRisk: payload ? payload.rewardRisk : null,
      validation: payload ? payload.validation : null
    }, indicators, timeframe, assetType);
  }

  function scoreExhaustionShortSetup(indicators, payload, timeframe, assetType) {
    return scoreShortTradeSetup({
      type: 'Exhaustion Short',
      entryZone: payload && payload.entrySetup ? payload.entrySetup.zone : null,
      rewardRisk: payload ? payload.rewardRisk : null,
      validation: payload ? payload.validation : null
    }, indicators, timeframe, assetType);
  }

  function evaluateShortEntryCandidate(indicators, timeframe, assetType, candidate, atrPct) {
    var snapshot = indicators || {};
    var close = toNumber(snapshot.close);
    var mode = normalizeAssetType(assetType);
    var timeKey = normalizeTimeframeKey(timeframe);
    var setup = candidate || {};
    if (!Array.isArray(setup.levels) || !setup.levels.length) {
      return {
        type: setup.type || 'No setup',
        entrySetup: null,
        coverSetup: null,
        failureExitSetup: null,
        rewardRisk: {},
        setupScore: -2,
        confidence: { points: -2, label: 'Caution' },
        validation: { valid: false, reason: 'No setup: missing short entry zone' }
      };
    }

    var entryZone = buildConfluenceZone(setup.levels, mode, setup.zoneType || 'resistance', atrPct, timeKey, { referencePrice: close, atrPct: atrPct });
    var entrySetup = entryZone ? {
      type: setup.type,
      zone: entryZone,
      reasons: uniqueStrings((setup.reasons || []).concat(entryZone.reasons || []))
    } : null;
    var entryMid = midpoint(entryZone && entryZone.zoneLow, entryZone && entryZone.zoneHigh);
    var coverLevels = buildShortCoverCandidates(snapshot, timeKey, mode, entryZone);
    var failureLevels = buildShortFailureExitCandidates(snapshot, timeKey, mode, entryZone);
    var coverZone = buildConfluenceZone(coverLevels, mode, 'support', atrPct, timeKey, { referencePrice: entryMid != null ? entryMid : close, atrPct: atrPct });
    var failureExitZone = buildConfluenceZone(failureLevels, mode, 'resistance', atrPct, timeKey, { referencePrice: entryMid != null ? entryMid : close, atrPct: atrPct });
    var coverSetup = coverZone ? {
      type: 'Cover / Take Profit',
      zone: coverZone,
      reasons: uniqueStrings((coverZone.reasons || []).concat(['Downside support/cover zone']))
    } : null;
    var failureExitSetup = failureExitZone ? {
      type: 'Failure Exit',
      zone: failureExitZone,
      reasons: uniqueStrings((failureExitZone.reasons || []).concat(['Upside invalidation zone']))
    } : null;
    var rewardRisk = computeShortRewardRisk(entryZone, coverZone, failureExitZone);
    var validation = validateShortTradePlan({ entryZone: entryZone, coverZone: coverZone, failureExitZone: failureExitZone }, mode, timeKey);
    var baseSetupScore = scoreShortTradeSetup({
      type: setup.type,
      entryZone: entryZone,
      coverZone: coverZone,
      failureExitZone: failureExitZone,
      rewardRisk: rewardRisk,
      validation: validation
    }, snapshot, timeKey, mode);
    if (!setup.eligible) baseSetupScore -= 3;
    var regimeLabel = normalizeRegimeLabel(snapshot && snapshot.trendMeter ? snapshot.trendMeter.label : snapshot.overall);
    var alignmentInfo = getTradeRegimeAlignment('short', regimeLabel);
    var penaltyResult = applyRegimePenaltyToTradeScore('short', setup.type, alignmentInfo.regime, baseSetupScore, snapshot);
    var setupScore = penaltyResult.score;
    var capResult = capTradeConfidenceByRegime('short', setup.type, alignmentInfo.regime, snapshot, setupScore, rewardRisk ? rewardRisk.rr : null, {
      entryZone: entryZone,
      rewardRisk: rewardRisk,
      validation: validation
    });
    return {
      type: setup.type,
      entrySetup: entrySetup,
      coverSetup: coverSetup,
      failureExitSetup: failureExitSetup,
      rewardRisk: rewardRisk,
      setupScore: setupScore,
      confidence: {
        points: setupScore,
        label: capResult.label,
        provisionalLabel: capResult.provisionalLabel,
        maxLabel: capResult.maxLabel,
        capApplied: capResult.capApplied,
        capReason: capResult.reason,
        baseScore: baseSetupScore,
        regimePenalty: penaltyResult.penalty,
        regimePenaltyReason: penaltyResult.reason
      },
      regime: alignmentInfo,
      validation: validation,
      candidate: setup
    };
  }

  function selectBestShortTradePlan(candidates) {
    var validSetups = (Array.isArray(candidates) ? candidates : []).filter(function (entry) {
      return !!(entry && entry.validation && entry.validation.valid);
    });
    if (!validSetups.length) return null;
    validSetups.sort(function (a, b) {
      if (b.setupScore !== a.setupScore) return b.setupScore - a.setupScore;
      var bConfidence = b.confidence ? Number(b.confidence.points || 0) : 0;
      var aConfidence = a.confidence ? Number(a.confidence.points || 0) : 0;
      if (bConfidence !== aConfidence) return bConfidence - aConfidence;
      var bRr = b.rewardRisk ? Number(b.rewardRisk.rr || 0) : 0;
      var aRr = a.rewardRisk ? Number(a.rewardRisk.rr || 0) : 0;
      return bRr - aRr;
    });
    return validSetups[0];
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

  function midpoint(low, high) {
    var lo = toNumber(low);
    var hi = toNumber(high);
    if (lo == null || hi == null) return null;
    return (lo + hi) / 2;
  }

  function computeRewardRisk(entryZone, takeProfitZone, failureExitZone) {
    var entryMid = midpoint(entryZone && entryZone.zoneLow, entryZone && entryZone.zoneHigh);
    var takeProfitMid = midpoint(takeProfitZone && takeProfitZone.zoneLow, takeProfitZone && takeProfitZone.zoneHigh);
    var failureExitMid = midpoint(failureExitZone && failureExitZone.zoneLow, failureExitZone && failureExitZone.zoneHigh);
    var rewardPct = null;
    var riskPct = null;
    var rr = null;
    if (entryMid != null && takeProfitMid != null && entryMid > 0) rewardPct = ((takeProfitMid - entryMid) / entryMid) * 100;
    if (entryMid != null && failureExitMid != null && entryMid > 0) riskPct = ((entryMid - failureExitMid) / entryMid) * 100;
    if (rewardPct != null && riskPct != null && riskPct > 0) rr = rewardPct / riskPct;
    return {
      entryMid: entryMid,
      takeProfitMid: takeProfitMid,
      failureExitMid: failureExitMid,
      rewardPct: rewardPct,
      riskPct: riskPct,
      rr: rr
    };
  }

  function validateTradePlan(setup, assetType, timeframe) {
    var candidate = setup || {};
    var thresholds = tradeThresholds(assetType, timeframe);
    var entryZone = candidate.entryZone || null;
    var takeProfitZone = candidate.takeProfitZone || null;
    var failureExitZone = candidate.failureExitZone || null;
    if (!entryZone || !isFinite(entryZone.zoneLow) || !isFinite(entryZone.zoneHigh)) {
      return { valid: false, reason: 'No setup: missing entry zone' };
    }
    if (!takeProfitZone || !failureExitZone) {
      return { valid: false, reason: 'No setup: missing take-profit or failure exit zone' };
    }
    var metrics = computeRewardRisk(entryZone, takeProfitZone, failureExitZone);
    if (metrics.entryMid == null || metrics.takeProfitMid == null || metrics.failureExitMid == null || metrics.entryMid <= 0) {
      return { valid: false, reason: 'No setup: invalid zone data', metrics: metrics };
    }
    if (!(metrics.takeProfitMid > metrics.entryMid)) {
      return { valid: false, reason: 'No setup: invalid zone ordering', metrics: metrics };
    }
    if (!(metrics.failureExitMid < metrics.entryMid)) {
      return { valid: false, reason: 'No setup: invalid zone ordering', metrics: metrics };
    }
    if (metrics.rewardPct == null || metrics.rewardPct < thresholds.minTakeProfitDistancePct) {
      return { valid: false, reason: 'No setup: take-profit too close to entry', metrics: metrics };
    }
    if (metrics.rewardPct == null || metrics.rewardPct < thresholds.minRewardPct) {
      return { valid: false, reason: 'No setup: upside too small', metrics: metrics };
    }
    if (metrics.rr == null || metrics.rr < thresholds.minRR) {
      return { valid: false, reason: 'No setup: reward/risk too weak', metrics: metrics };
    }
    return { valid: true, reason: '', metrics: metrics, thresholds: thresholds };
  }

  function mapTradeConfidenceLabel(points) {
    var p = Number(points) || 0;
    if (p >= 7) return 'Strong';
    if (p >= 4) return 'Moderate';
    return 'Caution';
  }

  function confidenceRank(label) {
    var v = String(label || '').toLowerCase();
    if (v === 'strong') return 3;
    if (v === 'moderate') return 2;
    return 1;
  }

  function confidenceLabelFromRank(rank) {
    var r = Math.max(1, Math.min(3, Number(rank) || 1));
    if (r >= 3) return 'Strong';
    if (r >= 2) return 'Moderate';
    return 'Caution';
  }

  function normalizeRegimeLabel(label) {
    var v = String(label || 'Neutral').toLowerCase();
    if (v === 'bullish') return 'Bullish';
    if (v === 'bearish') return 'Bearish';
    return 'Neutral';
  }

  function getTradeRegimeAlignment(side, timeframeTrendLabel) {
    var tradeSide = String(side || 'long').toLowerCase() === 'short' ? 'short' : 'long';
    var regime = normalizeRegimeLabel(timeframeTrendLabel);
    var alignment = 'neutral-regime';
    if (tradeSide === 'long') {
      if (regime === 'Bullish') alignment = 'trend-aligned';
      else if (regime === 'Bearish') alignment = 'countertrend';
    } else {
      if (regime === 'Bearish') alignment = 'trend-aligned';
      else if (regime === 'Bullish') alignment = 'countertrend';
    }
    return {
      side: tradeSide,
      regime: regime,
      alignment: alignment
    };
  }

  function hasStrongZoneConfluence(zone) {
    var z = zone || {};
    var count = Number(z.confluenceCount || 0);
    var score = Number(z.score || 0);
    return count >= 3 || score >= 7;
  }

  function hasExceptionalCountertrendLongEvidence(payload) {
    var ctx = payload || {};
    var snapshot = ctx.indicators || {};
    var values = snapshot.values || {};
    var statuses = snapshot.statuses || {};
    var reversal = snapshot.reversal || {};
    var rr = Number(ctx.rr);
    var reversalScore = Number(reversal.score || 0);
    var confluenceStrong = hasStrongZoneConfluence(ctx.entryZone);
    var macdImproving = statuses.macd === 'Bullish' || !!(values.reversal && values.reversal.macdHistogramRising);
    var rsi14 = toNumber(values.rsi14);
    var rsiRecovering = rsi14 != null && rsi14 >= 32 && rsi14 <= 60 && !(statuses.rsi === 'Bearish' && rsi14 < 35);
    return reversalScore >= 4 &&
      confluenceStrong &&
      isFinite(rr) && rr >= 2.2 &&
      macdImproving &&
      rsiRecovering;
  }

  function hasStrongCountertrendShortEvidence(payload) {
    var ctx = payload || {};
    var snapshot = ctx.indicators || {};
    var values = snapshot.values || {};
    var statuses = snapshot.statuses || {};
    var entryZone = ctx.entryZone || {};
    var rr = Number(ctx.rr);
    var rsi14 = toNumber(values.rsi14);
    var macdHistogram = toNumber(values.macdHistogram);
    var macdWeakening = statuses.macd === 'Bearish' || (macdHistogram != null && macdHistogram <= 0);
    var rsiExtended = (rsi14 != null && rsi14 >= 60) || (rsi14 != null && rsi14 >= 55 && macdWeakening);
    var confluenceStrong = hasStrongZoneConfluence(entryZone);
    var levelKeys = Array.isArray(entryZone.levelKeys) ? entryZone.levelKeys : [];
    var resistanceEvidenceCount = levelKeys.filter(function (key) {
      return ['bbUpper', 'r1', 'r2', 'nearestResistance', 'donchianResistance', 'fib236', 'ema50', 'ema200'].indexOf(String(key)) !== -1;
    }).length;
    var exhaustionEvidenceStrong = (ctx.setupType === 'Exhaustion Short' || ctx.setupType === 'Rejection Short') && resistanceEvidenceCount >= 2;
    return confluenceStrong &&
      isFinite(rr) && rr >= 2.2 &&
      macdWeakening &&
      rsiExtended &&
      exhaustionEvidenceStrong;
  }

  function hasExceptionalCountertrendShortEvidence(payload) {
    return hasStrongCountertrendShortEvidence(payload);
  }

  function applyRegimePenaltyToTradeScore(side, setupType, regime, baseScore, indicators) {
    var tradeSide = String(side || 'long').toLowerCase() === 'short' ? 'short' : 'long';
    var setup = String(setupType || '');
    var alignedRegime = normalizeRegimeLabel(regime);
    var score = Number(baseScore) || 0;
    var penalty = 0;
    var reason = 'aligned-regime';
    if (tradeSide === 'long') {
      if (alignedRegime === 'Neutral') {
        penalty -= 1;
        reason = 'neutral-regime';
      } else if (alignedRegime === 'Bearish') {
        penalty -= 3;
        reason = 'countertrend-bearish-regime';
        if (setup === 'Pullback Entry' || setup === 'Breakout Entry') penalty -= 1;
      }
    } else {
      if (alignedRegime === 'Neutral') {
        penalty -= 1;
        reason = 'neutral-regime';
      } else if (alignedRegime === 'Bullish') {
        penalty -= 3;
        reason = 'countertrend-bullish-regime';
        if (setup === 'Breakdown Short') penalty -= 1;
      }
    }
    return {
      score: score + penalty,
      penalty: penalty,
      reason: reason
    };
  }

  function capTradeConfidenceByRegime(side, setupType, regime, indicators, score, rr, context) {
    var tradeSide = String(side || 'long').toLowerCase() === 'short' ? 'short' : 'long';
    var alignedRegime = normalizeRegimeLabel(regime);
    var setup = String(setupType || '');
    var provisionalLabel = mapTradeConfidenceLabel(score);
    var provisionalRank = confidenceRank(provisionalLabel);
    var maxRank = 3;
    var capReason = '';
    var payload = Object.assign({}, context || {}, {
      setupType: setup,
      indicators: indicators || {},
      rr: rr
    });

    if (tradeSide === 'long') {
      if (alignedRegime === 'Neutral') {
        if (!(isFinite(Number(rr)) && Number(rr) >= 2.2 && hasStrongZoneConfluence(payload.entryZone))) {
          maxRank = Math.min(maxRank, 2);
          capReason = 'neutral-long-requires-extra-confluence-for-strong';
        }
      } else if (alignedRegime === 'Bearish') {
        var reversalScore = Number((indicators && indicators.reversal && indicators.reversal.score) || 0);
        var supportStrong = hasStrongZoneConfluence(payload.entryZone);
        var exceptionalLong = hasExceptionalCountertrendLongEvidence(payload);
        if (exceptionalLong) {
          maxRank = Math.min(maxRank, 3);
          capReason = 'countertrend-long-exceptional-evidence';
        } else if (reversalScore >= 4 && supportStrong) {
          maxRank = Math.min(maxRank, 2);
          capReason = 'countertrend-long-capped-moderate';
        } else if (reversalScore < 4) {
          maxRank = Math.min(maxRank, 1);
          capReason = 'countertrend-long-low-reversal-capped-caution';
        } else {
          maxRank = Math.min(maxRank, 1);
          capReason = 'countertrend-long-insufficient-support-capped-caution';
        }
        if (setup === 'Breakout Entry' && !exceptionalLong) {
          maxRank = Math.min(maxRank, 1);
          capReason = 'countertrend-long-breakout-capped-caution';
        }
      }
    } else {
      if (alignedRegime === 'Neutral') {
        if (!(isFinite(Number(rr)) && Number(rr) >= 2.2 && hasStrongZoneConfluence(payload.entryZone))) {
          maxRank = Math.min(maxRank, 2);
          capReason = 'neutral-short-requires-extra-confluence-for-strong';
        }
      } else if (alignedRegime === 'Bullish') {
        var strongCounterShort = hasStrongCountertrendShortEvidence(payload);
        var exceptionalShort = hasExceptionalCountertrendShortEvidence(payload);
        if (exceptionalShort) {
          maxRank = Math.min(maxRank, 3);
          capReason = 'countertrend-short-exceptional-evidence';
        } else if (strongCounterShort || setup === 'Exhaustion Short') {
          maxRank = Math.min(maxRank, 2);
          capReason = 'countertrend-short-capped-moderate';
        } else {
          maxRank = Math.min(maxRank, 1);
          capReason = 'countertrend-short-capped-caution';
        }
        if ((setup === 'Breakdown Short' || setup === 'Rejection Short') && !exceptionalShort) {
          maxRank = Math.min(maxRank, 1);
          capReason = 'countertrend-short-non-exhaustion-capped-caution';
        }
      }
    }

    var finalRank = Math.min(provisionalRank, maxRank);
    return {
      label: confidenceLabelFromRank(finalRank),
      provisionalLabel: provisionalLabel,
      maxLabel: confidenceLabelFromRank(maxRank),
      capApplied: finalRank < provisionalRank,
      reason: capReason || 'no-cap',
      finalRank: finalRank,
      provisionalRank: provisionalRank,
      maxRank: maxRank
    };
  }

  function scoreTradeSetup(candidate, indicators, timeframe, assetType) {
    var c = candidate || {};
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var statuses = snapshot.statuses || {};
    var trendMeter = snapshot.trendMeter || {};
    var reversal = snapshot.reversal || {};
    var trendLabel = String(trendMeter.label || snapshot.overall || 'Neutral');
    var trendScore = Number(trendMeter.timeframeScore || 0);
    var rsi14 = toNumber(values.rsi14);
    var adx14 = toNumber(values.adx14);
    var volumeStatus = values.volumeConfirmation && values.volumeConfirmation.status;
    var score = 0;
    var confluenceCount = Number(c.entryZone && c.entryZone.confluenceCount || 0);
    if (confluenceCount >= 3) score += 2;
    else if (confluenceCount >= 2) score += 1;

    if ((c.type === 'Pullback Entry' || c.type === 'Breakout Entry') && trendLabel === 'Bullish') score += 2;
    else if (trendLabel === 'Neutral' && trendScore >= 1) score += 1;
    else if (trendLabel === 'Bearish' && adx14 != null && adx14 >= 25) score -= 1;

    if (statuses.macd === 'Bullish') score += 1;
    if (c.type === 'Bounce Entry') {
      if (rsi14 != null && rsi14 <= 55) score += 1;
    } else if (c.type === 'Breakout Entry') {
      if (rsi14 != null && rsi14 >= 50) score += 1;
    } else if (rsi14 != null && rsi14 >= 45 && rsi14 <= 70) {
      score += 1;
    }
    if (adx14 != null && adx14 >= 18) score += 1;
    if (volumeStatus === 'Bullish confirmation') score += 1;

    if (Number(reversal.score || 0) >= 2) score += 1;
    if (c.type === 'Bounce Entry' && Number(reversal.score || 0) >= 3) score += 2;

    var rr = c.rewardRisk || {};
    if (rr.rr != null && rr.rr >= 2.5) score += 2;
    else if (rr.rr != null && rr.rr >= 2.0) score += 1;

    if (trendLabel === 'Bearish' && adx14 != null && adx14 >= 25) score -= 2;
    if (rr.entryMid != null && rr.takeProfitMid != null && ((rr.takeProfitMid - rr.entryMid) / rr.entryMid) < 0.06) score -= 2;
    if (c.validation && !c.validation.valid && c.validation.reason) score -= 2;
    return score;
  }

  function scoreTrendPullbackSetup(indicators, payload, timeframe, assetType) {
    return scoreTradeSetup({
      type: 'Pullback Entry',
      entryZone: payload && payload.entrySetup ? payload.entrySetup.zone : null,
      rewardRisk: payload ? payload.rewardRisk : null,
      validation: payload ? payload.validation : null
    }, indicators, timeframe, assetType);
  }

  function scoreBounceSetup(indicators, payload, timeframe, assetType) {
    return scoreTradeSetup({
      type: 'Bounce Entry',
      entryZone: payload && payload.entrySetup ? payload.entrySetup.zone : null,
      rewardRisk: payload ? payload.rewardRisk : null,
      validation: payload ? payload.validation : null
    }, indicators, timeframe, assetType);
  }

  function scoreBreakoutSetup(indicators, payload, timeframe, assetType) {
    return scoreTradeSetup({
      type: 'Breakout Entry',
      entryZone: payload && payload.entrySetup ? payload.entrySetup.zone : null,
      rewardRisk: payload ? payload.rewardRisk : null,
      validation: payload ? payload.validation : null
    }, indicators, timeframe, assetType);
  }

  function evaluateEntryCandidate(indicators, timeframe, assetType, candidate, atrPct) {
    var snapshot = indicators || {};
    var close = toNumber(snapshot.close);
    var mode = normalizeAssetType(assetType);
    var timeKey = normalizeTimeframeKey(timeframe);
    var setup = candidate || {};
    if (!Array.isArray(setup.levels) || !setup.levels.length) {
      return {
        type: setup.type || 'No setup',
        entrySetup: null,
        takeProfitSetup: null,
        failureExitSetup: null,
        rewardRisk: {},
        setupScore: -2,
        confidence: { points: -2, label: 'Caution' },
        validation: { valid: false, reason: 'No setup: missing entry zone' }
      };
    }

    var entryZone = buildConfluenceZone(setup.levels, mode, setup.zoneType || 'support', atrPct, timeKey, { referencePrice: close, atrPct: atrPct });
    var entrySetup = entryZone ? {
      type: setup.type,
      zone: entryZone,
      reasons: uniqueStrings((setup.reasons || []).concat(entryZone.reasons || []))
    } : null;
    var entryMid = midpoint(entryZone && entryZone.zoneLow, entryZone && entryZone.zoneHigh);
    var takeProfitLevels = buildTakeProfitCandidates(snapshot, timeKey, mode, entryZone, setup.type);
    var failureLevels = buildFailureExitCandidates(snapshot, timeKey, mode, entryZone, setup.type);
    var takeProfitZone = buildConfluenceZone(takeProfitLevels, mode, 'resistance', atrPct, timeKey, { referencePrice: entryMid != null ? entryMid : close, atrPct: atrPct });
    var failureExitZone = buildConfluenceZone(failureLevels, mode, 'support', atrPct, timeKey, { referencePrice: entryMid != null ? entryMid : close, atrPct: atrPct });
    var takeProfitSetup = takeProfitZone ? {
      type: 'Take Profit Zone',
      zone: takeProfitZone,
      reasons: uniqueStrings((takeProfitZone.reasons || []).concat(['Overhead resistance cluster']))
    } : null;
    var failureExitSetup = failureExitZone ? {
      type: 'Failure Exit Zone',
      zone: failureExitZone,
      reasons: uniqueStrings((failureExitZone.reasons || []).concat(['Downside invalidation zone']))
    } : null;
    var rewardRisk = computeRewardRisk(entryZone, takeProfitZone, failureExitZone);
    var validation = validateTradePlan({ entryZone: entryZone, takeProfitZone: takeProfitZone, failureExitZone: failureExitZone }, mode, timeKey);
    var baseSetupScore = scoreTradeSetup({
      type: setup.type,
      entryZone: entryZone,
      takeProfitZone: takeProfitZone,
      failureExitZone: failureExitZone,
      rewardRisk: rewardRisk,
      validation: validation
    }, snapshot, timeKey, mode);
    if (!setup.eligible) baseSetupScore -= 3;
    var regimeLabel = normalizeRegimeLabel(snapshot && snapshot.trendMeter ? snapshot.trendMeter.label : snapshot.overall);
    var alignmentInfo = getTradeRegimeAlignment('long', regimeLabel);
    var penaltyResult = applyRegimePenaltyToTradeScore('long', setup.type, alignmentInfo.regime, baseSetupScore, snapshot);
    var setupScore = penaltyResult.score;
    var capResult = capTradeConfidenceByRegime('long', setup.type, alignmentInfo.regime, snapshot, setupScore, rewardRisk ? rewardRisk.rr : null, {
      entryZone: entryZone,
      rewardRisk: rewardRisk,
      validation: validation
    });
    return {
      type: setup.type,
      entrySetup: entrySetup,
      takeProfitSetup: takeProfitSetup,
      failureExitSetup: failureExitSetup,
      rewardRisk: rewardRisk,
      setupScore: setupScore,
      confidence: {
        points: setupScore,
        label: capResult.label,
        provisionalLabel: capResult.provisionalLabel,
        maxLabel: capResult.maxLabel,
        capApplied: capResult.capApplied,
        capReason: capResult.reason,
        baseScore: baseSetupScore,
        regimePenalty: penaltyResult.penalty,
        regimePenaltyReason: penaltyResult.reason
      },
      regime: alignmentInfo,
      validation: validation,
      candidate: setup
    };
  }

  function selectBestTradePlan(candidates) {
    var validSetups = (Array.isArray(candidates) ? candidates : []).filter(function (entry) {
      return !!(entry && entry.validation && entry.validation.valid);
    });
    if (!validSetups.length) return null;
    validSetups.sort(function (a, b) {
      if (b.setupScore !== a.setupScore) return b.setupScore - a.setupScore;
      var bConfidence = b.confidence ? Number(b.confidence.points || 0) : 0;
      var aConfidence = a.confidence ? Number(a.confidence.points || 0) : 0;
      if (bConfidence !== aConfidence) return bConfidence - aConfidence;
      var bRr = b.rewardRisk ? Number(b.rewardRisk.rr || 0) : 0;
      var aRr = a.rewardRisk ? Number(a.rewardRisk.rr || 0) : 0;
      return bRr - aRr;
    });
    return validSetups[0];
  }

  function selectBestTradeSetup(candidates) {
    return selectBestTradePlan(candidates);
  }

  function evaluateTrendPullbackSetup(indicators, timeframe, assetType) {
    var candidates = buildEntryCandidates(indicators, timeframe, assetType);
    var pick = candidates.filter(function (x) { return x.family === 'pullback'; })[0] || null;
    if (!pick) return null;
    var snapshot = indicators || {};
    var atrPct = computeAtrPct(snapshot.values || {}, toNumber(snapshot.close));
    return evaluateEntryCandidate(indicators, timeframe, assetType, pick, atrPct);
  }

  function evaluateBounceSetup(indicators, timeframe, assetType) {
    var candidates = buildEntryCandidates(indicators, timeframe, assetType);
    var pick = candidates.filter(function (x) { return x.family === 'bounce'; })[0] || null;
    if (!pick) return null;
    var snapshot = indicators || {};
    var atrPct = computeAtrPct(snapshot.values || {}, toNumber(snapshot.close));
    return evaluateEntryCandidate(indicators, timeframe, assetType, pick, atrPct);
  }

  function evaluateBreakoutSetup(indicators, timeframe, assetType) {
    var candidates = buildEntryCandidates(indicators, timeframe, assetType);
    var pick = candidates.filter(function (x) { return x.family === 'breakout'; })[0] || null;
    if (!pick) return null;
    var snapshot = indicators || {};
    var atrPct = computeAtrPct(snapshot.values || {}, toNumber(snapshot.close));
    return evaluateEntryCandidate(indicators, timeframe, assetType, pick, atrPct);
  }

  function selectEntrySetup(indicators, timeframe, assetType) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var close = toNumber(snapshot.close);
    var mode = normalizeAssetType(assetType);
    var timeKey = normalizeTimeframeKey(timeframe || snapshot.timeKey || '1d');
    var atrPct = computeAtrPct(values, close);
    var candidates = buildEntryCandidates(snapshot, timeKey, mode).map(function (entry) {
      return evaluateEntryCandidate(snapshot, timeKey, mode, entry, atrPct);
    });
    var best = selectBestTradePlan(candidates);
    return best ? best.entrySetup : null;
  }

  function selectTakeProfitSetup(indicators, timeframe, assetType, precomputedCandidates, setupType) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var close = toNumber(snapshot.close);
    var timeKey = normalizeTimeframeKey(timeframe || snapshot.timeKey || '1d');
    var mode = normalizeAssetType(assetType);
    var atrPct = computeAtrPct(values, close);
    var levels = Array.isArray(precomputedCandidates) ? precomputedCandidates : buildTakeProfitCandidates(snapshot, timeKey, mode, null, setupType);
    var takeProfitZone = buildConfluenceZone(levels, mode, 'resistance', atrPct, timeKey, { referencePrice: close, atrPct: atrPct });
    if (takeProfitZone && isValidTakeProfitZone(takeProfitZone, close)) {
      return { type: 'Take Profit Zone', zone: takeProfitZone, reasons: uniqueStrings((takeProfitZone.reasons || []).concat(['Overhead resistance cluster'])) };
    }
    return null;
  }

  function selectFailureExitSetup(indicators, timeframe, assetType, precomputedCandidates, setupType) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var close = toNumber(snapshot.close);
    var timeKey = normalizeTimeframeKey(timeframe || snapshot.timeKey || '1d');
    var mode = normalizeAssetType(assetType);
    var atrPct = computeAtrPct(values, close);
    var levels = Array.isArray(precomputedCandidates) ? precomputedCandidates : buildFailureExitCandidates(snapshot, timeKey, mode, null, setupType);
    var failureZone = buildConfluenceZone(levels, mode, 'support', atrPct, timeKey, { referencePrice: close, atrPct: atrPct });
    if (failureZone && isValidFailureZone(failureZone, close)) {
      return { type: 'Failure Exit Zone', zone: failureZone, reasons: uniqueStrings((failureZone.reasons || []).concat(['Downside invalidation zone'])) };
    }
    return null;
  }

  function selectExitSetup(indicators, timeframe, assetType, precomputedCandidates, setupType) {
    return selectTakeProfitSetup(indicators, timeframe, assetType, precomputedCandidates, setupType) ||
      selectFailureExitSetup(indicators, timeframe, assetType, precomputedCandidates, setupType);
  }

  function formatTradeDebugNumber(value, digits) {
    var n = Number(value);
    if (!isFinite(n)) return 'n/a';
    var d = Number.isFinite(Number(digits)) ? Math.max(0, Number(digits)) : 2;
    return n.toFixed(d);
  }

  function buildTradePlanDebugDump(timeframe, chosenSetup, candidateSetups, rejectionReason) {
    var lines = [];
    lines.push('timeframe=' + String(timeframe || '1d').toUpperCase());
    lines.push('chosen=' + String(chosenSetup || 'none'));
    if (rejectionReason) lines.push('rejection=' + String(rejectionReason));
    (Array.isArray(candidateSetups) ? candidateSetups : []).forEach(function (item) {
      var row = item || {};
      lines.push(
        String(row.type || 'unknown') +
        ' regime=' + String(row.regime || 'n/a') +
        ' alignment=' + String(row.alignment || 'n/a') +
        ' base=' + formatTradeDebugNumber(row.baseScore, 1) +
        ' penalty=' + formatTradeDebugNumber(row.regimePenalty, 1) +
        ' score=' + formatTradeDebugNumber(row.setupScore, 1) +
        ' conf=' + String(row.confidenceLabel || 'n/a') +
        (row.confidenceCapApplied ? (' cap=' + String(row.confidenceMaxLabel || 'n/a')) : '') +
        (row.confidenceCapReason ? (' capReason=' + String(row.confidenceCapReason)) : '') +
        ' entryMid=' + formatTradeDebugNumber(row.entryMid, 4) +
        ' tpMid=' + formatTradeDebugNumber(row.takeProfitMid, 4) +
        ' failMid=' + formatTradeDebugNumber(row.failureExitMid, 4) +
        ' reward=' + formatTradeDebugNumber(row.rewardPct, 2) + '%' +
        ' risk=' + formatTradeDebugNumber(row.riskPct, 2) + '%' +
        ' rr=' + formatTradeDebugNumber(row.rr, 2) +
        ' valid=' + String(!(row.validation && row.validation.valid === false)) +
        (row.validationReason ? (' reason=' + String(row.validationReason)) : '')
      );
    });
    return lines.join(' | ');
  }

  function computeHolderExitPlan(indicators, timeframe, assetType, atrPct, entrySetup) {
    var snapshot = indicators || {};
    var close = toNumber(snapshot.close);
    var mode = normalizeAssetType(assetType);
    var timeKey = normalizeTimeframeKey(timeframe || snapshot.timeKey || '1d');
    var entryZone = entrySetup && entrySetup.zone ? entrySetup.zone : null;
    var takeProfitLevels = buildTakeProfitCandidates(snapshot, timeKey, mode, entryZone, entrySetup ? entrySetup.type : '');
    var failureLevels = buildFailureExitCandidates(snapshot, timeKey, mode, entryZone, entrySetup ? entrySetup.type : '');
    var takeProfitZone = buildConfluenceZone(takeProfitLevels, mode, 'resistance', atrPct, timeKey, { referencePrice: close, atrPct: atrPct });
    var failureZone = buildConfluenceZone(failureLevels, mode, 'support', atrPct, timeKey, { referencePrice: close, atrPct: atrPct });
    if (takeProfitZone && !isValidTakeProfitZone(takeProfitZone, close)) takeProfitZone = null;
    if (failureZone && !isValidFailureZone(failureZone, close)) failureZone = null;
    return {
      available: !!(takeProfitZone || failureZone),
      takeProfitSetup: takeProfitZone ? {
        type: 'Take Profit / Trim Zone',
        zone: takeProfitZone,
        reasons: uniqueStrings((takeProfitZone.reasons || []).concat(['Holder trim zone from overhead resistance']))
      } : null,
      failureExitSetup: failureZone ? {
        type: 'Failure Exit Zone',
        zone: failureZone,
        reasons: uniqueStrings((failureZone.reasons || []).concat(['Holder invalidation zone']))
      } : null
    };
  }

  function computeTradePlan(indicators, timeframe, assetType) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var close = toNumber(snapshot.close);
    var mode = normalizeAssetType(assetType);
    var timeKey = normalizeTimeframeKey(timeframe || snapshot.timeKey || '1d');
    var fib = values.fib || {};
    var sr = values.sr || {};
    var atrPct = computeAtrPct(values, close);
    if (atrPct == null) atrPct = mode === 'crypto' ? 3.0 : 1.5;

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
        confidence: 'Caution',
        confidencePoints: 0,
        rewardPct: null,
        riskPct: null,
        rr: null,
        reasons: [],
        note: 'Estimated entry/exit zones are derived from technical indicator confluence and are not guaranteed.',
        reason: 'Not enough data'
      };
    }

    var entryFamilies = buildEntryCandidates(snapshot, timeKey, mode);
    var evaluatedCandidates = entryFamilies.map(function (entry) {
      return evaluateEntryCandidate(snapshot, timeKey, mode, entry, atrPct);
    });
    var candidateDebug = evaluatedCandidates.map(function (item) {
      return {
        type: item.type,
        eligible: !!(item.candidate && item.candidate.eligible),
        regime: item.regime ? item.regime.regime : null,
        alignment: item.regime ? item.regime.alignment : null,
        setupScore: item.setupScore,
        confidencePoints: item.confidence ? item.confidence.points : 0,
        confidenceLabel: item.confidence ? item.confidence.label : null,
        provisionalConfidenceLabel: item.confidence ? item.confidence.provisionalLabel : null,
        confidenceCapApplied: item.confidence ? !!item.confidence.capApplied : false,
        confidenceCapReason: item.confidence ? item.confidence.capReason : '',
        confidenceMaxLabel: item.confidence ? item.confidence.maxLabel : null,
        baseScore: item.confidence ? item.confidence.baseScore : item.setupScore,
        regimePenalty: item.confidence ? item.confidence.regimePenalty : 0,
        regimePenaltyReason: item.confidence ? item.confidence.regimePenaltyReason : '',
        entryMid: item.rewardRisk ? item.rewardRisk.entryMid : null,
        takeProfitMid: item.rewardRisk ? item.rewardRisk.takeProfitMid : null,
        failureExitMid: item.rewardRisk ? item.rewardRisk.failureExitMid : null,
        rewardPct: item.rewardRisk ? item.rewardRisk.rewardPct : null,
        riskPct: item.rewardRisk ? item.rewardRisk.riskPct : null,
        rr: item.rewardRisk ? item.rewardRisk.rr : null,
        validation: item.validation || null,
        validationReason: item.validation && item.validation.reason ? item.validation.reason : ''
      };
    });

    var bestEntry = selectBestTradePlan(evaluatedCandidates);
    var holderPlan = computeHolderExitPlan(snapshot, timeKey, mode, atrPct, bestEntry ? bestEntry.entrySetup : null);

    var rejection = 'No setup: no clean confluence setup';
    for (var i = 0; i < evaluatedCandidates.length; i++) {
      if (evaluatedCandidates[i] && evaluatedCandidates[i].validation && evaluatedCandidates[i].validation.reason) {
        rejection = evaluatedCandidates[i].validation.reason;
        break;
      }
    }

    if (!bestEntry && !holderPlan.available) {
      return {
        available: false,
        timeframe: timeKey,
        assetType: mode,
        entryType: 'No setup',
        takeProfitType: 'No clear take-profit zone',
        failureExitType: 'No clear failure exit',
        exitType: 'No setup',
        confidence: 'Caution',
        confidencePoints: 0,
        rewardPct: null,
        riskPct: null,
        rr: null,
        reasons: [],
        note: 'Estimated entry/exit zones are derived from technical indicator confluence and are not guaranteed.',
        reason: rejection,
        debug: {
          timeframe: timeKey,
          atrPct: atrPct,
          candidateEntryClusters: entryFamilies,
          candidateSetups: candidateDebug,
          chosenSetup: null,
          rejectionReason: rejection,
          dump: buildTradePlanDebugDump(timeKey, null, candidateDebug, rejection)
        }
      };
    }

    var entrySetup = bestEntry ? bestEntry.entrySetup : null;
    var takeProfitSetup = bestEntry ? bestEntry.takeProfitSetup : holderPlan.takeProfitSetup;
    var failureExitSetup = bestEntry ? bestEntry.failureExitSetup : holderPlan.failureExitSetup;
    var rewardRisk = bestEntry ? bestEntry.rewardRisk : {};
    var primaryExitSetup = takeProfitSetup || failureExitSetup || null;
    var confidenceLabel = bestEntry && bestEntry.confidence ? String(bestEntry.confidence.label || mapTradeConfidenceLabel(bestEntry.setupScore)) : 'Caution';
    var confidencePoints = bestEntry && bestEntry.confidence ? Number(bestEntry.confidence.points || bestEntry.setupScore || 0) : 1;
    var combinedReasons = uniqueStrings(
      (entrySetup && entrySetup.reasons ? entrySetup.reasons : [])
        .concat(takeProfitSetup && takeProfitSetup.reasons ? takeProfitSetup.reasons : [])
        .concat(failureExitSetup && failureExitSetup.reasons ? failureExitSetup.reasons : [])
        .concat(bestEntry ? [] : ['No fresh entry setup passed 5% reward and minimum RR'])
    );

    return {
      available: true,
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
      confidence: confidenceLabel,
      confidencePoints: confidencePoints,
      rewardPct: bestEntry && rewardRisk.rewardPct != null ? rewardRisk.rewardPct : null,
      riskPct: bestEntry && rewardRisk.riskPct != null ? rewardRisk.riskPct : null,
      rr: bestEntry && rewardRisk.rr != null ? rewardRisk.rr : null,
      reasons: combinedReasons,
      entryReasons: entrySetup && entrySetup.reasons ? entrySetup.reasons : [],
      takeProfitReasons: takeProfitSetup && takeProfitSetup.reasons ? takeProfitSetup.reasons : [],
      failureExitReasons: failureExitSetup && failureExitSetup.reasons ? failureExitSetup.reasons : [],
      exitReasons: primaryExitSetup && primaryExitSetup.reasons ? primaryExitSetup.reasons : [],
      note: 'Estimated entry/exit zones are derived from technical indicator confluence and are not guaranteed.',
      reason: bestEntry ? '' : rejection,
      debug: {
        side: 'long',
        timeframe: timeKey,
        atrPct: atrPct,
        candidateEntryClusters: entryFamilies,
        candidateSetups: candidateDebug,
        holderTakeProfitCluster: takeProfitSetup && takeProfitSetup.zone ? takeProfitSetup.zone : null,
        holderFailureExitCluster: failureExitSetup && failureExitSetup.zone ? failureExitSetup.zone : null,
        chosenSetup: bestEntry ? bestEntry.type : 'Holder Exit Plan',
        timeframeRegime: bestEntry && bestEntry.regime ? bestEntry.regime.regime : normalizeRegimeLabel(snapshot && snapshot.trendMeter ? snapshot.trendMeter.label : snapshot.overall),
        alignment: bestEntry && bestEntry.regime ? bestEntry.regime.alignment : 'n/a',
        baseScore: bestEntry && bestEntry.confidence ? bestEntry.confidence.baseScore : null,
        regimePenalty: bestEntry && bestEntry.confidence ? bestEntry.confidence.regimePenalty : null,
        regimePenaltyReason: bestEntry && bestEntry.confidence ? bestEntry.confidence.regimePenaltyReason : '',
        confidenceCapApplied: bestEntry && bestEntry.confidence ? !!bestEntry.confidence.capApplied : false,
        confidenceCapReason: bestEntry && bestEntry.confidence ? bestEntry.confidence.capReason : '',
        finalConfidence: confidenceLabel,
        rewardPct: bestEntry && rewardRisk.rewardPct != null ? rewardRisk.rewardPct : null,
        riskPct: bestEntry && rewardRisk.riskPct != null ? rewardRisk.riskPct : null,
        rr: bestEntry && rewardRisk.rr != null ? rewardRisk.rr : null,
        rejectionReason: bestEntry ? '' : rejection,
        dump: buildTradePlanDebugDump(timeKey, bestEntry ? bestEntry.type : 'Holder Exit Plan', candidateDebug, bestEntry ? '' : rejection)
      }
    };
  }

  function buildShortTradePlanDebugDump(timeframe, chosenSetup, candidateSetups, rejectionReason) {
    var lines = [];
    lines.push('timeframe=' + String(timeframe || '1d').toUpperCase());
    lines.push('chosen=' + String(chosenSetup || 'none'));
    if (rejectionReason) lines.push('rejection=' + String(rejectionReason));
    (Array.isArray(candidateSetups) ? candidateSetups : []).forEach(function (item) {
      var row = item || {};
      lines.push(
        String(row.type || 'unknown') +
        ' regime=' + String(row.regime || 'n/a') +
        ' alignment=' + String(row.alignment || 'n/a') +
        ' base=' + formatTradeDebugNumber(row.baseScore, 1) +
        ' penalty=' + formatTradeDebugNumber(row.regimePenalty, 1) +
        ' score=' + formatTradeDebugNumber(row.setupScore, 1) +
        ' conf=' + String(row.confidenceLabel || 'n/a') +
        (row.confidenceCapApplied ? (' cap=' + String(row.confidenceMaxLabel || 'n/a')) : '') +
        (row.confidenceCapReason ? (' capReason=' + String(row.confidenceCapReason)) : '') +
        ' entryMid=' + formatTradeDebugNumber(row.entryMid, 4) +
        ' coverMid=' + formatTradeDebugNumber(row.coverMid, 4) +
        ' failMid=' + formatTradeDebugNumber(row.failureExitMid, 4) +
        ' reward=' + formatTradeDebugNumber(row.rewardPct, 2) + '%' +
        ' risk=' + formatTradeDebugNumber(row.riskPct, 2) + '%' +
        ' rr=' + formatTradeDebugNumber(row.rr, 2) +
        ' valid=' + String(!(row.validation && row.validation.valid === false)) +
        (row.validationReason ? (' reason=' + String(row.validationReason)) : '')
      );
    });
    return lines.join(' | ');
  }

  function computeShortHolderPlan(indicators, timeframe, assetType, atrPct, entrySetup) {
    var snapshot = indicators || {};
    var close = toNumber(snapshot.close);
    var mode = normalizeAssetType(assetType);
    var timeKey = normalizeTimeframeKey(timeframe || snapshot.timeKey || '1d');
    var entryZone = entrySetup && entrySetup.zone ? entrySetup.zone : null;
    var coverLevels = buildShortCoverCandidates(snapshot, timeKey, mode, entryZone);
    var failureLevels = buildShortFailureExitCandidates(snapshot, timeKey, mode, entryZone);
    var coverZone = buildConfluenceZone(coverLevels, mode, 'support', atrPct, timeKey, { referencePrice: close, atrPct: atrPct });
    var failureZone = buildConfluenceZone(failureLevels, mode, 'resistance', atrPct, timeKey, { referencePrice: close, atrPct: atrPct });
    if (coverZone && !isValidShortCoverZone(coverZone, close)) coverZone = null;
    if (failureZone && !isValidShortFailureZone(failureZone, close)) failureZone = null;
    return {
      available: !!(coverZone || failureZone),
      coverSetup: coverZone ? {
        type: 'Cover / Take Profit',
        zone: coverZone,
        reasons: uniqueStrings((coverZone.reasons || []).concat(['Holder cover/trim zone from downside support']))
      } : null,
      failureExitSetup: failureZone ? {
        type: 'Failure Exit',
        zone: failureZone,
        reasons: uniqueStrings((failureZone.reasons || []).concat(['Holder short invalidation zone']))
      } : null
    };
  }

  function computeShortTradePlan(indicators, timeframe, assetType) {
    var snapshot = indicators || {};
    var values = snapshot.values || {};
    var close = toNumber(snapshot.close);
    var mode = normalizeAssetType(assetType);
    var timeKey = normalizeTimeframeKey(timeframe || snapshot.timeKey || '1d');
    var fib = values.fib || {};
    var sr = values.sr || {};
    var atrPct = computeAtrPct(values, close);
    if (atrPct == null) atrPct = mode === 'crypto' ? 3.0 : 1.5;

    var hasCoreData = close != null && (
      toNumber(values.ema20) != null ||
      toNumber(values.ema50) != null ||
      toNumber(values.bbUpper) != null ||
      toNumber(values.bbLower) != null ||
      (sr && sr.donchian && (toNumber(sr.donchian.support) != null || toNumber(sr.donchian.resistance) != null)) ||
      (fib && fib.available && fib.levels)
    );
    if (!hasCoreData) {
      return {
        available: false,
        timeframe: timeKey,
        assetType: mode,
        entryType: 'No setup',
        takeProfitType: 'No clear cover zone',
        coverType: 'No clear cover zone',
        failureExitType: 'No clear failure exit',
        confidence: 'Caution',
        confidencePoints: 0,
        rewardPct: null,
        riskPct: null,
        rr: null,
        reasons: [],
        note: 'Estimated short entry/cover/failure zones are derived from technical indicator confluence and are not guaranteed.',
        reason: 'Not enough data'
      };
    }

    var entryFamilies = buildShortEntryCandidates(snapshot, timeKey, mode);
    var evaluatedCandidates = entryFamilies.map(function (entry) {
      return evaluateShortEntryCandidate(snapshot, timeKey, mode, entry, atrPct);
    });
    var candidateDebug = evaluatedCandidates.map(function (item) {
      return {
        type: item.type,
        eligible: !!(item.candidate && item.candidate.eligible),
        regime: item.regime ? item.regime.regime : null,
        alignment: item.regime ? item.regime.alignment : null,
        setupScore: item.setupScore,
        confidencePoints: item.confidence ? item.confidence.points : 0,
        confidenceLabel: item.confidence ? item.confidence.label : null,
        provisionalConfidenceLabel: item.confidence ? item.confidence.provisionalLabel : null,
        confidenceCapApplied: item.confidence ? !!item.confidence.capApplied : false,
        confidenceCapReason: item.confidence ? item.confidence.capReason : '',
        confidenceMaxLabel: item.confidence ? item.confidence.maxLabel : null,
        baseScore: item.confidence ? item.confidence.baseScore : item.setupScore,
        regimePenalty: item.confidence ? item.confidence.regimePenalty : 0,
        regimePenaltyReason: item.confidence ? item.confidence.regimePenaltyReason : '',
        entryMid: item.rewardRisk ? item.rewardRisk.entryMid : null,
        coverMid: item.rewardRisk ? item.rewardRisk.coverMid : null,
        failureExitMid: item.rewardRisk ? item.rewardRisk.failureExitMid : null,
        rewardPct: item.rewardRisk ? item.rewardRisk.rewardPct : null,
        riskPct: item.rewardRisk ? item.rewardRisk.riskPct : null,
        rr: item.rewardRisk ? item.rewardRisk.rr : null,
        validation: item.validation || null,
        validationReason: item.validation && item.validation.reason ? item.validation.reason : ''
      };
    });

    var bestEntry = selectBestShortTradePlan(evaluatedCandidates);
    var holderPlan = computeShortHolderPlan(snapshot, timeKey, mode, atrPct, bestEntry ? bestEntry.entrySetup : null);

    var rejection = 'No setup: no clean short confluence setup';
    for (var i = 0; i < evaluatedCandidates.length; i++) {
      if (evaluatedCandidates[i] && evaluatedCandidates[i].validation && evaluatedCandidates[i].validation.reason) {
        rejection = evaluatedCandidates[i].validation.reason;
        break;
      }
    }

    if (!bestEntry && !holderPlan.available) {
      return {
        available: false,
        timeframe: timeKey,
        assetType: mode,
        entryType: 'No setup',
        takeProfitType: 'No clear cover zone',
        coverType: 'No clear cover zone',
        failureExitType: 'No clear failure exit',
        confidence: 'Caution',
        confidencePoints: 0,
        rewardPct: null,
        riskPct: null,
        rr: null,
        reasons: [],
        note: 'Estimated short entry/cover/failure zones are derived from technical indicator confluence and are not guaranteed.',
        reason: rejection,
        debug: {
          timeframe: timeKey,
          atrPct: atrPct,
          candidateEntryClusters: entryFamilies,
          candidateSetups: candidateDebug,
          chosenSetup: null,
          rejectionReason: rejection,
          dump: buildShortTradePlanDebugDump(timeKey, null, candidateDebug, rejection)
        }
      };
    }

    var entrySetup = bestEntry ? bestEntry.entrySetup : null;
    var coverSetup = bestEntry ? bestEntry.coverSetup : holderPlan.coverSetup;
    var failureExitSetup = bestEntry ? bestEntry.failureExitSetup : holderPlan.failureExitSetup;
    var rewardRisk = bestEntry ? bestEntry.rewardRisk : {};
    var confidenceLabel = bestEntry && bestEntry.confidence ? String(bestEntry.confidence.label || mapTradeConfidenceLabel(bestEntry.setupScore)) : 'Caution';
    var confidencePoints = bestEntry && bestEntry.confidence ? Number(bestEntry.confidence.points || bestEntry.setupScore || 0) : 1;
    var combinedReasons = uniqueStrings(
      (entrySetup && entrySetup.reasons ? entrySetup.reasons : [])
        .concat(coverSetup && coverSetup.reasons ? coverSetup.reasons : [])
        .concat(failureExitSetup && failureExitSetup.reasons ? failureExitSetup.reasons : [])
        .concat(bestEntry ? [] : ['No fresh short entry setup passed 5% downside and minimum RR'])
    );

    return {
      available: true,
      timeframe: timeKey,
      assetType: mode,
      entryZoneLow: entrySetup && entrySetup.zone ? entrySetup.zone.zoneLow : null,
      entryZoneHigh: entrySetup && entrySetup.zone ? entrySetup.zone.zoneHigh : null,
      entryType: entrySetup ? entrySetup.type : 'No setup',
      takeProfitZoneLow: coverSetup && coverSetup.zone ? coverSetup.zone.zoneLow : null,
      takeProfitZoneHigh: coverSetup && coverSetup.zone ? coverSetup.zone.zoneHigh : null,
      takeProfitType: coverSetup ? coverSetup.type : 'No clear cover zone',
      coverZoneLow: coverSetup && coverSetup.zone ? coverSetup.zone.zoneLow : null,
      coverZoneHigh: coverSetup && coverSetup.zone ? coverSetup.zone.zoneHigh : null,
      coverType: coverSetup ? coverSetup.type : 'No clear cover zone',
      failureExitZoneLow: failureExitSetup && failureExitSetup.zone ? failureExitSetup.zone.zoneLow : null,
      failureExitZoneHigh: failureExitSetup && failureExitSetup.zone ? failureExitSetup.zone.zoneHigh : null,
      failureExitType: failureExitSetup ? failureExitSetup.type : 'No clear failure exit',
      confidence: confidenceLabel,
      confidencePoints: confidencePoints,
      planStatus: confidenceLabel,
      rewardPct: bestEntry && rewardRisk.rewardPct != null ? rewardRisk.rewardPct : null,
      riskPct: bestEntry && rewardRisk.riskPct != null ? rewardRisk.riskPct : null,
      rr: bestEntry && rewardRisk.rr != null ? rewardRisk.rr : null,
      reasons: combinedReasons,
      entryReasons: entrySetup && entrySetup.reasons ? entrySetup.reasons : [],
      takeProfitReasons: coverSetup && coverSetup.reasons ? coverSetup.reasons : [],
      coverReasons: coverSetup && coverSetup.reasons ? coverSetup.reasons : [],
      failureExitReasons: failureExitSetup && failureExitSetup.reasons ? failureExitSetup.reasons : [],
      note: 'Estimated short entry/cover/failure zones are derived from technical indicator confluence and are not guaranteed.',
      reason: bestEntry ? '' : rejection,
      debug: {
        side: 'short',
        timeframe: timeKey,
        atrPct: atrPct,
        candidateEntryClusters: entryFamilies,
        candidateSetups: candidateDebug,
        holderCoverCluster: coverSetup && coverSetup.zone ? coverSetup.zone : null,
        holderFailureExitCluster: failureExitSetup && failureExitSetup.zone ? failureExitSetup.zone : null,
        chosenSetup: bestEntry ? bestEntry.type : 'Holder Short Plan',
        timeframeRegime: bestEntry && bestEntry.regime ? bestEntry.regime.regime : normalizeRegimeLabel(snapshot && snapshot.trendMeter ? snapshot.trendMeter.label : snapshot.overall),
        alignment: bestEntry && bestEntry.regime ? bestEntry.regime.alignment : 'n/a',
        baseScore: bestEntry && bestEntry.confidence ? bestEntry.confidence.baseScore : null,
        regimePenalty: bestEntry && bestEntry.confidence ? bestEntry.confidence.regimePenalty : null,
        regimePenaltyReason: bestEntry && bestEntry.confidence ? bestEntry.confidence.regimePenaltyReason : '',
        confidenceCapApplied: bestEntry && bestEntry.confidence ? !!bestEntry.confidence.capApplied : false,
        confidenceCapReason: bestEntry && bestEntry.confidence ? bestEntry.confidence.capReason : '',
        finalConfidence: confidenceLabel,
        rewardPct: bestEntry && rewardRisk.rewardPct != null ? rewardRisk.rewardPct : null,
        riskPct: bestEntry && rewardRisk.riskPct != null ? rewardRisk.riskPct : null,
        rr: bestEntry && rewardRisk.rr != null ? rewardRisk.rr : null,
        rejectionReason: bestEntry ? '' : rejection,
        dump: buildShortTradePlanDebugDump(timeKey, bestEntry ? bestEntry.type : 'Holder Short Plan', candidateDebug, bestEntry ? '' : rejection)
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
    var atrSeries = atr(highs, lows, close, 14);
    var atr14 = latestValue(atrSeries);
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
    var tradePlanInput = {
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
        atr14: atr14,
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
    };
    var tradePlan = computeTradePlan(tradePlanInput, settings.timeKey || '1d', settings.assetType || 'stock');
    var shortTradePlan = computeShortTradePlan(tradePlanInput, settings.timeKey || '1d', settings.assetType || 'stock');

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
        atr14: atr14,
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
        shortTradePlan: shortTradePlan,
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
      shortTradePlan: shortTradePlan,
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
    computeATR14: function (candles) {
      return atr(highsFromCandles(candles), lowsFromCandles(candles), closesFromCandles(candles), 14);
    },
    computeADX14: function (candles) {
      return adx(highsFromCandles(candles), lowsFromCandles(candles), closesFromCandles(candles), 14);
    },
    computeVolumeMA20: function (candles) {
      return sma(volumesFromCandles(candles), 20);
    },
    computeVolumeConfirmation: computeVolumeConfirmation,
    getLevelWeightsForTimeframe: getLevelWeightsForTimeframe,
    collectEntryCandidates: collectEntryCandidates,
    collectTakeProfitCandidates: collectTakeProfitCandidates,
    collectFailureExitCandidates: collectFailureExitCandidates,
    collectExitCandidates: collectExitCandidates,
    buildShortEntryCandidates: buildShortEntryCandidates,
    buildShortCoverCandidates: buildShortCoverCandidates,
    buildShortFailureExitCandidates: buildShortFailureExitCandidates,
    buildConfluenceZone: buildConfluenceZone,
    scoreTrendPullbackSetup: scoreTrendPullbackSetup,
    scoreBounceSetup: scoreBounceSetup,
    scoreBreakoutSetup: scoreBreakoutSetup,
    scoreRejectionShortSetup: scoreRejectionShortSetup,
    scoreBreakdownShortSetup: scoreBreakdownShortSetup,
    scoreExhaustionShortSetup: scoreExhaustionShortSetup,
    getTradeRegimeAlignment: getTradeRegimeAlignment,
    applyRegimePenaltyToTradeScore: applyRegimePenaltyToTradeScore,
    capTradeConfidenceByRegime: capTradeConfidenceByRegime,
    hasExceptionalCountertrendLongEvidence: hasExceptionalCountertrendLongEvidence,
    hasExceptionalCountertrendShortEvidence: hasExceptionalCountertrendShortEvidence,
    computeRewardRisk: computeRewardRisk,
    computeShortRewardRisk: computeShortRewardRisk,
    validateTradePlan: validateTradePlan,
    validateShortTradePlan: validateShortTradePlan,
    selectBestTradeSetup: selectBestTradeSetup,
    selectBestShortTradePlan: selectBestShortTradePlan,
    selectEntrySetup: selectEntrySetup,
    selectTakeProfitSetup: selectTakeProfitSetup,
    selectFailureExitSetup: selectFailureExitSetup,
    selectExitSetup: selectExitSetup,
    computeTradePlan: computeTradePlan,
    computeShortTradePlan: computeShortTradePlan,
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
      getLevelWeightsForTimeframe: getLevelWeightsForTimeframe,
      buildConfluenceZone: buildConfluenceZone,
      collectEntryCandidates: collectEntryCandidates,
      collectTakeProfitCandidates: collectTakeProfitCandidates,
      collectFailureExitCandidates: collectFailureExitCandidates,
      collectExitCandidates: collectExitCandidates,
      buildShortEntryCandidates: buildShortEntryCandidates,
      buildShortCoverCandidates: buildShortCoverCandidates,
      buildShortFailureExitCandidates: buildShortFailureExitCandidates,
      scoreTrendPullbackSetup: scoreTrendPullbackSetup,
      scoreBounceSetup: scoreBounceSetup,
      scoreBreakoutSetup: scoreBreakoutSetup,
      scoreRejectionShortSetup: scoreRejectionShortSetup,
      scoreBreakdownShortSetup: scoreBreakdownShortSetup,
      scoreExhaustionShortSetup: scoreExhaustionShortSetup,
      getTradeRegimeAlignment: getTradeRegimeAlignment,
      applyRegimePenaltyToTradeScore: applyRegimePenaltyToTradeScore,
      capTradeConfidenceByRegime: capTradeConfidenceByRegime,
      hasExceptionalCountertrendLongEvidence: hasExceptionalCountertrendLongEvidence,
      hasExceptionalCountertrendShortEvidence: hasExceptionalCountertrendShortEvidence,
      computeRewardRisk: computeRewardRisk,
      computeShortRewardRisk: computeShortRewardRisk,
      validateTradePlan: validateTradePlan,
      validateShortTradePlan: validateShortTradePlan,
      selectBestTradeSetup: selectBestTradeSetup,
      selectBestShortTradePlan: selectBestShortTradePlan,
      selectEntrySetup: selectEntrySetup,
      selectTakeProfitSetup: selectTakeProfitSetup,
      selectFailureExitSetup: selectFailureExitSetup,
      selectExitSetup: selectExitSetup,
      computeTradePlan: computeTradePlan,
      computeShortTradePlan: computeShortTradePlan
    }
  };
});
