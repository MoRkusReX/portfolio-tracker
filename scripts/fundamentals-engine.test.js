// Verifies deterministic quality/valuation scoring and cache-freshness helpers.
const assert = require('assert');
const engine = require('./fundamentals-engine.js');

// Cache freshness decisions.
const now = 1_700_000_000_000;
assert.strictEqual(engine.isFresh(now - 1000, 5000, now), true);
assert.strictEqual(engine.isFresh(now - 6000, 5000, now), false);
assert.strictEqual(engine.isFresh(0, 5000, now), false);

// Quality scoring with all metrics present and strong quality profile.
const qualityStrong = engine.computeStockQualityScore({
  revenueGrowthYoY: 18,
  epsGrowthYoY: 14,
  operatingMarginPct: 22,
  freeCashFlow: 9_000_000_000,
  debtToEquity: 0.4,
  roePct: 24,
  piotroskiScore: 8,
  altmanZScore: 4.6
});
assert.strictEqual(qualityStrong.earnedPoints, 8);
assert.strictEqual(qualityStrong.availableMetrics, 8);
assert.strictEqual(qualityStrong.label, 'Strong Quality');
assert.ok(qualityStrong.ratio >= 0.99);

// Quality scoring with missing metrics should normalize denominator fairly.
const qualityMissing = engine.computeStockQualityScore({
  revenueGrowthYoY: 12,
  epsGrowthYoY: null,
  operatingMarginPct: null,
  grossMarginPct: 28,
  freeCashFlow: 1_200_000_000,
  debtToEquity: null,
  roePct: null,
  piotroskiScore: null,
  altmanZScore: 3.4
});
assert.strictEqual(qualityMissing.availableMetrics, 4);
assert.strictEqual(qualityMissing.earnedPoints, 4);
assert.strictEqual(qualityMissing.label, 'Strong Quality');

// Valuation cheap case.
const valuationCheap = engine.computeStockValuationScore({
  pe: 14,
  ps: 2.2
});
assert.strictEqual(valuationCheap.label, 'Cheap');
assert.ok(valuationCheap.avg <= -0.5);

// Valuation fair case.
const valuationFair = engine.computeStockValuationScore({
  pe: 24,
  ps: 5.4
});
assert.strictEqual(valuationFair.label, 'Fair');
assert.ok(valuationFair.avg > -0.5 && valuationFair.avg < 0.5);

// Valuation expensive case.
const valuationExpensive = engine.computeStockValuationScore({
  pe: 65,
  ps: 17
});
assert.strictEqual(valuationExpensive.label, 'Expensive');
assert.ok(valuationExpensive.avg >= 0.5);

// TSLA-like case should separate quality from valuation instead of blanket weak.
const tslaLikeQuality = engine.computeStockQualityScore({
  revenueGrowthYoY: 2.5,
  epsGrowthYoY: -6.8,
  operatingMarginPct: 8.4,
  freeCashFlow: 4_700_000_000,
  debtToEquity: 0.2,
  roePct: 14.1,
  piotroskiScore: 6,
  altmanZScore: 7.3
});
const tslaLikeValuation = engine.computeStockValuationScore({
  pe: 58,
  ps: 9.8
});
assert.ok(tslaLikeQuality.label === 'Mixed' || tslaLikeQuality.label === 'Healthy');
assert.strictEqual(tslaLikeValuation.label, 'Expensive');

// Valuation interpretation helper still maps correctly for P/E + P/S quick usage.
assert.strictEqual(engine.interpretValuation(55, 12).label, 'Expensive');
assert.strictEqual(engine.interpretValuation(14, 2.5).label, 'Cheap');
assert.strictEqual(engine.interpretValuation(24, 6).label, 'Fair');

// Crypto helpers still behave as expected.
assert.strictEqual(engine.mapCryptoFAScoreToLabel(4), 'Strong Token Fundamentals');
assert.strictEqual(engine.interpretDilutionRisk(100, 120, 90, 100).label, 'Low dilution risk');
const microCap = engine.interpretCryptoMarketCap(800_000);
assert.strictEqual(microCap.band, 'Micro cap');
assert.strictEqual(microCap.status, 'Risk');
const midCap = engine.interpretCryptoMarketCap(800_000_000);
assert.strictEqual(midCap.band, 'Mid cap');
assert.strictEqual(midCap.status, 'Healthy');

console.log('fundamentals-engine tests passed');
