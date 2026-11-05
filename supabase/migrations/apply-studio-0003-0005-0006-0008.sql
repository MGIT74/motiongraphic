-- =====================================================================
-- MotionGraphic Studio — APPLICATION DES MIGRATIONS (prête pour le SQL Editor)
-- Compatible SQL Editor Supabase (aucune commande psql \i). Idempotent :
-- ré-exécutable sans risque (drop ... if exists / if not exists / upsert).
--
-- ⚠️ NE PAS EXÉCUTER EN PRODUCTION sans autorisation du propriétaire.
-- Ordre : ce fichier contient 0003 + 0005 + 0006 + 0008 dans le bon ordre.
--
-- VÉRIFIER D'ABORD CE QUI EST DÉJÀ APPLIQUÉ (voir § Vérifications en bas) :
-- si une table existe déjà avec la même structure, les blocs sont no-op.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Pré-requis (autonomie du lot) — fonctions définies aussi par 0001.
-- Idempotent, ré-exécutable (create or replace) :
-- ---------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 0003 — Studio : projets, médias, versions, rendus + RLS
-- ---------------------------------------------------------------------

create table if not exists public.studio_projects (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  schema_version  integer not null default 1 check (schema_version >= 1),
  fps             integer not null default 30 check (fps in (24, 25, 30, 60)),
  width           integer not null default 1920 check (width between 320 and 3840),
  height          integer not null default 1080 check (height between 320 and 3160),
  data            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists studio_projects_user_idx on public.studio_projects (user_id, updated_at desc);

create table if not exists public.studio_media (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.studio_projects (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) <= 512),
  kind         text not null check (kind in ('video', 'image', 'audio')),
  name         text not null,
  duration     numeric,
  width        integer,
  height       integer,
  in_point     numeric not null default 0 check (in_point >= 0),
  out_point    numeric,
  created_at   timestamptz not null default now()
);

create index if not exists studio_media_project_idx on public.studio_media (project_id);

create table if not exists public.studio_project_versions (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  label      text not null default 'Sauvegarde',
  data       jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists studio_versions_project_idx on public.studio_project_versions (project_id, created_at desc);

create table if not exists public.studio_renders (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.studio_projects (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  format       text not null default 'mp4' check (format in ('mp4')),
  resolution   text not null default '1080p' check (resolution in ('720p', '1080p')),
  fps          integer not null default 30,
  storage_path text,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists studio_renders_project_idx on public.studio_renders (project_id);

alter table public.studio_projects enable row level security;
alter table public.studio_media enable row level security;
alter table public.studio_project_versions enable row level security;
alter table public.studio_renders enable row level security;

-- Projets : lecture/écriture PAR PROPRIÉTAIRE uniquement.
drop policy if exists studio_projects_read on public.studio_projects;
create policy studio_projects_read on public.studio_projects
  for select to authenticated using (user_id = auth.uid());

drop policy if exists studio_projects_insert on public.studio_projects;
create policy studio_projects_insert on public.studio_projects
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists studio_projects_update on public.studio_projects;
create policy studio_projects_update on public.studio_projects
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists studio_projects_delete on public.studio_projects;
create policy studio_projects_delete on public.studio_projects
  for delete to authenticated using (user_id = auth.uid());

-- Médias
drop policy if exists studio_media_read on public.studio_media;
create policy studio_media_read on public.studio_media
  for select to authenticated using (user_id = auth.uid());

drop policy if exists studio_media_insert on public.studio_media;
create policy studio_media_insert on public.studio_media
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists studio_media_delete on public.studio_media;
create policy studio_media_delete on public.studio_media
  for delete to authenticated using (user_id = auth.uid());

-- Versions
drop policy if exists studio_versions_read on public.studio_project_versions;
create policy studio_versions_read on public.studio_project_versions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists studio_versions_insert on public.studio_project_versions;
create policy studio_versions_insert on public.studio_project_versions
  for insert to authenticated with check (user_id = auth.uid());

-- Rendus
drop policy if exists studio_renders_read on public.studio_renders;
create policy studio_renders_read on public.studio_renders
  for select to authenticated using (user_id = auth.uid());

drop policy if exists studio_renders_insert on public.studio_renders;
create policy studio_renders_insert on public.studio_renders
  for insert to authenticated with check (user_id = auth.uid());

-- updated_at des rendus
drop trigger if exists studio_renders_touch on public.studio_renders;
create trigger studio_renders_touch
  before update on public.studio_renders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 0005 + 0006 — templates personnalisés (Template Lab) + RLS
-- ---------------------------------------------------------------------

create table if not exists public.custom_templates (
  id                   uuid primary key default gen_random_uuid(),
  created_by           uuid references auth.users (id) on delete set null,
  slug                 text not null unique,
  name                 text not null check (char_length(name) between 1 and 120),
  category             text not null check (category in (
    'text-motion', 'ui-motion', 'app-showcase', 'data-motion',
    'transitions', 'logo-motion'
  )),
  description          text not null default '' check (char_length(description) <= 1000),
  source_kind          text not null check (source_kind in ('component', 'code')),
  -- Le component_key renvoie à un COMPOSANT APPROUVÉ du registre (jamais du code arbitraire).
  component_key        text,
  code                 text check (char_length(code) <= 60000),
  default_config       jsonb not null default '{}'::jsonb,
  prompt_web           text not null default '',
  prompt_after_effects text not null default '',
  version              integer not null default 1 check (version >= 1),
  status               text not null default 'draft' check (status in ('draft', 'candidate', 'published')),
  validation           jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists custom_templates_status_idx on public.custom_templates (status, updated_at desc);
create unique index if not exists custom_templates_slug_uniq on public.custom_templates (slug);

alter table public.custom_templates enable row level security;

-- Les visiteurs ne lisent que les PUBLIÉS ; les admins tout (is_admin, 0001).
drop policy if exists custom_templates_read_published on public.custom_templates;
create policy custom_templates_read_published on public.custom_templates
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists custom_templates_admin on public.custom_templates;
create policy custom_templates_admin on public.custom_templates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists custom_templates_touch on public.custom_templates;
create trigger custom_templates_touch
  before update on public.custom_templates
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 0008 — brouillons typographiques (OPTIONNEL — templates de démonstration)
-- ---------------------------------------------------------------------

insert into public.custom_templates
(id, slug, name, category, description, source_kind, code, default_config, prompt_web, prompt_after_effects, version, status)
values
('b0000000-0000-4000-8000-000000000031', 'letter-reveal-gradient', 'Letter Reveal — Gradient', 'text-motion',
 'Révélation typographique lettre par lettre avec montée, flou et dégradé rose/violet.', 'code', null,
 '{"text":"Motion Design","primaryColor":"#15121a","accentColor":"#e22c6c","backgroundColor":"#f4f4f2","duration":4.5,"speed":1}'::jsonb,
 'Recrée cette animation typographique en HTML/CSS/JavaScript sans ressources externes, avec boucle et prefers-reduced-motion.',
 'Compo « MGSI_LetterReveal » 1920×1080, 30 fps, 5 s : lettres en cascade (masque + flou), dégradé d''accent, sortie pour boucler.',
 1, 'draft'),
('b0000000-0000-4000-8000-000000000032', 'typewriter-terminal', 'Typewriter Terminal', 'text-motion',
 'Saisie de texte machine à écrire avec curseur clignotant et fond terminal sombre.', 'code', null,
 '{"text":"npm run build","primaryColor":"#d2f8d2","accentColor":"#59f78d","backgroundColor":"#0d1117","duration":3.5,"speed":1}'::jsonb,
 'Recrée une animation type machine à écrire (HTML/CSS/JS), curseur clignotant, sans ressources externes, boucle + prefers-reduced-motion.',
 'Compo « MGSI_Typewriter » 1920×1080, 30 fps, 4 s : texte tapé caractère par caractère, curseur clignotant, sortie pour boucler.',
 1, 'draft')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- VÉRIFICATIONS (rejouables, aucune écriture) :
-- ---------------------------------------------------------------------

-- 1) Tables attendues :
--   select table_name from information_schema.tables where table_schema='public'
--   and table_name in ('studio_projects','studio_media','studio_project_versions',
--                      'studio_renders','custom_templates');
-- 2) RLS active :
--   select relname, relrowsecurity from pg_class where relname in
--   ('studio_projects','studio_media','studio_project_versions','studio_renders','custom_templates');
-- 3) Politiques présentes :
--   select tablename, policyname, cmd from pg_policies
--   where schemaname='public' and tablename like 'studio%' or tablename='custom_templates';
-- 4) Pour savoir si UN LOT a déjà tourné : la table existe ET la politique
--   « studio_projects_read » existe => 0003 est appliquée. « custom_templates_admin »
--   existe => 0005/0006 appliquées. La colonne custom_templates.validation existe
--   => 0006 appliquée :
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='custom_templates' and column_name='validation';

-- NOTES D'AUDIT (concordance code <-> base) :
-- - `studio_media` : la table existe au schéma, mais l'implémentation
--   actuelle des médias stocke les métadonnées DANS le JSONB du projet
--   (MediaAsset, src/lib/studio/project-model.ts + src/lib/media/server.ts)
--   et les fichiers dans Storage. La table reste disponible/optionnelle.
-- - `is_admin()` dépend de `public.profiles` (0001) — si cette table n'a
--   pas encore été créée, la fonction est créée MAIS renverra false :
--   exécuter 0001 AVANT d'inviter un administrateur.
-- ---------------------------------------------------------------------
-- Ce que ce lot NE FAIT PAS (à évaluer séparément) :
-- - Aucun bucket Storage n'est créé en SQL : le serveur les crée au
--   premier usage via service_role (studio-media, studio-renders privés).
-- - Aucune donnée utilisateur n'est modifiée ; les seeds sont idempotents
--   (on conflict do nothing).
-- - RISQUE : si une version ANTÉRIEURE d'une de ces tables existe avec une
--   structure DIVERGENTE, `create table if not exists` ne corrigera pas :
--   vérifier via les requêtes de VÉRIFICATION et faire évoluer avec une
--   NOUVELLE migration numérotée (jamais un drop direct en production).
-- =====================================================================