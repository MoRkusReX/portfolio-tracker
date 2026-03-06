// Implements provider adapters, cache cadence logic, and panel payload shaping for fundamentals.
const axios = require('axios');
const FundamentalsEngine = require('./fundamentals-engine.js');

const FMP_BASE_URL = 'https://financialmodelingprep.com';
const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
const DEFILLAMA_BASE_URL = 'https://api.llama.fi';

const STOCK_POLICY = {
  profileMs: 1000 * 60 * 60 * 24 * 30,
  statementsMs: 1000 * 60 * 60 * 24 * 7,
  scoresMs: 1000 * 60 * 60 * 24 * 7,
  valuationMs: 1000 * 60 * 60 * 24
};

const EARNINGS_METADATA_CHECK_MS = 1000 * 60 * 60 * 24;
const EARNINGS_PASSED_RECHECK_MS = 1000 * 60 * 60 * 6;
const POST_EARNINGS_COOLDOWN_MS = 1000 * 60 * 60 * 18;

const CRYPTO_POLICY = {
  marketMs: 1000 * 60 * 60 * 24,
  metaMs: 1000 * 60 * 60 * 24 * 30,
  protocolMs: 1000 * 60 * 60 * 24
};

const COIN_PROTOCOL_MAP = {
  ethereum: 'ethereum',
  solana: 'solana',
  cardano: 'cardano',
  polkadot: 'polkadot',
  near: 'near',
  chainlink: 'chainlink'
};

const FA_DEBUG_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.PT_FA_DEBUG || process.env.PT_DEBUG || '').trim());

// Safely converts arbitrary values into finite numbers.
function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Checks whether a data component remains within its freshness window.
function componentFresh(component, ttlMs) {
  return FundamentalsEngine.isFresh(component && component.fetchedAt, ttlMs);
}

// Normalizes a status label into one of the pill-ready variants used by the UI.
function normalizeStatus(status) {
  const s = String(status || '').trim();
  if (!s) return 'Neutral';
  if (/bullish|healthy|cheap|strong/i.test(s)) return s.includes('Cheap') ? 'Cheap' : (s.includes('Strong') ? 'Strong' : (s.includes('Healthy') ? 'Healthy' : 'Bullish'));
  if (/fair/i.test(s)) return 'Fair';
  if (/risk|weak|expensive|bearish/i.test(s)) return s.includes('Expensive') ? 'Expensive' : (s.includes('Weak') ? 'Weak' : 'Risk');
  return 'Neutral';
}

// Emits debug lines for fundamentals scoring only when FA debug is enabled.
function debugFa() {
  if (!FA_DEBUG_ENABLED) return;
  try {
    console.debug.apply(console, ['[FA][score]'].concat(Array.prototype.slice.call(arguments)));
  } catch (err) {}
}

// Formats large numbers into compact K/M/B/T strings for metric display.
function fmtCompactNumber(value, digits) {
  const n = num(value);
  if (n == null) return 'n/a';
  const abs = Math.abs(n);
  const precision = Number.isFinite(Number(digits)) ? Number(digits) : 2;
  if (abs >= 1e12) return `${(n / 1e12).toFixed(precision).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(precision).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(precision).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(precision).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Formats USD-denominated values into compact currency strings.
function fmtCompactCurrency(value) {
  const n = num(value);
  if (n == null) return 'n/a';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${fmtCompactNumber(Math.abs(n), 2)}`;
}

// Formats ratio values using concise decimal precision.
function fmtRatio(value, digits) {
  const n = num(value);
  if (n == null) return 'n/a';
  const d = Number.isFinite(Number(digits)) ? Number(digits) : 2;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d });
}

// Formats percentage values with signed output for readability.
function fmtPct(value, digits) {
  const n = num(value);
  if (n == null) return 'n/a';
  const d = Number.isFinite(Number(digits)) ? Number(digits) : 2;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(d)}%`;
}

// Converts fraction-style ratios into percent values when required.
function asPercent(value) {
  const n = num(value);
  if (n == null) return null;
  if (Math.abs(n) <= 1.5) return n * 100;
  return n;
}

// Safely picks the first object row from a possibly-array payload.
function firstObjectRow(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload.find((row) => row && typeof row === 'object') || null;
  if (typeof payload === 'object') return payload;
  return null;
}

// Derives a stable DB key used for fundamentals snapshots.
function fundamentalsStateKey(assetType, id) {
  const type = assetType === 'crypto' ? 'crypto' : 'stock';
  const safeId = String(id || '').trim();
  if (!safeId) return '';
  return `fundamentals:${type}:${type === 'crypto' ? safeId.toLowerCase() : safeId.toUpperCase()}`;
}

// Creates a uniform metric item payload for panel rendering.
function metricItem(id, label, value, display, status, hint) {
  return {
    id,
    label,
    value: value == null ? null : value,
    display: String(display == null ? 'n/a' : display),
    status: normalizeStatus(status),
    hint: hint ? String(hint) : ''
  };
}

// Builds a compact valuation summary string from stock valuation metric classifications.
function buildStockValuationSummary(valuationResult) {
  const vr = valuationResult && typeof valuationResult === 'object' ? valuationResult : {};
  const metrics = vr.metrics && typeof vr.metrics === 'object' ? vr.metrics : {};
  const parts = [];
  [['pe', 'P/E'], ['ps', 'P/S'], ['evEbitda', 'EV/EBITDA'], ['priceToFcf', 'P/FCF']].forEach(([id, label]) => {
    const m = metrics[id];
    const cls = String(m && m.label || 'n/a').trim();
    if (!cls || cls.toLowerCase() === 'n/a') return;
    parts.push(`${label} ${cls}`);
  });
  if (!parts.length) return 'Valuation metrics unavailable';
  return `${vr.label || 'n/a'} • ${parts.join(', ')}`;
}

// Normalizes arbitrary date-ish input into YYYY-MM-DD, or empty string if invalid.
function normalizeDateOnly(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsedFromNumber = new Date(value);
    if (!Number.isFinite(parsedFromNumber.getTime())) return '';
    const y = parsedFromNumber.getFullYear();
    const m = String(parsedFromNumber.getMonth() + 1).padStart(2, '0');
    const d = String(parsedFromNumber.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const numericRaw = /^[0-9]{10,16}$/.test(raw) ? Number(raw) : null;
  const parsed = new Date(numericRaw != null ? numericRaw : raw);
  if (!Number.isFinite(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Returns today's local date in YYYY-MM-DD format.
function todayDateOnly(nowMs) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  return normalizeDateOnly(now);
}

// Builds a forward-looking YYYY-MM-DD date used in earnings calendar range queries.
function plusDaysDateOnly(days, nowMs) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const date = new Date(now);
  date.setDate(date.getDate() + Math.max(0, Number(days || 0) || 0));
  return normalizeDateOnly(date);
}

// Compares two YYYY-MM-DD date strings lexicographically.
function compareDateOnly(a, b) {
  const da = normalizeDateOnly(a);
  const db = normalizeDateOnly(b);
  if (!da || !db) return 0;
  if (da < db) return -1;
  if (da > db) return 1;
  return 0;
}

// Determines whether earnings metadata should be refreshed independently from fundamentals TTLs.
function shouldRefreshEarningsMetadata(lastCheckedAt, nextEarningsDate, nowMs) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const checked = Number(lastCheckedAt || 0) || 0;
  const age = checked > 0 ? (now - checked) : Number.POSITIVE_INFINITY;
  const nextDate = normalizeDateOnly(nextEarningsDate);
  if (!nextDate) return age >= EARNINGS_METADATA_CHECK_MS;
  if (!checked) return true;
  const today = todayDateOnly(now);
  if (compareDateOnly(today, nextDate) >= 0) return age >= EARNINGS_PASSED_RECHECK_MS;
  return age >= EARNINGS_METADATA_CHECK_MS;
}

// Prevents repeated post-earnings forced refresh loops while allowing manual override.
function shouldForcePostEarningsRefresh(today, nextEarningsDate, lastPostEarningsRefreshAt, manualForce, nowMs) {
  const todayDate = normalizeDateOnly(today);
  const nextDate = normalizeDateOnly(nextEarningsDate);
  if (!todayDate || !nextDate) return false;
  if (compareDateOnly(todayDate, nextDate) < 0) return false;
  if (manualForce) return true;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const last = Number(lastPostEarningsRefreshAt || 0) || 0;
  if (!last) return true;
  return (now - last) >= POST_EARNINGS_COOLDOWN_MS;
}

// Lists components that should be force-refreshed after earnings.
function getComponentsToRefreshForPostEarnings() {
  return ['income', 'cashflow', 'scores', 'ratios'];
}

// Computes day distance between two date-only strings.
function dateOnlyDiffDays(fromDate, toDate) {
  const from = normalizeDateOnly(fromDate);
  const to = normalizeDateOnly(toDate);
  if (!from || !to) return null;
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// Converts an earnings date into a concise relative label for panel UI.
function describeEarningsDate(nextEarningsDate, nowMs) {
  const dateOnly = normalizeDateOnly(nextEarningsDate);
  if (!dateOnly) return { date: '', relative: 'Unavailable', status: 'unknown' };
  const today = todayDateOnly(nowMs);
  const diff = dateOnlyDiffDays(today, dateOnly);
  if (diff == null) return { date: dateOnly, relative: dateOnly, status: 'known' };
  if (diff === 0) return { date: dateOnly, relative: 'Today', status: 'today' };
  if (diff === 1) return { date: dateOnly, relative: 'Tomorrow', status: 'upcoming' };
  if (diff > 1) return { date: dateOnly, relative: `In ${diff} days`, status: 'upcoming' };
  return { date: dateOnly, relative: 'Passed', status: 'passed' };
}

// Extracts the nearest upcoming earnings date from a symbol-specific or calendar-style payload.
function getNextUpcomingEarningsDateFromApiResponse(payload, symbol, todayDate) {
  const rows = Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.earningsCalendar) ? payload.earningsCalendar : []);
  const safeSymbol = String(symbol || '').trim().toUpperCase();
  const today = normalizeDateOnly(todayDate);
  const candidates = [];

  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const rowSymbol = String(row.symbol || row.ticker || '').trim().toUpperCase();
    if (safeSymbol && rowSymbol && rowSymbol !== safeSymbol) return;
    const dateRaw = row.date || row.earningsDate || row.reportDate || row.announcementDate || row.fiscalDateEnding;
    const dateOnly = normalizeDateOnly(dateRaw);
    if (!dateOnly) return;
    candidates.push(dateOnly);
  });

  if (!candidates.length && payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const singleDate = normalizeDateOnly(
      payload.nextEarningsDate || payload.date || payload.earningsDate || payload.reportDate || payload.announcementDate
    );
    if (singleDate) candidates.push(singleDate);
  }

  if (!candidates.length) return '';
  candidates.sort();
  if (!today) return candidates[0];
  const upcoming = candidates.find((d) => compareDateOnly(d, today) >= 0);
  return upcoming || candidates[candidates.length - 1];
}

// Creates a canonical component payload including fetch metadata.
function componentPayload(source, data) {
  return {
    source: String(source || ''),
    fetchedAt: Date.now(),
    data: data == null ? null : data
  };
}

// Executes an HTTP JSON request with consistent error handling semantics.
async function getJson(url, headers, timeoutMs) {
  const response = await axios.get(url, {
    timeout: Math.max(1000, Number(timeoutMs || 10000) || 10000),
    headers: Object.assign({}, headers || {}),
    validateStatus: () => true
  });
  if (response.status !== 200) {
    const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
    const err = new Error(String(detail || `HTTP ${response.status}`).slice(0, 260));
    err.statusCode = response.status || 500;
    throw err;
  }
  return response.data;
}

// Fetches an FMP endpoint while appending the API key.
async function fetchFmpJson(pathWithQuery, apiKey, userAgent) {
  if (!apiKey) {
    const err = new Error('fmp_key_missing');
    err.statusCode = 500;
    throw err;
  }
  const sep = pathWithQuery.includes('?') ? '&' : '?';
  const url = `${FMP_BASE_URL}${pathWithQuery}${sep}apikey=${encodeURIComponent(apiKey)}`;
  const payload = await getJson(url, { 'User-Agent': userAgent, Accept: 'application/json,text/plain,*/*' }, 12000);
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && (payload['Error Message'] || payload.error)) {
    const err = new Error(String(payload['Error Message'] || payload.error || 'FMP error').slice(0, 220));
    err.statusCode = 502;
    throw err;
  }
  return payload;
}

// Fetches the nearest upcoming earnings date from stable FMP endpoints with endpoint fallback.
async function fetchNextEarningsDateFromFmp(symbol, apiKey, userAgent, nowMs) {
  const safeSymbol = String(symbol || '').trim().toUpperCase();
  if (!safeSymbol) return { nextEarningsDate: '', endpoint: '', error: 'missing_symbol' };
  const today = todayDateOnly(nowMs);
  const from = plusDaysDateOnly(0, nowMs);
  const to = plusDaysDateOnly(365, nowMs);
  const candidatePaths = [
    `/stable/earnings?symbol=${encodeURIComponent(safeSymbol)}`,
    `/stable/earnings-calendar?symbol=${encodeURIComponent(safeSymbol)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    `/stable/earnings-calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&symbol=${encodeURIComponent(safeSymbol)}`
  ];
  let lastErr = '';
  for (let i = 0; i < candidatePaths.length; i += 1) {
    const path = candidatePaths[i];
    try {
      const payload = await fetchFmpJson(path, apiKey, userAgent);
      const nextDate = getNextUpcomingEarningsDateFromApiResponse(payload, safeSymbol, today);
      if (nextDate) return { nextEarningsDate: nextDate, endpoint: path, error: '' };
      lastErr = 'no_upcoming_earnings_date';
    } catch (err) {
      lastErr = String(err && err.message || '').trim() || 'earnings_lookup_failed';
    }
  }
  return { nextEarningsDate: '', endpoint: candidatePaths[candidatePaths.length - 1], error: lastErr || 'earnings_lookup_failed' };
}

// Fetches CoinGecko JSON for token fundamentals.
async function fetchCoinGeckoJson(pathWithQuery, userAgent) {
  const url = `${COINGECKO_BASE_URL}${pathWithQuery}`;
  return getJson(url, { 'User-Agent': userAgent, Accept: 'application/json,text/plain,*/*' }, 12000);
}

// Fetches DefiLlama JSON used for optional protocol fee/revenue enrichment.
async function fetchDefiLlamaJson(pathWithQuery, userAgent) {
  const url = `${DEFILLAMA_BASE_URL}${pathWithQuery}`;
  return getJson(url, { 'User-Agent': userAgent, Accept: 'application/json,text/plain,*/*' }, 12000);
}

// Extracts the most recent value from heterogeneous DefiLlama series payloads.
function extractDefiLlamaValue(payload) {
  if (!payload) return null;
  const direct = num(payload.total24h || payload.total24hUsd || payload.total24hUSD || payload.total);
  if (direct != null) return direct;
  const series = Array.isArray(payload.totalDataChart)
    ? payload.totalDataChart
    : (Array.isArray(payload.data) ? payload.data : []);
  if (!series.length) return null;
  const last = series[series.length - 1];
  if (Array.isArray(last) && last.length >= 2) return num(last[1]);
  if (last && typeof last === 'object') return num(last.value || last.total || last.amount || last.revenue || last.fees);
  return null;
}

// Returns a DefiLlama slug when a coin is known to map reliably to a protocol.
function protocolSlugForCoin(coinId) {
  const id = String(coinId || '').trim().toLowerCase();
  return COIN_PROTOCOL_MAP[id] || '';
}

// Builds the stock fundamentals panel from cached/fetched raw components.
function buildStockPanel(symbol, components, warnings, earningsMeta, earningsState, nowMs) {
  const profile = firstObjectRow(components.profile && components.profile.data) || {};
  const incomeRows = Array.isArray(components.income && components.income.data) ? components.income.data : [];
  const cashRows = Array.isArray(components.cashflow && components.cashflow.data) ? components.cashflow.data : [];
  const ratios = firstObjectRow(components.ratios && components.ratios.data) || {};
  const scores = firstObjectRow(components.scores && components.scores.data) || {};
  const latestIncome = incomeRows[0] || {};
  const prevIncome = incomeRows[1] || {};
  const latestCash = cashRows[0] || {};

  const revenueGrowthYoY = FundamentalsEngine.pctGrowth(latestIncome.revenue, prevIncome.revenue);
  const epsGrowthYoY = FundamentalsEngine.pctGrowth(
    latestIncome.epsdiluted != null ? latestIncome.epsdiluted : latestIncome.eps,
    prevIncome.epsdiluted != null ? prevIncome.epsdiluted : prevIncome.eps
  );
  const operatingMarginPct = asPercent(ratios.operatingProfitMarginTTM != null ? ratios.operatingProfitMarginTTM : ratios.operatingMarginTTM);
  const grossMarginPct = asPercent(ratios.grossProfitMarginTTM != null ? ratios.grossProfitMarginTTM : ratios.grossMarginTTM);
  const marginPct = operatingMarginPct != null ? operatingMarginPct : grossMarginPct;
  const marginLabel = operatingMarginPct != null ? 'Operating Margin' : 'Gross Margin';
  const freeCashFlow = num(latestCash.freeCashFlow != null ? latestCash.freeCashFlow : latestCash.freeCashflow);
  const debtToEquity = num(
    ratios.debtToEquityRatioTTM != null ? ratios.debtToEquityRatioTTM
      : (ratios.debtEquityRatioTTM != null ? ratios.debtEquityRatioTTM
        : (ratios.debtToEquityTTM != null ? ratios.debtToEquityTTM : ratios.debtToEquity))
  );
  var roeRaw = num(
    ratios.returnOnEquityTTM != null ? ratios.returnOnEquityTTM
      : (ratios.returnOnEquity != null ? ratios.returnOnEquity : ratios.roe)
  );
  if (roeRaw == null) {
    const netIncomePerShareTTM = num(ratios.netIncomePerShareTTM);
    const shareholdersEquityPerShareTTM = num(ratios.shareholdersEquityPerShareTTM != null ? ratios.shareholdersEquityPerShareTTM : ratios.bookValuePerShareTTM);
    if (netIncomePerShareTTM != null && shareholdersEquityPerShareTTM != null && shareholdersEquityPerShareTTM !== 0) {
      roeRaw = netIncomePerShareTTM / shareholdersEquityPerShareTTM;
    }
  }
  const roePct = asPercent(roeRaw);
  const pe = num(
    ratios.priceToEarningsRatioTTM != null ? ratios.priceToEarningsRatioTTM
      : (ratios.priceEarningsRatioTTM != null ? ratios.priceEarningsRatioTTM
        : (ratios.peRatioTTM != null ? ratios.peRatioTTM
          : (ratios.peRatio != null ? ratios.peRatio : ratios.pe)))
  );
  const ps = num(ratios.priceToSalesRatioTTM != null ? ratios.priceToSalesRatioTTM : (ratios.psRatioTTM != null ? ratios.psRatioTTM : ratios.priceToSalesRatio));
  const piotroskiScore = num(scores.piotroskiScore);
  const altmanZScore = num(scores.altmanZScore);

  const evEbitda = num(
    ratios.enterpriseValueOverEBITDATTM != null ? ratios.enterpriseValueOverEBITDATTM
      : (ratios.evToEbitda != null ? ratios.evToEbitda
        : (ratios.evToEbitdaTTM != null ? ratios.evToEbitdaTTM : ratios.enterpriseValueMultipleTTM))
  );
  const priceToFcf = num(
    ratios.priceToFreeCashFlowsRatioTTM != null ? ratios.priceToFreeCashFlowsRatioTTM
      : (ratios.priceToFreeCashFlowRatioTTM != null ? ratios.priceToFreeCashFlowRatioTTM : ratios.priceToFreeCashFlow)
  );

  const qualityResult = FundamentalsEngine.computeStockQualityScore({
    revenueGrowthYoY,
    epsGrowthYoY,
    operatingMarginPct,
    grossMarginPct,
    freeCashFlow,
    debtToEquity,
    roePct,
    piotroskiScore,
    altmanZScore
  });
  const valuationResult = FundamentalsEngine.computeStockValuationScore({
    pe,
    ps,
    evEbitda,
    priceToFcf
  });
  const valuation = FundamentalsEngine.interpretValuation(pe, ps, {
    peCheapMax: 20,
    peFairMax: 40,
    psCheapMax: 3,
    psFairMax: 10
  });

  const qualityMetrics = [
    metricItem('revenue-growth-yoy', 'Revenue Growth YoY', revenueGrowthYoY, fmtPct(revenueGrowthYoY, 2), revenueGrowthYoY == null ? 'Neutral' : (revenueGrowthYoY > 10 ? 'Bullish' : (revenueGrowthYoY <= 0 ? 'Risk' : 'Neutral')), '>10% preferred'),
    metricItem('eps-growth-yoy', 'EPS Growth YoY', epsGrowthYoY, fmtPct(epsGrowthYoY, 2), epsGrowthYoY == null ? 'Neutral' : (epsGrowthYoY > 10 ? 'Bullish' : (epsGrowthYoY <= 0 ? 'Risk' : 'Neutral')), '>10% preferred'),
    metricItem('margin', marginLabel, marginPct, fmtPct(marginPct, 2), marginPct == null ? 'Neutral' : (marginPct > 10 ? 'Bullish' : (marginPct < 0 ? 'Risk' : 'Neutral')), 'Higher is better'),
    metricItem('free-cash-flow', 'Free Cash Flow', freeCashFlow, fmtCompactCurrency(freeCashFlow), freeCashFlow == null ? 'Neutral' : (freeCashFlow > 0 ? 'Healthy' : 'Risk'), 'Positive is preferred'),
    metricItem('debt-equity', 'Debt / Equity', debtToEquity, fmtRatio(debtToEquity, 2), debtToEquity == null ? 'Neutral' : (debtToEquity < 1 ? 'Healthy' : (debtToEquity > 2 ? 'Risk' : 'Neutral')), '<1.0 preferred'),
    metricItem('roe', 'ROE', roePct, fmtPct(roePct, 2), roePct == null ? 'Neutral' : (roePct > 10 ? 'Healthy' : (roePct < 0 ? 'Risk' : 'Neutral')), '>10% preferred'),
    metricItem('piotroski', 'Piotroski Score', piotroskiScore, fmtRatio(piotroskiScore, 1), piotroskiScore == null ? 'Neutral' : (piotroskiScore >= 7 ? 'Healthy' : (piotroskiScore <= 3 ? 'Risk' : 'Neutral')), '>=7 is strong'),
    metricItem('altman-z', 'Altman Z-Score', altmanZScore, fmtRatio(altmanZScore, 2), altmanZScore == null ? 'Neutral' : (altmanZScore > 3 ? 'Healthy' : (altmanZScore < 1.8 ? 'Risk' : 'Neutral')), '>3 preferred')
  ];

  const valuationMetrics = [
    metricItem('pe', 'P/E', pe, fmtRatio(pe, 2), valuationResult.metrics.pe.label, '20-40 is often a fair range'),
    metricItem('ps', 'P/S', ps, fmtRatio(ps, 2), valuationResult.metrics.ps.label, '3-10 is often a fair range')
  ];
  if (evEbitda != null) {
    valuationMetrics.push(metricItem('ev-ebitda', 'EV/EBITDA', evEbitda, fmtRatio(evEbitda, 2), valuationResult.metrics.evEbitda.label, '12-25 is often a fair range'));
  }
  if (priceToFcf != null) {
    valuationMetrics.push(metricItem('price-to-fcf', 'P/FCF', priceToFcf, fmtRatio(priceToFcf, 2), valuationResult.metrics.priceToFcf.label, '15-30 is often a fair range'));
  }

  const companyName = String(profile.companyName || profile.name || symbol || '').trim() || symbol;
  const qualityReasons = qualityResult.reasons.filter((x) => x && x.toLowerCase().indexOf('unavailable') < 0).slice(0, 7);
  const valuationReasons = valuationResult.reasons.slice(0, 7);
  const mergedReasons = qualityReasons.concat(valuationReasons).slice(0, 10);
  const scoreOutOf = Number(qualityResult.availableMetrics || 0);
  const valuationSummaryText = buildStockValuationSummary(valuationResult);
  const earningsInfo = describeEarningsDate(earningsMeta && earningsMeta.nextEarningsDate, nowMs);
  const earningsDateDisplay = earningsInfo.date || 'n/a';
  const earningsRelativeDisplay = earningsInfo.relative || 'Unavailable';
  const earningsStateText = String(earningsState || '').trim();
  debugFa('stock', symbol, {
    rawQualityMetrics: {
      revenueGrowthYoY,
      epsGrowthYoY,
      operatingMarginPct,
      grossMarginPct,
      freeCashFlow,
      debtToEquity,
      roePct,
      piotroskiScore,
      altmanZScore
    },
    earnedQualityPoints: qualityResult.earnedPoints,
    availableQualityMetrics: qualityResult.availableMetrics,
    qualityRatio: qualityResult.ratio,
    valuationMetricClassifications: {
      pe: valuationResult.metrics.pe,
      ps: valuationResult.metrics.ps,
      evEbitda: valuationResult.metrics.evEbitda,
      priceToFcf: valuationResult.metrics.priceToFcf
    },
    valuationAvg: valuationResult.avg,
    qualityLabel: qualityResult.label,
    valuationLabel: valuationResult.label
  });
  return {
    title: 'Fundamentals',
    assetLabel: companyName,
    label: qualityResult.label,
    qualityLabel: qualityResult.label,
    qualityScore: qualityResult.earnedPoints,
    qualityScoreOutOf: scoreOutOf,
    qualityRatio: qualityResult.ratio,
    valuationLabel: valuationResult.label !== 'n/a' ? valuationResult.label : valuation.label,
    valuationSummaryText,
    valuationAvg: valuationResult.avg,
    valuationMetricsUsed: valuationResult.availableMetrics,
    score: qualityResult.earnedPoints,
    scoreOutOf: scoreOutOf,
    reasons: mergedReasons.length ? mergedReasons : ['Limited fundamentals data available'],
    reasonGroups: [
      {
        id: 'quality',
        title: 'Quality reasons',
        items: qualityReasons.length ? qualityReasons : ['Limited quality metrics available']
      },
      {
        id: 'valuation',
        title: 'Valuation reasons',
        items: valuationReasons.length ? valuationReasons : ['Valuation metrics unavailable']
      }
    ],
    nextEarningsDate: earningsDateDisplay,
    nextEarningsRelative: earningsRelativeDisplay,
    earningsState: earningsStateText,
    earningsDateLastCheckedAt: Number(earningsMeta && earningsMeta.earningsDateLastCheckedAt || 0) || 0,
    lastPostEarningsRefreshAt: Number(earningsMeta && earningsMeta.lastPostEarningsRefreshAt || 0) || 0,
    lastEarningsRefreshReason: String(earningsMeta && earningsMeta.lastEarningsRefreshReason || '').trim(),
    note: warnings.length ? warnings.join(' ') : '',
    sections: [
      { id: 'quality', title: 'Quality / Business Health', metrics: qualityMetrics },
      { id: 'valuation', title: 'Valuation', metrics: valuationMetrics }
    ]
  };
}

// Builds the crypto token fundamentals panel from cached/fetched raw components.
function buildCryptoPanel(coinId, symbol, components, warnings) {
  const market = firstObjectRow(components.market && components.market.data) || {};
  const meta = firstObjectRow(components.meta && components.meta.data) || {};
  const protocol = firstObjectRow(components.protocol && components.protocol.data) || {};
  const marketCap = num(market.market_cap);
  const fdv = num(market.fully_diluted_valuation);
  const circulatingSupply = num(market.circulating_supply);
  const totalSupply = num(market.total_supply);
  const maxSupply = num(market.max_supply);
  const volume24h = num(market.total_volume);
  const fees24h = num(protocol.fees24h);
  const revenue24h = num(protocol.revenue24h);
  const dilution = FundamentalsEngine.interpretDilutionRisk(marketCap, fdv, circulatingSupply, maxSupply);
  const scoreResult = FundamentalsEngine.computeCryptoFAScore({
    marketCap,
    fdv,
    circulatingSupply,
    maxSupply,
    volume24h,
    fees24h,
    revenue24h
  });

  const ratioFdvToMcap = marketCap != null && marketCap > 0 && fdv != null ? (fdv / marketCap) : null;
  const ratioVolumeToMcap = marketCap != null && marketCap > 0 && volume24h != null ? (volume24h / marketCap) : null;
  const ratioCircToMax = circulatingSupply != null && maxSupply != null && maxSupply > 0 ? (circulatingSupply / maxSupply) : null;
  const assetName = String(meta.name || market.name || symbol || coinId || '').trim() || String(symbol || coinId || '').toUpperCase();
  const valuationSummaryText = dilution.label + (ratioFdvToMcap != null ? (' • FDV/MCap ' + fmtRatio(ratioFdvToMcap, 2) + 'x') : '');

  const marketMetrics = [
    metricItem('market-cap', 'Market Cap', marketCap, fmtCompactCurrency(marketCap), marketCap != null ? 'Healthy' : 'Neutral', 'CoinGecko market cap'),
    metricItem('fdv', 'FDV', fdv, fmtCompactCurrency(fdv), ratioFdvToMcap == null ? 'Neutral' : (ratioFdvToMcap <= 1.5 ? 'Healthy' : (ratioFdvToMcap >= 3 ? 'Risk' : 'Neutral')), 'Fully diluted valuation'),
    metricItem('volume-24h', '24h Volume', volume24h, fmtCompactCurrency(volume24h), ratioVolumeToMcap == null ? 'Neutral' : (ratioVolumeToMcap >= 0.08 ? 'Bullish' : (ratioVolumeToMcap <= 0.005 ? 'Risk' : 'Neutral')), 'Liquidity proxy'),
    metricItem('fdv-vs-mcap', 'FDV vs Market Cap', ratioFdvToMcap, ratioFdvToMcap == null ? 'n/a' : `${fmtRatio(ratioFdvToMcap, 2)}x`, dilution.label.indexOf('Low') >= 0 ? 'Healthy' : (dilution.label.indexOf('High') >= 0 ? 'Risk' : 'Neutral'), dilution.label)
  ];

  const supplyMetrics = [
    metricItem('circulating-supply', 'Circulating Supply', circulatingSupply, fmtCompactNumber(circulatingSupply, 2), ratioCircToMax == null ? 'Neutral' : (ratioCircToMax >= 0.6 ? 'Healthy' : (ratioCircToMax <= 0.2 ? 'Risk' : 'Neutral')), 'Tokens in circulation'),
    metricItem('total-supply', 'Total Supply', totalSupply, fmtCompactNumber(totalSupply, 2), 'Neutral', 'Current total supply'),
    metricItem('max-supply', 'Max Supply', maxSupply, fmtCompactNumber(maxSupply, 2), maxSupply != null ? 'Neutral' : 'Risk', 'Hard cap (if available)')
  ];

  const protocolMetrics = [];
  if (fees24h != null) {
    protocolMetrics.push(metricItem('fees-24h', 'Fees (24h)', fees24h, fmtCompactCurrency(fees24h), fees24h > 0 ? 'Healthy' : 'Neutral', 'Optional DefiLlama metric'));
  }
  if (revenue24h != null) {
    protocolMetrics.push(metricItem('revenue-24h', 'Revenue (24h)', revenue24h, fmtCompactCurrency(revenue24h), revenue24h > 0 ? 'Healthy' : 'Neutral', 'Optional DefiLlama metric'));
  }

  const reasons = scoreResult.reasons && scoreResult.reasons.length
    ? scoreResult.reasons.slice(0, 8)
    : ['Limited token fundamentals data available'];
  const sections = [
    { id: 'market', title: 'Token / Market Fundamentals', metrics: marketMetrics },
    { id: 'supply', title: 'Supply Structure', metrics: supplyMetrics }
  ];
  if (protocolMetrics.length) {
    sections.push({ id: 'protocol', title: 'Protocol Metrics (Optional)', metrics: protocolMetrics });
  }

  return {
    title: 'Token Fundamentals',
    assetLabel: assetName,
    label: scoreResult.label,
    qualityLabel: scoreResult.label,
    qualityScore: scoreResult.score,
    qualityScoreOutOf: 5,
    qualityRatio: null,
    score: scoreResult.score,
    scoreOutOf: 5,
    valuationLabel: dilution.label,
    valuationSummaryText,
    valuationAvg: null,
    valuationMetricsUsed: 1,
    reasons: reasons,
    reasonGroups: [
      {
        id: 'quality',
        title: 'Token reasons',
        items: reasons.slice(0, 6)
      },
      {
        id: 'valuation',
        title: 'Dilution / valuation',
        items: [dilution.label]
      }
    ],
    note: warnings.length ? warnings.join(' ') : '',
    sections: sections
  };
}

// Resolves one stock fundamentals component with stale-cache fallback behavior.
async function resolveStockComponent(name, ttlMs, existingComponent, fetcher, warnings, componentMeta, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const forced = !!opts.forceRefresh;
  const forceReason = String(opts.forceReason || '').trim();
  if (!forced && componentFresh(existingComponent, ttlMs)) {
    componentMeta[name] = { fetched: false, fromCache: true, fetchedAt: Number(existingComponent.fetchedAt || 0) || 0, forced: false };
    return { component: existingComponent, usedCache: true, fetchedFresh: false };
  }
  try {
    const next = componentPayload('fmp', await fetcher());
    componentMeta[name] = { fetched: true, fromCache: false, fetchedAt: next.fetchedAt, forced, forceReason };
    return { component: next, usedCache: false, fetchedFresh: true };
  } catch (err) {
    const errMsg = String(err && err.message || '').trim().slice(0, 120);
    if (existingComponent && existingComponent.data != null) {
      warnings.push(`Using cached ${name} data.`);
      componentMeta[name] = { fetched: false, fromCache: true, fetchedAt: Number(existingComponent.fetchedAt || 0) || 0, error: errMsg, forced, forceReason };
      return { component: existingComponent, usedCache: true, fetchedFresh: false };
    }
    if (errMsg) warnings.push(`${name} data unavailable (${errMsg}).`);
    componentMeta[name] = { fetched: false, fromCache: false, fetchedAt: 0, error: errMsg, forced, forceReason };
    return { component: null, usedCache: false, fetchedFresh: false };
  }
}

// Resolves one crypto fundamentals component with stale-cache fallback behavior.
async function resolveCryptoComponent(name, ttlMs, existingComponent, fetcher, warnings, componentMeta) {
  if (componentFresh(existingComponent, ttlMs)) {
    componentMeta[name] = { fetched: false, fromCache: true, fetchedAt: Number(existingComponent.fetchedAt || 0) || 0 };
    return { component: existingComponent, usedCache: true, fetchedFresh: false };
  }
  try {
    const next = componentPayload(name === 'protocol' ? 'defillama' : 'coingecko', await fetcher());
    componentMeta[name] = { fetched: true, fromCache: false, fetchedAt: next.fetchedAt };
    return { component: next, usedCache: false, fetchedFresh: true };
  } catch (err) {
    const errMsg = String(err && err.message || '').trim().slice(0, 120);
    if (existingComponent && existingComponent.data != null) {
      warnings.push(`Using cached ${name} data.`);
      componentMeta[name] = { fetched: false, fromCache: true, fetchedAt: Number(existingComponent.fetchedAt || 0) || 0, error: errMsg };
      return { component: existingComponent, usedCache: true, fetchedFresh: false };
    }
    if (errMsg) warnings.push(`${name} data unavailable (${errMsg}).`);
    componentMeta[name] = { fetched: false, fromCache: false, fetchedAt: 0, error: errMsg };
    return { component: null, usedCache: false, fetchedFresh: false };
  }
}

// Derives the max fetched timestamp across all component payloads.
function latestFetchedAtFromComponents(components) {
  return Object.keys(components || {}).reduce((acc, key) => {
    const ts = Number(components[key] && components[key].fetchedAt || 0) || 0;
    return Math.max(acc, ts);
  }, 0);
}

// Builds a compact component-error summary used when all fundamentals components fail.
function summarizeComponentErrors(componentMeta, names) {
  const keys = Array.isArray(names) && names.length ? names : Object.keys(componentMeta || {});
  const parts = [];
  keys.forEach((name) => {
    const info = componentMeta && componentMeta[name];
    const err = String(info && info.error || '').trim();
    if (!err) return;
    const cleaned = err.replace(/\s+/g, ' ').slice(0, 100);
    parts.push(`${name}=${cleaned}`);
  });
  if (!parts.length) return '';
  return parts.join('; ');
}

// Creates the injectable fundamentals service used by server routes.
function createFundamentalsService(options) {
  const opts = options || {};
  const runDb = opts.runDb;
  const fmpApiKey = String(opts.fmpApiKey || '').trim();
  const userAgent = String(opts.userAgent || '').trim() || 'Mozilla/5.0';
  const inFlight = new Map();
  if (typeof runDb !== 'function') throw new Error('createFundamentalsService requires runDb');

  // Reads a cached fundamentals snapshot from SQLite app_state.
  async function readSnapshot(stateKey) {
    const stored = await runDb('get_state', [stateKey]);
    const payload = stored && stored.payload && typeof stored.payload === 'object' ? stored.payload : {};
    return payload;
  }

  // Persists a fundamentals snapshot to SQLite app_state.
  async function writeSnapshot(stateKey, payload) {
    await runDb('set_state', [stateKey], payload);
  }

  // Fetches stock fundamentals from FMP with cadence-aware component caching.
  async function resolveStock(symbol, existingSnapshot, manualForce) {
    const safeSymbol = String(symbol || '').trim().toUpperCase();
    const forceRequested = !!manualForce;
    const existing = existingSnapshot && typeof existingSnapshot === 'object' ? existingSnapshot : {};
    const oldComponents = existing.components && typeof existing.components === 'object' ? existing.components : {};
    const nextComponents = Object.assign({}, oldComponents);
    const previousEarningsMeta = existing.earningsMeta && typeof existing.earningsMeta === 'object' ? existing.earningsMeta : {};
    const nowMs = Date.now();
    const today = todayDateOnly(nowMs);
    const earningsMeta = {
      nextEarningsDate: normalizeDateOnly(previousEarningsMeta.nextEarningsDate),
      earningsDateLastCheckedAt: Number(previousEarningsMeta.earningsDateLastCheckedAt || 0) || 0,
      lastPostEarningsRefreshAt: Number(previousEarningsMeta.lastPostEarningsRefreshAt || 0) || 0,
      lastEarningsRefreshReason: String(previousEarningsMeta.lastEarningsRefreshReason || '').trim()
    };
    const warnings = [];
    const componentMeta = {};
    let usedCache = false;
    let fetchedFresh = false;
    let earningsMetaChanged = false;
    let earningsEndpointUsed = '';
    let earningsLookupError = '';
    let earningsState = '';

    if (!fmpApiKey && !Object.keys(oldComponents).length) {
      const err = new Error('fmp_key_missing');
      err.statusCode = 500;
      throw err;
    }

    if (shouldRefreshEarningsMetadata(earningsMeta.earningsDateLastCheckedAt, earningsMeta.nextEarningsDate, nowMs)) {
      if (fmpApiKey) {
        const lookup = await fetchNextEarningsDateFromFmp(safeSymbol, fmpApiKey, userAgent, nowMs);
        earningsEndpointUsed = lookup.endpoint || earningsEndpointUsed;
        earningsLookupError = lookup.error || '';
        earningsMeta.earningsDateLastCheckedAt = nowMs;
        earningsMetaChanged = true;
        if (lookup.nextEarningsDate) {
          earningsMeta.nextEarningsDate = normalizeDateOnly(lookup.nextEarningsDate);
          earningsMeta.lastEarningsRefreshReason = 'earnings_metadata_refresh';
        } else if (!earningsMeta.nextEarningsDate) {
          warnings.push('Next earnings unavailable.');
          earningsState = 'Next earnings unavailable';
        }
      } else {
        earningsLookupError = 'fmp_key_missing';
      }
    }

    const shouldForcePostEarnings = shouldForcePostEarningsRefresh(
      today,
      earningsMeta.nextEarningsDate,
      earningsMeta.lastPostEarningsRefreshAt,
      forceRequested,
      nowMs
    );
    const postEarningsComponents = new Set(
      shouldForcePostEarnings ? getComponentsToRefreshForPostEarnings() : []
    );
    if (shouldForcePostEarnings) {
      earningsState = 'Earnings-aware refresh active';
    }

    const profile = await resolveStockComponent('profile', STOCK_POLICY.profileMs, oldComponents.profile, async () => {
      const payload = await fetchFmpJson(`/stable/profile?symbol=${encodeURIComponent(safeSymbol)}`, fmpApiKey, userAgent);
      return firstObjectRow(payload);
    }, warnings, componentMeta, { forceRefresh: false });
    nextComponents.profile = profile.component;
    usedCache = usedCache || profile.usedCache;
    fetchedFresh = fetchedFresh || profile.fetchedFresh;

    const income = await resolveStockComponent('income', STOCK_POLICY.statementsMs, oldComponents.income, async () => {
      const payload = await fetchFmpJson(`/stable/income-statement?symbol=${encodeURIComponent(safeSymbol)}&period=annual&limit=4`, fmpApiKey, userAgent);
      return Array.isArray(payload) ? payload : [];
    }, warnings, componentMeta, {
      forceRefresh: postEarningsComponents.has('income'),
      forceReason: shouldForcePostEarnings ? 'post_earnings' : ''
    });
    nextComponents.income = income.component;
    usedCache = usedCache || income.usedCache;
    fetchedFresh = fetchedFresh || income.fetchedFresh;

    const cashflow = await resolveStockComponent('cashflow', STOCK_POLICY.statementsMs, oldComponents.cashflow, async () => {
      const payload = await fetchFmpJson(`/stable/cash-flow-statement?symbol=${encodeURIComponent(safeSymbol)}&period=annual&limit=2`, fmpApiKey, userAgent);
      return Array.isArray(payload) ? payload : [];
    }, warnings, componentMeta, {
      forceRefresh: postEarningsComponents.has('cashflow'),
      forceReason: shouldForcePostEarnings ? 'post_earnings' : ''
    });
    nextComponents.cashflow = cashflow.component;
    usedCache = usedCache || cashflow.usedCache;
    fetchedFresh = fetchedFresh || cashflow.fetchedFresh;

    const ratios = await resolveStockComponent('ratios', STOCK_POLICY.valuationMs, oldComponents.ratios, async () => {
      const payload = await fetchFmpJson(`/stable/ratios-ttm?symbol=${encodeURIComponent(safeSymbol)}`, fmpApiKey, userAgent);
      return firstObjectRow(payload);
    }, warnings, componentMeta, {
      forceRefresh: postEarningsComponents.has('ratios'),
      forceReason: shouldForcePostEarnings ? 'post_earnings' : ''
    });
    nextComponents.ratios = ratios.component;
    usedCache = usedCache || ratios.usedCache;
    fetchedFresh = fetchedFresh || ratios.fetchedFresh;

    const scores = await resolveStockComponent('scores', STOCK_POLICY.scoresMs, oldComponents.scores, async () => {
      const payload = await fetchFmpJson(`/stable/financial-scores?symbol=${encodeURIComponent(safeSymbol)}`, fmpApiKey, userAgent);
      return firstObjectRow(payload);
    }, warnings, componentMeta, {
      forceRefresh: postEarningsComponents.has('scores'),
      forceReason: shouldForcePostEarnings ? 'post_earnings' : ''
    });
    nextComponents.scores = scores.component;
    usedCache = usedCache || scores.usedCache;
    fetchedFresh = fetchedFresh || scores.fetchedFresh;

    const forcedNames = getComponentsToRefreshForPostEarnings();
    const forcedComponentMeta = forcedNames.map((name) => ({ name, info: componentMeta[name] || {} }));
    const forcedFetchedCount = forcedComponentMeta.filter((x) => x.info && x.info.fetched).length;
    const forcedFailedCount = forcedComponentMeta.filter((x) => x.info && x.info.error).length;

    if (shouldForcePostEarnings) {
      earningsMeta.lastPostEarningsRefreshAt = nowMs;
      earningsMeta.lastEarningsRefreshReason = forceRequested ? 'post_earnings_manual_refresh' : 'post_earnings_auto_refresh';
      earningsMetaChanged = true;
      if (forcedFailedCount > 0 && forcedFetchedCount === 0) {
        warnings.push('Using cached fundamentals; post-earnings refresh failed.');
        earningsState = 'Using cached fundamentals; post-earnings refresh failed';
      } else {
        earningsState = 'Refreshed after earnings';
      }
      if (fmpApiKey) {
        const postLookup = await fetchNextEarningsDateFromFmp(safeSymbol, fmpApiKey, userAgent, nowMs);
        earningsEndpointUsed = postLookup.endpoint || earningsEndpointUsed;
        earningsLookupError = postLookup.error || earningsLookupError;
        earningsMeta.earningsDateLastCheckedAt = nowMs;
        earningsMetaChanged = true;
        if (postLookup.nextEarningsDate) {
          earningsMeta.nextEarningsDate = normalizeDateOnly(postLookup.nextEarningsDate);
          earningsMeta.lastEarningsRefreshReason = 'post_earnings_schedule_refresh';
        } else if (!earningsMeta.nextEarningsDate) {
          earningsState = 'Awaiting updated earnings schedule';
        }
      }
    } else if (earningsMeta.nextEarningsDate && compareDateOnly(today, earningsMeta.nextEarningsDate) >= 0) {
      earningsState = 'Refreshed after earnings';
    } else if (!earningsMeta.nextEarningsDate && !earningsState) {
      earningsState = 'Awaiting updated earnings schedule';
    }

    debugFa('earnings', safeSymbol, {
      symbol: safeSymbol,
      today,
      cachedNextEarningsDate: normalizeDateOnly(previousEarningsMeta.nextEarningsDate),
      nextEarningsDate: earningsMeta.nextEarningsDate,
      invalidatedByEarningsDate: shouldForcePostEarnings,
      cooldownPrevented: !shouldForcePostEarnings && compareDateOnly(today, earningsMeta.nextEarningsDate) >= 0,
      componentsForced: shouldForcePostEarnings ? forcedNames : [],
      componentsTtlOnly: ['profile', 'income', 'cashflow', 'ratios', 'scores'].filter((name) => !postEarningsComponents.has(name)),
      forceRequested,
      earningsEndpointUsed,
      earningsLookupError,
      updatedNextEarningsDateStored: earningsMeta.nextEarningsDate
    });

    if (!nextComponents.profile && !nextComponents.income && !nextComponents.cashflow && !nextComponents.ratios && !nextComponents.scores) {
      const summary = summarizeComponentErrors(componentMeta, ['profile', 'income', 'cashflow', 'ratios', 'scores']);
      const err = new Error(summary ? `stock_fundamentals_unavailable: ${summary}` : 'stock_fundamentals_unavailable');
      err.statusCode = 502;
      throw err;
    }

    const filteredComponents = {};
    Object.keys(nextComponents).forEach((key) => {
      if (nextComponents[key]) filteredComponents[key] = nextComponents[key];
    });
    const panel = buildStockPanel(safeSymbol, filteredComponents, warnings, earningsMeta, earningsState, nowMs);
    const fetchedAt = latestFetchedAtFromComponents(filteredComponents) || Date.now();
    return {
      snapshot: {
        assetType: 'stock',
        symbol: safeSymbol,
        components: filteredComponents,
        earningsMeta,
        panel,
        fetchedAt
      },
      response: {
        assetType: 'stock',
        symbol: safeSymbol,
        earningsMeta,
        panel,
        fetchedAt,
        cache: {
          usedCache,
          staleFallback: warnings.length > 0,
          components: componentMeta
        }
      },
      fetchedFresh: fetchedFresh || earningsMetaChanged
    };
  }

  // Fetches crypto fundamentals from CoinGecko with optional DefiLlama enrichment.
  async function resolveCrypto(coinId, includeProtocol, existingSnapshot) {
    const safeCoinId = String(coinId || '').trim().toLowerCase();
    const existing = existingSnapshot && typeof existingSnapshot === 'object' ? existingSnapshot : {};
    const oldComponents = existing.components && typeof existing.components === 'object' ? existing.components : {};
    const nextComponents = Object.assign({}, oldComponents);
    const warnings = [];
    const componentMeta = {};
    let usedCache = false;
    let fetchedFresh = false;

    const market = await resolveCryptoComponent('market', CRYPTO_POLICY.marketMs, oldComponents.market, async () => {
      const payload = await fetchCoinGeckoJson(`/coins/markets?vs_currency=usd&ids=${encodeURIComponent(safeCoinId)}&price_change_percentage=24h`, userAgent);
      const row = firstObjectRow(payload);
      if (!row) throw new Error('coingecko_market_empty');
      return row;
    }, warnings, componentMeta);
    nextComponents.market = market.component;
    usedCache = usedCache || market.usedCache;
    fetchedFresh = fetchedFresh || market.fetchedFresh;

    const meta = await resolveCryptoComponent('meta', CRYPTO_POLICY.metaMs, oldComponents.meta, async () => {
      const payload = await fetchCoinGeckoJson(`/coins/${encodeURIComponent(safeCoinId)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`, userAgent);
      return firstObjectRow(payload);
    }, warnings, componentMeta);
    nextComponents.meta = meta.component;
    usedCache = usedCache || meta.usedCache;
    fetchedFresh = fetchedFresh || meta.fetchedFresh;

    if (includeProtocol) {
      const slug = protocolSlugForCoin(safeCoinId);
      if (slug) {
        const protocol = await resolveCryptoComponent('protocol', CRYPTO_POLICY.protocolMs, oldComponents.protocol, async () => {
          const feesPayload = await fetchDefiLlamaJson(`/summary/fees/${encodeURIComponent(slug)}?dataType=dailyFees`, userAgent);
          const revenuePayload = await fetchDefiLlamaJson(`/summary/fees/${encodeURIComponent(slug)}?dataType=dailyRevenue`, userAgent);
          return {
            slug,
            fees24h: extractDefiLlamaValue(feesPayload),
            revenue24h: extractDefiLlamaValue(revenuePayload)
          };
        }, warnings, componentMeta);
        nextComponents.protocol = protocol.component;
        usedCache = usedCache || protocol.usedCache;
        fetchedFresh = fetchedFresh || protocol.fetchedFresh;
      }
    }

    if (!nextComponents.market && !nextComponents.meta) {
      const summary = summarizeComponentErrors(componentMeta, ['market', 'meta', 'protocol']);
      const err = new Error(summary ? `crypto_fundamentals_unavailable: ${summary}` : 'crypto_fundamentals_unavailable');
      err.statusCode = 502;
      throw err;
    }

    const filteredComponents = {};
    Object.keys(nextComponents).forEach((key) => {
      if (nextComponents[key]) filteredComponents[key] = nextComponents[key];
    });
    const inferredSymbol = String(
      (filteredComponents.meta && filteredComponents.meta.data && filteredComponents.meta.data.symbol) ||
      (filteredComponents.market && filteredComponents.market.data && filteredComponents.market.data.symbol) ||
      safeCoinId
    ).toUpperCase();
    const panel = buildCryptoPanel(safeCoinId, inferredSymbol, filteredComponents, warnings);
    const fetchedAt = latestFetchedAtFromComponents(filteredComponents) || Date.now();
    return {
      snapshot: {
        assetType: 'crypto',
        coinId: safeCoinId,
        components: filteredComponents,
        panel,
        fetchedAt
      },
      response: {
        assetType: 'crypto',
        coinId: safeCoinId,
        panel,
        fetchedAt,
        cache: {
          usedCache,
          staleFallback: warnings.length > 0,
          components: componentMeta
        }
      },
      fetchedFresh
    };
  }

  // Resolves fundamentals for stock/crypto and deduplicates concurrent requests by key.
  async function getFundamentals(params) {
    const assetType = params && params.assetType === 'crypto' ? 'crypto' : 'stock';
    const symbol = assetType === 'stock' ? String(params && params.symbol || '').trim().toUpperCase() : '';
    const coinId = assetType === 'crypto' ? String(params && params.coinId || '').trim().toLowerCase() : '';
    const includeProtocol = !!(params && params.includeProtocol);
    const forceRefresh = !!(params && params.forceRefresh);
    const identity = assetType === 'crypto' ? coinId : symbol;
    if (!identity) {
      const err = new Error(assetType === 'crypto' ? 'missing_coin_id' : 'missing_symbol');
      err.statusCode = 400;
      throw err;
    }
    const stateKey = fundamentalsStateKey(assetType, identity);
    const inFlightKey = `${assetType}:${identity}:${includeProtocol ? '1' : '0'}:${forceRefresh ? '1' : '0'}`;
    if (inFlight.has(inFlightKey)) return inFlight.get(inFlightKey);

    const job = (async () => {
      const existing = await readSnapshot(stateKey);
      const resolved = assetType === 'crypto'
        ? await resolveCrypto(coinId, includeProtocol, existing)
        : await resolveStock(symbol, existing, forceRefresh);
      if (resolved.fetchedFresh || JSON.stringify(existing && existing.panel || {}) !== JSON.stringify(resolved.snapshot.panel || {})) {
        await writeSnapshot(stateKey, resolved.snapshot);
      }
      return resolved.response;
    })().finally(() => {
      inFlight.delete(inFlightKey);
    });
    inFlight.set(inFlightKey, job);
    return job;
  }

  return {
    getFundamentals
  };
}

module.exports = {
  createFundamentalsService,
  __test: {
    normalizeDateOnly,
    shouldRefreshEarningsMetadata,
    shouldForcePostEarningsRefresh,
    getNextUpcomingEarningsDateFromApiResponse,
    getComponentsToRefreshForPostEarnings,
    describeEarningsDate,
    buildStockPanel,
    buildCryptoPanel
  }
};
