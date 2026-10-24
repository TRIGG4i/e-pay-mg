// Outils d'interface partagés : feuilles, messages, liens WhatsApp, dates et modèles de texte.
(() => {
  'use strict';
  let layer = 110;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = () => new Date().toISOString();

  // Feuilles de gestion : la dernière ouverte passe devant ; le fond ou × la ferme.
  function openSheet(id) {
    const s = document.getElementById(id); if (!s) return;
    s.style.zIndex = String(++layer);
    s.classList.add('open');
    document.body.style.overflow = 'hidden';
    const inner = s.querySelector('.sheet'); if (inner) inner.scrollTop = 0;
  }
  function closeSheet(id) {
    const s = document.getElementById(id); if (!s) return;
    s.classList.remove('open');
    if (!document.querySelector('.sheet-backdrop.open')) document.body.style.overflow = '';
  }
  document.addEventListener('click', e => {
    const close = e.target.closest?.('[data-close-sheet]');
    if (close) { closeSheet(close.dataset.closeSheet); return; }
    if (e.target.matches?.('.sheet-backdrop[data-gestion]')) closeSheet(e.target.id);
  });

  // Message visible quel que soit le défilement, avec une action facultative (« Annuler »…).
  function toast(message, kind = 'warn', action = null) {
    const t = document.getElementById('toast'); if (!t || !message) return;
    t.replaceChildren(document.createTextNode(message));
    t.className = `toast ${kind}`; t.hidden = false;
    if (action) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label;
      b.addEventListener('click', () => { t.hidden = true; action.run(); });
      t.append(b);
    }
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => { t.hidden = true; }, action || kind === 'error' ? 9000 : 5500);
  }

  // Numéros malgaches : 034 11 222 33 → 261341122233 (format attendu par WhatsApp).
  function phoneDigits(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 10 && d.startsWith('0')) d = `261${d.slice(1)}`;
    if (d.length === 9 && /^3/.test(d)) d = `261${d}`;
    return d;
  }
  const waLink = (phone, text) => `https://wa.me/${phoneDigits(phone)}?text=${encodeURIComponent(text)}`;
  const openWhatsApp = (phone, text) => window.open(waLink(phone, text), '_blank', 'noopener');
  const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m)).replace(/[ \t]+\n/g, '\n').trim();

  const parseDay = iso => new Date(String(iso || '').length === 10 ? `${iso}T12:00:00` : iso);
  const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const daysSince = iso => { const t = parseDay(iso).valueOf(); return Number.isFinite(t) ? Math.round((dayStart(Date.now()) - dayStart(t)) / 86400000) : 0; };
  const ago = iso => { const n = daysSince(iso); return n <= 0 ? 'aujourd’hui' : n === 1 ? 'hier' : `il y a ${n} j`; };
  const shortDate = iso => { const d = parseDay(iso); return Number.isNaN(d.valueOf()) ? '' : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d); };
  // Montant saisi (« 1 250,50 ») → nombre ; 0 si vide ou invalide.
  const parseAmount = v => { const n = Number(String(v ?? '').replace(/[\s  ]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

  // Téléchargement d'un fichier généré (image du devis, sauvegarde).
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  const slug = (value, fallback) => String(value || fallback).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || fallback;

  window.EpayUI = { esc, uid, now, openSheet, closeSheet, toast, phoneDigits, waLink, openWhatsApp, fill, daysSince, ago, shortDate, parseAmount, download, slug };
  window.showToast = toast;
})();
