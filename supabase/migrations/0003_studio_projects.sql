-- =====================================================================
-- MotionGraphic Studio — V1 (Phase 3 : projets, médias, versions, rendus)
-- ⚠️ NE PAS EXÉCUTER en production sans autorisation explicite.
-- Exécution : Studio → SQL Editor, ou `psql` (fichier fourni dans le dépôt).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Projets Studio
-- ---------------------------------------------------------------------

create table if not exists public.studio_projects (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  schema_version  integer not null default 1 check (schema_version >= 1),
  fps             integer not null default 30 check (fps in (24, 25, 30, 60)),
  width           integer not null default 1920 check (width between 320 and 3840),
  height          integer not null default 1080 check (height between 320 and 2160),
  -- Structure sérialisée du projet (scènes, pistes, éléments, configs).
  -- Données 100 % déclaratives : jamais de code exécutable.
  data            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists studio_projects_user_idx on public.studio_projects (user_id, updated_at desc);

-- ---------------------------------------------------------------------
-- 2. Médias importés (Phase 3) — rushs, images, logos (Supabase Storage)
-- ---------------------------------------------------------------------

create table if not exists public.studio_media (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.studio_projects (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) <= 512),
  kind         text not null check (kind in ('video', 'image', 'audio')),
  name         text not null,
  duration     numeric check (duration is null or duration >= 0),
  width        integer,
  height       integer,
  in_point     numeric not null default 0 check (in_point >= 0),
  out_point    numeric check (out_point is null or out_point >= 0),
  created_at   timestamptz not null default now()
);

create index if not exists studio_media_project_idx on public.studio_media (project_id);

-- ---------------------------------------------------------------------
-- 3. Versions de projet (historique / restauration)
-- ---------------------------------------------------------------------

create table if not exists public.studio_project_versions (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  label      text not null default 'Sauvegarde',
  data       jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists studio_versions_project_idx on public.studio_project_versions (project_id, created_at desc);

-- ---------------------------------------------------------------------
-- 4. Rendus (Phase 5 : export MP4) — file d'attente, sans worker ici
-- ---------------------------------------------------------------------

create table if not exists public.studio_renders (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  format     text not null default 'mp4' check (format in ('mp4')),
  resolution text not null default '1080p' check (resolution in ('720p', '1080p')),
  fps        integer not null default 30,
  storage_path text,
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_renders_project_idx on public.studio_renders (project_id);

-- ---------------------------------------------------------------------
-- 5. RLS — Chaque utilisateur ne gère QUE ses propres projets.
-- Les projets privés d'un utilisateur ne sont visibles que de lui.
-- ---------------------------------------------------------------------

alter table public.studio_projects        enable row level security;
alter table public.studio_media           enable row level security;
alter table public.studio_project_versions enable row level security;
alter table public.studio_renders         enable row level security;

drop policy if exists studio_projects_read on public.studio_projects;
create policy studio_projects_read
  on public.studio_projects for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists studio_projects_insert on public.studio_projects;
create policy studio_projects_insert
  on public.studio_projects for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists studio_projects_update on public.studio_projects;
create policy studio_projects_update
  on public.studio_projects for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists studio_projects_delete on public.studio_projects;
create policy studio_projects_delete
  on public.studio_projects for delete
  to authenticated
  using (user_id = auth.uid());

-- Médias
drop policy if exists studio_media_read on public.studio_media;
create policy studio_media_read
  on public.studio_media for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists studio_media_insert on public.studio_media;
create policy studio_media_insert
  on public.studio_media for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists studio_media_delete on public.studio_media;
create policy studio_media_delete
  on public.studio_media for delete
  to authenticated
  using (user_id = auth.uid());

-- Versions
drop policy if exists studio_versions_read on public.studio_project_versions;
create policy studio_versions_read
  on public.studio_project_versions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists studio_versions_insert on public.studio_project_versions;
create policy studio_versions_insert
  on public.studio_project_versions for insert
  to authenticated
  with check (user_id = auth.uid());

-- Rendus (Phase 5)
drop policy if exists studio_renders_read on public.studio_renders;
create policy studio_renders_read
  on public.studio_renders for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists studio_renders_insert on public.studio_renders;
create policy studio_renders_insert
  on public.studio_renders for insert
  to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. Trigger updated_at
-- ---------------------------------------------------------------------

drop trigger if exists studio_renders_touch on public.studio_renders;
create trigger studio_renders_touch
  before update on public.studio_renders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 7. Storage (Phase 3) — bucket privé par projet
-- ---------------------------------------------------------------------

-- Bucket : `studio-media` (privé, montée par projet user/<uid>/<project>/)
-- À créer via Storage ou :
-- insert into storage.buckets (id, name, public) values ('studio-media', 'studio-media', false);