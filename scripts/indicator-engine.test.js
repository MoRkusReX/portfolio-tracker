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
const snapshot = engine.analyze(sample, { timeKey: '1d' });
assert.strictEqual(snapshot.overall, 'Bullish');
assert.strictEqual(snapshot.statuses.ema, 'Bullish');
assert.strictEqual(snapshot.statuses.rsi, 'Bullish');
assert.ok(snapshot.trendMeter && typeof snapshot.trendMeter.timeframeScore === 'number');
assert.ok(snapshot.reversal && typeof snapshot.reversal.score === 'number');

const summary = engine.summarizeByTimeframe({
  '1d': { trendMeter: { timeframeScore: 1 } },
  '1w': { trendMeter: { timeframeScore: 2 } },
  '1m': { trendMeter: { timeframeScore: 3 } }
});
assert.strictEqual(summary.weightedScore, 14);
assert.strictEqual(summary.overall, 'Bullish');
assert.strictEqual(summary.trendMeter.overallLabel, 'Bullish');

console.log('indicator-engine tests passed');
