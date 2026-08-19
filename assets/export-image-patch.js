(() => {
  const roundRect = (ctx, x, y, w, h, r, fill, stroke) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  };

  const drawLogo = (ctx, x, y, size) => {
    roundRect(ctx, x, y, size, size, size * 0.28, '#0B0D12');
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = size * 0.085;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + size * 0.29, y + size * 0.25);
    ctx.lineTo(x + size * 0.29, y + size * 0.75);
    ctx.moveTo(x + size * 0.29, y + size * 0.25);
    ctx.lineTo(x + size * 0.66, y + size * 0.25);
    ctx.moveTo(x + size * 0.29, y + size * 0.50);
    ctx.lineTo(x + size * 0.58, y + size * 0.50);
    ctx.moveTo(x + size * 0.29, y + size * 0.75);
    ctx.lineTo(x + size * 0.66, y + size * 0.75);
    ctx.stroke();

    ctx.strokeStyle = '#5B78FF';
    ctx.lineWidth = size * 0.067;
    ctx.beginPath();
    ctx.moveTo(x + size * 0.59, y + size * 0.39);
    ctx.lineTo(x + size * 0.73, y + size * 0.50);
    ctx.lineTo(x + size * 0.59, y + size * 0.61);
    ctx.stroke();
  };

  const wrapText = (ctx, text, maxWidth) => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${line} ${words[i]}`;
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else { lines.push(line); line = words[i]; }
    }
    lines.push(line);
    return lines;
  };

  const drawWrapped = (ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) => {
    const lines = wrapText(ctx, text, maxWidth).slice(0, maxLines);
    lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
    return lines.length * lineHeight;
  };

  const saveBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const safeFilename = (quote) => {
    const clean = (value, fallback) => String(value || fallback)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || fallback;
    return `${clean(quote.number, 'devis-epay')}-${clean(quote.client, 'client')}.png`;
  };

  const renderQuoteCanvas = async (q) => {
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch {}
    }

    const width = 1080;
    const height = 1420;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const ink = '#0B0D12';
    const muted = '#858B96';
    const line = '#E8EAF0';
    const pad = 76;
    const right = width - pad;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    drawLogo(ctx, pad, 72, 94);

    ctx.fillStyle = ink;
    ctx.font = '800 42px Inter, Arial, sans-serif';
    ctx.fillText('E-Pay MG', 194, 111);
    ctx.fillStyle = muted;
    ctx.font = '500 25px Inter, Arial, sans-serif';
    ctx.fillText('Devis de transfert', 194, 149);

    ctx.textAlign = 'right';
    ctx.fillStyle = ink;
    ctx.font = '800 29px Inter, Arial, sans-serif';
    ctx.fillText(q.number || '—', right, 106);
    ctx.fillStyle = muted;
    ctx.font = '500 23px Inter, Arial, sans-serif';
    ctx.fillText(`Émis le ${displayDate(q.createdAt)}`, right, 145);
    ctx.textAlign = 'left';

    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, 205);
    ctx.lineTo(right, 205);
    ctx.stroke();

    ctx.fillStyle = muted;
    ctx.font = '700 22px Inter, Arial, sans-serif';
    ctx.fillText('CLIENT', pad, 260);
    ctx.fillStyle = ink;
    ctx.font = '800 34px Inter, Arial, sans-serif';
    ctx.fillText(q.client || 'Client non renseigné', pad, 307);
    if (q.phone) {
      ctx.fillStyle = muted;
      ctx.font = '500 23px Inter, Arial, sans-serif';
      ctx.fillText(q.phone, pad, 343);
    }

    const tableX = pad;
    const tableY = 390;
    const tableW = width - pad * 2;
    const rowH = 134;
    roundRect(ctx, tableX, tableY, tableW, rowH * 4, 30, '#FFFFFF', line);

    const rows = [
      ['Montant à envoyer', fmtCurrency(q.amount, q.currency, 2), 'Mode de paiement', quoteMode(q)],
      ['Taux appliqué', `${fmtNumber(q.rate, 2)} MGA`, `1 ${q.currency}`, ''],
      ['Montant converti', fmtMGA(q.convertedMGA, 0), 'Avant frais', ''],
      ['Frais de service & traitement', fmtMGA(q.serviceFeesMGA, 0), 'Commission E-Pay MG et frais applicables', '']
    ];

    rows.forEach((row, i) => {
      const y = tableY + i * rowH;
      if (i > 0) {
        ctx.strokeStyle = line;
        ctx.beginPath();
        ctx.moveTo(tableX, y);
        ctx.lineTo(tableX + tableW, y);
        ctx.stroke();
      }

      ctx.fillStyle = muted;
      ctx.font = '700 22px Inter, Arial, sans-serif';
      ctx.fillText(row[0], tableX + 28, y + 39);

      ctx.textAlign = 'right';
      ctx.fillStyle = ink;
      ctx.font = '800 28px Inter, Arial, sans-serif';
      ctx.fillText(row[1], tableX + tableW - 28, y + 76);
      ctx.textAlign = 'left';

      if (row[2]) {
        ctx.fillStyle = muted;
        ctx.font = '500 19px Inter, Arial, sans-serif';
        drawWrapped(ctx, row[2] + (row[3] ? ` · ${row[3]}` : ''), tableX + 28, y + 103, tableW - 56, 22, 1);
      }
    });

    const totalY = tableY + rowH * 4 + 34;
    roundRect(ctx, pad, totalY, tableW, 132, 30, ink);
    ctx.fillStyle = 'rgba(255,255,255,.58)';
    ctx.font = '700 24px Inter, Arial, sans-serif';
    ctx.fillText('TOTAL À PAYER', pad + 30, totalY + 53);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 42px Inter, Arial, sans-serif';
    ctx.fillText(fmtMGA(q.totalMGA, 0), right - 30, totalY + 83);
    ctx.textAlign = 'left';

    let noteY = totalY + 195;
    ctx.fillStyle = muted;
    ctx.font = '500 22px Inter, Arial, sans-serif';
    const defaultNote = 'Le total correspond au montant converti augmenté des frais de service et de traitement applicables.';
    noteY += drawWrapped(ctx, q.note || defaultNote, pad, noteY, tableW, 32, 4);

    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(pad, height - 102);
    ctx.lineTo(right, height - 102);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.font = '500 19px Inter, Arial, sans-serif';
    ctx.fillText('E-Pay MG · Devis généré électroniquement', pad, height - 62);
    ctx.textAlign = 'right';
    ctx.fillText(q.number || '', right, height - 62);
    ctx.textAlign = 'left';

    return canvas;
  };

  const exportImage = async () => {
    if (typeof currentDraft !== 'function' || typeof $ !== 'function') return;
    const q = currentDraft();
    const status = $('quoteSheetSub');
    if (!q?.totalMGA) {
      if (status) status.textContent = 'Saisis d’abord un montant valide.';
      return;
    }

    try {
      if (status) status.textContent = 'Création de l’image…';
      const canvas = await renderQuoteCanvas(q);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG impossible')), 'image/png', 1));
      saveBlob(blob, safeFilename(q));
      if (status) status.textContent = 'Image PNG enregistrée dans les téléchargements du téléphone.';
    } catch (error) {
      console.error('E-Pay MG export image:', error);
      if (status) status.textContent = 'Impossible d’enregistrer l’image pour le moment.';
    }
  };

  const apply = () => {
    if (typeof $ !== 'function') return;
    const printBtn = $('printQuote');
    if (!printBtn || $('exportQuoteImage')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'exportQuoteImage';
    button.className = 'action-btn dark';
    button.innerHTML = '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="8" cy="10" r="1.5"></circle><path d="m21 15-4.5-4.5L8 19"></path></svg>Enregistrer image';

    const row = printBtn.parentElement;
    if (row) {
      row.classList.add('export-row');
      row.insertBefore(button, printBtn);
    }
    button.addEventListener('click', exportImage);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once:true });
  else apply();
})();
