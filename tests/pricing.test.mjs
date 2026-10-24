import test from 'node:test';
import assert from 'node:assert/strict';

await import('../web/assets/pricing.js');
const P = globalThis.EpayPricing;
const D = P.DEFAULTS;

test('mêmes totaux que l’ancien E-Pay (au même taux client)', () => {
  // Ancien E-Pay : 1 000 EUR en dépôt bancaire au taux client 5 053,77 = 5 605 000 MGA.
  const t = P.client(1000, 5053.77, 'bank', D);
  assert.equal(t.total, 5605000);
  assert.equal(t.percent, 2.99);
  assert.equal(P.client(1000, 5053.77, 'cash', D).total, 5746000);
});

test('commission par tranche', () => {
  assert.equal(P.commissionPercent(350, D), 4.99);
  assert.equal(P.commissionPercent(351, D), 3.99);
  assert.equal(P.commissionPercent(500, D), 3.99);
  assert.equal(P.commissionPercent(501, D), 2.99);
});

test('taux VISA de base → taux client (+4 %) et total arrondi au millier supérieur', () => {
  const rate = P.clientRate(5150.21, D);
  assert.equal(Math.round(rate * 100) / 100, 5356.22);
  const t = P.client(1000, rate, 'bank', D);
  assert.equal(t.total, 5940000);
  assert.equal(t.total % 1000, 0);
  assert.equal(Math.round(t.convertedMGA), 5356218);
  assert.equal(Math.round(t.serviceFeesMGA), t.total - Math.round(t.convertedMGA));
});

test('coût interne : carte étrangère (recharge 1 %) et débit direct', () => {
  const rate = P.ownerRate(5150.21, D);
  const foreign = P.owner(1000, rate, 'foreign', D), direct = P.owner(1000, rate, 'direct', D);
  assert.ok(foreign.debitMGA > direct.debitMGA);
  assert.equal(Math.round(direct.debitMGA), Math.round(1000 * rate + D.ownerFixedFeeMGA));
  const profit = P.client(1000, P.clientRate(5150.21, D), 'bank', D).total - foreign.debitMGA;
  assert.ok(profit > 500000 && profit < 600000, `bénéfice ${profit}`);
});

test('tarifs personnalisés pris en compte', () => {
  const cfg = { ...D, tiers: [{ below: 100, percent: 10 }, { below: 200, percent: 5 }, { below: null, percent: 1 }], roundTo: 500 };
  assert.equal(P.commissionPercent(150, cfg), 5);
  assert.equal(P.client(1000, 5000, 'bank', cfg).total % 500, 0);
});
