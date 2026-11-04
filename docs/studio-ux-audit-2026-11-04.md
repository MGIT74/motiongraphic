# Audit UX Studio — chantier indépendant de la PR #31

Date : 2026-11-04. Base : `main` (lecture statique du code). Aucun test navigateur ni déploiement effectué.

## Périmètre
Audit de la bibliothèque Studio et du parcours de sélection, sans modifier les fichiers d'implémentation de la PR #31.

## Constats confirmés dans le code de main

1. **Découverte : pas de recherche ni de filtres dans la bibliothèque.** `src/components/studio/TemplateLibrary.tsx` parcourt directement `STUDIO_CATEGORIES` et filtre les entrées de `STUDIO_TEMPLATES` par catégorie. Avec une bibliothèque enrichie par Template Lab, la navigation deviendra difficile.
2. **Ajout au clic sans étape de prévisualisation dédiée.** `TemplateCard` appelle directement `onAdd` au clic. L'aperçu n'est animé qu'au survol/focus; les utilisateurs tactiles n'ont pas le même accès à la démonstration.
3. **Vignettes coûteuses si le catalogue grandit.** Chaque vignette instancie `ControlledAnimation`, y compris au repos; le rendu survol utilise `requestAnimationFrame`. Sur mobile ou avec de nombreux templates, mesurer les performances et privilégier vignettes statiques / rendu différé.
4. **Indications desktop/mobile différentes.** Le texte explique le glisser-déposer uniquement sur grand écran; l'ajout tactile se fait à la suite. Rendre explicite le placement et proposer une action accessible « Ajouter à la scène ».
5. **Compatibilité / échec de chargement peu visibles dans main.** `src/app/studio/page.tsx` exclut les templates `code` et retourne un catalogue intégré en cas d'erreur de chargement. La PR #31 change ce point; une fois intégrée, prévoir des états « compatible », « prévisualisation uniquement », « erreur » sans confusion.
6. **Accessibilité : carte = bouton glissable.** Vérifier navigation clavier, focus, aria et annonce après insertion; le drag-and-drop ne doit jamais être la seule voie d'accès.

## Recommandations priorisées (à implémenter après intégration de la PR #31)

### P0 — Parcours utilisateur
- Champ de recherche sur nom, catégorie et description, avec état « aucun résultat ».
- Filtres : Tous, Compatibles Studio, Prévisualisation uniquement; catégories.
- Action distincte « Prévisualiser » et « Ajouter » sur les cartes, compatible tactile/clavier.
- Retour explicite après ajout : nom, scène et position temporelle.
- État de chargement/erreur catalogue et explication des incompatibilités.

### P1 — Performance et édition
- Lazy-render des vignettes (IntersectionObserver ou pagination), et pause des animations hors écran.
- Compteur de templates et regroupement de catégories extensible.
- Aperçu agrandi avant insertion, paramètres de départ, durée et ratio.
- Vérifier le changement de template en conservant les paramètres compatibles et en avertissant des paramètres perdus.

### P2 — Qualité
- Raccourcis clavier documentés (lecture/pause, annuler/rétablir, zoom timeline), sans intercepter la saisie texte.
- Contrôles tactiles dimensionnés correctement et aide contextuelle concise.
- Tests E2E recherche/filtres, accessibilité clavier, insertion et performance avec 100 templates.

## Contraintes d'intégration
- Ne pas modifier `src/components/studio/TemplateLibrary.tsx`, `src/app/studio/page.tsx`, `src/components/studio/ControlledAnimation.tsx` pendant le travail d'OpenCode sur la PR #31.
- Réévaluer cet audit contre la version fusionnée de la PR #31 : les constats proviennent de `main` avant fusion et certains pourront déjà être résolus.
- Conserver les capacités calculées et les messages d'incompatibilité, ne pas activer les templates non déterministes par un simple bouton.
- Prévoir un PR UX distinct après revue du moteur et validation utilisateur.

## Validation requise
Audit navigateur desktop/tablette/mobile, parcours clavier, métriques de rendu avec 20/100 templates, tests E2E, typecheck/lint/build. Aucune de ces validations n'est prétendue exécutée ici.
