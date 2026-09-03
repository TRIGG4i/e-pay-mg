(() => {
  if (typeof openQuote !== "function" || typeof $ !== "function") return;

  const baseOpenQuote = openQuote;

  function resetQuoteSheetPosition(){
    const backdrop = $("quoteSheet");
    const sheet = backdrop?.querySelector(".sheet");
    const client = $("quoteClient");

    if (document.activeElement === client) {
      try { client.blur(); } catch {}
    }

    if (sheet) {
      sheet.scrollTop = 0;
      sheet.scrollLeft = 0;
    }

    if (backdrop) {
      backdrop.scrollTop = 0;
      backdrop.scrollLeft = 0;
    }
  }

  openQuote = function stableOpenQuote(quote = null){
    baseOpenQuote(quote);
    resetQuoteSheetPosition();

    /*
     * app-core focuses the client field after 180 ms. On mobile browsers that
     * automatically scrolls the bottom sheet and lets the header cover the
     * upper form fields. Reset once after that scheduled focus has fired.
     */
    window.setTimeout(resetQuoteSheetPosition, 230);
  };

  $("openQuote")?.addEventListener("click", () => {
    window.setTimeout(resetQuoteSheetPosition, 235);
  });

  $("newQuoteTop")?.addEventListener("click", () => {
    window.setTimeout(resetQuoteSheetPosition, 235);
  });
})();