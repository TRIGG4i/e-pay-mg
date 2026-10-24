// Opérations : du paiement du client au transfert confirmé — étapes, paiements, envoi, bénéficiaire, reçu.
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  if (!el('operationsView')) return;
  const { esc, uid, now } = EpayUI;
  const KEY = 'epayOperationsV1', SEQ_KEY = 'epayOperationSeqV1';
  const STEPS = [
    { id: 'attente', label: 'Paiement attendu', tone: 'warn', client: 'nous attendons votre paiement pour lancer le transfert' },
    { id: 'paye', label: 'Payée, à envoyer', tone: 'accent', client: 'paiement bien reçu, votre transfert est en préparation' },
    { id: 'envoye', label: 'Transfert envoyé', tone: 'accent', client: 'transfert envoyé au bénéficiaire' },
    { id: 'confirme', label: 'Terminée', tone: 'ok', client: 'transfert reçu par le bénéficiaire. Merci pour votre confiance' }
  ];
  const CANCELLED = { id: 'annulee', label: 'Annulée', tone: 'muted', client: 'opération annulée' };
  const step = id => STEPS.find(s => s.id === id) || (id === 'annulee' ? CANCELLED : STEPS[0]);
  const stepIndex = id => STEPS.findIndex(s => s.id === id);
  const isOpen = o => o.status !== 'confirme' && o.status !== 'annulee';
  const isSent = o => o.status === 'envoye' || o.status === 'confirme';
  const METHODS = { mvola: 'MVola', orange: 'Orange Money', airtel: 'Airtel Money', virement: 'Virement', especes: 'Espèces', autre: 'Autre' };
  const CHANNELS = { direct: 'Débit direct', foreign: 'Carte étrangère' };
  const safe = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? f; } catch { return f; } };
  const load = () => (Array.isArray(safe(KEY, [])) ? safe(KEY, []) : []).filter(o => o && o.id);
  const byNumber = (a, b) => String(b.number || '').localeCompare(String(a.number || ''));
  const money = v => { const n = Number(String(v ?? '').replace(/[\s  ]/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const chip = s => '<em class="status-chip tone-' + s.tone + '">' + esc(s.label) + '</em>';
  const emptyBenef = () => ({ name: '', account: '', bank: '', reference: '' });

  let ops = load(), editing = null, draft = null;
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) try { fn(); } catch (e) { console.error('E-Pay opérations :', e); } };
  function saveAll() {
    ops.sort(byNumber);
    try { localStorage.setItem(KEY, JSON.stringify(ops)); } catch { showToast('Mémoire du navigateur pleine : exporte une sauvegarde (Suivi › Réglages).', 'error'); }
    window.EpaySync?.changed('operations');
    emit();
  }
  const touch = o => { o.updatedAt = now(); };
  const get = id => ops.find(o => o.id === id) || null;

  // Numéro : attribué par le serveur une fois connecté (aucun doublon entre appareils), sinon compteur local.
  function localNext(day, consume) {
    const seq = safe(SEQ_KEY, {}) || {};
    const used = ops.filter(o => String(o.number || '').includes(`-${day}-`)).map(o => Number(String(o.number).split('-').pop()) || 0);
    const n = Math.max(Number(seq[day]) || 0, ...used, 0) + 1;
    if (consume) { seq[day] = n; try { localStorage.setItem(SEQ_KEY, JSON.stringify(seq)); } catch {} }
    return n;
  }
  async function allocate() {
    const day = dayKey();
    if (window.EpaySync?.enabled()) try { return docNumber('operation', day, await EpaySync.number('operation', day, localNext(day, false))); } catch { /* hors ligne : compteur local */ }
    return docNumber('operation', day, localNext(day, true));
  }

  // Coût estimé (débit de la carte du propriétaire) aux taux du jour, selon le mode de débit par défaut.
  const estimate = (amount, currency, mode) => Math.round(calcOwner(Number(amount) || 0, currency, mode || DEFAULT_DEBIT_MODE)?.debitMGA || 0);
  function figures(o) {
    const total = Math.round(Number(o.totalMGA) || 0);
    const paid = (o.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const cancelled = o.status === 'annulee';
    const cost = o.execution ? Number(o.execution.debitMGA) || 0 : Number(o.estCostMGA) || estimate(o.amount, o.currency);
    return { total, paid, remaining: cancelled ? 0 : Math.max(0, total - paid), toRefund: cancelled ? Math.max(0, paid) : 0, cost, costReal: Boolean(o.execution), profit: cancelled ? 0 : total - cost };
  }

  const fromQuoteFields = q => ({
    quoteId: q.id, quoteRef: q.number, clientId: q.clientId || '', client: q.client || '', phone: q.phone || '', address: q.address || '',
    currency: q.currency, amount: Number(q.amount) || 0, transferType: q.transferType, rate: Number(q.rate) || 0,
    totalMGA: Number(q.totalMGA) || 0, serviceFeesMGA: Number(q.serviceFeesMGA) || 0, estCostMGA: estimate(q.amount, q.currency)
  });
  // Devis accepté → opération (une seule par devis). Tant que rien n'est payé ni envoyé, elle suit le devis.
  async function ensureForQuote(q) {
    let o = get(q.operationId) || ops.find(x => x.quoteId === q.id);
    if (o) {
      if (!(o.payments || []).length && !o.execution) Object.assign(o, fromQuoteFields(q));
      touch(o);
    } else {
      o = { id: uid(), number: await allocate(), createdAt: now(), updatedAt: now(), status: 'attente', ...fromQuoteFields(q), beneficiary: emptyBenef(), payments: [], execution: null, events: [{ at: now(), status: 'attente' }], note: q.note || '' };
      ops.unshift(o);
    }
    if (q.operationId !== o.id) { q.operationId = o.id; persistQuotes(); renderQuotes(); }
    saveAll();
    return o;
  }
  function fromQuote(q) {
    ensureForQuote(q).then(o => { renderList(); open(o.id); showToast(`Opération ${o.number} : indique le bénéficiaire, puis enregistre le paiement du client.`, 'info'); })
      .catch(err => showToast(`Opération impossible : ${err.message || 'erreur'}`, 'error'));
  }

  // ---------- Messages au client ----------
  function vars(o) {
    const f = figures(o), ref = o.execution?.ref;
    return {
      client: o.client || '', operation: o.number, statut: step(o.status).client, montant: fmtCurrency(Number(o.amount) || 0, o.currency, 2),
      beneficiaire: o.beneficiary?.name || '', reference: ref ? ` Référence du transfert : ${ref}.` : '',
      total: fmtMGA(f.total, 0), paye: fmtMGA(f.paid, 0), reste: fmtMGA(f.remaining, 0), entreprise: [OFFICE.name, OFFICE.phone].filter(Boolean).join(' · ')
    };
  }
  const message = kind => window.EpaySettings?.messages()[kind] || '';
  const notify = o => EpayUI.openWhatsApp(o.phone, EpayUI.fill(message('status'), vars(o)));
  const remind = o => EpayUI.openWhatsApp(o.phone, EpayUI.fill(message('reminder'), vars(o)));

  function receiptRows(o) {
    const b = o.beneficiary || {};
    const rows = [
      { label: 'Montant à envoyer', detail: [b.name && `à ${b.name}`, o.transferType === 'cash' ? 'Espèces / Mobile Money' : 'Dépôt bancaire'].filter(Boolean).join(' · '), value: fmtCurrency(Number(o.amount) || 0, o.currency, 2) },
      { label: 'Taux appliqué', detail: `1 ${o.currency}`, value: o.rate ? `${fmtNumber(Number(o.rate), 2)} MGA` : '—' },
      { label: 'Total de l’opération', detail: 'Frais inclus', value: fmtMGA(figures(o).total, 0) }
    ];
    for (const p of o.payments || []) rows.push({ label: Number(p.amount) < 0 ? 'Remboursement' : 'Paiement reçu', detail: [displayDate(p.date), METHODS[p.method] || p.method, p.ref].filter(Boolean).join(' · '), value: fmtMGA(Number(p.amount) || 0, 0) });
    if (o.execution?.ref) rows.push({ label: 'Référence du transfert', detail: displayDate(o.execution.date), value: o.execution.ref });
    return rows;
  }
  function receiptData(o) {
    const f = figures(o);
    return {
      kind: 'receipt', title: 'REÇU', number: o.number, date: isoDate(), client: o.client, phone: o.phone, address: o.address, rows: receiptRows(o),
      totalLabel: f.toRefund ? 'À rembourser' : f.remaining ? 'Total à payer' : 'Total payé', total: f.toRefund || f.remaining || f.paid,
      note: `Statut : ${step(o.status).label}.`
    };
  }
  function receiptText(o) {
    const d = receiptData(o);
    return `REÇU ${o.number} · ${OFFICE.name}\n${displayDate(d.date)}\nClient : ${o.client || '—'}${o.phone ? `\nTéléphone : ${o.phone}` : ''}\n\n${d.rows.map(r => `${r.label}${r.detail ? ` (${r.detail})` : ''} : ${r.value}`).join('\n')}\n\n${d.totalLabel.toUpperCase()} : ${fmtMGA(d.total, 0)}\n${d.note}${officeLine() ? `\n\n${OFFICE.name} · ${officeLine()}` : ''}`;
  }
  function printReceipt(o) {
    const d = receiptData(o);
    const rows = d.rows.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(r.detail)}</td><td>${esc(r.value)}</td></tr>`).join('');
    el('printStage').innerHTML = `<article class="print-page">${printHeader('REÇU', `${o.number} · ${displayDate(d.date)}`)}${printClient(o)}<table class="print-table"><thead><tr><th>Description</th><th>Détail</th><th>Montant</th></tr></thead><tbody>${rows}</tbody></table><div class="print-total"><span>${esc(d.totalLabel)}</span><strong>${esc(fmtMGA(d.total, 0))}</strong></div><p class="print-note">${esc(d.note)}</p>${printPayment()}<footer class="print-footer"><span>${esc(OFFICE.name)} · Reçu généré électroniquement</span><span>${esc(o.number)}</span></footer></article>`;
    setTimeout(() => window.print(), 60);
  }

  // ---------- Étapes et paiements ----------
  function advance(o, status) { o.status = status; (o.events ||= []).push({ at: now(), status }); }
  function setStatus(o, status) {
    if (!o || o.status === status) return;
    advance(o, status); touch(o); saveAll();
    showToast(`${o.number} : ${step(status).label}.`, 'info', o.phone ? { label: 'Prévenir le client', run: () => notify(o) } : null);
  }
  // Paiement complet → « Payée, à envoyer » ; remboursement complet d'une opération annulée : rien à faire de plus.
  function afterPayment(o) {
    const f = figures(o);
    if (o.status === 'attente' && f.total > 0 && f.paid >= f.total) advance(o, 'paye');
    touch(o); saveAll();
  }
  function addPayment(o, p) {
    (o.payments ||= []).push({ id: uid(), date: p.date || isoDate(), amount: Math.round(p.amount), method: p.method || '', ref: p.ref || '' });
    afterPayment(o);
  }
  // Paiement intégral seulement (pas d'acompte) : le montant est toujours le total restant de l'opération.
  function readPayment() { return { method: el('opPayMethod')?.value || 'mvola', date: el('opPayDate')?.value || isoDate(), ref: el('opPayRef')?.value.trim() || '' }; }
  function recordExecution(o) {
    const debit = Math.round(money(el('opExecDebit')?.value));
    if (!debit) { showToast('Indique le montant débité sur ta carte (MGA).', 'warn'); return false; }
    const unpaid = figures(o).remaining;
    if (!o.execution && unpaid > 0 && !confirm(`Le client n’a pas encore payé la totalité (${fmtMGA(unpaid, 0)} à encaisser). Enregistrer l’envoi quand même ?`)) return false;
    o.execution = { date: el('opExecDate').value || isoDate(), debitMGA: debit, channel: el('opExecChannel').value, ref: el('opExecRef').value.trim(), note: o.execution?.note || '' };
    const sentNow = o.status === 'attente' || o.status === 'paye';
    if (sentNow) advance(o, 'envoye');
    touch(o); saveAll();
    showToast(sentNow ? `${o.number} : transfert envoyé.` : `${o.number} : envoi mis à jour.`, 'info', sentNow && o.phone ? { label: 'Prévenir le client', run: () => notify(o) } : null);
    return true;
  }

  // ---------- Liste ----------
  function renderList() {
    const term = el('operationSearch').value.trim().toLowerCase(), filter = el('operationFilter').value;
    const open = ops.filter(isOpen), toCollect = open.reduce((s, o) => s + figures(o).remaining, 0), toSend = ops.filter(o => o.status === 'paye').length;
    el('operationSummary').textContent = ops.length ? `${open.length} en cours · ${fmtMGA(toCollect, 0)} à encaisser${toSend ? ` · ${toSend} à envoyer` : ''}` : '';
    const shown = ops.filter(o => (filter === 'all' || (filter === 'active' ? isOpen(o) : o.status === filter))
      && (!term || [o.number, o.client, o.phone, o.quoteRef, o.beneficiary?.name, o.beneficiary?.reference, o.execution?.ref, String(o.amount), o.currency].join(' ').toLowerCase().includes(term)));
    el('operationsList').innerHTML = shown.length ? '<div class="quote-list">' + shown.map(o => {
      const f = figures(o);
      return '<div class="quote-item" data-open-op="' + esc(o.id) + '"><div class="quote-icon"><svg class="icon"><use href="#i-transfer"/></svg></div>'
        + '<div class="quote-main"><strong>' + esc(o.client || o.number) + '</strong><span>' + esc([o.number, fmtCurrency(Number(o.amount) || 0, o.currency, 0), o.beneficiary?.name].filter(Boolean).join(' · ')) + '</span>' + chip(step(o.status)) + '</div>'
        + '<div class="quote-amount">' + esc(fmtMGA(f.total, 0)) + (f.toRefund ? '<small>à rembourser</small>' : f.remaining && o.status !== 'attente' ? '<small>non payée</small>' : '') + '</div></div>';
    }).join('') + '</div>'
      : '<p class="invoice-empty">' + (ops.length ? 'Aucune opération ne correspond.' : 'Une opération naît d’un devis accepté (« Créer l’opération ») ou du bouton +.') + '</p>';
  }
  function openList(filter = 'active') { el('operationFilter').value = filter; el('operationSearch').value = ''; setView('operations'); }

  // ---------- Fiche opération ----------
  const field = (label, name, value, kind = 'text', wide = false, extra = '') => '<label' + (wide ? ' class="invoice-wide"' : '') + '>' + esc(label)
    + (kind === 'textarea' ? '<textarea data-field="' + name + '" rows="2">' + esc(value) + '</textarea>'
      : '<input data-field="' + name + '" type="' + (kind === 'money' ? 'text" inputmode="decimal' : kind) + '" value="' + esc(value) + '"' + extra + '>') + '</label>';
  const select = (label, name, value, options) => '<label>' + esc(label) + '<select data-field="' + name + '">' + Object.entries(options).map(([k, v]) => '<option value="' + esc(k) + '"' + (k === value ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '</select></label>';
  function benefNames() {
    const seen = new Set(), out = [];
    for (const o of ops) { const n = o.beneficiary?.name?.trim(); if (n && !seen.has(norm(n))) { seen.add(norm(n)); out.push(n); } }
    return out.slice(0, 80);
  }
  function infoCard(o) {
    return '<div class="form-card"><h3 class="invoice-h3">Client et montant</h3><div class="invoice-grid">'
      + field('Client', 'client', o.client || '', 'text', true, ' list="clientNames" autocomplete="off"') + field('Téléphone', 'phone', o.phone || '', 'tel') + field('Adresse', 'address', o.address || '')
      + select('Devise', 'currency', o.currency || 'EUR', { EUR: 'EUR', USD: 'USD' }) + field('Montant à envoyer', 'amount', o.amount ? String(o.amount).replace('.', ',') : '', 'money')
      + select('Paiement du client', 'transferType', o.transferType || 'bank', { bank: 'Dépôt bancaire', cash: 'Espèces / Mobile Money' }) + field('Total client (MGA)', 'totalMGA', o.totalMGA ? String(Math.round(o.totalMGA)) : '', 'money')
      + field('Note interne', 'note', o.note || '', 'textarea', true)
      + '</div>' + (draft ? '<p class="field-hint">Le total se calcule au taux du jour ; tu peux le corriger.</p>' : '')
      + (o.quoteId || o.clientId ? '<div class="backup-actions order-gap">' + (o.quoteId ? '<button type="button" class="secondary" data-act="quote">Devis ' + esc(o.quoteRef || '') + '</button>' : '<span></span>')
      + (o.clientId ? '<button type="button" class="secondary" data-act="client">Fiche client</button>' : '') + '</div>' : '') + '</div>';
  }
  function benefCard(o) {
    const b = o.beneficiary || emptyBenef();
    return '<div class="form-card"><h3 class="invoice-h3">Bénéficiaire</h3><div class="invoice-grid">'
      + field('Nom ou société', 'benef.name', b.name, 'text', true, ' list="opBenefNames" autocomplete="off"') + field('Compte, IBAN ou e-mail', 'benef.account', b.account, 'text', true)
      + field('Banque ou plateforme', 'benef.bank', b.bank) + field('Motif / référence', 'benef.reference', b.reference)
      + '</div><datalist id="opBenefNames">' + benefNames().map(n => '<option value="' + esc(n) + '"></option>').join('') + '</datalist></div>';
  }
  function statusCard(o, f) {
    const s = step(o.status), idx = stepIndex(o.status);
    const since = [...(o.events || [])].reverse().find(e => e.status === o.status)?.at || o.createdAt;
    const nextLabel = { attente: `Paiement intégral reçu${f.remaining ? ` (${fmtMGA(f.remaining, 0)})` : ''}`, paye: 'Envoi effectué →', envoye: 'Réception confirmée →' }[o.status];
    const progress = '<div class="order-progress" aria-hidden="true">' + STEPS.map((x, i) => '<span class="' + (o.status !== 'annulee' && i <= idx ? 'done' : '') + '"></span>').join('') + '</div>';
    return '<div class="form-card">' + progress
      + '<div class="order-step">' + chip(s) + '<span>' + esc(EpayUI.ago(since)) + ' · étape ' + (idx >= 0 ? `${idx + 1}/${STEPS.length}` : '—') + '</span></div>'
      + '<div class="backup-actions">' + (nextLabel ? '<button type="button" class="btn-ink" data-act="next">' + esc(nextLabel) + '</button>' : '<span></span>')
      + '<button type="button" class="secondary" data-act="notify"' + (o.phone ? '' : ' disabled') + '>Prévenir (WhatsApp)</button></div>'
      + '<label class="order-select">Changer d’étape<select data-field="status">' + [...STEPS, CANCELLED].map(x => '<option value="' + x.id + '"' + (x.id === o.status ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('') + '</select></label></div>';
  }
  function moneyCard(o, f) {
    const pays = (o.payments || []).map(p => '<div class="pay-row"><div><strong>' + esc(fmtMGA(Number(p.amount) || 0, 0)) + '</strong><span>' + esc([Number(p.amount) < 0 ? 'Remboursement' : '', displayDate(p.date), METHODS[p.method] || p.method, p.ref].filter(Boolean).join(' · ')) + '</span></div>'
      + '<button type="button" data-del-pay="' + esc(p.id) + '" aria-label="Supprimer ce paiement">×</button></div>').join('');
    const due = f.remaining > 0 && o.status !== 'annulee';
    const form = due || f.toRefund ? '<div class="invoice-grid order-gap">'
      + '<label>Moyen<select id="opPayMethod">' + Object.entries(METHODS).map(([k, v]) => '<option value="' + k + '">' + esc(v) + '</option>').join('') + '</select></label>'
      + '<label>Date<input id="opPayDate" type="date" value="' + isoDate() + '"></label><label class="invoice-wide">Référence<input id="opPayRef" type="text" placeholder="N° de transaction"></label></div>' : '';
    const actions = f.toRefund ? '<div class="backup-actions order-gap"><button type="button" class="secondary" data-act="refund">Rembourser ' + esc(fmtMGA(f.toRefund, 0)) + '</button><span></span></div>'
      : due ? '<div class="backup-actions order-gap"><button type="button" class="btn-ink" data-act="pay">Paiement reçu : ' + esc(fmtMGA(f.remaining, 0)) + '</button>'
        + '<button type="button" class="secondary" data-act="remind"' + (o.phone ? '' : ' disabled') + '>Relancer (WhatsApp)</button></div>' : '';
    return '<div class="form-card"><h3 class="invoice-h3">Paiement du client</h3>'
      + '<div class="order-figures"><div><span>Total (MGA)</span><strong>' + esc(fmtNumber(f.total, 0)) + '</strong></div><div><span>Encaissé</span><strong>' + esc(fmtNumber(f.paid, 0)) + '</strong></div><div><span>' + (f.toRefund ? 'À rembourser' : 'À encaisser') + '</span><strong class="' + (f.remaining || f.toRefund ? 'due' : 'ok') + '">' + esc(fmtNumber(f.toRefund || f.remaining, 0)) + '</strong></div></div>'
      + (pays ? '<div class="pay-list">' + pays + '</div>' : '')
      + (due ? '<p class="field-hint">Paiement intégral avant l’envoi : pas d’acompte.</p>' : '') + form + actions + '</div>';
  }
  function execCard(o, f) {
    const x = o.execution || {}, channel = x.channel || DEFAULT_DEBIT_MODE;
    const debit = x.debitMGA || estimate(o.amount, o.currency, channel);
    return '<div class="form-card"><h3 class="invoice-h3">Transfert</h3>'
      + '<div class="order-figures"><div><span>À envoyer</span><strong>' + esc(fmtCurrency(Number(o.amount) || 0, o.currency, 2)) + '</strong></div><div><span>' + (f.costReal ? 'Coût réel' : 'Coût estimé') + '</span><strong>' + esc(fmtNumber(f.cost, 0)) + '</strong></div><div><span>Bénéfice</span><strong class="' + (f.profit < 0 ? 'due' : 'ok') + '">' + esc(fmtNumber(f.profit, 0)) + '</strong></div></div>'
      + '<div class="invoice-grid order-gap"><label>Date d’envoi<input id="opExecDate" type="date" value="' + esc(x.date || isoDate()) + '"></label>'
      + '<label>Débité (MGA)<input id="opExecDebit" type="text" inputmode="decimal" value="' + esc(debit || '') + '"></label>'
      + '<label>Carte<select id="opExecChannel">' + Object.entries(CHANNELS).map(([k, v]) => '<option value="' + k + '"' + (k === channel ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '</select></label>'
      + '<label>Référence du transfert<input id="opExecRef" type="text" value="' + esc(x.ref || '') + '" autocomplete="off"></label></div>'
      + (o.execution ? '' : '<p class="field-hint">Débit estimé au taux interne du jour (' + esc(debitPlan(calcOwner(Number(o.amount) || 0, o.currency, channel))) + ') : corrige-le avec le montant réellement débité.</p>')
      + '<button type="button" class="secondary order-wide order-gap" data-act="exec">' + (o.execution ? 'Mettre à jour l’envoi' : 'Enregistrer l’envoi') + '</button></div>';
  }
  function receiptCard() {
    return '<div class="form-card"><h3 class="invoice-h3">Reçu pour le client</h3><div class="backup-actions">'
      + '<button type="button" class="secondary" data-act="receipt-print"><svg class="icon sm"><use href="#i-print"/></svg>PDF</button>'
      + '<button type="button" class="secondary" data-act="receipt-image"><svg class="icon sm"><use href="#i-image"/></svg>Image</button></div>'
      + '<button type="button" class="secondary order-wide order-gap" data-act="receipt-wa"><svg class="icon sm"><use href="#i-whatsapp"/></svg>Envoyer le reçu (WhatsApp)</button></div>';
  }
  function renderSheet() {
    const o = editing ? get(editing) : draft;
    if (!o) { EpayUI.closeSheet('operationSheet'); return; }
    if (!editing) {
      el('operationSheetTitle').textContent = 'Nouvelle opération';
      el('operationSheetSub').textContent = 'Sans devis : client, montant en devise et bénéficiaire.';
      el('operationBody').innerHTML = infoCard(o) + benefCard(o) + '<button type="button" class="btn-ink order-wide" data-act="create">Créer l’opération</button>';
      return;
    }
    const f = figures(o);
    el('operationSheetTitle').textContent = `Opération ${o.number}`;
    el('operationSheetSub').textContent = `${o.client || 'Client à renseigner'} · ${fmtCurrency(Number(o.amount) || 0, o.currency, 2)} · créée le ${displayDate(String(o.createdAt).slice(0, 10))}`;
    const events = '<div class="form-card"><h3 class="invoice-h3">Historique</h3><div class="event-list">' + [...(o.events || [])].reverse().map(e => '<div><span>' + esc(displayDate(String(e.at).slice(0, 10))) + '</span>' + esc(step(e.status).label) + '</div>').join('') + '</div></div>';
    el('operationBody').innerHTML = statusCard(o, f) + moneyCard(o, f) + execCard(o, f) + benefCard(o) + receiptCard() + infoCard(o) + events
      + '<div class="backup-actions order-gap"><button type="button" class="secondary" data-act="repeat"><svg class="icon sm"><use href="#i-copy"/></svg>Refaire pour ce client</button><span></span></div>'
      + '<button class="text-btn danger" type="button" data-act="delete"><svg class="icon sm"><use href="#i-trash"/></svg>Supprimer cette opération</button>';
  }
  function open(id) {
    if (!get(id)) return;
    editing = id; draft = null; renderSheet(); EpayUI.openSheet('operationSheet');
  }
  function openNew(prefill = {}) {
    editing = null;
    draft = { client: '', phone: '', address: '', clientId: '', currency: state.currency, amount: 0, transferType: 'bank', totalMGA: 0, note: '', beneficiary: emptyBenef(), ...prefill };
    if (draft.amount && !prefill.totalMGA) recalc(draft);
    renderSheet(); EpayUI.openSheet('operationSheet');
  }
  const newFor = c => openNew({ clientId: c?.id || '', client: c?.name || '', phone: c?.phone || '', address: c?.address || '' });
  function readInfo(o) {
    for (const input of el('operationBody').querySelectorAll('[data-field]')) {
      const k = input.dataset.field; if (k === 'status') continue;
      const v = input.value.trim();
      if (k.startsWith('benef.')) { (o.beneficiary ||= emptyBenef())[k.slice(6)] = v; continue; }
      if (k === 'totalMGA') o.totalMGA = Math.round(money(v));
      else if (k === 'amount') o.amount = money(v);
      else o[k] = v;
    }
  }
  // Total, taux et coût recalculés aux taux du jour (montant, devise ou mode modifié).
  function recalc(o) {
    const t = calcClient(Number(o.amount) || 0, o.currency, o.transferType);
    if (!t) return false;
    Object.assign(o, { totalMGA: t.total, rate: t.rate, serviceFeesMGA: t.serviceFeesMGA });
    return true;
  }
  function linkClient(o) {
    const c = window.EpayClients?.upsert({ id: o.clientId, name: o.client, phone: o.phone, address: o.address });
    if (c) o.clientId = c.id;
  }
  async function create() {
    const o = draft; if (!o) return;
    readInfo(o);
    if (!o.client) { showToast('Indique le nom du client.', 'warn'); return; }
    if (!(o.amount > 0)) { showToast('Indique le montant à envoyer (en devise).', 'warn'); return; }
    if (!(o.totalMGA > 0) && !recalc(o)) { showToast('Indique le total à payer par le client.', 'warn'); return; }
    if (!o.rate) o.rate = clientRateFor(o.currency);
    Object.assign(o, { id: uid(), number: await allocate(), createdAt: now(), updatedAt: now(), status: 'attente', payments: [], execution: null, events: [{ at: now(), status: 'attente' }], estCostMGA: estimate(o.amount, o.currency) });
    linkClient(o);
    ops.unshift(o); draft = null; editing = o.id; saveAll(); renderSheet(); renderList();
    showToast(`Opération ${o.number} créée.`, 'info');
  }
  function removeOp(o) {
    if (!confirm(`Supprimer l’opération ${o.number} ? Ses paiements enregistrés disparaissent avec elle.`)) return;
    const i = ops.indexOf(o); ops.splice(i, 1);
    const q = state.quotes.find(x => x.operationId === o.id);
    if (q) { delete q.operationId; persistQuotes(); renderQuotes(); }
    saveAll(); EpayUI.closeSheet('operationSheet'); editing = null; renderList();
    showToast(`Opération ${o.number} supprimée.`, 'info', { label: 'Annuler', run: () => { ops.splice(Math.min(i, ops.length), 0, o); if (q) { q.operationId = o.id; persistQuotes(); renderQuotes(); } saveAll(); renderList(); } });
  }
  // Bénéficiaire déjà servi : compte et banque repris de la dernière opération.
  function completeBenef(o) {
    const n = norm(o.beneficiary?.name); if (!n) return;
    const prev = ops.find(x => x !== o && norm(x.beneficiary?.name) === n); if (!prev) return;
    for (const k of ['account', 'bank']) if (!o.beneficiary[k] && prev.beneficiary[k]) o.beneficiary[k] = prev.beneficiary[k];
  }

  function onFieldChange(e) {
    const input = e.target.closest('[data-field]'); if (!input) return;
    const k = input.dataset.field, o = editing ? get(editing) : draft; if (!o) return;
    if (k === 'status') { if (editing) { setStatus(o, input.value); renderSheet(); renderList(); } return; }
    readInfo(o);
    if (k === 'client' && !o.phone) { const c = window.EpayClients?.find({ name: o.client }); if (c) Object.assign(o, { phone: c.phone || '', address: o.address || c.address || '', clientId: c.id }); }
    if (k === 'benef.name') completeBenef(o);
    const amountChanged = ['amount', 'currency', 'transferType'].includes(k);
    if (!editing) { if (amountChanged) recalc(o); renderSheet(); return; } // brouillon : lu à la création
    if (amountChanged) {
      if (!o.execution) o.estCostMGA = estimate(o.amount, o.currency);
      if (!(o.payments || []).length && recalc(o)) showToast(`Total recalculé au taux du jour : ${fmtMGA(o.totalMGA, 0)}.`, 'info');
    }
    if (['client', 'phone', 'address'].includes(k)) linkClient(o);
    touch(o); saveAll(); renderList();
    if (amountChanged || k.startsWith('benef.') || k === 'client' || k === 'totalMGA') renderSheet();
  }
  el('operationBody').addEventListener('change', onFieldChange);
  el('operationBody').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'create') { create().catch(err => showToast(`Création impossible : ${err.message || 'erreur'}`, 'error')); return; }
    const o = get(editing); if (!o) return;
    if (act === 'next') {
      if (o.status === 'attente') {
        const f = figures(o);
        if (f.remaining > 0) { const p = readPayment(); addPayment(o, { ...p, amount: f.remaining }); showToast(`${fmtMGA(f.remaining, 0)} encaissés : ${o.number} est à envoyer.`, 'info'); }
        else setStatus(o, 'paye');
      } else if (o.status === 'paye') { if (!recordExecution(o)) return; }
      else if (o.status === 'envoye') setStatus(o, 'confirme');
    } else if (act === 'notify') notify(o);
    else if (act === 'remind') remind(o);
    else if (act === 'pay') {
      const f = figures(o); if (!(f.remaining > 0)) return;
      addPayment(o, { ...readPayment(), amount: f.remaining }); showToast(`${fmtMGA(f.remaining, 0)} encaissés : ${o.number} est payée en totalité.`, 'info');
    } else if (act === 'refund') {
      const f = figures(o); if (!f.toRefund || !confirm(`Enregistrer le remboursement de ${fmtMGA(f.toRefund, 0)} au client ?`)) return;
      const p = readPayment(); addPayment(o, { ...p, amount: -f.toRefund, ref: p.ref || 'Remboursement' });
    } else if (b.dataset.delPay) {
      if (!confirm('Supprimer ce paiement ?')) return;
      o.payments = (o.payments || []).filter(p => p.id !== b.dataset.delPay); touch(o); saveAll();
    } else if (act === 'exec') { if (!recordExecution(o)) return; }
    else if (act === 'receipt-print') { printReceipt(o); return; }
    else if (act === 'receipt-image') { window.EpayExport?.receipt(receiptData(o)); return; }
    else if (act === 'receipt-wa') { EpayUI.openWhatsApp(o.phone, `${EpayUI.fill(message('receipt'), vars(o))}\n\n${receiptText(o)}`); return; }
    else if (act === 'quote') {
      const q = state.quotes.find(x => x.id === o.quoteId);
      if (!q) { showToast('Le devis de cette opération n’est plus sur cet appareil.', 'warn'); return; }
      EpayUI.closeSheet('operationSheet'); setView('quotes'); openQuote(q); return;
    } else if (act === 'client') { window.EpayClients?.open(o.clientId); return; }
    else if (act === 'repeat') {
      openNew({ clientId: o.clientId, client: o.client, phone: o.phone, address: o.address, currency: o.currency, amount: o.amount, transferType: o.transferType, beneficiary: { ...emptyBenef(), ...o.beneficiary } });
      showToast('Nouvelle opération préremplie : vérifie le montant, puis « Créer l’opération ».', 'info'); return;
    } else if (act === 'delete') { removeOp(o); return; }
    else return;
    renderSheet(); renderList();
  });

  el('operationSearch').addEventListener('input', renderList);
  el('operationFilter').addEventListener('input', renderList);
  el('operationsList').addEventListener('click', e => { const r = e.target.closest('[data-open-op]'); if (r) open(r.dataset.openOp); });
  el('operationNew').addEventListener('click', () => openNew());
  el('operationFilter').innerHTML = '<option value="active">En cours</option><option value="all">Toutes</option>' + [...STEPS, CANCELLED].map(s => '<option value="' + s.id + '">' + esc(s.label) + '</option>').join('');
  function reload() {
    ops = load();
    if (state.view === 'operations') renderList();
    if (editing && el('operationSheet').classList.contains('open')) renderSheet();
    emit();
  }
  window.EpaySync?.onApply('operations', reload);
  viewHooks.operations = renderList;
  window.EpayOperations = {
    list: () => ops.slice(), get, open, openNew, newFor, openList, fromQuote, ensureForQuote, figures, step, steps: STEPS, isOpen, isSent, methods: METHODS,
    onChange: fn => listeners.add(fn), reload
  };
})();
