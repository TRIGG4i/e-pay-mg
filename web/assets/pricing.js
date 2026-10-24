// Moteur de prix E-Pay MG : total client et coût interne d'un paiement en devise.
// Sans DOM ni stockage : partagé par l'app et les tests. Les taux reçus sont des taux VISA
// de base (sans frais) ; chaque marge vient des tarifs (Réglages › Tarifs).
(function (root) {
  'use strict';
  const DEFAULTS = Object.freeze({
    // Commission selon le montant envoyé (en devise) : 4,99 % sous 351, 3,99 % sous 501, 2,99 % au-delà.
    tiers: [{ below: 351, percent: 4.99 }, { below: 501, percent: 3.99 }, { below: null, percent: 2.99 }],
    bankCurrencyFeePercent: 4.45,
    cardFeePercent: 3,
    fixedVisaFeeMGA: 4500,
    cashFeePercent: 2.5,
    roundTo: 1000,
    clientVisaFeePercent: 4,
    ownerVisaFeePercent: 3.5,
    rechargeFeePercent: 1,
    ownerFixedFeeMGA: 1000,
    // Plafond d'un débit de la carte VISA malgache (par carte et par jour), frais fixe compris ; 0 = sans plafond.
    ownerCardLimitMGA: 5000000
  });
  const CURRENCIES = ['EUR', 'USD'];
  // Taux VISA de base observés le 24/10/2026 : seulement si aucun taux n'a jamais pu être chargé.
  const FALLBACK_BASE = Object.freeze({ EUR: 5150.21, USD: 4584.9 });

  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const roundUp = (value, unit) => (unit > 0 ? Math.ceil(value / unit) * unit : value);
  const config = cfg => ({ ...DEFAULTS, ...(cfg || {}) });

  function commissionPercent(amount, cfg) {
    const tiers = config(cfg).tiers;
    const tier = tiers.find(t => t.below == null || amount < t.below) || tiers[tiers.length - 1];
    return num(tier?.percent);
  }

  // Taux appliqués : base VISA + marge bancaire du client, ou de la carte du propriétaire.
  function clientRate(base, cfg) { return base > 0 ? base * (1 + config(cfg).clientVisaFeePercent / 100) : NaN; }
  function ownerRate(base, cfg) { return base > 0 ? base * (1 + config(cfg).ownerVisaFeePercent / 100) : NaN; }

  // Total à payer par le client (MGA) pour envoyer `amount` en devise au taux client `rate`.
  function client(amount, rate, mode, cfg) {
    const c = config(cfg);
    if (!(amount > 0) || !(rate > 0)) return null;
    const percent = commissionPercent(amount, c);
    const commission = amount * percent / 100;
    const bankCurrencyFee = (amount + commission) * c.bankCurrencyFeePercent / 100;
    const foreignSubtotal = amount + commission + bankCurrencyFee;
    const mgaSubtotal = foreignSubtotal * rate;
    const visaFee = mgaSubtotal * c.cardFeePercent / 100 + c.fixedVisaFeeMGA;
    const bankTotal = roundUp(mgaSubtotal + visaFee, c.roundTo);
    const cashFee = roundUp(bankTotal * c.cashFeePercent / 100, 100);
    const cashTotal = roundUp(bankTotal + cashFee, c.roundTo);
    const total = mode === 'cash' ? cashTotal : bankTotal;
    const convertedMGA = amount * rate;
    return {
      rate, percent, commission, bankCurrencyFee, foreignSubtotal, mgaSubtotal, visaFee, bankTotal, cashFee, cashTotal, total,
      convertedMGA, serviceFeesMGA: Math.max(0, total - convertedMGA), includedFeesCurrency: Math.max(0, (total - convertedMGA) / rate)
    };
  }

  // Coût réel pour le propriétaire : débit direct, ou carte étrangère rechargée (frais de recharge).
  // La carte malgache est débitée par tranches : chaque débit, frais fixe compris, reste sous le plafond
  // (5 000 000 MGA : 4 999 000 achetés + 1 000 de frais). Plusieurs débits = plusieurs cartes ou plusieurs jours.
  function owner(amount, rate, debitMode, cfg) {
    const c = config(cfg);
    if (!(amount > 0) || !(rate > 0)) return null;
    const foreign = debitMode === 'foreign';
    const totalToBuy = foreign ? amount / (1 - c.rechargeFeePercent / 100) : amount;
    const rechargeFee = foreign ? totalToBuy * c.rechargeFeePercent / 100 : 0;
    const buyMGA = totalToBuy * rate;
    const fee = num(c.ownerFixedFeeMGA), limit = num(c.ownerCardLimitMGA);
    const perDebitMGA = limit > fee ? limit - fee : Infinity;
    const debits = Number.isFinite(perDebitMGA) ? Math.max(1, Math.ceil(buyMGA / perDebitMGA - 1e-9)) : 1;
    const fixedFeeMGA = debits * fee;
    return {
      rate, totalToBuy, rechargeFee, buyMGA, debits, perDebitMGA, feePerDebitMGA: fee, fixedFeeMGA,
      cardLimitMGA: Number.isFinite(perDebitMGA) ? limit : 0,
      lastDebitMGA: buyMGA - (debits - 1) * (Number.isFinite(perDebitMGA) ? perDebitMGA : 0) + fee,
      debitMGA: buyMGA + fixedFeeMGA, debitMode: foreign ? 'foreign' : 'direct'
    };
  }

  // Montant maximal envoyable avec un budget en ariary (recherche par dichotomie, arrondi à l'unité inférieure).
  function maxFromBudget(budget, rate, mode, cfg) {
    if (!(budget > 0) || !(rate > 0)) return 0;
    const total = a => client(a, rate, mode, cfg)?.total ?? Infinity;
    let low = 0, high = Math.max(1, budget / rate), guard = 0;
    while (total(high) < budget && guard++ < 40) high *= 2;
    for (let i = 0; i < 50; i++) { const mid = (low + high) / 2; if (total(mid) <= budget) low = mid; else high = mid; }
    return Math.floor(low);
  }

  const api = { DEFAULTS, CURRENCIES, FALLBACK_BASE, commissionPercent, clientRate, ownerRate, client, owner, maxFromBudget };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EpayPricing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
