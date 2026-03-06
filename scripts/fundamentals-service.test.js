// Verifies earnings-aware refresh helper behavior and panel fields for stock-only next-earnings UI.
const assert = require('assert');
const serviceModule = require('./fundamentals-service.js');

const helpers = serviceModule.__test || {};

const {
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
assert.strictEqual(typeof shouldRefreshEarningsMetadata, 'function');
assert.strictEqual(typeof shouldForcePostEarningsRefresh, 'function');
assert.strictEqual(typeof getNextUpcomingEarningsDateFromApiResponse, 'function');
assert.strictEqual(typeof buildStockPanel, 'function');
assert.strictEqual(typeof buildCryptoPanel, 'function');

const now = Date.parse('2026-03-06T09:00:00Z');
const today = '2026-03-06';
const oneHour = 1000 * 60 * 60;
const oneDay = 1000 * 60 * 60 * 24;

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
