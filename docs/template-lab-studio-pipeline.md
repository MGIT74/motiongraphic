# Template Lab → Catalogue → Studio — architecture cible

## Objectif
L'administrateur colle du HTML/CSS/JS/SVG dans Template Lab, prévisualise, publie et retrouve le template dans le catalogue **et** dans le Studio, avec lecture, pause, seek, timeline et export MP4. Pas de commit GitHub pour chaque template.

## État existant
- `src/lib/templates/custom-model.ts`: sourceKind `component` (pilotable) et `code` (sandbox isolée).
- `src/lib/studio/template-registry.ts`: `registerCustomStudioTemplates` ignore les templates `code` (`if (!template.componentKey || !base) continue`).
- Le statut `published` ne signifie pas compatibilité timeline.
- Ne jamais injecter directement le code non fiable dans React/DOM principal ou le processus serveur.

## Contrat de lecture temporelle pour les templates code
Créer un runtime iframe sandboxé, origine opaque, sans accès cookies, stockage, réseau ni parent. Protocole postMessage à origine/source vérifiées et identifiant de session:
- `INIT`: templateId, version, dimensions, paramètres, durée
- `READY`: capacités et erreurs
- `SEEK`: temps absolu en secondes (doit être déterministe)
- `PLAY` / `PAUSE`: commandes de prévisualisation, le Studio reste maître du temps
- `RESIZE` / `SET_PARAMS`
- `FRAME_READY` et `ERROR`

Les animations CSS/JS libres utilisant setTimeout, Date.now, requestAnimationFrame ou des effets non déterministes ne sont **pas** automatiquement compatibles avec le seek/export. Prévoir un format de code « timeline-compatible » déclarant `renderAt(time, params)` ou `seek(time)`, une validation statique + tests navigateur, et un message d'incompatibilité explicite. Ne pas promettre un export MP4 sans preuve d'un pipeline de capture sûr.

## Catalogue unique
- Garder Template Lab comme éditeur; Templates comme catalogue; Studio comme consommateur.
- Source unique pour le statut de publication et métadonnées; ne pas dupliquer manuellement les entrées.
- `published` + `studioCompatible` + `exportCompatible` doivent être distingués.
- Afficher les templates publiés même si non pilotables, mais désactiver l'ajout Studio avec une raison visible.
- Gérer catégories, recherches, versions, dépublication et cache invalidation.
- Compatibilité avec templates intégrés existants et projets enregistrés.

## Sécurité
- Isolation iframe stricte, CSP restrictive, validation serveur, quotas de taille/temps et validation des messages.
- Aucun `eval`, import distant, fetch ou accès au parent.
- Ne jamais exécuter du code personnalisé dans Node/Chromium serveur sans isolation démontrée; pipeline d'export sécurisé séparé.
- Éviter les migrations destructives, ne pas toucher à la production avant CI + revue Claude.

## Tests d'acceptation
1. Ajouter un template code via Lab, preview fonctionnel.
2. Publier: apparaît automatiquement dans catalogue et Studio après rechargement.
3. Ajouter à une scène, jouer/pause/seek arbitraire, comparer images au même timestamp.
4. Modifier texte/couleurs/durée, enregistrer/recharger projet.
5. Exports 16:9, 9:16, 1:1 avec images comparées au navigateur; MP4 vérifié (ffprobe + durée + frames).
6. Dépublier: disparaît des nouvelles sélections, projets existants restent récupérables sans crash.
7. Tests sécurité iframe, RLS/admin, messages hostiles, payload invalide.
8. Régression sur templates intégrés, CI build/typecheck/e2e/template-check.

## Livraison
Développer sur cette branche en PR brouillon. Demander revue Claude pour les changements de moteur, Studio, API et sécurité. Fusion/déploiement seulement après tests et accord de validation fonctionnelle.

## Implémentation (réalisée, branche feat/template-lab-studio-pipeline)
- `src/lib/templates/capabilities.ts` — capacités calculées depuis le code : contrat + détection des sources de nondéterminisme (setTimeout/rAF/Date.now/Math.random/CSS animation) → `studioCompatible` / `exportCompatible` + raisons.
- `src/lib/templates/published-studio.ts` — source unique serveur : tous les templates publiés (composants + codes) au format registre, serveur Studio (/studio) et rendu (/render).
- `src/components/studio/sandbox-frame.tsx` — runtime sandbox : iframe `sandbox="allow-scripts"` + CSP (réseau interdit, `eval` neuté via calquage — l'attribut csp seul étant ignoré par Chromium), sessions validées, SEEK→FRAME_READY acquitté, quotas timeline(8)/aperçus(4), messages hostiles ignorés/comptés.
- Contrôles CI : `/dev/template-check` exerce les codes sandbox (déterminisme : seek(1.2) ×2 identiques, mouvement, formats 9:16/1:1) ; `/dev/sandbox-check` (tests/security) : bornes réseau/stockage/parent/eval + messages hostiles ; `/dev/render-stage` : export MP4 réel (tests/export) via le MÊME moteur que /render.
- Catalogue : `/studio` et `/render` relisent le store à chaque requête (`dynamic = "force-dynamic"`) — publication/dépublication visibles immédiatement, sans rebuild.
- Limites honnêtes : les codes SANS contrat restent visibles au catalogue avec l'ajout Studio désactivé (raison affichée) et l'export refuse le projet avec la liste des non-compatibles ; `document.write`/img/scripts distants neutralisés au calquage ; `eval` lexical direct reste possible DANS l'iframe (origine opaque, aucune issue vers le parent/réseau) mais est interdit en publication par le validateur.
