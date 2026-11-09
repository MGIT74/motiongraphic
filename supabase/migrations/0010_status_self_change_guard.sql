-- =====================================================================
-- MotionGraphic Studio — 0010 : garde du statut en self-service
-- Audit final ciblé (PR #38) — faille réellement identifiée :
--   `profiles_update_self` (0001) autorise le self-update ; sans
--   déclencheur gardien du statut, un utilisateur suspendu peut se
--   réactiver lui-même via Supabase (PostgREST navigateur : JWT +
--   clé anon + politique id = auth.uid()).
-- Le RÔLE est déjà verrouillé par `prevent_role_escalation` (0001/
-- 0009) ; ce lot verrouille le STATUT avec un déclencheur distinct —
-- `prevent_status_self_change` (le script rls-selfcheck P0 attend
-- précisément 6 déclencheurs nommés ; un nom distinct n'affecte pas
-- ce contrôle).
-- ⚠️ À exécuter sur le Supabase auto-hébergé UNIQUEMENT après
-- validation. Idempotent, réversible (voir DEPLOY).
-- =====================================================================

create or replace function public.guard_status_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Chemin privilégié (API d'administration serveur, service_role) :
  -- exemption nécessaire pour la suspension/activation par l'admin.
  if public.is_admin() or public.request_is_service_role() then
    return new;
  end if;
  if coalesce(new.status, 'active') <> coalesce(old.status, 'active') then
    raise exception 'STATUT_PROTEGE : la suspension/réactivation est réservée aux administrateurs.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_status_self_change on public.profiles;
create trigger prevent_status_self_change
  before update on public.profiles
  for each row
  when (coalesce(new.status, 'active') <> coalesce(old.status, 'active'))
  execute function public.guard_status_self_change();

-- =====================================================================
-- FIN — exécution manuelle (SQL Editor self-hébergé) après validation.
-- =====================================================================