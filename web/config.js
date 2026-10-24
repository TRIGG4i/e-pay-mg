(() => {
  const BUILD = '20261024-logo1';
  const KEY = 'epayRuntimeBuild';
  // En local (tests), l'app parle au serveur qui la sert ; en ligne, au serveur E-Pay du VPS.
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  window.EPAY = Object.freeze({ apiBase: local ? location.origin : 'https://epay.169-58-138-232.sslip.io', build: BUILD });
  try {
    const previous = localStorage.getItem(KEY);
    if (previous !== BUILD) {
      localStorage.setItem(KEY, BUILD);
      const url = new URL(location.href);
      if (url.searchParams.get('_build') !== BUILD) {
        url.searchParams.set('_build', BUILD);
        Promise.allSettled([
          'caches' in window ? caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))) : Promise.resolve(),
          'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))) : Promise.resolve()
        ]).finally(() => location.replace(url.toString()));
      }
    }
  } catch {}
})();
