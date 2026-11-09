# Travailler à plusieurs IA sur MotionGraphic.si

Ce dépôt est modifié par plusieurs assistants (Claude, ChatGPT/Codex) pour le
même propriétaire. Ces règles évitent qu'ils se marchent dessus. **À lire avant
toute modification.**

## 1. Règles de travail

1. **Jamais de commit direct sur `main`.** Une branche par tâche
   (`feat/…`, `fix/…`, `docs/…`), puis une pull request vers `main`.
2. **Partir de `main` à jour** (`git pull origin main`) juste avant de créer la
   branche, et refaire un `git pull --rebase origin main` avant d'ouvrir la PR.
3. **La CI doit être verte** (`.github/workflows/ci.yml` : lint, types, build,
   tests navigateur). Avant d'ouvrir la PR, lancer en local :
   ```bash
   npm ci
   npm run lint
   npx next typegen && npm run typecheck
   CONSTRUCTION_MODE=off npm run build
   CONSTRUCTION_MODE=off npm start -- -p 3000 &   # puis :
   BASE_URL=http://localhost:3000 npm run test:e2e
   ```
4. **Petites PR, une seule zone** (voir § 2). Décrire dans la PR : quoi,
   pourquoi, comment c'est vérifié.
5. **Ne jamais committer de secret** (clés Supabase, `MCP_ACCESS_TOKEN`,
   tokens GitHub, URL de déploiement xCloud). Les variables sont listées dans
   `.env.example` ; les valeurs vivent dans xCloud.
6. **Base de données** : jamais de modification directe en production.
   Toute évolution = une nouvelle migration numérotée
   (`supabase/migrations/0007_….sql`), ré-exécutable (`if not exists`,
   `drop … if exists`), testée sur un Postgres neuf **et** sur une base qui a
   déjà les migrations précédentes. Le propriétaire l'applique lui-même.
7. **Ne pas casser les contrats partagés** sans le signaler dans la PR :
   le modèle de projet (`src/lib/studio/project-model.ts`), les outils MCP
   (`src/lib/studio/mcp-server.ts`), le format `AnimationConfig`
   (`src/types/animation.ts`), les builders GSAP (`src/lib/animations/builders.ts`).
8. **Mettre à jour ce fichier** (§ 3 « En cours ») au début et à la fin d'une
   tâche, dans la même PR.

## 2. Zones et responsables

| Zone | Fichiers | Responsable |
| --- | --- | --- |
| Studio (éditeur, timeline, calques, marque) | `src/components/studio/`, `src/lib/studio/` (sauf `mcp-server.ts`) | Claude |
| Serveur MCP | `src/lib/studio/mcp-server.ts`, `src/app/api/mcp/` | Claude |
| Rendu vidéo MP4 | `src/lib/render/`, `src/app/render/`, `src/app/api/studio/render/` | Claude |
| Médias du Studio | `src/lib/media/`, `src/app/api/studio/media/` | Claude |
| Site public (accueil, galerie, fiches, catégories) | `src/app/page.tsx`, `src/app/explore/`, `src/app/templates/`, `src/components/gallery/`, `src/components/layout/`, `src/components/templates/` | ChatGPT |
| Favoris (UI) | nouveaux composants + `src/lib/data.ts` | ChatGPT |
| Sécurité Supabase (RLS, migrations) | `supabase/migrations/` | ChatGPT (revue par Claude) |
| Administration / Template Lab | `src/app/admin/`, `src/components/admin/`, `src/lib/templates/` | à attribuer |
| Templates d'animation | `src/components/animations/`, `src/lib/animations/`, registres (voir § 5) | ChatGPT (revue par Claude) |
| Documentation | `README.md`, `docs/` | tous (petites PR) |

Une modification hors de sa zone est possible si elle est minime et signalée
dans la PR (« touche aussi : … »).

## 3. En cours

- [OpenCode] `feat/template-lab-studio-pipeline` (PR #31) — **réalisé** : capacités timeline/MP4 calculées (contrat `__MGS_TIMELINE__ = { duration, outAt, renderAt(time, params) }`), runtime sandbox déterministe (SEEK/FRAME_READY, sessions, CSP, quotas, neutralisation réseau/eval/img), catalogue Studio unifié (`/studio` + `/render` relisent le store à chaque requête), starter codes (libre + renderAt), tests `test:security` (12 contrôles), `test:export` (MP4 réel 16:9/9:16/1:1), contrôle CI des templates sandbox via /dev/template-check.

- [ChatGPT] `fix/template-lab-supabase-row-mapping` — correction du mapping des lignes Supabase côté admin et serveur ; code terminé, CI/revue en attente. Zone administration modifiée de façon ciblée.

- [Claude] `feat/studio-calques-typo` — œil par calque/piste (masqué = absent de l'aperçu et de l'export), échelle par mise en page (texte net), réglages taille/interligne/espacements (Kinetic, Elastic, Text Reveal). Touche aussi : `AnimationConfig`, `project-model.ts` (`hidden`, `muted`), MCP (`font_size`…), moteur d'export audio.

- [ChatGPT] `feat/two-typography-custom-templates` — Letter Reveal + Typewriter en brouillons via migration 0008 ; code prêt, attente revue/tests SQL et application manuelle.

## 4. Repères techniques

- Next.js 16 (App Router, `src/proxy.ts` = ex-middleware), React 19, TypeScript
  strict, Tailwind 4, GSAP 3, Supabase auto-hébergé (`supabase.motiongraphic.si`).
  Lire `AGENTS.md` : les API de Next 16 diffèrent des versions connues.
- Mode construction : actif sauf `CONSTRUCTION_MODE=off` ; `/studio` réservé
  aux admins connectés pendant la construction.
- Architecture du Studio, du rendu et du MCP : `docs/studio-architecture.md`.
- Hébergement : xCloud (site Node.js, branche `main`, port 3001). Le
  déploiement se fait depuis le tableau de bord xCloud après fusion sur `main`.

## 5. Ajouter un template d'animation (checklist)

1. `src/components/animations/<Nom>01.tsx` : export `<Nom>01Frame` (DOM pur) + export par défaut avec `useAnimationEngine`.
2. Builder GSAP dans `src/lib/animations/builders.ts`, ajouté à `ANIMATION_BUILDERS` :
   DOM initial = état final ; `fromTo()` avec valeurs explicites (pas de `from()` vers `filter: none`) ;
   label `"out"` au début de la sortie (modes fit / hold du Studio) ; aucun `setTimeout` ni animation CSS
   (le rendu MP4 avance image par image).
3. Tailles en unités de conteneur (`cqmin`, ou `var(--u)` = `min(1cqh, 1.333cqw)` pour le 9:16).
4. Enregistrer la clé : `src/types/animation.ts` (`ComponentKey`), `src/lib/animations/registry.ts`,
   `src/lib/studio/template-registry.ts` (catégorie + `timelineDuration`),
   **une seule ligne** dans `STUDIO_FRAMES` de `src/components/studio/ControlledAnimation.tsx`
   (vignettes de la bibliothèque, styles compatibles, aperçu et MP4 l'utilisent tous),
   `AnimationPlayer.tsx`, `src/data/demo.ts`, `src/data/prompts.ts`, `RESERVED_SLUGS` (`custom-model.ts`).
5. Galerie publique : migration numérotée (prochain numéro libre), idempotente, exécutée par le propriétaire.
6. Pas de logos de marque réels ni de personnages protégés.
7. Vérifier : bibliothèque (vignette + survol), ajout, lecture, curseur, formats 16:9 / 9:16 / 1:1, export MP4.

### Contrôle automatique (CI : « Contrôle des templates »)

La CI ouvre chaque template dans un navigateur avec le moteur du Studio (`/dev/template-check`, actif seulement avec
`TEMPLATE_CHECK=1`) et bloque la PR en cas de : enregistrement incomplet, repère `out` manquant, contenu déjà visible
au départ, élément qui clignote pendant l'entrée, template vide ou sans sortie, texte qui déborde en 16:9 / 9:16 / 1:1,
fond `transparent` ignoré, erreur console, police écrasée (`fontFamily: config.fontFamily`), « \\n » littéral,
symbole Unicode/émoji en guise d'icône. Le résumé s'affiche dans l'onglet de la CI ; les images à l'instant `out`
sont jointes (« templates-controle »).

En local : `TEMPLATE_CHECK=1 CONSTRUCTION_MODE=off npm start -- -p 3001 &` puis
`BASE_URL=http://localhost:3001 npm run test:templates`.

Exception voulue (ex. morphing continu sans entrée) : l'ajouter dans `tests/templates/exceptions.json` et la justifier
dans la PR.

**Règle : une PR de templates qui ne touche que la zone Templates (§ 2) et dont la CI est verte peut être fusionnée
par son auteur sans revue de Claude.** Revue de Claude seulement pour les contrats partagés (§ 1.7), le Studio
(hors la ligne `STUDIO_FRAMES`), le MCP, le rendu ou une table existante.
