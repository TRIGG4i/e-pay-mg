(() => {
  const applyCustomerQuotePatch = () => {
    if (typeof state === "undefined" || typeof $ === "undefined") return;

    const serviceFeesMGA = (amount, rate, total) => {
      if (![amount, rate, total].every(Number.isFinite)) return 0;
      return Math.max(0, total - amount * rate);
    };

    const enrichQuote = (q) => {
      if (!q) return q;
      const amount = Number.isFinite(q.amount) ? q.amount : 0;
      const rate = Number.isFinite(q.rate) ? q.rate : 0;
      const totalMGA = Number.isFinite(q.totalMGA) ? q.totalMGA : 0;
      const createdAt = q.createdAt || (typeof isoDate === 'function' ? isoDate() : new Date().toISOString().slice(0,10));
      const convertedMGA = Number.isFinite(q.convertedMGA) ? q.convertedMGA : amount * rate;
      const feesMGA = Number.isFinite(q.serviceFeesMGA) ? q.serviceFeesMGA : serviceFeesMGA(amount, rate, totalMGA);
      return { ...q, createdAt, validUntil: createdAt, convertedMGA, serviceFeesMGA: feesMGA };
    };

    const commissionChip = $("commissionChip");
    if (commissionChip) commissionChip.textContent = "Frais inclus";

    const clientRateMeta = $("clientRateMeta");
    if (clientRateMeta?.previousElementSibling) clientRateMeta.previousElementSibling.textContent = "Taux appliqué";
    const clientFeesMeta = $("clientFeesMeta");
    if (clientFeesMeta?.previousElementSibling) clientFeesMeta.previousElementSibling.textContent = "Frais & traitement";

    const validityInput = $("quoteValidity");
    const validityField = validityInput?.closest(".form-field");
    if (validityField) validityField.style.display = "none";

    window.updateClient = function(){
      const amount = parseInput("clientAmount");
      const t = calculateClientTotals(amount, state.currency, state.transferType);
      $("commissionChip").textContent = "Frais inclus";
      $$(".segment").forEach((b) => b.classList.toggle("active", b.dataset.transferType === state.transferType));
      if(!t){
        $("clientTotal").textContent = $("clientRateMeta").textContent = $("clientFeesMeta").textContent = "—";
      } else {
        const fees = serviceFeesMGA(amount, t.rate, t.selectedTotal);
        $("clientTotal").textContent = fmtNumber(t.selectedTotal, 0);
        $("clientRateMeta").textContent = `1 ${state.currency} = ${fmtNumber(t.rate,2)} MGA`;
        $("clientFeesMeta").textContent = fmtMGA(fees, 0);
      }
      const budget = parseInput("budgetAmount");
      $("budgetBank").textContent = fmtCurrency(maxSendableFromBudget(budget, state.currency, "bank"), state.currency, 0);
      $("budgetCash").textContent = fmtCurrency(maxSendableFromBudget(budget, state.currency, "cash"), state.currency, 0);
      if($("quoteSheet").classList.contains("open") && !state.editingQuoteId) renderDraftPreview();
    };

    window.currentDraft = function(){
      const base = state.editingQuoteBase;
      const amount = base?.amount ?? parseInput("clientAmount");
      const currency = base?.currency ?? state.currency;
      const transferType = base?.transferType ?? state.transferType;
      const t = base ? null : calculateClientTotals(amount, currency, transferType);
      const createdAt = base?.createdAt || isoDate();
      const rate = base?.rate ?? t?.rate ?? 0;
      const totalMGA = base?.totalMGA ?? t?.selectedTotal ?? 0;
      const convertedMGA = base?.convertedMGA ?? (amount * rate);
      const feesMGA = base?.serviceFeesMGA ?? serviceFeesMGA(amount, rate, totalMGA);
      return {
        id: state.editingQuoteId || makeId(),
        number: state.draftNumber || nextQuoteNumber(),
        createdAt,
        client: $("quoteClient").value.trim(),
        phone: $("quotePhone").value.trim(),
        validUntil: createdAt,
        note: $("quoteNote").value.trim(),
        amount, currency, transferType, rate, totalMGA,
        convertedMGA,
        serviceFeesMGA: feesMGA,
        includedFeesCurrency: base?.includedFeesCurrency ?? t?.includedFeesCurrency ?? 0
      };
    };

    window.fillPreview = function(rawQuote){
      const q = enrichQuote(rawQuote);
      $("previewNumber").textContent = q.number;
      $("previewDate").textContent = `Émis le ${displayDate(q.createdAt)}`;
      $("previewClient").textContent = q.client || "Client non renseigné";

      const table = document.querySelector(".preview-table");
      if (table) {
        table.innerHTML = `
          <div class="preview-line"><div><span>Montant à envoyer</span><strong>${escapeHTML(fmtCurrency(q.amount,q.currency,2))}</strong></div><strong>${escapeHTML(quoteMode(q))}</strong></div>
          <div class="preview-line"><div><span>Taux appliqué</span><strong>1 ${escapeHTML(q.currency)}</strong></div><strong>${escapeHTML(fmtNumber(q.rate,2))} MGA</strong></div>
          <div class="preview-line"><div><span>Montant converti</span><strong>Avant frais</strong></div><strong>${escapeHTML(fmtMGA(q.convertedMGA,0))}</strong></div>
          <div class="preview-line"><div><span>Frais de service & traitement</span><strong>Frais applicables inclus</strong></div><strong>${escapeHTML(fmtMGA(q.serviceFeesMGA,0))}</strong></div>`;
      }
      $("previewTotal").textContent = fmtMGA(q.totalMGA,0);
      $("previewNote").textContent = q.note || "Le total correspond au montant converti augmenté des frais de service et de traitement applicables.";
    };

    window.quoteText = function(rawQuote){
      const q = enrichQuote(rawQuote);
      return `DEVIS ${q.number}\nClient : ${q.client||"—"}${q.phone?`\nTéléphone : ${q.phone}`:""}\nMontant à envoyer : ${fmtCurrency(q.amount,q.currency,2)}\nMode : ${quoteMode(q)}\nTaux appliqué : 1 ${q.currency} = ${fmtNumber(q.rate,2)} MGA\nMontant converti : ${fmtMGA(q.convertedMGA,0)}\nFrais de service & traitement : ${fmtMGA(q.serviceFeesMGA,0)}\nTotal à payer : ${fmtMGA(q.totalMGA,0)}${q.note?`\nNote : ${q.note}`:""}`;
    };

    window.renderPrint = function(rawQuote){
      const q = enrichQuote(rawQuote);
      $("printStage").innerHTML = `<article class="print-page"><header class="print-head"><div class="print-brand"><svg viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="18" fill="#0B0D12"/><path d="M20 18v28M20 18h22M20 32h17M20 46h22" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/><path d="m37.5 26.5 7 5.5-7 5.5" fill="none" stroke="#5B78FF" stroke-width="4.3" stroke-linecap="round" stroke-linejoin="round"/></svg><div><strong>E-Pay MG</strong><span>Devis de transfert</span></div></div><div class="print-title"><h1>DEVIS</h1><p>${escapeHTML(q.number)} · ${escapeHTML(displayDate(q.createdAt))}</p></div></header><section class="print-client"><div class="print-block"><span>Client</span><strong>${escapeHTML(q.client||"Client non renseigné")}${q.phone?`<br>${escapeHTML(q.phone)}`:""}</strong></div></section><table class="print-table"><thead><tr><th>Description</th><th>Détail</th><th>Montant</th></tr></thead><tbody><tr><td>Montant à envoyer</td><td>${escapeHTML(quoteMode(q))}</td><td>${escapeHTML(fmtCurrency(q.amount,q.currency,2))}</td></tr><tr><td>Taux appliqué</td><td>1 ${escapeHTML(q.currency)}</td><td>${escapeHTML(fmtNumber(q.rate,2))} MGA</td></tr><tr><td>Montant converti</td><td>Avant frais</td><td>${escapeHTML(fmtMGA(q.convertedMGA,0))}</td></tr><tr><td>Frais de service & traitement</td><td>Commission E-Pay MG et frais applicables</td><td>${escapeHTML(fmtMGA(q.serviceFeesMGA,0))}</td></tr></tbody></table><div class="print-total"><span>Total à payer</span><strong>${escapeHTML(fmtMGA(q.totalMGA,0))}</strong></div>${q.note?`<p class="print-note"><strong>Note :</strong> ${escapeHTML(q.note)}</p>`:`<p class="print-note">Le total correspond au montant converti augmenté des frais de service et de traitement applicables.</p>`}<footer class="print-footer"><span>E-Pay MG · Devis généré électroniquement</span><span>${escapeHTML(q.number)}</span></footer></article>`;
    };

    state.quotes = state.quotes.map(enrichQuote);
    if (typeof persistQuotes === "function") persistQuotes();
    refreshAll();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyCustomerQuotePatch, { once:true });
  } else {
    applyCustomerQuotePatch();
  }
})();
