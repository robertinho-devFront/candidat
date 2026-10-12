/* Rendu HTML des livrables. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const arr = (a) => Array.isArray(a) ? a.filter(Boolean) : [];
  const chips = (list, cls = "") => arr(list).length ? `<ul class="chips ${cls}">${arr(list).map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="empty">—</p>`;
  const bullets = (list) => arr(list).length ? `<ul class="clean">${arr(list).map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  const safeUrl = (u) => /^https?:\/\//i.test(u || "") ? u : "";

  function analysis(a) {
    return `
      <div class="card">
        <p class="lead">${esc(a.summary)}</p>
        ${a.angle ? `<div class="callout"><strong>Angle conseillé.</strong> ${esc(a.angle)}</div>` : ""}
        <div class="cols">
          <div><h3>Tes atouts pour ce poste</h3>${chips(a.strengths, "good")}</div>
          <div><h3>Écarts à préparer</h3>${chips(a.gaps, "gap")}</div>
        </div>
        <h3>Mots-clés ATS de l'offre</h3>${chips(a.keywords)}
        <div class="cols">
          <div><h3>Missions</h3>${bullets(a.missions)}</div>
          <div><h3>Compétences demandées</h3>${bullets([...arr(a.hardSkills), ...arr(a.softSkills)])}</div>
        </div>
        ${a.companyInsights ? `<h3>Lecture de l'entreprise</h3><p>${esc(a.companyInsights)}</p>` : ""}
      </div>
      <details><summary>Texte de l'offre</summary><p style="white-space:pre-wrap">${esc(a.jobText)}</p></details>`;
  }

  function cv(c) {
    const ct = c.contact || {};
    const contact = [ct.email, ct.phone, ct.city, ct.linkedin, ct.website].filter(Boolean).map(esc).join(" · ");
    const exp = arr(c.experiences).map(e => `
      <div class="item">
        <div class="item-head"><span><strong>${esc(e.role)}</strong> — <span class="item-sub">${esc(e.company)}${e.location ? ", " + esc(e.location) : ""}</span></span><span class="period">${esc(e.period)}</span></div>
        ${arr(e.bullets).length ? `<ul>${arr(e.bullets).map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      </div>`).join("");
    const edu = arr(c.education).map(e => `
      <div class="item">
        <div class="item-head"><span><strong>${esc(e.degree)}</strong> — <span class="item-sub">${esc(e.school)}</span></span><span class="period">${esc(e.period)}</span></div>
        ${e.details ? `<p>${esc(e.details)}</p>` : ""}
      </div>`).join("");
    const skills = arr(c.skills).map(s => `<p class="skill-row"><strong>${esc(s.group)} :</strong> ${arr(s.items).map(esc).join(", ")}</p>`).join("");
    const extra = [
      arr(c.languages).length ? `<p><strong>Langues :</strong> ${arr(c.languages).map(esc).join(", ")}</p>` : "",
      arr(c.certifications).length ? `<p><strong>Certifications :</strong> ${arr(c.certifications).map(esc).join(", ")}</p>` : "",
      arr(c.interests).length ? `<p><strong>Centres d'intérêt :</strong> ${arr(c.interests).map(esc).join(", ")}</p>` : ""
    ].join("");
    return `<article class="cv">
      <h1>${esc(c.name)}</h1>
      <p class="cv-title">${esc(c.title)}</p>
      <p class="cv-contact">${contact}</p>
      ${c.summary ? `<h2>Profil</h2><p>${esc(c.summary)}</p>` : ""}
      ${exp ? `<h2>Expériences</h2>${exp}` : ""}
      ${skills ? `<h2>Compétences</h2>${skills}` : ""}
      ${edu ? `<h2>Formation</h2>${edu}` : ""}
      ${extra ? `<h2>Complément</h2>${extra}` : ""}
    </article>`;
  }

  function letter(l, profile, analysisData) {
    const p = profile || {};
    const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const from = [p.name, p.city, p.email, p.phone].filter(Boolean).map(esc).join("<br>");
    const to = [analysisData?.company, analysisData?.location].filter(Boolean).map(esc).join("<br>");
    return `<article class="letter">
      <div class="from">${from}</div>
      ${to ? `<div class="from" style="text-align:right">${to}</div>` : ""}
      <p style="text-align:right">${esc(p.city ? p.city + ", le " : "Le ")}${date}</p>
      <p class="subject">${esc(l.subject)}</p>
      <p>${esc(l.greeting)}</p>
      ${arr(l.paragraphs).map(x => `<p>${esc(x)}</p>`).join("")}
      <p>${esc(l.closing)}</p>
      <p>${esc(p.name)}</p>
    </article>`;
  }

  function letterText(l, profile) {
    return [l.subject, "", l.greeting, "", ...arr(l.paragraphs).flatMap(x => [x, ""]), l.closing, "", profile?.name || ""].join("\n");
  }

  function cvText(c) {
    const ct = c.contact || {};
    const out = [c.name, c.title, [ct.email, ct.phone, ct.city, ct.linkedin, ct.website].filter(Boolean).join(" | "), ""];
    if (c.summary) out.push("PROFIL", c.summary, "");
    if (arr(c.experiences).length) { out.push("EXPÉRIENCES"); arr(c.experiences).forEach(e => { out.push(`${e.role} — ${e.company}${e.location ? ", " + e.location : ""} (${e.period})`); arr(e.bullets).forEach(b => out.push("• " + b)); out.push(""); }); }
    if (arr(c.skills).length) { out.push("COMPÉTENCES"); arr(c.skills).forEach(s => out.push(`${s.group} : ${arr(s.items).join(", ")}`)); out.push(""); }
    if (arr(c.education).length) { out.push("FORMATION"); arr(c.education).forEach(e => out.push(`${e.degree} — ${e.school} (${e.period})${e.details ? " : " + e.details : ""}`)); out.push(""); }
    if (arr(c.languages).length) out.push("Langues : " + arr(c.languages).join(", "));
    if (arr(c.certifications).length) out.push("Certifications : " + arr(c.certifications).join(", "));
    if (arr(c.interests).length) out.push("Centres d'intérêt : " + arr(c.interests).join(", "));
    return out.join("\n");
  }

  window.Render = { esc, arr, chips, bullets, safeUrl, analysis, cv, letter, letterText, cvText };
})();
