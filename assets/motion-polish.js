(() => {
  if (typeof setView !== "function" || typeof $ !== "function") return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const baseSetView = setView;
  const baseCloseQuote = typeof closeQuote === "function" ? closeQuote : null;
  const dock = document.querySelector(".dock");
  let indicator = null;
  let closingQuote = false;

  function ensureIndicator(){
    if (!dock) return null;
    if (indicator?.isConnected) return indicator;
    indicator = document.createElement("div");
    indicator.className = "dock-indicator";
    indicator.setAttribute("aria-hidden", "true");
    dock.prepend(indicator);
    return indicator;
  }

  function syncIndicator(immediate = false){
    const pill = ensureIndicator();
    const active = document.querySelector(".nav-btn.active");
    if (!pill || !active) return;

    if (immediate) pill.classList.add("no-motion");
    pill.style.width = `${active.offsetWidth}px`;
    pill.style.transform = `translate3d(${active.offsetLeft}px,0,0)`;
    pill.style.opacity = "1";

    if (immediate) {
      requestAnimationFrame(() => pill.classList.remove("no-motion"));
    }
  }

  /*
   * Intentionally no page/card movement here.
   * Navigation swaps content immediately and only the dock indicator moves.
   * This avoids vestibular discomfort and keeps the visual landmarks fixed.
   */
  setView = function stableSetView(view){
    baseSetView(view);
    requestAnimationFrame(() => syncIndicator());
  };

  if (baseCloseQuote) {
    closeQuote = function smoothCloseQuote(){
      const sheet = $("quoteSheet");
      if (!sheet?.classList.contains("open") || reducedMotion.matches) {
        baseCloseQuote();
        return;
      }
      if (closingQuote) return;
      closingQuote = true;
      sheet.classList.add("closing");
      window.setTimeout(() => {
        baseCloseQuote();
        sheet.classList.remove("closing");
        closingQuote = false;
      }, 145);
    };
  }

  if ("ResizeObserver" in window && dock) {
    new ResizeObserver(() => syncIndicator(true)).observe(dock);
  }
  window.addEventListener("orientationchange", () => {
    window.setTimeout(() => syncIndicator(true), 100);
  }, { passive: true });
  window.addEventListener("resize", () => syncIndicator(true), { passive: true });

  requestAnimationFrame(() => syncIndicator(true));
})();