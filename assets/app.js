(() => {
  const loadStyle = (href) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Impossible de charger ${src}`));
    document.head.appendChild(script);
  });

  loadStyle("assets/premium-fixes.css");
  loadScript("assets/app-core.js")
    .then(() => loadScript("assets/internal-fee-patch.js"))
    .then(() => loadScript("assets/customer-quote-patch.js"))
    .then(() => loadScript("assets/export-image-patch.js"))
    .then(() => loadScript("assets/theme-patch.js"))
    .then(() => loadScript("assets/motion-polish.js"))
    .catch((error) => console.error("E-Pay MG :", error));
})();
