// Validates weighted stock/ETF classification, confidence metadata, and sector-mode helpers.
const assert = require('assert');
const Engine = require('./sector-allocation.js');

function classify(symbol, payload) {
  return Engine.normalizeStockClassification(Object.assign({
    symbol: symbol,
    source: 'test',
    lastFetchedAt: 1700000000000
  }, payload || {}));
}

function hasClassifierMeta(result) {
  assert.ok(result);
  assert.ok(result.classificationVersion === Engine.CLASSIFICATION_VERSION);
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
  assert.ok(typeof result.confidence === 'number');
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
}

function isOneOf(actual, expected) {
  return expected.indexOf(actual) >= 0;
}

// Asset type detection gates.
assert.strictEqual(Engine.detectAssetType({ rawAssetType: 'Common Stock' }), 'stock');
assert.strictEqual(Engine.detectAssetType({ rawAssetType: 'ETF' }), 'etf');
assert.strictEqual(Engine.detectAssetType({ rawAssetType: 'Unknown', rawDescription: 'UCITS ETF tracking global index' }), 'etf');
assert.strictEqual(Engine.detectAssetType({ rawAssetType: 'Coin', rawDescription: 'digital asset' }), 'crypto');

// Stock theme specificity.
const achr = classify('ACHR', {
  rawSector: 'Industrials',
  rawIndustry: 'Aviation',
  rawDescription: 'Electric vertical takeoff and landing aircraft.'
});
assert.strictEqual(achr.assetType, 'stock');
assert.strictEqual(achr.normalizedSectorGroup, 'Industrials');
assert.strictEqual(achr.normalizedIndustryTheme, 'Aerospace & Air Mobility');
hasClassifierMeta(achr);

const joby = classify('JOBY', {
  rawSector: 'Industrials',
  rawIndustry: 'Air Mobility',
  rawDescription: 'eVTOL aircraft developer.'
});
assert.strictEqual(joby.assetType, 'stock');
assert.strictEqual(joby.normalizedSectorGroup, 'Industrials');
assert.strictEqual(joby.normalizedIndustryTheme, 'Aerospace & Air Mobility');
hasClassifierMeta(joby);

const jobyAirlines = classify('JOBY', {
  rawSector: 'Industrials',
  rawIndustry: 'Airlines',
  rawDescription: 'Advanced aviation and air mobility platform.'
});
assert.strictEqual(jobyAirlines.normalizedSectorGroup, 'Industrials');
assert.strictEqual(jobyAirlines.normalizedIndustryTheme, 'Aerospace & Air Mobility');
hasClassifierMeta(jobyAirlines);

const amd = classify('AMD', {
  rawSector: 'Technology',
  rawIndustry: 'Semiconductors',
  rawDescription: 'GPU and CPU chipmaker.'
});
assert.strictEqual(amd.normalizedSectorGroup, 'Technology');
assert.strictEqual(amd.normalizedIndustryTheme, 'Semiconductors');
hasClassifierMeta(amd);

const path = classify('PATH', {
  rawSector: 'Technology',
  rawIndustry: 'Software - Infrastructure',
  rawDescription: 'Enterprise automation and workflow platform.'
});
assert.strictEqual(path.normalizedSectorGroup, 'Technology');
assert.strictEqual(path.normalizedIndustryTheme, 'Enterprise Software');
hasClassifierMeta(path);

const mndy = classify('MNDY', {
  rawSector: 'Technology',
  rawIndustry: 'Software - Application',
  rawDescription: 'SaaS work management platform for teams.'
});
assert.strictEqual(mndy.normalizedSectorGroup, 'Technology');
assert.ok(isOneOf(mndy.normalizedIndustryTheme, ['SaaS / Work Management', 'Enterprise Software']));
hasClassifierMeta(mndy);

const unity = classify('U', {
  rawSector: 'Technology',
  rawIndustry: 'Interactive Media & Services',
  rawDescription: 'Real-time 3D game engine and ad monetization tools.'
});
assert.strictEqual(unity.normalizedSectorGroup, 'Technology');
assert.strictEqual(unity.normalizedIndustryTheme, 'Gaming / AdTech');
hasClassifierMeta(unity);

const rbrk = classify('RBRK', {
  rawSector: 'Technology',
  rawIndustry: 'Security Software',
  rawDescription: 'Cybersecurity and data protection platform.'
});
assert.strictEqual(rbrk.normalizedSectorGroup, 'Technology');
assert.strictEqual(rbrk.normalizedIndustryTheme, 'Cybersecurity / Data Protection');
hasClassifierMeta(rbrk);

const iot = classify('IOT', {
  rawSector: 'Technology',
  rawIndustry: 'Internet of Things',
  rawDescription: 'Connected devices and industrial software telemetry platform.'
});
assert.strictEqual(iot.normalizedSectorGroup, 'Technology');
assert.strictEqual(iot.normalizedIndustryTheme, 'IoT / Industrial Software');
hasClassifierMeta(iot);

const zeta = classify('ZETA', {
  rawSector: 'Technology',
  rawIndustry: 'Advertising Technology',
  rawDescription: 'Marketing technology and customer data platform.'
});
assert.strictEqual(zeta.normalizedSectorGroup, 'Technology');
assert.ok(isOneOf(zeta.normalizedIndustryTheme, ['Marketing Tech / Data Software', 'Data / Analytics']));
hasClassifierMeta(zeta);

// ETF path and theme extraction from metadata (no ticker hardcoding).
const thnq = classify('THNQ', {
  rawAssetType: 'ETF',
  rawName: 'ROBO Global Artificial Intelligence ETF',
  rawDescription: 'AI and robotics thematic fund.'
});
assert.strictEqual(thnq.assetType, 'etf');
assert.strictEqual(thnq.normalizedSectorGroup, 'ETF');
assert.strictEqual(thnq.normalizedIndustryTheme, 'AI / Thematic Equity');
hasClassifierMeta(thnq);

const vwra = classify('VWRA', {
  rawAssetType: 'ETF',
  rawName: 'Vanguard FTSE All-World UCITS ETF',
  rawDescription: 'Tracks a global equity index.',
  rawCategory: 'Global Equity'
});
assert.strictEqual(vwra.assetType, 'etf');
assert.strictEqual(vwra.normalizedSectorGroup, 'ETF');
assert.strictEqual(vwra.normalizedIndustryTheme, 'ETF');
hasClassifierMeta(vwra);

const wsml = classify('WSML', {
  rawAssetType: 'ETF',
  rawName: 'iShares MSCI World Small Cap UCITS ETF',
  rawDescription: 'Tracks the MSCI World Small Cap index.',
  rawCategory: 'World Small Cap Equity'
});
assert.strictEqual(wsml.assetType, 'etf');
assert.strictEqual(wsml.normalizedSectorGroup, 'ETF');
assert.strictEqual(wsml.normalizedIndustryTheme, 'World Small Cap Equity');
hasClassifierMeta(wsml);

assert.notStrictEqual(thnq.normalizedSectorGroup, 'Other / Unknown');
assert.notStrictEqual(vwra.normalizedSectorGroup, 'Other / Unknown');
assert.notStrictEqual(wsml.normalizedSectorGroup, 'Other / Unknown');

// Provider selection: Finnhub primary when strong.
const fromFinnhub = Engine.selectSectorMetadataFromProviders(
  'AMD',
  { sector: 'Technology', finnhubIndustry: 'Semiconductors', name: 'Advanced Micro Devices', type: 'Common Stock' },
  { Sector: 'Technology', Industry: 'Computer Hardware', AssetType: 'Common Stock' },
  { assetType: 'Common Stock' },
  1700000000000
);
assert.strictEqual(fromFinnhub.normalizedSectorGroup, 'Technology');
assert.strictEqual(fromFinnhub.normalizedIndustryTheme, 'Semiconductors');
hasClassifierMeta(fromFinnhub);

// Provider fallback: Finnhub missing -> Alpha Vantage drives result.
const fromAlphaFallback = Engine.selectSectorMetadataFromProviders(
  'JOBY',
  {},
  {
    Sector: 'Industrials',
    Industry: 'Aerospace & Defense',
    AssetType: 'Common Stock',
    Name: 'Joby Aviation'
  },
  { assetType: 'Common Stock' },
  1700000000000
);
assert.ok(String(fromAlphaFallback.source || '').indexOf('alpha-vantage') >= 0);
assert.strictEqual(fromAlphaFallback.normalizedSectorGroup, 'Industrials');
assert.strictEqual(fromAlphaFallback.normalizedIndustryTheme, 'Aerospace & Air Mobility');
hasClassifierMeta(fromAlphaFallback);

// ETF provider path from listing/overview metadata.
const fromEtfListing = Engine.selectSectorMetadataFromProviders(
  'THNQ',
  { sector: null, finnhubIndustry: null, name: 'ROBO Global Artificial Intelligence ETF' },
  { Sector: null, Industry: null, Name: 'ROBO Global Artificial Intelligence ETF', Description: 'AI thematic fund', AssetType: '' },
  { assetType: 'ETF' },
  1700000000000
);
assert.strictEqual(fromEtfListing.assetType, 'etf');
assert.strictEqual(fromEtfListing.normalizedSectorGroup, 'ETF');
assert.strictEqual(fromEtfListing.normalizedIndustryTheme, 'AI / Thematic Equity');
hasClassifierMeta(fromEtfListing);

// Unknown metadata gracefully degrades with explicit reason.
const unknown = Engine.selectSectorMetadataFromProviders('ZZZZ', null, null, null, 1700000000000);
assert.strictEqual(unknown.normalizedSectorGroup, 'Other / Unknown');
assert.ok(unknown.reasonIfUnavailable || unknown.reason);

// Stock fallback: when sector is unknown, finnhubIndustry should still map sector.
const finnhubIndustryFallback = classify('AAPL', {
  rawAssetType: 'Common Stock',
  rawSector: 'Other / Unknown',
  rawIndustry: 'Technology',
  finnhubIndustry: 'Technology',
  rawName: 'Apple Inc'
});
assert.strictEqual(finnhubIndustryFallback.assetType, 'stock');
assert.strictEqual(finnhubIndustryFallback.normalizedSectorGroup, 'Technology');
assert.notStrictEqual(finnhubIndustryFallback.normalizedSectorGroup, 'Other / Unknown');
hasClassifierMeta(finnhubIndustryFallback);

// Version/quality-based cache reclassification guard.
assert.strictEqual(Engine.shouldReclassifyCachedRecord(null, Engine.CLASSIFICATION_VERSION), true);
assert.strictEqual(Engine.shouldReclassifyCachedRecord({
  normalizedSectorGroup: 'Technology',
  normalizedIndustryTheme: 'Semiconductors',
  confidence: 0.91,
  reason: 'industry matched semiconductors',
  classificationVersion: Engine.CLASSIFICATION_VERSION
}, Engine.CLASSIFICATION_VERSION), false);
assert.strictEqual(Engine.shouldReclassifyCachedRecord({
  normalizedSectorGroup: 'Other / Unknown',
  normalizedIndustryTheme: 'Other / Unknown',
  confidence: 0.2,
  reason: 'fallback',
  classificationVersion: Engine.CLASSIFICATION_VERSION
}, Engine.CLASSIFICATION_VERSION), true);
assert.strictEqual(Engine.shouldReclassifyCachedRecord({
  normalizedSectorGroup: 'Technology',
  normalizedIndustryTheme: 'Enterprise Software',
  confidence: 0.8,
  reason: 'legacy',
  classificationVersion: 'sector-classifier-v1'
}, Engine.CLASSIFICATION_VERSION), true);

// Sector pie aggregation by grouped market values.
const allocation = Engine.getSectorAllocationData([
  { type: 'stock', symbol: 'AAPL', marketValue: 5000 },
  { type: 'stock', symbol: 'MSFT', marketValue: 3000 },
  { type: 'stock', symbol: 'JPM', marketValue: 2000 },
  { type: 'crypto', symbol: 'BTC', marketValue: 4000 }
], {
  AAPL: { normalizedSectorGroup: 'Technology' },
  MSFT: { normalizedSectorGroup: 'Technology' },
  JPM: { normalizedSectorGroup: 'Financials' }
});
assert.deepStrictEqual(allocation.labels, ['Technology', 'Crypto', 'Financials']);
assert.deepStrictEqual(allocation.values, [8000, 4000, 2000]);

const themeAllocation = Engine.getThemeAllocationData([
  { type: 'stock', symbol: 'AAPL', marketValue: 5000 },
  { type: 'stock', symbol: 'MSFT', marketValue: 3000 },
  { type: 'stock', symbol: 'JPM', marketValue: 2000 }
], {
  AAPL: { normalizedIndustryTheme: 'Semiconductors' },
  MSFT: { normalizedIndustryTheme: 'Enterprise Software' },
  JPM: { normalizedIndustryTheme: 'Banks' }
});
assert.deepStrictEqual(themeAllocation.labels, ['Semiconductors', 'Enterprise Software', 'Banks']);
assert.deepStrictEqual(themeAllocation.values, [5000, 3000, 2000]);

// Hover mapping remains mode-specific.
assert.strictEqual(Engine.getChartKeyForHover({ symbol: 'AAPL', normalizedSectorGroup: 'Technology' }, 'stocks'), 'AAPL');
assert.strictEqual(Engine.getChartKeyForHover({ symbol: 'AAPL', normalizedSectorGroup: 'Technology' }, 'sectors'), 'Technology');

// Sector mode list sort by sector then theme.
const sorted = Engine.sortStocksBySector([
  { symbol: 'MSFT', marketValue: 2000, plAmount: 10, dayChangePct: 1 },
  { symbol: 'JPM', marketValue: 5000, plAmount: 20, dayChangePct: 2 },
  { symbol: 'AMD', marketValue: 7000, plAmount: 30, dayChangePct: 3 }
], {
  MSFT: { normalizedSectorGroup: 'Technology', normalizedIndustryTheme: 'Enterprise Software' },
  JPM: { normalizedSectorGroup: 'Financials', normalizedIndustryTheme: 'Banks' },
  AMD: { normalizedSectorGroup: 'Technology', normalizedIndustryTheme: 'Semiconductors' }
}, 'value-desc');
assert.deepStrictEqual(sorted.map((x) => x.symbol), ['JPM', 'MSFT', 'AMD']);

// Cache freshness helper.
assert.strictEqual(Engine.isSectorMetadataFresh({ lastFetchedAt: 1000 }, 500, 1200), true);
assert.strictEqual(Engine.isSectorMetadataFresh({ lastFetchedAt: 1000 }, 100, 1200), false);

console.log('sector-allocation.test.js passed');
