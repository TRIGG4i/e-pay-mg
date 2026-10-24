// Fichier clients : créé et complété automatiquement par les devis et opérations, modifiable à la main.
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  if (!el('clientsView')) return;
  const { esc, uid, now } = EpayUI;
  const KEY = 'epayClientsV1';
  const safe = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? f; } catch { return f; } };
  const load = () => (Array.isArray(safe(KEY, [])) ? safe(KEY, []) : []).filter(c => c && c.id);
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const phoneKey = p => { const d = EpayUI.phoneDigits(p); return d.length >= 9 ? d.slice(-9) : ''; };
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr');
  const ops = () => window.EpayOperations?.list() || [];
  let clients = load(), editing = null;

  function saveAll() {
    clients.sort(byName);
    try { localStorage.setItem(KEY, JSON.stringify(clients)); } catch { showToast('Mémoire du navigateur pleine : exporte une sauvegarde (Suivi › Réglages).', 'error'); }
    window.EpaySync?.changed('clients');
    names();
  }
  // Même client : même fiche, même téléphone (quel que soit le format) ou même nom (sans accents ni casse).
  function find({ id, name, phone } = {}) {
    if (id) { const c = clients.find(x => x.id === id); if (c) return c; }
    const pk = phoneKey(phone);
    if (pk) { const c = clients.find(x => phoneKey(x.phone) === pk); if (c) return c; }
    const n = norm(name);
    return n ? clients.find(x => norm(x.name) === n) || null : null;
  }
  function upsert({ id, name, phone, address } = {}) {
    name = String(name || '').trim(); phone = String(phone || '').trim(); address = String(address || '').trim();
    if (!name) return null;
    let c = find({ id, name, phone });
    if (!c) {
      c = { id: uid(), name, phone, address, email: '', note: '', createdAt: now(), updatedAt: now() };
      clients.push(c); saveAll(); return c;
    }
    const patch = {};
    if (c.id === id && name !== c.name) patch.name = name;
    if (phone && phone !== c.phone) patch.phone = phone;
    if (address && address !== c.address) patch.address = address;
    if (Object.keys(patch).length) { Object.assign(c, patch, { updatedAt: now() }); saveAll(); }
    return c;
  }

  const mine = c => { const n = norm(c.name); return x => x.clientId === c.id || (!x.clientId && n && norm(x.client) === n); };
  function stats(c) {
    const is = mine(c), O = window.EpayOperations;
    const quotes = state.quotes.filter(is), list = ops().filter(is);
    let paid = 0, due = 0;
    const volume = { EUR: 0, USD: 0 };
    for (const o of list) {
      const f = O.figures(o); paid += f.paid; due += f.remaining;
      if (O.isSent(o)) volume[o.currency] = (volume[o.currency] || 0) + (Number(o.amount) || 0);
    }
    const dates = [...quotes.map(q => q.updatedAt || q.createdAt), ...list.map(o => o.updatedAt)].filter(Boolean).sort();
    return { quotes, ops: list, paid, due, volume, last: dates.at(-1) || c.updatedAt };
  }

  function names() { el('clientNames').innerHTML = clients.map(c => '<option value="' + esc(c.name) + '"></option>').join(''); }
  const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
  function render() {
    const term = norm(el('clientSearch').value), digits = el('clientSearch').value.replace(/\D/g, '');
    const shown = clients.filter(c => !term || norm([c.name, c.phone, c.address, c.email].join(' ')).includes(term) || (digits.length >= 3 && phoneKey(c.phone).includes(digits.slice(-9))));
    const rows = shown.map(c => ({ c, s: stats(c) }));
    const due = rows.reduce((sum, r) => sum + r.s.due, 0);
    el('clientSummary').textContent = clients.length ? `${clients.length} client(s)${due ? ` · ${fmtMGA(due, 0)} à encaisser` : ''}` : '';
    el('clientsList').innerHTML = rows.length ? '<div class="quote-list">' + rows.map(({ c, s }) => '<div class="quote-item" data-open-client="' + esc(c.id) + '">'
      + '<div class="quote-icon client-initials">' + esc(initials(c.name)) + '</div>'
      + '<div class="quote-main"><strong>' + esc(c.name) + '</strong><span>' + esc([c.phone, `${s.ops.length} opération(s)`, `${s.quotes.length} devis`].filter(Boolean).join(' · ')) + '</span>'
      + (s.due ? '<em class="quote-tag">Reste ' + esc(fmtMGA(s.due, 0)) + '</em>' : '') + '</div>'
      + '<div class="quote-amount">' + (s.paid ? esc(fmtMGA(s.paid, 0)) : '') + '</div></div>').join('') + '</div>'
      : '<p class="invoice-empty">' + (clients.length ? 'Aucun client ne correspond.' : 'Les clients sont ajoutés automatiquement avec leurs devis et opérations.') + '</p>';
    const n = el('suiviClients'); if (n) n.textContent = clients.length ? ` · ${clients.length}` : '';
  }

  const status = (msg, error = false) => { el('clientStatus').textContent = msg; el('clientStatus').style.color = error ? 'var(--danger)' : 'var(--muted)'; };
  function historyRows(c) {
    if (!c) return '';
    const s = stats(c), O = window.EpayOperations;
    const row = (kind, id, title, sub, amount) => '<button type="button" class="history-row" data-kind="' + kind + '" data-id="' + esc(id) + '"><span><strong>' + esc(title) + '</strong><small>' + esc(sub) + '</small></span><b>' + esc(amount) + '</b></button>';
    const vol = Object.entries(s.volume).filter(([, v]) => v > 0).map(([k, v]) => fmtCurrency(v, k, 0)).join(' + ');
    const parts = [
      ...s.ops.map(o => row('op', o.id, o.number, `${fmtCurrency(Number(o.amount) || 0, o.currency, 0)}${o.beneficiary?.name ? ` → ${o.beneficiary.name}` : ''} · ${O.step(o.status).label}`, fmtMGA(O.figures(o).total, 0))),
      ...s.quotes.map(q => row('quote', q.id, q.number, `Devis · ${fmtCurrency(q.amount, q.currency, 0)} · ${displayDate(q.ratedAt || q.createdAt)}${q.operationId ? ' · opération' : ''}`, fmtMGA(q.totalMGA, 0)))
    ];
    const head = '<div class="order-figures client-figures"><div><span>Payé</span><strong>' + esc(fmtNumber(s.paid, 0)) + '</strong></div><div><span>Reste</span><strong class="' + (s.due ? 'due' : 'ok') + '">' + esc(fmtNumber(s.due, 0)) + '</strong></div><div><span>Envoyé</span><strong>' + esc(vol || '—') + '</strong></div></div>';
    return head + (parts.length ? '<h3 class="invoice-h3">Historique</h3><div class="history-list">' + parts.join('') + '</div>' : '<p class="field-hint">Aucun devis ni opération pour l’instant.</p>');
  }
  function openClient(id = null, prefill = null) {
    const c = id ? clients.find(x => x.id === id) : null;
    editing = c?.id || null;
    const v = c || prefill || {};
    el('clientSheetTitle').textContent = c ? c.name : 'Nouveau client';
    el('clientSheetSub').textContent = c ? `Client depuis le ${displayDate(String(c.createdAt).slice(0, 10))}` : 'Nom, téléphone et adresse servent à préremplir devis et opérations.';
    el('clientName').value = v.name || ''; el('clientPhone').value = v.phone || ''; el('clientAddress').value = v.address || '';
    el('clientEmail').value = v.email || ''; el('clientNote').value = v.note || '';
    el('clientDelete').hidden = !c; el('clientWhatsApp').disabled = !EpayUI.phoneDigits(v.phone);
    el('clientHistory').innerHTML = c ? historyRows(c) + '<button type="button" class="secondary order-wide order-gap" data-kind="new-op"><svg class="icon sm"><use href="#i-transfer"/></svg>Nouvelle opération</button>' : '';
    status('');
    EpayUI.openSheet('clientSheet');
  }
  function saveSheet() {
    const v = { name: el('clientName').value.trim(), phone: el('clientPhone').value.trim(), address: el('clientAddress').value.trim(), email: el('clientEmail').value.trim(), note: el('clientNote').value.trim() };
    if (!v.name) { status('Indique le nom du client.', true); return null; }
    let c = editing ? clients.find(x => x.id === editing) : null;
    if (!c) {
      const twin = find(v);
      if (twin && !confirm(`${twin.name} existe déjà${twin.phone ? ` (${twin.phone})` : ''}. Créer quand même une autre fiche ?`)) { openClient(twin.id); return null; }
      c = { id: uid(), createdAt: now() }; clients.push(c); editing = c.id;
    }
    Object.assign(c, v, { updatedAt: now() });
    saveAll(); render();
    el('clientSheetTitle').textContent = c.name; el('clientDelete').hidden = false; el('clientWhatsApp').disabled = !EpayUI.phoneDigits(c.phone);
    status('Fiche enregistrée.');
    return c;
  }
  function removeClient() {
    const i = clients.findIndex(x => x.id === editing); if (i < 0) return;
    const c = clients[i];
    if (!confirm(`Supprimer la fiche de ${c.name} ? Ses devis et opérations sont conservés.`)) return;
    clients.splice(i, 1); saveAll(); render(); EpayUI.closeSheet('clientSheet');
    showToast(`Fiche de ${c.name} supprimée.`, 'info', { label: 'Annuler', run: () => { clients.push(c); saveAll(); render(); } });
  }
  function quoteFor() {
    const c = saveSheet(); if (!c) return;
    EpayUI.closeSheet('clientSheet');
    startQuoteFor(c);
  }

  // Saisie d'un nom connu : téléphone et adresse complétés s'ils sont vides.
  el('quoteClient').addEventListener('change', () => {
    const c = find({ name: el('quoteClient').value }); if (!c) return;
    if (!el('quotePhone').value.trim() && c.phone) el('quotePhone').value = c.phone;
    if (!el('quoteAddress').value.trim() && c.address) el('quoteAddress').value = c.address;
    renderDraftPreview();
  });

  el('clientSearch').addEventListener('input', render);
  el('clientsList').addEventListener('click', e => { const r = e.target.closest('[data-open-client]'); if (r) openClient(r.dataset.openClient); });
  el('clientNew').addEventListener('click', () => openClient());
  el('clientSave').addEventListener('click', saveSheet);
  el('clientDelete').addEventListener('click', removeClient);
  el('clientQuote').addEventListener('click', quoteFor);
  el('clientWhatsApp').addEventListener('click', () => EpayUI.openWhatsApp(el('clientPhone').value, ''));
  el('clientPhone').addEventListener('input', () => { el('clientWhatsApp').disabled = !EpayUI.phoneDigits(el('clientPhone').value); });
  el('clientHistory').addEventListener('click', e => {
    const r = e.target.closest('[data-kind]'); if (!r) return;
    if (r.dataset.kind === 'op') { window.EpayOperations?.open(r.dataset.id); return; }
    if (r.dataset.kind === 'new-op') { const c = clients.find(x => x.id === editing); if (c) window.EpayOperations?.newFor(c); return; }
    EpayUI.closeSheet('clientSheet');
    const q = state.quotes.find(x => x.id === r.dataset.id); if (q) { setView('quotes'); openQuote(q); }
  });
  function reload() { clients = load(); names(); if (state.view === 'clients') render(); }
  // Devis d'avant les fiches clients : une fiche par client, une seule fois par appareil. L'identifiant vient
  // du nom : deux appareils qui reprennent les mêmes anciens devis créent la même fiche, sans doublon.
  function backfill() {
    const FLAG = 'epayClientsBackfillV1';
    if (localStorage.getItem(FLAG)) return;
    let added = 0;
    for (const q of [...state.quotes].reverse()) {
      const name = String(q.client || '').trim(), key = norm(name).replace(/ /g, '-').slice(0, 48);
      if (!key || find({ name, phone: q.phone })) continue;
      clients.push({ id: `ancien-${key}`, name, phone: q.phone || '', address: q.address || '', email: '', note: '', createdAt: q.createdAt || now(), updatedAt: now() });
      added++;
    }
    try { localStorage.setItem(FLAG, '1'); } catch {}
    if (added) saveAll();
  }
  window.EpaySync?.onApply('clients', reload);
  viewHooks.clients = render;
  window.EpayClients = { upsert, find, get: id => clients.find(x => x.id === id) || null, list: () => clients.slice(), open: openClient, stats, reload, count: () => clients.length };
  backfill();
  names();
})();
