(() => {
  const STORAGE_KEY = "epayInterfaceTheme";
  const root = document.documentElement;
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  const moonIcon = '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M20 15.2A8.5 8.5 0 1 1 8.8 4a7 7 0 0 0 11.2 11.2Z"></path></svg>';
  const sunIcon = '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"></path></svg>';

  let themeButton = null;

  function currentTheme(){
    return root.dataset.theme === "dark" ? "dark" : "light";
  }

  function syncButton(){
    if (!themeButton) return;
    const dark = currentTheme() === "dark";
    themeButton.innerHTML = dark ? sunIcon : moonIcon;
    themeButton.setAttribute("aria-label", dark ? "Passer en mode clair" : "Passer en mode sombre");
    themeButton.setAttribute("title", dark ? "Mode clair" : "Mode sombre");
    themeButton.setAttribute("aria-pressed", dark ? "true" : "false");
  }

  function applyTheme(theme, persist = true){
    const next = theme === "dark" ? "dark" : "light";
    root.dataset.theme = next;
    root.style.colorScheme = next;
    if (themeMeta) themeMeta.setAttribute("content", next === "dark" ? "#0d1016" : "#f4f5f7");
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    }
    syncButton();
  }

  function mountToggle(){
    const refresh = document.getElementById("refreshRates");
    const topbar = document.querySelector(".topbar");
    if (!refresh || !topbar || document.getElementById("themeToggle")) return;

    let actions = topbar.querySelector(".top-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "top-actions";
      topbar.appendChild(actions);
    }

    themeButton = document.createElement("button");
    themeButton.type = "button";
    themeButton.id = "themeToggle";
    themeButton.className = "icon-button theme-toggle";
    actions.appendChild(themeButton);
    actions.appendChild(refresh);

    themeButton.addEventListener("click", () => {
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });

    syncButton();
  }

  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch {}
  applyTheme(saved === "dark" ? "dark" : "light", false);
  mountToggle();
})();