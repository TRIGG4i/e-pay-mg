// Taux VISA de base (sans frais bancaires) pour HELPEO, dans les deux sens :
// - « rates » : carte en MGA, achat en devise (1 EUR coûte X MGA) ;
// - « receive » : carte en devise, dépense en MGA (1 EUR rapporte X MGA), pour la réception.
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

// Sens inverse : Visa donne la devise pour 1 MGA (0,000195 EUR) ; on garde des MGA pour 1 EUR.
export const extractVisaReceiveRate = (json) => {
  const direct = parseNumber(json?.originalValues?.fxRateVisa);
  if (direct > 0 && plausibleMgaRate(1 / direct)) return { value: 1 / direct, asOf: Number(json.originalValues.asOfDate) || null };
  throw new Error('Taux VISA de réception introuvable');
};

// fromCurr : devise de la carte ; toCurr : devise de la transaction.
const visaQuery = (currency, receive = false) => new URLSearchParams({
  amount: '1', fee: '0', utcConvertedDate: visaDate(), exchangedate: visaDate(),
  fromCurr: receive ? currency : 'MGA', toCurr: receive ? 'MGA' : currency
}).toString();
const extract = (json, receive) => (receive ? extractVisaReceiveRate(json) : extractVisaBaseRate(json));

async function viaDirect(currency, receive = false) {
  for (const domain of VISA_DOMAINS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${domain}/cmsapi/fx/rates?${visaQuery(currency, receive)}`, {
        headers: { Accept: 'application/json', 'User-Agent': UA }, cache: 'no-store', signal: controller.signal
      });
      if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) continue;
      return extract(await response.json(), receive);
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
    const rates = {}, receive = {};
    for (const currency of CURRENCIES) for (const [into, inverse] of [[rates, false], [receive, true]]) {
      const json = await page.evaluate(async (qs) => {
        const r = await fetch(`/cmsapi/fx/rates?${qs}`, { headers: { Accept: 'application/json' } });
        return r.ok ? r.json() : null;
      }, visaQuery(currency, inverse));
      if (json) try { into[currency] = extract(json, inverse); } catch { /* devise suivante */ }
    }
    return rates.USD ? { rates, receive } : null;
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

// Sans taux Visa inverse, la réception reprend le taux d'achat (marché : taux moyen).
async function loadBaseRates() {
  const direct = await viaDirect('USD');
  if (direct) {
    const rates = { USD: direct }, receive = {};
    for (const currency of CURRENCIES) {
      if (currency !== 'USD') { const r = await viaDirect(currency); if (r) rates[currency] = r; }
      const back = await viaDirect(currency, true); if (back) receive[currency] = back;
    }
    return { source: 'visa', rates, receive: { ...rates, ...receive } };
  }
  const browser = await viaBrowser().catch(() => null);
  if (browser) return { source: 'visa', rates: browser.rates, receive: { ...browser.rates, ...browser.receive } };
  const market = await viaMarket();
  if (market) return { source: 'market', rates: market, receive: market };
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

// Réponse de /api/rates : taux de base de chaque devise (achat et réception), source et date d'observation.
export async function currentRates({ force = false } = {}) {
  const base = await getBaseRates({ force });
  if (!base) throw Object.assign(new Error('Taux VISA indisponibles pour le moment.'), { status: 503 });
  const shape = (list = {}) => Object.fromEntries(Object.entries(list).map(([currency, entry]) =>
    [currency, { base: entry.value, asOf: entry.asOf ? new Date(entry.asOf * 1000).toISOString() : null }]));
  return { source: base.source, observedAt: new Date(base.fetchedAt).toISOString(), rates: shape(base.rates), receive: shape(base.receive || base.rates),
    ...(base.source === 'market' ? { warning: 'VISA indisponible : taux du marché utilisé' } : {}) };
}
