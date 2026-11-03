# MotionGraphic Studio — Architecture V1 Bêta

> Branche `feature/studio-v1-beta`. En attente de validation avant fusion sur `main`.

## Séparation des responsabilités

```
src/lib/animations/         → Moteur & registre PUBLIC (galerie + pages)
  builders.ts                 timelines GSAP pilotables (loop: true galerie / false studio)
  registry.ts                 métadonnées des template_keys
src/components/animations/  → *Frame (DOM pur) + composant public (moteur boucle)
src/lib/studio/             → Moteur STUDIO (éditeur)
  project-model.ts            modèle versionné + validation + mutations immuables
  template-registry.ts        registre Studio (elementKind, catégories SaaS)
  clock.ts                    horloge rAF (lecture/pause/seek frame-accurate)
  history.ts                  undo/redo (snapshots, coalescing)
  persistence.ts              sauvegarde auto (localStorage → Supabase Phase 3)
  mcp-contracts.ts            contrats d'outils MCP (Phase 4)
src/components/studio/      → UI de l'éditeur (panneaux, canvas, timeline)
src/app/studio              → route de l'éditeur (chrome public masqué)
supabase/migrations/0003_studio_projects.sql → schéma projets/médias/versions/rendus (NON exécuté)
```

Le Studio ne réécrit jamais le moteur : il choisit un template par clé,
construit la timeline avec `loop: false` et pilote `timeline.time(t)`.

### Flux du remplacement instantané

1. Sélection d'un élément → `templatesForKind(element.kind)` (registre Studio).
2. Clic sur un style → `replaceElementTemplate()` (project-model) :
   texte/couleurs/position/durée/ID conservés, params nouveaux = défauts.
3. `commit()` pousse l'ancienne version dans l'historique (annulable Cmd+Z),
   le canvas remonte le nouveau composant immédiatement (clé React stable
   par élément, rebuild de la timeline GSAP uniquement).

## Pipeline des templates interactifs (Template Lab)

```
Admin crée le template (nom/catégorie/description/identifiant/config/prompts)
        │
        ├── source "component"  → dérivé d'un composant APPROUVÉ (7 codés)
        │     → publication instantanée : données seules (aucun code en base)
        │     → galerie + fiche publique + Studio (timeline, piloté par le
        │       builder du composant de base)
        │
        └── source "code" (React/HTML/CSS/SVG)
              → 1. validateTemplateCode() autoritaire (POST /api/templates/validate-code) :
                   réseau / storage / eval / imports dynamiques / DOM parent interdits
              → 2. statut candidate (jamais rendu hors bac à sable)
              → 3. rendu publique : iframe sandbox="allow-scripts" (origine nulle)
                   + contrat postMessage (MGSI_CONFIG / mgsi:configchange / mgsi:replay)
              → 4. intégration timeline : Phase 2 (compilation build-time du code
                   validé dans le code source, via Git) — PAS de publication
                   instantanée promise pour le pilotage timeline.
```

Statuts : `draft` / `candidate` / `published` — version incrémentée sur
chaque modification publiée (table `custom_templates`, migration 0005,
RLS : admin seul écrit, visiteurs ne lisent que les publiés).

Le visiteur ne peut jamais modifier le code source ni les templates publiés :
il ne contrôle que ses propre réglages (texte, couleurs, vitesse, durée) dans
la fiche publique — appliqués localement (React ou postMessage sandbox).

## Sécurité

- Aucun code arbitraire : un `templateKey` invalide est rejeté par `validateProject`.
- Le JSON de projet est validé à CHAQUE ouverture (version, clés, bornes).
- MC/Phase 4 : outils MCP = données structurées + validation, jamais d'injections.
- Migration 0003 : RLS par utilisateur (chaque owner ne voit que ses projets).

## Limitations actuelles (honnêtes)

- `minimal-saas-ui-01` (template parallèle, interactif) : présent dans la
  galerie et le registre public, mais PAS piloté par la timeline Studio
  (auto-animé). Intégration time-driven prévue en Phase 2 (builder dédié).
  Migration `0004_allow_minimal_saas_ui.sql` prête (non exécutée).
- Lecture pilotée par le temps : précise mais sans easing avancé hors GSAP
  (les timelines jouent exactement comme la galerie).
- Pas d'import de médias (Phase 3) : pistes Rushs/Audio affichées en attente.
- Sauvegarde locale (localStorage) : Supabase en Phase 3 (0003 prête, non exécutée).
- Aucun export MP4 (Phase 5) — architecture rendu séparée prévue (Remotion/FFmpeg).
## Studio V2 (novembre 2026)

| Fonction | Où |
| --- | --- |
| Calques : fond de scène (`scene.background`) + éléments superposés (ordre = calques, le dernier au premier plan), fond d'élément `transparent` | `project-model.ts`, `StageLayers.tsx`, panneau droit |
| Timing adaptatif : `timing` = `fit` (entrée → maintien → sortie à la fin), `hold` (figé), `natural` (historique). Repère GSAP `out` dans chaque builder | `lib/studio/timing.ts`, `lib/animations/builders.ts` |
| Formats 16:9 / 9:16 / 1:1 (`PROJECT_FORMATS`), tailles des templates en unités de conteneur (`cqmin`) | `project-model.ts`, frames `src/components/animations` |
| Kit de marque (`project.brand` : nom, couleurs, police de la liste blanche, logo data URL ≤ 300 Ko) appliqué via `applyBrand` ; les nouveaux éléments héritent de la marque | `lib/brand/fonts.ts`, onglet « Marque » |
| Synchronisation : verrou optimiste sur `updated_at` (Studio et MCP), rechargement en direct toutes les 4 s, alerte « Modifié ailleurs » | `projects-supabase.ts`, `StudioApp.tsx`, `mcp-server.ts` |
| Interrupteur `CONSTRUCTION_MODE=off` (site ouvert) ; sinon `/studio` réservé aux admins connectés | `src/proxy.ts` |
| CI GitHub Actions : lint, types, build, tests navigateur (`npm run test:e2e`, mode démo) | `.github/workflows/ci.yml`, `tests/e2e` |

Outils MCP ajoutés : `update_scene`, `delete_scene`, `delete_element`, `set_format`, `set_brand` ; `add_element` / `update_element` acceptent couleurs, `transparent`, `speed`, `font_family`, `timing`, `layer`.

## Rendu vidéo (MP4)

1. `POST /api/studio/render { project_id }` (admin connecté ou jeton MCP) crée un job (table `studio_renders`) placé en file d'attente — un rendu à la fois.
2. Un Chromium sans fenêtre (`@sparticuz/chromium`, ou `CHROMIUM_PATH`, piloté par `playwright-core`) ouvre `/render/<id>?k=<HMAC>` : la scène est rendue par `StageLayers` (même moteur que le Studio), CSS côté long 1000 px, facteur d'échelle → 1920×1080 / 1080×1920 / 1080×1080.
3. Pour chaque image (30 i/s) : `window.__mgsiRender.seek(t)` puis capture JPEG → ffmpeg (`ffmpeg-static`, H.264 CRF 20, yuv420p, faststart).
4. Le MP4 est déposé dans Supabase Storage (bucket privé `studio-renders`, créé au besoin) ; lien signé 7 jours. Secours : `/api/studio/render/<id>/file?k=<HMAC>` depuis le disque du serveur.
5. Suivi : `GET /api/studio/render/<id>` → `status`, `progress`, `url`.

MCP : `preview_frame` (image JPEG d'un instant), `render_project`, `get_render`. Studio : bouton « Exporter MP4 ».
Variables optionnelles : `RENDER_SECRET` (sinon `MCP_ACCESS_TOKEN`), `RENDER_BASE_URL` (URL que le navigateur interne utilise pour joindre l'app ; sinon l'origine de la requête), `CHROMIUM_PATH`, `FFMPEG_PATH`.
Mesuré : 15 s de vidéo 1080p rendues en ~57 s (4 cœurs).

## Médias (images, vidéos, musique)

- Modèle : `project.media[]` (bibliothèque : `MediaAsset` avec `storagePath` dans le bucket privé `studio-media`), éléments `kind = "media"` (`templateKey = "media"`, `element.media` : `fit`, `frame` none/browser/phone, `motion` zoom/pan, `enter`, `trimStart`), `project.audio` (musique : volume, début, décalage, fondus).
- Import depuis le Studio : `POST /api/studio/media/upload-url` (URL d'envoi signée) → envoi direct navigateur → Supabase Storage → `POST /api/studio/media/finalize` (mesure ffmpeg, vidéo → MP4 H.264 sans son ≤ 2 min / 1920 px / 30 i/s, audio → AAC). Lecture : `POST /api/studio/media/urls` (URL signées, fichiers de l'utilisateur uniquement).
- Calque : `MediaLayer` (entrée/sortie/mouvement calculés depuis le temps local → MP4 identique au Studio) ; un nouveau média se place au-dessus des médias, sous les animations.
- Rendu : la page `/render` reçoit des URL signées ; chaque image attend le positionnement des vidéos (`seeked`) et le chargement des images ; la musique est mixée par ffmpeg (`atrim`, fondus, `volume`, `adelay`).
- MCP : `list_media`, `import_media_url`, `capture_screenshot` (Chromium du serveur), `add_media_element`, `set_audio` ; `update_element` accepte `fit`, `frame`, `motion`, `enter`, `trim_start`.
- Sécurité : import par URL et capture refusent les réseaux privés/locaux (résolution DNS, redirections revérifiées, requêtes de page filtrées) — `MEDIA_ALLOW_PRIVATE_HOSTS=1` réservé aux tests locaux, **jamais en production**.
- Mesuré : 11 s avec capture + vidéo + musique rendues en ~93 s (local).

## Transitions, projets, raccourcis

- Transitions : `scene.transition` (`fade`, `slide-left`, `slide-up`, `wipe`, `zoom` ; 0,2 à 2 s, limitée à la moitié de la scène), appliquée à l'entrée d'une scène (sauf la 1re). Pendant la transition, la scène précédente est affichée dans son état final (chaque calque qui dure jusqu'à la fin, à `localTime = durée`) et la nouvelle arrive par-dessus ; tout est calculé depuis le temps → MP4 identique au Studio.
- Projets : menu « Projets » (cloud si connecté, sinon navigateur) — ouvrir, dupliquer (ouvre la copie), supprimer avec confirmation (pas le projet ouvert).
- Raccourcis : Espace lecture, Cmd/Ctrl+Z / Maj+Z, Suppr supprimer le calque, Cmd/Ctrl+D dupliquer, ← → une image (Maj : 1 s), Échap désélectionner.
- MCP : `list_projects`, `duplicate_project` (avec changement de format), `duplicate_scene` ; `create_scene` / `update_scene` acceptent `transition`, `transition_duration`, `background`.

## Template « Notification Stack » (notification-stack-01, UI Motion)

- Texte : une ligne par notification, `App | Titre | Message | Heure` (8 max). Un titre `@Nom` donne une notification de contact (avatar à initiales + badge d'app). L'icône est un pictogramme générique choisi d'après le nom de l'app (messages, mail, agenda, paiement, équipe, rappel ; sinon une lettre sur la couleur d'accent) — pas de logos de marque.
- Couleurs : principale = texte, accent = icônes génériques et avatars, fond = dégradé (fond sombre → cartes sombres ; `transparent` → cartes seules, à poser sur une capture). Police par défaut : Manrope (ajoutée à la liste blanche).
- Mise en page en unité `--u = min(1cqh, 1.333cqw)` : mêmes proportions en 16:9 et 1:1, cartes à ~88 % de la largeur en 9:16.
- Animation (builder `buildNotificationStack`) : carte flou → net avec montée et échelle, icône en pop, nom de l'app, titre et message mot par mot ; la pile remonte (yPercent, indépendant de la taille) pour centrer les dernières cartes ; label `out` puis sortie floue.
- Galerie publique : migration `0008_notification_stack.sql` (contrainte + ligne), à exécuter par le propriétaire.
- Texte des éléments limité à 800 caractères (`TEXT_MAX_CHARS`), champ multiligne dans le Studio.
