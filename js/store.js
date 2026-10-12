/* Stockage local : tout reste dans le navigateur. */
(function () {
  const KEY = "atelier-candidature-v1";
  const defaults = () => ({
    settings: { apiKey: "", model: "claude-sonnet-5-5", webFetch: true },
    profile: null,
    apps: [] // candidatures, plus récentes en tête
  });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const data = JSON.parse(raw);
      const d = defaults();
      return { ...d, ...data, settings: { ...d.settings, ...(data.settings || {}) }, apps: data.apps || [] };
    } catch (e) {
      console.warn("Lecture du stockage impossible", e);
      return defaults();
    }
  }

  let state = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error(e);
      window.UI && UI.toast("Stockage plein ou bloqué : exporte tes données.", true);
      return false;
    }
  }

  window.Store = {
    get settings() { return state.settings; },
    get profile() { return state.profile; },
    get apps() { return state.apps; },
    setSettings(s) { state.settings = { ...state.settings, ...s }; save(); },
    setProfile(p) { state.profile = p; save(); },
    upsertApp(app) {
      const i = state.apps.findIndex(a => a.id === app.id);
      if (i >= 0) state.apps[i] = app; else state.apps.unshift(app);
      save();
    },
    getApp(id) { return state.apps.find(a => a.id === id); },
    deleteApp(id) { state.apps = state.apps.filter(a => a.id !== id); save(); },
    exportData(includeKey = false) {
      const copy = JSON.parse(JSON.stringify(state));
      if (!includeKey) copy.settings.apiKey = "";
      copy.exportedAt = new Date().toISOString();
      return copy;
    },
    importData(data) {
      if (!data || typeof data !== "object" || !("apps" in data || "profile" in data)) throw new Error("Fichier non reconnu");
      const keepKey = state.settings.apiKey;
      state = { ...defaults(), ...data, settings: { ...defaults().settings, ...(data.settings || {}) } };
      if (!state.settings.apiKey) state.settings.apiKey = keepKey;
      delete state.exportedAt;
      save();
    },
    wipe() { const k = state.settings; state = defaults(); state.settings = k; save(); }
  };
})();
