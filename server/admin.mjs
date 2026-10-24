#!/usr/bin/env node
// Administration de la base de gestion E-Pay MG, sur le serveur.
//   node server/admin.mjs activation --html <fichier> [--secret <fichier>] [--hours 48]
//     crée un lien d'activation à usage unique (premier mot de passe ou mot de passe oublié) ;
//     le lien n'est écrit que dans les fichiers indiqués, jamais à l'écran ni dans un journal.
//   node server/admin.mjs status
import { writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from './lib/store.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback = '') => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const store = openStore(process.env.EPAY_DATA_DIR || path.join(os.homedir(), 'apps', 'epay-data'));
const APP_URL = opt('app-url', process.env.EPAY_APP_URL || 'https://trigg4i.github.io/e-pay-mg/');

try {
  if (args[0] === 'activation') {
    const html = opt('html'), secret = opt('secret'), hours = Number(opt('hours', '48')) || 48;
    if (!html && !secret) throw new Error('indique --html ou --secret');
    const link = `${APP_URL}#activer=${store.auth.createActivation(hours)}`;
    if (secret) { mkdirSync(path.dirname(secret), { recursive: true, mode: 0o700 }); writeFileSync(secret, `${link}\n`, { mode: 0o600 }); chmodSync(secret, 0o600); }
    if (html) {
      mkdirSync(path.dirname(html), { recursive: true });
      writeFileSync(html, `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>Activer E-Pay MG</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f5f1;font:16px/1.5 system-ui,sans-serif;color:#0b0d12}main{max-width:340px;padding:28px;text-align:center}a{display:block;margin-top:18px;padding:14px 18px;border-radius:14px;background:#0e1118;color:#fff;font-weight:800;text-decoration:none}p{color:#787d87;font-size:14px}</style></head>
<body><main><h1>E-Pay MG</h1><p>Lien à usage unique, valable ${hours} h : il ouvre E-Pay MG et te fait choisir ton mot de passe.</p><a href="${link}">Activer E-Pay MG sur cet appareil</a></main></body></html>\n`, { mode: 0o644 });
    }
    console.log(`Lien d’activation créé, valable ${hours} h${html ? ` : ${html}` : ''}${secret ? ` (copie privée : ${secret})` : ''}.`);
  } else if (args[0] === 'status') {
    const { changes } = store.pull(0, 100000);
    const counts = {};
    for (const c of changes) if (!c.deleted) counts[c.coll] = (counts[c.coll] || 0) + 1;
    console.log(JSON.stringify({ activated: store.auth.hasPassword(), activationPending: store.auth.activationPending(), devices: store.auth.sessions().length, records: counts }));
  } else {
    throw new Error('commande inconnue (activation, status)');
  }
} catch (error) {
  console.error(`admin E-Pay : ${error.message}`);
  process.exitCode = 1;
} finally { store.close(); }
