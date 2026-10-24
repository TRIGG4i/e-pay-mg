// Suivi : chiffres du mois, choses à faire, opérations par étape, encaissements et bénéfice des six derniers mois.
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  if (!el('suiviView')) return;
  const { esc } = EpayUI;
  const O = window.EpayOperations;
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MEASURES = { cash: { title: 'Encaissé par mois', label: 'Encaissé' }, profit: { title: 'Bénéfice par mois', label: 'Bénéfice' } };
  const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const compact = v => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e6 ? `${s}${fmtNumber(a / 1e6, a >= 1e7 ? 0 : 1)} M` : a >= 1e3 ? `${s}${fmtNumber(a / 1e3, 0)} k` : `${s}${fmtNumber(a, 0)}`; };
  const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const volumeText = v => Object.entries(v).filter(([, n]) => n > 0).map(([c, n]) => fmtCurrency(n, c, 0)).join(' + ');
  let showTable = false, measure = 'cash';

  function data() {
    const ops = O.list(), live = ops.filter(o => o.status !== 'annulee');
    // Encaissements : paiements datés (un remboursement est un paiement négatif).
    const cash = ops.flatMap(o => (o.payments || []).map(p => ({ date: String(p.date || ''), amount: Number(p.amount) || 0 })));
    // Bénéfice : compté à l'envoi, au débit réellement enregistré.
    const sent = live.filter(O.isSent).map(o => ({ o, date: String(o.execution?.date || o.updatedAt || ''), profit: O.figures(o).profit }));
    const open = ops.filter(O.isOpen);
    const openQuotes = state.quotes.filter(q => q.number && !q.operationId);
    const now = new Date(), months = [];
    for (let k = 5; k >= 0; k--) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); months.push({ key: monthKey(d), label: MONTHS[d.getMonth()], long: `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}` }); }
    for (const m of months) {
      const inMonth = sent.filter(s => s.date.startsWith(m.key));
      m.cash = sum(cash.filter(c => c.date.startsWith(m.key)), c => c.amount);
      m.profit = sum(inMonth, s => s.profit);
      m.count = inMonth.length;
      m.volume = { EUR: 0, USD: 0 };
      for (const { o } of inMonth) m.volume[o.currency] = (m.volume[o.currency] || 0) + (Number(o.amount) || 0);
    }
    return { ops, open, openQuotes, months };
  }

  function kpis(d) {
    const cur = d.months.at(-1), prev = d.months.at(-2);
    const toCollect = sum(d.open, o => O.figures(o).remaining);
    const toSend = d.open.filter(o => o.status === 'paye');
    const tile = (label, value, sub, act = '', tone = '') => '<button type="button" class="kpi' + (tone ? ' ' + tone : '') + '"' + (act ? ' data-go="' + act + '"' : '') + '><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(sub) + '</small></button>';
    el('suiviKpis').innerHTML = tile(`Encaissé · ${cur.label}`, fmtMGA(cur.cash, 0), `${prev.label} : ${fmtMGA(prev.cash, 0)}`)
      + tile(`Bénéfice · ${cur.label}`, fmtMGA(cur.profit, 0), `${cur.count} envoi(s) · ${prev.label} : ${fmtMGA(prev.profit, 0)}`, '', cur.profit < 0 ? 'loss' : 'profit')
      + tile('À encaisser', fmtMGA(toCollect, 0), `${d.open.filter(o => O.figures(o).remaining > 0).length} opération(s) à régler`, 'attente')
      + tile('À envoyer', String(toSend.length), toSend.length ? volumeText(toSend.reduce((v, o) => (v[o.currency] = (v[o.currency] || 0) + (Number(o.amount) || 0), v), {})) : 'aucun transfert payé en attente', 'paye');
    const vol = volumeText(cur.volume);
    el('suiviVolume').textContent = vol ? `Envoyé en ${cur.long} : ${vol}.` : '';
  }

  // À faire : ce qui attend une action, le plus urgent d'abord.
  function todos(d) {
    const items = [], since = o => [...(o.events || [])].reverse().find(e => e.status === o.status)?.at || o.createdAt;
    for (const o of d.open) {
      const f = O.figures(o), age = EpayUI.daysSince(since(o)), who = o.client || o.number, amount = fmtCurrency(Number(o.amount) || 0, o.currency, 0);
      if (o.status === 'paye') items.push({ rank: 1, age, kind: 'op', id: o.id, title: `Transfert à envoyer · ${who}`, sub: `${o.number} · ${amount}${o.beneficiary?.name ? ` → ${o.beneficiary.name}` : ''} · payé ${EpayUI.ago(since(o))}` });
      else if (o.status === 'attente') items.push({ rank: 3, age, kind: 'op', id: o.id, title: `Paiement attendu · ${who}`, sub: `${o.number} · ${fmtMGA(f.remaining, 0)} · ${EpayUI.ago(since(o))}` });
      else if (o.status === 'envoye' && age >= 2) items.push({ rank: 3, age, kind: 'op', id: o.id, title: `Réception à confirmer · ${who}`, sub: `${o.number} · ${amount} envoyé ${EpayUI.ago(since(o))}` });
      if (o.status !== 'attente' && f.remaining > 0) items.push({ rank: 2, age, kind: 'op', id: o.id, title: `Paiement non reçu · ${who}`, sub: `${o.number} · ${fmtMGA(f.remaining, 0)} à encaisser (paiement intégral avant envoi)` });
    }
    for (const o of d.ops.filter(x => x.status === 'annulee' && O.figures(x).toRefund > 0)) items.push({ rank: 1, age: 0, kind: 'op', id: o.id, title: `À rembourser · ${o.client || o.number}`, sub: `${o.number} · ${fmtMGA(O.figures(o).toRefund, 0)} (opération annulée)` });
    for (const q of d.openQuotes) {
      const age = EpayUI.daysSince(q.updatedAt || q.createdAt);
      if (age >= 1 && age <= 30) items.push({ rank: 4, age, kind: 'quote', id: q.id, title: `Devis à relancer · ${q.client || q.number}`, sub: `${q.number} · ${fmtCurrency(q.amount, q.currency, 0)} · ${EpayUI.ago(q.updatedAt || q.createdAt)}` });
    }
    items.sort((a, b) => a.rank - b.rank || b.age - a.age);
    el('suiviTodo').innerHTML = items.length ? items.slice(0, 8).map(t => '<button type="button" class="history-row todo-row rank-' + t.rank + '" data-kind="' + t.kind + '" data-id="' + esc(t.id) + '"><span><strong>' + esc(t.title) + '</strong><small>' + esc(t.sub) + '</small></span><svg class="icon sm"><use href="#i-chevron"/></svg></button>').join('')
      + (items.length > 8 ? '<p class="field-hint">Et ' + (items.length - 8) + ' autre(s).</p>' : '')
      : '<p class="invoice-empty">Rien en attente. Les transferts à envoyer, paiements attendus et devis à relancer apparaîtront ici.</p>';
  }

  function pipeline(d) {
    el('suiviPipeline').innerHTML = O.steps.filter(s => s.id !== 'confirme').map(s => {
      const n = d.open.filter(o => o.status === s.id).length;
      return '<button type="button" class="pipe-step' + (n ? ' has' : '') + '" data-step="' + s.id + '"><strong>' + n + '</strong><span>' + esc(s.label) + '</span></button>';
    }).join('');
  }

  // Barres fines (24 px au plus), extrémité arrondie de 4 px, base sur zéro ; un seul axe ; grille discrète.
  // Le bénéfice peut être négatif : la barre descend sous la ligne zéro.
  function chart(d) {
    const box = el('suiviChart'), W = Math.max(260, Math.round(box.clientWidth || 320)), H = 188;
    const pad = { top: 22, right: 4, bottom: 26, left: 42 }, pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
    const vals = d.months.map(m => m[measure]);
    const max = Math.max(...vals, 0), min = Math.min(...vals, 0), span = max - min;
    const step = (() => { if (!span) return 1; const raw = span / 3, mag = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= raw); })();
    const top = span ? step * Math.ceil(max / step) : 1, bottom = span ? step * Math.floor(min / step) : 0;
    const y = v => pad.top + ph - ((v - bottom) / (top - bottom)) * ph, zero = y(0);
    const col = pw / d.months.length, bw = Math.min(24, col * 0.5);
    let svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(MEASURES[measure].title) + ', six derniers mois">';
    for (let v = bottom; v <= top + 1e-9; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      svg += '<line class="chart-grid' + (Math.abs(v) < 1e-9 ? ' zero' : '') + '" x1="' + pad.left + '" x2="' + (W - pad.right) + '" y1="' + yy + '" y2="' + yy + '"/>'
        + '<text class="chart-axis" x="' + (pad.left - 6) + '" y="' + (yy + 3.5) + '" text-anchor="end">' + esc(span ? compact(v) : '0') + '</text>';
      if (!span) break;
    }
    const tips = [];
    d.months.forEach((m, i) => {
      const v = m[measure], cx = pad.left + col * i + col / 2, x = cx - bw / 2, h = span ? Math.abs(y(v) - zero) : 0;
      if (h > 0) {
        const r = Math.min(4, h, bw / 2);
        // Extrémité arrondie côté valeur, côté zéro droit.
        const path = v >= 0
          ? 'M' + x + ',' + zero + 'V' + (zero - h + r) + 'A' + r + ',' + r + ' 0 0 1 ' + (x + r) + ',' + (zero - h) + 'H' + (x + bw - r) + 'A' + r + ',' + r + ' 0 0 1 ' + (x + bw) + ',' + (zero - h + r) + 'V' + zero + 'Z'
          : 'M' + x + ',' + zero + 'V' + (zero + h - r) + 'A' + r + ',' + r + ' 0 0 0 ' + (x + r) + ',' + (zero + h) + 'H' + (x + bw - r) + 'A' + r + ',' + r + ' 0 0 0 ' + (x + bw) + ',' + (zero + h - r) + 'V' + zero + 'Z';
        svg += '<path class="chart-bar' + (v < 0 ? ' neg' : '') + '" d="' + path + '" data-i="' + i + '"/>';
      }
      svg += '<text class="chart-axis" x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(m.label) + '</text>';
      // Valeur écrite seulement pour le mois en cours ; les autres sont au survol et dans le tableau.
      if (i === d.months.length - 1 && v !== 0) svg += '<text class="chart-value" x="' + cx + '" y="' + (v > 0 ? zero - h - 6 : zero + h + 12) + '" text-anchor="middle">' + esc(compact(v)) + '</text>';
      svg += '<rect class="chart-hit" x="' + (pad.left + col * i) + '" y="' + pad.top + '" width="' + col + '" height="' + (ph + 4) + '" data-i="' + i + '" tabindex="0" aria-label="' + esc(`${m.long} : ${fmtMGA(v, 0)}`) + '"/>';
      tips.push([m.long, v, cx, Math.min(y(v), zero), m.count, volumeText(m.volume)]);
    });
    box.innerHTML = svg + '</svg><div class="chart-tip" id="suiviTip" hidden></div>';
    box.dataset.months = JSON.stringify(tips);
    el('suiviChartTitle').textContent = MEASURES[measure].title;
    el('suiviTable').innerHTML = '<table class="chart-table"><thead><tr><th>Mois</th><th>Encaissé</th><th>Bénéfice</th><th>Envoyé</th></tr></thead><tbody>'
      + d.months.map(m => '<tr><td>' + esc(m.long) + '</td><td>' + esc(fmtMGA(m.cash, 0)) + '</td><td>' + esc(fmtMGA(m.profit, 0)) + '</td><td>' + esc(volumeText(m.volume) || '—') + '</td></tr>').join('') + '</tbody></table>';
    box.hidden = showTable; el('suiviTable').hidden = !showTable;
    el('suiviTableToggle').textContent = showTable ? 'Graphique' : 'Tableau';
    for (const b of document.querySelectorAll('.chart-switch [data-measure]')) b.classList.toggle('active', b.dataset.measure === measure);
  }
  function tip(i) {
    const box = el('suiviChart'), t = el('suiviTip'), rows = JSON.parse(box.dataset.months || '[]');
    box.querySelectorAll('.chart-bar').forEach(b => b.classList.toggle('active', b.dataset.i === String(i)));
    if (i == null || !rows[i]) { if (t) t.hidden = true; return; }
    const [label, value, x, yTop, count, vol] = rows[i];
    const line = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
    t.replaceChildren(line('strong', fmtMGA(value, 0)), line('span', label), ...(measure === 'profit' && count ? [line('span', `${count} envoi(s) · ${vol}`)] : []));
    t.hidden = false;
    const w = t.offsetWidth, h = t.offsetHeight;
    let left = Math.min(Math.max(4, x - w / 2), box.clientWidth - w - 4), top = yTop - h - 10;
    // Pas la place au-dessus de la barre : l'infobulle passe à côté, sans la cacher.
    if (top < 0) { top = Math.max(0, yTop); left = x - w - 18 >= 4 ? x - w - 18 : Math.min(x + 18, box.clientWidth - w - 4); }
    t.style.left = `${left}px`; t.style.top = `${top}px`;
  }

  function sync(st = window.EpaySync?.status()) {
    const s = el('suiviSync'); if (!s || !st) return;
    s.textContent = !st.enabled ? 'Données sur cet appareil seulement · activer la synchronisation' : st.state === 'offline' ? 'Hors ligne : envoi dès le retour du réseau' : st.state === 'error' ? `Synchronisation en erreur : ${st.error}` : st.state === 'syncing' ? 'Synchronisation…' : `Synchronisé ${st.lastSync ? EpayUI.ago(st.lastSync) : ''}`;
    s.dataset.state = st.enabled ? st.state : 'off';
  }
  function render() {
    if (state.view !== 'suivi') return;
    const d = data();
    kpis(d); todos(d); pipeline(d); chart(d); sync();
    const n = window.EpayClients?.count() || 0;
    el('suiviClients').textContent = n ? ` · ${n}` : '';
  }

  el('suiviKpis').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) O.openList(b.dataset.go); });
  el('suiviTodo').addEventListener('click', e => {
    const r = e.target.closest('[data-kind]'); if (!r) return;
    if (r.dataset.kind === 'op') O.open(r.dataset.id);
    else { const q = state.quotes.find(x => x.id === r.dataset.id); if (q) { setView('quotes'); openQuote(q); } }
  });
  el('suiviPipeline').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) O.openList(b.dataset.step); });
  for (const b of document.querySelectorAll('.chart-switch [data-measure]')) b.addEventListener('click', () => { measure = b.dataset.measure; render(); });
  const hit = e => e.target.closest?.('.chart-hit');
  el('suiviChart').addEventListener('pointermove', e => { const h = hit(e); tip(h ? Number(h.dataset.i) : null); });
  el('suiviChart').addEventListener('pointerleave', () => tip(null));
  el('suiviChart').addEventListener('click', e => { const h = hit(e); tip(h ? Number(h.dataset.i) : null); });
  el('suiviChart').addEventListener('focusin', e => { const h = hit(e); if (h) tip(Number(h.dataset.i)); });
  el('suiviChart').addEventListener('focusout', () => tip(null));
  el('suiviTableToggle').addEventListener('click', () => { showTable = !showTable; render(); });
  el('suiviSync').addEventListener('click', () => setView('settings'));
  if ('ResizeObserver' in window) { let w = 0; new ResizeObserver(([entry]) => { const nw = Math.round(entry.contentRect.width); if (nw && Math.abs(nw - w) > 8) { w = nw; render(); } }).observe(el('suiviView')); }
  window.EpaySync?.onStatus(sync);
  for (const coll of ['quotes', 'operations', 'clients']) window.EpaySync?.onApply(coll, render);
  O.onChange(render);
  viewHooks.suivi = render;
  window.EpayDashboard = { render };
})();
