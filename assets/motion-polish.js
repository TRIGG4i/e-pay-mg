(() => {
  if (typeof setView !== "function" || typeof $ !== "function") return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const viewOrder = ["client", "internal", "quotes"];
  const baseSetView = setView;
  const baseCloseQuote = typeof closeQuote === "function" ? closeQuote : null;
  let navTransition = null;
  let closingQuote = false;

  const dock = document.querySelector(".dock");
  const navButtons = Array.from(document.querySelectorAll(".nav-btn"));
  let indicator = null;

  function ensureIndicator(){
    if (!dock) return null;
    if (indicator && indicator.isConnected) return indicator;
    indicator = document.createElement("div");
    indicator.className = "dock-indicator";
    indicator.setAttribute("aria-hidden", "true");
    dock.prepend(indicator);
    return indicator;
  }

  function syncIndicator(immediate = false){
    const pill = ensureIndicator();
    const active = document.querySelector(".nav-btn.active");
    if (!pill || !active || !dock) return;

    if (immediate) pill.style.transition = "none";
    pill.style.width = `${active.offsetWidth}px`;
    pill.style.transform = `translateX(${active.offsetLeft}px)`;
    pill.style.opacity = "1";

    if (immediate) {
      requestAnimationFrame(() => {
        pill.style.transition = "";
      });
    }
  }

  function fallbackEntrance(){
    const activeView = document.querySelector(".view.active");
    if (!activeView) return;
    activeView.classList.remove("motion-fallback-in");
    void activeView.offsetWidth;
    activeView.classList.add("motion-fallback-in");
    window.setTimeout(() => activeView.classList.remove("motion-fallback-in"), 320);
  }

  setView = function premiumSetView(view){
    const current = typeof state !== "undefined" ? state.view : null;
    if (!view || current === view) {
      baseSetView(view);
      requestAnimationFrame(() => syncIndicator());
      return;
    }

    const from = Math.max(0, viewOrder.indexOf(current));
    const to = Math.max(0, viewOrder.indexOf(view));
    document.documentElement.dataset.navDirection = to >= from ? "forward" : "back";

    const commit = () => {
      baseSetView(view);
      requestAnimationFrame(() => syncIndicator());
    };

    if (document.startViewTransition && !reducedMotion.matches) {
      try {
        navTransition?.skipTransition?.();
        navTransition = document.startViewTransition(commit);
        navTransition.finished.finally(() => {
          navTransition = null;
          delete document.documentElement.dataset.navDirection;
        });
      } catch {
        commit();
        fallbackEntrance();
      }
    } else {
      commit();
      fallbackEntrance();
      window.setTimeout(() => {
        delete document.documentElement.dataset.navDirection;
      }, 320);
    }
  };

  if (baseCloseQuote) {
    closeQuote = function premiumCloseQuote(){
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
      }, 185);
    };
  }

  navButtons.forEach((button) => {
    button.addEventListener("pointerdown", () => {
      if (typeof button.animate !== "function") return;
      button.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(.955)" },
          { transform: "scale(1)" }
        ],
        { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
    }, { passive: true });
  });

  const interactiveSelector = ".rate-option,.segment,.primary,.secondary,.action-btn,.icon-button,.quote-item,.mini-btn";
  document.addEventListener("pointerdown", (event) => {
    if (reducedMotion.matches) return;
    const target = event.target.closest(interactiveSelector);
    if (!target || target.closest(".dock") || typeof target.animate !== "function") return;
    target.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(.982)" },
        { transform: "scale(1)" }
      ],
      { duration: 170, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
  }, { passive: true });

  if ("ResizeObserver" in window && dock) {
    new ResizeObserver(() => syncIndicator(true)).observe(dock);
  }
  window.addEventListener("orientationchange", () => {
    window.setTimeout(() => syncIndicator(true), 120);
  }, { passive: true });
  window.addEventListener("resize", () => syncIndicator(true), { passive: true });

  requestAnimationFrame(() => syncIndicator(true));
})();