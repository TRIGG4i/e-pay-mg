// API privée de HELPEO : taux VISA du jour, compte du propriétaire et synchronisation
// des devis, opérations, clients et réglages entre ses appareils.
import http from 'node:http';
import os from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentRates, getBaseRates } from './lib/visa.mjs';
import { openStore } from './lib/store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../web');
const PORT = Number(process.env.PORT || 4281);
const PUBLIC_ORIGIN = String(process.env.PUBLIC_ORIGIN || 'https://trigg4i.github.io').replace(/\/$/, '');
const store = openStore(process.env.EPAY_DATA_DIR || path.join(os.homedir(), 'apps', 'epay-data'));
// Tests : taux fixes, sans appel à VISA (EPAY_FIXED_RATES='{"EUR":5000,"USD":4500,"receive":{"EUR":4980,"USD":4500}}').
const FIXED_RATES = (() => { try { return JSON.parse(process.env.EPAY_FIXED_RATES || 'null'); } catch { return null; } })();
const buckets = new Map();
const authFailures = new Map();

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};

const allowedOrigin = (req) => {
  const origin = req.headers.origin || '';
  const allowed = new Set([PUBLIC_ORIGIN, `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);
  return allowed.has(origin) ? origin : '';
};
const apiHeaders = (req) => {
  const origin = allowedOrigin(req);
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  } : {};
};

const readBody = async (req, max = 65536) => {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw Object.assign(new Error('Requête trop volumineuse'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('JSON invalide'), { status: 400 }); }
};

// Adresse du client : l'en-tête X-Forwarded-For n'est cru que s'il vient de Caddy (même machine).
const clientIp = (req) => {
  const remote = String(req.socket.remoteAddress || '');
  const local = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  const forwarded = local ? String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean).at(-1) : '';
  return forwarded || remote;
};
const limited = (req) => {
  const ip = clientIp(req), now = Date.now();
  const current = buckets.get(ip) || { start: now, count: 0 };
  if (now - current.start > 60000) { current.start = now; current.count = 0; }
  current.count += 1; buckets.set(ip, current);
  return current.count > 120;
};

// Échecs de connexion : 6 par adresse et par quart d'heure, 60 au total par heure.
const authBlocked = (ip) => {
  const now = Date.now();
  for (const [key, v] of authFailures) if (now - v.start > (key === '*' ? 3600000 : 900000)) authFailures.delete(key);
  return (authFailures.get(ip)?.count || 0) >= 6 || (authFailures.get('*')?.count || 0) >= 60;
};
const authFailed = (ip) => {
  for (const key of [ip, '*']) { const v = authFailures.get(key) || { start: Date.now(), count: 0 }; v.count += 1; authFailures.set(key, v); }
};
const guarded = async (req, fn) => {
  const ip = clientIp(req);
  if (authBlocked(ip)) throw Object.assign(new Error('Trop d’essais : réessaie dans 15 minutes.'), { status: 429 });
  try { return await fn(ip); } catch (error) { if ([401, 403].includes(error.status)) authFailed(ip); throw error; }
};
const bearer = (req) => /^Bearer\s+([A-Za-z0-9_-]{20,})$/.exec(String(req.headers.authorization || ''))?.[1] || '';
const requireSession = (req) => {
  const session = store.auth.session(bearer(req));
  if (!session) throw Object.assign(new Error('Session expirée : reconnecte-toi dans Réglages.'), { status: 401 });
  return session;
};

async function rates(force) {
  if (FIXED_RATES) {
    const at = new Date().toISOString();
    const shape = list => Object.fromEntries(Object.entries(list).filter(([c]) => c !== 'receive').map(([c, v]) => [c, { base: Number(v), asOf: at }]));
    return { source: 'test', observedAt: at, rates: shape(FIXED_RATES), receive: shape(FIXED_RATES.receive || FIXED_RATES) };
  }
  return currentRates({ force });
}

// Copie locale de l'app (tests et dépannage) ; en production, l'app est servie par GitHub Pages.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json' };
async function serveStatic(res, pathname) {
  const target = path.resolve(webRoot, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
  if (!target.startsWith(webRoot + path.sep)) return false;
  try {
    if (!(await stat(target)).isFile()) return false;
    const ext = path.extname(target);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(target)); return true;
  } catch { return false; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const headers = apiHeaders(req);
  const api = url.pathname.startsWith('/api/');

  if (api && req.method === 'OPTIONS') { res.writeHead(allowedOrigin(req) ? 204 : 403, headers); res.end(); return; }
  if (api && req.headers.origin && !allowedOrigin(req)) { json(res, 403, { error: 'Origine non autorisée' }); return; }
  if (api && limited(req)) { json(res, 429, { error: 'Trop de requêtes' }, headers); return; }

  try {
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /healthz') { json(res, 200, { ok: true, service: 'epay-api', time: new Date().toISOString() }); return; }
    if (route === 'GET /api/rates') { json(res, 200, await rates(url.searchParams.get('force') === '1'), headers); return; }
    if (route === 'GET /api/auth/status') {
      const session = store.auth.session(bearer(req));
      json(res, 200, { activated: store.auth.hasPassword(), session: session ? { device: session.device } : null }, headers); return;
    }
    if (route === 'POST /api/auth/activate') {
      const body = await readBody(req);
      const token = await guarded(req, ip => store.auth.activate(body.token, body.password, body.device, ip));
      json(res, 200, { token }, headers); return;
    }
    if (route === 'POST /api/auth/login') {
      const body = await readBody(req);
      const token = await guarded(req, ip => store.auth.login(body.password, body.device, ip));
      json(res, 200, { token }, headers); return;
    }
    if (api) {
      const session = requireSession(req);
      if (route === 'POST /api/auth/logout') { store.auth.logout(session); json(res, 200, { ok: true }, headers); return; }
      if (route === 'GET /api/auth/sessions') { json(res, 200, { sessions: store.auth.sessions(session) }, headers); return; }
      if (route === 'POST /api/auth/revoke') { const body = await readBody(req); store.auth.revoke(body.id, session); json(res, 200, { ok: true }, headers); return; }
      if (route === 'POST /api/auth/password') {
        const body = await readBody(req);
        await guarded(req, ip => store.auth.changePassword(session, body.current, body.next, ip));
        json(res, 200, { ok: true }, headers); return;
      }
      if (route === 'POST /api/sync') {
        const body = await readBody(req, 8_000_000);
        store.mergeSeqs(body.seqs);
        const results = store.push(body.changes || [], session.device);
        json(res, 200, { results, ...store.pull(body.since), seqs: store.seqs() }, headers); return;
      }
      if (route === 'POST /api/number') {
        const body = await readBody(req);
        json(res, 200, { n: store.allocate(String(body.kind || ''), String(body.day || ''), body.min) }, headers); return;
      }
      json(res, 404, { error: 'Introuvable' }, headers); return;
    }
    if (req.method === 'GET' && await serveStatic(res, url.pathname)) return;
    json(res, 404, { error: 'Introuvable' });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error('HELPEO API :', error.message);
    json(res, status, { error: error.message || 'Erreur' }, headers);
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`HELPEO API : http://127.0.0.1:${PORT}`));

// Le taux VISA passe par un navigateur (~10 s) : préchargé au démarrage puis chaque heure.
if (!FIXED_RATES) {
  const warm = () => getBaseRates().catch(() => null);
  setTimeout(warm, 1500).unref();
  setInterval(warm, 61 * 60 * 1000).unref();
}
// Copie quotidienne de la base (30 jours gardés).
const backup = () => { try { store.backup(); } catch (error) { console.error('Sauvegarde HELPEO :', error.message); } };
setTimeout(backup, 5000).unref();
setInterval(backup, 24 * 3600 * 1000).unref();
