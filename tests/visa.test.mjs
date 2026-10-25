import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVisaBaseRate, extractVisaRate, extractVisaReceiveRate } from '../server/lib/visa.mjs';

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

test('réception : Visa donne la devise pour 1 MGA, on garde des MGA pour 1 EUR', () => {
  // Vraie réponse du 25/10/2026, fromCurr=EUR&toCurr=MGA : 1 MGA = 0,0001950345 EUR.
  const { value, asOf } = extractVisaReceiveRate({ originalValues: { fxRateVisa: '0.0001950345', asOfDate: 1792886400 } });
  assert.equal(Math.round(value * 100) / 100, 5127.3);
  assert.equal(asOf, 1792886400);
  assert.equal(Math.round(value / 1.04 * 100) / 100, 4930.09); // calculateur VISA avec 4 % de frais
  assert.throws(() => extractVisaReceiveRate({ originalValues: { fxRateVisa: '5150.21' } }));
});
