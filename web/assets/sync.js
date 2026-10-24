// Synchronisation privée des devis, opérations, clients et réglages entre appareils.
// Les données restent d'abord dans le navigateur (l'app marche hors ligne) ; une fois connecté
// par mot de passe, chaque modification est envoyée au serveur E-Pay et les autres appareils la reçoivent.
(() => {
  'use strict';
  const API = String(window.EPAY?.apiBase || '').replace(/\/$/, ''), SESSION_KEY = 'epaySessionV1', STATE_KEY = 'epaySyncV1';
  const COLLS = {
    quotes: { key: 'epayQuotesV2' },
    operations: { key: 'epayOperationsV1' },
    clients: { key: 'epayClientsV1' },
    settings: { key: 'epaySettingsV1', single: true }
  };
  const SEQS = { quote: 'epayQuoteSequenceV2', operation: 'epayOperationSeqV1' };
  const BATCH = 150, BATCH_BYTES = 2_000_000;
  const safe = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
  const hash = value => { const s = JSON.stringify(value); let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + s.length.toString(36); };
  const stamp = x => String(x?.updatedAt || x?.issuedAt || x?.createdAt || '');
  const byNumber = (a, b) => String(b.number || '~').localeCompare(String(a.number || '~'));
  const SORT = { quotes: byNumber, operations: byNumber, clients: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr') };

  function read(coll) {
    const c = COLLS[coll], v = safe(c.key, c.single ? null : []);
    if (c.single) return v && typeof v === 'object' && !Array.isArray(v) ? [{ ...v, id: 'main' }] : [];
    return Array.isArray(v) ? v.filter(x => x && typeof x === 'object' && x.id) : [];
  }
  function write(coll, list) {
    const c = COLLS[coll];
    if (c.single) { if (list[0]) localStorage.setItem(c.key, JSON.stringify(list[0])); else localStorage.removeItem(c.key); return; }
    localStorage.setItem(c.key, JSON.stringify([...list].sort(SORT[coll])));
  }

  let session = safe(SESSION_KEY, null);
  const st = Object.assign({ lastRev: 0, shadow: {}, dirty: {}, lastSync: '' }, safe(STATE_KEY, {}));
  const saveState = () => { try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch { /* mémoire pleine : rattrapé au prochain passage */ } };
  const hooks = {}, listeners = new Set();
  let status = { state: session ? 'idle' : 'off', error: '' }, running = false, again = false, timer = null, started = false;
  const setStatus = patch => { status = { ...status, ...patch }; for (const fn of listeners) try { fn(publicStatus()); } catch { /* écouteur fautif */ } };
  const publicStatus = () => ({ ...status, enabled: Boolean(session), device: session?.device || '', lastSync: st.lastSync, pending: Object.keys(st.dirty).length });

  // Repère ce qui a changé localement depuis le dernier échange (ajouts, modifications, suppressions).
  function scan(coll) {
    const sh = st.shadow[coll] ||= {}, seen = new Set(), now = new Date().toISOString();
    for (const r of read(coll)) {
      seen.add(r.id);
      const k = `${coll}/${r.id}`, h = hash(r), d = st.dirty[k];
      if (sh[r.id] && !sh[r.id].deleted && sh[r.id].h === h) { delete st.dirty[k]; continue; }
      if (!d || d.h !== h) st.dirty[k] = { h, at: sh[r.id] ? now : (stamp(r) || now) };
    }
    for (const [id, s] of Object.entries(sh)) {
      const k = `${coll}/${id}`;
      if (seen.has(id) || s.deleted) continue;
      if (st.dirty[k]?.h !== 'deleted') st.dirty[k] = { h: 'deleted', at: now };
    }
  }
  const scanAll = () => Object.keys(COLLS).forEach(scan);

  const deviceLabel = () => {
    const ua = navigator.userAgent;
    const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
    const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
    return `${os} · ${br}`;
  };
  class ApiError extends Error { constructor(message, code) { super(message); this.code = code; } }
  async function api(path, body, { auth = true, timeout = 25000, method = 'POST' } = {}) {
    if (!API) throw new ApiError('serveur E-Pay non configuré', 0);
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
    let res;
    try {
      res = await fetch(`${API}${path}`, { method, signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...(auth && session ? { Authorization: `Bearer ${session.token}` } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    } catch (e) { throw new ApiError(e.name === 'AbortError' ? 'serveur trop lent, réessaie' : 'pas de connexion au serveur', 0); }
    finally { clearTimeout(t); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && auth && session) dropSession('Session expirée : reconnecte-toi dans Réglages.');
    if (!res.ok) throw new ApiError(data.error || `erreur ${res.status}`, res.status);
    return data;
  }
  function dropSession(message) {
    session = null; localStorage.removeItem(SESSION_KEY);
    setStatus({ state: 'off', error: message || '' });
    if (message) showToast(message, 'warn');
  }
  function useSession(token, device) {
    session = { token, device, at: new Date().toISOString() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setStatus({ state: 'idle', error: '' });
    return syncNow();
  }

  const recentDays = obj => Object.fromEntries(Object.entries(obj || {}).filter(([d, n]) => /^\d{8}$/.test(d) && Number(n) > 0).sort().slice(-60));
  const localSeqs = () => Object.fromEntries(Object.entries(SEQS).map(([kind, key]) => [kind, recentDays(safe(key, {}))]));
  function mergeSeqs(seqs) {
    for (const [kind, key] of Object.entries(SEQS)) {
      const cur = safe(key, {}); let changed = false;
      for (const [d, n] of Object.entries(seqs?.[kind] || {})) if (/^\d{8}$/.test(d) && Number(n) > (Number(cur[d]) || 0)) { cur[d] = Number(n); changed = true; }
      if (changed) localStorage.setItem(key, JSON.stringify(cur));
    }
  }

  function batch() {
    const out = []; let bytes = 0;
    const lists = {};
    for (const [k, d] of Object.entries(st.dirty)) {
      const i = k.indexOf('/'), coll = k.slice(0, i), id = k.slice(i + 1);
      if (!COLLS[coll]) { delete st.dirty[k]; continue; }
      const rec = (lists[coll] ||= read(coll)).find(r => r.id === id);
      const baseRev = st.shadow[coll]?.[id]?.rev || 0;
      const change = rec ? { coll, id, data: rec, mtime: d.at, baseRev } : { coll, id, deleted: true, mtime: d.at, baseRev };
      const size = rec ? JSON.stringify(rec).length : 80;
      if (out.length && (out.length >= BATCH || bytes + size > BATCH_BYTES)) break;
      out.push({ change, h: rec ? hash(rec) : 'deleted' }); bytes += size;
    }
    return out;
  }

  // Applique les changements reçus du serveur sur l'état local relu au dernier moment.
  function applyIncoming(items) {
    const lists = {}, touched = new Set();
    const list = coll => (lists[coll] ||= read(coll));
    for (const c of items) {
      if (!COLLS[c.coll]) continue;
      const sh = st.shadow[c.coll] ||= {}, k = `${c.coll}/${c.id}`, d = st.dirty[k];
      if (sh[c.id] && sh[c.id].rev >= c.rev) continue;
      // Modifié ici entre-temps : la version la plus récente gagne.
      if (d && !c.forced && d.at > c.mtime) { sh[c.id] = { ...(sh[c.id] || { h: '' }), rev: c.rev, deleted: false }; continue; }
      const arr = list(c.coll), i = arr.findIndex(r => r.id === c.id);
      if (c.deleted) { if (i >= 0) arr.splice(i, 1); }
      else if (i >= 0) arr[i] = c.data; else arr.push(c.data);
      sh[c.id] = { h: c.deleted ? '' : hash(COLLS[c.coll].single ? { ...c.data, id: 'main' } : c.data), rev: c.rev, deleted: Boolean(c.deleted) };
      delete st.dirty[k];
      touched.add(c.coll);
    }
    for (const coll of touched) write(coll, lists[coll]);
    return touched;
  }
  function runHooks(colls) {
    for (const coll of colls) for (const fn of hooks[coll] || []) try { fn(); } catch (e) { console.error('E-Pay synchro :', e); }
  }

  async function syncNow() {
    if (!session) { setStatus({ state: 'off' }); return false; }
    if (running) { again = true; return false; }
    running = true; clearTimeout(timer); setStatus({ state: 'syncing', error: '' });
    const touched = new Set();
    try {
      for (let round = 0; round < 40; round++) {
        scanAll();
        const sent = batch();
        const res = await api('/api/sync', { since: st.lastRev, changes: sent.map(s => s.change), seqs: localSeqs() }, { timeout: 40000 });
        scanAll(); // modifications faites pendant l'échange
        const rejected = [];
        (res.results || []).forEach((r, i) => {
          const s = sent[i]; if (!s || r.id !== s.change.id) return;
          const k = `${r.coll}/${r.id}`, sh = st.shadow[r.coll] ||= {};
          if (r.ok) {
            sh[r.id] = { h: s.h === 'deleted' ? '' : s.h, rev: r.rev, deleted: s.h === 'deleted' };
            if (st.dirty[k]?.h === s.h) delete st.dirty[k];
          } else if (r.record) {
            if (st.dirty[k]?.h === s.h) delete st.dirty[k];
            rejected.push({ ...r.record, forced: true });
          }
        });
        for (const c of applyIncoming([...rejected, ...(res.changes || [])])) touched.add(c);
        mergeSeqs(res.seqs);
        st.lastRev = Math.max(st.lastRev, Number(res.rev) || 0);
        saveState();
        if (!res.more && !Object.keys(st.dirty).length) break;
        if (!res.more && !sent.length) break;
      }
      st.lastSync = new Date().toISOString(); saveState();
      setStatus({ state: 'idle', error: '' });
      return true;
    } catch (e) {
      if (session) setStatus({ state: e.code === 0 ? 'offline' : 'error', error: e.message });
      return false;
    } finally {
      running = false;
      if (touched.size) runHooks(touched);
      if (again) { again = false; schedule(1200); }
    }
  }
  function schedule(delay = 1800) { if (!session) return; clearTimeout(timer); timer = setTimeout(() => syncNow(), delay); }

  // Numéro unique attribué par le serveur : jamais deux fois le même devis ou la même opération.
  async function number(kind, day, min = 1) {
    const res = await api('/api/number', { kind, day, min }, { timeout: 12000 });
    const key = SEQS[kind], cur = safe(key, {});
    if (Number(res.n) > (Number(cur[day]) || 0)) { cur[day] = Number(res.n); localStorage.setItem(key, JSON.stringify(cur)); }
    return Number(res.n);
  }

  async function login(password) { const device = deviceLabel(); const r = await api('/api/auth/login', { password, device }, { auth: false }); await useSession(r.token, device); }
  async function activate(token, password) { const device = deviceLabel(); const r = await api('/api/auth/activate', { token, password, device }, { auth: false }); await useSession(r.token, device); }
  async function logout() { try { await api('/api/auth/logout', {}, { timeout: 8000 }); } catch { /* session effacée quand même */ } dropSession(''); }
  const changePassword = (current, next) => api('/api/auth/password', { current, next });
  const sessions = () => api('/api/auth/sessions', null, { method: 'GET' }).then(r => r.sessions || []);
  const revoke = id => api('/api/auth/revoke', { id });
  const serverStatus = () => api('/api/auth/status', null, { method: 'GET' });

  function changed(coll) {
    if (coll && COLLS[coll]) scan(coll); else scanAll();
    saveState();
    if (session) schedule();
    setStatus({});
  }
  function start() {
    if (started) return; started = true;
    scanAll(); saveState();
    if (session) syncNow();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(300); else if (Object.keys(st.dirty).length) syncNow(); });
    window.addEventListener('online', () => schedule(500));
    setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
  }

  window.EpaySync = {
    enabled: () => Boolean(session), changed, syncNow, start, login, activate, logout, changePassword, sessions, revoke, number, serverStatus,
    onApply: (coll, fn) => { (hooks[coll] ||= []).push(fn); }, onStatus: fn => { listeners.add(fn); fn(publicStatus()); }, status: publicStatus
  };
})();
