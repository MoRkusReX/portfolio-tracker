// Verifies earnings-aware refresh helper behavior and panel fields for stock-only next-earnings UI.
const assert = require('assert');
const serviceModule = require('./fundamentals-service.js');

const helpers = serviceModule.__test || {};

const {
  componentFresh,
  extractFmpErrorMessage,
  buildSecNormalizedFundamentals,
  missingStockMetricKeys,
  parseFinnhubFinancialRows,
  mapFinnhubMetricToRatios,
  normalizeDateOnly,
  shouldRefreshEarningsMetadata,
  shouldForcePostEarningsRefresh,
  getNextUpcomingEarningsDateFromApiResponse,
  getComponentsToRefreshForPostEarnings,
  describeEarningsDate,
  buildStockPanel,
  buildCryptoPanel
} = helpers;

assert.strictEqual(typeof normalizeDateOnly, 'function');
assert.strictEqual(typeof componentFresh, 'function');
assert.strictEqual(typeof extractFmpErrorMessage, 'function');
assert.strictEqual(typeof parseFinnhubFinancialRows, 'function');
assert.strictEqual(typeof mapFinnhubMetricToRatios, 'function');
assert.strictEqual(typeof buildSecNormalizedFundamentals, 'function');
assert.strictEqual(typeof missingStockMetricKeys, 'function');
assert.strictEqual(typeof shouldRefreshEarningsMetadata, 'function');
assert.strictEqual(typeof shouldForcePostEarningsRefresh, 'function');
assert.strictEqual(typeof getNextUpcomingEarningsDateFromApiResponse, 'function');
assert.strictEqual(typeof buildStockPanel, 'function');
assert.strictEqual(typeof buildCryptoPanel, 'function');

const now = Date.parse('2026-03-06T09:00:00Z');
const today = '2026-03-06';
const oneHour = 1000 * 60 * 60;
const oneDay = 1000 * 60 * 60 * 24;

// Freshness requires non-null component payload data to avoid caching empty error snapshots.
assert.strictEqual(componentFresh({ fetchedAt: now - oneHour, data: { ok: true } }, oneDay), true);
assert.strictEqual(componentFresh({ fetchedAt: now - oneHour, data: null }, oneDay), false);
assert.strictEqual(componentFresh({ fetchedAt: now - oneHour }, oneDay), false);
assert.strictEqual(componentFresh({ fetchedAt: now - oneHour, data: { 'Error Message': 'Premium Query Parameter' } }, oneDay), false);

// FMP error extraction must detect both object and array-wrapped provider errors.
assert.ok(/premium/i.test(extractFmpErrorMessage({ 'Error Message': 'Premium Query Parameter: blocked' })));
assert.ok(/legacy/i.test(extractFmpErrorMessage([{ message: 'Legacy Endpoint not supported' }])));

// Finnhub financial reports should parse into normalized rows for fallback statements.
const finnhubRows = parseFinnhubFinancialRows({
  data: [
    {
      endDate: '2025-12-31',
      year: 2025,
      report: {
        ic: [
          { concept: 'Revenues', value: 1000 },
          { concept: 'EarningsPerShareDiluted', value: 2.0 },
          { concept: 'OperatingIncomeLoss', value: 120 }
        ],
        cf: [
          { concept: 'NetCashProvidedByUsedInOperatingActivities', value: 240 },
          { concept: 'PaymentsToAcquirePropertyPlantAndEquipment', value: -40 }
        ],
        bs: [
          { concept: 'LongTermDebt', value: 300 },
          { concept: 'StockholdersEquity', value: 600 }
        ]
      }
    },
    {
      endDate: '2024-12-31',
      year: 2024,
      report: {
        ic: [
          { concept: 'Revenues', value: 800 },
          { concept: 'EarningsPerShareDiluted', value: 1.5 }
        ],
        cf: [
          { concept: 'FreeCashFlow', value: 140 }
        ]
      }
    }
  ]
});
assert.strictEqual(finnhubRows.length, 2);
assert.strictEqual(finnhubRows[0].revenue, 1000);
assert.strictEqual(finnhubRows[0].freeCashFlow, 200);
assert.strictEqual(finnhubRows[1].epsdiluted, 1.5);

// Ratios fallback should derive growth/margin/multiples from metric + financial rows when missing.
const finnhubRatios = mapFinnhubMetricToRatios(
  { epsTTM: 2.5, revenueTTM: 1000 },
  {
    financialRows: finnhubRows,
    profile: { marketCapitalization: 50000 },
    quote: { c: 10 }
  }
);
assert.ok(Number.isFinite(Number(finnhubRatios.revenueGrowthTTMYoy)));
assert.ok(Number.isFinite(Number(finnhubRatios.epsGrowthTTMYoy)));
assert.ok(Number.isFinite(Number(finnhubRatios.operatingProfitMarginTTM)));
assert.ok(Number.isFinite(Number(finnhubRatios.priceToEarningsRatioTTM)));
assert.ok(Number.isFinite(Number(finnhubRatios.priceToSalesRatioTTM)));

// SEC-normalized builder should derive accounting metrics for US stock fallback.
const secFactsFixture = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        { val: 120, fy: 2025, fp: 'Q2', form: '10-Q', end: '2025-06-30', filed: '2025-08-01' },
        { val: 110, fy: 2025, fp: 'Q1', form: '10-Q', end: '2025-03-31', filed: '2025-05-01' },
        { val: 105, fy: 2024, fp: 'Q4', form: '10-Q', end: '2024-12-31', filed: '2025-02-01' },
        { val: 95, fy: 2024, fp: 'Q3', form: '10-Q', end: '2024-09-30', filed: '2024-11-01' },
        { val: 100, fy: 2024, fp: 'Q2', form: '10-Q', end: '2024-06-30', filed: '2024-08-01' },
        { val: 430, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' },
        { val: 380, fy: 2024, fp: 'FY', form: '10-K', end: '2024-12-31', filed: '2025-02-15' }
      ] } },
      GrossProfit: { units: { USD: [
        { val: 54, fy: 2025, fp: 'Q2', form: '10-Q', end: '2025-06-30', filed: '2025-08-01' },
        { val: 180, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' },
        { val: 140, fy: 2024, fp: 'FY', form: '10-K', end: '2024-12-31', filed: '2025-02-15' }
      ] } },
      EarningsPerShareDiluted: { units: { USD: [
        { val: 1.1, fy: 2025, fp: 'Q2', form: '10-Q', end: '2025-06-30', filed: '2025-08-01' },
        { val: 1.0, fy: 2025, fp: 'Q1', form: '10-Q', end: '2025-03-31', filed: '2025-05-01' },
        { val: 0.9, fy: 2024, fp: 'Q4', form: '10-Q', end: '2024-12-31', filed: '2025-02-01' },
        { val: 0.8, fy: 2024, fp: 'Q3', form: '10-Q', end: '2024-09-30', filed: '2024-11-01' },
        { val: 0.7, fy: 2024, fp: 'Q2', form: '10-Q', end: '2024-06-30', filed: '2024-08-01' }
      ] } },
      NetIncomeLoss: { units: { USD: [
        { val: 58, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' },
        { val: 40, fy: 2024, fp: 'FY', form: '10-K', end: '2024-12-31', filed: '2025-02-15' }
      ] } },
      NetCashProvidedByUsedInOperatingActivities: { units: { USD: [
        { val: 70, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' },
        { val: 58, fy: 2024, fp: 'FY', form: '10-K', end: '2024-12-31', filed: '2025-02-15' }
      ] } },
      PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [
        { val: -15, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' }
      ] } },
      DebtCurrent: { units: { USD: [{ val: 25, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' }, { val: 28, fy: 2024, fp: 'FY', form: '10-K', end: '2024-12-31', filed: '2025-02-15' }] } },
      LongTermDebt: { units: { USD: [{ val: 95, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' }, { val: 110, fy: 2024, fp: 'FY', form: '10-K', end: '2024-12-31', filed: '2025-02-15' }] } },
      AssetsCurrent: { units: { USD: [{ val: 210, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' }, { val: 180, fy: 2024, fp: 'FY', form: '10-K', end: '2024-12-31', filed: '2025-02-15' }] } },
      LiabilitiesCurrent: { units: { USD: [{ val: 115, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' }, { val: 108, fy: 2024, fp: 'FY', form: '10-K', end: '2024-12-31', filed: '2025-02-15' }] } },
      Assets: { units: { USD: [{ val: 640, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' }, { val: 590, fy: 2024, fp: 'FY', form: '10-K', end: '2024-12-31', filed: '2025-02-15' }] } },
      Liabilities: { units: { USD: [{ val: 320, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' }, { val: 330, fy: 2024, fp: 'FY', form: '10-K', end: '2024-12-31', filed: '2025-02-15' }] } },
      StockholdersEquity: { units: { USD: [{ val: 320, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' }, { val: 260, fy: 2024, fp: 'FY', form: '10-K', end: '2024-12-31', filed: '2025-02-15' }] } },
      RetainedEarningsAccumulatedDeficit: { units: { USD: [{ val: 95, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' }] } },
      EarningsBeforeInterestAndTaxes: { units: { USD: [{ val: 72, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' }] } }
    },
    dei: {
      EntityCommonStockSharesOutstanding: { units: { shares: [{ val: 100, fy: 2025, fp: 'FY', form: '10-K', end: '2025-12-31', filed: '2026-02-15' }, { val: 102, fy: 2024, fp: 'FY', form: '10-K', end: '2024-12-31', filed: '2025-02-15' }] } }
    }
  }
};
const secNormalized = buildSecNormalizedFundamentals(
  'TEST',
  { ticker: 'TEST', cik: '0000000001', title: 'Test Corp' },
  secFactsFixture,
  { price: 20, marketCap: 2000, nextEarningsDate: '2026-04-20' }
);
assert.ok(Number.isFinite(Number(secNormalized.derived.revenueGrowthYoY)));
assert.ok(Number.isFinite(Number(secNormalized.derived.epsGrowthYoY)));
assert.ok(Number.isFinite(Number(secNormalized.derived.freeCashFlow)));
assert.ok(Number.isFinite(Number(secNormalized.derived.debtToEquity)));
assert.ok(Number.isFinite(Number(secNormalized.derived.roe)));
assert.ok(Number.isFinite(Number(secNormalized.derived.ps)));
assert.ok(Number.isFinite(Number(secNormalized.derived.altmanZScore)));
assert.ok(Array.isArray(missingStockMetricKeys({ ratios: { data: {} }, income: { data: [] }, cashflow: { data: [] }, scores: { data: {} } })));

// Normal TTL behavior remains unchanged when next earnings is in the future.
assert.strictEqual(
  shouldRefreshEarningsMetadata(now - oneHour, '2026-03-20', now),
  false
);
assert.strictEqual(
  shouldRefreshEarningsMetadata(now - (2 * oneDay), '2026-03-20', now),
  true
);

// Missing next earnings date still triggers metadata refresh checks.
assert.strictEqual(
  shouldRefreshEarningsMetadata(0, '', now),
  true
);
assert.strictEqual(
  shouldRefreshEarningsMetadata(now - oneHour, '', now),
  false
);
assert.strictEqual(
  shouldRefreshEarningsMetadata(now - (2 * oneDay), '', now),
  true
);

// today == nextEarningsDate and today > nextEarningsDate both trigger post-earnings refresh.
assert.strictEqual(
  shouldForcePostEarningsRefresh(today, '2026-03-06', 0, false, now),
  true
);
assert.strictEqual(
  shouldForcePostEarningsRefresh(today, '2026-03-05', 0, false, now),
  true
);

// Cooldown guard prevents repeated loops unless explicitly forced by manual refresh.
assert.strictEqual(
  shouldForcePostEarningsRefresh(today, '2026-03-05', now - oneHour, false, now),
  false
);
assert.strictEqual(
  shouldForcePostEarningsRefresh(today, '2026-03-05', now - oneHour, true, now),
  true
);
assert.strictEqual(
  shouldForcePostEarningsRefresh(today, '2026-03-20', 0, true, now),
  false
);

// Post-earnings forced component set remains limited to earnings-sensitive fields.
assert.deepStrictEqual(
  getComponentsToRefreshForPostEarnings(),
  ['income', 'cashflow', 'scores', 'ratios']
);

// Earnings date extraction picks the nearest upcoming date for symbol payloads.
assert.strictEqual(
  getNextUpcomingEarningsDateFromApiResponse(
    [
      { symbol: 'AAPL', date: '2026-02-01' },
      { symbol: 'AAPL', date: '2026-03-12' },
      { symbol: 'AAPL', date: '2026-05-01' }
    ],
    'AAPL',
    today
  ),
  '2026-03-12'
);
assert.strictEqual(
  getNextUpcomingEarningsDateFromApiResponse(
    { nextEarningsDate: '2026-04-23' },
    'TSLA',
    today
  ),
  '2026-04-23'
);

// Stock fundamentals panel exposes next-earnings metadata for UI row rendering.
const stockPanel = buildStockPanel(
  'TSLA',
  {
    profile: { data: { companyName: 'Tesla, Inc.' } },
    income: { data: [] },
    cashflow: { data: [] },
    ratios: { data: {} },
    scores: { data: {} }
  },
  [],
  {
    nextEarningsDate: '2026-04-23',
    earningsDateLastCheckedAt: now,
    lastPostEarningsRefreshAt: 0,
    lastEarningsRefreshReason: 'test'
  },
  'Using cached fundamentals',
  now
);
assert.strictEqual(stockPanel.nextEarningsDate, '2026-04-23');
assert.strictEqual(stockPanel.nextEarningsRelative, 'In 48 days');
assert.strictEqual(stockPanel.earningsState, 'Using cached fundamentals');

// Finnhub-style fallback fields should still produce usable stock fundamentals metrics.
const stockPanelFinnhubLike = buildStockPanel(
  'ACHR',
  {
    profile: { data: { companyName: 'Archer Aviation Inc.' } },
    income: { data: [] },
    cashflow: { data: [] },
    ratios: {
      data: {
        revenueGrowthTTMYoy: 12.4,
        epsGrowthTTMYoy: 18.1,
        operatingProfitMarginTTM: 11.2,
        freeCashFlowTTM: 12_500_000,
        debtToEquityRatioTTM: 0.42,
        returnOnEquityTTM: 0.19,
        priceToEarningsRatioTTM: 24.8,
        priceToSalesRatioTTM: 5.3
      }
    },
    scores: { data: { piotroskiScore: 7, altmanZScore: 3.4 } }
  },
  [],
  {
    nextEarningsDate: '',
    earningsDateLastCheckedAt: now,
    lastPostEarningsRefreshAt: 0,
    lastEarningsRefreshReason: 'test'
  },
  '',
  now
);
const qualitySection = stockPanelFinnhubLike.sections.find((section) => section.id === 'quality');
const valuationSection = stockPanelFinnhubLike.sections.find((section) => section.id === 'valuation');
assert.ok(qualitySection && qualitySection.metrics.some((metric) => metric.id === 'revenue-growth-yoy' && metric.display !== 'n/a'));
assert.ok(qualitySection && qualitySection.metrics.some((metric) => metric.id === 'free-cash-flow' && metric.display !== 'n/a'));
assert.ok(valuationSection && valuationSection.metrics.some((metric) => metric.id === 'pe' && metric.display !== 'n/a'));

// Crypto panel does not expose stock-only next-earnings fields.
const cryptoPanel = buildCryptoPanel(
  'bitcoin',
  'BTC',
  {
    market: {
      data: {
        market_cap: 1_200_000_000_000,
        fully_diluted_valuation: 1_300_000_000_000,
        circulating_supply: 19_700_000,
        total_supply: 19_700_000,
        max_supply: 21_000_000,
        total_volume: 42_000_000_000,
        symbol: 'btc'
      }
    },
    meta: { data: { name: 'Bitcoin', symbol: 'btc' } }
  },
  []
);
assert.strictEqual(cryptoPanel.nextEarningsDate, undefined);

// Relative labels remain deterministic for today/tomorrow/passed cases.
assert.strictEqual(describeEarningsDate('2026-03-06', now).relative, 'Today');
assert.strictEqual(describeEarningsDate('2026-03-07', now).relative, 'Tomorrow');
assert.strictEqual(describeEarningsDate('2026-03-05', now).relative, 'Passed');

console.log('fundamentals-service tests passed');
