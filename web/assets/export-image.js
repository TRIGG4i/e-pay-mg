// Devis et reçus en image PNG (partage WhatsApp) : un seul dessin, hauteur adaptée au contenu.
(() => {
  'use strict';
  const W = 1080, PAD = 76, RIGHT = W - PAD, INK = '#13231F', MUTED = '#65706B', LINE = '#E7E2D6', GREEN = '#0E7A62', CORAL = '#FF7A50';
  const FONT = '"Plus Jakarta Sans", Arial, sans-serif';

  const roundRect = (ctx, x, y, w, h, r, fill, stroke) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  };
  // Monogramme HELPEO (même dessin que assets/helpeo-mark-v2.svg, grille de 512) : deux personnes,
  // tête et corps blancs, reliées par un bras corail, sur la tuile verte.
  const drawLogo = (ctx, x, y, s) => {
    const k = s / 512, P = (px, py) => [x + px * k, y + py * k];
    const tile = ctx.createLinearGradient(x, y, x + s, y + s);
    tile.addColorStop(0, '#13866C'); tile.addColorStop(1, '#0A4F42');
    roundRect(ctx, x, y, s, s, 118 * k, tile);
    ctx.lineCap = 'round'; ctx.lineWidth = 60 * k;
    ctx.fillStyle = ctx.strokeStyle = '#FFFFFF';
    for (const hx of [168, 344]) { ctx.beginPath(); ctx.arc(...P(hx, 150), 36 * k, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(...P(168, 246)); ctx.lineTo(...P(168, 372)); ctx.moveTo(...P(344, 246)); ctx.lineTo(...P(344, 372)); ctx.stroke();
    ctx.strokeStyle = CORAL;
    ctx.beginPath(); ctx.moveTo(...P(168, 246)); ctx.quadraticCurveTo(...P(256, 390), ...P(344, 246)); ctx.stroke();
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
    try { await document.fonts?.load(`800 40px ${FONT}`); await document.fonts?.ready; } catch {}
    const tall = document.createElement('canvas'); tall.width = W; tall.height = 3200;
    const ctx = tall.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, tall.height);

    drawLogo(ctx, PAD, 72, 94);
    const name = String(OFFICE.name || '').trim();
    if (/^helpeo$/i.test(name)) {   // HELP à l'encre, EO en corail, comme le logo
      text(ctx, name.slice(0, 4), 194, 111, { size: 40, weight: 800, color: INK });
      text(ctx, name.slice(4), 194 + ctx.measureText(name.slice(0, 4)).width, 111, { size: 40, weight: 800, color: CORAL });
    } else text(ctx, name, 194, 111, { size: 40, weight: 800, color: INK, max: 470 });
    // Sous le nom : slogan, puis coordonnées et identifiants s'ils sont renseignés.
    const ids = [OFFICE.nif && `NIF ${OFFICE.nif}`, OFFICE.stat && `STAT ${OFFICE.stat}`].filter(Boolean).join(' · ');
    const lines = [OFFICE.slogan, [OFFICE.phone, OFFICE.email].filter(Boolean).join(' · '), OFFICE.address, ids].filter(Boolean);
    lines.forEach((l, i) => text(ctx, l, 194, 149 + i * 31, { size: i ? 19 : 22, max: 470 }));
    text(ctx, d.title, RIGHT, 104, { size: 30, weight: 800, color: GREEN, align: 'right' });
    text(ctx, d.number || '—', RIGHT, 142, { size: 24, weight: 700, color: INK, align: 'right' });
    text(ctx, d.dateLine, RIGHT, 176, { size: 21, align: 'right', max: 400 });
    const ruleY = Math.max(211, 149 + lines.length * 31 + 12);
    ctx.fillStyle = GREEN; ctx.fillRect(PAD, ruleY, RIGHT - PAD, 3);

    let y = ruleY + 55;
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
      text(ctx, r.label, PAD + 28, ry + (r.detail ? 46 : 64), { size: 24, weight: 700, color: INK, max: tw * 0.56 });
      if (r.detail) text(ctx, r.detail, PAD + 28, ry + 80, { size: 20, max: tw * 0.6 });
      text(ctx, r.value, RIGHT - 28, ry + 62, { size: 28, weight: 800, color: INK, align: 'right', max: tw * 0.4 });
    });
    y = top + rowH * d.rows.length + 34;

    roundRect(ctx, PAD, y, tw, 132, 30, GREEN);
    text(ctx, String(d.totalLabel || 'TOTAL').toUpperCase(), PAD + 30, y + 75, { size: 23, weight: 700, color: 'rgba(255,255,255,.78)' });
    text(ctx, fmtMGA(d.total, 0), RIGHT - 30, y + 83, { size: 42, weight: 800, color: '#FFFFFF', align: 'right' });
    y += 132 + 58;

    if (d.note) y += paragraph(ctx, d.note, PAD, y, tw) + 18;
    if (d.payment?.length) {
      text(ctx, 'RÈGLEMENT', PAD, y + 8, { size: 22, weight: 700 });
      y += 44;
      for (const l of d.payment) y += paragraph(ctx, l, PAD, y, tw, { size: 23, color: INK, lines: 2 });
      y += 12;
    }

    // Pied : une seule ligne (Réglages › Entreprise › Pied des documents).
    y = Math.max(y + 24, 1100);
    let H = y + 24;
    if (OFFICE.legal) { rule(ctx, y); text(ctx, OFFICE.legal, W / 2, y + 46, { size: 19, color: '#8A938E', align: 'center', max: tw }); H = y + 78; }

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
      console.error('HELPEO image :', e);
      showToast('Impossible de créer l’image pour le moment.', 'error');
    }
  }

  const quote = q => save({
    title: 'DEVIS', number: q.number, dateLine: `${displayDate(quoteDate(q))} · ${validityText(q)}`,
    client: q.client, phone: q.phone, address: q.address, rows: quoteRows(q), totalLabel: 'Total', total: q.totalMGA,
    note: q.note || DOCS.quoteNote, payment: paymentLines()
  }, 'devis');
  const receipt = d => save({ ...d, dateLine: displayDate(d.date), payment: d.total > 0 && d.totalLabel !== 'Total réglé' ? paymentLines() : [] }, 'recu');

  window.EpayExport = { quote, receipt, draw };
})();
