// Provides weighted sector/industry classification helpers for stock+ETF allocation mode.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  var exports = factory();
  root.PT = root.PT || {};
  root.PT.SectorAllocation = exports;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var UNKNOWN = 'Other / Unknown';
  var UNKNOWN_THEME = 'Other / Unknown';
  var ETF_GROUP = 'ETF';
  var OTHER_ETF_THEME = 'Other ETF';
  var CLASSIFICATION_VERSION = 'sector-classifier-v3';
  var UNKNOWN_RETRY_COOLDOWN_MS = 1000 * 60 * 10;

  var STOCK_WEIGHTS = {
    industry: 4,
    description: 3,
    sector: 2,
    finnhubIndustry: 2,
    category: 1,
    name: 1,
    weak: 1
  };

  var ETF_WEIGHTS = {
    industry: 0,
    sector: 1,
    finnhubIndustry: 0,
    category: 4,
    name: 3,
    description: 3,
    weak: 1
  };

  var STOCK_THEME_CANDIDATES = [
    {
      sectorGroup: 'Technology',
      theme: 'Semiconductors',
      industry: [/\b(semiconductor|semiconductors|chipmaker|chipmakers|chips?|gpu|cpu|foundry|fabless|memory)\b/],
      name: [/\b(semiconductor|chip|gpu|cpu)\b/],
      description: [/\b(semiconductor|chip|gpu|cpu|fab|foundry)\b/]
    },
    {
      sectorGroup: 'Technology',
      theme: 'Cybersecurity / Data Protection',
      industry: [/\b(cybersecurity|cyber security|security software|network security|identity security)\b/],
      name: [/\b(cyber|security)\b/],
      description: [/\b(cybersecurity|zero trust|endpoint security|identity security|data security)\b/]
    },
    {
      sectorGroup: 'Technology',
      theme: 'Data / Analytics',
      industry: [/\b(data analytics|analytics|business intelligence|data platform|data infrastructure)\b/],
      name: [/\b(data|analytics)\b/],
      description: [/\b(data analytics|analytics|bi platform|data platform|data infrastructure)\b/]
    },
    {
      sectorGroup: 'Technology',
      theme: 'Marketing Tech / Data Software',
      industry: [/\b(marketing technology|marketing tech|ad technology|adtech|martech)\b/],
      name: [/\b(adtech|martech|marketing)\b/],
      description: [/\b(marketing platform|campaign|customer engagement|ad tech|advertising technology)\b/]
    },
    {
      sectorGroup: 'Technology',
      theme: 'Gaming / AdTech',
      industry: [/\b(gaming|game engine|interactive media|mobile games?)\b/],
      name: [/\b(game|gaming|unity|ads?)\b/],
      description: [/\b(game engine|gaming|ad monetization|advertising platform|player engagement)\b/]
    },
    {
      sectorGroup: 'Technology',
      theme: 'IoT / Industrial Software',
      industry: [/\b(iot|internet of things|industrial software|connected devices|digital twin)\b/],
      name: [/\b(iot|industrial software|connected)\b/],
      description: [/\b(iot|internet of things|industrial software|connected devices|digital twin)\b/]
    },
    {
      sectorGroup: 'Technology',
      theme: 'SaaS / Work Management',
      industry: [/\b(saas|work management|workflow software|project management|collaboration software)\b/],
      name: [/\b(work management|workflow|project management|collaboration)\b/],
      description: [/\b(saas|work management|workflow|task management|project management|collaboration)\b/]
    },
    {
      sectorGroup: 'Technology',
      theme: 'Enterprise Software',
      industry: [/\b(enterprise software|software - application|software - infrastructure|application software|automation software|rpa|crm|erp)\b/],
      name: [/\b(software|automation|enterprise)\b/],
      description: [/\b(enterprise software|cloud software|automation|rpa|workflow automation|crm|erp)\b/],
      weak: [/\b(software|cloud|automation)\b/]
    },
    {
      sectorGroup: 'Consumer',
      theme: 'EV & Auto',
      industry: [/\b(auto|automotive|automobiles?|electric vehicles?|evs?|auto manufacturers?|specialty vehicles?)\b/],
      name: [/\b(auto|automotive|ev)\b/],
      description: [/\b(electric vehicle|automotive|vehicles?)\b/]
    },
    {
      sectorGroup: 'Industrials',
      theme: 'Aerospace & Air Mobility',
      industry: [/\b(air mobility|evtol|aerospace|aviation|aircraft|defense|airlines?)\b/],
      name: [/\b(air|aero|aviation|flight|airline)\b/],
      description: [/\b(air mobility|evtol|aerospace|aviation|aircraft|defense|airlines?)\b/]
    },
    {
      sectorGroup: 'Healthcare',
      theme: 'Biotech',
      industry: [/\b(biotech|biotechnology|pharma|pharmaceutical|therapeutics?|drug discovery)\b/],
      description: [/\b(biotech|pharma|therapeutics?|drug)\b/]
    },
    {
      sectorGroup: 'Healthcare',
      theme: 'Medical Devices',
      industry: [/\b(medical devices?|diagnostics?|health equipment|surgical)\b/],
      description: [/\b(medical device|diagnostics?|health equipment)\b/]
    },
    {
      sectorGroup: 'Financials',
      theme: 'Banks',
      industry: [/\b(banks?|banking|regional banks?)\b/],
      description: [/\b(banking|lending)\b/]
    },
    {
      sectorGroup: 'Financials',
      theme: 'Fintech',
      industry: [/\b(fintech|financial services?|payments?|digital payments?|brokerage)\b/],
      description: [/\b(fintech|payments?|financial platform|brokerage)\b/]
    },
    {
      sectorGroup: 'Consumer',
      theme: 'Retail & Consumer',
      industry: [/\b(retail|e-?commerce|internet retail|consumer electronics|apparel|restaurants?)\b/],
      description: [/\b(retail|e-?commerce|consumer)\b/]
    },
    {
      sectorGroup: 'Energy',
      theme: 'Oil & Gas',
      industry: [/\b(oil|gas|energy|upstream|downstream|midstream|renewable|solar|wind)\b/],
      description: [/\b(oil|gas|energy|renewable|solar|wind)\b/]
    },
    {
      sectorGroup: 'Materials',
      theme: 'Materials',
      industry: [/\b(materials?|mining|metals?|steel|chemicals?|lithium|copper)\b/],
      description: [/\b(materials?|mining|metals?|chemicals?)\b/]
    },
    {
      sectorGroup: 'Communication Services',
      theme: 'Media & Telecom',
      industry: [/\b(telecom|communication|media|internet content)\b/],
      description: [/\b(telecom|communication|media)\b/]
    },
    {
      sectorGroup: 'Real Estate',
      theme: 'Real Estate',
      industry: [/\b(real estate|reit|property)\b/],
      description: [/\b(real estate|reit|property)\b/]
    },
    {
      sectorGroup: 'Utilities',
      theme: 'Utilities',
      industry: [/\b(utilities|electric utility|water utility|power utility)\b/],
      description: [/\b(utilities|electric utility|water utility)\b/]
    },
    {
      sectorGroup: 'Industrials',
      theme: 'Industrial & Transportation',
      industry: [/\b(transportation|logistics|rail|machinery|manufacturing)\b/],
      description: [/\b(transportation|logistics|machinery|manufacturing)\b/]
    }
  ];

  var ETF_THEME_CANDIDATES = [
    {
      sectorGroup: ETF_GROUP,
      theme: 'World Small Cap Equity',
      category: [/\b(world small cap|global small cap|small cap world|msci world small cap)\b/],
      name: [/\b(world small cap|global small cap|small cap world)\b/],
      description: [/\b(world small cap|global small cap|small cap)\b/]
    },
    {
      sectorGroup: ETF_GROUP,
      theme: 'ETF',
      category: [/\b(global equity|all[- ]world|world equity|acwi)\b/],
      name: [/\b(all[- ]world|world|global|acwi|ftse all[- ]world|msci world)\b/],
      description: [/\b(track|tracks|seeks to track|index)\b/, /\b(global|world)\b/]
    },
    {
      sectorGroup: ETF_GROUP,
      theme: 'US Equity Index',
      category: [/\b(us equity|u\.s\. equity|large cap us|s&p 500|total us)\b/],
      name: [/\b(s&p 500|total stock market|russell 1000|us equity|u\.s\.)\b/],
      description: [/\b(us equity|u\.s\. equity|s&p 500|total stock market)\b/]
    },
    {
      sectorGroup: ETF_GROUP,
      theme: 'AI / Thematic Equity',
      category: [/\b(ai|artificial intellig\w*|robotics|thematic|innovation)\b/],
      name: [/\b(ai|artificial intellig\w*|robotics|thematic|innovation)\b/],
      description: [/\b(ai|artificial intellig\w*|robotics|thematic|innovation)\b/]
    },
    {
      sectorGroup: ETF_GROUP,
      theme: 'Semiconductor ETF',
      category: [/\b(semiconductor|chips?)\b/],
      name: [/\b(semiconductor|chips?)\b/],
      description: [/\b(semiconductor|chips?)\b/]
    },
    {
      sectorGroup: ETF_GROUP,
      theme: 'Dividend ETF',
      category: [/\b(dividend|income|high yield|aristocrats)\b/],
      name: [/\b(dividend|income|yield)\b/],
      description: [/\b(dividend|income|yield)\b/]
    },
    {
      sectorGroup: ETF_GROUP,
      theme: 'Bond ETF',
      category: [/\b(bond|fixed income|treasury|corporate bond|credit)\b/],
      name: [/\b(bond|treasury|fixed income|credit)\b/],
      description: [/\b(bond|fixed income|treasury|credit)\b/]
    },
    {
      sectorGroup: ETF_GROUP,
      theme: 'Commodity ETF',
      category: [/\b(commodity|gold|silver|oil|metals?)\b/],
      name: [/\b(commodity|gold|silver|oil)\b/],
      description: [/\b(commodity|gold|silver|oil)\b/]
    },
    {
      sectorGroup: ETF_GROUP,
      theme: 'REIT ETF',
      category: [/\b(reit|real estate)\b/],
      name: [/\b(reit|real estate)\b/],
      description: [/\b(reit|real estate)\b/]
    }
  ];

  // Safely converts arbitrary input into a normalized lowercase token string.
  function normToken(value) {
    return String(value == null ? '' : value)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Converts a sentence into title case for stable display labels.
  function titleCase(value) {
    var text = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
    if (!text) return '';
    return text.split(' ').map(function (part) {
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join(' ');
  }

  // Returns a finite number or null for invalid input.
  function num(value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  // Normalizes labels into compact display-safe text.
  function normalizeLabel(value, fallback) {
    var text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!text) return fallback || '';
    return text.slice(0, 80);
  }

  // Builds one normalized metadata object used by classifier stages.
  function normalizeRawMeta(rawData) {
    var data = rawData && typeof rawData === 'object' ? rawData : {};
    return {
      symbol: String(data.symbol || '').trim().toUpperCase(),
      rawSector: normalizeLabel(data.rawSector || data.sector || data.normalizedSectorGroup || data.normalizedSector || '', ''),
      rawIndustry: normalizeLabel(data.rawIndustry || data.industry || data.normalizedIndustryTheme || '', ''),
      finnhubIndustry: normalizeLabel(data.finnhubIndustry || '', ''),
      rawName: normalizeLabel(data.rawName || data.name || '', ''),
      rawDescription: normalizeLabel(data.rawDescription || data.description || '', ''),
      rawCategory: normalizeLabel(data.rawCategory || data.category || '', ''),
      rawAssetType: normalizeLabel(data.rawAssetType || data.assetType || data.type || '', ''),
      source: String(data.source || '').trim() || 'unknown',
      lastFetchedAt: Math.max(0, Number(data.lastFetchedAt || data.fetchedAt || 0) || Date.now()),
      reasonIfUnavailable: data.reasonIfUnavailable ? String(data.reasonIfUnavailable).trim() : null,
      userDefinedSectorGroup: normalizeLabel(data.userDefinedSectorGroup || '', '')
    };
  }

  // Builds a normalized searchable text blob from raw provider classification fields.
  function buildClassificationTextBlob(rawData) {
    var meta = normalizeRawMeta(rawData);
    var parts = [
      meta.rawSector,
      meta.rawIndustry,
      meta.finnhubIndustry,
      meta.rawName,
      meta.rawDescription,
      meta.rawCategory,
      meta.rawAssetType
    ].map(normToken).filter(Boolean);
    if (!parts.length) return '';
    return ' ' + parts.join(' ') + ' ';
  }

  // Maps provider asset-type values into stock/etf/crypto/unknown.
  function normalizeAssetType(value) {
    var token = normToken(value);
    if (!token) return 'unknown';
    if (/\b(crypto|digital asset|token|coin)\b/.test(token)) return 'crypto';
    if (/\b(etf|exchange traded|fund|trust|ucits)\b/.test(token)) return 'etf';
    if (/\b(stock|equity|commonstock|common stock|adr)\b/.test(token)) return 'stock';
    return 'unknown';
  }

  // Detects effective asset type using provider metadata (stock vs ETF/fund).
  function detectAssetType(rawData) {
    var meta = normalizeRawMeta(rawData);
    var candidates = [meta.rawAssetType, rawData && rawData.assetType, rawData && rawData.avAssetType, rawData && rawData.finnhubType];
    var i;
    for (i = 0; i < candidates.length; i++) {
      var mapped = normalizeAssetType(candidates[i]);
      if (mapped !== 'unknown') return mapped;
    }
    var blob = buildClassificationTextBlob(meta);
    if (!blob) return 'unknown';
    if (/\b(etf|ucits|fund|trust|index|seeks to track|tracks?(?: the performance of)?|vanguard|ishares|spdr|invesco|wisdomtree|global x|vaneck|robo)\b/.test(blob)) return 'etf';
    if (/\b(crypto|token|coin|digital asset)\b/.test(blob)) return 'crypto';
    if (meta.rawSector || meta.rawIndustry || meta.finnhubIndustry) return 'stock';
    return 'unknown';
  }

  // Maps provider sector names into stable top-level sector groups.
  function normalizeProviderSector(rawSector) {
    var text = normToken(rawSector);
    if (!text) return UNKNOWN;
    if (/\b(etf|fund|trust|index)\b/.test(text)) return ETF_GROUP;
    if (/information technology|technology/.test(text)) return 'Technology';
    if (/financial/.test(text)) return 'Financials';
    if (/health/.test(text)) return 'Healthcare';
    if (/industrial/.test(text)) return 'Industrials';
    if (/consumer/.test(text)) return 'Consumer';
    if (/energy/.test(text)) return 'Energy';
    if (/material/.test(text)) return 'Materials';
    if (/communication/.test(text)) return 'Communication Services';
    if (/real estate/.test(text)) return 'Real Estate';
    if (/utilit/.test(text)) return 'Utilities';
    if (/crypto|digital asset|blockchain/.test(text)) return 'Crypto';
    return UNKNOWN;
  }

  // Maps recognizable industry hints into sector group fallback.
  function inferSectorFromIndustry(rawIndustry) {
    var text = normToken(rawIndustry);
    if (!text) return UNKNOWN;
    if (/\b(semiconductor|chip|gpu|cpu|software|saas|cybersecurity|cloud|adtech|analytics|iot)\b/.test(text)) return 'Technology';
    if (/\b(bank|financial|fintech|insurance|payments|brokerage|asset management)\b/.test(text)) return 'Financials';
    if (/\b(biotech|pharma|therapeutics|medical|diagnostics|health)\b/.test(text)) return 'Healthcare';
    if (/\b(aerospace|aviation|air mobility|aircraft|airlines?|defense|transport|logistics|manufacturing|machinery)\b/.test(text)) return 'Industrials';
    if (/\b(auto|automotive|automobiles?|electric vehicle|retail|e-?commerce|consumer electronics|restaurant|apparel)\b/.test(text)) return 'Consumer';
    if (/\b(oil|gas|renewable|solar|wind|energy)\b/.test(text)) return 'Energy';
    if (/\b(material|mining|metal|chemic|steel|lithium|copper)\b/.test(text)) return 'Materials';
    if (/\b(telecom|media|communication|internet content|advertising)\b/.test(text)) return 'Communication Services';
    if (/\b(real estate|reit|property)\b/.test(text)) return 'Real Estate';
    if (/\b(utility|power|water)\b/.test(text)) return 'Utilities';
    return UNKNOWN;
  }

  function mergeIndustryText(meta) {
    var left = normToken(meta.rawIndustry);
    var right = normToken(meta.finnhubIndustry);
    if (!left && !right) return '';
    if (left && right && left !== right) return left + ' ' + right;
    return left || right;
  }

  function uniq(arr) {
    var seen = {};
    return arr.filter(function (x) {
      if (!x || seen[x]) return false;
      seen[x] = true;
      return true;
    });
  }

  function hasPattern(text, patterns) {
    if (!text || !Array.isArray(patterns) || !patterns.length) return false;
    var i;
    for (i = 0; i < patterns.length; i++) {
      if (patterns[i] && patterns[i].test && patterns[i].test(text)) return true;
    }
    return false;
  }

  function scoreCandidateClasses(rawMeta, candidates, weights) {
    var meta = normalizeRawMeta(rawMeta);
    var industryText = mergeIndustryText(meta);
    var sectorText = normToken(meta.rawSector);
    var finnhubIndustryText = normToken(meta.finnhubIndustry);
    var categoryText = normToken(meta.rawCategory);
    var nameText = normToken(meta.rawName);
    var descriptionText = normToken(meta.rawDescription);
    var blob = buildClassificationTextBlob(meta);

    return (Array.isArray(candidates) ? candidates : []).map(function (candidate) {
      var score = 0;
      var evidence = [];
      var strongFields = 0;

      function push(field, weight, note) {
        score += weight;
        evidence.push(field + ': ' + note);
        if (weight >= 2) strongFields += 1;
      }

      if (hasPattern(industryText, candidate.industry)) push('industry', weights.industry, candidate.theme);
      if (hasPattern(sectorText, candidate.sector)) push('sector', weights.sector, candidate.sectorGroup);
      if (hasPattern(finnhubIndustryText, candidate.finnhubIndustry || candidate.industry)) {
        push('finnhubIndustry', weights.finnhubIndustry, candidate.theme);
      }
      if (hasPattern(categoryText, candidate.category)) push('category', weights.category, candidate.theme);
      if (hasPattern(nameText, candidate.name)) push('name', weights.name, candidate.theme);
      if (hasPattern(descriptionText, candidate.description)) push('description', weights.description, candidate.theme);
      if (hasPattern(blob, candidate.weak)) push('weak', weights.weak, candidate.theme);

      return {
        candidate: candidate,
        score: score,
        evidence: evidence,
        evidenceCount: evidence.length,
        strongFields: strongFields
      };
    }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.strongFields !== a.strongFields) return b.strongFields - a.strongFields;
      return b.evidenceCount - a.evidenceCount;
    });
  }

  function computeClassificationConfidence(bestCandidate, runnerUp, evidenceCount) {
    var best = bestCandidate && isFinite(Number(bestCandidate.score)) ? Number(bestCandidate.score) : 0;
    var next = runnerUp && isFinite(Number(runnerUp.score)) ? Number(runnerUp.score) : 0;
    var margin = best - next;
    var strongFields = bestCandidate && isFinite(Number(bestCandidate.strongFields))
      ? Number(bestCandidate.strongFields)
      : 0;
    var count = isFinite(Number(evidenceCount)) ? Number(evidenceCount) : 0;

    var confidence = 0.35;
    if (best <= 0) confidence = 0.32;
    else if (strongFields >= 2 && margin >= 3) confidence = 0.92;
    else if (strongFields >= 2 && margin >= 1) confidence = 0.86;
    else if (strongFields >= 1 && count >= 2) confidence = 0.76;
    else if (count >= 1 && margin >= 1) confidence = 0.64;
    else confidence = 0.52;

    if (confidence < 0) confidence = 0;
    if (confidence > 1) confidence = 1;
    return Math.round(confidence * 100) / 100;
  }

  function buildReason(best, fallbackReason) {
    if (!best) return fallbackReason || 'Insufficient classification evidence';
    var fields = uniq((best.evidence || []).map(function (line) {
      return String(line || '').split(':')[0];
    }));
    var fieldLabel = fields.length ? fields.join(' + ') : 'fallback';
    return fieldLabel + ' matched ' + best.candidate.theme + ' (' + best.candidate.sectorGroup + ')';
  }

  function classifyStock(rawMeta) {
    var meta = normalizeRawMeta(rawMeta);
    var ranked = scoreCandidateClasses(meta, STOCK_THEME_CANDIDATES, STOCK_WEIGHTS);
    var best = ranked[0] || null;
    var second = ranked[1] || null;
    if (best && best.score > 0) {
      return {
        normalizedSectorGroup: best.candidate.sectorGroup,
        normalizedIndustryTheme: best.candidate.theme,
        confidence: computeClassificationConfidence(best, second, best.evidenceCount),
        reason: buildReason(best),
        _classificationScore: best.score,
        _evidenceCount: best.evidenceCount
      };
    }

    var providerSector = normalizeProviderSector(meta.rawSector);
    if (providerSector === UNKNOWN) providerSector = inferSectorFromIndustry(meta.rawIndustry || meta.finnhubIndustry);
    var fallbackTheme = normalizeLabel(meta.rawIndustry || meta.finnhubIndustry, '') || (providerSector !== UNKNOWN ? providerSector : UNKNOWN_THEME);
    var fallbackScore = providerSector === UNKNOWN ? 0 : 1;
    return {
      normalizedSectorGroup: providerSector !== UNKNOWN ? providerSector : UNKNOWN,
      normalizedIndustryTheme: providerSector !== UNKNOWN ? fallbackTheme : UNKNOWN_THEME,
      confidence: providerSector !== UNKNOWN ? 0.48 : 0.32,
      reason: providerSector !== UNKNOWN
        ? 'Provider industry/sector fallback used'
        : 'Insufficient stock sector/industry evidence',
      _classificationScore: fallbackScore,
      _evidenceCount: fallbackScore > 0 ? 1 : 0
    };
  }

  function classifyETF(rawMeta) {
    var meta = normalizeRawMeta(rawMeta);
    var ranked = scoreCandidateClasses(meta, ETF_THEME_CANDIDATES, ETF_WEIGHTS);
    var best = ranked[0] || null;
    var second = ranked[1] || null;
    if (best && best.score > 0) {
      return {
        normalizedSectorGroup: ETF_GROUP,
        normalizedIndustryTheme: best.candidate.theme,
        confidence: computeClassificationConfidence(best, second, best.evidenceCount),
        reason: 'ETF detected; ' + buildReason(best),
        _classificationScore: best.score,
        _evidenceCount: best.evidenceCount
      };
    }
    return {
      normalizedSectorGroup: ETF_GROUP,
      normalizedIndustryTheme: OTHER_ETF_THEME,
      confidence: 0.5,
      reason: 'ETF detected from asset type; theme unclear from metadata',
      _classificationScore: 1,
      _evidenceCount: 1
    };
  }

  function classifySymbolMetadata(rawMeta) {
    var meta = normalizeRawMeta(rawMeta);
    var forcedSector = normalizeLabel(meta.userDefinedSectorGroup, '');
    var detectedType = detectAssetType(meta);

    if (forcedSector) {
      return {
        assetType: detectedType === 'unknown' ? 'stock' : detectedType,
        normalizedSectorGroup: forcedSector,
        normalizedIndustryTheme: forcedSector,
        confidence: 1,
        reason: 'User-defined sector override',
        _classificationScore: 999,
        _evidenceCount: 1
      };
    }

    if (detectedType === 'crypto') {
      return {
        assetType: 'crypto',
        normalizedSectorGroup: 'Crypto',
        normalizedIndustryTheme: 'Crypto',
        confidence: 0.95,
        reason: 'Crypto asset type detected',
        _classificationScore: 8,
        _evidenceCount: 1
      };
    }

    if (detectedType === 'etf') {
      return Object.assign({ assetType: 'etf' }, classifyETF(meta));
    }

    if (detectedType === 'stock') {
      return Object.assign({ assetType: 'stock' }, classifyStock(meta));
    }

    var blob = buildClassificationTextBlob(meta);
    if (/\b(etf|ucits|fund|trust|index|seeks to track|tracks?)\b/.test(blob)) {
      return Object.assign({ assetType: 'etf' }, classifyETF(meta));
    }
    if (meta.rawIndustry || meta.rawSector || meta.finnhubIndustry) {
      return Object.assign({ assetType: 'stock' }, classifyStock(meta));
    }

    return {
      assetType: 'unknown',
      normalizedSectorGroup: UNKNOWN,
      normalizedIndustryTheme: UNKNOWN_THEME,
      confidence: 0.2,
      reason: 'No meaningful provider metadata for classification',
      _classificationScore: 0,
      _evidenceCount: 0
    };
  }

  // Compatibility helper expected by existing app flow.
  function inferSectorGroup(rawSector, rawIndustry, finnhubIndustry, assetTypeHint, rawData) {
    var result = classifySymbolMetadata(Object.assign({}, rawData || {}, {
      rawSector: rawSector,
      rawIndustry: rawIndustry,
      finnhubIndustry: finnhubIndustry,
      rawAssetType: assetTypeHint
    }));
    return result.normalizedSectorGroup || UNKNOWN;
  }

  // Compatibility helper expected by existing app flow.
  function inferIndustryTheme(rawSector, rawIndustry, finnhubIndustry, sectorGroup, rawData) {
    var result = classifySymbolMetadata(Object.assign({}, rawData || {}, {
      rawSector: rawSector,
      rawIndustry: rawIndustry,
      finnhubIndustry: finnhubIndustry
    }));
    if (result.normalizedIndustryTheme && result.normalizedIndustryTheme !== UNKNOWN_THEME) return result.normalizedIndustryTheme;
    return sectorGroup || UNKNOWN_THEME;
  }

  function inferEtfTheme(rawData) {
    var result = classifyETF(rawData || {});
    return result.normalizedIndustryTheme || OTHER_ETF_THEME;
  }

  // Computes full normalized classification shape from raw provider fields.
  function normalizeStockClassification(rawData) {
    var meta = normalizeRawMeta(rawData);
    var classified = classifySymbolMetadata(meta);
    var sector = classified.normalizedSectorGroup || UNKNOWN;
    var theme = classified.normalizedIndustryTheme || UNKNOWN_THEME;
    var reason = normalizeLabel(classified.reason, '');
    var confidence = isFinite(Number(classified.confidence)) ? Number(classified.confidence) : 0;
    var reasonIfUnavailable = sector === UNKNOWN
      ? (meta.reasonIfUnavailable || reason || 'unmapped provider classification')
      : null;

    return {
      symbol: meta.symbol,
      assetType: classified.assetType || 'unknown',
      rawAssetType: meta.rawAssetType || null,
      rawSector: meta.rawSector || null,
      rawIndustry: meta.rawIndustry || null,
      finnhubIndustry: meta.finnhubIndustry || null,
      rawName: meta.rawName || null,
      rawDescription: meta.rawDescription || null,
      rawCategory: meta.rawCategory || null,
      userDefinedSectorGroup: meta.userDefinedSectorGroup || null,
      normalizedSectorGroup: sector,
      normalizedIndustryTheme: theme,
      normalizedSector: sector,
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: reason || null,
      classificationVersion: CLASSIFICATION_VERSION,
      source: meta.source || 'unknown',
      lastFetchedAt: meta.lastFetchedAt,
      reasonIfUnavailable: reasonIfUnavailable
    };
  }

  // Returns true when a cached metadata row should be recomputed with current classifier rules.
  function shouldReclassifyCachedRecord(cachedRecord, currentVersion) {
    var record = cachedRecord && typeof cachedRecord === 'object' ? cachedRecord : null;
    if (!record) return true;
    if (record.userDefinedSectorGroup) return false;
    var expectedVersion = String(currentVersion || CLASSIFICATION_VERSION || '').trim() || CLASSIFICATION_VERSION;
    var version = String(record.classificationVersion || '').trim();
    var confidence = Number(record.confidence);
    var reason = String(record.reason || '').trim();
    var sector = String(record.normalizedSectorGroup || record.normalizedSector || '').trim();
    var theme = String(record.normalizedIndustryTheme || '').trim();
    var assetType = String(record.assetType || '').trim().toLowerCase();
    if (!version || version !== expectedVersion) return true;
    if (!isFinite(confidence)) return true;
    if (!reason) return true;
    if (!sector || !theme) return true;
    if (assetType === 'etf' && sector !== ETF_GROUP) return true;
    if (assetType === 'crypto' && sector !== 'Crypto') return true;
    if (sector === UNKNOWN && confidence < 0.75) {
      var source = String(record.source || '').trim().toLowerCase();
      var hasRawEvidence = !!(
        String(record.rawSector || '').trim() ||
        String(record.rawIndustry || '').trim() ||
        String(record.finnhubIndustry || '').trim() ||
        String(record.rawName || '').trim() ||
        String(record.rawDescription || '').trim() ||
        String(record.rawCategory || '').trim()
      );
      if (!hasRawEvidence || source === 'unknown' || assetType === 'unknown') return true;
      var lastFetchedAt = Number(record.lastFetchedAt || 0);
      if (!isFinite(lastFetchedAt) || lastFetchedAt <= 0) return true;
      return (Date.now() - lastFetchedAt) >= UNKNOWN_RETRY_COOLDOWN_MS;
    }
    return false;
  }

  // Chooses the best provider payload by weighted classification quality.
  function selectSectorMetadataFromProviders(symbol, finnhubProfile, alphaOverview, listingMeta, nowMs) {
    var listing = listingMeta;
    var now = nowMs;
    if (typeof listingMeta === 'number' && nowMs == null) {
      now = listingMeta;
      listing = null;
    }
    var safeSymbol = String(symbol || '').trim().toUpperCase();
    var ts = Math.max(0, Number(now || 0) || Date.now());

    var fin = normalizeStockClassification({
      symbol: safeSymbol,
      rawSector: finnhubProfile && finnhubProfile.sector,
      rawIndustry: finnhubProfile && (finnhubProfile.industry || finnhubProfile.finnhubIndustry),
      finnhubIndustry: finnhubProfile && finnhubProfile.finnhubIndustry,
      rawName: finnhubProfile && finnhubProfile.name,
      rawDescription: finnhubProfile && finnhubProfile.description,
      rawCategory: finnhubProfile && finnhubProfile.category,
      rawAssetType: (listing && listing.assetType) || (alphaOverview && alphaOverview.AssetType) || (finnhubProfile && finnhubProfile.type),
      source: 'finnhub',
      lastFetchedAt: ts
    });
    var av = normalizeStockClassification({
      symbol: safeSymbol,
      rawSector: alphaOverview && alphaOverview.Sector,
      rawIndustry: alphaOverview && alphaOverview.Industry,
      rawName: (alphaOverview && alphaOverview.Name) || (listing && listing.name),
      rawDescription: alphaOverview && alphaOverview.Description,
      rawCategory: alphaOverview && alphaOverview.Category,
      rawAssetType: (listing && listing.assetType) || (alphaOverview && alphaOverview.AssetType) || (finnhubProfile && finnhubProfile.type),
      source: 'alpha-vantage',
      lastFetchedAt: ts
    });
    var merged = normalizeStockClassification({
      symbol: safeSymbol,
      rawSector: (alphaOverview && alphaOverview.Sector) || (finnhubProfile && finnhubProfile.sector),
      rawIndustry: (alphaOverview && alphaOverview.Industry) || (finnhubProfile && (finnhubProfile.industry || finnhubProfile.finnhubIndustry)),
      finnhubIndustry: finnhubProfile && finnhubProfile.finnhubIndustry,
      rawName: (alphaOverview && alphaOverview.Name) || (finnhubProfile && finnhubProfile.name) || (listing && listing.name),
      rawDescription: (alphaOverview && alphaOverview.Description) || (finnhubProfile && finnhubProfile.description),
      rawCategory: alphaOverview && alphaOverview.Category,
      rawAssetType: (listing && listing.assetType) || (alphaOverview && alphaOverview.AssetType) || (finnhubProfile && finnhubProfile.type),
      source: (finnhubProfile && alphaOverview) ? 'finnhub+alpha-vantage' : (finnhubProfile ? 'finnhub' : 'alpha-vantage'),
      lastFetchedAt: ts
    });

    function candidateScore(item) {
      if (!item) return -1;
      var score = 0;
      if (item.assetType && item.assetType !== 'unknown') score += 4;
      if (item.normalizedSectorGroup && item.normalizedSectorGroup !== UNKNOWN) score += 3;
      if (item.normalizedIndustryTheme && item.normalizedIndustryTheme !== UNKNOWN_THEME) score += 3;
      score += (Number(item.confidence || 0) * 4);
      if (item.rawIndustry || item.finnhubIndustry) score += 1;
      if (item.rawSector) score += 1;
      if (item.rawName || item.rawDescription || item.rawCategory) score += 1;
      return score;
    }

    var candidates = [fin, av, merged];
    candidates.sort(function (a, b) { return candidateScore(b) - candidateScore(a); });
    var chosen = candidates[0] || normalizeStockClassification({
      symbol: safeSymbol,
      source: 'unknown',
      lastFetchedAt: ts,
      reasonIfUnavailable: 'no provider sector/industry value'
    });

    if (chosen.normalizedSectorGroup === UNKNOWN) {
      chosen.reasonIfUnavailable = chosen.reasonIfUnavailable || 'unmapped provider classification';
    } else {
      chosen.reasonIfUnavailable = null;
    }
    return chosen;
  }

  // Returns true when a sector metadata record is fresh for the given TTL.
  function isSectorMetadataFresh(record, ttlMs, nowMs) {
    var ttl = Math.max(0, Number(ttlMs || 0) || 0);
    if (!record || ttl <= 0) return false;
    var ts = num(record.lastFetchedAt);
    if (ts == null) return false;
    var now = num(nowMs) != null ? Number(nowMs) : Date.now();
    return (now - ts) <= ttl;
  }

  // Computes grouped sector allocation values from holdings using market value weights.
  function getSectorAllocationData(holdings, sectorMetadataMap) {
    var map = sectorMetadataMap && typeof sectorMetadataMap === 'object' ? sectorMetadataMap : {};
    var totals = {};
    var order = [];
    (Array.isArray(holdings) ? holdings : []).forEach(function (item) {
      var value = num(item && item.marketValue);
      if (value == null || value <= 0) return;
      var assetType = String(item && item.type || '').trim().toLowerCase();
      var symbol = String(item && item.symbol || '').trim().toUpperCase();
      var meta = symbol ? map[symbol] : null;
      var bucket = assetType === 'crypto'
        ? 'Crypto'
        : normalizeStockClassification(Object.assign({}, meta || {}, { symbol: symbol })).normalizedSectorGroup;
      if (!totals[bucket]) {
        totals[bucket] = 0;
        order.push(bucket);
      }
      totals[bucket] += value;
    });
    order.sort(function (a, b) {
      var da = Number(totals[a] || 0);
      var db = Number(totals[b] || 0);
      if (db !== da) return db - da;
      return String(a || '').localeCompare(String(b || ''));
    });
    return {
      labels: order,
      values: order.map(function (bucket) { return Number((totals[bucket] || 0).toFixed(2)); }),
      totals: totals
    };
  }

  // Computes grouped theme allocation values from holdings using market value weights.
  function getThemeAllocationData(holdings, sectorMetadataMap) {
    var map = sectorMetadataMap && typeof sectorMetadataMap === 'object' ? sectorMetadataMap : {};
    var totals = {};
    var order = [];
    (Array.isArray(holdings) ? holdings : []).forEach(function (item) {
      var value = num(item && item.marketValue);
      if (value == null || value <= 0) return;
      var assetType = String(item && item.type || '').trim().toLowerCase();
      var symbol = String(item && item.symbol || '').trim().toUpperCase();
      var meta = symbol ? map[symbol] : null;
      var bucket = assetType === 'crypto'
        ? 'Crypto'
        : normalizeStockClassification(Object.assign({}, meta || {}, { symbol: symbol })).normalizedIndustryTheme;
      bucket = String(bucket || UNKNOWN_THEME).trim() || UNKNOWN_THEME;
      if (!totals[bucket]) {
        totals[bucket] = 0;
        order.push(bucket);
      }
      totals[bucket] += value;
    });
    order.sort(function (a, b) {
      var da = Number(totals[a] || 0);
      var db = Number(totals[b] || 0);
      if (db !== da) return db - da;
      return String(a || '').localeCompare(String(b || ''));
    });
    return {
      labels: order,
      values: order.map(function (bucket) { return Number((totals[bucket] || 0).toFixed(2)); }),
      totals: totals
    };
  }

  // Sorts stock rows by sector group, then industry theme, then existing secondary rule.
  function sortStocksBySector(stocks, sectorMetadataMap, secondarySort) {
    var map = sectorMetadataMap && typeof sectorMetadataMap === 'object' ? sectorMetadataMap : {};
    var sortKey = String(secondarySort || 'value-desc').trim().toLowerCase();
    var out = Array.isArray(stocks) ? stocks.slice() : [];

    function compareBySecondary(a, b) {
      var av = Number(a && a.marketValue || 0) || 0;
      var bv = Number(b && b.marketValue || 0) || 0;
      var apl = Number(a && a.plAmount || 0) || 0;
      var bpl = Number(b && b.plAmount || 0) || 0;
      var aday = Number(a && a.dayChangePct || 0) || 0;
      var bday = Number(b && b.dayChangePct || 0) || 0;
      if (sortKey === 'value-asc') return av - bv;
      if (sortKey === 'pl-desc') return bpl - apl;
      if (sortKey === 'pl-asc') return apl - bpl;
      if (sortKey === 'day-desc') return bday - aday;
      if (sortKey === 'day-asc') return aday - bday;
      if (sortKey === 'az') return String(a && a.symbol || '').localeCompare(String(b && b.symbol || ''));
      return bv - av;
    }

    out.sort(function (a, b) {
      var as = String(a && a.symbol || '').trim().toUpperCase();
      var bs = String(b && b.symbol || '').trim().toUpperCase();
      var aMeta = normalizeStockClassification(Object.assign({}, map[as] || {}, { symbol: as }));
      var bMeta = normalizeStockClassification(Object.assign({}, map[bs] || {}, { symbol: bs }));
      var aSector = aMeta.normalizedSectorGroup || UNKNOWN;
      var bSector = bMeta.normalizedSectorGroup || UNKNOWN;
      if (aSector !== bSector) return aSector.localeCompare(bSector);
      var aTheme = aMeta.normalizedIndustryTheme || UNKNOWN_THEME;
      var bTheme = bMeta.normalizedIndustryTheme || UNKNOWN_THEME;
      if (aTheme !== bTheme) return aTheme.localeCompare(bTheme);
      var bySecondary = compareBySecondary(a, b);
      if (bySecondary !== 0) return bySecondary;
      return as.localeCompare(bs);
    });

    return out;
  }

  // Groups/sorts stock rows in sector mode by sector group + industry theme.
  function groupStocksBySectorAndIndustry(stocks, classificationMap, secondarySort) {
    return sortStocksBySector(stocks, classificationMap, secondarySort);
  }

  // Resolves the chart highlight key for a legend row in stocks/sector modes.
  function getChartKeyForHover(item, mode) {
    var viewMode = String(mode || 'stocks').trim().toLowerCase() === 'sectors' ? 'sectors' : 'stocks';
    if (viewMode === 'sectors') {
      return normalizeStockClassification(item || {}).normalizedSectorGroup || UNKNOWN;
    }
    return String(item && item.symbol || '').trim().toUpperCase();
  }

  return {
    UNKNOWN_SECTOR: UNKNOWN,
    UNKNOWN_THEME: UNKNOWN_THEME,
    ETF_SECTOR: ETF_GROUP,
    OTHER_ETF_THEME: OTHER_ETF_THEME,
    CLASSIFICATION_VERSION: CLASSIFICATION_VERSION,
    normalizeSector: function (value) { return inferSectorGroup(value, '', '', '', { rawSector: value }); },
    normalizeAssetType: normalizeAssetType,
    detectAssetType: detectAssetType,
    buildClassificationTextBlob: buildClassificationTextBlob,
    normalizeProviderSector: normalizeProviderSector,
    inferSectorGroup: inferSectorGroup,
    inferIndustryTheme: inferIndustryTheme,
    inferEtfTheme: inferEtfTheme,
    scoreCandidateClasses: scoreCandidateClasses,
    computeClassificationConfidence: computeClassificationConfidence,
    classifyStock: classifyStock,
    classifyETF: classifyETF,
    classifySymbolMetadata: classifySymbolMetadata,
    normalizeStockClassification: normalizeStockClassification,
    shouldReclassifyCachedRecord: shouldReclassifyCachedRecord,
    selectSectorMetadataFromProviders: selectSectorMetadataFromProviders,
    isSectorMetadataFresh: isSectorMetadataFresh,
    getSectorAllocationData: getSectorAllocationData,
    getThemeAllocationData: getThemeAllocationData,
    sortStocksBySector: sortStocksBySector,
    groupStocksBySectorAndIndustry: groupStocksBySectorAndIndustry,
    getChartKeyForHover: getChartKeyForHover
  };
});
