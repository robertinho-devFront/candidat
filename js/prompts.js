/* Prompts. Modifie-les ici pour changer le ton ou la structure des livrables. */
(function () {
  const RULE_TRUTH = `Règle absolue : n'invente JAMAIS d'expérience, de diplôme, d'employeur, de chiffre ou de compétence absente du profil. Tu peux reformuler, réordonner, mettre en valeur et utiliser le vocabulaire de l'offre quand il correspond à une réalité du profil. Si un manque existe, ne le masque pas par un mensonge.`;

  const P = {};

  P.importCV = {
    system: `Tu es un expert en recrutement. Tu extrais fidèlement les informations d'un CV vers un JSON structuré. Tu ne complètes rien que le CV ne dit pas. Réponds uniquement en JSON valide, en français.`,
    instruction: `Extrais ce CV vers ce format JSON exact :
{
  "name": "", "title": "", "email": "", "phone": "", "city": "", "linkedin": "", "website": "",
  "summary": "",
  "experiences": [{ "role": "", "company": "", "location": "", "start": "", "end": "", "description": "" }],
  "education": [{ "degree": "", "school": "", "start": "", "end": "", "details": "" }],
  "hardSkills": [""], "softSkills": [""], "languages": [""], "certifications": [""], "interests": [""]
}
- "description" : réalisations et missions, une par ligne (séparées par \\n).
- Dates au format lisible ("mars 2021", "2019", "aujourd'hui").
- Champ inconnu = chaîne vide ou tableau vide.`
  };

  P.analyse = {
    system: `Tu es un recruteur senior et coach carrière en France. Tu analyses une offre d'emploi et la compares honnêtement à un profil candidat. Réponds uniquement en JSON valide, en français.`,
    build({ profile, url, text, canFetch }) {
      const source = text
        ? `TEXTE DE L'OFFRE :\n"""\n${text}\n"""` + (url ? `\n(Lien d'origine : ${url})` : "")
        : canFetch
          ? `L'offre se trouve à cette adresse : ${url}\nUtilise l'outil web_fetch pour la lire. Si la page est inaccessible, bloquée ou ne contient pas l'annonce, mets "fetchOk": false.`
          : `Lien fourni : ${url}\nTu ne peux pas lire ce lien. Mets "fetchOk": false et laisse les champs vides.`;
      return `${source}

PROFIL DU CANDIDAT (JSON) :
${JSON.stringify(profile)}

Rends ce JSON :
{
  "fetchOk": true,
  "title": "intitulé du poste", "company": "", "location": "", "contract": "CDI/CDD/freelance…", "salary": "",
  "recruiterEmail": "si présent dans l'offre",
  "jobText": "le texte complet et nettoyé de l'annonce (missions, profil, avantages)",
  "summary": "le poste en 2 phrases",
  "missions": [""], "hardSkills": [""], "softSkills": [""],
  "keywords": ["10 à 15 mots-clés ATS exacts de l'offre"],
  "matchScore": 0,
  "strengths": ["points du profil qui collent, concrets"],
  "gaps": ["exigences de l'offre absentes ou faibles dans le profil"],
  "angle": "l'angle de candidature le plus convaincant, en 2-3 phrases",
  "companyInsights": "ce qu'on peut déduire de la culture / des enjeux de l'entreprise"
}
matchScore : 0-100, sois exigeant et réaliste.`;
    }
  };

  P.cv = {
    system: `Tu es un expert CV en France, spécialiste des CV optimisés ATS. ${RULE_TRUTH} Réponds uniquement en JSON valide, en français.`,
    build({ profile, analysis }) {
      return `OFFRE ANALYSÉE :
${JSON.stringify(analysis)}

PROFIL COMPLET :
${JSON.stringify(profile)}

Construis un CV d'une page ciblé pour cette offre :
- Titre aligné sur l'intitulé du poste (si cohérent avec le profil).
- Résumé de 3 lignes max, orienté valeur pour CE poste, avec 2-3 mots-clés de l'offre.
- Expériences : les plus pertinentes en premier, 3 à 5 puces chacune, verbe d'action + résultat. Garde les vraies dates. Raccourcis les expériences peu pertinentes.
- Compétences regroupées par thème, mots-clés de l'offre en priorité (seulement s'ils sont vrais).
- Ne mets pas d'âge, photo, situation familiale.

Format JSON :
{
  "name": "", "title": "",
  "contact": { "email": "", "phone": "", "city": "", "linkedin": "", "website": "" },
  "summary": "",
  "experiences": [{ "role": "", "company": "", "location": "", "period": "", "bullets": [""] }],
  "education": [{ "degree": "", "school": "", "period": "", "details": "" }],
  "skills": [{ "group": "", "items": [""] }],
  "languages": [""], "certifications": [""], "interests": [""],
  "coveredKeywords": ["mots-clés de l'offre présents dans ce CV"],
  "changes": ["ce que tu as adapté par rapport au profil, en 3-5 points"]
}`;
    }
  };

  P.letter = {
    system: `Tu écris des lettres de motivation françaises qui sonnent humain : phrases courtes, concrètes, sans formules creuses ("je me permets", "dynamique et motivé", "votre entreprise leader"). ${RULE_TRUTH} Réponds uniquement en JSON valide.`,
    build({ profile, analysis }) {
      return `OFFRE :
${JSON.stringify(analysis)}

PROFIL :
${JSON.stringify(profile)}

Écris une lettre de 250 à 350 mots, structure "Vous / Moi / Nous" :
1. Accroche sur un enjeu réel de l'entreprise ou du poste (pas sur moi).
2. 2 preuves concrètes tirées du profil qui répondent aux missions.
3. Ce que je viens construire avec eux + appel à un échange.
Formule de politesse sobre.

Rends aussi un e-mail d'accompagnement court (80 mots max) pour envoyer la candidature.

JSON :
{
  "subject": "Objet : Candidature – [poste]",
  "greeting": "Madame, Monsieur," ,
  "paragraphs": ["", "", ""],
  "closing": "",
  "emailSubject": "", "emailBody": ""
}`;
    }
  };

  P.interview = {
    system: `Tu es un recruteur expérimenté qui prépare un candidat à un entretien réel en France. Questions précises, liées à l'offre ET au parcours du candidat (y compris ses points faibles). Réponds uniquement en JSON valide, en français.`,
    build({ profile, analysis }) {
      return `OFFRE :
${JSON.stringify(analysis)}

PROFIL :
${JSON.stringify(profile)}

Prépare 10 questions probables, dans l'ordre d'un vrai entretien :
- 1 ouverture ("présentez-vous" adapté), 3 motivation/entreprise, 3 techniques ou cas pratiques liés aux missions,
  2 comportementales (méthode STAR), 1 question piège sur un point faible du profil (trou, reconversion, compétence manquante…).

JSON :
{
  "pitch": "un pitch 'présentez-vous' de 60-90 secondes rédigé pour ce poste",
  "questions": [{
    "category": "Ouverture|Motivation|Technique|Comportementale|Piège",
    "question": "",
    "intent": "ce que le recruteur cherche vraiment à vérifier",
    "tips": ["2-3 conseils"],
    "outline": "trame de réponse idéale, basée sur le vrai parcours du candidat"
  }],
  "questionsToAsk": ["4 questions intelligentes à poser au recruteur"],
  "research": ["3 choses à vérifier sur l'entreprise avant l'entretien"]
}`;
    }
  };

  P.evaluate = {
    system: `Tu es un recruteur bienveillant mais exigeant. Tu évalues une réponse d'entretien. Feedback concret, actionnable. Réponds uniquement en JSON valide, en français.`,
    build({ analysis, question, answer, profile }) {
      return `Poste : ${analysis.title} chez ${analysis.company}
Question : ${question.question}
Ce que le recruteur cherche : ${question.intent}

Réponse du candidat :
"""
${answer}
"""

Profil (pour proposer une meilleure réponse véridique) :
${JSON.stringify(profile)}

JSON :
{
  "score": 0,
  "verdict": "une phrase",
  "strengths": [""],
  "improvements": [""],
  "betterAnswer": "une version améliorée, à l'oral, 120 mots max, fidèle au profil",
  "followUp": "la question de relance qu'un recruteur poserait ensuite"
}
score sur 10.`;
    }
  };

  window.Prompts = P;
})();
