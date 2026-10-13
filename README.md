# Atelier Candidature

Outil personnel de candidature. Tu enregistres ton profil une fois (en déposant ton CV ou en remplissant les champs), puis pour chaque offre (lien ou texte) tu obtiens :

- **une analyse** de l'offre et ton taux d'adéquation (atouts, écarts, mots-clés ATS) ;
- **un CV ciblé**, une page, optimisé ATS, exportable en PDF ;
- **une lettre de motivation** + l'e-mail d'envoi prêt à partir ;
- **un entraînement d'entretien** : 10 questions probables, ta réponse (écrite ou dictée), une note et une version améliorée.

Site 100 % statique (HTML/CSS/JS, aucune installation). Les textes sont générés par **Google Gemini (clé gratuite)** ou par **Claude (payant à l'usage)**, avec ta propre clé.

---

## Mise en ligne sur GitHub Pages

```bash
git init
git add .
git commit -m "Atelier Candidature v1"
git branch -M main
git remote add origin https://github.com/<ton-compte>/candidat.git
git push -u origin main
```

Puis sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch → `main` / `/ (root)`**.
Le site est en ligne quelques minutes plus tard sur `https://<ton-compte>.github.io/candidat/`.

## Premier lancement

1. **Réglages** → choisis le moteur :
   - **Gemini (gratuit)** : crée une clé sur https://aistudio.google.com/app/apikey → *Create API key*. Colle-la, clique *Tester la clé* (la liste de tes modèles se charge), puis *Enregistrer*.
   - **Claude (payant)** : clé sur https://console.anthropic.com/settings/keys, avec des crédits prépayés.
2. **Profil** → glisse ton CV (PDF, DOCX ou TXT). Relis les champs, corrige, *Enregistrer*.
3. **Offre** → colle le lien et/ou le texte de l'annonce → *Générer ma candidature*.
4. **Candidatures** → CV, lettre, entretien. *Télécharger en PDF* ouvre l'impression : choisis « Enregistrer au format PDF ».

## Où sont mes données ?

- Profil, candidatures et clé API restent **dans ton navigateur** (localStorage). Rien n'est stocké sur GitHub.
- Le CV et les offres sont envoyés uniquement au moteur choisi (Google Gemini ou Anthropic), pour la génération.
- **Changer d'ordinateur** : Réglages → *Exporter mes données* (fichier .json, sans la clé), puis *Importer* sur l'autre machine.
- Ne commite jamais ta clé API ni ton export .json (le `.gitignore` exclut les fichiers `atelier-candidature-*.json`).

## Bon à savoir

- **Liens d'offres** : la lecture automatique passe par l'outil de lecture d'URL du moteur. LinkedIn et parfois Indeed bloquent les robots : colle alors le texte de l'annonce, c'est le plus fiable (et le résultat est meilleur).
- **Coût** : environ 4 à 5 appels par offre. Avec Gemini c'est gratuit dans la limite du quota ; si tu vois « quota atteint », attends une minute (ou le lendemain pour le quota journalier), ou passe sur un modèle *flash-lite*.
- **Confidentialité Gemini gratuit** : sur l'offre gratuite, Google peut utiliser les contenus envoyés (ton CV, les offres) pour améliorer ses produits. Évite d'y mettre des infos sensibles (n° de sécu, adresse complète…).
- **Dictée** : le bouton micro de l'entretien fonctionne dans Chrome et Edge.
- **Le site est public** (l'URL GitHub Pages), mais il est vide pour quiconque n'a pas ta clé ni tes données. Il est marqué `noindex`.

## Tester en local

Ouvre `index.html` directement, ou :

```bash
npx serve .
# ou
python3 -m http.server 8000
```

## Personnaliser

| Fichier | Rôle |
|---|---|
| `js/prompts.js` | Tous les prompts : ton de la lettre, structure du CV, nombre de questions… |
| `js/render.js` | Mise en page du CV et de la lettre |
| `css/style.css` | Couleurs (variables en haut du fichier) et styles d'impression |
| `js/app.js` | Logique de l'interface |
| `js/api.js` | Appels aux API Gemini et Claude |
| `js/store.js` | Stockage local, export / import |

Les modèles proposés se changent dans `index.html` (liste *Modèle*) si de nouveaux identifiants sortent.
