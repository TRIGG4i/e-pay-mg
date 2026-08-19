(() => {
  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Impossible de charger ${src}`));
    document.head.appendChild(script);
  });

  loadScript("assets/app-core.js")
    .then(() => loadScript("assets/internal-fee-patch.js"))
    .catch((error) => console.error("E-Pay MG :", error));
})();
