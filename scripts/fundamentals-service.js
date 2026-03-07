// Implements provider adapters, cache cadence logic, and panel payload shaping for fundamentals.
const axios = require('axios');
const FundamentalsEngine = require('./fundamentals-engine.js');

const FMP_BASE_URL = 'https://financialmodelingprep.com';
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
const DEFILLAMA_BASE_URL = 'https://api.llama.fi';
const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEC_DATA_BASE_URL = 'https://data.sec.gov';
const SEC_TICKER_CACHE_MS = 1000 * 60 * 60 * 12;

let secTickerMapCache = {
  fetchedAt: 0,
  map: null,
  inFlight: null
};

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
  if (!FundamentalsEngine.isFresh(component && component.fetchedAt, ttlMs)) return false;
  if (!component || typeof component !== 'object') return false;
  if (!Object.prototype.hasOwnProperty.call(component, 'data')) return false;
  if (component.data == null) return false;
  if (Array.isArray(component.data)) {
    const hasErrorRow = component.data.some(
      (row) => row && typeof row === 'object' && (row['Error Message'] || row.error)
    );
    if (hasErrorRow) return false;
    return true;
  }
  if (typeof component.data === 'object' && (component.data['Error Message'] || component.data.error)) return false;
  return true;
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

// Extracts provider-level FMP error messages from heterogeneous payload shapes.
function extractFmpErrorMessage(payload) {
  if (!payload) return '';
  const rows = Array.isArray(payload)
    ? payload.slice(0, 3).filter((row) => row && typeof row === 'object')
    : (payload && typeof payload === 'object' ? [payload] : []);
  const likelyErrorText = /(premium query parameter|legacy endpoint|subscription|invalid api key|rate limit|forbidden|unauthorized|not available|error)/i;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    const explicit = String(row['Error Message'] || row.error || '').trim();
    if (explicit) return explicit;
    const inferred = String(row.message || row.note || row.Note || '').trim();
    if (inferred && likelyErrorText.test(inferred)) return inferred;
  }
  return '';
}

// Determines whether a ticker likely belongs to a US-listed equity symbol namespace.
function isLikelyUsStockSymbol(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return false;
  if (s.includes('/') || s.includes(':')) return false;
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(s);
}

// Builds a SEC-compliant user-agent header value.
function secUserAgent(userAgent) {
  const base = String(userAgent || '').trim() || 'PortfolioTracker/2026';
  if (/@/.test(base)) return base;
  return `${base} (portfolio-tracker; contact: local@example.com)`;
}

// Fetches SEC JSON payloads with the required user-agent semantics.
async function fetchSecJson(url, userAgent) {
  return getJson(
    String(url || ''),
    { 'User-Agent': secUserAgent(userAgent), Accept: 'application/json,text/plain,*/*' },
    15000
  );
}

// Normalizes a SEC CIK value to a zero-padded 10-digit string.
function normalizeSecCik(cikValue) {
  const raw = String(cikValue == null ? '' : cikValue).replace(/\D+/g, '');
  if (!raw) return '';
  return raw.padStart(10, '0');
}

// Loads the SEC ticker map and caches it in-memory.
async function getSecTickerMap(userAgent) {
  const now = Date.now();
  if (secTickerMapCache.map && (now - secTickerMapCache.fetchedAt) < SEC_TICKER_CACHE_MS) {
    return secTickerMapCache.map;
  }
  if (secTickerMapCache.inFlight) return secTickerMapCache.inFlight;
  secTickerMapCache.inFlight = (async () => {
    const payload = await fetchSecJson(SEC_TICKERS_URL, userAgent);
    const rows = payload && typeof payload === 'object' ? Object.values(payload) : [];
    const map = new Map();
    rows.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const ticker = String(row.ticker || '').trim().toUpperCase();
      const cik = normalizeSecCik(row.cik_str);
      if (!ticker || !cik) return;
      map.set(ticker, {
        ticker,
        cik,
        title: String(row.title || '').trim()
      });
    });
    secTickerMapCache = { fetchedAt: Date.now(), map, inFlight: null };
    return map;
  })().catch((err) => {
    secTickerMapCache.inFlight = null;
    throw err;
  });
  return secTickerMapCache.inFlight;
}

// Derives a stable DB key used for fundamentals snapshots.
function fundamentalsStateKey(assetType, id) {
  const type = assetType === 'crypto' ? 'crypto' : 'stock';
  const safeId = String(id || '').trim();
  if (!safeId) return '';
  return `fundamentals:${type}:${type === 'crypto' ? safeId.toLowerCase() : safeId.toUpperCase()}`;
}

// Creates a uniform metric item payload for panel rendering.
function metricItem(id, label, value, display, status, hint, details) {
  const meta = details && typeof details === 'object' ? details : {};
  return {
    id,
    label,
    value: value == null ? null : value,
    display: String(display == null ? 'n/a' : display),
    status: normalizeStatus(status),
    hint: hint ? String(hint) : '',
    source: meta.source ? String(meta.source) : '',
    asOfDate: normalizeDateOnly(meta.asOfDate),
    reasonIfUnavailable: value == null ? String(meta.reasonIfUnavailable || '') : ''
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
  const providerError = extractFmpErrorMessage(payload);
  if (providerError) {
    const err = new Error(String(providerError || 'FMP error').slice(0, 220));
    err.statusCode = 502;
    throw err;
  }
  return payload;
}

// Fetches a Finnhub endpoint while appending the API token.
async function fetchFinnhubJson(pathWithQuery, apiKey, userAgent) {
  if (!apiKey) {
    const err = new Error('finnhub_key_missing');
    err.statusCode = 500;
    throw err;
  }
  const sep = pathWithQuery.includes('?') ? '&' : '?';
  const url = `${FINNHUB_BASE_URL}${pathWithQuery}${sep}token=${encodeURIComponent(apiKey)}`;
  const payload = await getJson(url, { 'User-Agent': userAgent, Accept: 'application/json,text/plain,*/*' }, 12000);
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.error) {
      const err = new Error(String(payload.error || 'Finnhub error').slice(0, 220));
      err.statusCode = 502;
      throw err;
    }
  }
  return payload;
}

// Returns the first available numeric metric value from a candidate-key list.
function metricValue(metric, keys) {
  const src = metric && typeof metric === 'object' ? metric : {};
  const candidates = Array.isArray(keys) ? keys : [];
  for (let i = 0; i < candidates.length; i += 1) {
    const key = candidates[i];
    const value = num(src[key]);
    if (value != null) return value;
  }
  return null;
}

// Returns a normalized, alphanumeric concept token used for robust financial fact matching.
function normalizeFactToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Reads a numeric fact value from a Finnhub statement section using concept/label candidate matching.
function readFinnhubFact(items, conceptCandidates, labelCandidates) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return null;
  const concepts = (Array.isArray(conceptCandidates) ? conceptCandidates : [])
    .map(normalizeFactToken)
    .filter(Boolean);
  const labels = (Array.isArray(labelCandidates) ? labelCandidates : [])
    .map(normalizeFactToken)
    .filter(Boolean);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] && typeof rows[i] === 'object' ? rows[i] : null;
    if (!row) continue;
    const conceptToken = normalizeFactToken(row.concept || row.tag || row.metric || row.field || row.code || '');
    const labelToken = normalizeFactToken(row.label || row.name || row.description || row.title || '');
    const conceptMatch = concepts.some((candidate) => {
      if (!candidate || !conceptToken) return false;
      return conceptToken === candidate || conceptToken.includes(candidate) || candidate.includes(conceptToken);
    });
    const labelMatch = labels.some((candidate) => {
      if (!candidate || !labelToken) return false;
      return labelToken === candidate || labelToken.includes(candidate) || candidate.includes(labelToken);
    });
    if (!conceptMatch && !labelMatch) continue;
    const value = num(row.value != null ? row.value : (row.amount != null ? row.amount : row.v));
    if (value != null) return value;
  }
  return null;
}

// Converts Finnhub financials-reported payload into normalized rows used by fallback statement builders.
function parseFinnhubFinancialRows(payload) {
  const rows = Array.isArray(payload && payload.data) ? payload.data : [];
  if (!rows.length) return [];
  const parsed = rows.map((row) => {
    const report = row && typeof row === 'object' && row.report && typeof row.report === 'object' ? row.report : {};
    const incomeFacts = Array.isArray(report.ic) ? report.ic : [];
    const cashFacts = Array.isArray(report.cf) ? report.cf : [];
    const balanceFacts = Array.isArray(report.bs) ? report.bs : [];
    const revenue = readFinnhubFact(
      incomeFacts,
      ['RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'Revenues', 'Revenue'],
      ['Revenue', 'Total Revenue', 'Net Sales']
    );
    const epsdiluted = readFinnhubFact(
      incomeFacts,
      ['EarningsPerShareDiluted', 'DilutedEarningsPerShare', 'EarningsPerShareBasicAndDiluted'],
      ['Diluted EPS', 'Earnings Per Share Diluted', 'EPS Diluted']
    );
    const operatingIncome = readFinnhubFact(
      incomeFacts,
      ['OperatingIncomeLoss', 'IncomeLossFromOperations', 'OperatingIncome'],
      ['Operating Income', 'Income From Operations']
    );
    const directFreeCashFlow = readFinnhubFact(
      cashFacts,
      ['FreeCashFlow'],
      ['Free Cash Flow']
    );
    const cashFromOperations = readFinnhubFact(
      cashFacts,
      ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
      ['Net Cash Provided By Operating Activities', 'Cash From Operations']
    );
    const capex = readFinnhubFact(
      cashFacts,
      ['PaymentsToAcquirePropertyPlantAndEquipment', 'CapitalExpenditures', 'PurchaseOfPropertyPlantAndEquipment'],
      ['Capital Expenditures', 'Purchase Of Property Plant And Equipment', 'CapEx']
    );
    let freeCashFlow = directFreeCashFlow;
    if (freeCashFlow == null && cashFromOperations != null && capex != null) {
      freeCashFlow = cashFromOperations - Math.abs(capex);
    }
    const totalDebt = readFinnhubFact(
      balanceFacts,
      ['DebtCurrent', 'LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations', 'ShortTermBorrowings', 'NotesPayableCurrent'],
      ['Total Debt', 'Long Term Debt', 'Short Term Debt']
    );
    const totalEquity = readFinnhubFact(
      balanceFacts,
      ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'TotalStockholdersEquity'],
      ['Total Equity', 'Stockholders Equity', 'Shareholders Equity']
    );
    return {
      date: normalizeDateOnly(row && (row.endDate || row.reportDate || row.fiscalDateEnding || row.date)),
      year: num(row && row.year),
      revenue,
      epsdiluted,
      operatingIncome,
      freeCashFlow,
      totalDebt,
      totalEquity
    };
  }).filter((row) => {
    if (!row) return false;
    return (
      row.revenue != null ||
      row.epsdiluted != null ||
      row.operatingIncome != null ||
      row.freeCashFlow != null ||
      row.totalDebt != null ||
      row.totalEquity != null
    );
  });
  parsed.sort((a, b) => {
    const dateA = String(a.date || '');
    const dateB = String(b.date || '');
    if (dateA && dateB && dateA !== dateB) return dateA > dateB ? -1 : 1;
    const yearA = num(a.year);
    const yearB = num(b.year);
    if (yearA != null && yearB != null && yearA !== yearB) return yearB - yearA;
    return 0;
  });
  return parsed;
}

// Pulls normalized numeric fact entries from SEC companyfacts for a set of concept aliases.
function secFactEntries(companyFacts, conceptAliases) {
  const facts = companyFacts && companyFacts.facts && typeof companyFacts.facts === 'object'
    ? companyFacts.facts
    : {};
  const aliases = Array.isArray(conceptAliases) ? conceptAliases : [];
  const rows = [];
  aliases.forEach((alias) => {
    const raw = String(alias || '').trim();
    if (!raw.includes(':')) return;
    const parts = raw.split(':');
    const taxonomy = String(parts[0] || '').trim();
    const tag = String(parts[1] || '').trim();
    if (!taxonomy || !tag) return;
    const node = facts[taxonomy] && facts[taxonomy][tag] ? facts[taxonomy][tag] : null;
    const units = node && node.units && typeof node.units === 'object' ? node.units : {};
    Object.keys(units).forEach((unit) => {
      const entries = Array.isArray(units[unit]) ? units[unit] : [];
      entries.forEach((entry) => {
        const value = num(entry && entry.val);
        if (value == null) return;
        rows.push({
          taxonomy,
          tag,
          unit: String(unit || ''),
          val: value,
          end: normalizeDateOnly(entry && entry.end),
          start: normalizeDateOnly(entry && entry.start),
          filed: normalizeDateOnly(entry && entry.filed),
          fy: num(entry && entry.fy),
          fp: String(entry && entry.fp || '').trim().toUpperCase(),
          form: String(entry && entry.form || '').trim().toUpperCase()
        });
      });
    });
  });
  rows.sort((a, b) => {
    const ea = String(a.end || '');
    const eb = String(b.end || '');
    if (ea && eb && ea !== eb) return ea > eb ? -1 : 1;
    const fa = String(a.filed || '');
    const fb = String(b.filed || '');
    if (fa && fb && fa !== fb) return fa > fb ? -1 : 1;
    return 0;
  });
  return rows;
}

// Picks the latest quarterly entry and its same-quarter prior-year comparator when available.
function secQuarterPair(entries) {
  const rows = (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (!entry) return false;
    const fp = String(entry.fp || '');
    const form = String(entry.form || '');
    return /^Q[1-4]$/.test(fp) || /10-Q/.test(form);
  });
  if (!rows.length) return { latest: null, prior: null };
  const latest = rows[0];
  const latestFy = num(latest.fy);
  let prior = null;
  if (latestFy != null && /^Q[1-4]$/.test(String(latest.fp || ''))) {
    prior = rows.find((entry) => num(entry.fy) === (latestFy - 1) && String(entry.fp || '') === String(latest.fp || '')) || null;
  }
  if (!prior && latest.end) {
    const y = Number(String(latest.end).slice(0, 4));
    if (Number.isFinite(y)) {
      const expected = String(latest.end).replace(/^(\d{4})/, String(y - 1));
      prior = rows.find((entry) => String(entry.end || '') === expected && String(entry.fp || '') === String(latest.fp || '')) || null;
    }
  }
  return { latest, prior };
}

// Picks the latest annual entry and prior annual comparator when available.
function secAnnualPair(entries) {
  const rows = (Array.isArray(entries) ? entries : []).filter((entry) => {
    const fp = String(entry && entry.fp || '');
    const form = String(entry && entry.form || '');
    return fp === 'FY' || /10-K/.test(form);
  });
  if (!rows.length) return { latest: null, prior: null };
  const latest = rows[0];
  const latestFy = num(latest.fy);
  let prior = null;
  if (latestFy != null) {
    prior = rows.find((entry) => num(entry.fy) === (latestFy - 1)) || null;
  }
  if (!prior && latest.end) {
    const y = Number(String(latest.end).slice(0, 4));
    if (Number.isFinite(y)) {
      const expected = String(latest.end).replace(/^(\d{4})/, String(y - 1));
      prior = rows.find((entry) => String(entry.end || '') === expected) || null;
    }
  }
  return { latest, prior };
}

// Sums the latest four quarterly points for trailing-12-month computations.
function secTtm(entries) {
  const rows = (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (!entry) return false;
    const fp = String(entry.fp || '');
    const form = String(entry.form || '');
    return /^Q[1-4]$/.test(fp) || /10-Q/.test(form);
  });
  if (rows.length < 4) return null;
  const latestFour = rows.slice(0, 4);
  const sum = latestFour.reduce((acc, entry) => acc + Number(entry.val || 0), 0);
  return Number.isFinite(sum) ? sum : null;
}

// Builds a normalized SEC-based fundamentals object including derived metrics and availability reasons.
function buildSecNormalizedFundamentals(symbol, tickerRecord, companyFacts, context) {
  const ctx = context && typeof context === 'object' ? context : {};
  const revenueEntries = secFactEntries(companyFacts, [
    'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
    'us-gaap:SalesRevenueNet',
    'us-gaap:Revenues',
    'us-gaap:SalesRevenueGoodsNet',
    'us-gaap:SalesRevenueServicesNet',
    'us-gaap:SalesRevenueGoodsAndServicesNet'
  ]);
  const grossProfitEntries = secFactEntries(companyFacts, ['us-gaap:GrossProfit']);
  const costOfRevenueEntries = secFactEntries(companyFacts, [
    'us-gaap:CostOfRevenue',
    'us-gaap:CostOfGoodsAndServicesSold',
    'us-gaap:CostOfGoodsSold',
    'us-gaap:CostOfServices'
  ]);
  const netIncomeEntries = secFactEntries(companyFacts, ['us-gaap:NetIncomeLoss', 'us-gaap:ProfitLoss']);
  const epsDilutedEntries = secFactEntries(companyFacts, ['us-gaap:EarningsPerShareDiluted', 'us-gaap:DilutedEarningsPerShare']);
  const operatingCashFlowEntries = secFactEntries(companyFacts, [
    'us-gaap:NetCashProvidedByUsedInOperatingActivities',
    'us-gaap:NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'
  ]);
  const capexEntries = secFactEntries(companyFacts, [
    'us-gaap:PaymentsToAcquirePropertyPlantAndEquipment',
    'us-gaap:CapitalExpendituresIncurredButNotYetPaid'
  ]);
  const debtCurrentEntries = secFactEntries(companyFacts, ['us-gaap:DebtCurrent', 'us-gaap:ShortTermBorrowings']);
  const debtLongEntries = secFactEntries(companyFacts, [
    'us-gaap:LongTermDebt',
    'us-gaap:LongTermDebtNoncurrent',
    'us-gaap:LongTermDebtAndCapitalLeaseObligations'
  ]);
  const debtTotalEntries = secFactEntries(companyFacts, ['us-gaap:DebtAndFinanceLeaseLiabilities']);
  const currentAssetsEntries = secFactEntries(companyFacts, ['us-gaap:AssetsCurrent']);
  const currentLiabilitiesEntries = secFactEntries(companyFacts, ['us-gaap:LiabilitiesCurrent']);
  const totalAssetsEntries = secFactEntries(companyFacts, ['us-gaap:Assets']);
  const totalLiabilitiesEntries = secFactEntries(companyFacts, ['us-gaap:Liabilities']);
  const equityEntries = secFactEntries(companyFacts, [
    'us-gaap:StockholdersEquity',
    'us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    'us-gaap:TotalStockholdersEquity'
  ]);
  const retainedEarningsEntries = secFactEntries(companyFacts, ['us-gaap:RetainedEarningsAccumulatedDeficit']);
  const ebitEntries = secFactEntries(companyFacts, ['us-gaap:EarningsBeforeInterestAndTaxes', 'us-gaap:OperatingIncomeLoss']);
  const sharesEntries = secFactEntries(companyFacts, ['dei:EntityCommonStockSharesOutstanding', 'us-gaap:CommonStockSharesOutstanding']);

  const revenueQ = secQuarterPair(revenueEntries);
  const epsQ = secQuarterPair(epsDilutedEntries);
  const revenueA = secAnnualPair(revenueEntries);
  const epsA = secAnnualPair(epsDilutedEntries);
  const grossQ = secQuarterPair(grossProfitEntries);
  const costQ = secQuarterPair(costOfRevenueEntries);
  const netIncomeA = secAnnualPair(netIncomeEntries);
  const ocfA = secAnnualPair(operatingCashFlowEntries);
  const capexA = secAnnualPair(capexEntries);
  const equityA = secAnnualPair(equityEntries);
  const totalAssetsA = secAnnualPair(totalAssetsEntries);
  const currentAssetsA = secAnnualPair(currentAssetsEntries);
  const currentLiabilitiesA = secAnnualPair(currentLiabilitiesEntries);
  const debtTotalA = secAnnualPair(debtTotalEntries);
  const debtLongA = secAnnualPair(debtLongEntries);
  const debtCurrentA = secAnnualPair(debtCurrentEntries);
  const retainedA = secAnnualPair(retainedEarningsEntries);
  const ebitA = secAnnualPair(ebitEntries);
  const liabilitiesA = secAnnualPair(totalLiabilitiesEntries);
  const sharesLatest = (Array.isArray(sharesEntries) && sharesEntries.length) ? sharesEntries[0] : null;

  const trailingRevenue = secTtm(revenueEntries) != null ? secTtm(revenueEntries) : (revenueA.latest ? num(revenueA.latest.val) : null);
  const trailingEps = secTtm(epsDilutedEntries) != null ? secTtm(epsDilutedEntries) : (epsA.latest ? num(epsA.latest.val) : null);
  const trailingNetIncome = secTtm(netIncomeEntries) != null ? secTtm(netIncomeEntries) : (netIncomeA.latest ? num(netIncomeA.latest.val) : null);

  const revenueLatestQuarter = num(revenueQ.latest && revenueQ.latest.val);
  const revenuePriorSameQuarter = num(revenueQ.prior && revenueQ.prior.val);
  const costOfRevenueLatestQuarter = num(costQ.latest && costQ.latest.val);
  const grossProfitDirectQuarter = num(grossQ.latest && grossQ.latest.val);
  const grossProfitFromCost = (grossProfitDirectQuarter == null && revenueLatestQuarter != null && costOfRevenueLatestQuarter != null)
    ? (revenueLatestQuarter - Math.abs(costOfRevenueLatestQuarter))
    : null;

  const raw = {
    revenue: revenueLatestQuarter,
    priorYearRevenue: revenuePriorSameQuarter,
    grossProfit: grossProfitDirectQuarter != null ? grossProfitDirectQuarter : grossProfitFromCost,
    costOfRevenue: costOfRevenueLatestQuarter,
    netIncome: num((netIncomeA.latest && netIncomeA.latest.val) || trailingNetIncome),
    epsDiluted: num((epsQ.latest && epsQ.latest.val) || (epsA.latest && epsA.latest.val)),
    priorYearEpsDiluted: num((epsQ.prior && epsQ.prior.val)),
    operatingCashFlow: num((ocfA.latest && ocfA.latest.val) || secTtm(operatingCashFlowEntries)),
    capex: num((capexA.latest && capexA.latest.val) || secTtm(capexEntries)),
    totalDebt: num((debtTotalA.latest && debtTotalA.latest.val))
      || (num(debtLongA.latest && debtLongA.latest.val) != null || num(debtCurrentA.latest && debtCurrentA.latest.val) != null
        ? (Number(num(debtLongA.latest && debtLongA.latest.val) || 0) + Number(num(debtCurrentA.latest && debtCurrentA.latest.val) || 0))
        : null),
    currentAssets: num(currentAssetsA.latest && currentAssetsA.latest.val),
    currentLiabilities: num(currentLiabilitiesA.latest && currentLiabilitiesA.latest.val),
    totalAssets: num(totalAssetsA.latest && totalAssetsA.latest.val),
    totalLiabilities: num(liabilitiesA.latest && liabilitiesA.latest.val),
    shareholdersEquity: num(equityA.latest && equityA.latest.val),
    retainedEarnings: num(retainedA.latest && retainedA.latest.val),
    ebit: num(ebitA.latest && ebitA.latest.val),
    sharesOutstanding: num(sharesLatest && sharesLatest.val),
    marketCap: num(ctx.marketCap),
    price: num(ctx.price),
    trailingEps: num(trailingEps),
    trailingRevenue: num(trailingRevenue),
    nextEarningsDate: normalizeDateOnly(ctx.nextEarningsDate)
  };

  const availabilityReasons = {};
  const derived = {};
  const metricInfo = {};
  function assignMetric(id, value, details) {
    const info = details && typeof details === 'object' ? details : {};
    const finite = num(value);
    derived[id] = finite;
    const reason = String(info.reasonIfUnavailable || '').trim();
    if (finite == null && reason) availabilityReasons[id] = reason;
    metricInfo[id] = {
      value: finite,
      source: String(info.source || ''),
      asOfDate: normalizeDateOnly(info.asOfDate),
      reasonIfUnavailable: finite == null ? reason : '',
      formulaPath: String(info.formulaPath || ''),
      rawValues: info.rawValues && typeof info.rawValues === 'object' ? info.rawValues : {}
    };
  }

  let revenueGrowthReason = '';
  if (raw.revenue == null) {
    revenueGrowthReason = 'Revenue growth unavailable because latest quarterly revenue is missing';
  } else if (raw.priorYearRevenue == null) {
    revenueGrowthReason = 'Revenue growth unavailable because matching prior-year quarter revenue was not found';
  }
  const revenueGrowthYoY = FundamentalsEngine.pctGrowth(raw.revenue, raw.priorYearRevenue);
  assignMetric('revenueGrowthYoY', revenueGrowthYoY, {
    source: 'sec',
    asOfDate: revenueQ.latest && revenueQ.latest.end,
    formulaPath: '((latestQuarterRevenue - priorYearSameQuarterRevenue) / abs(priorYearSameQuarterRevenue)) * 100',
    rawValues: {
      latestQuarterRevenue: raw.revenue,
      priorYearSameQuarterRevenue: raw.priorYearRevenue,
      latestQuarter: revenueQ.latest ? { fy: revenueQ.latest.fy, fp: revenueQ.latest.fp, end: revenueQ.latest.end } : null,
      priorYearQuarter: revenueQ.prior ? { fy: revenueQ.prior.fy, fp: revenueQ.prior.fp, end: revenueQ.prior.end } : null
    },
    reasonIfUnavailable: revenueGrowthReason
  });
  const epsGrowthYoY = FundamentalsEngine.pctGrowth(raw.epsDiluted, raw.priorYearEpsDiluted);
  assignMetric('epsGrowthYoY', epsGrowthYoY, {
    source: 'sec',
    asOfDate: epsQ.latest && epsQ.latest.end,
    formulaPath: '((latestQuarterDilutedEPS - priorYearSameQuarterDilutedEPS) / abs(priorYearSameQuarterDilutedEPS)) * 100',
    rawValues: {
      latestQuarterDilutedEPS: raw.epsDiluted,
      priorYearSameQuarterDilutedEPS: raw.priorYearEpsDiluted
    },
    reasonIfUnavailable: raw.epsDiluted == null || raw.priorYearEpsDiluted == null
      ? 'EPS growth unavailable because matching prior-year quarter diluted EPS is missing'
      : ''
  });
  const grossMargin = raw.grossProfit != null && raw.revenue != null && raw.revenue !== 0 ? ((raw.grossProfit / Math.abs(raw.revenue)) * 100) : null;
  const grossReason = raw.grossProfit == null
    ? 'Gross margin unavailable because gross profit is missing and cannot be derived from revenue and cost of revenue'
    : (raw.revenue == null || raw.revenue === 0
      ? 'Gross margin unavailable because revenue is missing or zero'
      : '');
  assignMetric('grossMargin', grossMargin, {
    source: 'sec',
    asOfDate: (grossQ.latest && grossQ.latest.end) || (revenueQ.latest && revenueQ.latest.end),
    formulaPath: 'grossMarginPct = (grossProfit / revenue) * 100',
    rawValues: {
      grossProfitDirect: grossProfitDirectQuarter,
      grossProfitDerivedFromRevenueMinusCost: grossProfitFromCost,
      revenue: raw.revenue,
      costOfRevenue: raw.costOfRevenue
    },
    reasonIfUnavailable: grossReason
  });
  const freeCashFlow = raw.operatingCashFlow != null && raw.capex != null ? (raw.operatingCashFlow - Math.abs(raw.capex)) : null;
  assignMetric('freeCashFlow', freeCashFlow, {
    source: 'sec',
    asOfDate: ocfA.latest && ocfA.latest.end,
    formulaPath: 'freeCashFlow = operatingCashFlow - abs(capex)',
    rawValues: { operatingCashFlow: raw.operatingCashFlow, capex: raw.capex },
    reasonIfUnavailable: 'Free cash flow unavailable because operating cash flow or capex is missing'
  });
  const debtToEquity = raw.totalDebt != null && raw.shareholdersEquity != null && raw.shareholdersEquity !== 0 ? (raw.totalDebt / Math.abs(raw.shareholdersEquity)) : null;
  assignMetric('debtToEquity', debtToEquity, {
    source: 'sec',
    asOfDate: equityA.latest && equityA.latest.end,
    formulaPath: 'debtToEquity = totalDebt / shareholdersEquity',
    rawValues: { totalDebt: raw.totalDebt, shareholdersEquity: raw.shareholdersEquity },
    reasonIfUnavailable: 'Debt/Equity unavailable because debt or equity is missing'
  });
  const priorEquity = num(equityA.prior && equityA.prior.val);
  const avgEquity = raw.shareholdersEquity != null && priorEquity != null ? ((raw.shareholdersEquity + priorEquity) / 2) : raw.shareholdersEquity;
  const roe = trailingNetIncome != null && avgEquity != null && avgEquity !== 0 ? (trailingNetIncome / Math.abs(avgEquity)) : null;
  assignMetric('roe', roe, {
    source: 'sec',
    asOfDate: netIncomeA.latest && netIncomeA.latest.end,
    formulaPath: 'roe = trailingNetIncome / averageShareholdersEquity',
    rawValues: { trailingNetIncome, averageShareholdersEquity: avgEquity },
    reasonIfUnavailable: 'ROE unavailable because net income or average equity is missing'
  });
  const pe = (raw.price != null && trailingEps != null && trailingEps > 0) ? (raw.price / trailingEps) : null;
  assignMetric('pe', pe, {
    source: raw.price != null ? 'derived' : 'sec',
    asOfDate: epsQ.latest && epsQ.latest.end,
    formulaPath: 'pe = price / trailingDilutedEPS',
    rawValues: { price: raw.price, trailingDilutedEps: raw.trailingEps },
    reasonIfUnavailable: trailingEps != null && trailingEps <= 0
      ? 'negative or zero trailing EPS'
      : 'P/E unavailable because price or trailing EPS is missing'
  });
  const ps = (raw.marketCap != null && trailingRevenue != null && trailingRevenue > 0) ? (raw.marketCap / trailingRevenue) : null;
  assignMetric('ps', ps, {
    source: raw.marketCap != null ? 'derived' : 'sec',
    asOfDate: revenueQ.latest && revenueQ.latest.end,
    formulaPath: 'ps = marketCap / trailingRevenue',
    rawValues: { marketCap: raw.marketCap, trailingRevenue: raw.trailingRevenue },
    reasonIfUnavailable: 'P/S unavailable because market cap or trailing revenue is missing'
  });

  let piotroski = null;
  let piReason = '';
  if (netIncomeA.latest && netIncomeA.prior && ocfA.latest && totalAssetsA.latest && totalAssetsA.prior && currentAssetsA.latest && currentAssetsA.prior && currentLiabilitiesA.latest && currentLiabilitiesA.prior && revenueA.latest && revenueA.prior && equityA.latest && equityA.prior) {
    const roaNow = num(netIncomeA.latest.val) != null && num(totalAssetsA.latest.val) ? num(netIncomeA.latest.val) / Math.abs(num(totalAssetsA.latest.val)) : null;
    const roaPrev = num(netIncomeA.prior.val) != null && num(totalAssetsA.prior.val) ? num(netIncomeA.prior.val) / Math.abs(num(totalAssetsA.prior.val)) : null;
    const cfoNow = num(ocfA.latest.val);
    const leverageNow = raw.totalDebt != null && raw.totalAssets != null && raw.totalAssets !== 0 ? (raw.totalDebt / Math.abs(raw.totalAssets)) : null;
    const priorDebt = (num(debtLongA.prior && debtLongA.prior.val) != null || num(debtCurrentA.prior && debtCurrentA.prior.val) != null)
      ? (Number(num(debtLongA.prior && debtLongA.prior.val) || 0) + Number(num(debtCurrentA.prior && debtCurrentA.prior.val) || 0))
      : num(debtTotalA.prior && debtTotalA.prior.val);
    const priorAssets = num(totalAssetsA.prior && totalAssetsA.prior.val);
    const leveragePrev = priorDebt != null && priorAssets != null && priorAssets !== 0 ? (priorDebt / Math.abs(priorAssets)) : null;
    const currentRatioNow = raw.currentAssets != null && raw.currentLiabilities != null && raw.currentLiabilities !== 0 ? (raw.currentAssets / Math.abs(raw.currentLiabilities)) : null;
    const currentRatioPrev = num(currentAssetsA.prior && currentAssetsA.prior.val) != null && num(currentLiabilitiesA.prior && currentLiabilitiesA.prior.val) != null && num(currentLiabilitiesA.prior && currentLiabilitiesA.prior.val) !== 0
      ? (num(currentAssetsA.prior && currentAssetsA.prior.val) / Math.abs(num(currentLiabilitiesA.prior && currentLiabilitiesA.prior.val)))
      : null;
    const sharesNow = raw.sharesOutstanding;
    const sharesPrev = (() => {
      const prev = sharesEntries.find((entry) => {
        const fy = num(entry && entry.fy);
        const latestFy = num(sharesLatest && sharesLatest.fy);
        return fy != null && latestFy != null && fy === latestFy - 1;
      });
      return num(prev && prev.val);
    })();
    const grossMarginNow = grossMargin;
    const grossAnnualPair = secAnnualPair(grossProfitEntries);
    const grossMarginPrev = num(grossAnnualPair.prior && grossAnnualPair.prior.val) != null && num(revenueA.prior && revenueA.prior.val) != null && num(revenueA.prior && revenueA.prior.val) !== 0
      ? ((num(grossAnnualPair.prior && grossAnnualPair.prior.val) / Math.abs(num(revenueA.prior && revenueA.prior.val))) * 100)
      : null;
    const assetTurnoverNow = num(revenueA.latest && revenueA.latest.val) != null && raw.totalAssets != null && raw.totalAssets !== 0
      ? (num(revenueA.latest && revenueA.latest.val) / Math.abs(raw.totalAssets))
      : null;
    const assetTurnoverPrev = num(revenueA.prior && revenueA.prior.val) != null && priorAssets != null && priorAssets !== 0
      ? (num(revenueA.prior && revenueA.prior.val) / Math.abs(priorAssets))
      : null;
    const checks = [
      roaNow != null && roaNow > 0,
      cfoNow != null && cfoNow > 0,
      roaNow != null && roaPrev != null && roaNow > roaPrev,
      cfoNow != null && num(netIncomeA.latest && netIncomeA.latest.val) != null && cfoNow > num(netIncomeA.latest && netIncomeA.latest.val),
      leverageNow != null && leveragePrev != null && leverageNow < leveragePrev,
      currentRatioNow != null && currentRatioPrev != null && currentRatioNow > currentRatioPrev,
      sharesNow != null && sharesPrev != null && sharesNow <= sharesPrev,
      grossMarginNow != null && grossMarginPrev != null && grossMarginNow > grossMarginPrev,
      assetTurnoverNow != null && assetTurnoverPrev != null && assetTurnoverNow > assetTurnoverPrev
    ];
    piotroski = checks.reduce((acc, pass) => acc + (pass ? 1 : 0), 0);
  } else {
    piReason = 'Piotroski unavailable because prior-year statement inputs are incomplete';
  }
  assignMetric('piotroskiScore', piotroski, {
    source: 'sec',
    asOfDate: netIncomeA.latest && netIncomeA.latest.end,
    formulaPath: 'piotroskiScore = sum(9 binary accounting quality checks)',
    rawValues: { latestFiscalYear: netIncomeA.latest && netIncomeA.latest.fy, priorFiscalYear: netIncomeA.prior && netIncomeA.prior.fy },
    reasonIfUnavailable: piReason || 'Piotroski unavailable'
  });

  const workingCapital = raw.currentAssets != null && raw.currentLiabilities != null ? (raw.currentAssets - raw.currentLiabilities) : null;
  const marketValueEquity = raw.marketCap != null
    ? raw.marketCap
    : ((raw.price != null && raw.sharesOutstanding != null) ? (raw.price * raw.sharesOutstanding) : null);
  const sales = trailingRevenue != null ? trailingRevenue : raw.revenue;
  const altman = (
    workingCapital != null &&
    raw.totalAssets != null && raw.totalAssets !== 0 &&
    raw.retainedEarnings != null &&
    raw.ebit != null &&
    marketValueEquity != null &&
    raw.totalLiabilities != null && raw.totalLiabilities !== 0 &&
    sales != null
  )
    ? (
      1.2 * (workingCapital / raw.totalAssets) +
      1.4 * (raw.retainedEarnings / raw.totalAssets) +
      3.3 * (raw.ebit / raw.totalAssets) +
      0.6 * (marketValueEquity / raw.totalLiabilities) +
      1.0 * (sales / raw.totalAssets)
    )
    : null;
  assignMetric('altmanZScore', altman, {
    source: 'sec',
    asOfDate: totalAssetsA.latest && totalAssetsA.latest.end,
    formulaPath: '1.2*(WC/TA)+1.4*(RE/TA)+3.3*(EBIT/TA)+0.6*(MVE/TL)+1.0*(Sales/TA)',
    rawValues: {
      workingCapital,
      totalAssets: raw.totalAssets,
      retainedEarnings: raw.retainedEarnings,
      ebit: raw.ebit,
      marketValueEquity,
      totalLiabilities: raw.totalLiabilities,
      sales
    },
    reasonIfUnavailable: 'Altman Z unavailable because one or more required balance-sheet inputs are missing'
  });

  debugFa('sec-derived', String(symbol || '').toUpperCase(), {
    sourceSummary: `SEC EDGAR (${tickerRecord && tickerRecord.cik ? tickerRecord.cik : 'n/a'})`,
    revenueGrowthYoY: metricInfo.revenueGrowthYoY,
    grossMargin: metricInfo.grossMargin,
    pe: metricInfo.pe
  });

  return {
    symbol: String(symbol || '').trim().toUpperCase(),
    asOfDate: normalizeDateOnly(
      (revenueQ.latest && revenueQ.latest.end) ||
      (revenueA.latest && revenueA.latest.end) ||
      (epsQ.latest && epsQ.latest.end) ||
      Date.now()
    ),
    sourceSummary: `SEC EDGAR (${tickerRecord && tickerRecord.cik ? tickerRecord.cik : 'n/a'})`,
    raw,
    derived,
    availabilityReasons,
    metricInfo
  };
}

// Maps Finnhub metric payload into the ratios shape expected by stock panel builders.
function mapFinnhubMetricToRatios(metric, options) {
  const src = metric && typeof metric === 'object' ? metric : {};
  const opts = options && typeof options === 'object' ? options : {};
  const financialRows = Array.isArray(opts.financialRows) ? opts.financialRows : [];
  const latestFinancial = financialRows[0] || {};
  const prevFinancial = financialRows[1] || {};
  const profile = opts.profile && typeof opts.profile === 'object' ? opts.profile : {};
  const quote = opts.quote && typeof opts.quote === 'object' ? opts.quote : {};
  const out = {
    priceToEarningsRatioTTM: metricValue(src, ['peTTM', 'peNormalizedAnnual', 'peBasicExclExtraTTM']),
    priceToSalesRatioTTM: metricValue(src, ['psTTM', 'priceToSalesAnnual']),
    operatingProfitMarginTTM: metricValue(src, ['operatingMarginTTM', 'operatingMarginAnnual', 'netMarginTTM']),
    grossProfitMarginTTM: metricValue(src, ['grossMarginTTM', 'grossMarginAnnual']),
    debtToEquityRatioTTM: metricValue(src, ['totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual']),
    returnOnEquityTTM: metricValue(src, ['roeTTM', 'roeAnnual']),
    enterpriseValueOverEBITDATTM: metricValue(src, ['ev/ebitdaTTM', 'evToEbitdaTTM']),
    priceToFreeCashFlowsRatioTTM: metricValue(src, ['pfcfShareTTM', 'pfcfTTM', 'priceToFreeCashFlowsRatioTTM']),
    revenueGrowthTTMYoy: metricValue(src, ['revenueGrowthTTMYoy', 'revenueGrowthQuarterlyYoy', 'revenueGrowth3Y']),
    epsGrowthTTMYoy: metricValue(src, ['epsGrowthTTMYoy', 'epsGrowthQuarterlyYoy', 'epsGrowth5Y']),
    freeCashFlowTTM: metricValue(src, ['freeCashFlowTTM', 'fcfTTM'])
  };
  if (src && typeof src === 'object') {
    if (Object.prototype.hasOwnProperty.call(src, 'piotroskiScore')) out.piotroskiScore = src.piotroskiScore;
    if (Object.prototype.hasOwnProperty.call(src, 'altmanZScore')) out.altmanZScore = src.altmanZScore;
  }
  if (out.revenueGrowthTTMYoy == null) {
    out.revenueGrowthTTMYoy = FundamentalsEngine.pctGrowth(latestFinancial.revenue, prevFinancial.revenue);
  }
  if (out.epsGrowthTTMYoy == null) {
    out.epsGrowthTTMYoy = FundamentalsEngine.pctGrowth(latestFinancial.epsdiluted, prevFinancial.epsdiluted);
  }
  if (out.operatingProfitMarginTTM == null && latestFinancial.revenue != null && latestFinancial.revenue !== 0 && latestFinancial.operatingIncome != null) {
    out.operatingProfitMarginTTM = latestFinancial.operatingIncome / Math.abs(latestFinancial.revenue);
  }
  if (out.freeCashFlowTTM == null && latestFinancial.freeCashFlow != null) {
    out.freeCashFlowTTM = latestFinancial.freeCashFlow;
  }
  if (out.debtToEquityRatioTTM == null && latestFinancial.totalDebt != null && latestFinancial.totalEquity != null && latestFinancial.totalEquity !== 0) {
    out.debtToEquityRatioTTM = latestFinancial.totalDebt / Math.abs(latestFinancial.totalEquity);
  }
  const currentPrice = num(quote.c != null ? quote.c : quote.currentPrice);
  const epsTtm = metricValue(src, ['epsTTM', 'epsBasicExclExtraItemsTTM']);
  if (out.priceToEarningsRatioTTM == null && currentPrice != null && epsTtm != null && epsTtm !== 0) {
    out.priceToEarningsRatioTTM = currentPrice / epsTtm;
  }
  let marketCap = num(profile.marketCapitalization != null ? profile.marketCapitalization : metricValue(src, ['marketCapitalization', 'marketCapitalizationTTM']));
  const revenueMetric = metricValue(src, ['revenueTTM']);
  const revenueTtm = revenueMetric != null ? revenueMetric : latestFinancial.revenue;
  if (marketCap != null && revenueTtm != null && revenueTtm !== 0) {
    if (Math.abs(marketCap) < 1e7 && Math.abs(revenueTtm) > 1e8) {
      marketCap = marketCap * 1e6;
    }
    if (out.priceToSalesRatioTTM == null) {
      out.priceToSalesRatioTTM = marketCap / revenueTtm;
    }
  }
  return out;
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
      if (nextDate) return {
        nextEarningsDate: nextDate,
        endpoint: path,
        provider: 'fmp',
        error: '',
        reason: '',
        rawSample: JSON.stringify(payload || {}).slice(0, 420)
      };
      lastErr = 'no_upcoming_earnings_date';
      debugFa('earnings-provider', safeSymbol, {
        provider: 'fmp',
        endpoint: path,
        nextEarningsDate: '',
        reason: 'no future earnings date returned by provider',
        rawSample: JSON.stringify(payload || {}).slice(0, 420)
      });
    } catch (err) {
      lastErr = String(err && err.message || '').trim() || 'earnings_lookup_failed';
    }
  }
  return {
    nextEarningsDate: '',
    endpoint: candidatePaths[candidatePaths.length - 1],
    provider: 'fmp',
    error: lastErr || 'earnings_lookup_failed',
    reason: 'no future earnings date returned by provider',
    rawSample: ''
  };
}

// Fetches nearest upcoming earnings date from Finnhub calendar endpoints.
async function fetchNextEarningsDateFromFinnhub(symbol, apiKey, userAgent, nowMs) {
  const safeSymbol = String(symbol || '').trim().toUpperCase();
  if (!safeSymbol) return { nextEarningsDate: '', endpoint: '', provider: 'finnhub', error: 'missing_symbol', reason: 'missing symbol', rawSample: '' };
  const today = todayDateOnly(nowMs);
  const from = plusDaysDateOnly(0, nowMs);
  const to = plusDaysDateOnly(365, nowMs);
  const candidatePaths = [
    `/calendar/earnings?symbol=${encodeURIComponent(safeSymbol)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    `/calendar/earnings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&symbol=${encodeURIComponent(safeSymbol)}`
  ];
  let lastErr = '';
  for (let i = 0; i < candidatePaths.length; i += 1) {
    const path = candidatePaths[i];
    try {
      const payload = await fetchFinnhubJson(path, apiKey, userAgent);
      const nextDate = getNextUpcomingEarningsDateFromApiResponse(payload, safeSymbol, today);
      if (nextDate) {
        return {
          nextEarningsDate: nextDate,
          endpoint: path,
          provider: 'finnhub',
          error: '',
          reason: '',
          rawSample: JSON.stringify(payload || {}).slice(0, 420)
        };
      }
      lastErr = 'no_upcoming_earnings_date';
      debugFa('earnings-provider', safeSymbol, {
        provider: 'finnhub',
        endpoint: path,
        nextEarningsDate: '',
        reason: 'no future earnings date returned by provider',
        rawSample: JSON.stringify(payload || {}).slice(0, 420)
      });
    } catch (err) {
      lastErr = String(err && err.message || '').trim() || 'earnings_lookup_failed';
    }
  }
  return {
    nextEarningsDate: '',
    endpoint: candidatePaths[candidatePaths.length - 1],
    provider: 'finnhub',
    error: lastErr || 'earnings_lookup_failed',
    reason: 'no future earnings date returned by provider',
    rawSample: ''
  };
}

// Resolves next earnings using provider priority with explicit fallback and reason semantics.
async function fetchNextEarningsDate(symbol, fmpApiKey, finnhubApiKey, userAgent, nowMs) {
  const traces = [];
  if (fmpApiKey) {
    const fmpResult = await fetchNextEarningsDateFromFmp(symbol, fmpApiKey, userAgent, nowMs);
    traces.push(fmpResult);
    debugFa('earnings-provider', String(symbol || '').toUpperCase(), fmpResult);
    if (fmpResult.nextEarningsDate) return Object.assign({ traces }, fmpResult);
  }
  if (finnhubApiKey) {
    const finnhubResult = await fetchNextEarningsDateFromFinnhub(symbol, finnhubApiKey, userAgent, nowMs);
    traces.push(finnhubResult);
    debugFa('earnings-provider', String(symbol || '').toUpperCase(), finnhubResult);
    if (finnhubResult.nextEarningsDate) return Object.assign({ traces }, finnhubResult);
  }
  const noProvider = !fmpApiKey && !finnhubApiKey;
  return {
    nextEarningsDate: '',
    endpoint: traces.length ? traces[traces.length - 1].endpoint : '',
    provider: traces.length ? traces[traces.length - 1].provider : '',
    error: noProvider ? 'earnings_provider_unavailable' : (traces.find((x) => x && x.error) || {}).error || 'earnings_lookup_failed',
    reason: noProvider ? 'earnings provider unavailable' : 'no future earnings date returned by provider',
    rawSample: traces.length ? String(traces[traces.length - 1].rawSample || '') : '',
    traces
  };
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
function buildStockPanel(symbol, components, warnings, earningsMeta, earningsState, nowMs, secNormalized) {
  const profile = firstObjectRow(components.profile && components.profile.data) || {};
  const incomeRows = Array.isArray(components.income && components.income.data) ? components.income.data : [];
  const cashRows = Array.isArray(components.cashflow && components.cashflow.data) ? components.cashflow.data : [];
  const ratios = firstObjectRow(components.ratios && components.ratios.data) || {};
  const scores = firstObjectRow(components.scores && components.scores.data) || {};
  const latestIncome = incomeRows[0] || {};
  const prevIncome = incomeRows[1] || {};
  const latestCash = cashRows[0] || {};

  const revenueGrowthYoYFromStatements = FundamentalsEngine.pctGrowth(latestIncome.revenue, prevIncome.revenue);
  const revenueGrowthYoYFromRatios = asPercent(
    ratios.revenueGrowthTTMYoy != null ? ratios.revenueGrowthTTMYoy
      : (ratios.revenueGrowthQuarterlyYoy != null ? ratios.revenueGrowthQuarterlyYoy : ratios.revenueGrowth3Y)
  );
  const revenueGrowthYoY = revenueGrowthYoYFromStatements != null ? revenueGrowthYoYFromStatements : revenueGrowthYoYFromRatios;
  const epsGrowthYoYFromStatements = FundamentalsEngine.pctGrowth(
    latestIncome.epsdiluted != null ? latestIncome.epsdiluted : latestIncome.eps,
    prevIncome.epsdiluted != null ? prevIncome.epsdiluted : prevIncome.eps
  );
  const epsGrowthYoYFromRatios = asPercent(
    ratios.epsGrowthTTMYoy != null ? ratios.epsGrowthTTMYoy
      : (ratios.epsGrowthQuarterlyYoy != null ? ratios.epsGrowthQuarterlyYoy : ratios.epsGrowth5Y)
  );
  const epsGrowthYoY = epsGrowthYoYFromStatements != null ? epsGrowthYoYFromStatements : epsGrowthYoYFromRatios;
  const operatingMarginPct = asPercent(ratios.operatingProfitMarginTTM != null ? ratios.operatingProfitMarginTTM : ratios.operatingMarginTTM);
  const grossMarginPct = asPercent(ratios.grossProfitMarginTTM != null ? ratios.grossProfitMarginTTM : ratios.grossMarginTTM);
  const marginPct = operatingMarginPct != null ? operatingMarginPct : grossMarginPct;
  const marginLabel = operatingMarginPct != null ? 'Operating Margin' : 'Gross Margin';
  const freeCashFlow = num(
    latestCash.freeCashFlow != null ? latestCash.freeCashFlow
      : (latestCash.freeCashflow != null ? latestCash.freeCashflow : ratios.freeCashFlowTTM)
  );
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
  const piotroskiScore = num(scores.piotroskiScore != null ? scores.piotroskiScore : ratios.piotroskiScore);
  const altmanZScore = num(scores.altmanZScore != null ? scores.altmanZScore : ratios.altmanZScore);

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

  const secMeta = secNormalized && typeof secNormalized === 'object' ? secNormalized : null;
  const secMetricInfo = secMeta && secMeta.metricInfo && typeof secMeta.metricInfo === 'object' ? secMeta.metricInfo : {};
  const secReasons = secMeta && secMeta.availabilityReasons && typeof secMeta.availabilityReasons === 'object'
    ? secMeta.availabilityReasons
    : {};
  const ratioSources = ratios && ratios.__sources && typeof ratios.__sources === 'object' ? ratios.__sources : {};
  const ratioSource = String(components.ratios && components.ratios.source || '').trim() || 'fmp';
  const incomeSource = String(components.income && components.income.source || '').trim() || ratioSource;
  const cashflowSource = String(components.cashflow && components.cashflow.source || '').trim() || ratioSource;
  const scoreSource = String(components.scores && components.scores.source || '').trim() || ratioSource;
  const peTrailingEps = num(
    ratios.epsTTM != null ? ratios.epsTTM
      : (ratios.epsBasicExclExtraItemsTTM != null ? ratios.epsBasicExclExtraItemsTTM
        : (secMeta && secMeta.raw ? secMeta.raw.trailingEps : null))
  );
  const peFallbackReason = peTrailingEps != null && peTrailingEps <= 0
    ? 'negative or zero trailing EPS'
    : 'P/E unavailable because price or trailing EPS is missing';
  function metricMeta(metricKey, sourceCandidate, asOfDateCandidate, fallbackReason) {
    const secInfo = secMetricInfo[metricKey] && typeof secMetricInfo[metricKey] === 'object'
      ? secMetricInfo[metricKey]
      : null;
    return {
      source: String((secInfo && secInfo.source) || sourceCandidate || '').trim(),
      asOfDate: normalizeDateOnly((secInfo && secInfo.asOfDate) || asOfDateCandidate),
      reasonIfUnavailable: String(
        (secInfo && secInfo.reasonIfUnavailable) ||
        secReasons[metricKey] ||
        fallbackReason ||
        ''
      ).trim()
    };
  }

  const qualityMetrics = [
    metricItem('revenue-growth-yoy', 'Revenue Growth YoY', revenueGrowthYoY, fmtPct(revenueGrowthYoY, 2), revenueGrowthYoY == null ? 'Neutral' : (revenueGrowthYoY > 10 ? 'Bullish' : (revenueGrowthYoY <= 0 ? 'Risk' : 'Neutral')), '>10% preferred', metricMeta('revenueGrowthYoY', incomeSource, latestIncome.date || null, 'Revenue growth unavailable')),
    metricItem('eps-growth-yoy', 'EPS Growth YoY', epsGrowthYoY, fmtPct(epsGrowthYoY, 2), epsGrowthYoY == null ? 'Neutral' : (epsGrowthYoY > 10 ? 'Bullish' : (epsGrowthYoY <= 0 ? 'Risk' : 'Neutral')), '>10% preferred', metricMeta('epsGrowthYoY', incomeSource, latestIncome.date || null, 'EPS growth unavailable')),
    metricItem('margin', marginLabel, marginPct, fmtPct(marginPct, 2), marginPct == null ? 'Neutral' : (marginPct > 10 ? 'Bullish' : (marginPct < 0 ? 'Risk' : 'Neutral')), 'Higher is better', metricMeta('grossMargin', ratioSources.grossProfitMarginTTM || ratioSource, latestIncome.date || null, 'Margin unavailable')),
    metricItem('free-cash-flow', 'Free Cash Flow', freeCashFlow, fmtCompactCurrency(freeCashFlow), freeCashFlow == null ? 'Neutral' : (freeCashFlow > 0 ? 'Healthy' : 'Risk'), 'Positive is preferred', metricMeta('freeCashFlow', ratioSources.freeCashFlowTTM || cashflowSource, latestCash.date || null, 'Free cash flow unavailable')),
    metricItem('debt-equity', 'Debt / Equity', debtToEquity, fmtRatio(debtToEquity, 2), debtToEquity == null ? 'Neutral' : (debtToEquity < 1 ? 'Healthy' : (debtToEquity > 2 ? 'Risk' : 'Neutral')), '<1.0 preferred', metricMeta('debtToEquity', ratioSources.debtToEquityRatioTTM || ratioSource, '', 'Debt/Equity unavailable')),
    metricItem('roe', 'ROE', roePct, fmtPct(roePct, 2), roePct == null ? 'Neutral' : (roePct > 10 ? 'Healthy' : (roePct < 0 ? 'Risk' : 'Neutral')), '>10% preferred', metricMeta('roe', ratioSources.returnOnEquityTTM || ratioSource, '', 'ROE unavailable')),
    metricItem('piotroski', 'Piotroski Score', piotroskiScore, fmtRatio(piotroskiScore, 1), piotroskiScore == null ? 'Neutral' : (piotroskiScore >= 7 ? 'Healthy' : (piotroskiScore <= 3 ? 'Risk' : 'Neutral')), '>=7 is strong', metricMeta('piotroskiScore', scoreSource, '', 'Piotroski unavailable')),
    metricItem('altman-z', 'Altman Z-Score', altmanZScore, fmtRatio(altmanZScore, 2), altmanZScore == null ? 'Neutral' : (altmanZScore > 3 ? 'Healthy' : (altmanZScore < 1.8 ? 'Risk' : 'Neutral')), '>3 preferred', metricMeta('altmanZScore', scoreSource, '', 'Altman Z unavailable'))
  ];

  const valuationMetrics = [
    metricItem('pe', 'P/E', pe, fmtRatio(pe, 2), valuationResult.metrics.pe.label, '20-40 is often a fair range', metricMeta('pe', ratioSources.priceToEarningsRatioTTM || ratioSource, '', peFallbackReason)),
    metricItem('ps', 'P/S', ps, fmtRatio(ps, 2), valuationResult.metrics.ps.label, '3-10 is often a fair range', metricMeta('ps', ratioSources.priceToSalesRatioTTM || ratioSource, '', 'P/S unavailable'))
  ];
  if (evEbitda != null) {
    valuationMetrics.push(metricItem('ev-ebitda', 'EV/EBITDA', evEbitda, fmtRatio(evEbitda, 2), valuationResult.metrics.evEbitda.label, '12-25 is often a fair range', metricMeta('evEbitda', ratioSource, '', 'EV/EBITDA unavailable')));
  }
  if (priceToFcf != null) {
    valuationMetrics.push(metricItem('price-to-fcf', 'P/FCF', priceToFcf, fmtRatio(priceToFcf, 2), valuationResult.metrics.priceToFcf.label, '15-30 is often a fair range', metricMeta('priceToFcf', ratioSource, '', 'P/FCF unavailable')));
  }

  const metricDebug = {};
  qualityMetrics.concat(valuationMetrics).forEach((metric) => {
    const secInfo = secMetricInfo[
      metric.id === 'revenue-growth-yoy' ? 'revenueGrowthYoY'
        : (metric.id === 'margin' ? 'grossMargin'
          : (metric.id === 'pe' ? 'pe' : ''))
    ] || null;
    metricDebug[metric.id] = {
      source: String(metric.source || ''),
      asOfDate: normalizeDateOnly(metric.asOfDate),
      reasonIfUnavailable: String(metric.reasonIfUnavailable || ''),
      formulaPath: String(secInfo && secInfo.formulaPath || ''),
      rawValues: secInfo && secInfo.rawValues ? secInfo.rawValues : {}
    };
  });

  const companyName = String(profile.companyName || profile.name || symbol || '').trim() || symbol;
  const qualityReasons = qualityResult.reasons.filter((x) => x && x.toLowerCase().indexOf('unavailable') < 0).slice(0, 7);
  const valuationReasons = valuationResult.reasons.slice(0, 7);
  const mergedReasons = qualityReasons.concat(valuationReasons).slice(0, 10);
  const scoreOutOf = Number(qualityResult.availableMetrics || 0);
  const valuationSummaryText = buildStockValuationSummary(valuationResult);
  const earningsInfo = describeEarningsDate(earningsMeta && earningsMeta.nextEarningsDate, nowMs);
  const earningsDateDisplay = earningsInfo.date || '';
  const earningsRelativeDisplay = earningsInfo.relative || 'Unavailable';
  const earningsStateText = String(earningsState || '').trim();
  const nextEarningsReason = String(earningsMeta && earningsMeta.nextEarningsUnavailableReason || '').trim();
  const nextEarningsProvider = String(earningsMeta && earningsMeta.nextEarningsProvider || '').trim();
  debugFa('metric-trace', symbol, {
    revenueGrowthYoY: metricDebug['revenue-growth-yoy'] || {},
    grossMargin: metricDebug.margin || {},
    pe: metricDebug.pe || {},
    nextEarnings: {
      source: nextEarningsProvider || String(earningsMeta && earningsMeta.lastEarningsRefreshReason || ''),
      rawValues: { nextEarningsDate: earningsDateDisplay, relative: earningsRelativeDisplay },
      formulaPath: 'provider calendar lookup (FMP primary, Finnhub fallback)',
      reasonIfUnavailable: nextEarningsReason
    }
  });
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
    metricSources: metricDebug,
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
    nextEarningsReason,
    nextEarningsProvider,
    earningsState: earningsStateText,
    earningsDateLastCheckedAt: Number(earningsMeta && earningsMeta.earningsDateLastCheckedAt || 0) || 0,
    lastPostEarningsRefreshAt: Number(earningsMeta && earningsMeta.lastPostEarningsRefreshAt || 0) || 0,
    lastEarningsRefreshReason: String(earningsMeta && earningsMeta.lastEarningsRefreshReason || '').trim(),
    normalized: secMeta ? {
      symbol: secMeta.symbol,
      asOfDate: secMeta.asOfDate,
      sourceSummary: secMeta.sourceSummary,
      raw: secMeta.raw || {},
      derived: secMeta.derived || {},
      availabilityReasons: secMeta.availabilityReasons || {}
    } : null,
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
  const marketCapMeta = FundamentalsEngine.interpretCryptoMarketCap(marketCap);
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
    metricItem('market-cap', 'Market Cap', marketCap, fmtCompactCurrency(marketCap), marketCapMeta.status, 'CoinGecko market cap • ' + marketCapMeta.band),
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
  const fallbackFetcher = typeof opts.fallbackFetcher === 'function' ? opts.fallbackFetcher : null;
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
    if (fallbackFetcher) {
      try {
        const fallbackPayload = await fallbackFetcher(err);
        const wrapped = fallbackPayload && typeof fallbackPayload === 'object' && Object.prototype.hasOwnProperty.call(fallbackPayload, '__provider')
          ? fallbackPayload
          : null;
        const fallbackData = wrapped ? wrapped.data : fallbackPayload;
        const fallbackProvider = String((wrapped && wrapped.__provider) || 'fallback').trim().toLowerCase();
        if (fallbackData != null) {
          const next = componentPayload(fallbackProvider || 'fallback', fallbackData);
          const providerLabel = fallbackProvider === 'sec' ? 'SEC fallback' : (fallbackProvider === 'finnhub' ? 'Finnhub fallback' : 'fallback');
          warnings.push(`Using ${providerLabel} for ${name}.`);
          componentMeta[name] = {
            fetched: true,
            fromCache: false,
            fetchedAt: next.fetchedAt,
            forced,
            forceReason,
            fallback: true,
            fallbackFrom: errMsg
          };
          return { component: next, usedCache: false, fetchedFresh: true };
        }
      } catch (fallbackErr) {
        const fallbackErrMsg = String(fallbackErr && fallbackErr.message || '').trim().slice(0, 120);
        if (fallbackErrMsg) {
          warnings.push(`Finnhub fallback for ${name} failed (${fallbackErrMsg}).`);
        }
      }
    }
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

// Writes a value only when current target slot is null/undefined/empty.
function assignIfMissing(target, key, value) {
  if (!target || typeof target !== 'object') return;
  if (value == null) return;
  if (target[key] == null || target[key] === '') target[key] = value;
}

// Applies SEC-derived accounting and ratio values onto existing component payloads without overriding FMP values.
function mergeSecIntoStockComponents(components, secNormalized) {
  if (!components || typeof components !== 'object') return false;
  const sec = secNormalized && typeof secNormalized === 'object' ? secNormalized : null;
  if (!sec) return false;
  let changed = false;
  const raw = sec.raw && typeof sec.raw === 'object' ? sec.raw : {};
  const derived = sec.derived && typeof sec.derived === 'object' ? sec.derived : {};
  const metricInfo = sec.metricInfo && typeof sec.metricInfo === 'object' ? sec.metricInfo : {};

  const ensureComponent = (name, seed) => {
    if (!components[name] || typeof components[name] !== 'object') {
      components[name] = componentPayload('sec', seed);
      changed = true;
    }
    if (components[name].data == null) {
      components[name].data = seed;
      changed = true;
    }
    return components[name];
  };

  const incomeSeed = [];
  if (raw.revenue != null || raw.epsDiluted != null) {
    incomeSeed.push({ date: sec.asOfDate || null, revenue: raw.revenue, epsdiluted: raw.epsDiluted });
  }
  if (raw.priorYearRevenue != null || raw.priorYearEpsDiluted != null) {
    incomeSeed.push({ date: null, revenue: raw.priorYearRevenue, epsdiluted: raw.priorYearEpsDiluted });
  }
  if (incomeSeed.length) {
    const incomeComponent = ensureComponent('income', []);
    const incomeRows = Array.isArray(incomeComponent.data) ? incomeComponent.data : [];
    if (!incomeRows.length) {
      incomeComponent.data = incomeSeed;
      changed = true;
    } else {
      assignIfMissing(incomeRows[0], 'revenue', incomeSeed[0].revenue);
      assignIfMissing(incomeRows[0], 'epsdiluted', incomeSeed[0].epsdiluted);
      if (incomeSeed[1]) {
        if (!incomeRows[1]) {
          incomeRows[1] = {};
          changed = true;
        }
        assignIfMissing(incomeRows[1], 'revenue', incomeSeed[1].revenue);
        assignIfMissing(incomeRows[1], 'epsdiluted', incomeSeed[1].epsdiluted);
      }
      incomeComponent.data = incomeRows;
    }
  }

  if (derived.freeCashFlow != null || raw.operatingCashFlow != null || raw.capex != null) {
    const cashflowComponent = ensureComponent('cashflow', []);
    const cashRows = Array.isArray(cashflowComponent.data) ? cashflowComponent.data : [];
    if (!cashRows.length) {
      cashflowComponent.data = [{ date: sec.asOfDate || null, freeCashFlow: derived.freeCashFlow }];
      changed = true;
    } else {
      assignIfMissing(cashRows[0], 'freeCashFlow', derived.freeCashFlow);
      cashflowComponent.data = cashRows;
    }
  }

  const ratiosComponent = ensureComponent('ratios', {});
  const ratios = firstObjectRow(ratiosComponent.data) || {};
  if (!ratios.__sources || typeof ratios.__sources !== 'object') ratios.__sources = {};
  const secRatioMap = {
    revenueGrowthTTMYoy: 'revenueGrowthYoY',
    epsGrowthTTMYoy: 'epsGrowthYoY',
    grossProfitMarginTTM: 'grossMargin',
    freeCashFlowTTM: 'freeCashFlow',
    debtToEquityRatioTTM: 'debtToEquity',
    returnOnEquityTTM: 'roe',
    priceToEarningsRatioTTM: 'pe',
    priceToSalesRatioTTM: 'ps'
  };
  Object.keys(secRatioMap).forEach((ratioKey) => {
    const metricKey = secRatioMap[ratioKey];
    const value = num(derived[metricKey]);
    if (value == null) return;
    if (ratios[ratioKey] == null || ratios[ratioKey] === '') {
      ratios[ratioKey] = value;
      ratios.__sources[ratioKey] = metricInfo[metricKey] && metricInfo[metricKey].source ? metricInfo[metricKey].source : 'sec';
      changed = true;
    }
  });
  if (ratios.__sources) ratiosComponent.data = ratios;

  const scoresComponent = ensureComponent('scores', {});
  const scores = firstObjectRow(scoresComponent.data) || {};
  if (scores.piotroskiScore == null && derived.piotroskiScore != null) {
    scores.piotroskiScore = derived.piotroskiScore;
    changed = true;
  }
  if (scores.altmanZScore == null && derived.altmanZScore != null) {
    scores.altmanZScore = derived.altmanZScore;
    changed = true;
  }
  scoresComponent.data = scores;
  return changed;
}

// Returns the list of key stock fundamentals metrics still missing from component payloads.
function missingStockMetricKeys(components) {
  const src = components && typeof components === 'object' ? components : {};
  const incomeRows = Array.isArray(src.income && src.income.data) ? src.income.data : [];
  const cashRows = Array.isArray(src.cashflow && src.cashflow.data) ? src.cashflow.data : [];
  const ratios = firstObjectRow(src.ratios && src.ratios.data) || {};
  const scores = firstObjectRow(src.scores && src.scores.data) || {};
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
  const freeCashFlow = num(
    latestCash.freeCashFlow != null ? latestCash.freeCashFlow
      : (latestCash.freeCashflow != null ? latestCash.freeCashflow : ratios.freeCashFlowTTM)
  );
  const debtToEquity = num(
    ratios.debtToEquityRatioTTM != null ? ratios.debtToEquityRatioTTM
      : (ratios.debtEquityRatioTTM != null ? ratios.debtEquityRatioTTM : ratios.debtToEquity)
  );
  const roePct = asPercent(num(
    ratios.returnOnEquityTTM != null ? ratios.returnOnEquityTTM
      : (ratios.returnOnEquity != null ? ratios.returnOnEquity : ratios.roe)
  ));
  const pe = num(
    ratios.priceToEarningsRatioTTM != null ? ratios.priceToEarningsRatioTTM
      : (ratios.priceEarningsRatioTTM != null ? ratios.priceEarningsRatioTTM
        : (ratios.peRatioTTM != null ? ratios.peRatioTTM : ratios.pe))
  );
  const ps = num(ratios.priceToSalesRatioTTM != null ? ratios.priceToSalesRatioTTM : (ratios.psRatioTTM != null ? ratios.psRatioTTM : ratios.priceToSalesRatio));
  const piotroski = num(scores.piotroskiScore != null ? scores.piotroskiScore : ratios.piotroskiScore);
  const altman = num(scores.altmanZScore != null ? scores.altmanZScore : ratios.altmanZScore);
  const missing = [];
  if (revenueGrowthYoY == null) missing.push('revenueGrowthYoY');
  if (epsGrowthYoY == null) missing.push('epsGrowthYoY');
  if (operatingMarginPct == null && grossMarginPct == null) missing.push('grossMargin');
  if (freeCashFlow == null) missing.push('freeCashFlow');
  if (debtToEquity == null) missing.push('debtToEquity');
  if (roePct == null) missing.push('roe');
  if (pe == null) missing.push('pe');
  if (ps == null) missing.push('ps');
  if (piotroski == null) missing.push('piotroskiScore');
  if (altman == null) missing.push('altmanZScore');
  return missing;
}

// Creates the injectable fundamentals service used by server routes.
function createFundamentalsService(options) {
  const opts = options || {};
  const runDb = opts.runDb;
  const fmpApiKey = String(opts.fmpApiKey || '').trim();
  const finnhubApiKey = String(opts.finnhubApiKey || '').trim();
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
      lastEarningsRefreshReason: String(previousEarningsMeta.lastEarningsRefreshReason || '').trim(),
      nextEarningsUnavailableReason: String(previousEarningsMeta.nextEarningsUnavailableReason || '').trim(),
      nextEarningsProvider: String(previousEarningsMeta.nextEarningsProvider || '').trim()
    };
    const warnings = [];
    const componentMeta = {};
    let usedCache = false;
    let fetchedFresh = false;
    let earningsMetaChanged = false;
    let earningsEndpointUsed = '';
    let earningsProviderUsed = '';
    let earningsRawSample = '';
    let earningsLookupError = '';
    let earningsState = '';

    if (!fmpApiKey && !finnhubApiKey && !Object.keys(oldComponents).length) {
      const err = new Error('stock_fundamentals_keys_missing');
      err.statusCode = 500;
      throw err;
    }

    let finnhubBundlePromise = null;
    async function getFinnhubBundle() {
      if (finnhubBundlePromise) return finnhubBundlePromise;
      if (!finnhubApiKey) {
        const err = new Error('finnhub_key_missing');
        err.statusCode = 500;
        throw err;
      }
      finnhubBundlePromise = (async () => {
        const profilePayload = await fetchFinnhubJson(`/stock/profile2?symbol=${encodeURIComponent(safeSymbol)}`, finnhubApiKey, userAgent).catch(() => null);
        const metricPayload = await fetchFinnhubJson(`/stock/metric?symbol=${encodeURIComponent(safeSymbol)}&metric=all`, finnhubApiKey, userAgent).catch(() => null);
        const quotePayload = await fetchFinnhubJson(`/quote?symbol=${encodeURIComponent(safeSymbol)}`, finnhubApiKey, userAgent).catch(() => null);
        const financialsPayload = await fetchFinnhubJson(`/stock/financials-reported?symbol=${encodeURIComponent(safeSymbol)}&freq=annual`, finnhubApiKey, userAgent).catch(() => null);
        const profileData = profilePayload && typeof profilePayload === 'object' ? profilePayload : null;
        const metricData = metricPayload && typeof metricPayload === 'object'
          ? (metricPayload.metric && typeof metricPayload.metric === 'object' ? metricPayload.metric : metricPayload)
          : null;
        const quoteData = quotePayload && typeof quotePayload === 'object' ? quotePayload : null;
        const financialRows = parseFinnhubFinancialRows(financialsPayload);
        const hasProfile = !!(profileData && Object.keys(profileData).length);
        const hasMetric = !!(metricData && Object.keys(metricData).length);
        const hasQuote = !!(quoteData && Object.keys(quoteData).length);
        const hasFinancials = financialRows.length > 0;
        if (!hasProfile && !hasMetric && !hasQuote && !hasFinancials) {
          const err = new Error('finnhub_empty_payload');
          err.statusCode = 502;
          throw err;
        }
        return {
          profile: profileData || {},
          metric: metricData || {},
          quote: quoteData || {},
          financialRows
        };
      })();
      return finnhubBundlePromise;
    }

    let secRawBundlePromise = null;
    async function getSecRawBundle() {
      if (!isLikelyUsStockSymbol(safeSymbol)) return null;
      if (secRawBundlePromise) return secRawBundlePromise;
      secRawBundlePromise = (async () => {
        const tickerMap = await getSecTickerMap(userAgent).catch(() => null);
        const tickerRecord = tickerMap && tickerMap.get(safeSymbol) ? tickerMap.get(safeSymbol) : null;
        if (!tickerRecord || !tickerRecord.cik) return null;
        const factsUrl = `${SEC_DATA_BASE_URL}/api/xbrl/companyfacts/CIK${tickerRecord.cik}.json`;
        const companyFacts = await fetchSecJson(factsUrl, userAgent).catch(() => null);
        if (!companyFacts || typeof companyFacts !== 'object') return null;
        return { tickerRecord, companyFacts };
      })();
      return secRawBundlePromise;
    }

    function secMarketContext() {
      const profileData = firstObjectRow(
        (nextComponents.profile && nextComponents.profile.data) ||
        (oldComponents.profile && oldComponents.profile.data)
      ) || {};
      const ratiosData = firstObjectRow(
        (nextComponents.ratios && nextComponents.ratios.data) ||
        (oldComponents.ratios && oldComponents.ratios.data)
      ) || {};
      const marketCap = num(
        profileData.mktCap != null ? profileData.mktCap
          : (profileData.marketCap != null ? profileData.marketCap
            : (profileData.marketCapitalization != null ? profileData.marketCapitalization : ratiosData.marketCap))
      );
      const price = num(
        profileData.price != null ? profileData.price
          : (profileData.priceLast != null ? profileData.priceLast : ratiosData.price)
      );
      return {
        marketCap,
        price,
        nextEarningsDate: earningsMeta.nextEarningsDate
      };
    }

    async function getSecNormalizedBundle() {
      const rawBundle = await getSecRawBundle();
      if (!rawBundle) return null;
      return buildSecNormalizedFundamentals(
        safeSymbol,
        rawBundle.tickerRecord,
        rawBundle.companyFacts,
        secMarketContext()
      );
    }

    async function secFallbackComponent(name) {
      const normalized = await getSecNormalizedBundle();
      if (!normalized) return null;
      const raw = normalized.raw && typeof normalized.raw === 'object' ? normalized.raw : {};
      const derived = normalized.derived && typeof normalized.derived === 'object' ? normalized.derived : {};
      if (name === 'profile') {
        const rawBundle = await getSecRawBundle();
        if (!rawBundle || !rawBundle.tickerRecord) return null;
        const title = String(rawBundle.tickerRecord.title || safeSymbol).trim();
        return {
          companyName: title,
          name: title,
          symbol: safeSymbol,
          exchangeShortName: 'SEC'
        };
      }
      if (name === 'income') {
        const rows = [];
        if (raw.revenue != null || raw.epsDiluted != null) {
          rows.push({ date: normalized.asOfDate || null, revenue: raw.revenue, epsdiluted: raw.epsDiluted });
        }
        if (raw.priorYearRevenue != null || raw.priorYearEpsDiluted != null) {
          rows.push({ date: null, revenue: raw.priorYearRevenue, epsdiluted: raw.priorYearEpsDiluted });
        }
        return rows;
      }
      if (name === 'cashflow') {
        if (derived.freeCashFlow == null) return [];
        return [{ date: normalized.asOfDate || null, freeCashFlow: derived.freeCashFlow }];
      }
      if (name === 'ratios') {
        const ratios = {
          revenueGrowthTTMYoy: num(derived.revenueGrowthYoY),
          epsGrowthTTMYoy: num(derived.epsGrowthYoY),
          grossProfitMarginTTM: num(derived.grossMargin),
          freeCashFlowTTM: num(derived.freeCashFlow),
          debtToEquityRatioTTM: num(derived.debtToEquity),
          returnOnEquityTTM: num(derived.roe),
          priceToEarningsRatioTTM: num(derived.pe),
          priceToSalesRatioTTM: num(derived.ps),
          __sources: {
            revenueGrowthTTMYoy: 'sec',
            epsGrowthTTMYoy: 'sec',
            grossProfitMarginTTM: 'sec',
            freeCashFlowTTM: 'sec',
            debtToEquityRatioTTM: 'sec',
            returnOnEquityTTM: 'sec',
            priceToEarningsRatioTTM: 'sec',
            priceToSalesRatioTTM: 'sec'
          }
        };
        return ratios;
      }
      if (name === 'scores') {
        const piotroskiScore = num(derived.piotroskiScore);
        const altmanZScore = num(derived.altmanZScore);
        if (piotroskiScore == null && altmanZScore == null) return {};
        return { piotroskiScore, altmanZScore };
      }
      return null;
    }

    async function finnhubFallbackComponent(name) {
      const bundle = await getFinnhubBundle();
      if (!bundle) return null;
      const metric = bundle.metric && typeof bundle.metric === 'object' ? bundle.metric : {};
      const profile = bundle.profile && typeof bundle.profile === 'object' ? bundle.profile : {};
      const quote = bundle.quote && typeof bundle.quote === 'object' ? bundle.quote : {};
      const financialRows = Array.isArray(bundle.financialRows) ? bundle.financialRows : [];
      if (name === 'profile') {
        const companyName = String(profile.name || profile.ticker || safeSymbol || '').trim();
        if (!companyName) return null;
        return {
          companyName,
          name: companyName,
          symbol: String(profile.ticker || safeSymbol || '').trim().toUpperCase(),
          exchangeShortName: String(profile.exchange || profile.exchangeCode || '').trim() || null
        };
      }
      if (name === 'ratios') {
        const ratios = mapFinnhubMetricToRatios(metric, { financialRows, profile, quote });
        if (!ratios || !Object.keys(ratios).length) return null;
        return ratios;
      }
      if (name === 'scores') {
        const piotroskiScore = metricValue(metric, ['piotroskiScore']);
        const altmanZScore = metricValue(metric, ['altmanZScore']);
        if (piotroskiScore == null && altmanZScore == null) return null;
        return { piotroskiScore, altmanZScore };
      }
      if (name === 'cashflow') {
        const rows = financialRows
          .filter((row) => row && row.freeCashFlow != null)
          .slice(0, 2)
          .map((row) => ({ date: row.date || null, freeCashFlow: row.freeCashFlow }));
        if (rows.length) return rows;
        const freeCashFlow = metricValue(metric, ['freeCashFlowTTM', 'fcfTTM']);
        if (freeCashFlow == null) return [];
        return [{ freeCashFlow }];
      }
      if (name === 'income') {
        const rows = financialRows
          .filter((row) => row && (row.revenue != null || row.epsdiluted != null))
          .slice(0, 4)
          .map((row) => ({ date: row.date || null, revenue: row.revenue, epsdiluted: row.epsdiluted }));
        if (rows.length) return rows;
        const revenue = metricValue(metric, ['revenueTTM']);
        const epsdiluted = metricValue(metric, ['epsTTM', 'epsBasicExclExtraItemsTTM']);
        if (revenue == null && epsdiluted == null) return [];
        return [{ revenue, epsdiluted }];
      }
      return null;
    }

    async function stockFallbackComponent(name) {
      const secComponent = await secFallbackComponent(name).catch(() => null);
      if (secComponent != null) return { __provider: 'sec', data: secComponent };
      const finnhubComponent = await finnhubFallbackComponent(name);
      if (finnhubComponent != null) return { __provider: 'finnhub', data: finnhubComponent };
      return null;
    }

    if (shouldRefreshEarningsMetadata(earningsMeta.earningsDateLastCheckedAt, earningsMeta.nextEarningsDate, nowMs)) {
      const lookup = await fetchNextEarningsDate(safeSymbol, fmpApiKey, finnhubApiKey, userAgent, nowMs);
      earningsEndpointUsed = lookup.endpoint || earningsEndpointUsed;
      earningsProviderUsed = lookup.provider || earningsProviderUsed;
      earningsRawSample = lookup.rawSample || earningsRawSample;
      earningsLookupError = lookup.error || '';
      earningsMeta.earningsDateLastCheckedAt = nowMs;
      earningsMetaChanged = true;
      if (lookup.nextEarningsDate) {
        earningsMeta.nextEarningsDate = normalizeDateOnly(lookup.nextEarningsDate);
        earningsMeta.nextEarningsUnavailableReason = '';
        earningsMeta.nextEarningsProvider = String(lookup.provider || '').trim();
        earningsMeta.lastEarningsRefreshReason = 'earnings_metadata_refresh';
      } else if (!earningsMeta.nextEarningsDate) {
        const unavailableReason = String(lookup.reason || 'no future earnings date returned by provider').trim();
        earningsMeta.nextEarningsUnavailableReason = unavailableReason;
        earningsMeta.nextEarningsProvider = String(lookup.provider || '').trim();
        warnings.push('Next earnings unavailable.');
        earningsState = 'Next earnings unavailable';
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
      const row = firstObjectRow(payload);
      if (!row) throw new Error('fmp_profile_empty');
      return row;
    }, warnings, componentMeta, {
      forceRefresh: false,
      fallbackFetcher: async () => stockFallbackComponent('profile')
    });
    nextComponents.profile = profile.component;
    usedCache = usedCache || profile.usedCache;
    fetchedFresh = fetchedFresh || profile.fetchedFresh;

    const income = await resolveStockComponent('income', STOCK_POLICY.statementsMs, oldComponents.income, async () => {
      const payload = await fetchFmpJson(`/stable/income-statement?symbol=${encodeURIComponent(safeSymbol)}&period=annual&limit=4`, fmpApiKey, userAgent);
      if (!Array.isArray(payload) || !payload.length) throw new Error('fmp_income_empty');
      return payload;
    }, warnings, componentMeta, {
      forceRefresh: postEarningsComponents.has('income'),
      forceReason: shouldForcePostEarnings ? 'post_earnings' : '',
      fallbackFetcher: async () => stockFallbackComponent('income')
    });
    nextComponents.income = income.component;
    usedCache = usedCache || income.usedCache;
    fetchedFresh = fetchedFresh || income.fetchedFresh;

    const cashflow = await resolveStockComponent('cashflow', STOCK_POLICY.statementsMs, oldComponents.cashflow, async () => {
      const payload = await fetchFmpJson(`/stable/cash-flow-statement?symbol=${encodeURIComponent(safeSymbol)}&period=annual&limit=2`, fmpApiKey, userAgent);
      if (!Array.isArray(payload) || !payload.length) throw new Error('fmp_cashflow_empty');
      return payload;
    }, warnings, componentMeta, {
      forceRefresh: postEarningsComponents.has('cashflow'),
      forceReason: shouldForcePostEarnings ? 'post_earnings' : '',
      fallbackFetcher: async () => stockFallbackComponent('cashflow')
    });
    nextComponents.cashflow = cashflow.component;
    usedCache = usedCache || cashflow.usedCache;
    fetchedFresh = fetchedFresh || cashflow.fetchedFresh;

    const ratios = await resolveStockComponent('ratios', STOCK_POLICY.valuationMs, oldComponents.ratios, async () => {
      const payload = await fetchFmpJson(`/stable/ratios-ttm?symbol=${encodeURIComponent(safeSymbol)}`, fmpApiKey, userAgent);
      const row = firstObjectRow(payload);
      if (!row) throw new Error('fmp_ratios_empty');
      return row;
    }, warnings, componentMeta, {
      forceRefresh: postEarningsComponents.has('ratios'),
      forceReason: shouldForcePostEarnings ? 'post_earnings' : '',
      fallbackFetcher: async () => stockFallbackComponent('ratios')
    });
    nextComponents.ratios = ratios.component;
    usedCache = usedCache || ratios.usedCache;
    fetchedFresh = fetchedFresh || ratios.fetchedFresh;

    const scores = await resolveStockComponent('scores', STOCK_POLICY.scoresMs, oldComponents.scores, async () => {
      const payload = await fetchFmpJson(`/stable/financial-scores?symbol=${encodeURIComponent(safeSymbol)}`, fmpApiKey, userAgent);
      const row = firstObjectRow(payload);
      if (!row) throw new Error('fmp_scores_empty');
      return row;
    }, warnings, componentMeta, {
      forceRefresh: postEarningsComponents.has('scores'),
      forceReason: shouldForcePostEarnings ? 'post_earnings' : '',
      fallbackFetcher: async () => stockFallbackComponent('scores')
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
      const postLookup = await fetchNextEarningsDate(safeSymbol, fmpApiKey, finnhubApiKey, userAgent, nowMs);
      earningsEndpointUsed = postLookup.endpoint || earningsEndpointUsed;
      earningsProviderUsed = postLookup.provider || earningsProviderUsed;
      earningsRawSample = postLookup.rawSample || earningsRawSample;
      earningsLookupError = postLookup.error || earningsLookupError;
      earningsMeta.earningsDateLastCheckedAt = nowMs;
      earningsMetaChanged = true;
      if (postLookup.nextEarningsDate) {
        earningsMeta.nextEarningsDate = normalizeDateOnly(postLookup.nextEarningsDate);
        earningsMeta.nextEarningsUnavailableReason = '';
        earningsMeta.nextEarningsProvider = String(postLookup.provider || '').trim();
        earningsMeta.lastEarningsRefreshReason = 'post_earnings_schedule_refresh';
      } else if (!earningsMeta.nextEarningsDate) {
        earningsMeta.nextEarningsUnavailableReason = String(postLookup.reason || 'no future earnings date returned by provider').trim();
        earningsMeta.nextEarningsProvider = String(postLookup.provider || '').trim();
        earningsState = 'Awaiting updated earnings schedule';
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
      earningsProviderUsed,
      earningsEndpointUsed,
      earningsRawSample,
      earningsLookupError,
      updatedNextEarningsDateStored: earningsMeta.nextEarningsDate,
      nextEarningsUnavailableReason: earningsMeta.nextEarningsUnavailableReason
    });

    if (!nextComponents.profile && !nextComponents.income && !nextComponents.cashflow && !nextComponents.ratios && !nextComponents.scores) {
      const summary = summarizeComponentErrors(componentMeta, ['profile', 'income', 'cashflow', 'ratios', 'scores']);
      const err = new Error(summary ? `stock_fundamentals_unavailable: ${summary}` : 'stock_fundamentals_unavailable');
      err.statusCode = 502;
      throw err;
    }

    let secNormalized = null;
    const missingBeforeSec = missingStockMetricKeys(nextComponents);
    if (missingBeforeSec.length && isLikelyUsStockSymbol(safeSymbol)) {
      secNormalized = await getSecNormalizedBundle().catch(() => null);
      if (secNormalized) {
        const merged = mergeSecIntoStockComponents(nextComponents, secNormalized);
        if (merged) fetchedFresh = true;
      }
    }

    const filteredComponents = {};
    Object.keys(nextComponents).forEach((key) => {
      if (nextComponents[key]) filteredComponents[key] = nextComponents[key];
    });
    const missingAfterSec = missingStockMetricKeys(filteredComponents);
    if (!secNormalized && missingAfterSec.length && isLikelyUsStockSymbol(safeSymbol)) {
      secNormalized = await getSecNormalizedBundle().catch(() => null);
    }
    if (secNormalized) {
      debugFa('sec-fallback', safeSymbol, {
        sourceSummary: secNormalized.sourceSummary,
        missingBeforeSec,
        missingAfterSec,
        availabilityReasons: secNormalized.availabilityReasons || {}
      });
    }
    const panel = buildStockPanel(safeSymbol, filteredComponents, warnings, earningsMeta, earningsState, nowMs, secNormalized);
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
  }
};
