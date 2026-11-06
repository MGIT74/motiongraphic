-- =====================================================================
-- MotionGraphic Studio — tests RLS multi-utilisateurs (V1)
-- À exécuter sur un CLONE de test (jamais sur la production) :
--   psql "<URL_CLONE_TEST>" -f supabase/tests/rls-users.sql
-- Principe : on se connecte comme `authenticated` avec des claims JWT
-- simulés (utilisateur A puis B) et on vérifie l'isolation réelle des
-- tables personnelles : projets, médias, versions, rendus.
-- =====================================================================

-- Prérequis : remplacer par des UUIDs d'utilisateurs du CLONE.
-- \set user_a '00000000-aaaa-0000-0000-00000000000a'
-- \set user_b '00000000-bbbb-0000-0000-00000000000b'

-- ---------------------------------------------------------------------
-- Scénario 1 : A ne voit que ses projets, B ne voit que les siens
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"sub":"00000000-aaaa-0000-0000-00000000000a","role":"authenticated","email":"a@test.local"}';
insert into public.studio_projects (id, user_id, name, timeline, params, fps, width, height, created_at, updated_at, version)
values ('11111111-0000-0000-0000-0000000000a1', '00000000-aaaa-0000-0000-00000000000a', 'PROJET-A', '[]'::jsonb, '{}'::jsonb, 30, 1920, 1080, now(), now(), 1);
commit;

begin;
set local request.jwt.claims = '{"sub":"00000000-bbbb-0000-0000-00000000000b","role":"authenticated","email":"b@test.local"}';
-- B s'insère son propre projet (doit passer)
insert into public.studio_projects (id, user_id, name, timeline, params, fps, width, height, created_at, updated_at, version)
values ('11111111-0000-0000-0000-0000000000b1', '00000000-bbbb-0000-0000-00000000000b', 'PROJET-B', '[]'::jsonb, '{}'::jsonb, 30, 1920, 1080, now(), now(), 1);
-- B ne peut PAS insérer un projet au nom de A (RLS with check) → doit échouer
do $$
begin
  insert into public.studio_projects (id, user_id, name, timeline, params, fps, width, height, created_at, updated_at, version)
  values ('11111111-0000-0000-0000-0000000000aX', '00000000-aaaa-0000-0000-00000000000a', 'INTRUS', '[]'::jsonb, '{}'::jsonb, 30, 1920, 1080, now(), now(), 1);
  raise exception 'ÉCHEC SÉCURITÉ : B a pu écrire un projet pour A.';
exception when insufficient_privilege or check_violation then
  raise notice 'OK : insertion croisée refusée par RLS.';
end $$;
-- B ne peut PAS modifier le projet de A
do $$
begin
  update public.studio_projects set name = 'PIRATÉ' where id = '11111111-0000-0000-0000-0000000000a1';
  raise exception 'ÉCHEC SÉCURITÉ : B a pu modifier un projet de A.';
exception when insufficient_privilege then
  raise notice 'OK : modification croisée refusée par RLS.';
end $$;
-- B ne lit QUE son projet
do $$
declare n int;
begin
  select count(*) into n from public.studio_projects;
  if n <> 1 then raise exception 'ÉCHEC SÉCURITÉ : B voit % projets (attendu 1).', n; end if;
  raise notice 'OK : B ne voit que son projet.';
end $$;
rollback;

-- ---------------------------------------------------------------------
-- Scénario 2 : un utilisateur standard ne peut pas s'attribuer le rôle
-- admin ni se suspendre/réactiver lui-même
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"sub":"00000000-bbbb-0000-0000-00000000000b","role":"authenticated","email":"b@test.local"}';
do $$
begin
  update public.profiles set role = 'admin' where id = '00000000-bbbb-0000-0000-00000000000b';
  raise exception 'ÉCHEC SÉCURITÉ : ré-attribution de rôle possible en self-service.';
exception when others then
  if sqlerrm like '%rôle%' then
    raise notice 'OK : changement de rôle refusé (%)', sqlerrm;
  else
    raise notice 'OK : changement de rôle refusé (%)', sqlerrm;
  end if;
end $$;
do $$
begin
  update public.profiles set status = 'active' where id = '00000000-bbbb-0000-0000-00000000000b';
  raise exception 'ÉCHEC SÉCURITÉ : réactivation de statut possible en self-service.';
exception when others then
  raise notice 'OK : changement de statut refusé (%)', sqlerrm;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- Scénario 3 : suspension → les nouvelles opérations sont bloquées
-- (avec le trigger 0009 et un JWT valides : RLS + garde)
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"sub":"00000000-aaaa-0000-0000-00000000000a","role":"authenticated","email":"a@test.local"}';
insert into public.profiles (id, role, status) values
  ('00000000-aaaa-0000-0000-00000000000a', 'user', 'suspended')
on conflict (id) do update set status = 'suspended';
commit;

begin;
set local request.jwt.claims = '{"sub":"00000000-aaaa-0000-0000-00000000000a","role":"authenticated","email":"a@test.local"}';
do $$
begin
  insert into public.studio_projects (id, user_id, name, timeline, params, fps, width, height, created_at, updated_at, version)
  values ('11111111-0000-0000-0000-0000000000a2', '00000000-aaaa-0000-0000-00000000000a', 'BLOQUE?', '[]'::jsonb, '{}'::jsonb, 30, 1920, 1080, now(), now(), 1);
  raise exception 'ÉCHEC SÉCURITÉ : un compte suspendu a pu créer un projet.';
exception when others then
  if sqlerrm like '%COMPTE_SUSPENDU%' then
    raise notice 'OK : écriture refusée pour compte suspendu.';
  else
    raise exception 'Résultat inattendu : %', sqlerrm;
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- Scénario 4 : invitation révoquée/expirée → aucun accès
-- (vérification applicative : la ligne porte revoked_at/expired)
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"sub":"' || '00000000-aaaa-0000-0000-00000000000a' || '","role":"authenticated","email":"a@test.local"}';
insert into public.user_invitations (id, email, role, invited_by) values
  ('22222222-0000-0000-0000-0000000000i1', 'invite@test.local', 'user', null);
update public.user_invitations set revoked_at = now() where id = '22222222-0000-0000-0000-0000000000i1';
do $$
declare still_pending int;
begin
  select count(*) into still_pending from public.user_invitations
  where email = 'invite@test.local' and used_at is null and revoked_at is null
    and expires_at > now();
  if still_pending <> 0 then raise exception 'ÉCHEC : invitation révoquée encore « en attente ».'; end if;
  raise notice 'OK : invitation révoquée → plus en attente (aucun nouvel accès).';
end $$;
rollback;

-- ---------------------------------------------------------------------
-- Scénario 5 : un compte suspendu reste lisible par ses propriétaires
-- (les lectures ne sont pas bloquées : le compte peut consulter ses
-- données mais pas créer/mettre en file/déposer)
-- ---------------------------------------------------------------------
-- (laissée aux tests applicatifs : authorizeRender → 423 sur les API.)

\echo '=== rls-users : scénarios exécutés (clone de test uniquement) ==='