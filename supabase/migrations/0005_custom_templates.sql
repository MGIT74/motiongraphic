-- =====================================================================
-- MotionGraphic — Gestionnaire de templates interactifs (Template Lab)
-- ⚠️ NE PAS EXÉCUTER en production sans autorisation explicite.
-- Exécution : Studio → SQL Editor, ou psql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table custom_templates
-- ---------------------------------------------------------------------

create table if not exists public.custom_templates (
  id                  uuid primary key default gen_random_uuid(),
  created_by          uuid references auth.users (id) on delete set null,
  slug                text not null unique,
  name                text not null check (char_length(name) between 1 and 120),
  category            text not null check (category in (
    'text-motion', 'ui-motion', 'app-showcase', 'data-motion',
    'transitions', 'logo-motion'
  )),
  description         text not null default '' check (char_length(description) <= 1000),
  -- 'component' : dérivé d'un composant apprové (component_key) ;
  -- 'code' : code source hébergé ici, rendu UNIQUEMENT dans un iframe
  -- sandbox="allow-scripts" (origine nulle). Aucun exec dynamique côté app.
  source_kind         text not null check (source_kind in ('component', 'code')),
  component_key       text references public.animations (component_key) on delete set null,
  code                text check (char_length(code) <= 60000),
  default_config      jsonb not null default '{}'::jsonb,
  prompt_web          text not null default '',
  prompt_after_effects text not null default '',
  version             integer not null default 1 check (version >= 1),
  status              text not null default 'draft' check (status in ('draft', 'candidate', 'published')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists custom_templates_status_idx on public.custom_templates (status, updated_at desc);
create unique index if not exists custom_templates_slug_uniq on public.custom_templates (slug);

-- ---------------------------------------------------------------------
-- 2. RLS — admin : CRUD complet ; visiteurs : lecture des PUBLIÉS
-- ---------------------------------------------------------------------

alter table public.custom_templates enable row level security;

drop policy if exists custom_templates_read_published on public.custom_templates;
create policy custom_templates_read_published
  on public.custom_templates for select
  to anon, authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists custom_templates_admin on public.custom_templates;
create policy custom_templates_admin
  on public.custom_templates for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------

drop trigger if exists custom_templates_touch on public.custom_templates;
create trigger custom_templates_touch
  before update on public.custom_templates
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. Seed — template de démonstration (CTA Hero, dérivée de kinetic-type-01)
-- ---------------------------------------------------------------------

insert into public.custom_templates
  (id, slug, name, category, description, source_kind, component_key, default_config, prompt_web, prompt_after_effects, version, status)
values
  ('b0000000-0000-4000-8000-000000000021', 'cta-hero-demo', 'CTA Hero (démo)', 'text-motion',
   'Template de démonstration créé dans l''administration : déclinaison « CTA » de Kinetic Typography, dispo dans la galerie et le Studio.',
   'component', 'kinetic-type-01',
   '{"text":"ESSAYEZ","primaryColor":"#F5F5F7","accentColor":"#0A84FF","backgroundColor":"#000000","duration":2.8,"speed":1}'::jsonb,
   'Tu es un développeur créatif expert en motion design web et GSAP.

OBJECTIF
Produire un encart « CTA » kinetic : le mot ESSAYEZ apparaît lettre par lettre (masque bas, stagger 70 ms), un point accent bleu #0A84FF pop en back.out(3), boucle en sortie inversée vers le haut.

CONTRAINTES
- Un seul fichier HTML + GSAP via CDN
- N''animer que transform/opacity (60 fps)
- Respecter prefers-reduced-motion (état final statique)
- Palette : fond #000000, texte #F5F5F7, accent #0A84FF',
   'Tu es un expert ExtendScript (JSX) pour Adobe After Effects.

MISSION
Écris un script JSX créant la compo « MGSI_CTAHero » (1920×1080, 30 fps, 5 s, fond #000000) : calque texte ESSAYEZ en sous-calques par lettre, entrée masque bas décalée de 2 frames, point accent pop, sortie inversée pour boucler. Idempotent, préfixe MGSI_, sans plugins.',
   1, 'published')
on conflict (id) do nothing;