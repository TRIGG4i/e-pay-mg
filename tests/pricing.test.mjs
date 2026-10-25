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
  assert.equal(direct.debits, 2); // 5 330 467 MGA > 4 999 000 : deux débits de carte
  assert.equal(Math.round(direct.debitMGA), Math.round(1000 * rate + 2 * D.ownerFixedFeeMGA));
  const profit = P.client(1000, P.clientRate(5150.21, D), 'bank', D).total - foreign.debitMGA;
  assert.ok(profit > 500000 && profit < 600000, `bénéfice ${profit}`);
});

test('plafond de carte : 5 000 000 MGA par débit, frais fixe de 1 000 compris', () => {
  const one = P.owner(4999000, 1, 'direct', D);
  assert.deepEqual([one.debits, one.fixedFeeMGA, one.debitMGA], [1, 1000, 5000000]);
  const two = P.owner(4999001, 1, 'direct', D);
  assert.deepEqual([two.debits, two.fixedFeeMGA, two.lastDebitMGA, two.debitMGA], [2, 2000, 1001, 5001001]);
  const big = P.owner(16000000, 1, 'direct', D); // 4 × 4 999 000 couvrent 19 996 000
  assert.deepEqual([big.debits, big.fixedFeeMGA, big.debitMGA], [4, 4000, 16004000]);
  assert.equal(big.perDebitMGA * 3 + big.lastDebitMGA - big.feePerDebitMGA, 16000000);
  const free = P.owner(16000000, 1, 'direct', { ...D, ownerCardLimitMGA: 0 });
  assert.deepEqual([free.debits, free.debitMGA], [1, 16001000]);
  // 1 000 EUR par carte étrangère : 5 384 310 MGA achetés, donc deux débits (5 000 000 + 386 310).
  const eur = P.owner(1000, P.ownerRate(5150.21, D), 'foreign', D);
  assert.deepEqual([eur.debits, Math.round(eur.lastDebitMGA), Math.round(eur.debitMGA)], [2, 386310, 5386310]);
});

test('tarifs personnalisés pris en compte', () => {
  const cfg = { ...D, tiers: [{ below: 100, percent: 10 }, { below: 200, percent: 5 }, { below: null, percent: 1 }], roundTo: 500 };
  assert.equal(P.commissionPercent(150, cfg), 5);
  assert.equal(P.client(1000, 5000, 'bank', cfg).total % 500, 0);
});

test('réception : taux VISA inverse moins 4 % de frais, puis commission du palier dans le taux', () => {
  // Calculateur VISA du 25/10/2026, carte en EUR, dépense en MGA : 1 EUR = 5 127,30 MGA, 4 930,09 avec 4 % de frais.
  const base = 1 / 0.0001950345;
  assert.equal(Math.round(P.receiveVisaRate(base, D) * 100) / 100, 4930.09);
  const r = P.receive(1000, base, D);
  assert.equal(r.percent, 2.99);
  assert.equal(Math.round(r.rate * 100) / 100, 4782.68);
  assert.equal(r.payout, 4782600); // arrondi à la centaine inférieure
  assert.equal(Math.round(r.marginMGA), Math.round(1000 * r.visaRate) - 4782600);
  assert.equal(P.receive(350, base, D).percent, 4.99);
  assert.equal(P.receive(0, base, D), null);
});

test('réception : montant en devise à recevoir pour remettre un montant en ariary', () => {
  const base = 5127.3;
  for (const target of [500000, 1639400, 10000000]) {
    const need = P.receiveForPayout(target, base, D);
    assert.ok(P.receive(need, base, D).payout >= target, `${need} suffit pour ${target}`);
    assert.ok(P.receive(need - 0.01, base, D).payout < target, `${need} est le minimum pour ${target}`);
  }
});
