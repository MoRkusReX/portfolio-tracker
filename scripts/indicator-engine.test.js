// Lightweight deterministic assertions for indicator math and scoring logic.
const assert = require('assert');
const engine = require('./indicator-engine.js');

function closeTo(actual, expected, epsilon) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} not within ${epsilon} of ${expected}`);
}

function makeLinearCandles(length) {
  const out = [];
  for (let i = 1; i <= length; i += 1) {
    out.push({
      t: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      o: i - 0.5,
      h: i + 1,
      l: i - 1,
      c: i,
      v: 1000 + i
    });
  }
  return out;
}

// EMA seeding and core math baseline.
const sample = makeLinearCandles(240);
const closes = sample.map((row) => row.c);
const sma20 = engine.sma(closes, 20);
const ema20 = engine.ema(closes, 20);
const rsi14 = engine.rsi(closes, 14);
const macd = engine.macd(closes, 12, 26, 9);
const bands = engine.bollinger(closes, 20, 2);

assert.strictEqual(sma20[18], null);
closeTo(sma20[19], 10.5, 1e-9);
assert.strictEqual(ema20[18], null);
closeTo(ema20[19], 10.5, 1e-9); // EMA seed must equal SMA(first 20)
assert.ok(rsi14[14] > 99.9); // Wilder RSI on monotonic rise tends to 100
assert.ok(macd.line[25] !== null);
assert.ok(macd.signal[33] !== null);
assert.ok(bands.middle[19] !== null && bands.upper[19] > bands.middle[19] && bands.lower[19] < bands.middle[19]);

// RSI(14) Wilder explicit fixture check (first computed point at i=14).
const rsiFixture = [44, 44.15, 43.9, 44.35, 44.8, 44.6, 44.95, 45.3, 45.1, 45.55, 46.0, 45.85, 46.2, 46.45, 46.3, 46.7];
const rsiSeries = engine.rsi(rsiFixture, 14);
let gains = 0;
let losses = 0;
for (let i = 1; i <= 14; i += 1) {
  const change = rsiFixture[i] - rsiFixture[i - 1];
  gains += Math.max(change, 0);
  losses += Math.max(-change, 0);
}
const avgGain = gains / 14;
const avgLoss = losses / 14;
const expectedRsi14 = avgLoss === 0 ? 100 : (100 - (100 / (1 + (avgGain / avgLoss))));
closeTo(rsiSeries[14], expectedRsi14, 1e-9);

// MACD histogram rising helper.
assert.strictEqual(engine._internals.histogramRising([null, 0.01, 0.02, 0.03]), true);
assert.strictEqual(engine._internals.histogramRising([0.03, 0.02, 0.025]), false);

// Reversal score + label mapping.
const reversalAll = engine.computeReversal({
  rsi14: 30,
  volumeSpike: 2.1,
  close: 105,
  prevClose: 100,
  distanceFromEma20Pct: -8,
  macdHistogramRising: true,
  nearSupport: true
});
assert.strictEqual(reversalAll.score, 5);
assert.strictEqual(reversalAll.label, 'High probability reversal');
assert.strictEqual(reversalAll.reasons.length, 5);

const reversalTwo = engine.computeReversal({
  rsi14: 50,
  volumeSpike: 1.0,
  close: 99,
  prevClose: 100,
  distanceFromEma20Pct: -7,
  macdHistogramRising: false,
  nearSupport: true
});
assert.strictEqual(reversalTwo.score, 2);
assert.strictEqual(reversalTwo.label, 'Possible bounce');

// EMA Position acceptance priority checks.
const emaPos1 = engine.computeEmaPosition(120, 110, 100, 0.005);
assert.strictEqual(emaPos1.label, 'Strong Bullish');

const emaPos2 = engine.computeEmaPosition(108, 112, 100, 0.005);
assert.strictEqual(emaPos2.label, 'Pullback');

const emaPos3 = engine.computeEmaPosition(100.4, 101.2, 100, 0.005);
assert.strictEqual(emaPos3.label, 'Trend Test');

const emaPos4 = engine.computeEmaPosition(94, 98, 100, 0.005);
assert.strictEqual(emaPos4.label, 'Bearish Risk');

// EMA trend structure classification.
assert.strictEqual(engine.classifyEmaTrend(120, 110, 100, 90), 'Bullish');
assert.strictEqual(engine.classifyEmaTrend(80, 90, 100, 110), 'Bearish');
assert.strictEqual(engine.classifyEmaTrend(102, 101, 103, 99), 'Neutral');

// RSI 60/40 thresholds in trend scoring.
let trendScore = engine.computeTrendMeter({
  close: 100,
  ema20: 100,
  ema50: 100,
  ema200: 100,
  rsi14: 61,
  macdLine: 0,
  macdSignal: 0,
  macdHistogram: 0,
  srStatus: 'Neutral',
  adx14: 10,
  volumeConfirmation: { score: 0, status: 'Neutral' }
});
assert.strictEqual(trendScore.breakdown.rsiScore, 1);
trendScore = engine.computeTrendMeter({
  close: 100,
  ema20: 100,
  ema50: 100,
  ema200: 100,
  rsi14: 39,
  macdLine: 0,
  macdSignal: 0,
  macdHistogram: 0,
  srStatus: 'Neutral',
  adx14: 10,
  volumeConfirmation: { score: 0, status: 'Neutral' }
});
assert.strictEqual(trendScore.breakdown.rsiScore, -1);

// MACD scoring requires line/signal + histogram agreement.
trendScore = engine.computeTrendMeter({
  close: 100,
  ema20: 100,
  ema50: 100,
  ema200: 100,
  rsi14: 50,
  macdLine: 1,
  macdSignal: 0.5,
  macdHistogram: -0.1,
  srStatus: 'Neutral',
  adx14: 10,
  volumeConfirmation: { score: 0, status: 'Neutral' }
});
assert.strictEqual(trendScore.breakdown.macdScore, 0);
trendScore = engine.computeTrendMeter({
  close: 100,
  ema20: 100,
  ema50: 100,
  ema200: 100,
  rsi14: 50,
  macdLine: 1,
  macdSignal: 0.5,
  macdHistogram: 0.2,
  srStatus: 'Neutral',
  adx14: 10,
  volumeConfirmation: { score: 0, status: 'Neutral' }
});
assert.strictEqual(trendScore.breakdown.macdScore, 1);
trendScore = engine.computeTrendMeter({
  close: 100,
  ema20: 100,
  ema50: 100,
  ema200: 100,
  rsi14: 50,
  macdLine: -1,
  macdSignal: -0.5,
  macdHistogram: -0.2,
  srStatus: 'Neutral',
  adx14: 10,
  volumeConfirmation: { score: 0, status: 'Neutral' }
});
assert.strictEqual(trendScore.breakdown.macdScore, -1);

// SR midpoint tolerance uses Donchian midpoint only.
assert.strictEqual(engine.computeSRStatus(100.3, null, { midpoint: 100 }), 'Neutral');
assert.strictEqual(engine.computeSRStatus(101, null, { midpoint: 100 }), 'Bullish');
assert.strictEqual(engine.computeSRStatus(99, null, { midpoint: 100 }), 'Bearish');

// ADX calculation sanity and trend filter classification.
function makeTrendingCandles(length) {
  const out = [];
  for (let i = 0; i < length; i += 1) {
    const c = 100 + i * 1.2;
    out.push({ t: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`, o: c - 0.5, h: c + 1, l: c - 1, c, v: 1200 + i * 12 });
  }
  return out;
}
function makeChoppyCandles(length) {
  const out = [];
  let c = 100;
  for (let i = 0; i < length; i += 1) {
    c += (i % 2 === 0 ? 0.6 : -0.55);
    out.push({ t: `2026-04-${String((i % 28) + 1).padStart(2, '0')}`, o: c - 0.2, h: c + 0.6, l: c - 0.6, c, v: 900 + (i % 5) * 5 });
  }
  return out;
}
const adxTrendSeries = engine.computeADX14(makeTrendingCandles(120));
const adxChopSeries = engine.computeADX14(makeChoppyCandles(120));
function latestFinite(series) {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(series[i])) return series[i];
  }
  return null;
}
assert.ok(latestFinite(adxTrendSeries.adx) > 25);
assert.ok(latestFinite(adxChopSeries.adx) < 20);

trendScore = engine.computeTrendMeter({
  close: 120,
  ema20: 110,
  ema50: 100,
  ema200: 90,
  rsi14: 62,
  macdLine: 2,
  macdSignal: 1,
  macdHistogram: 1,
  srStatus: 'Bullish',
  adx14: 30,
  volumeConfirmation: { score: 1, status: 'Bullish confirmation' }
});
assert.strictEqual(trendScore.breakdown.adxScore, 1);
assert.strictEqual(trendScore.breakdown.adxStatus, 'Strong Trend');
trendScore = engine.computeTrendMeter({
  close: 120,
  ema20: 110,
  ema50: 100,
  ema200: 90,
  rsi14: 62,
  macdLine: 2,
  macdSignal: 1,
  macdHistogram: 1,
  srStatus: 'Bullish',
  adx14: 15,
  volumeConfirmation: { score: 1, status: 'Bullish confirmation' }
});
assert.strictEqual(trendScore.breakdown.adxScore, 0);
assert.strictEqual(trendScore.breakdown.adxStatus, 'Weak / Sideways');

// Volume confirmation helper.
let volumeCheck = engine.computeVolumeConfirmation({
  currentVolume: 2500,
  volumeMA20: 1500,
  close: 110,
  prevClose: 100,
  trendDirection: 'Bullish'
});
assert.strictEqual(volumeCheck.status, 'Bullish confirmation');
assert.strictEqual(volumeCheck.score, 1);
volumeCheck = engine.computeVolumeConfirmation({
  currentVolume: 2500,
  volumeMA20: 1500,
  close: 95,
  prevClose: 100,
  trendDirection: 'Bearish'
});
assert.strictEqual(volumeCheck.status, 'Bearish confirmation');
assert.strictEqual(volumeCheck.score, -1);
volumeCheck = engine.computeVolumeConfirmation({
  currentVolume: 900,
  volumeMA20: 1500,
  close: 101,
  prevClose: 100,
  trendDirection: 'Bullish'
});
assert.strictEqual(volumeCheck.status, 'Neutral');
assert.strictEqual(volumeCheck.score, 0);

// Fibonacci level calculation from known swing high/low.
const fibLevels = engine.computeFibonacciLevels(200, 100);
closeTo(fibLevels.fib236, 176.4, 1e-9);
closeTo(fibLevels.fib382, 161.8, 1e-9);
closeTo(fibLevels.fib500, 150, 1e-9);
closeTo(fibLevels.fib618, 138.2, 1e-9);
closeTo(fibLevels.fib786, 121.4, 1e-9);

// Fibonacci nearest level checks.
const fibNear = engine.findNearestFibLevels(160, fibLevels);
closeTo(fibNear.nearestFibBelow, 150, 1e-9);
closeTo(fibNear.nearestFibAbove, 161.8, 1e-9);

// Fibonacci status mapping checks.
assert.strictEqual(engine.classifyFibStatus(180, fibLevels), 'Strong Trend');
assert.strictEqual(engine.classifyFibStatus(150, fibLevels), 'Normal Pullback');
assert.strictEqual(engine.classifyFibStatus(130, fibLevels), 'Deep Retracement');
assert.strictEqual(engine.classifyFibStatus(110, fibLevels), 'Structure Failure');

// Near support heuristic fixture.
const supportFixture = [];
const lowsPattern = [100, 99, 97, 99, 100, 98, 96, 98, 99, 101, 99, 97.2, 99.5, 100.2, 98.4, 96.8, 98.9, 100.1];
for (let i = 0; i < lowsPattern.length; i += 1) {
  const low = lowsPattern[i];
  const close = low + 1.2;
  supportFixture.push({
    t: `2026-02-${String((i % 28) + 1).padStart(2, '0')}`,
    o: close - 0.2,
    h: close + 0.6,
    l: low,
    c: close,
    v: 900 + i * 8
  });
}
const supportEval = engine._internals.findSupportZonesFromPivots(supportFixture, 98.2, '1d');
assert.ok(Array.isArray(supportEval.zones));
assert.ok(supportEval.zones.length >= 1);
assert.ok(supportEval.nearestSupport !== null);
assert.strictEqual(typeof supportEval.nearSupport, 'boolean');

// Analyze + trend summarization.
const snapshot = engine.analyze(sample, { timeKey: '1d', assetType: 'stock' });
assert.strictEqual(snapshot.overall, 'Bullish');
assert.strictEqual(snapshot.statuses.ema, 'Bullish');
assert.strictEqual(snapshot.statuses.rsi, 'Bullish');
assert.ok(snapshot.trendMeter && typeof snapshot.trendMeter.timeframeScore === 'number');
assert.ok(snapshot.reversal && typeof snapshot.reversal.score === 'number');
assert.ok(snapshot.values && snapshot.values.fib && snapshot.values.fib.available === true);
assert.ok(typeof snapshot.values.fib.status === 'string');
assert.ok(snapshot.values && Number.isFinite(Number(snapshot.values.adx14)));
assert.ok(snapshot.values && snapshot.values.volumeConfirmation);

const summary = engine.summarizeByTimeframe({
  '1d': { trendMeter: { timeframeScore: 2 } },
  '1w': { trendMeter: { timeframeScore: 2 } },
  '1m': { trendMeter: { timeframeScore: 1 } }
});
assert.strictEqual(summary.weightedScore, 9);
assert.strictEqual(summary.overall, 'Bullish');
assert.strictEqual(summary.trendMeter.overallLabel, 'Bullish');
const summaryNeutral = engine.summarizeByTimeframe({
  '1d': { trendMeter: { timeframeScore: 1 } },
  '1w': { trendMeter: { timeframeScore: 1 } },
  '1m': { trendMeter: { timeframeScore: 1 } }
});
assert.strictEqual(summaryNeutral.weightedScore, 6);
assert.strictEqual(summaryNeutral.overall, 'Neutral');
const summaryBear = engine.summarizeByTimeframe({
  '1d': { trendMeter: { timeframeScore: -2 } },
  '1w': { trendMeter: { timeframeScore: -2 } },
  '1m': { trendMeter: { timeframeScore: -1 } }
});
assert.strictEqual(summaryBear.weightedScore, -9);
assert.strictEqual(summaryBear.overall, 'Bearish');

function baseTradeSnapshot() {
  return {
    close: 100,
    timeKey: '1d',
    values: {
      ema20: 99,
      ema50: 96,
      ema200: 90,
      rsi14: 56,
      macdLine: 0.8,
      macdSignal: 0.5,
      macdHistogram: 0.3,
      bbUpper: 106,
      bbLower: 94,
      adx14: 28,
      volumeConfirmation: { status: 'Bullish confirmation' },
      fib: {
        available: true,
        levels: {
          fib236: 103.2,
          fib382: 99.3,
          fib500: 97.4,
          fib618: 95.6,
          fib786: 92.8
        }
      },
      sr: {
        pivot: { p: 98.8, s1: 96.9, s2: 95.1, r1: 102.5, r2: 104.8 },
        donchian: { support: 95.7, resistance: 104.6, midpoint: 100.15 },
        nearest: { support: 98.8, resistance: 102.5, supportDistancePct: -1.2, resistanceDistancePct: 1.9 }
      },
      reversal: {
        nearSupport: true,
        macdHistogramRising: true,
        supportZone: 96.2,
        supportZones: [96.2, 95.7]
      }
    },
    statuses: {
      ema: 'Bullish',
      rsi: 'Neutral',
      macd: 'Bullish',
      bollinger: 'Bullish',
      sr: 'Bullish'
    },
    trendMeter: {
      label: 'Bullish',
      timeframeScore: 4
    },
    reversal: {
      score: 1,
      label: 'No reversal signal',
      reasons: []
    },
    emaPosition: {
      label: 'Pullback'
    },
    overall: 'Bullish'
  };
}

function baseShortTradeSnapshot() {
  return {
    close: 100,
    timeKey: '1d',
    values: {
      ema20: 101.2,
      ema50: 103.8,
      ema200: 108.5,
      rsi14: 43,
      macdLine: -0.9,
      macdSignal: -0.5,
      macdHistogram: -0.4,
      bbUpper: 105.8,
      bbMiddle: 100.8,
      bbLower: 92.8,
      adx14: 27,
      volumeConfirmation: { status: 'Bearish confirmation' },
      fib: {
        available: true,
        swingHigh: 112,
        swingLow: 88,
        levels: {
          fib236: 106.8,
          fib382: 103.6,
          fib500: 101.0,
          fib618: 95.2,
          fib786: 90.6
        }
      },
      sr: {
        pivot: { p: 101.5, s1: 93.8, s2: 90.5, r1: 104.2, r2: 107.3 },
        donchian: { support: 92.9, resistance: 106.1, midpoint: 99.5 },
        nearest: { support: 93.6, resistance: 103.9, supportDistancePct: -6.4, resistanceDistancePct: 3.9 }
      },
      reversal: {
        nearSupport: false,
        macdHistogramRising: false,
        supportZone: 93.2,
        supportZones: [93.2, 92.4]
      }
    },
    statuses: {
      ema: 'Bearish',
      rsi: 'Bearish',
      macd: 'Bearish',
      bollinger: 'Bearish',
      sr: 'Bearish'
    },
    trendMeter: {
      label: 'Bearish',
      timeframeScore: -4
    },
    reversal: {
      score: 1,
      label: 'No reversal signal',
      reasons: []
    },
    emaPosition: {
      label: 'Bearish Risk'
    },
    overall: 'Bearish'
  };
}

// 1) bullish pullback setup should generate a valid entry plan.
let tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.values.atr14 = 2.1;
tradeSnapshot.values.bbUpper = 114;
tradeSnapshot.values.sr.pivot.r1 = 110;
tradeSnapshot.values.sr.pivot.r2 = 113;
tradeSnapshot.values.sr.donchian.resistance = 112;
tradeSnapshot.values.sr.nearest.resistance = 109.8;
tradeSnapshot.values.fib.levels.fib236 = 111.2;
let tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.available, true);
assert.strictEqual(tradePlan.entryType, 'Pullback Entry');
assert.ok(Number.isFinite(tradePlan.rewardPct) && tradePlan.rewardPct >= 5);
assert.ok(Number.isFinite(tradePlan.rr) && tradePlan.rr >= 1.5);

// 2) bounce setup near support should generate a valid plan when reward >= 5%.
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.trendMeter.label = 'Neutral';
tradeSnapshot.statuses.ema = 'Neutral';
tradeSnapshot.statuses.macd = 'Neutral';
tradeSnapshot.reversal.score = 3;
tradeSnapshot.values.rsi14 = 39;
tradeSnapshot.values.macdHistogram = -0.2;
tradeSnapshot.values.sr.nearest.support = 97.5;
tradeSnapshot.values.reversal.supportZone = 97.2;
tradeSnapshot.values.sr.nearest.resistance = 106.8;
tradeSnapshot.values.sr.donchian.resistance = 107.2;
tradeSnapshot.values.bbUpper = 108.1;
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.available, true);
assert.strictEqual(tradePlan.entryType, 'Bounce Entry');
assert.ok(Number.isFinite(tradePlan.rewardPct) && tradePlan.rewardPct >= 5);

// 3) breakout setup should generate a valid plan when room above is sufficient.
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.close = 104.8;
tradeSnapshot.values.rsi14 = 63;
tradeSnapshot.values.adx14 = 27;
tradeSnapshot.values.sr.nearest.resistance = 105.4;
tradeSnapshot.values.sr.nearest.resistanceDistancePct = 0.6;
tradeSnapshot.values.sr.donchian.resistance = 105.6;
tradeSnapshot.values.sr.pivot.r1 = null;
tradeSnapshot.values.sr.pivot.r2 = 112.4;
tradeSnapshot.values.bbUpper = 114.2;
tradeSnapshot.values.fib.levels.fib236 = null;
tradeSnapshot.values.ema20 = 110.0;
tradeSnapshot.values.ema50 = 103.2;
tradeSnapshot.values.ema200 = 101.8;
tradeSnapshot.values.sr.pivot.p = 109.2;
tradeSnapshot.values.sr.donchian.midpoint = 110.1;
tradeSnapshot.values.sr.nearest.support = null;
tradeSnapshot.values.sr.pivot.s1 = null;
tradeSnapshot.values.sr.pivot.s2 = null;
tradeSnapshot.values.sr.donchian.support = null;
tradeSnapshot.values.fib.levels.fib382 = null;
tradeSnapshot.values.fib.levels.fib500 = null;
tradeSnapshot.values.fib.levels.fib618 = null;
tradeSnapshot.values.fib.levels.fib786 = null;
tradeSnapshot.values.bbLower = null;
tradeSnapshot.values.reversal.supportZone = null;
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.available, true);
assert.strictEqual(tradePlan.entryType, 'Breakout Entry');
assert.ok(Number.isFinite(tradePlan.rewardPct) && tradePlan.rewardPct >= 5);

// 4) invalid entry >= take-profit must reject.
let validation = engine.validateTradePlan({
  entryZone: { zoneLow: 100, zoneHigh: 101 },
  takeProfitZone: { zoneLow: 99, zoneHigh: 100 },
  failureExitZone: { zoneLow: 95, zoneHigh: 96 }
}, 'stock', '1d');
assert.strictEqual(validation.valid, false);
assert.match(String(validation.reason), /invalid zone ordering/);

// 5) invalid plan with reward < 5% must reject.
validation = engine.validateTradePlan({
  entryZone: { zoneLow: 100, zoneHigh: 100.5 },
  takeProfitZone: { zoneLow: 103.5, zoneHigh: 104.0 },
  failureExitZone: { zoneLow: 97.0, zoneHigh: 97.5 }
}, 'stock', '1d');
assert.strictEqual(validation.valid, false);
assert.match(String(validation.reason), /upside too small|take-profit too close to entry/);

// 5b) invalid long where failure exit overlaps entry must reject.
validation = engine.validateTradePlan({
  entryZone: { zoneLow: 100, zoneHigh: 101 },
  takeProfitZone: { zoneLow: 106, zoneHigh: 107 },
  failureExitZone: { zoneLow: 99.4, zoneHigh: 100.2 }
}, 'stock', '1d');
assert.strictEqual(validation.valid, false);
assert.match(String(validation.reason), /invalid zone ordering/);

// 5c) invalid long with risk distance < 1% must reject.
validation = engine.validateTradePlan({
  entryZone: { zoneLow: 100, zoneHigh: 101 },
  takeProfitZone: { zoneLow: 108, zoneHigh: 109 },
  failureExitZone: { zoneLow: 99.7, zoneHigh: 99.9 }
}, 'stock', '1d');
assert.strictEqual(validation.valid, false);
assert.match(String(validation.reason), /risk distance too small/);

// 5d) invalid long with absurdly far take-profit must reject.
validation = engine.validateTradePlan({
  entryZone: { zoneLow: 100, zoneHigh: 101 },
  takeProfitZone: { zoneLow: 181, zoneHigh: 182 },
  failureExitZone: { zoneLow: 96, zoneHigh: 97 }
}, 'stock', '1d');
assert.strictEqual(validation.valid, false);
assert.match(String(validation.reason), /too far from entry/);

// 6) invalid plan with rr < 1.5 must reject.
validation = engine.validateTradePlan({
  entryZone: { zoneLow: 100, zoneHigh: 101 },
  takeProfitZone: { zoneLow: 106, zoneHigh: 107 }, // ~6%
  failureExitZone: { zoneLow: 92, zoneHigh: 93 }   // ~8%
}, 'stock', '1d');
assert.strictEqual(validation.valid, false);
assert.match(String(validation.reason), /reward\/risk too weak/);

// 7) moderate-quality but valid plan should be Caution/Moderate, not No setup.
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.trendMeter.label = 'Neutral';
tradeSnapshot.trendMeter.timeframeScore = 1;
tradeSnapshot.statuses.ema = 'Neutral';
tradeSnapshot.statuses.macd = 'Neutral';
tradeSnapshot.values.adx14 = 16;
tradeSnapshot.values.volumeConfirmation = { status: 'Neutral' };
tradeSnapshot.reversal.score = 2;
tradeSnapshot.values.rsi14 = 48;
tradeSnapshot.values.ema20 = null;
tradeSnapshot.values.ema50 = 95;
tradeSnapshot.values.ema200 = 92;
tradeSnapshot.values.sr.pivot.p = null;
tradeSnapshot.values.sr.donchian.midpoint = null;
tradeSnapshot.values.sr.donchian.support = null;
tradeSnapshot.values.sr.pivot.s1 = null;
tradeSnapshot.values.sr.pivot.s2 = null;
tradeSnapshot.values.fib.levels.fib382 = null;
tradeSnapshot.values.fib.levels.fib500 = null;
tradeSnapshot.values.fib.levels.fib618 = null;
tradeSnapshot.values.fib.levels.fib786 = null;
tradeSnapshot.values.sr.nearest.support = 99.5;
tradeSnapshot.values.reversal.supportZone = 99.5;
tradeSnapshot.values.sr.nearest.resistance = 107.5;
tradeSnapshot.values.sr.donchian.resistance = 108.0;
tradeSnapshot.values.bbUpper = 108.2;
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.available, true);
assert.ok(['Caution', 'Moderate'].indexOf(String(tradePlan.confidence)) !== -1);

// 8) strong-quality plan should be Strong.
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.trendMeter.label = 'Bullish';
tradeSnapshot.trendMeter.timeframeScore = 5;
tradeSnapshot.values.adx14 = 32;
tradeSnapshot.statuses.macd = 'Bullish';
tradeSnapshot.values.volumeConfirmation = { status: 'Bullish confirmation' };
tradeSnapshot.values.rsi14 = 62;
tradeSnapshot.reversal.score = 0;
tradeSnapshot.values.sr.nearest.resistance = 112;
tradeSnapshot.values.sr.donchian.resistance = 113.5;
tradeSnapshot.values.bbUpper = 115;
tradeSnapshot.values.sr.pivot.r1 = null;
tradeSnapshot.values.sr.pivot.r2 = null;
tradeSnapshot.values.fib.levels.fib236 = null;
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.available, true);
assert.strictEqual(String(tradePlan.confidence), 'Strong');

// 8b) nearest valid take-profit cluster should beat far extreme cluster.
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.values.atr14 = 0.7;
tradeSnapshot.values.ema20 = 99.3;
tradeSnapshot.values.ema50 = 97.8;
tradeSnapshot.values.ema200 = 94.6;
tradeSnapshot.values.sr.nearest.support = 98.6;
tradeSnapshot.values.reversal.supportZone = 98.4;
tradeSnapshot.values.sr.donchian.midpoint = 99.0;
tradeSnapshot.values.sr.donchian.support = 97.9;
tradeSnapshot.values.sr.pivot.p = 99.1;
tradeSnapshot.values.fib.levels.fib382 = 99.0;
tradeSnapshot.values.fib.levels.fib500 = 98.6;
tradeSnapshot.values.sr.nearest.resistance = 109.2;   // nearest valid target cluster
tradeSnapshot.values.sr.donchian.resistance = 109.6;  // nearest valid target cluster
tradeSnapshot.values.sr.pivot.r1 = 170;               // far extreme cluster
tradeSnapshot.values.sr.pivot.r2 = 171;               // far extreme cluster
tradeSnapshot.values.bbUpper = 172;                   // far extreme cluster
tradeSnapshot.values.fib.levels.fib236 = 173;         // far extreme cluster
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.available, true);
assert.ok(Number.isFinite(tradePlan.takeProfitZoneLow));
assert.ok(tradePlan.takeProfitZoneLow < 130, `expected nearest target cluster, got ${tradePlan.takeProfitZoneLow}`);

// 9) holder-only mode should still show exits when fresh entry fails (<5% upside).
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.close = 100;
tradeSnapshot.values.sr.nearest.resistance = 101.8;
tradeSnapshot.values.sr.donchian.resistance = 102.0;
tradeSnapshot.values.sr.pivot.r1 = 102.1;
tradeSnapshot.values.bbUpper = 102.3;
tradeSnapshot.values.ema20 = 100.1;
tradeSnapshot.values.ema50 = 99.3;
tradeSnapshot.values.ema200 = 98.0;
tradeSnapshot.values.sr.pivot.p = 100.1;
tradeSnapshot.values.sr.nearest.support = 99.4;
tradeSnapshot.values.sr.donchian.midpoint = 100.2;
tradeSnapshot.values.sr.donchian.support = 99.0;
tradeSnapshot.values.sr.pivot.s1 = 99.1;
tradeSnapshot.values.sr.pivot.s2 = 98.7;
tradeSnapshot.values.fib.levels.fib382 = 99.8;
tradeSnapshot.values.fib.levels.fib500 = 99.4;
tradeSnapshot.values.fib.levels.fib618 = 99.0;
tradeSnapshot.values.fib.levels.fib786 = 98.6;
tradeSnapshot.values.bbLower = 99.0;
tradeSnapshot.values.reversal.supportZone = 99.3;
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.available, true);
assert.strictEqual(tradePlan.entryType, 'No setup');
assert.ok(String(tradePlan.takeProfitType).toLowerCase().indexOf('take profit') !== -1);
assert.ok(
  String(tradePlan.failureExitType).toLowerCase().indexOf('failure') !== -1 ||
  String(tradePlan.failureExitType).toLowerCase().indexOf('no clear failure exit') !== -1
);
assert.strictEqual(tradePlan.rr, null);

// SHORT PLAN TESTS
// 1) bearish rejection short should return valid short setup.
let shortSnapshot = baseShortTradeSnapshot();
let shortPlan = engine.computeShortTradePlan(shortSnapshot, '1d', 'stock');
assert.strictEqual(shortPlan.available, true);
assert.strictEqual(shortPlan.entryType, 'Rejection Short');
assert.ok(Number.isFinite(shortPlan.rewardPct) && shortPlan.rewardPct >= 5);
assert.ok(Number.isFinite(shortPlan.rr) && shortPlan.rr >= 1.5);

// 2) breakdown short should return valid setup when downside room is sufficient.
shortSnapshot = baseShortTradeSnapshot();
shortSnapshot.close = 97.1;
shortSnapshot.values.rsi14 = 38;
shortSnapshot.values.macdHistogram = -0.6;
shortSnapshot.values.sr.nearest.support = 97.4;
shortSnapshot.values.sr.nearest.supportDistancePct = -0.3;
shortSnapshot.values.sr.donchian.support = 97.0;
shortSnapshot.values.sr.pivot.s1 = 96.8;
shortSnapshot.values.sr.pivot.s2 = 89.4;
shortSnapshot.values.fib.levels.fib618 = 96.6;
shortSnapshot.values.fib.levels.fib786 = 89.6;
shortSnapshot.values.bbLower = 89.2;
shortSnapshot.values.reversal.supportZone = 89.5;
shortSnapshot.values.ema50 = 98.9;
shortSnapshot.values.ema200 = 99.8;
shortSnapshot.values.sr.nearest.resistance = 98.6;
shortSnapshot.values.sr.donchian.resistance = 98.9;
shortSnapshot.values.bbUpper = 103.6;
shortPlan = engine.computeShortTradePlan(shortSnapshot, '1d', 'stock');
assert.strictEqual(shortPlan.available, true);
assert.strictEqual(shortPlan.entryType, 'Breakdown Short');
assert.ok(Number.isFinite(shortPlan.rewardPct) && shortPlan.rewardPct >= 5);

// 3) exhaustion short should be valid when rally is overextended.
shortSnapshot = baseShortTradeSnapshot();
shortSnapshot.trendMeter.label = 'Neutral';
shortSnapshot.trendMeter.timeframeScore = 0;
shortSnapshot.statuses.ema = 'Neutral';
shortSnapshot.statuses.macd = 'Neutral';
shortSnapshot.close = 106.4;
shortSnapshot.values.rsi14 = 71;
shortSnapshot.values.macdLine = 0.2;
shortSnapshot.values.macdSignal = 0.25;
shortSnapshot.values.macdHistogram = -0.05;
shortSnapshot.values.bbUpper = 106.8;
shortSnapshot.values.bbLower = 97.6;
shortSnapshot.values.sr.nearest.resistance = 107.1;
shortSnapshot.values.sr.pivot.r1 = 107.3;
shortSnapshot.values.sr.pivot.r2 = 110.8;
shortSnapshot.values.sr.donchian.resistance = 108.2;
shortSnapshot.values.fib.levels.fib236 = 107.5;
shortSnapshot.values.sr.nearest.support = 101.4;
shortSnapshot.values.sr.pivot.s1 = 101.0;
shortSnapshot.values.sr.pivot.s2 = 98.1;
shortSnapshot.values.fib.levels.fib618 = 99.0;
shortSnapshot.values.fib.levels.fib786 = 96.2;
shortPlan = engine.computeShortTradePlan(shortSnapshot, '1d', 'stock');
assert.strictEqual(shortPlan.available, true);
assert.strictEqual(shortPlan.entryType, 'Exhaustion Short');
assert.ok(Number.isFinite(shortPlan.rewardPct) && shortPlan.rewardPct >= 5);

// 4) invalid short where cover >= entry must reject.
let shortValidation = engine.validateShortTradePlan({
  entryZone: { zoneLow: 100, zoneHigh: 101 },
  coverZone: { zoneLow: 101.2, zoneHigh: 101.6 },
  failureExitZone: { zoneLow: 104, zoneHigh: 105 }
}, 'stock', '1d');
assert.strictEqual(shortValidation.valid, false);
assert.match(String(shortValidation.reason), /invalid zone ordering/);

// 5) invalid short where failure exit <= entry must reject.
shortValidation = engine.validateShortTradePlan({
  entryZone: { zoneLow: 100, zoneHigh: 101 },
  coverZone: { zoneLow: 93, zoneHigh: 94 },
  failureExitZone: { zoneLow: 98.8, zoneHigh: 99.4 }
}, 'stock', '1d');
assert.strictEqual(shortValidation.valid, false);
assert.match(String(shortValidation.reason), /invalid zone ordering/);

// 6) invalid short where downside < 5% must reject fresh short entry.
shortValidation = engine.validateShortTradePlan({
  entryZone: { zoneLow: 100, zoneHigh: 101 },
  coverZone: { zoneLow: 98.2, zoneHigh: 98.7 },
  failureExitZone: { zoneLow: 102.5, zoneHigh: 103.0 }
}, 'stock', '1d');
assert.strictEqual(shortValidation.valid, false);
assert.match(String(shortValidation.reason), /downside too small|cover too close to entry/);

// 7) holder-only short management should still show cover/failure when fresh entry fails.
shortSnapshot = baseShortTradeSnapshot();
shortSnapshot.close = 100;
shortSnapshot.values.ema20 = 99.9;
shortSnapshot.values.ema50 = 99.4;
shortSnapshot.values.ema200 = 98.6;
shortSnapshot.values.sr.pivot.p = 99.8;
shortSnapshot.values.sr.nearest.resistance = 100.4;
shortSnapshot.values.sr.donchian.resistance = 100.6;
shortSnapshot.values.sr.pivot.r1 = 100.8;
shortSnapshot.values.bbUpper = 101.1;
shortSnapshot.values.sr.nearest.support = 98.8;
shortSnapshot.values.sr.donchian.support = 98.6;
shortSnapshot.values.sr.pivot.s1 = 98.7;
shortSnapshot.values.sr.pivot.s2 = 98.3;
shortSnapshot.values.bbLower = 98.4;
shortSnapshot.values.fib.swingLow = 98.2;
shortSnapshot.values.fib.levels.fib618 = 98.9;
shortSnapshot.values.fib.levels.fib786 = 98.4;
shortPlan = engine.computeShortTradePlan(shortSnapshot, '1d', 'stock');
assert.strictEqual(shortPlan.available, true);
assert.strictEqual(shortPlan.entryType, 'No setup');
assert.ok(String(shortPlan.takeProfitType).toLowerCase().indexOf('cover') !== -1);
assert.ok(String(shortPlan.failureExitType).toLowerCase().indexOf('failure') !== -1 || String(shortPlan.failureExitType).toLowerCase().indexOf('no clear') !== -1);
assert.strictEqual(shortPlan.rr, null);

// REGIME/CONFIDENCE ALIGNMENT TESTS
// 1) bullish regime + strong long pullback can be Strong.
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.trendMeter.label = 'Bullish';
tradeSnapshot.trendMeter.timeframeScore = 5;
tradeSnapshot.statuses.ema = 'Bullish';
tradeSnapshot.statuses.macd = 'Bullish';
tradeSnapshot.values.rsi14 = 58;
tradeSnapshot.values.adx14 = 31;
tradeSnapshot.values.volumeConfirmation = { status: 'Bullish confirmation' };
tradeSnapshot.values.sr.nearest.resistance = 123.4;
tradeSnapshot.values.sr.donchian.resistance = 124.2;
tradeSnapshot.values.bbUpper = 126.4;
tradeSnapshot.values.sr.pivot.r1 = 122.8;
tradeSnapshot.values.sr.pivot.r2 = 127.0;
tradeSnapshot.values.fib.levels.fib236 = 122.2;
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.available, true);
assert.ok(['Pullback Entry', 'Bounce Entry'].indexOf(String(tradePlan.entryType)) !== -1);
assert.strictEqual(String(tradePlan.confidence), 'Strong');

// 2) bearish regime + long bounce with reversal score 2 can exist but must not be Strong.
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.close = 99.5;
tradeSnapshot.trendMeter.label = 'Bearish';
tradeSnapshot.trendMeter.timeframeScore = -4;
tradeSnapshot.statuses.ema = 'Bearish';
tradeSnapshot.statuses.macd = 'Neutral';
tradeSnapshot.reversal.score = 2;
tradeSnapshot.values.rsi14 = 41;
tradeSnapshot.values.macdLine = -0.2;
tradeSnapshot.values.macdSignal = -0.1;
tradeSnapshot.values.macdHistogram = -0.15;
tradeSnapshot.values.reversal.macdHistogramRising = false;
tradeSnapshot.values.sr.nearest.support = 96.8;
tradeSnapshot.values.reversal.supportZone = 96.6;
tradeSnapshot.values.fib.levels.fib618 = 96.4;
tradeSnapshot.values.fib.levels.fib786 = 95.2;
tradeSnapshot.values.bbLower = 96.1;
tradeSnapshot.values.sr.donchian.support = 96.5;
tradeSnapshot.values.sr.pivot.s1 = 96.2;
tradeSnapshot.values.sr.pivot.s2 = 95.0;
tradeSnapshot.values.ema50 = 95.8;
tradeSnapshot.values.ema200 = 92.0;
tradeSnapshot.values.sr.nearest.resistance = 106.8;
tradeSnapshot.values.sr.donchian.resistance = 107.4;
tradeSnapshot.values.sr.pivot.r1 = 106.5;
tradeSnapshot.values.sr.pivot.r2 = 109.0;
tradeSnapshot.values.bbUpper = 108.7;
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.available, true);
assert.strictEqual(tradePlan.entryType, 'Bounce Entry');
assert.notStrictEqual(String(tradePlan.confidence), 'Strong');
assert.ok(['Caution', 'Moderate'].indexOf(String(tradePlan.confidence)) !== -1);

// 3) bearish regime + reversal score 4 + strong support + RR >= 2.2 can be Moderate (not Strong unless exceptional).
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.close = 99.2;
tradeSnapshot.trendMeter.label = 'Bearish';
tradeSnapshot.trendMeter.timeframeScore = -4;
tradeSnapshot.statuses.ema = 'Bearish';
tradeSnapshot.statuses.macd = 'Bearish'; // keep non-exceptional to enforce cap
tradeSnapshot.reversal.score = 4;
tradeSnapshot.values.rsi14 = 44;
tradeSnapshot.values.macdLine = -0.4;
tradeSnapshot.values.macdSignal = -0.2;
tradeSnapshot.values.macdHistogram = -0.2;
tradeSnapshot.values.reversal.macdHistogramRising = false;
tradeSnapshot.values.sr.nearest.support = 95.8;
tradeSnapshot.values.reversal.supportZone = 95.9;
tradeSnapshot.values.fib.levels.fib618 = 95.5;
tradeSnapshot.values.fib.levels.fib786 = 94.6;
tradeSnapshot.values.bbLower = 95.4;
tradeSnapshot.values.sr.donchian.support = 95.7;
tradeSnapshot.values.sr.pivot.s1 = 95.6;
tradeSnapshot.values.sr.pivot.s2 = 94.7;
tradeSnapshot.values.ema50 = 95.2;
tradeSnapshot.values.ema200 = 92.8;
tradeSnapshot.values.sr.nearest.resistance = 110.8;
tradeSnapshot.values.sr.donchian.resistance = 111.4;
tradeSnapshot.values.sr.pivot.r1 = 110.4;
tradeSnapshot.values.sr.pivot.r2 = 113.2;
tradeSnapshot.values.bbUpper = 112.0;
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.available, true);
assert.strictEqual(tradePlan.entryType, 'Bounce Entry');
assert.ok(Number.isFinite(tradePlan.rr) && tradePlan.rr >= 2.2);
assert.strictEqual(String(tradePlan.confidence), 'Moderate');

// 4) bearish regime + strong short breakdown can be Strong.
shortSnapshot = baseShortTradeSnapshot();
shortSnapshot.close = 97.0;
shortSnapshot.trendMeter.label = 'Bearish';
shortSnapshot.trendMeter.timeframeScore = -5;
shortSnapshot.statuses.ema = 'Bearish';
shortSnapshot.statuses.macd = 'Bearish';
shortSnapshot.values.rsi14 = 37;
shortSnapshot.values.adx14 = 31;
shortSnapshot.values.volumeConfirmation = { status: 'Bearish confirmation' };
shortSnapshot.values.sr.nearest.support = 97.3;
shortSnapshot.values.sr.nearest.supportDistancePct = -0.3;
shortSnapshot.values.sr.donchian.support = 97.1;
shortSnapshot.values.sr.pivot.s1 = 96.9;
shortSnapshot.values.sr.pivot.s2 = 89.3;
shortSnapshot.values.fib.levels.fib618 = 96.8;
shortSnapshot.values.fib.levels.fib786 = 89.5;
shortSnapshot.values.bbLower = 89.0;
shortSnapshot.values.reversal.supportZone = 89.4;
shortSnapshot.values.ema50 = 98.7;
shortSnapshot.values.ema200 = 99.8;
shortSnapshot.values.sr.nearest.resistance = 98.6;
shortSnapshot.values.sr.donchian.resistance = 98.9;
shortSnapshot.values.bbUpper = 103.8;
shortPlan = engine.computeShortTradePlan(shortSnapshot, '1d', 'stock');
assert.strictEqual(shortPlan.available, true);
assert.strictEqual(shortPlan.entryType, 'Breakdown Short');
assert.strictEqual(String(shortPlan.confidence), 'Strong');

// 5) bullish regime + short exhaustion can exist but not Strong by default.
shortSnapshot = baseShortTradeSnapshot();
shortSnapshot.close = 106.2;
shortSnapshot.trendMeter.label = 'Bullish';
shortSnapshot.trendMeter.timeframeScore = 4;
shortSnapshot.statuses.ema = 'Bullish';
shortSnapshot.statuses.macd = 'Bearish';
shortSnapshot.values.rsi14 = 69;
shortSnapshot.values.macdLine = 0.35;
shortSnapshot.values.macdSignal = 0.45;
shortSnapshot.values.macdHistogram = -0.1;
shortSnapshot.values.bbUpper = 106.8;
shortSnapshot.values.sr.nearest.resistance = 107.0;
shortSnapshot.values.sr.donchian.resistance = 107.6;
shortSnapshot.values.sr.pivot.r1 = 107.3;
shortSnapshot.values.sr.pivot.r2 = 109.8;
shortSnapshot.values.fib.levels.fib236 = 107.4;
shortSnapshot.values.sr.nearest.support = 100.2;
shortSnapshot.values.sr.donchian.support = 99.8;
shortSnapshot.values.sr.pivot.s1 = 99.9;
shortSnapshot.values.sr.pivot.s2 = 96.5;
shortSnapshot.values.fib.levels.fib618 = 99.4;
shortSnapshot.values.fib.levels.fib786 = 95.9;
shortSnapshot.values.bbLower = 96.2;
shortPlan = engine.computeShortTradePlan(shortSnapshot, '1d', 'stock');
assert.strictEqual(shortPlan.available, true);
assert.strictEqual(shortPlan.entryType, 'Exhaustion Short');
assert.notStrictEqual(String(shortPlan.confidence), 'Strong');
assert.ok(['Caution', 'Moderate'].indexOf(String(shortPlan.confidence)) !== -1);

// 6) neutral regime quality setups are slightly penalized but should still produce a valid plan.
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.trendMeter.label = 'Neutral';
tradeSnapshot.trendMeter.timeframeScore = 1;
tradeSnapshot.statuses.ema = 'Bullish';
tradeSnapshot.statuses.macd = 'Bullish';
tradeSnapshot.values.rsi14 = 56;
tradeSnapshot.values.adx14 = 26;
tradeSnapshot.values.volumeConfirmation = { status: 'Bullish confirmation' };
tradeSnapshot.values.sr.nearest.resistance = 112.6;
tradeSnapshot.values.sr.donchian.resistance = 113.1;
tradeSnapshot.values.bbUpper = 114.2;
tradeSnapshot.values.sr.pivot.r1 = 112.1;
tradeSnapshot.values.sr.pivot.r2 = 114.9;
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.available, true);
assert.ok(['Caution', 'Moderate', 'Strong'].indexOf(String(tradePlan.confidence)) !== -1);

// baseline no-setup sanity case.
tradeSnapshot = {
  close: 100,
  timeKey: '1d',
  values: {
    ema20: 100.1,
    ema50: null,
    ema200: null,
    rsi14: 52,
    macdLine: 0,
    macdSignal: 0,
    macdHistogram: 0,
    bbUpper: null,
    bbLower: null,
    atr14: null,
    adx14: null,
    volumeConfirmation: { status: 'Neutral' },
    fib: { available: false, levels: null },
    sr: { pivot: null, donchian: null, nearest: null },
    reversal: { nearSupport: false, macdHistogramRising: false, supportZone: null }
  },
  statuses: {
    ema: 'Neutral',
    macd: 'Neutral',
    rsi: 'Neutral',
    bollinger: 'Neutral',
    sr: 'Neutral'
  },
  trendMeter: {
    label: 'Neutral',
    timeframeScore: 0
  },
  reversal: { score: 0, reasons: [] },
  emaPosition: { label: 'Neutral' },
  overall: 'Neutral'
};
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.entryType, 'No setup');
assert.strictEqual(tradePlan.available, false);

console.log('indicator-engine tests passed');
