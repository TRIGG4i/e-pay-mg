(() => {
  const applyInternalRechargePatch = () => {
    if (typeof CONFIG === "undefined" || typeof state === "undefined") return;

    CONFIG.rechargeFeePercent = Number(CONFIG.skrillFeePercent ?? 1);

    window.calculateOwnerTotals = function(amount, currency){
      const rate = state.ownerRates[currency];
      if(!Number.isFinite(rate) || rate <= 0 || amount <= 0) return null;

      const totalToBuy = amount / (1 - CONFIG.rechargeFeePercent / 100);
      const rechargeFee = totalToBuy * CONFIG.rechargeFeePercent / 100;
      const debitMGA = totalToBuy * rate + CONFIG.ownerFixedFeeMGA;
      const clientBank = calculateClientTotals(amount, currency, "bank")?.bankTotal;
      const netProfit = Number.isFinite(clientBank) ? clientBank - debitMGA : NaN;

      return { rate, totalToBuy, rechargeFee, debitMGA, clientBank, netProfit };
    };

    const skrillRow = document.getElementById("skrillFee")?.closest(".detail-row");
    if (skrillRow) {
      const label = skrillRow.querySelector("span");
      if (label) label.textContent = "Frais de recharge";
    }

    const cryptoRow = document.getElementById("cryptoFee")?.closest(".detail-row");
    if (cryptoRow) cryptoRow.remove();

    window.updateInternal = function(){
      const amount = parseInput("internalAmount"), t = calculateOwnerTotals(amount, state.currency);
      if(!t){
        ["internalDebit","internalBuy","internalRate","netProfit","clientBank","skrillFee","ownerFixedFee"].forEach(id => {
          const el = $(id);
          if(el) el.textContent = "—";
        });
        return;
      }
      $("internalDebit").textContent = fmtNumber(t.debitMGA,0);
      $("internalBuy").textContent = fmtCurrency(t.totalToBuy,state.currency,2);
      $("internalRate").textContent = fmtRate(t.rate);
      $("netProfit").textContent = fmtMGA(t.netProfit,0);
      $("clientBank").textContent = fmtMGA(t.clientBank,0);
      $("skrillFee").textContent = fmtCurrency(t.rechargeFee,state.currency,2);
      $("ownerFixedFee").textContent = fmtMGA(CONFIG.ownerFixedFeeMGA,0);
    };

    refreshAll();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyInternalRechargePatch, { once:true });
  } else {
    applyInternalRechargePatch();
  }
})();