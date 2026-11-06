-- =====================================================================
-- MotionGraphic Studio — Utilisateurs privés V1
-- Invitations + statut du compte (actif / suspendu) + garde d'écriture
-- + table MCP personnele (préparatoire, inactive).
-- ⚠️ NE PAS EXÉCUTER en production sans autorisation. Idempotent,
-- ré-exécutable sans perte de données.
-- Dépend de : 0001 (profiles, is_admin, guard_role_change) et 0003/0005
-- (tables studio + custom_templates).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Statut du compte
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists status
  text not null default 'active'
  check (status in ('active', 'suspended'));

-- Helper : le compte est-il opérationnel (existe et actif) ?
create or replace function public.account_is_active(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = uid
      and coalesce(status, 'active') = 'active'
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Invitations par email — créées/manipulées UNIQUEMENT côté serveur
--    par l'API d'administration (/api/admin/users/*, clé service_role
--    jamais exposée au navigateur).
-- ---------------------------------------------------------------------

create table if not exists public.user_invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role        text not null default 'user' check (role in ('user', 'admin')),
  invited_by  uuid references auth.users (id) on delete set null,
  invited_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  used_at     timestamptz,
  revoked_at  timestamptz
);

create unique index if not exists user_invitations_email_pending_uniq
  on public.user_invitations (lower(email))
  where used_at is null and revoked_at is null;

create index if not exists user_invitations_history_idx
  on public.user_invitations (invited_at desc);

alter table public.user_invitations enable row level security;

drop policy if exists invitations_admin_all on public.user_invitations;
create policy invitations_admin_all on public.user_invitations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Un utilisateur invité peut consulter la ligne qui le concerne.
drop policy if exists invitations_read_invited on public.user_invitations;
create policy invitations_read_invited on public.user_invitations
  for select to authenticated
  using (
    lower(email) = lower(coalesce(
      (select email from auth.users where id = auth.uid()), ''
    ))
  );

-- ---------------------------------------------------------------------
-- 3. Suspension : un compte suspendu ne peut plus écrire ses projets,
--    médias, versions, rendus ni proposer des templates. Les lectures
--    restent possibles (consultation de ses données, pas d'opération
--    nouvelle). Garde appliquée par trigger, quel que soit le chemin.
-- ---------------------------------------------------------------------

-- Helper : la requête est-elle issue du rôle service_role (API
-- d'administration serveur) ? Aucun effet côté navigateur (JWT anon).
create or replace function public.request_is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role';
$$;

create or replace function public.assert_account_active_for_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if TG_OP = 'DELETE' then
    v_owner := OLD.user_id;
  else
    v_owner := NEW.user_id;
  end if;
  if not public.account_is_active(v_owner) then
    raise exception 'COMPTE_SUSPENDU : opération réservée aux comptes actifs.'
      using hint = 'Contactez un administrateur.';
  end if;
  return coalesce(NEW, OLD);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'studio_projects', 'studio_media', 'studio_project_versions',
    'studio_renders', 'custom_templates'
  ] loop
    execute format('drop trigger if exists guard_active on public.%I', t);
    execute format(
      'create trigger guard_active before insert or update or delete
         on public.%I for each row
         execute function public.assert_account_active_for_write();',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Garde du statut : la suspension est réservée aux administrateurs
--    (le rôle était déjà verrouillé par 0001 / guard_role_change).
-- ---------------------------------------------------------------------

drop function if exists public.guard_status_change() cascade;
create or replace function public.guard_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or public.request_is_service_role() then
    return new;
  end if;
  if coalesce(new.status, 'active') <> coalesce(old.status, 'active') then
    raise exception 'STATUT_PROTEGE : la suspension est réservée aux administrateurs.'
      using hint = 'Contactez un administrateur.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_status_change on public.profiles;
create trigger prevent_status_change
  before update on public.profiles
  for each row
  when (coalesce(new.status, 'active') <> coalesce(old.status, 'active'))
  execute function public.guard_status_change();

-- ---------------------------------------------------------------------
-- 5. MCP personnel (PRÉPARATOIRE — INACTIF : aucune connexion ni code
--    applicatif actif tant que le drapeau serveur MCP_USER_TOKENS n'est
--    pas activé explicitement ; jamais par défaut).
-- ---------------------------------------------------------------------

create table if not exists public.mcp_user_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  token_hash   text not null unique,
  created_by   uuid references auth.users (id) on delete set null,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists mcp_user_tokens_user_idx on public.mcp_user_tokens (user_id);

alter table public.mcp_user_tokens enable row level security;

drop policy if exists mcp_tokens_owner on public.mcp_user_tokens;
create policy mcp_tokens_owner on public.mcp_user_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists mcp_tokens_admin_read on public.mcp_user_tokens;
create policy mcp_tokens_admin_read on public.mcp_user_tokens
  for select to authenticated
  using (public.is_admin());

-- =====================================================================
-- FIN — NE PAS EXÉCUTER en production sans autorisation.
-- =====================================================================