// Deterministic assertions for local risk meter scoring behavior.
const assert = require('assert');
const risk = require('./risk-meter.js');

function makeCandles(length, opts) {
  const out = [];
  const cfg = Object.assign({
    start: 100,
    drift: 0.2,
    swing: 0.6,
    volume: 2000000,
    volumeSwing: 200000
  }, opts || {});
  let close = cfg.start;
  for (let i = 0; i < length; i += 1) {
    const sign = i % 2 === 0 ? 1 : -1;
    const move = cfg.drift + (sign * cfg.swing * 0.25);
    close = Math.max(0.5, close + move);
    const open = Math.max(0.5, close - (move * 0.7));
    const high = Math.max(open, close) + Math.abs(move * 1.6) + 0.4;
    const low = Math.max(0.1, Math.min(open, close) - Math.abs(move * 1.4) - 0.35);
    const volume = Math.max(1, cfg.volume + (sign * cfg.volumeSwing));
    out.push({
      t: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      o: Number(open.toFixed(4)),
      h: Number(high.toFixed(4)),
      l: Number(low.toFixed(4)),
      c: Number(close.toFixed(4)),
      v: Number(volume.toFixed(0))
    });
  }
  return out;
}

function assertBetween(value, min, max, label) {
  assert.ok(Number.isFinite(value), `${label} should be finite`);
  assert.ok(value >= min && value <= max, `${label} expected ${min}..${max}, got ${value}`);
}

// 1) Low-vol stock with stronger fundamentals should be lower risk.
const lowVolStock = makeCandles(320, { drift: 0.15, swing: 0.2, volume: 4500000, volumeSwing: 50000 });
const lowVolStockRisk = risk.computeRiskMeter('stock', '1d', {
  candles: lowVolStock,
  indicator: { trendLabel: 'Bullish', trendScore: 4, adx14: 28 },
  fundamentals: {
    altmanZScore: 4.8,
    debtToEquity: 0.45,
    freeCashFlow: 1500000000,
    revenueGrowthYoY: 14,
    epsGrowthYoY: 18,
    nextEarningsDate: '2026-04-30'
  },
  todayDate: '2026-03-09'
});
assertBetween(lowVolStockRisk.score, 0, 55, 'lowVolStockRisk');

// 2) High-vol stock with near earnings should score higher.
const highVolStock = makeCandles(320, { drift: -0.1, swing: 3.4, volume: 700000, volumeSwing: 350000 });
const highVolStockRisk = risk.computeRiskMeter('stock', '1d', {
  candles: highVolStock,
  indicator: { trendLabel: 'Bearish', trendScore: -5, adx14: 31 },
  fundamentals: {
    altmanZScore: 1.2,
    debtToEquity: 2.8,
    freeCashFlow: -120000000,
    revenueGrowthYoY: -16,
    epsGrowthYoY: -22,
    nextEarningsDate: '2026-03-11'
  },
  todayDate: '2026-03-09'
});
assertBetween(highVolStockRisk.score, 45, 100, 'highVolStockRisk');
assert.ok(highVolStockRisk.score > lowVolStockRisk.score, 'near-earnings high-vol stock should be riskier');

// 3) High-vol + low-liquidity crypto should be high risk.
const riskyCryptoCandles = makeCandles(260, { start: 2.4, drift: -0.03, swing: 0.35, volume: 45000, volumeSwing: 22000 });
const riskyCrypto = risk.computeRiskMeter('crypto', '1d', {
  candles: riskyCryptoCandles,
  indicator: { trendLabel: 'Bearish', fibStatus: 'Structure Failure' },
  marketData: {
    marketCap: 12000000,
    fdv: 180000000,
    circulatingSupply: 15000000,
    maxSupply: 200000000,
    volume24h: 180000
  }
});
assertBetween(riskyCrypto.score, 60, 100, 'riskyCrypto');

// 4) Larger-cap liquid crypto with lower dilution should be lower risk.
const saferCryptoCandles = makeCandles(260, { start: 2400, drift: 2.2, swing: 9, volume: 2800000, volumeSwing: 240000 });
const saferCrypto = risk.computeRiskMeter('crypto', '1d', {
  candles: saferCryptoCandles,
  indicator: { trendLabel: 'Bullish', fibStatus: 'Strong Trend' },
  marketData: {
    marketCap: 28000000000,
    fdv: 31000000000,
    circulatingSupply: 115000000,
    maxSupply: 130000000,
    volume24h: 3800000000
  }
});
assertBetween(saferCrypto.score, 0, 65, 'saferCrypto');
assert.ok(riskyCrypto.score > saferCrypto.score, 'risky crypto should score above liquid large-cap crypto');

// 5) Earnings proximity should raise stock risk when other inputs are equal.
const earningsFar = risk.computeRiskMeter('stock', '1d', {
  candles: highVolStock,
  indicator: { trendLabel: 'Bearish', trendScore: -5, adx14: 31 },
  fundamentals: {
    altmanZScore: 2.0,
    debtToEquity: 1.5,
    freeCashFlow: -1,
    revenueGrowthYoY: -5,
    epsGrowthYoY: -8,
    nextEarningsDate: '2026-04-30'
  },
  todayDate: '2026-03-09'
});
const earningsNear = risk.computeRiskMeter('stock', '1d', {
  candles: highVolStock,
  indicator: { trendLabel: 'Bearish', trendScore: -5, adx14: 31 },
  fundamentals: {
    altmanZScore: 2.0,
    debtToEquity: 1.5,
    freeCashFlow: -1,
    revenueGrowthYoY: -5,
    epsGrowthYoY: -8,
    nextEarningsDate: '2026-03-10'
  },
  todayDate: '2026-03-09'
});
assert.ok(earningsNear.score >= earningsFar.score, 'near earnings should not reduce risk');

// 6) Deterministic repeat run (dependency unchanged style behavior).
const repeatA = risk.computeRiskMeter('crypto', '1w', {
  candles: saferCryptoCandles,
  indicator: { trendLabel: 'Bullish', fibStatus: 'Normal Pullback' },
  marketData: {
    marketCap: 18000000000,
    fdv: 22000000000,
    circulatingSupply: 82000000,
    totalSupply: 100000000,
    volume24h: 2200000000
  }
});
const repeatB = risk.computeRiskMeter('crypto', '1w', {
  candles: saferCryptoCandles,
  indicator: { trendLabel: 'Bullish', fibStatus: 'Normal Pullback' },
  marketData: {
    marketCap: 18000000000,
    fdv: 22000000000,
    circulatingSupply: 82000000,
    totalSupply: 100000000,
    volume24h: 2200000000
  }
});
assert.strictEqual(repeatA.score, repeatB.score, 'same input should produce same score');
assert.strictEqual(repeatA.label, repeatB.label, 'same input should produce same label');

console.log('risk-meter.test.js passed');
