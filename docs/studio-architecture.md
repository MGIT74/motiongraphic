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

## Ergonomie du Studio (bibliothèque, timeline, erreurs)

- Bibliothèque (`TemplateLibrary`) : vignettes rendues par le moteur du Studio (ControlledAnimation, `preview`) à une image de repos (55 % de la durée), animées au survol ou au focus (boucle rAF). Clic = ajout à la suite ; glisser (`application/x-mgsi-template`) vers la timeline (à l'instant visé, scène correspondante) ou l'aperçu (à l'instant du curseur). La scène s'allonge si l'élément dépasse.
- Timeline : pistes Motion (animations) et Médias (images/vidéos) séparées ; seuil de 3 px avant glissement ; aimantation à 8 px (curseur, bords de scène, autres calques, secondes ; bouton Aimant, Alt pour suspendre) avec ligne guide ; poignées de début et de fin ; info-bulle début/fin/durée ; partie au-delà de la scène hachurée ; zoom 33–333 % (boutons, Ctrl + molette) ; clic dans le vide = curseur + désélection ; double-clic = aller au début de l'élément ; une étape d'annulation par glissement.
- Erreurs : `friendlyError()` (`src/lib/studio/errors.ts`) traduit les erreurs techniques (réseau, session, droits, taille, format, réseau privé, délai, moteur de rendu, stockage…) en titre + conseil ; `ToastProvider` affiche les notifications (détails repliables, bouton Réessayer quand c'est pertinent, dédoublonnage). Branché sur l'export, l'import de médias, la sauvegarde cloud (une notification par série d'échecs), les URL des médias et le menu Projets.

## Studio sur mobile et tablette (< 1024 px)

- `useCompactStudio()` (media query) bascule la disposition : barre du haut resserrée (nom, format court, lecture, annuler, export et projets en icônes), aperçu pleine largeur, timeline compacte (210 px, libellés en icônes, poignées de 16 px, règle `touch-action: none`), barre d'onglets en bas (Scènes, Templates, Médias, Marque, Modifier).
- Les onglets ouvrent un panneau glissant (`MobileSheet`) qui réutilise les panneaux de bureau (`variant="sheet"`, onglet imposé). Ajouter un template ou un média referme le panneau pour montrer le résultat ; un point bleu sur « Modifier » signale un élément sélectionné.
- Notifications au-dessus de la barre d'onglets ; menu Projets en pleine largeur.
- Au-delà de 1024 px (ordinateur, tablette en paysage) : disposition à trois colonnes inchangée.

## Jetons MCP personnels — backend (dormant)

- Drapeau serveur `MCP_USER_TOKENS=true` requis ; absent = toutes les routes répondent 503. **Ne pas l'activer avant** : migrations 0009/0010/0011 installées, tests de sécurité du Supabase jetable verts, rotation des secrets traitée.
- Migration `0011_mcp_tokens_scopes.sql` (idempotente, exécutée par le propriétaire) : colonnes `scopes` et `rotated_from`, table `mcp_token_audit` (service_role seul). Sans 0011, la vérification retombe sur les permissions `read`+`write` (jamais `export`).
- Permissions : `read` (lecture), `write` (modification, inclut la lecture), `export` (`render_project`). Table `scopeForTool` dans `src/lib/studio/mcp-scopes.ts` ; un outil inconnu est traité comme `write`. Le jeton admin « legacy » n'est pas soumis aux permissions.
- `render_project` reste refusé pour tout jeton utilisateur tant que le pipeline de rendu multi-utilisateur n'est pas validé, même avec la permission `export`.
- Routes : `/api/settings/mcp-tokens` (GET, POST, DELETE), `/api/settings/mcp-tokens/{id}/rotate`, `/api/admin/mcp-tokens` (GET, DELETE, admin actif).
- Garde-fous : 10 jetons actifs maximum par compte, 10 créations/renouvellements par heure (limiteur en mémoire), `last_used_at` réécrit au plus toutes les 5 minutes, audit de chaque création, renouvellement, révocation et refus de permission, aucune valeur de jeton journalisée.


## Connexions MCP personnelles (`/settings/mcp`)

Dashboard « Accès MCP » (branche `feat/mcp-tokens-ui`) : chaque
utilisateur gère SES jetons MCP (création, renouvellement, révocation,
expiration) — le serveur ne stocke AUCUN jeton en clair : seul le
empreinte SHA-256 figure en base (`mcp_user_tokens`, migration 0009) ;
la valeur n'est rendue qu'UNE fois (création/renouvellement) et n'est
jamais conservée côté client. Les jetons sont inactifs tant que le
drapeau serveur n'est pas activé (503 clair à l'écran). Architecture
d'isolation : chaque jeton = identité utilisateur (RLS `user_id =
auth.uid()`) — voir `src/lib/studio/mcp-tokens.ts` (dormant) et le
contrat d'API dans `src/components/settings/McpTokensPanel.tsx`.
