import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const web = new URL('../web/', import.meta.url);
const read = (path) => readFileSync(new URL(path, web), 'utf8');
const html = read('index.html');
const scripts = readdirSync(new URL('assets/', web)).filter(f => f.endsWith('.js')).map(f => `assets/${f}`);

test('le même numéro de build pour la page et le service worker', () => {
  const build = /const BUILD = '([^']+)'/.exec(read('config.js'))?.[1];
  assert.ok(build);
  assert.match(read('sw.js'), new RegExp(build));
});

test('toutes les ressources locales référencées existent, et chaque script est chargé', () => {
  const refs = new Set();
  for (const m of html.matchAll(/(?:href|src)="((?:assets\/|manifest)[^"?#]+)/g)) refs.add(m[1]);
  const loaded = [...read('assets/app.js').matchAll(/'(assets\/[^']+)'/g)].map(m => m[1]);
  for (const f of loaded) refs.add(f);
  for (const icon of JSON.parse(read('manifest.webmanifest')).icons || []) refs.add(icon.src);
  for (const ref of refs) assert.ok(existsSync(new URL(ref, web)), `manquant : ${ref}`);
  for (const f of scripts.filter(f => f !== 'assets/app.js')) assert.ok(loaded.includes(f), `${f} n’est pas chargé par app.js`);
});

test('chaque identifiant utilisé par les scripts existe dans la page', () => {
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  // Créés par script (fiche opération, infobulle du graphique).
  for (const f of scripts) for (const m of read(f).matchAll(/id="([A-Za-z][\w-]*)"/g)) ids.add(m[1]);
  ids.add('themeToggle');
  for (const f of scripts) {
    for (const m of read(f).matchAll(/(?:\bel|\$|getElementById|openSheet|closeSheet)\(['"]([A-Za-z][\w-]*)['"]\)/g)) assert.ok(ids.has(m[1]), `#${m[1]} (${f}) absent de index.html`);
  }
});

test('chaque vue appelée par setView ou data-view existe', () => {
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const views = new Set([...html.matchAll(/data-view="([a-z]+)"/g)].map(m => m[1]));
  for (const f of scripts) for (const m of read(f).matchAll(/setView\(['"]([a-z]+)['"]\)/g)) views.add(m[1]);
  for (const v of views) assert.ok(ids.has(`${v}View`), `vue #${v}View absente`);
});

test('le navigateur n’appelle jamais VISA directement (bloqué par CORS) : taux via le serveur HELPEO', () => {
  for (const f of ['index.html', 'config.js', ...scripts]) assert.ok(!/visa\.com|visa\.fr|corsproxy|allorigins/.test(read(f)), f);
  assert.match(read('assets/app-core.js'), /\/api\/rates/);
});

test('aucune mention de paiement ni de transfert dans ce que voit le client', () => {
  const visible = [html, read('manifest.webmanifest'), read('assets/export-image.js')].join('\n').replace(/<script[\s\S]*?<\/script>/g, '');
  for (const word of [/paiement/i, /transfert/i, /\bpayer\b/i, /envois? d/i]) assert.ok(!word.test(visible), `${word} encore présent`);
  const core = read('assets/app-core.js');
  for (const k of ['slogan', 'legal', 'quoteNote']) {
    const v = new RegExp(`${k}: '([^']+)'`).exec(core)?.[1] || '';
    assert.ok(v && !/paiement|transfert|payer/i.test(v), `${k} : ${v}`);
  }
});
