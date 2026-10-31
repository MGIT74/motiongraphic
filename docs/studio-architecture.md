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