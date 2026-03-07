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

// Trade plan: bullish pullback setup.
let tradeSnapshot = baseTradeSnapshot();
let tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.entryType, 'Trend Pullback Entry');
assert.ok(Number.isFinite(tradePlan.entryZoneLow));
assert.ok(Number.isFinite(tradePlan.entryZoneHigh));

// Trade plan: bounce setup.
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.trendMeter.label = 'Neutral';
tradeSnapshot.statuses.ema = 'Neutral';
tradeSnapshot.statuses.macd = 'Neutral';
tradeSnapshot.values.rsi14 = 34;
tradeSnapshot.reversal.score = 3;
tradeSnapshot.reversal.label = 'Strong bounce potential';
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.entryType, 'Bounce Entry');

// Trade plan: breakout setup.
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.close = 103.9;
tradeSnapshot.values.rsi14 = 66;
tradeSnapshot.values.adx14 = 33;
tradeSnapshot.values.sr.nearest.resistanceDistancePct = 0.4;
tradeSnapshot.values.sr.nearest.supportDistancePct = -4.2;
tradeSnapshot.values.sr.donchian.midpoint = 100.2;
tradeSnapshot.values.sr.donchian.resistance = 104.2;
tradeSnapshot.values.ema20 = 101;
tradeSnapshot.values.ema50 = 98;
tradeSnapshot.emaPosition.label = 'Strong Bullish';
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.entryType, 'Breakout Entry');

// Trade plan: take-profit exit.
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.trendMeter.label = 'Bullish';
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.takeProfitType, 'Take Profit Zone');
assert.ok(Number.isFinite(tradePlan.takeProfitZoneLow));
assert.ok(Number.isFinite(tradePlan.takeProfitZoneHigh));
assert.ok(tradePlan.takeProfitZoneLow > tradeSnapshot.close);
assert.ok(tradePlan.takeProfitZoneHigh > tradeSnapshot.close);
assert.ok(Number.isFinite(tradePlan.failureExitZoneLow));
assert.ok(Number.isFinite(tradePlan.failureExitZoneHigh));
assert.ok(tradePlan.failureExitZoneLow < tradeSnapshot.close);
assert.ok(tradePlan.failureExitZoneHigh < tradeSnapshot.close);

// Trade plan: defensive exit.
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.trendMeter.label = 'Bearish';
tradeSnapshot.statuses.ema = 'Bearish';
tradeSnapshot.statuses.macd = 'Bearish';
tradeSnapshot.values.volumeConfirmation.status = 'Bearish confirmation';
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.failureExitType, 'Trend Failure Exit');

// Trade plan: weak case (no take-profit, only failure exit).
tradeSnapshot = baseTradeSnapshot();
tradeSnapshot.close = 111;
tradeSnapshot.values.sr.nearest.resistance = 105;
tradeSnapshot.values.sr.donchian.resistance = 106;
tradeSnapshot.values.bbUpper = 108;
tradeSnapshot.values.fib.levels.fib236 = 104;
tradeSnapshot.values.sr.pivot.r1 = 103;
tradeSnapshot.values.sr.pivot.r2 = 104;
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.takeProfitType, 'No clear take-profit zone');
assert.strictEqual(tradePlan.failureExitType, 'Trend Failure Exit');
assert.ok(Number.isFinite(tradePlan.failureExitZoneLow));
assert.ok(Number.isFinite(tradePlan.failureExitZoneHigh));
assert.ok(tradePlan.failureExitZoneHigh < tradeSnapshot.close);

// Trade plan: invalid-zone prevention.
tradeSnapshot = {
  close: 100,
  timeKey: '1d',
  values: {
    ema20: 100,
    ema50: null,
    ema200: null,
    rsi14: 58,
    macdLine: 0.2,
    macdSignal: 0.1,
    macdHistogram: 0.1,
    bbUpper: null,
    bbLower: null,
    adx14: 26,
    volumeConfirmation: { status: 'Bullish confirmation' },
    fib: { available: false, levels: null },
    sr: {
      pivot: { r1: null, r2: null, s1: null, s2: null },
      donchian: { resistance: null, support: null, midpoint: null },
      nearest: { resistance: 100.2, support: 99.8 }
    },
    reversal: { nearSupport: true, macdHistogramRising: true, supportZone: null }
  },
  statuses: { ema: 'Bullish', macd: 'Bullish', rsi: 'Neutral', bollinger: 'Neutral', sr: 'Neutral' },
  trendMeter: { label: 'Bullish', timeframeScore: 3 },
  reversal: { score: 2, reasons: [] },
  emaPosition: { label: 'Pullback' },
  overall: 'Bullish'
};
tradePlan = engine.computeTradePlan(tradeSnapshot, '1d', 'stock');
assert.strictEqual(tradePlan.takeProfitType, 'No clear take-profit zone');
assert.strictEqual(tradePlan.failureExitType, 'No clear failure exit');

// Trade plan: no setup.
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
assert.strictEqual(tradePlan.exitType, 'No setup');
assert.strictEqual(tradePlan.available, false);

console.log('indicator-engine tests passed');
