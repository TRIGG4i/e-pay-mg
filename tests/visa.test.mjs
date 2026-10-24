import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVisaBaseRate, extractVisaRate } from '../server/lib/visa.mjs';

// Extrait d'une vraie réponse /cmsapi/fx/rates (fee=0), 23/10/2026.
const sample = { originalValues: { fxRateVisa: '4583.63', asOfDate: 1792713600, toAmountWithAdditionalFee: '4583.63' }, conversionAmountValue: '1', fxRateWithAdditionalFee: '4583.63' };

test('le taux Visa de base vient de fxRateVisa', () => {
  const { value, asOf } = extractVisaBaseRate(sample);
  assert.equal(value, 4583.63);
  assert.equal(asOf, 1792713600);
});

test('frais bancaires : même formule que Visa (taux × (1 + frais/100))', () => {
  const base = extractVisaBaseRate(sample).value;
  assert.equal(Math.round(base * 1.04 * 100) / 100, 4766.98); // client, 4 %
  assert.equal(Math.round(base * 1.035 * 100) / 100, 4744.06); // coût réel, 3,5 %
});

test('repli générique si fxRateVisa est absent', () => {
  assert.equal(extractVisaBaseRate({ fxRateWithAdditionalFee: '4766.98' }).value, 4766.98);
  assert.throws(() => extractVisaRate({ foo: 'bar' }));
});
