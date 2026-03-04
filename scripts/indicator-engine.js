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
    var latestClose = latestValue(close);
    var ema20Series = ema(close, 20);
    var ema50Series = ema(close, 50);
    var rsiSeries = rsi(close, 14);
    var macdSeries = macd(close, 12, 26, 9);
    var bands = bollinger(close, 20, 2);

    var ema20 = latestValue(ema20Series);
    var ema50 = latestValue(ema50Series);
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

    var score =
      scoreFromStatus(emaStatus) +
      scoreFromStatus(rsiStatus) +
      scoreFromStatus(macdStatus) +
      scoreFromStatus(bollingerStatus);

    return {
      timeKey: settings.timeKey || null,
      candleCount: list.length,
      latestCandleTime: list.length ? (list[list.length - 1].t || null) : null,
      close: latestClose,
      values: {
        ema20: ema20,
        ema50: ema50,
        rsi14: rsi14,
        macdLine: macdLine,
        macdSignal: macdSignal,
        macdHistogram: macdHistogram,
        bbMiddle: bbMiddle,
        bbUpper: bbUpper,
        bbLower: bbLower,
        bollingerPosition: bollingerPosition
      },
      statuses: {
        ema: emaStatus,
        rsi: rsiStatus,
        macd: macdStatus,
        bollinger: bollingerStatus
      },
      score: score,
      overall: score >= 2 ? 'Bullish' : (score <= -2 ? 'Bearish' : 'Neutral')
    };
  }

  function summarizeByTimeframe(map) {
    var timeframes = map || {};
    var weights = { '1d': 1, '1w': 2, '1m': 3 };
    var weightedScore = 0;
    Object.keys(weights).forEach(function (key) {
      var item = timeframes[key];
      if (!item || !isFinite(Number(item.score))) return;
      weightedScore += Number(item.score) * weights[key];
    });
    return {
      weightedScore: weightedScore,
      overall: weightedScore >= 4 ? 'Bullish' : (weightedScore <= -4 ? 'Bearish' : 'Neutral')
    };
  }

  return {
    sma: sma,
    ema: ema,
    stddev: stddev,
    rsi: rsi,
    macd: macd,
    bollinger: bollinger,
    analyze: analyze,
    summarizeByTimeframe: summarizeByTimeframe,
    _internals: {
      latestValue: latestValue,
      scoreFromStatus: scoreFromStatus,
      statusFromScore: statusFromScore
    }
  };
});
