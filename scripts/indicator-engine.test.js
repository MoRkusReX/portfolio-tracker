// Lightweight assertions that validate the core indicator math helpers.
const assert = require('assert');
const engine = require('./indicator-engine.js');

function closeTo(actual, expected, epsilon) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} not within ${epsilon} of ${expected}`);
}

const sample = [];
for (let i = 1; i <= 80; i += 1) {
  sample.push({
    t: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    o: i - 0.5,
    h: i + 1,
    l: i - 1,
    c: i,
    v: 1000 + i
  });
}

const closes = sample.map((row) => row.c);
const sma20 = engine.sma(closes, 20);
const ema20 = engine.ema(closes, 20);
const rsi14 = engine.rsi(closes, 14);
const macd = engine.macd(closes, 12, 26, 9);
const bands = engine.bollinger(closes, 20, 2);
const snapshot = engine.analyze(sample, { timeKey: '1d' });
const summary = engine.summarizeByTimeframe({
  '1d': snapshot,
  '1w': Object.assign({}, snapshot, { score: 2 }),
  '1m': Object.assign({}, snapshot, { score: 3 })
});

assert.strictEqual(sma20[18], null);
closeTo(sma20[19], 10.5, 1e-9);
assert.strictEqual(ema20[18], null);
closeTo(ema20[19], 10.5, 1e-9);
assert.ok(rsi14[14] > 99.9);
assert.ok(macd.line[25] !== null);
assert.ok(macd.signal[33] !== null);
assert.ok(bands.middle[19] !== null && bands.upper[19] > bands.middle[19] && bands.lower[19] < bands.middle[19]);
assert.strictEqual(snapshot.overall, 'Bullish');
assert.strictEqual(snapshot.statuses.ema, 'Bullish');
assert.strictEqual(snapshot.statuses.rsi, 'Bullish');
assert.strictEqual(summary.overall, 'Bullish');

console.log('indicator-engine tests passed');
