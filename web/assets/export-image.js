// Devis et reçus en image PNG (partage WhatsApp) : un seul dessin, hauteur adaptée au contenu.
(() => {
  'use strict';
  const W = 1080, PAD = 76, RIGHT = W - PAD, INK = '#0B0D12', MUTED = '#6B7280', LINE = '#E8EAF0', FONT = 'Inter, Arial, sans-serif';

  const roundRect = (ctx, x, y, w, h, r, fill, stroke) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  };
  // Monogramme E-Pay (même dessin que assets/epay-mark.svg) : « ϵ » blanc, barre bleue qui sort.
  const drawLogo = (ctx, x, y, s) => {
    const ink = ctx.createLinearGradient(x, y, x + s, y + s);
    ink.addColorStop(0, '#1D2330'); ink.addColorStop(0.55, '#0E1118'); ink.addColorStop(1, '#06070A');
    roundRect(ctx, x, y, s, s, s * 0.23, ink);
    const open = 41.354 * Math.PI / 180;
    ctx.lineCap = 'round'; ctx.lineWidth = s * 0.109375;
    ctx.strokeStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(x + s * 0.421875, y + s * 0.5, s * 0.21875, -open, open, true); ctx.stroke();
    const blue = ctx.createLinearGradient(x + s * 0.3477, 0, x + s * 0.8242, 0);
    blue.addColorStop(0, '#9AABFF'); blue.addColorStop(1, '#5B78FF');
    ctx.strokeStyle = blue;
    ctx.beginPath(); ctx.moveTo(x + s * 0.3477, y + s * 0.5); ctx.lineTo(x + s * 0.8242, y + s * 0.5); ctx.stroke();
  };
  const wrap = (ctx, text, max) => {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      let line = words[0];
      for (const w of words.slice(1)) { if (ctx.measureText(`${line} ${w}`).width <= max) line += ` ${w}`; else { out.push(line); line = w; } }
      out.push(line);
    }
    return out;
  };
  const text = (ctx, s, x, y, { size = 23, weight = 500, color = MUTED, align = 'left', max = 0 } = {}) => {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align;
    let str = String(s ?? '');
    if (max) while (str.length > 1 && ctx.measureText(str).width > max) str = str.slice(0, -2) + '…';
    ctx.fillText(str, x, y); ctx.textAlign = 'left';
  };
  const paragraph = (ctx, s, x, y, max, { size = 22, lh = 32, color = MUTED, weight = 500, lines = 6 } = {}) => {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = 'left';
    const ls = wrap(ctx, s, max).slice(0, lines);
    ls.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
    return ls.length * lh;
  };
  const rule = (ctx, y) => { ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(RIGHT, y); ctx.stroke(); };

  // d = { title, number, dateLine, client, phone, address, rows:[{label, detail, value}], totalLabel, total, note, payment:[lignes] }
  async function draw(d) {
    if (document.fonts?.ready) try { await document.fonts.ready; } catch {}
    const tall = document.createElement('canvas'); tall.width = W; tall.height = 3200;
    const ctx = tall.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, tall.height);

    drawLogo(ctx, PAD, 72, 94);
    text(ctx, OFFICE.name, 194, 111, { size: 40, weight: 800, color: INK, max: 470 });
    text(ctx, OFFICE.slogan || 'Paiements en devise', 194, 149, { size: 24, max: 470 });
    text(ctx, d.title, RIGHT, 104, { size: 30, weight: 800, color: INK, align: 'right' });
    text(ctx, d.number || '—', RIGHT, 142, { size: 24, weight: 700, color: INK, align: 'right' });
    text(ctx, d.dateLine, RIGHT, 176, { size: 21, align: 'right', max: 400 });
    rule(ctx, 212);

    let y = 266;
    text(ctx, 'CLIENT', PAD, y, { size: 22, weight: 700 });
    text(ctx, d.client || 'Client non renseigné', PAD, y + 46, { size: 34, weight: 800, color: INK, max: RIGHT - PAD });
    y += 46;
    for (const extra of [d.phone, d.address].filter(Boolean)) { y += 36; text(ctx, extra, PAD, y, { size: 23, max: RIGHT - PAD }); }
    y += 48;

    // Tableau : libellé et détail à gauche, montant à droite.
    const tw = RIGHT - PAD, rowH = 112, top = y;
    roundRect(ctx, PAD, top, tw, rowH * d.rows.length, 30, '#FFFFFF', LINE);
    d.rows.forEach((r, i) => {
      const ry = top + i * rowH;
      if (i) { ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, ry); ctx.lineTo(RIGHT, ry); ctx.stroke(); }
      text(ctx, r.label, PAD + 28, ry + 46, { size: 24, weight: 700, color: INK, max: tw * 0.56 });
      if (r.detail) text(ctx, r.detail, PAD + 28, ry + 80, { size: 20, max: tw * 0.6 });
      text(ctx, r.value, RIGHT - 28, ry + 62, { size: 28, weight: 800, color: INK, align: 'right', max: tw * 0.4 });
    });
    y = top + rowH * d.rows.length + 34;

    roundRect(ctx, PAD, y, tw, 132, 30, INK);
    text(ctx, String(d.totalLabel || 'TOTAL').toUpperCase(), PAD + 30, y + 75, { size: 24, weight: 700, color: 'rgba(255,255,255,.62)' });
    text(ctx, fmtMGA(d.total, 0), RIGHT - 30, y + 83, { size: 42, weight: 800, color: '#FFFFFF', align: 'right' });
    y += 132 + 58;

    if (d.note) y += paragraph(ctx, d.note, PAD, y, tw) + 18;
    if (d.payment?.length) {
      text(ctx, 'RÈGLEMENT', PAD, y + 8, { size: 22, weight: 700 });
      y += 44;
      for (const l of d.payment) y += paragraph(ctx, l, PAD, y, tw, { size: 23, color: INK, lines: 2 });
      y += 12;
    }

    y = Math.max(y + 24, 1100);
    rule(ctx, y);
    const contact = [OFFICE.phone, OFFICE.email, OFFICE.address].filter(Boolean).join(' · ');
    text(ctx, contact || `${OFFICE.name} · document généré électroniquement`, PAD, y + 44, { size: 19, max: tw - 220 });
    text(ctx, d.number || '', RIGHT, y + 44, { size: 19, align: 'right' });
    const ids = [OFFICE.nif && `NIF ${OFFICE.nif}`, OFFICE.stat && `STAT ${OFFICE.stat}`].filter(Boolean).join(' · ');
    if (ids) text(ctx, ids, PAD, y + 76, { size: 19 });
    const H = y + (ids ? 112 : 82);

    const out = document.createElement('canvas'); out.width = W; out.height = H;
    out.getContext('2d').drawImage(tall, 0, 0);
    return out;
  }

  async function save(d, base) {
    try {
      const canvas = await draw(d);
      const blob = await new Promise((ok, ko) => canvas.toBlob(b => (b ? ok(b) : ko(new Error('PNG impossible'))), 'image/png', 1));
      EpayUI.download(blob, `${EpayUI.slug(d.number, base)}-${EpayUI.slug(d.client, "client")}.png`);
      showToast('Image enregistrée dans les téléchargements.', 'info');
    } catch (e) {
      console.error('E-Pay image :', e);
      showToast('Impossible de créer l’image pour le moment.', 'error');
    }
  }

  const quote = q => save({
    title: 'DEVIS', number: q.number, dateLine: `${displayDate(quoteDate(q))} · ${validityText(q)}`,
    client: q.client, phone: q.phone, address: q.address, rows: quoteRows(q), totalLabel: 'Total à payer', total: q.totalMGA,
    note: q.note || DOCS.quoteNote, payment: paymentLines()
  }, 'devis');
  const receipt = d => save({ ...d, dateLine: displayDate(d.date), payment: d.total > 0 && d.totalLabel !== 'Total payé' ? paymentLines() : [] }, 'recu');

  window.EpayExport = { quote, receipt, draw };
})();
