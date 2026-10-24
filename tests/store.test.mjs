import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStore } from '../server/lib/store.mjs';

const fresh = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'epay-store-'));
  const store = openStore(dir);
  return { dir, store, done: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
};

test('activation à usage unique, puis connexion par mot de passe', async () => {
  const { store, done } = fresh();
  try {
    assert.equal(store.auth.hasPassword(), false);
    await assert.rejects(store.auth.login('motdepasse-solide', 'Android'), /pas encore activé/);
    const link = store.auth.createActivation(1);
    await assert.rejects(store.auth.activate('faux-jeton-faux-jeton-faux', 'motdepasse-solide', 'Android'), { status: 403 });
    await assert.rejects(store.auth.activate(link, 'court', 'Android'), /trop court/);
    const first = await store.auth.activate(link, 'motdepasse-solide', 'Android');
    assert.ok(store.auth.session(first));
    await assert.rejects(store.auth.activate(link, 'autre-motdepasse', 'Android'), { status: 403 }, 'le lien ne sert qu’une fois');
    await assert.rejects(store.auth.login('mauvais-motdepasse', 'PC'), { status: 401 });
    const second = await store.auth.login('motdepasse-solide', 'PC');
    const s2 = store.auth.session(second);
    assert.equal(store.auth.sessions(s2).length, 2);
    await store.auth.changePassword(s2, 'motdepasse-solide', 'nouveau-motdepasse');
    assert.equal(store.auth.session(first), null);
    assert.ok(store.auth.session(second));
    store.auth.logout(s2);
    assert.equal(store.auth.session(second), null);
  } finally { done(); }
});

test('synchronisation : opérations, conflit et suppression', () => {
  const { store, done } = fresh();
  try {
    assert.equal(store.push([{ coll: 'operations', id: 'o1', data: { id: 'o1', status: 'attente' }, mtime: '2026-10-24T08:00:00Z', baseRev: 0 }], 'A')[0].ok, true);
    const rev1 = store.pull(0).rev;
    assert.equal(store.push([{ coll: 'operations', id: 'o1', data: { id: 'o1', status: 'paye' }, mtime: '2026-10-24T09:00:00Z', baseRev: rev1 }], 'B')[0].ok, true);
    const stale = store.push([{ coll: 'operations', id: 'o1', data: { id: 'o1', status: 'annulee' }, mtime: '2026-10-24T08:30:00Z', baseRev: rev1 }], 'A')[0];
    assert.equal(stale.ok, false);
    assert.equal(stale.record.data.status, 'paye');
    assert.equal(store.push([{ coll: 'operations', id: 'o1', deleted: true, mtime: '2026-10-24T11:00:00Z', baseRev: store.pull(0).rev }], 'A')[0].ok, true);
    assert.equal(store.pull(rev1).changes.at(-1).deleted, true);
    for (const coll of ['quotes', 'clients', 'settings']) assert.equal(store.push([{ coll, id: 'x', data: { id: 'x' } }], 'A')[0].ok, true);
    assert.throws(() => store.push([{ coll: 'invoices', id: 'x', data: {} }]), /Collection inconnue/);
    assert.throws(() => store.push([{ coll: 'quotes', id: 'x', data: [] }]), /Donnée invalide/);
  } finally { done(); }
});

test('numéros de devis et d’opération : uniques, au-dessus des numéros déjà utilisés', () => {
  const { store, done } = fresh();
  try {
    assert.equal(store.allocate('operation', '20261024'), 1);
    assert.equal(store.allocate('operation', '20261024'), 2);
    store.push([{ coll: 'quotes', id: 'q9', data: { id: 'q9', number: 'EP-20261024-007' } }], 'A');
    assert.equal(store.allocate('quote', '20261024'), 8);
    assert.equal(store.allocate('operation', '20261024'), 3, 'compteurs indépendants');
    store.mergeSeqs({ operation: { 20261024: 12 }, bad: { x: 1 } });
    assert.equal(store.allocate('operation', '20261024'), 13);
    assert.equal(store.allocate('quote', '20261024', 20), 20);
    assert.throws(() => store.allocate('invoice', '20261024'), /inconnu/);
  } finally { done(); }
});

test('sauvegarde quotidienne de la base', () => {
  const { store, done } = fresh();
  try {
    store.push([{ coll: 'clients', id: 'c1', data: { id: 'c1', name: 'Rakoto' } }], 'A');
    assert.ok(existsSync(store.backup()));
  } finally { done(); }
});
