/* Appels directs aux API d'IA depuis le navigateur : Google Gemini (gratuit) ou Claude. */
(function () {
  const S = () => Store.settings;
  const provider = () => S().provider === "claude" ? "claude" : "gemini";
  const ready = () => !!(provider() === "claude" ? S().apiKey : S().geminiKey);

  function friendly(status, msg, who) {
    if (status === 401 || /API key not valid|API_KEY_INVALID|API key expired/i.test(msg)) return `Clé ${who} refusée. Vérifie-la dans Réglages.`;
    if (status === 403) return `Accès refusé par ${who} pour ce modèle ou cette clé.`;
    if (status === 429) return who === "Gemini"
      ? "Quota gratuit Gemini atteint (par minute ou par jour). Attends un peu, ou choisis un autre modèle dans Réglages."
      : "Limite de requêtes atteinte. Réessaie dans une minute.";
    if (status === 404) return `Aucun modèle ${who} disponible pour ta clé n'a répondu. Clique sur « Tester la clé » dans Réglages.`;
    if (status === 529 || status === 503 || status === 500) return `${who} est saturé en ce moment (serveurs Google/Anthropic, pas ta clé). Réessaie dans 1 à 2 minutes.`;
    if (status === 400 && /credit|balance/i.test(msg)) return "Crédit API insuffisant sur ton compte Anthropic.";
    return `Erreur ${who} (${status}) : ${msg}`;
  }

  async function post(url, headers, body, who) {
    let res;
    try { res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) }); }
    catch (e) { throw new Error(`Connexion impossible à ${who} (réseau ou bloqueur de pub).`); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || res.statusText;
      const err = new Error(friendly(res.status, msg, who) + (msg ? ` — Détail : ${String(msg).slice(0, 180)}` : ""));
      err.status = res.status; err.raw = msg; err.details = data?.error?.details || [];
      throw err;
    }
    return data;
  }

  /* ================= Gemini ================= */
  const GEM = "https://generativelanguage.googleapis.com/v1beta";
  // Alias maintenus par Google : ils pointent toujours vers le modèle Flash courant.
  const GEMINI_ALIASES = ["gemini-flash-latest", "gemini-flash-lite-latest"];
  const MAX_MODELS_TRIED = 5;

  function toGeminiParts(content) {
    if (typeof content === "string") return [{ text: content }];
    return content.map(b => b.type === "document"
      ? { inline_data: { mime_type: b.source.media_type, data: b.source.data } }
      : { text: b.text });
  }

  /** Numéro de version d'un nom de modèle ("gemini-3.5-flash" -> 3.5). */
  const version = (name) => parseFloat((name.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);

  /** Liste les modèles texte disponibles pour la clé, du plus adapté au moins adapté. */
  async function listGeminiModels() {
    const res = await fetch(`${GEM}/models?pageSize=200`, { headers: { "x-goog-api-key": S().geminiKey } })
      .catch(() => { throw new Error("Connexion impossible à Gemini."); });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || res.statusText;
      const err = new Error(friendly(res.status, msg, "Gemini") + ` — Détail : ${String(msg).slice(0, 180)}`);
      err.status = res.status; err.raw = msg; throw err;
    }
    const rank = (n) =>
      (/-latest$/.test(n) ? 0 : 10) +            // alias stables d'abord
      (/preview|exp/.test(n) ? 5 : 0) +          // previews en dernier recours
      (/lite/.test(n) ? 1 : 0);                  // Flash avant Flash-Lite
    return (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name.replace(/^models\//, ""))
      .filter(n => /^gemini-/.test(n) && /flash/.test(n) && !/embedding|image|tts|audio|live|native|computer|robotics|omni|thinking|learnlm/i.test(n))
      .sort((a, b) => rank(a) - rank(b) || version(b) - version(a) || a.localeCompare(b));
  }

  let cachedModels = null;
  async function availableModels() {
    if (!cachedModels) {
      try { cachedModels = await listGeminiModels(); }
      catch (e) { if (e.status === 401 || /API key/i.test(e.raw || "")) throw e; cachedModels = []; }
    }
    return cachedModels;
  }

  async function askGemini({ system, content, webFetch, json }) {
    const chosen = (S().geminiModel || "").replace(/^models\//, "").trim();
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: toGeminiParts(content) }],
      generationConfig: { temperature: 0.7 }
    };
    // Le mode JSON forcé n'est pas compatible avec l'outil de lecture d'URL : on ne l'active que sans outil.
    if (webFetch) body.tools = [{ url_context: {} }];
    else if (json) body.generationConfig.responseMimeType = "application/json";

    const headers = { "content-type": "application/json", "x-goog-api-key": S().geminiKey };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const listed = await availableModels();
    // Modèle choisi, puis alias Google, puis les modèles réellement disponibles pour cette clé.
    const chain = [...new Set([chosen, ...GEMINI_ALIASES, ...listed].filter(Boolean))].slice(0, MAX_MODELS_TRIED);
    let data, webFetchUnavailable = false, lastErr, used;

    const sendTo = async (m) => {
      const url = `${GEM}/models/${encodeURIComponent(m)}:generateContent`;
      for (let attempt = 0; ; attempt++) {
        try { return await post(url, headers, body, "Gemini"); }
        catch (e) {
          const transient = e.status === 503 || e.status === 500 || e.status === 529;
          if (transient && attempt < 1) { await sleep(3000); continue; }
          // Quota par minute (pas le quota du jour, ni un modèle à 0) : on attend le délai donné par Google.
          const daily = /per ?day|PerDay|limit: 0\b/i.test(e.raw || "") || /PerDay/i.test(JSON.stringify(e.details || []));
          if (e.status === 429 && !daily && attempt < 2) {
            const info = (e.details || []).find(d => d.retryDelay);
            const wait = Math.min(60, Math.max(5, parseFloat(info?.retryDelay) || 20));
            UI && UI.toast && UI.toast(`Quota Gemini par minute atteint : reprise dans ${Math.round(wait)} s…`);
            await sleep(wait * 1000 + 500); continue;
          }
          throw e;
        }
      }
    };

    for (const m of chain) {
      try {
        try { data = await sendTo(m); }
        catch (e) {
          if (webFetch && body.tools && e.status === 400 && !/API key/i.test(e.raw || "")) {
            delete body.tools; if (json) body.generationConfig.responseMimeType = "application/json";
            data = await sendTo(m); webFetchUnavailable = true;
          } else throw e;
        }
        used = m;
        break;
      } catch (e) {
        lastErr = e;
        // Clé invalide : inutile d'essayer d'autres modèles.
        if (e.status === 401 || /API key not valid|API_KEY_INVALID/i.test(e.raw || "")) throw e;
        // Sinon (modèle retiré, saturé, quota, accès refusé…) on passe au suivant.
        if (![400, 403, 404, 429, 500, 503, 529].includes(e.status)) throw e;
      }
    }
    if (!data) throw lastErr;
    // On retient le modèle qui a marché pour les prochaines fois.
    if (used && used !== chosen) { console.info(`Gemini : modèle utilisé « ${used} »`); Store.setSettings({ geminiModel: used }); }

    const cand = data.candidates?.[0];
    if (!cand) {
      const why = data.promptFeedback?.blockReason;
      throw new Error(why ? `Gemini a bloqué la demande (${why}).` : "Réponse vide de Gemini. Relance.");
    }
    if (cand.finishReason === "MAX_TOKENS") console.warn("Réponse Gemini tronquée");
    if (cand.finishReason === "SAFETY") throw new Error("Gemini a bloqué la réponse (filtre de sécurité). Relance.");
    const text = (cand.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join("\n").trim();
    return { text, raw: data, webFetchUnavailable, model: used };
  }

  /* ================= Claude ================= */
  const CLAUDE = "https://api.anthropic.com/v1/messages";
  const WEB_FETCH_TOOL = { type: "web_fetch_20250910", name: "web_fetch", max_uses: 3, max_content_tokens: 30000 };
  const WEB_FETCH_BETA = "web-fetch-2025-09-10";

  async function askClaude({ system, content, maxTokens = 4000, webFetch = false }) {
    const headers = {
      "content-type": "application/json",
      "x-api-key": S().apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    };
    const messages = [{ role: "user", content }];
    const body = { model: S().model, max_tokens: maxTokens, system, messages };
    const h = webFetch ? { ...headers, "anthropic-beta": WEB_FETCH_BETA } : headers;
    if (webFetch) body.tools = [WEB_FETCH_TOOL];

    let data, webFetchUnavailable = false;
    try { data = await post(CLAUDE, h, body, "Claude"); }
    catch (e) {
      if (webFetch && e.status === 400 && /tool|beta|web_fetch/i.test(e.raw || "")) {
        delete body.tools; data = await post(CLAUDE, headers, body, "Claude"); webFetchUnavailable = true;
      } else throw e;
    }
    let guard = 0;
    while (data.stop_reason === "pause_turn" && guard++ < 3) {
      messages.push({ role: "assistant", content: data.content });
      data = await post(CLAUDE, h, { ...body, messages }, "Claude");
    }
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    return { text, raw: data, webFetchUnavailable };
  }

  /* ================= Commun ================= */
  async function ask(opts) {
    if (!ready()) throw new Error("Clé API manquante (onglet Réglages).");
    return provider() === "claude" ? askClaude(opts) : askGemini(opts);
  }

  function parseJSON(text) {
    if (!text) throw new Error("Réponse vide");
    let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try { return JSON.parse(t); } catch (_) {}
    const start = t.indexOf("{"), end = t.lastIndexOf("}");
    if (start >= 0 && end > start) { try { return JSON.parse(t.slice(start, end + 1)); } catch (_) {} }
    throw new Error("Réponse illisible (JSON invalide). Relance la génération.");
  }

  async function askJSON(opts) {
    const { text, webFetchUnavailable } = await ask({ ...opts, json: true });
    try { return { json: parseJSON(text), webFetchUnavailable }; }
    catch (e) {
      const extra = "IMPORTANT : réponds uniquement avec un objet JSON valide, sans texte autour.";
      const content = typeof opts.content === "string" ? opts.content + "\n\n" + extra : [...opts.content, { type: "text", text: extra }];
      const retry = await ask({ ...opts, content, webFetch: false, json: true });
      return { json: parseJSON(retry.text), webFetchUnavailable };
    }
  }

  /** Teste la clé. Pour Gemini, renvoie la liste des modèles disponibles. */
  async function testKey() {
    if (!ready()) throw new Error("Colle d'abord une clé.");
    if (provider() === "gemini") {
      cachedModels = null;
      const models = await listGeminiModels();
      cachedModels = models;
      const r = await askGemini({ system: "Réponds en un mot.", content: "Dis OK." });
      return { models, model: r.model };
    }
    await askClaude({ system: "Réponds en un mot.", content: "Dis OK.", maxTokens: 10 });
    return null;
  }

  window.API = { ask, askJSON, parseJSON, testKey, ready, provider };
})();
