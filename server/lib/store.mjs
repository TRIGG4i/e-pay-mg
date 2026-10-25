import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, chmodSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';

// Données de gestion HELPEO (devis, opérations, clients, réglages) d'un seul
// propriétaire, synchronisées entre ses appareils. SQLite intégré à Node, un fichier.
export const COLLECTIONS = ['quotes', 'operations', 'clients', 'settings'];
export const SEQ_KINDS = { quote: 'quotes', operation: 'operations' };
const MAX_RECORD = 600_000;
const SESSION_DAYS = 180;
const MIN_PASSWORD = 10;
const scryptAsync = promisify(scrypt);
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const nowIso = () => new Date().toISOString();
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const sameHex = (a, b) => {
  const x = Buffer.from(String(a), 'hex'), y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [kind, N, r, p, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const key = await scryptAsync(String(password), Buffer.from(salt, 'hex'), 32, { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return sameHex(key.toString('hex'), hash);
}
const checkPassword = (password) => {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) throw fail(`Mot de passe trop court : ${MIN_PASSWORD} caractères au minimum.`);
  if (password.length > 200) throw fail('Mot de passe trop long.');
};
const cleanDevice = (device) => String(device || 'Appareil').replace(/[^\p{L}\p{N} ·._()/-]/gu, '').slice(0, 60) || 'Appareil';

export function openStore(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* répertoire existant d'un autre propriétaire */ }
  const file = path.join(dir, 'epay.db');
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS records (
      coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT, mtime TEXT NOT NULL,
      rev INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, device TEXT,
      PRIMARY KEY (coll, id));
    CREATE INDEX IF NOT EXISTS records_rev ON records (rev);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, device TEXT, created TEXT, last_seen TEXT, expires TEXT);
    CREATE TABLE IF NOT EXISTS sequences (kind TEXT, day TEXT, n INTEGER, PRIMARY KEY (kind, day));
    CREATE TABLE IF NOT EXISTS audit (at TEXT, event TEXT, ip TEXT, detail TEXT);
  `);
  for (const f of [file, `${file}-wal`, `${file}-shm`]) try { chmodSync(f, 0o600); } catch { /* idem */ }

  const q = {
    meta: db.prepare('SELECT value FROM meta WHERE key = ?'),
    setMeta: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
    delMeta: db.prepare('DELETE FROM meta WHERE key = ?'),
    get: db.prepare('SELECT coll, id, data, mtime, rev, deleted FROM records WHERE coll = ? AND id = ?'),
    put: db.prepare(`INSERT INTO records (coll, id, data, mtime, rev, deleted, device) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (coll, id) DO UPDATE SET data = excluded.data, mtime = excluded.mtime, rev = excluded.rev, deleted = excluded.deleted, device = excluded.device`),
    since: db.prepare('SELECT coll, id, data, mtime, rev, deleted FROM records WHERE rev > ? ORDER BY rev LIMIT ?'),
    numbers: db.prepare("SELECT json_extract(data, '$.number') AS number FROM records WHERE coll = ? AND deleted = 0 AND json_extract(data, '$.number') LIKE ?"),
    seq: db.prepare('SELECT n FROM sequences WHERE kind = ? AND day = ?'),
    setSeq: db.prepare('INSERT INTO sequences (kind, day, n) VALUES (?, ?, ?) ON CONFLICT (kind, day) DO UPDATE SET n = excluded.n'),
    seqsSince: db.prepare('SELECT kind, day, n FROM sequences WHERE day >= ?'),
    session: db.prepare('SELECT hash, device, created, last_seen, expires FROM sessions WHERE hash = ?'),
    addSession: db.prepare('INSERT INTO sessions (hash, device, created, last_seen, expires) VALUES (?, ?, ?, ?, ?)'),
    touchSession: db.prepare('UPDATE sessions SET last_seen = ?, expires = ? WHERE hash = ?'),
    delSession: db.prepare('DELETE FROM sessions WHERE hash = ?'),
    sessions: db.prepare('SELECT hash, device, created, last_seen FROM sessions WHERE expires > ? ORDER BY last_seen DESC'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires <= ?'),
    audit: db.prepare('INSERT INTO audit (at, event, ip, detail) VALUES (?, ?, ?, ?)'),
    trimAudit: db.prepare('DELETE FROM audit WHERE rowid NOT IN (SELECT rowid FROM audit ORDER BY rowid DESC LIMIT 2000)')
  };
  const meta = (key) => q.meta.get(key)?.value ?? null;
  const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const nextRev = () => { const rev = Number(meta('rev') || 0) + 1; q.setMeta.run('rev', String(rev)); return rev; };
  const log = (event, ip = '', detail = '') => { q.audit.run(nowIso(), event, String(ip).slice(0, 64), String(detail).slice(0, 200)); q.trimAudit.run(); };
  const expiry = () => new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  const newSession = (device) => {
    const raw = token(), at = nowIso();
    q.addSession.run(sha256(raw), cleanDevice(device), at, at, expiry());
    return raw;
  };

  // ---------- Compte du propriétaire ----------
  const auth = {
    hasPassword: () => Boolean(meta('password')),
    // Lien d'activation à usage unique (premier mot de passe, ou mot de passe oublié).
    createActivation(ttlHours = 48) {
      const raw = token();
      q.setMeta.run('activation', JSON.stringify({ hash: sha256(raw), expires: new Date(Date.now() + ttlHours * 3600000).toISOString() }));
      log('activation-created');
      return raw;
    },
    activationPending() {
      try { const a = JSON.parse(meta('activation') || 'null'); return Boolean(a && a.expires > nowIso()); } catch { return false; }
    },
    async activate(rawToken, password, device, ip) {
      checkPassword(password);
      let a = null; try { a = JSON.parse(meta('activation') || 'null'); } catch { a = null; }
      if (!a || a.expires <= nowIso() || !sameHex(sha256(String(rawToken || '')), a.hash)) { log('activation-refused', ip); throw fail('Lien d’activation invalide ou expiré.', 403); }
      const hash = await hashPassword(password);
      return tx(() => {
        q.setMeta.run('password', hash); q.delMeta.run('activation');
        db.exec('DELETE FROM sessions');
        log('activated', ip, cleanDevice(device));
        return newSession(device);
      });
    },
    async login(password, device, ip) {
      const stored = meta('password');
      if (!stored) throw fail('Compte pas encore activé : utilise le lien d’activation.', 409);
      if (!(await verifyPassword(password, stored))) { log('login-failed', ip); throw fail('Mot de passe incorrect.', 401); }
      log('login', ip, cleanDevice(device));
      return newSession(device);
    },
    session(rawToken) {
      if (!rawToken) return null;
      const hash = sha256(rawToken), s = q.session.get(hash);
      if (!s || s.expires <= nowIso()) return null;
      // Échéance glissante, mise à jour au plus une fois par heure.
      if (Date.now() - Date.parse(s.last_seen) > 3600000) q.touchSession.run(nowIso(), expiry(), hash);
      return { id: hash.slice(0, 12), hash, device: s.device, created: s.created };
    },
    logout(session) { if (session) q.delSession.run(session.hash); },
    sessions(current) {
      q.purgeSessions.run(nowIso());
      return q.sessions.all(nowIso()).map(s => ({ id: s.hash.slice(0, 12), device: s.device, created: s.created, lastSeen: s.last_seen, current: s.hash === current?.hash }));
    },
    revoke(id, current) {
      const target = q.sessions.all(nowIso()).find(s => s.hash.slice(0, 12) === String(id));
      if (!target) throw fail('Appareil introuvable.', 404);
      if (target.hash === current?.hash) throw fail('Pour cet appareil, utilise « Se déconnecter ».');
      q.delSession.run(target.hash); log('revoked', '', target.device);
    },
    async changePassword(session, current, next, ip) {
      checkPassword(next);
      if (!(await verifyPassword(current, meta('password')))) { log('password-change-refused', ip); throw fail('Mot de passe actuel incorrect.', 403); }
      const hash = await hashPassword(next);
      tx(() => {
        q.setMeta.run('password', hash);
        for (const s of q.sessions.all(nowIso())) if (s.hash !== session.hash) q.delSession.run(s.hash);
      });
      log('password-changed', ip, session.device);
    }
  };

  // ---------- Synchronisation ----------
  const row = (r) => r && ({ coll: r.coll, id: r.id, rev: r.rev, mtime: r.mtime, deleted: Boolean(r.deleted), data: r.deleted ? null : JSON.parse(r.data) });
  function validChange(c) {
    if (!c || !COLLECTIONS.includes(c.coll)) throw fail('Collection inconnue.');
    if (typeof c.id !== 'string' || !c.id || c.id.length > 120) throw fail('Identifiant invalide.');
    if (!c.deleted && (typeof c.data !== 'object' || c.data === null || Array.isArray(c.data))) throw fail('Donnée invalide.');
    const data = c.deleted ? null : JSON.stringify(c.data);
    if (data && data.length > MAX_RECORD) throw fail('Enregistrement trop volumineux.', 413);
    const mtime = typeof c.mtime === 'string' && !Number.isNaN(Date.parse(c.mtime)) ? new Date(c.mtime).toISOString() : nowIso();
    return { coll: c.coll, id: c.id, data, mtime, baseRev: Math.max(0, Number(c.baseRev) || 0), deleted: Boolean(c.deleted) };
  }
  // Accepté si l'appareil a modifié la dernière version connue ; sinon la modification la plus récente gagne.
  function push(changes, device) {
    if (!Array.isArray(changes)) return [];
    if (changes.length > 400) throw fail('Trop de modifications en une fois.', 413);
    return tx(() => changes.map(raw => {
      const c = validChange(raw), cur = q.get.get(c.coll, c.id);
      const stale = cur && c.baseRev < cur.rev && c.mtime <= cur.mtime;
      if (stale) return { coll: c.coll, id: c.id, ok: false, record: row(cur) };
      if (cur && cur.deleted && c.deleted) return { coll: c.coll, id: c.id, ok: true, rev: cur.rev };
      const rev = nextRev();
      q.put.run(c.coll, c.id, c.data, c.mtime, rev, c.deleted ? 1 : 0, cleanDevice(device));
      return { coll: c.coll, id: c.id, ok: true, rev };
    }));
  }
  function pull(since = 0, limit = 400) {
    const rows = q.since.all(Math.max(0, Number(since) || 0), limit + 1);
    const more = rows.length > limit, changes = rows.slice(0, limit).map(row);
    return { changes, more, rev: more ? changes.at(-1).rev : Number(meta('rev') || 0) };
  }

  // ---------- Numéros (devis, opérations) : jamais deux fois le même ----------
  const DAY = /^\d{8}$/;
  function mergeSeqs(seqs) {
    if (!seqs || typeof seqs !== 'object') return;
    tx(() => {
      for (const [kind, days] of Object.entries(seqs)) {
        if (!(kind in SEQ_KINDS) || !days || typeof days !== 'object') continue;
        for (const [day, n] of Object.entries(days)) {
          const value = Math.floor(Number(n));
          if (!DAY.test(day) || !(value > 0) || value > 99999) continue;
          const cur = Number(q.seq.get(kind, day)?.n || 0);
          if (value > cur) q.setSeq.run(kind, day, value);
        }
      }
    });
  }
  function seqs(days = 400) {
    const d = new Date(Date.now() - days * 86400000);
    const from = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const out = {};
    for (const s of q.seqsSince.all(from)) (out[s.kind] ||= {})[s.day] = s.n;
    return out;
  }
  function allocate(kind, day, min = 0) {
    if (!(kind in SEQ_KINDS)) throw fail('Type de numéro inconnu.');
    if (!DAY.test(String(day))) throw fail('Date invalide.');
    return tx(() => {
      const used = q.numbers.all(SEQ_KINDS[kind], `%-${day}-%`)
        .map(r => Number(/-(\d+)$/.exec(String(r.number || ''))?.[1]) || 0);
      const n = Math.max(Number(q.seq.get(kind, day)?.n || 0), ...used, Math.floor(Number(min) || 0) - 1, 0) + 1;
      q.setSeq.run(kind, day, n);
      return n;
    });
  }

  // ---------- Sauvegardes quotidiennes (30 jours) ----------
  function backup() {
    const dirBk = path.join(dir, 'backups');
    mkdirSync(dirBk, { recursive: true, mode: 0o700 });
    const name = `epay-${new Date().toISOString().slice(0, 10)}.db`, target = path.join(dirBk, name);
    rmSync(target, { force: true });
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
    try { chmodSync(target, 0o600); } catch { /* idem */ }
    const files = readdirSync(dirBk).filter(f => /^epay-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    for (const old of files.slice(0, Math.max(0, files.length - 30))) rmSync(path.join(dirBk, old), { force: true });
    return target;
  }

  return { auth, push, pull, mergeSeqs, seqs, allocate, backup, log, close: () => db.close() };
}
