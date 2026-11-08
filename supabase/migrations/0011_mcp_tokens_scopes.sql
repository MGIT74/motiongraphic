-- =====================================================================
-- 0011 — Jetons MCP personnels : permissions (scopes), chaîne de renouvellement, audit.
-- Idempotente. À exécuter par le propriétaire, APRÈS 0009/0010 et après validation des tests
-- (clone de test d'abord). Ne modifie aucune donnée existante : les jetons déjà émis
-- reçoivent les permissions par défaut {read,write} (pas d'export).
-- =====================================================================

alter table public.mcp_user_tokens
  add column if not exists scopes text[] not null default array['read','write']::text[];

alter table public.mcp_user_tokens
  add column if not exists rotated_from uuid references public.mcp_user_tokens (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mcp_user_tokens_scopes_valid'
      and conrelid = 'public.mcp_user_tokens'::regclass
  ) then
    alter table public.mcp_user_tokens
      add constraint mcp_user_tokens_scopes_valid
      check (
        cardinality(scopes) between 1 and 3
        and scopes <@ array['read','write','export']::text[]
      );
  end if;
end $$;

create index if not exists mcp_user_tokens_active_idx
  on public.mcp_user_tokens (user_id) where revoked_at is null;

-- Journal d'audit : création, renouvellement, révocation, refus. Aucune valeur de jeton, jamais.
create table if not exists public.mcp_token_audit (
  id         bigint generated always as identity primary key,
  token_id   uuid references public.mcp_user_tokens (id) on delete set null,
  user_id    uuid references auth.users (id) on delete set null,
  actor_id   uuid references auth.users (id) on delete set null,
  event      text not null check (event in ('created','rotated','revoked','revoked_by_admin','denied_scope','denied_account')),
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mcp_token_audit_user_idx on public.mcp_token_audit (user_id, created_at desc);

alter table public.mcp_token_audit enable row level security;
revoke all on public.mcp_token_audit from anon;
revoke all on public.mcp_token_audit from authenticated;
grant select, insert on public.mcp_token_audit to service_role;

drop policy if exists mcp_token_audit_service_all on public.mcp_token_audit;
create policy mcp_token_audit_service_all on public.mcp_token_audit
  for all to service_role
  using (true)
  with check (true);

-- =====================================================================
-- Retour arrière (manuel, perte des permissions et de l'audit) :
--   drop table if exists public.mcp_token_audit;
--   alter table public.mcp_user_tokens drop constraint if exists mcp_user_tokens_scopes_valid;
--   alter table public.mcp_user_tokens drop column if exists scopes, drop column if exists rotated_from;
-- =====================================================================
