// Taux VISA de base (sans frais bancaires) EUR→MGA et USD→MGA, pour E-Pay MG.
// L'app applique ensuite ses propres marges (Réglages › Tarifs).
// Visa protège /cmsapi/fx/rates derrière un défi Cloudflare : un fetch serveur reçoit
// un 403. Ordre de repli : appel direct, puis vrai navigateur (Chromium sans écran,
// qui passe le défi), puis taux de marché ; à défaut, l'app garde ses derniers taux.
const VISA_DOMAINS = ['https://usa.visa.com', 'https://www.visa.fr'];
const VISA_PAGE = 'https://usa.visa.com/support/consumer/travel-support/exchange-rate-calculator.html';
const MARKET_URL = 'https://open.er-api.com/v6/latest/USD';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const TTL_MS = 60 * 60 * 1000;
const CURRENCIES = ['USD', 'EUR'];

const visaDate = (date = new Date()) => {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getUTCFullYear()}`;
};

const parseNumber = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  return Number(value.replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
};

const plausibleMgaRate = (value) => Number.isFinite(value) && value >= 1000 && value <= 20000;

export const extractVisaRate = (json) => {
  const candidates = [];
  const push = (path, value, priority) => {
    const number = parseNumber(value);
    if (plausibleMgaRate(number)) candidates.push({ path, value: number, priority });
  };
  const scan = (obj, path = '') => {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (value && typeof value === 'object') { scan(value, currentPath); continue; }
      if (/withadditionalfee|withmarkup|totalconverted|convertedamount|destinationamount|destamount|toamount|amountconverted/.test(k)) push(currentPath, value, 1);
      else if (/totalconversionrate|conversionratewithadditionalfee|exchangeratewithadditionalfee|fxratewithadditionalfee|ratewithadditionalfee/.test(k)) push(currentPath, value, 2);
      else if (k === 'rate' || /conversionrate|exchangerate|fxrate/.test(k)) push(currentPath, value, 3);
      else push(currentPath, value, 4);
    }
  };
  scan(json);
  candidates.sort((a, b) => a.priority - b.priority);
  if (!candidates.length) throw new Error('Taux VISA introuvable');
  return candidates[0];
};

// Taux Visa sans frais bancaires : « fxRateVisa » si présent, sinon extraction générique.
export const extractVisaBaseRate = (json) => {
  const direct = parseNumber(json?.originalValues?.fxRateVisa);
  if (plausibleMgaRate(direct)) return { value: direct, asOf: Number(json.originalValues.asOfDate) || null };
  return { value: extractVisaRate(json).value, asOf: null };
};

const visaQuery = (currency) => new URLSearchParams({
  amount: '1', fee: '0', utcConvertedDate: visaDate(), exchangedate: visaDate(), fromCurr: 'MGA', toCurr: currency
}).toString();

async function viaDirect(currency) {
  for (const domain of VISA_DOMAINS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${domain}/cmsapi/fx/rates?${visaQuery(currency)}`, {
        headers: { Accept: 'application/json', 'User-Agent': UA }, cache: 'no-store', signal: controller.signal
      });
      if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) continue;
      return extractVisaBaseRate(await response.json());
    } catch { /* domaine suivant */ } finally { clearTimeout(timer); }
  }
  return null;
}

async function viaBrowser() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch { return null; }
  const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  try {
    const page = await (await browser.newContext({ userAgent: UA, locale: 'en-US' })).newPage();
    await page.goto(VISA_PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const out = {};
    for (const currency of CURRENCIES) {
      const json = await page.evaluate(async (qs) => {
        const r = await fetch(`/cmsapi/fx/rates?${qs}`, { headers: { Accept: 'application/json' } });
        return r.ok ? r.json() : null;
      }, visaQuery(currency));
      if (json) out[currency] = extractVisaBaseRate(json);
    }
    return out.USD ? out : null;
  } finally { await browser.close(); }
}

async function viaMarket() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const json = await fetch(MARKET_URL, { signal: controller.signal }).then(r => r.json());
    const usd = Number(json?.rates?.MGA), eur = Number(json?.rates?.EUR);
    if (!plausibleMgaRate(usd)) return null;
    const out = { USD: { value: usd, asOf: Number(json.time_last_update_unix) || null } };
    if (eur > 0) out.EUR = { value: usd / eur, asOf: out.USD.asOf };
    return out;
  } catch { return null; } finally { clearTimeout(timer); }
}

let cache = null;
let inflight = null;

async function loadBaseRates() {
  const direct = await viaDirect('USD');
  if (direct) {
    const eur = await viaDirect('EUR');
    return { source: 'visa', rates: { USD: direct, ...(eur ? { EUR: eur } : {}) } };
  }
  const browser = await viaBrowser().catch(() => null);
  if (browser) return { source: 'visa', rates: browser };
  const market = await viaMarket();
  if (market) return { source: 'market', rates: market };
  return null;
}

// Taux de base (sans frais), mis en cache une heure ; un seul chargement à la fois.
// Un taux de marché n'est gardé que 10 min, pour retenter Visa rapidement.
export async function getBaseRates({ force = false } = {}) {
  const ttl = cache?.source === 'market' ? 10 * 60 * 1000 : TTL_MS;
  if (!force && cache && Date.now() - cache.fetchedAt < ttl) return cache;
  if (!inflight) {
    inflight = loadBaseRates()
      .then(result => { if (result) cache = { ...result, fetchedAt: Date.now() }; return cache; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

// Réponse de /api/rates : taux de base de chaque devise, source et date d'observation.
export async function currentRates({ force = false } = {}) {
  const base = await getBaseRates({ force });
  if (!base) throw Object.assign(new Error('Taux VISA indisponibles pour le moment.'), { status: 503 });
  const rates = {};
  for (const [currency, entry] of Object.entries(base.rates)) {
    rates[currency] = { base: entry.value, asOf: entry.asOf ? new Date(entry.asOf * 1000).toISOString() : null };
  }
  return { source: base.source, observedAt: new Date(base.fetchedAt).toISOString(), rates,
    ...(base.source === 'market' ? { warning: 'VISA indisponible : taux du marché utilisé' } : {}) };
}
