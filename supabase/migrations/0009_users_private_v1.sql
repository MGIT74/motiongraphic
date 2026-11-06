-- =====================================================================
-- MotionGraphic Studio — Utilisateurs privés V1 (révision d'audit)
-- Invitations + statut du compte (actif / suspendu) + gardes d'écriture
-- + jetons MCP personnels (préparatoires, dormants).
--
-- ⚠️ NE PAS EXÉCUTER en production sans autorisation.
-- Idempotent et re-exécutable (create or replace / drop if exists),
-- SANS casser les tables existantes (0001/0003/0005 restent intacts ;
-- seuls des remplacements de fonctions/trigger et des ajouts ici).
-- Dépend de : 0001 (profiles, is_admin, guard_role_change,
-- handle_new_user) et 0003/0005 (tables studio + custom_templates).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Détection du chemin privilégié (API d'administration serveur).
-- PostgREST expose les claims dans request.jwt.claims ; auth.role()
-- lit le même champ. Les deux chemins sont couverts (cf audit).
-- ---------------------------------------------------------------------

create or replace function public.request_is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or coalesce((current_setting('request.jwt.claims', true))::json ->> 'role', '') = 'service_role';
$$;

-- ---------------------------------------------------------------------
-- 1. Statut du compte
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists status
  text not null default 'active'
  check (status in ('active', 'suspended'));

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
      and coalesce(status, 'active') = 'active'
  );
$$;
-- Supersede 0001 : un admin suspendu n'a PLUS de privilèges admin
-- (toutes les politiques RLS et les gardes utilisent cette fonction).

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
-- 2. Invitations par email (créées/manipulées UNIQUEMENT côté serveur)
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

-- Un utilisateur invité (accepté) peut consulter l'invitation qui le concerne.
drop policy if exists invitations_read_invited on public.user_invitations;
create policy invitations_read_invited on public.user_invitations
  for select to authenticated
  using (
    lower(email) = lower(coalesce(
      (select email from auth.users where id = auth.uid()), ''
    ))
  );

-- Le flux applicatif (consommation serveur) ne tient pas dans les
-- politiques : l'écriture se fait via service_role (serveur uniquement).
grant select, insert, update, delete on public.user_invitations to service_role;

-- ---------------------------------------------------------------------
-- 3. Garde d'écriture des comptes suspendus (sessions réelles) :
--    un profil suspendu NE PEUT PLUS écrire (insert/update/delete) sur
--    ses projets, médias, versions, rendus ni proposer un template.
--    Les LECTURES restent possibles. Les chemins privilégiés
--    (service_role : MCP admin, migrations, restauration) sont exempts.
-- ---------------------------------------------------------------------

create or replace function public.assert_account_active_for_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  -- Chemin privilégié (API d'administration, MCP admin, migrations) :
  -- exempté de la garde applicative.
  if public.request_is_service_role() then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;
  if TG_OP = 'DELETE' then
    -- DELETE : le propriétaire AVANT suppression doit être actif.
    if not public.account_is_active(OLD.user_id) then
      raise exception 'COMPTE_SUSPENDU : opération réservée aux comptes actifs.'
        using hint = 'Contactez un administrateur.', errcode = 'P0001';
    end if;
    return OLD;
  end if;
  -- INSERT / UPDATE : le propriétaire visé (NEW) ET l'ancien (OLD sur
  -- UPDATE) doivent être actifs — impossible de contourner la suspension
  -- en changeant le propriétaire d'une ressource.
  if not public.account_is_active(NEW.user_id) then
    raise exception 'COMPTE_SUSPENDU : opération réservée aux comptes actifs.'
      using hint = 'Contactez un administrateur.', errcode = 'P0001';
  end if;
  if TG_OP = 'UPDATE' and OLD.user_id is distinct from NEW.user_id then
    if not public.account_is_active(OLD.user_id) then
      raise exception 'COMPTE_SUSPENDU : le propriétaire initial est suspendu.'
        using hint = 'Contactez un administrateur.', errcode = 'P0001';
    end if;
  end if;
  return NEW;
end;
$$;

-- Variante created_by (custom_templates — colonne nullable 0005) :
-- définie AVANT le bloc de création des triggers (PostgreSQL exige que
-- la fonction existe avant create trigger).
create or replace function public.assert_account_active_for_write_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Chemin privilégié : exempté.
  if public.request_is_service_role() then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;
  if TG_OP = 'DELETE' then
    if OLD.created_by is not null and not public.account_is_active(OLD.created_by) then
      raise exception 'COMPTE_SUSPENDU : opération réservée aux comptes actifs.'
        using hint = 'Contactez un administrateur.', errcode = 'P0001';
    end if;
    return OLD;
  end if;
  if NEW.created_by is null then
    return NEW; -- données admin/migration sans propriétaire applicatif
  end if;
  if not public.account_is_active(NEW.created_by) then
    raise exception 'COMPTE_SUSPENDU : opération réservée aux comptes actifs.'
      using hint = 'Contactez un administrateur.', errcode = 'P0001';
  end if;
  if TG_OP = 'UPDATE' and OLD.created_by is distinct from NEW.created_by then
    if OLD.created_by is not null and not public.account_is_active(OLD.created_by) then
      raise exception 'COMPTE_SUSPENDU : le propriétaire initial est suspendu.'
        using hint = 'Contactez un administrateur.', errcode = 'P0001';
    end if;
  end if;
  return NEW;
end;
$$;

do $$
declare
  t text;
begin
  -- studio_* : colonne user_id.
  foreach t in array array['studio_projects',
                           'studio_media',
                           'studio_project_versions',
                           'studio_renders'] loop
    execute format('drop trigger if exists guard_active on public.%I', t);
    execute format(
      'create trigger guard_active before insert or update or delete
         on public.%I for each row
         execute function public.assert_account_active_for_write();',
      t
    );
  end loop;

  -- custom_templates : owner = created_by (0005, nullable).
  execute format('drop trigger if exists guard_active_created_by on public.%I', 'custom_templates');
  execute format(
    'create trigger guard_active_created_by before insert or update or delete
       on public.custom_templates
       for each row
       execute function public.assert_account_active_for_write_created_by();'
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Garde du statut ET du rôle (profils) : un utilisateur connecté ne
--    peut jamais changer son rôle ni son statut en self-service ; seuls
--    un admin (session) ou l'API d'administration (service_role) le
--    peuvent. guard_role_change de 0001 est remplacé par cette version
--    (create or replace, sans suppression de données).
-- ---------------------------------------------------------------------

create or replace function public.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or public.request_is_service_role() then
    return new; -- administrateur connecté, ou API d'administration
  end if;
  if coalesce(new.role, 'user') <> old.role then
    raise exception 'ROLE_PROTEGE : le rôle ne peut pas être changé en libre-service.'
      using errcode = 'P0001';
  end if;
  if coalesce(new.status, 'active') <> coalesce(old.status, 'active') then
    raise exception 'STATUT_PROTEGE : la suspension est réservée aux administrateurs.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Ancien déclencheur 0001 (prevent_role_escalation) pointe déjà vers
-- guard_role_change() : create or replace le met à jour.

-- ---------------------------------------------------------------------
-- 5. handle_new_user : attribution du rôle selon l'invitation valide
--    (admin ↔ user) et création fail-closed.
--    - invitation EN ATTENTE (non révoquée, non expirée, non utilisée)
--      au moment de la création du compte (envoi d'invitation) :
--      profil créé avec le rôle de l'invitation, statut « suspended »
--      jusqu'à la première connexion (activation côté serveur :
--      /api/auth/consume → used_at + activation) ;
--    - sans invitation valide (inscription directe, invitation révoquée
--      ou expirée) : profil « suspended » → tout accès refusé
--      jusqu'à décision d'un administrateur.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.user_invitations;
  v_role text := 'user';
begin
  select * into v_invitation
    from public.user_invitations
    where lower(email) = lower(coalesce(new.email, ''))
      and used_at is null
      and revoked_at is null
      and expires_at > now()
    order by invited_at desc
    limit 1;
  if found and v_invitation.role = 'admin' then
    v_role := 'admin';
  elsif found then
    v_role := 'user';
  end if;
  insert into public.profiles (id, display_name, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name',
             split_part(coalesce(new.email, 'utilisateur'), '@', 1)),
    v_role,
    'suspended' -- activé à la première connexion validée côté serveur
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Jetons MCP personnels — PRÉPARATOIRE ET DORMANT.
--    Émission/révocation STRICTEMENT serveur : aucun droit PostgREST
--    pour anon/authenticated (ni lecture ni écriture) — le navigateur
--    ne peut donc pas insérer d'empreinte ni lire des secrets.
--    L'API serveur (service_role) gère tout. Activation jamais par
--    défaut : drapeau MCP_USER_TOKENS côté serveur.
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

-- Aucun accès direct navigateur/anon (cf audit : pas d'insertion de
-- token_hash depuis le client, aucune lecture d'empreinte).
revoke all on public.mcp_user_tokens from anon;
revoke all on public.mcp_user_tokens from authenticated;
grant select, insert, update, delete on public.mcp_user_tokens to service_role;

drop policy if exists mcp_tokens_owner on public.mcp_user_tokens;
drop policy if exists mcp_tokens_admin_read on public.mcp_user_tokens;
create policy mcp_tokens_service_all on public.mcp_user_tokens
  for all to service_role
  using (true)
  with check (true);

-- =====================================================================
-- FIN — NE PAS EXÉCUTER en production sans autorisation.
-- =====================================================================