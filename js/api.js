/* Appels directs aux API d'IA depuis le navigateur : Google Gemini (gratuit) ou Claude. */
(function () {
  const S = () => Store.settings;
  const provider = () => S().provider === "claude" ? "claude" : "gemini";
  const ready = () => !!(provider() === "claude" ? S().apiKey : S().geminiKey);

  function friendly(status, msg, who) {
    if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID/i.test(msg)) return `Clé ${who} refusée. Vérifie-la dans Réglages.`;
    if (status === 429) return who === "Gemini"
      ? "Quota gratuit Gemini atteint (par minute ou par jour). Attends un peu, ou choisis un autre modèle dans Réglages."
      : "Limite de requêtes atteinte. Réessaie dans une minute.";
    if (status === 404) return `Modèle introuvable. Clique sur « Tester la clé » dans Réglages pour choisir un modèle disponible.`;
    if (status === 529 || status === 503) return `${who} est surchargé. Réessaie dans un instant.`;
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
      const err = new Error(friendly(res.status, msg, who));
      err.status = res.status; err.raw = msg;
      throw err;
    }
    return data;
  }

  /* ================= Gemini ================= */
  const GEM = "https://generativelanguage.googleapis.com/v1beta";

  function toGeminiParts(content) {
    if (typeof content === "string") return [{ text: content }];
    return content.map(b => b.type === "document"
      ? { inline_data: { mime_type: b.source.media_type, data: b.source.data } }
      : { text: b.text });
  }

  async function askGemini({ system, content, webFetch, json }) {
    const model = (S().geminiModel || "gemini-flash-latest").replace(/^models\//, "");
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: toGeminiParts(content) }],
      generationConfig: { temperature: 0.7 }
    };
    // Le mode JSON forcé n'est pas compatible avec l'outil de lecture d'URL : on ne l'active que sans outil.
    if (webFetch) body.tools = [{ url_context: {} }];
    else if (json) body.generationConfig.responseMimeType = "application/json";

    const headers = { "content-type": "application/json", "x-goog-api-key": S().geminiKey };
    const url = `${GEM}/models/${encodeURIComponent(model)}:generateContent`;
    let data, webFetchUnavailable = false;
    const send = async () => {
      try { return await post(url, headers, body, "Gemini"); }
      catch (e) {
        // Quota par minute du palier gratuit : une seule relance après une pause.
        if (e.status === 429 && !/per day|PerDay/i.test(e.raw || "")) { await new Promise(r => setTimeout(r, 20000)); return post(url, headers, body, "Gemini"); }
        throw e;
      }
    };
    try { data = await send(); }
    catch (e) {
      if (webFetch && e.status === 400) {
        delete body.tools; if (json) body.generationConfig.responseMimeType = "application/json";
        data = await send(); webFetchUnavailable = true;
      } else throw e;
    }
    const cand = data.candidates?.[0];
    if (!cand) {
      const why = data.promptFeedback?.blockReason;
      throw new Error(why ? `Gemini a bloqué la demande (${why}).` : "Réponse vide de Gemini. Relance.");
    }
    if (cand.finishReason === "MAX_TOKENS") console.warn("Réponse Gemini tronquée");
    if (cand.finishReason === "SAFETY") throw new Error("Gemini a bloqué la réponse (filtre de sécurité). Relance.");
    const text = (cand.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join("\n").trim();
    return { text, raw: data, webFetchUnavailable };
  }

  async function listGeminiModels() {
    const res = await fetch(`${GEM}/models?pageSize=200`, { headers: { "x-goog-api-key": S().geminiKey } })
      .catch(() => { throw new Error("Connexion impossible à Gemini."); });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(friendly(res.status, data?.error?.message || res.statusText, "Gemini"));
    return (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent") && /gemini/i.test(m.name) && !/embedding|image|tts|audio|live/i.test(m.name))
      .map(m => m.name.replace(/^models\//, ""))
      .sort((a, b) => (b.includes("flash") - a.includes("flash")) || b.localeCompare(a));
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
      const models = await listGeminiModels();
      await askGemini({ system: "Réponds en un mot.", content: "Dis OK." });
      return models;
    }
    await askClaude({ system: "Réponds en un mot.", content: "Dis OK.", maxTokens: 10 });
    return null;
  }

  window.API = { ask, askJSON, parseJSON, testKey, ready, provider };
})();
