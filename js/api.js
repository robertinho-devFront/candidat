/* Appels directs à l'API Claude depuis le navigateur. */
(function () {
  const ENDPOINT = "https://api.anthropic.com/v1/messages";
  const WEB_FETCH_TOOL = { type: "web_fetch_20250910", name: "web_fetch", max_uses: 3, max_content_tokens: 30000 };
  const WEB_FETCH_BETA = "web-fetch-2025-09-10";

  async function request(body, { beta } = {}) {
    const { apiKey } = Store.settings;
    if (!apiKey) throw new Error("Clé API manquante (onglet Réglages).");
    const headers = {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    };
    if (beta) headers["anthropic-beta"] = beta;

    let res;
    try {
      res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) });
    } catch (e) {
      throw new Error("Connexion impossible à l'API (réseau ou bloqueur).");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || res.statusText;
      const err = new Error(friendly(res.status, msg));
      err.status = res.status; err.raw = msg;
      throw err;
    }
    return data;
  }

  function friendly(status, msg) {
    if (status === 401) return "Clé API refusée. Vérifie-la dans Réglages.";
    if (status === 429) return "Limite de requêtes atteinte. Réessaie dans une minute.";
    if (status === 529 || status === 503) return "L'API est surchargée. Réessaie dans un instant.";
    if (status === 400 && /credit|balance/i.test(msg)) return "Crédit API insuffisant sur ton compte Anthropic.";
    return `Erreur API (${status}) : ${msg}`;
  }

  /**
   * ask({ system, content, maxTokens, webFetch })
   * content : string ou tableau de blocs (texte, document…)
   * Retourne le texte final.
   */
  async function ask({ system, content, maxTokens = 4000, webFetch = false }) {
    const messages = [{ role: "user", content }];
    const body = { model: Store.settings.model, max_tokens: maxTokens, system, messages };
    let opts = {};
    if (webFetch) { body.tools = [WEB_FETCH_TOOL]; opts.beta = WEB_FETCH_BETA; }

    let data;
    try {
      data = await request(body, opts);
    } catch (e) {
      // Si l'outil web fetch n'est pas dispo sur ce compte/modèle, on retente sans.
      if (webFetch && e.status === 400 && /tool|beta|web_fetch/i.test(e.raw || "")) {
        delete body.tools;
        data = await request(body, {});
        data._webFetchUnavailable = true;
      } else throw e;
    }

    // Les outils serveur peuvent mettre le tour en pause : on relance (max 3 fois).
    let guard = 0;
    while (data.stop_reason === "pause_turn" && guard++ < 3) {
      messages.push({ role: "assistant", content: data.content });
      data = await request({ ...body, messages }, opts);
    }

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    if (data.stop_reason === "max_tokens") console.warn("Réponse tronquée (max_tokens)");
    return { text, raw: data, webFetchUnavailable: !!data._webFetchUnavailable };
  }

  /** Extrait le premier objet JSON d'une réponse texte. */
  function parseJSON(text) {
    if (!text) throw new Error("Réponse vide");
    let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try { return JSON.parse(t); } catch (_) {}
    const start = t.indexOf("{"), end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(t.slice(start, end + 1)); } catch (_) {}
    }
    throw new Error("Réponse illisible (JSON invalide). Relance la génération.");
  }

  /** ask + parse JSON, avec une relance si le JSON est cassé. */
  async function askJSON(opts) {
    let { text, webFetchUnavailable } = await ask(opts);
    try { return { json: parseJSON(text), webFetchUnavailable }; }
    catch (e) {
      const retry = await ask({ ...opts, webFetch: false, content: typeof opts.content === "string"
        ? opts.content + "\n\nIMPORTANT : réponds uniquement avec un objet JSON valide, sans texte autour."
        : [...opts.content, { type: "text", text: "IMPORTANT : réponds uniquement avec un objet JSON valide, sans texte autour." }] });
      return { json: parseJSON(retry.text), webFetchUnavailable };
    }
  }

  async function testKey() {
    const { text } = await ask({ system: "Réponds en un mot.", content: "Dis OK.", maxTokens: 10 });
    return text;
  }

  window.API = { ask, askJSON, parseJSON, testKey };
})();
