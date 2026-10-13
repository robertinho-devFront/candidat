/* Logique de l'application. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const { esc, arr } = Render;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const splitList = (s) => String(s || "").split(/[,;\n]/).map(x => x.trim()).filter(Boolean);

  /* ---------- UI helpers ---------- */
  const UI = window.UI = {
    toast(msg, isErr = false) {
      const t = $("#toast");
      t.textContent = msg; t.classList.toggle("err", isErr); t.classList.add("show");
      clearTimeout(UI._t); UI._t = setTimeout(() => t.classList.remove("show"), isErr ? 6000 : 3000);
    },
    status(el, msg, kind = "") { el.textContent = msg; el.className = "status " + kind; }
  };

  /* ---------- Navigation (hash) ---------- */
  const VIEWS = ["profile", "offer", "apps", "settings"];
  function route() {
    const [view, id, sub] = (location.hash.slice(1) || "").split("/");
    const v = VIEWS.includes(view) ? view : (view === "app" ? "apps" : (Store.profile ? "offer" : "profile"));
    VIEWS.forEach(n => {
      $(`#view-${n}`).hidden = n !== v;
      $(`#tab-${n}`).setAttribute("aria-selected", String(n === v));
    });
    if (v === "apps") {
      if (view === "app" && id && Store.getApp(id)) showDetail(id, sub || "analysis");
      else showList();
    }
    if (v === "settings") fillSettings();
    updateBanner();
    window.scrollTo({ top: 0 });
  }
  const go = (hash) => { if (location.hash === "#" + hash) route(); else location.hash = hash; };
  window.addEventListener("hashchange", route);
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-view],[data-goto]");
    if (t) { e.preventDefault(); go(t.dataset.view || t.dataset.goto); }
  });
  // Flèches clavier sur les onglets
  $(".tabs").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const tabs = $$(".tabs [role=tab]"); const i = tabs.indexOf(document.activeElement);
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    n.focus(); n.click();
  });

  function updateBanner() { $("#keyBanner").hidden = API.ready(); }

  /* ---------- Profil : repeaters ---------- */
  const REP = {
    experiences: [
      ["role", "Poste"], ["company", "Entreprise"], ["location", "Lieu"], ["start", "Début"], ["end", "Fin"],
      ["description", "Missions et réalisations (une par ligne)", "textarea"]
    ],
    education: [
      ["degree", "Diplôme / formation"], ["school", "École / organisme"], ["start", "Début"], ["end", "Fin"],
      ["details", "Détails", "textarea"]
    ]
  };
  function repItem(list, data = {}) {
    const div = document.createElement("div");
    div.className = "rep-item";
    div.innerHTML = `<button type="button" class="remove" aria-label="Supprimer">×</button><div class="grid-2">` +
      REP[list].map(([k, label, type]) => type === "textarea"
        ? `<label class="span-2">${label}<textarea data-k="${k}" rows="4">${esc(data[k])}</textarea></label>`
        : `<label>${label}<input data-k="${k}" value="${esc(data[k])}"></label>`).join("") + `</div>`;
    div.querySelector(".remove").onclick = () => div.remove();
    return div;
  }
  $$("[data-add]").forEach(b => b.onclick = () => {
    const box = $(`.repeater[data-list="${b.dataset.add}"] .rep-items`);
    const it = repItem(b.dataset.add); box.append(it); it.querySelector("input").focus();
  });

  const SIMPLE = ["name", "title", "email", "phone", "city", "linkedin", "website", "summary", "notes"];
  const LISTS = ["hardSkills", "softSkills", "languages", "certifications", "interests"];

  function fillProfile(p) {
    const f = $("#profileForm"); p = p || {};
    SIMPLE.forEach(k => f.elements[k].value = p[k] || "");
    LISTS.forEach(k => f.elements[k].value = arr(p[k]).join(", "));
    Object.keys(REP).forEach(list => {
      const box = $(`.repeater[data-list="${list}"] .rep-items`); box.innerHTML = "";
      const items = arr(p[list]);
      (items.length ? items : [{}]).forEach(d => box.append(repItem(list, d)));
    });
  }
  function readProfile() {
    const f = $("#profileForm"); const p = {};
    SIMPLE.forEach(k => p[k] = f.elements[k].value.trim());
    LISTS.forEach(k => p[k] = splitList(f.elements[k].value));
    Object.keys(REP).forEach(list => {
      p[list] = $$(`.repeater[data-list="${list}"] .rep-item`).map(it => {
        const o = {}; $$("[data-k]", it).forEach(i => o[i.dataset.k] = i.value.trim()); return o;
      }).filter(o => Object.values(o).some(Boolean));
    });
    p.updatedAt = new Date().toISOString();
    return p;
  }
  $("#profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = readProfile();
    if (!p.name) { UI.status($("#saveStatus"), "Ajoute au moins ton nom.", "err"); $("#profileForm").elements.name.focus(); return; }
    Store.setProfile(p);
    UI.status($("#saveStatus"), "Profil enregistré ✓", "ok");
    UI.toast("Profil enregistré. Passe à l'offre →");
  });

  /* ---------- Import CV ---------- */
  const dz = $("#dropzone"), fileIn = $("#cvFile");
  dz.addEventListener("click", () => fileIn.click());
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileIn.click(); } });
  ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) importCV(f); });
  fileIn.addEventListener("change", () => { if (fileIn.files[0]) importCV(fileIn.files[0]); fileIn.value = ""; });

  const toBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file);
  });

  async function importCV(file) {
    const st = $("#importStatus");
    if (file.size > 10 * 1024 * 1024) return UI.status(st, "Fichier trop lourd (10 Mo max).", "err");
    if (!API.ready()) return UI.status(st, "Ajoute d'abord ta clé API dans Réglages.", "err");
    dz.classList.add("busy");
    UI.status(st, `Lecture de « ${file.name} »…`);
    try {
      let content;
      const name = file.name.toLowerCase();
      if (name.endsWith(".pdf") || file.type === "application/pdf") {
        content = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: await toBase64(file) } },
          { type: "text", text: Prompts.importCV.instruction }
        ];
      } else if (name.endsWith(".docx")) {
        if (!window.mammoth) throw new Error("Lecteur DOCX non chargé (connexion ?)");
        const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        content = `CV :\n"""\n${value}\n"""\n\n${Prompts.importCV.instruction}`;
      } else {
        content = `CV :\n"""\n${await file.text()}\n"""\n\n${Prompts.importCV.instruction}`;
      }
      UI.status(st, "Analyse du CV en cours (jusqu’à 1 min)…");
      const { json } = await API.askJSON({ system: Prompts.importCV.system, content, maxTokens: 6000 });
      const p = {
        ...json,
        experiences: arr(json.experiences).map(e => ({ ...e, description: Array.isArray(e.description) ? e.description.join("\n") : e.description })),
        notes: Store.profile?.notes || ""
      };
      fillProfile(p);
      UI.status(st, "CV importé. Relis les champs, corrige, puis enregistre.", "ok");
      $("#profileForm").scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      console.error(e); UI.status(st, e.message, "err");
    } finally { dz.classList.remove("busy"); }
  }

  /* ---------- Réglages ---------- */
  function fillSettings() {
    const f = $("#settingsForm"), s = Store.settings;
    f.elements.apiKey.value = s.apiKey; f.elements.model.value = s.model; f.elements.webFetch.checked = !!s.webFetch;
    f.elements.geminiKey.value = s.geminiKey; f.elements.geminiModel.value = s.geminiModel;
    $$('[name=provider]', f).forEach(r => r.checked = r.value === s.provider);
    showProvider(s.provider);
  }
  function showProvider(p) { $$("#settingsForm [data-for]").forEach(d => d.hidden = d.dataset.for !== p); }
  $$('#settingsForm [name=provider]').forEach(r => r.onchange = () => showProvider(r.value));
  function readSettings() {
    const f = $("#settingsForm");
    return {
      provider: ($('[name=provider]:checked', f) || {}).value || "gemini",
      apiKey: f.elements.apiKey.value.trim(), model: f.elements.model.value,
      geminiKey: f.elements.geminiKey.value.trim(), geminiModel: f.elements.geminiModel.value.trim() || "gemini-flash-latest",
      webFetch: f.elements.webFetch.checked
    };
  }
  $("#settingsForm").addEventListener("submit", (e) => {
    e.preventDefault(); Store.setSettings(readSettings()); updateBanner();
    UI.status($("#settingsStatus"), "Enregistré ✓", "ok");
  });
  $("#testKey").onclick = async () => {
    Store.setSettings(readSettings()); updateBanner();
    const st = $("#settingsStatus"); UI.status(st, "Test en cours…");
    try {
      const models = await API.testKey();
      if (models && models.length) {
        $("#geminiModels").innerHTML = models.map(m => `<option value="${esc(m)}">`).join("");
        const cur = Store.settings.geminiModel;
        if (!models.includes(cur) && !/latest$/.test(cur)) UI.toast(`Le modèle « ${cur} » n'est pas dans ta liste : choisis-en un autre.`, true);
      }
      UI.status(st, "La clé fonctionne ✓", "ok");
    }
    catch (e) { UI.status(st, e.message, "err"); }
  };
  $("#exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(Store.exportData(), null, 2)], { type: "application/json" });
    download(blob, `atelier-candidature-${new Date().toISOString().slice(0, 10)}.json`);
    UI.status($("#backupStatus"), "Export téléchargé (sans la clé API).", "ok");
  };
  $("#importFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { Store.importData(JSON.parse(await f.text())); fillProfile(Store.profile); UI.status($("#backupStatus"), "Données importées ✓", "ok"); fillSettings(); updateBanner(); }
    catch (err) { UI.status($("#backupStatus"), "Import impossible : " + err.message, "err"); }
    e.target.value = "";
  };
  $("#wipeBtn").onclick = () => {
    if (confirm("Effacer le profil et toutes les candidatures de ce navigateur ? (La clé API est conservée.)")) {
      Store.wipe(); fillProfile(null); UI.status($("#backupStatus"), "Données effacées.", "ok");
    }
  };

  function download(blob, name) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- Génération ---------- */
  const setStep = (name, state) => { const li = $(`#genSteps [data-step="${name}"]`); li.className = state; };

  $("#offerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, st = $("#genStatus");
    const url = f.elements.url.value.trim(), text = f.elements.text.value.trim(), recruiterEmail = f.elements.recruiterEmail.value.trim();
    if (!API.ready()) { UI.status(st, "Ajoute ta clé API dans Réglages.", "err"); return; }
    if (!Store.profile) { UI.status(st, "Enregistre d'abord ton profil (étape 1).", "err"); return; }
    if (!url && !text) { UI.status(st, "Colle un lien ou le texte de l'offre.", "err"); f.elements.text.focus(); return; }
    if (text && text.length < 150) { UI.status(st, "Le texte semble trop court : colle l'annonce complète.", "err"); return; }

    const btn = $("#genBtn"); btn.disabled = true;
    $("#genSteps").hidden = false; ["analyse", "cv", "letter", "interview"].forEach(s => setStep(s, ""));
    UI.status(st, "C'est parti. Compte 1 à 2 minutes.");
    const profile = Store.profile;
    const app = { id: uid(), createdAt: new Date().toISOString(), status: "À envoyer", url, recruiterEmail };

    try {
      setStep("analyse", "run");
      const canFetch = !text && url && Store.settings.webFetch;
      const { json: analysis, webFetchUnavailable } = await API.askJSON({
        system: Prompts.analyse.system,
        content: Prompts.analyse.build({ profile, url, text, canFetch }),
        maxTokens: 6000, webFetch: canFetch
      });
      if (analysis.fetchOk === false || (!text && !analysis.jobText)) {
        setStep("analyse", "fail");
        const why = webFetchUnavailable ? "La lecture de liens n'est pas disponible avec ce moteur." : "Le site n'a pas laissé lire l'annonce.";
        UI.status(st, why + " Colle le texte de l'offre dans le champ et relance.", "err");
        f.elements.text.focus(); return;
      }
      if (text && !analysis.jobText) analysis.jobText = text;
      if (recruiterEmail) analysis.recruiterEmail = recruiterEmail;
      app.analysis = analysis;
      Store.upsertApp(app);
      setStep("analyse", "done");

      // Les trois livrables en parallèle
      const jobs = {
        cv: { p: Prompts.cv, max: 6000 },
        letter: { p: Prompts.letter, max: 3000 },
        interview: { p: Prompts.interview, max: 8000 }
      };
      Object.keys(jobs).forEach(k => setStep(k, "run"));
      const results = await Promise.allSettled(Object.entries(jobs).map(async ([k, j]) => {
        const { json } = await API.askJSON({ system: j.p.system, content: j.p.build({ profile, analysis }), maxTokens: j.max });
        app[k] = json; Store.upsertApp(app); setStep(k, "done");
      }));
      const failed = results.map((r, i) => r.status === "rejected" ? Object.keys(jobs)[i] : null).filter(Boolean);
      failed.forEach(k => setStep(k, "fail"));
      if (failed.length) UI.toast(`Certains livrables ont échoué (${failed.join(", ")}) : tu peux les relancer depuis la candidature.`, true);

      UI.status(st, "Candidature prête ✓", "ok");
      f.reset();
      go(`app/${app.id}/analysis`);
    } catch (err) {
      console.error(err);
      ["analyse", "cv", "letter", "interview"].forEach(s => { const li = $(`#genSteps [data-step="${s}"]`); if (li.className === "run") li.className = "fail"; });
      UI.status(st, err.message, "err");
    } finally { btn.disabled = false; }
  });

  async function regenerate(app, kind) {
    const p = Prompts[kind];
    const max = { cv: 6000, letter: 3000, interview: 8000 }[kind];
    UI.toast("Génération en cours…");
    try {
      const { json } = await API.askJSON({ system: p.system, content: p.build({ profile: Store.profile, analysis: app.analysis }), maxTokens: max });
      app[kind] = json; delete app[kind + "Html"]; if (kind === "interview") app.answers = {};
      Store.upsertApp(app); renderPanel(app, kind); UI.toast("C'est à jour ✓");
    } catch (e) { UI.toast(e.message, true); renderPanel(app, kind); }
  }

  /* ---------- Liste des candidatures ---------- */
  const STATUSES = ["À envoyer", "Envoyée", "Relancée", "Entretien", "Refus", "Offre reçue"];
  function showList() {
    $("#appsList").hidden = false; $("#appDetail").hidden = true;
    const ul = $("#appsUl"); const apps = Store.apps;
    $("#appsEmpty").hidden = apps.length > 0;
    ul.innerHTML = apps.map(a => `
      <li class="app-row">
        <button class="open" data-open="${a.id}">
          <span class="t">${esc(a.analysis?.title || "Offre")}</span><br>
          <span class="c">${esc(a.analysis?.company || "")} · ${new Date(a.createdAt).toLocaleDateString("fr-FR")} · ${a.analysis?.matchScore ?? "–"}% d'adéquation</span>
        </button>
        <div style="display:flex;gap:6px;align-items:center">
          <label class="sr-only" for="st-${a.id}">Statut</label>
          <select id="st-${a.id}" data-status="${a.id}">${STATUSES.map(s => `<option ${s === a.status ? "selected" : ""}>${s}</option>`).join("")}</select>
          <button class="btn ghost sm" data-del="${a.id}" aria-label="Supprimer cette candidature">×</button>
        </div>
      </li>`).join("");
    $$("[data-open]", ul).forEach(b => b.onclick = () => go(`app/${b.dataset.open}/analysis`));
    $$("[data-status]", ul).forEach(s => s.onchange = () => { const a = Store.getApp(s.dataset.status); a.status = s.value; Store.upsertApp(a); });
    $$("[data-del]", ul).forEach(b => b.onclick = () => { if (confirm("Supprimer cette candidature ?")) { Store.deleteApp(b.dataset.del); showList(); } });
  }
  $("#backToList").onclick = () => go("apps");

  /* ---------- Détail ---------- */
  function showDetail(id, sub) {
    const app = Store.getApp(id); const a = app.analysis || {};
    $("#appsList").hidden = true; $("#appDetail").hidden = false;
    $("#dCompany").textContent = a.company || "";
    $("#dTitle").textContent = a.title || "Offre";
    const url = Render.safeUrl(app.url);
    $("#dMeta").innerHTML = [a.location, a.contract, a.salary].filter(Boolean).map(esc).join(" · ") + (url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">Voir l'offre</a>` : "");
    const sc = Number(a.matchScore) || 0, scEl = $("#dScore");
    scEl.style.setProperty("--v", sc);
    scEl.style.setProperty("--sc", sc >= 70 ? "var(--ok)" : sc >= 45 ? "var(--ochre)" : "var(--bad)");
    scEl.innerHTML = `<span>${sc}%</span>`;
    scEl.setAttribute("aria-label", `Adéquation profil / offre : ${sc} %`);

    $$(".subtabs [data-sub]").forEach(b => {
      b.setAttribute("aria-selected", String(b.dataset.sub === sub));
      b.onclick = () => go(`app/${id}/${b.dataset.sub}`);
    });
    $$("#appDetail .sub").forEach(p => p.hidden = p.dataset.panel !== sub);
    renderPanel(app, sub);
  }

  function missing(app, kind, label) {
    return `<div class="card"><p>${label} n'a pas pu être généré.</p><button class="btn primary" data-regen="${kind}">Générer</button></div>`;
  }

  function renderPanel(app, kind) {
    const el = $(`#appDetail [data-panel="${kind}"]`);
    if (kind === "analysis") { el.innerHTML = Render.analysis(app.analysis || {}); return; }
    if (kind === "cv") {
      if (!app.cv) { el.innerHTML = missing(app, "cv", "Le CV"); }
      else {
        const kw = app.cv.coveredKeywords;
        el.innerHTML = `
          <div class="toolbar">
            <button class="btn primary" data-print="cv">Télécharger en PDF</button>
            <button class="btn ghost" data-edit="cv" aria-pressed="false">Modifier</button>
            <button class="btn ghost" data-copy="cv">Copier le texte</button>
            <button class="btn ghost" data-regen="cv">Régénérer</button>
          </div>
          <div class="doc" id="doc-cv">${app.cvHtml || Render.cv(app.cv)}</div>
          ${arr(app.cv.changes).length ? `<details style="margin-top:14px"><summary>Ce qui a été adapté pour cette offre</summary>${Render.bullets(app.cv.changes)}</details>` : ""}
          ${arr(kw).length ? `<details><summary>Mots-clés de l'offre couverts (${arr(kw).length}/${arr(app.analysis?.keywords).length})</summary>${Render.chips(kw, "good")}</details>` : ""}`;
      }
    }
    if (kind === "letter") {
      if (!app.letter) { el.innerHTML = missing(app, "letter", "La lettre"); }
      else {
        const to = app.recruiterEmail || app.analysis?.recruiterEmail || "";
        const l = app.letter;
        el.innerHTML = `
          <div class="toolbar">
            <button class="btn primary" data-print="letter">Télécharger en PDF</button>
            <button class="btn ghost" data-edit="letter" aria-pressed="false">Modifier</button>
            <button class="btn ghost" data-copy="letter">Copier le texte</button>
            <button class="btn ghost" data-regen="letter">Régénérer</button>
          </div>
          <div class="doc" id="doc-letter">${app.letterHtml || Render.letter(l, Store.profile, app.analysis)}</div>
          ${l.emailBody ? `<div class="card" style="margin-top:20px">
            <h2>E-mail d'envoi</h2>
            <p><strong>${esc(l.emailSubject)}</strong></p>
            <p style="white-space:pre-wrap">${esc(l.emailBody)}</p>
            <div class="toolbar">
              <a class="btn primary" href="mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(l.emailSubject || "")}&body=${encodeURIComponent(l.emailBody || "")}">Ouvrir dans ma messagerie${to ? " → " + esc(to) : ""}</a>
            </div>
            <p class="hint">Pense à joindre le CV et la lettre en PDF : un lien mailto ne peut pas ajouter de pièce jointe.</p>
          </div>` : ""}`;
      }
    }
    if (kind === "interview") {
      if (!app.interview) { el.innerHTML = missing(app, "interview", "La préparation d'entretien"); }
      else renderInterview(app, el);
    }
    bindDocTools(app, el);
  }

  function bindDocTools(app, el) {
    $$("[data-regen]", el).forEach(b => b.onclick = () => { b.disabled = true; regenerate(app, b.dataset.regen); });
    $$("[data-print]", el).forEach(b => b.onclick = () => printDoc(app, b.dataset.print));
    $$("[data-copy]", el).forEach(b => b.onclick = async () => {
      const k = b.dataset.copy, doc = $(`#doc-${k}`);
      const txt = app[k + "Html"] ? doc.innerText : (k === "cv" ? Render.cvText(app.cv) : Render.letterText(app.letter, Store.profile));
      try { await navigator.clipboard.writeText(txt); UI.toast("Copié ✓"); } catch { UI.toast("Copie impossible", true); }
    });
    $$("[data-edit]", el).forEach(b => b.onclick = () => {
      const k = b.dataset.edit, doc = $(`#doc-${k}`);
      const on = doc.getAttribute("contenteditable") !== "true";
      doc.setAttribute("contenteditable", String(on)); b.setAttribute("aria-pressed", String(on));
      b.textContent = on ? "Enregistrer les modifications" : "Modifier";
      if (on) { doc.focus(); UI.toast("Clique dans le document pour corriger le texte."); }
      else { app[k + "Html"] = doc.innerHTML; Store.upsertApp(app); UI.toast("Modifications enregistrées ✓"); }
    });
  }

  function printDoc(app, kind) {
    const doc = $(`#doc-${kind}`);
    const area = $("#printArea");
    area.innerHTML = `<div class="doc">${doc.innerHTML}</div>`;
    const old = document.title;
    const who = (Store.profile?.name || "").trim();
    document.title = `${kind === "cv" ? "CV" : "Lettre de motivation"} - ${who} - ${app.analysis?.company || ""}`.replace(/\s+-\s*$/, "");
    const done = () => { document.title = old; area.innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
    UI.toast("Dans la fenêtre d'impression, choisis « Enregistrer au format PDF ».");
  }

  /* ---------- Entretien ---------- */
  function renderInterview(app, el, idx = app._q || 0) {
    const iv = app.interview, qs = arr(iv.questions);
    app.answers = app.answers || {};
    const q = qs[idx] || {};
    const ans = app.answers[idx] || {};
    el.innerHTML = `
      <details ${idx === 0 && !ans.text ? "open" : ""}><summary>Ton pitch « Présentez-vous »</summary><p style="white-space:pre-wrap">${esc(iv.pitch)}</p></details>
      <div class="card">
        <nav class="q-nav" aria-label="Questions">${qs.map((_, i) => `<button data-q="${i}" aria-current="${i === idx}" class="${app.answers[i]?.feedback ? "scored" : ""}" aria-label="Question ${i + 1}">${i + 1}</button>`).join("")}</nav>
        <span class="q-cat">${esc(q.category)}</span>
        <p class="q-text">${esc(q.question)}</p>
        <label>Ta réponse <small>(écris ou dicte, comme à l'oral)</small>
          <textarea id="qAnswer" rows="6" placeholder="Réponds comme si le recruteur était en face de toi…">${esc(ans.text)}</textarea>
        </label>
        <div class="toolbar">
          <button class="btn primary" id="evalBtn">Évaluer ma réponse</button>
          ${("webkitSpeechRecognition" in window || "SpeechRecognition" in window) ? `<button class="btn ghost mic" id="micBtn" aria-pressed="false">🎙 Dicter</button>` : ""}
          <button class="btn ghost" id="nextQ">${idx < qs.length - 1 ? "Question suivante →" : "Revenir au début"}</button>
        </div>
        <div id="fb">${ans.feedback ? feedbackHtml(ans.feedback) : ""}</div>
        <details><summary>Ce que le recruteur vérifie</summary><p>${esc(q.intent)}</p>${Render.bullets(q.tips)}</details>
        <details><summary>Trame de réponse conseillée</summary><p style="white-space:pre-wrap">${esc(q.outline)}</p></details>
      </div>
      <div class="cols">
        <div class="card"><h3>Questions à poser au recruteur</h3>${Render.bullets(iv.questionsToAsk)}</div>
        <div class="card"><h3>À vérifier avant l'entretien</h3>${Render.bullets(iv.research)}</div>
      </div>
      <div class="toolbar"><button class="btn ghost sm" data-regen="interview">Nouvelles questions</button></div>`;

    const ta = $("#qAnswer", el);
    ta.oninput = () => { app.answers[idx] = { ...(app.answers[idx] || {}), text: ta.value }; Store.upsertApp(app); };
    $$("[data-q]", el).forEach(b => b.onclick = () => { app._q = +b.dataset.q; renderInterview(app, el, app._q); bindDocTools(app, el); });
    $("#nextQ", el).onclick = () => { app._q = idx < qs.length - 1 ? idx + 1 : 0; renderInterview(app, el, app._q); bindDocTools(app, el); $(".q-text", el).scrollIntoView({ behavior: "smooth", block: "center" }); };
    $("#evalBtn", el).onclick = async (e) => {
      const answer = ta.value.trim();
      if (answer.length < 30) { UI.toast("Développe un peu plus ta réponse avant l'évaluation.", true); ta.focus(); return; }
      e.target.disabled = true; e.target.textContent = "Évaluation…";
      try {
        const { json } = await API.askJSON({ system: Prompts.evaluate.system, content: Prompts.evaluate.build({ analysis: app.analysis, question: q, answer, profile: Store.profile }), maxTokens: 2000 });
        app.answers[idx] = { text: answer, feedback: json }; Store.upsertApp(app);
        $("#fb", el).innerHTML = feedbackHtml(json);
        $(`[data-q="${idx}"]`, el).classList.add("scored");
      } catch (err) { UI.toast(err.message, true); }
      finally { e.target.disabled = false; e.target.textContent = "Évaluer ma réponse"; }
    };
    const mic = $("#micBtn", el);
    if (mic) setupMic(mic, ta);
  }

  function feedbackHtml(f) {
    const s = Number(f.score) || 0;
    const color = s >= 7 ? "var(--ok)" : s >= 5 ? "var(--warn)" : "var(--bad)";
    return `<div class="feedback">
      <p><span class="fb-score" style="color:${color}">${s}/10</span> — ${esc(f.verdict)}</p>
      <div class="cols">
        <div><h3>Ce qui marche</h3>${Render.bullets(f.strengths)}</div>
        <div><h3>À améliorer</h3>${Render.bullets(f.improvements)}</div>
      </div>
      <div class="callout"><strong>Version plus forte :</strong><br>${esc(f.betterAnswer)}</div>
      ${f.followUp ? `<p><strong>Relance probable :</strong> ${esc(f.followUp)}</p>` : ""}
    </div>`;
  }

  function setupMic(btn, ta) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR(); rec.lang = "fr-FR"; rec.continuous = true; rec.interimResults = false;
    let on = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) ta.value += (ta.value && !/\s$/.test(ta.value) ? " " : "") + e.results[i][0].transcript.trim();
      ta.dispatchEvent(new Event("input"));
    };
    rec.onend = () => { on = false; btn.classList.remove("rec"); btn.setAttribute("aria-pressed", "false"); btn.textContent = "🎙 Dicter"; };
    rec.onerror = (e) => UI.toast("Micro : " + e.error, true);
    btn.onclick = () => {
      if (on) { rec.stop(); return; }
      try { rec.start(); on = true; btn.classList.add("rec"); btn.setAttribute("aria-pressed", "true"); btn.textContent = "■ Arrêter"; } catch (e) { UI.toast("Micro indisponible", true); }
    };
  }

  /* ---------- Démarrage ---------- */
  fillProfile(Store.profile);
  route();
})();
