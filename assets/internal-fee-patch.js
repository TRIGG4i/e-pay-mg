(() => {
  const applyInternalDebitPatch = () => {
    if (typeof CONFIG === "undefined" || typeof state === "undefined") return;

    CONFIG.rechargeFeePercent = Number(CONFIG.skrillFeePercent ?? 1);
    const savedMode = (() => {
      try { return localStorage.getItem("epayInternalDebitMode"); } catch { return null; }
    })();
    state.internalDebitMode = savedMode === "direct" || savedMode === "foreign" ? savedMode : "foreign";

    const amountBox = document.querySelector("#internalView .amount-box");
    if (amountBox && !document.getElementById("internalDebitModeWrap")) {
      const wrap = document.createElement("div");
      wrap.id = "internalDebitModeWrap";
      wrap.className = "segment-wrap internal-debit-wrap";
      wrap.innerHTML = `
        <div class="field-label">
          <span>Mode de débit</span>
          <span id="internalDebitModeHint"></span>
        </div>
        <div class="segmented internal-debit-segmented" role="group" aria-label="Mode de débit interne">
          <button type="button" class="segment internal-debit-segment" data-debit-mode="direct">Débit direct</button>
          <button type="button" class="segment internal-debit-segment" data-debit-mode="foreign">Carte étrangère</button>
        </div>`;
      amountBox.insertAdjacentElement("afterend", wrap);

      wrap.querySelectorAll("[data-debit-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          state.internalDebitMode = button.dataset.debitMode;
          try { localStorage.setItem("epayInternalDebitMode", state.internalDebitMode); } catch {}
          updateInternal();
        });
      });
    }

    const skrillRow = document.getElementById("skrillFee")?.closest(".detail-row");
    if (skrillRow) {
      const label = skrillRow.querySelector("span");
      if (label) label.textContent = "Frais de recharge";
    }

    const cryptoRow = document.getElementById("cryptoFee")?.closest(".detail-row");
    if (cryptoRow) cryptoRow.remove();

    window.calculateOwnerTotals = function(amount, currency){
      const rate = state.ownerRates[currency];
      if(!Number.isFinite(rate) || rate <= 0 || amount <= 0) return null;

      const usesForeignCard = state.internalDebitMode === "foreign";
      const feeRate = usesForeignCard ? CONFIG.rechargeFeePercent / 100 : 0;
      const totalToBuy = usesForeignCard ? amount / (1 - feeRate) : amount;
      const rechargeFee = usesForeignCard ? totalToBuy * feeRate : 0;
      const debitMGA = totalToBuy * rate + CONFIG.ownerFixedFeeMGA;
      const clientBank = calculateClientTotals(amount, currency, "bank")?.bankTotal;
      const netProfit = Number.isFinite(clientBank) ? clientBank - debitMGA : NaN;

      return {
        rate,
        totalToBuy,
        rechargeFee,
        debitMGA,
        clientBank,
        netProfit,
        debitMode: state.internalDebitMode
      };
    };

    window.updateInternal = function(){
      const amount = parseInput("internalAmount");
      const t = calculateOwnerTotals(amount, state.currency);

      document.querySelectorAll("[data-debit-mode]").forEach((button) => {
        const active = button.dataset.debitMode === state.internalDebitMode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });

      const hint = document.getElementById("internalDebitModeHint");
      if (hint) {
        hint.textContent = state.internalDebitMode === "foreign"
          ? `+${fmtNumber(CONFIG.rechargeFeePercent, 0)} % recharge`
          : "Sans recharge";
      }

      const feeLabel = document.getElementById("skrillFee")?.closest(".detail-row")?.querySelector("span");
      if (feeLabel) {
        feeLabel.textContent = state.internalDebitMode === "foreign"
          ? "Frais de recharge carte étrangère"
          : "Frais de recharge";
      }

      if(!t){
        ["internalDebit","internalBuy","internalRate","netProfit","clientBank","skrillFee","ownerFixedFee"].forEach((id) => {
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
    document.addEventListener("DOMContentLoaded", applyInternalDebitPatch, { once:true });
  } else {
    applyInternalDebitPatch();
  }
})();