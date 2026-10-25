(() => {
  const BUILD = window.EPAY?.build || 'dev';
  const versioned = (url) => `${url}?v=${BUILD}`;
  const loadScript = (src) => new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = src; script.async = false; script.onload = resolve; script.onerror = () => reject(new Error(`Impossible de charger ${src}`)); document.head.appendChild(script); });
  // Ordre : outils et synchro d'abord (les modules s'y abonnent), puis le cœur, puis la gestion.
  const files = ['assets/pricing.js', 'assets/ui.js', 'assets/sync.js', 'assets/app-core.js', 'assets/clients.js', 'assets/operations.js', 'assets/settings.js', 'assets/dashboard.js', 'assets/export-image.js', 'assets/theme-patch.js', 'assets/motion-polish.js'];
  files.reduce((chain, file) => chain.then(() => loadScript(versioned(file))), Promise.resolve())
    .then(() => window.EpaySync?.start())
    .catch((error) => console.error('HELPEO :', error));
})();
