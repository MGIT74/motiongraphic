-- =====================================================================
-- MotionGraphic Studio — template minimal-saas-ui-01
-- Étend la contrainte component_key (le CHECK de 0001_init.sql ne
-- connaissait pas ce template). ⚠️ NE PAS EXÉCUTER sans autorisation
-- explicite (à appliquer en même temps que 0001 sur un environnement neuf).
-- Exécution : Studio → SQL Editor, ou psql.
-- =====================================================================

alter table public.animations
  drop constraint if exists animations_component_key_check;

alter table public.animations
  add constraint animations_component_key_check
  check (component_key in (
    'kinetic-type-01', 'text-reveal-01', 'elastic-text-01',
    'shape-morph-01', 'staggered-cards-01', 'logo-reveal-01',
    'minimal-saas-ui-01'
  ));

-- Optionnel (seed démo) — uniquement pour aligner un environnement neuf :
-- insert into public.categories ... / animations avec l'id
-- 00000000-0000-4000-8000-000000000017 (voir src/data/demo.ts).