// Cœur E-Pay MG : taux VISA (servis par le serveur E-Pay), calcul client et interne, devis.
// Script classique : setView, closeQuote et $ restent globaux (motion-polish.js les enveloppe).
const P = window.EpayPricing;

// Émetteur, documents et tarifs : valeurs d'origine, remplacées par Réglages (settings.js).
const OFFICE = { name: 'E-Pay MG', slogan: 'Paiements en devise', phone: '', email: '', address: '', nif: '', stat: '', mvola: '', orange: '', airtel: '', bankHolder: '', bankName: '', rib: '' };
const DOCS = { prefixes: { quote: 'EP', operation: 'OP' }, quoteValidityDays: 0, quoteNote: 'Le total correspond au montant converti augmenté des frais de service et de traitement applicables.' };
let TARIFS = { ...P.DEFAULTS, tiers: P.DEFAULTS.tiers.map(t => ({ ...t })) };
const MANUAL_BASE = { EUR: 0, USD: 0 };
let DEFAULT_DEBIT_MODE = 'foreign';
const viewHooks = {};
const NAV_FOR = { clients: 'suivi', settings: 'suivi' };

const $ = id => document.getElementById(id);
const $$ = s => Array.from(document.querySelectorAll(s));
function readStore(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
const cleanNumberText = v => String(v || '').replace(/[\s  ]/g, '').replace(/[^0-9.,-]/g, '').replace(/,/g, '.');
const parseInput = id => { const n = Number(cleanNumberText($(id)?.value)); return Number.isFinite(n) ? n : 0; };
const fmtNumber = (v, d = 0) => (Number.isFinite(v) ? new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v) : '—');
const fmtMGA = (v, d = 0) => (Number.isFinite(v) ? `${fmtNumber(v, d)} MGA` : '—');
const fmtCurrency = (v, c, d = 0) => (Number.isFinite(v) ? `${fmtNumber(v, d)} ${c}` : '—');
const fmtRate = v => (Number.isFinite(v) ? `${fmtNumber(v, 2)} MGA` : '—');
const escapeHTML = s => String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
function isoDate(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function displayDate(v) { if (!v) return '—'; const d = new Date(String(v).length === 10 ? `${v}T12:00:00` : v); return Number.isNaN(d.valueOf()) ? '—' : new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d); }
function addDays(iso, n) { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + (Number(n) || 0)); return isoDate(d); }
function makeId() { return globalThis.crypto?.randomUUID?.() || `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function docNumber(kind, day, n) { return `${DOCS.prefixes[kind] || 'EP'}-${day}-${String(n).padStart(3, '0')}`; }
function dayKey(d = new Date()) { return isoDate(d).replace(/-/g, ''); }

function formatInputValue(value) {
  const raw = String(value || '').replace(/[\s  ]/g, '').replace(/[^0-9.,]/g, '');
  if (!raw) return '';
  const m = raw.match(/[.,]/), i = m ? m.index : -1;
  const intPart = (m ? raw.slice(0, i) : raw).replace(/\D/g, '');
  const decPart = (m ? raw.slice(i + 1) : '').replace(/[.,\D]/g, '').slice(0, 2);
  const formatted = intPart ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(intPart)) : '0';
  return m ? `${formatted},${decPart}` : formatted;
}
function bindFormattedInput(id) { const el = $(id); el.addEventListener('input', () => { el.value = formatInputValue(el.value); refreshAll(); }); el.value = formatInputValue(el.value); }

// ---------- Taux ----------
// Stockage : taux VISA de base (sans frais). L'ancien format gardait le taux client (base + 4 %).
function loadRates() {
  const saved = readStore('epayAppRates', {}) || {};
  const ok = r => r && Number(r.EUR) > 0 && Number(r.USD) > 0;
  if (ok(saved.base)) return { base: { EUR: Number(saved.base.EUR), USD: Number(saved.base.USD) }, at: saved.date || null, source: saved.source || 'visa' };
  if (ok(saved.clientRates)) return { base: { EUR: saved.clientRates.EUR / 1.04, USD: saved.clientRates.USD / 1.04 }, at: null, source: 'ancien' };
  return { base: { ...P.FALLBACK_BASE }, at: null, source: 'secours' };
}
const savedRates = loadRates();
const savedMode = (() => { try { return localStorage.getItem('epayInternalDebitMode'); } catch { return null; } })();

const state = {
  currency: 'EUR', transferType: 'bank', view: 'client',
  debitMode: savedMode === 'direct' || savedMode === 'foreign' ? savedMode : null,
  base: savedRates.base, ratesAt: savedRates.at, ratesSource: savedRates.source, ratesBusy: false,
  quotes: readStore('epayQuotesV2', []).filter(q => q && q.id).map(normalizeQuote),
  editingQuoteId: null, editingQuoteBase: null, draftNumber: null, draftId: null, pendingQuoteId: null, prefill: null, nextPrefill: null
};

const baseRate = cur => (MANUAL_BASE[cur] > 0 ? MANUAL_BASE[cur] : Number(state.base[cur]) || P.FALLBACK_BASE[cur]);
const clientRateFor = cur => P.clientRate(baseRate(cur), TARIFS);
const ownerRateFor = cur => P.ownerRate(baseRate(cur), TARIFS);
const debitMode = () => state.debitMode || DEFAULT_DEBIT_MODE;
const calcClient = (amount, cur, type) => P.client(amount, clientRateFor(cur), type, TARIFS);
const calcOwner = (amount, cur, mode) => P.owner(amount, ownerRateFor(cur), mode || debitMode(), TARIFS);
const ratesAgeMs = () => { const t = new Date(state.ratesAt || 0).valueOf(); return Number.isFinite(t) && t > 0 ? Date.now() - t : Infinity; };

function rateStatus() {
  if (MANUAL_BASE[state.currency] > 0) return { text: `Taux ${state.currency} manuel (Suivi › Réglages › Taux)`, warn: true };
  const at = state.ratesAt ? new Date(state.ratesAt) : null;
  const when = at && !Number.isNaN(at.valueOf()) ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(at) : '';
  const stale = ratesAgeMs() > 6 * 3600e3;
  if (state.ratesSource === 'visa') return { text: `Taux VISA · ${when}${stale ? ' · à actualiser' : ''}`, warn: stale };
  if (state.ratesSource === 'market') return { text: `VISA indisponible : taux du marché · ${when}`, warn: true };
  return { text: 'Taux de secours : touche ↻ pour charger le taux VISA du jour', warn: true };
}
function renderRateStatus() {
  const s = rateStatus();
  $('rateStatus').textContent = state.ratesBusy ? 'Actualisation des taux VISA…' : s.text;
  $('statusDot').className = `status-dot${s.warn ? ' warn' : ''}`;
  $('rateDot').className = `rate-dot${s.warn ? ' warn' : ''}`;
}

// Taux du serveur E-Pay (le navigateur ne peut pas interroger VISA directement).
async function refreshVisa({ force = false, quiet = false } = {}) {
  if (state.ratesBusy) return false;
  state.ratesBusy = true; $('refreshRates').disabled = true; renderRateStatus();
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${window.EPAY.apiBase}/api/rates${force ? '?force=1' : ''}`, { signal: ctrl.signal, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `serveur ${res.status}`);
    const eur = Number(data.rates?.EUR?.base), usd = Number(data.rates?.USD?.base);
    if (!(eur > 0 && usd > 0)) throw new Error('réponse incomplète');
    state.base = { EUR: eur, USD: usd }; state.ratesAt = data.observedAt || new Date().toISOString(); state.ratesSource = data.source === 'market' ? 'market' : 'visa';
    try { localStorage.setItem('epayAppRates', JSON.stringify({ date: state.ratesAt, base: state.base, source: state.ratesSource })); } catch {}
    return true;
  } catch (e) {
    if (!quiet) showToast(`Taux non actualisés (${e.name === 'AbortError' ? 'délai dépassé' : e.message || 'réseau'}) : derniers taux connus utilisés.`, 'warn');
    return false;
  } finally {
    clearTimeout(timer); state.ratesBusy = false; $('refreshRates').disabled = false; refreshAll();
  }
}

// ---------- Calculs affichés ----------
function applyCurrencyUI() {
  $$('.rate-option').forEach(b => b.classList.toggle('active', b.dataset.currency === state.currency));
  const isEUR = state.currency === 'EUR';
  ['clientCurrencyDot', 'internalCurrencyDot'].forEach(id => { $(id).className = `currency-dot ${isEUR ? 'eur' : 'usd'}`; });
  ['clientCurrencyCode', 'clientCurrencyHint', 'internalCurrencyCode', 'internalCurrencyHint'].forEach(id => { $(id).textContent = state.currency; });
}
function updateRateStrip() {
  const rate = state.view === 'internal' ? ownerRateFor : clientRateFor;
  $('rateEUR').textContent = fmtNumber(rate('EUR'), 2);
  $('rateUSD').textContent = fmtNumber(rate('USD'), 2);
}
function updateClient() {
  const amount = parseInput('clientAmount'), t = calcClient(amount, state.currency, state.transferType);
  $$('[data-transfer-type]').forEach(b => b.classList.toggle('active', b.dataset.transferType === state.transferType));
  $('commissionChip').textContent = 'Frais inclus';
  $('clientTotal').textContent = t ? fmtNumber(t.total, 0) : '—';
  $('clientRateMeta').textContent = t ? `1 ${state.currency} = ${fmtNumber(t.rate, 2)} MGA` : '—';
  $('clientFeesMeta').textContent = t ? fmtMGA(t.serviceFeesMGA, 0) : '—';
  const budget = parseInput('budgetAmount'), rate = clientRateFor(state.currency);
  $('budgetBank').textContent = fmtCurrency(P.maxFromBudget(budget, rate, 'bank', TARIFS), state.currency, 0);
  $('budgetCash').textContent = fmtCurrency(P.maxFromBudget(budget, rate, 'cash', TARIFS), state.currency, 0);
  const pending = state.quotes.find(q => q.id === state.pendingQuoteId);
  if (state.pendingQuoteId && !pending) state.pendingQuoteId = null;
  $('openQuoteLabel').textContent = pending ? `Mettre à jour le devis ${pending.number}` : state.nextPrefill?.name ? `Créer un devis pour ${state.nextPrefill.name}` : 'Créer un devis';
  $('cancelQuoteEdit').hidden = !pending && !state.nextPrefill;
  $('cancelQuoteEdit').textContent = pending ? 'Annuler la modification du devis' : 'Annuler le devis pour ce client';
  if ($('quoteSheet').classList.contains('open') && !state.editingQuoteBase) renderDraftPreview();
}
function updateInternal() {
  const amount = parseInput('internalAmount'), mode = debitMode(), t = calcOwner(amount, state.currency, mode), c = calcClient(amount, state.currency, 'bank');
  $$('[data-debit-mode]').forEach(b => b.classList.toggle('active', b.dataset.debitMode === mode));
  $('internalDebitModeHint').textContent = mode === 'foreign' ? `Recharge ${fmtNumber(TARIFS.rechargeFeePercent, 2)} %` : 'Sans recharge';
  const ids = ['internalDebit', 'internalBuy', 'internalRate', 'netProfit', 'clientBank', 'rechargeFee', 'ownerFixedFee', 'marginPercent', 'netProfitCash'];
  if (!t || !c) { ids.forEach(id => { $(id).textContent = '—'; }); return; }
  const profit = c.bankTotal - t.debitMGA;
  $('internalDebit').textContent = fmtNumber(t.debitMGA, 0);
  $('internalBuy').textContent = fmtCurrency(t.totalToBuy, state.currency, 2);
  $('internalRate').textContent = fmtRate(t.rate);
  $('netProfit').textContent = fmtMGA(profit, 0);
  $('netProfit').closest('.kpi')?.classList.toggle('loss', profit < 0);
  $('clientBank').textContent = fmtMGA(c.bankTotal, 0);
  $('rechargeFee').textContent = t.rechargeFee > 0 ? fmtCurrency(t.rechargeFee, state.currency, 2) : '—';
  $('ownerFixedFee').textContent = fmtMGA(t.fixedFeeMGA, 0);
  $('marginPercent').textContent = `${fmtNumber(c.bankTotal > 0 ? profit / c.bankTotal * 100 : 0, 2)} %`;
  $('netProfitCash').textContent = fmtMGA(c.cashTotal - t.debitMGA, 0);
}
function refreshAll() { applyCurrencyUI(); updateRateStrip(); renderRateStatus(); updateClient(); updateInternal(); renderQuotes(); }

function setView(view) {
  if (!$(`${view}View`)) view = 'client';
  state.view = view;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `${view}View`));
  const nav = NAV_FOR[view] || view;
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === nav));
  updateRateStrip();
  try { viewHooks[view]?.(); } catch (e) { console.error('E-Pay vue :', e); }
  window.scrollTo({ top: 0 });
}

// ---------- Devis ----------
function quoteMode(q) { return q.transferType === 'cash' ? 'Espèces / Mobile Money' : 'Dépôt bancaire'; }
const quoteDate = q => q.ratedAt || q.createdAt;
function normalizeQuote(q) {
  const amount = Number(q.amount) || 0, rate = Number(q.rate) || 0, totalMGA = Number(q.totalMGA) || 0;
  const createdAt = String(q.createdAt || isoDate()).slice(0, 10);
  const has = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const convertedMGA = has(q.convertedMGA) ? Number(q.convertedMGA) : amount * rate;
  return {
    ...q, amount, rate, totalMGA, createdAt,
    currency: q.currency === 'USD' ? 'USD' : 'EUR', transferType: q.transferType === 'cash' ? 'cash' : 'bank',
    validUntil: q.validUntil || createdAt, convertedMGA,
    serviceFeesMGA: has(q.serviceFeesMGA) ? Number(q.serviceFeesMGA) : Math.max(0, totalMGA - convertedMGA),
    baseRate: Number(q.baseRate) || (rate > 0 ? rate / (1 + TARIFS.clientVisaFeePercent / 100) : 0),
    client: q.client || '', phone: q.phone || '', address: q.address || '', note: q.note || ''
  };
}
// Le numéro n'est consommé qu'à l'enregistrement : ouvrir puis fermer un devis ne crée pas de trou.
function nextQuoteNumber({ consume = false } = {}) {
  const key = dayKey(), store = 'epayQuoteSequenceV2', data = readStore(store, {}) || {};
  const used = state.quotes.map(q => String(q.number || '')).filter(n => n.includes(`-${key}-`)).map(n => Number(n.split('-').pop()) || 0);
  const n = Math.max(Number(data[key]) || 0, 0, ...used) + 1;
  if (consume) { data[key] = n; try { localStorage.setItem(store, JSON.stringify(data)); } catch {} }
  return docNumber('quote', key, n);
}
// Connecté : le serveur attribue le numéro (aucun doublon entre appareils) ; sinon, compteur local.
async function allocateQuoteNumber() {
  const local = nextQuoteNumber(), key = dayKey();
  if (window.EpaySync?.enabled()) try { return docNumber('quote', key, await EpaySync.number('quote', key, Number(local.split('-').pop()) || 1)); } catch { /* hors ligne : compteur local */ }
  return nextQuoteNumber({ consume: true });
}
// Montants d'un devis calculés aux taux et tarifs actuels.
function quoteFigures(amount, currency, transferType) {
  const t = calcClient(amount, currency, transferType);
  if (!t) return null;
  const today = isoDate();
  return {
    amount, currency, transferType, rate: t.rate, baseRate: baseRate(currency), manualRate: MANUAL_BASE[currency] > 0,
    totalMGA: t.total, convertedMGA: t.convertedMGA, serviceFeesMGA: t.serviceFeesMGA, includedFeesCurrency: t.includedFeesCurrency,
    commissionPercent: t.percent, bankTotal: t.bankTotal, cashTotal: t.cashTotal, ratedAt: today, validUntil: addDays(today, DOCS.quoteValidityDays)
  };
}
function quoteFields() {
  return { client: $('quoteClient').value.trim(), phone: $('quotePhone').value.trim(), address: $('quoteAddress').value.trim(), note: $('quoteNote').value.trim() };
}
function currentDraft() {
  const b = state.editingQuoteBase;
  if (b) return { ...b, ...quoteFields() };
  const figures = quoteFigures(parseInput('clientAmount'), state.currency, state.transferType)
    || { amount: 0, currency: state.currency, transferType: state.transferType, rate: clientRateFor(state.currency), totalMGA: 0, convertedMGA: 0, serviceFeesMGA: 0, ratedAt: isoDate() };
  const createdAt = isoDate();
  if (!state.draftId) state.draftId = makeId();
  return { id: state.draftId, number: state.draftNumber || nextQuoteNumber(), createdAt, validUntil: addDays(createdAt, DOCS.quoteValidityDays), ...figures, clientId: state.prefill?.id, ...quoteFields() };
}
function validityText(q) {
  return !q.validUntil || q.validUntil <= quoteDate(q) ? 'valable ce jour' : `valable jusqu’au ${displayDate(q.validUntil)}`;
}
function quoteRows(q) {
  return [
    { label: 'Montant à envoyer', detail: quoteMode(q), value: fmtCurrency(q.amount, q.currency, 2) },
    { label: 'Taux appliqué', detail: `1 ${q.currency}`, value: `${fmtNumber(q.rate, 2)} MGA` },
    { label: 'Montant converti', detail: 'Avant frais', value: fmtMGA(q.convertedMGA, 0) },
    { label: 'Frais de service & traitement', detail: 'Frais applicables inclus', value: fmtMGA(q.serviceFeesMGA, 0) }
  ];
}
// Coordonnées de règlement renseignées dans Réglages › Paiement.
function paymentLines() {
  const o = OFFICE, lines = [];
  if (o.mvola) lines.push(`MVola : ${o.mvola}`);
  if (o.orange) lines.push(`Orange Money : ${o.orange}`);
  if (o.airtel) lines.push(`Airtel Money : ${o.airtel}`);
  if (o.rib) lines.push(`Virement : ${[o.bankName, o.bankHolder, o.rib].filter(Boolean).join(' · ')}`);
  return lines;
}
function officeLine() { return [OFFICE.phone, OFFICE.email].filter(Boolean).join(' · '); }
function fillPreview(q) {
  $('previewBrand').textContent = OFFICE.name;
  $('previewNumber').textContent = q.number;
  $('previewDate').textContent = `${quoteDate(q) !== q.createdAt ? 'Taux du' : 'Émis le'} ${displayDate(quoteDate(q))} · ${validityText(q)}`;
  $('previewClient').textContent = q.client || 'Client non renseigné';
  const info = [q.phone, q.address].filter(Boolean).join(' · ');
  $('previewClientInfo').textContent = info; $('previewClientInfo').hidden = !info;
  $('previewTable').innerHTML = quoteRows(q).map(r => `<div class="preview-line"><div><span>${escapeHTML(r.label)}</span><strong>${escapeHTML(r.detail)}</strong></div><strong>${escapeHTML(r.value)}</strong></div>`).join('');
  $('previewTotal').textContent = fmtMGA(q.totalMGA, 0);
  $('previewNote').textContent = q.note || DOCS.quoteNote;
}
function renderDraftPreview() { fillPreview(currentDraft()); }
function setQuoteButtons(q) {
  const saved = Boolean(q && state.quotes.some(x => x.id === q.id));
  $('quoteSavedActions').hidden = !saved;
  $('deleteCurrentQuote').hidden = !saved;
  $('quoteOperationLabel').textContent = q?.operationId && window.EpayOperations?.get(q.operationId) ? 'Voir l’opération' : 'Créer l’opération';
}
function openQuote(q = null, prefill = null) {
  state.prefill = prefill || (q ? null : state.nextPrefill);
  state.nextPrefill = null; state.draftId = null;
  if (q) {
    state.editingQuoteId = q.id; state.editingQuoteBase = { ...q }; state.draftNumber = q.number;
    $('quoteClient').value = q.client || ''; $('quotePhone').value = q.phone || ''; $('quoteAddress').value = q.address || ''; $('quoteNote').value = q.note || '';
    $('quoteSheetTitle').textContent = `Devis ${q.number}`;
    const stale = !q.operationId && quoteDate(q) < isoDate();
    $('quoteSheetSub').textContent = stale ? `Taux du ${displayDate(quoteDate(q))} : touche « Taux du jour » avant de l’envoyer.` : 'Modifie le client ou la note, puis enregistre.';
  } else {
    const p = state.prefill;
    state.editingQuoteId = null; state.editingQuoteBase = null; state.draftNumber = null;
    $('quoteClient').value = p?.name || ''; $('quotePhone').value = p?.phone || ''; $('quoteAddress').value = p?.address || ''; $('quoteNote').value = '';
    $('quoteSheetTitle').textContent = 'Nouveau devis';
    $('quoteSheetSub').textContent = 'Renseigne le client, puis enregistre, envoie ou imprime.';
  }
  setQuoteButtons(q);
  updateClient();
  $('quoteSheet').classList.add('open'); document.body.style.overflow = 'hidden';
  $('quoteSheet').querySelector('.sheet').scrollTop = 0;
  renderDraftPreview();
}
function closeQuote() {
  $('quoteSheet').classList.remove('open');
  if (!document.querySelector('.sheet-backdrop.open')) document.body.style.overflow = '';
  state.editingQuoteId = null; state.editingQuoteBase = null; state.draftNumber = null; state.draftId = null; state.prefill = null;
}
function persistQuotes() {
  try { localStorage.setItem('epayQuotesV2', JSON.stringify(state.quotes)); window.EpaySync?.changed('quotes'); }
  catch { showToast('Mémoire du navigateur pleine : exporte une sauvegarde (Suivi › Réglages), puis supprime d’anciens devis.', 'error'); }
}
function replaceQuote(q) { const i = state.quotes.findIndex(x => x.id === q.id); if (i >= 0) state.quotes[i] = q; else state.quotes.unshift(q); persistQuotes(); renderQuotes(); }
let savingQuote = null;
function saveQuote() { return savingQuote || (savingQuote = saveQuoteNow().finally(() => { savingQuote = null; })); }
async function saveQuoteNow() {
  const q = currentDraft();
  if (!(q.totalMGA > 0)) { $('quoteSheetSub').textContent = 'Saisis d’abord un montant valide dans Calcul.'; return null; }
  if (q.client) { const client = window.EpayClients?.upsert({ id: q.clientId, name: q.client, phone: q.phone, address: q.address }); if (client) q.clientId = client.id; }
  q.updatedAt = new Date().toISOString();
  const i = state.quotes.findIndex(x => x.id === q.id);
  if (i >= 0) state.quotes[i] = q; else { q.number = await allocateQuoteNumber(); state.quotes.unshift(q); }
  persistQuotes();
  state.editingQuoteId = q.id; state.editingQuoteBase = { ...q }; state.draftNumber = q.number;
  $('quoteSheetTitle').textContent = `Devis ${q.number}`;
  $('quoteSheetSub').textContent = window.EpaySync?.enabled() ? 'Devis enregistré.' : 'Devis enregistré sur cet appareil.';
  setQuoteButtons(q); renderQuotes(); renderDraftPreview();
  return q;
}
function deleteQuote(id) {
  const i = state.quotes.findIndex(q => q.id === id); if (i < 0) return;
  const [removed] = state.quotes.splice(i, 1); persistQuotes(); renderQuotes();
  if (state.pendingQuoteId === id) { state.pendingQuoteId = null; updateClient(); }
  showToast(`Devis ${removed.number} supprimé.`, 'info', { label: 'Annuler', run: () => { state.quotes.splice(Math.min(i, state.quotes.length), 0, removed); persistQuotes(); renderQuotes(); } });
}
const changeText = (a, b) => (a.totalMGA === b.totalMGA ? `total inchangé (${fmtMGA(b.totalMGA, 0)})` : `total ${fmtMGA(a.totalMGA, 0)} → ${fmtMGA(b.totalMGA, 0)}`);
// « Taux du jour » : même montant, recalculé aux taux et tarifs d'aujourd'hui.
function refreshQuoteRate() {
  const q = state.quotes.find(x => x.id === state.editingQuoteId); if (!q) return;
  const figures = quoteFigures(q.amount, q.currency, q.transferType); if (!figures) return;
  const updated = { ...q, ...quoteFields(), ...figures, updatedAt: new Date().toISOString() };
  replaceQuote(updated); state.editingQuoteBase = { ...updated }; renderDraftPreview();
  $('quoteSheetSub').textContent = `Taux du jour appliqué : ${changeText(q, updated)}.`;
}
// « Modifier le calcul » : le devis revient dans Calcul ; le bouton du calcul le met à jour.
function editQuoteCalc() {
  const q = state.quotes.find(x => x.id === state.editingQuoteId); if (!q) return;
  state.pendingQuoteId = q.id; state.nextPrefill = null; state.currency = q.currency; state.transferType = q.transferType;
  $('clientAmount').value = formatInputValue(String(q.amount).replace('.', ','));
  closeQuote(); setView('client'); refreshAll();
  showToast(`Modifie le montant ou le mode, puis « Mettre à jour le devis ${q.number} ».`, 'info');
}
function applyPendingQuote() {
  const q = state.quotes.find(x => x.id === state.pendingQuoteId);
  if (!q) { state.pendingQuoteId = null; openQuote(); return; }
  const figures = quoteFigures(parseInput('clientAmount'), state.currency, state.transferType);
  if (!figures) { showToast('Saisis d’abord un montant valide.', 'warn'); return; }
  state.pendingQuoteId = null;
  const updated = { ...q, ...figures, updatedAt: new Date().toISOString() };
  replaceQuote(updated); updateClient(); setView('quotes'); openQuote(updated);
  $('quoteSheetSub').textContent = `Devis mis à jour : ${changeText(q, updated)}.`;
}
// Depuis une fiche client : le prochain devis créé dans Calcul lui est destiné.
function startQuoteFor(client) {
  state.pendingQuoteId = null; state.nextPrefill = client ? { id: client.id, name: client.name, phone: client.phone, address: client.address } : null;
  setView('client'); updateClient();
  showToast('Saisis le montant et le mode, puis « Créer un devis ».', 'info');
}
function renderQuotes() {
  const box = $('quotesContainer'); if (!box) return;
  if (!state.quotes.length) { box.innerHTML = '<div class="quotes-empty"><div class="empty-orb"><svg class="icon lg"><use href="#i-file"/></svg></div><h3>Aucun devis</h3><p>Crée un devis depuis le calcul client : il apparaîtra ici pour être envoyé, actualisé ou transformé en opération.</p><button class="secondary" data-new-quote><svg class="icon sm"><use href="#i-plus"/></svg>Nouveau devis</button></div>'; $('quoteSummary').textContent = ''; return; }
  const term = $('quoteSearch').value.trim().toLowerCase(), filter = $('quoteFilter').value, today = isoDate();
  const open = state.quotes.filter(q => !q.operationId);
  $('quoteSummary').textContent = `${state.quotes.length} devis · ${open.length} en attente (${fmtMGA(open.reduce((s, q) => s + (Number(q.totalMGA) || 0), 0), 0)})`;
  const list = state.quotes.filter(q => (filter === 'all' || (filter === 'done') === Boolean(q.operationId))
    && (!term || [q.client, q.number, q.phone, q.address, q.note, String(q.amount), q.currency].join(' ').toLowerCase().includes(term)));
  box.innerHTML = list.length ? `<div class="quote-list">${list.map(q => `<div class="quote-item" data-open-quote="${escapeHTML(q.id)}"><div class="quote-icon"><svg class="icon"><use href="#i-file"/></svg></div><div class="quote-main"><strong>${escapeHTML(q.client || q.number)}</strong><span>${escapeHTML(q.number)} · ${escapeHTML(fmtCurrency(q.amount, q.currency, 0))} · ${escapeHTML(displayDate(quoteDate(q)))}${q.operationId ? ' · opération' : ''}</span>${!q.operationId && quoteDate(q) < today ? '<em class="quote-tag">Taux à actualiser</em>' : ''}</div><div class="quote-amount">${escapeHTML(fmtMGA(q.totalMGA, 0))}</div></div>`).join('')}</div>` : '<p class="invoice-empty">Aucun devis ne correspond.</p>';
}
function quoteText(q) {
  const rows = quoteRows(q).map(r => `${r.label}${r.detail ? ` (${r.detail})` : ''} : ${r.value}`).join('\n');
  const pay = paymentLines();
  return `DEVIS ${q.number} · ${OFFICE.name}\n${displayDate(quoteDate(q))}, ${validityText(q)}\nClient : ${q.client || '—'}${q.phone ? `\nTéléphone : ${q.phone}` : ''}${q.address ? `\nAdresse : ${q.address}` : ''}\n\n${rows}\n\nTOTAL À PAYER : ${fmtMGA(q.totalMGA, 0)}${pay.length ? `\n\nRèglement :\n${pay.join('\n')}` : ''}\n\n${q.note || DOCS.quoteNote}${officeLine() ? `\n\n${OFFICE.name} · ${officeLine()}` : ''}`;
}
async function copyCurrentQuote() { try { await navigator.clipboard.writeText(quoteText(currentDraft())); $('quoteSheetSub').textContent = 'Devis copié : il peut être collé dans un message.'; } catch { $('quoteSheetSub').textContent = 'Copie impossible sur ce navigateur.'; } }
function whatsappQuote() {
  const q = currentDraft(); if (!(q.totalMGA > 0)) return;
  const intro = EpayUI.fill(window.EpaySettings?.messages().quote || 'Bonjour {client}, voici votre devis :', { client: q.client || '', entreprise: OFFICE.name });
  EpayUI.openWhatsApp(q.phone, `${intro}\n\n${quoteText(q)}`);
}
function printHeader(title, sub) {
  const ids = [OFFICE.nif && `NIF ${OFFICE.nif}`, OFFICE.stat && `STAT ${OFFICE.stat}`].filter(Boolean).join(' · ');
  return `<header class="print-head"><div class="print-brand"><svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14.75" fill="#0B0D12"/><path d="M37.51 22.75A14 14 0 1 0 37.51 41.25" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M22.25 32H52.75" stroke="#5B78FF" stroke-width="7" stroke-linecap="round"/></svg><div><strong>${escapeHTML(OFFICE.name)}</strong><span>${escapeHTML(OFFICE.slogan)}</span>${OFFICE.address ? `<span>${escapeHTML(OFFICE.address)}</span>` : ''}${officeLine() ? `<span>${escapeHTML(officeLine())}</span>` : ''}${ids ? `<span>${escapeHTML(ids)}</span>` : ''}</div></div><div class="print-title"><h1>${escapeHTML(title)}</h1><p>${escapeHTML(sub)}</p></div></header>`;
}
function printClient(q) {
  return `<section class="print-client"><div class="print-block"><span>Client</span><strong>${escapeHTML(q.client || 'Client non renseigné')}${q.phone ? `<br>${escapeHTML(q.phone)}` : ''}${q.address ? `<br>${escapeHTML(q.address)}` : ''}</strong></div></section>`;
}
function printPayment() { const pay = paymentLines(); return pay.length ? `<p class="print-note"><strong>Règlement :</strong> ${pay.map(escapeHTML).join(' · ')}</p>` : ''; }
function renderPrint(q) {
  const rows = quoteRows(q).map(r => `<tr><td>${escapeHTML(r.label)}</td><td>${escapeHTML(r.detail)}</td><td>${escapeHTML(r.value)}</td></tr>`).join('');
  $('printStage').innerHTML = `<article class="print-page">${printHeader('DEVIS', `${q.number} · ${displayDate(quoteDate(q))}`)}${printClient(q)}<table class="print-table"><thead><tr><th>Description</th><th>Détail</th><th>Montant</th></tr></thead><tbody>${rows}</tbody></table><div class="print-total"><span>Total à payer</span><strong>${escapeHTML(fmtMGA(q.totalMGA, 0))}</strong></div><p class="print-note">${escapeHTML(q.note || DOCS.quoteNote)} Offre ${escapeHTML(validityText(q))}.</p>${printPayment()}<footer class="print-footer"><span>${escapeHTML(OFFICE.name)} · Devis généré électroniquement</span><span>${escapeHTML(q.number)}</span></footer></article>`;
}
function printAnyQuote(q) { if (!q || !(q.totalMGA > 0)) return; renderPrint(q); setTimeout(() => window.print(), 60); }
async function quoteToOperation() {
  const q = await saveQuote(); if (!q) return;
  if (!window.EpayOperations) { $('quoteSheetSub').textContent = 'Module opérations indisponible : recharge la page.'; return; }
  closeQuote(); setView('operations');
  EpayOperations.fromQuote(q);
}

// ---------- Événements ----------
$$('.rate-option').forEach(b => b.addEventListener('click', () => { state.currency = b.dataset.currency; refreshAll(); }));
$$('[data-transfer-type]').forEach(b => b.addEventListener('click', () => { state.transferType = b.dataset.transferType; refreshAll(); }));
$$('[data-debit-mode]').forEach(b => b.addEventListener('click', () => { state.debitMode = b.dataset.debitMode; try { localStorage.setItem('epayInternalDebitMode', state.debitMode); } catch {} updateInternal(); }));
document.addEventListener('click', e => { const v = e.target.closest?.('[data-view]'); if (v) setView(v.dataset.view); });
['clientAmount', 'internalAmount', 'budgetAmount'].forEach(bindFormattedInput);
$('refreshRates').addEventListener('click', () => refreshVisa({ force: true }).then(ok => { if (ok) showToast(`Taux ${state.ratesSource === 'visa' ? 'VISA' : 'du marché'} actualisés.`, 'info'); }));
$('openQuote').addEventListener('click', () => (state.pendingQuoteId ? applyPendingQuote() : openQuote()));
$('cancelQuoteEdit').addEventListener('click', () => { const wasPending = Boolean(state.pendingQuoteId); state.pendingQuoteId = null; state.nextPrefill = null; updateClient(); if (wasPending) setView('quotes'); });
$('newQuoteTop').addEventListener('click', () => openQuote());
$('closeQuote').addEventListener('click', () => closeQuote());
$('quoteSheet').addEventListener('click', e => { if (e.target === $('quoteSheet')) closeQuote(); });
['quotePhone', 'quoteAddress', 'quoteNote'].forEach(id => $(id).addEventListener('input', renderDraftPreview));
$('quoteClient').addEventListener('input', renderDraftPreview); // clients.js complète téléphone et adresse d'un client connu
$('saveQuote').addEventListener('click', () => saveQuote());
$('copyQuote').addEventListener('click', copyCurrentQuote);
$('printQuote').addEventListener('click', () => printAnyQuote(currentDraft()));
$('exportQuoteImage').addEventListener('click', () => { const q = currentDraft(); if (q.totalMGA > 0) window.EpayExport?.quote(q); });
$('whatsappQuote').addEventListener('click', whatsappQuote);
$('quoteOperationBtn').addEventListener('click', quoteToOperation);
$('refreshQuoteRate').addEventListener('click', refreshQuoteRate);
$('editQuoteCalc').addEventListener('click', editQuoteCalc);
$('deleteCurrentQuote').addEventListener('click', () => { const id = state.editingQuoteId; if (!id) return; closeQuote(); deleteQuote(id); });
$('quoteSearch').addEventListener('input', renderQuotes);
$('quoteFilter').addEventListener('change', renderQuotes);
$('quotesContainer').addEventListener('click', e => {
  if (e.target.closest('[data-new-quote]')) { openQuote(); return; }
  const row = e.target.closest('[data-open-quote]');
  if (row) { const q = state.quotes.find(x => x.id === row.dataset.openQuote); if (q) openQuote(q); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const top = [...document.querySelectorAll('.sheet-backdrop.open')].sort((a, b) => (Number(b.style.zIndex) || 0) - (Number(a.style.zIndex) || 0))[0];
  if (!top) return;
  if (top.id === 'quoteSheet') closeQuote(); else EpayUI.closeSheet(top.id);
});
// Taux de plus d'une heure : actualisés au retour sur l'app.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ratesAgeMs() > 3600e3) refreshVisa({ quiet: true }); });
// Devis reçus d'un autre appareil : liste et devis ouvert remis à jour.
window.EpaySync?.onApply('quotes', () => {
  state.quotes = readStore('epayQuotesV2', []).filter(q => q && q.id).map(normalizeQuote); renderQuotes();
  const q = state.quotes.find(x => x.id === state.editingQuoteId);
  if (q && state.editingQuoteBase) { state.editingQuoteBase = { ...q }; renderDraftPreview(); setQuoteButtons(q); }
});

$('todayLabel').textContent = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date()).replace(/^./, c => c.toUpperCase());
refreshAll();
if (ratesAgeMs() > 3600e3 || state.ratesSource !== 'visa') refreshVisa({ quiet: true });
