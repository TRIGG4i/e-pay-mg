// Réglages : entreprise, règlement, documents, tarifs, réception, coûts, taux et messages, partagés entre appareils ;
// le compte (un mot de passe) qui relie les appareils au serveur HELPEO ; la sauvegarde complète.
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  if (!el('settingsView')) return;
  const { esc } = EpayUI;
  const KEY = 'epaySettingsV1', S = window.EpaySync, D = EpayPricing.DEFAULTS;
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEBIT_MODES = { foreign: 'Carte étrangère (recharge)', direct: 'Débit direct' };
  // Valeurs d'origine : celles du code, tant que rien n'a été modifié.
  const DEFAULTS = {
    company: { name: OFFICE.name, slogan: OFFICE.slogan, phone: '', email: '', address: '', nif: '', stat: '', legal: OFFICE.legal },
    payment: { mvola: '', orange: '', airtel: '', bankHolder: '', bankName: '', rib: '' },
    docs: { quotePrefix: DOCS.prefixes.quote, operationPrefix: DOCS.prefixes.operation, quoteValidityDays: DOCS.quoteValidityDays, quoteNote: DOCS.quoteNote },
    pricing: {
      t1max: D.tiers[0].below, t1: D.tiers[0].percent, t2max: D.tiers[1].below, t2: D.tiers[1].percent, t3: D.tiers[2].percent,
      clientVisaFeePercent: D.clientVisaFeePercent, bankCurrencyFeePercent: D.bankCurrencyFeePercent, cardFeePercent: D.cardFeePercent,
      fixedVisaFeeMGA: D.fixedVisaFeeMGA, cashFeePercent: D.cashFeePercent, roundTo: D.roundTo
    },
    receive: { receiveVisaFeePercent: D.receiveVisaFeePercent, receiveRoundTo: D.receiveRoundTo },
    costs: { ownerVisaFeePercent: D.ownerVisaFeePercent, rechargeFeePercent: D.rechargeFeePercent, ownerFixedFeeMGA: D.ownerFixedFeeMGA, ownerCardLimitMGA: D.ownerCardLimitMGA, debitMode: 'foreign' },
    rates: { eur: 0, usd: 0, eurIn: 0, usdIn: 0 },
    messages: {
      quote: 'Bonjour {client}, voici votre devis {entreprise} :',
      status: 'Bonjour {client}, votre opération {operation} ({montant}) : {statut}.{reference}\n{entreprise}',
      reminder: 'Bonjour {client}, petit rappel : il reste {reste} à régler pour l’opération {operation} ({montant}). Merci !\n{entreprise}',
      receipt: 'Bonjour {client}, voici le reçu de votre opération {operation} :'
    }
  };
  const SECTIONS = [
    { id: 'company', title: 'Entreprise', sub: 'Émetteur imprimé sur les devis et les reçus', fields: [
      ['name', 'Nom'], ['slogan', 'Slogan'], ['phone', 'Téléphone'], ['email', 'E-mail'], ['address', 'Adresse', 'wide'], ['nif', 'NIF'], ['stat', 'STAT'],
      ['legal', 'Pied des documents', 'wide']] },
    { id: 'payment', title: 'Règlement', sub: 'Où tes clients règlent : imprimé sur devis et reçus', fields: [
      ['mvola', 'MVola'], ['orange', 'Orange Money'], ['airtel', 'Airtel Money'], ['bankHolder', 'Titulaire du compte'], ['bankName', 'Banque', 'wide'], ['rib', 'RIB', 'wide']] },
    { id: 'docs', title: 'Devis et opérations', sub: 'Numérotation, validité et mention du devis', fields: [
      ['quotePrefix', 'Préfixe des devis', 'code'], ['operationPrefix', 'Préfixe des opérations', 'code'],
      ['quoteValidityDays', 'Validité du devis (jours, 0 = le jour même)', 'int'], ['quoteNote', 'Mention du devis', 'text']] },
    { id: 'pricing', title: 'Tarifs client', sub: 'Commission et frais inclus dans le total client', fields: [
      ['t1max', 'Tranche 1 : montant inférieur à (devise)', 'num'], ['t1', 'Commission tranche 1 (%)', 'num'], ['t2max', 'Tranche 2 : montant inférieur à', 'num'],
      ['t2', 'Commission tranche 2 (%)', 'num'], ['t3', 'Commission au-delà (%)', 'num'], ['clientVisaFeePercent', 'Marge sur le taux VISA (%)', 'num'],
      ['bankCurrencyFeePercent', 'Frais bancaires en devise (%)', 'num'], ['cardFeePercent', 'Frais de carte (%)', 'num'], ['fixedVisaFeeMGA', 'Frais fixe VISA (MGA)', 'num'],
      ['cashFeePercent', 'Supplément espèces / Mobile (%)', 'num'], ['roundTo', 'Arrondi du total (MGA)', 'num', 'Total arrondi au-dessus : 1000 par défaut.']] },
    { id: 'receive', title: 'Réception', sub: 'Depuis l’étranger : mêmes paliers de commission que les tarifs client', fields: [
      ['receiveVisaFeePercent', 'Frais VISA, carte en devise (%)', 'num', 'Frais saisis dans le calculateur VISA (devise vers MGA) : 4 par défaut.'],
      ['receiveRoundTo', 'Arrondi du montant remis (MGA)', 'num', 'Arrondi en dessous : 100 par défaut.']] },
    { id: 'costs', title: 'Coûts internes', sub: 'Ce que te coûte une opération : calcul interne et bénéfice', fields: [
      ['ownerVisaFeePercent', 'Frais sur ton taux VISA (%)', 'num'], ['rechargeFeePercent', 'Recharge carte étrangère (%)', 'num'],
      ['ownerFixedFeeMGA', 'Frais fixe par débit de carte (MGA)', 'num'],
      ['ownerCardLimitMGA', 'Plafond d’un débit de carte (MGA)', 'num', 'Par carte et par jour, frais fixe compris : 5000000 par défaut, 0 = sans plafond. Au-delà, le calcul répartit sur plusieurs débits.'],
      ['debitMode', 'Mode de débit par défaut', DEBIT_MODES]] },
    { id: 'rates', title: 'Taux manuels', sub: 'Taux VISA de base imposé (0 = taux VISA du jour, automatique)', fields: [
      ['eur', '1 EUR en MGA (base VISA)', 'num'], ['usd', '1 USD en MGA (base VISA)', 'num'],
      ['eurIn', '1 EUR en MGA, réception (base VISA)', 'num'], ['usdIn', '1 USD en MGA, réception (base VISA)', 'num', 'À n’utiliser que si le taux automatique est faux : les marges s’ajoutent comme d’habitude.']] },
    { id: 'messages', title: 'Messages', sub: 'Textes WhatsApp envoyés aux clients', fields: [
      ['quote', 'Avant le devis', 'text'], ['status', 'Avancement de l’opération', 'text'], ['reminder', 'Relance', 'text'],
      ['receipt', 'Avant le reçu', 'text', 'Variables : {client}, {operation}, {montant}, {statut}, {reference}, {beneficiaire}, {total}, {paye}, {reste}, {entreprise}.']] }
  ];

  const readStored = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };
  // Anciennes valeurs d'origine (E-Pay MG, premier slogan HELPEO) : remplacées par celles de HELPEO tant qu'elles n'ont pas été modifiées.
  const LEGACY = {
    company: { name: ['E-Pay MG'], slogan: ['Paiements en devise', 'On vous aide à régler ça'] },
    docs: { quotePrefix: ['EP'], quoteNote: ['Le total correspond au montant converti augmenté des frais de service et de traitement applicables.'] }
  };
  // Seules les clés connues sont reprises, au bon type ; une clé absente garde sa valeur d'origine.
  function merged(stored) {
    const out = clone(DEFAULTS);
    for (const [sec, fields] of Object.entries(out)) for (const k of Object.keys(fields)) {
      const v = stored?.[sec]?.[k];
      if (v === undefined || v === null || LEGACY[sec]?.[k]?.includes(v)) continue;
      out[sec][k] = typeof fields[k] === 'number' ? (Number.isFinite(Number(v)) ? Number(v) : fields[k]) : String(v);
    }
    return out;
  }
  function validate(s) {
    const d = s.docs, t = s.pricing, c = s.costs, r = s.rates, v = s.receive;
    if (!s.company.name) return 'Indique le nom de l’entreprise.';
    for (const k of ['quotePrefix', 'operationPrefix']) if (!/^[A-Z0-9]{1,8}$/.test(d[k])) return 'Préfixes : lettres majuscules et chiffres, 8 au maximum.';
    if (d.quotePrefix === d.operationPrefix) return 'Les deux préfixes doivent être différents.';
    if (!(Number.isInteger(d.quoteValidityDays) && d.quoteValidityDays >= 0 && d.quoteValidityDays <= 30)) return 'Validité du devis : de 0 à 30 jours.';
    if (!(t.t1max > 0 && t.t2max > t.t1max)) return 'Tarifs : la tranche 2 doit commencer au-dessus de la tranche 1.';
    for (const k of ['t1', 't2', 't3', 'clientVisaFeePercent', 'bankCurrencyFeePercent', 'cardFeePercent', 'cashFeePercent']) if (!(t[k] >= 0 && t[k] <= 50)) return 'Les pourcentages des tarifs vont de 0 à 50 %.';
    if (!(t.fixedVisaFeeMGA >= 0 && t.roundTo >= 0)) return 'Frais fixe et arrondi : nombres positifs.';
    if (!(v.receiveVisaFeePercent >= 0 && v.receiveVisaFeePercent <= 50 && v.receiveRoundTo >= 0)) return 'Réception : frais de 0 à 50 %, arrondi positif.';
    for (const k of ['ownerVisaFeePercent', 'rechargeFeePercent']) if (!(c[k] >= 0 && c[k] < 50)) return 'Les pourcentages des coûts vont de 0 à 50 %.';
    if (!(c.ownerFixedFeeMGA >= 0)) return 'Frais fixe par débit : nombre positif.';
    if (!(c.ownerCardLimitMGA === 0 || c.ownerCardLimitMGA > c.ownerFixedFeeMGA)) return 'Plafond de carte : 0 (sans plafond) ou un montant supérieur au frais fixe.';
    if (!DEBIT_MODES[c.debitMode]) return 'Mode de débit inconnu.';
    for (const k of ['eur', 'usd', 'eurIn', 'usdIn']) if (!(r[k] === 0 || (r[k] >= 500 && r[k] <= 50000))) return 'Taux manuel : 0 (automatique) ou un taux réaliste, par exemple 5150.';
    return '';
  }
  function apply(s) {
    const c = s.company, p = s.payment, d = s.docs, t = s.pricing, k = s.costs;
    Object.assign(OFFICE, { name: c.name, slogan: c.slogan, legal: c.legal, phone: c.phone, email: c.email, address: c.address, nif: c.nif, stat: c.stat, mvola: p.mvola, orange: p.orange, airtel: p.airtel, bankHolder: p.bankHolder, bankName: p.bankName, rib: p.rib });
    DOCS.prefixes = { quote: d.quotePrefix, operation: d.operationPrefix };
    DOCS.quoteValidityDays = d.quoteValidityDays;
    DOCS.quoteNote = d.quoteNote || DEFAULTS.docs.quoteNote;
    TARIFS = {
      ...D, tiers: [{ below: t.t1max, percent: t.t1 }, { below: t.t2max, percent: t.t2 }, { below: null, percent: t.t3 }],
      clientVisaFeePercent: t.clientVisaFeePercent, bankCurrencyFeePercent: t.bankCurrencyFeePercent, cardFeePercent: t.cardFeePercent,
      fixedVisaFeeMGA: t.fixedVisaFeeMGA, cashFeePercent: t.cashFeePercent, roundTo: t.roundTo,
      ownerVisaFeePercent: k.ownerVisaFeePercent, rechargeFeePercent: k.rechargeFeePercent, ownerFixedFeeMGA: k.ownerFixedFeeMGA, ownerCardLimitMGA: k.ownerCardLimitMGA,
      receiveVisaFeePercent: s.receive.receiveVisaFeePercent, receiveRoundTo: s.receive.receiveRoundTo
    };
    DEFAULT_DEBIT_MODE = k.debitMode;
    MANUAL_BASE.EUR = s.rates.eur; MANUAL_BASE.USD = s.rates.usd; MANUAL_RECEIVE.EUR = s.rates.eurIn; MANUAL_RECEIVE.USD = s.rates.usdIn;
    el('brandName').innerHTML = brandHTML(c.name);
  }
  // Calcul, devis et listes redessinés avec les nouvelles valeurs.
  function refreshViews() {
    try { refreshAll(); } catch (e) { console.error('HELPEO réglages :', e); }
    if (state.view === 'operations') viewHooks.operations?.();
  }

  let current = merged(readStored());
  if (readStored()) apply(current);

  const setStatus = (msg, error = false) => { const s = el('settingsStatus'); s.textContent = msg; s.style.color = error ? 'var(--danger)' : 'var(--muted)'; };
  function input(sec, k, kind, v) {
    const name = sec + '.' + k;
    if (kind && typeof kind === 'object') return '<select data-set="' + name + '">' + Object.entries(kind).map(([val, label]) => '<option value="' + esc(val) + '"' + (val === v ? ' selected' : '') + '>' + esc(label) + '</option>').join('') + '</select>';
    if (kind === 'text') return '<textarea data-set="' + name + '" rows="3">' + esc(v) + '</textarea>';
    return '<input data-set="' + name + '" value="' + esc(v) + '"' + (kind === 'int' || kind === 'num' ? ' type="text" inputmode="decimal"' : ' type="text"')
      + (kind === 'code' ? ' autocapitalize="characters" maxlength="8"' : '') + '>';
  }
  function render() {
    const open = new Set([...el('settingsForms').querySelectorAll('details[open]')].map(d => d.dataset.sec));
    el('settingsForms').innerHTML = SECTIONS.map(sec => '<details class="card settings-card" data-sec="' + sec.id + '"' + (open.has(sec.id) ? ' open' : '') + '>'
      + '<summary><div><h2>' + esc(sec.title) + '</h2><p>' + esc(sec.sub) + '</p></div><svg class="icon sm"><use href="#i-chevron"/></svg></summary>'
      + '<div class="invoice-grid settings-grid">' + sec.fields.map(([k, label, kind = '', hint = '']) => {
        const wide = kind === 'wide' || kind === 'text' ? ' class="invoice-wide"' : '';
        return '<label' + wide + '>' + esc(label) + input(sec.id, k, kind, current[sec.id][k]) + (hint ? '<small class="field-hint">' + esc(hint) + '</small>' : '') + '</label>';
      }).join('') + '</div></details>').join('');
  }
  function readForm() {
    const s = clone(current);
    for (const field of el('settingsForms').querySelectorAll('[data-set]')) {
      const [sec, k] = field.dataset.set.split('.');
      if (typeof DEFAULTS[sec][k] === 'number') s[sec][k] = Number(String(field.value).replace(/[\s  ]/g, '').replace(',', '.') || 0);
      else s[sec][k] = k.endsWith('Prefix') ? field.value.trim().toUpperCase() : field.value.trim();
    }
    return s;
  }
  function store(s) {
    try { localStorage.setItem(KEY, JSON.stringify({ ...s, updatedAt: EpayUI.now() })); } catch { setStatus('Mémoire du navigateur pleine : réglages non enregistrés.', true); return false; }
    window.EpaySync?.changed('settings');
    return true;
  }
  function save() {
    const next = readForm(), error = validate(next);
    if (error) { setStatus(error, true); showToast(error, 'error'); return; }
    current = next;
    if (!store(current)) return;
    apply(current); refreshViews();
    setStatus(`Réglages enregistrés${S?.enabled() ? ' et envoyés à tes autres appareils' : ' sur cet appareil'}.`);
  }
  function reset() {
    if (!confirm('Rétablir tous les réglages d’origine (entreprise, règlement, documents, tarifs, réception, coûts, taux, messages) ?')) return;
    current = clone(DEFAULTS);
    if (!store(current)) return;
    apply(current); render(); refreshViews();
    setStatus('Réglages d’origine rétablis.');
  }
  function reload() { current = merged(readStored()); apply(current); render(); refreshViews(); }

  // ---------- Sauvegarde : tout dans un fichier ; l'import fusionne sans doublon ----------
  const BACKUP = { quotes: 'epayQuotesV2', operations: 'epayOperationsV1', clients: 'epayClientsV1', settings: KEY, quoteSeq: 'epayQuoteSequenceV2', operationSeq: 'epayOperationSeqV1' };
  function exportBackup() {
    const data = { app: 'HELPEO', version: 1, exportedAt: new Date().toISOString(), quotes: readStore(BACKUP.quotes, []), operations: readStore(BACKUP.operations, []), clients: readStore(BACKUP.clients, []), settings: readStore(BACKUP.settings, null), quoteSeq: readStore(BACKUP.quoteSeq, {}), operationSeq: readStore(BACKUP.operationSeq, {}) };
    EpayUI.download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `helpeo-sauvegarde-${isoDate()}.json`);
    el('backupStatus').textContent = `Sauvegarde exportée : ${data.quotes.length} devis, ${data.operations.length} opérations, ${data.clients.length} clients.`;
  }
  const stamp = x => String(x?.updatedAt || x?.createdAt || '');
  function mergeById(local, incoming) {
    const map = new Map((Array.isArray(local) ? local : []).filter(x => x?.id).map(x => [x.id, x])); let added = 0;
    for (const x of Array.isArray(incoming) ? incoming : []) { if (!x?.id) continue; const cur = map.get(x.id); if (!cur) added++; if (!cur || stamp(x) > stamp(cur)) map.set(x.id, x); }
    return { list: [...map.values()], added };
  }
  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!['HELPEO', 'E-Pay MG'].includes(data?.app) || !Array.isArray(data.quotes)) throw new Error('ce fichier n’est pas une sauvegarde HELPEO');
      const byNumber = (a, b) => String(b.number || '~').localeCompare(String(a.number || '~'));
      const q = mergeById(readStore(BACKUP.quotes, []), data.quotes), o = mergeById(readStore(BACKUP.operations, []), data.operations), c = mergeById(readStore(BACKUP.clients, []), data.clients);
      localStorage.setItem(BACKUP.quotes, JSON.stringify(q.list.sort(byNumber)));
      localStorage.setItem(BACKUP.operations, JSON.stringify(o.list.sort(byNumber)));
      localStorage.setItem(BACKUP.clients, JSON.stringify(c.list));
      if (data.settings && typeof data.settings === 'object' && !readStored()) localStorage.setItem(KEY, JSON.stringify(data.settings));
      for (const k of ['quoteSeq', 'operationSeq']) { const cur = readStore(BACKUP[k], {}) || {}; for (const [d, n] of Object.entries(data[k] || {})) cur[d] = Math.max(Number(cur[d]) || 0, Number(n) || 0); localStorage.setItem(BACKUP[k], JSON.stringify(cur)); }
      state.quotes = readStore(BACKUP.quotes, []).filter(x => x && x.id).map(normalizeQuote); renderQuotes();
      window.EpayOperations?.reload(); window.EpayClients?.reload(); reload(); window.EpaySync?.changed();
      el('backupStatus').textContent = `Import terminé : ${q.added} devis, ${o.added} opérations et ${c.added} clients ajoutés, les autres mis à jour s’ils étaient plus récents.`;
    } catch (e) { el('backupStatus').textContent = `Import impossible : ${e.message || 'fichier illisible'}.`; }
  }
  el('backupExport').addEventListener('click', exportBackup);
  el('backupImportBtn').addEventListener('click', () => el('backupImport').click());
  el('backupImport').addEventListener('change', () => { const f = el('backupImport').files?.[0]; if (f) importBackup(f).finally(() => { el('backupImport').value = ''; }); });

  // ---------- Compte et synchronisation ----------
  let activationToken = '';
  const account = (msg, error = false) => { const s = el('syncStatus'); s.textContent = msg; s.style.color = error ? 'var(--danger)' : 'var(--muted)'; };
  const clock = iso => { const d = new Date(iso); return Number.isNaN(d.valueOf()) ? '' : `${EpayUI.ago(iso)} à ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d)}`; };
  function renderAccount(st = S?.status()) {
    if (!S || !st) { el('syncCard').hidden = true; return; }
    const on = st.enabled;
    el('syncLoggedOut').hidden = on; el('syncLoggedIn').hidden = !on;
    el('syncActivate').hidden = !activationToken; el('syncLogin').hidden = Boolean(activationToken);
    el('syncChip').textContent = !on ? 'Non connecté' : ({ syncing: 'Synchronisation…', offline: 'Hors ligne', error: 'Erreur' }[st.state] || 'Synchronisé');
    el('syncChip').dataset.state = on ? st.state : 'off';
    if (on) el('syncLine').textContent = `${st.device || 'Cet appareil'} · ${st.lastSync ? `dernier échange ${clock(st.lastSync)}` : 'premier échange en cours'}${st.pending ? ` · ${st.pending} modification(s) à envoyer` : ''}`;
    if (st.error) account(st.error, true);
  }
  async function busy(button, fn) {
    button.disabled = true; account('');
    try { await fn(); } catch (e) { account(e.message || 'Erreur', true); } finally { button.disabled = false; }
  }
  function takeActivation() {
    const m = /(?:^#|&)activer=([A-Za-z0-9_-]{20,})/.exec(location.hash);
    if (!m) return;
    activationToken = m[1];
    history.replaceState(null, '', location.pathname + location.search); // le jeton ne reste pas dans l'adresse
    setView('settings');
    account('Lien d’activation reconnu : choisis le mot de passe de HELPEO. Il servira sur tous tes appareils.');
  }
  async function loadDevices() {
    const box = el('syncDevices');
    box.innerHTML = '<p class="field-hint">Chargement…</p>';
    try {
      const list = await S.sessions();
      box.innerHTML = list.map(d => '<div class="device-row"><div><strong>' + esc(d.device) + (d.current ? ' · cet appareil' : '') + '</strong><span>Connecté ' + esc(EpayUI.ago(d.created)) + ' · vu ' + esc(EpayUI.ago(d.lastSeen)) + '</span></div>'
        + (d.current ? '' : '<button type="button" class="secondary" data-revoke="' + esc(d.id) + '">Retirer</button>') + '</div>').join('') || '<p class="field-hint">Aucun appareil.</p>';
    } catch (e) { box.innerHTML = '<p class="field-hint">' + esc(e.message || 'Liste indisponible') + '</p>'; }
  }

  if (S) {
    S.onStatus(renderAccount);
    el('syncLoginBtn').addEventListener('click', () => busy(el('syncLoginBtn'), async () => {
      const p = el('syncPass').value;
      if (!p) throw Error('Indique le mot de passe.');
      await S.login(p);
      el('syncPass').value = '';
      showToast('Connecté : devis, opérations, clients et réglages se synchronisent.', 'info');
    }));
    el('syncPass').addEventListener('keydown', e => { if (e.key === 'Enter') el('syncLoginBtn').click(); });
    el('syncActivateBtn').addEventListener('click', () => busy(el('syncActivateBtn'), async () => {
      const p1 = el('syncNewPass').value, p2 = el('syncNewPass2').value;
      if (p1.length < 10) throw Error('Mot de passe trop court : 10 caractères au minimum.');
      if (p1 !== p2) throw Error('Les deux mots de passe ne sont pas identiques.');
      await S.activate(activationToken, p1);
      activationToken = ''; el('syncNewPass').value = ''; el('syncNewPass2').value = '';
      renderAccount();
      showToast('Synchronisation activée. Sur tes autres appareils : Suivi › Réglages, puis ce mot de passe.', 'info');
    }));
    el('syncNowBtn').addEventListener('click', () => busy(el('syncNowBtn'), async () => {
      if (await S.syncNow()) account('Tout est à jour.');
    }));
    el('syncLogoutBtn').addEventListener('click', () => busy(el('syncLogoutBtn'), async () => {
      if (!confirm('Se déconnecter sur cet appareil ? Les données restent dans ce navigateur.')) return;
      await S.logout();
      account('Déconnecté. Les données restent sur cet appareil.');
    }));
    el('syncDevicesBox').addEventListener('toggle', () => { if (el('syncDevicesBox').open) loadDevices(); });
    el('syncDevices').addEventListener('click', e => {
      const b = e.target.closest('[data-revoke]'); if (!b) return;
      busy(b, async () => { if (!confirm('Retirer cet appareil ? Il devra retaper le mot de passe.')) return; await S.revoke(b.dataset.revoke); await loadDevices(); });
    });
    el('syncPassChange').addEventListener('click', () => busy(el('syncPassChange'), async () => {
      const cur = el('syncPassCurrent').value, p1 = el('syncPassNext').value, p2 = el('syncPassNext2').value;
      if (!cur) throw Error('Indique le mot de passe actuel.');
      if (p1.length < 10) throw Error('Nouveau mot de passe trop court : 10 caractères au minimum.');
      if (p1 !== p2) throw Error('Les deux nouveaux mots de passe ne sont pas identiques.');
      await S.changePassword(cur, p1);
      for (const id of ['syncPassCurrent', 'syncPassNext', 'syncPassNext2']) el(id).value = '';
      account('Mot de passe changé : les autres appareils doivent se reconnecter.');
    }));
    S.onApply('settings', reload);
  }

  viewHooks.settings = () => {
    renderAccount();
    if (S && !S.enabled() && !activationToken) S.serverStatus().then(r => { if (r && r.activated === false) account('Le serveur attend son activation : ouvre le lien d’activation reçu, sur cet appareil.'); }).catch(() => {});
  };
  el('settingsForms').addEventListener('change', save);
  el('settingsReset').addEventListener('click', reset);
  el('appBuild').textContent = window.EPAY?.build || '—';
  el('appReload').addEventListener('click', () => location.reload());
  window.EpaySettings = { get: () => clone(current), messages: () => ({ ...current.messages }), reload };
  render(); renderAccount(); takeActivation();
  if (readStored()) refreshViews();
})();
