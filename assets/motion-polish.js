(() => {
  if (typeof setView !== "function" || typeof $ !== "function") return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const viewOrder = ["client", "internal", "quotes"];
  const baseSetView = setView;
  const baseCloseQuote = typeof closeQuote === "function" ? closeQuote : null;
  const dock = document.querySelector(".dock");
  let indicator = null;
  let pageAnimation = null;
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

  function animateActiveView(fromView, toView){
    if (reducedMotion.matches) return;
    const activeView = document.querySelector(".view.active");
    if (!activeView || typeof activeView.animate !== "function") return;

    pageAnimation?.cancel?.();
    const fromIndex = Math.max(0, viewOrder.indexOf(fromView));
    const toIndex = Math.max(0, viewOrder.indexOf(toView));
    const direction = toIndex >= fromIndex ? 1 : -1;

    pageAnimation = activeView.animate(
      [
        { opacity: 0.74, transform: `translate3d(${direction * 8}px,0,0)` },
        { opacity: 1, transform: "translate3d(0,0,0)" }
      ],
      {
        duration: 155,
        easing: "cubic-bezier(.2,.72,.2,1)",
        fill: "both"
      }
    );
    pageAnimation.finished.finally(() => {
      pageAnimation = null;
    }).catch(() => {});
  }

  setView = function smoothSetView(view){
    const current = typeof state !== "undefined" ? state.view : null;
    if (!view || current === view) {
      baseSetView(view);
      requestAnimationFrame(() => syncIndicator());
      return;
    }

    baseSetView(view);
    requestAnimationFrame(() => syncIndicator());
    animateActiveView(current, view);
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